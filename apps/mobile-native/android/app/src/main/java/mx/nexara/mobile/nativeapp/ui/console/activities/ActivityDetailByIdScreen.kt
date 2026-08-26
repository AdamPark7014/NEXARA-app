package mx.nexara.mobile.nativeapp.ui.console.activities

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import mx.nexara.mobile.nativeapp.data.api.ActivityDto
import mx.nexara.mobile.nativeapp.data.console.ConsoleRepository
import mx.nexara.mobile.nativeapp.ui.console.activities.activityDetailTabIndex
import mx.nexara.mobile.nativeapp.ui.enterprise.NxLoadingBlock

@Composable
fun ConsoleActivityDetailByIdScreen(
    activityId: Long,
    onBack: () -> Unit,
    initialTabKey: String? = null,
    onOpenGps: (() -> Unit)? = null,
) {
    val context = LocalContext.current
    val repo = remember(context) { ConsoleRepository(context) }
    var activity by remember { mutableStateOf<ActivityDto?>(null) }
    var loading by remember { mutableStateOf(true) }
    var error by remember { mutableStateOf<String?>(null) }
    val initialTab = activityDetailTabIndex(initialTabKey)

    LaunchedEffect(activityId) {
        loading = true
        error = null
        runCatching { withContext(Dispatchers.IO) { repo.activityById(activityId) } }
            .onSuccess { activity = it; loading = false }
            .onFailure {
                error = it.message?.takeIf { m -> m.isNotBlank() } ?: "No se pudo cargar la actividad"
                loading = false
            }
    }

    when {
        loading -> NxLoadingBlock("Cargando actividad…")
        activity != null -> ActivityDetailScreen(
            activity = activity!!,
            onBack = onBack,
            initialTab = initialTab,
            onOpenGps = onOpenGps,
        )
        else -> Column(
            Modifier.fillMaxSize().padding(16.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            OutlinedButton(onClick = onBack) { Text("← Volver") }
            Text(
                error ?: "Actividad no encontrada",
                color = androidx.compose.material3.MaterialTheme.colorScheme.error,
            )
        }
    }
}
