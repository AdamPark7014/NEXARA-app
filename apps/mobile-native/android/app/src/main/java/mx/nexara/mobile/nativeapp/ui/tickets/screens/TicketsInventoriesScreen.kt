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
import mx.nexara.mobile.nativeapp.data.api.ClientPortalInventorySnapshotDto
import mx.nexara.mobile.nativeapp.data.realtime.refreshOnModels
import mx.nexara.mobile.nativeapp.data.tickets.TicketsRepository
import mx.nexara.mobile.nativeapp.ui.util.openFile
import java.io.File

data class TicketsInventoriesUiState(
    val isLoading: Boolean = true,
    val downloading: Boolean = false,
    val error: String? = null,
    val message: String? = null,
    val inventories: List<ClientPortalInventorySnapshotDto> = emptyList(),
)

class TicketsInventoriesViewModel(app: Application) : AndroidViewModel(app) {
    private val repo = TicketsRepository(app.applicationContext)
    private val _state = MutableStateFlow(TicketsInventoriesUiState())
    val state: StateFlow<TicketsInventoriesUiState> = _state

    init {
        refresh()
        refreshOnModels(
            models = setOf("InventorySnapshot", "InventoryItem"),
            refresh = ::refresh,
        )
    }

    fun dismissMessage() = _state.update { it.copy(message = null) }

    fun refresh() {
        _state.update { it.copy(isLoading = true, error = null, message = null) }
        viewModelScope.launch {
            try {
                val list = withContext(Dispatchers.IO) { repo.inventories() }
                _state.update { it.copy(isLoading = false, inventories = list, error = null) }
            } catch (e: Exception) {
                _state.update {
                    it.copy(
                        isLoading = false,
                        error = e.message?.takeIf { m -> m.isNotBlank() } ?: "No se pudieron cargar inventarios",
                    )
                }
            }
        }
    }

    fun downloadPortalReportPdf() {
        _state.update { it.copy(downloading = true, error = null, message = null) }
        viewModelScope.launch {
            try {
                val bytes = withContext(Dispatchers.IO) { repo.portalReportPdfBytes() }
                val app = getApplication<Application>()
                val dir = File(app.cacheDir, "downloads").apply { mkdirs() }
                val file = File(dir, "reporte-tickets.pdf")
                file.writeBytes(bytes)
                openFile(app, file, "application/pdf")
                _state.update { it.copy(downloading = false, message = "Reporte descargado") }
            } catch (e: Exception) {
                _state.update {
                    it.copy(
                        downloading = false,
                        error = e.message?.takeIf { m -> m.isNotBlank() } ?: "No se pudo descargar el reporte",
                    )
                }
            }
        }
    }
}

@Composable
fun TicketsInventoriesScreen(
    onBack: () -> Unit,
    onOpenInventory: (Long) -> Unit,
    modifier: Modifier = Modifier,
) {
    val vm: TicketsInventoriesViewModel = viewModel()
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
            Button(
                onClick = { vm.downloadPortalReportPdf() },
                enabled = !state.downloading,
                modifier = Modifier.weight(1f),
            ) { Text(if (state.downloading) "Descargando…" else "Reporte PDF") }
        }

        Spacer(Modifier.height(12.dp))
        Text("Inventarios", style = MaterialTheme.typography.titleLarge)
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

        if (state.inventories.isEmpty()) {
            Text("No hay inventarios disponibles.", color = MaterialTheme.colorScheme.onSurfaceVariant)
            return@Column
        }

        LazyColumn(
            modifier = Modifier.fillMaxWidth(),
            verticalArrangement = Arrangement.spacedBy(10.dp),
        ) {
            items(state.inventories, key = { it.id }) { inv ->
                Card(
                    modifier = Modifier.fillMaxWidth(),
                    colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
                ) {
                    Column(Modifier.padding(12.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                        Text(inv.title ?: "Inventario #${inv.id}", style = MaterialTheme.typography.titleMedium)
                        val meta = buildList {
                            inv.status?.takeIf { it.isNotBlank() }?.let { add(it) }
                            inv.branch?.name?.takeIf { it.isNotBlank() }?.let { add(it) }
                            val count = inv.currentCount ?: inv.items?.size
                            if (count != null) add("Items: $count")
                        }.joinToString(" · ")
                        if (meta.isNotBlank()) {
                            Text(meta, color = MaterialTheme.colorScheme.onSurfaceVariant)
                        }
                        OutlinedButton(onClick = { onOpenInventory(inv.id) }) { Text("Ver detalle") }
                    }
                }
            }
        }
    }
}

