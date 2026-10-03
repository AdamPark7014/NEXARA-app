package mx.nexara.mobile.nativeapp.ui.console.more

import mx.nexara.mobile.nativeapp.data.api.EmpaqueCodigoDto
import mx.nexara.mobile.nativeapp.data.api.ExistenciaCodigoDto
import mx.nexara.mobile.nativeapp.data.api.HerramientaPersonaDto
import mx.nexara.mobile.nativeapp.data.api.HerramientaPorCodigoDto
import mx.nexara.mobile.nativeapp.data.api.KitEscaneadoDto
import mx.nexara.mobile.nativeapp.data.api.PrestamoEscaneadoDto
import mx.nexara.mobile.nativeapp.data.api.ProductoCodigoDto
import mx.nexara.mobile.nativeapp.data.api.ProductoPorCodigoDto
import mx.nexara.mobile.nativeapp.data.api.StockAlmacenDto
import mx.nexara.mobile.nativeapp.ui.console.more.EscaneoRules.AccionHerramienta
import mx.nexara.mobile.nativeapp.ui.console.more.EscaneoRules.Movimiento
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class EscaneoRulesTest {
    private val existencias = listOf(
        ExistenciaCodigoDto(warehouseId = 1, almacen = "Matriz", cantidad = 5.0, reservado = 2.0),
        ExistenciaCodigoDto(warehouseId = 2, almacen = "Obra", cantidad = 0.0),
    )

    @Test
    fun salidaSoloDondeHayExistencia() {
        val opciones = EscaneoRules.almacenesPara(Movimiento.SALIDA, existencias, null)
        assertEquals(listOf(EscaneoRules.OpcionAlmacen(1, "Matriz")), opciones)
    }

    @Test
    fun entradaATodosLosAlmacenesOAlMenosLosDelProducto() {
        val todos = listOf(StockAlmacenDto(id = 1, name = "Matriz"), StockAlmacenDto(id = 3, code = "BOD"))
        assertEquals(
            listOf(EscaneoRules.OpcionAlmacen(1, "Matriz"), EscaneoRules.OpcionAlmacen(3, "BOD")),
            EscaneoRules.almacenesPara(Movimiento.ENTRADA, existencias, todos),
        )
        assertEquals(2, EscaneoRules.almacenesPara(Movimiento.ENTRADA, existencias, emptyList()).size)
    }

    @Test
    fun totalesYDisponible() {
        assertEquals(5.0, EscaneoRules.totalExistencia(existencias), 0.0)
        assertEquals(3.0, EscaneoRules.disponible(existencias[0]), 0.0)
        assertEquals(0.0, EscaneoRules.disponible(ExistenciaCodigoDto(cantidad = 1.0, reservado = 4.0)), 0.0)
    }

    @Test
    fun unidadDeCajaODeProducto() {
        val caja = ProductoPorCodigoDto(match = "empaque", packaging = EmpaqueCodigoDto(nombre = "Caja", piezasPorUnidad = 12.0))
        assertEquals("Caja (12 pz c/u)", EscaneoRules.unidad(caja))
        val pieza = ProductoPorCodigoDto(match = "producto", product = ProductoCodigoDto(unitName = "metro"))
        assertEquals("metro", EscaneoRules.unidad(pieza))
        assertEquals("piezas", EscaneoRules.unidad(ProductoPorCodigoDto(match = "producto")))
    }

    @Test
    fun validacionDelMovimiento() {
        assertEquals("Escribe una cantidad mayor a cero.", EscaneoRules.errorMovimiento(null, 1, null, Movimiento.ENTRADA))
        assertEquals("Elige de qué almacén sale.", EscaneoRules.errorMovimiento(2.0, null, null, Movimiento.SALIDA))
        assertEquals("No alcanza: en ese almacén hay 3.", EscaneoRules.errorMovimiento(4.0, 1, 3.0, Movimiento.SALIDA))
        assertNull(EscaneoRules.errorMovimiento(4.0, 1, 3.0, Movimiento.ENTRADA))
        assertEquals(
            "Entrada registrada: 2 piezas de Cable UTP.",
            EscaneoRules.avisoMovimiento(Movimiento.ENTRADA, 2.0, "piezas", "Cable UTP"),
        )
    }

    @Test
    fun accionSegunElPrestamo() {
        fun con(status: String?) = HerramientaPorCodigoDto(prestamo = status?.let { PrestamoEscaneadoDto(id = 1, status = it) })
        assertEquals(AccionHerramienta.ENTREGAR, EscaneoRules.accion(con("APPROVED")))
        assertEquals(AccionHerramienta.RECIBIR, EscaneoRules.accion(con("IN_USE")))
        assertNull(EscaneoRules.accion(con("PENDING")))
        assertNull(EscaneoRules.accion(con(null)))
    }

    @Test
    fun quienLaTiene() {
        val prestada = HerramientaPorCodigoDto(
            prestamo = PrestamoEscaneadoDto(status = "IN_USE", usuario = HerramientaPersonaDto(nombre = "Luis Mora")),
        )
        assertEquals("La tiene Luis Mora", EscaneoRules.quienLaTiene(prestada))
        val enKit = HerramientaPorCodigoDto(kit = KitEscaneadoDto(user = HerramientaPersonaDto(nombre = "Ana")))
        assertEquals("En el kit de Ana", EscaneoRules.quienLaTiene(enKit))
        assertNull(EscaneoRules.quienLaTiene(HerramientaPorCodigoDto()))
    }

    @Test
    fun sinPermisoSeExplica() {
        val generico = EscaneoRules.textoSinPermiso("registrar movimientos de almacén", "No tienes permisos para esta acción")
        assertEquals(
            "Tu usuario no tiene permiso para registrar movimientos de almacén. Pídele a un administrador que te lo active.",
            generico,
        )
        val propio = EscaneoRules.textoSinPermiso("entregar herramientas", "Solo almacén gestiona herramientas.")
        assertTrue(propio.startsWith("Solo almacén gestiona herramientas. Tu usuario no tiene permiso"))
    }
}
