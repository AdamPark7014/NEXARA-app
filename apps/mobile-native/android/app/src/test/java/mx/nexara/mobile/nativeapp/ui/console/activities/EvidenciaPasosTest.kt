package mx.nexara.mobile.nativeapp.ui.console.activities

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class EvidenciaPasosTest {
    @Test
    fun `el paso que sigue, con y sin hoja de servicio`() {
        val r = CoreActivityRules
        assertEquals(r.STEP_PHOTOS, r.pasoSiguiente(r.STEP_ENTRY, "tarea"))
        assertEquals(r.STEP_DATA, r.pasoSiguiente(r.STEP_PHOTOS, "tarea"))
        assertEquals(r.STEP_PDF, r.pasoSiguiente(r.STEP_PHOTOS, "servicio"))
        assertEquals(r.STEP_EXIT, r.pasoSiguiente(r.STEP_DATA, "tarea"))
        assertEquals(r.STEP_COMPLETED, r.pasoSiguiente(r.STEP_EXIT, "tarea"))
        assertEquals(r.STEP_COMPLETED, r.pasoSiguiente(null, "tarea"))
    }

    @Test
    fun `se regresa a fotos desde lo que sigue, no desde la entrada ni corrigiendo`() {
        val r = CoreActivityRules
        assertTrue(r.puedeRegresarAFotos(r.STEP_DATA, false))
        assertTrue(r.puedeRegresarAFotos(r.STEP_EXIT, false))
        assertTrue(r.puedeRegresarAFotos(r.STEP_PDF, false))
        assertFalse(r.puedeRegresarAFotos(r.STEP_PHOTOS, false))
        assertFalse(r.puedeRegresarAFotos(r.STEP_ENTRY, false))
        assertFalse(r.puedeRegresarAFotos(r.STEP_COMPLETED, false))
        assertFalse(r.puedeRegresarAFotos(r.STEP_DATA, true))
    }

    @Test
    fun `la cámara se pide una sola vez y solo para esa actividad`() {
        EvidenciaApertura.pedirCamara(7)
        assertFalse(EvidenciaApertura.tomar(8))
        assertTrue(EvidenciaApertura.tomar(7))
        assertFalse(EvidenciaApertura.tomar(7))
    }
}
