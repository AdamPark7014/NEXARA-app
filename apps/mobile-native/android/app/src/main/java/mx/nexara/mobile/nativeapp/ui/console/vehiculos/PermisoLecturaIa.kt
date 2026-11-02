package mx.nexara.mobile.nativeapp.ui.console.vehiculos

import android.content.Context
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import mx.nexara.mobile.nativeapp.data.AuthRepository

/**
 * Permiso para leer las fotos con IA. La foto del ticket o del tablero va a un servicio de terceros
 * (Anthropic), así que se pregunta antes de la primera y sin permiso no se manda: la foto se queda
 * de respaldo y los datos se escriben a mano. Apple lo exige en su guía 5.1.2(i).
 *
 * El «sí» se guarda por persona en el teléfono y se quita en Mi perfil. El «a mano» vale solo para
 * esa pantalla: como no hay ajuste que lo revierta, la siguiente vez se vuelve a preguntar.
 */
class PermisoLecturaIa(
    concedido: Boolean,
    private val guardar: () -> Unit,
) {
    var concedido by mutableStateOf(concedido)
        private set
    var aMano by mutableStateOf(false)
        private set

    /** Lo que sigue tras contestar: abrir la cámara. Con valor, el aviso está en pantalla. */
    var pendiente by mutableStateOf<(() -> Unit)?>(null)
        private set

    val puedeLeer: Boolean get() = concedido && !aMano

    fun antesDeLaFoto(seguir: () -> Unit) {
        if (concedido || aMano) seguir() else pendiente = seguir
    }

    fun permitir() {
        concedido = true
        guardar()
        contestar()
    }

    fun escribirAMano() {
        aMano = true
        contestar()
    }

    /** Cerrar el aviso sin contestar: ni foto ni permiso. */
    fun cancelar() {
        pendiente = null
    }

    private fun contestar() {
        val seguir = pendiente
        pendiente = null
        seguir?.invoke()
    }

    companion object {
        const val TITULO = "¿Leemos la foto con IA?"
        const val MENSAJE =
            "Para llenar los datos por ti, NEXARA manda la foto a Anthropic, un servicio de inteligencia " +
                "artificial que lee los números. Tú los confirmas antes de guardar.\n\n" +
                "Si prefieres, toma la foto y escribe los datos a mano."
        const val PERMITIR = "Permitir"
        const val A_MANO = "Escribir a mano"

        private const val PREFS = "nexara_lectura_ia"

        private fun clave(context: Context): String =
            "permitido_${AuthRepository(context).loadSession()?.id ?: 0L}"

        fun estaConcedido(context: Context): Boolean =
            context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).getBoolean(clave(context), false)

        fun conceder(context: Context) {
            context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit().putBoolean(clave(context), true).apply()
        }

        /** Desde Mi perfil. */
        fun quitar(context: Context) {
            context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit().remove(clave(context)).apply()
        }
    }
}

@Composable
internal fun rememberPermisoLecturaIa(): PermisoLecturaIa {
    val context = LocalContext.current
    return remember(context) {
        PermisoLecturaIa(concedido = PermisoLecturaIa.estaConcedido(context)) { PermisoLecturaIa.conceder(context) }
    }
}

/** Un diálogo, no un texto en la pantalla: Apple pide que se vea y se conteste antes de mandar nada. */
@Composable
internal fun AvisoLecturaIa(permiso: PermisoLecturaIa) {
    if (permiso.pendiente == null) return
    AlertDialog(
        onDismissRequest = permiso::cancelar,
        title = { Text(PermisoLecturaIa.TITULO) },
        text = { Text(PermisoLecturaIa.MENSAJE) },
        confirmButton = {
            TextButton(onClick = permiso::permitir) {
                Text(PermisoLecturaIa.PERMITIR, fontWeight = FontWeight.SemiBold)
            }
        },
        dismissButton = {
            TextButton(onClick = permiso::escribirAMano) { Text(PermisoLecturaIa.A_MANO) }
        },
    )
}
