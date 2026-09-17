package mx.nexara.mobile.nativeapp.push

import android.Manifest
import android.annotation.SuppressLint
import android.app.Notification
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.graphics.Bitmap
import android.graphics.Typeface
import android.os.Build
import android.service.notification.StatusBarNotification
import android.text.SpannableStringBuilder
import android.text.Spanned
import android.text.style.StyleSpan
import android.util.Log
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import androidx.core.app.Person
import androidx.core.content.ContextCompat
import androidx.core.content.LocusIdCompat
import androidx.core.content.pm.ShortcutInfoCompat
import androidx.core.content.pm.ShortcutManagerCompat
import androidx.core.graphics.drawable.IconCompat
import mx.nexara.mobile.nativeapp.MainActivity
import mx.nexara.mobile.nativeapp.R

/**
 * Pinta todo push del servidor como notificación del sistema con aviso emergente
 * (sonido + vibración), con la app en primer plano, en segundo plano o cerrada.
 *
 * - Chat: `MessagingStyle` por conversación; cada mensaje nuevo se agrega a la
 *   misma notificación (últimos 8, persistidos en [ChatNotificationStore]), con
 *   foto o iniciales del remitente y resumen «N conversaciones» si hay varias.
 * - Eventos: `BigTextStyle`, id estable por `tag` para actualizar en su sitio y
 *   resumen tipo bandeja por canal cuando hay 2 o más.
 *
 * Bloqueante (descarga de avatar ≤ ~3 s): llamar desde el hilo de FCM.
 */
internal object NexaraPushRenderer {
    private const val TAG = "NexaraPush"
    private const val GROUP_CHAT = "nx_chat"
    private const val MAX_SUMMARY_LINES = 6
    private const val SHORTCUT_PREFIX = "chat_"
    private const val PERSON_ME = "nx_me"
    private const val BURST_WINDOW_MS = 8_000L

    /** Avisos ya mostrados: el mismo puede llegar por FCM y por el socket. */
    private val seen = object : LinkedHashMap<String, Unit>(64, 0.75f, false) {
        override fun removeEldestEntry(eldest: MutableMap.MutableEntry<String, Unit>?) = size > 300
    }

    private fun firstTime(p: PushPayload): Boolean {
        val key = when {
            p.messageId.isNotBlank() -> "m:${p.messageId}"
            p.notificationId.isNotBlank() -> "n:${p.notificationId}"
            else -> return true
        }
        synchronized(seen) {
            if (seen.containsKey(key)) return false
            seen[key] = Unit
            return true
        }
    }

    fun render(context: Context, payload: PushPayload) {
        val app = context.applicationContext
        try {
            if (!firstTime(payload)) return
            NexaraNotifications.ensureChannels(app)
            if (!canPost(app)) return
            when (payload.kind) {
                PushPayload.Kind.CHAT -> renderChat(app, payload)
                PushPayload.Kind.EVENT -> renderEvent(app, payload)
            }
        } catch (e: Exception) {
            Log.w(TAG, "No se pudo mostrar la notificación: ${e.message}", e)
        }
    }

    fun chatNotificationId(threadId: String): Int = "chat:$threadId".hashCode()

    /** Quita la notificación de una conversación que se acaba de abrir y su historial. */
    fun dismissChatThread(context: Context, threadId: String) {
        if (threadId.isBlank()) return
        val app = context.applicationContext
        try {
            val id = chatNotificationId(threadId)
            val nm = NotificationManagerCompat.from(app)
            nm.cancel(id)
            ChatNotificationStore.clear(app, threadId)
            val remaining = activeNotifications(app).count { sbn ->
                sbn.id != id && sbn.notification.group == GROUP_CHAT && !sbn.isSummary()
            }
            // Cancelar un resumen se lleva a sus hijas: solo se quita si ya no queda ninguna.
            if (remaining == 0) nm.cancel(summaryId(GROUP_CHAT))
        } catch (e: Exception) {
            Log.w(TAG, "No se pudo quitar la notificación del chat: ${e.message}")
        }
    }

    /** Para el cierre de sesión: quita notificaciones, historial y accesos de conversaciones. */
    fun clearAll(context: Context) {
        val app = context.applicationContext
        try {
            NotificationManagerCompat.from(app).cancelAll()
            ChatNotificationStore.clearAll(app)
            val ids = ShortcutManagerCompat.getDynamicShortcuts(app)
                .map { it.id }
                .filter { it.startsWith(SHORTCUT_PREFIX) }
            if (ids.isNotEmpty()) {
                ShortcutManagerCompat.removeDynamicShortcuts(app, ids)
                ShortcutManagerCompat.removeLongLivedShortcuts(app, ids)
            }
        } catch (e: Exception) {
            Log.w(TAG, "No se pudieron limpiar las notificaciones: ${e.message}")
        }
    }

    // ---------------------------------------------------------------- chat

    private fun renderChat(app: Context, p: PushPayload) {
        val threadId = p.threadId
        if (ActiveConversation.isOpen(threadId)) return

        val notificationId = chatNotificationId(threadId)
        // Si ya no está en la bandeja (se abrió o se descartó), se empieza de cero.
        // Margen de unos segundos: con ráfagas (el teléfono vuelve a tener red) el
        // `notify` anterior todavía puede no verse en activeNotifications.
        val stillShown = activeNotifications(app).any { it.id == notificationId && it.tag == null }
        if (!stillShown) {
            val updatedAt = ChatNotificationStore.get(app, threadId)?.updatedAt ?: 0L
            if (System.currentTimeMillis() - updatedAt > BURST_WINDOW_MS) ChatNotificationStore.clear(app, threadId)
        }

        val senderName = p.senderName.ifBlank { p.title }.ifBlank { "NEXARA" }
        val text = p.body.ifBlank { "Mensaje nuevo" }
        val conversation = ChatNotificationStore.append(
            context = app,
            threadId = threadId,
            threadTitle = p.threadTitle,
            entry = ChatNotificationStore.Entry(
                messageId = p.messageId,
                senderId = p.senderId,
                senderName = senderName,
                senderAvatar = p.senderAvatar,
                text = text,
                at = p.sentAtMillis,
            ),
        )
        val isGroup = conversation.title.isNotBlank()

        val people = HashMap<String, Person>()
        val senderAvatar = NotificationAvatars.forPerson(app, senderName, p.senderAvatar, allowNetwork = true)
        val sender = person(personKey(p.senderId, senderName), senderName, senderAvatar)
        people[sender.key.orEmpty()] = sender

        val me = Person.Builder().setKey(PERSON_ME).setName("Tú").build()
        val style = NotificationCompat.MessagingStyle(me).setGroupConversation(isGroup)
        if (isGroup) style.setConversationTitle(conversation.title)
        conversation.messages.forEach { m ->
            val key = personKey(m.senderId, m.senderName)
            val author = people.getOrPut(key) {
                person(
                    key,
                    m.senderName,
                    NotificationAvatars.forPerson(app, m.senderName, m.senderAvatar, allowNetwork = false),
                )
            }
            style.addMessage(m.text, m.at, author)
        }

        val conversationName = if (isGroup) conversation.title else senderName
        val conversationIcon = if (isGroup) NotificationAvatars.initials(conversation.title) else senderAvatar
        val collapsedText = if (isGroup) "$senderName: $text" else text
        val linkData = chatLinkData(p)

        val builder = baseBuilder(app, NexaraNotifications.CHANNEL_CHAT, p.sentAtMillis)
            .setContentTitle(conversationName)
            .setContentText(collapsedText)
            .setStyle(style)
            .setLargeIcon(conversationIcon)
            .setCategory(NotificationCompat.CATEGORY_MESSAGE)
            .setGroup(GROUP_CHAT)
            .setNumber(conversation.messages.size)
            .setContentIntent(contentIntent(app, notificationId, linkData))
            .setPublicVersion(publicVersion(app, NexaraNotifications.CHANNEL_CHAT, "Nuevo mensaje", p.sentAtMillis))

        publishConversationShortcut(
            app = app,
            threadId = threadId,
            name = conversationName,
            icon = conversationIcon,
            person = if (isGroup) null else sender,
        )?.let { shortcutId ->
            builder.setShortcutId(shortcutId)
            builder.setLocusId(LocusIdCompat(shortcutId))
        }

        notify(app, notificationId, builder.build())
        refreshChatSummary(app, notificationId, summaryLine(conversationName, collapsedText), conversation.messages.size)
    }

    private fun refreshChatSummary(app: Context, postedId: Int, postedLine: CharSequence, postedCount: Int) {
        val others = activeNotifications(app)
            .filter { it.id != postedId && it.notification.group == GROUP_CHAT && !it.isSummary() }
            .sortedByDescending { it.postTime }
        val conversations = others.size + 1
        if (conversations < 2) return
        val messages = postedCount + others.sumOf { maxOf(it.notification.number, 1) }
        postSummary(
            app = app,
            channelId = NexaraNotifications.CHANNEL_CHAT,
            group = GROUP_CHAT,
            title = "$conversations conversaciones",
            summaryText = if (messages == 1) "1 mensaje" else "$messages mensajes",
            lines = listOf(postedLine) + others.map { lineOf(it) },
            total = conversations,
            intentData = mapOf("category" to "chat"),
            publicText = "Nuevo mensaje",
        )
    }

    /** Datos del deep link de chat: garantiza canal y algo navegable para el resolver. */
    private fun chatLinkData(p: PushPayload): Map<String, String> {
        val out = p.raw.toMutableMap()
        if (out["channelId"].isNullOrBlank() && p.threadId.toLongOrNull() != null) {
            out["channelId"] = p.threadId
        }
        val navigable = listOf("url", "relatedUrl", "entityType", "category").any { !out[it].isNullOrBlank() }
        if (!navigable) out["category"] = "chat"
        return out
    }

    private fun personKey(senderId: String, senderName: String): String =
        "nx_user_" + senderId.ifBlank { senderName.trim().lowercase() }

    private fun person(key: String, name: String, avatar: Bitmap): Person =
        Person.Builder()
            .setKey(key)
            .setName(name.ifBlank { "NEXARA" })
            .setIcon(IconCompat.createWithBitmap(avatar))
            .build()

    /**
     * Acceso de conversación de larga duración: en Android 11+ la notificación
     * entra en la sección «Conversaciones» (prioridad, burbuja, foto grande).
     */
    private fun publishConversationShortcut(
        app: Context,
        threadId: String,
        name: String,
        icon: Bitmap,
        person: Person?,
    ): String? {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.R) return null
        return try {
            val id = SHORTCUT_PREFIX + threadId
            val label = name.ifBlank { "Chat" }
            val intent = Intent(app, MainActivity::class.java).apply {
                action = Intent.ACTION_VIEW
                flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP or Intent.FLAG_ACTIVITY_SINGLE_TOP
                putExtra("nexara_category", "chat")
                if (threadId.toLongOrNull() != null) putExtra("nexara_channelId", threadId)
            }
            val info = ShortcutInfoCompat.Builder(app, id)
                .setShortLabel(label)
                .setLongLabel(label)
                .setIcon(IconCompat.createWithBitmap(icon))
                .setIntent(intent)
                .setLongLived(true)
                .setIsConversation()
                .setLocusId(LocusIdCompat(id))
                .apply { if (person != null) setPerson(person) }
                .build()
            ShortcutManagerCompat.pushDynamicShortcut(app, info)
            id
        } catch (e: Exception) {
            Log.d(TAG, "Sin acceso de conversación: ${e.message}")
            null
        }
    }

    // -------------------------------------------------------------- eventos

    private fun renderEvent(app: Context, p: PushPayload) {
        val channelId = p.channelId
        val notificationId = eventNotificationId(p)
        val label = NexaraNotifications.channelLabel(channelId)
        val group = eventGroupKey(channelId)
        val title = p.title.ifBlank { "NEXARA" }
        val body = p.body

        val builder = baseBuilder(app, channelId, p.sentAtMillis)
            .setContentTitle(title)
            .setSubText(label)
            .setCategory(eventCategory(channelId))
            .setGroup(group)
            .setContentIntent(contentIntent(app, notificationId, p.raw))
            .setPublicVersion(publicVersion(app, channelId, "Nueva notificación", p.sentAtMillis))
        if (body.isNotBlank()) {
            builder.setContentText(body)
                .setStyle(NotificationCompat.BigTextStyle().setBigContentTitle(title).bigText(body))
        }
        val glyphRes = NotificationEventIcons.glyphRes(p.icon)
        val badgeColor = NotificationEventIcons.color(p.icon)
        val largeIcon = if (p.senderName.isNotBlank()) {
            val avatar = NotificationAvatars.forPerson(app, p.senderName, p.senderAvatar, allowNetwork = true)
            NotificationAvatars.withBadge(app, avatar, glyphRes, badgeColor)
        } else {
            NotificationAvatars.filledGlyphCircle(app, glyphRes, badgeColor)
        }
        builder.setLargeIcon(largeIcon)

        notify(app, notificationId, builder.build())
        refreshEventSummary(app, channelId, group, notificationId, summaryLine(title, body))
    }

    private fun eventNotificationId(p: PushPayload): Int {
        val key = p.tag.ifBlank { p.collapseKey }.ifBlank { p.notificationId }
        return if (key.isNotBlank()) "evt:$key".hashCode() else (System.currentTimeMillis() and 0x7FFFFFFFL).toInt()
    }

    private fun eventGroupKey(channelId: String): String = when (channelId) {
        NexaraNotifications.CHANNEL_CHAT -> "nx_mentions"
        else -> "nx_" + channelId.removePrefix("nx2_")
    }

    private fun eventCategory(channelId: String): String = when (channelId) {
        NexaraNotifications.CHANNEL_CHAT -> NotificationCompat.CATEGORY_MESSAGE
        NexaraNotifications.CHANNEL_ATTENDANCE -> NotificationCompat.CATEGORY_REMINDER
        else -> NotificationCompat.CATEGORY_EVENT
    }

    private fun refreshEventSummary(app: Context, channelId: String, group: String, postedId: Int, postedLine: CharSequence) {
        val others = activeNotifications(app)
            .filter { it.id != postedId && it.notification.group == group && !it.isSummary() }
            .sortedByDescending { it.postTime }
        val total = others.size + 1
        if (total < 2) return
        postSummary(
            app = app,
            channelId = channelId,
            group = group,
            title = "$total notificaciones",
            summaryText = NexaraNotifications.channelLabel(channelId),
            lines = listOf(postedLine) + others.map { lineOf(it) },
            total = total,
            intentData = emptyMap(),
            publicText = "Nueva notificación",
        )
    }

    // ------------------------------------------------------------- comunes

    private fun baseBuilder(app: Context, channelId: String, sentAt: Long): NotificationCompat.Builder =
        NotificationCompat.Builder(app, channelId)
            .setSmallIcon(R.drawable.ic_stat_nexara)
            .setColor(NexaraNotifications.ACCENT_COLOR)
            .setPriority(NotificationCompat.PRIORITY_HIGH)
            .setDefaults(NotificationCompat.DEFAULT_ALL)
            .setAutoCancel(true)
            .setWhen(minOf(sentAt, System.currentTimeMillis()))
            .setShowWhen(true)
            .setVisibility(NotificationCompat.VISIBILITY_PRIVATE)

    private fun publicVersion(app: Context, channelId: String, text: String, sentAt: Long): Notification =
        NotificationCompat.Builder(app, channelId)
            .setSmallIcon(R.drawable.ic_stat_nexara)
            .setColor(NexaraNotifications.ACCENT_COLOR)
            .setContentTitle("NEXARA")
            .setContentText(text)
            .setWhen(minOf(sentAt, System.currentTimeMillis()))
            .setShowWhen(true)
            .build()

    private fun postSummary(
        app: Context,
        channelId: String,
        group: String,
        title: String,
        summaryText: String,
        lines: List<CharSequence>,
        total: Int,
        intentData: Map<String, String>,
        publicText: String,
    ) {
        val id = summaryId(group)
        val style = NotificationCompat.InboxStyle().setBigContentTitle(title)
        lines.take(MAX_SUMMARY_LINES).forEach { style.addLine(it) }
        val extra = lines.size - MAX_SUMMARY_LINES
        style.setSummaryText(if (extra > 0) "$summaryText · +$extra más" else summaryText)
        val builder = NotificationCompat.Builder(app, channelId)
            .setSmallIcon(R.drawable.ic_stat_nexara)
            .setColor(NexaraNotifications.ACCENT_COLOR)
            .setContentTitle(title)
            .setContentText(lines.firstOrNull() ?: "")
            .setSubText(summaryText)
            .setStyle(style)
            .setGroup(group)
            .setGroupSummary(true)
            // El resumen nunca suena: el aviso lo da la notificación hija.
            .setGroupAlertBehavior(NotificationCompat.GROUP_ALERT_CHILDREN)
            .setOnlyAlertOnce(true)
            .setAutoCancel(true)
            .setNumber(total)
            .setPriority(NotificationCompat.PRIORITY_HIGH)
            .setVisibility(NotificationCompat.VISIBILITY_PRIVATE)
            .setPublicVersion(publicVersion(app, channelId, publicText, System.currentTimeMillis()))
            .setContentIntent(contentIntent(app, id, intentData))
        notify(app, id, builder.build())
    }

    private fun summaryId(group: String): Int = "summary:$group".hashCode()

    /** Abre MainActivity con los extras `nexara_*` que lee NotificationDeepLinkResolver. */
    private fun contentIntent(app: Context, requestCode: Int, data: Map<String, String>): PendingIntent {
        val linkData = NexaraNotifications.deepLinkDataFrom(data)
        val intent = Intent(app, MainActivity::class.java).apply {
            flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_SINGLE_TOP or Intent.FLAG_ACTIVITY_CLEAR_TOP
            linkData.forEach { (k, v) -> putExtra("nexara_$k", v) }
            data["url"]?.takeIf { it.isNotBlank() }?.let { putExtra("nexara_url", it) }
        }
        return PendingIntent.getActivity(
            app,
            requestCode,
            intent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
        )
    }

    private fun summaryLine(title: String, text: String): CharSequence {
        val sb = SpannableStringBuilder()
        if (title.isNotBlank()) {
            sb.append(title, StyleSpan(Typeface.BOLD), Spanned.SPAN_EXCLUSIVE_EXCLUSIVE)
            if (text.isNotBlank()) sb.append("  ")
        }
        sb.append(text)
        return sb
    }

    private fun lineOf(sbn: StatusBarNotification): CharSequence {
        val extras = sbn.notification.extras
        return summaryLine(
            extras.getCharSequence(Notification.EXTRA_TITLE)?.toString().orEmpty(),
            extras.getCharSequence(Notification.EXTRA_TEXT)?.toString().orEmpty(),
        )
    }

    private fun StatusBarNotification.isSummary(): Boolean =
        (notification.flags and Notification.FLAG_GROUP_SUMMARY) != 0

    private fun activeNotifications(context: Context): List<StatusBarNotification> = try {
        context.getSystemService(NotificationManager::class.java)?.activeNotifications?.toList().orEmpty()
    } catch (e: Exception) {
        emptyList()
    }

    private fun canPost(context: Context): Boolean {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU &&
            ContextCompat.checkSelfPermission(context, Manifest.permission.POST_NOTIFICATIONS) !=
            PackageManager.PERMISSION_GRANTED
        ) {
            return false
        }
        return NotificationManagerCompat.from(context).areNotificationsEnabled()
    }

    @SuppressLint("MissingPermission")
    private fun notify(context: Context, id: Int, notification: Notification) {
        try {
            NotificationManagerCompat.from(context).notify(id, notification)
        } catch (e: SecurityException) {
            // Sin permiso POST_NOTIFICATIONS (Android 13+): se ignora en silencio.
        } catch (e: Exception) {
            Log.w(TAG, "notify falló: ${e.message}")
        }
    }
}
