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
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
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
import mx.nexara.mobile.nativeapp.data.AuthRepository
import mx.nexara.mobile.nativeapp.data.api.CreateActivityRequest
import mx.nexara.mobile.nativeapp.data.api.OpsClientTicketRequestDto
import mx.nexara.mobile.nativeapp.data.api.OperationalProjectDto
import mx.nexara.mobile.nativeapp.data.api.VisibleUserDto
import mx.nexara.mobile.nativeapp.data.console.ConsoleRepository
import mx.nexara.mobile.nativeapp.data.ops.OpsRepository
import mx.nexara.mobile.nativeapp.ui.enterprise.NxColors
import mx.nexara.mobile.nativeapp.ui.enterprise.NxErrorBlock
import mx.nexara.mobile.nativeapp.ui.enterprise.NxLoadingBlock
import mx.nexara.mobile.nativeapp.ui.enterprise.NxPanelShell
import mx.nexara.mobile.nativeapp.ui.enterprise.NxSectionHeader

data class OpsNewActivityUiState(
    val loading: Boolean = true,
    val saving: Boolean = false,
    val error: String? = null,
    val success: String? = null,
    val nextAn: String = "",
    val projects: List<OperationalProjectDto> = emptyList(),
    val users: List<VisibleUserDto> = emptyList(),
    val ticketRequests: List<OpsClientTicketRequestDto> = emptyList(),
    val titulo: String = "",
    val indicaciones: String = "",
    val prioridad: String = "Media",
    val projectId: Long? = null,
    val responsableId: Long? = null,
    val tiempoEstimadoMin: String = "",
    val tiempoMaximoMin: String = "",
    val fecha: String = "",
    val ticketType: String = "PREVENTIVO",
    val branchName: String = "",
    val branchNumber: String = "",
    val branchCity: String = "",
    val branchState: String = "",
    val branchAddress: String = "",
    val pendingRequestId: Long? = null,
)

class OpsNewActivityViewModel(app: Application) : AndroidViewModel(app) {
    private val consoleRepo = ConsoleRepository(app.applicationContext)
    private val opsRepo = OpsRepository(app.applicationContext)
    private val authRepo = AuthRepository(app.applicationContext)
    private val _state = MutableStateFlow(OpsNewActivityUiState())
    val state: StateFlow<OpsNewActivityUiState> = _state

    fun load(prefillRequestId: Long? = null) {
        _state.update { it.copy(loading = true, error = null) }
        viewModelScope.launch {
            try {
                val projects = withContext(Dispatchers.IO) { consoleRepo.operationalProjects() }
                val users = withContext(Dispatchers.IO) { consoleRepo.usersFetch() }
                val nextAn = withContext(Dispatchers.IO) { consoleRepo.nextAnNumber() }
                val tickets = withContext(Dispatchers.IO) { opsRepo.approvedTicketRequests() }
                _state.update {
                    it.copy(
                        loading = false,
                        projects = projects.filter { p -> p.status == "ACTIVE" },
                        users = users,
                        nextAn = nextAn,
                        ticketRequests = tickets,
                    )
                }
                if (prefillRequestId != null) {
                    prefillFromRequest(prefillRequestId)
                }
            } catch (e: Exception) {
                _state.update {
                    it.copy(
                        loading = false,
                        error = e.message ?: "No se pudo cargar el formulario",
                    )
                }
            }
        }
    }

    fun update(field: String, value: String) {
        _state.update {
            when (field) {
                "titulo" -> it.copy(titulo = value)
                "indicaciones" -> it.copy(indicaciones = value)
                "prioridad" -> it.copy(prioridad = value)
                "tiempoEstimadoMin" -> it.copy(tiempoEstimadoMin = value)
                "tiempoMaximoMin" -> it.copy(tiempoMaximoMin = value)
                "fecha" -> it.copy(fecha = value)
                "branchName" -> it.copy(branchName = value)
                "branchNumber" -> it.copy(branchNumber = value)
                "branchCity" -> it.copy(branchCity = value)
                "branchState" -> it.copy(branchState = value)
                "branchAddress" -> it.copy(branchAddress = value)
                else -> it
            }
        }
    }

    fun setProjectId(id: Long?) = _state.update { it.copy(projectId = id) }
    fun setResponsableId(id: Long?) = _state.update { it.copy(responsableId = id) }
    fun setTicketType(type: String) = _state.update { it.copy(ticketType = type) }

    fun prefillFromRequest(requestId: Long) {
        val req = _state.value.ticketRequests.firstOrNull { it.id == requestId } ?: return
        val clientId = req.clientId
        val matching = _state.value.projects.filter { clientId == null || it.client?.id == clientId }
        _state.update {
            it.copy(
                pendingRequestId = requestId,
                titulo = req.branchName?.let { b -> "Ticket $b" } ?: "Ticket cliente",
                indicaciones = req.description ?: it.indicaciones,
                prioridad = when (req.urgency?.uppercase()) {
                    "HIGH" -> "Alta"
                    "LOW" -> "Baja"
                    else -> "Media"
                },
                projectId = if (matching.size == 1) matching.first().id else it.projectId,
                branchName = req.branchName.ifBlank { it.branchName },
                branchNumber = req.branchNumber.ifBlank { it.branchNumber },
                branchCity = req.city.ifBlank { it.branchCity },
                branchState = req.state.ifBlank { it.branchState },
                branchAddress = req.address.ifBlank { it.branchAddress },
                success = "Solicitud precargada",
            )
        }
    }

    fun save(onSuccess: (Long) -> Unit) {
        val s = _state.value
        val userId = authRepo.loadSession()?.id
        if (userId == null) {
            _state.update { it.copy(error = "Sesión inválida") }
            return
        }
        if (s.titulo.isBlank() || s.responsableId == null || s.projectId == null) {
            _state.update { it.copy(error = "Título, proyecto y responsable son obligatorios") }
            return
        }
        val project = s.projects.firstOrNull { it.id == s.projectId }
        val fechaIso = s.fecha.takeIf { it.isNotBlank() }?.let { "${it}T08:00:00.000Z" }
        _state.update { it.copy(saving = true, error = null, success = null) }
        viewModelScope.launch {
            try {
                val body = CreateActivityRequest(
                    titulo = s.titulo.trim(),
                    indicaciones = s.indicaciones.takeIf { it.isNotBlank() },
                    prioridad = s.prioridad,
                    ticketType = if (s.ticketType == "INVENTARIO") "PREVENTIVO" else s.ticketType,
                    workType = if (s.ticketType == "INVENTARIO") "PREVENTIVE_INVENTORY" else "ISSUE",
                    clientId = project?.client?.id,
                    projectId = s.projectId,
                    branchName = s.branchName.takeIf { it.isNotBlank() },
                    branchNumber = s.branchNumber.takeIf { it.isNotBlank() },
                    branchCity = s.branchCity.takeIf { it.isNotBlank() },
                    branchState = s.branchState.takeIf { it.isNotBlank() },
                    branchAddress = s.branchAddress.takeIf { it.isNotBlank() },
                    tiempoEstimadoMin = s.tiempoEstimadoMin.toIntOrNull(),
                    tiempoMaximoMin = s.tiempoMaximoMin.toIntOrNull(),
                    creadoPorId = userId,
                    responsableId = s.responsableId!!,
                    estatus = "Pendiente",
                    fechaInicio = fechaIso,
                )
                val newId = withContext(Dispatchers.IO) { consoleRepo.createActivity(body) }
                val requestId = s.pendingRequestId
                if (requestId != null) {
                    withContext(Dispatchers.IO) { opsRepo.assignClientTicket(requestId, newId) }
                }
                _state.update { it.copy(saving = false, success = "OT asignada") }
                onSuccess(newId)
            } catch (e: Exception) {
                _state.update {
                    it.copy(
                        saving = false,
                        error = e.message ?: "No se pudo guardar la OT",
                    )
                }
            }
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun OpsNewActivityScreen(
    requestId: Long? = null,
    onBack: () -> Unit,
    onCreated: (Long) -> Unit = {},
    contentPadding: PaddingValues = PaddingValues(16.dp),
) {
    val vm: OpsNewActivityViewModel = viewModel()
    val state by vm.state.collectAsState()
  val loaded = remember { mutableStateOf(false) }
    if (!loaded.value) {
        loaded.value = true
        vm.load(requestId)
    }

    Column(
        Modifier
            .fillMaxSize()
            .padding(contentPadding),
    ) {
        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
            TextButton(onClick = onBack) { Text("← Volver") }
            Text(
                "AN: ${state.nextAn.ifBlank { "—" }}",
                style = MaterialTheme.typography.labelMedium,
                color = NxColors.Muted,
            )
        }

        when {
            state.loading -> NxLoadingBlock("Preparando formulario…")
            state.error != null && state.projects.isEmpty() -> NxErrorBlock(state.error!!) { vm.load(requestId) }
            else -> {
                LazyColumn(verticalArrangement = Arrangement.spacedBy(12.dp)) {
                    if (state.ticketRequests.isNotEmpty()) {
                        item {
                            NxPanelShell {
                                NxSectionHeader(
                                    title = "Tickets aprobados",
                                    subtitle = "Precarga datos para nueva OT",
                                )
                                state.ticketRequests.take(5).forEach { req ->
                                    Card(
                                        modifier = Modifier.fillMaxWidth().padding(vertical = 4.dp),
                                        colors = CardDefaults.cardColors(containerColor = NxColors.Surface),
                                    ) {
                                        Column(Modifier.padding(12.dp)) {
                                            Text(
                                                "${req.clientName ?: "Cliente"} · ${req.branchName ?: "Sucursal"}",
                                                fontWeight = FontWeight.SemiBold,
                                            )
                                            if (!req.description.isNullOrBlank()) {
                                                Text(req.description!!, style = MaterialTheme.typography.bodySmall)
                                            }
                                            TextButton(onClick = { vm.prefillFromRequest(req.id) }) {
                                                Text("Usar solicitud")
                                            }
                                        }
                                    }
                                }
                            }
                        }
                    }

                    item {
                        NxPanelShell {
                            NxSectionHeader(title = "Nueva OT", subtitle = "Proyecto, responsable y tiempos")
                            OutlinedTextField(
                                value = state.titulo,
                                onValueChange = { vm.update("titulo", it) },
                                label = { Text("Título") },
                                modifier = Modifier.fillMaxWidth(),
                            )
                            Spacer(Modifier.height(8.dp))
                            ProjectPicker(state, vm::setProjectId)
                            Spacer(Modifier.height(8.dp))
                            UserPicker(state, vm::setResponsableId)
                            Spacer(Modifier.height(8.dp))
                            OutlinedTextField(
                                value = state.prioridad,
                                onValueChange = { vm.update("prioridad", it) },
                                label = { Text("Prioridad (Baja/Media/Alta)") },
                                modifier = Modifier.fillMaxWidth(),
                            )
                            Spacer(Modifier.height(8.dp))
                            OutlinedTextField(
                                value = state.fecha,
                                onValueChange = { vm.update("fecha", it) },
                                label = { Text("Fecha (YYYY-MM-DD)") },
                                modifier = Modifier.fillMaxWidth(),
                            )
                            Spacer(Modifier.height(8.dp))
                            OutlinedTextField(
                                value = state.tiempoEstimadoMin,
                                onValueChange = { vm.update("tiempoEstimadoMin", it) },
                                label = { Text("Tiempo estimado (min)") },
                                modifier = Modifier.fillMaxWidth(),
                            )
                            Spacer(Modifier.height(8.dp))
                            OutlinedTextField(
                                value = state.indicaciones,
                                onValueChange = { vm.update("indicaciones", it) },
                                label = { Text("Indicaciones") },
                                modifier = Modifier.fillMaxWidth(),
                            )
                            if (state.pendingRequestId != null) {
                                Spacer(Modifier.height(8.dp))
                                OutlinedTextField(
                                    value = state.branchName,
                                    onValueChange = { vm.update("branchName", it) },
                                    label = { Text("Sucursal") },
                                    modifier = Modifier.fillMaxWidth(),
                                )
                            }
                            Spacer(Modifier.height(12.dp))
                            if (!state.error.isNullOrBlank()) {
                                Text(state.error!!, color = MaterialTheme.colorScheme.error)
                            }
                            if (!state.success.isNullOrBlank()) {
                                Text(state.success!!, color = NxColors.Success)
                            }
                            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                                OutlinedButton(onClick = onBack, modifier = Modifier.weight(1f)) {
                                    Text("Cancelar")
                                }
                                Button(
                                    onClick = { vm.save(onCreated) },
                                    enabled = !state.saving,
                                    modifier = Modifier.weight(1f),
                                ) {
                                    Text(if (state.saving) "Guardando…" else "Asignar OT")
                                }
                            }
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun ProjectPicker(state: OpsNewActivityUiState, onSelect: (Long?) -> Unit) {
    var expanded by remember { mutableStateOf(false) }
    val selected = state.projects.firstOrNull { it.id == state.projectId }
    Column {
        OutlinedButton(onClick = { expanded = !expanded }, modifier = Modifier.fillMaxWidth()) {
            Text(selected?.title ?: "Seleccionar proyecto")
        }
        if (expanded) {
            state.projects.forEach { p ->
                TextButton(onClick = {
                    onSelect(p.id)
                    expanded = false
                }) { Text(p.title) }
            }
        }
    }
}

@Composable
private fun UserPicker(state: OpsNewActivityUiState, onSelect: (Long?) -> Unit) {
    var expanded by remember { mutableStateOf(false) }
    val selected = state.users.firstOrNull { it.id == state.responsableId }
    Column {
        OutlinedButton(onClick = { expanded = !expanded }, modifier = Modifier.fillMaxWidth()) {
            Text(selected?.nombre ?: "Seleccionar responsable")
        }
        if (expanded) {
            state.users.forEach { u ->
                TextButton(onClick = {
                    onSelect(u.id)
                    expanded = false
                }) { Text(u.nombre ?: "Usuario ${u.id}") }
            }
        }
    }
}
