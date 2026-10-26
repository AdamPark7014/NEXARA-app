package mx.nexara.mobile.nativeapp.push

import android.util.Log
import com.google.firebase.messaging.FirebaseMessagingService
import com.google.firebase.messaging.RemoteMessage
import mx.nexara.mobile.nativeapp.data.AuthRepository

/**
 * Servicio FCM. El API manda a Android mensajes solo de datos con prioridad alta,
 * así que `onMessageReceived` corre siempre (app abierta, en segundo plano o
 * cerrada) y aquí se pinta la notificación. El token se registra vía
 * POST /devices/push-token (ver [PushRegistration]).
 */
class NexaraFirebaseService : FirebaseMessagingService() {

    override fun onNewToken(token: String) {
        Log.d(TAG, "Nuevo token FCM: ${token.take(12)}…")
        val ctx = applicationContext
        // Se guarda siempre: sin sesión, PushRegistration lo registra tras el login.
        PushRegistration.rememberToken(ctx, token)
        val hasSession = runCatching { !AuthRepository(ctx).token().isNullOrBlank() }.getOrDefault(false)
        if (!hasSession) {
            Log.d(TAG, "Sin sesión: el token queda pendiente hasta el login")
            return
        }
        PushRegistration.registerTokenAsync(ctx, token)
    }

    /** Corre en un hilo de FCM: la descarga del avatar puede bloquear unos segundos. */
    override fun onMessageReceived(message: RemoteMessage) {
        // Latido del GPS de jornada (el servidor lleva 35 min sin un punto): no se muestra nada;
        // se toma un punto, o se pide tocar para reanudar si Android cerró el servicio.
        if (message.data["event"] == "gps-latido") {
            runCatching { mx.nexara.mobile.nativeapp.util.JornadaGps.latido(applicationContext) }
                .onFailure { Log.w(TAG, "Latido de GPS: ${it.message}") }
            return
        }
        try {
            val payload = PushPayload.from(
                data = message.data,
                fallbackTitle = message.notification?.title,
                fallbackBody = message.notification?.body,
                fallbackSentAt = message.sentTime,
            )
            NexaraPushRenderer.render(applicationContext, payload)
        } catch (e: Exception) {
            Log.w(TAG, "Push no mostrado: ${e.message}", e)
        }
    }

    companion object {
        private const val TAG = "NexaraFirebaseService"
    }
}
