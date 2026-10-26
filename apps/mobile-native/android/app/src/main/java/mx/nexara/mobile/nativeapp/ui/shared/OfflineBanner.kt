package mx.nexara.mobile.nativeapp.ui.shared

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextDecoration
import androidx.compose.ui.unit.dp

/** Un dato por renglón. La cola y el momento de sincronizar no cambian. */
internal fun lineasOfflineBanner(isOffline: Boolean, pendingMutations: Int): List<String> = when {
    isOffline && pendingMutations > 0 ->
        listOf("Sin conexión", "$pendingMutations en cola (incl. fotos)")
    isOffline ->
        listOf("Sin conexión", "cambios y fotos se encolan localmente")
    pendingMutations > 0 ->
        listOf("Pendientes de sync: $pendingMutations")
    else -> emptyList()
}

internal const val ACCION_REINTENTAR_OFFLINE = "Reintentar"

/**
 * Reintentar solo con señal y algo en cola, como antes: sin red, `replay` no sale y el botón
 * no haría nada.
 */
internal fun ofreceReintentarOffline(isOffline: Boolean, pendingMutations: Int): Boolean =
    !isOffline && pendingMutations > 0

@Composable
fun OfflineBanner(
    isOffline: Boolean,
    pendingMutations: Int,
    onSyncNow: (() -> Unit)? = null,
) {
    val lineas = lineasOfflineBanner(isOffline, pendingMutations)
    if (lineas.isEmpty()) return
    val bg = if (isOffline) Color(0xFFB45309) else Color(0xFF0369A1)
    val sync = onSyncNow?.takeIf { ofreceReintentarOffline(isOffline, pendingMutations) }
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .background(bg)
            .statusBarsPadding()
            // Toda la banda es el botón, como antes: el área táctil no se encoge al renglón «Reintentar».
            .then(
                if (sync != null) {
                    Modifier.clickable(role = Role.Button, onClickLabel = ACCION_REINTENTAR_OFFLINE) { sync() }
                } else {
                    Modifier
                },
            )
            .padding(horizontal = 16.dp, vertical = 8.dp),
    ) {
        lineas.forEach { linea ->
            Text(
                text = linea,
                color = Color.White,
                style = MaterialTheme.typography.labelMedium,
                fontWeight = FontWeight.SemiBold,
            )
        }
        if (sync != null) {
            Text(
                text = ACCION_REINTENTAR_OFFLINE,
                color = Color.White,
                style = MaterialTheme.typography.labelMedium,
                fontWeight = FontWeight.SemiBold,
                textDecoration = TextDecoration.Underline,
            )
        }
    }
}
