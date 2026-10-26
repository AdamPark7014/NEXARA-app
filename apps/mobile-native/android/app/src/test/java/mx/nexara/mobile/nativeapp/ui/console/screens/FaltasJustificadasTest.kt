package mx.nexara.mobile.nativeapp.ui.console.screens

import mx.nexara.mobile.nativeapp.data.api.ActivityPersonRefDto
import mx.nexara.mobile.nativeapp.data.api.AttendanceEventDto
import mx.nexara.mobile.nativeapp.data.api.AttendanceJustificacionDto
import mx.nexara.mobile.nativeapp.data.api.AttendanceRangeUserDto
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

/** Un día justificado se lee «Falta justificada» y el motivo debajo: ni ausente ni asistió. */
class FaltasJustificadasTest {

    private val incapacidad = AttendanceJustificacionDto(
        id = 1,
        userId = 7,
        fecha = "2026-09-16",
        motivo = "Incapacidad del IMSS",
        estado = "FALTA_JUSTIFICADA",
        justificadaPor = ActivityPersonRefDto(id = 2, nombre = "Christian Ruiz"),
    )

    @Test
    fun soloChristianJustifica() {
        assertTrue(FaltasJustificadas.puedeJustificar("gerencia@nexara.com.mx"))
        assertTrue(FaltasJustificadas.puedeJustificar("claudia.bernal@nexara.com.mx"))
        assertFalse(FaltasJustificadas.puedeJustificar("luis.perez@nexara.com.mx"))
        assertFalse(FaltasJustificadas.puedeJustificar(null))
    }

    @Test
    fun textoYQuien() {
        assertEquals("Falta justificada\nIncapacidad del IMSS", FaltasJustificadas.texto(incapacidad))
        assertEquals("Falta justificada", FaltasJustificadas.texto(incapacidad.copy(motivo = " ")))
        assertEquals("Falta justificada", FaltasJustificadas.texto(incapacidad.copy(motivo = null)))
        assertEquals("Justificó Christian Ruiz", FaltasJustificadas.quien(incapacidad))
        assertNull(FaltasJustificadas.quien(incapacidad.copy(justificadaPor = null)))
    }

    @Test
    fun unDatoPorRenglon() {
        // Texto viejo, a 390 px, en un solo renglón: «Falta justificada · Incapacidad del IMSS».
        val viejo = "Falta justificada · Incapacidad del IMSS"
        val texto = FaltasJustificadas.texto(incapacidad)
        assertEquals("Falta justificada\nIncapacidad del IMSS", texto)
        assertEquals(listOf("Falta justificada", "Incapacidad del IMSS"), texto.split("\n"))
        assertNotEquals(viejo, texto)
        assertFalse(texto.contains(" · "))
        // Sin motivo no queda un renglón vacío. Cómo se justifica la falta no cambia.
        assertEquals("Falta justificada", FaltasJustificadas.texto(incapacidad.copy(motivo = " ")))
        assertEquals("Falta justificada", FaltasJustificadas.texto(incapacidad.copy(motivo = null)))
        assertFalse(FaltasJustificadas.texto(incapacidad.copy(motivo = " ")).contains("\n"))
        assertTrue(FaltasJustificadas.motivoOk("Incapacidad del IMSS"))
        assertFalse(FaltasJustificadas.motivoOk("corto"))
    }

    @Test
    fun seBuscaPorDia() {
        assertEquals(incapacidad, FaltasJustificadas.delDia(listOf(incapacidad), "2026-09-16"))
        assertNull(FaltasJustificadas.delDia(listOf(incapacidad), "2026-09-17"))
        assertNull(FaltasJustificadas.delDia(null, "2026-09-16"))
    }

    @Test
    fun cuandoSeOfreceJustificar() {
        val hoy = "2026-09-17"
        assertTrue(FaltasJustificadas.ofrecerJustificar(true, hayEntrada = false, yaJustificada = false, fecha = "2026-09-16", hoy = hoy))
        assertTrue(FaltasJustificadas.ofrecerJustificar(true, hayEntrada = false, yaJustificada = false, fecha = hoy, hoy = hoy))
        assertFalse(FaltasJustificadas.ofrecerJustificar(false, hayEntrada = false, yaJustificada = false, fecha = hoy, hoy = hoy))
        assertFalse(FaltasJustificadas.ofrecerJustificar(true, hayEntrada = true, yaJustificada = false, fecha = hoy, hoy = hoy))
        assertFalse(FaltasJustificadas.ofrecerJustificar(true, hayEntrada = false, yaJustificada = true, fecha = hoy, hoy = hoy))
        assertFalse(FaltasJustificadas.ofrecerJustificar(true, hayEntrada = false, yaJustificada = false, fecha = "2026-09-18", hoy = hoy))
        assertFalse(FaltasJustificadas.motivoOk("  corto  "))
        assertTrue(FaltasJustificadas.motivoOk("Incapacidad del IMSS"))
    }

    @Test
    fun elDiaJustificadoNoSaleComoAusente() {
        val sinChecada = AttendanceRangeUserDto(
            userId = 7,
            userName = "Ana López",
            justificaciones = listOf(incapacidad),
        )
        val persona = mapPersonas(listOf(sinChecada), "2026-09-16", yoId = null).single()
        assertEquals(AttendanceEstado.JUSTIFICADA, persona.estado)
        assertEquals(incapacidad, persona.justificacion)

        // Otro día sin checada sigue siendo «Sin checada».
        assertEquals(AttendanceEstado.AUSENTE, mapPersonas(listOf(sinChecada), "2026-09-15", null).single().estado)

        // Si sí checó, manda la checada.
        val checo = sinChecada.copy(
            attendances = listOf(AttendanceEventDto(type = "entrada", timestamp = "2026-09-16T15:00:00Z")),
        )
        val conEntrada = mapPersonas(listOf(checo), "2026-09-16", null).single()
        assertEquals(AttendanceEstado.PRESENTE, conEntrada.estado)
        assertNull(conEntrada.justificacion)
    }
}
