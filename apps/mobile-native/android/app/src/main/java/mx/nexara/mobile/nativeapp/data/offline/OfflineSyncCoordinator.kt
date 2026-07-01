package mx.nexara.mobile.nativeapp.data.offline

import android.util.Log
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import kotlinx.coroutines.withContext
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import java.util.concurrent.TimeUnit

object OfflineSyncCoordinator {
    private val mutex = Mutex()
    private val client = OkHttpClient.Builder()
        .connectTimeout(20, TimeUnit.SECONDS)
        .readTimeout(25, TimeUnit.SECONDS)
        .writeTimeout(25, TimeUnit.SECONDS)
        .build()

    suspend fun replay(queue: OfflineMutationQueue, bearerToken: String?) = mutex.withLock {
        if (bearerToken.isNullOrBlank()) return@withLock
        if (!NetworkMonitor.isOnline.value) return@withLock

        val pending = queue.load()
        if (pending.isEmpty()) return@withLock

        val done = mutableSetOf<String>()
        withContext(Dispatchers.IO) {
            for (item in pending) {
                try {
                    val body = item.body?.toRequestBody(item.contentType.toMediaType())
                    val req = Request.Builder()
                        .url(item.url)
                        .method(item.method, body)
                        .header("Authorization", "Bearer $bearerToken")
                        .header("Content-Type", item.contentType)
                        .build()
                    client.newCall(req).execute().use { res ->
                        if (res.isSuccessful || res.code in 400..499) {
                            done.add(item.id)
                        }
                    }
                } catch (e: Exception) {
                    Log.w("OfflineSync", "replay failed ${item.id}: ${e.message}")
                }
            }
        }
        if (done.isNotEmpty()) queue.removeIds(done)
        Log.i("OfflineSync", "Replayed ${done.size}/${pending.size} mutations")
    }
}
