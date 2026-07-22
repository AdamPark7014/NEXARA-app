package mx.nexara.mobile.nativeapp.data.offline

import android.content.Context
import com.squareup.moshi.JsonClass
import com.squareup.moshi.Moshi
import com.squareup.moshi.Types
import com.squareup.moshi.kotlin.reflect.KotlinJsonAdapterFactory
import java.io.File

/**
 * Cola de mutaciones offline — equivalente a apps/web/lib/offline-queue.ts.
 * Persiste en disco y reintenta al recuperar conexión.
 */
@JsonClass(generateAdapter = true)
data class QueuedMutation(
    val id: String,
    val method: String,
    val url: String,
    val body: String? = null,
    val contentType: String = "application/json",
    val createdAt: Long = System.currentTimeMillis(),
    val attempts: Int = 0,
    val lastAttemptAt: Long? = null,
    val lastError: String? = null,
)

class OfflineMutationQueue(context: Context) {
    private val file = File(context.filesDir, "nexara_offline_queue.json")
    private val moshi = Moshi.Builder().add(KotlinJsonAdapterFactory()).build()
    private val listType = Types.newParameterizedType(List::class.java, QueuedMutation::class.java)
    private val adapter = moshi.adapter<List<QueuedMutation>>(listType)
    private val listeners = mutableListOf<() -> Unit>()

    @Synchronized
    fun enqueue(item: QueuedMutation) {
        val next = load().toMutableList()
        next.add(item)
        save(next)
        notifyChanged()
    }

    @Synchronized
    fun load(): List<QueuedMutation> {
        if (!file.exists()) return emptyList()
        return runCatching { adapter.fromJson(file.readText()) }.getOrNull() ?: emptyList()
    }

    @Synchronized
    fun removeIds(ids: Set<String>) {
        if (ids.isEmpty()) return
        save(load().filterNot { it.id in ids })
        notifyChanged()
    }

    @Synchronized
    fun upsert(item: QueuedMutation) {
        val next = load().toMutableList()
        val idx = next.indexOfFirst { it.id == item.id }
        if (idx >= 0) next[idx] = item else next.add(item)
        save(next)
        notifyChanged()
    }

    @Synchronized
    fun clear() {
        if (file.exists()) file.delete()
        notifyChanged()
    }

    fun addListener(listener: () -> Unit) {
        synchronized(listeners) { listeners.add(listener) }
    }

    fun removeListener(listener: () -> Unit) {
        synchronized(listeners) { listeners.remove(listener) }
    }

    private fun notifyChanged() {
        val copy = synchronized(listeners) { listeners.toList() }
        copy.forEach { runCatching { it() } }
    }

    private fun save(items: List<QueuedMutation>) {
        file.writeText(adapter.toJson(items))
    }
}
