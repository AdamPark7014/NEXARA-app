package mx.nexara.mobile.nativeapp.ui.console.screens

import android.app.Application
import android.content.Context
import android.net.Uri
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
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
import androidx.compose.material3.Tab
import androidx.compose.material3.TabRow
import androidx.compose.material3.Text
import coil.compose.AsyncImage
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import androidx.lifecycle.viewmodel.compose.viewModel
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.async
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import mx.nexara.mobile.nativeapp.data.api.ActivityDetailedDto
import mx.nexara.mobile.nativeapp.data.api.InventorySnapshotDto
import mx.nexara.mobile.nativeapp.data.api.ServiceClientDto
import mx.nexara.mobile.nativeapp.data.realtime.refreshOnModels
import mx.nexara.mobile.nativeapp.data.api.toAbsoluteAssetUrl
import mx.nexara.mobile.nativeapp.data.console.ConsoleRepository
import mx.nexara.mobile.nativeapp.ui.util.downloadAuthedToCache
import mx.nexara.mobile.nativeapp.ui.util.openExternalUrl
import mx.nexara.mobile.nativeapp.ui.util.openFile
import mx.nexara.mobile.nativeapp.ui.util.openPdfFile
import mx.nexara.mobile.nativeapp.ui.util.savePdfToCache
import java.time.Instant
import java.time.OffsetDateTime
import java.time.format.DateTimeFormatter
import java.util.Locale

private fun Context.readBytes(uri: Uri): ByteArray? =
    runCatching { contentResolver.openInputStream(uri)?.use { it.readBytes() } }.getOrNull()

private fun formatDateTime(value: String?): String {
    val v = value?.trim().orEmpty()
    if (v.isBlank()) return "-"
    return runCatching {
        val dt = OffsetDateTime.parse(v)
        dt.format(DateTimeFormatter.ofPattern("dd/MM/yy HH:mm", Locale("es", "MX")))
    }.getOrElse { "-" }
}

private fun formatDurationMinutes(start: String?, end: String?): String {
    val s = start?.trim().orEmpty()
    val e = end?.trim().orEmpty()
    if (s.isBlank() || e.isBlank()) return "-"
    val minutes = runCatching {
        val startDt = OffsetDateTime.parse(s)
        val endDt = OffsetDateTime.parse(e)
        kotlin.math.round((endDt.toInstant().toEpochMilli() - startDt.toInstant().toEpochMilli()).toDouble() / 60000.0).toLong()
    }.getOrElse { return "-" }
    val hours = minutes / 60
    val mins = minutes % 60
    return if (hours <= 0) "${mins} min" else "${hours} h ${mins} min"
}

private fun formatAnswer(value: Boolean?): String = when (value) {
    true -> "Si"
    false -> "No"
    null -> "-"
}

data class ConsoleClientsUiState(
    val isLoading: Boolean = true,
    val error: String? = null,
    val activeTab: Int = 0, // 0 clients, 1 tickets

    val clients: List<ServiceClientDto> = emptyList(),

    val createName: String = "",
    val createContactName: String = "",
    val createContactEmail: String = "",
    val createContactPhone: String = "",
    val createAddress: String = "",
    val createCity: String = "",
    val createState: String = "",
    val createCountry: String = "",
    val createAccountCode: String = "",
    val createPortalEmail: String = "",
    val createPortalPassword: String = "",
    val createIsActive: Boolean = true,
    val createLogoUri: Uri? = null,
    val createMessage: String? = null,
    val createSubmitting: Boolean = false,

    val editingId: Long? = null,
    val editName: String = "",
    val editContactName: String = "",
    val editContactEmail: String = "",
    val editContactPhone: String = "",
    val editAddress: String = "",
    val editCity: String = "",
    val editState: String = "",
    val editCountry: String = "",
    val editAccountCode: String = "",
    val editPortalEmail: String = "",
    val editPortalPassword: String = "",
    val editIsActive: Boolean = true,
    val editLogoUri: Uri? = null,
    val editMessage: String? = null,
    val editSubmitting: Boolean = false,

    val activities: List<ActivityDetailedDto> = emptyList(),
    val inventories: List<InventorySnapshotDto> = emptyList(),
    val expandedClientId: Long? = null,
    val submitting: Boolean = false,
    val feedbackFilter: String = "all", // all|with|without
    val panelMode: String = "tickets", // tickets|inventories
    val branchFilter: String = "all",
    val inventoryStatusFilter: String = "all",
)

class ConsoleClientsViewModel(app: Application) : AndroidViewModel(app) {
    private val repo = ConsoleRepository(app.applicationContext)
    private val _state = MutableStateFlow(ConsoleClientsUiState())
    val state: StateFlow<ConsoleClientsUiState> = _state
    private var activeDataTab: Int = 0

    init {
        refreshOnModels(
            models = setOf(
                "ServiceClient",
                "ServiceClientBranch",
                "Activity",
                "ClientTicketRequest",
                "InventorySnapshot",
                "InventoryItem",
            ),
            refresh = {
                if (activeDataTab == 0) refreshAll() else refreshTicketsData()
            },
        )
    }

    fun setTab(i: Int) = _state.update { it.copy(activeTab = i) }
    fun setExpandedClient(id: Long?) = _state.update { it.copy(expandedClientId = id) }
    fun setPanelMode(v: String) = _state.update { it.copy(panelMode = v) }
    fun setFeedbackFilter(v: String) = _state.update { it.copy(feedbackFilter = v) }
    fun setBranchFilter(v: String) = _state.update { it.copy(branchFilter = v) }
    fun setInventoryStatusFilter(v: String) = _state.update { it.copy(inventoryStatusFilter = v) }

    fun setCreateField(key: String, value: Any?) {
        _state.update {
            when (key) {
                "name" -> it.copy(createName = value as String)
                "contactName" -> it.copy(createContactName = value as String)
                "contactEmail" -> it.copy(createContactEmail = value as String)
                "contactPhone" -> it.copy(createContactPhone = value as String)
                "address" -> it.copy(createAddress = value as String)
                "city" -> it.copy(createCity = value as String)
                "state" -> it.copy(createState = value as String)
                "country" -> it.copy(createCountry = value as String)
                "accountCode" -> it.copy(createAccountCode = value as String)
                "portalEmail" -> it.copy(createPortalEmail = value as String)
                "portalPassword" -> it.copy(createPortalPassword = value as String)
                "isActive" -> it.copy(createIsActive = value as Boolean)
                "logoUri" -> it.copy(createLogoUri = value as Uri?)
                else -> it
            }
        }
    }

    fun setEditField(key: String, value: Any?) {
        _state.update {
            when (key) {
                "name" -> it.copy(editName = value as String)
                "contactName" -> it.copy(editContactName = value as String)
                "contactEmail" -> it.copy(editContactEmail = value as String)
                "contactPhone" -> it.copy(editContactPhone = value as String)
                "address" -> it.copy(editAddress = value as String)
                "city" -> it.copy(editCity = value as String)
                "state" -> it.copy(editState = value as String)
                "country" -> it.copy(editCountry = value as String)
                "accountCode" -> it.copy(editAccountCode = value as String)
                "portalEmail" -> it.copy(editPortalEmail = value as String)
                "portalPassword" -> it.copy(editPortalPassword = value as String)
                "isActive" -> it.copy(editIsActive = value as Boolean)
                "logoUri" -> it.copy(editLogoUri = value as Uri?)
                else -> it
            }
        }
    }

    fun refreshAll() {
        activeDataTab = 0
        _state.update { it.copy(isLoading = true, error = null) }
        viewModelScope.launch {
            try {
                val clients = withContext(Dispatchers.IO) { repo.serviceClients() }
                _state.update { it.copy(isLoading = false, clients = clients, error = null) }
            } catch (e: Exception) {
                _state.update { it.copy(isLoading = false, error = e.message ?: "No se pudo cargar clientes") }
            }
        }
    }

    fun refreshTicketsData() {
        activeDataTab = 1
        _state.update { it.copy(isLoading = true, error = null) }
        viewModelScope.launch {
            try {
                val result = withContext(Dispatchers.IO) {
                    val c = async { repo.serviceClients() }
                    val a = async { repo.activitiesDetailed() }
                    val i = async { repo.inventories() }
                    Triple(c.await(), a.await(), i.await())
                }
                _state.update {
                    it.copy(
                        isLoading = false,
                        clients = result.first,
                        activities = result.second,
                        inventories = result.third,
                        error = null,
                    )
                }
            } catch (e: Exception) {
                _state.update { it.copy(isLoading = false, error = e.message ?: "No se pudo cargar tickets") }
            }
        }
    }

    fun startEdit(client: ServiceClientDto) {
        _state.update {
            it.copy(
                editingId = client.id,
                editMessage = null,
                editLogoUri = null,
                editName = client.name ?: client.nombre ?: "",
                editContactName = client.contactName ?: client.contacto ?: "",
                editContactEmail = client.contactEmail ?: client.email ?: "",
                editContactPhone = client.contactPhone ?: client.telefono ?: "",
                editAddress = client.address ?: client.direccion ?: "",
                editCity = client.city ?: "",
                editState = client.state ?: "",
                editCountry = client.country ?: "",
                editAccountCode = client.accountCode ?: "",
                editPortalEmail = client.portalEmail ?: "",
                editPortalPassword = "",
                editIsActive = client.isActive ?: (client.activo != false),
            )
        }
    }

    fun cancelEdit() = _state.update { it.copy(editingId = null, editMessage = null, editLogoUri = null) }

    fun create(context: Context) {
        val s = _state.value
        if (s.createName.isBlank()) {
            _state.update { it.copy(createMessage = "Nombre del cliente es requerido") }
            return
        }
        _state.update { it.copy(createSubmitting = true, createMessage = null) }
        viewModelScope.launch {
            try {
                val logoBytes = s.createLogoUri?.let { uri -> context.readBytes(uri) }
                val resp = withContext(Dispatchers.IO) {
                    repo.createServiceClient(
                        name = s.createName.trim(),
                        contactName = s.createContactName,
                        contactEmail = s.createContactEmail,
                        contactPhone = s.createContactPhone,
                        address = s.createAddress,
                        city = s.createCity,
                        state = s.createState,
                        country = s.createCountry,
                        accountCode = s.createAccountCode,
                        portalEmail = s.createPortalEmail,
                        portalPassword = s.createPortalPassword,
                        isActive = s.createIsActive,
                        logoBytes = logoBytes,
                        logoFilename = "logo_${Instant.now().epochSecond}.jpg",
                    )
                }
                val creds = resp.credentials
                val msg = buildString {
                    append("Cliente creado exitosamente")
                    if (!creds?.email.isNullOrBlank() || !creds?.password.isNullOrBlank()) {
                        append(". ")
                        if (!creds?.email.isNullOrBlank()) append("Email: ${creds?.email}")
                        if (!creds?.password.isNullOrBlank()) append(" | Password: ${creds?.password}")
                    }
                }
                _state.update {
                    it.copy(
                        createSubmitting = false,
                        createMessage = msg,
                        createName = "",
                        createContactName = "",
                        createContactEmail = "",
                        createContactPhone = "",
                        createAddress = "",
                        createCity = "",
                        createState = "",
                        createCountry = "",
                        createAccountCode = "",
                        createPortalEmail = "",
                        createPortalPassword = "",
                        createIsActive = true,
                        createLogoUri = null,
                    )
                }
                refreshAll()
            } catch (e: Exception) {
                _state.update { it.copy(createSubmitting = false, createMessage = e.message ?: "No se pudo crear el cliente") }
            }
        }
    }

    fun saveEdit(context: Context) {
        val s = _state.value
        val id = s.editingId ?: return
        if (s.editName.isBlank()) {
            _state.update { it.copy(editMessage = "Nombre del cliente es requerido") }
            return
        }
        _state.update { it.copy(editSubmitting = true, editMessage = null) }
        viewModelScope.launch {
            try {
                val logoBytes = s.editLogoUri?.let { uri -> context.readBytes(uri) }
                withContext(Dispatchers.IO) {
                    repo.updateServiceClient(
                        clientId = id,
                        name = s.editName.trim(),
                        contactName = s.editContactName,
                        contactEmail = s.editContactEmail,
                        contactPhone = s.editContactPhone,
                        address = s.editAddress,
                        city = s.editCity,
                        state = s.editState,
                        country = s.editCountry,
                        accountCode = s.editAccountCode,
                        portalEmail = s.editPortalEmail,
                        portalPassword = s.editPortalPassword,
                        isActive = s.editIsActive,
                        logoBytes = logoBytes,
                        logoFilename = "logo_${id}.jpg",
                    )
                }
                _state.update { it.copy(editSubmitting = false, editMessage = "Cliente actualizado", editingId = null, editLogoUri = null) }
                refreshAll()
            } catch (e: Exception) {
                _state.update { it.copy(editSubmitting = false, editMessage = e.message ?: "No se pudo actualizar el cliente") }
            }
        }
    }

    fun downloadClientReport(context: Context, clientId: Long) {
        if (_state.value.submitting) return
        _state.update { it.copy(submitting = true, error = null) }
        viewModelScope.launch {
            try {
                val bytes = withContext(Dispatchers.IO) { repo.serviceClientReportPdf(clientId).bytes() }
                val file = savePdfToCache(context, "reporte-cliente-$clientId.pdf", bytes)
                openPdfFile(context, file)
                _state.update { it.copy(submitting = false) }
            } catch (e: Exception) {
                _state.update { it.copy(submitting = false, error = e.message ?: "No se pudo descargar PDF") }
            }
        }
    }

    fun downloadTicketReport(context: Context, activityId: Long) {
        if (_state.value.submitting) return
        _state.update { it.copy(submitting = true, error = null) }
        viewModelScope.launch {
            try {
                val bytes = withContext(Dispatchers.IO) { repo.adminTicketReportPdf(activityId).bytes() }
                val file = savePdfToCache(context, "reporte-ticket-$activityId.pdf", bytes)
                openPdfFile(context, file)
                _state.update { it.copy(submitting = false) }
            } catch (e: Exception) {
                _state.update { it.copy(submitting = false, error = e.message ?: "No se pudo descargar reporte") }
            }
        }
    }

    fun downloadInventoryReport(context: Context, inventoryId: Long) {
        if (_state.value.submitting) return
        _state.update { it.copy(submitting = true, error = null) }
        viewModelScope.launch {
            try {
                val bytes = withContext(Dispatchers.IO) { repo.inventoryReportPdf(inventoryId).bytes() }
                val file = savePdfToCache(context, "inventario-$inventoryId.pdf", bytes)
                openPdfFile(context, file)
                _state.update { it.copy(submitting = false) }
            } catch (e: Exception) {
                _state.update { it.copy(submitting = false, error = e.message ?: "No se pudo descargar inventario") }
            }
        }
    }

    fun patchInventoryStatus(inventoryId: Long, status: String) {
        if (_state.value.submitting) return
        _state.update { it.copy(submitting = true, error = null) }
        viewModelScope.launch {
            try {
                withContext(Dispatchers.IO) { repo.inventoryPatchStatus(inventoryId, status) }
                _state.update { it.copy(submitting = false) }
                refreshTicketsData()
            } catch (e: Exception) {
                _state.update { it.copy(submitting = false, error = e.message ?: "No se pudo actualizar estatus") }
            }
        }
    }

    fun openAssetAuthed(context: Context, urlOrPath: String, preferredFilename: String? = null) {
        if (_state.value.submitting) return
        _state.update { it.copy(submitting = true, error = null) }
        viewModelScope.launch {
            try {
                val file = withContext(Dispatchers.IO) { downloadAuthedToCache(context, urlOrPath, preferredFilename) }
                openFile(context, file)
                _state.update { it.copy(submitting = false) }
            } catch (_: Exception) {
                openExternalUrl(context, toAbsoluteAssetUrl(urlOrPath))
                _state.update { it.copy(submitting = false) }
            }
        }
    }
}

@Composable
fun ConsoleClientsScreen(
    contentPadding: PaddingValues = PaddingValues(16.dp),
) {
    val context = LocalContext.current
    val vm: ConsoleClientsViewModel = viewModel()
    val state by vm.state.collectAsState()

    LaunchedEffect(Unit) {
        vm.refreshAll()
    }

    val logoPickerCreate = rememberLauncherForActivityResult(ActivityResultContracts.GetContent()) { uri ->
        vm.setCreateField("logoUri", uri)
    }
    val logoPickerEdit = rememberLauncherForActivityResult(ActivityResultContracts.GetContent()) { uri ->
        vm.setEditField("logoUri", uri)
    }

    Column(
        modifier = Modifier
            .fillMaxSize()
            .padding(contentPadding),
        verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        Text("Clientes corporativos", style = MaterialTheme.typography.titleLarge)

        TabRow(selectedTabIndex = state.activeTab) {
            Tab(selected = state.activeTab == 0, onClick = { vm.setTab(0); vm.refreshAll() }, text = { Text("Clientes") })
            Tab(selected = state.activeTab == 1, onClick = { vm.setTab(1); vm.refreshTicketsData() }, text = { Text("Tickets") })
        }

        if (state.isLoading) {
            Text("Cargando...", color = MaterialTheme.colorScheme.onSurfaceVariant)
            return@Column
        }
        if (!state.error.isNullOrBlank()) {
            Text(state.error!!, color = MaterialTheme.colorScheme.error)
        }

        if (state.activeTab == 0) {
            // Create
            Card(colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface)) {
                Column(modifier = Modifier.padding(12.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
                    Text("Crear nuevo cliente", style = MaterialTheme.typography.titleMedium)
                    OutlinedTextField(state.createName, { vm.setCreateField("name", it) }, label = { Text("Nombre *") }, modifier = Modifier.fillMaxWidth())
                    OutlinedTextField(state.createContactName, { vm.setCreateField("contactName", it) }, label = { Text("Contacto") }, modifier = Modifier.fillMaxWidth())
                    OutlinedTextField(state.createContactEmail, { vm.setCreateField("contactEmail", it) }, label = { Text("Email contacto") }, modifier = Modifier.fillMaxWidth())
                    OutlinedTextField(state.createContactPhone, { vm.setCreateField("contactPhone", it) }, label = { Text("Teléfono") }, modifier = Modifier.fillMaxWidth())
                    OutlinedTextField(state.createAddress, { vm.setCreateField("address", it) }, label = { Text("Dirección") }, modifier = Modifier.fillMaxWidth())
                    OutlinedTextField(state.createCity, { vm.setCreateField("city", it) }, label = { Text("Ciudad") }, modifier = Modifier.fillMaxWidth())
                    OutlinedTextField(state.createState, { vm.setCreateField("state", it) }, label = { Text("Estado") }, modifier = Modifier.fillMaxWidth())
                    OutlinedTextField(state.createCountry, { vm.setCreateField("country", it) }, label = { Text("País") }, modifier = Modifier.fillMaxWidth())
                    OutlinedTextField(state.createAccountCode, { vm.setCreateField("accountCode", it) }, label = { Text("Código de cuenta") }, modifier = Modifier.fillMaxWidth())
                    OutlinedTextField(state.createPortalEmail, { vm.setCreateField("portalEmail", it) }, label = { Text("Email portal") }, modifier = Modifier.fillMaxWidth())
                    OutlinedTextField(state.createPortalPassword, { vm.setCreateField("portalPassword", it) }, label = { Text("Password portal") }, modifier = Modifier.fillMaxWidth())
                    Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                        Button(onClick = { vm.setCreateField("isActive", !state.createIsActive) }) { Text(if (state.createIsActive) "Activo" else "Inactivo") }
                        Button(onClick = { logoPickerCreate.launch("image/*") }) { Text(state.createLogoUri?.let { "Logo ✓" } ?: "Seleccionar logo") }
                    }
                    Button(onClick = { vm.create(context) }, enabled = !state.createSubmitting) {
                        Text(if (state.createSubmitting) "Creando..." else "Crear cliente")
                    }
                    if (!state.createMessage.isNullOrBlank()) {
                        Text(state.createMessage!!, color = MaterialTheme.colorScheme.onSurfaceVariant)
                    }
                }
            }

            // Edit
            if (state.editingId != null) {
                Card(colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface)) {
                    Column(modifier = Modifier.padding(12.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
                        Text("Editar cliente #${state.editingId}", style = MaterialTheme.typography.titleMedium)
                        OutlinedTextField(state.editName, { vm.setEditField("name", it) }, label = { Text("Nombre *") }, modifier = Modifier.fillMaxWidth())
                        OutlinedTextField(state.editContactName, { vm.setEditField("contactName", it) }, label = { Text("Contacto") }, modifier = Modifier.fillMaxWidth())
                        OutlinedTextField(state.editContactEmail, { vm.setEditField("contactEmail", it) }, label = { Text("Email contacto") }, modifier = Modifier.fillMaxWidth())
                        OutlinedTextField(state.editContactPhone, { vm.setEditField("contactPhone", it) }, label = { Text("Teléfono") }, modifier = Modifier.fillMaxWidth())
                        OutlinedTextField(state.editAddress, { vm.setEditField("address", it) }, label = { Text("Dirección") }, modifier = Modifier.fillMaxWidth())
                        OutlinedTextField(state.editCity, { vm.setEditField("city", it) }, label = { Text("Ciudad") }, modifier = Modifier.fillMaxWidth())
                        OutlinedTextField(state.editState, { vm.setEditField("state", it) }, label = { Text("Estado") }, modifier = Modifier.fillMaxWidth())
                        OutlinedTextField(state.editCountry, { vm.setEditField("country", it) }, label = { Text("País") }, modifier = Modifier.fillMaxWidth())
                        OutlinedTextField(state.editAccountCode, { vm.setEditField("accountCode", it) }, label = { Text("Código de cuenta") }, modifier = Modifier.fillMaxWidth())
                        OutlinedTextField(state.editPortalEmail, { vm.setEditField("portalEmail", it) }, label = { Text("Email portal") }, modifier = Modifier.fillMaxWidth())
                        OutlinedTextField(state.editPortalPassword, { vm.setEditField("portalPassword", it) }, label = { Text("Password portal (opcional)") }, modifier = Modifier.fillMaxWidth())
                        Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                            Button(onClick = { vm.setEditField("isActive", !state.editIsActive) }) { Text(if (state.editIsActive) "Activo" else "Inactivo") }
                            Button(onClick = { logoPickerEdit.launch("image/*") }) { Text(state.editLogoUri?.let { "Logo nuevo ✓" } ?: "Cambiar logo") }
                        }
                        Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                            Button(onClick = { vm.cancelEdit() }) { Text("Cancelar") }
                            Button(onClick = { vm.saveEdit(context) }, enabled = !state.editSubmitting) {
                                Text(if (state.editSubmitting) "Guardando..." else "Guardar")
                            }
                        }
                        if (!state.editMessage.isNullOrBlank()) {
                            Text(state.editMessage!!, color = MaterialTheme.colorScheme.onSurfaceVariant)
                        }
                    }
                }
            }

            // List
            Card(colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface)) {
                Column(modifier = Modifier.padding(12.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
                    Text("Clientes registrados", style = MaterialTheme.typography.titleMedium)
                    if (state.clients.isEmpty()) {
                        Text("No hay clientes registrados", color = MaterialTheme.colorScheme.onSurfaceVariant)
                    }
                    state.clients.take(200).forEach { c ->
                        Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                            Column(modifier = Modifier.weight(1f)) {
                                Text(c.name ?: c.nombre ?: "—", style = MaterialTheme.typography.titleSmall)
                                Text(c.contactEmail ?: c.email ?: "—", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                            }
                            Button(onClick = { vm.startEdit(c) }) { Text("Editar") }
                        }
                    }
                }
            }
        } else {
            // Tickets panel
            Row(horizontalArrangement = Arrangement.spacedBy(10.dp), modifier = Modifier.fillMaxWidth()) {
                Button(onClick = { vm.setPanelMode("tickets") }) { Text("Tickets") }
                Button(onClick = { vm.setPanelMode("inventories") }) { Text("Inventarios") }
            }

            if (state.panelMode == "tickets") {
                Row(horizontalArrangement = Arrangement.spacedBy(10.dp), modifier = Modifier.fillMaxWidth()) {
                    Button(onClick = { vm.setFeedbackFilter("all") }) { Text("Todas") }
                    Button(onClick = { vm.setFeedbackFilter("with") }) { Text("Con encuesta") }
                    Button(onClick = { vm.setFeedbackFilter("without") }) { Text("Sin encuesta") }
                }
            }

            val clients = state.clients
            val activities = state.activities
            val inventories = state.inventories

            val groupedActivities = remember(activities) {
                activities.groupBy { it.client?.id ?: -1L }.filterKeys { it != -1L }
            }

            val branches = remember(inventories) {
                inventories.mapNotNull { inv ->
                    val id = inv.branch?.id ?: return@mapNotNull null
                    (id.toString() to (inv.branch?.name ?: "-"))
                }.distinctBy { it.first }
            }

            var filterMenu by remember { mutableStateOf(false) }
            if (state.panelMode == "inventories") {
                Button(onClick = { filterMenu = true }, modifier = Modifier.fillMaxWidth()) {
                    Text("Filtros: sucursal=${state.branchFilter} · estatus=${state.inventoryStatusFilter}")
                }
                DropdownMenu(expanded = filterMenu, onDismissRequest = { filterMenu = false }) {
                    DropdownMenuItem(text = { Text("Sucursal: Todas") }, onClick = { vm.setBranchFilter("all"); filterMenu = false })
                    branches.take(30).forEach { (id, name) ->
                        DropdownMenuItem(text = { Text("Sucursal: $name") }, onClick = { vm.setBranchFilter(id); filterMenu = false })
                    }
                    DropdownMenuItem(text = { Text("Estatus: Todos") }, onClick = { vm.setInventoryStatusFilter("all"); filterMenu = false })
                    listOf("PENDING", "COMPLETED", "APPROVED", "REJECTED").forEach { st ->
                        DropdownMenuItem(text = { Text("Estatus: $st") }, onClick = { vm.setInventoryStatusFilter(st); filterMenu = false })
                    }
                }
            }

            LazyColumn(verticalArrangement = Arrangement.spacedBy(10.dp), modifier = Modifier.fillMaxWidth()) {
                items(clients.take(200)) { client ->
                    val clientId = client.id
                    val clientActivities = groupedActivities[clientId] ?: emptyList()
                    val filteredActivities = clientActivities.filter { a ->
                        when (state.feedbackFilter) {
                            "with" -> a.clientFeedback != null
                            "without" -> a.clientFeedback == null
                            else -> true
                        }
                    }

                    val closed = clientActivities.filter { (it.estatus ?: "").equals("Finalizada", ignoreCase = true) }
                    val avgDurationMin = run {
                        val durations = closed.mapNotNull { act ->
                            val start = act.fechaInicio ?: act.fechaAsignacion
                            val end = act.fechaFinalizacion
                            if (start.isNullOrBlank() || end.isNullOrBlank()) return@mapNotNull null
                            runCatching {
                                val startDt = OffsetDateTime.parse(start)
                                val endDt = OffsetDateTime.parse(end)
                                kotlin.math.round((endDt.toInstant().toEpochMilli() - startDt.toInstant().toEpochMilli()).toDouble() / 60000.0).toLong()
                            }.getOrNull()
                        }
                        if (durations.isEmpty()) null else (durations.sum() / durations.size)
                    }
                    val ratings = clientActivities.mapNotNull { it.clientFeedback?.rating?.toDouble() }
                    val avgRating = if (ratings.isEmpty()) null else (kotlin.math.round((ratings.sum() / ratings.size) * 10.0) / 10.0)

                    val clientInventories = inventories.filter { inv ->
                        if (inv.client?.id != clientId) return@filter false
                        if (state.branchFilter != "all" && (inv.branch?.id?.toString() ?: "") != state.branchFilter) return@filter false
                        if (state.inventoryStatusFilter == "all") return@filter true
                        (inv.status ?: "").uppercase(Locale.getDefault()) == state.inventoryStatusFilter
                    }

                    Card(colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface)) {
                        Column(modifier = Modifier.padding(12.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                            Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                                Column(modifier = Modifier.weight(1f)) {
                                    Row(horizontalArrangement = Arrangement.spacedBy(10.dp), modifier = Modifier.fillMaxWidth()) {
                                        val logoUrl = toAbsoluteAssetUrl(client.logoUrl ?: client.logo)
                                        if (logoUrl.isNotBlank()) {
                                            AsyncImage(
                                                model = logoUrl,
                                                contentDescription = "logo",
                                                modifier = Modifier.height(44.dp),
                                            )
                                        }
                                        Column(modifier = Modifier.weight(1f)) {
                                            Text(client.name ?: client.nombre ?: "—", style = MaterialTheme.typography.titleMedium)
                                            Text(client.contactName ?: client.contacto ?: "Sin contacto", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                                        }
                                    }
                                    Text(
                                        "Tickets: ${clientActivities.size} · Mostrando: ${filteredActivities.size} · Finalizados: ${closed.size}",
                                        style = MaterialTheme.typography.bodySmall,
                                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                                    )
                                    Text(
                                        "Promedio: ${avgDurationMin?.let { "${it} min" } ?: "-"} · Calificación prom: ${avgRating ?: "-"}",
                                        style = MaterialTheme.typography.bodySmall,
                                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                                    )
                                }
                                Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
                                    Button(onClick = { vm.downloadClientReport(context, clientId) }, enabled = !state.submitting) { Text("PDF") }
                                    Button(onClick = { vm.setExpandedClient(if (state.expandedClientId == clientId) null else clientId) }) {
                                        Text(if (state.expandedClientId == clientId) "Ocultar" else "Ver")
                                    }
                                }
                            }

                            if (state.expandedClientId == clientId) {
                                if (state.panelMode == "tickets") {
                                    if (filteredActivities.isEmpty()) {
                                        Text("No hay tickets registrados.", color = MaterialTheme.colorScheme.onSurfaceVariant)
                                    }
                                    filteredActivities.take(40).forEach { a ->
                                        Card(colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surfaceVariant)) {
                                            Column(modifier = Modifier.padding(10.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                                                Text("${a.anNumber ?: "-"} · ${a.titulo ?: "Ticket"}", style = MaterialTheme.typography.titleSmall)
                                                Text(a.estatus ?: "-", color = MaterialTheme.colorScheme.onSurfaceVariant)
                                                Text("${a.branchName ?: "-"} · ${a.branchCity ?: "-"} ${a.branchState ?: ""}", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                                                Text(
                                                    "Inicio: ${formatDateTime(a.fechaInicio ?: a.fechaAsignacion)} · Cierre: ${formatDateTime(a.fechaFinalizacion)} · Duración: ${formatDurationMinutes(a.fechaInicio ?: a.fechaAsignacion, a.fechaFinalizacion)}",
                                                    style = MaterialTheme.typography.bodySmall,
                                                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                                                )
                                                if (a.clientFeedback != null) {
                                                    Text("Encuesta: ${a.clientFeedback.rating ?: "-"}", color = MaterialTheme.colorScheme.onSurfaceVariant)
                                                    Text(
                                                        "Llego a tiempo: ${formatAnswer(a.clientFeedback.wasOnTime)} · Atención amable: ${formatAnswer(a.clientFeedback.wasFriendly)} · Problema resuelto: ${formatAnswer(a.clientFeedback.wasSolved)}",
                                                        style = MaterialTheme.typography.bodySmall,
                                                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                                                    )
                                                    if (!a.clientFeedback.comments.isNullOrBlank()) {
                                                        Text("Comentarios: ${a.clientFeedback.comments}", style = MaterialTheme.typography.bodySmall)
                                                    }
                                                }
                                                Row(horizontalArrangement = Arrangement.spacedBy(8.dp), modifier = Modifier.fillMaxWidth()) {
                                                    Button(onClick = { vm.downloadTicketReport(context, a.id) }, enabled = !state.submitting) { Text("Reporte") }
                                                    val sheet = a.serviceSheet?.pdfUrl
                                                    if (!sheet.isNullOrBlank()) {
                                                        Button(
                                                            onClick = { vm.openAssetAuthed(context, sheet, "hoja-servicio-${a.id}.pdf") },
                                                            enabled = !state.submitting,
                                                        ) { Text("Hoja") }
                                                    }
                                                }
                                                val evidences = a.evidencias ?: emptyList()
                                                if (evidences.isNotEmpty()) {
                                                    Text("Evidencias (${evidences.size})", style = MaterialTheme.typography.labelLarge)
                                                    evidences.take(6).forEach { ev ->
                                                        Row(horizontalArrangement = Arrangement.spacedBy(8.dp), modifier = Modifier.fillMaxWidth()) {
                                                            Text(ev.tipoEvidencia ?: "Evidencia", modifier = Modifier.weight(1f))
                                                            Button(
                                                                onClick = { vm.openAssetAuthed(context, ev.archivoUrl, "evidencia-${ev.id}") },
                                                                enabled = !state.submitting,
                                                            ) { Text("Abrir") }
                                                            if (ev.latitud != null && ev.longitud != null) {
                                                                Button(
                                                                    onClick = {
                                                                        openExternalUrl(
                                                                            context,
                                                                            "https://www.google.com/maps?q=${ev.latitud},${ev.longitud}"
                                                                        )
                                                                    }
                                                                ) { Text("Mapa") }
                                                            }
                                                        }
                                                    }
                                                }
                                            }
                                        }
                                    }
                                } else {
                                    if (clientInventories.isEmpty()) {
                                        Text("No hay inventarios registrados para este cliente.", color = MaterialTheme.colorScheme.onSurfaceVariant)
                                    }
                                    clientInventories.take(30).forEach { inv ->
                                        Card(colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surfaceVariant)) {
                                            Column(modifier = Modifier.padding(10.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                                                Text("INV-${inv.id} · ${inv.branch?.name ?: "-"} (${inv.branch?.branchNumber ?: "-"})", style = MaterialTheme.typography.titleSmall)
                                                Text("Estatus: ${inv.status ?: "-"}", color = MaterialTheme.colorScheme.onSurfaceVariant)
                                                Text(
                                                    "Previos: ${inv.previousCount ?: 0} · Actuales: ${inv.currentCount ?: 0} · Δ ${inv.deltaCount ?: 0}",
                                                    style = MaterialTheme.typography.bodySmall,
                                                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                                                )
                                                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                                                    Button(onClick = { vm.downloadInventoryReport(context, inv.id) }, enabled = !state.submitting) { Text("PDF") }
                                                }
                                                Spacer(Modifier.height(2.dp))
                                                Row(horizontalArrangement = Arrangement.spacedBy(8.dp), modifier = Modifier.fillMaxWidth()) {
                                                    Button(onClick = { vm.patchInventoryStatus(inv.id, "PENDING") }, enabled = !state.submitting) { Text("Pend.") }
                                                    Button(onClick = { vm.patchInventoryStatus(inv.id, "COMPLETED") }, enabled = !state.submitting) { Text("Real.") }
                                                    Button(onClick = { vm.patchInventoryStatus(inv.id, "APPROVED") }, enabled = !state.submitting) { Text("Aprobar") }
                                                    Button(onClick = { vm.patchInventoryStatus(inv.id, "REJECTED") }, enabled = !state.submitting) { Text("Rech.") }
                                                }
                                            }
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }
    }
}

