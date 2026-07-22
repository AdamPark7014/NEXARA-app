package mx.nexara.mobile.nativeapp.ui.common

import android.Manifest
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp
import mx.nexara.mobile.nativeapp.ui.enterprise.NxColors
import mx.nexara.mobile.nativeapp.util.DeviceLocation

/**
 * Banner para solicitar permiso de ubicación en pantallas de campo
 * (maintenance, asistencia, evidencias, GPS).
 */
@Composable
fun LocationPermissionBanner(
    message: String = "Activa la ubicación para registrar GPS en esta acción de campo.",
    modifier: Modifier = Modifier,
    requestOnAppear: Boolean = false,
) {
    val context = LocalContext.current
    var granted by remember { mutableStateOf(DeviceLocation.hasPermission(context)) }
    val launcher = rememberLauncherForActivityResult(
        ActivityResultContracts.RequestMultiplePermissions(),
    ) {
        granted = DeviceLocation.hasPermission(context)
    }

    fun ask() {
        launcher.launch(
            arrayOf(
                Manifest.permission.ACCESS_FINE_LOCATION,
                Manifest.permission.ACCESS_COARSE_LOCATION,
            ),
        )
    }

    LaunchedEffect(requestOnAppear) {
        if (requestOnAppear && !granted) ask()
    }

    if (granted) return

    Card(
        modifier = modifier.fillMaxWidth(),
        colors = CardDefaults.cardColors(containerColor = NxColors.WarningSoft),
    ) {
        Column(
            Modifier.padding(12.dp),
            verticalArrangement = Arrangement.spacedBy(8.dp),
        ) {
            Text(
                "Ubicación desactivada",
                style = MaterialTheme.typography.titleSmall,
                color = NxColors.Slate,
            )
            Text(
                message,
                style = MaterialTheme.typography.bodySmall,
                color = NxColors.Muted,
            )
            Row(
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(8.dp),
            ) {
                Button(onClick = { ask() }) { Text("Permitir ubicación") }
                TextButton(onClick = { granted = DeviceLocation.hasPermission(context) }) {
                    Text("Ya lo activé")
                }
            }
        }
    }
}
