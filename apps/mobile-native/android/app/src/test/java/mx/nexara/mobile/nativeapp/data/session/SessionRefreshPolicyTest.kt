package mx.nexara.mobile.nativeapp.data.session

import mx.nexara.mobile.nativeapp.data.session.SessionRefreshPolicy.InFlight
import mx.nexara.mobile.nativeapp.data.session.SessionRefreshPolicy.On401
import mx.nexara.mobile.nativeapp.data.session.SessionRefreshPolicy.RefreshHttp
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import java.time.Instant

/**
 * Antes cualquier 401 cerraba la sesión. Ahora solo la cierra un 401 del propio
 * `auth/session/refresh`; estas pruebas fijan esa frontera.
 */
class SessionRefreshPolicyTest {

    // ---- 401 en una petición autenticada --------------------------------------

    @Test
    fun `un 401 con el token vigente pide renovar, no expira`() {
        val d = SessionRefreshPolicy.decideOn401(
            encodedPath = "/api/core/activities",
            sentToken = "A",
            alreadyRetried = false,
            storedToken = "A",
            storedIsPortal = false,
        )
        assertEquals(On401.Refresh, d)
    }

    @Test
    fun `si el token guardado ya cambio se reintenta con el nuevo sin renovar`() {
        val d = SessionRefreshPolicy.decideOn401("/api/me/navigation", "A", false, "B", false)
        assertEquals(On401.RetryWith("B"), d)
    }

    @Test
    fun `una peticion ya reintentada no vuelve a renovar (sin bucles)`() {
        val d = SessionRefreshPolicy.decideOn401("/api/core/activities", "A", true, "A", false)
        assertEquals(On401.PassThrough, d)
    }

    @Test
    fun `login, refresh y logout nunca disparan renovacion`() {
        listOf(
            "/api/auth/login",
            "/api/auth/login/pin",
            "/api/auth/session/refresh",
            "/api/auth/session/extend",
            "/api/auth/logout",
            "/api/portal/login",
            "/api/client-auth/login",
            "/api/branch-auth/login/",
        ).forEach { path ->
            assertEquals(path, On401.PassThrough, SessionRefreshPolicy.decideOn401(path, "A", false, "A", false))
        }
    }

    @Test
    fun `rutas normales no quedan excluidas por parecido`() {
        assertFalse(SessionRefreshPolicy.isExcludedPath("/api/auth/profile"))
        assertFalse(SessionRefreshPolicy.isExcludedPath("/api/logs/login-history"))
        assertFalse(SessionRefreshPolicy.isExcludedPath("/api/me/navigation"))
    }

    @Test
    fun `sin token enviado o sin sesion guardada no hay nada que expirar`() {
        assertEquals(On401.PassThrough, SessionRefreshPolicy.decideOn401("/api/x", null, false, "A", false))
        assertEquals(On401.PassThrough, SessionRefreshPolicy.decideOn401("/api/x", "A", false, null, false))
    }

    @Test
    fun `portal sin renovacion conserva el aviso de expiracion`() {
        assertEquals(On401.NotifyExpired, SessionRefreshPolicy.decideOn401("/api/x", "P", false, "P", true))
        // …pero si ya hay otro token guardado, primero se reintenta con él.
        assertEquals(On401.RetryWith("Q"), SessionRefreshPolicy.decideOn401("/api/x", "P", false, "Q", true))
    }

    // ---- Single-flight --------------------------------------------------------

    @Test
    fun `los 401 concurrentes que esperaron reutilizan el token ya renovado`() {
        val d = SessionRefreshPolicy.decideInFlight(
            observedToken = "old",
            storedToken = "new",
            lastRevokedToken = null,
            lastTransientToken = null,
            lastTransientAtMs = 0L,
            nowMs = 1_000L,
        )
        assertEquals(InFlight.ReuseStored("new"), d)
    }

    @Test
    fun `el primero en entrar llama al servidor`() {
        val d = SessionRefreshPolicy.decideInFlight("old", "old", null, null, 0L, 1_000L)
        assertEquals(InFlight.CallServer, d)
    }

    @Test
    fun `un token ya revocado no vuelve a ir a la red`() {
        val d = SessionRefreshPolicy.decideInFlight("old", "old", "old", null, 0L, 1_000L)
        assertEquals(InFlight.AlreadyRevoked, d)
    }

    @Test
    fun `tras un fallo de red se espera la ventana antes de reintentar`() {
        val t0 = 50_000L
        assertEquals(
            InFlight.RecentlyFailed,
            SessionRefreshPolicy.decideInFlight("old", "old", null, "old", t0, t0 + 2_000L),
        )
        assertEquals(
            InFlight.CallServer,
            SessionRefreshPolicy.decideInFlight(
                "old", "old", null, "old", t0, t0 + SessionRefreshPolicy.TRANSIENT_BACKOFF_MS,
            ),
        )
    }

    @Test
    fun `sin sesion guardada no se renueva`() {
        assertEquals(InFlight.NoSession, SessionRefreshPolicy.decideInFlight("old", null, null, null, 0L, 0L))
    }

    // ---- Respuesta del servidor ----------------------------------------------

    @Test
    fun `solo el 401 del refresh confirma la revocacion`() {
        assertEquals(RefreshHttp.Success, SessionRefreshPolicy.classifyRefresh(200, "tok"))
        assertEquals(RefreshHttp.Revoked, SessionRefreshPolicy.classifyRefresh(401, null))
        assertEquals(RefreshHttp.EndpointMissing, SessionRefreshPolicy.classifyRefresh(404, null))
        listOf(500, 502, 503, 403, 429).forEach { code ->
            assertEquals("HTTP $code", RefreshHttp.Transient, SessionRefreshPolicy.classifyRefresh(code, null))
        }
        // 200 sin token no sirve pero tampoco cierra sesión.
        assertEquals(RefreshHttp.Transient, SessionRefreshPolicy.classifyRefresh(200, " "))
        assertEquals(RefreshHttp.Transient, SessionRefreshPolicy.classifyLegacyExtend(404, null))
        assertEquals(RefreshHttp.Revoked, SessionRefreshPolicy.classifyLegacyExtend(401, null))
    }

    // ---- Renovación proactiva -------------------------------------------------

    @Test
    fun `renueva si faltan menos de 60 minutos, ya vencio o se desconoce`() {
        val now = Instant.parse("2026-09-16T12:00:00Z").toEpochMilli()
        assertTrue(SessionRefreshPolicy.shouldRefreshProactively(null, now))
        assertTrue(SessionRefreshPolicy.shouldRefreshProactively("no-es-fecha", now))
        assertTrue(SessionRefreshPolicy.shouldRefreshProactively("2026-09-16T11:00:00.000Z", now))
        assertTrue(SessionRefreshPolicy.shouldRefreshProactively("2026-09-16T12:59:00.000Z", now))
        assertFalse(SessionRefreshPolicy.shouldRefreshProactively("2026-09-16T13:01:00.000Z", now))
        assertFalse(SessionRefreshPolicy.shouldRefreshProactively("2026-09-16T16:00:00.000Z", now))
    }

    @Test
    fun `el parser ISO coincide con java time`() {
        listOf(
            "1970-01-01T00:00:00Z",
            "2026-09-16T18:30:00.000Z",
            "2024-02-29T23:59:59.999Z",
            "2000-03-01T00:00:00Z",
            "1999-12-31T23:59:59.5Z",
            "2026-09-16T12:00:00-06:00",
            "2026-09-16T12:00:00+05:30",
        ).forEach { iso ->
            val expected = java.time.OffsetDateTime.parse(iso).toInstant().toEpochMilli()
            assertEquals(iso, expected, SessionRefreshPolicy.parseIsoInstantMs(iso))
        }
        assertEquals(
            Instant.parse("2026-09-16T12:00:00Z").toEpochMilli(),
            SessionRefreshPolicy.parseIsoInstantMs("2026-09-16T12:00:00"),
        )
        assertNull(SessionRefreshPolicy.parseIsoInstantMs(""))
        assertNull(SessionRefreshPolicy.parseIsoInstantMs("2026-13-01T00:00:00Z"))
    }
}
