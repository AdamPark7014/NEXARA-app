package mx.nexara.mobile.nativeapp.ui.console.activities

import mx.nexara.mobile.nativeapp.ui.console.activities.ActivityPriorityJump.Pendiente
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

/** Contrato B: empezar una actividad con otra de más prioridad pendiente avisa, no bloquea. */
class ActivityPriorityJumpTest {

    @Test
    fun `una alta sin empezar sale primero`() {
        val otras = listOf(
            Pendiente(id = 2, prioridad = "MEDIA"),
            Pendiente(id = 3, prioridad = "ALTA"),
        )
        assertEquals(3L, ActivityPriorityJump.mayorPendiente(1L, "BAJA", otras)?.id)
    }

    @Test
    fun `entre iguales no hay salto`() {
        val otras = listOf(Pendiente(id = 2, prioridad = "MEDIA"))
        assertNull(ActivityPriorityJump.mayorPendiente(1L, "MEDIA", otras))
    }

    @Test
    fun `lo ya empezado o terminado no cuenta`() {
        val otras = listOf(
            Pendiente(id = 2, prioridad = "ALTA", iniciada = true),
            Pendiente(id = 3, prioridad = "ALTA", terminada = true),
        )
        assertNull(ActivityPriorityJump.mayorPendiente(1L, "BAJA", otras))
    }

    @Test
    fun `la propia actividad nunca es su propio salto`() {
        val otras = listOf(Pendiente(id = 1, prioridad = "ALTA"))
        assertNull(ActivityPriorityJump.mayorPendiente(1L, "BAJA", otras))
    }

    @Test
    fun `urgente cuenta como alta y lo desconocido como media`() {
        assertEquals(0, ActivityPriorityJump.rango("urgente"))
        assertEquals(0, ActivityPriorityJump.rango("Alta"))
        assertEquals(1, ActivityPriorityJump.rango(null))
        assertEquals(2, ActivityPriorityJump.rango("baja"))
    }

    @Test
    fun `el aviso dice cual y de que prioridad`() {
        assertEquals(
            "«Cambio de disco» es de prioridad alta y sigue sin empezar.",
            ActivityPriorityJump.aviso("Cambio de disco", "ALTA"),
        )
        assertEquals(
            "Otra actividad es de prioridad media y sigue sin empezar.",
            ActivityPriorityJump.aviso(null, null),
        )
    }
}
