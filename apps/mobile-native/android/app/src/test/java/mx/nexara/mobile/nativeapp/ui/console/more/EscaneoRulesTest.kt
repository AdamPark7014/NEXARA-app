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
import kotlinx.coroutines.runBlocking
import mx.nexara.mobile.nativeapp.ui.console.more.EscaneoRules.AccionHerramienta
import mx.nexara.mobile.nativeapp.ui.console.more.EscaneoRules.Fuente
import mx.nexara.mobile.nativeapp.ui.console.more.EscaneoRules.Movimiento
import mx.nexara.mobile.nativeapp.ui.console.more.EscaneoRules.ResultadoEscaneo as Resultado
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

    // ── Un solo escáner para herramienta y artículo ───────────────────────────

    private class Http(val code: Int) : Exception("HTTP $code")

    private val codigoHttp: (Throwable) -> Int? = { (it as? Http)?.code }

    /** Lanza un resolver con búsquedas falsas y anota qué se pidió, en orden. */
    private fun resolver(
        valor: String,
        puedeAlmacen: Boolean,
        herramienta: (String) -> HerramientaPorCodigoDto = { throw Http(404) },
        articulo: (String) -> ProductoPorCodigoDto = { throw Http(404) },
    ): Pair<EscaneoRules.ResultadoEscaneo, List<String>> {
        val pedidos = mutableListOf<String>()
        val r = runBlocking {
            EscaneoRules.resolver(
                valor = valor,
                puedeAlmacen = puedeAlmacen,
                buscarHerramienta = { pedidos += "herramienta:$it"; herramienta(it) },
                buscarArticulo = { pedidos += "articulo:$it"; articulo(it) },
                codigoHttp = codigoHttp,
            )
        }
        return r to pedidos
    }

    @Test
    fun ordenDeBusquedaSegunFormaYAlmacen() {
        assertEquals(listOf(Fuente.HERRAMIENTA, Fuente.ARTICULO), EscaneoRules.ordenDeBusqueda("mul-12345", true))
        assertEquals(listOf(Fuente.ARTICULO, Fuente.HERRAMIENTA), EscaneoRules.ordenDeBusqueda("7501055363025", true))
        // Sin Almacén solo herramientas, tenga la forma que tenga.
        assertEquals(listOf(Fuente.HERRAMIENTA), EscaneoRules.ordenDeBusqueda("MUL-12345", false))
        assertEquals(listOf(Fuente.HERRAMIENTA), EscaneoRules.ordenDeBusqueda("7501055363025", false))
    }

    @Test
    fun validaComoLoPrimeroQueSeBusca() {
        // Con Almacén, un UPC con el verificador mal se rechaza como artículo.
        assertEquals(
            "Parece un UPC/EAN pero el dígito verificador no cuadra. Vuelve a escanearlo.",
            EscaneoRules.motivoInvalido("750105536302", true),
        )
        // Sin Almacén se valida como etiqueta (como hoy): eso no la rechaza.
        assertNull(EscaneoRules.motivoInvalido("750105536302", false))
        assertNull(EscaneoRules.motivoInvalido("MUL-12345", true))
        assertEquals("Escanea o escribe la etiqueta de la herramienta", EscaneoRules.motivoInvalido(" ", false))
    }

    @Test
    fun etiquetaDeHerramientaSeBuscaPrimeroComoHerramienta() {
        val herramienta = HerramientaPorCodigoDto(codigo = "MUL-12345")
        val (r, pedidos) = resolver("mul-12345", puedeAlmacen = true, herramienta = { herramienta })
        assertEquals(Resultado.Herramienta(herramienta), r)
        assertEquals(listOf("herramienta:MUL-12345"), pedidos)
    }

    @Test
    fun etiquetaQueNoEsHerramientaSeBuscaComoArticulo() {
        val articulo = ProductoPorCodigoDto(codigoBarras = "CAB-001")
        val (r, pedidos) = resolver("CAB-001", puedeAlmacen = true, articulo = { articulo })
        assertEquals(Resultado.Articulo(articulo), r)
        assertEquals(listOf("herramienta:CAB-001", "articulo:CAB-001"), pedidos)
    }

    @Test
    fun codigoDeBarrasSeBuscaPrimeroComoArticuloYLuegoComoHerramienta() {
        val articulo = ProductoPorCodigoDto(codigoBarras = "7501055363025")
        val (r1, p1) = resolver("7501055363025", puedeAlmacen = true, articulo = { articulo })
        assertEquals(Resultado.Articulo(articulo), r1)
        assertEquals(listOf("articulo:7501055363025"), p1)

        // Herramienta con el código del fabricante: no se ofrece darla de alta como artículo.
        val herramienta = HerramientaPorCodigoDto(codigo = "7501055363025")
        val (r2, p2) = resolver("7501055363025", puedeAlmacen = true, herramienta = { herramienta })
        assertEquals(Resultado.Herramienta(herramienta), r2)
        assertEquals(listOf("articulo:7501055363025", "herramienta:7501055363025"), p2)
    }

    @Test
    fun noEncontradoConAlmacenOfreceDarDeAlta() {
        val (r, pedidos) = resolver(" 7501055363025\n", puedeAlmacen = true)
        assertEquals(Resultado.NoEncontrado("7501055363025", puedeDarDeAlta = true), r)
        assertEquals(2, pedidos.size)
        // También una etiqueta que no existe en ningún lado (puede ser una clave interna nueva).
        val (r2, _) = resolver("abc-77", puedeAlmacen = true)
        assertEquals(Resultado.NoEncontrado("abc-77", puedeDarDeAlta = true), r2)
    }

    @Test
    fun noEncontradoSinAlmacenSoloDiceQueNoEsHerramienta() {
        val (r, pedidos) = resolver("7501055363025", puedeAlmacen = false)
        assertEquals(Resultado.NoEncontrado("7501055363025", puedeDarDeAlta = false), r)
        assertEquals(listOf("herramienta:7501055363025"), pedidos)
        assertEquals("No es una herramienta registrada.", EscaneoRules.TEXTO_NO_ES_HERRAMIENTA)
    }

    @Test
    fun sinPermisoDeArticulosNoOfreceAlta() {
        val (r, _) = resolver("7501055363025", puedeAlmacen = true, articulo = { throw Http(403) })
        assertEquals(Resultado.NoEncontrado("7501055363025", puedeDarDeAlta = false), r)
    }

    @Test
    fun sinPermisoEnTodoSeLanzaElPermiso() {
        val error = runCatching {
            resolver("7501055363025", puedeAlmacen = true, herramienta = { throw Http(403) }, articulo = { throw Http(403) })
        }.exceptionOrNull()
        assertEquals(403, (error as? Http)?.code)
    }

    @Test
    fun unFalloDeRedNoSeConfundeConNoEncontrado() {
        val error = runCatching {
            resolver("MUL-12345", puedeAlmacen = true, herramienta = { throw Http(503) })
        }.exceptionOrNull()
        assertEquals(503, (error as? Http)?.code)
    }

    @Test
    fun titulosDelEscaner() {
        assertEquals("Escanear artículo o herramienta", EscaneoRules.tituloEscaner(enAlmacen = true, puedeAlmacen = true))
        assertEquals("Escanear herramienta o artículo", EscaneoRules.tituloEscaner(enAlmacen = false, puedeAlmacen = true))
        assertEquals("Escanear herramienta", EscaneoRules.tituloEscaner(enAlmacen = false, puedeAlmacen = false))
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
