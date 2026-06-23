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
import mx.nexara.mobile.nativeapp.data.api.OperationalProjectDto
import mx.nexara.mobile.nativeapp.data.api.ServiceClientDto
import mx.nexara.mobile.nativeapp.data.api.VisibleUserDto
import mx.nexara.mobile.nativeapp.data.console.ConsoleRepository
import java.time.LocalDate
import java.time.ZoneOffset

data class ProjectsUiState(
    val isLoading: Boolean = true,
    val error: String? = null,
    val saving: Boolean = false,
    val success: String? = null,

    val projects: List<OperationalProjectDto> = emptyList(),
    val clients: List<ServiceClientDto> = emptyList(),
    val users: List<VisibleUserDto> = emptyList(),

    val title: String = "",
    val description: String = "",
    val vendorId: Long? = null,
    val clientId: Long? = null,
    val startDate: String = "", // yyyy-MM-dd
    val endDate: String = "", // yyyy-MM-dd

    val selectedEngineerByProject: Map<Long, Long?> = emptyMap(),
)

class ConsoleProjectsViewModel(app: Application) : AndroidViewModel(app) {
    private val repo = ConsoleRepository(app.applicationContext)
    private val _state = MutableStateFlow(ProjectsUiState())
    val state: StateFlow<ProjectsUiState> = _state

    fun setField(key: String, v: String) = _state.update {
        when (key) {
            "title" -> it.copy(title = v)
            "description" -> it.copy(description = v)
            "startDate" -> it.copy(startDate = v)
            "endDate" -> it.copy(endDate = v)
            else -> it
        }
    }

    fun setVendor(id: Long?) = _state.update { it.copy(vendorId = id) }
    fun setClient(id: Long?) = _state.update { it.copy(clientId = id) }

    fun selectEngineer(projectId: Long, engineerId: Long?) =
        _state.update { it.copy(selectedEngineerByProject = it.selectedEngineerByProject + (projectId to engineerId)) }

    fun refresh() {
        _state.update { it.copy(isLoading = true, error = null, success = null) }
        viewModelScope.launch {
            try {
                val projects = withContext(Dispatchers.IO) { repo.operationalProjects() }
                val clients = withContext(Dispatchers.IO) { repo.serviceClients() }
                val users = withContext(Dispatchers.IO) { repo.usersFetch(preferAssignable = true) }
                _state.update { it.copy(isLoading = false, projects = projects, clients = clients, users = users) }
            } catch (e: Exception) {
                _state.update { it.copy(isLoading = false, error = e.message ?: "No se pudo cargar proyectos") }
            }
        }
    }

    private fun dateToIso(date: String): String {
        val ld = LocalDate.parse(date)
        return ld.atStartOfDay().toInstant(ZoneOffset.UTC).toString()
    }

    fun create() {
        val s = _state.value
        _state.update { it.copy(error = null, success = null) }
        if (s.title.isBlank() || s.vendorId == null || s.clientId == null || s.startDate.isBlank()) {
            _state.update { it.copy(error = "Completa título, vendedor, cliente y fecha de inicio.") }
            return
        }
        _state.update { it.copy(saving = true) }
        viewModelScope.launch {
            try {
                withContext(Dispatchers.IO) {
                    repo.createOperationalProject(
                        title = s.title.trim(),
                        description = s.description,
                        vendorId = s.vendorId,
                        clientId = s.clientId,
                        startIso = dateToIso(s.startDate),
                        endIso = s.endDate.takeIf { it.isNotBlank() }?.let { dateToIso(it) },
                    )
                }
                _state.update {
                    it.copy(
                        saving = false,
                        success = "Proyecto creado correctamente.",
                        title = "",
                        description = "",
                        vendorId = null,
                        clientId = null,
                        startDate = "",
                        endDate = "",
                    )
                }
                refresh()
            } catch (e: Exception) {
                _state.update { it.copy(saving = false, error = e.message ?: "No se pudo crear el proyecto.") }
            }
        }
    }

    fun changeStatus(projectId: Long, status: String) {
        if (_state.value.saving) return
        _state.update { it.copy(saving = true, error = null, success = null) }
        viewModelScope.launch {
            try {
                withContext(Dispatchers.IO) { repo.patchProjectStatus(projectId, status) }
                _state.update { it.copy(saving = false) }
                refresh()
            } catch (e: Exception) {
                _state.update { it.copy(saving = false, error = e.message ?: "No se pudo actualizar estatus") }
            }
        }
    }

    fun addEngineer(projectId: Long) {
        val engineerId = _state.value.selectedEngineerByProject[projectId] ?: return
        _state.update { it.copy(saving = true, error = null, success = null) }
        viewModelScope.launch {
            try {
                withContext(Dispatchers.IO) { repo.addProjectEngineer(projectId, engineerId) }
                _state.update { it.copy(saving = false, selectedEngineerByProject = it.selectedEngineerByProject + (projectId to null)) }
                refresh()
            } catch (e: Exception) {
                _state.update { it.copy(saving = false, error = e.message ?: "No se pudo asignar ingeniero") }
            }
        }
    }

    fun removeEngineer(projectId: Long, engineerId: Long) {
        _state.update { it.copy(saving = true, error = null, success = null) }
        viewModelScope.launch {
            try {
                withContext(Dispatchers.IO) { repo.removeProjectEngineer(projectId, engineerId) }
                _state.update { it.copy(saving = false) }
                refresh()
            } catch (e: Exception) {
                _state.update { it.copy(saving = false, error = e.message ?: "No se pudo quitar ingeniero") }
            }
        }
    }
}

@Composable
fun ConsoleProjectsScreen(
    contentPadding: PaddingValues = PaddingValues(16.dp),
) {
    val vm: ConsoleProjectsViewModel = viewModel()
    val state by vm.state.collectAsState()

    if (state.isLoading && state.projects.isEmpty() && state.error == null) vm.refresh()

    val vendors = remember(state.users) {
        state.users.filter { (it.nombre.lowercase().contains("vend") || (it.email ?: "").lowercase().contains("vend")) }
    }
    val engineers = remember(state.users) {
        state.users.filter { it.nombre.lowercase().contains("ingenier") || it.nombre.lowercase().contains("engineer") }
    }

    Column(
        modifier = Modifier
            .fillMaxSize()
            .padding(contentPadding),
        verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        Text("Proyectos", style = MaterialTheme.typography.titleLarge)
        if (!state.error.isNullOrBlank()) Text(state.error!!, color = MaterialTheme.colorScheme.error)
        if (!state.success.isNullOrBlank()) Text(state.success!!, color = MaterialTheme.colorScheme.onSurfaceVariant)

        Card(colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface)) {
            Column(modifier = Modifier.padding(12.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
                Text("Crear proyecto operacional", style = MaterialTheme.typography.titleMedium)
                OutlinedTextField(state.title, { vm.setField("title", it) }, label = { Text("Título") }, modifier = Modifier.fillMaxWidth())
                OutlinedTextField(state.description, { vm.setField("description", it) }, label = { Text("Descripción") }, modifier = Modifier.fillMaxWidth())

                var vendorMenu by remember { mutableStateOf(false) }
                Button(onClick = { vendorMenu = true }, modifier = Modifier.fillMaxWidth()) {
                    Text(state.vendorId?.let { "Vendedor: #$it" } ?: "Selecciona vendedor")
                }
                DropdownMenu(expanded = vendorMenu, onDismissRequest = { vendorMenu = false }) {
                    vendors.take(50).forEach { v ->
                        DropdownMenuItem(text = { Text(v.nombre) }, onClick = { vm.setVendor(v.id); vendorMenu = false })
                    }
                }

                var clientMenu by remember { mutableStateOf(false) }
                Button(onClick = { clientMenu = true }, modifier = Modifier.fillMaxWidth()) {
                    Text(state.clientId?.let { "Cliente: #$it" } ?: "Selecciona cliente")
                }
                DropdownMenu(expanded = clientMenu, onDismissRequest = { clientMenu = false }) {
                    state.clients.take(80).forEach { c ->
                        DropdownMenuItem(text = { Text(c.name ?: c.nombre ?: "Cliente #${c.id}") }, onClick = { vm.setClient(c.id); clientMenu = false })
                    }
                }

                OutlinedTextField(state.startDate, { vm.setField("startDate", it) }, label = { Text("Inicio (YYYY-MM-DD)") }, modifier = Modifier.fillMaxWidth())
                OutlinedTextField(state.endDate, { vm.setField("endDate", it) }, label = { Text("Fin (opcional)") }, modifier = Modifier.fillMaxWidth())

                Button(onClick = { vm.create() }, enabled = !state.saving, modifier = Modifier.fillMaxWidth()) {
                    Text(if (state.saving) "Guardando..." else "Crear proyecto")
                }
            }
        }

        Spacer(Modifier.height(4.dp))
        Text("Lista de proyectos", style = MaterialTheme.typography.titleMedium)

        LazyColumn(verticalArrangement = Arrangement.spacedBy(10.dp), modifier = Modifier.fillMaxWidth()) {
            items(state.projects) { p ->
                Card(colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface)) {
                    Column(modifier = Modifier.padding(12.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                        Text(p.title, style = MaterialTheme.typography.titleSmall)
                        Text(p.description ?: "Sin descripción", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                        Text("Cliente: ${p.client?.name ?: p.client?.nombre ?: "-"}", style = MaterialTheme.typography.bodySmall)
                        Text("Vendedor: ${p.vendor?.nombre ?: "-"} · Estado: ${p.status}", style = MaterialTheme.typography.bodySmall)
                        Text("Actividades: ${p.activities?.size ?: 0}", style = MaterialTheme.typography.bodySmall)

                        // engineers
                        val assignments = p.engineers ?: emptyList()
                        if (assignments.isNotEmpty()) {
                            Text("Ingenieros", style = MaterialTheme.typography.labelLarge)
                            assignments.forEach { a ->
                                Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                                    Text(a.engineer.nombre, modifier = Modifier.weight(1f))
                                    Button(onClick = { vm.removeEngineer(p.id, a.engineer.id) }, enabled = !state.saving) { Text("Quitar") }
                                }
                            }
                        }

                        var engMenu by remember { mutableStateOf(false) }
                        Button(onClick = { engMenu = true }, enabled = !state.saving, modifier = Modifier.fillMaxWidth()) {
                            Text(state.selectedEngineerByProject[p.id]?.let { "Ingeniero: #$it" } ?: "Asignar ingeniero")
                        }
                        DropdownMenu(expanded = engMenu, onDismissRequest = { engMenu = false }) {
                            engineers.take(60).forEach { e ->
                                DropdownMenuItem(text = { Text(e.nombre) }, onClick = { vm.selectEngineer(p.id, e.id); engMenu = false })
                            }
                        }
                        Button(onClick = { vm.addEngineer(p.id) }, enabled = !state.saving, modifier = Modifier.fillMaxWidth()) {
                            Text("Agregar ingeniero")
                        }

                        Row(horizontalArrangement = Arrangement.spacedBy(8.dp), modifier = Modifier.fillMaxWidth()) {
                            Button(onClick = { vm.changeStatus(p.id, "ACTIVE") }, enabled = !state.saving, modifier = Modifier.weight(1f)) { Text("Reactivar") }
                            Button(onClick = { vm.changeStatus(p.id, "ON_HOLD") }, enabled = !state.saving, modifier = Modifier.weight(1f)) { Text("Pausar") }
                            Button(onClick = { vm.changeStatus(p.id, "COMPLETED") }, enabled = !state.saving, modifier = Modifier.weight(1f)) { Text("Cerrar") }
                        }
                    }
                }
            }
        }
    }
}

