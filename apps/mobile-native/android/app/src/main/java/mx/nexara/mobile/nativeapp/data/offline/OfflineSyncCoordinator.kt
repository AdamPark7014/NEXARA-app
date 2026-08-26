package mx.nexara.mobile.nativeapp.data.offline

import android.util.Log
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import kotlinx.coroutines.withContext
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import java.util.concurrent.TimeUnit
import kotlin.math.min
import kotlin.math.pow

data class OfflineSyncStatus(
    val isSyncing: Boolean = false,
    val lastSyncAt: Long? = null,
    val lastReplayed: Int = 0,
    val lastPending: Int = 0,
)

object OfflineSyncCoordinator {
    private const val MAX_ATTEMPTS = 8
    private val PERMANENT_CLIENT = setOf(400, 401, 403, 404, 409, 410, 422)

    private val _syncStatus = MutableStateFlow(OfflineSyncStatus())
    val syncStatus: StateFlow<OfflineSyncStatus> = _syncStatus.asStateFlow()

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
        if (pending.isEmpty()) {
            _syncStatus.value = OfflineSyncStatus(
                isSyncing = false,
                lastSyncAt = System.currentTimeMillis(),
                lastReplayed = 0,
                lastPending = 0,
            )
            return@withLock
        }

        _syncStatus.value = _syncStatus.value.copy(isSyncing = true)
        val done = mutableSetOf<String>()
        val now = System.currentTimeMillis()
        withContext(Dispatchers.IO) {
            for (item in pending) {
                // Backoff: 2^attempts segundos (cap 5 min) desde último intento.
                val last = item.lastAttemptAt
                if (last != null && item.attempts > 0) {
                    val waitMs = min(300_000L, (2.0.pow(item.attempts.coerceAtMost(8)) * 1000).toLong())
                    if (now - last < waitMs) continue
                }
                try {
                    val expanded = NexaraOffline.mediaStore().expandMediaRefs(item.body)
                    val body = expanded?.toRequestBody(item.contentType.toMediaType())
                    val req = Request.Builder()
                        .url(item.url)
                        .method(item.method, body)
                        .header("Authorization", "Bearer $bearerToken")
                        .header("Content-Type", item.contentType)
                        .build()
                    client.newCall(req).execute().use { res ->
                        when {
                            res.isSuccessful -> {
                                done.add(item.id)
                                NexaraOffline.mediaStore().purgeRefsInBody(item.body)
                            }
                            res.code in PERMANENT_CLIENT -> {
                                done.add(item.id)
                                NexaraOffline.mediaStore().purgeRefsInBody(item.body)
                                Log.w("OfflineSync", "Dropping ${item.id}: permanent HTTP ${res.code}")
                            }
                            else -> {
                                val nextAttempts = item.attempts + 1
                                if (nextAttempts >= MAX_ATTEMPTS) {
                                    done.add(item.id)
                                    NexaraOffline.mediaStore().purgeRefsInBody(item.body)
                                    Log.w("OfflineSync", "Dropping ${item.id}: max attempts ($MAX_ATTEMPTS)")
                                } else {
                                    queue.upsert(
                                        item.copy(
                                            attempts = nextAttempts,
                                            lastAttemptAt = System.currentTimeMillis(),
                                            lastError = "HTTP ${res.code}",
                                        ),
                                    )
                                    Log.w("OfflineSync", "Keep ${item.id}: HTTP ${res.code} attempt=$nextAttempts")
                                }
                            }
                        }
                    }
                } catch (e: Exception) {
                    val nextAttempts = item.attempts + 1
                    if (nextAttempts >= MAX_ATTEMPTS) {
                        done.add(item.id)
                        NexaraOffline.mediaStore().purgeRefsInBody(item.body)
                        Log.w("OfflineSync", "Dropping ${item.id}: max attempts after error")
                    } else {
                        queue.upsert(
                            item.copy(
                                attempts = nextAttempts,
                                lastAttemptAt = System.currentTimeMillis(),
                                lastError = e.message?.take(120),
                            ),
                        )
                        Log.w("OfflineSync", "replay failed ${item.id}: ${e.message}")
                    }
                }
                // Pequeña pausa entre mutaciones para no saturar.
                delay(80)
            }
        }
        if (done.isNotEmpty()) queue.removeIds(done)
        val remaining = queue.load().size
        _syncStatus.value = OfflineSyncStatus(
            isSyncing = false,
            lastSyncAt = System.currentTimeMillis(),
            lastReplayed = done.size,
            lastPending = remaining,
        )
        Log.i("OfflineSync", "Replayed ${done.size}/${pending.size} mutations, $remaining remaining")
    }

    /** Reintenta una sola mutación por id (swipe o acción en cola). */
    suspend fun replaySingle(
        queue: OfflineMutationQueue,
        bearerToken: String?,
        itemId: String,
    ): Boolean = mutex.withLock {
        if (bearerToken.isNullOrBlank()) return@withLock false
        if (!NetworkMonitor.isOnline.value) return@withLock false

        val item = queue.load().find { it.id == itemId } ?: return@withLock false

        _syncStatus.value = _syncStatus.value.copy(isSyncing = true)
        val success = withContext(Dispatchers.IO) {
            replayOne(queue, item, bearerToken)
        }
        val remaining = queue.load().size
        _syncStatus.value = OfflineSyncStatus(
            isSyncing = false,
            lastSyncAt = System.currentTimeMillis(),
            lastReplayed = if (success) 1 else 0,
            lastPending = remaining,
        )
        success
    }

    private fun replayOne(
        queue: OfflineMutationQueue,
        item: QueuedMutation,
        bearerToken: String,
    ): Boolean {
        try {
            val expanded = NexaraOffline.mediaStore().expandMediaRefs(item.body)
            val body = expanded?.toRequestBody(item.contentType.toMediaType())
            val req = Request.Builder()
                .url(item.url)
                .method(item.method, body)
                .header("Authorization", "Bearer $bearerToken")
                .header("Content-Type", item.contentType)
                .build()
            client.newCall(req).execute().use { res ->
                when {
                    res.isSuccessful -> {
                        queue.removeIds(setOf(item.id))
                        NexaraOffline.mediaStore().purgeRefsInBody(item.body)
                        return true
                    }
                    res.code in PERMANENT_CLIENT -> {
                        queue.removeIds(setOf(item.id))
                        NexaraOffline.mediaStore().purgeRefsInBody(item.body)
                        Log.w("OfflineSync", "Dropping ${item.id}: permanent HTTP ${res.code}")
                        return false
                    }
                    else -> {
                        val nextAttempts = item.attempts + 1
                        if (nextAttempts >= MAX_ATTEMPTS) {
                            queue.removeIds(setOf(item.id))
                            NexaraOffline.mediaStore().purgeRefsInBody(item.body)
                            Log.w("OfflineSync", "Dropping ${item.id}: max attempts ($MAX_ATTEMPTS)")
                            return false
                        }
                        queue.upsert(
                            item.copy(
                                attempts = nextAttempts,
                                lastAttemptAt = System.currentTimeMillis(),
                                lastError = "HTTP ${res.code}",
                            ),
                        )
                        return false
                    }
                }
            }
        } catch (e: Exception) {
            val nextAttempts = item.attempts + 1
            if (nextAttempts >= MAX_ATTEMPTS) {
                queue.removeIds(setOf(item.id))
                NexaraOffline.mediaStore().purgeRefsInBody(item.body)
                Log.w("OfflineSync", "Dropping ${item.id}: max attempts after error")
            } else {
                queue.upsert(
                    item.copy(
                        attempts = nextAttempts,
                        lastAttemptAt = System.currentTimeMillis(),
                        lastError = e.message?.take(120),
                    ),
                )
            }
            Log.w("OfflineSync", "replaySingle failed ${item.id}: ${e.message}")
            return false
        }
    }
}
