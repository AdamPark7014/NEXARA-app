package mx.nexara.mobile.nativeapp.ui.tickets.screens

import android.app.Application
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
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
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Modifier
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
import mx.nexara.mobile.nativeapp.data.api.ClientTicketRequestDto
import mx.nexara.mobile.nativeapp.data.realtime.refreshOnModels
import mx.nexara.mobile.nativeapp.data.tickets.TicketsRepository

data class TicketsRequestsUiState(
    val isLoading: Boolean = true,
    val saving: Boolean = false,
    val error: String? = null,
    val message: String? = null,
    val requests: List<ClientTicketRequestDto> = emptyList(),
)

class TicketsRequestsViewModel(app: Application) : AndroidViewModel(app) {
    private val repo = TicketsRepository(app.applicationContext)
    private val _state = MutableStateFlow(TicketsRequestsUiState())
    val state: StateFlow<TicketsRequestsUiState> = _state

    init {
        refresh()
        refreshOnModels(
            models = setOf("ClientTicketRequest", "Activity"),
            refresh = ::refresh,
        )
    }

    fun refresh() {
        _state.update { it.copy(isLoading = true, error = null, message = null) }
        viewModelScope.launch {
            try {
                val list = withContext(Dispatchers.IO) { repo.requests() }
                _state.update { it.copy(isLoading = false, requests = list, error = null) }
            } catch (e: Exception) {
                _state.update {
                    it.copy(
                        isLoading = false,
                        error = e.message?.takeIf { m -> m.isNotBlank() } ?: "No se pudieron cargar solicitudes",
                    )
                }
            }
        }
    }

    fun dismissMessage() = _state.update { it.copy(message = null) }

    fun closeRequest(id: Long) {
        _state.update { it.copy(saving = true, error = null, message = null) }
        viewModelScope.launch {
            try {
                withContext(Dispatchers.IO) { repo.closeRequest(id) }
                _state.update { it.copy(saving = false, message = "Solicitud cerrada") }
                refresh()
            } catch (e: Exception) {
                _state.update {
                    it.copy(
                        saving = false,
                        error = e.message?.takeIf { m -> m.isNotBlank() } ?: "No se pudo cerrar la solicitud",
                    )
                }
            }
        }
    }
}

@Composable
fun TicketsRequestsScreen(
    onBack: () -> Unit,
    onCreate: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val vm: TicketsRequestsViewModel = viewModel()
    val state by vm.state.collectAsState()

    Column(
        modifier = modifier
            .fillMaxSize()
            .padding(16.dp),
        verticalArrangement = Arrangement.Top,
    ) {
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp), modifier = Modifier.fillMaxWidth()) {
            OutlinedButton(onClick = onBack, modifier = Modifier.weight(1f)) { Text("Volver") }
            OutlinedButton(onClick = { vm.refresh() }, modifier = Modifier.weight(1f)) { Text("Actualizar") }
            Button(onClick = onCreate, modifier = Modifier.weight(1f)) { Text("+ Nueva") }
        }

        Spacer(Modifier.height(12.dp))
        Text("Solicitudes", style = MaterialTheme.typography.titleLarge)
        Spacer(Modifier.height(8.dp))

        if (!state.message.isNullOrBlank()) {
            Text(state.message!!, color = MaterialTheme.colorScheme.primary)
            OutlinedButton(onClick = vm::dismissMessage) { Text("Cerrar aviso") }
            Spacer(Modifier.height(8.dp))
        }

        if (state.isLoading) {
            Text("Cargando…", color = MaterialTheme.colorScheme.onSurfaceVariant)
            return@Column
        }

        if (!state.error.isNullOrBlank()) {
            Text(state.error!!, color = MaterialTheme.colorScheme.error)
            Spacer(Modifier.height(10.dp))
            Button(onClick = { vm.refresh() }) { Text("Reintentar") }
            return@Column
        }

        if (state.requests.isEmpty()) {
            Text("No hay solicitudes registradas.", color = MaterialTheme.colorScheme.onSurfaceVariant)
            return@Column
        }

        LazyColumn(
            modifier = Modifier.fillMaxWidth(),
            verticalArrangement = Arrangement.spacedBy(10.dp),
        ) {
            items(state.requests, key = { it.id }) { r ->
                Card(
                    modifier = Modifier.fillMaxWidth(),
                    colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
                ) {
                    Column(Modifier.padding(12.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                        Text(
                            text = r.description,
                            style = MaterialTheme.typography.titleSmall,
                        )
                        val meta = buildList {
                            r.status?.takeIf { it.isNotBlank() }?.let { add("Estatus: $it") }
                            r.urgency?.takeIf { it.isNotBlank() }?.let { add("Urgencia: $it") }
                            r.requestType?.takeIf { it.isNotBlank() }?.let { add("Tipo: $it") }
                            r.branchName?.takeIf { it.isNotBlank() }?.let { add("Sucursal: $it") }
                        }.joinToString(" · ")
                        if (meta.isNotBlank()) {
                            Text(meta, color = MaterialTheme.colorScheme.onSurfaceVariant)
                        }
                        if ((r.status ?: "").uppercase() != "CLOSED") {
                            OutlinedButton(
                                onClick = { vm.closeRequest(r.id) },
                                enabled = !state.saving,
                            ) { Text(if (state.saving) "Cerrando…" else "Cerrar") }
                        }
                    }
                }
            }
        }
    }
}

