package mx.nexara.mobile.nativeapp.push

import android.util.Log
import com.google.firebase.messaging.FirebaseMessagingService
import com.google.firebase.messaging.RemoteMessage
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import mx.nexara.mobile.nativeapp.data.AuthRepository
import mx.nexara.mobile.nativeapp.data.api.ApiClient
import mx.nexara.mobile.nativeapp.data.api.DevicesApi
import mx.nexara.mobile.nativeapp.data.api.RegisterFcmTokenRequest

/**
 * Servicio FCM: recibe mensajes push del backend y actualiza el token registrado.
 * El backend registra el token vía POST /devices/push-token (ver DevicesApi).
 */
class NexaraFirebaseService : FirebaseMessagingService() {

    override fun onNewToken(token: String) {
        Log.d(TAG, "Nuevo token FCM: ${token.take(12)}…")
        val ctx = applicationContext
        CoroutineScope(Dispatchers.IO).launch {
            runCatching {
                val api = ApiClient.authed { AuthRepository(ctx).token() }.create(DevicesApi::class.java)
                api.registerPushToken(RegisterFcmTokenRequest(token = token, platform = "android"))
            }.onFailure { Log.w(TAG, "No se pudo registrar token FCM: ${it.message}") }
        }
    }

    override fun onMessageReceived(message: RemoteMessage) {
        val title = message.notification?.title ?: message.data["title"]
        val body = message.notification?.body ?: message.data["body"]
        val channel = when (message.data["channel"]) {
            "alerts" -> NexaraNotifications.CHANNEL_ALERTS
            "tickets" -> NexaraNotifications.CHANNEL_TICKETS
            "gps" -> NexaraNotifications.CHANNEL_GPS
            else -> NexaraNotifications.CHANNEL_DEFAULT
        }
        NexaraNotifications.show(
            context = applicationContext,
            title = title,
            body = body,
            channel = channel,
            data = message.data,
        )
    }

    companion object {
        private const val TAG = "NexaraFirebaseService"
    }
}
