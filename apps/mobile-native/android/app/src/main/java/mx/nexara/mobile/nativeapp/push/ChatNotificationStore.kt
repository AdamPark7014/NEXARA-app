package mx.nexara.mobile.nativeapp.push

import android.annotation.SuppressLint
import android.content.Context
import android.content.SharedPreferences
import org.json.JSONArray
import org.json.JSONObject

/**
 * Últimos mensajes de cada conversación con notificación en la bandeja, para que
 * cada push nuevo se agregue a la misma notificación (como WhatsApp) aunque la app
 * esté cerrada y el proceso haya muerto entre un mensaje y otro.
 *
 * Guarda nombre y URL del avatar, no imágenes (esas van en caché de disco).
 */
internal object ChatNotificationStore {
    private const val PREFS = "nx_chat_notifications"
    private const val MAX_MESSAGES = 8
    private const val KEY_PREFIX = "t_"

    data class Entry(
        val messageId: String,
        val senderId: String,
        val senderName: String,
        val senderAvatar: String,
        val text: String,
        val at: Long,
    )

    data class Conversation(
        val threadId: String,
        val title: String,
        val messages: List<Entry>,
        /** Hora local (ms) de la última escritura. */
        val updatedAt: Long = 0L,
    )

    private fun prefs(context: Context): SharedPreferences =
        context.applicationContext.getSharedPreferences(PREFS, Context.MODE_PRIVATE)

    /** Agrega [entry] (sin duplicar `message_id`) y devuelve la conversación resultante. */
    @Synchronized
    fun append(context: Context, threadId: String, threadTitle: String, entry: Entry): Conversation {
        val current = read(context, threadId)
        val alreadyThere = entry.messageId.isNotBlank() &&
            current?.messages?.any { it.messageId == entry.messageId } == true
        val messages = if (alreadyThere) {
            current?.messages.orEmpty()
        } else {
            (current?.messages.orEmpty() + entry).sortedBy { it.at }.takeLast(MAX_MESSAGES)
        }
        val conversation = Conversation(
            threadId = threadId,
            title = threadTitle.ifBlank { current?.title.orEmpty() },
            messages = messages,
            updatedAt = System.currentTimeMillis(),
        )
        write(context, conversation)
        return conversation
    }

    @Synchronized
    fun get(context: Context, threadId: String): Conversation? = read(context, threadId)

    @Synchronized
    fun clear(context: Context, threadId: String) {
        if (threadId.isBlank()) return
        val p = prefs(context)
        if (p.contains(KEY_PREFIX + threadId)) commit(p.edit().remove(KEY_PREFIX + threadId))
    }

    @Synchronized
    fun clearAll(context: Context) {
        commit(prefs(context).edit().clear())
    }

    private fun read(context: Context, threadId: String): Conversation? {
        val raw = prefs(context).getString(KEY_PREFIX + threadId, null) ?: return null
        return runCatching {
            val obj = JSONObject(raw)
            val arr = obj.optJSONArray("messages") ?: JSONArray()
            val messages = (0 until arr.length()).mapNotNull { i ->
                val m = arr.optJSONObject(i) ?: return@mapNotNull null
                Entry(
                    messageId = m.optString("id"),
                    senderId = m.optString("senderId"),
                    senderName = m.optString("senderName"),
                    senderAvatar = m.optString("senderAvatar"),
                    text = m.optString("text"),
                    at = m.optLong("at"),
                )
            }
            Conversation(
                threadId = threadId,
                title = obj.optString("title"),
                messages = messages,
                updatedAt = obj.optLong("updatedAt"),
            )
        }.getOrNull()
    }

    private fun write(context: Context, conversation: Conversation) {
        val arr = JSONArray()
        conversation.messages.forEach { m ->
            arr.put(
                JSONObject()
                    .put("id", m.messageId)
                    .put("senderId", m.senderId)
                    .put("senderName", m.senderName)
                    .put("senderAvatar", m.senderAvatar)
                    .put("text", m.text)
                    .put("at", m.at),
            )
        }
        val obj = JSONObject()
            .put("title", conversation.title)
            .put("updatedAt", conversation.updatedAt)
            .put("messages", arr)
        commit(prefs(context).edit().putString(KEY_PREFIX + conversation.threadId, obj.toString()))
    }

    /**
     * `commit` y no `apply`: tras `onMessageReceived` el sistema puede matar el
     * proceso, y el siguiente push tiene que encontrar el historial en disco.
     * Siempre se llama fuera del hilo principal.
     */
    @SuppressLint("ApplySharedPref")
    private fun commit(editor: SharedPreferences.Editor) {
        editor.commit()
    }
}
