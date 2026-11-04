package mx.nexara.mobile.nativeapp.ui.console.aprobaciones

import mx.nexara.mobile.nativeapp.data.api.LoteItemDto
import mx.nexara.mobile.nativeapp.data.api.PersonaRevisionDto
import mx.nexara.mobile.nativeapp.data.api.RevisionPendienteDto
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class BandejaRulesTest {
    private fun rev(id: Long, persona: Long? = id + 100, paraTi: Boolean? = true) = RevisionPendienteDto(
        activityId = id,
        persona = persona?.let { PersonaRevisionDto(id = it) },
        paraTi = paraTi,
    )

    @Test
    fun `lo que no dice para quien es tambien te toca, como en la web`() {
        val e = BandejaRules.separar(listOf(rev(1), rev(2, paraTi = null), rev(3, paraTi = false)))
        assertEquals(listOf(1L, 2L), e.teTocan.map { it.activityId })
        assertEquals(listOf(3L), e.deOtros.map { it.activityId })
        assertEquals(3, e.total)
    }

    @Test
    fun `el resumen solo dice lo que no es cero`() {
        fun r(n: Int, m: Int) = BandejaRules.Evidencias(List(n) { rev(it.toLong()) }, List(m) { rev(it.toLong()) })
        assertEquals("28 te tocan · 27 con sus jefes", BandejaRules.resumen(r(28, 27)))
        assertEquals("1 te toca", BandejaRules.resumen(r(1, 0)))
        assertEquals("3 con sus jefes", BandejaRules.resumen(r(0, 3)))
        assertEquals("", BandejaRules.resumen(r(0, 0)))
    }

    @Test
    fun `el lote solo lleva lo tuyo, con persona y hasta el tope de la API`() {
        val e = BandejaRules.separar(List(60) { rev(it.toLong()) } + rev(99, persona = null) + rev(98, paraTi = false))
        val lote = BandejaRules.loteDe(e)
        assertEquals(BandejaRules.TOPE_LOTE, lote.size)
        assertEquals(LoteItemDto(0, 100), lote.first())
        assertFalse(lote.any { it.activityId == 98L })
    }

    @Test
    fun `calificacion y nota como la web`() {
        assertFalse(BandejaRules.calificacionValida(0))
        assertTrue(BandejaRules.calificacionValida(5))
        assertFalse(BandejaRules.notaValida("  ok  "))
        assertTrue(BandejaRules.notaValida(BandejaRules.NOTA_LOTE))
    }

    @Test
    fun `el mensaje dice lo que paso de verdad`() {
        assertEquals("Se aprobaron 28 evidencias.", BandejaRules.mensajeLote(28, 0))
        assertEquals("Se aprobó 1 evidencia.", BandejaRules.mensajeLote(1, 0))
        assertEquals("Se aprobaron 26; 2 no se pudieron, revísalas una por una.", BandejaRules.mensajeLote(26, 2))
        assertEquals("No se pudieron aprobar 2 evidencias.", BandejaRules.mensajeLote(0, 2))
    }

    @Test
    fun `la bandeja vacia solo es vacia si no hay nada de nada`() {
        val nada = BandejaRules.Evidencias()
        assertFalse(BandejaRules.hayAlgo(0, nada, 0, 0))
        assertTrue(BandejaRules.hayAlgo(0, nada, 1, 0))
        assertTrue(BandejaRules.hayAlgo(0, nada, 0, 2))
        assertTrue(BandejaRules.hayAlgo(1, nada, 0, 0))
        assertTrue(BandejaRules.hayAlgo(0, BandejaRules.separar(listOf(rev(1, paraTi = false))), 0, 0))
    }
}
