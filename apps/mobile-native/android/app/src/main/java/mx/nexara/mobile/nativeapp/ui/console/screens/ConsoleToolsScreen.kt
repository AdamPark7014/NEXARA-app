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
import mx.nexara.mobile.nativeapp.data.api.ToolRequestDto
import mx.nexara.mobile.nativeapp.data.console.ConsoleRepository

data class ToolsUiState(
    val isLoading: Boolean = true,
    val error: String? = null,
    val query: String = "",
    val my: List<ToolRequestDto> = emptyList(),
    val all: List<ToolRequestDto> = emptyList(),
)

class ConsoleToolsViewModel(app: Application) : AndroidViewModel(app) {
    private val repo = ConsoleRepository(app.applicationContext)
    private val _state = MutableStateFlow(ToolsUiState())
    val state: StateFlow<ToolsUiState> = _state

    fun setQuery(v: String) = _state.update { it.copy(query = v) }

    fun refresh() {
        _state.update { it.copy(isLoading = true, error = null) }
        viewModelScope.launch {
            try {
                val my = withContext(Dispatchers.IO) { repo.myToolRequests() }
                val all = withContext(Dispatchers.IO) { runCatching { repo.toolRequests(null) }.getOrDefault(emptyList()) }
                _state.update { it.copy(isLoading = false, my = my, all = all, error = null) }
            } catch (e: Exception) {
                _state.update { it.copy(isLoading = false, error = e.message ?: "No se pudieron cargar herramientas") }
            }
        }
    }
}

@Composable
fun ConsoleToolsScreen(
    contentPadding: PaddingValues = PaddingValues(16.dp),
    onOpenInventory: () -> Unit = {},
    onOpenMyKit: () -> Unit = {},
    onOpenKitsUsers: () -> Unit = {},
    onOpenRenewals: () -> Unit = {},
) {
    val vm: ConsoleToolsViewModel = viewModel()
    val state by vm.state.collectAsState()

    if (state.isLoading && state.error == null && state.my.isEmpty()) vm.refresh()

    val q = state.query.trim().lowercase()
    val filter: (ToolRequestDto) -> Boolean = { t ->
        if (q.isBlank()) true else buildString {
            append(t.toolName); append(" "); append(t.model); append(" "); append(t.serialNumber)
            append(" "); append(t.status); append(" "); append(t.requestedBy?.nombre ?: "")
        }.lowercase().contains(q)
    }
    val my = state.my.filter(filter)
    val all = state.all.filter(filter)

    Column(
        modifier = Modifier
            .fillMaxSize()
            .padding(contentPadding),
        verticalArrangement = Arrangement.Top,
    ) {
        Text("Herramientas", style = MaterialTheme.typography.titleLarge)
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
            label = { Text("Buscar") },
            singleLine = true,
            modifier = Modifier.fillMaxWidth(),
        )
        Spacer(modifier = Modifier.height(12.dp))

        Card(
            modifier = Modifier.fillMaxWidth(),
            colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
        ) {
            Column(modifier = Modifier.padding(12.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                Button(onClick = onOpenInventory, modifier = Modifier.fillMaxWidth()) { Text("🏭 Inventario") }
                Button(onClick = onOpenMyKit, modifier = Modifier.fillMaxWidth()) { Text("🧰 Mi Kit") }
                Button(onClick = onOpenKitsUsers, modifier = Modifier.fillMaxWidth()) { Text("👥 Kits por usuario") }
                Button(onClick = onOpenRenewals, modifier = Modifier.fillMaxWidth()) { Text("↻ Renovaciones pendientes") }
            }
        }

        Spacer(modifier = Modifier.height(16.dp))

        Text("Mis solicitudes (${my.size})", style = MaterialTheme.typography.titleMedium)
        Spacer(modifier = Modifier.height(8.dp))
        LazyColumn(
            verticalArrangement = Arrangement.spacedBy(8.dp),
            modifier = Modifier.fillMaxWidth(),
        ) {
            items(my.take(50)) { t ->
                Card(
                    modifier = Modifier.fillMaxWidth(),
                    colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
                ) {
                    Column(modifier = Modifier.padding(12.dp)) {
                        Text(t.toolName, style = MaterialTheme.typography.titleSmall)
                        Text("${t.model} · ${t.serialNumber}", color = MaterialTheme.colorScheme.onSurfaceVariant, style = MaterialTheme.typography.bodySmall)
                        Text("Estatus: ${t.status}", color = MaterialTheme.colorScheme.onSurfaceVariant, style = MaterialTheme.typography.bodySmall)
                        Text("Devuelve: ${t.expectedReturnDate}", color = MaterialTheme.colorScheme.onSurfaceVariant, style = MaterialTheme.typography.bodySmall)
                    }
                }
            }
        }

        if (all.isNotEmpty()) {
            Spacer(modifier = Modifier.height(16.dp))
            Text("Solicitudes (admin) (${all.size})", style = MaterialTheme.typography.titleMedium)
            Spacer(modifier = Modifier.height(8.dp))
            LazyColumn(
                verticalArrangement = Arrangement.spacedBy(8.dp),
                modifier = Modifier.fillMaxWidth(),
            ) {
                items(all.take(50)) { t ->
                    Card(
                        modifier = Modifier.fillMaxWidth(),
                        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
                    ) {
                        Column(modifier = Modifier.padding(12.dp)) {
                            Text("${t.toolName} · ${t.status}", style = MaterialTheme.typography.titleSmall)
                            val who = t.requestedBy?.nombre
                            if (!who.isNullOrBlank()) {
                                Text("Usuario: $who", color = MaterialTheme.colorScheme.onSurfaceVariant, style = MaterialTheme.typography.bodySmall)
                            }
                            Text("${t.model} · ${t.serialNumber}", color = MaterialTheme.colorScheme.onSurfaceVariant, style = MaterialTheme.typography.bodySmall)
                        }
                    }
                }
            }
        }
    }
}

