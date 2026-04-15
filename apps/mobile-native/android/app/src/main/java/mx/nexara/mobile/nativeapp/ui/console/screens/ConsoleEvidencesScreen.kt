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
import androidx.compose.runtime.remember
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
import mx.nexara.mobile.nativeapp.data.api.ActivityEvidenceRowDto
import mx.nexara.mobile.nativeapp.data.console.ConsoleRepository
import mx.nexara.mobile.nativeapp.ui.util.openExternalUrl

data class EvidencesUiState(
    val isLoading: Boolean = true,
    val error: String? = null,
    val query: String = "",
    val rows: List<ActivityEvidenceRowDto> = emptyList(),
)

class ConsoleEvidencesViewModel(app: Application) : AndroidViewModel(app) {
    private val repo = ConsoleRepository(app.applicationContext)

    private val _state = MutableStateFlow(EvidencesUiState())
    val state: StateFlow<EvidencesUiState> = _state

    fun setQuery(value: String) = _state.update { it.copy(query = value) }

    fun refresh(mode: String) {
        _state.update { it.copy(isLoading = true, error = null) }
        viewModelScope.launch {
            try {
                val list = withContext(Dispatchers.IO) {
                    if (mode == "user") repo.evidencesMyHistory() else repo.evidencesReviewHistory()
                }
                _state.update { it.copy(isLoading = false, rows = list, error = null) }
            } catch (e: Exception) {
                _state.update {
                    it.copy(
                        isLoading = false,
                        error = e.message?.takeIf { msg -> msg.isNotBlank() } ?: "No se pudieron cargar evidencias",
                    )
                }
            }
        }
    }
}

@Composable
fun ConsoleEvidencesScreen(
    mode: String, // "admin" | "user"
    contentPadding: PaddingValues = PaddingValues(16.dp),
) {
    val context = LocalContext.current
    val vm: ConsoleEvidencesViewModel = viewModel()
    val state by vm.state.collectAsState()

    if (state.rows.isEmpty() && state.isLoading && state.error == null) {
        vm.refresh(mode = mode)
    }

    val q = state.query.trim().lowercase()
    val filtered = remember(state.rows, q) {
        if (q.isBlank()) return@remember state.rows
        state.rows.filter { r ->
            val hay = buildString {
                append(r.estatus ?: "")
                append(" ")
                append(r.tipoEvidencia ?: "")
                append(" ")
                append(r.comentarios ?: "")
                append(" ")
                append(r.actividad?.anNumber ?: "")
                append(" ")
                append(r.actividad?.titulo ?: "")
                append(" ")
                append(r.actividad?.branchName ?: "")
                append(" ")
                append(r.user?.nombre ?: "")
            }.lowercase()
            hay.contains(q)
        }
    }

    Column(
        modifier = Modifier
            .fillMaxSize()
            .padding(contentPadding),
        verticalArrangement = Arrangement.Top,
    ) {
        Text(
            text = if (mode == "user") "Mis evidencias" else "Evidencias (revisión)",
            style = MaterialTheme.typography.titleLarge,
        )
        Spacer(modifier = Modifier.height(10.dp))

        if (state.isLoading) {
            Text("Cargando evidencias...", color = MaterialTheme.colorScheme.onSurfaceVariant)
            return@Column
        }

        if (!state.error.isNullOrBlank()) {
            Text(state.error!!, color = MaterialTheme.colorScheme.error)
            Spacer(modifier = Modifier.height(12.dp))
            Button(onClick = { vm.refresh(mode = mode) }) { Text("Reintentar") }
            return@Column
        }

        OutlinedTextField(
            value = state.query,
            onValueChange = vm::setQuery,
            label = { Text("Buscar (AN, sucursal, responsable, estatus)") },
            singleLine = true,
            modifier = Modifier.fillMaxWidth(),
        )
        Spacer(modifier = Modifier.height(10.dp))
        Text(
            text = "Total: ${filtered.size}",
            style = MaterialTheme.typography.labelLarge,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
        Spacer(modifier = Modifier.height(10.dp))

        LazyColumn(
            verticalArrangement = Arrangement.spacedBy(8.dp),
            modifier = Modifier.fillMaxWidth(),
        ) {
            items(filtered.take(200)) { r ->
                Card(
                    modifier = Modifier.fillMaxWidth(),
                    colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
                ) {
                    Column(modifier = Modifier.padding(12.dp)) {
                        Text(
                            text = (r.actividad?.anNumber ?: "Evidencia #${r.id}"),
                            style = MaterialTheme.typography.titleSmall,
                        )
                        val title = r.actividad?.titulo
                        if (!title.isNullOrBlank()) {
                            Text(title, color = MaterialTheme.colorScheme.onSurfaceVariant, style = MaterialTheme.typography.bodySmall)
                        }
                        val status = r.estatus ?: "-"
                        val owner = r.user?.nombre ?: r.actividad?.responsable?.nombre ?: "-"
                        Text("Estatus: $status", color = MaterialTheme.colorScheme.onSurfaceVariant, style = MaterialTheme.typography.bodySmall)
                        Text("Responsable: $owner", color = MaterialTheme.colorScheme.onSurfaceVariant, style = MaterialTheme.typography.bodySmall)

                        Spacer(modifier = Modifier.height(8.dp))
                        val pdfUrl = r.serviceSheetPdfUrl ?: r.archivoUrl
                        if (!pdfUrl.isNullOrBlank()) {
                            Button(onClick = { openExternalUrl(context, pdfUrl) }) {
                                Text("Abrir archivo")
                            }
                        }
                    }
                }
            }
        }
    }
}

