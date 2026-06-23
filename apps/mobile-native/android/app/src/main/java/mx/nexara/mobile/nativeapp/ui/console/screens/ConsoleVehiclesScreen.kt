package mx.nexara.mobile.nativeapp.ui.console.screens

import android.app.Application
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
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
import mx.nexara.mobile.nativeapp.data.api.VehicleControlDto
import mx.nexara.mobile.nativeapp.data.console.ConsoleRepository
import mx.nexara.mobile.nativeapp.ui.util.openExternalUrl

data class VehiclesUiState(
    val isLoading: Boolean = true,
    val error: String? = null,
    val query: String = "",
    val vehicles: List<VehicleControlDto> = emptyList(),
)

class ConsoleVehiclesViewModel(app: Application) : AndroidViewModel(app) {
    private val repo = ConsoleRepository(app.applicationContext)

    private val _state = MutableStateFlow(VehiclesUiState())
    val state: StateFlow<VehiclesUiState> = _state

    fun setQuery(v: String) = _state.update { it.copy(query = v) }

    fun refresh() {
        _state.update { it.copy(isLoading = true, error = null) }
        viewModelScope.launch {
            try {
                val list = withContext(Dispatchers.IO) { repo.vehiclesFetch() }
                _state.update { it.copy(isLoading = false, vehicles = list, error = null) }
            } catch (e: Exception) {
                _state.update { it.copy(isLoading = false, error = e.message ?: "No se pudieron cargar vehículos") }
            }
        }
    }
}

@Composable
fun ConsoleVehiclesScreen(
    contentPadding: PaddingValues = PaddingValues(16.dp),
) {
    val context = LocalContext.current
    val vm: ConsoleVehiclesViewModel = viewModel()
    val state by vm.state.collectAsState()

    if (state.vehicles.isEmpty() && state.isLoading && state.error == null) vm.refresh()

    val q = state.query.trim().lowercase()
    val filtered = if (q.isBlank()) state.vehicles else state.vehicles.filter { v ->
        val hay = buildString {
            append(v.vehiculo?.nombre ?: v.nombreVehiculo ?: "")
            append(" ")
            append(v.placasVehiculo ?: v.vehiculo?.placas ?: "")
            append(" ")
            append(v.estatusAprobacion)
            append(" ")
            append(v.solicitante?.nombre ?: "")
        }.lowercase()
        hay.contains(q)
    }

    Column(
        modifier = Modifier
            .fillMaxSize()
            .padding(contentPadding),
        verticalArrangement = Arrangement.Top,
    ) {
        Text("Vehículos", style = MaterialTheme.typography.titleLarge)
        Spacer(modifier = Modifier.height(10.dp))

        if (state.isLoading) {
            Text("Cargando vehículos...", color = MaterialTheme.colorScheme.onSurfaceVariant)
            return@Column
        }
        if (!state.error.isNullOrBlank()) {
            Text(state.error!!, color = MaterialTheme.colorScheme.error)
            Spacer(modifier = Modifier.height(12.dp))
            Button(onClick = { vm.refresh() }) { Text("Reintentar") }
            return@Column
        }

        OutlinedTextField(
            value = state.query,
            onValueChange = vm::setQuery,
            label = { Text("Buscar (placas, responsable, estatus)") },
            singleLine = true,
            modifier = Modifier.fillMaxWidth(),
        )
        Spacer(modifier = Modifier.height(10.dp))

        LazyColumn(
            verticalArrangement = Arrangement.spacedBy(8.dp),
            modifier = Modifier.fillMaxWidth(),
        ) {
            items(filtered.take(200)) { v ->
                Card(
                    modifier = Modifier.fillMaxWidth(),
                    colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
                ) {
                    Column(modifier = Modifier.padding(12.dp)) {
                        val name = v.vehiculo?.nombre ?: v.nombreVehiculo ?: "Vehículo"
                        val plates = v.placasVehiculo ?: v.vehiculo?.placas ?: "-"
                        Text("$name ($plates)", style = MaterialTheme.typography.titleSmall)
                        Text("Estatus: ${v.estatusAprobacion}", color = MaterialTheme.colorScheme.onSurfaceVariant, style = MaterialTheme.typography.bodySmall)
                        val requester = v.solicitante?.nombre
                        if (!requester.isNullOrBlank()) {
                            Text("Responsable: $requester", color = MaterialTheme.colorScheme.onSurfaceVariant, style = MaterialTheme.typography.bodySmall)
                        }
                        Spacer(modifier = Modifier.height(8.dp))
                        val entrega = v.evidenciaEntregaUrl
                        val devol = v.evidenciaDevolucionUrl
                        if (!entrega.isNullOrBlank()) {
                            Button(onClick = { openExternalUrl(context, entrega) }) { Text("Abrir evidencia entrega") }
                        }
                        if (!devol.isNullOrBlank()) {
                            Spacer(modifier = Modifier.height(6.dp))
                            Button(onClick = { openExternalUrl(context, devol) }) { Text("Abrir evidencia devolución") }
                        }
                    }
                }
            }
        }
    }
}

