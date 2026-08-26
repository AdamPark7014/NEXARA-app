package mx.nexara.mobile.nativeapp.ui.ventas

import android.app.Application
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.combinedClickable
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.Check
import androidx.compose.material.icons.filled.Clear
import androidx.compose.material.icons.filled.MoreVert
import androidx.compose.material.icons.filled.Search
import androidx.compose.material3.*
import androidx.compose.material3.pulltorefresh.PullToRefreshBox
import androidx.compose.foundation.ExperimentalFoundationApi
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.KeyboardType
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
import mx.nexara.mobile.nativeapp.data.api.CrmSalesProjectDto
import mx.nexara.mobile.nativeapp.data.api.CotizacionDto
import mx.nexara.mobile.nativeapp.data.api.ProcParse
import mx.nexara.mobile.nativeapp.ui.enterprise.NxColors
import mx.nexara.mobile.nativeapp.ui.enterprise.NxKpi
import mx.nexara.mobile.nativeapp.ui.enterprise.NxKpiGrid
import mx.nexara.mobile.nativeapp.ui.enterprise.NxTone
import mx.nexara.mobile.nativeapp.ui.enterprise.NxEmptyState
import mx.nexara.mobile.nativeapp.ui.enterprise.NxErrorBlock
import mx.nexara.mobile.nativeapp.ui.enterprise.NxFormTextField
import mx.nexara.mobile.nativeapp.ui.enterprise.NxLoadingBlock
import mx.nexara.mobile.nativeapp.ui.enterprise.NxPanelShell
import mx.nexara.mobile.nativeapp.ui.enterprise.NxSearchField
import mx.nexara.mobile.nativeapp.ui.enterprise.NxSectionHeader
import mx.nexara.mobile.nativeapp.ui.enterprise.requiredFieldError

// ── Shared helpers ────────────────────────────────────────────────────────────

private val CrmGreen = Color(0xFF10B981)

private val CLIENT_INDUSTRIES = listOf(
    "Corporativo", "Gobierno", "PyME", "Hogar", "Retail", "Industrial", "Educación", "Salud", "Otro",
)
private val CLIENT_STATUSES = listOf("Activo", "Inactivo", "Prospecto")

private fun hasServiceClientLinked(raw: Map<String, Any?>): Boolean {
    val v = raw["serviceClientId"] ?: return false
    return when (v) {
        is Number -> v.toLong() > 0L
        is String -> v.isNotBlank() && v != "0" && v != "null"
        else -> false
    }
}

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
private fun CrmStageChip(stageKey: String) {
    val color = pipelineStageColor(stageKey)
    val label = pipelineStageLabel(stageKey)
    Surface(shape = RoundedCornerShape(999.dp), color = color.copy(alpha = 0.12f)) {
        Text(
            label,
            modifier = Modifier.padding(horizontal = 10.dp, vertical = 4.dp),
            style = MaterialTheme.typography.labelSmall,
            color = color,
            fontWeight = FontWeight.SemiBold,
        )
    }
}

// ── Oportunidades ─────────────────────────────────────────────────────────────

data class CrmListUiState<T>(
    val isLoading: Boolean = true,
    val isRefreshing: Boolean = false,
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

    fun refresh(pull: Boolean = false) {
        _state.update {
            if (pull) it.copy(isRefreshing = true, error = null)
            else it.copy(isLoading = true, error = null)
        }
        viewModelScope.launch {
            try {
                val list = withContext(Dispatchers.IO) { repo.opportunityDtos() }
                _state.update { it.copy(isLoading = false, isRefreshing = false, items = list) }
            } catch (e: Exception) {
                _state.update { it.copy(isLoading = false, isRefreshing = false, error = e.message) }
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

    fun updateStage(id: Long, stage: String, onDone: () -> Unit = {}) {
        viewModelScope.launch {
            try {
                withContext(Dispatchers.IO) { repo.updateOpportunityStage(id, stage) }
                refresh()
                onDone()
            } catch (e: Exception) {
                _state.update { it.copy(error = e.message) }
            }
        }
    }

    fun deleteOpportunity(id: Long, onDone: () -> Unit = {}) {
        viewModelScope.launch {
            try {
                withContext(Dispatchers.IO) { repo.deleteOpportunity(id) }
                refresh()
                onDone()
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

@OptIn(ExperimentalFoundationApi::class)
@Composable
fun VentasOportunidadesScreen() {
    val ctx = LocalContext.current
    val vm: CrmOportunidadesViewModel = viewModel(factory = crmVmFactory<CrmOportunidadesViewModel>(ctx))
    val state by vm.state.collectAsState()
    val items by remember { derivedStateOf { vm.filtered } }
    var showCreate by remember { mutableStateOf(false) }
    var createForm by remember { mutableStateOf(OpportunityFormState()) }
    var creating by remember { mutableStateOf(false) }
    var menuOpp by remember { mutableStateOf<CrmOpportunityDto?>(null) }
    var stageDialogOpp by remember { mutableStateOf<CrmOpportunityDto?>(null) }
    var deleteDialogOpp by remember { mutableStateOf<CrmOpportunityDto?>(null) }

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
                isRefreshing = state.isRefreshing,
                error = state.error,
                onRetry = vm::refresh,
                onRefresh = { vm.refresh(pull = true) },
                query = state.query,
                onQuery = vm::setQuery,
                placeholder = "Buscar oportunidad…",
                emptyText = "Sin oportunidades",
                emptySubtitle = "Crea la primera oportunidad con el botón + para iniciar tu pipeline.",
                sectionTitle = "Oportunidades",
                sectionSubtitle = "${state.items.size} en total",
                loadingMessage = "Cargando oportunidades…",
                items = items,
                key = { it.rowKey },
            ) { item ->
                var menuExpanded by remember(item.rowKey) { mutableStateOf(false) }
                Box {
                    NxPanelShell(
                        modifier = Modifier.combinedClickable(
                            onClick = { vm.select(item) },
                            onLongClick = { menuExpanded = true },
                        ),
                    ) {
                        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween, verticalAlignment = Alignment.CenterVertically) {
                            Text(item.displayTitle, fontWeight = FontWeight.SemiBold, modifier = Modifier.weight(1f))
                            IconButton(onClick = { menuExpanded = true }, modifier = Modifier.size(32.dp)) {
                                Icon(Icons.Default.MoreVert, contentDescription = "Acciones", modifier = Modifier.size(18.dp))
                            }
                        }
                        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                            CrmStageChip(item.stageKey)
                            Text(fmtMxnShort(item.value), fontWeight = FontWeight.Bold)
                        }
                    }
                    DropdownMenu(expanded = menuExpanded, onDismissRequest = { menuExpanded = false }) {
                        DropdownMenuItem(
                            text = { Text("Ver detalle") },
                            onClick = { menuExpanded = false; vm.select(item) },
                        )
                        DropdownMenuItem(
                            text = { Text("Mover etapa") },
                            onClick = { menuExpanded = false; stageDialogOpp = item },
                        )
                        DropdownMenuItem(
                            text = { Text("Marcar ganada") },
                            onClick = { menuExpanded = false; vm.updateStage(item.id, "WON") },
                        )
                        DropdownMenuItem(
                            text = { Text("Marcar perdida") },
                            onClick = { menuExpanded = false; vm.updateStage(item.id, "LOST") },
                        )
                        DropdownMenuItem(
                            text = { Text("Eliminar", color = MaterialTheme.colorScheme.error) },
                            onClick = { menuExpanded = false; deleteDialogOpp = item },
                        )
                    }
                }
            }
        }
    }

    val stageOpp = stageDialogOpp
    if (stageOpp != null) {
        var pickedStage by remember(stageOpp.id) { mutableStateOf(stageOpp.stage.ifBlank { OPPORTUNITY_STAGES.first().first }) }
        AlertDialog(
            onDismissRequest = { stageDialogOpp = null },
            title = { Text("Mover etapa") },
            text = {
                Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    Text(stageOpp.displayTitle, fontWeight = FontWeight.SemiBold)
                    OPPORTUNITY_STAGES.forEach { (id, label) ->
                        val color = pipelineStageColor(id)
                        Row(
                            Modifier.fillMaxWidth().clickable { pickedStage = id },
                            verticalAlignment = Alignment.CenterVertically,
                        ) {
                            RadioButton(selected = pickedStage == id, onClick = { pickedStage = id })
                            Box(Modifier.size(10.dp).clip(RoundedCornerShape(999.dp)).background(color))
                            Spacer(Modifier.width(8.dp))
                            Text(label)
                        }
                    }
                }
            },
            confirmButton = {
                Button(onClick = {
                    vm.updateStage(stageOpp.id, pickedStage) { stageDialogOpp = null }
                }) { Text("Guardar") }
            },
            dismissButton = {
                TextButton(onClick = { stageDialogOpp = null }) { Text("Cancelar") }
            },
        )
    }

    val deleteOpp = deleteDialogOpp
    if (deleteOpp != null) {
        AlertDialog(
            onDismissRequest = { deleteDialogOpp = null },
            title = { Text("Eliminar oportunidad") },
            text = { Text("¿Eliminar \"${deleteOpp.displayTitle}\"? Esta acción no se puede deshacer.") },
            confirmButton = {
                Button(
                    onClick = { vm.deleteOpportunity(deleteOpp.id) { deleteDialogOpp = null } },
                    colors = ButtonDefaults.buttonColors(containerColor = MaterialTheme.colorScheme.error),
                ) { Text("Eliminar") }
            },
            dismissButton = {
                TextButton(onClick = { deleteDialogOpp = null }) { Text("Cancelar") }
            },
        )
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

    fun refresh(pull: Boolean = false) {
        _state.update {
            if (pull) it.copy(isRefreshing = true, error = null)
            else it.copy(isLoading = true, error = null)
        }
        viewModelScope.launch {
            try {
                val list = withContext(Dispatchers.IO) { repo.clientDtos() }
                _state.update { it.copy(isLoading = false, isRefreshing = false, items = list) }
            } catch (e: Exception) {
                _state.update { it.copy(isLoading = false, isRefreshing = false, error = e.message) }
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
        isRefreshing = state.isRefreshing,
        error = state.error,
        onRetry = vm::refresh,
        onRefresh = { vm.refresh(pull = true) },
        query = state.query,
        onQuery = vm::setQuery,
        placeholder = "Buscar cliente…",
        emptyText = "Sin clientes",
        emptySubtitle = "Los clientes comerciales sincronizados desde el CRM aparecerán en esta lista.",
        sectionTitle = "Clientes",
        sectionSubtitle = "${state.items.size} registrados",
        loadingMessage = "Cargando clientes…",
        items = items,
        key = { it.rowKey },
    ) { item ->
        NxPanelShell(onClick = { vm.select(item) }) {
            Text(item.displayName, fontWeight = FontWeight.SemiBold)
            Text(item.subtitle, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
        }
    }
}

@Composable
fun VentasClientDetailByIdScreen(clientId: Long, onBack: () -> Unit) {
    val ctx = LocalContext.current
    val repo = remember(ctx) { CrmRepository(ctx.applicationContext) }
    var client by remember { mutableStateOf<CrmClientDto?>(null) }
    var loading by remember { mutableStateOf(true) }
    var error by remember { mutableStateOf<String?>(null) }

    LaunchedEffect(clientId) {
        loading = true
        error = null
        runCatching {
            withContext(Dispatchers.IO) {
                CrmClientDto.fromRaw(repo.getClientDetail(clientId))
            }
        }.onSuccess { dto ->
            client = dto
            loading = false
            if (dto.id <= 0L) error = "Cliente no encontrado"
        }.onFailure {
            error = it.message?.takeIf { m -> m.isNotBlank() } ?: "No se pudo cargar el cliente"
            loading = false
        }
    }

    when {
        loading -> NxLoadingBlock("Cargando cliente…")
        client != null -> CrmClientDetailScreen(client = client!!, onBack = onBack)
        else -> Column(
            Modifier.fillMaxSize().padding(16.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            OutlinedButton(onClick = onBack) { Text("← Volver") }
            Text(error ?: "Cliente no encontrado", color = MaterialTheme.colorScheme.error)
        }
    }
}

// ── Productos ─────────────────────────────────────────────────────────────────

class CrmProductsViewModel(app: Application) : AndroidViewModel(app) {
    private val repo = CrmRepository(app.applicationContext)
    private val _state = MutableStateFlow(CrmListUiState<CrmProductDto>())
    val state: StateFlow<CrmListUiState<CrmProductDto>> = _state

    init { refresh() }

    fun refresh(pull: Boolean = false) {
        _state.update {
            if (pull) it.copy(isRefreshing = true, error = null)
            else it.copy(isLoading = true, error = null)
        }
        viewModelScope.launch {
            try {
                val q = _state.value.query.ifBlank { null }
                val list = withContext(Dispatchers.IO) { repo.productDtos(q) }
                _state.update { it.copy(isLoading = false, isRefreshing = false, items = list) }
            } catch (e: Exception) {
                _state.update { it.copy(isLoading = false, isRefreshing = false, error = e.message) }
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
    var categoryFilter by remember { mutableStateOf("todos") }

    if (selected != null) {
        ProductDetailView(product = selected!!, onBack = { selected = null })
        return
    }

    val categories = remember(state.items) {
        listOf("todos") + state.items.map { mStr(it.raw, "category", "categoria", "subcategory") }
            .filter { it.isNotBlank() }.distinct().sorted()
    }
    val filtered = state.items.filter { p ->
        val cat = mStr(p.raw, "category", "categoria", "subcategory")
        categoryFilter == "todos" || cat.equals(categoryFilter, true)
    }
    val avgPrice = if (state.items.isEmpty()) 0.0 else state.items.map { it.price }.average()

    Column(Modifier.fillMaxSize()) {
        if (!state.isLoading && state.items.isNotEmpty()) {
            Row(
                Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 8.dp),
                horizontalArrangement = Arrangement.SpaceEvenly,
            ) {
                CrmProductsKpi("Productos", "${state.items.size}")
                CrmProductsKpi("Categorías", "${categories.size - 1}")
                CrmProductsKpi("Precio prom.", fmtMxnShort(avgPrice))
            }
        }
        if (categories.size > 2) {
            Row(
                Modifier.horizontalScroll(rememberScrollState()).padding(horizontal = 12.dp),
                horizontalArrangement = Arrangement.spacedBy(8.dp),
            ) {
                categories.forEach { cat ->
                    FilterChip(
                        selected = categoryFilter == cat,
                        onClick = { categoryFilter = cat },
                        label = { Text(if (cat == "todos") "Todos" else cat, fontSize = 12.sp) },
                    )
                }
            }
            Spacer(Modifier.height(4.dp))
        }
        Box(Modifier.weight(1f)) {
            CrmListScaffold(
                isLoading = state.isLoading,
                isRefreshing = state.isRefreshing,
                error = state.error,
                onRetry = vm::refresh,
                onRefresh = { vm.refresh(pull = true) },
                query = state.query,
                onQuery = vm::setQuery,
                placeholder = "Buscar producto…",
                emptyText = "Sin productos",
                emptySubtitle = "El catálogo comercial aparecerá aquí cuando esté disponible.",
                sectionTitle = "Catálogo",
                sectionSubtitle = "${filtered.size} productos",
                loadingMessage = "Cargando productos…",
                showSearch = true,
                items = filtered,
                key = { it.rowKey },
            ) { item ->
            val brand = productBrandLabel(item.raw)
            NxPanelShell(onClick = { selected = item }) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Column(Modifier.weight(1f)) {
                        Text(item.displayName, fontWeight = FontWeight.SemiBold)
                        Text(
                            listOfNotNull(item.sku.takeIf { it.isNotBlank() }, brand.takeIf { it.isNotBlank() })
                                .joinToString(" · "),
                            style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                        )
                    }
                    Text(fmtMxnShort(item.price), fontWeight = FontWeight.Bold)
                }
            }
            }
        }
    }
}

@Composable
private fun CrmProductsKpi(label: String, value: String) {
    Column(horizontalAlignment = Alignment.CenterHorizontally) {
        Text(value, fontWeight = FontWeight.Bold, fontSize = 16.sp, color = CrmGreen)
        Text(label, fontSize = 10.sp, color = MaterialTheme.colorScheme.onSurfaceVariant)
    }
}

private fun productBrandLabel(raw: Map<String, Any?>): String {
    val brand = raw["brand"]
    return when (brand) {
        is Map<*, *> -> mStr(brand as Map<String, Any?>, "name", "nombre")
        else -> mStr(raw, "brandName", "marca")
    }
}

@Composable
private fun ProductDetailView(product: CrmProductDto, onBack: () -> Unit) {
    val raw = product.raw
    val brand = productBrandLabel(raw)
    val stockTotal = productStockTotal(raw)
    LazyColumn(modifier = Modifier.fillMaxSize(), contentPadding = PaddingValues(12.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
        item { OutlinedButton(onClick = onBack) { Text("← Productos") } }
        item {
            Card(Modifier.fillMaxWidth()) {
                Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    Text(product.displayName, fontWeight = FontWeight.Bold, fontSize = 18.sp)
                    HorizontalDivider()
                    ProductRow("SKU / Código", product.sku)
                    ProductRow("Precio", fmtMxnShort(product.price))
                    ProductRow("Marca", brand)
                    ProductRow("Categoría", mStr(raw, "category", "categoria"))
                    ProductRow("Subcategoría", mStr(raw, "subcategory", "subcategoria"))
                    ProductRow("Stock", stockTotal ?: mStr(raw, "stock", "quantity", "inventario"))
                    ProductRow("Unidad", mStr(raw, "unit", "unidad", "unitName"))
                    mDouble(raw, "cost", "costo")?.let { ProductRow("Costo", fmtMxnShort(it)) }
                    ProductRow("Estado", if (raw["activo"] == false || raw["isActive"] == false) "Inactivo" else "Activo")
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

@Suppress("UNCHECKED_CAST")
private fun productStockTotal(raw: Map<String, Any?>): String? {
    val levels = raw["stockLevels"] as? List<*> ?: return null
    val total = levels.mapNotNull { row ->
        (row as? Map<String, Any?>)?.get("quantity")?.let {
            when (it) {
                is Number -> it.toDouble()
                is String -> it.toDoubleOrNull()
                else -> null
            }
        }
    }.sum()
    return if (total > 0) String.format("%,.0f u.", total) else null
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

    fun refresh(pull: Boolean = false) {
        _state.update {
            if (pull) it.copy(isRefreshing = true, error = null)
            else it.copy(isLoading = true, error = null)
        }
        viewModelScope.launch {
            try {
                val list = withContext(Dispatchers.IO) { repo.projectDtos() }
                _state.update { it.copy(isLoading = false, isRefreshing = false, items = list) }
            } catch (e: Exception) {
                _state.update { it.copy(isLoading = false, isRefreshing = false, error = e.message) }
            }
        }
    }

    fun setQuery(q: String) = _state.update { it.copy(query = q) }

    val filtered: List<CrmSalesProjectDto> get() {
        val q = _state.value.query.trim().lowercase()
        if (q.isBlank()) return _state.value.items
        return _state.value.items.filter {
            it.displayName.lowercase().contains(q) ||
                it.clientName.lowercase().contains(q) ||
                it.status.lowercase().contains(q)
        }
    }
}

@Composable
fun VentasProyectosScreen() {
    val ctx = LocalContext.current
    val vm: CrmProyectosViewModel = viewModel(factory = crmVmFactory<CrmProyectosViewModel>(ctx))
    val state by vm.state.collectAsState()
    var selected by remember { mutableStateOf<CrmSalesProjectDto?>(null) }
    val items by remember { derivedStateOf { vm.filtered } }

    if (selected != null) {
        CrmProjectDetailScreen(project = selected!!, onBack = { selected = null })
        return
    }

    CrmListScaffold(
        isLoading = state.isLoading,
        isRefreshing = state.isRefreshing,
        error = state.error,
        onRetry = vm::refresh,
        onRefresh = { vm.refresh(pull = true) },
        query = state.query,
        onQuery = vm::setQuery,
        placeholder = "Buscar proyecto…",
        emptyText = "Sin proyectos",
        emptySubtitle = "Los proyectos comerciales vinculados a oportunidades aparecerán aquí.",
        sectionTitle = "Proyectos comerciales",
        sectionSubtitle = "${items.size} activos",
        loadingMessage = "Cargando proyectos…",
        items = items,
        key = { it.rowKey },
    ) { item ->
        NxPanelShell(onClick = { selected = item }) {
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

@Composable
private fun CrmProjectDetailScreen(project: CrmSalesProjectDto, onBack: () -> Unit) {
    val ctx = LocalContext.current
    var tab by remember { mutableIntStateOf(0) }
    val tabs = listOf("Info", "Oportunidad", "Cotizaciones", "Costos", "Orden")
    val raw = project.raw
    var summary by remember { mutableStateOf<Map<String, Any?>?>(null) }
    var linkedQuotes by remember { mutableStateOf<List<CotizacionDto>>(emptyList()) }
    var loadingLinks by remember { mutableStateOf(true) }

    LaunchedEffect(project.id) {
        loadingLinks = true
        val crm = CrmRepository(ctx.applicationContext)
        val summaryResult = runCatching {
            withContext(Dispatchers.IO) { crm.getProjectSummary(project.id) }
        }.getOrNull()
        summary = summaryResult
        @Suppress("UNCHECKED_CAST")
        val opp = summaryResult?.get("opportunity") as? Map<String, Any?>
        val oppId = ProcParse.lng(opp?.get("id"))
        val allCots = runCatching { withContext(Dispatchers.IO) { crm.cotizaciones() } }.getOrDefault(emptyList())
        linkedQuotes = allCots.filter { cot ->
            (oppId != null && cot.opportunityId == oppId) ||
                (!project.displayName.isBlank() && cot.projectName?.equals(project.displayName, ignoreCase = true) == true)
        }
        loadingLinks = false
    }

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
            tabs.forEachIndexed { i, t -> Tab(selected = tab == i, onClick = { tab = i }, text = { Text(t, fontSize = 11.sp) }) }
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
                @Suppress("UNCHECKED_CAST")
                val opp = summary?.get("opportunity") as? Map<String, Any?>
                if (loadingLinks) {
                    Box(Modifier.fillMaxSize(), Alignment.Center) { NxLoadingBlock("Cargando oportunidad…") }
                } else if (opp == null) {
                    Box(Modifier.fillMaxSize(), Alignment.Center) { Text("Sin oportunidad vinculada", color = MaterialTheme.colorScheme.onSurfaceVariant) }
                } else {
                    LazyColumn(Modifier.fillMaxSize(), contentPadding = PaddingValues(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                        item { Text(mStr(opp, "title"), fontWeight = FontWeight.Bold, fontSize = 18.sp) }
                        item { CrmStageChip(mStr(opp, "stage")) }
                        item {
                            @Suppress("UNCHECKED_CAST")
                            val client = opp["client"] as? Map<String, Any?>
                            if (client != null) {
                                Text("Cliente: ${mStr(client, "name", "legalName")}", style = MaterialTheme.typography.bodyMedium)
                            }
                        }
                    }
                }
            }
            2 -> if (loadingLinks) {
                Box(Modifier.fillMaxSize(), Alignment.Center) { NxLoadingBlock("Cargando cotizaciones…") }
            } else if (linkedQuotes.isEmpty()) {
                Box(Modifier.fillMaxSize(), Alignment.Center) { Text("Sin cotizaciones vinculadas", color = MaterialTheme.colorScheme.onSurfaceVariant) }
            } else {
                LazyColumn(Modifier.fillMaxSize(), contentPadding = PaddingValues(12.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    items(linkedQuotes, key = { it.id }) { cot ->
                        Card(Modifier.fillMaxWidth(), shape = RoundedCornerShape(12.dp)) {
                            Column(Modifier.padding(14.dp)) {
                                Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                                    Text(cot.folio ?: "Cot #${cot.id}", fontWeight = FontWeight.Bold)
                                    Text(fmtMxnShort(cot.total ?: 0.0), fontWeight = FontWeight.Bold)
                                }
                                Text(cotStatusLabel(cot.estatus.orEmpty()), style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                            }
                        }
                    }
                }
            }
            3 -> {
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

// ── Shared composables ────────────────────────────────────────────────────────

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun <T> CrmListScaffold(
    isLoading: Boolean,
    isRefreshing: Boolean = false,
    error: String?,
    onRetry: () -> Unit,
    onRefresh: () -> Unit = onRetry,
    query: String,
    onQuery: (String) -> Unit,
    placeholder: String,
    emptyText: String,
    emptySubtitle: String = "Los registros aparecerán aquí al sincronizar con el CRM.",
    sectionTitle: String? = null,
    sectionSubtitle: String? = null,
    loadingMessage: String = "Cargando…",
    items: List<T>,
    key: (T) -> String,
    showSearch: Boolean = true,
    row: @Composable (T) -> Unit,
) {
    PullToRefreshBox(
        isRefreshing = isRefreshing,
        onRefresh = onRefresh,
        modifier = Modifier.fillMaxSize(),
    ) {
        LazyColumn(
            modifier = Modifier.fillMaxSize().background(NxColors.Surface),
            contentPadding = PaddingValues(12.dp),
            verticalArrangement = Arrangement.spacedBy(8.dp),
        ) {
            if (sectionTitle != null) {
                item { NxSectionHeader(sectionTitle, sectionSubtitle) }
            }
            if (showSearch) {
                item { NxSearchField(value = query, onValueChange = onQuery, placeholder = placeholder) }
            }
            when {
                isLoading && !isRefreshing -> item { NxLoadingBlock(loadingMessage) }
                !error.isNullOrBlank() && items.isEmpty() -> item { NxErrorBlock(error, onRetry) }
                items.isEmpty() -> item {
                    NxEmptyState(
                        title = emptyText,
                        subtitle = if (query.isNotBlank()) {
                            "No hay coincidencias para \"$query\". Prueba otro término o limpia el filtro."
                        } else {
                            emptySubtitle
                        },
                    )
                }
                else -> items(items, key = key) { row(it) }
            }
        }
    }
}

@Composable
private fun CrmClientDatosEditScreen(
    client: CrmClientDto,
    saving: Boolean,
    error: String?,
    onDismiss: () -> Unit,
    onSave: (Map<String, Any?>) -> Unit,
) {
    val raw = client.raw
    var name by remember(client.id) { mutableStateOf(client.name.ifBlank { mStr(raw, "name", "nombre") }) }
    var legalName by remember(client.id) { mutableStateOf(mStr(raw, "legalName", "razonSocial")) }
    var taxId by remember(client.id) { mutableStateOf(client.rfc.ifBlank { mStr(raw, "taxId", "rfc") }) }
    var billingEmail by remember(client.id) { mutableStateOf(client.email.ifBlank { mStr(raw, "billingEmail", "email") }) }
    var billingPhone by remember(client.id) {
        mutableStateOf(client.phone.ifBlank { mStr(raw, "billingPhone", "telefono", "phone") })
    }
    var industry by remember(client.id) { mutableStateOf(mStr(raw, "industry").ifBlank { "PyME" }) }
    var status by remember(client.id) { mutableStateOf(mStr(raw, "status", "estatus").ifBlank { "Prospecto" }) }
    var fiscalAddress by remember(client.id) { mutableStateOf(mStr(raw, "fiscalAddress")) }
    var fiscalZipCode by remember(client.id) { mutableStateOf(mStr(raw, "fiscalZipCode")) }
    var fiscalRegime by remember(client.id) { mutableStateOf(mStr(raw, "fiscalRegime").ifBlank { "601" }) }
    var website by remember(client.id) { mutableStateOf(mStr(raw, "website")) }
    var notes by remember(client.id) { mutableStateOf(mStr(raw, "notes", "notas")) }

    val nameError = requiredFieldError(name, "Nombre comercial")
    val canSave = nameError == null && !saving

    Column(Modifier.fillMaxSize().background(NxColors.Surface)) {
        Row(
            Modifier.fillMaxWidth().padding(12.dp),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically,
        ) {
            OutlinedButton(onClick = onDismiss, enabled = !saving) { Text("Cancelar") }
            Text("Editar cliente", style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold)
            Button(
                onClick = {
                    onSave(
                        mapOf(
                            "name" to name.trim(),
                            "legalName" to legalName.trim(),
                            "taxId" to taxId.trim(),
                            "billingEmail" to billingEmail.trim(),
                            "billingPhone" to billingPhone.trim(),
                            "industry" to industry,
                            "status" to status,
                            "fiscalAddress" to fiscalAddress.trim(),
                            "fiscalZipCode" to fiscalZipCode.trim(),
                            "fiscalRegime" to fiscalRegime.trim(),
                            "website" to website.trim(),
                            "notes" to notes.trim(),
                        ),
                    )
                },
                enabled = canSave,
            ) { Text(if (saving) "Guardando…" else "Guardar") }
        }
        Column(
            Modifier
                .fillMaxSize()
                .verticalScroll(rememberScrollState())
                .padding(horizontal = 16.dp),
            verticalArrangement = Arrangement.spacedBy(8.dp),
        ) {
            if (!error.isNullOrBlank()) {
                Text(error, color = MaterialTheme.colorScheme.error, style = MaterialTheme.typography.bodySmall)
            }
            NxFormTextField(value = name, onValueChange = { name = it }, label = "Nombre comercial *", error = nameError)
            NxFormTextField(value = legalName, onValueChange = { legalName = it }, label = "Razón social")
            NxFormTextField(value = taxId, onValueChange = { taxId = it }, label = "RFC")
            NxFormTextField(value = fiscalZipCode, onValueChange = { fiscalZipCode = it }, label = "CP fiscal (CFDI)")
            NxFormTextField(value = fiscalRegime, onValueChange = { fiscalRegime = it }, label = "Régimen fiscal")
            NxFormTextField(value = website, onValueChange = { website = it }, label = "Sitio web", keyboardType = KeyboardType.Uri)
            NxFormTextField(
                value = billingEmail,
                onValueChange = { billingEmail = it },
                label = "Email facturación",
                keyboardType = KeyboardType.Email,
            )
            NxFormTextField(
                value = billingPhone,
                onValueChange = { billingPhone = it },
                label = "Teléfono",
                keyboardType = KeyboardType.Phone,
            )
            NxFormTextField(value = fiscalAddress, onValueChange = { fiscalAddress = it }, label = "Dirección fiscal")
            NxSectionHeader("Industria")
            Row(Modifier.horizontalScroll(rememberScrollState()), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                CLIENT_INDUSTRIES.forEach { ind ->
                    FilterChip(
                        selected = industry == ind,
                        onClick = { industry = ind },
                        label = { Text(ind, fontSize = 11.sp) },
                    )
                }
            }
            NxSectionHeader("Estado")
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                CLIENT_STATUSES.forEach { st ->
                    FilterChip(
                        selected = status == st,
                        onClick = { status = st },
                        label = { Text(st) },
                    )
                }
            }
            NxFormTextField(
                value = notes,
                onValueChange = { notes = it },
                label = "Notas internas",
                singleLine = false,
                minLines = 3,
                imeAction = ImeAction.Done,
            )
            Spacer(Modifier.height(24.dp))
        }
    }
}

@Composable
fun CrmClientDetailScreen(client: CrmClientDto, onBack: () -> Unit) {
    val ctx = LocalContext.current
    val scope = rememberCoroutineScope()
    val crmRepo = remember(ctx) { CrmRepository(ctx.applicationContext) }
    var currentClient by remember(client.id) { mutableStateOf(client) }
    var showEdit by remember { mutableStateOf(false) }
    var saving by remember { mutableStateOf(false) }
    var provisioning by remember { mutableStateOf(false) }
    var actionMessage by remember { mutableStateOf<String?>(null) }
    var reloadKey by remember { mutableIntStateOf(0) }

    val clientName = currentClient.displayName
    val hasServiceClient = hasServiceClientLinked(currentClient.raw)
    var tab by remember { mutableIntStateOf(0) }
    var cotizaciones by remember { mutableStateOf<List<CotizacionDto>>(emptyList()) }
    var oportunidades by remember { mutableStateOf<List<CrmOpportunityDto>>(emptyList()) }
    var tickets by remember { mutableStateOf<List<Map<String, Any?>>>(emptyList()) }
    var servicios by remember { mutableStateOf<List<Map<String, Any?>>>(emptyList()) }
    var facturas by remember { mutableStateOf<List<Map<String, Any?>>>(emptyList()) }
    var sucursales by remember { mutableStateOf<List<Map<String, Any?>>>(emptyList()) }
    var snapshotStats by remember { mutableStateOf<Map<String, Any?>?>(null) }
    var timelineEvents by remember { mutableStateOf<List<Triple<String, String, String>>>(emptyList()) }
    var healthLabel by remember { mutableStateOf("") }
    var healthScore by remember { mutableIntStateOf(0) }
    var loading by remember { mutableStateOf(true) }

    suspend fun reloadClientDto() {
        val detail = withContext(Dispatchers.IO) { crmRepo.getClientDetail(currentClient.id) }
        currentClient = CrmClientDto.fromRaw(detail)
    }

    if (showEdit) {
        CrmClientDatosEditScreen(
            client = currentClient,
            saving = saving,
            error = actionMessage,
            onDismiss = {
                showEdit = false
                actionMessage = null
            },
            onSave = { fields ->
                scope.launch {
                    saving = true
                    actionMessage = null
                    runCatching {
                        withContext(Dispatchers.IO) { crmRepo.updateClient(currentClient.id, fields) }
                    }.onSuccess {
                        reloadClientDto()
                        reloadKey++
                        showEdit = false
                        actionMessage = null
                    }.onFailure {
                        actionMessage = it.message?.takeIf { m -> m.isNotBlank() } ?: "No se pudo guardar el cliente"
                    }
                    saving = false
                }
            },
        )
        return
    }

    LaunchedEffect(currentClient.id, reloadKey) {
        loading = true
        val crm = CrmRepository(ctx.applicationContext)
        val snap = runCatching {
            withContext(Dispatchers.IO) { crm.getClientSnapshot(currentClient.id) }
        }.getOrNull()
        if (snap != null) {
            @Suppress("UNCHECKED_CAST")
            val stats = snap["stats"] as? Map<String, Any?>
            snapshotStats = stats
            val status = mStr(currentClient.raw, "status", "estatus")
            val (score, label) = computeClientHealth(stats, status)
            healthScore = score
            healthLabel = label
            @Suppress("UNCHECKED_CAST")
            oportunidades = (snap["opportunities"] as? List<Map<String, Any?>>)
                ?.map { CrmOpportunityDto.fromRaw(it) }.orEmpty()
            @Suppress("UNCHECKED_CAST")
            cotizaciones = (snap["quotes"] as? List<Map<String, Any?>>).orEmpty().mapNotNull { row ->
                val cot = (row["cotizacion"] as? Map<String, Any?>) ?: row
                CotizacionDto.fromRaw(cot).takeIf { it.id > 0L }
            }
            @Suppress("UNCHECKED_CAST")
            tickets = (snap["ticketRequests"] as? List<Map<String, Any?>>).orEmpty()
            @Suppress("UNCHECKED_CAST")
            servicios = (snap["maintenanceContracts"] as? List<Map<String, Any?>>).orEmpty()
            @Suppress("UNCHECKED_CAST")
            facturas = (snap["invoices"] as? List<Map<String, Any?>>).orEmpty()
            @Suppress("UNCHECKED_CAST")
            val clientMap = snap["client"] as? Map<String, Any?>
            @Suppress("UNCHECKED_CAST")
            sucursales = (clientMap?.get("branches") as? List<Map<String, Any?>>).orEmpty()
            timelineEvents = buildClient360Timeline(snap)
        } else {
            val extraRepo = ExtraRepository(ctx)
            val detail = runCatching {
                withContext(Dispatchers.IO) { crm.getClientDetail(currentClient.id) }
            }.getOrNull()
            @Suppress("UNCHECKED_CAST")
            val apiOpps = (detail?.get("opportunities") as? List<Map<String, Any?>>)
                ?.map { CrmOpportunityDto.fromRaw(it) }.orEmpty()
            val allCots = runCatching { withContext(Dispatchers.IO) { crm.cotizaciones() } }.getOrDefault(emptyList())
            cotizaciones = allCots.filter { it.salesClientId == currentClient.id }
            oportunidades = apiOpps
            tickets = runCatching { withContext(Dispatchers.IO) { extraRepo.clientTicketRequests() } }.getOrDefault(emptyList())
            servicios = runCatching {
                withContext(Dispatchers.IO) {
                    extraRepo.maintenanceContracts(clientId = currentClient.id.toString())
                }
            }.getOrDefault(emptyList())
        }
        loading = false
    }

    Column(Modifier.fillMaxSize()) {
        OutlinedButton(onClick = onBack, modifier = Modifier.padding(12.dp)) { Text("← Volver") }
        Text(clientName.ifBlank { "Cliente" }, style = MaterialTheme.typography.titleLarge, fontWeight = FontWeight.Bold, modifier = Modifier.padding(horizontal = 16.dp))
        if (healthLabel.isNotBlank()) {
            Text("Salud: $healthLabel ($healthScore/100)", style = MaterialTheme.typography.bodySmall, modifier = Modifier.padding(horizontal = 16.dp), color = MaterialTheme.colorScheme.onSurfaceVariant)
        }
        Spacer(Modifier.height(8.dp))
        androidx.compose.material3.ScrollableTabRow(selectedTabIndex = tab, edgePadding = 8.dp) {
            listOf("360", "Cotizaciones", "Oportunidades", "Tickets", "Facturas", "Sucursales", "Servicios", "Timeline").forEachIndexed { i, title ->
                Tab(selected = tab == i, onClick = { tab = i }, text = { Text(title, fontSize = 12.sp) })
            }
        }
        if (loading) { Box(Modifier.fillMaxSize(), Alignment.Center) { NxLoadingBlock("Cargando cliente…") }; return@Column }
        when (tab) {
            0 -> LazyColumn(Modifier.fillMaxSize(), contentPadding = PaddingValues(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                if (snapshotStats != null) {
                    val s = snapshotStats!!
                    item {
                        NxKpiGrid(
                            items = listOf(
                                NxKpi("Pipeline", fmtMxnShort(statNum(s, "pipelineValue")), tone = NxTone.Brand),
                                NxKpi("OT abiertas", "${statInt(s, "activitiesOpen")}", tone = NxTone.Warning),
                                NxKpi("Facturas pend.", "${statInt(s, "pendingInvoices")}", tone = NxTone.Danger),
                                NxKpi("Contratos", "${statInt(s, "activeContracts")}", tone = NxTone.Info),
                            ),
                        )
                    }
                }
                item {
                    Row(
                        Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.End,
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        if (!hasServiceClient) {
                            OutlinedButton(
                                onClick = {
                                    scope.launch {
                                        provisioning = true
                                        actionMessage = null
                                        runCatching {
                                            withContext(Dispatchers.IO) {
                                                crmRepo.provisionServiceClient(currentClient.id)
                                            }
                                        }.onSuccess { updated ->
                                            currentClient = CrmClientDto.fromRaw(updated)
                                            reloadKey++
                                        }.onFailure {
                                            actionMessage = it.message?.takeIf { m -> m.isNotBlank() }
                                                ?: "No se pudo activar en operación"
                                        }
                                        provisioning = false
                                    }
                                },
                                enabled = !provisioning,
                            ) {
                                Text(if (provisioning) "Activando…" else "Activar en operación")
                            }
                            Spacer(Modifier.width(8.dp))
                        }
                        Button(onClick = { showEdit = true }) { Text("Editar datos") }
                    }
                }
                actionMessage?.let { msg ->
                    item {
                        Text(msg, color = MaterialTheme.colorScheme.error, style = MaterialTheme.typography.bodySmall)
                    }
                }
                val raw = currentClient.raw
                fun r(k: String, v: String) {
                    if (v.isNotBlank()) item {
                        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                            Text(k, color = MaterialTheme.colorScheme.onSurfaceVariant)
                            Text(v)
                        }
                    }
                }
                r("Estado comercial", mStr(raw, "status", "estatus").ifBlank { "Prospecto" })
                r("Industria", mStr(raw, "industry"))
                r("Nombre comercial", currentClient.name.ifBlank { mStr(raw, "name", "nombre") })
                r("Razón social", mStr(raw, "legalName", "razonSocial"))
                r("RFC", currentClient.rfc.ifBlank { mStr(raw, "taxId", "rfc") })
                r("CP fiscal", mStr(raw, "fiscalZipCode"))
                r("Régimen fiscal", mStr(raw, "fiscalRegime"))
                r("Email facturación", currentClient.email.ifBlank { mStr(raw, "billingEmail", "email") })
                r("Teléfono", currentClient.phone.ifBlank { mStr(raw, "billingPhone", "telefono", "phone") })
                r("Sitio web", mStr(raw, "website"))
                r("Dirección fiscal", mStr(raw, "fiscalAddress"))
                r("Ciudad", mStr(raw, "city", "ciudad"))
                r("Estado", mStr(raw, "state", "estado"))
                r("País", mStr(raw, "country", "pais"))
                r("Notas", mStr(raw, "notes", "notas"))
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
            4 -> if (facturas.isEmpty()) {
                Box(Modifier.fillMaxSize(), Alignment.Center) { Text("Sin facturas", color = MaterialTheme.colorScheme.onSurfaceVariant) }
            } else {
                LazyColumn(Modifier.fillMaxSize(), contentPadding = PaddingValues(12.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    items(facturas, key = { mStr(it, "id") }) { inv ->
                        Card(shape = RoundedCornerShape(12.dp), modifier = Modifier.fillMaxWidth()) {
                            Column(Modifier.padding(14.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                                Text(mStr(inv, "invoiceNumber", "folio").ifBlank { "Factura" }, fontWeight = FontWeight.Bold)
                                Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                                    Text(mStr(inv, "status", "estado"), style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.tertiary)
                                    Text(fmtMxnShort(statNum(inv, "totalAmount")), fontWeight = FontWeight.Bold)
                                }
                            }
                        }
                    }
                }
            }
            5 -> if (sucursales.isEmpty()) {
                Box(Modifier.fillMaxSize(), Alignment.Center) { Text("Sin sucursales", color = MaterialTheme.colorScheme.onSurfaceVariant) }
            } else {
                LazyColumn(Modifier.fillMaxSize(), contentPadding = PaddingValues(12.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    items(sucursales, key = { mStr(it, "id") }) { b ->
                        Card(shape = RoundedCornerShape(12.dp), modifier = Modifier.fillMaxWidth()) {
                            Column(Modifier.padding(14.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                                Text(mStr(b, "name", "nombre", "branchName").ifBlank { "Sucursal" }, fontWeight = FontWeight.Bold)
                                val addr = mStr(b, "address", "direccion")
                                if (addr.isNotBlank()) Text(addr, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                            }
                        }
                    }
                }
            }
            6 -> if (servicios.isEmpty()) {
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
            7 -> if (timelineEvents.isEmpty()) {
                Box(Modifier.fillMaxSize(), Alignment.Center) { Text("Sin eventos recientes", color = MaterialTheme.colorScheme.onSurfaceVariant) }
            } else {
                LazyColumn(Modifier.fillMaxSize(), contentPadding = PaddingValues(12.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    items(timelineEvents.size) { idx ->
                        val (title, kind, subtitle) = timelineEvents[idx]
                        Card(shape = RoundedCornerShape(12.dp), modifier = Modifier.fillMaxWidth()) {
                            Column(Modifier.padding(14.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                                Text(title, fontWeight = FontWeight.Bold)
                                Text(
                                    listOf(kind, subtitle).filter { it.isNotBlank() }.joinToString(" · "),
                                    style = MaterialTheme.typography.bodySmall,
                                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                                )
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

private fun statNum(s: Map<String, Any?>, key: String): Double {
    val v = s[key]
    return when (v) {
        is Number -> v.toDouble()
        is String -> v.toDoubleOrNull() ?: 0.0
        else -> 0.0
    }
}

private fun statInt(s: Map<String, Any?>, key: String): Int = statNum(s, key).toInt()

private fun computeClientHealth(stats: Map<String, Any?>?, status: String): Pair<Int, String> {
    var score = 100
    if (status == "Inactivo" || status == "INACTIVE") score -= 25
    val s = stats ?: emptyMap()
    if (statInt(s, "activitiesOpen") > 3) score -= 10
    if (statInt(s, "pendingInvoices") > 0) score -= 15
    if (statInt(s, "ticketRequests") > 2) score -= 10
    if (statInt(s, "opportunitiesOpen") == 0 && statInt(s, "totalSalesProjects") == 0) score -= 5
    return when {
        score >= 75 -> score to "Saludable"
        score >= 50 -> score to "En riesgo"
        else -> score to "Crítico"
    }
}

private fun snapPickDate(raw: Any?): String? {
    if (raw == null) return null
    val s = raw.toString().trim()
    if (s.isBlank()) return null
    return s.take(19)
}

private fun buildClient360Timeline(snap: Map<String, Any?>): List<Triple<String, String, String>> {
    val events = mutableListOf<Pair<String, Triple<String, String, String>>>()

    @Suppress("UNCHECKED_CAST")
    val opps = snap["opportunities"] as? List<Map<String, Any?>> ?: emptyList()
    for (row in opps) {
        val at = snapPickDate(row["updatedAt"] ?: row["createdAt"]) ?: continue
        events.add(
            at to Triple(
                mStr(row, "title").ifBlank { "Oportunidad" },
                "oportunidad",
                mStr(row, "stage"),
            ),
        )
    }

    @Suppress("UNCHECKED_CAST")
    val quotes = snap["quotes"] as? List<Map<String, Any?>> ?: emptyList()
    for (row in quotes) {
        @Suppress("UNCHECKED_CAST")
        val cot = (row["cotizacion"] as? Map<String, Any?>) ?: row
        val at = snapPickDate(cot["createdAt"] ?: row["createdAt"]) ?: continue
        events.add(
            at to Triple(
                mStr(cot, "quoteNumber", "folio").ifBlank { "Cotización" },
                "cotización",
                mStr(cot, "status", "estatus"),
            ),
        )
    }

    @Suppress("UNCHECKED_CAST")
    val activities = snap["activities"] as? List<Map<String, Any?>> ?: emptyList()
    for (row in activities) {
        val at = snapPickDate(row["fechaAsignacion"] ?: row["createdAt"]) ?: continue
        events.add(
            at to Triple(
                mStr(row, "titulo", "anNumber").ifBlank { "Actividad" },
                "actividad",
                mStr(row, "estatus", "status"),
            ),
        )
    }

    @Suppress("UNCHECKED_CAST")
    val tickets = snap["ticketRequests"] as? List<Map<String, Any?>> ?: emptyList()
    for (row in tickets) {
        val at = snapPickDate(row["createdAt"]) ?: continue
        val desc = mStr(row, "description", "subject", "descripcion")
        events.add(
            at to Triple(
                desc.take(80).ifBlank { "Ticket" },
                "ticket",
                mStr(row, "status", "estado"),
            ),
        )
    }

    @Suppress("UNCHECKED_CAST")
    val invoices = snap["invoices"] as? List<Map<String, Any?>> ?: emptyList()
    for (row in invoices) {
        val at = snapPickDate(row["issueDate"] ?: row["createdAt"]) ?: continue
        events.add(
            at to Triple(
                mStr(row, "invoiceNumber", "folio").ifBlank { "Factura" },
                "factura",
                mStr(row, "status", "estado"),
            ),
        )
    }

    return events
        .sortedByDescending { it.first }
        .take(25)
        .map { it.second }
}

// ── Pipeline / Agenda / Licitaciones / Metas / Equipo ───────────────────────

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun VentasPipelineScreen() {
    val ctx = LocalContext.current
    val repo = remember(ctx) { CrmRepository(ctx.applicationContext) }
    val scope = rememberCoroutineScope()
    var items by remember { mutableStateOf<List<mx.nexara.mobile.nativeapp.data.api.CrmOpportunityDto>>(emptyList()) }
    var isLoading by remember { mutableStateOf(true) }
    var isRefreshing by remember { mutableStateOf(false) }
    var selectedOppId by remember { mutableStateOf<Long?>(null) }
    var stageDialogOpp by remember { mutableStateOf<CrmOpportunityDto?>(null) }
    var updatingStage by remember { mutableStateOf(false) }

    fun reload(pull: Boolean = false) {
        scope.launch {
            if (pull) isRefreshing = true else isLoading = true
            items = runCatching { withContext(Dispatchers.IO) { repo.opportunityDtos() } }.getOrDefault(emptyList())
            isLoading = false
            isRefreshing = false
        }
    }

    if (selectedOppId != null) {
        VentasOpportunityDetailScreen(oppId = selectedOppId!!, onBack = { selectedOppId = null })
        return
    }

    LaunchedEffect(repo) { reload() }
    val stageOrder = OPPORTUNITY_STAGES.map { it.first }
    val grouped = remember(items) {
        val map = items.groupBy { it.stageKey }
        val ordered = stageOrder.mapNotNull { key ->
            val label = OPPORTUNITY_STAGES.firstOrNull { it.first == key }?.second ?: key
            val list = map[key] ?: map[label]
            if (list.isNullOrEmpty()) null else Triple(key, label, list)
        }
        val extras = map.filterKeys { key ->
            stageOrder.none { it == key } && OPPORTUNITY_STAGES.none { it.second == key }
        }.toList().sortedBy { it.first }.map { (key, list) ->
            Triple(key, OPPORTUNITY_STAGES.firstOrNull { it.first == key }?.second ?: key, list)
        }
        ordered + extras
    }
    val totalValue = items.sumOf { it.value }
    val weighted = items.sumOf { it.weightedValue }
    val won = items.count { it.isWon }

    PullToRefreshBox(
        isRefreshing = isRefreshing,
        onRefresh = { reload(pull = true) },
        modifier = Modifier.fillMaxSize(),
    ) {
    LazyColumn(
        Modifier.fillMaxSize().background(NxColors.Surface),
        contentPadding = PaddingValues(12.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        item { NxSectionHeader("Pipeline comercial", "Valor · ponderado · conversión por etapa") }
        item {
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                CrmKpiMini(Modifier.weight(1f), "Pipeline", fmtMxnShort(totalValue))
                CrmKpiMini(Modifier.weight(1f), "Ponderado", fmtMxnShort(weighted))
                CrmKpiMini(Modifier.weight(1f), "Ganadas", "$won")
            }
        }
        if (isLoading && !isRefreshing) {
            item { NxLoadingBlock("Cargando pipeline…") }
        }
        grouped.forEach { (stageId, stage, stageItems) ->
            val stageColor = pipelineStageColor(stageId)
            val stageValue = stageItems.sumOf { it.value }
            item {
                NxSectionHeader(stage, "${stageItems.size} · ${fmtMxnShort(stageValue)}")
            }
            items(stageItems, key = { it.rowKey }) { o ->
                NxPanelShell(onClick = { selectedOppId = o.id }, contentPadding = PaddingValues(0.dp)) {
                    Row(Modifier.fillMaxWidth()) {
                        Box(
                            Modifier
                                .width(4.dp)
                                .heightIn(min = 72.dp)
                                .background(stageColor, RoundedCornerShape(topStart = 12.dp, bottomStart = 12.dp)),
                        )
                        Column(Modifier.padding(12.dp).weight(1f), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                            Row(Modifier.fillMaxWidth(), Arrangement.SpaceBetween, Alignment.CenterVertically) {
                                Text(o.displayTitle, fontWeight = FontWeight.SemiBold, modifier = Modifier.weight(1f))
                                CrmStageChip(o.stageKey)
                            }
                            Row(Modifier.fillMaxWidth(), Arrangement.SpaceBetween) {
                                Text(fmtMxnShort(o.value), color = stageColor, fontWeight = FontWeight.Bold)
                                if (o.probability > 0) {
                                    Text("${o.probability.toInt()}% prob.", style = MaterialTheme.typography.labelSmall)
                                }
                            }
                            if (o.clientName.isNotBlank()) {
                                Text(o.clientName, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                            }
                            TextButton(onClick = { stageDialogOpp = o }) { Text("Mover etapa") }
                        }
                    }
                }
            }
        }
        if (!isLoading && grouped.isEmpty()) {
            item {
                NxEmptyState(
                    title = "Sin oportunidades en pipeline",
                    subtitle = "Crea oportunidades desde el módulo de ventas para visualizarlas por etapa.",
                )
            }
        }
    }
    }

    val dialogOpp = stageDialogOpp
    if (dialogOpp != null) {
        var pickedStage by remember(dialogOpp.id) { mutableStateOf(dialogOpp.stage.ifBlank { OPPORTUNITY_STAGES.first().first }) }
        AlertDialog(
            onDismissRequest = { if (!updatingStage) stageDialogOpp = null },
            title = { Text("Mover etapa") },
            text = {
                Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    Text(dialogOpp.displayTitle, fontWeight = FontWeight.SemiBold)
                    OPPORTUNITY_STAGES.forEach { (id, label) ->
                        val color = pipelineStageColor(id)
                        Row(
                            Modifier.fillMaxWidth().clickable { pickedStage = id },
                            verticalAlignment = Alignment.CenterVertically,
                        ) {
                            RadioButton(selected = pickedStage == id, onClick = { pickedStage = id })
                            Box(Modifier.size(10.dp).clip(RoundedCornerShape(999.dp)).background(color))
                            Spacer(Modifier.width(8.dp))
                            Text(label)
                        }
                    }
                }
            },
            confirmButton = {
                Button(
                    onClick = {
                        scope.launch {
                            updatingStage = true
                            runCatching {
                                withContext(Dispatchers.IO) {
                                    repo.updateOpportunityStage(dialogOpp.id, pickedStage)
                                }
                            }.onSuccess {
                                items = withContext(Dispatchers.IO) { repo.opportunityDtos() }
                                stageDialogOpp = null
                            }
                            updatingStage = false
                        }
                    },
                    enabled = !updatingStage,
                ) { Text(if (updatingStage) "Guardando…" else "Guardar") }
            },
            dismissButton = {
                TextButton(onClick = { stageDialogOpp = null }, enabled = !updatingStage) { Text("Cancelar") }
            },
        )
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

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun VentasAgendaScreen() {
    val ctx = LocalContext.current
    val repo = remember(ctx) { CrmRepository(ctx.applicationContext) }
    val scope = rememberCoroutineScope()
    var agenda by remember { mutableStateOf<mx.nexara.mobile.nativeapp.data.api.CrmAgendaDto?>(null) }
    var loading by remember { mutableStateOf(true) }
    var isRefreshing by remember { mutableStateOf(false) }
    var agendaError by remember { mutableStateOf<String?>(null) }
    var query by remember { mutableStateOf("") }
    var selected by remember { mutableStateOf<mx.nexara.mobile.nativeapp.data.api.CrmActivityDto?>(null) }
    var completing by remember { mutableStateOf(false) }
    var confirmComplete by remember { mutableStateOf<mx.nexara.mobile.nativeapp.data.api.CrmActivityDto?>(null) }

    fun reload(pull: Boolean = false) {
        scope.launch {
            if (pull) isRefreshing = true else loading = true
            agendaError = null
            val result = runCatching { withContext(Dispatchers.IO) { repo.crmAgenda() } }
            agenda = result.getOrNull()
            agendaError = result.exceptionOrNull()?.message
            loading = false
            isRefreshing = false
        }
    }

    fun completeActivity(act: mx.nexara.mobile.nativeapp.data.api.CrmActivityDto) {
        scope.launch {
            completing = true
            runCatching {
                withContext(Dispatchers.IO) { repo.completeCrmActivity(act.id, "Completada desde móvil") }
            }
            selected = null
            confirmComplete = null
            reload()
            completing = false
        }
    }
    LaunchedEffect(repo) { reload() }

    if (selected != null) {
        val act = selected!!
        LazyColumn(
            Modifier.fillMaxSize().background(NxColors.Surface),
            contentPadding = PaddingValues(16.dp),
            verticalArrangement = Arrangement.spacedBy(8.dp),
        ) {
            item { OutlinedButton(onClick = { selected = null }) { Text("← Agenda") } }
            item { Text(act.displayTitle, style = MaterialTheme.typography.titleLarge, fontWeight = FontWeight.Bold) }
            item {
                NxPanelShell {
                    DetailLine("Tipo", act.activityType)
                    DetailLine("Estado", act.status)
                    DetailLine("Vence", act.dueDate?.take(16).orEmpty())
                    DetailLine("Relacionado", act.relatedLabel)
                    DetailLine("Notas", act.notes.orEmpty())
                    DetailLine("Resultado", act.outcome.orEmpty())
                }
            }
            if (act.status.uppercase() == "PENDING") {
                item {
                    Button(
                        onClick = { confirmComplete = act },
                        enabled = !completing,
                        modifier = Modifier.fillMaxWidth(),
                    ) { Text(if (completing) "Completando…" else "Marcar completada") }
                }
            }
        }
        return
    }

    val allItems = agenda?.allPending.orEmpty()
    val filtered = allItems.filter {
        query.isBlank() ||
            it.displayTitle.lowercase().contains(query.lowercase()) ||
            it.relatedLabel.lowercase().contains(query.lowercase())
    }
    val overdue = agenda?.overdue.orEmpty()
    val today = agenda?.pendingToday.orEmpty()
    val upcoming = agenda?.upcoming.orEmpty()

    PullToRefreshBox(
        isRefreshing = isRefreshing,
        onRefresh = { reload(pull = true) },
        modifier = Modifier.fillMaxSize(),
    ) {
    LazyColumn(
        modifier = Modifier.fillMaxSize().background(NxColors.Surface),
        contentPadding = PaddingValues(12.dp),
        verticalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        item { NxSectionHeader("Mi agenda CRM", "Hoy · vencidas · próximos 7 días") }
        item { NxSearchField(value = query, onValueChange = { query = it }, placeholder = "Buscar actividad…") }
        when {
            loading && !isRefreshing -> item { NxLoadingBlock("Cargando agenda…") }
            !agendaError.isNullOrBlank() -> item { NxErrorBlock(agendaError ?: "", onRetry = { reload() }) }
            filtered.isEmpty() -> item {
                NxEmptyState(
                    title = "Sin actividades pendientes",
                    subtitle = if (query.isNotBlank()) {
                        "No hay coincidencias para \"$query\". Prueba otro término o limpia el filtro."
                    } else {
                        "Las tareas CRM programadas para hoy y los próximos días aparecerán aquí."
                    },
                )
            }
            else -> {
                if (overdue.isNotEmpty()) {
                    item { NxSectionHeader("Vencidas", "${overdue.size} pendientes") }
                    items(overdue, key = { "ov-${it.rowKey}" }) { act ->
                        CrmAgendaCard(
                            act,
                            onClick = { selected = act },
                            onComplete = { confirmComplete = act },
                            isOverdue = true,
                        )
                    }
                }
                if (today.isNotEmpty()) {
                    item { NxSectionHeader("Hoy", "${today.size} actividades") }
                    items(today, key = { "td-${it.rowKey}" }) { act ->
                        CrmAgendaCard(act, onClick = { selected = act }, onComplete = { confirmComplete = act })
                    }
                }
                if (upcoming.isNotEmpty()) {
                    item { NxSectionHeader("Próximos 7 días", "${upcoming.size} programadas") }
                    items(upcoming, key = { "up-${it.rowKey}" }) { act ->
                        CrmAgendaCard(act, onClick = { selected = act }, onComplete = { confirmComplete = act })
                    }
                }
            }
        }
    }
    }

    val pendingComplete = confirmComplete
    if (pendingComplete != null) {
        AlertDialog(
            onDismissRequest = { if (!completing) confirmComplete = null },
            title = { Text("Completar actividad") },
            text = { Text("¿Marcar \"${pendingComplete.displayTitle}\" como completada?") },
            confirmButton = {
                Button(onClick = { completeActivity(pendingComplete) }, enabled = !completing) {
                    Text(if (completing) "Completando…" else "Completar")
                }
            },
            dismissButton = {
                TextButton(onClick = { confirmComplete = null }, enabled = !completing) { Text("Cancelar") }
            },
        )
    }
}

@Composable
private fun CrmAgendaCard(
    act: mx.nexara.mobile.nativeapp.data.api.CrmActivityDto,
    onClick: () -> Unit,
    onComplete: (() -> Unit)? = null,
    isOverdue: Boolean = false,
) {
    val overdueRed = Color(0xFFB91C1C)
    NxPanelShell(
        onClick = onClick,
        modifier = Modifier.fillMaxWidth(),
        contentPadding = PaddingValues(0.dp),
    ) {
        Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
            if (isOverdue) {
                Box(
                    Modifier
                        .width(4.dp)
                        .heightIn(min = 64.dp)
                        .background(overdueRed, RoundedCornerShape(topStart = 12.dp, bottomStart = 12.dp)),
                )
            }
            Column(Modifier.padding(12.dp).weight(1f), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                Text(
                    act.displayTitle,
                    fontWeight = FontWeight.SemiBold,
                    color = if (isOverdue) overdueRed else MaterialTheme.colorScheme.onSurface,
                )
                if (act.activityType.isNotBlank()) {
                    Text(act.activityType, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                }
                val date = act.dueDate?.take(16).orEmpty()
                if (date.isNotBlank()) {
                    Text(
                        if (isOverdue) "Vencida · $date" else date,
                        style = MaterialTheme.typography.bodySmall,
                        color = if (isOverdue) overdueRed else MaterialTheme.colorScheme.onSurfaceVariant,
                        fontWeight = if (isOverdue) FontWeight.SemiBold else FontWeight.Normal,
                    )
                }
                if (act.relatedLabel.isNotBlank()) {
                    Text(act.relatedLabel, style = MaterialTheme.typography.labelSmall, color = if (isOverdue) overdueRed.copy(alpha = 0.85f) else CrmGreen)
                }
            }
            if (onComplete != null && act.status.uppercase() == "PENDING") {
                IconButton(onClick = onComplete) {
                    Icon(Icons.Default.Check, contentDescription = "Completar", tint = if (isOverdue) overdueRed else CrmGreen)
                }
            }
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun VentasTendersScreen() {
    val ctx = LocalContext.current
    val repo = remember(ctx) { CrmRepository(ctx.applicationContext) }
    var items by remember { mutableStateOf<List<mx.nexara.mobile.nativeapp.data.api.TenderDto>>(emptyList()) }
    var loading by remember { mutableStateOf(true) }
    var isRefreshing by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf<String?>(null) }
    var query by remember { mutableStateOf("") }
    var statusFilter by remember { mutableStateOf("todos") }
    var selected by remember { mutableStateOf<mx.nexara.mobile.nativeapp.data.api.TenderDto?>(null) }
    val scope = rememberCoroutineScope()

    fun reload(pull: Boolean = false) {
        scope.launch {
            if (pull) isRefreshing = true else loading = true
            error = null
            runCatching { withContext(Dispatchers.IO) { repo.tenderDtos() } }
                .onSuccess { items = it; error = null }
                .onFailure { error = it.message }
            loading = false
            isRefreshing = false
        }
    }

    LaunchedEffect(repo) { reload() }

    if (selected != null) {
        val t = selected!!
        LazyColumn(
            Modifier.fillMaxSize().background(NxColors.Surface),
            contentPadding = PaddingValues(16.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            item {
                Row(Modifier.fillMaxWidth(), Arrangement.SpaceBetween, Alignment.CenterVertically) {
                    OutlinedButton(onClick = { selected = null }) { Text("← Licitaciones") }
                    Surface(shape = RoundedCornerShape(8.dp), color = CrmGreen.copy(alpha = 0.12f)) {
                        Text(
                            t.status,
                            color = CrmGreen,
                            fontWeight = FontWeight.SemiBold,
                            style = MaterialTheme.typography.labelSmall,
                            modifier = Modifier.padding(horizontal = 8.dp, vertical = 4.dp),
                        )
                    }
                }
            }
            item {
                Text(
                    t.displayTitle,
                    style = MaterialTheme.typography.headlineSmall.copy(fontWeight = FontWeight.Bold),
                    color = NxColors.Slate,
                )
            }
            item {
                NxPanelShell {
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
        return
    }

    val allStatuses = listOf("todos") + items.map { it.statusLower }.filter { it.isNotBlank() }.distinct().sorted()
    val filtered = items.filter {
        (statusFilter == "todos" || it.status.equals(statusFilter, true)) &&
            (query.isBlank() || it.displayTitle.lowercase().contains(query.lowercase()) || it.clientName.lowercase().contains(query.lowercase()))
    }

    PullToRefreshBox(
        isRefreshing = isRefreshing,
        onRefresh = { reload(pull = true) },
        modifier = Modifier.fillMaxSize(),
    ) {
        LazyColumn(
            modifier = Modifier.fillMaxSize().background(NxColors.Surface),
            contentPadding = PaddingValues(12.dp),
            verticalArrangement = Arrangement.spacedBy(10.dp),
        ) {
            item { NxSectionHeader("Licitaciones", "Seguimiento de procesos y fechas límite") }
            if (items.isNotEmpty()) {
                item {
                    VentasKpiStrip(
                        listOf(
                            Triple("Total", "${items.size}", NxColors.Slate),
                            Triple("Activas", "${items.count { it.isActive }}", Color(0xFF059669)),
                            Triple("Cerradas", "${items.count { it.isClosed }}", NxColors.Muted),
                        ),
                    )
                }
            }
            item { NxSearchField(value = query, onValueChange = { query = it }, placeholder = "Buscar licitación…") }
            item {
                Row(Modifier.horizontalScroll(rememberScrollState()), horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                    allStatuses.forEach { s ->
                        FilterChip(
                            selected = statusFilter == s,
                            onClick = { statusFilter = s },
                            label = { Text(s.replaceFirstChar { it.uppercase() }, style = MaterialTheme.typography.labelSmall) },
                        )
                    }
                }
            }
            when {
                loading && !isRefreshing -> item { NxLoadingBlock("Cargando licitaciones…") }
                !error.isNullOrBlank() && items.isEmpty() -> item { NxErrorBlock(error ?: "", onRetry = { reload() }) }
                filtered.isEmpty() -> item {
                    NxEmptyState(
                        title = "Sin licitaciones",
                        subtitle = if (query.isNotBlank() || statusFilter != "todos") {
                            "No hay coincidencias con los filtros actuales."
                        } else {
                            "Las licitaciones registradas en el CRM aparecerán aquí."
                        },
                    )
                }
                else -> items(filtered, key = { it.rowKey }) { t ->
                    NxPanelShell(onClick = { selected = t }) {
                        Row(Modifier.fillMaxWidth(), Arrangement.SpaceBetween, verticalAlignment = Alignment.Top) {
                            Text(
                                t.displayTitle,
                                style = MaterialTheme.typography.bodyMedium.copy(fontWeight = FontWeight.SemiBold),
                                color = NxColors.Slate,
                                modifier = Modifier.weight(1f),
                            )
                            Surface(shape = RoundedCornerShape(6.dp), color = CrmGreen.copy(alpha = 0.12f)) {
                                Text(
                                    t.status,
                                    color = CrmGreen,
                                    style = MaterialTheme.typography.labelSmall,
                                    modifier = Modifier.padding(horizontal = 6.dp, vertical = 2.dp),
                                )
                            }
                        }
                        if (t.clientName.isNotBlank()) {
                            Text(t.clientName, style = MaterialTheme.typography.bodySmall, color = NxColors.Muted)
                        }
                        val dl = t.deadline.take(10)
                        if (dl.isNotBlank()) {
                            Text("Vence: $dl", style = MaterialTheme.typography.labelSmall, color = Color(0xFFE65100))
                        }
                        if (t.amount > 0) {
                            Text(fmtMxnShort(t.amount), style = MaterialTheme.typography.titleSmall.copy(fontWeight = FontWeight.Bold), color = NxColors.Teal)
                        }
                    }
                }
            }
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun VentasTargetsScreen() {
    val ctx = LocalContext.current
    val repo = remember(ctx) { CrmRepository(ctx.applicationContext) }
    var items by remember { mutableStateOf<List<mx.nexara.mobile.nativeapp.data.api.SalesTargetDto>>(emptyList()) }
    var loading by remember { mutableStateOf(true) }
    var isRefreshing by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf<String?>(null) }
    var query by remember { mutableStateOf("") }
    val scope = rememberCoroutineScope()

    fun reload(pull: Boolean = false) {
        scope.launch {
            if (pull) isRefreshing = true else loading = true
            error = null
            runCatching { withContext(Dispatchers.IO) { repo.salesTargetDtos() } }
                .onSuccess { items = it; error = null }
                .onFailure { error = it.message }
            loading = false
            isRefreshing = false
        }
    }

    LaunchedEffect(repo) { reload() }

    val totalTarget = items.sumOf { it.targetAmount }
    val totalActual = items.sumOf { it.actualAmount }
    val overallPct = if (totalTarget > 0) (totalActual / totalTarget).coerceIn(0.0, 1.0).toFloat() else 0f
    val filtered = items.filter { query.isBlank() || it.ownerName.lowercase().contains(query.lowercase()) }

    PullToRefreshBox(
        isRefreshing = isRefreshing,
        onRefresh = { reload(pull = true) },
        modifier = Modifier.fillMaxSize(),
    ) {
        LazyColumn(
            modifier = Modifier.fillMaxSize().background(NxColors.Surface),
            contentPadding = PaddingValues(12.dp),
            verticalArrangement = Arrangement.spacedBy(10.dp),
        ) {
            item { NxSectionHeader("Metas comerciales", "Cumplimiento por vendedor y periodo") }
            if (items.isNotEmpty()) {
                item {
                    VentasKpiStrip(
                        listOf(
                            Triple("Vendedores", "${items.size}", NxColors.Slate),
                            Triple("Meta", fmtMxnShort(totalTarget), Color(0xFF1565C0)),
                            Triple("Alcanzado", fmtMxnShort(totalActual), if (totalActual >= totalTarget) Color(0xFF059669) else Color(0xFFE65100)),
                        ),
                    )
                }
                item {
                    NxPanelShell(contentPadding = PaddingValues(16.dp)) {
                        Text("Avance global", style = MaterialTheme.typography.titleSmall.copy(fontWeight = FontWeight.SemiBold), color = NxColors.Slate)
                        Spacer(Modifier.height(8.dp))
                        LinearProgressIndicator(
                            progress = { overallPct },
                            modifier = Modifier.fillMaxWidth(),
                            color = if (totalActual >= totalTarget) Color(0xFF059669) else Color(0xFFE65100),
                        )
                        Text(
                            "${(overallPct * 100).toInt()}% · ${fmtMxnShort(totalActual)} de ${fmtMxnShort(totalTarget)}",
                            style = MaterialTheme.typography.labelSmall,
                            color = NxColors.Muted,
                        )
                    }
                }
            }
            item { NxSearchField(value = query, onValueChange = { query = it }, placeholder = "Buscar vendedor…") }
            when {
                loading && !isRefreshing -> item { NxLoadingBlock("Cargando metas…") }
                !error.isNullOrBlank() && items.isEmpty() -> item { NxErrorBlock(error ?: "", onRetry = { reload() }) }
                filtered.isEmpty() -> item {
                    NxEmptyState(
                        title = "Sin metas definidas",
                        subtitle = if (query.isNotBlank()) {
                            "No hay vendedores que coincidan con \"$query\"."
                        } else {
                            "Las metas de venta configuradas aparecerán aquí."
                        },
                    )
                }
                else -> items(filtered, key = { it.rowKey }) { t ->
                    val pct = t.progress
                    val accent = if (pct >= 1f) Color(0xFF059669) else Color(0xFFE65100)
                    NxPanelShell {
                        Row(Modifier.fillMaxWidth(), Arrangement.SpaceBetween) {
                            Column(Modifier.weight(1f)) {
                                Text(t.ownerName, style = MaterialTheme.typography.bodyMedium.copy(fontWeight = FontWeight.SemiBold), color = NxColors.Slate)
                                Text("${t.year} / ${t.month}", style = MaterialTheme.typography.bodySmall, color = NxColors.Muted)
                            }
                            Text(fmtMxnShort(t.actualAmount), style = MaterialTheme.typography.titleSmall.copy(fontWeight = FontWeight.Bold), color = accent)
                        }
                        LinearProgressIndicator(progress = { pct }, modifier = Modifier.fillMaxWidth(), color = accent)
                        Text(
                            "Meta: ${fmtMxnShort(t.targetAmount)} · ${(pct * 100).toInt()}%",
                            style = MaterialTheme.typography.labelSmall,
                            color = NxColors.Muted,
                        )
                    }
                }
            }
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun VentasSalesTeamScreen() {
    val ctx = LocalContext.current
    val repo = remember(ctx) { CrmRepository(ctx.applicationContext) }
    var items by remember { mutableStateOf<List<mx.nexara.mobile.nativeapp.data.api.SalesTeamMemberDto>>(emptyList()) }
    var loading by remember { mutableStateOf(true) }
    var isRefreshing by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf<String?>(null) }
    var query by remember { mutableStateOf("") }
    val scope = rememberCoroutineScope()

    fun reload(pull: Boolean = false) {
        scope.launch {
            if (pull) isRefreshing = true else loading = true
            error = null
            runCatching { withContext(Dispatchers.IO) { repo.salesTeamMemberDtos() } }
                .onSuccess { items = it; error = null }
                .onFailure { error = it.message }
            loading = false
            isRefreshing = false
        }
    }

    LaunchedEffect(repo) { reload() }

    val totalSales = items.sumOf { it.totalSales }
    val maxSales = items.maxOfOrNull { it.totalSales } ?: 1.0
    val filtered = items.filter { query.isBlank() || it.name.lowercase().contains(query.lowercase()) }

    PullToRefreshBox(
        isRefreshing = isRefreshing,
        onRefresh = { reload(pull = true) },
        modifier = Modifier.fillMaxSize(),
    ) {
        LazyColumn(
            modifier = Modifier.fillMaxSize().background(NxColors.Surface),
            contentPadding = PaddingValues(12.dp),
            verticalArrangement = Arrangement.spacedBy(10.dp),
        ) {
            item { NxSectionHeader("Equipo comercial", "Desempeño y ranking de vendedores") }
            if (items.isNotEmpty()) {
                item {
                    VentasKpiStrip(
                        listOf(
                            Triple("Vendedores", "${items.size}", NxColors.Slate),
                            Triple("Total", fmtMxnShort(totalSales), Color(0xFF059669)),
                            Triple("Promedio", fmtMxnShort(if (items.isEmpty()) 0.0 else totalSales / items.size), Color(0xFF0891B2)),
                        ),
                    )
                }
                item {
                    TeamSalesChart(items.sortedByDescending { it.totalSales }.take(5), maxSales)
                }
            }
            item { NxSearchField(value = query, onValueChange = { query = it }, placeholder = "Buscar vendedor…") }
            when {
                loading && !isRefreshing -> item { NxLoadingBlock("Cargando equipo…") }
                !error.isNullOrBlank() && items.isEmpty() -> item { NxErrorBlock(error ?: "", onRetry = { reload() }) }
                filtered.isEmpty() -> item {
                    NxEmptyState(
                        title = "Sin datos de equipo",
                        subtitle = if (query.isNotBlank()) {
                            "No hay vendedores que coincidan con \"$query\"."
                        } else {
                            "Los miembros del equipo comercial aparecerán aquí."
                        },
                    )
                }
                else -> items(filtered, key = { it.rowKey }) { v ->
                    val pct = (if (maxSales > 0) v.totalSales / maxSales else 0.0).coerceIn(0.0, 1.0).toFloat()
                    NxPanelShell {
                        Row(Modifier.fillMaxWidth(), Arrangement.SpaceBetween, Alignment.CenterVertically) {
                            Column(Modifier.weight(1f)) {
                                Text(v.name, style = MaterialTheme.typography.bodyMedium.copy(fontWeight = FontWeight.SemiBold), color = NxColors.Slate)
                                if (v.role.isNotBlank()) {
                                    Text(v.role, style = MaterialTheme.typography.bodySmall, color = NxColors.Muted)
                                }
                            }
                            Text(fmtMxnShort(v.totalSales), style = MaterialTheme.typography.titleSmall.copy(fontWeight = FontWeight.Bold), color = Color(0xFF059669))
                        }
                        if (v.totalLeads.isNotBlank() || v.totalOpps.isNotBlank()) {
                            Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                                if (v.totalLeads.isNotBlank()) Text("${v.totalLeads} leads", style = MaterialTheme.typography.labelSmall, color = NxColors.Muted)
                                if (v.totalOpps.isNotBlank()) Text("${v.totalOpps} opps", style = MaterialTheme.typography.labelSmall, color = NxColors.Muted)
                            }
                        }
                        LinearProgressIndicator(progress = { pct }, modifier = Modifier.fillMaxWidth(), color = Color(0xFF059669))
                    }
                }
            }
        }
    }
}

@Composable
private fun VentasKpiStrip(kpis: List<Triple<String, String, Color>>) {
    if (kpis.isEmpty()) return
    Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
        kpis.forEach { (label, value, accent) ->
            NxPanelShell(modifier = Modifier.weight(1f), contentPadding = PaddingValues(12.dp)) {
                Text(value, style = MaterialTheme.typography.titleSmall.copy(fontWeight = FontWeight.Bold), color = accent)
                Text(label, style = MaterialTheme.typography.labelSmall, color = NxColors.Muted)
            }
        }
    }
}

@Composable
private fun TeamSalesChart(top: List<mx.nexara.mobile.nativeapp.data.api.SalesTeamMemberDto>, maxSales: Double) {
    if (top.isEmpty()) return
    NxPanelShell(contentPadding = PaddingValues(16.dp)) {
        Text("Top vendedores", style = MaterialTheme.typography.titleSmall.copy(fontWeight = FontWeight.SemiBold), color = NxColors.Slate)
        Spacer(Modifier.height(12.dp))
        top.forEach { v ->
            val pct = (if (maxSales > 0) v.totalSales / maxSales else 0.0).toFloat().coerceIn(0f, 1f)
            Column(Modifier.fillMaxWidth().padding(vertical = 4.dp)) {
                Row(Modifier.fillMaxWidth(), Arrangement.SpaceBetween) {
                    Text(v.name, style = MaterialTheme.typography.bodySmall, color = NxColors.Slate, maxLines = 1)
                    Text(fmtMxnShort(v.totalSales), style = MaterialTheme.typography.labelSmall.copy(fontWeight = FontWeight.Bold), color = NxColors.Teal)
                }
                Spacer(Modifier.height(4.dp))
                Box(
                    modifier = Modifier.fillMaxWidth().height(6.dp).clip(RoundedCornerShape(3.dp)).background(NxColors.Surface),
                ) {
                    Box(Modifier.fillMaxWidth(pct).height(6.dp).clip(RoundedCornerShape(3.dp)).background(Color(0xFF059669)))
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
private fun DetailLine(label: String, value: String) {
    if (value.isBlank()) return
    Row(Modifier.fillMaxWidth()) {
        Text(label, fontWeight = FontWeight.Medium)
        Spacer(Modifier.weight(1f))
        Text(value, color = MaterialTheme.colorScheme.onSurfaceVariant)
    }
}
