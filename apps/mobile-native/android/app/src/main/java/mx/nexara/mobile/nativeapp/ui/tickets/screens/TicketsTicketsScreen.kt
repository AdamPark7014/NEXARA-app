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
import mx.nexara.mobile.nativeapp.data.api.ClientPortalTicketDto
import mx.nexara.mobile.nativeapp.data.realtime.refreshOnModels
import mx.nexara.mobile.nativeapp.data.tickets.TicketsRepository

data class TicketsTicketsUiState(
    val isLoading: Boolean = true,
    val error: String? = null,
    val tickets: List<ClientPortalTicketDto> = emptyList(),
)

class TicketsTicketsViewModel(app: Application) : AndroidViewModel(app) {
    private val repo = TicketsRepository(app.applicationContext)
    private val _state = MutableStateFlow(TicketsTicketsUiState())
    val state: StateFlow<TicketsTicketsUiState> = _state

    init {
        refresh()
        refreshOnModels(
            models = setOf("Activity", "ActivityEvidence", "ServiceSheet"),
            refresh = ::refresh,
        )
    }

    fun refresh() {
        _state.update { it.copy(isLoading = true, error = null) }
        viewModelScope.launch {
            try {
                val list = withContext(Dispatchers.IO) { repo.tickets() }
                _state.update { it.copy(isLoading = false, tickets = list, error = null) }
            } catch (e: Exception) {
                _state.update {
                    it.copy(
                        isLoading = false,
                        error = e.message?.takeIf { m -> m.isNotBlank() } ?: "No se pudieron cargar tickets",
                    )
                }
            }
        }
    }
}

@Composable
fun TicketsTicketsScreen(
    onBack: () -> Unit,
    onOpenTicket: (Long) -> Unit,
    modifier: Modifier = Modifier,
) {
    val vm: TicketsTicketsViewModel = viewModel()
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
        }

        Spacer(Modifier.height(12.dp))
        Text("Tickets", style = MaterialTheme.typography.titleLarge)
        Spacer(Modifier.height(8.dp))

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

        if (state.tickets.isEmpty()) {
            Text("No hay tickets en el rango actual.", color = MaterialTheme.colorScheme.onSurfaceVariant)
            return@Column
        }

        LazyColumn(
            modifier = Modifier.fillMaxWidth(),
            verticalArrangement = Arrangement.spacedBy(10.dp),
        ) {
            items(state.tickets, key = { it.id }) { t ->
                Card(
                    modifier = Modifier.fillMaxWidth(),
                    colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
                ) {
                    Column(Modifier.padding(12.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                        Text(t.titulo ?: "Ticket #${t.id}", style = MaterialTheme.typography.titleMedium)
                        val meta = buildList {
                            t.anNumber?.takeIf { it.isNotBlank() }?.let { add(it) }
                            t.estatus?.takeIf { it.isNotBlank() }?.let { add(it) }
                            t.branchName?.takeIf { it.isNotBlank() }?.let { add(it) }
                        }.joinToString(" · ")
                        if (meta.isNotBlank()) {
                            Text(meta, color = MaterialTheme.colorScheme.onSurfaceVariant)
                        }
                        OutlinedButton(onClick = { onOpenTicket(t.id) }) { Text("Ver detalle") }
                    }
                }
            }
        }
    }
}

