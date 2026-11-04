package mx.nexara.mobile.nativeapp.ui.console.inicio

import mx.nexara.mobile.nativeapp.data.api.SugerenciaDto
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class QueSigueRulesTest {
    @Test
    fun soloSiNoTraeNadaCorriendoYNoEsDireccion() {
        assertTrue(QueSigueRules.mostrar(esDireccion = false, algoCorriendo = false))
        assertFalse(QueSigueRules.mostrar(esDireccion = false, algoCorriendo = true))
        assertFalse(QueSigueRules.mostrar(esDireccion = true, algoCorriendo = false))
    }

    @Test
    fun laActividadSaleDeSuLiga() {
        assertEquals(412L, QueSigueRules.actividadDe("/erp/actividades/412"))
        assertNull(QueSigueRules.actividadDe("/erp/proyectos/obra"))
        assertNull(QueSigueRules.actividadDe(null))
    }

    @Test
    fun cadaSugerenciaLlevaSuBoton() {
        val empezar = SugerenciaDto(clave = "fija:escritorio", accion = "empezar")
        assertEquals(QueSigueRules.Boton.EMPEZAR, QueSigueRules.botonDe(empezar))
        val abierta = SugerenciaDto(clave = "abierta:9", accion = "abrir", href = "/erp/actividades/9")
        assertEquals(QueSigueRules.Boton.ABRIR_ACTIVIDAD, QueSigueRules.botonDe(abierta))
        val revisar = SugerenciaDto(clave = "revisar", accion = "abrir", href = "/erp/pizarra?vista=revision")
        assertEquals(QueSigueRules.Boton.ABRIR_ACTIVIDADES, QueSigueRules.botonDe(revisar))
    }

    @Test
    fun loQueViveEnLaWebSeLeeSinBotonQueNoLleveANingunLado() {
        val obra = SugerenciaDto(clave = "obra", accion = "abrir", href = "/erp/proyectos/obra")
        assertEquals(QueSigueRules.Boton.NINGUNO, QueSigueRules.botonDe(obra))
    }

    @Test
    fun unPendienteVacioODemasiadoLargoNoSeGuarda() {
        assertTrue(QueSigueRules.pendienteValido(" Pedir la fianza "))
        assertFalse(QueSigueRules.pendienteValido("   "))
        assertFalse(QueSigueRules.pendienteValido("x".repeat(QueSigueRules.LARGO_PENDIENTE + 1)))
    }
}
