package mx.nexara.mobile.nativeapp.ui.console.more

import java.math.BigDecimal
import kotlin.math.roundToInt
import mx.nexara.mobile.nativeapp.data.api.StockLevelDto

/**
 * Almacén en el teléfono, **solo consulta**: qué hay y qué está por acabarse.
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

    /** «SKU-123 · Bodega central · Pasillo 3». */
    fun ubicacionTexto(nivel: StockLevelDto): String {
        val partes = listOfNotNull(
            nivel.product?.sku?.trim()?.ifEmpty { null },
            nivel.warehouse?.name?.trim()?.ifEmpty { null } ?: nivel.warehouse?.code?.trim()?.ifEmpty { null },
            nivel.location?.name?.trim()?.ifEmpty { null } ?: nivel.location?.code?.trim()?.ifEmpty { null },
        )
        return if (partes.isEmpty()) "Sin almacén asignado" else partes.joinToString(" · ")
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
        return partes.joinToString(" · ")
    }

    /** Las dos vistas de la pantalla. La primera es la que se abre. */
    enum class Vista(val etiqueta: String) {
        BAJO_MINIMO("Bajo mínimo"),
        TODO("Todo el inventario"),
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

    /** «3 agotados · 11 bajo mínimo» para la cabecera; `null` si todo está bien. */
    fun resumenAlertas(bajoMinimo: List<StockLevelDto>): String? {
        if (bajoMinimo.isEmpty()) return null
        val agotados = bajoMinimo.count { agotado(it) }
        val partes = mutableListOf<String>()
        if (agotados > 0) partes += "$agotados sin existencia"
        val restantes = bajoMinimo.size - agotados
        if (restantes > 0) partes += "$restantes bajo mínimo"
        return partes.joinToString(" · ")
    }

    /** Qué no hace esta pantalla. */
    const val LIMITE =
        "Consulta. Entradas, salidas y traspasos de inventario se hacen desde la computadora."
}
