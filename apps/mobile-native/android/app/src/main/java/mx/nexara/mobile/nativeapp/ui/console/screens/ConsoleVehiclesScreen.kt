package mx.nexara.mobile.nativeapp.ui.console.screens

import android.app.Application
import androidx.compose.foundation.clickable
import androidx.compose.foundation.horizontalScroll
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
import androidx.compose.foundation.rememberScrollState
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.FilterChip
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
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
import mx.nexara.mobile.nativeapp.data.api.VehicleAssetDto
import mx.nexara.mobile.nativeapp.data.api.VehicleControlDto
import mx.nexara.mobile.nativeapp.data.api.toUserMessage
import mx.nexara.mobile.nativeapp.data.console.ConsoleRepository
import mx.nexara.mobile.nativeapp.ui.enterprise.NxLoadingBlock
import mx.nexara.mobile.nativeapp.ui.util.openExternalUrl

enum class VehiclesTab { SOLICITUDES, FLOTILLA }

private val FLOTILLA_ESTADOS = listOf(
    "Disponible",
    "Asignado",
    "En_servicio",
    "Fuera_de_servicio",
    "En_mantenimiento",
)

data class VehiclesUiState(
    val isLoading: Boolean = true,
    val error: String? = null,
    val query: String = "",
    val tab: VehiclesTab = VehiclesTab.SOLICITUDES,
    val vehicles: List<VehicleControlDto> = emptyList(),
    val inventory: List<VehicleAssetDto> = emptyList(),
    val actingId: Long? = null,
    val actionMessage: String? = null,
    val saving: Boolean = false,
)

class ConsoleVehiclesViewModel(app: Application) : AndroidViewModel(app) {
    private val repo = ConsoleRepository(app.applicationContext)

    private val _state = MutableStateFlow(VehiclesUiState())
    val state: StateFlow<VehiclesUiState> = _state

    fun setQuery(v: String) = _state.update { it.copy(query = v) }
    fun setTab(tab: VehiclesTab) = _state.update { it.copy(tab = tab, actionMessage = null) }
    fun clearMessage() = _state.update { it.copy(actionMessage = null) }

    fun refresh() {
        _state.update { it.copy(isLoading = true, error = null) }
        viewModelScope.launch {
            try {
                val list = withContext(Dispatchers.IO) { repo.vehiclesFetch() }
                val inventory = withContext(Dispatchers.IO) {
                    runCatching { repo.vehicleInventoryFetch() }.getOrDefault(emptyList())
                }
                _state.update {
                    it.copy(isLoading = false, vehicles = list, inventory = inventory, error = null)
                }
            } catch (e: Exception) {
                _state.update {
                    it.copy(isLoading = false, error = e.toUserMessage("No se pudieron cargar vehículos"))
                }
            }
        }
    }

    fun approveRequest(id: Long, approve: Boolean, onDone: (() -> Unit)? = null) {
        _state.update { it.copy(actingId = id, actionMessage = null) }
        viewModelScope.launch {
            try {
                withContext(Dispatchers.IO) { repo.approveVehicleRequest(id, approve) }
                _state.update {
                    it.copy(
                        actingId = null,
                        actionMessage = if (approve) "✅ Solicitud aprobada" else "✅ Solicitud rechazada",
                    )
                }
                refresh()
                onDone?.invoke()
            } catch (e: Exception) {
                _state.update {
                    it.copy(
                        actingId = null,
                        actionMessage = "❌ ${e.toUserMessage("No se pudo actualizar la solicitud")}",
                    )
                }
            }
        }
    }

    fun saveInventory(
        editingId: Long?,
        nombre: String,
        placas: String,
        estatus: String,
        notas: String,
        onDone: () -> Unit,
    ) {
        val name = nombre.trim()
        if (name.isBlank()) {
            _state.update { it.copy(actionMessage = "❌ Nombre obligatorio") }
            return
        }
        _state.update { it.copy(saving = true, actionMessage = null) }
        viewModelScope.launch {
            try {
                withContext(Dispatchers.IO) {
                    if (editingId == null) {
                        repo.createVehicleInventory(
                            nombre = name,
                            placas = placas.trim().ifBlank { null },
                            estatus = estatus.ifBlank { "Disponible" },
                            notas = notas.trim().ifBlank { null },
                        )
                    } else {
                        repo.updateVehicleInventory(
                            id = editingId,
                            nombre = name,
                            placas = placas.trim().ifBlank { null },
                            estatus = estatus.ifBlank { null },
                            notas = notas.trim().ifBlank { null },
                        )
                    }
                }
                _state.update {
                    it.copy(
                        saving = false,
                        actionMessage = if (editingId == null) "✅ Vehículo agregado" else "✅ Vehículo actualizado",
                    )
                }
                refresh()
                onDone()
            } catch (e: Exception) {
                _state.update {
                    it.copy(
                        saving = false,
                        actionMessage = "❌ ${e.toUserMessage("No se pudo guardar el vehículo")}",
                    )
                }
            }
        }
    }

    fun deactivateInventory(id: Long) {
        _state.update { it.copy(actingId = id, actionMessage = null) }
        viewModelScope.launch {
            try {
                withContext(Dispatchers.IO) {
                    repo.updateVehicleInventory(id = id, activo = false)
                }
                _state.update { it.copy(actingId = null, actionMessage = "✅ Vehículo desactivado") }
                refresh()
            } catch (e: Exception) {
                _state.update {
                    it.copy(
                        actingId = null,
                        actionMessage = "❌ ${e.toUserMessage("No se pudo desactivar")}",
                    )
                }
            }
        }
    }
}

@Composable
private fun VehicleDetail(
    v: VehicleControlDto,
    context: android.content.Context,
    acting: Boolean,
    actionMessage: String?,
    onBack: () -> Unit,
    onApprove: (Boolean) -> Unit,
) {
    val name = v.vehiculo?.nombre ?: v.nombreVehiculo ?: "Vehículo"
    val plates = v.placasVehiculo ?: v.vehiculo?.placas ?: "—"
    val pending = v.estatusAprobacion.equals("Pendiente", ignoreCase = true)
    LazyColumn(
        modifier = Modifier.fillMaxSize(),
        contentPadding = PaddingValues(12.dp),
        verticalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        item { OutlinedButton(onClick = onBack) { Text("← Vehículos") } }
        item {
            Card(Modifier.fillMaxWidth()) {
                Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                    Text("$name ($plates)", style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold)
                    VRow("Estatus", v.estatusAprobacion)
                    VRow("Responsable", v.solicitante?.nombre)
                    VRow("Solicitud", v.fechaSolicitud)
                    VRow("Inicio solicitado", v.fechaInicioSolicitada)
                    VRow("Fin solicitado", v.fechaFinSolicitada)
                    VRow("Inicio aprobado", v.fechaInicioAprobada)
                    VRow("Fin aprobado", v.fechaFinAprobada)
                    VRow("Entrega estatus", v.entregaEstatus)
                    VRow("Observaciones", v.entregaObservaciones)
                    v.penalizacionMonto?.let { VRow("Penalización", "$$it") }
                }
            }
        }
        if (!actionMessage.isNullOrBlank()) {
            item {
                Text(
                    actionMessage,
                    color = if (actionMessage.startsWith("✅")) {
                        MaterialTheme.colorScheme.primary
                    } else {
                        MaterialTheme.colorScheme.error
                    },
                )
            }
        }
        if (pending) {
            item {
                Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    Button(
                        onClick = { onApprove(true) },
                        enabled = !acting,
                        modifier = Modifier.weight(1f),
                    ) { Text(if (acting) "…" else "Aprobar") }
                    OutlinedButton(
                        onClick = { onApprove(false) },
                        enabled = !acting,
                        modifier = Modifier.weight(1f),
                        colors = ButtonDefaults.outlinedButtonColors(
                            contentColor = MaterialTheme.colorScheme.error,
                        ),
                    ) { Text("Rechazar") }
                }
            }
        }
        if (!v.evidenciaEntregaUrl.isNullOrBlank() || !v.evidenciaDevolucionUrl.isNullOrBlank()) {
            item {
                Card(Modifier.fillMaxWidth()) {
                    Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                        Text("Evidencias", fontWeight = FontWeight.SemiBold)
                        if (!v.evidenciaEntregaUrl.isNullOrBlank()) {
                            Button(
                                onClick = { openExternalUrl(context, v.evidenciaEntregaUrl!!) },
                                Modifier.fillMaxWidth(),
                            ) { Text("Abrir evidencia entrega") }
                        }
                        if (!v.evidenciaDevolucionUrl.isNullOrBlank()) {
                            Button(
                                onClick = { openExternalUrl(context, v.evidenciaDevolucionUrl!!) },
                                Modifier.fillMaxWidth(),
                            ) { Text("Abrir evidencia devolución") }
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun VRow(label: String, value: String?) {
    if (!value.isNullOrBlank()) {
        Row(Modifier.fillMaxWidth()) {
            Text(label, fontWeight = FontWeight.Medium, modifier = Modifier.weight(1f))
            Text(value, color = MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.weight(1.2f))
        }
    }
}

@Composable
private fun InventoryEditor(
    editing: VehicleAssetDto?,
    saving: Boolean,
    actionMessage: String?,
    onCancel: () -> Unit,
    onSave: (nombre: String, placas: String, estatus: String, notas: String) -> Unit,
) {
    var nombre by remember(editing?.id) { mutableStateOf(editing?.nombre.orEmpty()) }
    var placas by remember(editing?.id) { mutableStateOf(editing?.placas.orEmpty()) }
    var estatus by remember(editing?.id) {
        mutableStateOf(editing?.estatus?.takeIf { it.isNotBlank() } ?: "Disponible")
    }
    var notas by remember(editing?.id) { mutableStateOf(editing?.notas.orEmpty()) }

    LazyColumn(
        modifier = Modifier.fillMaxSize(),
        contentPadding = PaddingValues(12.dp),
        verticalArrangement = Arrangement.spacedBy(10.dp),
    ) {
        item { OutlinedButton(onClick = onCancel) { Text("← Cancelar") } }
        item {
            Text(
                if (editing == null) "Agregar vehículo" else "Editar vehículo",
                style = MaterialTheme.typography.titleMedium,
                fontWeight = FontWeight.Bold,
            )
        }
        item {
            OutlinedTextField(
                value = nombre,
                onValueChange = { nombre = it },
                label = { Text("Nombre (marca modelo año)") },
                singleLine = true,
                modifier = Modifier.fillMaxWidth(),
            )
        }
        item {
            OutlinedTextField(
                value = placas,
                onValueChange = { placas = it },
                label = { Text("Placas") },
                singleLine = true,
                modifier = Modifier.fillMaxWidth(),
            )
        }
        item {
            Text("Estatus", style = MaterialTheme.typography.labelMedium)
            Row(
                Modifier.horizontalScroll(rememberScrollState()),
                horizontalArrangement = Arrangement.spacedBy(6.dp),
            ) {
                FLOTILLA_ESTADOS.forEach { st ->
                    FilterChip(
                        selected = estatus == st,
                        onClick = { estatus = st },
                        label = { Text(st.replace('_', ' ')) },
                        enabled = editing != null || st == "Disponible",
                    )
                }
            }
        }
        item {
            OutlinedTextField(
                value = notas,
                onValueChange = { notas = it },
                label = { Text("Notas / póliza") },
                minLines = 2,
                modifier = Modifier.fillMaxWidth(),
            )
        }
        if (!actionMessage.isNullOrBlank()) {
            item {
                Text(
                    actionMessage,
                    color = if (actionMessage.startsWith("✅")) {
                        MaterialTheme.colorScheme.primary
                    } else {
                        MaterialTheme.colorScheme.error
                    },
                )
            }
        }
        item {
            Button(
                onClick = { onSave(nombre, placas, estatus, notas) },
                enabled = !saving,
                modifier = Modifier.fillMaxWidth(),
            ) { Text(if (saving) "Guardando…" else "Guardar") }
        }
    }
}

@Composable
fun ConsoleVehiclesScreen(
    contentPadding: PaddingValues = PaddingValues(16.dp),
) {
    val context = LocalContext.current
    val vm: ConsoleVehiclesViewModel = viewModel()
    val state by vm.state.collectAsState()
    var selected by remember { mutableStateOf<VehicleControlDto?>(null) }
    var editingAsset by remember { mutableStateOf<VehicleAssetDto?>(null) }
    var showInventoryForm by remember { mutableStateOf(false) }

    if (state.vehicles.isEmpty() && state.inventory.isEmpty() && state.isLoading && state.error == null) {
        vm.refresh()
    }

    val sel = selected
    if (sel != null) {
        VehicleDetail(
            v = sel,
            context = context,
            acting = state.actingId == sel.id,
            actionMessage = state.actionMessage,
            onBack = { selected = null; vm.clearMessage() },
            onApprove = { approve ->
                vm.approveRequest(sel.id, approve) {
                    selected = null
                }
            },
        )
        return
    }

    if (showInventoryForm) {
        InventoryEditor(
            editing = editingAsset,
            saving = state.saving,
            actionMessage = state.actionMessage,
            onCancel = {
                showInventoryForm = false
                editingAsset = null
                vm.clearMessage()
            },
            onSave = { nombre, placas, estatus, notas ->
                vm.saveInventory(editingAsset?.id, nombre, placas, estatus, notas) {
                    showInventoryForm = false
                    editingAsset = null
                }
            },
        )
        return
    }

    val q = state.query.trim().lowercase()
    val filteredRequests = if (q.isBlank()) {
        state.vehicles
    } else {
        state.vehicles.filter { v ->
            buildString {
                append(v.vehiculo?.nombre ?: v.nombreVehiculo ?: "")
                append(' ')
                append(v.placasVehiculo ?: v.vehiculo?.placas ?: "")
                append(' ')
                append(v.estatusAprobacion)
                append(' ')
                append(v.solicitante?.nombre ?: "")
            }.lowercase().contains(q)
        }
    }
    val filteredInventory = if (q.isBlank()) {
        state.inventory.filter { it.activo != false }
    } else {
        state.inventory.filter { v ->
            v.activo != false &&
                (
                    v.nombre.lowercase().contains(q) ||
                        (v.placas ?: "").lowercase().contains(q) ||
                        (v.estatus ?: "").lowercase().contains(q)
                    )
        }
    }
    val pendingCount = state.vehicles.count { it.estatusAprobacion.equals("Pendiente", true) }

    Column(
        modifier = Modifier
            .fillMaxSize()
            .padding(contentPadding),
        verticalArrangement = Arrangement.Top,
    ) {
        Text("Vehículos", style = MaterialTheme.typography.titleLarge)
        Spacer(modifier = Modifier.height(8.dp))

        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            FilterChip(
                selected = state.tab == VehiclesTab.SOLICITUDES,
                onClick = { vm.setTab(VehiclesTab.SOLICITUDES) },
                label = { Text("Solicitudes (${state.vehicles.size})") },
            )
            FilterChip(
                selected = state.tab == VehiclesTab.FLOTILLA,
                onClick = { vm.setTab(VehiclesTab.FLOTILLA) },
                label = { Text("Flotilla (${state.inventory.count { it.activo != false }})") },
            )
        }
        Spacer(modifier = Modifier.height(8.dp))

        if (state.isLoading) {
            NxLoadingBlock("Cargando vehículos…")
            return@Column
        }
        if (!state.error.isNullOrBlank()) {
            Text(state.error!!, color = MaterialTheme.colorScheme.error)
            Spacer(modifier = Modifier.height(12.dp))
            Button(onClick = { vm.refresh() }) { Text("Reintentar") }
            return@Column
        }

        if (!state.actionMessage.isNullOrBlank()) {
            Text(
                state.actionMessage!!,
                color = if (state.actionMessage!!.startsWith("✅")) {
                    MaterialTheme.colorScheme.primary
                } else {
                    MaterialTheme.colorScheme.error
                },
            )
            Spacer(modifier = Modifier.height(6.dp))
        }

        OutlinedTextField(
            value = state.query,
            onValueChange = vm::setQuery,
            label = {
                Text(
                    if (state.tab == VehiclesTab.SOLICITUDES) {
                        "Buscar (placas, responsable, estatus)"
                    } else {
                        "Buscar (nombre, placas, estatus)"
                    },
                )
            },
            singleLine = true,
            modifier = Modifier.fillMaxWidth(),
        )
        Spacer(modifier = Modifier.height(8.dp))

        if (state.tab == VehiclesTab.FLOTILLA) {
            Button(
                onClick = {
                    editingAsset = null
                    showInventoryForm = true
                    vm.clearMessage()
                },
                modifier = Modifier.fillMaxWidth(),
            ) { Text("+ Agregar vehículo") }
            Spacer(modifier = Modifier.height(8.dp))
        } else if (pendingCount > 0) {
            Text(
                "$pendingCount pendiente(s) de autorización",
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.tertiary,
            )
            Spacer(modifier = Modifier.height(6.dp))
        }

        LazyColumn(
            verticalArrangement = Arrangement.spacedBy(8.dp),
            modifier = Modifier.fillMaxWidth(),
        ) {
            if (state.tab == VehiclesTab.SOLICITUDES) {
                items(filteredRequests.take(200), key = { it.id }) { v ->
                    val name = v.vehiculo?.nombre ?: v.nombreVehiculo ?: "Vehículo"
                    val plates = v.placasVehiculo ?: v.vehiculo?.placas ?: "-"
                    val pending = v.estatusAprobacion.equals("Pendiente", true)
                    Card(
                        modifier = Modifier.fillMaxWidth().clickable { selected = v },
                        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
                    ) {
                        Column(modifier = Modifier.padding(12.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                            Text(
                                "$name ($plates)",
                                style = MaterialTheme.typography.titleSmall,
                                fontWeight = FontWeight.SemiBold,
                            )
                            Text(
                                "Estatus: ${v.estatusAprobacion}",
                                color = MaterialTheme.colorScheme.onSurfaceVariant,
                                style = MaterialTheme.typography.bodySmall,
                            )
                            val requester = v.solicitante?.nombre
                            if (!requester.isNullOrBlank()) {
                                Text(
                                    "Responsable: $requester",
                                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                                    style = MaterialTheme.typography.bodySmall,
                                )
                            }
                            if (pending) {
                                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                                    Button(
                                        onClick = { vm.approveRequest(v.id, true) },
                                        enabled = state.actingId != v.id,
                                    ) { Text("Aprobar") }
                                    OutlinedButton(
                                        onClick = { vm.approveRequest(v.id, false) },
                                        enabled = state.actingId != v.id,
                                    ) { Text("Rechazar") }
                                }
                            }
                        }
                    }
                }
            } else {
                items(filteredInventory.take(200), key = { it.id }) { asset ->
                    Card(
                        modifier = Modifier.fillMaxWidth(),
                        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
                    ) {
                        Column(modifier = Modifier.padding(12.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                            Text(asset.nombre, style = MaterialTheme.typography.titleSmall, fontWeight = FontWeight.SemiBold)
                            Text(
                                "Placas: ${asset.placas ?: "—"} · ${(asset.estatus ?: "Disponible").replace('_', ' ')}",
                                color = MaterialTheme.colorScheme.onSurfaceVariant,
                                style = MaterialTheme.typography.bodySmall,
                            )
                            if (!asset.notas.isNullOrBlank()) {
                                Text(
                                    asset.notas!!,
                                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                                    style = MaterialTheme.typography.bodySmall,
                                )
                            }
                            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                                OutlinedButton(
                                    onClick = {
                                        editingAsset = asset
                                        showInventoryForm = true
                                        vm.clearMessage()
                                    },
                                ) { Text("Editar") }
                                OutlinedButton(
                                    onClick = { vm.deactivateInventory(asset.id) },
                                    enabled = state.actingId != asset.id,
                                    colors = ButtonDefaults.outlinedButtonColors(
                                        contentColor = MaterialTheme.colorScheme.error,
                                    ),
                                ) { Text("Desactivar") }
                            }
                        }
                    }
                }
            }
        }
    }
}
