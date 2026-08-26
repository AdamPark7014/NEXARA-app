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
import mx.nexara.mobile.nativeapp.data.api.ToolRenewalDto
import mx.nexara.mobile.nativeapp.data.console.ConsoleRepository
import mx.nexara.mobile.nativeapp.ui.enterprise.NxLoadingBlock

data class RenewalsUiState(
    val isLoading: Boolean = true,
    val error: String? = null,
    val rejectionReason: String = "",
    val actingId: Long? = null,
    val rows: List<ToolRenewalDto> = emptyList(),
)

class ConsoleToolRenewalsViewModel(app: Application) : AndroidViewModel(app) {
    private val repo = ConsoleRepository(app.applicationContext)
    private val _state = MutableStateFlow(RenewalsUiState())
    val state: StateFlow<RenewalsUiState> = _state

    fun setRejectionReason(v: String) = _state.update { it.copy(rejectionReason = v) }

    fun refresh() {
        _state.update { it.copy(isLoading = true, error = null) }
        viewModelScope.launch {
            try {
                val list = withContext(Dispatchers.IO) { repo.toolRenewalsPending() }
                _state.update { it.copy(isLoading = false, rows = list, error = null) }
            } catch (e: Exception) {
                _state.update { it.copy(isLoading = false, error = e.message ?: "No se pudieron cargar renovaciones") }
            }
        }
    }

    fun approve(id: Long) {
        _state.update { it.copy(actingId = id, error = null) }
        viewModelScope.launch {
            try {
                withContext(Dispatchers.IO) { repo.approveToolRenewal(id) }
                _state.update { it.copy(actingId = null, rejectionReason = "") }
                refresh()
            } catch (e: Exception) {
                _state.update { it.copy(actingId = null, error = e.message ?: "No se pudo aprobar") }
            }
        }
    }

    fun reject(id: Long) {
        val reason = _state.value.rejectionReason.trim()
        if (reason.isBlank()) {
            _state.update { it.copy(error = "Escribe el motivo de rechazo") }
            return
        }
        _state.update { it.copy(actingId = id, error = null) }
        viewModelScope.launch {
            try {
                withContext(Dispatchers.IO) { repo.rejectToolRenewal(id, reason) }
                _state.update { it.copy(actingId = null, rejectionReason = "") }
                refresh()
            } catch (e: Exception) {
                _state.update { it.copy(actingId = null, error = e.message ?: "No se pudo rechazar") }
            }
        }
    }
}

@Composable
fun ConsoleToolRenewalsScreen(
    contentPadding: PaddingValues = PaddingValues(16.dp),
    onBack: () -> Unit = {},
) {
    val vm: ConsoleToolRenewalsViewModel = viewModel()
    val state by vm.state.collectAsState()

    if (state.rows.isEmpty() && state.isLoading && state.error == null) vm.refresh()

    Column(
        modifier = Modifier
            .fillMaxSize()
            .padding(contentPadding),
        verticalArrangement = Arrangement.Top,
    ) {
        Text("Renovaciones (Tools)", style = MaterialTheme.typography.titleLarge)
        Spacer(modifier = Modifier.height(10.dp))
        Button(onClick = onBack) { Text("← Volver") }
        Spacer(modifier = Modifier.height(10.dp))

        if (state.isLoading) {
            NxLoadingBlock("Cargando renovaciones…")
            return@Column
        }
        if (!state.error.isNullOrBlank()) {
            Text(state.error!!, color = MaterialTheme.colorScheme.error)
        }

        OutlinedTextField(
            value = state.rejectionReason,
            onValueChange = vm::setRejectionReason,
            label = { Text("Motivo de rechazo (si aplica)") },
            modifier = Modifier.fillMaxWidth(),
        )
        Spacer(modifier = Modifier.height(12.dp))

        LazyColumn(
            verticalArrangement = Arrangement.spacedBy(8.dp),
            modifier = Modifier.fillMaxWidth(),
        ) {
            items(state.rows.take(200)) { r ->
                Card(
                    modifier = Modifier.fillMaxWidth(),
                    colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
                ) {
                    Column(modifier = Modifier.padding(12.dp)) {
                        Text("${r.toolRequest.usuario.nombre} · ${r.toolRequest.toolName}", style = MaterialTheme.typography.titleSmall)
                        Text("De: ${r.previousReturnDate}", color = MaterialTheme.colorScheme.onSurfaceVariant, style = MaterialTheme.typography.bodySmall)
                        Text("A: ${r.newReturnDate}", color = MaterialTheme.colorScheme.onSurfaceVariant, style = MaterialTheme.typography.bodySmall)
                        Text("Estatus: ${r.status}", color = MaterialTheme.colorScheme.onSurfaceVariant, style = MaterialTheme.typography.bodySmall)
                        Spacer(modifier = Modifier.height(8.dp))
                        Button(
                            onClick = { vm.approve(r.id) },
                            enabled = state.actingId == null,
                        ) { Text(if (state.actingId == r.id) "Procesando..." else "Aprobar") }
                        Spacer(modifier = Modifier.height(6.dp))
                        Button(
                            onClick = { vm.reject(r.id) },
                            enabled = state.actingId == null,
                        ) { Text(if (state.actingId == r.id) "Procesando..." else "Rechazar") }
                    }
                }
            }
        }
    }
}

