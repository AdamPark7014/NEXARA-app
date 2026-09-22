package mx.nexara.mobile.nativeapp.push

import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.os.Build
import androidx.core.app.NotificationCompat
import androidx.core.app.Person
import mx.nexara.mobile.nativeapp.MainActivity
import mx.nexara.mobile.nativeapp.R

/**
 * Canales y utilidades de notificaciones locales. Se usa tanto desde FCM
 * (notificaciones push recibidas en background) como desde la app (p. ej.
 * recordatorios de asistencia, evidencias pendientes, etc.).
 */
object NexaraNotifications {
    const val CHANNEL_DEFAULT = "nexara_default"
    const val CHANNEL_ALERTS = "nexara_alerts"
    const val CHANNEL_TICKETS = "nexara_tickets"
    const val CHANNEL_GPS = "nexara_gps"
    const val CHANNEL_CHAT = "nexara_chat"

    fun ensureChannels(context: Context) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
        val nm = context.getSystemService(NotificationManager::class.java) ?: return
        val channels = listOf(
            NotificationChannel(CHANNEL_DEFAULT, "General", NotificationManager.IMPORTANCE_DEFAULT)
                .apply { description = "Notificaciones generales" },
            NotificationChannel(CHANNEL_ALERTS, "Alertas", NotificationManager.IMPORTANCE_HIGH)
                .apply { description = "Alertas urgentes (GPS fuera de ruta, fallas, etc.)" },
            NotificationChannel(CHANNEL_TICKETS, "Tickets", NotificationManager.IMPORTANCE_HIGH)
                .apply { description = "Tickets nuevos y actualizaciones" },
            NotificationChannel(CHANNEL_GPS, "Seguimiento", NotificationManager.IMPORTANCE_LOW)
                .apply { description = "Estado de envío de ubicación en segundo plano" },
            NotificationChannel(CHANNEL_CHAT, "Chat y mensajes", NotificationManager.IMPORTANCE_DEFAULT)
                .apply { description = "Conversaciones y menciones" },
        )
        channels.forEach { nm.createNotificationChannel(it) }
    }

    fun show(
        context: Context,
        title: String?,
        body: String?,
        channel: String = CHANNEL_DEFAULT,
        data: Map<String, String> = emptyMap(),
        notificationId: Int = System.currentTimeMillis().toInt(),
    ) {
        ensureChannels(context)

        // WhatsApp-like: si es chat/menCIÓN, usar MessagingStyle y agrupar por hilo
        val category = (data["category"] ?: data["type"] ?: "").lowercase()
        val hasChatId = !data["chatId"].isNullOrBlank() || !data["channelId"].isNullOrBlank()
        val entityType = (data["entityType"] ?: "").lowercase()
        if (category == "chat" || entityType.contains("chat") || hasChatId) {
            val chatIdStr = data["chatId"] ?: data["channelId"] ?: ""
            val stableId = if (chatIdStr.isNotBlank()) {
                ("chat:$chatIdStr").hashCode()
            } else {
                notificationId
            }
            val sender = data["sender"] ?: data["senderName"] ?: ""
            val conversationTitle = data["conversationTitle"] ?: data["channelName"] ?: title ?: "Chat"
            return showChatMessage(
                context = context,
                senderName = sender.ifBlank { "Mensaje" },
                message = body ?: "",
                conversationTitle = conversationTitle,
                chatId = chatIdStr.ifBlank { null },
                data = data,
                notificationId = stableId,
            )
        }

        val intent = Intent(context, MainActivity::class.java).apply {
            flags = Intent.FLAG_ACTIVITY_SINGLE_TOP or Intent.FLAG_ACTIVITY_CLEAR_TOP
            data.forEach { (k, v) -> putExtra("nexara_$k", v) }
        }
        val pending = PendingIntent.getActivity(
            context,
            notificationId,
            intent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
        )
        val builder = NotificationCompat.Builder(context, channel)
            .setSmallIcon(R.mipmap.ic_launcher)
            .setContentTitle(title ?: "NEXARA")
            .setContentText(body ?: "")
            .setAutoCancel(true)
            .setContentIntent(pending)
            .setPriority(NotificationCompat.PRIORITY_DEFAULT)
        if (!body.isNullOrBlank()) {
            builder.setStyle(NotificationCompat.BigTextStyle().bigText(body))
        }
        val nm = androidx.core.app.NotificationManagerCompat.from(context)
        try {
            nm.notify(notificationId, builder.build())
        } catch (_: SecurityException) {
            // Sin permiso POST_NOTIFICATIONS en Android 13+ -> ignorar silenciosamente.
        }
    }

    /**
     * Notificación estilo conversación (MessagingStyle) agrupada por hilo/chat.
     * Usa notificationId estable por chat para actualizar el mismo hilo.
     */
    fun showChatMessage(
        context: Context,
        senderName: String,
        message: String,
        conversationTitle: String,
        chatId: String? = null,
        data: Map<String, String> = emptyMap(),
        notificationId: Int = System.currentTimeMillis().toInt(),
    ) {
        ensureChannels(context)
        val me = Person.Builder().setName("Tú").build()
        val sender = Person.Builder().setName(senderName.ifBlank { "Mensaje" }).build()
        val style = NotificationCompat.MessagingStyle(me)
            .setConversationTitle(conversationTitle)
            .setGroupConversation(true)
            .addMessage(
                NotificationCompat.MessagingStyle.Message(
                    message,
                    System.currentTimeMillis(),
                    sender
                )
            )
        val intent = Intent(context, MainActivity::class.java).apply {
            flags = Intent.FLAG_ACTIVITY_SINGLE_TOP or Intent.FLAG_ACTIVITY_CLEAR_TOP
            putExtra("nexara_category", "chat")
            if (!chatId.isNullOrBlank()) {
                putExtra("nexara_channelId", chatId)
            }
            data.forEach { (k, v) -> putExtra("nexara_$k", v) }
        }
        val pending = PendingIntent.getActivity(
            context,
            notificationId,
            intent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
        )
        val builder = NotificationCompat.Builder(context, CHANNEL_CHAT)
            .setSmallIcon(R.mipmap.ic_launcher)
            .setContentTitle(conversationTitle)
            .setContentText("$senderName: $message")
            .setStyle(style)
            .setCategory(NotificationCompat.CATEGORY_MESSAGE)
            .setAutoCancel(true)
            .setContentIntent(pending)
            .setPriority(NotificationCompat.PRIORITY_HIGH)
        if (chatId != null) {
            builder.setGroup("chat:$chatId")
        }
        val nm = androidx.core.app.NotificationManagerCompat.from(context)
        try {
            nm.notify(notificationId, builder.build())
        } catch (_: SecurityException) {
            // Sin permiso POST_NOTIFICATIONS (Android 13+)
        }
    }
}
