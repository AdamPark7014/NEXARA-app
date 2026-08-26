package mx.nexara.mobile.nativeapp.ui.console.screens

import android.app.Application
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
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
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
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
import mx.nexara.mobile.nativeapp.data.api.ToolInventorySearchOptionDto
import mx.nexara.mobile.nativeapp.data.api.ToolKitUserRowDto
import mx.nexara.mobile.nativeapp.data.console.ConsoleRepository
import mx.nexara.mobile.nativeapp.ui.enterprise.NxLoadingBlock

data class KitsUsersUiState(
    val isLoading: Boolean = true,
    val error: String? = null,
    val filterUserQuery: String = "",
    val inventoryQuery: String = "",
    val inventoryOptions: List<ToolInventorySearchOptionDto> = emptyList(),
    val selectedInventory: ToolInventorySearchOptionDto? = null,
    val selectedUserId: Long? = null,
    val assignmentType: String = "KIT",
    val rows: List<ToolKitUserRowDto> = emptyList(),
    val resolvingEventId: Long? = null,
    val resolution: String = "EQUIPMENT_FAILURE",
    val resolutionNotes: String = "",
    val fineAmount: String = "500",
    val submitting: Boolean = false,
)

class ConsoleToolsKitsUsersViewModel(app: Application) : AndroidViewModel(app) {
    private val repo = ConsoleRepository(app.applicationContext)
    private val _state = MutableStateFlow(KitsUsersUiState())
    val state: StateFlow<KitsUsersUiState> = _state

    fun setFilterUserQuery(v: String) = _state.update { it.copy(filterUserQuery = v) }
    fun setInventoryQuery(v: String) = _state.update { it.copy(inventoryQuery = v) }
    fun setAssignmentType(v: String) = _state.update { it.copy(assignmentType = v) }
    fun selectInventory(opt: ToolInventorySearchOptionDto?) = _state.update { it.copy(selectedInventory = opt) }
    fun selectUser(id: Long?) = _state.update { it.copy(selectedUserId = id) }

    fun setResolution(v: String) = _state.update { it.copy(resolution = v) }
    fun setResolutionNotes(v: String) = _state.update { it.copy(resolutionNotes = v) }
    fun setFineAmount(v: String) = _state.update { it.copy(fineAmount = v) }

    fun refresh() {
        _state.update { it.copy(isLoading = true, error = null) }
        viewModelScope.launch {
            try {
                val rows = withContext(Dispatchers.IO) { repo.toolKitsUsers() }
                _state.update { it.copy(isLoading = false, rows = rows, error = null) }
            } catch (e: Exception) {
                _state.update { it.copy(isLoading = false, error = e.message ?: "No se pudo cargar kits") }
            }
        }
    }

    fun searchInventory() {
        val q = _state.value.inventoryQuery.trim()
        if (q.length < 2) {
            _state.update { it.copy(inventoryOptions = emptyList()) }
            return
        }
        viewModelScope.launch {
            try {
                val options = withContext(Dispatchers.IO) { repo.toolInventorySearch(q) }
                _state.update { it.copy(inventoryOptions = options) }
            } catch (_: Exception) {
                _state.update { it.copy(inventoryOptions = emptyList()) }
            }
        }
    }

    fun assign() {
        val s = _state.value
        val userId = s.selectedUserId
        val inv = s.selectedInventory
        if (userId == null || inv == null) {
            _state.update { it.copy(error = "Selecciona usuario e inventario") }
            return
        }
        _state.update { it.copy(submitting = true, error = null) }
        viewModelScope.launch {
            try {
                withContext(Dispatchers.IO) { repo.assignKit(userId, inv.id, s.assignmentType) }
                _state.update { it.copy(submitting = false, inventoryOptions = emptyList(), selectedInventory = null, inventoryQuery = "") }
                refresh()
            } catch (e: Exception) {
                _state.update { it.copy(submitting = false, error = e.message ?: "No se pudo asignar") }
            }
        }
    }

    fun openResolve(eventId: Long) {
        _state.update {
            it.copy(
                resolvingEventId = eventId,
                resolution = "EQUIPMENT_FAILURE",
                resolutionNotes = "",
                fineAmount = "500",
                error = null,
            )
        }
    }

    fun resolve() {
        val s = _state.value
        val eventId = s.resolvingEventId ?: return
        val fine = if (s.resolution == "USER_MISUSE") s.fineAmount.toDoubleOrNull() else null
        if (s.resolution == "USER_MISUSE" && (fine == null || fine <= 0.0)) {
            _state.update { it.copy(error = "Monto de multa inválido") }
            return
        }
        _state.update { it.copy(submitting = true, error = null) }
        viewModelScope.launch {
            try {
                withContext(Dispatchers.IO) {
                    repo.resolveKitEvent(
                        eventId = eventId,
                        resolution = s.resolution,
                        notes = s.resolutionNotes.takeIf { it.isNotBlank() },
                        fineAmount = fine,
                    )
                }
                _state.update { it.copy(submitting = false, resolvingEventId = null) }
                refresh()
            } catch (e: Exception) {
                _state.update { it.copy(submitting = false, error = e.message ?: "No se pudo resolver") }
            }
        }
    }
}

@Composable
fun ConsoleToolsKitsUsersScreen(
    contentPadding: PaddingValues = PaddingValues(16.dp),
    onBack: () -> Unit = {},
) {
    val vm: ConsoleToolsKitsUsersViewModel = viewModel()
    val state by vm.state.collectAsState()

    if (state.rows.isEmpty() && state.isLoading && state.error == null) vm.refresh()

    val qUser = state.filterUserQuery.trim().lowercase()
    val filtered = if (qUser.isBlank()) state.rows else state.rows.filter { r ->
        val hay = "${r.user.nombre} ${r.user.email}".lowercase()
        hay.contains(qUser)
    }

    Column(
        modifier = Modifier
            .fillMaxSize()
            .padding(contentPadding),
        verticalArrangement = Arrangement.Top,
    ) {
        Text("Kits por usuario", style = MaterialTheme.typography.titleLarge)
        Spacer(modifier = Modifier.height(10.dp))
        Button(onClick = onBack) { Text("← Volver") }
        Spacer(modifier = Modifier.height(10.dp))

        if (state.isLoading) {
            NxLoadingBlock("Cargando kits de usuarios…")
            return@Column
        }
        if (!state.error.isNullOrBlank()) {
            Text(state.error!!, color = MaterialTheme.colorScheme.error)
        }

        Card(
            modifier = Modifier.fillMaxWidth(),
            colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
        ) {
            Column(modifier = Modifier.padding(12.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
                Text("Asignar kit/préstamo", style = MaterialTheme.typography.titleMedium)
                OutlinedTextField(
                    value = state.filterUserQuery,
                    onValueChange = vm::setFilterUserQuery,
                    label = { Text("Filtrar usuario") },
                    modifier = Modifier.fillMaxWidth(),
                    singleLine = true,
                )
                OutlinedTextField(
                    value = state.inventoryQuery,
                    onValueChange = {
                        vm.setInventoryQuery(it)
                    },
                    label = { Text("Buscar inventario (mín 2)") },
                    modifier = Modifier.fillMaxWidth(),
                    singleLine = true,
                )
                Row(horizontalArrangement = Arrangement.spacedBy(10.dp), modifier = Modifier.fillMaxWidth()) {
                    Button(onClick = { vm.searchInventory() }, enabled = !state.submitting) { Text("Buscar") }
                    Button(onClick = { vm.assign() }, enabled = !state.submitting) { Text(if (state.submitting) "..." else "Asignar") }
                }
                Text("Tipo: ${state.assignmentType}", color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
        }

        Spacer(modifier = Modifier.height(12.dp))

        // Inventory options dropdown (simple)
        if (state.inventoryOptions.isNotEmpty()) {
            Card(
                modifier = Modifier.fillMaxWidth(),
                colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
            ) {
                Column(modifier = Modifier.padding(12.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    Text("Resultados inventario", style = MaterialTheme.typography.titleMedium)
                    state.inventoryOptions.take(10).forEach { opt ->
                        Button(
                            onClick = { vm.selectInventory(opt) },
                            modifier = Modifier.fillMaxWidth(),
                        ) {
                            Text("${opt.toolName} · ${opt.model} · ${opt.serialNumber}")
                        }
                    }
                }
            }
            Spacer(modifier = Modifier.height(12.dp))
        }

        // User picker dropdown
        var userMenu by remember { mutableStateOf(false) }
        Button(onClick = { userMenu = true }, modifier = Modifier.fillMaxWidth()) {
            Text(state.selectedUserId?.let { id -> "Usuario seleccionado: $id" } ?: "Seleccionar usuario por ID (de lista)")
        }
        DropdownMenu(expanded = userMenu, onDismissRequest = { userMenu = false }) {
            filtered.take(30).forEach { row ->
                DropdownMenuItem(
                    text = { Text("${row.user.nombre} (${row.user.email})") },
                    onClick = {
                        vm.selectUser(row.user.id)
                        userMenu = false
                    }
                )
            }
        }

        Spacer(modifier = Modifier.height(12.dp))

        LazyColumn(
            verticalArrangement = Arrangement.spacedBy(8.dp),
            modifier = Modifier.fillMaxWidth(),
        ) {
            items(filtered.take(200)) { row ->
                Card(
                    modifier = Modifier.fillMaxWidth(),
                    colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
                ) {
                    Column(modifier = Modifier.padding(12.dp)) {
                        Text("${row.user.nombre} · ${row.inventoryItem.toolName}", style = MaterialTheme.typography.titleSmall)
                        Text("${row.inventoryItem.model} · ${row.inventoryItem.serialNumber}", color = MaterialTheme.colorScheme.onSurfaceVariant, style = MaterialTheme.typography.bodySmall)
                        Text("Tipo: ${row.assignmentType} · Activo: ${row.isActive ?: true}", color = MaterialTheme.colorScheme.onSurfaceVariant, style = MaterialTheme.typography.bodySmall)
                        val events = row.events ?: emptyList()
                        if (events.isNotEmpty()) {
                            Spacer(modifier = Modifier.height(8.dp))
                            Text("Eventos (${events.size})", style = MaterialTheme.typography.labelLarge)
                            events.take(3).forEach { ev ->
                                Text("• ${ev.description} (${ev.resolution})", color = MaterialTheme.colorScheme.onSurfaceVariant, style = MaterialTheme.typography.bodySmall)
                                if (ev.resolution == "PENDING") {
                                    Button(
                                        onClick = { vm.openResolve(ev.id) },
                                        enabled = !state.submitting,
                                    ) { Text("Resolver") }
                                }
                            }
                        }
                    }
                }
            }
        }

        // Resolve modal inline (simplified)
        if (state.resolvingEventId != null) {
            Spacer(modifier = Modifier.height(16.dp))
            Card(
                modifier = Modifier.fillMaxWidth(),
                colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
            ) {
                Column(modifier = Modifier.padding(12.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    Text("Resolver evento #${state.resolvingEventId}", style = MaterialTheme.typography.titleMedium)
                    OutlinedTextField(
                        value = state.resolutionNotes,
                        onValueChange = vm::setResolutionNotes,
                        label = { Text("Notas") },
                        modifier = Modifier.fillMaxWidth(),
                    )
                    OutlinedTextField(
                        value = state.fineAmount,
                        onValueChange = vm::setFineAmount,
                        label = { Text("Multa (solo si USER_MISUSE)") },
                        modifier = Modifier.fillMaxWidth(),
                        singleLine = true,
                    )
                    Row(horizontalArrangement = Arrangement.spacedBy(10.dp), modifier = Modifier.fillMaxWidth()) {
                        Button(onClick = { vm.setResolution("EQUIPMENT_FAILURE") }) { Text("Falla") }
                        Button(onClick = { vm.setResolution("USER_MISUSE") }) { Text("Mal uso") }
                        Button(onClick = { vm.resolve() }, enabled = !state.submitting) { Text("Guardar") }
                    }
                }
            }
        }
    }
}

