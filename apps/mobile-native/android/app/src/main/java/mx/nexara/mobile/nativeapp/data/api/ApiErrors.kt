package mx.nexara.mobile.nativeapp.data.api

import retrofit2.HttpException
import java.io.IOException

/**
 * Traduce una excepción de red a algo que una persona pueda leer.
 *
 * El caso que faltaba era el **400**. NestJS contesta las validaciones de
 * negocio con `{"statusCode":400,"message":"Solo puedes reabrir OT
 * finalizadas"}` — es decir, el servidor ya escribe en español exactamente lo
 * que hay que decirle al usuario. Como esta función no miraba el cuerpo, ese
 * texto se tiraba y en pantalla aparecía el `HttpException.message` de
 * Retrofit: «HTTP 400 Bad Request». El usuario pulsaba un botón, no pasaba
 * nada, y no había manera de saber por qué.
 *
 * Lo mismo valía para el 409 (conflicto: «Esta aprobación ya fue decidida») y
 * el 422.
 */
fun Throwable.toUserMessage(fallback: String = "No se pudo completar la operación"): String {
    when (this) {
        is HttpException -> {
            when (code()) {
                401 -> return "Sesión expirada. Inicia sesión de nuevo."
                403 -> return serverMessage() ?: "Sin permisos para esta acción."
                404 -> return serverMessage() ?: "Recurso no encontrado."
                in 500..599 -> return "Error del servidor. Intenta más tarde."
            }
            // 400 / 409 / 422 y demás: el servidor sabe mejor que nosotros qué
            // salió mal, y ya lo dice en español.
            serverMessage()?.let { return it }
            if (code() == 400) return "Datos inválidos. Revisa el formulario."
            if (code() == 409) return "El registro cambió mientras lo editabas. Vuelve a intentarlo."
            return fallback
        }
        is IOException -> return "Sin conexión. Revisa tu red e intenta de nuevo."
    }
    return message?.takeIf { it.isNotBlank() } ?: fallback
}

fun Throwable.isSessionExpired(): Boolean = (this as? HttpException)?.code() == 401

/**
 * Saca el texto de error del cuerpo de la respuesta.
 *
 * `message` en NestJS es una cadena o un arreglo de cadenas (cuando falla
 * `class-validator`); se aceptan las dos formas, y también `error` como
 * respaldo. Sin dependencias de JSON: el cuerpo de un error puede ser
 * cualquier cosa — HTML de un proxy, texto plano — y aquí no se puede reventar.
 */
private fun HttpException.serverMessage(): String? =
    runCatching { response()?.errorBody()?.string() }
        .getOrNull()
        ?.let { parseServerErrorBody(it) }

/**
 * Extrae el mensaje legible de un cuerpo de error.
 *
 * Público a propósito: es la única parte con lógica y se prueba sola, sin
 * necesitar una `HttpException` de mentira.
 */
fun parseServerErrorBody(body: String): String? {
    val trimmed = body.trim()
    if (trimmed.isEmpty()) return null
    // Un proxy caído devuelve HTML; enseñárselo al usuario es peor que nada.
    if (trimmed.startsWith("<")) return null
    if (!trimmed.startsWith("{")) {
        return trimmed.takeIf { it.length in 1..300 }
    }
    for (key in listOf("message", "error")) {
        extractJsonField(trimmed, key)?.let { return it }
    }
    return null
}

/**
 * Lee `"clave": "texto"` o `"clave": ["texto", …]` de un JSON plano.
 *
 * Se hace a mano en vez de con Moshi porque esto corre en la ruta de error de
 * toda la app: un adaptador que lance al toparse con una forma inesperada
 * cambiaría un mensaje malo por un fallo.
 */
private fun extractJsonField(json: String, key: String): String? {
    val marker = "\"$key\""
    val at = json.indexOf(marker)
    if (at < 0) return null
    var i = at + marker.length
    while (i < json.length && json[i].isWhitespace()) i++
    if (i >= json.length || json[i] != ':') return null
    i++
    while (i < json.length && json[i].isWhitespace()) i++
    if (i >= json.length) return null

    return when (json[i]) {
        '"' -> readJsonString(json, i)
        '[' -> {
            // Arreglo de class-validator: se unen en una sola frase.
            val parts = mutableListOf<String>()
            var j = i + 1
            while (j < json.length && json[j] != ']') {
                if (json[j] == '"') {
                    // Se avanza sobre el texto CRUDO (con escapes) para no
                    // desalinear el índice: el texto ya decodificado puede ser
                    // más corto que lo que ocupa en el JSON.
                    val end = endOfJsonString(json, j) ?: break
                    readJsonString(json, j)?.let { parts += it }
                    j = end + 1
                } else {
                    j++
                }
            }
            parts.filter { it.isNotBlank() }.joinToString(". ").takeIf { it.isNotBlank() }
        }
        else -> null
    }
}

/** Índice de la comilla que cierra la cadena abierta en [start]; `null` si no cierra. */
private fun endOfJsonString(json: String, start: Int): Int? {
    var i = start + 1
    while (i < json.length) {
        when (json[i]) {
            '\\' -> i++
            '"' -> return i
        }
        i++
    }
    return null
}

/** Lee la cadena JSON que empieza en [start] (que apunta a la comilla). */
private fun readJsonString(json: String, start: Int): String? {
    val sb = StringBuilder()
    var i = start + 1
    while (i < json.length) {
        when (val c = json[i]) {
            '"' -> return sb.toString().takeIf { it.isNotBlank() }
            '\\' -> {
                if (i + 1 >= json.length) return null
                when (val esc = json[i + 1]) {
                    'n' -> sb.append(' ')
                    't' -> sb.append(' ')
                    'u' -> {
                        val hex = json.substring(i + 2, minOf(i + 6, json.length))
                        hex.toIntOrNull(16)?.let { sb.append(it.toChar()) }
                        i += 4
                    }
                    else -> sb.append(esc)
                }
                i++
            }
            else -> sb.append(c)
        }
        i++
    }
    return null
}
