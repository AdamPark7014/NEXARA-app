package mx.nexara.mobile.nativeapp.ui.console.activities

import java.time.Instant
import mx.nexara.mobile.nativeapp.data.api.PersonaRevisionDto
import mx.nexara.mobile.nativeapp.data.api.RevisionPendienteDto
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

/** Espejo de minutosEsperando / textoEspera de apps/web/lib/revisiones-api.ts. */
class EnEsperaRevisionTest {
    private val ahora = Instant.parse("2026-10-29T18:00:00Z")

    @Test
    fun waitTextLikeTheWeb() {
        assertEquals("Sin fecha de envío", EnEsperaRevision.textoEspera(null))
        assertEquals("hace un momento", EnEsperaRevision.textoEspera(0))
        assertEquals("hace 25 min", EnEsperaRevision.textoEspera(25))
        assertEquals("hace 3 h", EnEsperaRevision.textoEspera(200))
        assertEquals("hace 1 día", EnEsperaRevision.textoEspera(60 * 30))
        assertEquals("hace 21 días", EnEsperaRevision.textoEspera(60 * 24 * 21))
    }

    @Test
    fun minutesNeverNegativeAndNullWhenBadDate() {
        assertEquals(90L, EnEsperaRevision.minutosEsperando("2026-10-29T16:30:00.000Z", ahora))
        assertEquals(0L, EnEsperaRevision.minutosEsperando("2026-10-29T19:00:00Z", ahora))
        assertNull(EnEsperaRevision.minutosEsperando("ayer", ahora))
        assertNull(EnEsperaRevision.minutosEsperando(null, ahora))
    }

    @Test
    fun oldestFirstAndRowTexts() {
        val a = RevisionPendienteDto(activityId = 1, anNumber = "AN-0001", titulo = "Rack", enviadaAt = "2026-10-29T12:00:00Z")
        val b = RevisionPendienteDto(activityId = 2, titulo = "Sin AN", enviadaAt = "2026-10-08T12:00:00Z")
        val c = RevisionPendienteDto(activityId = 3, enviadaAt = null)
        assertEquals(listOf(2L, 1L, 3L), EnEsperaRevision.ordenar(listOf(a, c, b)).map { it.activityId })

        assertEquals("AN-0001 · Rack", EnEsperaRevision.titulo(a))
        assertEquals("Actividad #3", EnEsperaRevision.titulo(c))

        val conPersona = a.copy(persona = PersonaRevisionDto(id = 10, nombre = "Iván Pérez López"))
        val detalle = EnEsperaRevision.detalle(conPersona, ahora)
        assertEquals(true, detalle.endsWith("enviada hace 6 h"))
        assertEquals("corrección reenviada hace 6 h", EnEsperaRevision.detalle(a.copy(correccion = true), ahora))
        assertEquals("sin fecha de envío", EnEsperaRevision.detalle(c, ahora))
    }
}
