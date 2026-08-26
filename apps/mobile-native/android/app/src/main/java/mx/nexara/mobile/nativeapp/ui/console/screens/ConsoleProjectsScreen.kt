package mx.nexara.mobile.nativeapp.ui.console.screens

import android.app.Application
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
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
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Tab
import androidx.compose.material3.TabRow
import androidx.compose.material3.Text
import androidx.compose.material3.pulltorefresh.PullToRefreshBox
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
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
import mx.nexara.mobile.nativeapp.ui.enterprise.NxColors
import mx.nexara.mobile.nativeapp.ui.enterprise.NxEmptyState
import mx.nexara.mobile.nativeapp.ui.enterprise.NxErrorBlock
import mx.nexara.mobile.nativeapp.ui.enterprise.NxLoadingBlock
import mx.nexara.mobile.nativeapp.ui.enterprise.NxPanelShell
import mx.nexara.mobile.nativeapp.ui.enterprise.NxSectionHeader
import mx.nexara.mobile.nativeapp.ui.enterprise.NxStatusChip
import mx.nexara.mobile.nativeapp.ui.enterprise.NxTone
import java.time.LocalDate
import java.time.ZoneOffset

data class ProjectsUiState(
    val isLoading: Boolean = true,
    val isRefreshing: Boolean = false,
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

    fun refresh(initial: Boolean = true) {
        _state.update {
            it.copy(
                isLoading = initial && it.projects.isEmpty(),
                isRefreshing = !initial,
                error = null,
                success = null,
            )
        }
        viewModelScope.launch {
            try {
                val projects = withContext(Dispatchers.IO) { repo.operationalProjects() }
                val clients = withContext(Dispatchers.IO) { repo.serviceClients() }
                val users = withContext(Dispatchers.IO) { repo.usersFetch(preferAssignable = true) }
                _state.update {
                    it.copy(isLoading = false, isRefreshing = false, projects = projects, clients = clients, users = users)
                }
            } catch (e: Exception) {
                _state.update {
                    it.copy(isLoading = false, isRefreshing = false, error = e.message ?: "No se pudo cargar proyectos")
                }
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

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ConsoleProjectsScreen(
    contentPadding: PaddingValues = PaddingValues(16.dp),
) {
    val vm: ConsoleProjectsViewModel = viewModel()
    val state by vm.state.collectAsState()
    var selected by remember { mutableStateOf<OperationalProjectDto?>(null) }

    if (state.isLoading && state.projects.isEmpty() && state.error == null) vm.refresh(initial = true)

    if (selected != null) {
        OpsProjectDetailScreen(
            project = selected!!,
            saving = state.saving,
            selectedEngineerByProject = state.selectedEngineerByProject,
            allEngineers = state.users,
            onBack = { selected = null },
            onChangeStatus = { id, status -> vm.changeStatus(id, status) },
            onSelectEngineer = { id, engId -> vm.selectEngineer(id, engId) },
            onAddEngineer = { vm.addEngineer(selected!!.id) },
            onRemoveEngineer = { id, engId -> vm.removeEngineer(id, engId) },
        )
        return
    }

    val vendors = remember(state.users) {
        state.users.filter { (it.nombre.lowercase().contains("vend") || (it.email ?: "").lowercase().contains("vend")) }
    }

    PullToRefreshBox(
        isRefreshing = state.isRefreshing,
        onRefresh = { vm.refresh(initial = false) },
        modifier = Modifier.fillMaxSize(),
    ) {
        LazyColumn(
            modifier = Modifier
                .fillMaxSize()
                .background(NxColors.Surface)
                .padding(contentPadding),
            verticalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            item {
                NxSectionHeader(
                    title = "Proyectos",
                    subtitle = "Operaciones · asignación de ingenieros",
                )
            }

            if (!state.success.isNullOrBlank()) {
                item { Text(state.success!!, color = NxColors.Success, style = MaterialTheme.typography.bodySmall) }
            }

            if (!state.error.isNullOrBlank()) {
                item { NxErrorBlock(state.error!!) { vm.refresh(initial = false) } }
            }

            item {
                NxPanelShell {
                    Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
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
            }

            item { NxSectionHeader("Lista de proyectos", "${state.projects.size} total") }

            if (state.isLoading) {
                item { NxLoadingBlock("Cargando proyectos…") }
            } else if (state.projects.isEmpty()) {
                item {
                    NxEmptyState(
                        title = "Sin proyectos",
                        subtitle = "Crea el primer proyecto operacional con el formulario de arriba.",
                    )
                }
            } else {
                items(state.projects, key = { it.id }) { p ->
                    NxPanelShell(onClick = { selected = p }) {
                        Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
                            Text(p.title, fontWeight = FontWeight.Bold)
                            Row(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalAlignment = Alignment.CenterVertically) {
                                NxStatusChip(projectStatusLabel(p.status), projectStatusTone(p.status))
                                if (p.client != null) {
                                    Text(
                                        p.client.name ?: p.client.nombre ?: "",
                                        fontSize = 11.sp,
                                        color = NxColors.Muted,
                                    )
                                }
                            }
                            if (!p.description.isNullOrBlank()) {
                                Text(p.description, style = MaterialTheme.typography.bodySmall, color = NxColors.Muted, maxLines = 2)
                            }
                            Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                                Text("Actividades: ${p.activities?.size ?: 0}", fontSize = 11.sp, color = NxColors.Muted)
                                Text("Ingenieros: ${p.engineers?.size ?: 0}", fontSize = 11.sp, color = NxColors.Muted)
                            }
                        }
                    }
                }
            }
            item { Spacer(Modifier.height(24.dp)) }
        }
    }
}

@Composable
private fun OpsProjectDetailScreen(
    project: OperationalProjectDto,
    saving: Boolean,
    selectedEngineerByProject: Map<Long, Long?>,
    allEngineers: List<mx.nexara.mobile.nativeapp.data.api.VisibleUserDto>,
    onBack: () -> Unit,
    onChangeStatus: (Long, String) -> Unit,
    onSelectEngineer: (Long, Long?) -> Unit,
    onAddEngineer: () -> Unit,
    onRemoveEngineer: (Long, Long) -> Unit,
) {
    var tab by remember { mutableIntStateOf(0) }
    val tabs = listOf("Info", "Actividades", "Ingenieros")

    Column(Modifier.fillMaxSize()) {
        OutlinedButton(onClick = onBack, modifier = Modifier.padding(12.dp)) { Text("← Volver") }
        Text(
            project.title,
            style = MaterialTheme.typography.titleLarge,
            fontWeight = FontWeight.Bold,
            modifier = Modifier.padding(horizontal = 16.dp),
        )
        Spacer(Modifier.height(8.dp))
        TabRow(selectedTabIndex = tab) {
            tabs.forEachIndexed { i, title ->
                Tab(selected = tab == i, onClick = { tab = i }, text = { Text(title, fontSize = 12.sp) })
            }
        }

        when (tab) {
            0 -> LazyColumn(Modifier.fillMaxSize(), contentPadding = PaddingValues(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                fun r(k: String, v: String?) { if (!v.isNullOrBlank()) item { Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) { Text(k, color = MaterialTheme.colorScheme.onSurfaceVariant); Text(v) } } }
                item { Text(project.status, color = projectStatusColor(project.status), fontWeight = FontWeight.SemiBold) }
                r("Cliente", project.client?.name ?: project.client?.nombre)
                r("Responsable", project.vendor?.nombre)
                r("Inicio", project.startDate?.take(10))
                r("Fin planeado", project.endDate?.take(10))
                r("Fin real", project.actualEndDate?.take(10))
                r("Descripción", project.description)
                item { Spacer(Modifier.height(12.dp)) }
                item { Text("Cambiar estado", style = MaterialTheme.typography.labelLarge) }
                item {
                    Row(horizontalArrangement = Arrangement.spacedBy(8.dp), modifier = Modifier.fillMaxWidth()) {
                        Button(onClick = { onChangeStatus(project.id, "ACTIVE") }, enabled = !saving, modifier = Modifier.weight(1f)) { Text("Activo", fontSize = 11.sp) }
                        Button(onClick = { onChangeStatus(project.id, "ON_HOLD") }, enabled = !saving, modifier = Modifier.weight(1f)) { Text("En pausa", fontSize = 11.sp) }
                        Button(onClick = { onChangeStatus(project.id, "COMPLETED") }, enabled = !saving, modifier = Modifier.weight(1f)) { Text("Cerrado", fontSize = 11.sp) }
                    }
                }
            }
            1 -> {
                val acts = project.activities ?: emptyList()
                if (acts.isEmpty()) {
                    Box(Modifier.fillMaxSize(), Alignment.Center) { Text("Sin actividades vinculadas", color = MaterialTheme.colorScheme.onSurfaceVariant) }
                } else {
                    LazyColumn(Modifier.fillMaxSize(), contentPadding = PaddingValues(12.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                        items(acts, key = { it.id }) { a ->
                            Card(Modifier.fillMaxWidth()) { Text("Actividad #${a.id}", Modifier.padding(14.dp), fontWeight = FontWeight.Medium) }
                        }
                    }
                }
            }
            else -> {
                val assignments = project.engineers ?: emptyList()
                LazyColumn(Modifier.fillMaxSize(), contentPadding = PaddingValues(12.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    if (assignments.isEmpty()) {
                        item { Box(Modifier.fillMaxWidth(), Alignment.Center) { Text("Sin ingenieros asignados", color = MaterialTheme.colorScheme.onSurfaceVariant) } }
                    } else {
                        items(assignments, key = { it.id }) { a ->
                            Card(Modifier.fillMaxWidth()) {
                                Row(Modifier.fillMaxWidth().padding(12.dp), Arrangement.SpaceBetween, Alignment.CenterVertically) {
                                    Text(a.engineer.nombre, fontWeight = FontWeight.Medium, modifier = Modifier.weight(1f))
                                    Button(onClick = { onRemoveEngineer(project.id, a.engineer.id) }, enabled = !saving) { Text("Quitar") }
                                }
                            }
                        }
                    }
                    item {
                        Spacer(Modifier.height(8.dp))
                        var engMenu by remember { mutableStateOf(false) }
                        val engineers = allEngineers.filter { u ->
                            u.nombre.lowercase().contains("ingenier") || u.nombre.lowercase().contains("engineer")
                        }
                        Button(onClick = { engMenu = true }, Modifier.fillMaxWidth(), enabled = !saving) {
                            Text(selectedEngineerByProject[project.id]?.let { "Ingeniero seleccionado: #$it" } ?: "Seleccionar ingeniero")
                        }
                        DropdownMenu(expanded = engMenu, onDismissRequest = { engMenu = false }) {
                            engineers.take(60).forEach { e ->
                                DropdownMenuItem(text = { Text(e.nombre) }, onClick = { onSelectEngineer(project.id, e.id); engMenu = false })
                            }
                        }
                        Button(onClick = onAddEngineer, Modifier.fillMaxWidth(), enabled = !saving && selectedEngineerByProject[project.id] != null) {
                            Text("Agregar ingeniero")
                        }
                    }
                }
            }
        }
    }
}

private fun projectStatusLabel(status: String): String = when (status.uppercase()) {
    "ACTIVE" -> "Activo"
    "ON_HOLD" -> "En pausa"
    "COMPLETED" -> "Cerrado"
    else -> status
}

private fun projectStatusTone(status: String): NxTone = when (status.uppercase()) {
    "ACTIVE" -> NxTone.Success
    "ON_HOLD" -> NxTone.Warning
    "COMPLETED" -> NxTone.Info
    else -> NxTone.Neutral
}

private fun projectStatusColor(status: String): androidx.compose.ui.graphics.Color = when (status.uppercase()) {
    "ACTIVE" -> androidx.compose.ui.graphics.Color(0xFF2E7D32)
    "ON_HOLD" -> androidx.compose.ui.graphics.Color(0xFFE65100)
    "COMPLETED" -> androidx.compose.ui.graphics.Color(0xFF1565C0)
    else -> androidx.compose.ui.graphics.Color.Gray
}

