package mx.nexara.mobile.nativeapp.data.session

/**
 * Reglas puras (sin Android ni red) de la sesión deslizante.
 *
 * Mandato del dueño: con la sesión iniciada la app NO se cierra sola. Solo se
 * sale cuando la persona toca «Cerrar sesión» o cuando el servidor CONFIRMA que
 * la sesión ya no vale (`POST auth/session/refresh` → 401). Un 401 de cualquier
 * otro endpoint ya no basta: primero se intenta renovar el token, y un fallo de
 * red o un 5xx al renovar deja la sesión tal cual para reintentar después.
 *
 * Todo lo que decide aquí está cubierto por `SessionRefreshPolicyTest`.
 */
object SessionRefreshPolicy {

    /** Se renueva en segundo plano si faltan menos de 60 min (o ya venció). */
    const val PROACTIVE_THRESHOLD_MS: Long = 60L * 60_000L

    /** Revisión periódica mientras la app está en primer plano. */
    const val FOREGROUND_CHECK_INTERVAL_MS: Long = 30L * 60_000L

    /**
     * Tras un fallo transitorio (red/5xx) no se vuelve a pegar al servidor con el
     * mismo token durante esta ventana: evita que diez 401 simultáneos sin red
     * lancen diez renovaciones seguidas.
     */
    const val TRANSIENT_BACKOFF_MS: Long = 10_000L

    /**
     * Rutas cuyo 401 NO dispara renovación: credenciales malas en el login, la
     * propia renovación (evita bucles) y el cierre de sesión.
     */
    private val EXCLUDED_SUFFIXES = listOf(
        "/auth/session/refresh",
        "/auth/session/extend",
        "/auth/logout",
        "/portal/login",
        "/client-auth/login",
        "/branch-auth/login",
    )

    fun isExcludedPath(encodedPath: String): Boolean {
        val p = encodedPath.lowercase().trimEnd('/')
        if (p.contains("/auth/login")) return true
        if (p.startsWith("auth/login")) return true
        return EXCLUDED_SUFFIXES.any { suffix ->
            p.endsWith(suffix) || p == suffix.removePrefix("/")
        }
    }

    /** Qué hacer con un 401 recibido por una petición autenticada. */
    sealed interface On401 {
        /** Devolver el 401 tal cual, sin avisar de expiración. */
        data object PassThrough : On401

        /** Cuentas de portal (sin renovación): conserva el comportamiento previo. */
        data object NotifyExpired : On401

        /** El token guardado ya cambió desde que salió la petición: reintentar con él. */
        data class RetryWith(val token: String) : On401

        /** Pedir token nuevo (single-flight) y reintentar una vez. */
        data object Refresh : On401
    }

    fun decideOn401(
        encodedPath: String,
        sentToken: String?,
        alreadyRetried: Boolean,
        storedToken: String?,
        storedIsPortal: Boolean,
    ): On401 {
        if (sentToken.isNullOrBlank()) return On401.PassThrough
        if (alreadyRetried) return On401.PassThrough
        if (isExcludedPath(encodedPath)) return On401.PassThrough
        // Sin sesión guardada (se cerró mientras la petición viajaba): nada que expirar.
        if (storedToken.isNullOrBlank()) return On401.PassThrough
        if (storedToken != sentToken) return On401.RetryWith(storedToken)
        if (storedIsPortal) return On401.NotifyExpired
        return On401.Refresh
    }

    /** Decisión dentro del candado single-flight, antes de tocar la red. */
    sealed interface InFlight {
        data object NoSession : InFlight

        /** Otro hilo ya renovó mientras esperábamos: usar el token guardado. */
        data class ReuseStored(val token: String) : InFlight

        /** Este mismo token ya fue rechazado por el servidor (401 confirmado). */
        data object AlreadyRevoked : InFlight

        /** Falló por red/5xx hace muy poco: no insistir todavía. */
        data object RecentlyFailed : InFlight

        data object CallServer : InFlight
    }

    fun decideInFlight(
        observedToken: String?,
        storedToken: String?,
        lastRevokedToken: String?,
        lastTransientToken: String?,
        lastTransientAtMs: Long,
        nowMs: Long,
    ): InFlight {
        if (storedToken.isNullOrBlank()) return InFlight.NoSession
        if (!observedToken.isNullOrBlank() && observedToken != storedToken) {
            return InFlight.ReuseStored(storedToken)
        }
        if (storedToken == lastRevokedToken) return InFlight.AlreadyRevoked
        if (
            storedToken == lastTransientToken &&
            nowMs >= lastTransientAtMs &&
            nowMs - lastTransientAtMs < TRANSIENT_BACKOFF_MS
        ) {
            return InFlight.RecentlyFailed
        }
        return InFlight.CallServer
    }

    /** Cómo leer la respuesta HTTP de `auth/session/refresh`. */
    enum class RefreshHttp {
        /** 2xx con `access_token`. */
        Success,

        /** 401: sesión revocada / usuario inactivo / inactividad > 30 días. */
        Revoked,

        /** 404: API sin el endpoint nuevo todavía → probar `auth/session/extend`. */
        EndpointMissing,

        /** Red, timeout, 5xx, 2xx sin token, 403, etc.: conservar la sesión. */
        Transient,
    }

    fun classifyRefresh(code: Int, accessToken: String?): RefreshHttp = when {
        code in 200..299 && !accessToken.isNullOrBlank() -> RefreshHttp.Success
        code == 401 -> RefreshHttp.Revoked
        code == 404 -> RefreshHttp.EndpointMissing
        else -> RefreshHttp.Transient
    }

    /**
     * `auth/session/extend` (API vieja) solo acepta tokens vigentes; ahí un 404
     * ya no significa nada útil, así que se trata como transitorio.
     */
    fun classifyLegacyExtend(code: Int, accessToken: String?): RefreshHttp =
        when (val c = classifyRefresh(code, accessToken)) {
            RefreshHttp.EndpointMissing -> RefreshHttp.Transient
            else -> c
        }

    /** ¿Conviene renovar ya? Desconocido, ilegible, vencido o < umbral → sí. */
    fun shouldRefreshProactively(
        expiresAtIso: String?,
        nowMs: Long,
        thresholdMs: Long = PROACTIVE_THRESHOLD_MS,
    ): Boolean {
        val expiresMs = parseIsoInstantMs(expiresAtIso) ?: return true
        return expiresMs - nowMs < thresholdMs
    }

    private val ISO_RE = Regex(
        """^(\d{4})-(\d{2})-(\d{2})[Tt ](\d{2}):(\d{2})(?::(\d{2})(?:[.,](\d{1,9}))?)?(Z|z|[+-]\d{2}(?::?\d{2})?)?$""",
    )

    /**
     * ISO-8601 → epoch ms sin `java.time` (minSdk 24 no lo tiene sin desugaring).
     * Sin zona se asume UTC, que es lo que manda el servidor (`toISOString()`).
     */
    fun parseIsoInstantMs(raw: String?): Long? {
        val s = raw?.trim().orEmpty()
        if (s.isEmpty()) return null
        val m = ISO_RE.matchEntire(s) ?: return null
        val g = m.groupValues
        val year = g[1].toInt()
        val month = g[2].toInt()
        val day = g[3].toInt()
        val hour = g[4].toInt()
        val minute = g[5].toInt()
        val second = g[6].ifEmpty { "0" }.toInt()
        if (month !in 1..12 || day !in 1..31 || hour > 23 || minute > 59 || second > 60) return null
        val millis = g[7].takeIf { it.isNotEmpty() }?.padEnd(3, '0')?.take(3)?.toInt() ?: 0
        val offsetMinutes = parseOffsetMinutes(g[8]) ?: return null

        val days = daysFromCivil(year, month, day)
        val secondsOfDay = hour * 3600L + minute * 60L + second
        return (days * 86_400L + secondsOfDay - offsetMinutes * 60L) * 1000L + millis
    }

    private fun parseOffsetMinutes(raw: String): Long? {
        if (raw.isEmpty() || raw == "Z" || raw == "z") return 0L
        val sign = if (raw[0] == '-') -1L else 1L
        val digits = raw.substring(1).replace(":", "")
        val hh = digits.take(2).toIntOrNull() ?: return null
        val mm = digits.drop(2).ifEmpty { "0" }.toIntOrNull() ?: return null
        if (hh > 18 || mm > 59) return null
        return sign * (hh * 60L + mm)
    }

    /** Días desde 1970-01-01 (algoritmo civil de H. Hinnant, gregoriano proléptico). */
    private fun daysFromCivil(y0: Int, m: Int, d: Int): Long {
        val y = if (m <= 2) y0 - 1 else y0
        val era = (if (y >= 0) y else y - 399) / 400
        val yoe = y - era * 400
        val mp = (m + 9) % 12
        val doy = (153 * mp + 2) / 5 + d - 1
        val doe = yoe * 365 + yoe / 4 - yoe / 100 + doy
        return era * 146_097L + doe - 719_468L
    }
}
