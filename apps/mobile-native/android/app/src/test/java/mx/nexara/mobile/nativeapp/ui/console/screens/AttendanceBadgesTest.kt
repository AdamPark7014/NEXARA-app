package mx.nexara.mobile.nativeapp.ui.console.screens

import mx.nexara.mobile.nativeapp.data.api.AttendanceRegisterResponse
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

/** Contrato A: qué le pasó a la checada, dicho en la tarjeta. */
class AttendanceBadgesTest {

    @Test
    fun `una checada normal no lleva insignias`() {
        assertTrue(AttendanceBadges.de(validacion = "OK").isEmpty())
        assertTrue(AttendanceBadges.de().isEmpty())
    }

    @Test
    fun `sin conexion, revisar y corregida`() {
        val badges = AttendanceBadges.de(
            validacion = "REVISAR",
            motivoValidacion = "La hora del teléfono no coincidía",
            offline = true,
            correcciones = 1,
        )
        val textos = badges.map { it.texto }
        assertEquals(
            listOf(
                AttendanceBadges.SIN_CONEXION,
                "Revisar: La hora del teléfono no coincidía",
                AttendanceBadges.CORREGIDA,
            ),
            textos,
        )
    }

    @Test
    fun `cierre automatico y fuera de sitio`() {
        val badges = AttendanceBadges.de(
            validacion = "REVISAR",
            motivoValidacion = "Sin salida registrada: cierre automático",
            cierreAutomatico = true,
            fueraDeSitio = true,
            distanciaSitioM = 450,
            sitioNombre = "Oficina",
        )
        val textos = badges.map { it.texto }
        assertTrue(AttendanceBadges.CIERRE_AUTOMATICO in textos)
        assertTrue("Fuera de sitio · 450 m de Oficina" in textos)
    }

    @Test
    fun `fuera de sitio sin distancia ni sitio`() {
        assertEquals("Fuera de sitio", AttendanceBadges.fueraDeSitioTexto(null, null))
        assertEquals("Fuera de sitio · 300 m", AttendanceBadges.fueraDeSitioTexto(300, null))
    }

    @Test
    fun `revisar sin motivo no inventa texto`() {
        assertEquals("Revisar", AttendanceBadges.revisarTexto(null))
        assertEquals("Revisar", AttendanceBadges.revisarTexto("   "))
    }

    @Test
    fun `una api vieja no genera insignias`() {
        assertTrue(AttendanceBadges.deRegistro(AttendanceRegisterResponse(id = 1, type = "entrada")).isEmpty())
        assertTrue(AttendanceBadges.deRegistro(null).isEmpty())
    }

    @Test
    fun `el registro trae fuera de sitio del servidor`() {
        val badges = AttendanceBadges.deRegistro(
            AttendanceRegisterResponse(
                id = 2,
                type = "entrada",
                validacion = "OK",
                fueraDeSitio = true,
                distanciaSitioM = 1200,
                sitioNombre = "Sucursal Centro",
            ),
        )
        assertEquals(listOf("Fuera de sitio · 1200 m de Sucursal Centro"), badges.map { it.texto })
    }
}
