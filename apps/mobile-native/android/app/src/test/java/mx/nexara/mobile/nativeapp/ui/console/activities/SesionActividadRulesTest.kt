package mx.nexara.mobile.nativeapp.ui.console.activities

import mx.nexara.mobile.nativeapp.data.api.MyActivityRefDto
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class SesionActividadRulesTest {
    private val enPausa = SesionActividad(enPausa = true, pausaTipo = "PAUSA")

    @Test
    fun sinPausaNoHayTexto() {
        assertNull(SesionActividadRules.textoPausa(SesionActividad(enCurso = true)))
        assertNull(SesionActividadRules.textoPausa(SesionActividad()))
    }

    @Test
    fun pausaPropiaDiceLaPausaste() {
        val s = enPausa.copy(pausadaPor = MyActivityRefDto(id = 7, nombre = "Ana López"), motivoPausa = " Comida ")
        assertEquals("La pausaste: Comida", SesionActividadRules.textoPausa(s, miId = 7))
    }

    @Test
    fun pausaDelJefeUsaDosPalabrasDelNombre() {
        val s = enPausa.copy(pausadaPor = MyActivityRefDto(id = 3, nombre = "Juan Carlos Pérez Ruiz"))
        assertEquals("La pausó Juan Carlos.", SesionActividadRules.textoPausa(s, miId = 7))
    }

    @Test
    fun pausaSinQuienNiMotivo() {
        assertEquals("Está en pausa.", SesionActividadRules.textoPausa(enPausa))
    }

    @Test
    fun detencionesAutomaticas() {
        val salida = SesionActividad(enPausa = true, pausaTipo = "SALIDA")
        assertEquals("Se detuvo al marcar tu salida.", SesionActividadRules.textoPausa(salida))
        assertEquals("Se detuvo al marcar su salida.", SesionActividadRules.textoPausa(salida, propia = false))
        assertEquals(
            "Se detuvo sola al cumplir 12 horas.",
            SesionActividadRules.textoPausa(salida.copy(pausaTipo = "TOPE_12H")),
        )
        assertEquals(
            "Se detuvo sola al terminar el día.",
            SesionActividadRules.textoPausa(salida.copy(pausaTipo = "CORTE_DIA")),
        )
    }

    @Test
    fun reanudarSoloAbiertaYNoDespachador() {
        assertTrue(SesionActividadRules.puedeReanudar(enPausa, despachador = false, estatus = "En Proceso"))
        assertFalse(SesionActividadRules.puedeReanudar(enPausa, despachador = true, estatus = "En Proceso"))
        assertFalse(SesionActividadRules.puedeReanudar(enPausa, despachador = false, estatus = "Finalizada"))
        assertFalse(SesionActividadRules.puedeReanudar(SesionActividad(enCurso = true), false, "En Proceso"))
    }

    @Test
    fun pausarSoloConRelojCorriendo() {
        assertTrue(SesionActividadRules.puedePausar(SesionActividad(enCurso = true), "En Proceso"))
        assertFalse(SesionActividadRules.puedePausar(SesionActividad(enCurso = true), "Aprobada"))
        assertFalse(SesionActividadRules.puedePausar(enPausa, "En Proceso"))
        assertFalse(SesionActividadRules.puedePausar(SesionActividad(), "En Proceso"))
    }

    @Test
    fun motivoDelJefe() {
        assertEquals(
            "Escribe por qué la pausas (mínimo 10 caracteres).",
            SesionActividadRules.errorMotivoPausa("   corto   "),
        )
        assertNull(SesionActividadRules.errorMotivoPausa("Falla urgente en cliente"))
        assertEquals(
            "El motivo no puede pasar de 500 caracteres.",
            SesionActividadRules.errorMotivoPausa("x".repeat(501)),
        )
        assertNull(SesionActividadRules.errorMotivoPropio(""))
    }

    @Test
    fun avisoYReloj() {
        assertEquals("Pausada. Luis Mora ya recibió el aviso.", SesionActividadRules.avisoPausaDeEquipo("Luis Mora Díaz"))
        assertEquals("Pausada. Ya recibió el aviso.", SesionActividadRules.avisoPausaDeEquipo(null))
        assertEquals("Reloj corriendo desde las 09:30.", SesionActividadRules.textoCorriendo("09:30"))
        assertEquals("Reloj corriendo.", SesionActividadRules.textoCorriendo(null))
    }
}
