package mx.nexara.mobile.nativeapp.ui.console.activities

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

/** Contrato B: semáforo del servidor, plan contra real e inicio. */
class ActivitySemaforoTest {

    @Test
    fun `cada luz tiene nombre y color`() {
        assertEquals("Urge", ActivitySemaforo.luz("rojo")?.etiqueta)
        assertEquals(CoreActivityRules.ROJO, ActivitySemaforo.luz("rojo")?.color)
        assertEquals("Atención", ActivitySemaforo.luz("AMARILLO")?.etiqueta)
        assertEquals("En tiempo", ActivitySemaforo.luz(" verde ")?.etiqueta)
    }

    @Test
    fun `sin semaforo no se pinta nada`() {
        // La API de hoy no lo manda: la tarjeta se ve como siempre.
        assertNull(ActivitySemaforo.luz(null))
        assertNull(ActivitySemaforo.luz(""))
        assertNull(ActivitySemaforo.luz("azul"))
    }

    @Test
    fun `plan contra real`() {
        assertEquals("Plan 2 h · real 2 h 30 min", ActivitySemaforo.planRealTexto(120.0, 150.0))
        assertEquals("Plan 45 min", ActivitySemaforo.planRealTexto(45.0, null))
        assertEquals("Real 20 min", ActivitySemaforo.planRealTexto(null, 20.0))
        assertNull(ActivitySemaforo.planRealTexto(null, null))
        assertNull(ActivitySemaforo.planRealTexto(0.0, 0.0))
    }

    @Test
    fun `excedida se pinta en rojo`() {
        assertEquals(CoreActivityRules.ROJO, ActivitySemaforo.planRealColor(true))
        assertEquals(CoreActivityRules.GRIS, ActivitySemaforo.planRealColor(false))
        assertEquals(CoreActivityRules.GRIS, ActivitySemaforo.planRealColor(null))
    }

    @Test
    fun `la persona no acepta ni rechaza, solo inicia`() {
        // Regla del dueño (18-09): la única acción es iniciarla.
        assertEquals("Iniciar actividad", ActivitySemaforo.ACCION_INICIAR)
        assertEquals("Sin iniciar", ActivitySemaforo.CHIP_SIN_INICIAR)
    }

    @Test
    fun `iniciar se ofrece mientras no tenga inicio real`() {
        assertTrue(ActivitySemaforo.puedeIniciar("PENDIENTE", null, false, "Pendiente"))
        // Aceptada con el botón viejo o rechazada antes de la regla: igual le falta iniciarla.
        assertTrue(ActivitySemaforo.puedeIniciar("ACEPTADA", null, null, "Pendiente"))
        assertTrue(ActivitySemaforo.puedeIniciar("RECHAZADA", "", false, "Pendiente"))
        // Un compañero ya la tiene en proceso: cada quien marca su propio inicio.
        assertTrue(ActivitySemaforo.puedeIniciar("PENDIENTE", null, false, "En Proceso"))
    }

    @Test
    fun `iniciar no se ofrece si ya inicio, si esta cerrada o si solo reparte`() {
        assertFalse(ActivitySemaforo.puedeIniciar("ACEPTADA", "2026-09-18T15:00:00.000Z", false, "En Proceso"))
        assertFalse(ActivitySemaforo.puedeIniciar("PENDIENTE", null, false, "Finalizada"))
        assertFalse(ActivitySemaforo.puedeIniciar("PENDIENTE", null, false, "Cancelada"))
        assertFalse(ActivitySemaforo.puedeIniciar("PENDIENTE", null, true, "Pendiente"))
        // API anterior al contrato: la foto de entrada marca el inicio como siempre.
        assertFalse(ActivitySemaforo.puedeIniciar(null, null, false, "Pendiente"))
    }

    @Test
    fun `quien asigno ve si ya la inicio`() {
        assertTrue(ActivitySemaforo.sinIniciar("PENDIENTE", null, "Pendiente"))
        assertFalse(ActivitySemaforo.sinIniciar("ACEPTADA", "2026-09-18T15:00:00.000Z", "En Proceso"))
        assertFalse(ActivitySemaforo.sinIniciar(null, null, "Pendiente"))
    }

    @Test
    fun `un rechazo de antes de la regla se lee con su motivo`() {
        assertTrue(ActivitySemaforo.fueRechazada("RECHAZADA"))
        assertEquals(
            "Rechazada: no tengo la llave del site",
            ActivitySemaforo.rechazadaTexto("no tengo la llave del site"),
        )
        assertEquals("Rechazada", ActivitySemaforo.rechazadaTexto("  "))
    }

    @Test
    fun `quien la asigno`() {
        assertEquals("Asignada por Luis Fernando", ActivitySemaforo.asignadaPorTexto("Luis Fernando Pérez Gómez"))
        assertNull(ActivitySemaforo.asignadaPorTexto(null))
        assertNull(ActivitySemaforo.asignadaPorTexto("   "))
    }
}
