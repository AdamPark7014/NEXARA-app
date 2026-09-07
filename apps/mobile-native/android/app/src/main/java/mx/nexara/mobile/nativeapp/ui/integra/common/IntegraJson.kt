package mx.nexara.mobile.nativeapp.ui.integra.common

/**
 * Lectura tolerante del JSON de INTEGRA.
 *
 * La API de INTEGRA devuelve tres familias de payload que no comparten nombres:
 * el espejo Prisma (`integra/doors`, `integra/devices`), el crudo del fabricante
 * (Artemis / ISAPI, que llega con `doorIndexCode`, `eventTime`, `visitorName`…)
 * y los DTO propios de push (`label`, `outcome`, `occurredAt`). Además, según el
 * contrato de la API **muchos campos llegan `undefined`, no `null`**: la clave
 * simplemente no está en el objeto.
 *
 * Por eso todo se lee por lista de alias y todo puede faltar. Nada aquí usa `!!`
 * y nada asume que una clave exista.
 */

/** Primer alias con valor no vacío, o `""`. Nunca devuelve la cadena "null". */
fun str(m: Map<String, Any?>, vararg keys: String): String = strOrNull(m, *keys) ?: ""

/** Igual que [str] pero distingue «no vino» de «vino vacío». */
fun strOrNull(m: Map<String, Any?>, vararg keys: String): String? {
    for (k in keys) {
        val v = m[k] ?: continue
        val s = when (v) {
            is String -> v
            is Number -> numberToPlainString(v)
            is Boolean -> if (v) "sí" else "no"
            is Map<*, *> -> str(asMap(v), "name", "nombre", "personName", "visitorName", "label")
            is List<*> -> v.firstOrNull()?.toString().orEmpty()
            else -> v.toString()
        }
        if (s.isNotBlank() && s != "null" && s != "undefined") return s
    }
    return null
}

/**
 * Los números del JSON llegan como `Double` por Moshi. Un conteo de 12 puertas
 * no debe pintarse «12.0».
 */
private fun numberToPlainString(v: Number): String {
    val d = v.toDouble()
    return if (d == d.toLong().toDouble()) d.toLong().toString() else d.toString()
}

fun bool(m: Map<String, Any?>, vararg keys: String): Boolean? {
    for (k in keys) {
        when (val v = m[k]) {
            is Boolean -> return v
            is Number -> return v.toInt() != 0
            is String -> {
                val s = v.trim().lowercase()
                if (s.isEmpty()) continue
                return s == "true" || s == "1" || s == "yes" || s == "sí" || s == "si"
            }
            else -> continue
        }
    }
    return null
}

fun int(m: Map<String, Any?>, vararg keys: String): Int? {
    for (k in keys) {
        when (val v = m[k]) {
            is Number -> return v.toInt()
            is String -> v.trim().toDoubleOrNull()?.let { return it.toInt() }
            else -> continue
        }
    }
    return null
}

/** Lista de cadenas (`doorNames`, `weekdays`, `cardNos`), vacía si falta. */
fun stringList(m: Map<String, Any?>, vararg keys: String): List<String> {
    for (k in keys) {
        val v = m[k]
        if (v is List<*>) {
            return v.mapNotNull { item ->
                when (item) {
                    null -> null
                    is String -> item.takeIf { it.isNotBlank() }
                    is Number -> numberToPlainString(item)
                    is Map<*, *> -> str(asMap(item), "name", "label", "nombre").takeIf { it.isNotBlank() }
                    else -> item.toString().takeIf { it.isNotBlank() }
                }
            }
        }
    }
    return emptyList()
}

/** Sub-objeto (`erpUser`, `_count`, `capabilities`), o `null`. */
fun subMap(m: Map<String, Any?>, vararg keys: String): Map<String, Any?>? {
    for (k in keys) {
        val v = m[k]
        if (v is Map<*, *>) return asMap(v)
    }
    return null
}

/** Lista de objetos (`items`, `results`, `list`), vacía si falta. */
fun mapList(m: Map<String, Any?>, vararg keys: String): List<Map<String, Any?>> {
    for (k in keys) {
        val v = m[k]
        if (v is List<*>) return v.filterIsInstance<Map<*, *>>().map { asMap(it) }
    }
    return emptyList()
}

@Suppress("UNCHECKED_CAST")
private fun asMap(v: Map<*, *>): Map<String, Any?> = v as Map<String, Any?>

/**
 * `GET integra/people/:id` en ISAPI envuelve la ficha en `person`; en Artemis
 * devuelve el objeto plano. Se acepta cualquiera de las dos formas.
 */
fun nestedPerson(root: Map<String, Any?>): Map<String, Any?> = subMap(root, "person") ?: root

/**
 * Normaliza para buscar: sin acentos, sin mayúsculas. «Joan Sebastián» tiene
 * que salir escribiendo «sebastian».
 */
fun normalizeForSearch(raw: String): String {
    val sb = StringBuilder(raw.length)
    for (ch in raw.lowercase()) {
        sb.append(
            when (ch) {
                'á', 'à', 'ä', 'â', 'ã' -> 'a'
                'é', 'è', 'ë', 'ê' -> 'e'
                'í', 'ì', 'ï', 'î' -> 'i'
                'ó', 'ò', 'ö', 'ô', 'õ' -> 'o'
                'ú', 'ù', 'ü', 'û' -> 'u'
                'ñ' -> 'n'
                'ç' -> 'c'
                else -> ch
            },
        )
    }
    return sb.toString()
}

/** ¿Alguno de los campos `keys` contiene `query`? Consulta vacía = todo pasa. */
fun matchesQuery(m: Map<String, Any?>, query: String, vararg keys: String): Boolean {
    val q = normalizeForSearch(query.trim())
    if (q.isEmpty()) return true
    return keys.any { k -> normalizeForSearch(str(m, k)).contains(q) }
}
