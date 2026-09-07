package mx.nexara.mobile.nativeapp.data.integra.map

import com.squareup.moshi.Moshi
import com.squareup.moshi.Types
import com.squareup.moshi.kotlin.reflect.KotlinJsonAdapterFactory
import okhttp3.ResponseBody
import java.lang.reflect.ParameterizedType

/**
 * Lectura tolerante del JSON del plano y del panorama.
 *
 * Mismo criterio que `data/integra/detection` y `data/integra/video`: se parsea
 * a `Map<String, Any?>` y de ahí a los tipos de este paquete. Nada asume que una
 * clave exista, nada usa `!!`, y **todo campo que la API puede dejar fuera es
 * nulable aquí**.
 */
internal object MapJson {

    private val moshi: Moshi = Moshi.Builder().add(KotlinJsonAdapterFactory()).build()

    private val mapType: ParameterizedType = Types.newParameterizedType(
        Map::class.java,
        String::class.java,
        Any::class.java,
    )

    private val listType: ParameterizedType = Types.newParameterizedType(List::class.java, mapType)

    /** Objeto raíz. Un cuerpo vacío o que no es objeto devuelve mapa vacío. */
    fun map(body: ResponseBody): Map<String, Any?> {
        val raw = body.string().trim()
        if (raw.isEmpty() || !raw.startsWith("{")) return emptyMap()
        return moshi.adapter<Map<String, Any?>>(mapType).fromJson(raw) ?: emptyMap()
    }

    /**
     * Lista suelta o envuelta. `GET integra/sites` devuelve un array pelado y el
     * resto de endpoints un objeto con `items`; conviven las dos formas.
     */
    fun list(body: ResponseBody): List<Map<String, Any?>> {
        val raw = body.string().trim()
        if (raw.isEmpty()) return emptyList()
        if (raw.startsWith("[")) {
            return moshi.adapter<List<Map<String, Any?>>>(listType).fromJson(raw) ?: emptyList()
        }
        val root = moshi.adapter<Map<String, Any?>>(mapType).fromJson(raw) ?: return emptyList()
        return itemsOf(root)
    }

    fun itemsOf(root: Map<String, Any?>): List<Map<String, Any?>> {
        for (key in listOf("items", "list", "data", "results", "rows")) {
            val nested = root[key]
            if (nested is List<*>) return nested.mapNotNull { asMap(it) }
        }
        return emptyList()
    }

    fun asMap(value: Any?): Map<String, Any?>? {
        if (value !is Map<*, *>) return null
        return value.entries
            .filter { it.key is String }
            .associate { (it.key as String) to it.value }
    }
}

/**
 * Cadena del primer alias con valor útil, o `null`.
 *
 * Nunca devuelve `"null"` ni `"undefined"`: la API de INTEGRA mezcla ausencia de
 * clave, `null` y cadena vacía, y las tres significan lo mismo al pintar.
 */
internal fun Map<String, Any?>.mstr(vararg keys: String): String? {
    for (k in keys) {
        val v = this[k] ?: continue
        val s = when (v) {
            is String -> v
            is Number -> mplain(v)
            is Boolean -> v.toString()
            else -> continue
        }
        val t = s.trim()
        if (t.isNotEmpty() && t != "null" && t != "undefined") return t
    }
    return null
}

/** Moshi entrega los enteros JSON como `Double`: 12 puertas no son «12.0». */
private fun mplain(v: Number): String {
    val d = v.toDouble()
    return if (d == d.toLong().toDouble()) d.toLong().toString() else d.toString()
}

internal fun Map<String, Any?>.mint(vararg keys: String): Int? {
    for (k in keys) {
        when (val v = this[k]) {
            is Number -> return v.toInt()
            is String -> v.trim().toDoubleOrNull()?.let { return it.toInt() }
            else -> continue
        }
    }
    return null
}

/** Porcentaje del pin. `Float` porque el eje del plano es una fracción, no un conteo. */
internal fun Map<String, Any?>.mfloat(vararg keys: String): Float? {
    for (k in keys) {
        when (val v = this[k]) {
            is Number -> {
                val d = v.toDouble()
                if (d.isFinite()) return d.toFloat()
            }
            is String -> v.trim().toDoubleOrNull()?.let { if (it.isFinite()) return it.toFloat() }
            else -> continue
        }
    }
    return null
}

/** `null` cuando el campo no vino: «no lo sé» no es «false». */
internal fun Map<String, Any?>.mbool(vararg keys: String): Boolean? {
    for (k in keys) {
        when (val v = this[k]) {
            is Boolean -> return v
            is Number -> return v.toInt() != 0
            is String -> {
                val s = v.trim().lowercase()
                if (s.isEmpty()) continue
                return s == "true" || s == "1" || s == "yes" || s == "si" || s == "sí"
            }
            else -> continue
        }
    }
    return null
}

internal fun Map<String, Any?>.mmap(vararg keys: String): Map<String, Any?>? {
    for (k in keys) {
        MapJson.asMap(this[k])?.let { return it }
    }
    return null
}

internal fun Map<String, Any?>.mlist(vararg keys: String): List<Map<String, Any?>> {
    for (k in keys) {
        val v = this[k]
        if (v is List<*>) return v.mapNotNull { MapJson.asMap(it) }
    }
    return emptyList()
}
