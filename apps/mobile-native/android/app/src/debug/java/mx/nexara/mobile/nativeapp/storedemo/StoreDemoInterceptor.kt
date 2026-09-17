package mx.nexara.mobile.nativeapp.storedemo

import android.content.Context
import android.util.Log
import okhttp3.Interceptor
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.Protocol
import okhttp3.Request
import okhttp3.Response
import okhttp3.ResponseBody.Companion.toResponseBody
import okio.Buffer
import org.json.JSONArray
import org.json.JSONObject
import java.io.File
import java.io.IOException
import java.time.Instant
import java.time.LocalDate

/**
 * Solo debug: capturas y video de Google Play con datos ficticios.
 *
 * Se enciende sin recompilar, con archivos bandera en `files/store_demo/`:
 * - `serve`    → los GET con fixture en `assets/store-demo/<clave>.json` se contestan con él
 *                (equipo, clientes, chat y avisos inventados; nada de datos reales en la tienda).
 *                Las escrituras sobre esos datos (marcar leído, reaccionar…) no llegan al servidor.
 * - `checador` → además simula la checada propia y el GPS de jornada: la entrada/salida y los
 *                puntos de ubicación se contestan aquí y la pantalla ve la jornada abierta.
 *                Sirve para grabar el video que pide la declaración de servicio en primer plano.
 * - `capture`  → guarda cada GET exitoso en `files/store_demo/captured/<clave>.json` para ver
 *                la forma real de la respuesta al armar fixtures. Lo capturado trae datos reales:
 *                se queda en el teléfono o en el scratchpad, nunca en el repo.
 *
 * Clave: la ruta después de `/api/` con `/` → `__` (sin query), p. ej. `me__board`.
 * Procedimiento en `apps/mobile-native/play-assets/ASSETS-README.md`.
 */
class StoreDemoInterceptor(context: Context) : Interceptor {
    private val appContext = context.applicationContext
    private val dir = File(appContext.filesDir, "store_demo")

    override fun intercept(chain: Interceptor.Chain): Response {
        val request = chain.request()
        val serve = File(dir, "serve").exists()
        val capture = File(dir, "capture").exists()
        if (!serve && !capture) return chain.proceed(request)

        val key = keyFor(request)
        if (serve && File(dir, "checador").exists()) {
            checador(request, key)?.let { return responder(request, key, it) }
        }
        if (serve && request.method == "GET") {
            fixture(key)?.let { return responder(request, key, it) }
            Log.i(TAG, "sin fixture: $key")
        }
        // Marcar leído, reaccionar, etc. sobre datos ficticios: no debe tocar el servidor real.
        if (serve && request.method != "GET" && fixtureKeys().any { key.startsWith(it) }) {
            return responder(request, key, "{}")
        }

        val response = chain.proceed(request)
        if (capture && request.method == "GET" && response.isSuccessful) {
            runCatching {
                val out = File(dir, "captured").apply { mkdirs() }
                File(out, "$key.json").writeText(response.peekBody(MAX_CAPTURE).string())
                File(out, "_index.tsv").appendText("$key\t${request.url.encodedPath}?${request.url.encodedQuery.orEmpty()}\n")
            }.onFailure { Log.w(TAG, "no se pudo capturar $key", it) }
        }
        return response
    }

    /** Jornada simulada: la última checada se guarda en `files/store_demo/checada.json`. */
    private fun checador(request: Request, key: String): String? {
        val estado = File(dir, "checada.json")
        return when {
            request.method == "POST" && key == "attendance" -> {
                val body = Buffer().also { request.body?.writeTo(it) }.readUtf8()
                val tipo = runCatching { JSONObject(body).optString("type") }.getOrNull()
                    ?.takeIf { it.isNotBlank() } ?: "entrada"
                val ahora = Instant.now().toString()
                val previo = estado.takeIf { it.isFile }?.let { JSONObject(it.readText()) }
                val entrada = if (tipo == "entrada") ahora else previo?.optString("entrada") ?: ahora
                estado.writeText(
                    JSONObject()
                        .put("entrada", entrada)
                        .put("salida", if (tipo == "salida") ahora else JSONObject.NULL)
                        .toString(),
                )
                JSONObject()
                    .put("id", 1)
                    .put("type", tipo)
                    .put("timestamp", ahora)
                    .put("message", if (tipo == "entrada") "Entrada registrada" else "Salida registrada")
                    .toString()
            }
            request.method != "GET" && (key == "gps" || key.startsWith("gps__")) -> "{\"consent\":true}"
            request.method == "GET" && key == "attendance__current" -> {
                val c = estado.takeIf { it.isFile }?.let { JSONObject(it.readText()) } ?: return null
                val abierta = c.isNull("salida")
                JSONObject()
                    .put("id", 1)
                    .put("userId", 1)
                    .put("date", LocalDate.now().toString())
                    .put("checkIn", c.optString("entrada"))
                    .put("checkOut", if (abierta) JSONObject.NULL else c.optString("salida"))
                    .put("isOpen", abierta)
                    .put("lastEntryAt", c.optString("entrada"))
                    .put("totalMinutes", 0)
                    .toString()
            }
            request.method == "GET" && key == "attendance__history" -> {
                val c = estado.takeIf { it.isFile }?.let { JSONObject(it.readText()) } ?: return "[]"
                val eventos = JSONArray().put(evento("entrada", c.optString("entrada")))
                if (!c.isNull("salida")) eventos.put(evento("salida", c.optString("salida")))
                eventos.toString()
            }
            request.method == "GET" && key == "gps__me" -> {
                val abierta = estado.takeIf { it.isFile }?.let { JSONObject(it.readText()).isNull("salida") } ?: false
                JSONObject().put("consent", abierta).put("location", JSONObject.NULL).toString()
            }
            else -> null
        }
    }

    private fun evento(tipo: String, cuando: String): JSONObject = JSONObject()
        .put("type", tipo)
        .put("timestamp", cuando)
        .put("deviceInfo", "Móvil · Android · NEXARA App")
        .put("photoUrl", JSONObject.NULL)
        .put(if (tipo == "entrada") "entryLatitude" else "exitLatitude", 19.0414)
        .put(if (tipo == "entrada") "entryLongitude" else "exitLongitude", -98.2063)

    private fun responder(request: Request, key: String, body: String): Response = Response.Builder()
        .request(request)
        .protocol(Protocol.HTTP_1_1)
        .code(200)
        .message("OK")
        .header("X-Nexara-Store-Demo", key)
        .body(body.toResponseBody(JSON))
        .build()

    private fun fixtureKeys(): List<String> {
        val pushed = File(dir, "fixtures").list().orEmpty().toList()
        val bundled = runCatching { appContext.assets.list("store-demo")?.toList() }.getOrNull().orEmpty()
        return (pushed + bundled).map { it.removeSuffix(".json") }
    }

    /** Primero `files/store_demo/fixtures/` (se empuja con adb sin recompilar), luego los assets. */
    private fun fixture(key: String): String? {
        File(dir, "fixtures/$key.json").takeIf { it.isFile }?.let { return it.readText() }
        return try {
            appContext.assets.open("store-demo/$key.json").bufferedReader().use { it.readText() }
        } catch (_: IOException) {
            null
        }
    }

    companion object {
        private const val TAG = "StoreDemo"
        private const val MAX_CAPTURE = 2L * 1024 * 1024
        private val JSON = "application/json; charset=utf-8".toMediaType()

        fun keyFor(request: Request): String {
            val path = request.url.encodedPath.substringAfter("/api/", request.url.encodedPath)
            return path.trim('/')
                .split('/')
                .joinToString("__") { it.replace(Regex("[^A-Za-z0-9_-]"), "-") }
                .ifBlank { "root" }
        }
    }
}
