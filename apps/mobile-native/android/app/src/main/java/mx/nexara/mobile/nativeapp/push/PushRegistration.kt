package mx.nexara.mobile.nativeapp.push

import android.content.Context
import android.util.Log
import com.google.firebase.messaging.FirebaseMessaging
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.launch
import kotlinx.coroutines.tasks.await
import kotlinx.coroutines.withTimeoutOrNull
import mx.nexara.mobile.nativeapp.data.AuthRepository
import mx.nexara.mobile.nativeapp.data.api.ApiClient
import mx.nexara.mobile.nativeapp.data.api.DevicesApi
import mx.nexara.mobile.nativeapp.data.api.RegisterFcmTokenRequest

/**
 * Flujo de "registrar este dispositivo para push" — llamado justo tras login
 * y desde MainActivity.onCreate. Idempotente: el backend hace upsert.
 *
 * Si FCM entrega un token nuevo sin sesión abierta, [NexaraFirebaseService] lo
 * guarda aquí y [registerCurrentDeviceAsync] lo registra tras el login (aunque
 * `FirebaseMessaging.getToken()` falle en ese momento).
 */
object PushRegistration {
    private const val TAG = "PushRegistration"
    private const val PREFS = "nx_push_registration"
    private const val KEY_TOKEN = "fcm_token"
    private const val KEY_PENDING = "fcm_token_pending"

    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)

    /** Guarda el último token de FCM; queda pendiente hasta que el API lo acepte. */
    fun rememberToken(context: Context, token: String) {
        if (token.isBlank()) return
        prefs(context).edit().putString(KEY_TOKEN, token).putBoolean(KEY_PENDING, true).apply()
    }

    fun registerCurrentDeviceAsync(context: Context) {
        val app = context.applicationContext
        scope.launch {
            runCatching {
                val auth = AuthRepository(app)
                if (auth.token().isNullOrBlank()) return@runCatching
                val fresh = runCatching {
                    withTimeoutOrNull(15_000L) { FirebaseMessaging.getInstance().token.await() }
                }.getOrNull()?.takeIf { it.isNotBlank() }
                val fcmToken = fresh ?: storedToken(app) ?: return@runCatching
                register(app, auth, fcmToken)
            }.onFailure { Log.w(TAG, "Error: ${it.message}") }
        }
    }

    /** Registra [token] ya conocido (p. ej. desde `onNewToken`) si hay sesión. */
    fun registerTokenAsync(context: Context, token: String) {
        val app = context.applicationContext
        scope.launch {
            runCatching {
                val auth = AuthRepository(app)
                if (auth.token().isNullOrBlank()) return@runCatching
                register(app, auth, token)
            }.onFailure { Log.w(TAG, "No se pudo registrar token FCM: ${it.message}") }
        }
    }

    private suspend fun register(app: Context, auth: AuthRepository, fcmToken: String) {
        val api = ApiClient.authed(
            tokenProvider = { auth.token() },
            companyIdProvider = { auth.companyId() },
        ).create(DevicesApi::class.java)
        api.registerPushToken(RegisterFcmTokenRequest(fcmToken, "android"))
        prefs(app).edit().putString(KEY_TOKEN, fcmToken).putBoolean(KEY_PENDING, false).apply()
        Log.d(TAG, "Token FCM registrado: ${fcmToken.takeLast(8)}")
    }

    private fun storedToken(context: Context): String? =
        prefs(context).getString(KEY_TOKEN, null)?.takeIf { it.isNotBlank() }

    private fun prefs(context: Context) =
        context.applicationContext.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
}
