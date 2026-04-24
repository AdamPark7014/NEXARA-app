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
import androidx.compose.material3.Button
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
import mx.nexara.mobile.nativeapp.ui.util.openFile
import java.io.File

data class TicketDetailUiState(
    val isLoading: Boolean = true,
    val error: String? = null,
    val ticket: ClientPortalTicketDto? = null,
    val downloading: Boolean = false,
)

class TicketDetailViewModel(app: Application) : AndroidViewModel(app) {
    private val repo = TicketsRepository(app.applicationContext)
    private val _state = MutableStateFlow(TicketDetailUiState())
    val state: StateFlow<TicketDetailUiState> = _state
    private var activeId: Long? = null

    init {
        refreshOnModels(
            models = setOf("Activity", "ActivityEvidence", "ServiceSheet"),
            refresh = { load(activeId) },
        )
    }

    fun load(ticketId: Long?) {
        activeId = ticketId
        if (ticketId == null) {
            _state.update { it.copy(isLoading = false, error = "Ticket inválido") }
            return
        }
        _state.update { it.copy(isLoading = true, error = null) }
        viewModelScope.launch {
            try {
                val t = withContext(Dispatchers.IO) { repo.ticket(ticketId) }
                _state.update { it.copy(isLoading = false, ticket = t, error = null) }
            } catch (e: Exception) {
                _state.update {
                    it.copy(
                        isLoading = false,
                        error = e.message?.takeIf { m -> m.isNotBlank() } ?: "No se pudo cargar el ticket",
                    )
                }
            }
        }
    }

    fun downloadReport(ticketId: Long?) {
        if (ticketId == null) return
        _state.update { it.copy(downloading = true) }
        viewModelScope.launch {
            try {
                val bytes = withContext(Dispatchers.IO) { repo.ticketReportPdfBytes(ticketId) }
                val app = getApplication<Application>()
                val dir = File(app.cacheDir, "downloads").apply { mkdirs() }
                val file = File(dir, "reporte-ticket-$ticketId.pdf")
                file.writeBytes(bytes)
                openFile(app, file, "application/pdf")
            } catch (e: Exception) {
                _state.update {
                    it.copy(
                        error = e.message?.takeIf { m -> m.isNotBlank() } ?: "No se pudo descargar el PDF",
                    )
                }
            } finally {
                _state.update { it.copy(downloading = false) }
            }
        }
    }
}

@Composable
fun TicketsTicketDetailScreen(
    ticketId: Long?,
    onBack: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val vm: TicketDetailViewModel = viewModel()
    val state by vm.state.collectAsState()

    androidx.compose.runtime.LaunchedEffect(ticketId) {
        vm.load(ticketId)
    }

    Column(
        modifier = modifier
            .fillMaxSize()
            .padding(16.dp),
        verticalArrangement = Arrangement.Top,
    ) {
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp), modifier = Modifier.fillMaxWidth()) {
            OutlinedButton(onClick = onBack, modifier = Modifier.weight(1f)) { Text("Volver") }
            OutlinedButton(onClick = { vm.load(ticketId) }, modifier = Modifier.weight(1f)) { Text("Actualizar") }
        }

        Spacer(Modifier.height(12.dp))
        Text("Detalle ticket", style = MaterialTheme.typography.titleLarge)
        Spacer(Modifier.height(8.dp))

        if (state.isLoading) {
            Text("Cargando…", color = MaterialTheme.colorScheme.onSurfaceVariant)
            return@Column
        }

        if (!state.error.isNullOrBlank()) {
            Text(state.error!!, color = MaterialTheme.colorScheme.error)
            Spacer(Modifier.height(10.dp))
        }

        val t = state.ticket
        if (t == null) {
            Text("Ticket no encontrado.", color = MaterialTheme.colorScheme.onSurfaceVariant)
            return@Column
        }

        Text(t.titulo ?: "Ticket #${t.id}", style = MaterialTheme.typography.titleMedium)
        Spacer(Modifier.height(6.dp))
        Text(
            listOfNotNull(
                t.anNumber?.takeIf { it.isNotBlank() },
                t.estatus?.takeIf { it.isNotBlank() },
                t.branchName?.takeIf { it.isNotBlank() },
            ).joinToString(" · "),
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
        Spacer(Modifier.height(14.dp))

        Button(
            onClick = { vm.downloadReport(ticketId) },
            enabled = !state.downloading,
            modifier = Modifier.fillMaxWidth(),
        ) { Text(if (state.downloading) "Descargando…" else "Descargar reporte (PDF)") }
    }
}

