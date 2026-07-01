package mx.nexara.mobile.nativeapp.ui.shared

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp

@Composable
fun OfflineBanner(isOffline: Boolean, pendingMutations: Int) {
    val (bg, msg) = when {
        isOffline && pendingMutations > 0 ->
            Color(0xFFB45309) to "Sin conexión · $pendingMutations cambio(s) en cola"
        isOffline ->
            Color(0xFFB45309) to "Sin conexión · mostrando datos guardados"
        pendingMutations > 0 ->
            Color(0xFF0369A1) to "Sincronizando $pendingMutations cambio(s) pendiente(s)…"
        else -> return
    }
    Text(
        text = msg,
        modifier = Modifier
            .fillMaxWidth()
            .background(bg)
            .padding(horizontal = 16.dp, vertical = 8.dp),
        color = Color.White,
        style = MaterialTheme.typography.labelMedium,
        fontWeight = FontWeight.SemiBold,
    )
}
