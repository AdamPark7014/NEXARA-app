package mx.nexara.mobile.nativeapp.ui.console.screens

import mx.nexara.mobile.nativeapp.data.api.ActivityPersonRefDto
import mx.nexara.mobile.nativeapp.data.api.AttendanceCorreccionDto
import mx.nexara.mobile.nativeapp.data.api.AttendanceEventDto
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
    fun `una checada del equipo lleva sus avisos y sus correcciones`() {
        val badges = AttendanceBadges.de(
            AttendanceEventDto(
                type = "salida",
                timestamp = "2026-09-17T23:30:00Z",
                cierreAutomatico = true,
                validacion = "REVISAR",
                motivoValidacion = "Sin salida registrada: cierre automático",
                correcciones = listOf(
                    AttendanceCorreccionDto(
                        antes = "2026-09-17T23:30:00Z",
                        despues = "2026-09-17T18:05:00Z",
                        motivo = "Se fue a las 18:05 y olvidó checar",
                        por = ActivityPersonRefDto(id = 1, nombre = "Christian"),
                    ),
                ),
            ),
        )
        val textos = badges.map { it.texto }
        assertEquals(
            listOf(
                AttendanceBadges.CIERRE_AUTOMATICO,
                "Revisar: Sin salida registrada: cierre automático",
                AttendanceBadges.CORREGIDA,
            ),
            textos,
        )
    }

    @Test
    fun `la correccion dice quien y por que`() {
        assertEquals(
            "Corregida por Christian: olvidó checar salida",
            AttendanceBadges.correccionTexto(
                AttendanceCorreccionDto(
                    motivo = "olvidó checar salida",
                    por = ActivityPersonRefDto(id = 1, nombre = "Christian"),
                ),
            ),
        )
        assertEquals("Corregida", AttendanceBadges.correccionTexto(AttendanceCorreccionDto()))
    }

    @Test
    fun `una checada vieja del equipo no inventa avisos`() {
        assertTrue(
            AttendanceBadges.de(AttendanceEventDto(type = "entrada", timestamp = "2026-09-17T14:00:00Z")).isEmpty(),
        )
        assertTrue(AttendanceBadges.de(null as AttendanceEventDto?).isEmpty())
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
