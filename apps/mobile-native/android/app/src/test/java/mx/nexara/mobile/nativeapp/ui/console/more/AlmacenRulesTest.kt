package mx.nexara.mobile.nativeapp.ui.console.more

import mx.nexara.mobile.nativeapp.data.api.StockAlmacenDto
import mx.nexara.mobile.nativeapp.data.api.StockLevelDto
import mx.nexara.mobile.nativeapp.data.api.StockProductoDto
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * Lo de almacén que se puede romper sin que nadie se entere: los `Decimal` de
 * Prisma, que llegan como texto, y la regla de «bajo mínimo», que tiene que ser
 * exactamente la del servidor o la app avisaría de cosas distintas que la web.
 */
class AlmacenRulesTest {

    private fun nivel(
        id: Long = 1L,
        cantidad: String? = "10",
        reorden: String? = "5",
        reservado: String? = null,
        producto: String? = "Cable UTP",
        sku: String? = "CBL-1",
        almacen: String? = "Bodega central",
    ) = StockLevelDto(
        id = id,
        quantity = cantidad,
        reorderPoint = reorden,
        reservedQty = reservado,
        product = StockProductoDto(id = id, name = producto, sku = sku),
        warehouse = StockAlmacenDto(id = 1L, code = "BC", name = almacen),
    )

    // ── Decimales de Prisma ──────────────────────────────────────────────────

    @Test
    fun decimalsArriveAsTextAndAreUnderstood() {
        assertEquals(12.5, AlmacenRules.numero("12.5")!!, 0.0001)
        assertEquals(0.0, AlmacenRules.numero("0")!!, 0.0001)
        assertEquals(-3.0, AlmacenRules.numero("-3")!!, 0.0001)
        assertEquals(1000.0, AlmacenRules.numero(" 1000 ")!!, 0.0001)
    }

    @Test
    fun whatIsNotANumberIsNotAZero() {
        assertNull(AlmacenRules.numero(null))
        assertNull(AlmacenRules.numero(""))
        assertNull(AlmacenRules.numero("   "))
        assertNull(AlmacenRules.numero("null"))
        assertNull(AlmacenRules.numero("doce"))
    }

    // ── Bajo mínimo: la misma regla que `getLowStockAlerts` ──────────────────

    @Test
    fun lowStockIsQuantityAtOrBelowAPositiveReorderPoint() {
        assertTrue(AlmacenRules.bajoMinimo(nivel(cantidad = "5", reorden = "5")))
        assertTrue(AlmacenRules.bajoMinimo(nivel(cantidad = "2", reorden = "5")))
        assertFalse(AlmacenRules.bajoMinimo(nivel(cantidad = "6", reorden = "5")))
    }

    /** Sin punto de reorden nadie dijo cuánto es poco: no se avisa de nada. */
    @Test
    fun withoutAReorderPointNothingIsLowStock() {
        assertFalse(AlmacenRules.bajoMinimo(nivel(cantidad = "0", reorden = "0")))
        assertFalse(AlmacenRules.bajoMinimo(nivel(cantidad = "0", reorden = null)))
        assertEquals("sin mínimo fijado", AlmacenRules.detalleTexto(nivel(cantidad = "3", reorden = null)))
    }

    @Test
    fun runningOutIsNotTheSameAsBeingLow() {
        assertTrue(AlmacenRules.agotado(nivel(cantidad = "0")))
        assertTrue(AlmacenRules.agotado(nivel(cantidad = "-1")))
        assertFalse(AlmacenRules.agotado(nivel(cantidad = "1")))
        // Sin cantidad legible se trata como agotado: es lo prudente.
        assertTrue(AlmacenRules.agotado(nivel(cantidad = null)))
    }

    // ── Disponible ───────────────────────────────────────────────────────────

    @Test
    fun availableSubtractsWhatIsReserved() {
        assertEquals(7.0, AlmacenRules.disponible(nivel(cantidad = "10", reservado = "3"))!!, 0.0001)
        // Sin reservado, lo disponible es todo.
        assertEquals(10.0, AlmacenRules.disponible(nivel(cantidad = "10", reservado = null))!!, 0.0001)
        assertNull(AlmacenRules.disponible(nivel(cantidad = null)))
    }

    // ── Formato ──────────────────────────────────────────────────────────────

    @Test
    fun numbersAreWrittenWithoutFakeDecimals() {
        assertEquals("12", AlmacenRules.formato(12.0))
        assertEquals("12.5", AlmacenRules.formato(12.5))
        assertEquals("—", AlmacenRules.formato(null))
        assertEquals("—", AlmacenRules.formato(Double.NaN))
    }

    // ── Barra ────────────────────────────────────────────────────────────────

    @Test
    fun theBarComparesStockAgainstTheMinimumAndNeverOverflows() {
        assertEquals(0.4f, AlmacenRules.progreso(nivel(cantidad = "2", reorden = "5"))!!, 0.0001f)
        assertEquals(1f, AlmacenRules.progreso(nivel(cantidad = "50", reorden = "5"))!!, 0.0001f)
        assertEquals(0f, AlmacenRules.progreso(nivel(cantidad = "0", reorden = "5"))!!, 0.0001f)
        // Sin mínimo no hay contra qué comparar: la barra no se dibuja.
        assertNull(AlmacenRules.progreso(nivel(reorden = "0")))
        assertNull(AlmacenRules.progreso(nivel(reorden = null)))
    }

    // ── Textos ───────────────────────────────────────────────────────────────

    @Test
    fun theTitleFallsBackToTheSkuAndThenSaysSo() {
        assertEquals("Cable UTP", AlmacenRules.titulo(nivel()))
        assertEquals("CBL-1", AlmacenRules.titulo(nivel(producto = null)))
        assertEquals("Producto sin nombre", AlmacenRules.titulo(nivel(producto = null, sku = null)))
    }

    @Test
    fun theLocationLineJoinsWhatExists() {
        assertEquals("CBL-1 · Bodega central", AlmacenRules.ubicacionTexto(nivel()))
        assertEquals(
            "Sin almacén asignado",
            AlmacenRules.ubicacionTexto(nivel(sku = null, almacen = null).copy(warehouse = null)),
        )
    }

    @Test
    fun theDetailLineOnlySaysWhatItKnows() {
        assertEquals("mínimo 5", AlmacenRules.detalleTexto(nivel(cantidad = "10", reorden = "5")))
        assertEquals(
            "mínimo 5 · 3 apartado · 7 libre",
            AlmacenRules.detalleTexto(nivel(cantidad = "10", reorden = "5", reservado = "3")),
        )
    }

    // ── Orden y filtro ───────────────────────────────────────────────────────

    /** La primera pantalla tiene que ser ya la lista de compras. */
    @Test
    fun urgencySortsEmptyFirstThenClosestToTheMinimum() {
        val lista = listOf(
            nivel(id = 1, cantidad = "4", reorden = "5", producto = "Casi"),
            nivel(id = 2, cantidad = "0", reorden = "5", producto = "Agotado"),
            nivel(id = 3, cantidad = "1", reorden = "5", producto = "Poco"),
        )
        assertEquals(
            listOf("Agotado", "Poco", "Casi"),
            AlmacenRules.ordenarPorUrgencia(lista).map { AlmacenRules.titulo(it) },
        )
    }

    @Test
    fun theFullInventoryIsAlphabetical() {
        val lista = listOf(
            nivel(id = 1, producto = "Zapata"),
            nivel(id = 2, producto = "Ancla"),
        )
        assertEquals(
            listOf("Ancla", "Zapata"),
            AlmacenRules.ordenarPorNombre(lista).map { AlmacenRules.titulo(it) },
        )
    }

    @Test
    fun searchLooksAtProductSkuAndWarehouse() {
        val lista = listOf(
            nivel(id = 1, producto = "Cable UTP", sku = "CBL-1", almacen = "Bodega central"),
            nivel(id = 2, producto = "Switch", sku = "SW-9", almacen = "Sucursal norte"),
        )
        assertEquals(1, AlmacenRules.filtrar(lista, "cable").size)
        assertEquals(1, AlmacenRules.filtrar(lista, "sw-9").size)
        assertEquals(1, AlmacenRules.filtrar(lista, "norte").size)
        assertEquals(2, AlmacenRules.filtrar(lista, "  ").size)
        assertTrue(AlmacenRules.filtrar(lista, "zzz").isEmpty())
    }

    @Test
    fun theAlertSummaryOnlyAppearsWhenThereIsSomethingToSay() {
        assertNull(AlmacenRules.resumenAlertas(emptyList()))
        val mezcla = listOf(
            nivel(id = 1, cantidad = "0", reorden = "5"),
            nivel(id = 2, cantidad = "2", reorden = "5"),
            nivel(id = 3, cantidad = "1", reorden = "5"),
        )
        assertEquals("1 sin existencia · 2 bajo mínimo", AlmacenRules.resumenAlertas(mezcla))
    }
}
