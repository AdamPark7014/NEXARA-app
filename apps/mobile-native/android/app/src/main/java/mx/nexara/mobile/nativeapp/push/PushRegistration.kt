package mx.nexara.mobile.nativeapp.push

import android.content.Context
import android.util.Log
import com.google.firebase.messaging.FirebaseMessaging
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.tasks.await
import mx.nexara.mobile.nativeapp.data.AuthRepository
import mx.nexara.mobile.nativeapp.data.api.ApiClient
import mx.nexara.mobile.nativeapp.data.api.DevicesApi
import mx.nexara.mobile.nativeapp.data.api.RegisterFcmTokenRequest

/**
 * Flujo de "registrar este dispositivo para push" — llamado justo tras login
 * y desde MainActivity.onCreate. Idempotente: el backend hace upsert.
 */
object PushRegistration {
    fun registerCurrentDeviceAsync(context: Context) {
        CoroutineScope(Dispatchers.IO).launch {
            runCatching {
                val auth = AuthRepository(context)
                val token = auth.token()
                if (token.isNullOrBlank()) return@runCatching
                val fcmToken = FirebaseMessaging.getInstance().token.await()
                val api = ApiClient.authed { auth.token() }.create(DevicesApi::class.java)
                api.registerPushToken(RegisterFcmTokenRequest(fcmToken, "android"))
                Log.d("PushRegistration", "Token FCM registrado: ${fcmToken.takeLast(8)}")
            }.onFailure { Log.w("PushRegistration", "Error: ${it.message}") }
        }
    }
}
