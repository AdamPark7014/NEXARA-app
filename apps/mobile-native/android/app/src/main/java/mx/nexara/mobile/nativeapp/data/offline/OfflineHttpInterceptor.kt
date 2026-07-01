package mx.nexara.mobile.nativeapp.data.offline

import okhttp3.Interceptor
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.Protocol
import okhttp3.Response
import okhttp3.ResponseBody.Companion.toResponseBody
import java.io.IOException
import java.util.UUID

/**
 * Cache GET + encola mutaciones cuando no hay red (paridad web offline-fetch).
 */
class OfflineHttpInterceptor(
    private val queue: OfflineMutationQueue,
    private val cache: OfflineApiCache,
) : Interceptor {

    override fun intercept(chain: Interceptor.Chain): Response {
        val request = chain.request()
        val method = request.method.uppercase()
        val url = request.url.toString()
        val authTag = request.header("Authorization")?.take(48) ?: "anon"

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
                val bodyStr = request.body?.let { b ->
                    val buffer = okio.Buffer()
                    b.writeTo(buffer)
                    buffer.readUtf8()
                }
                queue.enqueue(
                    QueuedMutation(
                        id = UUID.randomUUID().toString(),
                        method = method,
                        url = url,
                        body = bodyStr,
                        contentType = request.body?.contentType()?.toString() ?: "application/json",
                    ),
                )
                return Response.Builder()
                    .request(request)
                    .protocol(Protocol.HTTP_1_1)
                    .code(202)
                    .message("Accepted")
                    .header("X-Nexara-Offline", "queued")
                    .body("""{"queued":true,"offline":true}""".toResponseBody("application/json".toMediaType()))
                    .build()
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
                val bodyStr = request.body?.let { b ->
                    val buffer = okio.Buffer()
                    b.writeTo(buffer)
                    buffer.readUtf8()
                }
                queue.enqueue(
                    QueuedMutation(
                        id = UUID.randomUUID().toString(),
                        method = method,
                        url = url,
                        body = bodyStr,
                    ),
                )
                return Response.Builder()
                    .request(request)
                    .protocol(Protocol.HTTP_1_1)
                    .code(202)
                    .message("Accepted")
                    .header("X-Nexara-Offline", "queued")
                    .body("""{"queued":true,"offline":true}""".toResponseBody("application/json".toMediaType()))
                    .build()
            }
            throw io
        }
    }

    companion object {
        private val MUTATING = setOf("POST", "PUT", "PATCH", "DELETE")
    }
}
