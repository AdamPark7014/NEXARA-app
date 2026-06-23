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
}
