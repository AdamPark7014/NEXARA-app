package mx.nexara.mobile.nativeapp.data.realtime

import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.SharedFlow
import kotlinx.coroutines.launch
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock

/**
 * Single Socket.IO connection for the whole app.
 */
object RealtimeBus {
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)
    private val client = RealtimeClient()
    private val mutex = Mutex()

    private var startedToken: String? = null

    private val _events = MutableSharedFlow<EntityUpdatedEvent>(
        replay = 0,
        extraBufferCapacity = 64,
    )
    val events: SharedFlow<EntityUpdatedEvent> = _events

    fun start(token: String) {
        if (token.isBlank()) return
        scope.launch {
            mutex.withLock {
                if (startedToken == token) return@withLock
                startedToken = token
                scope.launch {
                    client.connect(token).collect { ev ->
                        _events.tryEmit(ev)
                    }
                }
            }
        }
    }

    fun stop() {
        scope.launch {
            mutex.withLock {
                startedToken = null
                // RealtimeClient closes on collector cancellation; we keep it simple for now.
            }
        }
    }
}

