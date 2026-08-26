package mx.nexara.mobile.nativeapp.ui.console.screens

import android.app.Application
import androidx.compose.foundation.background
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
import androidx.compose.foundation.layout.Box
import androidx.compose.runtime.LaunchedEffect
import kotlinx.coroutines.withContext
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FilterChip
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.ScrollableTabRow
import androidx.compose.material3.Tab
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.pulltorefresh.PullToRefreshBox
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
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
import mx.nexara.mobile.nativeapp.data.api.ServiceSheetListDto
import mx.nexara.mobile.nativeapp.data.ops.OpsRepository
import mx.nexara.mobile.nativeapp.data.extra.ExtraRepository
import mx.nexara.mobile.nativeapp.ui.enterprise.NxColors
import mx.nexara.mobile.nativeapp.ui.enterprise.NxEmptyState
import mx.nexara.mobile.nativeapp.ui.enterprise.NxErrorBlock
import mx.nexara.mobile.nativeapp.ui.enterprise.NxLoadingBlock
import mx.nexara.mobile.nativeapp.ui.enterprise.NxPanelShell
import mx.nexara.mobile.nativeapp.ui.enterprise.NxSectionHeader
import mx.nexara.mobile.nativeapp.ui.enterprise.NxStatusChip
import mx.nexara.mobile.nativeapp.ui.enterprise.NxTone
import mx.nexara.mobile.nativeapp.util.mergeIntoNotes
import mx.nexara.mobile.nativeapp.util.messageSuffixOrNone

// ── Helpers ────────────────────────────────────────────────────────────────

private fun str(m: Map<String, Any?>, vararg keys: String): String {
    for (k in keys) {
        val v = m[k] ?: continue
        val s = when (v) {
            is String -> v
            is Number -> v.toString()
            is Map<*, *> -> {
                @Suppress("UNCHECKED_CAST")
                str(v as Map<String, Any?>, "name", "nombre")
            }
            else -> v.toString()
        }
        if (s.isNotBlank() && s != "null") return s
    }
    return ""
}

private fun num(m: Map<String, Any?>, vararg keys: String): Double? {
    for (k in keys) {
        when (val v = m[k]) {
            is Number -> return v.toDouble()
            is String -> v.toDoubleOrNull()?.let { return it }
        }
    }
    return null
}

private fun rowId(m: Map<String, Any?>): String =
    str(m, "id", "uuid", "folio") ?: m.hashCode().toString()

// ── Client tickets ─────────────────────────────────────────────────────────

data class ClientTicketsUiState(
    val loading: Boolean = true,
    val isRefreshing: Boolean = false,
    val error: String? = null,
    val message: String? = null,
    val query: String = "",
    val statusFilter: String = "todos",
    val items: List<mx.nexara.mobile.nativeapp.data.api.OpsClientTicketRequestDto> = emptyList(),
    val selected: mx.nexara.mobile.nativeapp.data.api.OpsClientTicketRequestDto? = null,
    val acting: Boolean = false,
)

class ClientTicketsViewModel(app: Application) : AndroidViewModel(app) {
    private val repo = OpsRepository(app.applicationContext)
    private val _state = MutableStateFlow(ClientTicketsUiState())
    val state: StateFlow<ClientTicketsUiState> = _state

    init { refresh() }

    fun setQuery(v: String) = _state.update { it.copy(query = v) }
    fun setStatusFilter(v: String) {
        _state.update { it.copy(statusFilter = v) }
        refresh()
    }

    fun select(item: mx.nexara.mobile.nativeapp.data.api.OpsClientTicketRequestDto?) =
        _state.update { it.copy(selected = item) }

    fun refresh(initial: Boolean = true) {
        _state.update {
            it.copy(
                loading = initial && it.items.isEmpty(),
                isRefreshing = !initial,
                error = null,
            )
        }
        viewModelScope.launch {
            try {
                val st = _state.value.statusFilter.takeIf { it != "todos" }
                val list = withContext(Dispatchers.IO) { repo.clientTicketRequestDtos(st) }
                _state.update { it.copy(loading = false, isRefreshing = false, items = list) }
            } catch (e: Exception) {
                _state.update { it.copy(loading = false, isRefreshing = false, error = e.message) }
            }
        }
    }

    fun patchStatus(id: Long, status: String) {
        _state.update { it.copy(acting = true, message = null) }
        viewModelScope.launch {
            try {
                withContext(Dispatchers.IO) { repo.patchClientTicketStatus(id, status) }
                _state.update { it.copy(acting = false, message = "Estado actualizado", selected = null) }
                refresh()
            } catch (e: Exception) {
                _state.update { it.copy(acting = false, error = e.message) }
            }
        }
    }

    fun filtered(): List<mx.nexara.mobile.nativeapp.data.api.OpsClientTicketRequestDto> {
        val q = _state.value.query.trim().lowercase()
        if (q.isBlank()) return _state.value.items
        return _state.value.items.filter {
            it.displayTitle.lowercase().contains(q) ||
                it.branchName.lowercase().contains(q) ||
                it.clientName.lowercase().contains(q)
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ClientTicketsModuleScreen(vm: ClientTicketsViewModel = viewModel()) {
    val s by vm.state.collectAsState()
    val selected = s.selected

    if (selected != null) {
        val id = selected.id
        val status = selected.status.uppercase()
        LazyColumn(Modifier.fillMaxSize().padding(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
            item { Text("Ticket de cliente", style = MaterialTheme.typography.titleLarge) }
            item { DetailLine("Descripción", selected.displayTitle) }
            item { DetailLine("Tipo", selected.requestType) }
            item { DetailLine("Urgencia", selected.urgency) }
            item { DetailLine("Estado", selected.status) }
            item { DetailLine("Sucursal", selected.branchName) }
            item { DetailLine("Cliente", selected.clientName) }
            if (id > 0) {
                if (status == "NEW") {
                    item { ActionBtn("Marcar asignado", s.acting) { vm.patchStatus(id, "ASSIGNED") } }
                }
                if (status != "CLOSED") {
                    item { ActionBtn("Cerrar", s.acting) { vm.patchStatus(id, "CLOSED") } }
                }
                if (status == "NEW" || status == "ASSIGNED") {
                    item { ActionBtn("Aprobar", s.acting) { vm.patchStatus(id, "APPROVED") } }
                    item {
                        TextButton(onClick = { vm.patchStatus(id, "REJECTED") }, enabled = !s.acting) {
                            Text("Rechazar", color = MaterialTheme.colorScheme.error)
                        }
                    }
                }
            }
            item { TextButton(onClick = { vm.select(null) }) { Text("Volver") } }
        }
        return
    }

    val statuses = listOf("todos", "NEW", "ASSIGNED", "CLOSED", "APPROVED", "REJECTED")
    val kpiNew = s.items.count { it.status.equals("NEW", true) }
    val kpiAssigned = s.items.count { it.status.equals("ASSIGNED", true) }

    PullToRefreshBox(
        isRefreshing = s.isRefreshing,
        onRefresh = { vm.refresh(initial = false) },
        modifier = Modifier.fillMaxSize(),
    ) {
    LazyColumn(
        Modifier.fillMaxSize().background(NxColors.Surface).padding(16.dp),
        verticalArrangement = Arrangement.spacedBy(10.dp),
    ) {
        item { NxSectionHeader("Tickets de clientes", "${s.items.size} total") }
        s.message?.let { msg -> item { Text(msg, color = NxColors.Success, style = MaterialTheme.typography.bodySmall) } }
        if (!s.error.isNullOrBlank()) {
            item { NxErrorBlock(s.error!!) { vm.refresh(initial = false) } }
        }
        if (s.items.isNotEmpty()) {
            item {
                Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceEvenly) {
                    KpiChip("Total", "${s.items.size}")
                    KpiChip("Nuevos", "$kpiNew", Color(0xFFE65100))
                    KpiChip("Asignados", "$kpiAssigned", Color(0xFF1565C0))
                }
            }
        }
        item {
            Row(Modifier.horizontalScroll(rememberScrollState()), horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                statuses.forEach { st ->
                    FilterChip(
                        selected = s.statusFilter == st,
                        onClick = { vm.setStatusFilter(st) },
                        label = { Text(if (st == "todos") "Todos" else st, style = MaterialTheme.typography.labelSmall) },
                    )
                }
            }
        }
        item {
            OutlinedTextField(
                value = s.query,
                onValueChange = vm::setQuery,
                modifier = Modifier.fillMaxWidth(),
                placeholder = { Text("Buscar ticket…") },
                singleLine = true,
            )
        }
        if (s.loading) {
            item { NxLoadingBlock("Cargando tickets…") }
        } else if (vm.filtered().isEmpty()) {
            item {
                NxEmptyState(
                    title = "Sin tickets",
                    subtitle = "No hay solicitudes de clientes con este filtro.",
                    actionLabel = "Actualizar",
                    onAction = { vm.refresh(initial = false) },
                )
            }
        } else {
            items(vm.filtered().take(80), key = { it.rowKey }) { t ->
                NxPanelShell(onClick = { vm.select(t) }) {
                    Text(t.displayTitle, fontWeight = FontWeight.Bold)
                    Text(t.branchName, style = MaterialTheme.typography.bodySmall, color = NxColors.Muted)
                    NxStatusChip(t.status, clientTicketTone(t.status))
                }
            }
        }
    }
    }
}

// ── Procurement ────────────────────────────────────────────────────────────

data class ProcurementUiState(
    val tab: Int = 0,
    val loading: Boolean = true,
    val isRefreshing: Boolean = false,
    val error: String? = null,
    val message: String? = null,
    val query: String = "",
    val requisitions: List<mx.nexara.mobile.nativeapp.data.api.RequisitionDto> = emptyList(),
    val orders: List<mx.nexara.mobile.nativeapp.data.api.PurchaseOrderDto> = emptyList(),
    val goodsReceipts: List<mx.nexara.mobile.nativeapp.data.api.GoodsReceiptDto> = emptyList(),
    val selected: mx.nexara.mobile.nativeapp.data.api.RequisitionDto? = null,
    val rejectReason: String = "",
    val acting: Boolean = false,
)

class ProcurementViewModel(app: Application) : AndroidViewModel(app) {
    private val repo = OpsRepository(app.applicationContext)
    private val extra = ExtraRepository(app.applicationContext)
    private val _state = MutableStateFlow(ProcurementUiState())
    val state: StateFlow<ProcurementUiState> = _state

    init { refresh() }

    fun setTab(v: Int) = _state.update { it.copy(tab = v, selected = null) }
    fun setQuery(v: String) = _state.update { it.copy(query = v) }
    fun setRejectReason(v: String) = _state.update { it.copy(rejectReason = v) }
    fun select(item: mx.nexara.mobile.nativeapp.data.api.RequisitionDto?) = _state.update { it.copy(selected = item) }

    fun refresh(initial: Boolean = true) {
        _state.update {
            it.copy(
                loading = initial && it.requisitions.isEmpty() && it.orders.isEmpty(),
                isRefreshing = !initial,
                error = null,
            )
        }
        viewModelScope.launch {
            try {
                val reqs = withContext(Dispatchers.IO) { repo.requisitionDtos() }
                val orders = withContext(Dispatchers.IO) { repo.purchaseOrderDtos() }
                val gr = withContext(Dispatchers.IO) {
                    runCatching { extra.goodsReceiptDtos() }.getOrDefault(emptyList())
                }
                _state.update {
                    it.copy(loading = false, isRefreshing = false, requisitions = reqs, orders = orders, goodsReceipts = gr)
                }
            } catch (e: Exception) {
                _state.update { it.copy(loading = false, isRefreshing = false, error = e.message) }
            }
        }
    }

    fun approve(id: Long) = act(id) { repo.approveRequisition(id) }
    fun reject(id: Long) {
        val reason = _state.value.rejectReason.trim()
        if (reason.isEmpty()) {
            _state.update { it.copy(error = "Escribe el motivo de rechazo") }
            return
        }
        act(id) { repo.rejectRequisition(id, reason) }
    }

    private fun act(id: Long, block: suspend () -> Unit) {
        _state.update { it.copy(acting = true, error = null) }
        viewModelScope.launch {
            try {
                withContext(Dispatchers.IO) { block() }
                _state.update { it.copy(acting = false, message = "Actualizado", selected = null, rejectReason = "") }
                refresh()
            } catch (e: Exception) {
                _state.update { it.copy(acting = false, error = e.message) }
            }
        }
    }

    fun filteredRequisitions(): List<mx.nexara.mobile.nativeapp.data.api.RequisitionDto> {
        val q = _state.value.query.trim().lowercase()
        val list = _state.value.requisitions
        if (q.isBlank()) return list
        return list.filter {
            it.displayTitle.lowercase().contains(q) ||
                it.requestedByName.lowercase().contains(q) ||
                it.reqNumber.lowercase().contains(q)
        }
    }

    fun filteredOrders(): List<mx.nexara.mobile.nativeapp.data.api.PurchaseOrderDto> {
        val q = _state.value.query.trim().lowercase()
        val list = _state.value.orders
        if (q.isBlank()) return list
        return list.filter {
            it.displayTitle.lowercase().contains(q) || it.supplierName.lowercase().contains(q)
        }
    }

    fun filteredReceipts(): List<mx.nexara.mobile.nativeapp.data.api.GoodsReceiptDto> {
        val q = _state.value.query.trim().lowercase()
        val list = _state.value.goodsReceipts
        if (q.isBlank()) return list
        return list.filter {
            it.displayTitle.lowercase().contains(q) ||
                it.warehouseName.lowercase().contains(q) ||
                it.poNumber.lowercase().contains(q)
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ProcurementModuleScreen(vm: ProcurementViewModel = viewModel()) {
    val s by vm.state.collectAsState()
    val selected = s.selected

    if (selected != null && s.tab == 0) {
        val id = selected.id
        LazyColumn(Modifier.fillMaxSize().padding(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
            item { Text("Requisición", style = MaterialTheme.typography.titleLarge) }
            item { DetailLine("Título", selected.displayTitle) }
            item { DetailLine("Número", selected.reqNumber) }
            item { DetailLine("Solicitante", selected.requestedByName) }
            item { DetailLine("Departamento", selected.departmentName) }
            item { DetailLine("Estado", selected.status) }
            item { DetailLine("Prioridad", selected.priority) }
            if (id != null && selected.canDecide) {
                item {
                    OutlinedTextField(
                        value = s.rejectReason,
                        onValueChange = vm::setRejectReason,
                        modifier = Modifier.fillMaxWidth(),
                        label = { Text("Motivo rechazo") },
                    )
                }
                item { ActionBtn("Aprobar", s.acting) { vm.approve(id) } }
                item {
                    TextButton(onClick = { vm.reject(id) }, enabled = !s.acting) {
                        Text("Rechazar", color = MaterialTheme.colorScheme.error)
                    }
                }
            }
            item { TextButton(onClick = { vm.select(null) }) { Text("Volver") } }
        }
        return
    }

    Column(Modifier.fillMaxSize().background(NxColors.Surface)) {
        ScrollableTabRow(selectedTabIndex = s.tab) {
            Tab(selected = s.tab == 0, onClick = { vm.setTab(0) }, text = { Text("Requisiciones") })
            Tab(selected = s.tab == 1, onClick = { vm.setTab(1) }, text = { Text("Órdenes") })
            Tab(selected = s.tab == 2, onClick = { vm.setTab(2) }, text = { Text("Recepciones") })
        }
        PullToRefreshBox(
            isRefreshing = s.isRefreshing,
            onRefresh = { vm.refresh(initial = false) },
            modifier = Modifier.fillMaxSize(),
        ) {
        LazyColumn(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
            item {
                NxSectionHeader(
                    when (s.tab) {
                        1 -> "Órdenes de compra"
                        2 -> "Recepciones de mercancía"
                        else -> "Requisiciones"
                    },
                    subtitle = "Compras y abastecimiento",
                )
            }
            item {
                OutlinedTextField(
                    value = s.query,
                    onValueChange = vm::setQuery,
                    modifier = Modifier.fillMaxWidth(),
                    placeholder = { Text("Buscar…") },
                    singleLine = true,
                )
            }
            if (!s.message.isNullOrBlank()) {
                item { Text(s.message!!, color = NxColors.Success, fontWeight = FontWeight.SemiBold) }
            }
            if (!s.error.isNullOrBlank()) {
                item { NxErrorBlock(s.error!!) { vm.refresh(initial = false) } }
            }
            if (s.loading) {
                item { NxLoadingBlock("Cargando…") }
            } else when (s.tab) {
                1 -> {
                    val list = vm.filteredOrders()
                    if (list.isEmpty()) item { NxEmptyState("Sin órdenes", "No hay órdenes de compra registradas.") }
                    else items(list.take(80), key = { it.rowKey }) { r ->
                        NxPanelShell {
                            Text(r.displayTitle, fontWeight = FontWeight.Bold)
                            Text(r.supplierName, style = MaterialTheme.typography.bodySmall, color = NxColors.Muted)
                            NxStatusChip(r.status, NxTone.Info)
                        }
                    }
                }
                2 -> {
                    val list = vm.filteredReceipts()
                    if (list.isEmpty()) item { NxEmptyState("Sin recepciones", "No hay recepciones de mercancía.") }
                    else items(list.take(80), key = { it.rowKey }) { r ->
                        NxPanelShell {
                            Text(r.displayTitle, fontWeight = FontWeight.Bold)
                            Text(r.warehouseName, style = MaterialTheme.typography.bodySmall, color = NxColors.Muted)
                            NxStatusChip(r.status, NxTone.Success)
                            r.quantity?.let { qty ->
                                Text("Cantidad: $qty", style = MaterialTheme.typography.labelSmall, color = NxColors.Teal)
                            }
                        }
                    }
                }
                else -> {
                    val list = vm.filteredRequisitions()
                    if (list.isEmpty()) item { NxEmptyState("Sin requisiciones", "No hay requisiciones pendientes.") }
                    else items(list.take(80), key = { it.rowKey }) { r ->
                        NxPanelShell(onClick = { vm.select(r) }) {
                            Text(r.displayTitle, fontWeight = FontWeight.Bold)
                            Text(r.requestedByName, style = MaterialTheme.typography.bodySmall, color = NxColors.Muted)
                            NxStatusChip(r.status, NxTone.Warning)
                        }
                    }
                }
            }
        }
        }
    }
}

// ── Warehouse hub ──────────────────────────────────────────────────────────

@Composable
fun WarehouseHubScreen(initialTab: Int = 0) {
    // WMS enterprise: recepción / despacho / conteo / alertas
    WarehouseWmsScreen(initialTab = initialTab)
}

// ── Service sheets ───────────────────────────────────────────────────────────

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ServiceSheetsModuleScreen() {
    val app = androidx.compose.ui.platform.LocalContext.current.applicationContext as Application
    val repo = remember { OpsRepository(app) }
    val scope = rememberCoroutineScope()
    var loading by remember { mutableStateOf(true) }
    var isRefreshing by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf<String?>(null) }
    var items by remember { mutableStateOf<List<ServiceSheetListDto>>(emptyList()) }
    var query by remember { mutableStateOf("") }
    var selected by remember { mutableStateOf<ServiceSheetListDto?>(null) }

    fun reload(initial: Boolean = true) {
        scope.launch {
            loading = initial && items.isEmpty()
            isRefreshing = !initial
            error = null
            try {
                items = withContext(Dispatchers.IO) { repo.serviceSheetDtos() }
            } catch (e: Exception) {
                error = e.message ?: "No se pudieron cargar hojas de servicio"
            } finally {
                loading = false
                isRefreshing = false
            }
        }
    }

    LaunchedEffect(Unit) { reload(initial = true) }

    if (selected != null) {
        val s = selected!!
        LazyColumn(Modifier.fillMaxSize(), contentPadding = PaddingValues(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
            item {
                Row(Modifier.fillMaxWidth(), Arrangement.SpaceBetween, Alignment.CenterVertically) {
                    OutlinedButton(onClick = { selected = null }) { Text("← Volver") }
                    KpiChip(s.status.ifBlank { "—" }, null)
                }
            }
            item { Text("Hoja de servicio", style = MaterialTheme.typography.titleLarge, fontWeight = FontWeight.Bold) }
            item {
                Card(Modifier.fillMaxWidth()) {
                    Column(Modifier.padding(14.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                        DetailLine("Folio", s.displayTitle)
                        DetailLine("Cliente", s.clientName)
                        DetailLine("Tipo", s.serviceType)
                        DetailLine("AN / Actividad", if (s.activityId > 0L) s.activityId.toString() else "")
                        DetailLine("Técnico", s.technicianName)
                        DetailLine("Fecha visita", s.createdAt.take(10))
                        DetailLine("Resumen", s.workSummary)
                    }
                }
            }
            if (s.equipmentList.isNotEmpty()) {
                item { Text("Materiales utilizados", style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.SemiBold) }
                items(s.equipmentList, key = { str(it, "id").ifBlank { it.hashCode().toString() } }) { m ->
                    Card(Modifier.fillMaxWidth()) {
                        Row(Modifier.fillMaxWidth().padding(12.dp), Arrangement.SpaceBetween) {
                            Text(str(m, "name", "nombre", "description").ifBlank { "Material" }, Modifier.weight(1f))
                            val qty = str(m, "quantity", "cantidad")
                            if (qty.isNotBlank()) Text("x$qty", color = MaterialTheme.colorScheme.onSurfaceVariant)
                        }
                    }
                }
            }
            if (s.observations.isNotBlank()) {
                item { Text("Observaciones", style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.SemiBold) }
                item { Card(Modifier.fillMaxWidth()) { Text(s.observations, Modifier.padding(14.dp), style = MaterialTheme.typography.bodyMedium) } }
            }
            item {
                Text("Firma del cliente", style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.SemiBold)
                if (s.signedName.isBlank()) {
                    Text("Sin firma del cliente", color = MaterialTheme.colorScheme.onSurfaceVariant)
                } else {
                    DetailLine("Firmado por", s.signedName)
                    DetailLine("Fecha", s.createdAt.take(10))
                }
            }
            if (s.pdfUrl.isNotBlank()) {
                item { DetailLine("PDF", s.pdfUrl) }
            }
        }
        return
    }

    val filtered = if (query.isBlank()) items else {
        val q = query.lowercase()
        items.filter {
            it.displayTitle.lowercase().contains(q) ||
                it.clientName.lowercase().contains(q) ||
                it.serviceType.lowercase().contains(q)
        }
    }

    PullToRefreshBox(
        isRefreshing = isRefreshing,
        onRefresh = { reload(initial = false) },
        modifier = Modifier.fillMaxSize(),
    ) {
    LazyColumn(
        Modifier.fillMaxSize().background(NxColors.Surface).padding(16.dp),
        verticalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        item { NxSectionHeader("Hojas de servicio", "${filtered.size} resultado(s)") }
        item {
            OutlinedTextField(
                value = query,
                onValueChange = { query = it },
                modifier = Modifier.fillMaxWidth(),
                placeholder = { Text("Buscar folio o cliente…") },
                singleLine = true,
            )
        }
        if (loading) item { NxLoadingBlock("Cargando hojas…") }
        else if (error != null) item { NxErrorBlock(error!!) { reload(initial = false) } }
        else if (filtered.isEmpty()) item { NxEmptyState("Sin hojas de servicio", "No hay registros con este filtro.", "Actualizar") { reload(initial = false) } }
        else items(filtered.take(80), key = { it.rowKey }) { row ->
            NxPanelShell(onClick = { selected = row }) {
                Text(row.displayTitle, fontWeight = FontWeight.Bold)
                Text(
                    listOf(row.clientName, row.status).filter { it.isNotBlank() }.joinToString(" · "),
                    style = MaterialTheme.typography.bodySmall,
                    color = NxColors.Muted,
                )
            }
        }
    }
    }
}

// ── Maintenance hub (órdenes + activos) ────────────────────────────────────

data class MaintenanceUiState(
    val tab: Int = 0,
    val loading: Boolean = true,
    val isRefreshing: Boolean = false,
    val query: String = "",
    val orders: List<mx.nexara.mobile.nativeapp.data.api.WorkOrderDto> = emptyList(),
    val assets: List<mx.nexara.mobile.nativeapp.data.api.MaintenanceAssetDto> = emptyList(),
    val selectedOrder: mx.nexara.mobile.nativeapp.data.api.WorkOrderDto? = null,
    val selectedAsset: mx.nexara.mobile.nativeapp.data.api.MaintenanceAssetDto? = null,
    val acting: Boolean = false,
    val message: String? = null,
)

class MaintenanceViewModel(app: Application) : AndroidViewModel(app) {
    private val repo = OpsRepository(app.applicationContext)
    private val _state = MutableStateFlow(MaintenanceUiState())
    val state: StateFlow<MaintenanceUiState> = _state

    init { refresh() }

    fun setTab(v: Int) = _state.update { it.copy(tab = v, selectedOrder = null, selectedAsset = null) }
    fun setQuery(v: String) = _state.update { it.copy(query = v) }
    fun selectOrder(item: mx.nexara.mobile.nativeapp.data.api.WorkOrderDto?) =
        _state.update { it.copy(selectedOrder = item, selectedAsset = null) }
    fun selectAsset(item: mx.nexara.mobile.nativeapp.data.api.MaintenanceAssetDto?) =
        _state.update { it.copy(selectedAsset = item, selectedOrder = null) }

    fun refresh(initial: Boolean = true) {
        _state.update {
            it.copy(
                loading = initial && it.orders.isEmpty() && it.assets.isEmpty(),
                isRefreshing = !initial,
            )
        }
        viewModelScope.launch {
            val orders = withContext(Dispatchers.IO) { repo.workOrderDtos() }
            val assets = withContext(Dispatchers.IO) { repo.maintenanceAssetDtos() }
            _state.update { it.copy(loading = false, isRefreshing = false, orders = orders, assets = assets) }
        }
    }

    fun startOrder(id: Long) {
        _state.update { it.copy(acting = true, message = null) }
        viewModelScope.launch {
            try {
                val coords = mx.nexara.mobile.nativeapp.util.DeviceLocation.current(getApplication())
                withContext(Dispatchers.IO) { repo.startWorkOrder(id) }
                val geo = coords.messageSuffixOrNone()
                _state.update {
                    it.copy(acting = false, message = "✅ Orden iniciada$geo", selectedOrder = null)
                }
                refresh()
            } catch (e: Exception) {
                _state.update { it.copy(acting = false, message = "❌ ${e.message ?: "Error"}") }
            }
        }
    }

    fun completeOrder(id: Long, notes: String? = null) {
        _state.update { it.copy(acting = true, message = null) }
        viewModelScope.launch {
            try {
                val coords = mx.nexara.mobile.nativeapp.util.DeviceLocation.current(getApplication())
                val merged = coords.mergeIntoNotes(notes)
                withContext(Dispatchers.IO) {
                    repo.completeWorkOrder(id, merged.ifBlank { null })
                }
                val geo = coords.messageSuffixOrNone()
                _state.update {
                    it.copy(acting = false, message = "✅ Orden completada$geo", selectedOrder = null)
                }
                refresh()
            } catch (e: Exception) {
                _state.update { it.copy(acting = false, message = "❌ ${e.message ?: "Error"}") }
            }
        }
    }

    fun filteredOrders(statusFilter: String = "todos"): List<mx.nexara.mobile.nativeapp.data.api.WorkOrderDto> {
        val q = _state.value.query.trim().lowercase()
        return _state.value.orders.filter { row ->
            val st = row.status
            val matchStatus = when (statusFilter) {
                "abiertas" -> woIsOpen(st)
                "progreso" -> woInProgress(st)
                "cerradas" -> woIsDone(st)
                else -> true
            }
            val matchQ = q.isBlank() ||
                row.displayTitle.lowercase().contains(q) ||
                row.description.lowercase().contains(q) ||
                row.orderNumber.lowercase().contains(q) ||
                row.assetName.lowercase().contains(q)
            matchStatus && matchQ
        }
    }

    fun filteredAssets(): List<mx.nexara.mobile.nativeapp.data.api.MaintenanceAssetDto> {
        val q = _state.value.query.trim().lowercase()
        if (q.isBlank()) return _state.value.assets
        return _state.value.assets.filter {
            it.displayName.lowercase().contains(q) ||
                it.code.lowercase().contains(q) ||
                it.serialNumber.lowercase().contains(q) ||
                it.category.lowercase().contains(q)
        }
    }

    fun openOrdersCount() = _state.value.orders.count {
        woIsOpen(it.status) || woInProgress(it.status)
    }
}

private fun woIsOpen(status: String): Boolean {
    val s = status.lowercase()
    return s.contains("pendiente") || s == "open" || s.contains("abierta") || s.contains("scheduled") || s.contains("new")
}

private fun woInProgress(status: String): Boolean {
    val s = status.lowercase()
    return s.contains("progreso") || s.contains("in_progress") || s.contains("in-progress") || s.contains("started") || s == "active"
}

private fun woIsDone(status: String): Boolean {
    val s = status.lowercase()
    return s.contains("complet") || s.contains("cerrad") || s.contains("done") || s.contains("closed")
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun MaintenanceModuleScreen(
    initialTab: Int = 0,
    vm: MaintenanceViewModel = viewModel(),
) {
    val s by vm.state.collectAsState()
    LaunchedEffect(initialTab) { vm.setTab(initialTab) }
    var statusFilter by remember { mutableStateOf("todos") }
    var completeNotes by remember { mutableStateOf("") }

    val selectedOrder = s.selectedOrder
    if (selectedOrder != null) {
        val id = selectedOrder.id
        val status = selectedOrder.status
        LazyColumn(Modifier.fillMaxSize().padding(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
            item { OutlinedButton(onClick = { vm.selectOrder(null); completeNotes = "" }) { Text("← Órdenes") } }
            item { Text("Orden de trabajo", style = MaterialTheme.typography.titleLarge) }
            item {
                mx.nexara.mobile.nativeapp.ui.common.LocationPermissionBanner(
                    message = "Al iniciar o completar la orden se registrará tu GPS en notas de campo.",
                    requestOnAppear = true,
                )
            }
            if (!s.message.isNullOrBlank()) {
                item {
                    Text(
                        s.message!!,
                        color = if (s.message!!.startsWith("✅")) Color(0xFF2E7D32) else MaterialTheme.colorScheme.error,
                        fontWeight = FontWeight.SemiBold,
                    )
                }
            }
            item {
                Card(Modifier.fillMaxWidth()) {
                    Column(Modifier.padding(14.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                        DetailLine("Folio", selectedOrder.orderNumber)
                        DetailLine("Título", selectedOrder.displayTitle)
                        DetailLine("Activo", selectedOrder.assetName)
                        DetailLine("Estado", status)
                        DetailLine("Técnico", selectedOrder.technicianName)
                        DetailLine("Prioridad", selectedOrder.priority)
                        DetailLine("Fecha", selectedOrder.plannedDate.take(10))
                    }
                }
            }
            val notes = selectedOrder.notes.ifBlank { selectedOrder.description }
            if (notes.isNotBlank()) {
                item {
                    Card(Modifier.fillMaxWidth()) {
                        Column(Modifier.padding(14.dp)) {
                            Text("Notas", fontWeight = FontWeight.SemiBold)
                            Text(notes, style = MaterialTheme.typography.bodyMedium)
                        }
                    }
                }
            }
            if (id != null) {
                if (woIsOpen(status)) {
                    item { ActionBtn("Iniciar orden", s.acting) { vm.startOrder(id) } }
                }
                if (woInProgress(status) || woIsOpen(status)) {
                    item {
                        OutlinedTextField(
                            value = completeNotes,
                            onValueChange = { completeNotes = it },
                            modifier = Modifier.fillMaxWidth(),
                            label = { Text("Notas de cierre (opcional)") },
                            minLines = 2,
                        )
                    }
                    item {
                        ActionBtn("Completar orden", s.acting) {
                            vm.completeOrder(id, completeNotes.ifBlank { null })
                        }
                    }
                }
            }
        }
        return
    }

    val selectedAsset = s.selectedAsset
    if (selectedAsset != null) {
        LazyColumn(Modifier.fillMaxSize().padding(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
            item { OutlinedButton(onClick = { vm.selectAsset(null) }) { Text("← Activos") } }
            item { Text("Activo", style = MaterialTheme.typography.titleLarge) }
            item {
                Card(Modifier.fillMaxWidth()) {
                    Column(Modifier.padding(14.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                        DetailLine("Nombre", selectedAsset.displayName)
                        DetailLine("Código", selectedAsset.code)
                        DetailLine("Serie", selectedAsset.serialNumber)
                        DetailLine("Tipo", selectedAsset.category)
                        DetailLine("Estado", selectedAsset.status)
                        DetailLine("Ubicación", selectedAsset.location)
                        DetailLine("Responsable", selectedAsset.responsibleName)
                        DetailLine("Fabricante", selectedAsset.manufacturer)
                        DetailLine("Modelo", selectedAsset.model)
                        DetailLine("Última mantto.", selectedAsset.lastMaintenanceDate.take(10))
                    }
                }
            }
        }
        return
    }

    Column(Modifier.fillMaxSize().background(NxColors.Surface)) {
        if (s.orders.isNotEmpty() || s.assets.isNotEmpty()) {
            Row(Modifier.fillMaxWidth().padding(16.dp), horizontalArrangement = Arrangement.SpaceEvenly) {
                KpiChip("Órdenes", "${s.orders.size}")
                KpiChip("Abiertas", "${vm.openOrdersCount()}", Color(0xFFE65100))
                KpiChip("Activos", "${s.assets.size}", Color(0xFF1565C0))
            }
        }
        ScrollableTabRow(selectedTabIndex = s.tab) {
            Tab(selected = s.tab == 0, onClick = { vm.setTab(0) }, text = { Text("Órdenes") })
            Tab(selected = s.tab == 1, onClick = { vm.setTab(1) }, text = { Text("Activos") })
        }
        if (s.tab == 0) {
            Row(
                Modifier.horizontalScroll(rememberScrollState()).padding(horizontal = 16.dp, vertical = 4.dp),
                horizontalArrangement = Arrangement.spacedBy(6.dp),
            ) {
                listOf("todos" to "Todas", "abiertas" to "Abiertas", "progreso" to "En progreso", "cerradas" to "Cerradas")
                    .forEach { (key, label) ->
                        FilterChip(selected = statusFilter == key, onClick = { statusFilter = key }, label = { Text(label) })
                    }
            }
        }
        PullToRefreshBox(
            isRefreshing = s.isRefreshing,
            onRefresh = { vm.refresh(initial = false) },
            modifier = Modifier.fillMaxSize(),
        ) {
        Column(Modifier.padding(horizontal = 16.dp)) {
            OutlinedTextField(
                value = s.query,
                onValueChange = vm::setQuery,
                modifier = Modifier.fillMaxWidth().padding(vertical = 8.dp),
                placeholder = { Text("Buscar…") },
                singleLine = true,
            )
            if (s.loading) {
                NxLoadingBlock("Cargando mantenimiento…")
            } else if (s.tab == 0) {
                val list = vm.filteredOrders(statusFilter)
                if (list.isEmpty()) {
                    NxEmptyState("Sin órdenes", "No hay órdenes de trabajo con este filtro.")
                } else {
                    LazyColumn {
                        items(list.take(80), key = { it.id ?: it.orderNumber }) { row ->
                            NxPanelShell(
                                onClick = { vm.selectOrder(row) },
                                modifier = Modifier.padding(vertical = 4.dp),
                            ) {
                                Text(row.displayTitle, fontWeight = FontWeight.Bold)
                                Text(row.assetName, style = MaterialTheme.typography.bodySmall, color = NxColors.Muted)
                                NxStatusChip(row.status, workOrderTone(row.status))
                            }
                        }
                    }
                }
            } else {
                val list = vm.filteredAssets()
                if (list.isEmpty()) {
                    NxEmptyState("Sin activos", "No hay activos registrados.")
                } else {
                    LazyColumn {
                        items(list.take(80), key = { it.id ?: it.code }) { row ->
                            NxPanelShell(
                                onClick = { vm.selectAsset(row) },
                                modifier = Modifier.padding(vertical = 4.dp),
                            ) {
                                Text(row.displayName, fontWeight = FontWeight.Bold)
                                Text(row.code.ifBlank { row.serialNumber }, style = MaterialTheme.typography.bodySmall, color = NxColors.Muted)
                                NxStatusChip(row.status, NxTone.Info)
                            }
                        }
                    }
                }
            }
        }
        }
    }
}

// ── Shared UI bits ───────────────────────────────────────────────────────────

@Composable
internal fun DetailLine(label: String, value: String) {
    if (value.isBlank()) return
    Row(Modifier.fillMaxWidth()) {
        Text(label, fontWeight = FontWeight.Medium)
        Spacer(Modifier.weight(1f))
        Text(value, color = MaterialTheme.colorScheme.onSurfaceVariant)
    }
}

@Composable
private fun ActionBtn(label: String, loading: Boolean, onClick: () -> Unit) {
    Button(onClick = onClick, enabled = !loading, modifier = Modifier.fillMaxWidth()) {
        if (loading) CircularProgressIndicator(Modifier.height(20.dp)) else Text(label)
    }
}

private fun clientTicketTone(status: String): NxTone = when (status.uppercase()) {
    "NEW" -> NxTone.Warning
    "ASSIGNED" -> NxTone.Info
    "APPROVED", "CLOSED" -> NxTone.Success
    "REJECTED" -> NxTone.Danger
    else -> NxTone.Neutral
}

private fun workOrderTone(status: String): NxTone = when {
    woIsOpen(status) -> NxTone.Warning
    woInProgress(status) -> NxTone.Info
    woIsDone(status) -> NxTone.Success
    else -> NxTone.Neutral
}

@Composable
internal fun KpiChip(label: String, value: String?, color: Color? = null, modifier: Modifier = Modifier) {
    Column(horizontalAlignment = Alignment.CenterHorizontally, modifier = modifier.padding(horizontal = 4.dp, vertical = 4.dp)) {
        Text(value ?: label, fontWeight = FontWeight.Bold, color = color ?: MaterialTheme.colorScheme.primary)
        if (value != null) Text(label, style = MaterialTheme.typography.labelSmall)
    }
}
