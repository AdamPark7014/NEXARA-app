package mx.nexara.mobile.nativeapp.storedemo

import android.content.Context
import android.util.Log
import okhttp3.Interceptor
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.Protocol
import okhttp3.Request
import okhttp3.Response
import okhttp3.ResponseBody.Companion.toResponseBody
import java.io.File
import java.io.IOException

/**
 * Solo debug: capturas de Google Play con datos ficticios.
 *
 * Se enciende sin recompilar, con archivos bandera en `files/store_demo/`:
 * - `serve`   → los GET con fixture en `assets/store-demo/<clave>.json` se contestan con él
 *               (equipo, clientes, chat y avisos inventados; nada de datos reales en la tienda).
 * - `capture` → guarda cada GET exitoso en `files/store_demo/captured/<clave>.json` para ver
 *               la forma real de la respuesta al armar fixtures. Lo capturado trae datos reales:
 *               se queda en el teléfono o en el scratchpad, nunca en el repo.
 *
 * Clave: la ruta después de `/api/` con `/` → `__` (sin query), p. ej. `me__board`.
 * Ver `scripts/store-demo.ps1`.
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
        if (serve && request.method == "GET") {
            fixture(key)?.let { body ->
                return Response.Builder()
                    .request(request)
                    .protocol(Protocol.HTTP_1_1)
                    .code(200)
                    .message("OK")
                    .header("X-Nexara-Store-Demo", key)
                    .body(body.toResponseBody(JSON))
                    .build()
            }
            Log.i(TAG, "sin fixture: $key")
        }
        // Marcar leído, reaccionar, etc. sobre datos ficticios: no debe tocar el servidor real.
        if (serve && request.method != "GET" && fixtureKeys().any { key.startsWith(it) }) {
            return Response.Builder()
                .request(request)
                .protocol(Protocol.HTTP_1_1)
                .code(200)
                .message("OK")
                .header("X-Nexara-Store-Demo", key)
                .body("{}".toResponseBody(JSON))
                .build()
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
