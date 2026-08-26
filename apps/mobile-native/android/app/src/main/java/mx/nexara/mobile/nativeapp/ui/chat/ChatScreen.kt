package mx.nexara.mobile.nativeapp.ui.chat

import android.app.Application
import android.content.Context
import android.net.Uri
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.ExperimentalFoundationApi
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.foundation.text.ClickableText
import androidx.compose.foundation.combinedClickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.AttachFile
import androidx.compose.material.icons.filled.AlternateEmail
import androidx.compose.material.icons.filled.ArrowBack
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.Edit
import androidx.compose.material.icons.filled.MoreVert
import androidx.compose.material.icons.filled.Person
import androidx.compose.material.icons.filled.PersonAdd
import androidx.compose.material.icons.filled.PushPin
import androidx.compose.material.icons.filled.Refresh
import androidx.compose.material.icons.filled.Reply
import androidx.compose.material.icons.filled.Send
import androidx.compose.material.icons.filled.Star
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Badge
import androidx.compose.material3.BadgedBox
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.Checkbox
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FloatingActionButton
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TopAppBar
import androidx.compose.material3.pulltorefresh.PullToRefreshBox
import androidx.compose.material3.rememberModalBottomSheetState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalLifecycleOwner
import androidx.compose.ui.text.AnnotatedString
import androidx.compose.ui.text.SpanStyle
import androidx.compose.ui.text.buildAnnotatedString
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextDecoration
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.text.withStyle
import androidx.compose.ui.unit.dp
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.LifecycleEventObserver
import androidx.lifecycle.viewModelScope
import androidx.lifecycle.viewmodel.compose.viewModel
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.async
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import mx.nexara.mobile.nativeapp.access.DeepLinkParser
import mx.nexara.mobile.nativeapp.data.SessionStore
import mx.nexara.mobile.nativeapp.navigation.PendingDeepLink
import mx.nexara.mobile.nativeapp.data.api.ChatChannelDto
import mx.nexara.mobile.nativeapp.data.api.ChatColleagueDto
import mx.nexara.mobile.nativeapp.data.api.ChatMentionDto
import mx.nexara.mobile.nativeapp.data.api.ChatReactionDto
import mx.nexara.mobile.nativeapp.data.api.toAbsoluteAssetUrl
import mx.nexara.mobile.nativeapp.ui.common.NxAsyncImage
import mx.nexara.mobile.nativeapp.data.api.ChatMessageDto
import mx.nexara.mobile.nativeapp.data.chat.ChatFavoritesStore
import mx.nexara.mobile.nativeapp.data.chat.ChatRepository
import mx.nexara.mobile.nativeapp.data.realtime.ChatTypingEvent
import mx.nexara.mobile.nativeapp.data.realtime.ChatChannelUpdatedEvent
import mx.nexara.mobile.nativeapp.data.realtime.ChatMembersChangedEvent
import mx.nexara.mobile.nativeapp.data.realtime.ChatMessageDeletedEvent
import mx.nexara.mobile.nativeapp.data.realtime.RealtimeBus
import mx.nexara.mobile.nativeapp.ui.common.PdfViewerScreen
import mx.nexara.mobile.nativeapp.ui.enterprise.NxColors
import mx.nexara.mobile.nativeapp.ui.enterprise.NxEmptyState
import mx.nexara.mobile.nativeapp.ui.enterprise.NxErrorBlock
import mx.nexara.mobile.nativeapp.ui.enterprise.NxLoadingBlock
import mx.nexara.mobile.nativeapp.ui.enterprise.NxSkeletonList
import mx.nexara.mobile.nativeapp.ui.util.downloadAuthedToCache
import mx.nexara.mobile.nativeapp.ui.util.openExternalUrl
import mx.nexara.mobile.nativeapp.ui.util.openFile
import java.io.File
import java.time.Instant
import java.time.LocalDate
import java.time.LocalDateTime
import java.time.ZoneId
import java.time.format.DateTimeFormatter
import java.util.Locale

private val chatZone: ZoneId = ZoneId.systemDefault()
private val chatTimeFmt: DateTimeFormatter = DateTimeFormatter.ofPattern("HH:mm")
private val chatDayFmt: DateTimeFormatter =
    DateTimeFormatter.ofPattern("EEEE d 'de' MMMM", Locale("es", "MX"))
private val chatChannelTimeFmt: DateTimeFormatter = DateTimeFormatter.ofPattern("dd/MM HH:mm")
private val chatEntityLinkRegex = Regex("""\[([^\]\n]+)\]\(([^)]+)\)""")

private enum class EntityMentionTarget { Main, Thread }

private fun appendChatMentionToken(current: String, token: String): String {
    val spacer = if (current.isNotEmpty() && !current.last().isWhitespace()) " " else ""
    return "$current$spacer$token "
}

private fun formatEntityMentionToken(entity: ChatMentionDto): String {
    val cleanLabel = entity.label.replace(Regex("""[\[\]\(\)]"""), "").trim()
    val href = entity.href?.takeIf { it.isNotBlank() }
        ?: when (entity.kind.uppercase()) {
            "ACTIVITY" -> "/ops/activities/${entity.id}"
            "EVIDENCE" -> "/ops/activities/${entity.id}/evidences"
            else -> "/"
        }
    val icon = when (entity.kind.uppercase()) {
        "ACTIVITY" -> "📋"
        "EVIDENCE" -> "📷"
        else -> ""
    }
    val label = if (icon.isNotEmpty()) "$icon $cleanLabel" else cleanLabel
    return "[$label]($href)"
}

private fun buildChatMessageAnnotatedString(
    text: String,
    primaryColor: Color,
    linkColor: Color,
    mentionColor: Color,
): AnnotatedString = buildAnnotatedString {
    var last = 0
    chatEntityLinkRegex.findAll(text).forEach { match ->
        val start = match.range.first
        if (start > last) {
            withStyle(SpanStyle(color = primaryColor)) {
                append(text.substring(last, start))
            }
        }
        val label = match.groupValues[1]
        val href = match.groupValues[2]
        if (href.startsWith("user:")) {
            withStyle(SpanStyle(color = mentionColor, fontWeight = FontWeight.SemiBold)) {
                append(label)
            }
        } else {
            pushStringAnnotation(tag = "entity_link", annotation = href)
            withStyle(
                SpanStyle(
                    color = linkColor,
                    fontWeight = FontWeight.Medium,
                    textDecoration = TextDecoration.Underline,
                ),
            ) {
                append(label)
            }
            pop()
        }
        last = match.range.last + 1
    }
    if (last < text.length) {
        withStyle(SpanStyle(color = primaryColor)) {
            append(text.substring(last))
        }
    }
}

private fun openChatEntityLink(href: String) {
    val dest = when {
        href.startsWith("user:") -> null
        href.startsWith("nexara://") -> DeepLinkParser.parse(Uri.parse(href))
        href.startsWith("http://") || href.startsWith("https://") -> null
        else -> DeepLinkParser.parseWebPath(href)
    }
    if (dest != null) PendingDeepLink.publish(dest)
}

private sealed class ChatListItem {
    data class DateDivider(val dayKey: String, val label: String) : ChatListItem()
    data object UnreadDivider : ChatListItem()
    data class Message(val msg: ChatMessageDto) : ChatListItem()
}

private fun parseChatInstant(iso: String): Instant? {
    return runCatching { Instant.parse(iso) }.getOrNull()
        ?: runCatching {
            LocalDateTime.parse(iso.take(19), DateTimeFormatter.ISO_LOCAL_DATE_TIME)
                .atZone(chatZone)
                .toInstant()
        }.getOrNull()
}

private fun chatDayKey(iso: String): String {
    val instant = parseChatInstant(iso) ?: return iso.take(10)
    return instant.atZone(chatZone).toLocalDate().toString()
}

private fun chatDayLabel(iso: String): String {
    val date = parseChatInstant(iso)?.atZone(chatZone)?.toLocalDate() ?: return iso.take(10)
    val today = LocalDate.now(chatZone)
    return when (date) {
        today -> "Hoy"
        today.minusDays(1) -> "Ayer"
        else -> date.format(chatDayFmt)
    }
}

private fun formatMessageTime(iso: String): String {
    val instant = parseChatInstant(iso) ?: return iso.take(16)
    return chatTimeFmt.withZone(chatZone).format(instant)
}

private fun formatChannelTime(iso: String): String {
    val instant = parseChatInstant(iso) ?: return iso.take(16)
    val zdt = instant.atZone(chatZone)
    val today = LocalDate.now(chatZone)
    val date = zdt.toLocalDate()
    return when (date) {
        today -> chatTimeFmt.format(zdt)
        today.minusDays(1) -> "Ayer"
        else -> chatChannelTimeFmt.format(zdt)
    }
}

private fun formatLastMessagePreview(preview: String?): String? {
    val raw = preview
        ?.replace(Regex("\\s+"), " ")
        ?.trim()
        ?.takeIf { it.isNotBlank() }
        ?: return null
    val normalized = when {
        raw.startsWith("Archivo:", ignoreCase = true) ->
            "📎 ${raw.removePrefix("Archivo:").trim()}"
        raw.length > 72 -> "${raw.take(72).trimEnd()}…"
        else -> raw
    }
    return normalized
}

private fun buildChatListItems(
    messages: List<ChatMessageDto>,
    currentUserId: Long,
    unreadBoundaryAt: String?,
): List<ChatListItem> {
    if (messages.isEmpty()) return emptyList()
    val result = mutableListOf<ChatListItem>()
    var lastDay: String? = null
    var dividerShown = false
    val boundaryTs = unreadBoundaryAt?.let { parseChatInstant(it)?.toEpochMilli() }
    for (msg in messages) {
        val day = chatDayKey(msg.createdAt)
        if (day != lastDay) {
            result.add(ChatListItem.DateDivider(dayKey = day, label = chatDayLabel(msg.createdAt)))
            lastDay = day
        }
        val ts = parseChatInstant(msg.createdAt)?.toEpochMilli()
        val showUnreadDivider = boundaryTs != null &&
            !dividerShown &&
            ts != null &&
            ts > boundaryTs &&
            msg.authorId != currentUserId
        if (showUnreadDivider) {
            result.add(ChatListItem.UnreadDivider)
            dividerShown = true
        }
        result.add(ChatListItem.Message(msg))
    }
    return result
}

data class ChatTypingUser(
    val nombre: String,
    val at: Long,
)

data class ChatUiState(
    val loading: Boolean = true,
    val refreshing: Boolean = false,
    val refreshingMessages: Boolean = false,
    val channels: List<ChatChannelDto> = emptyList(),
    val messages: List<ChatMessageDto> = emptyList(),
    val pinnedMessages: List<ChatMessageDto> = emptyList(),
    val unreadBoundaryAt: String? = null,
    val mentions: List<ChatMentionDto> = emptyList(),
    val mentionsLoading: Boolean = false,
    val showMentions: Boolean = false,
    val showEntityPicker: Boolean = false,
    val entityKind: String = "ACTIVITY",
    val entityMentions: List<ChatMentionDto> = emptyList(),
    val entityMentionsLoading: Boolean = false,
    val showPins: Boolean = false,
    val selectedChannel: ChatChannelDto? = null,
    val threadRoot: ChatMessageDto? = null,
    val threadReplies: List<ChatMessageDto> = emptyList(),
    val threadLoading: Boolean = false,
    val threadError: String? = null,
    val replyTo: ChatMessageDto? = null,
    val error: String? = null,
    val messagesError: String? = null,
    val sending: Boolean = false,
    val uploading: Boolean = false,
    val typingUsers: Map<Long, ChatTypingUser> = emptyMap(),
    val favoriteChannelIds: Set<Long> = emptySet(),
    val currentUserId: Long = 0L,
    val showCreateChannel: Boolean = false,
    val showDmPicker: Boolean = false,
    val showInviteMember: Boolean = false,
    val showEditTopic: Boolean = false,
    val editingMessage: ChatMessageDto? = null,
    val colleagues: List<ChatColleagueDto> = emptyList(),
    val colleaguesLoading: Boolean = false,
    val channelActionLoading: Boolean = false,
    val channelActionError: String? = null,
)

class ChatViewModel(app: Application) : AndroidViewModel(app) {
    private val repo = ChatRepository(app.applicationContext)
    private val favoritesStore = ChatFavoritesStore(app.applicationContext)
    private val session = SessionStore(app.applicationContext)
    private val currentUserId = session.load()?.id ?: 0L
    private val currentUserName = session.load()?.nombre.orEmpty()
    private var lastTypingEmitAt = 0L
    private val _state = MutableStateFlow(ChatUiState(currentUserId = currentUserId))
    val state: StateFlow<ChatUiState> = _state

    init {
        loadChannels()
        observeRealtime()
        viewModelScope.launch {
            favoritesStore.favorites.collect { favs ->
                _state.update { s ->
                    s.copy(
                        favoriteChannelIds = favs,
                        channels = sortChannels(s.channels, favs),
                    )
                }
            }
        }
    }

    private fun sortChannels(
        list: List<ChatChannelDto>,
        favorites: Set<Long>,
    ): List<ChatChannelDto> {
        val (fav, rest) = list.partition { it.id in favorites }
        return fav + rest
    }

    private fun observeRealtime() {
        viewModelScope.launch {
            RealtimeBus.chatMessages.collect { msg -> handleIncomingMessage(msg) }
        }
        viewModelScope.launch {
            RealtimeBus.chatMessageUpdated.collect { msg -> handleMessageUpdated(msg) }
        }
        viewModelScope.launch {
            RealtimeBus.chatMessageDeleted.collect { ev -> handleMessageDeleted(ev) }
        }
        viewModelScope.launch {
            RealtimeBus.chatChannelUpdated.collect { ev -> handleChannelUpdated(ev) }
        }
        viewModelScope.launch {
            RealtimeBus.chatMembersChanged.collect { ev -> handleMembersChanged(ev) }
        }
        viewModelScope.launch {
            RealtimeBus.chatTyping.collect { ev -> handleTyping(ev) }
        }
        viewModelScope.launch {
            RealtimeBus.chatChannelActivity.collect { payload ->
                val channelId = payload.optLong("channelId")
                if (channelId <= 0L || channelId == _state.value.selectedChannel?.id) return@collect
                val preview = payload.optString("preview").takeIf { it.isNotBlank() }
                val at = payload.optString("at").takeIf { it.isNotBlank() }
                _state.update { s ->
                    s.copy(
                        channels = s.channels.map { ch ->
                            if (ch.id != channelId) ch
                            else ch.copy(
                                unread = true,
                                unreadCount = ch.unreadCount + 1,
                                lastMessagePreview = preview ?: ch.lastMessagePreview,
                                lastMessageAt = at ?: ch.lastMessageAt,
                            )
                        },
                    )
                }
            }
        }
        viewModelScope.launch {
            RealtimeBus.connected.collect {
                _state.value.selectedChannel?.id?.let { channelId ->
                    RealtimeBus.joinChatChannel(channelId)
                    pollNewMessages(channelId)
                }
            }
        }
        viewModelScope.launch {
            while (isActive) {
                delay(800)
                val now = System.currentTimeMillis()
                _state.update { s ->
                    val fresh = s.typingUsers.filterValues { now - it.at < 2_800 }
                    if (fresh.size == s.typingUsers.size) s else s.copy(typingUsers = fresh)
                }
            }
        }
    }

    private fun handleIncomingMessage(msg: ChatMessageDto) {
        val selectedId = _state.value.selectedChannel?.id
        if (msg.channelId == selectedId && msg.parentId == null) {
            _state.update { s ->
                s.copy(messages = mergeMessages(s.messages, listOf(msg)))
            }
            viewModelScope.launch {
                withContext(Dispatchers.IO) { repo.markRead(msg.channelId) }
            }
        } else if (
            msg.channelId == selectedId &&
            msg.parentId != null &&
            _state.value.threadRoot?.id == msg.parentId
        ) {
            _state.update { s ->
                s.copy(threadReplies = mergeMessages(s.threadReplies, listOf(msg)))
            }
        } else if (msg.channelId != selectedId && msg.authorId != currentUserId) {
            _state.update { s ->
                s.copy(
                    channels = s.channels.map { ch ->
                        if (ch.id != msg.channelId) ch
                        else ch.copy(
                            unread = true,
                            unreadCount = ch.unreadCount + 1,
                            lastMessageAt = msg.createdAt,
                            lastMessagePreview = msg.body,
                        )
                    },
                )
            }
        }
    }

    private fun handleMessageDeleted(ev: ChatMessageDeletedEvent) {
        _state.update { s ->
            val messages = if (ev.parentId == null) {
                s.messages.filter { it.id != ev.id }
            } else {
                s.messages
            }
            val threadReplies = if (ev.parentId != null) {
                s.threadReplies.filter { it.id != ev.id }
            } else {
                s.threadReplies
            }
            s.copy(
                messages = messages,
                threadReplies = threadReplies,
                threadRoot = if (s.threadRoot?.id == ev.id) null else s.threadRoot,
                pinnedMessages = s.pinnedMessages.filter { it.id != ev.id },
            )
        }
    }

    private fun handleChannelUpdated(ev: ChatChannelUpdatedEvent) {
        val topic = ev.topic
        _state.update { s ->
            s.copy(
                channels = s.channels.map { ch ->
                    if (ch.id != ev.id) ch else ch.copy(topic = topic)
                },
                selectedChannel = s.selectedChannel?.takeIf { it.id == ev.id }?.copy(topic = topic)
                    ?: s.selectedChannel,
            )
        }
    }

    private fun handleMembersChanged(ev: ChatMembersChangedEvent) {
        refreshChannels()
        if (ev.channelId == _state.value.selectedChannel?.id) {
            refreshMessages(ev.channelId, markRead = false)
        }
    }

    private fun handleMessageUpdated(msg: ChatMessageDto) {
        _state.update { s ->
            s.copy(
                messages = s.messages.map { if (it.id == msg.id) msg else it },
                threadReplies = s.threadReplies.map { if (it.id == msg.id) msg else it },
                threadRoot = if (s.threadRoot?.id == msg.id) msg else s.threadRoot,
                pinnedMessages = s.pinnedMessages
                    .map { if (it.id == msg.id) msg else it }
                    .let { pins ->
                        when {
                            msg.pinnedAt != null && pins.none { it.id == msg.id } -> listOf(msg) + pins
                            msg.pinnedAt == null -> pins.filter { it.id != msg.id }
                            else -> pins
                        }
                    },
            )
        }
    }

    private fun handleTyping(ev: ChatTypingEvent) {
        if (ev.channelId != _state.value.selectedChannel?.id) return
        if (ev.userId == currentUserId) return
        _state.update { s ->
            s.copy(
                typingUsers = s.typingUsers + (ev.userId to ChatTypingUser(ev.nombre, ev.at)),
            )
        }
    }

    private fun mergeMessages(
        existing: List<ChatMessageDto>,
        incoming: List<ChatMessageDto>,
    ): List<ChatMessageDto> {
        if (incoming.isEmpty()) return existing
        val byId = existing.associateBy { it.id }.toMutableMap()
        incoming.forEach { byId[it.id] = it }
        return byId.values.sortedBy { it.id }
    }

    fun notifyDraftChanged(channelId: Long) {
        val now = System.currentTimeMillis()
        if (now - lastTypingEmitAt < 1_200) return
        lastTypingEmitAt = now
        RealtimeBus.emitTyping(channelId, currentUserName)
    }

    fun loadChannels() {
        viewModelScope.launch {
            _state.update { it.copy(loading = true, error = null) }
            runCatching { withContext(Dispatchers.IO) { repo.channels() } }
                .onSuccess { list ->
                    _state.update { s ->
                        s.copy(loading = false, channels = sortChannels(list, s.favoriteChannelIds))
                    }
                }
                .onFailure { e -> _state.update { it.copy(loading = false, error = e.message) } }
        }
    }

    fun refreshChannels() {
        viewModelScope.launch {
            _state.update { it.copy(refreshing = true, error = null) }
            runCatching { withContext(Dispatchers.IO) { repo.channels() } }
                .onSuccess { list ->
                    _state.update { s ->
                        val selected = s.selectedChannel?.let { sel -> list.find { it.id == sel.id } ?: sel }
                        s.copy(
                            refreshing = false,
                            loading = false,
                            channels = sortChannels(list, s.favoriteChannelIds),
                            selectedChannel = selected,
                        )
                    }
                }
                .onFailure { e -> _state.update { it.copy(refreshing = false, error = e.message) } }
        }
    }

    fun toggleFavorite(channelId: Long) {
        favoritesStore.toggle(channelId)
    }

    fun setShowCreateChannel(show: Boolean) {
        _state.update { it.copy(showCreateChannel = show, channelActionError = null) }
    }

    fun setShowDmPicker(show: Boolean) {
        _state.update { it.copy(showDmPicker = show, channelActionError = null) }
        if (show) loadColleagues()
    }

    fun setShowInviteMember(show: Boolean) {
        _state.update { it.copy(showInviteMember = show, channelActionError = null) }
        if (show) loadColleagues()
    }

    fun setEditingMessage(msg: ChatMessageDto?) {
        _state.update { it.copy(editingMessage = msg, channelActionError = null) }
    }

    fun setShowEditTopic(show: Boolean) {
        _state.update { it.copy(showEditTopic = show, channelActionError = null) }
    }

    fun loadColleagues(query: String? = null) {
        viewModelScope.launch {
            _state.update { it.copy(colleaguesLoading = true) }
            runCatching { withContext(Dispatchers.IO) { repo.colleagues(query) } }
                .onSuccess { list ->
                    _state.update { it.copy(colleaguesLoading = false, colleagues = list) }
                }
                .onFailure {
                    _state.update { it.copy(colleaguesLoading = false, colleagues = emptyList()) }
                }
        }
    }

    fun createChannel(name: String, topic: String, isPrivate: Boolean) {
        if (name.trim().length < 2) {
            _state.update { it.copy(channelActionError = "El nombre debe tener al menos 2 caracteres") }
            return
        }
        viewModelScope.launch {
            _state.update { it.copy(channelActionLoading = true, channelActionError = null) }
            runCatching {
                withContext(Dispatchers.IO) {
                    repo.createChannel(
                        name = name,
                        topic = topic,
                        kind = if (isPrivate) "PRIVATE" else "PUBLIC",
                    )
                }
            }.onSuccess { ch ->
                _state.update {
                    it.copy(
                        channelActionLoading = false,
                        showCreateChannel = false,
                        channels = sortChannels(it.channels + ch, it.favoriteChannelIds),
                    )
                }
                selectChannel(ch)
            }.onFailure { e ->
                _state.update {
                    it.copy(channelActionLoading = false, channelActionError = e.message ?: "No se pudo crear el canal")
                }
            }
        }
    }

    fun openDm(userId: Long) {
        viewModelScope.launch {
            _state.update { it.copy(channelActionLoading = true, channelActionError = null) }
            runCatching { withContext(Dispatchers.IO) { repo.openDm(userId) } }
                .onSuccess { ch ->
                    val existing = _state.value.channels.any { it.id == ch.id }
                    _state.update {
                        it.copy(
                            channelActionLoading = false,
                            showDmPicker = false,
                            channels = if (existing) {
                                sortChannels(it.channels, it.favoriteChannelIds)
                            } else {
                                sortChannels(it.channels + ch, it.favoriteChannelIds)
                            },
                        )
                    }
                    selectChannel(ch)
                }
                .onFailure { e ->
                    _state.update {
                        it.copy(
                            channelActionLoading = false,
                            channelActionError = e.message ?: "No se pudo abrir el mensaje directo",
                        )
                    }
                }
        }
    }

    fun inviteMember(userId: Long) {
        val ch = _state.value.selectedChannel ?: return
        viewModelScope.launch {
            _state.update { it.copy(channelActionLoading = true, channelActionError = null) }
            runCatching { withContext(Dispatchers.IO) { repo.addMember(ch.id, userId) } }
                .onSuccess { updated ->
                    _state.update { s ->
                        s.copy(
                            channelActionLoading = false,
                            showInviteMember = false,
                            channels = s.channels.map { c -> if (c.id == updated.id) updated else c },
                            selectedChannel = updated,
                        )
                    }
                }
                .onFailure { e ->
                    _state.update {
                        it.copy(
                            channelActionLoading = false,
                            channelActionError = e.message ?: "No se pudo invitar al miembro",
                        )
                    }
                }
        }
    }

    fun updateTopic(topic: String) {
        val ch = _state.value.selectedChannel ?: return
        viewModelScope.launch {
            _state.update { it.copy(channelActionLoading = true, channelActionError = null) }
            runCatching { withContext(Dispatchers.IO) { repo.updateTopic(ch.id, topic) } }
                .onSuccess { updated ->
                    _state.update { s ->
                        s.copy(
                            channelActionLoading = false,
                            showEditTopic = false,
                            channels = s.channels.map { c -> if (c.id == updated.id) updated else c },
                            selectedChannel = updated,
                        )
                    }
                }
                .onFailure { e ->
                    _state.update {
                        it.copy(
                            channelActionLoading = false,
                            channelActionError = e.message ?: "No se pudo actualizar el tema",
                        )
                    }
                }
        }
    }

    fun react(messageId: Long, emoji: String) {
        viewModelScope.launch {
            runCatching {
                withContext(Dispatchers.IO) { repo.toggleReaction(messageId, emoji) }
            }.onSuccess { msg -> handleMessageUpdated(msg) }
        }
    }

    fun editMessage(messageId: Long, body: String) {
        if (body.isBlank()) {
            _state.update { it.copy(channelActionError = "El mensaje no puede estar vacío") }
            return
        }
        viewModelScope.launch {
            _state.update { it.copy(channelActionLoading = true, channelActionError = null) }
            runCatching { withContext(Dispatchers.IO) { repo.editMessage(messageId, body) } }
                .onSuccess { msg ->
                    handleMessageUpdated(msg)
                    _state.update { it.copy(channelActionLoading = false, editingMessage = null) }
                }
                .onFailure { e ->
                    _state.update {
                        it.copy(
                            channelActionLoading = false,
                            channelActionError = e.message ?: "No se pudo editar el mensaje",
                        )
                    }
                }
        }
    }

    fun pinMessage(messageId: Long) {
        viewModelScope.launch {
            runCatching { withContext(Dispatchers.IO) { repo.pinMessage(messageId) } }
                .onSuccess { msg -> handleMessageUpdated(msg) }
        }
    }

    fun onAppResume() {
        _state.value.selectedChannel?.id?.let { channelId ->
            RealtimeBus.joinChatChannel(channelId)
            pollNewMessages(channelId)
        }
    }

    fun selectChannel(ch: ChatChannelDto) {
        _state.value.selectedChannel?.id?.let { RealtimeBus.leaveChatChannel(it) }
        RealtimeBus.joinChatChannel(ch.id)
        _state.update {
            it.copy(
                selectedChannel = ch,
                messages = emptyList(),
                pinnedMessages = emptyList(),
                unreadBoundaryAt = ch.lastReadAt,
                messagesError = null,
                showPins = false,
                threadRoot = null,
                threadReplies = emptyList(),
                threadError = null,
                replyTo = null,
                typingUsers = emptyMap(),
            )
        }
        refreshMessages(ch.id, markRead = true)
    }

    fun pollNewMessages(channelId: Long? = _state.value.selectedChannel?.id) {
        val id = channelId ?: return
        if (_state.value.refreshingMessages) return
        viewModelScope.launch {
            runCatching {
                withContext(Dispatchers.IO) {
                    val current = _state.value
                    val newMsgs = repo.messagesNewSince(id, current.messages.maxOfOrNull { it.id })
                    val threadParentId = current.threadRoot?.id
                    val newThreadReplies = if (threadParentId != null) {
                        repo.threadRepliesNewSince(
                            id,
                            threadParentId,
                            current.threadReplies.maxOfOrNull { it.id },
                        )
                    } else {
                        emptyList()
                    }
                    Pair(newMsgs, newThreadReplies)
                }
            }.onSuccess { (newMsgs, newThreadReplies) ->
                if (newMsgs.isEmpty() && newThreadReplies.isEmpty()) return@onSuccess
                _state.update { s ->
                    s.copy(
                        messages = mergeMessages(s.messages, newMsgs),
                        threadReplies = mergeMessages(s.threadReplies, newThreadReplies),
                    )
                }
            }
        }
    }

    fun refreshMessages(channelId: Long? = _state.value.selectedChannel?.id, markRead: Boolean = false) {
        val id = channelId ?: return
        val threadParentId = _state.value.threadRoot?.id
        viewModelScope.launch {
            _state.update { it.copy(refreshingMessages = true, messagesError = null) }
            runCatching {
                withContext(Dispatchers.IO) {
                    val messagesDeferred = async { repo.messages(id) }
                    val pinsDeferred = async { repo.pins(id) }
                    val threadDeferred = threadParentId?.let { parentId ->
                        async { repo.threadReplies(id, parentId) }
                    }
                    if (markRead) repo.markRead(id)
                    Triple(messagesDeferred.await(), pinsDeferred.await(), threadDeferred?.await())
                }
            }.onSuccess { (msgs, pins, threadReplies) ->
                _state.update { s ->
                    val channels = if (markRead) {
                        s.channels.map { ch ->
                            if (ch.id == id) ch.copy(unreadCount = 0, unread = false) else ch
                        }
                    } else s.channels
                    s.copy(
                        refreshingMessages = false,
                        messages = msgs,
                        pinnedMessages = pins,
                        channels = channels,
                        threadReplies = threadReplies ?: s.threadReplies,
                    )
                }
            }.onFailure { e ->
                _state.update { it.copy(refreshingMessages = false, messagesError = e.message) }
            }
        }
    }

    fun clearChannel() {
        _state.value.selectedChannel?.id?.let { RealtimeBus.leaveChatChannel(it) }
        _state.update {
            it.copy(
                selectedChannel = null,
                messages = emptyList(),
                pinnedMessages = emptyList(),
                unreadBoundaryAt = null,
                messagesError = null,
                showPins = false,
                threadRoot = null,
                threadReplies = emptyList(),
                threadError = null,
                replyTo = null,
                typingUsers = emptyMap(),
            )
        }
    }

    fun openThread(msg: ChatMessageDto) {
        val ch = _state.value.selectedChannel ?: return
        _state.update {
            it.copy(
                threadRoot = msg,
                threadReplies = emptyList(),
                threadError = null,
                replyTo = null,
            )
        }
        loadThreadReplies(ch.id, msg.id)
    }

    fun closeThread() = _state.update {
        it.copy(threadRoot = null, threadReplies = emptyList(), threadError = null, replyTo = null)
    }

    fun loadThreadReplies(channelId: Long, parentId: Long) {
        viewModelScope.launch {
            _state.update { it.copy(threadLoading = true, threadError = null) }
            runCatching { withContext(Dispatchers.IO) { repo.threadReplies(channelId, parentId) } }
                .onSuccess { replies ->
                    _state.update { it.copy(threadLoading = false, threadReplies = replies) }
                }
                .onFailure { e ->
                    _state.update { it.copy(threadLoading = false, threadError = e.message) }
                }
        }
    }

    fun setReplyTo(msg: ChatMessageDto?) = _state.update { it.copy(replyTo = msg) }

    fun replyToMessage(msg: ChatMessageDto) {
        val root = if (msg.parentId != null) {
            _state.value.messages.find { it.id == msg.parentId }
                ?: _state.value.threadRoot?.takeIf { it.id == msg.parentId }
        } else {
            msg
        }
        if (root != null) {
            if (_state.value.threadRoot?.id != root.id) {
                openThread(root)
            }
            _state.update { it.copy(replyTo = root) }
        }
    }

    fun toggleShowPins() = _state.update { it.copy(showPins = !it.showPins) }

    fun toggleShowMentions() {
        val opening = !_state.value.showMentions
        _state.update { it.copy(showMentions = opening) }
        if (opening && _state.value.mentions.isEmpty()) loadMentions()
    }

    fun loadMentions(query: String? = null) {
        viewModelScope.launch {
            _state.update { it.copy(mentionsLoading = true) }
            runCatching { withContext(Dispatchers.IO) { repo.mentions(query) } }
                .onSuccess { list -> _state.update { it.copy(mentionsLoading = false, mentions = list) } }
                .onFailure { _state.update { it.copy(mentionsLoading = false) } }
        }
    }

    fun openEntityPicker(kind: String = "ACTIVITY") {
        _state.update { it.copy(showEntityPicker = true, entityKind = kind, entityMentions = emptyList()) }
        loadEntityMentions(kind = kind)
    }

    fun closeEntityPicker() = _state.update { it.copy(showEntityPicker = false) }

    fun setEntityKind(kind: String) {
        _state.update { it.copy(entityKind = kind, entityMentions = emptyList()) }
        loadEntityMentions(kind = kind)
    }

    fun loadEntityMentions(query: String? = null, kind: String? = null) {
        val effectiveKind = kind ?: _state.value.entityKind
        viewModelScope.launch {
            _state.update { it.copy(entityMentionsLoading = true) }
            runCatching { withContext(Dispatchers.IO) { repo.mentions(query, effectiveKind) } }
                .onSuccess { list ->
                    _state.update { it.copy(entityMentionsLoading = false, entityMentions = list) }
                }
                .onFailure { _state.update { it.copy(entityMentionsLoading = false) } }
        }
    }

    fun send(
        text: String,
        parentId: Long? = null,
        attachmentUrl: String? = null,
        attachmentName: String? = null,
    ) {
        val ch = _state.value.selectedChannel ?: return
        if (text.isBlank() && attachmentUrl.isNullOrBlank()) return
        val effectiveParentId = parentId
            ?: _state.value.threadRoot?.id
            ?: _state.value.replyTo?.id
        viewModelScope.launch {
            _state.update { it.copy(sending = true) }
            runCatching {
                withContext(Dispatchers.IO) {
                    repo.send(ch.id, text, effectiveParentId, attachmentUrl, attachmentName)
                }
            }
                .onSuccess { msg ->
                    _state.update { s ->
                        val messages = if (effectiveParentId == null) {
                            s.messages + msg
                        } else {
                            s.messages.map { m ->
                                if (m.id == effectiveParentId) m.copy(replyCount = m.replyCount + 1) else m
                            }
                        }
                        val threadReplies = if (effectiveParentId != null && s.threadRoot?.id == effectiveParentId) {
                            s.threadReplies + msg
                        } else {
                            s.threadReplies
                        }
                        s.copy(
                            sending = false,
                            messages = messages,
                            threadReplies = threadReplies,
                            replyTo = null,
                        )
                    }
                    refreshMessages(ch.id)
                }
                .onFailure { e -> _state.update { it.copy(sending = false, messagesError = e.message) } }
        }
    }

    fun uploadAndSend(uri: Uri, text: String = "", parentId: Long? = null) {
        val ch = _state.value.selectedChannel ?: return
        val effectiveParentId = parentId
            ?: _state.value.threadRoot?.id
            ?: _state.value.replyTo?.id
        viewModelScope.launch {
            _state.update { it.copy(uploading = true, messagesError = null) }
            runCatching {
                withContext(Dispatchers.IO) {
                    val upload = repo.uploadAttachment(uri)
                    repo.send(ch.id, text, effectiveParentId, upload.url, upload.name)
                }
            }.onSuccess { msg ->
                _state.update { s ->
                    val messages = if (effectiveParentId == null) {
                        s.messages + msg
                    } else {
                        s.messages.map { m ->
                            if (m.id == effectiveParentId) m.copy(replyCount = m.replyCount + 1) else m
                        }
                    }
                    val threadReplies = if (effectiveParentId != null && s.threadRoot?.id == effectiveParentId) {
                        s.threadReplies + msg
                    } else {
                        s.threadReplies
                    }
                    s.copy(
                        uploading = false,
                        sending = false,
                        messages = messages,
                        threadReplies = threadReplies,
                        replyTo = null,
                    )
                }
                refreshMessages(ch.id)
            }.onFailure { e ->
                _state.update { it.copy(uploading = false, messagesError = e.message) }
            }
        }
    }
}

private fun channelPrefix(kind: String): String = when (kind.uppercase()) {
    "DIRECT" -> ""
    "PRIVATE" -> "🔒 "
    else -> "# "
}

private fun channelKindLabel(kind: String): String = when (kind.uppercase()) {
    "DIRECT" -> "Mensaje directo"
    "PRIVATE" -> "Canal privado"
    else -> "Canal público"
}

private fun isPdfAttachment(name: String?, url: String?): Boolean {
    val hint = (name ?: url ?: "").lowercase()
    return hint.endsWith(".pdf")
}

private fun isImageAttachment(name: String?, url: String?): Boolean {
    if (isPdfAttachment(name, url)) return false
    val hint = (name ?: url ?: "").lowercase()
    return hint.endsWith(".jpg") ||
        hint.endsWith(".jpeg") ||
        hint.endsWith(".png") ||
        hint.endsWith(".gif") ||
        hint.endsWith(".webp") ||
        hint.endsWith(".bmp") ||
        hint.contains("image/")
}

private fun openChatAttachment(
    context: Context,
    scope: CoroutineScope,
    url: String,
    name: String?,
    onPdfReady: (File) -> Unit,
    onLoading: (Boolean) -> Unit,
) {
    scope.launch {
        onLoading(true)
        runCatching {
            withContext(Dispatchers.IO) { downloadAuthedToCache(context, url, name) }
        }.onSuccess { file ->
            if (isPdfAttachment(name, url)) {
                onPdfReady(file)
            } else {
                openFile(context, file)
            }
        }.onFailure {
            openExternalUrl(context, toAbsoluteAssetUrl(url))
        }
        onLoading(false)
    }
}

@Composable
private fun ChatTypingIndicator(names: List<String>) {
    if (names.isEmpty()) return
    val label = when (names.size) {
        1 -> "${names.first()} está escribiendo"
        2 -> "${names[0]} y ${names[1]} están escribiendo"
        else -> "${names.take(2).joinToString(", ")} y otros están escribiendo"
    }
    Text(
        text = "$label…",
        style = MaterialTheme.typography.labelSmall,
        color = MaterialTheme.colorScheme.onSurfaceVariant,
        modifier = Modifier.padding(horizontal = 16.dp, vertical = 4.dp),
    )
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ChatScreen(
    onBack: (() -> Unit)? = null,
    initialChannelId: Long? = null,
    initialMessageId: Long? = null,
) {
    val ctx = LocalContext.current
    val scope = rememberCoroutineScope()
    val vm: ChatViewModel = viewModel(factory = object : androidx.lifecycle.ViewModelProvider.Factory {
        override fun <T : androidx.lifecycle.ViewModel> create(c: Class<T>): T {
            @Suppress("UNCHECKED_CAST")
            return ChatViewModel(ctx.applicationContext as Application) as T
        }
    })
    val state by vm.state.collectAsState()
    var draft by remember { mutableStateOf("") }

    LaunchedEffect(initialChannelId, state.channels) {
        val channelId = initialChannelId ?: return@LaunchedEffect
        if (state.selectedChannel?.id == channelId) return@LaunchedEffect
        state.channels.firstOrNull { it.id == channelId }?.let { vm.selectChannel(it) }
    }

    LaunchedEffect(initialMessageId, state.messages, state.selectedChannel) {
        val msgId = initialMessageId ?: return@LaunchedEffect
        if (msgId <= 0L) return@LaunchedEffect
        if (state.selectedChannel == null) return@LaunchedEffect
        if (state.threadRoot?.id == msgId) return@LaunchedEffect
        val msg = state.messages.find { it.id == msgId }
        if (msg != null) {
            vm.openThread(msg)
        }
    }

    var threadDraft by remember { mutableStateOf("") }
    var entityMentionTarget by remember { mutableStateOf(EntityMentionTarget.Main) }
    var pdfFile by remember { mutableStateOf<File?>(null) }
    var openingAttachment by remember { mutableStateOf(false) }
    var attachMenuExpanded by remember { mutableStateOf(false) }

    val onAttachmentPicked: (Uri) -> Unit = { uri ->
        vm.uploadAndSend(uri, draft)
        draft = ""
    }
    val onThreadAttachmentPicked: (Uri) -> Unit = { uri ->
        val rootId = state.threadRoot?.id
        vm.uploadAndSend(uri, threadDraft, parentId = rootId)
        threadDraft = ""
    }
    val imagePicker = rememberLauncherForActivityResult(ActivityResultContracts.GetContent()) { uri ->
        if (uri != null) onAttachmentPicked(uri)
    }
    val pdfPicker = rememberLauncherForActivityResult(ActivityResultContracts.GetContent()) { uri ->
        if (uri != null) onAttachmentPicked(uri)
    }
    val threadImagePicker = rememberLauncherForActivityResult(ActivityResultContracts.GetContent()) { uri ->
        if (uri != null) onThreadAttachmentPicked(uri)
    }
    val threadPdfPicker = rememberLauncherForActivityResult(ActivityResultContracts.GetContent()) { uri ->
        if (uri != null) onThreadAttachmentPicked(uri)
    }

    val openAttachment: (String, String?) -> Unit = { url, name ->
        openChatAttachment(
            context = ctx,
            scope = scope,
            url = url,
            name = name,
            onPdfReady = { pdfFile = it },
            onLoading = { openingAttachment = it },
        )
    }

    val openEntityLink: (String) -> Unit = remember {
        { href -> openChatEntityLink(href) }
    }

    if (pdfFile != null) {
        PdfViewerScreen(
            file = pdfFile!!,
            title = pdfFile!!.name,
            onClose = { pdfFile = null },
        )
        return
    }

    val lifecycleOwner = LocalLifecycleOwner.current
    var isScreenActive by remember { mutableStateOf(lifecycleOwner.lifecycle.currentState.isAtLeast(Lifecycle.State.RESUMED)) }

    DisposableEffect(lifecycleOwner) {
        val observer = LifecycleEventObserver { _, event ->
            isScreenActive = when (event) {
                Lifecycle.Event.ON_RESUME -> true
                Lifecycle.Event.ON_PAUSE -> false
                else -> isScreenActive
            }
            if (event == Lifecycle.Event.ON_RESUME) {
                RealtimeBus.setPresenceOnline()
                vm.onAppResume()
            } else if (event == Lifecycle.Event.ON_PAUSE) {
                RealtimeBus.setPresenceAway()
            }
        }
        lifecycleOwner.lifecycle.addObserver(observer)
        onDispose { lifecycleOwner.lifecycle.removeObserver(observer) }
    }

    LaunchedEffect(state.selectedChannel?.id, isScreenActive) {
        val channelId = state.selectedChannel?.id ?: return@LaunchedEffect
        if (!isScreenActive) return@LaunchedEffect
        while (isScreenActive) {
            delay(3_000)
            if (!isScreenActive) break
            vm.pollNewMessages(channelId)
        }
    }

    LaunchedEffect(state.selectedChannel, isScreenActive) {
        if (state.selectedChannel == null && !state.loading && isScreenActive) {
            while (isScreenActive) {
                delay(15_000)
                if (!isScreenActive) break
                vm.refreshChannels()
            }
        }
    }

    val channel = state.selectedChannel
    if (channel != null) {
        val listState = rememberLazyListState()
        val prevMessageCount = remember { mutableIntStateOf(0) }
        var channelMenuExpanded by remember { mutableStateOf(false) }
        val canEditTopic = channel.kind.uppercase() != "DIRECT"
        val canInviteMembers = channel.kind.uppercase() != "DIRECT"
        val messageListItems = remember(state.messages, state.unreadBoundaryAt, state.currentUserId) {
            buildChatListItems(state.messages, state.currentUserId, state.unreadBoundaryAt)
        }

        LaunchedEffect(state.messages.size) {
            if (state.messages.isNotEmpty()) {
                val lastIndex = state.messages.lastIndex
                if (state.messages.size >= prevMessageCount.intValue) {
                    listState.animateScrollToItem(lastIndex)
                }
                prevMessageCount.intValue = state.messages.size
            }
        }

        Scaffold(
            topBar = {
                TopAppBar(
                    title = {
                        Column {
                            Text(
                                "${channelPrefix(channel.kind)}${channel.name}",
                                fontWeight = FontWeight.Bold,
                                maxLines = 1,
                                overflow = TextOverflow.Ellipsis,
                            )
                            Text(
                                buildString {
                                    append(channelKindLabel(channel.kind))
                                    channel.topic?.takeIf { it.isNotBlank() }?.let { append(" · $it") }
                                    if (channel.memberCount > 0) append(" · ${channel.memberCount} miembros")
                                },
                                style = MaterialTheme.typography.labelSmall,
                                maxLines = 2,
                                overflow = TextOverflow.Ellipsis,
                            )
                        }
                    },
                    navigationIcon = {
                        IconButton(onClick = { vm.clearChannel() }) {
                            Icon(Icons.Default.ArrowBack, "Volver")
                        }
                    },
                    actions = {
                        if (state.pinnedMessages.isNotEmpty()) {
                            IconButton(onClick = {
                                scope.launch {
                                    listState.animateScrollToItem(0)
                                }
                            }) {
                                BadgedBox(
                                    badge = { Badge { Text("${state.pinnedMessages.size}") } },
                                ) {
                                    Icon(Icons.Default.PushPin, "Fijados")
                                }
                            }
                        }
                        IconButton(onClick = { vm.refreshMessages(channel.id) }) {
                            Icon(Icons.Default.Refresh, "Actualizar")
                        }
                        if (canEditTopic || canInviteMembers) {
                            Box {
                                IconButton(onClick = { channelMenuExpanded = true }) {
                                    Icon(Icons.Default.MoreVert, "Opciones del canal")
                                }
                                DropdownMenu(
                                    expanded = channelMenuExpanded,
                                    onDismissRequest = { channelMenuExpanded = false },
                                ) {
                                    if (canInviteMembers) {
                                        DropdownMenuItem(
                                            text = { Text("Invitar miembro") },
                                            leadingIcon = { Icon(Icons.Default.PersonAdd, contentDescription = "Invitar miembro") },
                                            onClick = {
                                                channelMenuExpanded = false
                                                vm.setShowInviteMember(true)
                                            },
                                        )
                                    }
                                    if (canEditTopic) {
                                        DropdownMenuItem(
                                            text = { Text("Editar tema") },
                                            leadingIcon = { Icon(Icons.Default.Edit, contentDescription = "Editar tema") },
                                            onClick = {
                                                channelMenuExpanded = false
                                                vm.setShowEditTopic(true)
                                            },
                                        )
                                    }
                                }
                            }
                        }
                    },
                )
            },
            bottomBar = {
                Column(Modifier.fillMaxWidth()) {
                    ChatTypingIndicator(state.typingUsers.values.map { it.nombre })
                    state.replyTo?.let { reply ->
                        ReplyPreviewBar(
                            author = reply.author?.nombre ?: "Usuario",
                            body = reply.body,
                            onDismiss = { vm.setReplyTo(null) },
                        )
                    }
                    ChatComposeBar(
                        draft = draft,
                        onDraftChange = {
                            draft = it
                            if (it.isNotBlank()) vm.notifyDraftChanged(channel.id)
                        },
                        onSend = {
                            val t = draft
                            draft = ""
                            vm.send(t)
                        },
                        onPickActivity = {
                            entityMentionTarget = EntityMentionTarget.Main
                            vm.openEntityPicker("ACTIVITY")
                        },
                        onPickEvidence = {
                            entityMentionTarget = EntityMentionTarget.Main
                            vm.openEntityPicker("EVIDENCE")
                        },
                        attachMenuExpanded = attachMenuExpanded,
                        onAttachClick = { attachMenuExpanded = true },
                        onAttachMenuDismiss = { attachMenuExpanded = false },
                        onPickImage = {
                            attachMenuExpanded = false
                            imagePicker.launch("image/*")
                        },
                        onPickPdf = {
                            attachMenuExpanded = false
                            pdfPicker.launch("application/pdf")
                        },
                        placeholder = if (state.replyTo != null) "Responder en el hilo…" else "Escribe un mensaje…",
                        sending = state.sending,
                        uploading = state.uploading,
                    )
                }
            },
        ) { padding ->
            PullToRefreshBox(
                isRefreshing = state.refreshingMessages,
                onRefresh = { vm.refreshMessages(channel.id) },
                modifier = Modifier.fillMaxSize().padding(padding),
            ) {
                LazyColumn(
                    state = listState,
                    modifier = Modifier.fillMaxSize().background(NxColors.Surface),
                    contentPadding = PaddingValues(12.dp),
                    verticalArrangement = Arrangement.spacedBy(8.dp),
                ) {
                    state.messagesError?.let { err ->
                        item(key = "messages-error") {
                            NxErrorBlock(err) { vm.refreshMessages(channel.id) }
                        }
                    }
                    if (state.pinnedMessages.isNotEmpty()) {
                        item(key = "pins-section") {
                            PinnedMessagesSection(
                                messages = state.pinnedMessages,
                                currentUserId = state.currentUserId,
                                onOpenThread = { vm.openThread(it) },
                                onReply = { vm.replyToMessage(it) },
                                onReact = { m, emoji -> vm.react(m.id, emoji) },
                                onEdit = { vm.setEditingMessage(it) },
                                onPin = { vm.pinMessage(it.id) },
                                onOpenAttachment = openAttachment,
                                onOpenEntityLink = openEntityLink,
                            )
                        }
                    }
                    items(
                        messageListItems,
                        key = { item ->
                            when (item) {
                                is ChatListItem.DateDivider -> "day-${item.dayKey}"
                                is ChatListItem.UnreadDivider -> "unread-divider"
                                is ChatListItem.Message -> item.msg.id
                            }
                        },
                    ) { item ->
                        when (item) {
                            is ChatListItem.DateDivider -> ChatDateDivider(item.label)
                            is ChatListItem.UnreadDivider -> ChatUnreadDivider()
                            is ChatListItem.Message -> ChatMessageCard(
                                item.msg,
                                currentUserId = state.currentUserId,
                                onOpenThread = { vm.openThread(it) },
                                onReply = { vm.replyToMessage(it) },
                                onReact = { m, emoji -> vm.react(m.id, emoji) },
                                onEdit = { vm.setEditingMessage(it) },
                                onPin = { vm.pinMessage(it.id) },
                                onOpenAttachment = openAttachment,
                                onOpenEntityLink = openEntityLink,
                            )
                        }
                    }
                }
            }

            if (openingAttachment || state.uploading) {
                Box(
                    Modifier.fillMaxSize().background(MaterialTheme.colorScheme.scrim.copy(alpha = 0.25f)),
                    contentAlignment = Alignment.Center,
                ) {
                    NxLoadingBlock(
                        if (state.uploading) "Subiendo adjunto…" else "Abriendo archivo…",
                    )
                }
            }

            state.threadRoot?.let { root ->
                val sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true)
                ModalBottomSheet(
                    onDismissRequest = { vm.closeThread() },
                    sheetState = sheetState,
                ) {
                    ThreadSheetContent(
                        root = root,
                        replies = state.threadReplies,
                        loading = state.threadLoading,
                        error = state.threadError,
                        draft = threadDraft,
                        sending = state.sending,
                        uploading = state.uploading,
                        onDraftChange = { threadDraft = it },
                        onSend = {
                            val t = threadDraft
                            threadDraft = ""
                            vm.send(t, parentId = root.id)
                        },
                        onPickActivity = {
                            entityMentionTarget = EntityMentionTarget.Thread
                            vm.openEntityPicker("ACTIVITY")
                        },
                        onPickEvidence = {
                            entityMentionTarget = EntityMentionTarget.Thread
                            vm.openEntityPicker("EVIDENCE")
                        },
                        onPickImage = { threadImagePicker.launch("image/*") },
                        onPickPdf = { threadPdfPicker.launch("application/pdf") },
                        onRetry = { vm.loadThreadReplies(channel.id, root.id) },
                        onReply = { vm.replyToMessage(it) },
                        onReact = { m, emoji -> vm.react(m.id, emoji) },
                        onEdit = { vm.setEditingMessage(it) },
                        onPin = { vm.pinMessage(it.id) },
                        currentUserId = state.currentUserId,
                        onOpenAttachment = openAttachment,
                        onOpenEntityLink = openEntityLink,
                    )
                }
            }
        }
        if (state.showEditTopic) {
            EditTopicDialog(
                currentTopic = channel.topic.orEmpty(),
                loading = state.channelActionLoading,
                error = state.channelActionError,
                onDismiss = { vm.setShowEditTopic(false) },
                onSave = { vm.updateTopic(it) },
            )
        }
        if (state.showInviteMember) {
            ColleaguesPickerDialog(
                title = "Invitar miembro",
                colleagues = state.colleagues,
                loading = state.colleaguesLoading || state.channelActionLoading,
                error = state.channelActionError,
                onDismiss = { vm.setShowInviteMember(false) },
                onSearch = { vm.loadColleagues(it) },
                onPick = { vm.inviteMember(it) },
            )
        }
        state.editingMessage?.let { msg ->
            EditMessageDialog(
                currentBody = msg.body,
                loading = state.channelActionLoading,
                error = state.channelActionError,
                onDismiss = { vm.setEditingMessage(null) },
                onSave = { vm.editMessage(msg.id, it) },
            )
        }
        if (state.showEntityPicker) {
            EntityMentionPickerDialog(
                kind = state.entityKind,
                mentions = state.entityMentions,
                loading = state.entityMentionsLoading,
                onDismiss = { vm.closeEntityPicker() },
                onKindChange = { vm.setEntityKind(it) },
                onSearch = { vm.loadEntityMentions(it) },
                onPick = { entity ->
                    val token = formatEntityMentionToken(entity)
                    when (entityMentionTarget) {
                        EntityMentionTarget.Main -> draft = appendChatMentionToken(draft, token)
                        EntityMentionTarget.Thread -> threadDraft = appendChatMentionToken(threadDraft, token)
                    }
                    vm.closeEntityPicker()
                },
            )
        }
        return
    }

    val totalUnread = state.channels.sumOf { it.unreadCount }

    Box(Modifier.fillMaxSize()) {
    Column(Modifier.fillMaxSize().background(NxColors.Surface)) {
        Row(
            Modifier.fillMaxWidth().padding(horizontal = 4.dp, vertical = 4.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            if (onBack != null) {
                IconButton(onClick = onBack) { Icon(Icons.Default.ArrowBack, "Volver") }
            }
            Text(
                "Chat del equipo",
                fontWeight = FontWeight.Bold,
                modifier = Modifier.weight(1f).padding(start = if (onBack == null) 12.dp else 0.dp),
            )
            if (totalUnread > 0) {
                Badge(
                    modifier = Modifier.padding(end = 4.dp),
                    containerColor = NxColors.Teal,
                ) { Text("$totalUnread") }
            }
            IconButton(onClick = { vm.toggleShowMentions() }) {
                Icon(Icons.Default.AlternateEmail, "Menciones")
            }
            IconButton(onClick = { vm.setShowDmPicker(true) }) {
                Icon(Icons.Default.Person, "Mensaje directo")
            }
            IconButton(onClick = { vm.setShowCreateChannel(true) }) {
                Icon(Icons.Default.Add, "Nuevo canal")
            }
            IconButton(onClick = { vm.refreshChannels() }) {
                Icon(Icons.Default.Refresh, "Actualizar")
            }
        }

        if (state.showMentions) {
            MentionsPanel(
                loading = state.mentionsLoading,
                mentions = state.mentions,
                onRetry = { vm.loadMentions() },
            )
        }

        when {
            state.loading -> NxSkeletonList(
                modifier = Modifier
                    .fillMaxSize()
                    .padding(12.dp),
                itemCount = 7,
                itemHeight = 80.dp,
            )
            state.error != null && state.channels.isEmpty() -> {
                Box(Modifier.fillMaxSize().padding(16.dp), contentAlignment = Alignment.Center) {
                    NxErrorBlock(state.error!!) { vm.loadChannels() }
                }
            }
            state.channels.isEmpty() -> NxEmptyState("Sin canales", "Los canales aparecen cuando el administrador los configura.")
            else -> PullToRefreshBox(
                isRefreshing = state.refreshing,
                onRefresh = { vm.refreshChannels() },
                modifier = Modifier.fillMaxSize(),
            ) {
                LazyColumn(
                    contentPadding = PaddingValues(12.dp),
                    verticalArrangement = Arrangement.spacedBy(8.dp),
                ) {
                    state.error?.let { err ->
                        item(key = "channels-error") {
                            NxErrorBlock(err) { vm.refreshChannels() }
                        }
                    }
                    items(state.channels, key = { it.id }) { ch ->
                        ChannelListItem(
                            ch = ch,
                            isFavorite = ch.id in state.favoriteChannelIds,
                            onToggleFavorite = { vm.toggleFavorite(ch.id) },
                            onClick = { vm.selectChannel(ch) },
                        )
                    }
                }
            }
        }
    }

    FloatingActionButton(
        onClick = { vm.setShowCreateChannel(true) },
        modifier = Modifier
            .align(Alignment.BottomEnd)
            .padding(16.dp),
        containerColor = NxColors.Teal,
    ) {
        Icon(Icons.Default.Add, "Crear canal")
    }
    }

    if (state.showCreateChannel) {
        CreateChannelDialog(
            loading = state.channelActionLoading,
            error = state.channelActionError,
            onDismiss = { vm.setShowCreateChannel(false) },
            onCreate = { name, topic, isPrivate -> vm.createChannel(name, topic, isPrivate) },
        )
    }
    if (state.showDmPicker) {
        ColleaguesPickerDialog(
            title = "Mensaje directo",
            colleagues = state.colleagues,
            loading = state.colleaguesLoading || state.channelActionLoading,
            error = state.channelActionError,
            onDismiss = { vm.setShowDmPicker(false) },
            onSearch = { vm.loadColleagues(it) },
            onPick = { vm.openDm(it) },
        )
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun CreateChannelDialog(
    loading: Boolean,
    error: String?,
    onDismiss: () -> Unit,
    onCreate: (name: String, topic: String, isPrivate: Boolean) -> Unit,
) {
    var name by remember { mutableStateOf("") }
    var topic by remember { mutableStateOf("") }
    var isPrivate by remember { mutableStateOf(false) }
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text("Crear canal") },
        text = {
            Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                OutlinedTextField(
                    value = name,
                    onValueChange = { name = it },
                    label = { Text("Nombre *") },
                    placeholder = { Text("nombre-del-canal") },
                    modifier = Modifier.fillMaxWidth(),
                    singleLine = true,
                )
                OutlinedTextField(
                    value = topic,
                    onValueChange = { topic = it },
                    label = { Text("Tema") },
                    placeholder = { Text("De qué trata este canal") },
                    modifier = Modifier.fillMaxWidth(),
                    maxLines = 2,
                )
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Checkbox(checked = isPrivate, onCheckedChange = { isPrivate = it })
                    Text("Canal privado")
                }
                error?.let {
                    Text(it, color = MaterialTheme.colorScheme.error, style = MaterialTheme.typography.bodySmall)
                }
                if (loading) {
                    CircularProgressIndicator(modifier = Modifier.align(Alignment.CenterHorizontally))
                }
            }
        },
        confirmButton = {
            Button(
                onClick = { onCreate(name, topic, isPrivate) },
                enabled = name.trim().length >= 2 && !loading,
            ) { Text("Crear") }
        },
        dismissButton = { TextButton(onClick = onDismiss, enabled = !loading) { Text("Cancelar") } },
    )
}

@Composable
private fun EditTopicDialog(
    currentTopic: String,
    loading: Boolean,
    error: String?,
    onDismiss: () -> Unit,
    onSave: (String) -> Unit,
) {
    var topic by remember(currentTopic) { mutableStateOf(currentTopic) }
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text("Editar tema del canal") },
        text = {
            Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                OutlinedTextField(
                    value = topic,
                    onValueChange = { topic = it },
                    label = { Text("Tema") },
                    modifier = Modifier.fillMaxWidth(),
                    maxLines = 3,
                )
                error?.let {
                    Text(it, color = MaterialTheme.colorScheme.error, style = MaterialTheme.typography.bodySmall)
                }
                if (loading) {
                    CircularProgressIndicator(modifier = Modifier.align(Alignment.CenterHorizontally))
                }
            }
        },
        confirmButton = {
            Button(onClick = { onSave(topic) }, enabled = !loading) { Text("Guardar") }
        },
        dismissButton = { TextButton(onClick = onDismiss, enabled = !loading) { Text("Cancelar") } },
    )
}

@Composable
private fun ColleaguesPickerDialog(
    title: String,
    colleagues: List<ChatColleagueDto>,
    loading: Boolean,
    error: String?,
    onDismiss: () -> Unit,
    onSearch: (String) -> Unit,
    onPick: (Long) -> Unit,
) {
    var query by remember { mutableStateOf("") }
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text(title) },
        text = {
            Column(
                modifier = Modifier.fillMaxWidth(),
                verticalArrangement = Arrangement.spacedBy(8.dp),
            ) {
                OutlinedTextField(
                    value = query,
                    onValueChange = {
                        query = it
                        onSearch(it)
                    },
                    label = { Text("Buscar compañero") },
                    placeholder = { Text("Nombre o email") },
                    modifier = Modifier.fillMaxWidth(),
                    singleLine = true,
                )
                if (loading && colleagues.isEmpty()) {
                    CircularProgressIndicator(modifier = Modifier.align(Alignment.CenterHorizontally))
                } else if (colleagues.isEmpty()) {
                    Text(
                        "Sin resultados",
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                } else {
                    LazyColumn(
                        modifier = Modifier
                            .fillMaxWidth()
                            .padding(top = 4.dp),
                        verticalArrangement = Arrangement.spacedBy(4.dp),
                    ) {
                        items(colleagues, key = { it.id }) { user ->
                            Card(
                                modifier = Modifier
                                    .fillMaxWidth()
                                    .clickable(enabled = !loading) { onPick(user.id) },
                            ) {
                                Column(Modifier.padding(12.dp)) {
                                    Text(user.nombre, fontWeight = FontWeight.SemiBold, maxLines = 1, overflow = TextOverflow.Ellipsis)
                                    Text(
                                        user.email,
                                        style = MaterialTheme.typography.bodySmall,
                                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                                        maxLines = 1,
                                        overflow = TextOverflow.Ellipsis,
                                    )
                                }
                            }
                        }
                    }
                }
                error?.let {
                    Text(it, color = MaterialTheme.colorScheme.error, style = MaterialTheme.typography.bodySmall)
                }
            }
        },
        confirmButton = {},
        dismissButton = { TextButton(onClick = onDismiss, enabled = !loading) { Text("Cerrar") } },
    )
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun ChannelListItem(
    ch: ChatChannelDto,
    isFavorite: Boolean,
    onToggleFavorite: () -> Unit,
    onClick: () -> Unit,
) {
    val hasUnread = ch.unreadCount > 0
    val preview = formatLastMessagePreview(ch.lastMessagePreview)
    Card(
        onClick = onClick,
        modifier = Modifier.fillMaxWidth(),
        shape = RoundedCornerShape(12.dp),
    ) {
        Row(
            Modifier.padding(14.dp),
            horizontalArrangement = Arrangement.spacedBy(8.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(2.dp)) {
                Row(
                    Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Text(
                        "${channelPrefix(ch.kind)}${ch.name}",
                        fontWeight = if (hasUnread) FontWeight.Bold else FontWeight.SemiBold,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis,
                        modifier = Modifier.weight(1f),
                    )
                    ch.lastMessageAt?.takeIf { it.isNotBlank() }?.let { at ->
                        Text(
                            formatChannelTime(at),
                            style = MaterialTheme.typography.labelSmall,
                            color = if (hasUnread) NxColors.Teal else MaterialTheme.colorScheme.onSurfaceVariant,
                            maxLines = 1,
                        )
                    }
                }
                val subtitle = buildString {
                    append(channelKindLabel(ch.kind))
                    ch.topic?.takeIf { it.isNotBlank() }?.let { append(" · $it") }
                }
                if (subtitle.isNotBlank()) {
                    Text(
                        subtitle,
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis,
                    )
                }
                preview?.let {
                    Text(
                        it,
                        style = MaterialTheme.typography.bodySmall,
                        color = if (hasUnread) {
                            MaterialTheme.colorScheme.onSurface
                        } else {
                            MaterialTheme.colorScheme.onSurfaceVariant
                        },
                        fontWeight = if (hasUnread) FontWeight.Medium else FontWeight.Normal,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis,
                    )
                }
            }
            Column(
                horizontalAlignment = Alignment.End,
                verticalArrangement = Arrangement.spacedBy(4.dp),
            ) {
                IconButton(onClick = onToggleFavorite) {
                    Icon(
                        Icons.Default.Star,
                        contentDescription = if (isFavorite) "Quitar de favoritos" else "Añadir a favoritos",
                        tint = if (isFavorite) {
                            NxColors.Teal
                        } else {
                            MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = 0.45f)
                        },
                    )
                }
                if (hasUnread) {
                    Box(
                        Modifier
                            .clip(CircleShape)
                            .background(NxColors.Teal)
                            .padding(horizontal = 8.dp, vertical = 4.dp),
                    ) {
                        Text(
                            if (ch.unreadCount > 99) "99+" else "${ch.unreadCount}",
                            color = Color.White,
                            style = MaterialTheme.typography.labelSmall,
                            fontWeight = FontWeight.Bold,
                        )
                    }
                }
            }
        }
    }
}

@Composable
private fun ChatDateDivider(label: String) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .padding(vertical = 8.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Box(
            Modifier
                .weight(1f)
                .height(1.dp)
                .background(MaterialTheme.colorScheme.outline.copy(alpha = 0.25f)),
        )
        Text(
            text = label,
            modifier = Modifier.padding(horizontal = 12.dp),
            style = MaterialTheme.typography.labelSmall,
            fontWeight = FontWeight.Bold,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
        Box(
            Modifier
                .weight(1f)
                .height(1.dp)
                .background(MaterialTheme.colorScheme.outline.copy(alpha = 0.25f)),
        )
    }
}

@Composable
private fun ChatUnreadDivider() {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .padding(vertical = 6.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Box(
            Modifier
                .weight(1f)
                .height(1.dp)
                .background(NxColors.Danger.copy(alpha = 0.35f)),
        )
        Text(
            text = "Mensajes nuevos",
            modifier = Modifier.padding(horizontal = 12.dp),
            style = MaterialTheme.typography.labelSmall,
            fontWeight = FontWeight.Bold,
            color = NxColors.Danger,
        )
        Box(
            Modifier
                .weight(1f)
                .height(1.dp)
                .background(NxColors.Danger.copy(alpha = 0.35f)),
        )
    }
}

@Composable
private fun ChatComposeBar(
    draft: String,
    onDraftChange: (String) -> Unit,
    onSend: () -> Unit,
    onPickActivity: () -> Unit,
    onPickEvidence: () -> Unit,
    attachMenuExpanded: Boolean,
    onAttachClick: () -> Unit,
    onAttachMenuDismiss: () -> Unit,
    onPickImage: () -> Unit,
    onPickPdf: () -> Unit,
    placeholder: String,
    sending: Boolean,
    uploading: Boolean,
) {
    val canSend = draft.isNotBlank() && !sending && !uploading
    val canAttach = !sending && !uploading
    Surface(
        modifier = Modifier
            .fillMaxWidth()
            .padding(horizontal = 12.dp, vertical = 8.dp),
        shape = RoundedCornerShape(28.dp),
        color = MaterialTheme.colorScheme.surface,
        shadowElevation = 2.dp,
        border = androidx.compose.foundation.BorderStroke(
            1.dp,
            MaterialTheme.colorScheme.outline.copy(alpha = 0.2f),
        ),
    ) {
        Row(
            modifier = Modifier.padding(start = 4.dp, end = 6.dp, top = 4.dp, bottom = 4.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Box {
                IconButton(
                    onClick = onAttachClick,
                    enabled = canAttach,
                    modifier = Modifier.size(40.dp),
                ) {
                    Icon(
                        Icons.Default.AttachFile,
                        contentDescription = "Adjuntar",
                        tint = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }
                DropdownMenu(
                    expanded = attachMenuExpanded,
                    onDismissRequest = onAttachMenuDismiss,
                ) {
                    DropdownMenuItem(
                        text = { Text("Imagen") },
                        onClick = onPickImage,
                    )
                    DropdownMenuItem(
                        text = { Text("PDF") },
                        onClick = onPickPdf,
                    )
                }
            }
            IconButton(
                onClick = onPickActivity,
                enabled = canAttach,
                modifier = Modifier.size(36.dp),
            ) {
                Text("📋", style = MaterialTheme.typography.titleSmall)
            }
            IconButton(
                onClick = onPickEvidence,
                enabled = canAttach,
                modifier = Modifier.size(36.dp),
            ) {
                Text("📷", style = MaterialTheme.typography.titleSmall)
            }
            BasicTextField(
                value = draft,
                onValueChange = onDraftChange,
                modifier = Modifier
                    .weight(1f)
                    .heightIn(min = 40.dp, max = 120.dp)
                    .padding(vertical = 8.dp),
                textStyle = MaterialTheme.typography.bodyMedium.copy(
                    color = MaterialTheme.colorScheme.onSurface,
                ),
                maxLines = 4,
                decorationBox = { inner ->
                    if (draft.isEmpty()) {
                        Text(
                            placeholder,
                            style = MaterialTheme.typography.bodyMedium,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                        )
                    }
                    inner()
                },
            )
            Box(
                modifier = Modifier
                    .size(40.dp)
                    .clip(CircleShape)
                    .background(if (canSend) NxColors.Teal else MaterialTheme.colorScheme.surfaceVariant)
                    .clickable(enabled = canSend, onClick = onSend),
                contentAlignment = Alignment.Center,
            ) {
                Icon(
                    Icons.Default.Send,
                    contentDescription = "Enviar",
                    tint = if (canSend) Color.White else MaterialTheme.colorScheme.onSurfaceVariant,
                    modifier = Modifier.size(20.dp),
                )
            }
        }
    }
}

@Composable
private fun ReplyPreviewBar(
    author: String,
    body: String,
    onDismiss: () -> Unit,
) {
    Row(
        Modifier
            .fillMaxWidth()
            .background(MaterialTheme.colorScheme.surfaceVariant)
            .padding(horizontal = 12.dp, vertical = 8.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        Icon(Icons.Default.Reply, contentDescription = "Respondiendo", tint = NxColors.Teal)
        Column(Modifier.weight(1f)) {
            Text("Respondiendo a $author", style = MaterialTheme.typography.labelMedium, fontWeight = FontWeight.SemiBold)
            Text(
                body,
                style = MaterialTheme.typography.bodySmall,
                maxLines = 2,
                overflow = TextOverflow.Ellipsis,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }
        IconButton(onClick = onDismiss) {
            Icon(Icons.Default.Close, "Cancelar respuesta")
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun ThreadSheetContent(
    root: ChatMessageDto,
    replies: List<ChatMessageDto>,
    loading: Boolean,
    error: String?,
    draft: String,
    sending: Boolean,
    uploading: Boolean = false,
    onDraftChange: (String) -> Unit,
    onSend: () -> Unit,
    onPickActivity: () -> Unit,
    onPickEvidence: () -> Unit,
    onPickImage: () -> Unit,
    onPickPdf: () -> Unit,
    onRetry: () -> Unit,
    onReply: (ChatMessageDto) -> Unit,
    onReact: (ChatMessageDto, String) -> Unit,
    onEdit: (ChatMessageDto) -> Unit,
    onPin: (ChatMessageDto) -> Unit,
    currentUserId: Long,
    onOpenAttachment: (String, String?) -> Unit,
    onOpenEntityLink: (String) -> Unit,
) {
    Column(
        Modifier
            .fillMaxWidth()
            .padding(horizontal = 12.dp)
            .padding(bottom = 24.dp),
        verticalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        Text("Hilo de conversación", fontWeight = FontWeight.Bold, style = MaterialTheme.typography.titleMedium)
        ChatMessageCard(
            root,
            currentUserId = currentUserId,
            onOpenThread = {},
            onReply = onReply,
            onReact = onReact,
            onEdit = onEdit,
            onPin = onPin,
            onOpenAttachment = onOpenAttachment,
            onOpenEntityLink = onOpenEntityLink,
            showThreadHint = false,
        )
        when {
            loading -> NxLoadingBlock("Cargando respuestas…")
            error != null -> NxErrorBlock(error, onRetry)
            replies.isNotEmpty() -> {
                Text(
                    "${replies.size} ${if (replies.size == 1) "respuesta" else "respuestas"}",
                    style = MaterialTheme.typography.labelMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
                replies.forEach { reply ->
                    ChatMessageCard(
                        reply,
                        currentUserId = currentUserId,
                        onOpenThread = {},
                        onReply = onReply,
                        onReact = onReact,
                        onEdit = onEdit,
                        onPin = onPin,
                        onOpenAttachment = onOpenAttachment,
                        onOpenEntityLink = onOpenEntityLink,
                        showThreadHint = false,
                    )
                }
            }
        }
        OutlinedTextField(
            value = draft,
            onValueChange = onDraftChange,
            modifier = Modifier.fillMaxWidth(),
            placeholder = { Text("Responder en el hilo…") },
            maxLines = 3,
        )
        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                IconButton(
                    onClick = onPickImage,
                    enabled = !sending && !uploading,
                ) {
                    Icon(Icons.Default.AttachFile, "Adjuntar imagen")
                }
                TextButton(
                    onClick = onPickPdf,
                    enabled = !sending && !uploading,
                ) {
                    Text("PDF")
                }
                IconButton(
                    onClick = onPickActivity,
                    enabled = !sending && !uploading,
                    modifier = Modifier.size(36.dp),
                ) {
                    Text("📋", style = MaterialTheme.typography.titleSmall)
                }
                IconButton(
                    onClick = onPickEvidence,
                    enabled = !sending && !uploading,
                    modifier = Modifier.size(36.dp),
                ) {
                    Text("📷", style = MaterialTheme.typography.titleSmall)
                }
            }
            TextButton(
                onClick = onSend,
                enabled = draft.isNotBlank() && !sending && !uploading,
            ) {
                Icon(Icons.Default.Send, contentDescription = "Enviar respuesta", modifier = Modifier.padding(end = 4.dp))
                Text("Responder")
            }
        }
    }
}

private val QUICK_REACTIONS = listOf("👍", "❤️", "😂", "🎉")

@Composable
private fun PinnedMessagesSection(
    messages: List<ChatMessageDto>,
    currentUserId: Long,
    onOpenThread: (ChatMessageDto) -> Unit,
    onReply: (ChatMessageDto) -> Unit,
    onReact: (ChatMessageDto, String) -> Unit,
    onEdit: (ChatMessageDto) -> Unit,
    onPin: (ChatMessageDto) -> Unit,
    onOpenAttachment: (String, String?) -> Unit,
    onOpenEntityLink: (String) -> Unit,
) {
    Card(
        modifier = Modifier.fillMaxWidth(),
        shape = RoundedCornerShape(12.dp),
        colors = androidx.compose.material3.CardDefaults.cardColors(
            containerColor = NxColors.Teal.copy(alpha = 0.08f),
        ),
    ) {
        Column(
            Modifier.padding(12.dp),
            verticalArrangement = Arrangement.spacedBy(8.dp),
        ) {
            Row(
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(6.dp),
            ) {
                Icon(
                    Icons.Default.PushPin,
                    contentDescription = "Mensajes fijados",
                    tint = NxColors.Teal,
                    modifier = Modifier.padding(0.dp),
                )
                Text(
                    "Mensajes fijados",
                    fontWeight = FontWeight.Bold,
                    style = MaterialTheme.typography.titleSmall,
                    color = NxColors.Teal,
                )
                Badge(containerColor = NxColors.Teal) {
                    Text("${messages.size}")
                }
            }
            messages.forEach { msg ->
                ChatMessageCard(
                    msg,
                    currentUserId = currentUserId,
                    pinned = true,
                    compact = true,
                    onOpenThread = onOpenThread,
                    onReply = onReply,
                    onReact = onReact,
                    onEdit = onEdit,
                    onPin = onPin,
                    onOpenAttachment = onOpenAttachment,
                    onOpenEntityLink = onOpenEntityLink,
                )
            }
        }
    }
}

@Composable
private fun EditMessageDialog(
    currentBody: String,
    loading: Boolean,
    error: String?,
    onDismiss: () -> Unit,
    onSave: (String) -> Unit,
) {
    var body by remember(currentBody) { mutableStateOf(currentBody) }
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text("Editar mensaje") },
        text = {
            Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                OutlinedTextField(
                    value = body,
                    onValueChange = { body = it },
                    label = { Text("Mensaje") },
                    modifier = Modifier.fillMaxWidth(),
                    maxLines = 5,
                )
                error?.let {
                    Text(it, color = MaterialTheme.colorScheme.error, style = MaterialTheme.typography.bodySmall)
                }
                if (loading) {
                    CircularProgressIndicator(modifier = Modifier.align(Alignment.CenterHorizontally))
                }
            }
        },
        confirmButton = {
            Button(
                onClick = { onSave(body) },
                enabled = body.trim().isNotBlank() && !loading,
            ) { Text("Guardar") }
        },
        dismissButton = { TextButton(onClick = onDismiss, enabled = !loading) { Text("Cancelar") } },
    )
}

@OptIn(ExperimentalFoundationApi::class)
@Composable
private fun ChatMessageCard(
    msg: ChatMessageDto,
    currentUserId: Long,
    pinned: Boolean = false,
    compact: Boolean = false,
    showThreadHint: Boolean = true,
    onOpenThread: (ChatMessageDto) -> Unit,
    onReply: (ChatMessageDto) -> Unit,
    onReact: (ChatMessageDto, String) -> Unit,
    onEdit: (ChatMessageDto) -> Unit,
    onPin: (ChatMessageDto) -> Unit,
    onOpenAttachment: (String, String?) -> Unit,
    onOpenEntityLink: (String) -> Unit,
) {
    var menuExpanded by remember { mutableStateOf(false) }
    var showReactionPicker by remember { mutableStateOf(false) }
    val canThread = msg.parentId == null
    val isOwn = msg.authorId == currentUserId
    val isEdited = !msg.editedAt.isNullOrBlank()
    val bubbleColor = if (isOwn) NxColors.Teal else Color(0xFFE2E8F0)
    val primaryTextColor = if (isOwn) Color.White else MaterialTheme.colorScheme.onSurface
    val metaTextColor = if (isOwn) {
        Color.White.copy(alpha = 0.78f)
    } else {
        MaterialTheme.colorScheme.onSurfaceVariant
    }
    val bubbleShape = RoundedCornerShape(
        topStart = 16.dp,
        topEnd = 16.dp,
        bottomStart = if (isOwn) 16.dp else 4.dp,
        bottomEnd = if (isOwn) 4.dp else 16.dp,
    )

    Row(
        modifier = Modifier.fillMaxWidth(),
        horizontalArrangement = if (isOwn) Arrangement.End else Arrangement.Start,
    ) {
        Column(
            modifier = Modifier
                .widthIn(max = if (compact) 240.dp else 300.dp)
                .clip(bubbleShape)
                .background(bubbleColor)
                .combinedClickable(
                    onClick = {},
                    onLongClick = {
                        menuExpanded = true
                        showReactionPicker = false
                    },
                )
                .padding(horizontal = 12.dp, vertical = 8.dp),
            verticalArrangement = Arrangement.spacedBy(4.dp),
        ) {
            Row(
                Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically,
            ) {
                if (!isOwn) {
                    Text(
                        msg.author?.nombre ?: "Usuario",
                        fontWeight = FontWeight.SemiBold,
                        style = MaterialTheme.typography.labelMedium,
                        color = NxColors.Teal,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis,
                        modifier = Modifier.weight(1f),
                    )
                } else {
                    Spacer(Modifier.weight(1f))
                }
                Row(
                    horizontalArrangement = Arrangement.spacedBy(2.dp),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    if (pinned || msg.pinnedAt != null) {
                        Text("📌", style = MaterialTheme.typography.labelSmall)
                    }
                    Box {
                        if (!isOwn) {
                            IconButton(
                                onClick = { menuExpanded = true },
                                modifier = Modifier.size(28.dp),
                            ) {
                                Icon(
                                    Icons.Default.MoreVert,
                                    "Opciones",
                                    tint = metaTextColor,
                                    modifier = Modifier.size(18.dp),
                                )
                            }
                        }
                        DropdownMenu(expanded = menuExpanded, onDismissRequest = { menuExpanded = false }) {
                            messageActionItems(
                                msg = msg,
                                isOwn = isOwn,
                                canThread = canThread,
                                onReact = {
                                    menuExpanded = false
                                    showReactionPicker = true
                                },
                                onReply = {
                                    menuExpanded = false
                                    onReply(msg)
                                },
                                onEdit = {
                                    menuExpanded = false
                                    onEdit(msg)
                                },
                                onPin = {
                                    menuExpanded = false
                                    onPin(msg)
                                },
                                onOpenThread = {
                                    menuExpanded = false
                                    onOpenThread(msg)
                                },
                            )
                        }
                    }
                }
            }
            if (msg.body.isNotBlank()) {
                ChatMessageBodyText(
                    body = msg.body,
                    primaryColor = primaryTextColor,
                    linkColor = if (isOwn) Color.White else NxColors.Teal,
                    mentionColor = if (isOwn) Color.White else NxColors.Teal,
                    onOpenEntityLink = onOpenEntityLink,
                )
            }
            msg.attachmentUrl?.takeIf { it.isNotBlank() }?.let { url ->
                val name = msg.attachmentName?.takeIf { it.isNotBlank() } ?: "Adjunto"
                if (isImageAttachment(msg.attachmentName, url)) {
                    NxAsyncImage(
                        model = toAbsoluteAssetUrl(url),
                        contentDescription = name,
                        modifier = Modifier
                            .fillMaxWidth()
                            .heightIn(max = 220.dp)
                            .clip(RoundedCornerShape(8.dp))
                            .clickable { onOpenAttachment(url, msg.attachmentName) },
                        contentScale = ContentScale.Fit,
                    )
                } else {
                    Text(
                        "📎 $name",
                        style = MaterialTheme.typography.bodySmall,
                        color = if (isOwn) Color.White else NxColors.Teal,
                        modifier = Modifier.clickable { onOpenAttachment(url, msg.attachmentName) },
                    )
                }
            } ?: msg.attachmentName?.takeIf { it.isNotBlank() }?.let { name ->
                Text(
                    "📎 $name",
                    style = MaterialTheme.typography.bodySmall,
                    color = if (isOwn) Color.White else NxColors.Teal,
                )
            }
            if (msg.reactions.isNotEmpty()) {
                ReactionChips(
                    reactions = msg.reactions,
                    currentUserId = currentUserId,
                    onReact = { emoji -> onReact(msg, emoji) },
                    onDarkBubble = isOwn,
                )
            }
            if (showReactionPicker) {
                QuickReactionPicker(
                    emojis = QUICK_REACTIONS,
                    onPick = { emoji ->
                        onReact(msg, emoji)
                        showReactionPicker = false
                    },
                    onDismiss = { showReactionPicker = false },
                )
            }
            Row(
                horizontalArrangement = Arrangement.spacedBy(8.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Text(
                    formatMessageTime(msg.createdAt),
                    style = MaterialTheme.typography.labelSmall,
                    color = metaTextColor,
                )
                if (isEdited) {
                    Text(
                        "(editado)",
                        style = MaterialTheme.typography.labelSmall,
                        color = metaTextColor,
                        fontStyle = androidx.compose.ui.text.font.FontStyle.Italic,
                    )
                }
                if (showThreadHint && canThread && msg.replyCount > 0) {
                    Text(
                        "${msg.replyCount} ${if (msg.replyCount == 1) "respuesta" else "respuestas"} · Ver hilo",
                        style = MaterialTheme.typography.labelSmall,
                        color = if (isOwn) Color.White else NxColors.Teal,
                        fontWeight = FontWeight.Medium,
                        modifier = Modifier.clickable { onOpenThread(msg) },
                    )
                }
            }
        }
    }
}

@Composable
private fun messageActionItems(
    msg: ChatMessageDto,
    isOwn: Boolean,
    canThread: Boolean,
    onReact: () -> Unit,
    onReply: () -> Unit,
    onEdit: () -> Unit,
    onPin: () -> Unit,
    onOpenThread: () -> Unit,
) {
    DropdownMenuItem(
        text = { Text("Reaccionar") },
        onClick = onReact,
    )
    DropdownMenuItem(
        text = { Text("Responder") },
        onClick = onReply,
        leadingIcon = { Icon(Icons.Default.Reply, contentDescription = "Responder") },
    )
    if (isOwn) {
        DropdownMenuItem(
            text = { Text("Editar") },
            onClick = onEdit,
            leadingIcon = { Icon(Icons.Default.Edit, contentDescription = "Editar mensaje") },
        )
    }
    if (canThread) {
        DropdownMenuItem(
            text = { Text(if (msg.pinnedAt != null) "Desfijar" else "Fijar") },
            onClick = onPin,
            leadingIcon = { Icon(Icons.Default.PushPin, contentDescription = "Fijar mensaje") },
        )
    }
    if (canThread && msg.replyCount > 0) {
        DropdownMenuItem(
            text = { Text("Ver hilo (${msg.replyCount})") },
            onClick = onOpenThread,
        )
    }
}

@Composable
private fun ReactionChips(
    reactions: List<ChatReactionDto>,
    currentUserId: Long,
    onReact: (String) -> Unit,
    onDarkBubble: Boolean = false,
) {
    Row(
        horizontalArrangement = Arrangement.spacedBy(6.dp),
        modifier = Modifier.padding(top = 2.dp),
    ) {
        reactions.forEach { reaction ->
            val mine = reaction.userIds.contains(currentUserId)
            val chipBg = when {
                mine -> NxColors.Teal.copy(alpha = if (onDarkBubble) 0.28f else 0.15f)
                onDarkBubble -> Color.White.copy(alpha = 0.16f)
                else -> MaterialTheme.colorScheme.surfaceVariant
            }
            val chipBorder = when {
                mine -> NxColors.Teal.copy(alpha = if (onDarkBubble) 0.65f else 0.5f)
                onDarkBubble -> Color.White.copy(alpha = 0.25f)
                else -> MaterialTheme.colorScheme.outline.copy(alpha = 0.3f)
            }
            Row(
                modifier = Modifier
                    .clip(RoundedCornerShape(12.dp))
                    .background(chipBg)
                    .border(
                        width = 1.dp,
                        color = chipBorder,
                        shape = RoundedCornerShape(12.dp),
                    )
                    .clickable { onReact(reaction.emoji) }
                    .padding(horizontal = 8.dp, vertical = 4.dp),
                horizontalArrangement = Arrangement.spacedBy(4.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Text(reaction.emoji, style = MaterialTheme.typography.labelMedium)
                Text(
                    "${reaction.count}",
                    style = MaterialTheme.typography.labelSmall,
                    fontWeight = if (mine) FontWeight.Bold else FontWeight.Normal,
                    color = if (onDarkBubble && !mine) Color.White.copy(alpha = 0.9f) else Color.Unspecified,
                )
            }
        }
    }
}

@Composable
private fun QuickReactionPicker(
    emojis: List<String>,
    onPick: (String) -> Unit,
    onDismiss: () -> Unit,
) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(10.dp))
            .background(MaterialTheme.colorScheme.surfaceVariant)
            .padding(horizontal = 8.dp, vertical = 6.dp),
        horizontalArrangement = Arrangement.SpaceBetween,
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Row(horizontalArrangement = Arrangement.spacedBy(4.dp)) {
            emojis.forEach { emoji ->
                Text(
                    emoji,
                    style = MaterialTheme.typography.titleMedium,
                    modifier = Modifier
                        .clip(CircleShape)
                        .clickable { onPick(emoji) }
                        .padding(horizontal = 8.dp, vertical = 4.dp),
                )
            }
        }
        IconButton(onClick = onDismiss, modifier = Modifier.padding(0.dp)) {
            Icon(Icons.Default.Close, "Cerrar", modifier = Modifier.padding(0.dp))
        }
    }
}

@Composable
private fun ChatMessageBodyText(
    body: String,
    primaryColor: Color,
    linkColor: Color,
    mentionColor: Color,
    onOpenEntityLink: (String) -> Unit,
) {
    val annotated = remember(body, primaryColor, linkColor, mentionColor) {
        buildChatMessageAnnotatedString(body, primaryColor, linkColor, mentionColor)
    }
    ClickableText(
        text = annotated,
        style = MaterialTheme.typography.bodyMedium,
        onClick = { offset ->
            annotated.getStringAnnotations("entity_link", offset, offset)
                .firstOrNull()
                ?.item
                ?.let(onOpenEntityLink)
        },
    )
}

@Composable
private fun EntityMentionPickerDialog(
    kind: String,
    mentions: List<ChatMentionDto>,
    loading: Boolean,
    onDismiss: () -> Unit,
    onKindChange: (String) -> Unit,
    onSearch: (String) -> Unit,
    onPick: (ChatMentionDto) -> Unit,
) {
    var query by remember { mutableStateOf("") }
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text("Mencionar en el mensaje") },
        text = {
            Column(
                modifier = Modifier.fillMaxWidth(),
                verticalArrangement = Arrangement.spacedBy(8.dp),
            ) {
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    listOf("ACTIVITY" to "📋 Actividades", "EVIDENCE" to "📷 Evidencias").forEach { (value, label) ->
                        TextButton(
                            onClick = {
                                query = ""
                                onKindChange(value)
                            },
                            enabled = kind != value,
                        ) {
                            Text(label, fontWeight = if (kind == value) FontWeight.Bold else FontWeight.Normal)
                        }
                    }
                }
                OutlinedTextField(
                    value = query,
                    onValueChange = {
                        query = it
                        onSearch(it)
                    },
                    label = { Text("Buscar") },
                    placeholder = {
                        Text(
                            if (kind == "ACTIVITY") {
                                "AN, título o estado…"
                            } else {
                                "Evidencia, actividad o comentario…"
                            },
                        )
                    },
                    modifier = Modifier.fillMaxWidth(),
                    singleLine = true,
                )
                if (loading && mentions.isEmpty()) {
                    CircularProgressIndicator(modifier = Modifier.align(Alignment.CenterHorizontally))
                } else if (mentions.isEmpty()) {
                    Text(
                        "Sin resultados",
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                } else {
                    LazyColumn(
                        modifier = Modifier
                            .fillMaxWidth()
                            .heightIn(max = 240.dp),
                        verticalArrangement = Arrangement.spacedBy(4.dp),
                    ) {
                        items(mentions, key = { "${it.kind}-${it.id}" }) { mention ->
                            Card(
                                modifier = Modifier
                                    .fillMaxWidth()
                                    .clickable(enabled = !loading) { onPick(mention) },
                            ) {
                                Row(
                                    Modifier.padding(12.dp),
                                    horizontalArrangement = Arrangement.spacedBy(8.dp),
                                    verticalAlignment = Alignment.CenterVertically,
                                ) {
                                    Text(
                                        if (mention.kind == "ACTIVITY") "📋" else "📷",
                                        style = MaterialTheme.typography.titleMedium,
                                    )
                                    Column(Modifier.weight(1f)) {
                                        Text(
                                            mention.label,
                                            fontWeight = FontWeight.SemiBold,
                                            maxLines = 1,
                                            overflow = TextOverflow.Ellipsis,
                                        )
                                        Text(
                                            mention.subtitle,
                                            style = MaterialTheme.typography.bodySmall,
                                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                                            maxLines = 2,
                                            overflow = TextOverflow.Ellipsis,
                                        )
                                    }
                                }
                            }
                        }
                    }
                }
            }
        },
        confirmButton = {},
        dismissButton = { TextButton(onClick = onDismiss, enabled = !loading) { Text("Cerrar") } },
    )
}

@Composable
private fun MentionsPanel(
    loading: Boolean,
    mentions: List<ChatMentionDto>,
    onRetry: () -> Unit,
) {
    Card(
        Modifier.fillMaxWidth().padding(horizontal = 12.dp, vertical = 4.dp),
        shape = RoundedCornerShape(12.dp),
    ) {
        Column(Modifier.padding(12.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
            Text("Personas y entidades (@)", fontWeight = FontWeight.SemiBold)
            when {
                loading -> NxLoadingBlock("Cargando menciones…")
                mentions.isEmpty() -> Text(
                    "Sin resultados",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
                else -> mentions.take(8).forEach { m ->
                    Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                        Column(Modifier.weight(1f)) {
                            Text(m.label, fontWeight = FontWeight.Medium, maxLines = 1, overflow = TextOverflow.Ellipsis)
                            Text(
                                m.subtitle,
                                style = MaterialTheme.typography.bodySmall,
                                color = MaterialTheme.colorScheme.onSurfaceVariant,
                                maxLines = 1,
                                overflow = TextOverflow.Ellipsis,
                            )
                        }
                        Text(m.kind, style = MaterialTheme.typography.labelSmall, color = NxColors.Teal)
                    }
                }
            }
            if (!loading && mentions.isEmpty()) {
                TextButton(onClick = onRetry) { Text("Reintentar") }
            }
        }
    }
}
