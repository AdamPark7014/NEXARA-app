package mx.nexara.mobile.nativeapp.ui.console.screens

import android.app.Application
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import androidx.lifecycle.viewmodel.compose.viewModel
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import mx.nexara.mobile.nativeapp.data.console.ConsoleRepository
import mx.nexara.mobile.nativeapp.data.console.DashboardPayload

data class DashboardUiState(
    val isLoading: Boolean = true,
    val error: String? = null,
    val payload: DashboardPayload? = null,
)

class ConsoleDashboardViewModel(app: Application) : AndroidViewModel(app) {
    private val repo = ConsoleRepository(app.applicationContext)

    private val _state = MutableStateFlow(DashboardUiState())
    val state: StateFlow<DashboardUiState> = _state

    fun refresh() {
        _state.update { it.copy(isLoading = true, error = null) }
        viewModelScope.launch {
            try {
                val payload = withContext(Dispatchers.IO) { repo.dashboardFetch() }
                _state.update { it.copy(isLoading = false, payload = payload, error = null) }
            } catch (e: Exception) {
                _state.update {
                    it.copy(
                        isLoading = false,
                        error = e.message?.takeIf { msg -> msg.isNotBlank() } ?: "No se pudo cargar el dashboard",
                    )
                }
            }
        }
    }
}

@Composable
fun ConsoleDashboardScreen(
    contentPadding: PaddingValues = PaddingValues(16.dp),
) {
    val vm: ConsoleDashboardViewModel = viewModel()
    val state by vm.state.collectAsState()

    // Initial load
    if (state.payload == null && state.isLoading && state.error == null) {
        vm.refresh()
    }

    Column(
        modifier = Modifier
            .fillMaxSize()
            .padding(contentPadding),
        verticalArrangement = Arrangement.Top,
    ) {
        if (state.isLoading) {
            Text("Cargando dashboard...", color = MaterialTheme.colorScheme.onSurfaceVariant)
            return@Column
        }

        if (!state.error.isNullOrBlank()) {
            Text(state.error!!, color = MaterialTheme.colorScheme.error)
            Spacer(modifier = Modifier.height(12.dp))
            Button(onClick = { vm.refresh() }) { Text("Reintentar") }
            return@Column
        }

        val payload = state.payload ?: return@Column
        val viatics = payload.viatics
        val activities = payload.activities

        val viaticAmount = viatics.sumOf { it.montoSolicitado ?: 0.0 }
        val viaticPending = viatics.count { (it.estatusPago ?: "").equals("Pendiente", ignoreCase = true) }
        val activityTotal = activities.size
        val pendingActivities = activities.count {
            val s = (it.estatus).lowercase()
            s == "pendiente" || s == "en proceso" || s == "asignada" || s == "asignado"
        }

        Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(10.dp)) {
            KpiCard(
                modifier = Modifier.weight(1f),
                title = "Actividades",
                value = activityTotal.toString(),
                subtitle = "$pendingActivities pendientes",
            )
            KpiCard(
                modifier = Modifier.weight(1f),
                title = "Viáticos",
                value = formatCurrency(viaticAmount),
                subtitle = "$viaticPending pend.",
            )
        }

        Spacer(modifier = Modifier.height(14.dp))
        Text("Actividades recientes", style = MaterialTheme.typography.titleMedium)
        Spacer(modifier = Modifier.height(8.dp))

        LazyColumn(
            verticalArrangement = Arrangement.spacedBy(8.dp),
            modifier = Modifier.fillMaxWidth(),
        ) {
            items(activities.take(12)) { a ->
                Card(
                    modifier = Modifier.fillMaxWidth(),
                    colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
                ) {
                    Column(modifier = Modifier.padding(12.dp)) {
                        Text(a.titulo?.takeIf { it.isNotBlank() } ?: "Actividad #${a.id}", style = MaterialTheme.typography.titleSmall)
                        Text(a.estatus, color = MaterialTheme.colorScheme.onSurfaceVariant, style = MaterialTheme.typography.bodySmall)
                    }
                }
            }
        }
    }
}

@Composable
private fun KpiCard(modifier: Modifier = Modifier, title: String, value: String, subtitle: String) {
    Card(
        modifier = modifier,
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
    ) {
        Column(modifier = Modifier.padding(12.dp)) {
            Text(title, style = MaterialTheme.typography.labelLarge, color = MaterialTheme.colorScheme.onSurfaceVariant)
            Spacer(modifier = Modifier.height(6.dp))
            Text(value, style = MaterialTheme.typography.headlineSmall)
            Spacer(modifier = Modifier.height(4.dp))
            Text(subtitle, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
        }
    }
}

private fun formatCurrency(amount: Double): String {
    val rounded = kotlin.math.round(amount).toLong()
    return "$" + "%,d".format(rounded).replace(',', ',')
}

