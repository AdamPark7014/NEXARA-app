package mx.nexara.mobile.nativeapp.data.realtime



import kotlinx.coroutines.CoroutineScope

import kotlinx.coroutines.Dispatchers

import kotlinx.coroutines.SupervisorJob

import kotlinx.coroutines.delay

import kotlinx.coroutines.launch

import kotlinx.coroutines.sync.Mutex

import kotlinx.coroutines.sync.withLock

import kotlinx.coroutines.flow.SharedFlow

import mx.nexara.mobile.nativeapp.data.api.ChatMessageDto

import org.json.JSONObject

import kotlin.math.min



/**

 * Single Socket.IO connection for the whole app.

 */

object RealtimeBus {

    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)

    private val client = RealtimeClient()

    private val mutex = Mutex()



    private var startedToken: String? = null

    private var reconnectAttempt = 0

    private val joinedChannelIds = mutableSetOf<Long>()



    val events: SharedFlow<EntityUpdatedEvent> = client.entityEvents

    val chatMessages: SharedFlow<ChatMessageDto> = client.chatMessages

    val chatMessageUpdated: SharedFlow<ChatMessageDto> = client.chatMessageUpdated

    val chatMessageDeleted: SharedFlow<ChatMessageDeletedEvent> = client.chatMessageDeleted

    val chatChannelUpdated: SharedFlow<ChatChannelUpdatedEvent> = client.chatChannelUpdated

    val chatMembersChanged: SharedFlow<ChatMembersChangedEvent> = client.chatMembersChanged

    val chatTyping: SharedFlow<ChatTypingEvent> = client.chatTyping

    val chatChannelActivity: SharedFlow<JSONObject> = client.chatChannelActivity

    val connected: SharedFlow<Unit> = client.connected



    init {

        scope.launch {

            client.connected.collect {

                reconnectAttempt = 0

                rejoinChannels()

            }

        }

        scope.launch {

            client.disconnected.collect {

                scheduleReconnect()

            }

        }

    }



    fun start(token: String) {

        if (token.isBlank()) return

        scope.launch {

            mutex.withLock {

                if (startedToken == token && client.isConnected()) return@withLock

                startedToken = token

                reconnectAttempt = 0

                client.connect(token)

            }

        }

    }



    fun stop() {

        scope.launch {

            mutex.withLock {

                startedToken = null

                reconnectAttempt = 0

                joinedChannelIds.clear()

                client.disconnect()

            }

        }

    }



    fun joinChatChannel(channelId: Long) {

        if (channelId <= 0L) return

        joinedChannelIds.add(channelId)

        client.joinChatChannel(channelId)

    }



    fun leaveChatChannel(channelId: Long) {

        if (channelId <= 0L) return

        joinedChannelIds.remove(channelId)

        client.leaveChatChannel(channelId)

    }



    fun emitTyping(channelId: Long, nombre: String) = client.emitTyping(channelId, nombre)



    fun setPresenceOnline() = client.emitPresence("online")



    fun setPresenceAway() = client.emitPresence("away")



    private fun rejoinChannels() {

        joinedChannelIds.forEach { client.joinChatChannel(it) }

    }



    private fun scheduleReconnect() {

        val token = startedToken ?: return

        val attempt = reconnectAttempt++

        val delayMs = min(30_000L, 1_000L shl attempt.coerceAtMost(5))

        scope.launch {

            delay(delayMs)

            mutex.withLock {

                if (startedToken != token || client.isConnected()) return@withLock

                client.connect(token)

            }

        }

    }

}

