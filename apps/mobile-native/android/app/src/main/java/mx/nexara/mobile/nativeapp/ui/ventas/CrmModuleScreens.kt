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

    if (state.selected != null) {
        val id = mStr(state.selected!!, "id").toLongOrNull()
        if (id != null) {
            VentasOpportunityDetailScreen(id = id, onBack = { vm.select(null) })
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
        CrmDetailScaffold(
            title = mStr(state.selected!!, "name", "nombre"),
            rows = listOf(
                "RFC" to mStr(state.selected!!, "rfc"),
                "Email" to mStr(state.selected!!, "email"),
                "Teléfono" to mStr(state.selected!!, "phone", "telefono"),
            ),
            onBack = { vm.select(null) },
        )
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
        Card(shape = RoundedCornerShape(12.dp), modifier = Modifier.fillMaxWidth()) {
            Column(Modifier.padding(14.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                Text(mStr(item, "name", "title", "nombre"), fontWeight = FontWeight.SemiBold)
                CrmStageChip(mStr(item, "status", "estado"))
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
fun VentasAgendaScreen() = CrmMapListScreen { repo -> repo.calendarEvents() }

@Composable
fun VentasTendersScreen() = CrmMapListScreen { repo -> repo.tenders() }

@Composable
fun VentasTargetsScreen() = CrmMapListScreen { repo -> repo.salesTargets() }

@Composable
fun VentasSalesTeamScreen() = CrmMapListScreen { repo -> repo.salesTeam() }

@Composable
private fun CrmMapListScreen(loader: suspend (CrmRepository) -> List<Map<String, Any?>>) {
    val ctx = LocalContext.current
    val repo = remember(ctx) { CrmRepository(ctx.applicationContext) }
    var items by remember { mutableStateOf<List<Map<String, Any?>>>(emptyList()) }
    var loading by remember { mutableStateOf(true) }
    LaunchedEffect(repo) {
        loading = true
        items = runCatching { withContext(Dispatchers.IO) { loader(repo) } }.getOrDefault(emptyList())
        loading = false
    }
    CrmListScaffold(
        isLoading = loading,
        error = null,
        onRetry = { },
        query = "",
        onQuery = {},
        placeholder = "",
        emptyText = "Sin datos",
        items = items,
        key = { mStr(it, "id") },
        showSearch = false,
    ) { item ->
        Card(shape = RoundedCornerShape(12.dp), modifier = Modifier.fillMaxWidth()) {
            Column(Modifier.padding(14.dp)) {
                Text(mStr(item, "title", "name", "nombre", "subject"), fontWeight = FontWeight.SemiBold)
                Text(mStr(item, "status", "estatus", "startAt", "deadline"), style = MaterialTheme.typography.bodySmall)
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
