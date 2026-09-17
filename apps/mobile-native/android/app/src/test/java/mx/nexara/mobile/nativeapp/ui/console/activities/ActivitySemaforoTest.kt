package mx.nexara.mobile.nativeapp.ui.console.activities

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

/** Contrato B: semáforo del servidor, plan contra real y aceptación. */
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
    fun `comenzar o decir que no puedes solo cuando esta pendiente`() {
        assertTrue(ActivitySemaforo.estaPendienteDeAceptar("PENDIENTE"))
        assertTrue(ActivitySemaforo.estaPendienteDeAceptar(" pendiente "))
        assertFalse(ActivitySemaforo.estaPendienteDeAceptar("ACEPTADA"))
        // Apps viejas contra API vieja: no hay botones que mostrar.
        assertFalse(ActivitySemaforo.estaPendienteDeAceptar(null))
    }

    @Test
    fun `la persona no decide si acepta, comienza`() {
        // Adam: quien recibe la actividad no la «acepta», la comienza.
        assertEquals("Comenzar actividad", ActivitySemaforo.ACCION_COMENZAR)
        assertEquals("No puedo tomarla", ActivitySemaforo.ACCION_NO_PUEDO)
        assertEquals("Sin comenzar", ActivitySemaforo.CHIP_SIN_COMENZAR)
    }

    @Test
    fun `cuando no pudo tomarla se lee con su motivo`() {
        assertTrue(ActivitySemaforo.fueRechazada("RECHAZADA"))
        assertEquals(
            "No la tomaste: no tengo la llave del site",
            ActivitySemaforo.rechazadaTexto("no tengo la llave del site"),
        )
        assertEquals("No la tomaste", ActivitySemaforo.rechazadaTexto("  "))
    }

    @Test
    fun `el motivo de no poder tomarla pide diez caracteres`() {
        assertFalse(ActivitySemaforo.motivoRechazoOk("no puedo"))
        assertFalse(ActivitySemaforo.motivoRechazoOk(null))
        assertTrue(ActivitySemaforo.motivoRechazoOk("  estoy en otra sucursal  "))
    }

    @Test
    fun `quien la asigno`() {
        assertEquals("Asignada por Luis Fernando", ActivitySemaforo.asignadaPorTexto("Luis Fernando Pérez Gómez"))
        assertNull(ActivitySemaforo.asignadaPorTexto(null))
        assertNull(ActivitySemaforo.asignadaPorTexto("   "))
    }
}
