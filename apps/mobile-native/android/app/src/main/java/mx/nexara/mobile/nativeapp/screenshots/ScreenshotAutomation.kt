package mx.nexara.mobile.nativeapp.screenshots

import android.content.Context
import android.net.Uri
import android.util.Log
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import mx.nexara.mobile.nativeapp.BuildConfig
import mx.nexara.mobile.nativeapp.data.AuthRepository
import mx.nexara.mobile.nativeapp.data.onboarding.OnboardingStore
import mx.nexara.mobile.nativeapp.push.PushRegistration
import mx.nexara.mobile.nativeapp.security.AppLock

/**
 * Utilidades solo para builds debug: preparar la app y auto-login antes de capturas Play Store.
 * Activar vía deep link `nexara://debug/screenshot-prep` y `nexara://debug/auto-login?...`.
 */
object ScreenshotAutomation {
    private const val TAG = "ScreenshotAutomation"
    const val EXTRA_EMAIL = "nexara_screenshot_email"
    const val EXTRA_PASSWORD = "nexara_screenshot_password"

    fun isDebugAutomationUri(uri: Uri?): Boolean =
        BuildConfig.DEBUG && uri?.host.equals("debug", ignoreCase = true)

    suspend fun handle(
        context: Context,
        uri: Uri,
        emailExtra: String? = null,
        passwordExtra: String? = null,
    ): Boolean {
        if (!BuildConfig.DEBUG) return false
        val action = uri.pathSegments.firstOrNull()?.lowercase() ?: return false
        return when (action) {
            "screenshot-prep" -> prep(context)
            "auto-login" -> autoLogin(context, uri, emailExtra, passwordExtra)
            else -> false
        }
    }

    private suspend fun prep(context: Context): Boolean = withContext(Dispatchers.IO) {
        runCatching {
            OnboardingStore(context).markCompleted()
            AppLock.setEnabled(context, false)
            Log.i(TAG, "Screenshot prep: onboarding completado, app lock desactivado")
        }.onFailure { Log.w(TAG, "Screenshot prep falló: ${it.message}") }
        true
    }

    private suspend fun autoLogin(
        context: Context,
        uri: Uri,
        emailExtra: String?,
        passwordExtra: String?,
    ): Boolean = withContext(Dispatchers.IO) {
        val email = emailExtra?.trim().orEmpty().ifBlank { uri.getQueryParameter("email")?.trim().orEmpty() }
        val password = passwordExtra.orEmpty().ifBlank { uri.getQueryParameter("password").orEmpty() }
        if (email.isBlank() || password.isBlank()) {
            Log.w(TAG, "auto-login: faltan email o password en query")
            return@withContext true
        }
        runCatching {
            prep(context)
            AuthRepository(context).login(email, password)
            PushRegistration.registerCurrentDeviceAsync(context)
            Log.i(TAG, "auto-login OK para $email")
        }.onFailure { Log.w(TAG, "auto-login falló: ${it.message}") }
        true
    }
}
