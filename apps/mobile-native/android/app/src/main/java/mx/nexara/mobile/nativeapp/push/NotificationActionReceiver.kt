package mx.nexara.mobile.nativeapp.push

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.util.Log
import androidx.core.app.NotificationManagerCompat
import androidx.core.app.RemoteInput
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.launch
import mx.nexara.mobile.nativeapp.data.chat.ChatRepository
import mx.nexara.mobile.nativeapp.data.notifications.NotificationsRepository

/**
 * Botones de la notificación, sin abrir la app: «Responder» y «Marcar como leído»
 * en el chat, «Marcar como leída» en los eventos.
 */
class NotificationActionReceiver : BroadcastReceiver() {

    override fun onReceive(context: Context, intent: Intent) {
        val app = context.applicationContext
        val pending = goAsync()
        CoroutineScope(SupervisorJob() + Dispatchers.IO).launch {
            try {
                when (intent.action) {
                    ACTION_REPLY -> reply(app, intent)
                    ACTION_CHAT_READ -> chatRead(app, intent)
                    ACTION_EVENT_READ -> eventRead(app, intent)
                }
            } catch (e: Exception) {
                Log.w(TAG, "Acción de notificación falló: ${e.message}")
            } finally {
                pending.finish()
            }
        }
    }

    private suspend fun reply(app: Context, intent: Intent) {
        val threadId = intent.getStringExtra(EXTRA_THREAD).orEmpty()
        val channelId = threadId.toLongOrNull() ?: return
        val text = RemoteInput.getResultsFromIntent(intent)
            ?.getCharSequence(KEY_REPLY)
            ?.toString()
            ?.trim()
            .orEmpty()
        if (text.isEmpty()) return
        val repo = ChatRepository(app)
        val sent = runCatching { repo.send(channelId, text) }.isSuccess
        // Quitar la notificación también detiene el indicador de «enviando» del sistema.
        NexaraPushRenderer.dismissChatThread(app, threadId)
        if (sent) {
            repo.markRead(channelId)
        } else {
            NexaraNotifications.show(
                context = app,
                title = "No se envió tu respuesta",
                body = text,
                channel = NexaraNotifications.CHANNEL_CHAT,
                data = mapOf("category" to "chat", "channelId" to threadId),
            )
        }
    }

    private suspend fun chatRead(app: Context, intent: Intent) {
        val threadId = intent.getStringExtra(EXTRA_THREAD).orEmpty()
        val channelId = threadId.toLongOrNull() ?: return
        NexaraPushRenderer.dismissChatThread(app, threadId)
        ChatRepository(app).markRead(channelId)
    }

    private suspend fun eventRead(app: Context, intent: Intent) {
        val shownId = intent.getIntExtra(EXTRA_SHOWN_ID, 0)
        if (shownId != 0) NotificationManagerCompat.from(app).cancel(shownId)
        val serverId = intent.getStringExtra(EXTRA_SERVER_ID)?.toLongOrNull() ?: return
        runCatching { NotificationsRepository(app).markRead(serverId) }
    }

    companion object {
        private const val TAG = "NexaraPushAction"
        const val ACTION_REPLY = "mx.nexara.mobile.push.REPLY"
        const val ACTION_CHAT_READ = "mx.nexara.mobile.push.CHAT_READ"
        const val ACTION_EVENT_READ = "mx.nexara.mobile.push.EVENT_READ"
        const val KEY_REPLY = "nx_reply"
        const val EXTRA_THREAD = "nx_thread"
        const val EXTRA_SHOWN_ID = "nx_shown_id"
        const val EXTRA_SERVER_ID = "nx_server_id"
    }
}
