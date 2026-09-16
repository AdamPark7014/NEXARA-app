package mx.nexara.mobile.nativeapp.push

import android.content.Context
import android.util.Log
import java.util.concurrent.Executors

/**
 * Conversación de chat visible en pantalla ahora mismo. Un push de chat de esa
 * conversación no se muestra (el mensaje ya aparece en vivo), igual que WhatsApp.
 * Solo aplica a chat: los eventos siempre se notifican.
 */
object ActiveConversation {
    @Volatile
    var openThreadId: String? = null

    private val worker by lazy { Executors.newSingleThreadExecutor() }

    fun isOpen(threadId: String): Boolean = threadId.isNotBlank() && openThreadId == threadId

    /** Marca [threadId] como abierta, quita su notificación y borra su historial apilado. */
    fun open(context: Context, threadId: String) {
        if (threadId.isBlank()) return
        openThreadId = threadId
        val app = context.applicationContext
        try {
            worker.execute { NexaraPushRenderer.dismissChatThread(app, threadId) }
        } catch (e: Exception) {
            Log.w("ActiveConversation", "No se pudo limpiar la notificación: ${e.message}")
        }
    }

    /** Solo limpia si [threadId] sigue siendo la abierta (el cambio de chat no pisa a la nueva). */
    fun close(threadId: String) {
        if (openThreadId == threadId) openThreadId = null
    }
}
