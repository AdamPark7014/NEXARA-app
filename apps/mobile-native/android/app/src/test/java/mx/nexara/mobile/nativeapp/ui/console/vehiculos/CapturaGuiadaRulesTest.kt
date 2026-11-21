package mx.nexara.mobile.nativeapp.ui.console.vehiculos

import mx.nexara.mobile.nativeapp.ui.console.vehiculos.CapturaGuiadaRules.LecturaIa
import mx.nexara.mobile.nativeapp.ui.console.vehiculos.CapturaGuiadaRules.Toma
import mx.nexara.mobile.nativeapp.ui.console.vehiculos.CapturaGuiadaRules.Video
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * Mismas reglas que `apps/api/src/vehicles/captura-guiada.spec.ts` y
 * `apps/web/lib/vehiculos-captura.spec.ts`: 8 cuadros + 4 fotos, video de 10 a 20 s, `meta` con la
 * hora de cada toma y la duración, `capturaVersion=2` y lo que leyó la IA.
 */
class CapturaGuiadaRulesTest {

    private val cuando = "2026-11-21T16:00:00.000Z"

    private fun todas(): Map<String, Toma> =
        CapturaGuiadaRules.SLOTS.associateWith { Toma(cuando, 19.04, -98.2) }

    private fun video(dur: Double = 14.26) = Video(capturedAt = cuando, duracionSeg = dur, bytes = 5_000_000)

    @Test
    fun `los slots y el campo del video son los de la API`() {
        assertEquals(
            listOf(
                "vuelta-1", "vuelta-2", "vuelta-3", "vuelta-4", "vuelta-5", "vuelta-6", "vuelta-7", "vuelta-8",
                "asientos-traseros", "asientos-delanteros", "tablero", "km-gasolina",
            ),
            CapturaGuiadaRules.SLOTS,
        )
        assertEquals("video-vuelta", CapturaGuiadaRules.CAMPO_VIDEO)
        assertEquals(5, CapturaGuiadaRules.PASOS.size)
        assertEquals("Trasera derecha", CapturaGuiadaRules.etiqueta("vuelta-4"))
    }

    @Test
    fun `8 cuadros al centro de cada octavo, nunca en los extremos`() {
        assertEquals(listOf(1.0, 3.0, 5.0, 7.0, 9.0, 11.0, 13.0, 15.0), CapturaGuiadaRules.tiemposCuadros(16.0))
        val t = CapturaGuiadaRules.tiemposCuadros(12.4)
        assertEquals(8, t.size)
        assertTrue(t.first() > 0.0)
        assertTrue(t.last() < 12.4)
        assertEquals(emptyList<Double>(), CapturaGuiadaRules.tiemposCuadros(0.0))
        assertEquals(1_000_000L, CapturaGuiadaRules.tiemposCuadrosUs(16_000).first())
    }

    @Test
    fun `la hora de cada cuadro es la de inicio mas su segundo en el video`() {
        val inicio = 1_795_276_800_000L // 2026-11-21T16:00:00Z
        val horas = CapturaGuiadaRules.horasCuadros(inicio, 16_000)
        assertEquals("2026-11-21T16:00:01.000Z", horas.first())
        assertEquals("2026-11-21T16:00:15.000Z", horas.last())
    }

    @Test
    fun `la vuelta debe durar de 10 a 20 s con un segundo de gracia`() {
        assertTrue(CapturaGuiadaRules.duracionValida(9.0))
        assertTrue(CapturaGuiadaRules.duracionValida(21.0))
        assertFalse(CapturaGuiadaRules.duracionValida(6.0))
        assertFalse(CapturaGuiadaRules.duracionValida(25.0))
        assertEquals(
            "La vuelta debe durar entre 10 y 20 segundos",
            CapturaGuiadaRules.validar(todas(), video(6.0), 48215, "1/2").mensaje,
        )
    }

    @Test
    fun `completa pasa y falla antes de mandar si falta el video, un cuadro o una hora`() {
        assertTrue(CapturaGuiadaRules.validar(todas(), video(), 48215, "1/2").ok)
        assertEquals("Falta el video de la vuelta completa", CapturaGuiadaRules.validar(todas(), null, 48215, "1/2").mensaje)
        assertEquals(
            "Graba la vuelta con la cámara en vivo, no de la galería",
            CapturaGuiadaRules.validar(todas(), video().copy(capturedAt = null), 48215, "1/2").mensaje,
        )
        assertEquals(
            "Falta la foto: Trasera derecha",
            CapturaGuiadaRules.validar(todas() - "vuelta-4", video(), 48215, "1/2").mensaje,
        )
        assertEquals(
            "Falta la hora de la foto: Kilometraje y gasolina",
            CapturaGuiadaRules.validar(todas() + ("km-gasolina" to Toma(null)), video(), 48215, "1/2").mensaje,
        )
        assertEquals(
            "El video pesa demasiado; vuelve a grabar la vuelta",
            CapturaGuiadaRules.validar(todas(), video().copy(bytes = CapturaGuiadaRules.VIDEO_MAX_BYTES + 1), 48215, "1/2").mensaje,
        )
    }

    @Test
    fun `km y gasolina confirmados, un km menor al ultimo solo pasa si Liz lo fuerza`() {
        assertEquals("Confirma el kilometraje del tablero", CapturaGuiadaRules.validar(todas(), video(), null, "1/2").mensaje)
        assertEquals("Confirma el nivel de gasolina", CapturaGuiadaRules.validar(todas(), video(), 48215, "").mensaje)
        assertEquals(
            "El kilometraje (48000) es menor al último registro de la unidad (48215)",
            CapturaGuiadaRules.validar(todas(), video(), 48000, "1/2", kmAnterior = 48215).mensaje,
        )
        assertTrue(CapturaGuiadaRules.validar(todas(), video(), 48000, "1/2", kmAnterior = 48215, forzarKm = true).ok)
    }

    @Test
    fun `meta lleva cada toma y el video con su duracion a un decimal`() {
        val json = CapturaGuiadaRules.metaJson(todas(), video())
        assertTrue(json.startsWith("{\"vuelta-1\":{\"capturedAt\":\"$cuando\",\"lat\":19.04,\"lng\":-98.2}"))
        assertTrue(json.endsWith("\"video-vuelta\":{\"capturedAt\":\"$cuando\",\"duracionSeg\":14.3}}"))
    }

    @Test
    fun `0,0 no es una ubicacion`() {
        val json = CapturaGuiadaRules.metaJson(mapOf("tablero" to Toma(cuando, 0.0, 0.0)), video())
        assertTrue(json.contains("\"tablero\":{\"capturedAt\":\"$cuando\",\"lat\":null,\"lng\":null}"))
    }

    @Test
    fun `campos de texto como los manda la web, los opcionales solo con valor`() {
        val base = CapturaGuiadaRules.camposTexto(todas(), video(), 48215, "1/2").toMap()
        assertEquals("2", base["capturaVersion"])
        assertEquals("48215", base["odometroKm"])
        assertEquals("1/2", base["combustible"])
        assertNull(base["lecturaIa"])
        assertNull(base["forzarKm"])
        assertNull(base["actividadId"])

        val inventario = CapturaGuiadaRules.camposTexto(
            todas(), video(), 48215, "1/2",
            lecturaIa = LecturaIa(48215, 50), forzarKm = true, actividadId = 40, encargadoId = 9,
        ).toMap()
        assertEquals("{\"odometroKm\":48215,\"combustiblePct\":50}", inventario["lecturaIa"])
        assertEquals("true", inventario["forzarKm"])
        assertEquals("40", inventario["actividadId"])
        assertEquals("9", inventario["encargadoId"])
        assertNull(CapturaGuiadaRules.lecturaIaJson(LecturaIa()))
    }

    @Test
    fun `la lectura de la IA se propone y se nota si la persona la cambio`() {
        assertEquals("1/2", CapturaGuiadaRules.nivelMasCercano(50))
        assertEquals("1/4", CapturaGuiadaRules.nivelMasCercano(30))
        assertNull(CapturaGuiadaRules.nivelMasCercano(140))
        assertFalse(CapturaGuiadaRules.corrigioLectura(LecturaIa(48215, 50), 48215, "1/2"))
        assertTrue(CapturaGuiadaRules.corrigioLectura(LecturaIa(48215, 50), 48251, "1/2"))
        assertTrue(CapturaGuiadaRules.corrigioLectura(LecturaIa(48215, 50), 48215, "3/4"))
        assertFalse(CapturaGuiadaRules.corrigioLectura(null, 48215, "1/2"))
    }

    @Test
    fun `unidad fuera, firma minima y textos cortos`() {
        assertTrue(CapturaGuiadaRules.unidadSigueFuera("En uso", conSalida = false, conDevolucion = false))
        assertTrue(CapturaGuiadaRules.unidadSigueFuera("Aprobado", conSalida = true, conDevolucion = false))
        assertFalse(CapturaGuiadaRules.unidadSigueFuera("Devuelto", conSalida = true, conDevolucion = true))
        assertFalse(CapturaGuiadaRules.firmaSuficiente(3))
        assertEquals("48,215 km", CapturaGuiadaRules.kmTexto(48215))
        assertEquals("½ tanque", CapturaGuiadaRules.gasolinaCorta(50))
        assertEquals("Lleno", CapturaGuiadaRules.gasolinaCorta(100))
        assertEquals("0:14", CapturaGuiadaRules.reloj(14.4))
    }
}
