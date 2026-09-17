package mx.nexara.mobile.nativeapp.ui.console.activities

import mx.nexara.mobile.nativeapp.data.api.ActivityAccionPersonaDto
import mx.nexara.mobile.nativeapp.data.api.ActivityAccionesDto
import mx.nexara.mobile.nativeapp.data.api.ActivityDto
import mx.nexara.mobile.nativeapp.data.api.ActivityPersonRefDto
import mx.nexara.mobile.nativeapp.data.api.TeamBoardUserDto
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

/** Cancelar y pasar a otro compañero: solo superiores, siempre con motivo. */
class ActivitySuperiorRulesTest {

    private val luis = ActivityAccionPersonaDto(userId = 1, nombre = "Luis Pérez", rol = "LEAD", responsable = true, ejecuta = false)
    private val ana = ActivityAccionPersonaDto(userId = 2, nombre = "Ana López", rol = "TECNICO", ejecuta = true)
    private val beto = ActivityAccionPersonaDto(userId = 3, nombre = "Beto Ruiz", rol = "APOYO", ejecuta = true)

    @Test
    fun motivoConMinimoDeLaApi() {
        val acciones = ActivityAccionesDto(motivoMinimo = 12)
        assertEquals(12, ActivitySuperiorRules.motivoMinimo(acciones))
        assertEquals(10, ActivitySuperiorRules.motivoMinimo(ActivityAccionesDto()))
        assertEquals(10, ActivitySuperiorRules.motivoMinimo(null))
        assertFalse(ActivitySuperiorRules.motivoOk("   corto   ", 10))
        // Los espacios repetidos no cuentan, igual que en el servidor.
        assertFalse(ActivitySuperiorRules.motivoOk("a          b", 10))
        assertTrue(ActivitySuperiorRules.motivoOk("El cliente pospuso", 10))
    }

    @Test
    fun sinPermisoOCerradaNoHayBotones() {
        assertFalse(ActivitySuperiorRules.muestraAcciones(null))
        assertFalse(ActivitySuperiorRules.muestraAcciones(ActivityAccionesDto(puedeCancelar = false, puedePasar = false)))
        assertFalse(ActivitySuperiorRules.muestraAcciones(ActivityAccionesDto(puedeCancelar = true, cerrada = true)))
        assertTrue(ActivitySuperiorRules.muestraAcciones(ActivityAccionesDto(puedeCancelar = true)))
        assertTrue(ActivitySuperiorRules.muestraAcciones(ActivityAccionesDto(puedePasar = true)))
    }

    @Test
    fun salenQuienesEjecutan() {
        val acciones = ActivityAccionesDto(personas = listOf(luis, ana, beto))
        assertEquals(listOf(2L, 3L), ActivitySuperiorRules.quienesSalen(acciones).map { it.userId })
        // Si nadie viene marcado como ejecutor, se ofrecen todas.
        val sinMarca = ActivityAccionesDto(personas = listOf(luis.copy(ejecuta = null)))
        assertEquals(listOf(1L), ActivitySuperiorRules.quienesSalen(sinMarca).map { it.userId })
    }

    @Test
    fun entranSoloQuienesNoEstanYa() {
        val acciones = ActivityAccionesDto(personas = listOf(luis, ana))
        val equipo = listOf(
            TeamBoardUserDto(id = 2, nombre = "Ana López"),
            TeamBoardUserDto(id = 9, nombre = "zoe Díaz"),
            TeamBoardUserDto(id = 7, nombre = "Carlos Mora"),
            TeamBoardUserDto(id = 7, nombre = "Carlos Mora"),
        )
        assertEquals(listOf(7L, 9L), ActivitySuperiorRules.quienesEntran(equipo, acciones).map { it.id })
    }

    @Test
    fun etiquetasDeQuienLaDeja() {
        assertEquals("Luis Pérez · responsable", ActivitySuperiorRules.etiquetaPersona(luis))
        assertEquals("Beto Ruiz · apoyo", ActivitySuperiorRules.etiquetaPersona(beto))
        assertEquals("Ana López", ActivitySuperiorRules.etiquetaPersona(ana))
    }

    @Test
    fun avisoDeCancelada() {
        val activa = ActivityDto(id = 1, estatus = "En Proceso")
        assertNull(ActivitySuperiorRules.avisoCancelada(activa))

        val cancelada = activa.copy(
            estatus = "Cancelada",
            cancelReason = "El cliente pospuso el servicio",
            cancelledAt = "2026-09-17T15:00:00.000Z",
            cancelledBy = ActivityPersonRefDto(id = 4, nombre = "Luis Pérez"),
        )
        assertEquals("Cancelada por Luis Pérez · El cliente pospuso el servicio", ActivitySuperiorRules.avisoCancelada(cancelada))
        assertEquals("Cancelada", ActivitySuperiorRules.avisoCancelada(activa.copy(estatus = "Cancelada")))
    }
}
