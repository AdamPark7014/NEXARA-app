package mx.nexara.mobile.nativeapp.ui.console.activities

import mx.nexara.mobile.nativeapp.data.api.ActivityPeriodoDto
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

/** Actividad de varios días: la tarjeta dice «Día N de M» en vez de la hora del primer día. */
class ActivityPeriodoTest {

    private val enCurso = ActivityPeriodoDto(
        inicio = "2026-09-16",
        fin = "2026-09-25",
        dias = 10,
        dia = 3,
        estado = "en_curso",
        etiqueta = "Día 3 de 10 · termina vie 25 sep",
        multiDia = true,
    )

    @Test
    fun `con periodo manda la frase del servidor`() {
        assertEquals("Día 3 de 10 · termina vie 25 sep", ActivityPeriodo.cuandoTexto(enCurso, "16 sep 09:00"))
    }

    @Test
    fun `sin periodo o con API vieja queda lo de siempre`() {
        assertEquals("16 sep 09:00", ActivityPeriodo.cuandoTexto(null, "16 sep 09:00"))
        assertEquals("16 sep 09:00", ActivityPeriodo.cuandoTexto(ActivityPeriodoDto(etiqueta = "  "), "16 sep 09:00"))
        assertEquals(null, ActivityPeriodo.cuandoTexto(null, null))
    }

    @Test
    fun `vencida y programada salen del estado`() {
        assertFalse(ActivityPeriodo.vencido(enCurso))
        assertTrue(ActivityPeriodo.vencido(enCurso.copy(estado = "vencida")))
        assertTrue(ActivityPeriodo.programada(enCurso.copy(estado = "programada")))
        assertFalse(ActivityPeriodo.programada(null))
    }
}
