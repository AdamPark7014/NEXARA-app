package mx.nexara.mobile.nativeapp.ui.ventas

import android.app.Application
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.Clear
import androidx.compose.material.icons.filled.Search
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
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
import mx.nexara.mobile.nativeapp.data.crm.CrmRepository
import mx.nexara.mobile.nativeapp.data.extra.ExtraRepository

// ── Shared helpers ────────────────────────────────────────────────────────────

private val CrmGreen = Color(0xFF10B981)

private fun mStr(m: Map<String, Any?>, vararg keys: String): String {
    for (k in keys) {
        val v = m[k] ?: continue
        val s = v.toString()
        if (s.isNotBlank() && s != "null") return s
    }
    return ""
}

private fun mDouble(m: Map<String, Any?>, vararg keys: String): Double? {
    for (k in keys) {
        val v = m[k] ?: continue
        when (v) {
            is Number -> return v.toDouble()
            is String -> v.toDoubleOrNull()?.let { return it }
        }
    }
    return null
}

@Composable
private fun CrmSearchField(query: String, onQuery: (String) -> Unit, placeholder: String) {
    OutlinedTextField(
        value = query,
        onValueChange = onQuery,
        placeholder = { Text(placeholder) },
        leadingIcon = { Icon(Icons.Default.Search, null) },
        trailingIcon = {
            if (query.isNotEmpty()) IconButton({ onQuery("") }) { Icon(Icons.Default.Clear, null) }
        },
        modifier = Modifier.fillMaxWidth(),
        singleLine = true,
    )
}

@Composable
private fun CrmStageChip(text: String) {
    Surface(shape = RoundedCornerShape(999.dp), color = CrmGreen.copy(alpha = 0.12f)) {
        Text(
            text.ifBlank { "—" },
            modifier = Modifier.padding(horizontal = 10.dp, vertical = 4.dp),
            style = MaterialTheme.typography.labelSmall,
            color = CrmGreen,
            fontWeight = FontWeight.SemiBold,
        )
    }
}

// ── Oportunidades ─────────────────────────────────────────────────────────────

data class CrmListUiState(
    val isLoading: Boolean = true,
    val error: String? = null,
    val query: String = "",
    val items: List<Map<String, Any?>> = emptyList(),
    val selected: Map<String, Any?>? = null,
)

class CrmOportunidadesViewModel(app: Application) : AndroidViewModel(app) {
    private val repo = CrmRepository(app.applicationContext)
    private val _state = MutableStateFlow(CrmListUiState())
    val state: StateFlow<CrmListUiState> = _state

    init { refresh() }

    fun refresh() {
        _state.update { it.copy(isLoading = true, error = null) }
        viewModelScope.launch {
            try {
                val list = withContext(Dispatchers.IO) { repo.oportunidades() }
                _state.update { it.copy(isLoading = false, items = list) }
            } catch (e: Exception) {
                _state.update { it.copy(isLoading = false, error = e.message) }
            }
        }
    }

    fun setQuery(q: String) = _state.update { it.copy(query = q) }
    fun select(item: Map<String, Any?>?) = _state.update { it.copy(selected = item) }

    fun createOpportunity(form: OpportunityFormState, onCreated: (Long) -> Unit) {
        viewModelScope.launch {
            try {
                val created = withContext(Dispatchers.IO) { repo.createOpportunity(form.toPayload()) }
                val id = (created["id"] as? Number)?.toLong() ?: created["id"]?.toString()?.toLongOrNull()
                refresh()
                if (id != null) onCreated(id)
            } catch (e: Exception) {
                _state.update { it.copy(error = e.message) }
            }
        }
    }

    val filtered: List<Map<String, Any?>> get() {
        val q = _state.value.query.trim().lowercase()
        if (q.isBlank()) return _state.value.items
        return _state.value.items.filter {
            mStr(it, "title", "name", "titulo").lowercase().contains(q) ||
                mStr(it, "stage", "etapa").lowercase().contains(q)
        }
    }
}

@Composable
fun VentasOportunidadesScreen() {
    val ctx = LocalContext.current
    val vm: CrmOportunidadesViewModel = viewModel(factory = crmVmFactory<CrmOportunidadesViewModel>(ctx))
    val state by vm.state.collectAsState()
    val items by remember { derivedStateOf { vm.filtered } }
    var showCreate by remember { mutableStateOf(false) }
    var createForm by remember { mutableStateOf(OpportunityFormState()) }
    var creating by remember { mutableStateOf(false) }

    if (state.selected != null) {
        val id = mStr(state.selected!!, "id").toLongOrNull()
        if (id != null) {
            VentasOpportunityDetailScreen(oppId = id, onBack = { vm.select(null) })
            return
        }
        CrmDetailScaffold(
            title = mStr(state.selected!!, "title", "name", "titulo"),
            rows = listOf(
                "Etapa" to mStr(state.selected!!, "stage", "etapa", "status"),
                "Valor" to fmtMxnShort(mDouble(state.selected!!, "value", "amount") ?: 0.0),
                "Cliente" to mStr(state.selected!!, "clientName", "cliente"),
            ),
            onBack = { vm.select(null) },
        )
        return
    }

    Scaffold(
        floatingActionButton = {
            FloatingActionButton(
                onClick = { createForm = OpportunityFormState(); showCreate = true },
                containerColor = CrmGreen,
            ) { Icon(Icons.Default.Add, contentDescription = "Nueva oportunidad") }
        },
    ) { padding ->
        Box(Modifier.padding(padding).fillMaxSize()) {
            CrmListScaffold(
                isLoading = state.isLoading,
                error = state.error,
                onRetry = vm::refresh,
                query = state.query,
                onQuery = vm::setQuery,
                placeholder = "Buscar oportunidad…",
                emptyText = "Sin oportunidades",
                items = items,
                key = { mStr(it, "id") },
            ) { item ->
                Card(
                    modifier = Modifier.fillMaxWidth().clickable { vm.select(item) },
                    shape = RoundedCornerShape(12.dp),
                ) {
                    Column(Modifier.padding(14.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                        Text(mStr(item, "title", "name", "titulo").ifBlank { "—" }, fontWeight = FontWeight.SemiBold)
                        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                            CrmStageChip(mStr(item, "stage", "etapa", "status"))
                            Text(fmtMxnShort(mDouble(item, "value", "amount") ?: 0.0), fontWeight = FontWeight.Bold)
                        }
                    }
                }
            }
        }
    }

    if (showCreate) {
        OpportunityFormSheet(
            title = "Nueva oportunidad",
            state = createForm,
            onChange = { createForm = it },
            saving = creating,
            error = state.error,
            onDismiss = { showCreate = false },
            onSave = {
                creating = true
                vm.createOpportunity(createForm) { id ->
                    creating = false
                    showCreate = false
                    vm.select(mapOf("id" to id))
                }
            },
        )
    }
}

// ── Clientes ──────────────────────────────────────────────────────────────────

class CrmClientesViewModel(app: Application) : AndroidViewModel(app) {
    private val repo = CrmRepository(app.applicationContext)
    private val _state = MutableStateFlow(CrmListUiState())
    val state: StateFlow<CrmListUiState> = _state

    init { refresh() }

    fun refresh() {
        _state.update { it.copy(isLoading = true, error = null) }
        viewModelScope.launch {
            try {
                val list = withContext(Dispatchers.IO) { repo.clientes() }
                _state.update { it.copy(isLoading = false, items = list) }
            } catch (e: Exception) {
                _state.update { it.copy(isLoading = false, error = e.message) }
            }
        }
    }

    fun setQuery(q: String) = _state.update { it.copy(query = q) }
    fun select(item: Map<String, Any?>?) = _state.update { it.copy(selected = item) }

    val filtered: List<Map<String, Any?>> get() {
        val q = _state.value.query.trim().lowercase()
        if (q.isBlank()) return _state.value.items
        return _state.value.items.filter {
            mStr(it, "name", "nombre", "razonSocial").lowercase().contains(q)
        }
    }
}

@Composable
fun VentasClientesScreen() {
    val ctx = LocalContext.current
    val vm: CrmClientesViewModel = viewModel(factory = crmVmFactory<CrmClientesViewModel>(ctx))
    val state by vm.state.collectAsState()
    val items by remember { derivedStateOf { vm.filtered } }

    if (state.selected != null) {
        CrmClientDetailScreen(client = state.selected!!, onBack = { vm.select(null) })
        return
    }

    CrmListScaffold(
        isLoading = state.isLoading,
        error = state.error,
        onRetry = vm::refresh,
        query = state.query,
        onQuery = vm::setQuery,
        placeholder = "Buscar cliente…",
        emptyText = "Sin clientes",
        items = items,
        key = { mStr(it, "id") },
    ) { item ->
        Card(
            modifier = Modifier.fillMaxWidth().clickable { vm.select(item) },
            shape = RoundedCornerShape(12.dp),
        ) {
            Column(Modifier.padding(14.dp)) {
                Text(mStr(item, "name", "nombre", "razonSocial"), fontWeight = FontWeight.SemiBold)
                Text(mStr(item, "email", "rfc"), style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
        }
    }
}

// ── Productos ─────────────────────────────────────────────────────────────────

class CrmProductsViewModel(app: Application) : AndroidViewModel(app) {
    private val repo = CrmRepository(app.applicationContext)
    private val _state = MutableStateFlow(CrmListUiState())
    val state: StateFlow<CrmListUiState> = _state

    init { refresh() }

    fun refresh() {
        _state.update { it.copy(isLoading = true, error = null) }
        viewModelScope.launch {
            try {
                val q = _state.value.query.ifBlank { null }
                val list = withContext(Dispatchers.IO) { repo.products(q) }
                _state.update { it.copy(isLoading = false, items = list) }
            } catch (e: Exception) {
                _state.update { it.copy(isLoading = false, error = e.message) }
            }
        }
    }

    fun setQuery(q: String) {
        _state.update { it.copy(query = q) }
        refresh()
    }
}

@Composable
fun VentasProductsScreen() {
    val ctx = LocalContext.current
    val vm: CrmProductsViewModel = viewModel(factory = crmVmFactory<CrmProductsViewModel>(ctx))
    val state by vm.state.collectAsState()

    CrmListScaffold(
        isLoading = state.isLoading,
        error = state.error,
        onRetry = vm::refresh,
        query = state.query,
        onQuery = vm::setQuery,
        placeholder = "Buscar producto…",
        emptyText = "Sin productos",
        items = state.items,
        key = { mStr(it, "id") },
    ) { item ->
        Card(shape = RoundedCornerShape(12.dp), modifier = Modifier.fillMaxWidth()) {
            Row(Modifier.padding(14.dp), verticalAlignment = Alignment.CenterVertically) {
                Column(Modifier.weight(1f)) {
                    Text(mStr(item, "name", "nombre"), fontWeight = FontWeight.SemiBold)
                    Text(mStr(item, "sku", "code"), style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                }
                Text(fmtMxnShort(mDouble(item, "price", "precio") ?: 0.0), fontWeight = FontWeight.Bold)
            }
        }
    }
}

// ── Proyectos comerciales ─────────────────────────────────────────────────────

class CrmProyectosViewModel(app: Application) : AndroidViewModel(app) {
    private val repo = CrmRepository(app.applicationContext)
    private val _state = MutableStateFlow(CrmListUiState())
    val state: StateFlow<CrmListUiState> = _state

    init { refresh() }

    fun refresh() {
        _state.update { it.copy(isLoading = true, error = null) }
        viewModelScope.launch {
            try {
                val list = withContext(Dispatchers.IO) { repo.proyectos() }
                _state.update { it.copy(isLoading = false, items = list) }
            } catch (e: Exception) {
                _state.update { it.copy(isLoading = false, error = e.message) }
            }
        }
    }
}

@Composable
fun VentasProyectosScreen() {
    val ctx = LocalContext.current
    val vm: CrmProyectosViewModel = viewModel(factory = crmVmFactory<CrmProyectosViewModel>(ctx))
    val state by vm.state.collectAsState()
    var selected by remember { mutableStateOf<Map<String, Any?>?>(null) }

    if (selected != null) {
        CrmProjectDetailScreen(project = selected!!, onBack = { selected = null })
        return
    }

    CrmListScaffold(
        isLoading = state.isLoading,
        error = state.error,
        onRetry = vm::refresh,
        query = "",
        onQuery = {},
        placeholder = "",
        emptyText = "Sin proyectos",
        items = state.items,
        key = { mStr(it, "id") },
        showSearch = false,
    ) { item ->
        Card(
            shape = RoundedCornerShape(12.dp),
            modifier = Modifier.fillMaxWidth().clickable { selected = item },
        ) {
            Column(Modifier.padding(14.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                Text(mStr(item, "name", "title", "nombre"), fontWeight = FontWeight.SemiBold)
                Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                    CrmStageChip(mStr(item, "status", "estado"))
                    val client = (item["client"] as? Map<*, *>)?.let { mStr(it as Map<String, Any?>, "name", "nombre") } ?: ""
                    if (client.isNotBlank()) Text(client, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                }
            }
        }
    }
}

@Composable
private fun CrmProjectDetailScreen(project: Map<String, Any?>, onBack: () -> Unit) {
    val ctx = LocalContext.current
    var tab by remember { mutableIntStateOf(0) }
    val tabs = listOf("Info", "Costos", "Orden")

    Column(Modifier.fillMaxSize()) {
        OutlinedButton(onClick = onBack, modifier = Modifier.padding(12.dp)) { Text("← Volver") }
        Text(
            mStr(project, "name", "title", "nombre").ifBlank { "Proyecto" },
            style = MaterialTheme.typography.titleLarge,
            fontWeight = FontWeight.Bold,
            modifier = Modifier.padding(horizontal = 16.dp),
        )
        Spacer(Modifier.height(8.dp))
        TabRow(selectedTabIndex = tab) {
            tabs.forEachIndexed { i, t -> Tab(selected = tab == i, onClick = { tab = i }, text = { Text(t, fontSize = 12.sp) }) }
        }

        when (tab) {
            0 -> LazyColumn(Modifier.fillMaxSize(), contentPadding = PaddingValues(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                fun r(k: String, v: String) { if (v.isNotBlank()) item { Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) { Text(k, color = MaterialTheme.colorScheme.onSurfaceVariant); Text(v) } } }
                item { CrmStageChip(mStr(project, "status", "estado")) }
                r("Cliente", run { val c = project["client"] as? Map<String, Any?>; c?.let { mStr(it, "name", "nombre") } ?: mStr(project, "clientName") })
                r("Responsable", mStr(project, "ownerName", "assignedName", "vendorName"))
                r("Tipo", mStr(project, "type", "tipo", "projectType"))
                r("Inicio", mStr(project, "startDate", "startAt", "createdAt").take(10))
                r("Fin", mStr(project, "endDate", "closedAt").take(10))
                r("Descripción", mStr(project, "description", "descripcion", "notes"))
            }
            1 -> {
                val costs = ((project["costs"] ?: project["costos"] ?: project["expenses"]) as? List<*>)
                    ?.filterIsInstance<Map<String, Any?>>() ?: emptyList()
                if (costs.isEmpty()) {
                    Box(Modifier.fillMaxSize(), Alignment.Center) { Text("Sin costos registrados", color = MaterialTheme.colorScheme.onSurfaceVariant) }
                } else {
                    LazyColumn(Modifier.fillMaxSize(), contentPadding = PaddingValues(12.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                        items(costs, key = { mStr(it, "id") }) { c ->
                            Card(Modifier.fillMaxWidth()) {
                                Row(Modifier.fillMaxWidth().padding(12.dp), Arrangement.SpaceBetween) {
                                    Text(mStr(c, "concept", "concepto", "description", "name").ifBlank { "Costo" }, Modifier.weight(1f))
                                    Text(fmtMxnShort(mDouble(c, "amount", "total") ?: 0.0), fontWeight = FontWeight.Bold)
                                }
                            }
                        }
                    }
                }
            }
            else -> {
                val orden = (project["closingOrder"] ?: project["workOrder"] ?: project["orden"]) as? Map<String, Any?>
                if (orden == null) {
                    Box(Modifier.fillMaxSize(), Alignment.Center) { Text("Sin orden de cierre", color = MaterialTheme.colorScheme.onSurfaceVariant) }
                } else {
                    LazyColumn(Modifier.fillMaxSize(), contentPadding = PaddingValues(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                        fun r(k: String, v: String) { if (v.isNotBlank()) item { Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) { Text(k, color = MaterialTheme.colorScheme.onSurfaceVariant); Text(v) } } }
                        r("Número", mStr(orden, "number", "folio", "id"))
                        r("Estado", mStr(orden, "status", "estado"))
                        r("Fecha", mStr(orden, "createdAt", "date").take(10))
                        r("Total", fmtMxnShort(mDouble(orden, "total", "amount") ?: 0.0))
                    }
                }
            }
        }
    }
}

// ── Leads (ventas/leads API) ───────────────────────────────────────────────────

class VentasLeadsApiViewModel(app: Application) : AndroidViewModel(app) {
    private val crmRepo = CrmRepository(app.applicationContext)
    private val extraRepo = ExtraRepository(app.applicationContext)
    private val _state = MutableStateFlow(VentasLeadsUiState())
    val state: StateFlow<VentasLeadsUiState> = _state

    init { load() }

    fun load() {
        viewModelScope.launch {
            _state.update { it.copy(isLoading = true) }
            val leads = withContext(Dispatchers.IO) {
                runCatching { crmRepo.leads() }.getOrDefault(emptyList())
            }
            val items = if (leads.isEmpty()) {
                withContext(Dispatchers.IO) { extraRepo.clientTicketRequests() }
            } else {
                leads
            }
            _state.update { it.copy(isLoading = false, items = items) }
        }
    }

    fun setQuery(q: String) = _state.update { it.copy(query = q) }

    val filtered: List<Map<String, Any?>> get() {
        val s = _state.value
        if (s.query.isBlank()) return s.items
        val q = s.query.lowercase()
        return s.items.filter { t ->
            mStr(t, "description", "descripcion", "title").lowercase().contains(q) ||
                mStr(t, "branchName", "clientName", "cliente").lowercase().contains(q)
        }
    }
}

@Composable
fun VentasLeadsApiScreen() {
    val ctx = LocalContext.current
    val vm: VentasLeadsApiViewModel = viewModel(factory = crmVmFactory<VentasLeadsApiViewModel>(ctx))
    val state by vm.state.collectAsState()
    val items by remember { derivedStateOf { vm.filtered } }

    LazyColumn(modifier = Modifier.fillMaxSize(), contentPadding = PaddingValues(12.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
        item {
            OutlinedTextField(
                state.query,
                vm::setQuery,
                placeholder = { Text("Buscar lead…") },
                leadingIcon = { Icon(Icons.Default.Search, null) },
                modifier = Modifier.fillMaxWidth(),
                singleLine = true,
            )
        }
        if (state.isLoading) {
            item { Box(Modifier.fillMaxWidth().padding(40.dp), Alignment.Center) { CircularProgressIndicator() } }
        } else if (items.isEmpty()) {
            item { Text("Sin leads", modifier = Modifier.padding(20.dp)) }
        } else {
            items(items, key = { it["id"]?.toString() ?: it.hashCode().toString() }) { lead ->
                CrmLeadCard(lead)
            }
        }
    }
}

// ── Shared composables ────────────────────────────────────────────────────────

@Composable
private fun CrmListScaffold(
    isLoading: Boolean,
    error: String?,
    onRetry: () -> Unit,
    query: String,
    onQuery: (String) -> Unit,
    placeholder: String,
    emptyText: String,
    items: List<Map<String, Any?>>,
    key: (Map<String, Any?>) -> String,
    showSearch: Boolean = true,
    row: @Composable (Map<String, Any?>) -> Unit,
) {
    LazyColumn(
        modifier = Modifier.fillMaxSize(),
        contentPadding = PaddingValues(12.dp),
        verticalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        if (showSearch) {
            item { CrmSearchField(query, onQuery, placeholder) }
        }
        when {
            isLoading -> item { Box(Modifier.fillMaxWidth().padding(40.dp), Alignment.Center) { CircularProgressIndicator() } }
            !error.isNullOrBlank() -> item {
                Column(Modifier.padding(16.dp)) {
                    Text(error, color = MaterialTheme.colorScheme.error)
                    Button(onClick = onRetry) { Text("Reintentar") }
                }
            }
            items.isEmpty() -> item { Text(emptyText, modifier = Modifier.padding(20.dp)) }
            else -> items(items, key = key) { row(it) }
        }
    }
}

@Composable
private fun CrmClientDetailScreen(client: Map<String, Any?>, onBack: () -> Unit) {
    val ctx = LocalContext.current
    val clientName = mStr(client, "name", "nombre", "razonSocial")
    val clientId = mStr(client, "id")
    val serviceClientId = mStr(client, "serviceClientId", "scId").ifBlank { clientId }
    var tab by remember { mutableIntStateOf(0) }
    var cotizaciones by remember { mutableStateOf<List<Map<String, Any?>>>(emptyList()) }
    var oportunidades by remember { mutableStateOf<List<Map<String, Any?>>>(emptyList()) }
    var tickets by remember { mutableStateOf<List<Map<String, Any?>>>(emptyList()) }
    var sucursales by remember { mutableStateOf<List<Map<String, Any?>>>(emptyList()) }
    var servicios by remember { mutableStateOf<List<Map<String, Any?>>>(emptyList()) }
    var loading by remember { mutableStateOf(true) }

    LaunchedEffect(Unit) {
        val crm = CrmRepository(ctx)
        val extraRepo = ExtraRepository(ctx)
        val prefix = clientName.take(6).lowercase()
        val c = kotlinx.coroutines.withContext(kotlinx.coroutines.Dispatchers.IO) { crm.cotizaciones() }
        val o = kotlinx.coroutines.withContext(kotlinx.coroutines.Dispatchers.IO) { crm.oportunidades() }
        val t = kotlinx.coroutines.withContext(kotlinx.coroutines.Dispatchers.IO) { extraRepo.clientTicketRequests() }
        val s = if (serviceClientId.isNotBlank()) kotlinx.coroutines.withContext(kotlinx.coroutines.Dispatchers.IO) { extraRepo.serviceClientBranches(serviceClientId) } else emptyList()
        val sv = kotlinx.coroutines.withContext(kotlinx.coroutines.Dispatchers.IO) { extraRepo.maintenanceContracts(clientId = clientId.ifBlank { null }) }
        cotizaciones = c
            .filter { (it.cliente ?: "").lowercase().contains(prefix) }
            .map { cot ->
                mapOf(
                    "id" to cot.id,
                    "folio" to cot.folio,
                    "cliente" to cot.cliente,
                    "total" to cot.total,
                    "estatus" to cot.estatus,
                )
            }
        oportunidades = o.filter { (mStr(it, "clientName", "cliente")).lowercase().contains(prefix) }
        tickets = t.filter { tk ->
            val cn = (mStr(tk, "clientName", "branchName")).lowercase()
            clientName.isEmpty() || cn.contains(prefix)
        }
        sucursales = s
        servicios = sv
        loading = false
    }

    Column(Modifier.fillMaxSize()) {
        OutlinedButton(onClick = onBack, modifier = Modifier.padding(12.dp)) { Text("← Volver") }
        Text(clientName.ifBlank { "Cliente" }, style = MaterialTheme.typography.titleLarge, fontWeight = FontWeight.Bold, modifier = Modifier.padding(horizontal = 16.dp))
        Spacer(Modifier.height(8.dp))
        androidx.compose.material3.ScrollableTabRow(selectedTabIndex = tab, edgePadding = 8.dp) {
            listOf("Info", "Cotizaciones", "Oportunidades", "Tickets", "Sucursales", "Servicios").forEachIndexed { i, title ->
                Tab(selected = tab == i, onClick = { tab = i }, text = { Text(title, fontSize = 12.sp) })
            }
        }
        if (loading) { Box(Modifier.fillMaxSize(), Alignment.Center) { CircularProgressIndicator() }; return@Column }
        when (tab) {
            0 -> LazyColumn(Modifier.fillMaxSize(), contentPadding = PaddingValues(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                fun r(k: String, v: String) { if (v.isNotBlank()) item { Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) { Text(k, color = MaterialTheme.colorScheme.onSurfaceVariant); Text(v) } } }
                r("RFC", mStr(client, "rfc"))
                r("Email", mStr(client, "email"))
                r("Teléfono", mStr(client, "phone", "telefono"))
                r("Ciudad", mStr(client, "city", "ciudad"))
                r("Estado", mStr(client, "state", "estado"))
                r("País", mStr(client, "country", "pais"))
            }
            1 -> if (cotizaciones.isEmpty()) {
                Box(Modifier.fillMaxSize(), Alignment.Center) { Text("Sin cotizaciones", color = MaterialTheme.colorScheme.onSurfaceVariant) }
            } else {
                LazyColumn(Modifier.fillMaxSize(), contentPadding = PaddingValues(12.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    items(cotizaciones, key = { mStr(it, "id") }) { cot ->
                        Card(shape = RoundedCornerShape(12.dp), modifier = Modifier.fillMaxWidth()) {
                            Column(Modifier.padding(14.dp)) {
                                Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                                    Text(mStr(cot, "folio").ifBlank { "Cot #${mStr(cot, "id")}" }, fontWeight = FontWeight.Bold)
                                    Text(fmtMxnShort(mDouble(cot, "total") ?: 0.0), fontWeight = FontWeight.Bold)
                                }
                                Text(mStr(cot, "estatus"), style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                            }
                        }
                    }
                }
            }
            2 -> if (oportunidades.isEmpty()) {
                Box(Modifier.fillMaxSize(), Alignment.Center) { Text("Sin oportunidades", color = MaterialTheme.colorScheme.onSurfaceVariant) }
            } else {
                LazyColumn(Modifier.fillMaxSize(), contentPadding = PaddingValues(12.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    items(oportunidades, key = { mStr(it, "id") }) { o ->
                        Card(shape = RoundedCornerShape(12.dp), modifier = Modifier.fillMaxWidth()) {
                            Column(Modifier.padding(14.dp)) {
                                Text(mStr(o, "title", "name").ifBlank { "Oportunidad" }, fontWeight = FontWeight.Bold)
                                Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                                    CrmStageChip(mStr(o, "stage", "etapa"))
                                    Text(fmtMxnShort(mDouble(o, "value") ?: 0.0), fontWeight = FontWeight.SemiBold)
                                }
                            }
                        }
                    }
                }
            }
            3 -> if (tickets.isEmpty()) {
                Box(Modifier.fillMaxSize(), Alignment.Center) { Text("Sin tickets del cliente", color = MaterialTheme.colorScheme.onSurfaceVariant) }
            } else {
                LazyColumn(Modifier.fillMaxSize(), contentPadding = PaddingValues(12.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    items(tickets, key = { mStr(it, "id") }) { tk ->
                        Card(shape = RoundedCornerShape(12.dp), modifier = Modifier.fillMaxWidth()) {
                            Column(Modifier.padding(14.dp)) {
                                Text(mStr(tk, "subject", "descripcion", "title").ifBlank { "Ticket" }, fontWeight = FontWeight.Bold)
                                Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                                    Text(mStr(tk, "status", "estado"), style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.tertiary)
                                    Text(mStr(tk, "createdAt", "fecha").take(10), style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                                }
                            }
                        }
                    }
                }
            }
            4 -> if (sucursales.isEmpty()) {
                Box(Modifier.fillMaxSize(), Alignment.Center) { Text("Sin sucursales registradas", color = MaterialTheme.colorScheme.onSurfaceVariant) }
            } else {
                LazyColumn(Modifier.fillMaxSize(), contentPadding = PaddingValues(12.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    items(sucursales, key = { mStr(it, "id") }) { b ->
                        Card(shape = RoundedCornerShape(12.dp), modifier = Modifier.fillMaxWidth()) {
                            Column(Modifier.padding(14.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                                Text(mStr(b, "name", "nombre", "branchName").ifBlank { "Sucursal" }, fontWeight = FontWeight.Bold)
                                val addr = mStr(b, "address", "direccion")
                                if (addr.isNotBlank()) Text(addr, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                                val city = mStr(b, "city", "ciudad")
                                if (city.isNotBlank()) Text(city, style = MaterialTheme.typography.bodySmall)
                            }
                        }
                    }
                }
            }
            else -> if (servicios.isEmpty()) {
                Box(Modifier.fillMaxSize(), Alignment.Center) { Text("Sin contratos de servicio", color = MaterialTheme.colorScheme.onSurfaceVariant) }
            } else {
                LazyColumn(Modifier.fillMaxSize(), contentPadding = PaddingValues(12.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    items(servicios, key = { mStr(it, "id") }) { s ->
                        Card(shape = RoundedCornerShape(12.dp), modifier = Modifier.fillMaxWidth()) {
                            Column(Modifier.padding(14.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                                Text(mStr(s, "name", "nombre", "contractNumber").ifBlank { "Contrato" }, fontWeight = FontWeight.Bold)
                                Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                                    Text(mStr(s, "status", "estado"), style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.tertiary)
                                    Text(mStr(s, "expiresAt", "endDate", "vigencia").take(10), style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
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
private fun CrmDetailScaffold(
    title: String,
    rows: List<Pair<String, String>>,
    onBack: () -> Unit,
) {
    Column(Modifier.fillMaxSize().padding(16.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
        OutlinedButton(onClick = onBack) { Text("Volver") }
        Text(title, style = MaterialTheme.typography.titleLarge, fontWeight = FontWeight.Bold)
        rows.forEach { (k, v) ->
            if (v.isNotBlank()) {
                Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                    Text(k, color = MaterialTheme.colorScheme.onSurfaceVariant)
                    Text(v)
                }
            }
        }
    }
}

private fun fmtMxnShort(v: Double): String = when {
    v >= 1_000_000 -> "$" + String.format("%.1fM", v / 1_000_000)
    v >= 1_000 -> "$" + String.format("%.1fK", v / 1_000)
    else -> "$" + String.format("%,.0f", v)
}

@Composable
private fun CrmLeadCard(lead: Map<String, Any?>) {
    val description = mStr(lead, "description", "descripcion", "title")
    val branch = mStr(lead, "branchName", "clientName", "cliente")
    val status = mStr(lead, "status", "estatus")
    val date = mStr(lead, "createdAt", "fecha").take(10)
    Card(shape = RoundedCornerShape(12.dp), modifier = Modifier.fillMaxWidth()) {
        Column(Modifier.padding(14.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
            Text(description.ifBlank { "Sin descripción" }.take(60), fontWeight = FontWeight.SemiBold)
            if (branch.isNotBlank()) {
                Text(branch, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
            Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
                CrmStageChip(status)
                Spacer(Modifier.weight(1f))
                if (date.isNotBlank()) {
                    Text(date, style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                }
            }
        }
    }
}

// ── Pipeline / Agenda / Licitaciones / Metas / Equipo ───────────────────────

@Composable
fun VentasPipelineScreen() {
    val ctx = LocalContext.current
    val vm: CrmOportunidadesViewModel = viewModel(factory = crmVmFactory<CrmOportunidadesViewModel>(ctx))
    val state by vm.state.collectAsState()
    val grouped = remember(state.items) {
        state.items.groupBy { mStr(it, "stage", "etapa").ifBlank { "Sin etapa" } }.toList().sortedBy { it.first }
    }
    LazyColumn(Modifier.fillMaxSize(), contentPadding = PaddingValues(12.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
        if (state.isLoading) item { Box(Modifier.fillMaxWidth().padding(40.dp), Alignment.Center) { CircularProgressIndicator() } }
        grouped.forEach { (stage, items) ->
            item {
                Text(stage, style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold)
            }
            items(items, key = { mStr(it, "id") }) { o ->
                Card(Modifier.fillMaxWidth(), shape = RoundedCornerShape(12.dp)) {
                    Column(Modifier.padding(12.dp)) {
                        Text(mStr(o, "title", "name"), fontWeight = FontWeight.SemiBold)
                        Text(fmtMxnShort(mDouble(o, "value", "amount") ?: 0.0), color = CrmGreen, fontWeight = FontWeight.Bold)
                    }
                }
            }
        }
    }
}

@Composable
fun VentasAgendaScreen() {
    val ctx = LocalContext.current
    val repo = remember(ctx) { CrmRepository(ctx.applicationContext) }
    var items by remember { mutableStateOf<List<Map<String, Any?>>>(emptyList()) }
    var loading by remember { mutableStateOf(true) }
    var query by remember { mutableStateOf("") }
    var selected by remember { mutableStateOf<Map<String, Any?>?>(null) }
    LaunchedEffect(repo) { loading = true; items = runCatching { withContext(Dispatchers.IO) { repo.calendarEvents() } }.getOrDefault(emptyList()); loading = false }

    if (selected != null) {
        val ev = selected!!
        LazyColumn(Modifier.fillMaxSize(), contentPadding = PaddingValues(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
            item { OutlinedButton(onClick = { selected = null }) { Text("← Agenda") } }
            item { Text(mStr(ev, "title", "subject"), style = MaterialTheme.typography.titleLarge, fontWeight = FontWeight.Bold) }
            item {
                Card(Modifier.fillMaxWidth()) {
                    Column(Modifier.padding(14.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                        DetailLine("Tipo", mStr(ev, "type", "tipo"))
                        DetailLine("Inicio", mStr(ev, "startAt", "start", "fecha").take(16))
                        DetailLine("Fin", mStr(ev, "endAt", "end", "fin").take(16))
                        DetailLine("Responsable", mStr(ev, "ownerName", "attendeeName"))
                        DetailLine("Descripción", mStr(ev, "description", "notes"))
                        DetailLine("Ubicación", mStr(ev, "location", "ubicacion"))
                        DetailLine("Resultado", mStr(ev, "result", "resultado"))
                    }
                }
            }
        }
        return
    }
    val filtered = items.filter { query.isBlank() || mStr(it, "title", "subject").lowercase().contains(query.lowercase()) || mStr(it, "ownerName").lowercase().contains(query.lowercase()) }
    CrmListScaffold(isLoading = loading, error = null, onRetry = {}, query = query, onQuery = { query = it }, placeholder = "Buscar evento…", emptyText = "Sin eventos", items = filtered, key = { mStr(it, "id") }) { ev ->
        Card(Modifier.fillMaxWidth().clickable { selected = ev }, shape = RoundedCornerShape(12.dp)) {
            Column(Modifier.padding(12.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                Text(mStr(ev, "title", "subject"), fontWeight = FontWeight.SemiBold)
                val date = mStr(ev, "startAt", "start", "fecha").take(16)
                if (date.isNotBlank()) Text(date, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                val owner = mStr(ev, "ownerName", "attendeeName")
                if (owner.isNotBlank()) Text(owner, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
        }
    }
}

@Composable
fun VentasTendersScreen() {
    val ctx = LocalContext.current
    val repo = remember(ctx) { CrmRepository(ctx.applicationContext) }
    var items by remember { mutableStateOf<List<Map<String, Any?>>>(emptyList()) }
    var loading by remember { mutableStateOf(true) }
    var query by remember { mutableStateOf("") }
    var statusFilter by remember { mutableStateOf("todos") }
    var selected by remember { mutableStateOf<Map<String, Any?>?>(null) }
    LaunchedEffect(repo) { loading = true; items = runCatching { withContext(Dispatchers.IO) { repo.tenders() } }.getOrDefault(emptyList()); loading = false }

    if (selected != null) {
        val t = selected!!
        LazyColumn(Modifier.fillMaxSize(), contentPadding = PaddingValues(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
            item {
                Row(Modifier.fillMaxWidth(), Arrangement.SpaceBetween, Alignment.CenterVertically) {
                    OutlinedButton(onClick = { selected = null }) { Text("← Licitaciones") }
                    Text(mStr(t, "status", "estado"), color = CrmGreen, fontWeight = FontWeight.SemiBold)
                }
            }
            item { Text(mStr(t, "title", "name"), style = MaterialTheme.typography.titleLarge, fontWeight = FontWeight.Bold) }
            item {
                Card(Modifier.fillMaxWidth()) {
                    Column(Modifier.padding(14.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                        DetailLine("Cliente", mStr(t, "clientName", "cliente"))
                        DetailLine("Estado", mStr(t, "status", "estado"))
                        DetailLine("Monto", fmtMxnShort(mDouble(t, "amount", "value", "monto") ?: 0.0))
                        DetailLine("Fecha límite", mStr(t, "deadline", "dueDate").take(10))
                        DetailLine("Descripción", mStr(t, "description", "notes"))
                        DetailLine("Resultado", mStr(t, "result", "resultado"))
                        DetailLine("Responsable", mStr(t, "ownerName", "responsable"))
                    }
                }
            }
        }
        return
    }
    val allStatuses = listOf("todos") + items.mapNotNull { mStr(it, "status", "estado").lowercase().takeIf { s -> s.isNotBlank() } }.distinct().sorted()
    val filtered = items.filter { (statusFilter == "todos" || mStr(it, "status", "estado").equals(statusFilter, true)) && (query.isBlank() || mStr(it, "title", "name").lowercase().contains(query.lowercase()) || mStr(it, "clientName", "cliente").lowercase().contains(query.lowercase())) }

    LazyColumn(Modifier.fillMaxSize().padding(16.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
        if (items.isNotEmpty()) item {
            Row(Modifier.fillMaxWidth(), Arrangement.spacedBy(8.dp)) {
                KpiChip("Total", "${items.size}", null, Modifier.weight(1f))
                KpiChip("Activas", "${items.count { listOf("activo","abierto","open").contains(mStr(it, "status", "estado").lowercase()) }}", Color(0xFF2E7D32), Modifier.weight(1f))
                KpiChip("Cerradas", "${items.count { listOf("cerrado","closed","ganado","perdido").contains(mStr(it, "status", "estado").lowercase()) }}", Color(0xFF64748B), Modifier.weight(1f))
            }
        }
        item { OutlinedTextField(value = query, onValueChange = { query = it }, placeholder = { Text("Buscar licitación…") }, singleLine = true, modifier = Modifier.fillMaxWidth()) }
        item { Row(Modifier.horizontalScroll(rememberScrollState()), horizontalArrangement = Arrangement.spacedBy(6.dp)) { allStatuses.forEach { s -> FilterChip(selected = statusFilter == s, onClick = { statusFilter = s }, label = { Text(s, style = MaterialTheme.typography.labelSmall) }) } } }
        if (loading) { item { LinearProgressIndicator(Modifier.fillMaxWidth()) }; return@LazyColumn }
        if (filtered.isEmpty()) { item { Text("Sin licitaciones", color = MaterialTheme.colorScheme.onSurfaceVariant) }; return@LazyColumn }
        items(filtered, key = { mStr(it, "id") }) { t ->
            Card(Modifier.fillMaxWidth().clickable { selected = t }, shape = RoundedCornerShape(12.dp)) {
                Column(Modifier.padding(12.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                    Row(Modifier.fillMaxWidth(), Arrangement.SpaceBetween) { Text(mStr(t, "title", "name"), fontWeight = FontWeight.Bold, modifier = Modifier.weight(1f)); Text(mStr(t, "status", "estado"), color = CrmGreen, style = MaterialTheme.typography.labelSmall) }
                    val client = mStr(t, "clientName", "cliente"); if (client.isNotBlank()) Text(client, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                    val dl = mStr(t, "deadline", "dueDate").take(10); if (dl.isNotBlank()) Text("Vence: $dl", style = MaterialTheme.typography.labelSmall, color = Color(0xFFE65100))
                }
            }
        }
    }
}

@Composable
fun VentasTargetsScreen() {
    val ctx = LocalContext.current
    val repo = remember(ctx) { CrmRepository(ctx.applicationContext) }
    var items by remember { mutableStateOf<List<Map<String, Any?>>>(emptyList()) }
    var loading by remember { mutableStateOf(true) }
    var query by remember { mutableStateOf("") }
    LaunchedEffect(repo) { loading = true; items = runCatching { withContext(Dispatchers.IO) { repo.salesTargets() } }.getOrDefault(emptyList()); loading = false }

    val totalTarget = items.sumOf { mDouble(it, "targetAmount", "amount") ?: 0.0 }
    val totalActual = items.sumOf { mDouble(it, "actualAmount", "actual", "currentAmount") ?: 0.0 }
    val filtered = items.filter { query.isBlank() || mStr(it, "ownerName", "userName").lowercase().contains(query.lowercase()) }

    LazyColumn(Modifier.fillMaxSize().padding(16.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
        if (items.isNotEmpty()) item {
            Row(Modifier.fillMaxWidth(), Arrangement.spacedBy(8.dp)) {
                KpiChip("Vendedores", "${items.size}", null, Modifier.weight(1f))
                KpiChip("Meta", fmtMxnShort(totalTarget), Color(0xFF1565C0), Modifier.weight(1f))
                KpiChip("Alcanzado", fmtMxnShort(totalActual), if (totalActual >= totalTarget) Color(0xFF2E7D32) else Color(0xFFE65100), Modifier.weight(1f))
            }
        }
        item { OutlinedTextField(value = query, onValueChange = { query = it }, placeholder = { Text("Buscar vendedor…") }, singleLine = true, modifier = Modifier.fillMaxWidth()) }
        if (loading) { item { LinearProgressIndicator(Modifier.fillMaxWidth()) }; return@LazyColumn }
        if (filtered.isEmpty()) { item { Text("Sin metas definidas", color = MaterialTheme.colorScheme.onSurfaceVariant) }; return@LazyColumn }
        items(filtered, key = { mStr(it, "id", "ownerName") }) { t ->
            val target = mDouble(t, "targetAmount", "amount") ?: 0.0
            val actual = mDouble(t, "actualAmount", "actual", "currentAmount") ?: 0.0
            val pct = if (target > 0) (actual / target).coerceIn(0.0, 1.0).toFloat() else 0f
            Card(Modifier.fillMaxWidth(), shape = RoundedCornerShape(12.dp)) {
                Column(Modifier.padding(12.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                    Row(Modifier.fillMaxWidth(), Arrangement.SpaceBetween) {
                        Text(mStr(t, "ownerName", "userName"), fontWeight = FontWeight.Bold)
                        Text(fmtMxnShort(actual), fontWeight = FontWeight.Bold, color = if (pct >= 1f) Color(0xFF2E7D32) else Color(0xFFE65100))
                    }
                    Text("${mStr(t, "year")} / ${mStr(t, "month")}", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                    LinearProgressIndicator(progress = { pct }, modifier = Modifier.fillMaxWidth(), color = if (pct >= 1f) Color(0xFF2E7D32) else Color(0xFFE65100))
                    Text("Meta: ${fmtMxnShort(target)} · ${(pct * 100).toInt()}%", style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                }
            }
        }
    }
}

@Composable
fun VentasSalesTeamScreen() {
    val ctx = LocalContext.current
    val repo = remember(ctx) { CrmRepository(ctx.applicationContext) }
    var items by remember { mutableStateOf<List<Map<String, Any?>>>(emptyList()) }
    var loading by remember { mutableStateOf(true) }
    var query by remember { mutableStateOf("") }
    LaunchedEffect(repo) { loading = true; items = runCatching { withContext(Dispatchers.IO) { repo.salesTeam() } }.getOrDefault(emptyList()); loading = false }

    val totalSales = items.sumOf { mDouble(it, "totalVentas", "salesTotal", "amount") ?: 0.0 }
    val maxSales = items.maxOfOrNull { mDouble(it, "totalVentas", "salesTotal", "amount") ?: 0.0 } ?: 1.0
    val filtered = items.filter { query.isBlank() || mStr(it, "nombre", "name", "userName").lowercase().contains(query.lowercase()) }

    LazyColumn(Modifier.fillMaxSize().padding(16.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
        if (items.isNotEmpty()) item {
            Row(Modifier.fillMaxWidth(), Arrangement.spacedBy(8.dp)) {
                KpiChip("Vendedores", "${items.size}", null, Modifier.weight(1f))
                KpiChip("Total", fmtMxnShort(totalSales), Color(0xFF2E7D32), Modifier.weight(1f))
                KpiChip("Promedio", fmtMxnShort(if (items.isEmpty()) 0.0 else totalSales / items.size), Color(0xFF0891B2), Modifier.weight(1f))
            }
        }
        item { OutlinedTextField(value = query, onValueChange = { query = it }, placeholder = { Text("Buscar vendedor…") }, singleLine = true, modifier = Modifier.fillMaxWidth()) }
        if (loading) { item { LinearProgressIndicator(Modifier.fillMaxWidth()) }; return@LazyColumn }
        if (filtered.isEmpty()) { item { Text("Sin datos de equipo", color = MaterialTheme.colorScheme.onSurfaceVariant) }; return@LazyColumn }
        items(filtered, key = { mStr(it, "id", "nombre") }) { v ->
            val sales = mDouble(v, "totalVentas", "salesTotal", "amount") ?: 0.0
            val pct = (if (maxSales > 0) sales / maxSales else 0.0).coerceIn(0.0, 1.0).toFloat()
            Card(Modifier.fillMaxWidth(), shape = RoundedCornerShape(12.dp)) {
                Column(Modifier.padding(12.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                    Row(Modifier.fillMaxWidth(), Arrangement.SpaceBetween, Alignment.CenterVertically) {
                        Column {
                            Text(mStr(v, "nombre", "name", "userName"), fontWeight = FontWeight.Bold)
                            val role = mStr(v, "role", "puesto", "cargo"); if (role.isNotBlank()) Text(role, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                        }
                        Text(fmtMxnShort(sales), fontWeight = FontWeight.Bold, color = Color(0xFF2E7D32))
                    }
                    val leads = mStr(v, "totalLeads", "leads"); val opps = mStr(v, "totalOportunidades", "oportunidades")
                    if (leads.isNotBlank() || opps.isNotBlank()) Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                        if (leads.isNotBlank()) Text("$leads leads", style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                        if (opps.isNotBlank()) Text("$opps opps", style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                    }
                    LinearProgressIndicator(progress = { pct }, modifier = Modifier.fillMaxWidth(), color = Color(0xFF2E7D32))
                }
            }
        }
    }
}

private inline fun <reified T : AndroidViewModel> crmVmFactory(ctx: android.content.Context) =
    object : androidx.lifecycle.ViewModelProvider.Factory {
        @Suppress("UNCHECKED_CAST")
        override fun <VM : androidx.lifecycle.ViewModel> create(c: Class<VM>): VM {
            return T::class.java.getConstructor(Application::class.java)
                .newInstance(ctx.applicationContext as Application) as VM
        }
    }

@Composable
private fun KpiChip(label: String, value: String?, color: Color? = null, modifier: Modifier = Modifier) {
    Column(horizontalAlignment = Alignment.CenterHorizontally, modifier = modifier.padding(horizontal = 4.dp, vertical = 4.dp)) {
        Text(value ?: label, fontWeight = FontWeight.Bold, color = color ?: MaterialTheme.colorScheme.primary)
        if (value != null) Text(label, style = MaterialTheme.typography.labelSmall)
    }
}

@Composable
private fun DetailLine(label: String, value: String) {
    if (value.isBlank()) return
    Row(Modifier.fillMaxWidth()) {
        Text(label, fontWeight = FontWeight.Medium)
        Spacer(Modifier.weight(1f))
        Text(value, color = MaterialTheme.colorScheme.onSurfaceVariant)
    }
}
