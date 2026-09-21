package mx.nexara.mobile.nativeapp.ui.console.viaticos

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * El cuadre del reparto, que es lo único que el servidor no perdona.
 *
 * Todo se cuenta en centavos enteros porque en coma flotante `0.1 + 0.2` no es
 * `0.3`: hay una prueba dedicada a ese caso, que es el que rechazaba repartos
 * legítimos antes de que la regla viviera en enteros.
 */
class RepartoViaticoTest {

    private fun parte(id: Long, centavos: Long) = ParteReparto(actividadId = id, centavos = centavos)

    // ── Rechaza lo que no cuadra ────────────────────────────────────────────

    @Test
    fun rechazaUnaSumaQueNoDaElTotalExacto() {
        // $100.00 repartidos en $60.00 + $39.99: falta un centavo.
        val cuadre = RepartoViatico.revisar(
            listOf(parte(1L, 6_000L), parte(2L, 3_999L)),
            totalCentavos = 10_000L,
        )
        assertEquals(CuadreReparto.Falta(1L), cuadre)
        assertFalse(cuadre.puedeGuardarse)
        assertEquals("Faltan $0.01 por repartir.", RepartoViatico.mensaje(cuadre))
    }

    @Test
    fun rechazaUnaSumaQueSePasaDelTotal() {
        val cuadre = RepartoViatico.revisar(
            listOf(parte(1L, 6_000L), parte(2L, 4_050L)),
            totalCentavos = 10_000L,
        )
        assertEquals(CuadreReparto.Sobra(50L), cuadre)
        assertFalse(cuadre.puedeGuardarse)
        assertEquals("Sobran $0.50: baja alguna parte.", RepartoViatico.mensaje(cuadre))
    }

    @Test
    fun rechazaLaMismaActividadDosVeces() {
        val cuadre = RepartoViatico.revisar(
            listOf(parte(7L, 5_000L), parte(7L, 5_000L)),
            totalCentavos = 10_000L,
        )
        assertEquals(CuadreReparto.Duplicada(7L), cuadre)
        assertFalse(cuadre.puedeGuardarse)
    }

    @Test
    fun rechazaUnaParteSinImporte() {
        // Cuadraría de milagro sumando cero, pero una parte en cero es una
        // actividad que no carga nada: o se captura o se quita.
        val cuadre = RepartoViatico.revisar(
            listOf(parte(1L, 10_000L), parte(2L, 0L)),
            totalCentavos = 10_000L,
        )
        assertEquals(CuadreReparto.ParteSinImporte(2L), cuadre)
        assertFalse(cuadre.puedeGuardarse)
    }

    @Test
    fun sinMontoNoHayNadaQueRepartir() {
        val cuadre = RepartoViatico.revisar(listOf(parte(1L, 5_000L)), totalCentavos = 0L)
        assertEquals(CuadreReparto.SinTotal, cuadre)
        assertFalse(cuadre.puedeGuardarse)
    }

    // ── Acepta lo que sí cuadra ─────────────────────────────────────────────

    @Test
    fun aceptaLaSumaExacta() {
        val cuadre = RepartoViatico.revisar(
            listOf(parte(1L, 6_000L), parte(2L, 4_000L)),
            totalCentavos = 10_000L,
        )
        assertEquals(CuadreReparto.Cuadra, cuadre)
        assertTrue(cuadre.puedeGuardarse)
        assertNull(RepartoViatico.mensaje(cuadre))
    }

    @Test
    fun unaSolaParteQueCubreElTotalTambienCuadra() {
        val cuadre = RepartoViatico.revisar(listOf(parte(3L, 12_345L)), totalCentavos = 12_345L)
        assertEquals(CuadreReparto.Cuadra, cuadre)
    }

    @Test
    fun sinPartesNoHayRepartoYSeGuardaIgual() {
        // Lista vacía = deshacer el reparto; el servidor también lo admite.
        val cuadre = RepartoViatico.revisar(emptyList(), totalCentavos = 10_000L)
        assertEquals(CuadreReparto.SinReparto, cuadre)
        assertTrue(cuadre.puedeGuardarse)
    }

    /**
     * El caso exacto que motiva contar en centavos: `0.1 + 0.2 != 0.3` en coma
     * flotante, así que un reparto legítimo de $0.10 y $0.20 sobre un viático
     * de $0.30 sería rechazado si la suma se hiciera con `Double`.
     */
    @Test
    fun elCasoDeCeroUnoMasCeroDosCuadra() {
        val diez = Dinero.aApi(10L)
        val veinte = Dinero.aApi(20L)
        val treinta = Dinero.aApi(30L)
        assertTrue("el motivo de contar en centavos", diez + veinte != treinta)

        val partes = listOf(
            parte(1L, Dinero.parsearCentavos("0.10")!!),
            parte(2L, Dinero.parsearCentavos("0.20")!!),
        )
        val total = Dinero.parsearCentavos("0.30")!!
        assertEquals(CuadreReparto.Cuadra, RepartoViatico.revisar(partes, total))
    }

    @Test
    fun repartirEnTresNoPierdeNiInventaCentavos() {
        val trozos = RepartoViatico.repartirEnPartesIguales(10_000L, 3)
        assertEquals(listOf(3_334L, 3_333L, 3_333L), trozos)
        assertEquals(10_000L, trozos.sum())
    }

    @Test
    fun repartirEnPartesIgualesSiempreSumaElTotal() {
        // Los sobrantes van a las primeras partes; nunca se pierde un centavo.
        for (total in listOf(1L, 7L, 99L, 100L, 10_001L, 123_457L)) {
            for (cuantas in 1..7) {
                val trozos = RepartoViatico.repartirEnPartesIguales(total, cuantas)
                assertEquals("$total entre $cuantas", total, trozos.sum())
                assertEquals(cuantas, trozos.size)
            }
        }
    }

    // ── Cuadrar el resto ────────────────────────────────────────────────────

    @Test
    fun cuadrarElRestoLlenaLasPartesVaciasSinTocarLoTecleado() {
        val partes = listOf(parte(1L, 6_000L), parte(2L, 0L), parte(3L, 0L))
        val cuadrado = RepartoViatico.cuadrarResto(partes, totalCentavos = 10_000L)

        assertEquals(6_000L, cuadrado[0].centavos) // lo capturado no se mueve
        assertEquals(10_000L, cuadrado.sumOf { it.centavos })
        assertEquals(CuadreReparto.Cuadra, RepartoViatico.revisar(cuadrado, 10_000L))
    }

    @Test
    fun cuadrarElRestoConTodoCapturadoRepartelaDiferenciaEntreTodas() {
        val partes = listOf(parte(1L, 3_000L), parte(2L, 3_000L))
        val cuadrado = RepartoViatico.cuadrarResto(partes, totalCentavos = 10_000L)
        assertEquals(10_000L, cuadrado.sumOf { it.centavos })
        assertEquals(CuadreReparto.Cuadra, RepartoViatico.revisar(cuadrado, 10_000L))
    }

    @Test
    fun cuadrarElRestoBajaLoQueSobraSinDejarNingunaEnCero() {
        val partes = listOf(parte(1L, 9_000L), parte(2L, 5_000L))
        val cuadrado = RepartoViatico.cuadrarResto(partes, totalCentavos = 10_000L)
        assertEquals(10_000L, cuadrado.sumOf { it.centavos })
        assertTrue("ninguna parte queda en cero", cuadrado.all { it.centavos > 0L })
        assertEquals(CuadreReparto.Cuadra, RepartoViatico.revisar(cuadrado, 10_000L))
    }

    @Test
    fun cuadrarElRestoNoHaceNadaSiYaCuadra() {
        val partes = listOf(parte(1L, 6_000L), parte(2L, 4_000L))
        assertEquals(partes, RepartoViatico.cuadrarResto(partes, totalCentavos = 10_000L))
    }

    // ── Dinero: texto ⇄ centavos ────────────────────────────────────────────

    @Test
    fun parseaLoQueLaGenteEscribeDeVerdad() {
        assertEquals(123_456L, Dinero.parsearCentavos("1234.56"))
        assertEquals(123_456L, Dinero.parsearCentavos("1,234.56"))
        assertEquals(123_456L, Dinero.parsearCentavos("$1,234.56"))
        assertEquals(123_400L, Dinero.parsearCentavos("1234"))
        assertEquals(123_450L, Dinero.parsearCentavos("1234.5"))
        // Coma decimal del teclado latino, solo cuando no hay punto.
        assertEquals(123_456L, Dinero.parsearCentavos("1234,56"))
    }

    @Test
    fun rechazaImportesQueElServidorNoAceptaria() {
        assertNull("tres decimales", Dinero.parsearCentavos("10.123"))
        assertNull("letras", Dinero.parsearCentavos("mil pesos"))
        assertNull("vacío", Dinero.parsearCentavos("   "))
        assertNull("negativo", Dinero.parsearCentavos("-10.00"))
        assertNull("fuera de rango", Dinero.parsearCentavos("999999999.00"))
    }

    @Test
    fun formateaConMillaresYDosDecimales() {
        assertEquals("1,234.56", Dinero.formatear(123_456L))
        assertEquals("0.07", Dinero.formatear(7L))
        assertEquals("1,000,000.00", Dinero.formatear(100_000_000L))
        assertEquals("$1,234.56", Dinero.pesos(123_456L))
    }

    @Test
    fun elViajeDeIdaYVueltaAlApiNoPierdeCentavos() {
        // `aApi` divide entre 100 y el servidor vuelve a multiplicar y redondear
        // (`Math.round(n * 100)`); el error de coma flotante queda muy por
        // debajo de medio centavo, así que se recupera el entero exacto.
        for (centavos in listOf(1L, 7L, 10L, 20L, 30L, 999L, 123_456L, 99_999_999L)) {
            assertEquals(centavos, Math.round(Dinero.aApi(centavos) * 100.0))
        }
    }

    @Test
    fun sanitizarDejaEscribirSoloUnImporte() {
        assertEquals("1234", Dinero.sanitizarEntrada("1a2b3c4"))
        assertEquals("12.34", Dinero.sanitizarEntrada("12.34"))
        assertEquals("12.34", Dinero.sanitizarEntrada("12.3456")) // máximo dos decimales
        assertEquals("12.34", Dinero.sanitizarEntrada("12.34.56")) // un solo punto
        assertEquals("", Dinero.sanitizarEntrada(".")) // no empieza por punto
        assertEquals("12345678", Dinero.sanitizarEntrada("1234567890")) // tope de enteros
    }

    @Test
    fun loQueLaPantallaAceptaEsLoQueElServidorValida() {
        // Cerrar el círculo: texto tecleado → centavos → cuadre.
        val total = Dinero.parsearCentavos("1,000.00")!!
        val partes = listOf(
            parte(1L, Dinero.parsearCentavos("333.33")!!),
            parte(2L, Dinero.parsearCentavos("333.33")!!),
            parte(3L, Dinero.parsearCentavos("333.34")!!),
        )
        assertEquals(CuadreReparto.Cuadra, RepartoViatico.revisar(partes, total))

        val malo = partes.dropLast(1) + parte(3L, Dinero.parsearCentavos("333.33")!!)
        val cuadre = RepartoViatico.revisar(malo, total)
        assertEquals(CuadreReparto.Falta(1L), cuadre)
        assertNotNull(RepartoViatico.mensaje(cuadre))
    }
}
