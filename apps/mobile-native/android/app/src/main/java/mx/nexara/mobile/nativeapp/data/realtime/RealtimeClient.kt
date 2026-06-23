package mx.nexara.mobile.nativeapp.data.realtime

import io.socket.client.IO
import io.socket.client.Socket
import io.socket.emitter.Emitter
import kotlinx.coroutines.channels.awaitClose
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.callbackFlow
import mx.nexara.mobile.nativeapp.data.api.apiAssetOrigin
import org.json.JSONObject

data class EntityUpdatedEvent(
    val model: String? = null,
    val action: String? = null,
    val timestamp: String? = null,
)

class RealtimeClient {
    private var socket: Socket? = null

    fun connect(token: String): Flow<EntityUpdatedEvent> = callbackFlow {
        val baseUrl = apiAssetOrigin()

        val opts = IO.Options.builder()
            .setTransports(arrayOf("websocket", "polling"))
            .setAuth(mapOf("token" to token))
            .build()

        val s = IO.socket(baseUrl, opts)
        socket = s

        val onEntityUpdated = Emitter.Listener { args ->
            val raw = args.firstOrNull()
            val obj = raw as? JSONObject
            trySend(
                EntityUpdatedEvent(
                    model = obj?.optString("model")?.takeIf { it.isNotBlank() },
                    action = obj?.optString("action")?.takeIf { it.isNotBlank() },
                    timestamp = obj?.optString("timestamp")?.takeIf { it.isNotBlank() },
                )
            )
        }

        s.on("entity:updated", onEntityUpdated)
        s.connect()

        awaitClose {
            try {
                s.off("entity:updated", onEntityUpdated)
                s.disconnect()
                s.close()
            } catch (_: Exception) {
            }
            if (socket == s) socket = null
        }
    }
}

