package mx.nexara.mobile.nativeapp.ui.console.more

import java.math.BigDecimal
import kotlin.math.roundToInt
import mx.nexara.mobile.nativeapp.data.api.MovimientoStockDto
import mx.nexara.mobile.nativeapp.data.api.StockLevelDto

/**
 * Almacén en el teléfono: qué hay y qué está por acabarse. Mover inventario se hace solo
 * con el escáner (`EscanerDeAlmacen`, reglas en `EscaneoRules`); esta lista es de consulta.
 *
 * La tabla de la web tiene producto, SKU, almacén, ubicación, cantidad,
 * reservado, disponible, punto de reorden y costo. En un teléfono nueve columnas
 * se vuelven ilegibles, así que cada existencia es un renglón con el producto
 * arriba, la cantidad grande a la derecha y una barra que compara lo que hay
 * contra el punto de reorden — que es la única pregunta que se hace en campo:
 * ¿alcanza o hay que pedir?
 *
 * Las cantidades son `Decimal` de Prisma y viajan como texto (`"12.5"`) o como
 * número según el campo; todo pasa por [numero], que se traga las dos formas y
 * devuelve `null` si no entiende — nunca un cero fingido.
 *
 * Sin Android: se prueba en la JVM (`AlmacenRulesTest`).
 */
object AlmacenRules {

    /** Lee un `Decimal` del API venga como venga. `null` si no es un número. */
    fun numero(valor: String?): Double? {
        val texto = valor?.trim()?.takeIf { it.isNotEmpty() && it != "null" } ?: return null
        return runCatching { BigDecimal(texto).toDouble() }.getOrNull()
            ?: texto.toDoubleOrNull()
    }

    fun cantidad(nivel: StockLevelDto): Double? = numero(nivel.quantity)

    fun reservado(nivel: StockLevelDto): Double? = numero(nivel.reservedQty)

    fun puntoDeReorden(nivel: StockLevelDto): Double? = numero(nivel.reorderPoint)

    /** Lo que de verdad se puede tomar: existencia menos lo apartado. */
    fun disponible(nivel: StockLevelDto): Double? {
        val hay = cantidad(nivel) ?: return null
        return hay - (reservado(nivel) ?: 0.0)
    }

    /**
     * La misma regla que `getLowStockAlerts` en el servidor: está bajo mínimo si
     * hay un punto de reorden mayor que cero y la existencia no lo supera. Sin
     * punto de reorden configurado no se avisa de nada — nadie dijo cuánto es
     * poco.
     */
    fun bajoMinimo(nivel: StockLevelDto): Boolean {
        val punto = puntoDeReorden(nivel) ?: return false
        if (punto <= 0.0) return false
        val hay = cantidad(nivel) ?: return false
        return hay <= punto
    }

    /** Sin existencia ninguna: el caso que hay que enseñar en rojo, no en ámbar. */
    fun agotado(nivel: StockLevelDto): Boolean = (cantidad(nivel) ?: -1.0) <= 0.0

    /** «12» · «12.5» · «—». Sin decimales cuando no los tiene. */
    fun formato(valor: Double?): String {
        val v = valor?.takeIf { it.isFinite() } ?: return "—"
        val redondeado = (v * 100).roundToInt() / 100.0
        return if (redondeado % 1.0 == 0.0) redondeado.toLong().toString() else redondeado.toString()
    }

    /** Cuánto de la barra se llena: existencia contra punto de reorden, 0–1. */
    fun progreso(nivel: StockLevelDto): Float? {
        val punto = puntoDeReorden(nivel)?.takeIf { it > 0.0 } ?: return null
        val hay = cantidad(nivel) ?: return null
        return (hay / punto).coerceIn(0.0, 1.0).toFloat()
    }

    /** Producto legible; si no hay nombre, al menos el SKU. */
    fun titulo(nivel: StockLevelDto): String {
        val nombre = nivel.product?.name?.trim()?.ifEmpty { null }
        val sku = nivel.product?.sku?.trim()?.ifEmpty { null }
        return nombre ?: sku ?: "Producto sin nombre"
    }

    /** SKU, bodega y pasillo, uno por renglón. */
    fun ubicacionTexto(nivel: StockLevelDto): String {
        val partes = listOfNotNull(
            nivel.product?.sku?.trim()?.ifEmpty { null },
            nivel.warehouse?.name?.trim()?.ifEmpty { null } ?: nivel.warehouse?.code?.trim()?.ifEmpty { null },
            nivel.location?.name?.trim()?.ifEmpty { null } ?: nivel.location?.code?.trim()?.ifEmpty { null },
        )
        return if (partes.isEmpty()) "Sin almacén asignado" else partes.joinToString("\n")
    }

    /**
     * La línea de abajo del renglón: mínimo, reservado y disponible, solo cuando
     * aportan algo. Sin punto de reorden se dice, porque explica por qué ese
     * producto nunca va a salir en las alertas.
     */
    fun detalleTexto(nivel: StockLevelDto): String {
        val partes = mutableListOf<String>()
        val punto = puntoDeReorden(nivel)
        if (punto != null && punto > 0.0) partes += "mínimo ${formato(punto)}" else partes += "sin mínimo fijado"
        val apartado = reservado(nivel)
        if (apartado != null && apartado > 0.0) {
            partes += "${formato(apartado)} apartado"
            partes += "${formato(disponible(nivel))} libre"
        }
        return partes.joinToString("\n")
    }

    /** Las vistas de la pantalla. La primera de [vistas] es la que se abre. */
    enum class Vista(val etiqueta: String) {
        BAJO_MINIMO("Bajo mínimo"),
        TODO("Todo el inventario"),
        MOVIMIENTOS("Movimientos"),
    }

    // ── Quién mira ───────────────────────────────────────────────────────────

    /** Dirección consulta y ve quién movió qué; Iván (`stock.manage`) opera; los demás consultan. */
    enum class Perfil { DIRECCION, OPERA, CONSULTA }

    fun perfil(esDireccion: Boolean, opera: Boolean): Perfil = when {
        esDireccion -> Perfil.DIRECCION
        opera -> Perfil.OPERA
        else -> Perfil.CONSULTA
    }

    /** Solo quien da de alta y registra entradas y salidas lleva el escáner. */
    fun muestraEscaner(perfil: Perfil): Boolean = perfil == Perfil.OPERA

    fun vistas(perfil: Perfil): List<Vista> = when (perfil) {
        Perfil.CONSULTA -> listOf(Vista.BAJO_MINIMO, Vista.TODO)
        Perfil.DIRECCION, Perfil.OPERA -> listOf(Vista.BAJO_MINIMO, Vista.TODO, Vista.MOVIMIENTOS)
    }

    // ── Movimientos ──────────────────────────────────────────────────────────

    /** Los mismos nombres que el kardex de la web (`stock-movement-pdf.ts`). */
    fun etiquetaMovimiento(tipo: String?): String = when (tipo?.trim()?.uppercase()) {
        "RECEIPT" -> "Entrada"
        "DISPATCH" -> "Salida"
        "TRANSFER" -> "Traspaso"
        "ADJUSTMENT" -> "Ajuste"
        "RETURN" -> "Devolución"
        "SCRAP" -> "Merma"
        "PRODUCTION_IN" -> "Entrada de producción"
        "PRODUCTION_OUT" -> "Salida de producción"
        else -> "Movimiento"
    }

    /** Lo que entra se lee distinto de lo que sale; `null` para lo demás. */
    fun entra(tipo: String?): Boolean? = when (tipo?.trim()?.uppercase()) {
        "RECEIPT", "RETURN", "PRODUCTION_IN" -> true
        "DISPATCH", "SCRAP", "PRODUCTION_OUT" -> false
        else -> null
    }

    fun tituloMovimiento(m: MovimientoStockDto): String =
        m.product?.name?.trim()?.ifEmpty { null } ?: m.product?.sku?.trim()?.ifEmpty { null } ?: "Producto sin nombre"

    private fun almacenDe(a: mx.nexara.mobile.nativeapp.data.api.StockAlmacenDto?): String? =
        a?.name?.trim()?.ifEmpty { null } ?: a?.code?.trim()?.ifEmpty { null }

    /** «De Central a Obra» · «A Central» · «De Central». `null` si el movimiento no dice almacén. */
    fun rutaMovimiento(m: MovimientoStockDto): String? {
        val desde = almacenDe(m.fromWarehouse)
        val hacia = almacenDe(m.toWarehouse)
        return when {
            desde != null && hacia != null -> "De $desde a $hacia"
            hacia != null -> "A $hacia"
            desde != null -> "De $desde"
            else -> null
        }
    }

    /** Quién lo hizo es lo que dirección viene a ver; sin dato se dice, no se inventa. */
    fun quienLoHizo(m: MovimientoStockDto): String =
        m.createdBy?.nombre?.trim()?.ifEmpty { null }?.let { "Lo hizo $it" } ?: "Sin persona registrada"

    fun filtrarMovimientos(movimientos: List<MovimientoStockDto>, consulta: String): List<MovimientoStockDto> {
        val q = consulta.trim().lowercase()
        if (q.isEmpty()) return movimientos
        return movimientos.filter { m ->
            listOfNotNull(
                m.product?.name,
                m.product?.sku,
                m.createdBy?.nombre,
                m.fromWarehouse?.name,
                m.toWarehouse?.name,
                m.movementNumber,
            ).any { it.lowercase().contains(q) }
        }
    }

    // ── Vacíos ───────────────────────────────────────────────────────────────

    /** Hoy NEXARA no tiene productos capturados: cada quien lee qué sigue. */
    fun vacioSinExistencias(perfil: Perfil): String = when (perfil) {
        Perfil.OPERA -> "Todavía no hay productos con existencia. Escanea el código de uno para darlo de alta " +
            "y registra su primera entrada."
        Perfil.DIRECCION -> "Todavía no hay productos con existencia. Los da de alta Iván; en cuanto entren, aquí los ves."
        Perfil.CONSULTA -> "Todavía no hay productos con existencia. Los da de alta almacén."
    }

    fun vacioMovimientos(perfil: Perfil): String = when (perfil) {
        Perfil.OPERA -> "Cuando registres una entrada o una salida con el escáner, aquí queda."
        else -> "Cuando almacén registre una entrada o una salida, aquí sale con quién la hizo."
    }

    /** Búsqueda por producto, SKU o almacén; sin texto devuelve la lista entera. */
    fun filtrar(niveles: List<StockLevelDto>, consulta: String): List<StockLevelDto> {
        val q = consulta.trim().lowercase()
        if (q.isEmpty()) return niveles
        return niveles.filter { nivel ->
            listOfNotNull(
                nivel.product?.name,
                nivel.product?.sku,
                nivel.warehouse?.name,
                nivel.warehouse?.code,
            ).any { it.lowercase().contains(q) }
        }
    }

    /**
     * Orden de la lista de alertas: primero lo agotado, después lo más cerca del
     * mínimo, y a igualdad, por nombre. Así la primera pantalla ya es la lista
     * de compras.
     */
    fun ordenarPorUrgencia(niveles: List<StockLevelDto>): List<StockLevelDto> =
        niveles.sortedWith(
            compareBy(
                { if (agotado(it)) 0 else 1 },
                { progreso(it) ?: 1f },
                { titulo(it).lowercase() },
            ),
        )

    /** Orden del inventario completo: alfabético, que es como se busca a ojo. */
    fun ordenarPorNombre(niveles: List<StockLevelDto>): List<StockLevelDto> =
        niveles.sortedWith(compareBy({ titulo(it).lowercase() }, { ubicacionTexto(it).lowercase() }))

    /** «sin existencia» y «bajo mínimo», uno por renglón; `null` si todo está bien. */
    fun resumenAlertas(bajoMinimo: List<StockLevelDto>): String? {
        if (bajoMinimo.isEmpty()) return null
        val agotados = bajoMinimo.count { agotado(it) }
        val partes = mutableListOf<String>()
        if (agotados > 0) partes += "$agotados sin existencia"
        val restantes = bajoMinimo.size - agotados
        if (restantes > 0) partes += "$restantes bajo mínimo"
        return partes.joinToString("\n")
    }

    /** Qué no hace esta pantalla. */
    fun limite(perfil: Perfil): String = when (perfil) {
        Perfil.DIRECCION -> "Solo lectura: dar de alta y registrar entradas y salidas lo hace Iván."
        Perfil.OPERA -> "Con el escáner das de alta y registras entradas y salidas. Traspasos, ajustes y costos " +
            "se hacen desde la computadora."
        Perfil.CONSULTA -> "Solo consulta: dar de alta y registrar entradas y salidas lo hace almacén."
    }
}
