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
import mx.nexara.mobile.nativeapp.data.api.ToolKitAssignmentDto
import mx.nexara.mobile.nativeapp.data.console.ConsoleRepository

data class MyKitUiState(
    val isLoading: Boolean = true,
    val error: String? = null,
    val reportText: String = "",
    val reportingId: Long? = null,
    val items: List<ToolKitAssignmentDto> = emptyList(),
)

class ConsoleToolMyKitViewModel(app: Application) : AndroidViewModel(app) {
    private val repo = ConsoleRepository(app.applicationContext)
    private val _state = MutableStateFlow(MyKitUiState())
    val state: StateFlow<MyKitUiState> = _state

    fun setReportText(v: String) = _state.update { it.copy(reportText = v) }

    fun refresh() {
        _state.update { it.copy(isLoading = true, error = null) }
        viewModelScope.launch {
            try {
                val list = withContext(Dispatchers.IO) { repo.myToolKit() }
                _state.update { it.copy(isLoading = false, items = list, error = null) }
            } catch (e: Exception) {
                _state.update { it.copy(isLoading = false, error = e.message ?: "No se pudo cargar mi kit") }
            }
        }
    }

    fun report(assignmentId: Long) {
        val text = _state.value.reportText.trim()
        if (text.length < 5) {
            _state.update { it.copy(error = "Describe el incidente (mín 5 caracteres)") }
            return
        }
        _state.update { it.copy(reportingId = assignmentId, error = null) }
        viewModelScope.launch {
            try {
                withContext(Dispatchers.IO) { repo.reportKitIncident(assignmentId = assignmentId, description = text) }
                _state.update { it.copy(reportText = "", reportingId = null) }
                refresh()
            } catch (e: Exception) {
                _state.update { it.copy(reportingId = null, error = e.message ?: "No se pudo reportar") }
            }
        }
    }
}

@Composable
fun ConsoleToolMyKitScreen(
    contentPadding: PaddingValues = PaddingValues(16.dp),
    onBack: () -> Unit = {},
) {
    val vm: ConsoleToolMyKitViewModel = viewModel()
    val state by vm.state.collectAsState()

    if (state.items.isEmpty() && state.isLoading && state.error == null) vm.refresh()

    Column(
        modifier = Modifier
            .fillMaxSize()
            .padding(contentPadding),
        verticalArrangement = Arrangement.Top,
    ) {
        Text("Mi Kit", style = MaterialTheme.typography.titleLarge)
        Spacer(modifier = Modifier.height(10.dp))
        Button(onClick = onBack) { Text("← Volver") }
        Spacer(modifier = Modifier.height(10.dp))

        if (state.isLoading) {
            Text("Cargando...", color = MaterialTheme.colorScheme.onSurfaceVariant)
            return@Column
        }
        if (!state.error.isNullOrBlank()) {
            Text(state.error!!, color = MaterialTheme.colorScheme.error)
        }

        OutlinedTextField(
            value = state.reportText,
            onValueChange = vm::setReportText,
            label = { Text("Reportar incidente (texto)") },
            modifier = Modifier.fillMaxWidth(),
        )
        Spacer(modifier = Modifier.height(12.dp))

        LazyColumn(
            verticalArrangement = Arrangement.spacedBy(8.dp),
            modifier = Modifier.fillMaxWidth(),
        ) {
            items(state.items) { it ->
                Card(
                    modifier = Modifier.fillMaxWidth(),
                    colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
                ) {
                    Column(modifier = Modifier.padding(12.dp)) {
                        Text("${it.inventoryItem.toolName} · ${it.inventoryItem.model}", style = MaterialTheme.typography.titleSmall)
                        Text("Serie: ${it.inventoryItem.serialNumber}", color = MaterialTheme.colorScheme.onSurfaceVariant, style = MaterialTheme.typography.bodySmall)
                        Text("Tipo: ${it.assignmentType}", color = MaterialTheme.colorScheme.onSurfaceVariant, style = MaterialTheme.typography.bodySmall)
                        Spacer(modifier = Modifier.height(8.dp))
                        Button(
                            onClick = { vm.report(it.id) },
                            enabled = state.reportingId == null,
                        ) { Text(if (state.reportingId == it.id) "Enviando..." else "Reportar incidente") }
                    }
                }
            }
        }
    }
}

