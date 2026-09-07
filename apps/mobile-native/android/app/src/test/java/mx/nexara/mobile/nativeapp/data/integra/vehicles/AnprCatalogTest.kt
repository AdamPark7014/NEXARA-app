package mx.nexara.mobile.nativeapp.data.integra.vehicles

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import java.util.TimeZone

/**
 * Espejo de `apps/web/app/(panels)/integra/anpr/_anpr.ts`.
 *
 * Lo que se protege aquí:
 *
 * 1. **El formato de hora.** El manual de HikCentral pide ISO 8601 «+current
 *    zone». La forma UTC con `Z` es equivalente en el estándar pero la
 *    plataforma la rechaza, y la pantalla web venía fallando siempre por eso.
 * 2. **Los enums.** Un código fuera de tabla se enseña como «Código N», no se
 *    disfraza de «Otro»: si la plataforma devuelve algo que no sabemos leer,
 *    tiene que verse.
 * 3. **Que nada se invente.** `null` entra, `null` sale.
 */
class AnprCatalogTest {

    private val cdmx = TimeZone.getTimeZone("America/Mexico_City")
    private val utc = TimeZone.getTimeZone("UTC")
    private val india = TimeZone.getTimeZone("Asia/Kolkata") // +05:30, media hora

    // ── toArtemisTime ───────────────────────────────────────────────────────

    @Test
    fun `escribe el desplazamiento local y no la Z de UTC`() {
        // 2026-09-04T18:30:00-06:00 == 2026-09-05T00:30:00Z
        val millis = parsearIso8601("2026-09-05T00:30:00Z")
        requireNotNull(millis)
        assertEquals("2026-09-04T18:30:00-06:00", toArtemisTime(millis, cdmx))
    }

    @Test
    fun `con desplazamiento cero escribe mas 00 00 y no Z`() {
        // `SimpleDateFormat("…XXX")` emitiría «Z» aquí; el manual quiere el
        // desplazamiento explícito, igual que hace la web a mano.
        val millis = parsearIso8601("2026-01-15T09:00:00Z")
        requireNotNull(millis)
        assertEquals("2026-01-15T09:00:00+00:00", toArtemisTime(millis, utc))
    }

    @Test
    fun `soporta husos con media hora`() {
        val millis = parsearIso8601("2026-01-15T00:00:00Z")
        requireNotNull(millis)
        assertEquals("2026-01-15T05:30:00+05:30", toArtemisTime(millis, india))
    }

    @Test
    fun `rellena con ceros meses, dias y horas de un digito`() {
        val millis = parsearIso8601("2026-03-05T09:07:03+00:00")
        requireNotNull(millis)
        assertEquals("2026-03-05T09:07:03+00:00", toArtemisTime(millis, utc))
    }

    // ── parsearIso8601 ──────────────────────────────────────────────────────

    @Test
    fun `lee el ejemplo literal del manual`() {
        // Manual §5.8.2: `2018-07-26T15:00:00+08:00`.
        val a = parsearIso8601("2018-07-26T15:00:00+08:00")
        val b = parsearIso8601("2018-07-26T07:00:00Z")
        assertEquals(b, a)
    }

    @Test
    fun `acepta las variantes que manda la plataforma`() {
        val base = parsearIso8601("2026-09-04T18:30:00Z")
        assertEquals(base, parsearIso8601("2026-09-04T18:30Z"))
        assertEquals(base, parsearIso8601("2026-09-04T18:30:00.000Z"))
        assertEquals(base, parsearIso8601("2026-09-04T18:30:00+0000"))
        // Sin huso se interpreta como UTC, igual que hace `new Date(...)` con
        // una cadena ISO completa.
        assertEquals(base, parsearIso8601("2026-09-04T18:30:00"))
    }

    @Test
    fun `devuelve nulo en vez de inventarse una fecha`() {
        assertNull(parsearIso8601("ayer por la tarde"))
        assertNull(parsearIso8601(""))
        assertNull(parsearIso8601("2026-13-45T99:99:99Z"))
    }

    // ── formatearCrossTime ──────────────────────────────────────────────────

    @Test
    fun `formatea el cruce en hora local de 24 horas`() {
        assertEquals(
            "04/09/2026 18:30:00",
            formatearCrossTime("2026-09-05T00:30:00Z", cdmx),
        )
    }

    @Test
    fun `sin crossTime pone una raya y no la fecha de hoy`() {
        assertEquals("—", formatearCrossTime(null, cdmx))
        assertEquals("—", formatearCrossTime("   ", cdmx))
    }

    @Test
    fun `un crossTime que no se entiende se ensena crudo`() {
        // Enseñar el texto original es más honesto que «—», que haría creer que
        // el campo venía vacío.
        assertEquals("mañana", formatearCrossTime("mañana", cdmx))
    }

    // ── Enums del manual ────────────────────────────────────────────────────

    @Test
    fun `traduce los codigos documentados`() {
        assertEquals("Sedán", anprVehicleType(3))
        assertEquals("Motocicleta", anprVehicleType(7))
        assertEquals("Blanco", anprVehicleColor(1))
        assertEquals("Acercándose a la cámara", anprDirection(1))
        assertEquals("Otro", anprVehicleType(0))
    }

    @Test
    fun `un codigo fuera de tabla se ensena tal cual, no como Otro`() {
        assertEquals("Código 99", anprVehicleType(99))
        assertEquals("Código 42", anprVehicleColor(42))
        assertEquals("Código 7", anprDirection(7))
    }

    @Test
    fun `un campo ausente sigue ausente`() {
        assertNull(anprVehicleType(null))
        assertNull(anprVehicleColor(null))
        assertNull(anprDirection(null))
    }

    // ── Rangos ──────────────────────────────────────────────────────────────

    @Test
    fun `ninguna ventana ofrecida rebasa el tope de 31 dias del manual`() {
        val ahora = 1_788_000_000_000L
        AnprVentana.entries.forEach { v ->
            val r = rangoDeVentana(v, ahora)
            assertFalse("${v.etiqueta} rebasa el tope", r.demasiadoLargo)
            assertFalse("${v.etiqueta} sale invertida", r.invertido)
            assertTrue(r.dias <= ANPR_MAX_RANGE_DAYS)
        }
    }

    @Test
    fun `la ventana de 24 horas mide exactamente un dia`() {
        val ahora = 1_788_000_000_000L
        val r = rangoDeVentana(AnprVentana.UN_DIA, ahora)
        assertEquals(ahora, r.endMillis)
        assertEquals(1.0, r.dias, 0.0001)
    }

    @Test
    fun `detecta el rango invertido y el que se pasa del tope`() {
        val ahora = 1_788_000_000_000L
        val dia = 86_400_000L
        assertTrue(AnprRango(ahora, ahora - dia).invertido)
        assertTrue(AnprRango(ahora - 40 * dia, ahora).demasiadoLargo)
        assertFalse(AnprRango(ahora - 31 * dia, ahora).demasiadoLargo)
    }

    @Test
    fun `los limites del manual son los que dice el manual`() {
        assertEquals(31, ANPR_MAX_RANGE_DAYS)
        assertEquals(500, ANPR_MAX_PAGE_SIZE)
        assertEquals(16, ANPR_MAX_PLATE_LEN)
    }

    // ── DTO del cruce ───────────────────────────────────────────────────────

    @Test
    fun `un cruce sin ningun campo se deserializa sin reventar`() {
        // Todo es opcional en la tabla A-73 salvo los dos identificadores, y la
        // plataforma los omite cuando la cámara no reconoció nada. Un campo no
        // nulable aquí dejaría la pantalla vacía sin explicación.
        val r = AnprRecordDto()
        assertNull(r.plateNo)
        assertNull(r.vehicleType)
        assertEquals("s-placa-0", r.claveDeLista(0))
    }

    @Test
    fun `la clave de lista prefiere el id de cruce de la plataforma`() {
        val r = AnprRecordDto(crossRecordSyscode = "abc-1", plateNo = "XYZ")
        assertEquals("abc-1", r.claveDeLista(3))
    }

    @Test
    fun `sin id de cruce la clave usa placa y hora para no colisionar`() {
        val r = AnprRecordDto(plateNo = "XYZ999", crossTime = "2026-09-04T18:30:00-06:00")
        assertEquals("XYZ999-2026-09-04T18:30:00-06:00", r.claveDeLista(0))
    }

    // ── Diagnóstico de errores ──────────────────────────────────────────────

    @Test
    fun `extrae el mensaje de un error de NestJS`() {
        val crudo = """{"message":"Operación Artemis no disponible en sitio ISAPI. """ +
            """Usa sync/stream/open adaptados o cambia provider a ARTEMIS.","statusCode":400}"""
        val msg = IntegraVehiclesRepository.extraerMensaje(crudo)
        requireNotNull(msg)
        assertTrue(msg.contains("Artemis no disponible"))
        assertTrue(msg.contains("provider a ARTEMIS"))
    }

    @Test
    fun `junta los mensajes cuando class-validator manda una lista`() {
        val crudo = """{"message":["plateNo must be a string","personId is wrong"],""" +
            """"statusCode":400}"""
        assertEquals(
            "plateNo must be a string · personId is wrong",
            IntegraVehiclesRepository.extraerMensaje(crudo),
        )
    }

    @Test
    fun `un cuerpo que no es JSON se ensena recortado en vez de perderse`() {
        val msg = IntegraVehiclesRepository.extraerMensaje("<html>502 Bad Gateway</html>")
        assertEquals("<html>502 Bad Gateway</html>", msg)
    }
}
