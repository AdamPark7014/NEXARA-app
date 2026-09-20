package mx.nexara.mobile.nativeapp.ui.console.vehiculos

import mx.nexara.mobile.nativeapp.ui.console.vehiculos.ChecklistVehiculoRules.SlotMeta
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

/** Mismas reglas que `apps/api/src/vehicles/checklist-entrega.spec.ts`. */
class ChecklistVehiculoRulesTest {

    private fun meta(hora: String = "2026-09-19T10:00:00.000Z") =
        SlotMeta(capturedAt = hora, lat = 19.0414, lng = -98.2063)

    private fun todas(): Map<String, SlotMeta> =
        ChecklistVehiculoRules.SLOTS.associate { it.id to meta() }

    @Test
    fun `el checklist son siete casillas con los nombres del API`() {
        assertEquals(
            listOf(
                "frontal", "trasera", "lateral-izq", "lateral-der",
                "interior-delantera", "interior-trasera", "tablero",
            ),
            ChecklistVehiculoRules.SLOTS.map { it.id },
        )
    }

    @Test
    fun `las siete fotos son obligatorias`() {
        val sinNada = ChecklistVehiculoRules.validar(emptyMap(), odometroKm = 100, combustible = "1/2")
        assertEquals(7, sinNada.faltantes.size)
        assertFalse(sinNada.ok)

        val conTodas = ChecklistVehiculoRules.validar(todas(), odometroKm = 100, combustible = "1/2")
        assertTrue(conTodas.mensaje ?: "", conTodas.ok)
    }

    @Test
    fun `falta una casilla y se nombra por su etiqueta`() {
        val faltaTablero = todas() - ChecklistVehiculoRules.TABLERO
        val v = ChecklistVehiculoRules.validar(faltaTablero, odometroKm = 100, combustible = "F")
        assertEquals(listOf("Tablero"), v.faltantes)
        assertTrue(v.mensaje!!.contains("Tablero"))
    }

    @Test
    fun `una foto sin hora cuenta como faltante`() {
        // Es exactamente lo que el servidor rechaza: así se niegan las de galería.
        val sinHora = todas() + (ChecklistVehiculoRules.FRONTAL to SlotMeta(capturedAt = ""))
        val v = ChecklistVehiculoRules.validar(sinHora, odometroKm = 100, combustible = "F")
        assertEquals(listOf("Frente"), v.faltantes)
    }

    @Test
    fun `media tanque es 50 y lleno es 100`() {
        assertEquals(50, ChecklistVehiculoRules.combustiblePct("1/2"))
        assertEquals(100, ChecklistVehiculoRules.combustiblePct("F"))
    }

    @Test
    fun `los cinco niveles del tanque y el numero suelto`() {
        assertEquals(
            listOf(0, 25, 50, 75, 100),
            ChecklistVehiculoRules.NIVELES.map { ChecklistVehiculoRules.combustiblePct(it) },
        )
        assertEquals(37, ChecklistVehiculoRules.combustiblePct("37"))
        assertNull(ChecklistVehiculoRules.combustiblePct("140"))
        assertNull(ChecklistVehiculoRules.combustiblePct(""))
        assertNull(ChecklistVehiculoRules.combustiblePct(null))
    }

    @Test
    fun `sin nivel de combustible no se puede enviar`() {
        val v = ChecklistVehiculoRules.validar(todas(), odometroKm = 100, combustible = null)
        assertTrue(v.errores.any { it.contains("combustible") })
    }

    @Test
    fun `la devolucion rechaza un km final menor al de salida`() {
        val v = ChecklistVehiculoRules.validar(
            metas = todas(),
            odometroKm = 12_000,
            combustible = "1/2",
            kmInicio = 12_500,
        )
        assertFalse(v.ok)
        assertTrue(v.errores.first(), v.errores.first().contains("12500"))

        val igual = ChecklistVehiculoRules.validar(todas(), odometroKm = 12_500, combustible = "1/2", kmInicio = 12_500)
        assertTrue(igual.ok)
    }

    @Test
    fun `sin kilometraje o en negativo no se puede enviar`() {
        assertTrue(
            ChecklistVehiculoRules.validar(todas(), odometroKm = null, combustible = "E")
                .errores.any { it.contains("kilometraje") },
        )
        assertTrue(
            ChecklistVehiculoRules.validar(todas(), odometroKm = -1, combustible = "E")
                .errores.any { it.contains("negativo") },
        )
    }

    @Test
    fun `meta lleva una entrada por casilla con hora y coordenadas`() {
        val json = ChecklistVehiculoRules.metaJson(todas())
        ChecklistVehiculoRules.SLOTS.forEach { slot ->
            assertTrue(slot.id, json.contains("\"${slot.id}\":{"))
        }
        assertTrue(json, json.contains("\"capturedAt\":\"2026-09-19T10:00:00.000Z\""))
        assertTrue(json, json.contains("\"lat\":19.0414"))
        assertTrue(json, json.contains("\"lng\":-98.2063"))
    }

    @Test
    fun `una foto sin hora no viaja en meta`() {
        val json = ChecklistVehiculoRules.metaJson(
            mapOf(
                ChecklistVehiculoRules.FRONTAL to meta(),
                ChecklistVehiculoRules.TABLERO to SlotMeta(capturedAt = null),
            ),
        )
        assertEquals("{\"frontal\":{\"capturedAt\":\"2026-09-19T10:00:00.000Z\",\"lat\":19.0414,\"lng\":-98.2063}}", json)
    }

    @Test
    fun `sin GPS la casilla solo lleva la hora`() {
        val json = ChecklistVehiculoRules.slotJson(SlotMeta(capturedAt = "2026-09-19T10:00:00.000Z"))
        assertEquals("{\"capturedAt\":\"2026-09-19T10:00:00.000Z\"}", json)
    }

    @Test
    fun `el primer paso son cuatro exteriores y dos interiores`() {
        assertEquals(4, ChecklistVehiculoRules.slots(ChecklistVehiculoRules.Grupo.EXTERIOR).size)
        assertEquals(2, ChecklistVehiculoRules.slots(ChecklistVehiculoRules.Grupo.INTERIOR).size)
        assertEquals(6, ChecklistVehiculoRules.SLOTS_FOTOS.size)
        assertEquals(
            listOf("Tablero"),
            ChecklistVehiculoRules.slots(ChecklistVehiculoRules.Grupo.TABLERO).map { it.etiqueta },
        )
    }
}
