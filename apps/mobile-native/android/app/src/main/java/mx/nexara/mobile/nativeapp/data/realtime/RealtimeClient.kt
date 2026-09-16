package mx.nexara.mobile.nativeapp.data.realtime

import io.socket.client.IO
import io.socket.client.Socket
import io.socket.emitter.Emitter
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.SharedFlow
import mx.nexara.mobile.nativeapp.data.api.ChatMessageDto
import mx.nexara.mobile.nativeapp.data.api.apiAssetOrigin
import org.json.JSONObject

data class EntityUpdatedEvent(
    val model: String? = null,
    val action: String? = null,
    val timestamp: String? = null,
)

class RealtimeClient {
    private var socket: Socket? = null
    private var activeToken: String? = null

    private val _entityEvents = MutableSharedFlow<EntityUpdatedEvent>(extraBufferCapacity = 64)
    val entityEvents: SharedFlow<EntityUpdatedEvent> = _entityEvents

    private val _chatMessages = MutableSharedFlow<ChatMessageDto>(extraBufferCapacity = 64)
    val chatMessages: SharedFlow<ChatMessageDto> = _chatMessages

    private val _chatMessageUpdated = MutableSharedFlow<ChatMessageDto>(extraBufferCapacity = 32)
    val chatMessageUpdated: SharedFlow<ChatMessageDto> = _chatMessageUpdated

    private val _chatTyping = MutableSharedFlow<ChatTypingEvent>(extraBufferCapacity = 32)
    val chatTyping: SharedFlow<ChatTypingEvent> = _chatTyping

    private val _chatChannelActivity = MutableSharedFlow<JSONObject>(extraBufferCapacity = 32)
    val chatChannelActivity: SharedFlow<JSONObject> = _chatChannelActivity

    private val _chatMessageDeleted = MutableSharedFlow<ChatMessageDeletedEvent>(extraBufferCapacity = 32)
    val chatMessageDeleted: SharedFlow<ChatMessageDeletedEvent> = _chatMessageDeleted

    private val _chatChannelUpdated = MutableSharedFlow<ChatChannelUpdatedEvent>(extraBufferCapacity = 16)
    val chatChannelUpdated: SharedFlow<ChatChannelUpdatedEvent> = _chatChannelUpdated

    private val _chatMembersChanged = MutableSharedFlow<ChatMembersChangedEvent>(extraBufferCapacity = 16)
    val chatMembersChanged: SharedFlow<ChatMembersChangedEvent> = _chatMembersChanged

    /** Avisos `push:show`: los mismos datos que manda FCM, para pintarlos aunque FCM no llegue. */
    private val _pushes = MutableSharedFlow<Map<String, String>>(extraBufferCapacity = 32)
    val pushes: SharedFlow<Map<String, String>> = _pushes

    private val _connected = MutableSharedFlow<Unit>(extraBufferCapacity = 1)
    val connected: SharedFlow<Unit> = _connected

    private val _disconnected = MutableSharedFlow<Unit>(extraBufferCapacity = 1)
    val disconnected: SharedFlow<Unit> = _disconnected

    private val onEntityUpdated = Emitter.Listener { args ->
        val obj = args.firstOrNull() as? JSONObject ?: return@Listener
        _entityEvents.tryEmit(
            EntityUpdatedEvent(
                model = obj.optString("model").takeIf { it.isNotBlank() },
                action = obj.optString("action").takeIf { it.isNotBlank() },
                timestamp = obj.optString("timestamp").takeIf { it.isNotBlank() },
            ),
        )
    }

    private val onPushShow = Emitter.Listener { args ->
        val obj = args.firstOrNull() as? JSONObject ?: return@Listener
        val data = buildMap {
            val keys = obj.keys()
            while (keys.hasNext()) {
                val k = keys.next()
                if (!obj.isNull(k)) put(k, obj.optString(k))
            }
        }
        _pushes.tryEmit(data)
    }

    private val onChatMessage = Emitter.Listener { args ->
        val obj = args.firstOrNull() as? JSONObject ?: return@Listener
        runCatching { _chatMessages.tryEmit(obj.toChatMessageDto()) }
    }

    private val onChatMessageUpdated = Emitter.Listener { args ->
        val obj = args.firstOrNull() as? JSONObject ?: return@Listener
        runCatching { _chatMessageUpdated.tryEmit(obj.toChatMessageDto()) }
    }

    private val onChatTyping = Emitter.Listener { args ->
        val obj = args.firstOrNull() as? JSONObject ?: return@Listener
        val channelId = obj.optLong("channelId")
        val userId = obj.optLong("userId")
        if (channelId <= 0L || userId <= 0L) return@Listener
        _chatTyping.tryEmit(
            ChatTypingEvent(
                channelId = channelId,
                userId = userId,
                nombre = obj.optString("nombre", "Alguien"),
                at = obj.optLong("at", System.currentTimeMillis()),
            ),
        )
    }

    private val onChatChannelActivity = Emitter.Listener { args ->
        val obj = args.firstOrNull() as? JSONObject ?: return@Listener
        _chatChannelActivity.tryEmit(obj)
    }

    private val onChatMessageDeleted = Emitter.Listener { args ->
        val obj = args.firstOrNull() as? JSONObject ?: return@Listener
        val id = obj.optLong("id")
        val channelId = obj.optLong("channelId")
        if (id <= 0L || channelId <= 0L) return@Listener
        val parentId = if (obj.isNull("parentId")) null else obj.optLong("parentId")
        _chatMessageDeleted.tryEmit(
            ChatMessageDeletedEvent(
                id = id,
                channelId = channelId,
                parentId = parentId,
            ),
        )
    }

    private val onChatChannelUpdated = Emitter.Listener { args ->
        val obj = args.firstOrNull() as? JSONObject ?: return@Listener
        val id = obj.optLong("id")
        if (id <= 0L) return@Listener
        val topic = if (obj.isNull("topic")) null else obj.optString("topic").takeIf { it.isNotBlank() }
        _chatChannelUpdated.tryEmit(ChatChannelUpdatedEvent(id = id, topic = topic))
    }

    private val onChatMembersChanged = Emitter.Listener { args ->
        val obj = args.firstOrNull() as? JSONObject ?: return@Listener
        val channelId = obj.optLong("channelId")
        if (channelId <= 0L) return@Listener
        _chatMembersChanged.tryEmit(ChatMembersChangedEvent(channelId = channelId))
    }

    /** true tras disconnect/connect_error del socket actual; false al crear/conectar. */
    @Volatile
    private var socketDead = false

    private val onConnect = Emitter.Listener {
        socketDead = false
        _connected.tryEmit(Unit)
        emitPresence("online")
    }

    private val onDisconnect = Emitter.Listener {
        socketDead = true
        _disconnected.tryEmit(Unit)
    }

    /**
     * Handshake rechazado por el middleware del gateway (`next(new Error('unauthorized'))`).
     * Lleva el token con el que se intentó: el bus renueva y reconecta, nunca
     * cierra la sesión desde el socket.
     */
    private val _authFailed = MutableSharedFlow<String>(extraBufferCapacity = 4)
    val authFailed: SharedFlow<String> = _authFailed

    private val onConnectError = Emitter.Listener { args ->
        socketDead = true
        val failedToken = activeToken
        if (failedToken != null && isUnauthorizedConnectError(args)) {
            _authFailed.tryEmit(failedToken)
        } else {
            _disconnected.tryEmit(Unit)
        }
    }

    @Synchronized
    fun connect(token: String) {
        if (token.isBlank()) return
        if (activeToken == token && socket?.connected() == true) return
        disconnectInternal()

        val baseUrl = apiAssetOrigin()
        val opts = IO.Options.builder()
            .setTransports(arrayOf("websocket", "polling"))
            .setAuth(mapOf("token" to token))
            .build()

        val s = IO.socket(baseUrl, opts)
        socket = s
        activeToken = token
        socketDead = false

        s.on(Socket.EVENT_CONNECT, onConnect)
        s.on(Socket.EVENT_DISCONNECT, onDisconnect)
        s.on(Socket.EVENT_CONNECT_ERROR, onConnectError)
        s.on("entity:updated", onEntityUpdated)
        s.on("chat:message", onChatMessage)
        s.on("chat:message-updated", onChatMessageUpdated)
        s.on("chat:message-deleted", onChatMessageDeleted)
        s.on("chat:typing", onChatTyping)
        s.on("chat:channel-activity", onChatChannelActivity)
        s.on("chat:channel-updated", onChatChannelUpdated)
        s.on("chat:members-changed", onChatMembersChanged)
        s.on("push:show", onPushShow)
        s.connect()
    }

    @Synchronized
    fun disconnect() {
        disconnectInternal()
    }

    fun isConnected(): Boolean = socket?.connected() == true

    /** Hay un socket para [token] conectado o todavía intentando conectar. */
    fun isLiveFor(token: String): Boolean =
        activeToken == token && socket != null && !socketDead

    private fun isUnauthorizedConnectError(args: Array<out Any?>): Boolean {
        val first = args.firstOrNull() ?: return false
        val message = when (first) {
            is JSONObject -> first.optString("message")
            is Throwable -> first.message
            else -> first.toString()
        }.orEmpty()
        return message.contains("unauthorized", ignoreCase = true)
    }

    fun joinChatChannel(channelId: Long) {
        if (channelId <= 0L) return
        socket?.emit("chat:join", JSONObject().put("channelId", channelId))
    }

    fun leaveChatChannel(channelId: Long) {
        if (channelId <= 0L) return
        socket?.emit("chat:leave", JSONObject().put("channelId", channelId))
    }

    fun emitTyping(channelId: Long, nombre: String) {
        if (channelId <= 0L || nombre.isBlank()) return
        socket?.emit(
            "chat:typing",
            JSONObject()
                .put("channelId", channelId)
                .put("nombre", nombre.take(100)),
        )
    }

    fun emitPresence(status: String) {
        socket?.emit("chat:presence", JSONObject().put("status", status))
    }

    @Synchronized
    private fun disconnectInternal() {
        val s = socket ?: return
        try {
            emitPresence("away")
            s.off(Socket.EVENT_CONNECT, onConnect)
            s.off(Socket.EVENT_DISCONNECT, onDisconnect)
            s.off(Socket.EVENT_CONNECT_ERROR, onConnectError)
            s.off("entity:updated", onEntityUpdated)
            s.off("chat:message", onChatMessage)
            s.off("chat:message-updated", onChatMessageUpdated)
            s.off("chat:message-deleted", onChatMessageDeleted)
            s.off("chat:typing", onChatTyping)
            s.off("chat:channel-activity", onChatChannelActivity)
            s.off("chat:channel-updated", onChatChannelUpdated)
            s.off("chat:members-changed", onChatMembersChanged)
            s.disconnect()
            s.close()
        } catch (_: Exception) {
        }
        socket = null
        activeToken = null
    }
}
