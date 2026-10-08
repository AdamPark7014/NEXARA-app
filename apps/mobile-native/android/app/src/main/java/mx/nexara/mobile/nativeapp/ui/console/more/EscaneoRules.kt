package mx.nexara.mobile.nativeapp.ui.console.more

import mx.nexara.mobile.nativeapp.data.api.ExistenciaCodigoDto
import mx.nexara.mobile.nativeapp.data.api.HerramientaPorCodigoDto
import mx.nexara.mobile.nativeapp.data.api.ProductoPorCodigoDto
import mx.nexara.mobile.nativeapp.data.api.StockAlmacenDto
import mx.nexara.mobile.nativeapp.ui.common.CodigoBarrasRules

/**
 * Reglas puras del escáner de Almacén y Herramientas: qué se busca primero, qué
 * movimiento se ofrece, en qué almacén, en qué unidad, qué acción tiene una
 * herramienta escaneada y cómo se explica un 403. Se prueban en la JVM.
 */
object EscaneoRules {

    // ── Un solo escáner para herramienta y artículo ───────────────────────────

    /** Dónde se busca un código: etiqueta de herramienta o artículo de almacén. */
    enum class Fuente { HERRAMIENTA, ARTICULO }

    /** Lo que sale de escanear, se lea desde Almacén o desde Herramientas. */
    sealed interface ResultadoEscaneo {
        data class Herramienta(val r: HerramientaPorCodigoDto) : ResultadoEscaneo
        data class Articulo(val r: ProductoPorCodigoDto) : ResultadoEscaneo

        /** Ni herramienta ni artículo. [puedeDarDeAlta]: ofrecer el alta de artículo con ese código. */
        data class NoEncontrado(val codigo: String, val puedeDarDeAlta: Boolean) : ResultadoEscaneo
    }

    const val TEXTO_NO_ES_HERRAMIENTA = "No es una herramienta registrada."

    /**
     * Qué se busca y en qué orden. Quien no puede abrir Almacén solo busca
     * herramientas, como siempre. Quien sí: forma de etiqueta (`MUL-12345`) →
     * herramienta y luego artículo; cualquier otro código → artículo y luego
     * herramienta (una herramienta puede traer el código de barras del fabricante,
     * y sin esa segunda búsqueda se ofrecería darla de alta como artículo).
     */
    fun ordenDeBusqueda(valor: String?, puedeAlmacen: Boolean): List<Fuente> = when {
        !puedeAlmacen -> listOf(Fuente.HERRAMIENTA)
        CodigoBarrasRules.esFormaEtiquetaHerramienta(valor) -> listOf(Fuente.HERRAMIENTA, Fuente.ARTICULO)
        else -> listOf(Fuente.ARTICULO, Fuente.HERRAMIENTA)
    }

    /** Por qué no se puede buscar; null si se puede. Se valida como lo primero que se va a buscar. */
    fun motivoInvalido(valor: String?, puedeAlmacen: Boolean): String? =
        when (ordenDeBusqueda(valor, puedeAlmacen).first()) {
            Fuente.HERRAMIENTA -> CodigoBarrasRules.motivoEtiquetaInvalida(valor)
            Fuente.ARTICULO -> CodigoBarrasRules.motivoInvalido(valor)
        }

    /** El código tal como lo espera cada búsqueda: la etiqueta en mayúsculas, el artículo tal cual. */
    fun codigoPara(fuente: Fuente, valor: String?): String = when (fuente) {
        Fuente.HERRAMIENTA -> CodigoBarrasRules.normalizarEtiquetaHerramienta(valor)
        Fuente.ARTICULO -> CodigoBarrasRules.limpiar(valor)
    }

    /**
     * Busca [valor] en el orden de [ordenDeBusqueda]. Un 404 pasa a la siguiente
     * búsqueda; un 403 también (p. ej. alguien de almacén sin permiso de
     * herramientas), salvo que todas den 403: entonces el problema es el permiso y
     * se lanza ese error. Cualquier otro fallo (red, 5xx) se lanza tal cual.
     *
     * [codigoHttp] saca el código HTTP de un error (null si no es HTTP); se recibe
     * de fuera para que esto se pruebe sin Retrofit.
     */
    suspend fun resolver(
        valor: String,
        puedeAlmacen: Boolean,
        buscarHerramienta: suspend (String) -> HerramientaPorCodigoDto,
        buscarArticulo: suspend (String) -> ProductoPorCodigoDto,
        codigoHttp: (Throwable) -> Int?,
    ): ResultadoEscaneo {
        val orden = ordenDeBusqueda(valor, puedeAlmacen)
        var primerProhibido: Exception? = null
        var noEncontrados = 0
        var articuloProhibido = false
        for (fuente in orden) {
            try {
                val codigo = codigoPara(fuente, valor)
                return when (fuente) {
                    Fuente.HERRAMIENTA -> ResultadoEscaneo.Herramienta(buscarHerramienta(codigo))
                    Fuente.ARTICULO -> ResultadoEscaneo.Articulo(buscarArticulo(codigo))
                }
            } catch (e: Exception) {
                when (codigoHttp(e)) {
                    404 -> noEncontrados++
                    403 -> {
                        if (primerProhibido == null) primerProhibido = e
                        if (fuente == Fuente.ARTICULO) articuloProhibido = true
                    }
                    else -> throw e
                }
            }
        }
        if (noEncontrados == 0 && primerProhibido != null) throw primerProhibido
        val buscaArticulo = Fuente.ARTICULO in orden
        return ResultadoEscaneo.NoEncontrado(
            codigo = codigoPara(if (buscaArticulo) Fuente.ARTICULO else Fuente.HERRAMIENTA, valor),
            puedeDarDeAlta = buscaArticulo && !articuloProhibido && CodigoBarrasRules.motivoInvalido(valor) == null,
        )
    }

    /** Título del escáner según la pantalla y si la persona puede abrir Almacén. */
    fun tituloEscaner(enAlmacen: Boolean, puedeAlmacen: Boolean): String = when {
        enAlmacen -> "Escanear artículo o herramienta"
        puedeAlmacen -> "Escanear herramienta o artículo"
        else -> "Escanear herramienta"
    }

    fun subtituloEscaner(enAlmacen: Boolean, puedeAlmacen: Boolean): String =
        if (enAlmacen || puedeAlmacen) {
            "Lee el código de barras o la etiqueta (o escríbelo): de un artículo ves existencias y " +
                "registras entradas o salidas; de una herramienta, quién la tiene."
        } else {
            "Lee la etiqueta NEXARA de la herramienta (o escribe su código) para ver quién la tiene."
        }

    enum class Movimiento(val api: String, val etiqueta: String, val verbo: String) {
        ENTRADA("RECEIPT", "Entrada", "Entrada registrada"),
        SALIDA("DISPATCH", "Salida", "Salida registrada"),
    }

    data class OpcionAlmacen(val id: Long, val nombre: String)

    /** Lo que hay en todos los almacenes (sin restar lo reservado). */
    fun totalExistencia(existencias: List<ExistenciaCodigoDto>?): Double =
        existencias.orEmpty().sumOf { it.cantidad ?: 0.0 }

    /** Disponible de un renglón: cantidad menos reservado, nunca negativo. */
    fun disponible(e: ExistenciaCodigoDto): Double =
        ((e.cantidad ?: 0.0) - (e.reservado ?: 0.0)).coerceAtLeast(0.0)

    /**
     * Almacenes que se ofrecen para el movimiento. Salida: solo donde hay existencia
     * (sacar de donde no hay da 400). Entrada: todos los de la empresa; si no se
     * pudieron leer, al menos los que ya tienen este producto.
     */
    fun almacenesPara(
        movimiento: Movimiento,
        existencias: List<ExistenciaCodigoDto>?,
        almacenes: List<StockAlmacenDto>?,
    ): List<OpcionAlmacen> {
        val conProducto = existencias.orEmpty().mapNotNull { e ->
            val id = e.warehouseId ?: return@mapNotNull null
            Triple(id, e.almacen?.trim().orEmpty().ifEmpty { "Almacén $id" }, e.cantidad ?: 0.0)
        }
        return when (movimiento) {
            Movimiento.SALIDA -> conProducto.filter { it.third > 0 }.map { OpcionAlmacen(it.first, it.second) }
            Movimiento.ENTRADA -> {
                val todos = almacenes.orEmpty().mapNotNull { a ->
                    val id = a.id ?: return@mapNotNull null
                    OpcionAlmacen(id, a.name?.trim().orEmpty().ifEmpty { a.code?.trim().orEmpty().ifEmpty { "Almacén $id" } })
                }
                todos.ifEmpty { conProducto.map { OpcionAlmacen(it.first, it.second) } }
            }
        }.distinctBy { it.id }
    }

    /** En qué se cuenta la cantidad: cajas si se escaneó una caja, si no la unidad del producto. */
    fun unidad(r: ProductoPorCodigoDto): String {
        val empaque = r.packaging
        if (r.match == "empaque" && empaque != null) {
            val nombre = empaque.nombre?.trim().orEmpty().ifEmpty { "Caja" }
            val piezas = empaque.piezasPorUnidad
            return if (piezas != null && piezas > 0) "$nombre (${AlmacenRules.formato(piezas)} pz c/u)" else nombre
        }
        return r.product?.unitName?.trim().orEmpty().ifEmpty { "piezas" }
    }

    fun avisoMovimiento(movimiento: Movimiento, cantidad: Double, unidad: String, producto: String?): String {
        val nombre = producto?.trim().orEmpty().ifEmpty { "el producto" }
        return "${movimiento.verbo}: ${AlmacenRules.formato(cantidad)} $unidad de $nombre."
    }

    /** Validación antes de mandar el movimiento; null si se puede. */
    fun errorMovimiento(cantidad: Double?, almacenId: Long?, disponibleEnOrigen: Double?, movimiento: Movimiento): String? =
        when {
            cantidad == null -> "Escribe una cantidad mayor a cero."
            almacenId == null -> if (movimiento == Movimiento.SALIDA) {
                "Elige de qué almacén sale."
            } else {
                "Elige a qué almacén entra."
            }
            movimiento == Movimiento.SALIDA && disponibleEnOrigen != null && cantidad > disponibleEnOrigen ->
                "No alcanza: en ese almacén hay ${AlmacenRules.formato(disponibleEnOrigen)}."
            else -> null
        }

    // ── Herramientas ─────────────────────────────────────────────────────────

    enum class AccionHerramienta(val etiqueta: String) {
        /** Préstamo aprobado: sale del almacén con quien la recoge. */
        ENTREGAR("Registrar salida"),

        /** Préstamo en uso: regresa al almacén. */
        RECIBIR("Registrar entrada"),
    }

    fun accion(r: HerramientaPorCodigoDto): AccionHerramienta? = when (r.prestamo?.status) {
        "APPROVED" -> AccionHerramienta.ENTREGAR
        "IN_USE" -> AccionHerramienta.RECIBIR
        else -> null
    }

    fun estadoHerramienta(status: String?): String = when (status) {
        "AVAILABLE" -> "En almacén"
        "ASSIGNED" -> "Asignada"
        "IN_REPAIR" -> "En reparación"
        "RETIRED" -> "Dada de baja"
        null, "" -> "Sin estado"
        else -> status
    }

    fun estadoPrestamo(status: String?): String = when (status) {
        "PENDING" -> "Préstamo pendiente de aprobar"
        "APPROVED" -> "Préstamo aprobado, falta entregarla"
        "IN_USE" -> "Prestada"
        else -> "Sin préstamo abierto"
    }

    /** «La tiene Juan Pérez · AN-0123» o «Kit de Ana López»; null si está libre. */
    fun quienLaTiene(r: HerramientaPorCodigoDto): String? {
        val p = r.prestamo
        if (p != null) {
            val quien = p.usuario?.nombre?.trim().orEmpty().ifEmpty { "alguien" }
            val ot = p.activity?.anNumber?.trim()?.takeIf { it.isNotEmpty() }
            val verbo = if (p.status == "IN_USE") "La tiene" else "La pidió"
            return listOfNotNull("$verbo $quien", ot).joinToString(" · ")
        }
        val k = r.kit ?: return null
        val quien = k.user?.nombre?.trim().orEmpty().ifEmpty { "alguien" }
        return "En el kit de $quien"
    }

    fun nombreHerramienta(r: HerramientaPorCodigoDto): String {
        val item = r.item
        return listOfNotNull(
            item?.toolName?.trim()?.takeIf { it.isNotEmpty() },
            item?.model?.trim()?.takeIf { it.isNotEmpty() },
        ).joinToString(" · ").ifEmpty { "Herramienta" }
    }

    const val PERMISO_GENERICO = "No tienes permisos para esta acción"

    /**
     * Un 403 explicado: qué no puede hacer y a quién pedírselo. Si el servidor dio
     * un motivo propio (p. ej. «Solo almacén entrega herramientas»), se respeta.
     */
    fun textoSinPermiso(accion: String, servidor: String?): String {
        val propio = servidor?.trim()?.trimEnd('.')?.takeIf {
            it.isNotEmpty() &&
                !it.equals(PERMISO_GENERICO, ignoreCase = true) &&
                !it.startsWith("Sin permisos", ignoreCase = true) &&
                !it.startsWith("Forbidden", ignoreCase = true)
        }
        val base = "Tu usuario no tiene permiso para $accion. Pídele a un administrador que te lo active."
        return if (propio != null) "$propio. $base" else base
    }
}
