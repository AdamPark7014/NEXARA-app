package mx.nexara.mobile.nativeapp.ui.ventas

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
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.Search
import androidx.compose.material.icons.filled.Clear
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.ExtendedFloatingActionButton
import androidx.compose.material3.FilterChip
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.SnackbarDuration
import androidx.compose.material3.SnackbarResult
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.pulltorefresh.PullToRefreshBox
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.derivedStateOf
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.KeyboardType
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
import mx.nexara.mobile.nativeapp.data.api.CrmLeadDto
import mx.nexara.mobile.nativeapp.data.api.ProcParse
import mx.nexara.mobile.nativeapp.data.crm.CrmRepository
import mx.nexara.mobile.nativeapp.ui.enterprise.NxColors
import mx.nexara.mobile.nativeapp.ui.enterprise.NxEmptyState
import mx.nexara.mobile.nativeapp.ui.enterprise.NxFormTextField
import mx.nexara.mobile.nativeapp.ui.enterprise.NxLoadingBlock
import mx.nexara.mobile.nativeapp.ui.enterprise.NxPanelShell
import mx.nexara.mobile.nativeapp.ui.enterprise.NxSearchField
import mx.nexara.mobile.nativeapp.ui.enterprise.NxSectionHeader
import mx.nexara.mobile.nativeapp.ui.enterprise.NxSnackbarHost
import mx.nexara.mobile.nativeapp.ui.enterprise.emailFieldError
import mx.nexara.mobile.nativeapp.ui.enterprise.numericFieldError
import mx.nexara.mobile.nativeapp.ui.enterprise.rememberNxSnackbarHostState
import mx.nexara.mobile.nativeapp.ui.enterprise.requiredFieldError

private val LEAD_STATUSES = listOf("NEW", "CONTACTED", "QUALIFIED", "CONVERTED", "LOST")

class VentasLeadsFullViewModel(app: Application) : AndroidViewModel(app) {
    private val repo = CrmRepository(app.applicationContext)
    private val _state = MutableStateFlow(VentasLeadsUiState())
    val state: StateFlow<VentasLeadsUiState> = _state

    init { load() }

    fun load(refresh: Boolean = false) {
        viewModelScope.launch {
            _state.update {
                if (refresh) it.copy(isRefreshing = true) else it.copy(isLoading = true)
            }
            val items = withContext(Dispatchers.IO) { runCatching { repo.leadDtos() }.getOrDefault(emptyList()) }
            _state.update { it.copy(isLoading = false, isRefreshing = false, items = items) }
        }
    }

    fun setQuery(q: String) = _state.update { it.copy(query = q) }

    val filtered: List<CrmLeadDto>
        get() {
            val s = _state.value
            if (s.query.isBlank()) return s.items
            val q = s.query.lowercase()
            return s.items.filter {
                it.displayTitle.lowercase().contains(q) ||
                    it.clientName.lowercase().contains(q) ||
                    it.status.lowercase().contains(q)
            }
        }

    suspend fun createLead(name: String, company: String, email: String, phone: String, source: String, notes: String) {
        withContext(Dispatchers.IO) {
            repo.createLead(
                mapOf(
                    "name" to name,
                    "company" to company,
                    "email" to email,
                    "phone" to phone,
                    "source" to source,
                    "notes" to notes,
                    "status" to "NEW",
                ),
            )
        }
        load()
    }

    suspend fun updateLead(id: Long, fields: Map<String, Any?>) {
        withContext(Dispatchers.IO) { repo.updateLead(id, fields) }
        load()
    }

    suspend fun deleteLead(id: Long) {
        withContext(Dispatchers.IO) { repo.deleteLead(id) }
        load()
    }

    suspend fun convertLead(lead: CrmLeadDto, value: Double, stage: String): Long {
        val oppId = withContext(Dispatchers.IO) {
            val created = repo.convertLeadToOpportunity(lead, value, stage)
            (created["id"] as? Number)?.toLong()
                ?: created["id"]?.toString()?.toLongOrNull()
                ?: throw IllegalStateException("Oportunidad creada sin ID")
        }
        load()
        return oppId
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun VentasLeadsFullScreen(
    onNavigateToOpportunity: (Long) -> Unit = {},
) {
    val ctx = LocalContext.current
    val snackbarHostState = rememberNxSnackbarHostState()
    val vm: VentasLeadsFullViewModel = viewModel(factory = object : androidx.lifecycle.ViewModelProvider.Factory {
        override fun <T : androidx.lifecycle.ViewModel> create(c: Class<T>): T {
            @Suppress("UNCHECKED_CAST")
            return VentasLeadsFullViewModel(ctx.applicationContext as Application) as T
        }
    })
    val state by vm.state.collectAsState()
    val items by remember { derivedStateOf { vm.filtered } }
    var selected by remember { mutableStateOf<CrmLeadDto?>(null) }
    var showCreate by remember { mutableStateOf(false) }
    var showConvert by remember { mutableStateOf(false) }
    val scope = rememberCoroutineScope()

    selected?.let { lead ->
        VentasLeadDetailScreen(
            lead = lead,
            onBack = { selected = null },
            onEdit = { fields ->
                lead.numericId?.let { id ->
                    scope.launch {
                        runCatching { vm.updateLead(id, fields) }
                            .onSuccess {
                                selected = null
                                snackbarHostState.showSnackbar("Lead actualizado")
                            }
                            .onFailure {
                                snackbarHostState.showSnackbar(it.message ?: "Error al actualizar")
                            }
                    }
                }
            },
            onDelete = {
                lead.numericId?.let { id ->
                    scope.launch {
                        runCatching { vm.deleteLead(id) }
                            .onSuccess {
                                selected = null
                                snackbarHostState.showSnackbar("Lead eliminado")
                            }
                            .onFailure {
                                snackbarHostState.showSnackbar(it.message ?: "Error al eliminar")
                            }
                    }
                }
            },
            onConvert = { showConvert = true },
        )
        if (showConvert) {
            ConvertLeadDialog(
                lead = lead,
                onDismiss = { showConvert = false },
                onConfirm = { value, stage ->
                    scope.launch {
                        runCatching { vm.convertLead(lead, value, stage) }
                            .onSuccess { oppId ->
                                showConvert = false
                                selected = null
                                val result = snackbarHostState.showSnackbar(
                                    message = "Lead convertido a oportunidad",
                                    actionLabel = "Ver",
                                    duration = SnackbarDuration.Long,
                                )
                                if (result == SnackbarResult.ActionPerformed) {
                                    onNavigateToOpportunity(oppId)
                                }
                            }
                            .onFailure {
                                snackbarHostState.showSnackbar(it.message ?: "Error al convertir")
                            }
                    }
                },
            )
        }
        return
    }

    Scaffold(
        snackbarHost = { NxSnackbarHost(snackbarHostState) },
        floatingActionButton = {
            ExtendedFloatingActionButton(
                onClick = { showCreate = true },
                icon = { Icon(Icons.Default.Add, contentDescription = "Nuevo lead") },
                text = { Text("Nuevo lead") },
            )
        },
    ) { padding ->
        PullToRefreshBox(
            isRefreshing = state.isRefreshing,
            onRefresh = { vm.load(refresh = true) },
            modifier = Modifier.fillMaxSize().padding(padding),
        ) {
        LazyColumn(
            Modifier.fillMaxSize().background(NxColors.Surface),
            contentPadding = PaddingValues(12.dp),
            verticalArrangement = Arrangement.spacedBy(8.dp),
        ) {
            item { NxSectionHeader("Leads comerciales", "${state.items.size} registrados") }
            item {
                NxSearchField(
                    value = state.query,
                    onValueChange = vm::setQuery,
                    placeholder = "Buscar lead…",
                )
            }
            when {
                state.isLoading && !state.isRefreshing -> item { NxLoadingBlock("Cargando leads…") }
                items.isEmpty() -> item {
                    NxEmptyState(
                        title = "Sin leads",
                        subtitle = if (state.query.isNotBlank()) {
                            "No hay coincidencias para \"${state.query}\". Prueba otro término o limpia el filtro."
                        } else {
                            "Captura el primer lead con el botón Nuevo lead en la esquina inferior."
                        },
                    )
                }
                else -> items(items, key = { it.rowKey }) { lead ->
                    NxPanelShell(onClick = { selected = lead }) {
                        Text(lead.displayTitle, fontWeight = FontWeight.Bold)
                        if (lead.clientName.isNotBlank()) Text(lead.clientName, style = MaterialTheme.typography.bodySmall)
                        Text(lead.status.ifBlank { "NEW" }, color = NxColors.Teal, style = MaterialTheme.typography.labelSmall)
                    }
                }
            }
        }
        }
    }

    if (showCreate) {
        CreateLeadDialog(
            onDismiss = { showCreate = false },
            onSave = { name, company, email, phone, source, notes ->
                scope.launch {
                    runCatching { vm.createLead(name, company, email, phone, source, notes) }
                        .onSuccess {
                            showCreate = false
                            snackbarHostState.showSnackbar("Lead creado")
                        }
                        .onFailure {
                            snackbarHostState.showSnackbar(it.message ?: "Error al crear lead")
                        }
                }
            },
        )
    }
}

@Composable
fun VentasLeadDetailByIdScreen(leadId: Long, onBack: () -> Unit) {
    val ctx = LocalContext.current
    val snackbarHostState = rememberNxSnackbarHostState()
    val scope = rememberCoroutineScope()
    val repo = remember(ctx) { CrmRepository(ctx.applicationContext) }
    var lead by remember { mutableStateOf<CrmLeadDto?>(null) }
    var loading by remember { mutableStateOf(true) }
    var error by remember { mutableStateOf<String?>(null) }

    LaunchedEffect(leadId) {
        loading = true
        error = null
        runCatching {
            withContext(Dispatchers.IO) {
                repo.leadDtos().firstOrNull { it.numericId == leadId || it.id == leadId.toString() }
            }
        }.onSuccess { found ->
            lead = found
            loading = false
            if (found == null) error = "Lead no encontrado"
        }.onFailure {
            error = it.message?.takeIf { m -> m.isNotBlank() } ?: "No se pudo cargar el lead"
            loading = false
        }
    }

    when {
        loading -> NxLoadingBlock()
        lead != null -> {
            val current = lead!!
            Scaffold(snackbarHost = { NxSnackbarHost(snackbarHostState) }) { padding ->
                VentasLeadDetailScreen(
                    lead = current,
                    onBack = onBack,
                    modifier = Modifier.padding(padding),
                    onEdit = { fields ->
                        current.numericId?.let { id ->
                            scope.launch {
                                runCatching { withContext(Dispatchers.IO) { repo.updateLead(id, fields) } }
                                    .onSuccess {
                                        snackbarHostState.showSnackbar("Lead actualizado")
                                        onBack()
                                    }
                                    .onFailure {
                                        snackbarHostState.showSnackbar(it.message ?: "Error al actualizar")
                                    }
                            }
                        }
                    },
                    onDelete = {
                        current.numericId?.let { id ->
                            scope.launch {
                                runCatching { withContext(Dispatchers.IO) { repo.deleteLead(id) } }
                                    .onSuccess {
                                        snackbarHostState.showSnackbar("Lead eliminado")
                                        onBack()
                                    }
                                    .onFailure {
                                        snackbarHostState.showSnackbar(it.message ?: "Error al eliminar")
                                    }
                            }
                        }
                    },
                    onConvert = { },
                )
            }
        }
        else -> Column(Modifier.fillMaxSize().padding(16.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
            OutlinedButton(onClick = onBack) { Text("← Volver") }
            Text(error ?: "Lead no encontrado", color = MaterialTheme.colorScheme.error)
        }
    }
}

@Composable
fun VentasLeadDetailScreen(
    lead: CrmLeadDto,
    onBack: () -> Unit,
    onEdit: (Map<String, Any?>) -> Unit,
    onDelete: () -> Unit,
    onConvert: () -> Unit,
    modifier: Modifier = Modifier,
) {
    var editing by remember { mutableStateOf(false) }
    var name by remember { mutableStateOf(ProcParse.str(lead.raw["name"], lead.displayTitle)) }
    var company by remember { mutableStateOf(ProcParse.str(lead.raw["company"], lead.clientName)) }
    var email by remember { mutableStateOf(ProcParse.str(lead.raw["email"])) }
    var phone by remember { mutableStateOf(ProcParse.str(lead.raw["phone"])) }
    var source by remember { mutableStateOf(ProcParse.str(lead.raw["source"])) }
    var notes by remember { mutableStateOf(ProcParse.str(lead.raw["notes"], lead.description)) }
    var status by remember { mutableStateOf(lead.status.ifBlank { "NEW" }) }

    val nameError = requiredFieldError(name, "Nombre")
    val emailError = emailFieldError(email)
    val canSave = nameError == null && emailError == null

    LazyColumn(
        modifier.fillMaxSize().background(NxColors.Surface),
        contentPadding = PaddingValues(16.dp),
        verticalArrangement = Arrangement.spacedBy(10.dp),
    ) {
        item { OutlinedButton(onClick = onBack) { Text("← Leads") } }
        item { Text(lead.displayTitle, style = MaterialTheme.typography.titleLarge, fontWeight = FontWeight.Bold) }
        if (editing) {
            item {
                NxPanelShell {
                    NxSectionHeader("Datos del lead")
                    NxFormTextField(
                        value = name,
                        onValueChange = { name = it },
                        label = "Nombre *",
                        error = nameError,
                        imeAction = ImeAction.Next,
                    )
                    Spacer(Modifier.height(8.dp))
                    NxFormTextField(
                        value = company,
                        onValueChange = { company = it },
                        label = "Empresa",
                        imeAction = ImeAction.Next,
                    )
                    Spacer(Modifier.height(8.dp))
                    NxFormTextField(
                        value = email,
                        onValueChange = { email = it },
                        label = "Email",
                        error = emailError,
                        keyboardType = KeyboardType.Email,
                        imeAction = ImeAction.Next,
                    )
                    Spacer(Modifier.height(8.dp))
                    NxFormTextField(
                        value = phone,
                        onValueChange = { phone = it },
                        label = "Teléfono",
                        keyboardType = KeyboardType.Phone,
                        imeAction = ImeAction.Next,
                    )
                    Spacer(Modifier.height(8.dp))
                    NxFormTextField(
                        value = source,
                        onValueChange = { source = it },
                        label = "Origen",
                        imeAction = ImeAction.Next,
                    )
                    Spacer(Modifier.height(8.dp))
                    NxFormTextField(
                        value = notes,
                        onValueChange = { notes = it },
                        label = "Notas",
                        singleLine = false,
                        minLines = 2,
                        imeAction = ImeAction.Done,
                    )
                }
            }
            item {
                NxPanelShell {
                    NxSectionHeader("Estado")
                    Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        LEAD_STATUSES.forEach { st ->
                            FilterChip(selected = status == st, onClick = { status = st }, label = { Text(st) })
                        }
                    }
                }
            }
            item {
                Button(
                    onClick = {
                        onEdit(mapOf("name" to name, "company" to company, "email" to email, "phone" to phone, "source" to source, "notes" to notes, "status" to status))
                        editing = false
                    },
                    enabled = canSave,
                    modifier = Modifier.fillMaxWidth(),
                ) { Text("Guardar cambios") }
            }
        } else {
            item {
                NxPanelShell {
                    LeadField("Empresa", company)
                        LeadField("Email", email)
                        LeadField("Teléfono", phone)
                        LeadField("Origen", source)
                        LeadField("Estado", status)
                        LeadField("Notas", notes)
                }
            }
            item {
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    Button(onClick = { editing = true }, modifier = Modifier.weight(1f)) { Text("Editar") }
                    if (status != "CONVERTED") {
                        Button(onClick = onConvert, modifier = Modifier.weight(1f)) { Text("Convertir") }
                    }
                }
            }
            item { OutlinedButton(onClick = onDelete, modifier = Modifier.fillMaxWidth()) { Text("Eliminar lead") } }
        }
    }
}

@Composable
private fun LeadField(label: String, value: String) {
    if (value.isBlank()) return
    Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
        Text(label, fontWeight = FontWeight.Medium)
        Text(value, color = MaterialTheme.colorScheme.onSurfaceVariant)
    }
}

@Composable
private fun CreateLeadDialog(onDismiss: () -> Unit, onSave: (String, String, String, String, String, String) -> Unit) {
    var name by remember { mutableStateOf("") }
    var company by remember { mutableStateOf("") }
    var email by remember { mutableStateOf("") }
    var phone by remember { mutableStateOf("") }
    var source by remember { mutableStateOf("Móvil") }
    var notes by remember { mutableStateOf("") }

    val nameError = requiredFieldError(name, "Nombre")
    val emailError = emailFieldError(email)
    val canSave = nameError == null && emailError == null

    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text("Nuevo lead") },
        text = {
            Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                NxPanelShell {
                    NxSectionHeader("Datos del lead")
                    NxFormTextField(
                        value = name,
                        onValueChange = { name = it },
                        label = "Nombre *",
                        error = nameError,
                        imeAction = ImeAction.Next,
                    )
                    Spacer(Modifier.height(8.dp))
                    NxFormTextField(
                        value = company,
                        onValueChange = { company = it },
                        label = "Empresa",
                        imeAction = ImeAction.Next,
                    )
                    Spacer(Modifier.height(8.dp))
                    NxFormTextField(
                        value = email,
                        onValueChange = { email = it },
                        label = "Email",
                        error = emailError,
                        keyboardType = KeyboardType.Email,
                        imeAction = ImeAction.Next,
                    )
                    Spacer(Modifier.height(8.dp))
                    NxFormTextField(
                        value = phone,
                        onValueChange = { phone = it },
                        label = "Teléfono",
                        keyboardType = KeyboardType.Phone,
                        imeAction = ImeAction.Next,
                    )
                    Spacer(Modifier.height(8.dp))
                    NxFormTextField(
                        value = source,
                        onValueChange = { source = it },
                        label = "Origen",
                        imeAction = ImeAction.Next,
                    )
                    Spacer(Modifier.height(8.dp))
                    NxFormTextField(
                        value = notes,
                        onValueChange = { notes = it },
                        label = "Notas",
                        singleLine = false,
                        minLines = 2,
                        imeAction = ImeAction.Done,
                    )
                }
            }
        },
        confirmButton = {
            Button(
                onClick = { onSave(name, company, email, phone, source, notes) },
                enabled = canSave,
            ) { Text("Crear") }
        },
        dismissButton = { TextButton(onClick = onDismiss) { Text("Cancelar") } },
    )
}

@Composable
private fun ConvertLeadDialog(lead: CrmLeadDto, onDismiss: () -> Unit, onConfirm: (Double, String) -> Unit) {
    var value by remember { mutableStateOf("50000") }
    var stage by remember { mutableStateOf("DISCOVERY") }
    val valueError = numericFieldError(value, "Valor estimado")
    val canConfirm = valueError == null && value.trim().isNotBlank()
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text("Convertir a oportunidad") },
        text = {
            Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                Text(lead.displayTitle, fontWeight = FontWeight.SemiBold)
                NxPanelShell {
                    NxFormTextField(
                        value = value,
                        onValueChange = { value = it.filter { c -> c.isDigit() || c == '.' } },
                        label = "Valor estimado (MXN) *",
                        error = valueError,
                        keyboardType = KeyboardType.Decimal,
                        imeAction = ImeAction.Done,
                    )
                    Spacer(Modifier.height(8.dp))
                    Text("Etapa inicial", style = MaterialTheme.typography.labelMedium)
                    Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                        OPPORTUNITY_STAGES.take(5).forEach { (id, label) ->
                            FilterChip(selected = stage == id, onClick = { stage = id }, label = { Text(label, maxLines = 1) })
                        }
                    }
                }
            }
        },
        confirmButton = {
            Button(
                onClick = { onConfirm(value.toDoubleOrNull() ?: 50000.0, stage) },
                enabled = canConfirm,
            ) { Text("Crear oportunidad") }
        },
        dismissButton = { TextButton(onClick = onDismiss) { Text("Cancelar") } },
    )
}
