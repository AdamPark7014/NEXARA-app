package mx.nexara.mobile.nativeapp.push

import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.os.Build
import androidx.core.app.NotificationCompat
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
    const val CHANNEL_OPS = "nexara_ops"
    const val CHANNEL_CHAT = "nexara_chat"
    const val CHANNEL_APPROVALS = "nexara_approvals"

    /** Valores de `channel` en payload FCM que enrutan la notificación, no el chat. */
    private val ROUTING_CHANNEL_KEYS = setOf(
        "alerts", "tickets", "gps", "default", "ops", "chat", "approvals",
    )

    /** Extrae datos de deep link del payload FCM, sin mezclar canal de notificación con chat. */
    fun deepLinkDataFrom(data: Map<String, String>): Map<String, String> {
        if (data.isEmpty()) return emptyMap()
        val out = data.filterValues { it.isNotBlank() }.toMutableMap()
        out["channel"]?.let { routing ->
            if (routing.lowercase() in ROUTING_CHANNEL_KEYS) out.remove("channel")
        }
        return out
    }

    fun notificationChannelFrom(routingKey: String?): String = when (routingKey?.lowercase()) {
        "alerts" -> CHANNEL_ALERTS
        "tickets" -> CHANNEL_TICKETS
        "gps" -> CHANNEL_GPS
        "ops" -> CHANNEL_OPS
        "chat" -> CHANNEL_CHAT
        "approvals" -> CHANNEL_APPROVALS
        else -> CHANNEL_DEFAULT
    }

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
            NotificationChannel(CHANNEL_OPS, "Operación", NotificationManager.IMPORTANCE_HIGH)
                .apply { description = "Actividades, evidencias, viáticos y despacho" },
            NotificationChannel(CHANNEL_CHAT, "Chat", NotificationManager.IMPORTANCE_DEFAULT)
                .apply { description = "Menciones y mensajes del equipo" },
            NotificationChannel(CHANNEL_APPROVALS, "Aprobaciones", NotificationManager.IMPORTANCE_HIGH)
                .apply { description = "Flujos de aprobación y validaciones" },
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
        val linkData = deepLinkDataFrom(data)
        // ID estable: colapsa actualizaciones de la misma entidad/acción.
        val stableId = data["nexara_notification_id"]?.toIntOrNull()
            ?: data["tag"]?.hashCode()
            ?: data["collapse_key"]?.hashCode()
            ?: notificationId
        val intent = Intent(context, MainActivity::class.java).apply {
            flags = Intent.FLAG_ACTIVITY_SINGLE_TOP or Intent.FLAG_ACTIVITY_CLEAR_TOP
            linkData.forEach { (k, v) -> putExtra("nexara_$k", v) }
            data["url"]?.takeIf { it.isNotBlank() }?.let { putExtra("nexara_url", it) }
        }
        val pending = PendingIntent.getActivity(
            context,
            stableId,
            intent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
        )
        val high = data["priority"]?.equals("high", ignoreCase = true) == true ||
            channel == CHANNEL_ALERTS || channel == CHANNEL_TICKETS || channel == CHANNEL_OPS
        val builder = NotificationCompat.Builder(context, channel)
            .setSmallIcon(R.mipmap.ic_launcher)
            .setContentTitle(title ?: "NEXARA")
            .setContentText(body ?: "")
            .setAutoCancel(true)
            .setContentIntent(pending)
            .setPriority(if (high) NotificationCompat.PRIORITY_HIGH else NotificationCompat.PRIORITY_DEFAULT)
            .setCategory(NotificationCompat.CATEGORY_MESSAGE)
        data["tag"]?.takeIf { it.isNotBlank() }?.let { builder.setGroup(it) }
        if (!body.isNullOrBlank()) {
            builder.setStyle(NotificationCompat.BigTextStyle().bigText(body))
        }
        val nm = androidx.core.app.NotificationManagerCompat.from(context)
        try {
            nm.notify(stableId, builder.build())
        } catch (_: SecurityException) {
            // Sin permiso POST_NOTIFICATIONS en Android 13+ -> ignorar silenciosamente.
        }
    }
}
