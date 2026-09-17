package mx.nexara.mobile.nativeapp.data

import android.content.Context

/**
 * «Recordarme» del inicio de sesión.
 *
 * - Activo (por omisión): la sesión se queda abierta en este teléfono y la app entra directo, sin
 *   volver a pedir contraseña; la renovación automática la mantiene viva.
 * - Apagado: la sesión dura mientras la app siga abierta. Al abrirla de nuevo desde cero se cierra y
 *   pide entrar otra vez (útil en teléfonos compartidos).
 *
 * Se lee de forma síncrona porque se decide antes de dibujar la primera pantalla.
 */
object RememberMe {
    private const val PREFS = "nx_login_remember"
    private const val KEY = "remember_me"

    /** Solo la primera actividad de cada proceso decide si cerrar la sesión. */
    @Volatile
    private var coldStartChecked = false

    fun isEnabled(context: Context): Boolean =
        context.applicationContext.getSharedPreferences(PREFS, Context.MODE_PRIVATE).getBoolean(KEY, true)

    fun setEnabled(context: Context, enabled: Boolean) {
        context.applicationContext.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
            .edit()
            .putBoolean(KEY, enabled)
            .apply()
    }

    /**
     * Al abrir la app desde cero: si la persona no pidió que la recordaran, se cierra la sesión que
     * quedó guardada. Un push que despierta el proceso en segundo plano no pasa por aquí.
     */
    fun endSessionOnColdStartIfNeeded(context: Context) {
        if (coldStartChecked) return
        coldStartChecked = true
        if (isEnabled(context)) return
        val auth = AuthRepository(context.applicationContext)
        if (!auth.token().isNullOrBlank()) auth.logout()
    }
}
