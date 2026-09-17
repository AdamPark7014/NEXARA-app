package mx.nexara.mobile.nativeapp.push

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationChannelGroup
import android.app.NotificationManager
import android.content.Context
import android.media.AudioAttributes
import android.os.Build
import android.provider.Settings
import android.util.Log
import androidx.annotation.RequiresApi

/**
 * Canales y utilidades de notificaciones. Se usa desde FCM (todo push del
 * servidor llega como mensaje de datos y lo pinta [NexaraPushRenderer]) y desde
 * la app (p. ej. la notificación permanente del GPS de jornada).
 *
 * Canales v2 (`nx2_*`): la importancia de un canal no se puede subir después de
 * crearlo, así que los canales viejos (`nexara_*`, varios en IMPORTANCE_DEFAULT)
 * se borran y se crean ids nuevos, todos en IMPORTANCE_HIGH para que salgan como
 * aviso emergente con sonido y vibración.
 */
object NexaraNotifications {
    const val CHANNEL_CHAT = "nx2_chat"
    const val CHANNEL_OPS = "nx2_ops"
    const val CHANNEL_APPROVALS = "nx2_approvals"
    const val CHANNEL_ATTENDANCE = "nx2_attendance"
    const val CHANNEL_ALERTS = "nx2_alerts"
    const val CHANNEL_DEFAULT = "nx2_default"

    /** Servicios (tickets) comparten canal con Actividades. */
    const val CHANNEL_TICKETS = CHANNEL_OPS

    /** Notificación permanente del GPS de jornada: silenciosa; conserva su id. */
    const val CHANNEL_GPS = "nexara_gps"

    const val CHANNEL_GROUP = "nexara"

    /** Azul de marca (#2563EB): acento de notificaciones y luz LED. */
    const val ACCENT_COLOR: Int = 0xFF2563EB.toInt()

    private val LEGACY_CHANNELS = listOf(
        "nexara_default",
        "nexara_alerts",
        "nexara_tickets",
        "nexara_ops",
        "nexara_chat",
        "nexara_approvals",
    )

    private val VIBRATION_PATTERN = longArrayOf(0L, 220L, 120L, 220L)

    /** Valores de `channel` en payload FCM que enrutan la notificación, no el chat. */
    private val ROUTING_CHANNEL_KEYS = setOf(
        "alerts", "tickets", "gps", "default", "ops", "chat", "approvals", "attendance",
    )

    /** Extrae datos de deep link del payload FCM, sin mezclar canal de notificación con chat. */
    fun deepLinkDataFrom(data: Map<String, String>): Map<String, String> {
        if (data.isEmpty()) return emptyMap()
        val out = data.filterValues { it.isNotBlank() }.toMutableMap()
        out["channel"]?.let { routing ->
            if (routing.trim().lowercase() in ROUTING_CHANNEL_KEYS) out.remove("channel")
        }
        return out
    }

    /**
     * Canal Android para la clave `channel` del payload. `gps` (avisos del
     * servidor sobre la ubicación) va a Alertas: el canal del servicio GPS es
     * silencioso y solo es para la notificación permanente.
     */
    fun notificationChannelFrom(routingKey: String?): String = when (routingKey?.trim()?.lowercase()) {
        "chat" -> CHANNEL_CHAT
        "ops", "tickets" -> CHANNEL_OPS
        "approvals" -> CHANNEL_APPROVALS
        "attendance" -> CHANNEL_ATTENDANCE
        "alerts", "gps" -> CHANNEL_ALERTS
        else -> CHANNEL_DEFAULT
    }

    /** Etiqueta corta (subtexto) de la notificación según su canal. */
    fun channelLabel(channelId: String): String = when (channelId) {
        CHANNEL_CHAT -> "Mensajes"
        CHANNEL_OPS -> "Actividades"
        CHANNEL_APPROVALS -> "Revisiones"
        CHANNEL_ATTENDANCE -> "Asistencia"
        CHANNEL_ALERTS -> "Alertas"
        else -> "General"
    }

    @Volatile
    private var channelsReady = false

    /** Idempotente y barato tras la primera llamada del proceso. */
    fun ensureChannels(context: Context) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
        if (channelsReady) return
        synchronized(this) {
            if (channelsReady) return
            try {
                val nm = context.applicationContext.getSystemService(NotificationManager::class.java) ?: return
                nm.createNotificationChannelGroup(NotificationChannelGroup(CHANNEL_GROUP, "NEXARA"))
                val channels = listOf(
                    alertChannel(CHANNEL_CHAT, "Mensajes", "Mensajes y menciones del chat del equipo"),
                    alertChannel(CHANNEL_OPS, "Actividades", "Actividades, servicios, evidencias, atrasos y despacho"),
                    alertChannel(CHANNEL_APPROVALS, "Revisiones", "Evidencias y horas de comida por aprobar o devueltas"),
                    alertChannel(CHANNEL_ATTENDANCE, "Asistencia y comida", "Entradas, salidas y horas de comida"),
                    alertChannel(CHANNEL_ALERTS, "Alertas", "Alertas urgentes de tu jornada y ubicación"),
                    alertChannel(CHANNEL_DEFAULT, "General", "Otros avisos de NEXARA"),
                    NotificationChannel(CHANNEL_GPS, "Seguimiento", NotificationManager.IMPORTANCE_LOW).apply {
                        description = "Estado de envío de ubicación en segundo plano"
                        group = CHANNEL_GROUP
                        setShowBadge(false)
                    },
                )
                nm.createNotificationChannels(channels)
                LEGACY_CHANNELS.forEach { id ->
                    if (nm.getNotificationChannel(id) != null) nm.deleteNotificationChannel(id)
                }
                channelsReady = true
            } catch (e: Exception) {
                Log.w(TAG, "No se pudieron crear los canales: ${e.message}")
            }
        }
    }

    @RequiresApi(Build.VERSION_CODES.O)
    private fun alertChannel(
        id: String,
        name: String,
        description: String,
    ): NotificationChannel = NotificationChannel(id, name, NotificationManager.IMPORTANCE_HIGH).apply {
        this.description = description
        group = CHANNEL_GROUP
        enableVibration(true)
        vibrationPattern = VIBRATION_PATTERN
        enableLights(true)
        lightColor = ACCENT_COLOR
        setShowBadge(true)
        lockscreenVisibility = Notification.VISIBILITY_PRIVATE
        setSound(
            Settings.System.DEFAULT_NOTIFICATION_URI,
            AudioAttributes.Builder()
                .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
                .setUsage(AudioAttributes.USAGE_NOTIFICATION)
                .build(),
        )
    }

    /**
     * Notificación local con el mismo aspecto que un push de evento. [channel] es
     * un id de canal Android (`CHANNEL_*`); [data] admite las mismas claves que FCM.
     */
    fun show(
        context: Context,
        title: String?,
        body: String?,
        channel: String = CHANNEL_DEFAULT,
        data: Map<String, String> = emptyMap(),
    ) {
        val merged = data.toMutableMap()
        title?.takeIf { it.isNotBlank() }?.let { merged["title"] = it }
        body?.takeIf { it.isNotBlank() }?.let { merged["body"] = it }
        val payload = PushPayload.from(merged).copy(kind = PushPayload.Kind.EVENT, channelId = channel)
        NexaraPushRenderer.render(context, payload)
    }

    private const val TAG = "NexaraNotifications"
}
