package mx.nexara.mobile.nativeapp.data.offline

import okhttp3.Interceptor
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.Protocol
import okhttp3.Response
import okhttp3.ResponseBody.Companion.toResponseBody
import java.io.IOException
import java.security.MessageDigest
import java.util.UUID

/**
 * Cache GET + encola mutaciones cuando no hay red (paridad web offline-fetch).
 * Externaliza data URLs a disco vía [OfflineMediaStore].
 */
class OfflineHttpInterceptor(
    private val queue: OfflineMutationQueue,
    private val cache: OfflineApiCache,
    private val media: OfflineMediaStore,
) : Interceptor {

    override fun intercept(chain: Interceptor.Chain): Response {
        val request = chain.request()
        val method = request.method.uppercase()
        val url = request.url.toString()
        val authTag = stableAuthTag(request.header("Authorization"))

        if (!NetworkMonitor.isOnline.value) {
            if (method == "GET") {
                val hit = cache.get(url, authTag)
                if (hit != null) {
                    return Response.Builder()
                        .request(request)
                        .protocol(Protocol.HTTP_1_1)
                        .code(200)
                        .message("OK")
                        .header("X-Nexara-Offline", "cache")
                        .body(hit.toResponseBody("application/json".toMediaType()))
                        .build()
                }
            } else if (method in MUTATING && isQueueable(url, method)) {
                enqueue(request)
                return queuedResponse(request)
            }
        }

        return try {
            val response = chain.proceed(request)
            if (method == "GET" && response.isSuccessful) {
                val peek = response.peekBody(512 * 1024)
                cache.put(url, authTag, peek.string())
            }
            response
        } catch (io: IOException) {
            if (method == "GET") {
                val hit = cache.get(url, authTag)
                if (hit != null) {
                    return Response.Builder()
                        .request(request)
                        .protocol(Protocol.HTTP_1_1)
                        .code(200)
                        .message("OK")
                        .header("X-Nexara-Offline", "cache")
                        .body(hit.toResponseBody("application/json".toMediaType()))
                        .build()
                }
            } else if (method in MUTATING && isQueueable(url, method)) {
                enqueue(request)
                return queuedResponse(request)
            }
            throw io
        }
    }

    private fun enqueue(request: okhttp3.Request) {
        val contentType = request.body?.contentType()?.toString() ?: "application/json"
        val isMultipart = contentType.startsWith("multipart/", ignoreCase = true)
        val bodyStr = request.body?.let { b ->
            val buffer = okio.Buffer()
            b.writeTo(buffer)
            if (isMultipart) {
                val id = media.saveBytes(buffer.readByteArray(), contentType)
                    ?: return@let null
                "nexara-media-bin://$id"
            } else {
                media.externalizeDataUrls(buffer.readUtf8())
            }
        }
        // Contrato A: la checada que sale de la cola lleva `offline: true`; la que
        // sale en vivo, no. Quien lo sabe es la cola, no la pantalla.
        val queuedBody = OfflineQueueBody.markOffline(
            url = request.url.toString(),
            method = request.method,
            contentType = contentType,
            body = bodyStr,
        )
        queue.enqueue(
            QueuedMutation(
                id = UUID.randomUUID().toString(),
                method = request.method.uppercase(),
                url = request.url.toString(),
                body = queuedBody,
                contentType = contentType,
                idempotencyKey = UUID.randomUUID().toString(),
            ),
        )
    }

    private fun queuedResponse(request: okhttp3.Request): Response =
        Response.Builder()
            .request(request)
            .protocol(Protocol.HTTP_1_1)
            .code(202)
            .message("Accepted")
            .header("X-Nexara-Offline", "queued")
            .body("""{"queued":true,"offline":true}""".toResponseBody("application/json".toMediaType()))
            .build()

    companion object {
        private val MUTATING = setOf("POST", "PUT", "PATCH", "DELETE")

        /**
         * Sesión y registro del equipo no se encolan: se repiten solos al abrir la app y,
         * encolados, dejan «Pendientes de sync» colgado cuando cambia el servidor.
         */
        private val NOT_QUEUEABLE = listOf("/auth/", "/devices/push-token")

        /**
         * Decisiones de un superior (desactivar/eliminar clientes y proyectos, cancelar o pasar
         * actividades, justificar faltas): sin conexión deben fallar a la vista, no quedar en cola
         * dando por hecho algo que la API todavía puede rechazar.
         *
         * Iniciar una actividad (y `/aceptar`, su nombre en apps viejas) va en la misma lista: guarda
         * la hora real de inicio, y encolada quedaría la hora de cuando regrese la señal. Sin red, la
         * foto de entrada es la que marca el inicio al subirse.
         */
        private val SOLO_EN_LINEA = listOf(
            "/desactivar", "/reactivar", "/cancelar", "/reasignar", "/justificaciones",
            "/aceptar", "/rechazar",
        )

        /** `/iniciar` solo de actividades propias: otras rutas con ese nombre sí se pueden encolar. */
        private fun esIniciarActividad(ruta: String): Boolean =
            ruta.contains("/me/activities/") && ruta.trimEnd('/').endsWith("/iniciar")
        private val BORRADO_SOLO_EN_LINEA = listOf("/ventas/clientes/", "/operational-projects/")

        fun isQueueable(url: String, method: String = "POST"): Boolean {
            val ruta = url.substringBefore('?')
            if (NOT_QUEUEABLE.any { ruta.contains(it) }) return false
            if (SOLO_EN_LINEA.any { ruta.contains(it) }) return false
            if (esIniciarActividad(ruta)) return false
            if (method.equals("DELETE", ignoreCase = true) && BORRADO_SOLO_EN_LINEA.any { ruta.contains(it) }) return false
            return true
        }

        /** Full-token hash — take(48) collided across users on the same device. */
        fun stableAuthTag(authorization: String?): String {
            if (authorization.isNullOrBlank()) return "anon"
            val digest = MessageDigest.getInstance("SHA-256").digest(authorization.toByteArray())
            return digest.joinToString("") { "%02x".format(it) }
        }
    }
}
