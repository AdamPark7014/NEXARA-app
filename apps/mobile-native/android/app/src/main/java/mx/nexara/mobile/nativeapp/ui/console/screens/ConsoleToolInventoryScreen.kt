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
import androidx.compose.material3.Checkbox
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
import mx.nexara.mobile.nativeapp.data.api.ToolInventoryItemDto
import mx.nexara.mobile.nativeapp.data.console.ConsoleRepository

data class ToolInventoryUiState(
    val isLoading: Boolean = true,
    val error: String? = null,
    val query: String = "",
    val includeRetired: Boolean = false,
    val items: List<ToolInventoryItemDto> = emptyList(),
)

class ConsoleToolInventoryViewModel(app: Application) : AndroidViewModel(app) {
    private val repo = ConsoleRepository(app.applicationContext)
    private val _state = MutableStateFlow(ToolInventoryUiState())
    val state: StateFlow<ToolInventoryUiState> = _state

    fun setQuery(v: String) = _state.update { it.copy(query = v) }
    fun setIncludeRetired(v: Boolean) = _state.update { it.copy(includeRetired = v) }

    fun refresh() {
        val snapshot = _state.value
        _state.update { it.copy(isLoading = true, error = null) }
        viewModelScope.launch {
            try {
                val list = withContext(Dispatchers.IO) {
                    repo.toolInventory(
                        q = snapshot.query.takeIf { it.trim().length >= 2 }?.trim(),
                        includeRetired = snapshot.includeRetired,
                    )
                }
                _state.update { it.copy(isLoading = false, items = list, error = null) }
            } catch (e: Exception) {
                _state.update { it.copy(isLoading = false, error = e.message ?: "No se pudo cargar inventario") }
            }
        }
    }
}

@Composable
fun ConsoleToolInventoryScreen(
    contentPadding: PaddingValues = PaddingValues(16.dp),
    onBack: () -> Unit = {},
) {
    val vm: ConsoleToolInventoryViewModel = viewModel()
    val state by vm.state.collectAsState()

    if (state.items.isEmpty() && state.isLoading && state.error == null) vm.refresh()

    Column(
        modifier = Modifier
            .fillMaxSize()
            .padding(contentPadding),
        verticalArrangement = Arrangement.Top,
    ) {
        Text("Inventario de herramientas", style = MaterialTheme.typography.titleLarge)
        Spacer(modifier = Modifier.height(10.dp))

        Button(onClick = onBack) { Text("← Volver") }
        Spacer(modifier = Modifier.height(10.dp))

        if (state.isLoading) {
            Text("Cargando...", color = MaterialTheme.colorScheme.onSurfaceVariant)
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
            label = { Text("Buscar (mín 2 caracteres)") },
            singleLine = true,
            modifier = Modifier.fillMaxWidth(),
        )
        Spacer(modifier = Modifier.height(8.dp))
        RowCheckbox(
            checked = state.includeRetired,
            label = "Incluir retirados",
            onCheckedChange = vm::setIncludeRetired,
        )
        Spacer(modifier = Modifier.height(8.dp))
        Button(onClick = { vm.refresh() }) { Text("Buscar / Refrescar") }
        Spacer(modifier = Modifier.height(12.dp))

        LazyColumn(
            verticalArrangement = Arrangement.spacedBy(8.dp),
            modifier = Modifier.fillMaxWidth(),
        ) {
            items(state.items.take(300)) { it ->
                Card(
                    modifier = Modifier.fillMaxWidth(),
                    colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
                ) {
                    Column(modifier = Modifier.padding(12.dp)) {
                        Text(it.toolName, style = MaterialTheme.typography.titleSmall)
                        Text("${it.model} · ${it.serialNumber}", color = MaterialTheme.colorScheme.onSurfaceVariant, style = MaterialTheme.typography.bodySmall)
                        Text("Status: ${it.status}", color = MaterialTheme.colorScheme.onSurfaceVariant, style = MaterialTheme.typography.bodySmall)
                    }
                }
            }
        }
    }
}

@Composable
private fun RowCheckbox(checked: Boolean, label: String, onCheckedChange: (Boolean) -> Unit) {
    androidx.compose.foundation.layout.Row(
        modifier = Modifier.fillMaxWidth(),
        horizontalArrangement = Arrangement.Start,
    ) {
        Checkbox(checked = checked, onCheckedChange = onCheckedChange)
        Spacer(modifier = Modifier.height(0.dp))
        Text(label, modifier = Modifier.padding(top = 14.dp))
    }
}

