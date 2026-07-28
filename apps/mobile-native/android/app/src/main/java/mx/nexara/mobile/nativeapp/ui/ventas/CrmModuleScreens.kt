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
import mx.nexara.mobile.nativeapp.data.api.CrmOpportunityDto
import mx.nexara.mobile.nativeapp.data.api.CrmClientDto
import mx.nexara.mobile.nativeapp.data.api.CrmProductDto
import mx.nexara.mobile.nativeapp.data.api.CrmLeadDto
import mx.nexara.mobile.nativeapp.data.api.CrmSalesProjectDto
import mx.nexara.mobile.nativeapp.data.api.CotizacionDto

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

data class CrmListUiState<T>(
    val isLoading: Boolean = true,
    val error: String? = null,
    val query: String = "",
    val items: List<T> = emptyList(),
    val selected: T? = null,
)

class CrmOportunidadesViewModel(app: Application) : AndroidViewModel(app) {
    private val repo = CrmRepository(app.applicationContext)
    private val _state = MutableStateFlow(CrmListUiState<CrmOpportunityDto>())
    val state: StateFlow<CrmListUiState<CrmOpportunityDto>> = _state

    init { refresh() }

    fun refresh() {
        _state.update { it.copy(isLoading = true, error = null) }
        viewModelScope.launch {
            try {
                val list = withContext(Dispatchers.IO) { repo.opportunityDtos() }
                _state.update { it.copy(isLoading = false, items = list) }
            } catch (e: Exception) {
                _state.update { it.copy(isLoading = false, error = e.message) }
            }
        }
    }

    fun setQuery(q: String) = _state.update { it.copy(query = q) }
    fun select(item: CrmOpportunityDto?) = _state.update { it.copy(selected = item) }

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

    val filtered: List<CrmOpportunityDto> get() {
        val q = _state.value.query.trim().lowercase()
        if (q.isBlank()) return _state.value.items
        return _state.value.items.filter {
            it.title.lowercase().contains(q) || it.stage.lowercase().contains(q)
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
        val id = state.selected!!.id
        if (id > 0L) {
            VentasOpportunityDetailScreen(oppId = id, onBack = { vm.select(null) })
            return
        }
        CrmDetailScaffold(
            title = state.selected!!.displayTitle,
            rows = listOf(
                "Etapa" to state.selected!!.stageKey,
                "Valor" to fmtMxnShort(state.selected!!.value),
                "Cliente" to state.selected!!.clientName,
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
                key = { it.rowKey },
            ) { item ->
                Card(
                    modifier = Modifier.fillMaxWidth().clickable { vm.select(item) },
                    shape = RoundedCornerShape(12.dp),
                ) {
                    Column(Modifier.padding(14.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                        Text(item.displayTitle, fontWeight = FontWeight.SemiBold)
                        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                            CrmStageChip(item.stageKey)
                            Text(fmtMxnShort(item.value), fontWeight = FontWeight.Bold)
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
                    vm.select(CrmOpportunityDto(id = id))
                }
            },
        )
    }
}

// ── Clientes ──────────────────────────────────────────────────────────────────

class CrmClientesViewModel(app: Application) : AndroidViewModel(app) {
    private val repo = CrmRepository(app.applicationContext)
    private val _state = MutableStateFlow(CrmListUiState<CrmClientDto>())
    val state: StateFlow<CrmListUiState<CrmClientDto>> = _state

    init { refresh() }

    fun refresh() {
        _state.update { it.copy(isLoading = true, error = null) }
        viewModelScope.launch {
            try {
                val list = withContext(Dispatchers.IO) { repo.clientDtos() }
                _state.update { it.copy(isLoading = false, items = list) }
            } catch (e: Exception) {
                _state.update { it.copy(isLoading = false, error = e.message) }
            }
        }
    }

    fun setQuery(q: String) = _state.update { it.copy(query = q) }
    fun select(item: CrmClientDto?) = _state.update { it.copy(selected = item) }

    val filtered: List<CrmClientDto> get() {
        val q = _state.value.query.trim().lowercase()
        if (q.isBlank()) return _state.value.items
        return _state.value.items.filter { it.name.lowercase().contains(q) }
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
        key = { it.rowKey },
    ) { item ->
        Card(
            modifier = Modifier.fillMaxWidth().clickable { vm.select(item) },
            shape = RoundedCornerShape(12.dp),
        ) {
            Column(Modifier.padding(14.dp)) {
                Text(item.displayName, fontWeight = FontWeight.SemiBold)
                Text(item.subtitle, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
        }
    }
}

// ── Productos ─────────────────────────────────────────────────────────────────

class CrmProductsViewModel(app: Application) : AndroidViewModel(app) {
    private val repo = CrmRepository(app.applicationContext)
    private val _state = MutableStateFlow(CrmListUiState<CrmProductDto>())
    val state: StateFlow<CrmListUiState<CrmProductDto>> = _state

    init { refresh() }

    fun refresh() {
        _state.update { it.copy(isLoading = true, error = null) }
        viewModelScope.launch {
            try {
                val q = _state.value.query.ifBlank { null }
                val list = withContext(Dispatchers.IO) { repo.productDtos(q) }
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
    var selected by remember { mutableStateOf<CrmProductDto?>(null) }

    if (selected != null) {
        ProductDetailView(product = selected!!, onBack = { selected = null })
        return
    }

    CrmListScaffold(
        isLoading = state.isLoading,
        error = state.error,
        onRetry = vm::refresh,
        query = state.query,
        onQuery = vm::setQuery,
        placeholder = "Buscar producto…",
        emptyText = "Sin productos",
        items = state.items,
        key = { it.rowKey },
    ) { item ->
        Card(shape = RoundedCornerShape(12.dp), modifier = Modifier.fillMaxWidth().clickable { selected = item }) {
            Row(Modifier.padding(14.dp), verticalAlignment = Alignment.CenterVertically) {
                Column(Modifier.weight(1f)) {
                    Text(item.displayName, fontWeight = FontWeight.SemiBold)
                    Text(item.sku, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                }
                Text(fmtMxnShort(item.price), fontWeight = FontWeight.Bold)
            }
        }
    }
}

@Composable
private fun ProductDetailView(product: CrmProductDto, onBack: () -> Unit) {
    val raw = product.raw
    LazyColumn(modifier = Modifier.fillMaxSize(), contentPadding = PaddingValues(12.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
        item { OutlinedButton(onClick = onBack) { Text("← Productos") } }
        item {
            Card(Modifier.fillMaxWidth()) {
                Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    Text(product.displayName, fontWeight = FontWeight.Bold, fontSize = 18.sp)
                    Divider()
                    ProductRow("SKU / Código", product.sku)
                    ProductRow("Precio", fmtMxnShort(product.price))
                    ProductRow("Categoría", mStr(raw, "category", "categoria", "tipo"))
                    ProductRow("Stock", mStr(raw, "stock", "quantity", "inventario"))
                    ProductRow("Unidad", mStr(raw, "unit", "unidad"))
                    ProductRow("Proveedor", mStr(raw, "supplier", "proveedor"))
                    val desc = mStr(raw, "description", "descripcion", "notas")
                    if (desc.isNotBlank()) {
                        Spacer(Modifier.height(4.dp))
                        Text("Descripción", fontWeight = FontWeight.Medium)
                        Text(desc, style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
                    }
                }
            }
        }
    }
}

@Composable
private fun ProductRow(label: String, value: String) {
    if (value.isBlank()) return
    Row(Modifier.fillMaxWidth()) {
        Text(label, fontWeight = FontWeight.Medium, modifier = Modifier.weight(1f))
        Text(value, color = MaterialTheme.colorScheme.onSurfaceVariant)
    }
}

// ── Proyectos comerciales ─────────────────────────────────────────────────────

class CrmProyectosViewModel(app: Application) : AndroidViewModel(app) {
    private val repo = CrmRepository(app.applicationContext)
    private val _state = MutableStateFlow(CrmListUiState<CrmSalesProjectDto>())
    val state: StateFlow<CrmListUiState<CrmSalesProjectDto>> = _state

    init { refresh() }

    fun refresh() {
        _state.update { it.copy(isLoading = true, error = null) }
        viewModelScope.launch {
            try {
                val list = withContext(Dispatchers.IO) { repo.projectDtos() }
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
    var selected by remember { mutableStateOf<CrmSalesProjectDto?>(null) }

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
        key = { it.rowKey },
        showSearch = false,
    ) { item ->
        Card(
            shape = RoundedCornerShape(12.dp),
            modifier = Modifier.fillMaxWidth().clickable { selected = item },
        ) {
            Column(Modifier.padding(14.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                Text(item.displayName, fontWeight = FontWeight.SemiBold)
                Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                    CrmStageChip(item.status)
                    if (item.clientName.isNotBlank()) {
                        Text(
                            item.clientName,
                            style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                        )
                    }
                }
            }
        }
    }
}

@Composable
private fun CrmProjectDetailScreen(project: CrmSalesProjectDto, onBack: () -> Unit) {
    var tab by remember { mutableIntStateOf(0) }
    val tabs = listOf("Info", "Costos", "Orden")
    val raw = project.raw

    Column(Modifier.fillMaxSize()) {
        OutlinedButton(onClick = onBack, modifier = Modifier.padding(12.dp)) { Text("← Volver") }
        Text(
            project.displayName,
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
                item { CrmStageChip(project.status) }
                r("Cliente", project.clientName)
                r("Responsable", project.ownerName)
                r("Tipo", project.projectType)
                r("Presupuesto", if (project.budget != 0.0) fmtMxnShort(project.budget) else "")
                r("Margen", if (project.margin != 0.0) fmtMxnShort(project.margin) else "")
                r("Inicio", project.startDate.take(10))
                r("Fin", project.endDate.take(10))
                r("Descripción", project.scopeSummary)
            }
            1 -> {
                val nestedCosts = ((raw["costs"] ?: raw["costos"] ?: raw["expenses"]) as? List<*>)
                    ?.filterIsInstance<Map<String, Any?>>() ?: emptyList()
                val costRows = if (nestedCosts.isNotEmpty()) {
                    nestedCosts.map { c ->
                        mStr(c, "concept", "concepto", "description", "name").ifBlank { "Costo" } to
                            (mDouble(c, "amount", "total") ?: 0.0)
                    }
                } else {
                    project.costRows
                }
                if (costRows.isEmpty()) {
                    Box(Modifier.fillMaxSize(), Alignment.Center) { Text("Sin costos registrados", color = MaterialTheme.colorScheme.onSurfaceVariant) }
                } else {
                    LazyColumn(Modifier.fillMaxSize(), contentPadding = PaddingValues(12.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                        items(costRows.size) { i ->
                            val (label, amount) = costRows[i]
                            Card(Modifier.fillMaxWidth()) {
                                Row(Modifier.fillMaxWidth().padding(12.dp), Arrangement.SpaceBetween) {
                                    Text(label, Modifier.weight(1f))
                                    Text(fmtMxnShort(amount), fontWeight = FontWeight.Bold)
                                }
                            }
                        }
                    }
                }
            }
            else -> {
                val orden = (raw["closingOrder"] ?: raw["workOrder"] ?: raw["orden"] ?: raw["closureOrder"]) as? Map<String, Any?>
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
                runCatching { crmRepo.leadDtos() }.getOrDefault(emptyList())
            }
            val items = if (leads.isEmpty()) {
                withContext(Dispatchers.IO) { extraRepo.clientTicketLeadDtos() }
            } else {
                leads
            }
            _state.update { it.copy(isLoading = false, items = items) }
        }
    }

    fun setQuery(q: String) = _state.update { it.copy(query = q) }

    val filtered: List<CrmLeadDto> get() {
        val s = _state.value
        if (s.query.isBlank()) return s.items
        val q = s.query.lowercase()
        return s.items.filter { t ->
            t.displayTitle.lowercase().contains(q) ||
                t.clientName.lowercase().contains(q) ||
                t.branchName.lowercase().contains(q) ||
                t.description.lowercase().contains(q)
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
            items(items, key = { it.rowKey }) { lead ->
                CrmLeadCard(lead)
            }
        }
    }
}

// ── Shared composables ────────────────────────────────────────────────────────

@Composable
private fun <T> CrmListScaffold(
    isLoading: Boolean,
    error: String?,
    onRetry: () -> Unit,
    query: String,
    onQuery: (String) -> Unit,
    placeholder: String,
    emptyText: String,
    items: List<T>,
    key: (T) -> String,
    showSearch: Boolean = true,
    row: @Composable (T) -> Unit,
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
private fun CrmClientDetailScreen(client: CrmClientDto, onBack: () -> Unit) {
    val ctx = LocalContext.current
    val clientName = client.displayName
    val clientId = client.id.toString()
    val serviceClientId = mStr(client.raw, "serviceClientId", "scId").ifBlank { clientId }
    var tab by remember { mutableIntStateOf(0) }
    var cotizaciones by remember { mutableStateOf<List<CotizacionDto>>(emptyList()) }
    var oportunidades by remember { mutableStateOf<List<CrmOpportunityDto>>(emptyList()) }
    var tickets by remember { mutableStateOf<List<Map<String, Any?>>>(emptyList()) }
    var sucursales by remember { mutableStateOf<List<Map<String, Any?>>>(emptyList()) }
    var servicios by remember { mutableStateOf<List<Map<String, Any?>>>(emptyList()) }
    var loading by remember { mutableStateOf(true) }

    LaunchedEffect(Unit) {
        val crm = CrmRepository(ctx)
        val extraRepo = ExtraRepository(ctx)
        val prefix = clientName.take(6).lowercase()
        val c = kotlinx.coroutines.withContext(kotlinx.coroutines.Dispatchers.IO) { crm.cotizaciones() }
        val o = kotlinx.coroutines.withContext(kotlinx.coroutines.Dispatchers.IO) { crm.opportunityDtos() }
        val t = kotlinx.coroutines.withContext(kotlinx.coroutines.Dispatchers.IO) { extraRepo.clientTicketRequests() }
        val s = if (serviceClientId.isNotBlank()) kotlinx.coroutines.withContext(kotlinx.coroutines.Dispatchers.IO) { extraRepo.serviceClientBranches(serviceClientId) } else emptyList()
        val sv = kotlinx.coroutines.withContext(kotlinx.coroutines.Dispatchers.IO) { extraRepo.maintenanceContracts(clientId = clientId.ifBlank { null }) }
        cotizaciones = c.filter { (it.cliente ?: "").lowercase().contains(prefix) }
        oportunidades = o.filter { it.clientName.lowercase().contains(prefix) }
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
                r("RFC", client.rfc)
                r("Email", client.email)
                r("Teléfono", client.phone.ifBlank { mStr(client.raw, "telefono") })
                r("Ciudad", mStr(client.raw, "city", "ciudad"))
                r("Estado", mStr(client.raw, "state", "estado"))
                r("País", mStr(client.raw, "country", "pais"))
            }
            1 -> if (cotizaciones.isEmpty()) {
                Box(Modifier.fillMaxSize(), Alignment.Center) { Text("Sin cotizaciones", color = MaterialTheme.colorScheme.onSurfaceVariant) }
            } else {
                LazyColumn(Modifier.fillMaxSize(), contentPadding = PaddingValues(12.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    items(cotizaciones, key = { it.id }) { cot ->
                        Card(shape = RoundedCornerShape(12.dp), modifier = Modifier.fillMaxWidth()) {
                            Column(Modifier.padding(14.dp)) {
                                Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                                    Text(cot.folio?.takeIf { it.isNotBlank() } ?: "Cot #${cot.id}", fontWeight = FontWeight.Bold)
                                    Text(fmtMxnShort(cot.total ?: 0.0), fontWeight = FontWeight.Bold)
                                }
                                Text(cot.estatus.orEmpty(), style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                            }
                        }
                    }
                }
            }
            2 -> if (oportunidades.isEmpty()) {
                Box(Modifier.fillMaxSize(), Alignment.Center) { Text("Sin oportunidades", color = MaterialTheme.colorScheme.onSurfaceVariant) }
            } else {
                LazyColumn(Modifier.fillMaxSize(), contentPadding = PaddingValues(12.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    items(oportunidades, key = { it.rowKey }) { o ->
                        Card(shape = RoundedCornerShape(12.dp), modifier = Modifier.fillMaxWidth()) {
                            Column(Modifier.padding(14.dp)) {
                                Text(o.displayTitle, fontWeight = FontWeight.Bold)
                                Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                                    Text(o.stageKey, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                                    if (o.value > 0.0) Text(fmtMxnShort(o.value), fontWeight = FontWeight.Bold)
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
private fun CrmLeadCard(lead: CrmLeadDto) {
    val description = lead.displayTitle
    val branch = lead.branchName.ifBlank { lead.clientName }
    val status = lead.status
    val date = mStr(lead.raw, "createdAt", "fecha").take(10)
    Card(shape = RoundedCornerShape(12.dp), modifier = Modifier.fillMaxWidth()) {
        Column(Modifier.padding(14.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
            Text(description.take(60), fontWeight = FontWeight.SemiBold)
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
    val repo = remember(ctx) { CrmRepository(ctx.applicationContext) }
    var items by remember { mutableStateOf<List<mx.nexara.mobile.nativeapp.data.api.CrmOpportunityDto>>(emptyList()) }
    var isLoading by remember { mutableStateOf(true) }
    LaunchedEffect(repo) {
        isLoading = true
        items = runCatching { withContext(Dispatchers.IO) { repo.opportunityDtos() } }.getOrDefault(emptyList())
        isLoading = false
    }
    val stageOrder = OPPORTUNITY_STAGES.map { it.first }
    val grouped = remember(items) {
        val map = items.groupBy { it.stageKey }
        val ordered = stageOrder.mapNotNull { key ->
            val label = OPPORTUNITY_STAGES.firstOrNull { it.first == key }?.second ?: key
            val list = map[key] ?: map[label]
            if (list.isNullOrEmpty()) null else (label to list)
        }
        val extras = map.filterKeys { key ->
            stageOrder.none { it == key } && OPPORTUNITY_STAGES.none { it.second == key }
        }.toList().sortedBy { it.first }
        ordered + extras
    }
    val totalValue = items.sumOf { it.value }
    val weighted = items.sumOf { it.weightedValue }
    val won = items.count { it.isWon }

    LazyColumn(
        Modifier.fillMaxSize(),
        contentPadding = PaddingValues(12.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        item {
            Text("Pipeline comercial", style = MaterialTheme.typography.titleLarge, fontWeight = FontWeight.Bold)
            Text(
                "Valor · ponderado · conversión por etapa",
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }
        item {
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                CrmKpiMini(Modifier.weight(1f), "Pipeline", fmtMxnShort(totalValue))
                CrmKpiMini(Modifier.weight(1f), "Ponderado", fmtMxnShort(weighted))
                CrmKpiMini(Modifier.weight(1f), "Ganadas", "$won")
            }
        }
        if (isLoading) {
            item { Box(Modifier.fillMaxWidth().padding(40.dp), Alignment.Center) { CircularProgressIndicator() } }
        }
        grouped.forEach { (stage, stageItems) ->
            val stageValue = stageItems.sumOf { it.value }
            item {
                Row(Modifier.fillMaxWidth(), Arrangement.SpaceBetween, Alignment.CenterVertically) {
                    Text(stage, style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold)
                    Text(
                        "${stageItems.size} · ${fmtMxnShort(stageValue)}",
                        style = MaterialTheme.typography.labelMedium,
                        color = CrmGreen,
                        fontWeight = FontWeight.SemiBold,
                    )
                }
            }
            items(stageItems, key = { it.rowKey }) { o ->
                Card(Modifier.fillMaxWidth(), shape = RoundedCornerShape(12.dp)) {
                    Column(Modifier.padding(12.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                        Text(o.displayTitle, fontWeight = FontWeight.SemiBold)
                        Row(Modifier.fillMaxWidth(), Arrangement.SpaceBetween) {
                            Text(fmtMxnShort(o.value), color = CrmGreen, fontWeight = FontWeight.Bold)
                            if (o.probability > 0) {
                                Text("${o.probability.toInt()}% prob.", style = MaterialTheme.typography.labelSmall)
                            }
                        }
                        if (o.clientName.isNotBlank()) {
                            Text(o.clientName, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                        }
                    }
                }
            }
        }
        if (!isLoading && grouped.isEmpty()) {
            item {
                Text("Sin oportunidades en pipeline", color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
        }
    }
}

@Composable
private fun CrmKpiMini(modifier: Modifier, label: String, value: String) {
    Card(modifier = modifier, shape = RoundedCornerShape(12.dp)) {
        Column(Modifier.padding(10.dp)) {
            Text(label, style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
            Text(value, fontWeight = FontWeight.Bold, style = MaterialTheme.typography.titleSmall)
        }
    }
}

@Composable
fun VentasAgendaScreen() {
    val ctx = LocalContext.current
    val repo = remember(ctx) { CrmRepository(ctx.applicationContext) }
    var items by remember { mutableStateOf<List<mx.nexara.mobile.nativeapp.data.api.CalendarEventDto>>(emptyList()) }
    var loading by remember { mutableStateOf(true) }
    var query by remember { mutableStateOf("") }
    var selected by remember { mutableStateOf<mx.nexara.mobile.nativeapp.data.api.CalendarEventDto?>(null) }
    LaunchedEffect(repo) {
        loading = true
        items = runCatching { withContext(Dispatchers.IO) { repo.calendarEventDtos() } }.getOrDefault(emptyList())
        loading = false
    }

    if (selected != null) {
        val ev = selected!!
        LazyColumn(Modifier.fillMaxSize(), contentPadding = PaddingValues(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
            item { OutlinedButton(onClick = { selected = null }) { Text("← Agenda") } }
            item { Text(ev.displayTitle, style = MaterialTheme.typography.titleLarge, fontWeight = FontWeight.Bold) }
            item {
                Card(Modifier.fillMaxWidth()) {
                    Column(Modifier.padding(14.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                        DetailLine("Tipo", ev.type)
                        DetailLine("Inicio", ev.start.take(16))
                        DetailLine("Fin", ev.end.take(16))
                        DetailLine("Responsable", ev.ownerName)
                        DetailLine("Descripción", ev.description)
                        DetailLine("Ubicación", ev.location)
                        DetailLine("Resultado", ev.result)
                    }
                }
            }
        }
        return
    }
    val filtered = items.filter {
        query.isBlank() ||
            it.displayTitle.lowercase().contains(query.lowercase()) ||
            it.ownerName.lowercase().contains(query.lowercase())
    }
    LazyColumn(
        modifier = Modifier.fillMaxSize(),
        contentPadding = PaddingValues(12.dp),
        verticalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        item { CrmSearchField(query, { query = it }, "Buscar evento…") }
        when {
            loading -> item { Box(Modifier.fillMaxWidth().padding(40.dp), Alignment.Center) { CircularProgressIndicator() } }
            filtered.isEmpty() -> item { Text("Sin eventos", color = MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.padding(16.dp)) }
            else -> items(filtered, key = { it.rowKey }) { ev ->
                Card(Modifier.fillMaxWidth().clickable { selected = ev }, shape = RoundedCornerShape(12.dp)) {
                    Column(Modifier.padding(12.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                        Text(ev.displayTitle, fontWeight = FontWeight.SemiBold)
                        val date = ev.start.take(16)
                        if (date.isNotBlank()) Text(date, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                        if (ev.ownerName.isNotBlank()) Text(ev.ownerName, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                    }
                }
            }
        }
    }
}

@Composable
fun VentasTendersScreen() {
    val ctx = LocalContext.current
    val repo = remember(ctx) { CrmRepository(ctx.applicationContext) }
    var items by remember { mutableStateOf<List<mx.nexara.mobile.nativeapp.data.api.TenderDto>>(emptyList()) }
    var loading by remember { mutableStateOf(true) }
    var query by remember { mutableStateOf("") }
    var statusFilter by remember { mutableStateOf("todos") }
    var selected by remember { mutableStateOf<mx.nexara.mobile.nativeapp.data.api.TenderDto?>(null) }
    LaunchedEffect(repo) {
        loading = true
        items = runCatching { withContext(Dispatchers.IO) { repo.tenderDtos() } }.getOrDefault(emptyList())
        loading = false
    }

    if (selected != null) {
        val t = selected!!
        LazyColumn(Modifier.fillMaxSize(), contentPadding = PaddingValues(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
            item {
                Row(Modifier.fillMaxWidth(), Arrangement.SpaceBetween, Alignment.CenterVertically) {
                    OutlinedButton(onClick = { selected = null }) { Text("← Licitaciones") }
                    Text(t.status, color = CrmGreen, fontWeight = FontWeight.SemiBold)
                }
            }
            item { Text(t.displayTitle, style = MaterialTheme.typography.titleLarge, fontWeight = FontWeight.Bold) }
            item {
                Card(Modifier.fillMaxWidth()) {
                    Column(Modifier.padding(14.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                        DetailLine("Cliente", t.clientName)
                        DetailLine("Estado", t.status)
                        DetailLine("Monto", fmtMxnShort(t.amount))
                        DetailLine("Fecha límite", t.deadline.take(10))
                        DetailLine("Descripción", t.description)
                        DetailLine("Resultado", t.result)
                        DetailLine("Responsable", t.ownerName)
                    }
                }
            }
        }
        return
    }
    val allStatuses = listOf("todos") + items.map { it.statusLower }.filter { it.isNotBlank() }.distinct().sorted()
    val filtered = items.filter {
        (statusFilter == "todos" || it.status.equals(statusFilter, true)) &&
            (query.isBlank() || it.displayTitle.lowercase().contains(query.lowercase()) || it.clientName.lowercase().contains(query.lowercase()))
    }

    LazyColumn(Modifier.fillMaxSize().padding(16.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
        if (items.isNotEmpty()) item {
            Row(Modifier.fillMaxWidth(), Arrangement.spacedBy(8.dp)) {
                KpiChip("Total", "${items.size}", null, Modifier.weight(1f))
                KpiChip("Activas", "${items.count { it.isActive }}", Color(0xFF2E7D32), Modifier.weight(1f))
                KpiChip("Cerradas", "${items.count { it.isClosed }}", Color(0xFF64748B), Modifier.weight(1f))
            }
        }
        item { OutlinedTextField(value = query, onValueChange = { query = it }, placeholder = { Text("Buscar licitación…") }, singleLine = true, modifier = Modifier.fillMaxWidth()) }
        item { Row(Modifier.horizontalScroll(rememberScrollState()), horizontalArrangement = Arrangement.spacedBy(6.dp)) { allStatuses.forEach { s -> FilterChip(selected = statusFilter == s, onClick = { statusFilter = s }, label = { Text(s, style = MaterialTheme.typography.labelSmall) }) } } }
        if (loading) { item { LinearProgressIndicator(Modifier.fillMaxWidth()) }; return@LazyColumn }
        if (filtered.isEmpty()) { item { Text("Sin licitaciones", color = MaterialTheme.colorScheme.onSurfaceVariant) }; return@LazyColumn }
        items(filtered, key = { it.rowKey }) { t ->
            Card(Modifier.fillMaxWidth().clickable { selected = t }, shape = RoundedCornerShape(12.dp)) {
                Column(Modifier.padding(12.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                    Row(Modifier.fillMaxWidth(), Arrangement.SpaceBetween) {
                        Text(t.displayTitle, fontWeight = FontWeight.Bold, modifier = Modifier.weight(1f))
                        Text(t.status, color = CrmGreen, style = MaterialTheme.typography.labelSmall)
                    }
                    if (t.clientName.isNotBlank()) Text(t.clientName, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                    val dl = t.deadline.take(10); if (dl.isNotBlank()) Text("Vence: $dl", style = MaterialTheme.typography.labelSmall, color = Color(0xFFE65100))
                }
            }
        }
    }
}

@Composable
fun VentasTargetsScreen() {
    val ctx = LocalContext.current
    val repo = remember(ctx) { CrmRepository(ctx.applicationContext) }
    var items by remember { mutableStateOf<List<mx.nexara.mobile.nativeapp.data.api.SalesTargetDto>>(emptyList()) }
    var loading by remember { mutableStateOf(true) }
    var query by remember { mutableStateOf("") }
    LaunchedEffect(repo) {
        loading = true
        items = runCatching { withContext(Dispatchers.IO) { repo.salesTargetDtos() } }.getOrDefault(emptyList())
        loading = false
    }

    val totalTarget = items.sumOf { it.targetAmount }
    val totalActual = items.sumOf { it.actualAmount }
    val filtered = items.filter { query.isBlank() || it.ownerName.lowercase().contains(query.lowercase()) }

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
        items(filtered, key = { it.rowKey }) { t ->
            val pct = t.progress
            Card(Modifier.fillMaxWidth(), shape = RoundedCornerShape(12.dp)) {
                Column(Modifier.padding(12.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                    Row(Modifier.fillMaxWidth(), Arrangement.SpaceBetween) {
                        Text(t.ownerName, fontWeight = FontWeight.Bold)
                        Text(fmtMxnShort(t.actualAmount), fontWeight = FontWeight.Bold, color = if (pct >= 1f) Color(0xFF2E7D32) else Color(0xFFE65100))
                    }
                    Text("${t.year} / ${t.month}", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                    LinearProgressIndicator(progress = { pct }, modifier = Modifier.fillMaxWidth(), color = if (pct >= 1f) Color(0xFF2E7D32) else Color(0xFFE65100))
                    Text("Meta: ${fmtMxnShort(t.targetAmount)} · ${(pct * 100).toInt()}%", style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                }
            }
        }
    }
}

@Composable
fun VentasSalesTeamScreen() {
    val ctx = LocalContext.current
    val repo = remember(ctx) { CrmRepository(ctx.applicationContext) }
    var items by remember { mutableStateOf<List<mx.nexara.mobile.nativeapp.data.api.SalesTeamMemberDto>>(emptyList()) }
    var loading by remember { mutableStateOf(true) }
    var query by remember { mutableStateOf("") }
    LaunchedEffect(repo) {
        loading = true
        items = runCatching { withContext(Dispatchers.IO) { repo.salesTeamMemberDtos() } }.getOrDefault(emptyList())
        loading = false
    }

    val totalSales = items.sumOf { it.totalSales }
    val maxSales = items.maxOfOrNull { it.totalSales } ?: 1.0
    val filtered = items.filter { query.isBlank() || it.name.lowercase().contains(query.lowercase()) }

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
        items(filtered, key = { it.rowKey }) { v ->
            val pct = (if (maxSales > 0) v.totalSales / maxSales else 0.0).coerceIn(0.0, 1.0).toFloat()
            Card(Modifier.fillMaxWidth(), shape = RoundedCornerShape(12.dp)) {
                Column(Modifier.padding(12.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                    Row(Modifier.fillMaxWidth(), Arrangement.SpaceBetween, Alignment.CenterVertically) {
                        Column {
                            Text(v.name, fontWeight = FontWeight.Bold)
                            if (v.role.isNotBlank()) Text(v.role, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                        }
                        Text(fmtMxnShort(v.totalSales), fontWeight = FontWeight.Bold, color = Color(0xFF2E7D32))
                    }
                    if (v.totalLeads.isNotBlank() || v.totalOpps.isNotBlank()) Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                        if (v.totalLeads.isNotBlank()) Text("${v.totalLeads} leads", style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                        if (v.totalOpps.isNotBlank()) Text("${v.totalOpps} opps", style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
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
