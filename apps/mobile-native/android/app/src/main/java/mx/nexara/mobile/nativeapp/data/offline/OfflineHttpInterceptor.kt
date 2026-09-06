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
            } else if (method in MUTATING) {
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
            } else if (method in MUTATING) {
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
        queue.enqueue(
            QueuedMutation(
                id = UUID.randomUUID().toString(),
                method = request.method.uppercase(),
                url = request.url.toString(),
                body = bodyStr,
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

        /** Full-token hash — take(48) collided across users on the same device. */
        fun stableAuthTag(authorization: String?): String {
            if (authorization.isNullOrBlank()) return "anon"
            val digest = MessageDigest.getInstance("SHA-256").digest(authorization.toByteArray())
            return digest.joinToString("") { "%02x".format(it) }
        }
    }
}
