package mx.nexara.mobile.nativeapp.push

import android.os.Build
import java.text.SimpleDateFormat
import java.util.Locale

/**
 * Push de NEXARA ya interpretado. El API manda a Android mensajes solo de datos
 * (sin bloque `notification`), así que la app siempre pinta la notificación.
 *
 * - `kind=chat` + `thread_id`: mensaje de chat, se apila por conversación.
 * - cualquier otro caso: evento (actividad, revisión, asistencia, alerta…).
 */
internal data class PushPayload(
    /** Payload FCM original (se reenvía como extras del deep link). */
    val raw: Map<String, String>,
    val kind: Kind,
    /** Id del canal Android (`NexaraNotifications.CHANNEL_*`). */
    val channelId: String,
    val title: String,
    val body: String,
    val url: String,
    val tag: String,
    val collapseKey: String,
    val notificationId: String,
    val senderId: String,
    val senderName: String,
    val senderAvatar: String,
    val threadId: String,
    val threadTitle: String,
    val messageId: String,
    val sentAtMillis: Long,
    /** Tipo de evento del servidor (`entrada`, `aprobada`, `chat`…): decide el glifo y el color de la insignia. */
    val icon: String,
) {
    enum class Kind { CHAT, EVENT }

    companion object {
        fun from(
            data: Map<String, String>,
            fallbackTitle: String? = null,
            fallbackBody: String? = null,
            fallbackSentAt: Long = 0L,
        ): PushPayload {
            fun v(key: String): String = data[key]?.trim().orEmpty()

            val kindRaw = v("kind").lowercase()
            val routing = v("channel")
            val threadId = v("thread_id").ifBlank {
                if (kindRaw == "chat") v("channelId").ifBlank { routing.takeIf { it.toLongOrNull() != null }.orEmpty() } else ""
            }
            val kind = if (kindRaw == "chat" && threadId.isNotBlank()) Kind.CHAT else Kind.EVENT
            val channelId = when {
                kind == Kind.CHAT -> NexaraNotifications.CHANNEL_CHAT
                // Payloads viejos usan `channel` numérico para el canal de chat.
                routing.isNotBlank() && routing.toLongOrNull() == null ->
                    NexaraNotifications.notificationChannelFrom(routing)
                else -> inferChannel(v("category"), v("entityType"), routing)
            }
            return PushPayload(
                raw = data,
                kind = kind,
                channelId = channelId,
                title = v("title").ifBlank { fallbackTitle?.trim().orEmpty() },
                body = v("body").ifBlank { fallbackBody?.trim().orEmpty() },
                url = v("url"),
                tag = v("tag"),
                collapseKey = v("collapse_key"),
                notificationId = v("nexara_notification_id"),
                senderId = v("sender_id"),
                senderName = v("sender_name"),
                senderAvatar = v("sender_avatar"),
                threadId = threadId,
                threadTitle = v("thread_title"),
                messageId = v("message_id"),
                sentAtMillis = parseTimestamp(v("sent_at"))
                    ?: fallbackSentAt.takeIf { it > 0L }
                    ?: System.currentTimeMillis(),
                icon = v("icon").lowercase(),
            )
        }

        private fun inferChannel(category: String, entityType: String, routing: String): String {
            val c = category.lowercase()
            val e = entityType.lowercase()
            return when {
                routing.toLongOrNull() != null || c == "chat" || e.startsWith("chat") -> NexaraNotifications.CHANNEL_CHAT
                c in setOf("attendance", "lunch_breaks", "lunch_break", "comidas") ||
                    e in setOf("attendance", "attendanceday", "lunchbreak", "lunch_break") ->
                    NexaraNotifications.CHANNEL_ATTENDANCE
                c in setOf("activities", "evidences", "evidence", "tickets") ||
                    e in setOf("activity", "activities", "ticket", "tickets") ->
                    NexaraNotifications.CHANNEL_OPS
                else -> NexaraNotifications.CHANNEL_DEFAULT
            }
        }

        private val ISO = Regex(
            """^(\d{4}-\d{2}-\d{2})[T ](\d{2}:\d{2})(:\d{2})?(?:\.(\d+))?\s*(Z|[+-]\d{2}:?\d{2})?$""",
            RegexOption.IGNORE_CASE,
        )

        /** ISO-8601 o epoch (s/ms). Sin java.time: minSdk 24 no lo trae sin desugaring. */
        fun parseTimestamp(raw: String): Long? {
            val value = raw.trim()
            if (value.isEmpty()) return null
            value.toLongOrNull()?.let { n ->
                if (n <= 0L) return null
                return if (n < 100_000_000_000L) n * 1000L else n
            }
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                runCatching { return java.time.OffsetDateTime.parse(value).toInstant().toEpochMilli() }
                runCatching { return java.time.Instant.parse(value).toEpochMilli() }
            }
            val m = ISO.find(value) ?: return null
            val date = m.groupValues[1]
            val hm = m.groupValues[2]
            val sec = m.groupValues[3].ifBlank { ":00" }
            val fraction = m.groupValues[4].padEnd(3, '0').take(3)
            val zone = m.groupValues[5].let { z ->
                if (z.isBlank() || z.equals("Z", ignoreCase = true)) "+0000" else z.replace(":", "")
            }
            return runCatching {
                SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss.SSSZ", Locale.US)
                    .parse("${date}T$hm$sec.$fraction$zone")?.time
            }.getOrNull()
        }
    }
}
