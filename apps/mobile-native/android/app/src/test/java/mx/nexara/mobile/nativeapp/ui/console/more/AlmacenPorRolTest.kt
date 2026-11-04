package mx.nexara.mobile.nativeapp.ui.console.more

import com.squareup.moshi.Moshi
import com.squareup.moshi.Types
import com.squareup.moshi.kotlin.reflect.KotlinJsonAdapterFactory
import mx.nexara.mobile.nativeapp.data.api.MovimientoStockDto
import mx.nexara.mobile.nativeapp.data.api.StockAlmacenDto
import mx.nexara.mobile.nativeapp.data.api.StockPersonaDto
import mx.nexara.mobile.nativeapp.data.api.StockProductoDto
import mx.nexara.mobile.nativeapp.ui.console.more.AlmacenRules.Perfil
import mx.nexara.mobile.nativeapp.ui.console.more.AlmacenRules.Vista
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

/** Dirección consulta y ve quién movió qué; Iván opera con el escáner; los demás consultan. */
class AlmacenPorRolTest {

    private fun movimiento(
        tipo: String? = "RECEIPT",
        desde: StockAlmacenDto? = null,
        hacia: StockAlmacenDto? = null,
        quien: String? = "Iván Camargo",
        producto: String? = "Cable UTP",
        sku: String? = null,
    ) = MovimientoStockDto(
        id = 1L,
        movementNumber = "MOV-1",
        type = tipo,
        quantity = "12",
        product = StockProductoDto(name = producto, sku = sku),
        fromWarehouse = desde,
        toWarehouse = hacia,
        createdBy = quien?.let { StockPersonaDto(nombre = it) },
    )

    private val central = StockAlmacenDto(name = "Central", code = "ALM-1")
    private val obra = StockAlmacenDto(name = "Obra", code = "ALM-2")

    @Test
    fun `direccion gana aunque traiga el permiso de operar`() {
        assertEquals(Perfil.DIRECCION, AlmacenRules.perfil(esDireccion = true, opera = true))
        assertEquals(Perfil.OPERA, AlmacenRules.perfil(esDireccion = false, opera = true))
        assertEquals(Perfil.CONSULTA, AlmacenRules.perfil(esDireccion = false, opera = false))
    }

    @Test
    fun `el escaner es solo de quien opera`() {
        assertTrue(AlmacenRules.muestraEscaner(Perfil.OPERA))
        assertFalse(AlmacenRules.muestraEscaner(Perfil.DIRECCION))
        assertFalse(AlmacenRules.muestraEscaner(Perfil.CONSULTA))
    }

    @Test
    fun `los movimientos no son para quien solo consulta`() {
        assertEquals(listOf(Vista.BAJO_MINIMO, Vista.TODO), AlmacenRules.vistas(Perfil.CONSULTA))
        assertEquals(listOf(Vista.BAJO_MINIMO, Vista.TODO, Vista.MOVIMIENTOS), AlmacenRules.vistas(Perfil.DIRECCION))
        assertEquals(listOf(Vista.BAJO_MINIMO, Vista.TODO, Vista.MOVIMIENTOS), AlmacenRules.vistas(Perfil.OPERA))
    }

    @Test
    fun `el tipo de movimiento se dice como en el kardex`() {
        assertEquals("Entrada", AlmacenRules.etiquetaMovimiento("RECEIPT"))
        assertEquals("Salida", AlmacenRules.etiquetaMovimiento(" dispatch "))
        assertEquals("Traspaso", AlmacenRules.etiquetaMovimiento("TRANSFER"))
        assertEquals("Merma", AlmacenRules.etiquetaMovimiento("SCRAP"))
        assertEquals("Movimiento", AlmacenRules.etiquetaMovimiento("OTRO"))
        assertEquals("Movimiento", AlmacenRules.etiquetaMovimiento(null))
    }

    @Test
    fun `lo que entra se distingue de lo que sale`() {
        assertEquals(true, AlmacenRules.entra("RECEIPT"))
        assertEquals(true, AlmacenRules.entra("RETURN"))
        assertEquals(false, AlmacenRules.entra("DISPATCH"))
        assertEquals(false, AlmacenRules.entra("SCRAP"))
        assertNull(AlmacenRules.entra("TRANSFER"))
        assertNull(AlmacenRules.entra(null))
    }

    @Test
    fun `de donde a donde, con lo que traiga`() {
        assertEquals("De Central a Obra", AlmacenRules.rutaMovimiento(movimiento(desde = central, hacia = obra)))
        assertEquals("A Central", AlmacenRules.rutaMovimiento(movimiento(hacia = central)))
        assertEquals("De Obra", AlmacenRules.rutaMovimiento(movimiento(desde = obra)))
        assertEquals("A ALM-3", AlmacenRules.rutaMovimiento(movimiento(hacia = StockAlmacenDto(code = "ALM-3"))))
        assertNull(AlmacenRules.rutaMovimiento(movimiento()))
    }

    @Test
    fun `quien lo hizo se dice o se admite que no se sabe`() {
        assertEquals("Lo hizo Iván Camargo", AlmacenRules.quienLoHizo(movimiento()))
        assertEquals("Sin persona registrada", AlmacenRules.quienLoHizo(movimiento(quien = null)))
        assertEquals("Sin persona registrada", AlmacenRules.quienLoHizo(movimiento(quien = "  ")))
    }

    @Test
    fun `el titulo cae al sku y luego a una frase`() {
        assertEquals("Cable UTP", AlmacenRules.tituloMovimiento(movimiento()))
        assertEquals("SKU-1", AlmacenRules.tituloMovimiento(movimiento(producto = null, sku = "SKU-1")))
        assertEquals("Producto sin nombre", AlmacenRules.tituloMovimiento(MovimientoStockDto()))
    }

    @Test
    fun `se busca por producto, persona o almacen`() {
        val a = movimiento(producto = "Cable UTP", quien = "Iván", hacia = central)
        val b = movimiento(producto = "Cámara", quien = "Joan", desde = obra)
        val lista = listOf(a, b)
        assertEquals(lista, AlmacenRules.filtrarMovimientos(lista, "  "))
        assertEquals(listOf(a), AlmacenRules.filtrarMovimientos(lista, "cable"))
        assertEquals(listOf(b), AlmacenRules.filtrarMovimientos(lista, "JOAN"))
        assertEquals(listOf(b), AlmacenRules.filtrarMovimientos(lista, "obra"))
        assertTrue(AlmacenRules.filtrarMovimientos(lista, "nada").isEmpty())
    }

    @Test
    fun `el vacio dice que sigue segun quien mira`() {
        assertTrue(AlmacenRules.vacioSinExistencias(Perfil.OPERA).contains("Escanea"))
        assertTrue(AlmacenRules.vacioSinExistencias(Perfil.DIRECCION).contains("Iván"))
        assertFalse(AlmacenRules.vacioSinExistencias(Perfil.CONSULTA).contains("Escanea"))
        assertTrue(AlmacenRules.vacioMovimientos(Perfil.OPERA).contains("escáner"))
        assertTrue(AlmacenRules.vacioMovimientos(Perfil.DIRECCION).contains("quién"))
    }

    @Test
    fun `el pie no le ofrece el escaner a quien no lo tiene`() {
        assertTrue(AlmacenRules.limite(Perfil.DIRECCION).startsWith("Solo lectura"))
        assertTrue(AlmacenRules.limite(Perfil.OPERA).contains("escáner"))
        assertTrue(AlmacenRules.limite(Perfil.CONSULTA).startsWith("Solo consulta"))
        assertFalse(AlmacenRules.limite(Perfil.CONSULTA).contains("escáner"))
        assertFalse(AlmacenRules.limite(Perfil.DIRECCION).contains("escáner"))
    }

    @Test
    fun `la cantidad llega como numero o como texto`() {
        val moshi = Moshi.Builder().add(KotlinJsonAdapterFactory()).build()
        val tipo = Types.newParameterizedType(List::class.java, MovimientoStockDto::class.java)
        val lista = moshi.adapter<List<MovimientoStockDto>>(tipo).fromJson(
            """[{"id":1,"type":"RECEIPT","quantity":"12.5","createdBy":{"id":3,"nombre":"Iván"},"lot":null},
                {"id":2,"type":"DISPATCH","quantity":4,"product":{"id":1,"name":"Cable","sku":"C-1"}}]""",
        ).orEmpty()
        assertEquals("12.5", AlmacenRules.formato(AlmacenRules.numero(lista[0].quantity)))
        assertEquals("4", AlmacenRules.formato(AlmacenRules.numero(lista[1].quantity)))
        assertEquals("Lo hizo Iván", AlmacenRules.quienLoHizo(lista[0]))
    }
}
