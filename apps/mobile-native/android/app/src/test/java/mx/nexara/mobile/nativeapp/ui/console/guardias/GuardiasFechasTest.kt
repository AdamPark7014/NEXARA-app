package mx.nexara.mobile.nativeapp.ui.console.guardias

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

/** Sábados y domingos en UTC, igual que `finesDeSemana` de la web. */
class GuardiasFechasTest {

    @Test
    fun sabadoYDomingoSeAgrupanYUnDomingoSueltoNoHeredaElSabadoAnterior() {
        assertEquals(
            listOf(
                FinDeSemana("2026-10-03", "2026-10-04"),
                FinDeSemana("2026-10-10", "2026-10-11"),
            ),
            GuardiasFechas.finesDeSemana("2026-10-03", "2026-10-11"),
        )
        assertEquals(
            listOf(FinDeSemana(null, "2026-10-04")),
            GuardiasFechas.finesDeSemana("2026-10-04", "2026-10-04"),
        )
        assertTrue(GuardiasFechas.finesDeSemana("2026-10-05", "2026-10-09").isEmpty())
        assertTrue(GuardiasFechas.finesDeSemana("2026-10-11", "2026-10-03").isEmpty())
        assertNull(GuardiasFechas.diaDeLaSemana("2026-02-31"))
        assertFalse(GuardiasFechas.esFinDeSemana("2026-10-05"))
        assertTrue(GuardiasFechas.esFinDeSemana("2026-10-03"))
        assertTrue(GuardiasFechas.esFinDeSemana("2026-10-04"))
    }

    @Test
    fun soloSeProgramanLosFinesDeSemanaDeHoyEnAdelante() {
        assertEquals(
            listOf("2026-10-04", "2026-10-10", "2026-10-11"),
            GuardiasFechas.diasProgramables("2026-10-03", "2026-10-11", "2026-10-04"),
        )
    }

    @Test
    fun elDiaCortoEsUnaEtiquetaCorta() {
        assertEquals("sáb 3 oct", GuardiasFechas.diaCorto("2026-10-03"))
        assertEquals("dom 4 oct", GuardiasFechas.diaCorto("2026-10-04"))
        assertEquals("sáb 3 oct · dom 4 oct", GuardiasFechas.tituloFin(FinDeSemana("2026-10-03", "2026-10-04")))
    }

    @Test
    fun vacioYErrorSonUnaFrase() {
        assertTrue(GuardiasFechas.mostrarVacio(puedeProgramar = false, guardias = 0))
        assertFalse(GuardiasFechas.mostrarVacio(puedeProgramar = true, guardias = 0))
        assertFalse(GuardiasFechas.mostrarVacio(puedeProgramar = false, guardias = 1))
        listOf(
            GuardiasTextos.VACIO,
            GuardiasTextos.ERROR_CARGA,
            GuardiasTextos.ERROR_PROGRAMAR,
            GuardiasTextos.ERROR_QUITAR,
            GuardiasTextos.EN_COLA,
            GuardiasTextos.NADIE,
            GuardiasTextos.confirmarQuitar("Salvador Hernández", "sáb 3 oct"),
        ).forEach { frase ->
            assertFalse(frase.contains("\n"))
            assertTrue(frase.endsWith("."))
            assertEquals(1, frase.count { it == '.' })
        }
    }
}
