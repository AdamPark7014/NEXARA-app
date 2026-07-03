package mx.nexara.mobile.nativeapp.ui.console.screens

import android.app.Application
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
import androidx.compose.material3.FilterChip
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.ScrollableTabRow
import androidx.compose.material3.Tab
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
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
import mx.nexara.mobile.nativeapp.data.ops.OpsRepository

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
    val error: String? = null,
    val message: String? = null,
    val query: String = "",
    val statusFilter: String = "todos",
    val items: List<Map<String, Any?>> = emptyList(),
    val selected: Map<String, Any?>? = null,
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

    fun select(item: Map<String, Any?>?) = _state.update { it.copy(selected = item) }

    fun refresh() {
        _state.update { it.copy(loading = true, error = null) }
        viewModelScope.launch {
            try {
                val st = _state.value.statusFilter.takeIf { it != "todos" }
                val list = withContext(Dispatchers.IO) { repo.clientTicketRequests(st) }
                _state.update { it.copy(loading = false, items = list) }
            } catch (e: Exception) {
                _state.update { it.copy(loading = false, error = e.message) }
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

    fun filtered(): List<Map<String, Any?>> {
        val q = _state.value.query.trim().lowercase()
        if (q.isBlank()) return _state.value.items
        return _state.value.items.filter {
            str(it, "description", "title").lowercase().contains(q) ||
                str(it, "branchName", "clientName").lowercase().contains(q)
        }
    }
}

@Composable
fun ClientTicketsModuleScreen(vm: ClientTicketsViewModel = viewModel()) {
    val s by vm.state.collectAsState()
    val selected = s.selected

    if (selected != null) {
        val id = str(selected, "id").toLongOrNull()
        val status = str(selected, "status").uppercase()
        LazyColumn(Modifier.fillMaxSize().padding(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
            item { Text("Ticket de cliente", style = MaterialTheme.typography.titleLarge) }
            item { DetailLine("Descripción", str(selected, "description", "title")) }
            item { DetailLine("Tipo", str(selected, "requestType")) }
            item { DetailLine("Urgencia", str(selected, "urgency")) }
            item { DetailLine("Estado", str(selected, "status")) }
            item { DetailLine("Sucursal", str(selected, "branchName")) }
            item { DetailLine("Cliente", str(selected, "clientName", "client")) }
            if (id != null) {
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
    val kpiNew = s.items.count { str(it, "status").equals("NEW", true) }
    val kpiAssigned = s.items.count { str(it, "status").equals("ASSIGNED", true) }

    LazyColumn(Modifier.fillMaxSize().padding(16.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
        item { Text("Tickets de clientes", style = MaterialTheme.typography.titleLarge) }
        s.message?.let { msg -> item { Text(msg, color = Color(0xFF2E7D32), style = MaterialTheme.typography.bodySmall) } }
        s.error?.let { err -> item { Text(err, color = MaterialTheme.colorScheme.error) } }
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
            item { CircularProgressIndicator() }
        } else if (vm.filtered().isEmpty()) {
            item { Text("Sin tickets", color = MaterialTheme.colorScheme.onSurfaceVariant) }
        } else {
            items(vm.filtered().take(80), key = { rowId(it) }) { t ->
                Card(
                    onClick = { vm.select(t) },
                    modifier = Modifier.fillMaxWidth(),
                    colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surfaceVariant),
                ) {
                    Column(Modifier.padding(12.dp)) {
                        Text(str(t, "description", "title"), fontWeight = FontWeight.Bold)
                        Text(str(t, "branchName"), style = MaterialTheme.typography.bodySmall)
                        Text(str(t, "status"), style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.primary)
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
    val error: String? = null,
    val message: String? = null,
    val query: String = "",
    val requisitions: List<Map<String, Any?>> = emptyList(),
    val orders: List<Map<String, Any?>> = emptyList(),
    val selected: Map<String, Any?>? = null,
    val rejectReason: String = "",
    val acting: Boolean = false,
)

class ProcurementViewModel(app: Application) : AndroidViewModel(app) {
    private val repo = OpsRepository(app.applicationContext)
    private val _state = MutableStateFlow(ProcurementUiState())
    val state: StateFlow<ProcurementUiState> = _state

    init { refresh() }

    fun setTab(v: Int) = _state.update { it.copy(tab = v, selected = null) }
    fun setQuery(v: String) = _state.update { it.copy(query = v) }
    fun setRejectReason(v: String) = _state.update { it.copy(rejectReason = v) }
    fun select(item: Map<String, Any?>?) = _state.update { it.copy(selected = item) }

    fun refresh() {
        _state.update { it.copy(loading = true, error = null) }
        viewModelScope.launch {
            try {
                val reqs = withContext(Dispatchers.IO) { repo.requisitions() }
                val orders = withContext(Dispatchers.IO) { repo.purchaseOrders() }
                _state.update { it.copy(loading = false, requisitions = reqs, orders = orders) }
            } catch (e: Exception) {
                _state.update { it.copy(loading = false, error = e.message) }
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

    fun currentList(): List<Map<String, Any?>> =
        if (_state.value.tab == 0) _state.value.requisitions else _state.value.orders

    fun filtered(): List<Map<String, Any?>> {
        val q = _state.value.query.trim().lowercase()
        val list = currentList()
        if (q.isBlank()) return list
        return list.filter {
            str(it, "title", "description", "folio").lowercase().contains(q) ||
                str(it, "requestedBy", "solicitante").lowercase().contains(q)
        }
    }
}

@Composable
fun ProcurementModuleScreen(vm: ProcurementViewModel = viewModel()) {
    val s by vm.state.collectAsState()
    val selected = s.selected

    if (selected != null && s.tab == 0) {
        val id = str(selected, "id").toLongOrNull()
        val status = str(selected, "status", "estado").uppercase()
        LazyColumn(Modifier.fillMaxSize().padding(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
            item { Text("Requisición", style = MaterialTheme.typography.titleLarge) }
            item { DetailLine("Título", str(selected, "title", "description")) }
            item { DetailLine("Solicitante", str(selected, "requestedBy", "solicitante")) }
            item { DetailLine("Estado", str(selected, "status", "estado")) }
            if (id != null && (status == "PENDING" || status == "SUBMITTED")) {
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

    Column(Modifier.fillMaxSize()) {
        ScrollableTabRow(selectedTabIndex = s.tab) {
            Tab(selected = s.tab == 0, onClick = { vm.setTab(0) }, text = { Text("Requisiciones") })
            Tab(selected = s.tab == 1, onClick = { vm.setTab(1) }, text = { Text("Órdenes") })
        }
        LazyColumn(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
            item {
                OutlinedTextField(
                    value = s.query,
                    onValueChange = vm::setQuery,
                    modifier = Modifier.fillMaxWidth(),
                    placeholder = { Text("Buscar…") },
                    singleLine = true,
                )
            }
            if (s.loading) item { CircularProgressIndicator() }
            else if (vm.filtered().isEmpty()) item { Text("Sin registros") }
            else items(vm.filtered().take(80), key = { rowId(it) }) { r ->
                val clickable = s.tab == 0
                Card(
                    onClick = { if (clickable) vm.select(r) },
                    enabled = clickable,
                    modifier = Modifier.fillMaxWidth(),
                ) {
                    Column(Modifier.padding(12.dp)) {
                        Text(str(r, "title", "description", "folio", "number"), fontWeight = FontWeight.Bold)
                        Text(str(r, "requestedBy", "solicitante", "vendorName"), style = MaterialTheme.typography.bodySmall)
                        Text(str(r, "status", "estado"), style = MaterialTheme.typography.labelSmall)
                    }
                }
            }
        }
    }
}

// ── Warehouse hub ──────────────────────────────────────────────────────────

@Composable
fun WarehouseHubScreen(initialTab: Int = 0) {
    val app = androidx.compose.ui.platform.LocalContext.current.applicationContext as Application
    val repo = remember { OpsRepository(app) }
    var tab by remember { mutableIntStateOf(initialTab) }
    var loading by remember { mutableStateOf(true) }
    var warehouses by remember { mutableStateOf<List<Map<String, Any?>>>(emptyList()) }
    var stock by remember { mutableStateOf<List<Map<String, Any?>>>(emptyList()) }
    var query by remember { mutableStateOf("") }
    var selectedItem by remember { mutableStateOf<Map<String, Any?>?>(null) }

    LaunchedEffect(Unit) {
        loading = true
        warehouses = withContext(Dispatchers.IO) { repo.warehouse() }
        stock = withContext(Dispatchers.IO) { repo.stock() }
        loading = false
    }

    val si = selectedItem
    if (si != null) {
        LazyColumn(Modifier.fillMaxSize(), contentPadding = PaddingValues(12.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
            item { OutlinedButton(onClick = { selectedItem = null }) { Text(if (tab == 0) "← Inventario" else "← Bodegas") } }
            item {
                Card(Modifier.fillMaxWidth()) {
                    Column(Modifier.padding(14.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                        Text(str(si, "name", "nombre", "productName").ifBlank { "Producto" }, fontWeight = FontWeight.Bold, style = MaterialTheme.typography.titleMedium)
                        if (tab == 0) {
                            DetailLine("SKU", str(si, "sku", "code"))
                            DetailLine("Categoría", str(si, "category", "categoria"))
                            num(si, "quantity", "cantidad", "stock")?.let { DetailLine("Cantidad", "${it.toInt()} uds") }
                            num(si, "minStock", "stockMinimo")?.let { DetailLine("Stock mínimo", "${it.toInt()}") }
                            DetailLine("Ubicación", str(si, "location", "ubicacion", "bodega"))
                            num(si, "price", "precio")?.let { DetailLine("Precio", "$$it") }
                        } else {
                            DetailLine("Código", str(si, "code", "codigo"))
                            DetailLine("Ubicación", str(si, "location", "ubicacion", "address"))
                            DetailLine("Responsable", str(si, "managerName", "responsable"))
                        }
                    }
                }
            }
        }
        return
    }

    val items = if (tab == 0) stock else warehouses
    val filtered = if (query.isBlank()) items else {
        val q = query.lowercase()
        items.filter {
            str(it, "name", "nombre", "productName").lowercase().contains(q) ||
                str(it, "code", "sku").lowercase().contains(q)
        }
    }
    val lowStock = stock.count { (num(it, "quantity", "cantidad", "stock") ?: 99.0) < 5 }

    Column(Modifier.fillMaxSize()) {
        if (stock.isNotEmpty() || warehouses.isNotEmpty()) {
            Row(Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 8.dp), horizontalArrangement = Arrangement.SpaceEvenly) {
                KpiChip("Productos", "${stock.size}")
                KpiChip("Stock bajo", "$lowStock", if (lowStock > 0) Color.Red else Color(0xFF2E7D32))
                KpiChip("Bodegas", "${warehouses.size}")
            }
        }
        ScrollableTabRow(selectedTabIndex = tab) {
            Tab(selected = tab == 0, onClick = { tab = 0 }, text = { Text("Inventario") })
            Tab(selected = tab == 1, onClick = { tab = 1 }, text = { Text("Bodegas") })
        }
        OutlinedTextField(
            value = query,
            onValueChange = { query = it },
            modifier = Modifier.fillMaxWidth().padding(16.dp),
            placeholder = { Text("Buscar…") },
            singleLine = true,
        )
        if (loading) {
            Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) { CircularProgressIndicator() }
        } else {
            LazyColumn(contentPadding = PaddingValues(horizontal = 16.dp)) {
                items(filtered.take(100), key = { rowId(it) }) { row ->
                    Card(
                        onClick = { selectedItem = row },
                        modifier = Modifier.fillMaxWidth().padding(vertical = 4.dp),
                    ) {
                        Column(Modifier.padding(12.dp)) {
                            Text(str(row, "name", "nombre", "productName"), fontWeight = FontWeight.Bold)
                            Text(str(row, "code", "sku", "location"), style = MaterialTheme.typography.bodySmall)
                            if (tab == 0) {
                                num(row, "quantity", "cantidad", "stock")?.let { q ->
                                    Text("Cantidad: ${q.toInt()}", style = MaterialTheme.typography.labelSmall,
                                        color = if (q < 5) Color.Red else MaterialTheme.colorScheme.onSurfaceVariant)
                                }
                            }
                        }
                    }
                }
            }
        }
    }
}

// ── Service sheets ───────────────────────────────────────────────────────────

@Composable
fun ServiceSheetsModuleScreen() {
    val app = androidx.compose.ui.platform.LocalContext.current.applicationContext as Application
    val repo = remember { OpsRepository(app) }
    var loading by remember { mutableStateOf(true) }
    var items by remember { mutableStateOf<List<Map<String, Any?>>>(emptyList()) }
    var query by remember { mutableStateOf("") }
    var selected by remember { mutableStateOf<Map<String, Any?>?>(null) }

    LaunchedEffect(Unit) {
        loading = true
        items = withContext(Dispatchers.IO) { repo.serviceSheets() }
        loading = false
    }

    if (selected != null) {
        val s = selected!!
        LazyColumn(Modifier.fillMaxSize(), contentPadding = PaddingValues(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
            item {
                Row(Modifier.fillMaxWidth(), Arrangement.SpaceBetween, Alignment.CenterVertically) {
                    OutlinedButton(onClick = { selected = null }) { Text("← Volver") }
                    KpiChip(str(s, "status", "estado").ifBlank { "—" }, null)
                }
            }
            item { Text("Hoja de servicio", style = MaterialTheme.typography.titleLarge, fontWeight = FontWeight.Bold) }
            item {
                Card(Modifier.fillMaxWidth()) {
                    Column(Modifier.padding(14.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                        fun r(k: String, v: String) { if (v.isNotBlank()) item { Row(Modifier.fillMaxWidth(), Arrangement.SpaceBetween) { Text(k, color = MaterialTheme.colorScheme.onSurfaceVariant); Text(v) } } }
                        DetailLine("Folio", str(s, "folio", "number", "folioNumber"))
                        DetailLine("Cliente", str(s, "clientName", "cliente"))
                        DetailLine("Sucursal", str(s, "branchName", "sucursal"))
                        DetailLine("AN / Actividad", str(s, "anNumber", "activityAn", "activityId"))
                        DetailLine("Técnico", str(s, "technicianName", "userName", "responsable"))
                        DetailLine("Fecha visita", str(s, "visitDate", "scheduledDate", "createdAt").take(10))
                        DetailLine("Hora entrada", str(s, "checkIn", "entryTime", "horaEntrada"))
                        DetailLine("Hora salida", str(s, "checkOut", "exitTime", "horaSalida"))
                    }
                }
            }
            val materials = ((s["materials"] ?: s["materiales"]) as? List<*>)?.filterIsInstance<Map<String, Any?>>() ?: emptyList()
            if (materials.isNotEmpty()) {
                item { Text("Materiales utilizados", style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.SemiBold) }
                items(materials, key = { str(it, "id").ifBlank { it.hashCode().toString() } }) { m ->
                    Card(Modifier.fillMaxWidth()) {
                        Row(Modifier.fillMaxWidth().padding(12.dp), Arrangement.SpaceBetween) {
                            Text(str(m, "name", "nombre", "description").ifBlank { "Material" }, Modifier.weight(1f))
                            val qty = str(m, "quantity", "cantidad")
                            if (qty.isNotBlank()) Text("x$qty", color = MaterialTheme.colorScheme.onSurfaceVariant)
                        }
                    }
                }
            }
            val obs = str(s, "observations", "observaciones", "notes", "description")
            if (obs.isNotBlank()) {
                item { Text("Observaciones", style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.SemiBold) }
                item { Card(Modifier.fillMaxWidth()) { Text(obs, Modifier.padding(14.dp), style = MaterialTheme.typography.bodyMedium) } }
            }
            val signed = str(s, "signedAt", "firmadoAt", "clientSignature")
            item {
                Text("Firma del cliente", style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.SemiBold)
                if (signed.isBlank()) {
                    Text("Sin firma del cliente", color = MaterialTheme.colorScheme.onSurfaceVariant)
                } else {
                    DetailLine("Firmado por", str(s, "signedByName", "clientName", "signerName"))
                    DetailLine("Fecha", signed.take(10))
                }
            }
        }
        return
    }

    val filtered = if (query.isBlank()) items else {
        val q = query.lowercase()
        items.filter {
            str(it, "folio", "number").lowercase().contains(q) ||
                str(it, "clientName").lowercase().contains(q)
        }
    }

    LazyColumn(Modifier.fillMaxSize().padding(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
        item {
            OutlinedTextField(
                value = query,
                onValueChange = { query = it },
                modifier = Modifier.fillMaxWidth(),
                placeholder = { Text("Buscar folio o cliente…") },
                singleLine = true,
            )
        }
        if (loading) item { CircularProgressIndicator() }
        else if (filtered.isEmpty()) item { Text("Sin hojas de servicio") }
        else items(filtered.take(80), key = { rowId(it) }) { row ->
            Card(onClick = { selected = row }, modifier = Modifier.fillMaxWidth()) {
                Column(Modifier.padding(12.dp)) {
                    Text(str(row, "folio", "number"), fontWeight = FontWeight.Bold)
                    Text(str(row, "clientName", "anNumber"), style = MaterialTheme.typography.bodySmall)
                }
            }
        }
    }
}

// ── Maintenance hub (órdenes + activos) ────────────────────────────────────

data class MaintenanceUiState(
    val tab: Int = 0,
    val loading: Boolean = true,
    val query: String = "",
    val orders: List<Map<String, Any?>> = emptyList(),
    val assets: List<Map<String, Any?>> = emptyList(),
    val selected: Map<String, Any?>? = null,
    val acting: Boolean = false,
    val message: String? = null,
)

class MaintenanceViewModel(app: Application) : AndroidViewModel(app) {
    private val repo = OpsRepository(app.applicationContext)
    private val _state = MutableStateFlow(MaintenanceUiState())
    val state: StateFlow<MaintenanceUiState> = _state

    init { refresh() }

    fun setTab(v: Int) = _state.update { it.copy(tab = v, selected = null) }
    fun setQuery(v: String) = _state.update { it.copy(query = v) }
    fun select(item: Map<String, Any?>?) = _state.update { it.copy(selected = item) }

    fun refresh() {
        _state.update { it.copy(loading = true) }
        viewModelScope.launch {
            val orders = withContext(Dispatchers.IO) { repo.workOrders() }
            val assets = withContext(Dispatchers.IO) { repo.maintenanceAssets() }
            _state.update { it.copy(loading = false, orders = orders, assets = assets) }
        }
    }

    fun startOrder(id: Long) = act(id) { repo.startWorkOrder(id) }
    fun completeOrder(id: Long) = act(id) { repo.completeWorkOrder(id) }

    private fun act(id: Long, block: suspend () -> Unit) {
        _state.update { it.copy(acting = true) }
        viewModelScope.launch {
            try {
                withContext(Dispatchers.IO) { block() }
                _state.update { it.copy(acting = false, message = "Actualizado", selected = null) }
                refresh()
            } catch (e: Exception) {
                _state.update { it.copy(acting = false, message = e.message) }
            }
        }
    }

    fun filteredOrders(): List<Map<String, Any?>> {
        val q = _state.value.query.trim().lowercase()
        if (q.isBlank()) return _state.value.orders
        return _state.value.orders.filter {
            str(it, "title", "description", "orderNumber").lowercase().contains(q) ||
                str(it, "assetName", "equipmentName").lowercase().contains(q)
        }
    }

    fun filteredAssets(): List<Map<String, Any?>> {
        val q = _state.value.query.trim().lowercase()
        if (q.isBlank()) return _state.value.assets
        return _state.value.assets.filter {
            str(it, "name", "nombre").lowercase().contains(q) ||
                str(it, "code", "tag", "serial").lowercase().contains(q)
        }
    }

    fun openOrdersCount() = _state.value.orders.count {
        val st = str(it, "status", "estado").lowercase()
        st.contains("pendiente") || st == "open" || st.contains("abierta")
    }
}

@Composable
fun MaintenanceModuleScreen(
    initialTab: Int = 0,
    vm: MaintenanceViewModel = viewModel(),
) {
    val s by vm.state.collectAsState()
    LaunchedEffect(initialTab) { vm.setTab(initialTab) }

    val selected = s.selected
    if (selected != null) {
        if (s.tab == 0) {
            val id = str(selected, "id").toLongOrNull()
            val status = str(selected, "status", "estado").uppercase()
            LazyColumn(Modifier.fillMaxSize().padding(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                item { OutlinedButton(onClick = { vm.select(null) }) { Text("← Órdenes") } }
                item { Text("Orden de trabajo", style = MaterialTheme.typography.titleLarge) }
                item {
                    Card(Modifier.fillMaxWidth()) {
                        Column(Modifier.padding(14.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                            DetailLine("Título", str(selected, "title", "description"))
                            DetailLine("Activo", str(selected, "assetName", "equipmentName"))
                            DetailLine("Estado", str(selected, "status", "estado"))
                            DetailLine("Técnico", str(selected, "technicianName", "responsable"))
                            DetailLine("Prioridad", str(selected, "priority", "prioridad"))
                            DetailLine("Fecha", str(selected, "scheduledDate", "createdAt").take(10))
                        }
                    }
                }
                val notes = str(selected, "notes", "observaciones", "description")
                if (notes.isNotBlank()) {
                    item { Card(Modifier.fillMaxWidth()) { Column(Modifier.padding(14.dp)) { Text("Notas", fontWeight = FontWeight.SemiBold); Text(notes, style = MaterialTheme.typography.bodyMedium) } } }
                }
                if (id != null) {
                    if (status.contains("PENDIENTE") || status == "OPEN") {
                        item { ActionBtn("Iniciar orden", s.acting) { vm.startOrder(id) } }
                    }
                    if (status.contains("PROGRESO") || status.contains("IN_PROGRESS")) {
                        item { ActionBtn("Completar orden", s.acting) { vm.completeOrder(id) } }
                    }
                }
            }
        } else {
            LazyColumn(Modifier.fillMaxSize().padding(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                item { OutlinedButton(onClick = { vm.select(null) }) { Text("← Activos") } }
                item { Text("Activo", style = MaterialTheme.typography.titleLarge) }
                item {
                    Card(Modifier.fillMaxWidth()) {
                        Column(Modifier.padding(14.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                            DetailLine("Nombre", str(selected, "name", "nombre"))
                            DetailLine("Código", str(selected, "code", "tag", "serial"))
                            DetailLine("Tipo", str(selected, "type", "tipo", "category"))
                            DetailLine("Estado", str(selected, "status", "estado"))
                            DetailLine("Ubicación", str(selected, "location", "ubicacion"))
                            DetailLine("Responsable", str(selected, "assignedTo", "responsable"))
                            DetailLine("Última mantto.", str(selected, "lastMaintenanceDate", "lastService").take(10))
                        }
                    }
                }
            }
        }
        return
    }

    Column(Modifier.fillMaxSize()) {
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
        OutlinedTextField(
            value = s.query,
            onValueChange = vm::setQuery,
            modifier = Modifier.fillMaxWidth().padding(16.dp),
            placeholder = { Text("Buscar…") },
            singleLine = true,
        )
        if (s.loading) {
            Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) { CircularProgressIndicator() }
        } else {
            val list = if (s.tab == 0) vm.filteredOrders() else vm.filteredAssets()
            LazyColumn(contentPadding = PaddingValues(horizontal = 16.dp)) {
                items(list.take(80), key = { rowId(it) }) { row ->
                    Card(
                        onClick = { vm.select(row) },
                        modifier = Modifier.fillMaxWidth().padding(vertical = 4.dp),
                    ) {
                        Column(Modifier.padding(12.dp)) {
                            Text(
                                if (s.tab == 0) str(row, "title", "description", "orderNumber")
                                else str(row, "name", "nombre"),
                                fontWeight = FontWeight.Bold,
                            )
                            Text(
                                if (s.tab == 0) str(row, "assetName", "equipmentName")
                                else str(row, "code", "tag", "serial"),
                                style = MaterialTheme.typography.bodySmall,
                            )
                            Text(str(row, "status", "estado"), style = MaterialTheme.typography.labelSmall)
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

@Composable
internal fun KpiChip(label: String, value: String?, color: Color? = null, modifier: Modifier = Modifier) {
    Column(horizontalAlignment = Alignment.CenterHorizontally, modifier = modifier.padding(horizontal = 4.dp, vertical = 4.dp)) {
        Text(value ?: label, fontWeight = FontWeight.Bold, color = color ?: MaterialTheme.colorScheme.primary)
        if (value != null) Text(label, style = MaterialTheme.typography.labelSmall)
    }
}
