package mx.nexara.mobile.nativeapp.security

import android.content.Context
import androidx.biometric.BiometricManager
import androidx.biometric.BiometricPrompt
import androidx.core.content.ContextCompat
import androidx.fragment.app.FragmentActivity
import kotlinx.coroutines.suspendCancellableCoroutine
import kotlin.coroutines.resume

/**
 * Bloqueo de app con biometría / PIN del dispositivo.
 * Enterprise: protege sesión de campo en dispositivos compartidos.
 */
object AppLock {
    private const val PREFS = "nexara_security"
    private const val KEY_ENABLED = "app_lock_enabled"
    private const val KEY_TIMEOUT = "app_lock_timeout_ms"
    private const val KEY_LAST_BACKGROUND = "app_lock_last_background"

    enum class Timeout(val label: String, val millis: Long) {
        IMMEDIATE("Al salir", 0L),
        ONE_MIN("1 min", 60_000L),
        FIVE_MIN("5 min", 5 * 60_000L),
        FIFTEEN_MIN("15 min", 15 * 60_000L),
        THIRTY_MIN("30 min", 30 * 60_000L),
        ;

        companion object {
            fun fromMillis(value: Long): Timeout =
                entries.firstOrNull { it.millis == value } ?: FIVE_MIN
        }
    }

    fun isEnabled(context: Context): Boolean {
        val prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
        return prefs.getBoolean(KEY_ENABLED, true)
    }

    fun setEnabled(context: Context, enabled: Boolean) {
        context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
            .edit()
            .putBoolean(KEY_ENABLED, enabled)
            .apply()
    }

    fun getTimeout(context: Context): Timeout {
        val prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
        val millis = prefs.getLong(KEY_TIMEOUT, Timeout.FIVE_MIN.millis)
        return Timeout.fromMillis(millis)
    }

    fun setTimeout(context: Context, timeout: Timeout) {
        context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
            .edit()
            .putLong(KEY_TIMEOUT, timeout.millis)
            .apply()
    }

    fun shouldLock(context: Context): Boolean =
        isEnabled(context) && canAuthenticate(context)

    fun canAuthenticate(context: Context): Boolean {
        val mgr = BiometricManager.from(context)
        val flags = BiometricManager.Authenticators.BIOMETRIC_WEAK or
            BiometricManager.Authenticators.DEVICE_CREDENTIAL
        return mgr.canAuthenticate(flags) == BiometricManager.BIOMETRIC_SUCCESS
    }

    fun recordBackground(context: Context) {
        context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
            .edit()
            .putLong(KEY_LAST_BACKGROUND, System.currentTimeMillis())
            .apply()
    }

    fun clearBackground(context: Context) {
        context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
            .edit()
            .remove(KEY_LAST_BACKGROUND)
            .apply()
    }

    fun shouldLockAfterBackground(context: Context): Boolean {
        if (!shouldLock(context)) return false
        val prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
        val lastBg = prefs.getLong(KEY_LAST_BACKGROUND, 0L)
        if (lastBg == 0L) return false
        val elapsed = System.currentTimeMillis() - lastBg
        return elapsed >= getTimeout(context).millis
    }

    suspend fun authenticate(
        activity: FragmentActivity,
        title: String = "Desbloquear NEXARA",
        subtitle: String = "Confirma tu identidad para continuar",
    ): Boolean = suspendCancellableCoroutine { cont ->
        val executor = ContextCompat.getMainExecutor(activity)
        val prompt = BiometricPrompt(
            activity,
            executor,
            object : BiometricPrompt.AuthenticationCallback() {
                override fun onAuthenticationSucceeded(result: BiometricPrompt.AuthenticationResult) {
                    if (cont.isActive) cont.resume(true)
                }

                override fun onAuthenticationError(errorCode: Int, errString: CharSequence) {
                    if (cont.isActive) cont.resume(false)
                }

                override fun onAuthenticationFailed() {
                    // Keep waiting for another attempt / cancel
                }
            },
        )
        val info = BiometricPrompt.PromptInfo.Builder()
            .setTitle(title)
            .setSubtitle(subtitle)
            .setAllowedAuthenticators(
                BiometricManager.Authenticators.BIOMETRIC_WEAK or
                    BiometricManager.Authenticators.DEVICE_CREDENTIAL,
            )
            .build()
        cont.invokeOnCancellation { prompt.cancelAuthentication() }
        prompt.authenticate(info)
    }
}
