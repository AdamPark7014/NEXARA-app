package mx.nexara.mobile.nativeapp.ui.console.screens

import android.app.Application
import androidx.compose.foundation.clickable
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
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
import mx.nexara.mobile.nativeapp.data.extra.ExtraRepository
import java.text.NumberFormat
import java.util.Locale

// ── ERP BI (reemplaza JSON crudo en analytics/bi) ───────────────────────────

data class ErpBiState(
    val loading: Boolean = true,
    val error: String? = null,
    val dashboard: mx.nexara.mobile.nativeapp.data.api.AnalyticsDashboardDto =
        mx.nexara.mobile.nativeapp.data.api.AnalyticsDashboardDto(),
    val computedKpis: List<mx.nexara.mobile.nativeapp.data.api.ComputedKpiDto> = emptyList(),
    val margin: List<mx.nexara.mobile.nativeapp.data.api.BiMarginRowDto> = emptyList(),
    val engineers: List<mx.nexara.mobile.nativeapp.data.api.BiEngineerRowDto> = emptyList(),
    val clientsRoi: List<mx.nexara.mobile.nativeapp.data.api.BiClientRoiDto> = emptyList(),
)

class ErpBiViewModel(app: Application) : AndroidViewModel(app) {
    private val repo = ExtraRepository(app.applicationContext)
    private val _state = MutableStateFlow(ErpBiState())
    val state: StateFlow<ErpBiState> = _state

    fun load() {
        _state.update { it.copy(loading = true, error = null) }
        viewModelScope.launch {
            try {
                val dash = withContext(Dispatchers.IO) { repo.analyticsDashboardDto() }
                val kpis = withContext(Dispatchers.IO) { repo.analyticsComputedKpiDtos() }
                val margin = withContext(Dispatchers.IO) { repo.biMarginRowDtos() }
                val engineers = withContext(Dispatchers.IO) { repo.biEngineerRowDtos() }
                val clients = withContext(Dispatchers.IO) { repo.biClientRoiDtos() }
                _state.update {
                    it.copy(loading = false, dashboard = dash, computedKpis = kpis, margin = margin, engineers = engineers, clientsRoi = clients)
                }
            } catch (e: Exception) {
                _state.update { it.copy(loading = false, error = e.message ?: "Error al cargar BI") }
            }
        }
    }
}

@Composable
fun ErpBiScreen() {
    val vm: ErpBiViewModel = viewModel()
    val state by vm.state.collectAsState()
    LaunchedEffect(Unit) { vm.load() }

    LazyColumn(
        modifier = Modifier.fillMaxSize().padding(16.dp),
        verticalArrangement = Arrangement.spacedBy(14.dp),
    ) {
        item {
            Column {
                Text("Business Intelligence", style = MaterialTheme.typography.headlineSmall.copy(fontWeight = FontWeight.Bold))
                Text("KPIs cross-módulo · margen · ingenieros · ROI clientes", style = MaterialTheme.typography.bodySmall, color = Color(0xFF64748B))
            }
        }

        if (state.loading && state.dashboard.isEmpty) {
            item { LinearProgressIndicator(Modifier.fillMaxWidth()) }
            return@LazyColumn
        }
        if (state.error != null) {
            item {
                Text(state.error!!, color = MaterialTheme.colorScheme.error)
                Button(onClick = { vm.load() }) { Text("Reintentar") }
            }
            return@LazyColumn
        }

        item {
            ErpSectionTitle("Resumen ejecutivo")
            val d = state.dashboard
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                ErpMetricTile(Modifier.weight(1f), "Ingresos", erpFmtMxn(d.revenue), Color(0xFF059669))
                ErpMetricTile(Modifier.weight(1f), "Gastos", erpFmtMxn(d.expenses), Color(0xFFEF4444))
            }
            Spacer(Modifier.height(8.dp))
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                ErpMetricTile(Modifier.weight(1f), "OC abiertas", "${d.openPurchaseOrders}", Color(0xFF3B82F6))
                ErpMetricTile(Modifier.weight(1f), "Mant. activos", "${d.pendingMaintenanceOrders}", Color(0xFFF59E0B))
                ErpMetricTile(Modifier.weight(1f), "Stock bajo", "${d.lowStockAlerts}", Color(0xFF8B5CF6))
            }
        }

        if (state.computedKpis.isNotEmpty()) {
            item { ErpSectionTitle("KPIs en tiempo real") }
            val grouped = state.computedKpis.groupBy { it.category }
            grouped.forEach { (cat, items) ->
                item {
                    Text(cat, fontWeight = FontWeight.SemiBold, color = Color(0xFF0F172A))
                    Spacer(Modifier.height(6.dp))
                    items.forEach { kpi ->
                        ComputedKpiRow(kpi)
                        Spacer(Modifier.height(6.dp))
                    }
                }
            }
        }

        if (state.margin.isNotEmpty()) {
            item {
                val totalBudget = state.margin.sumOf { it.budget }
                val totalMargin = state.margin.sumOf { it.margin }
                ErpSectionTitle("Margen por línea", erpFmtMxn(totalMargin))
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    ErpMetricTile(Modifier.weight(1f), "Presupuesto", erpFmtMxn(totalBudget), Color(0xFF0D9488))
                    ErpMetricTile(Modifier.weight(1f), "Margen total", erpFmtMxn(totalMargin), Color(0xFF059669))
                }
            }
            items(state.margin, key = { it.rowKey }) { row ->
                MarginRowCard(row)
            }
        }

        if (state.engineers.isNotEmpty()) {
            item { ErpSectionTitle("Ranking ingenieros (90d)") }
            items(state.engineers, key = { it.rowKey }) { eng ->
                EngineerRowCard(eng)
            }
        }

        if (state.clientsRoi.isNotEmpty()) {
            item { ErpSectionTitle("ROI por cliente") }
            items(state.clientsRoi, key = { it.rowKey }) { c ->
                ClientRoiCard(c)
            }
        }

        item { Spacer(Modifier.height(24.dp)) }
    }
}

@Composable
private fun ComputedKpiRow(kpi: mx.nexara.mobile.nativeapp.data.api.ComputedKpiDto) {
    val accent = when (kpi.status) {
        "danger" -> Color(0xFFEF4444)
        "warning" -> Color(0xFFF59E0B)
        "ok" -> Color(0xFF059669)
        else -> Color(0xFF64748B)
    }
    Card(shape = RoundedCornerShape(12.dp), colors = CardDefaults.cardColors(containerColor = accent.copy(0.08f))) {
        Row(Modifier.fillMaxWidth().padding(12.dp), horizontalArrangement = Arrangement.SpaceBetween) {
            Column(Modifier.weight(1f)) {
                Text(kpi.name, fontWeight = FontWeight.Medium, color = Color(0xFF0F172A))
                Text(kpi.unit, style = MaterialTheme.typography.labelSmall, color = Color(0xFF64748B))
            }
            Text(kpi.value?.let { erpFmtValue(it) } ?: kpi.valueLabel, fontWeight = FontWeight.Bold, color = accent)
        }
    }
}

@Composable
private fun MarginRowCard(row: mx.nexara.mobile.nativeapp.data.api.BiMarginRowDto) {
    ErpListCard(
        title = row.projectType,
        subtitle = "${row.count} proyectos · ${erpFmtPct(row.marginPercent)} margen",
        trailing = erpFmtMxn(row.margin),
    )
}

@Composable
private fun EngineerRowCard(row: mx.nexara.mobile.nativeapp.data.api.BiEngineerRowDto) {
    ErpListCard(
        title = row.engineerName,
        subtitle = "${row.completed}/${row.totalActivities} OT · ${erpFmtPct(row.completionRate)} cierre",
        trailing = row.avgDurationMin?.let { "${it.toInt()} min" } ?: "—",
    )
}

@Composable
private fun ClientRoiCard(row: mx.nexara.mobile.nativeapp.data.api.BiClientRoiDto) {
    ErpListCard(
        title = row.clientName,
        subtitle = "${row.projects} proy. · ${erpFmtMxn(row.revenue)}",
        trailing = erpFmtPct(row.roi),
    )
}

// ── Vista ejecutiva C-Level ─────────────────────────────────────────────────

data class ExecutiveState(
    val loading: Boolean = true,
    val error: String? = null,
    val data: mx.nexara.mobile.nativeapp.data.api.ExecutiveCLevelDto =
        mx.nexara.mobile.nativeapp.data.api.ExecutiveCLevelDto(),
)

class ExecutiveViewModel(app: Application) : AndroidViewModel(app) {
    private val repo = ExtraRepository(app.applicationContext)
    private val _state = MutableStateFlow(ExecutiveState())
    val state: StateFlow<ExecutiveState> = _state

    fun load() {
        _state.update { it.copy(loading = true, error = null) }
        viewModelScope.launch {
            try {
                val data = withContext(Dispatchers.IO) { repo.executiveCLevelDto() }
                _state.update { it.copy(loading = false, data = data) }
            } catch (e: Exception) {
                _state.update { it.copy(loading = false, error = e.message) }
            }
        }
    }
}

@Composable
fun ExecutiveScreen() {
    val vm: ExecutiveViewModel = viewModel()
    val state by vm.state.collectAsState()
    LaunchedEffect(Unit) { vm.load() }

    val headline = state.data.headline
    val ops = state.data.operations
    val finance = state.data.finance
    val alerts = state.data.alerts

    LazyColumn(Modifier.fillMaxSize().padding(16.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
        item {
            Text("Vista ejecutiva", style = MaterialTheme.typography.headlineSmall.copy(fontWeight = FontWeight.Bold))
            Text("KPIs cross-módulo del negocio", style = MaterialTheme.typography.bodySmall, color = Color(0xFF64748B))
        }
        if (state.loading) { item { LinearProgressIndicator(Modifier.fillMaxWidth()) }; return@LazyColumn }
        if (state.error != null) { item { Text(state.error!!, color = MaterialTheme.colorScheme.error) }; return@LazyColumn }

        item {
            ErpSectionTitle("Finanzas y ventas")
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                ErpMetricTile(Modifier.weight(1f), "Ingresos MTD", erpFmtMxn(headline.revenueMtd), Color(0xFF059669))
                ErpMetricTile(Modifier.weight(1f), "Pipeline", erpFmtMxn(headline.pipelineValue), Color(0xFF3B82F6))
            }
            Spacer(Modifier.height(8.dp))
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                ErpMetricTile(Modifier.weight(1f), "Caja", erpFmtMxn(headline.cashOnHand), Color(0xFF0D9488))
                ErpMetricTile(Modifier.weight(1f), "CxC", erpFmtMxn(headline.arOutstanding), Color(0xFFF59E0B))
            }
        }

        item {
            ErpSectionTitle("Operaciones")
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                ErpMetricTile(Modifier.weight(1f), "OT abiertas", "${ops.otOpen}", Color(0xFF6366F1))
                ErpMetricTile(Modifier.weight(1f), "OT vencidas", "${ops.otOverdue}", Color(0xFFEF4444))
                ErpMetricTile(Modifier.weight(1f), "Tickets", "${ops.ticketsOpen}", Color(0xFF8B5CF6))
            }
        }

        item {
            ErpSectionTitle("Facturación")
            ErpMetricTile(Modifier.fillMaxWidth(), "Facturado MTD", erpFmtMxn(finance.invoicedMtd), Color(0xFF059669))
        }

        if (alerts.isNotEmpty()) {
            item { ErpSectionTitle("Alertas", "${alerts.size}") }
            items(alerts, key = { it.rowKey }) { alert ->
                Card(Modifier.fillMaxWidth(), colors = CardDefaults.cardColors(containerColor = Color(0xFFFFF7ED))) {
                    Column(Modifier.padding(12.dp)) {
                        Text(alert.title, fontWeight = FontWeight.SemiBold)
                        Text(alert.detail, style = MaterialTheme.typography.bodySmall, color = Color(0xFF64748B))
                    }
                }
            }
        }
    }
}

// ── Aprobaciones workflow ───────────────────────────────────────────────────

data class ApprovalsState(
    val loading: Boolean = true,
    val error: String? = null,
    val message: String? = null,
    val items: List<mx.nexara.mobile.nativeapp.data.api.WorkflowApprovalDto> = emptyList(),
    val acting: Long? = null,
)

class ApprovalsViewModel(app: Application) : AndroidViewModel(app) {
    private val repo = ExtraRepository(app.applicationContext)
    private val _state = MutableStateFlow(ApprovalsState())
    val state: StateFlow<ApprovalsState> = _state

    fun load() {
        _state.update { it.copy(loading = true, error = null) }
        viewModelScope.launch {
            try {
                val items = withContext(Dispatchers.IO) { repo.workflowApprovals() }
                _state.update { it.copy(loading = false, items = items, acting = null) }
            } catch (e: Exception) {
                _state.update { it.copy(loading = false, error = e.message) }
            }
        }
    }

    fun decide(id: Long, approved: Boolean, comments: String? = null) {
        if (!approved && comments.isNullOrBlank()) {
            _state.update { it.copy(error = "Indica el motivo de rechazo") }
            return
        }
        _state.update { it.copy(acting = id, error = null, message = null) }
        viewModelScope.launch {
            try {
                withContext(Dispatchers.IO) {
                    repo.workflowDecide(id, if (approved) "APPROVED" else "REJECTED", comments)
                }
                _state.update {
                    it.copy(message = if (approved) "✅ Aprobado" else "✅ Rechazado", acting = null)
                }
                load()
            } catch (e: Exception) {
                _state.update { it.copy(acting = null, error = e.message) }
            }
        }
    }
}

@Composable
fun ApprovalsScreen() {
    val vm: ApprovalsViewModel = viewModel()
    val state by vm.state.collectAsState()
    var rejectNotes by remember { mutableStateOf<Map<Long, String>>(emptyMap()) }
    LaunchedEffect(Unit) { vm.load() }

    LazyColumn(Modifier.fillMaxSize().padding(16.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
        item {
            Text("Aprobaciones", style = MaterialTheme.typography.headlineSmall.copy(fontWeight = FontWeight.Bold))
            Text("Pendientes de tu decisión", style = MaterialTheme.typography.bodySmall, color = Color(0xFF64748B))
        }
        if (!state.message.isNullOrBlank()) {
            item { Text(state.message!!, color = Color(0xFF2E7D32), fontWeight = FontWeight.SemiBold) }
        }
        if (!state.error.isNullOrBlank()) {
            item { Text(state.error!!, color = MaterialTheme.colorScheme.error) }
        }
        if (state.loading) { item { LinearProgressIndicator(Modifier.fillMaxWidth()) }; return@LazyColumn }
        if (state.items.isEmpty()) {
            item { Text("Sin aprobaciones pendientes.", color = Color(0xFF64748B)) }
            return@LazyColumn
        }
        items(state.items, key = { it.rowKey }) { item ->
            val id = item.id
            val note = rejectNotes[id].orEmpty()
            Card(Modifier.fillMaxWidth(), shape = RoundedCornerShape(14.dp)) {
                Column(Modifier.padding(14.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    Text(item.displayTitle, fontWeight = FontWeight.SemiBold)
                    Text(item.displaySubtitle, style = MaterialTheme.typography.bodySmall, color = Color(0xFF64748B))
                    OutlinedTextField(
                        value = note,
                        onValueChange = { rejectNotes = rejectNotes + (id to it) },
                        modifier = Modifier.fillMaxWidth(),
                        label = { Text("Comentario / motivo rechazo") },
                        singleLine = true,
                    )
                    Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        Button(
                            onClick = { if (id > 0) vm.decide(id, true, note.ifBlank { null }) },
                            enabled = state.acting != id,
                            modifier = Modifier.weight(1f),
                        ) { Text("Aprobar") }
                        OutlinedButton(
                            onClick = { if (id > 0) vm.decide(id, false, note) },
                            enabled = state.acting != id,
                            modifier = Modifier.weight(1f),
                        ) { Text("Rechazar") }
                    }
                }
            }
        }
    }
}

// ── NOC ─────────────────────────────────────────────────────────────────────

data class NocState(
    val loading: Boolean = true,
    val error: String? = null,
    val summary: Map<String, Any?> = emptyMap(),
    val alerts: List<mx.nexara.mobile.nativeapp.data.api.NocAlertDto> = emptyList(),
    val devices: List<mx.nexara.mobile.nativeapp.data.api.NocDeviceDto> = emptyList(),
)

class NocViewModel(app: Application) : AndroidViewModel(app) {
    private val repo = ExtraRepository(app.applicationContext)
    private val _state = MutableStateFlow(NocState())
    val state: StateFlow<NocState> = _state

    fun load() {
        _state.update { it.copy(loading = true, error = null) }
        viewModelScope.launch {
            try {
                val summary = withContext(Dispatchers.IO) { repo.nocSummary() }
                val alerts = withContext(Dispatchers.IO) { repo.nocAlertDtos() }
                val devices = withContext(Dispatchers.IO) { repo.nocDeviceDtos() }
                _state.update { it.copy(loading = false, summary = summary, alerts = alerts, devices = devices) }
            } catch (e: Exception) {
                _state.update { it.copy(loading = false, error = e.message) }
            }
        }
    }
}

@Composable
fun NocModuleScreen() {
    val vm: NocViewModel = viewModel()
    val state by vm.state.collectAsState()
    var sevFilter by remember { mutableStateOf("todos") }
    LaunchedEffect(Unit) { vm.load() }

    val filteredAlerts = remember(state.alerts, sevFilter) {
        when (sevFilter) {
            "critical" -> state.alerts.filter { it.isCritical }
            "warning" -> state.alerts.filter { it.isWarningBand }
            else -> state.alerts
        }
    }

    LazyColumn(Modifier.fillMaxSize().padding(16.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
        item {
            Text("NOC · Monitoreo", style = MaterialTheme.typography.headlineSmall.copy(fontWeight = FontWeight.Bold))
            Text("Dispositivos y alertas 24/7", style = MaterialTheme.typography.bodySmall, color = Color(0xFF64748B))
        }
        if (state.loading) { item { LinearProgressIndicator(Modifier.fillMaxWidth()) }; return@LazyColumn }

        val s = state.summary
        item {
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                ErpMetricTile(Modifier.weight(1f), "Dispositivos", "${erpInt(s, "total")}", Color(0xFF3B82F6))
                ErpMetricTile(Modifier.weight(1f), "Críticos", "${erpInt(s, "criticalCount")}", Color(0xFFEF4444))
                ErpMetricTile(Modifier.weight(1f), "Uptime", "${erpFmtPct(erpDbl(s, "avgUptime"))}", Color(0xFF059669))
            }
        }

        if (state.alerts.isNotEmpty()) {
            item { ErpSectionTitle("Alertas activas", "${filteredAlerts.size}/${state.alerts.size}") }
            item {
                Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                    listOf("todos" to "Todas", "critical" to "Críticas", "warning" to "Warning").forEach { (key, label) ->
                        FilterChip(
                            selected = sevFilter == key,
                            onClick = { sevFilter = key },
                            label = { Text(label) },
                        )
                    }
                }
            }
            items(filteredAlerts.take(20), key = { it.rowKey }) { a ->
                val color = if (a.isCritical) Color(0xFFEF4444) else Color(0xFFF59E0B)
                ErpListCard(a.displayTitle, a.message, trailing = a.severity, accent = color)
            }
        }

        if (state.devices.isNotEmpty()) {
            item { ErpSectionTitle("Dispositivos") }
            items(state.devices.take(20), key = { it.rowKey }) { d ->
                val color = when (d.status.uppercase()) {
                    "ONLINE" -> Color(0xFF059669)
                    "OFFLINE", "ALERT" -> Color(0xFFEF4444)
                    else -> Color(0xFFF59E0B)
                }
                ErpListCard(
                    d.displayName,
                    "${d.type} · ${d.clientName}",
                    trailing = d.status,
                    accent = color,
                )
            }
        }
    }
}

// ── SLA ─────────────────────────────────────────────────────────────────────

data class SlaState(
    val loading: Boolean = true,
    val error: String? = null,
    val stats: mx.nexara.mobile.nativeapp.data.api.SlaStatsDto = mx.nexara.mobile.nativeapp.data.api.SlaStatsDto(),
)

class SlaViewModel(app: Application) : AndroidViewModel(app) {
    private val repo = ExtraRepository(app.applicationContext)
    private val _state = MutableStateFlow(SlaState())
    val state: StateFlow<SlaState> = _state

    fun load() {
        _state.update { it.copy(loading = true, error = null) }
        viewModelScope.launch {
            try {
                val stats = withContext(Dispatchers.IO) { repo.slaStatsDto() }
                _state.update { it.copy(loading = false, stats = stats) }
            } catch (e: Exception) {
                _state.update { it.copy(loading = false, error = e.message) }
            }
        }
    }
}

@Composable
fun SlaModuleScreen() {
    val vm: SlaViewModel = viewModel()
    val state by vm.state.collectAsState()
    LaunchedEffect(Unit) { vm.load() }

    val resp = state.stats.response
    val resol = state.stats.resolution
    val breaches = state.stats.recentBreaches

    LazyColumn(Modifier.fillMaxSize().padding(16.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
        item {
            Text("SLA y tiempos", style = MaterialTheme.typography.headlineSmall.copy(fontWeight = FontWeight.Bold))
            Text("Cumplimiento por contrato y prioridad", style = MaterialTheme.typography.bodySmall, color = Color(0xFF64748B))
        }
        if (state.loading) { item { LinearProgressIndicator(Modifier.fillMaxWidth()) }; return@LazyColumn }

        item {
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                ErpMetricTile(Modifier.weight(1f), "Tickets", "${state.stats.total}", Color(0xFF3B82F6))
                ErpMetricTile(Modifier.weight(1f), "Abiertos", "${state.stats.stillOpen}", Color(0xFFF59E0B))
            }
            Spacer(Modifier.height(8.dp))
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                ErpMetricTile(Modifier.weight(1f), "Resp. a tiempo", "${resp.onTime}", Color(0xFF059669))
                ErpMetricTile(Modifier.weight(1f), "Resp. tarde", "${resp.late}", Color(0xFFEF4444))
                ErpMetricTile(Modifier.weight(1f), "% resp.", erpFmtPct(resp.compliancePercent), Color(0xFF0D9488))
            }
            Spacer(Modifier.height(8.dp))
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                ErpMetricTile(Modifier.weight(1f), "Res. a tiempo", "${resol.onTime}", Color(0xFF059669))
                ErpMetricTile(Modifier.weight(1f), "Res. tarde", "${resol.late}", Color(0xFFEF4444))
                ErpMetricTile(Modifier.weight(1f), "% res.", erpFmtPct(resol.compliancePercent), Color(0xFF0D9488))
            }
        }

        if (breaches.isNotEmpty()) {
            item { ErpSectionTitle("Incumplimientos recientes") }
            items(breaches.take(15), key = { it.rowKey }) { b ->
                ErpListCard(
                    b.displayTitle,
                    "${b.type} · ${b.priority}",
                    trailing = "+${b.hoursLate.toInt()}h",
                    accent = Color(0xFFEF4444),
                )
            }
        }
    }
}

// ── Contratos de mantenimiento ──────────────────────────────────────────────

data class MaintContractsState(
    val loading: Boolean = true,
    val error: String? = null,
    val items: List<mx.nexara.mobile.nativeapp.data.api.MaintenanceContractDto> = emptyList(),
)

class MaintContractsViewModel(app: Application) : AndroidViewModel(app) {
    private val repo = ExtraRepository(app.applicationContext)
    private val _state = MutableStateFlow(MaintContractsState())
    val state: StateFlow<MaintContractsState> = _state

    fun load() {
        _state.update { it.copy(loading = true, error = null) }
        viewModelScope.launch {
            try {
                val items = withContext(Dispatchers.IO) { repo.maintenanceContractDtos() }
                _state.update { it.copy(loading = false, items = items) }
            } catch (e: Exception) {
                _state.update { it.copy(loading = false, error = e.message) }
            }
        }
    }
}

@Composable
fun MaintenanceContractsScreen() {
    val vm: MaintContractsViewModel = viewModel()
    val state by vm.state.collectAsState()
    var selected by remember { mutableStateOf<mx.nexara.mobile.nativeapp.data.api.MaintenanceContractDto?>(null) }
    var query by remember { mutableStateOf("") }
    LaunchedEffect(Unit) { vm.load() }

    if (selected != null) {
        val c = selected!!
        var tab by remember { mutableStateOf(0) }
        val tabs = listOf("Info", "Actividades", "SLA", "Inventario")
        val activities = c.activities
        val slaList = c.slaEntries
        val inventory = c.inventory
        Column(Modifier.fillMaxSize()) {
            ScrollableTabRow(selectedTabIndex = tab, edgePadding = 0.dp) {
                tabs.forEachIndexed { i, t -> Tab(selected = tab == i, onClick = { tab = i }, text = { Text(t) }) }
            }
            LazyColumn(Modifier.fillMaxSize().padding(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                item {
                    Row(Modifier.fillMaxWidth(), Arrangement.SpaceBetween, androidx.compose.ui.Alignment.CenterVertically) {
                        OutlinedButton(onClick = { selected = null }) { Text("← Lista") }
                        if (c.status.isNotBlank()) Text(c.status, color = mcStatusColor(c.status), fontWeight = FontWeight.SemiBold)
                    }
                }
                when (tab) {
                    0 -> {
                        item { Text("Información del contrato", fontWeight = FontWeight.Bold, style = MaterialTheme.typography.titleMedium) }
                        item {
                            Card(Modifier.fillMaxWidth()) {
                                Column(Modifier.padding(14.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                                    DetailLine("Número", c.contractNumber)
                                    DetailLine("Nombre", c.title)
                                    DetailLine("Cliente", c.clientName)
                                    DetailLine("Frecuencia", c.frequency)
                                    DetailLine("Estado", c.status)
                                    DetailLine("Inicio", c.startDate.take(10))
                                    DetailLine("Vencimiento", c.endDate.take(10))
                                    c.monthlyFee?.let { DetailLine("Monto", "${c.currency} ${it.toInt()}") }
                                    c.slaResponseHours?.let { DetailLine("Resp. SLA", "${it}h") }
                                }
                            }
                        }
                    }
                    1 -> {
                        if (activities.isEmpty()) { item { Text("Sin actividades registradas.", color = MaterialTheme.colorScheme.onSurfaceVariant) } }
                        else items(activities) { a ->
                            Card(Modifier.fillMaxWidth()) {
                                Column(Modifier.padding(12.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                                    Text(erpStr(a, "title", "titulo", "anNumber"), fontWeight = FontWeight.Bold)
                                    val st2 = erpStr(a, "status", "estado")
                                    if (st2.isNotBlank()) Text(st2, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                                }
                            }
                        }
                    }
                    2 -> {
                        if (slaList.isEmpty()) { item { Text("Sin métricas SLA.", color = MaterialTheme.colorScheme.onSurfaceVariant) } }
                        else items(slaList) { s ->
                            Row(Modifier.fillMaxWidth(), Arrangement.SpaceBetween) {
                                Text(erpStr(s, "name", "metrica"))
                                Text(erpStr(s, "value", "valor"), fontWeight = FontWeight.SemiBold, color = MaterialTheme.colorScheme.primary)
                            }
                        }
                    }
                    else -> {
                        if (inventory.isEmpty()) { item { Text("Sin inventario registrado.", color = MaterialTheme.colorScheme.onSurfaceVariant) } }
                        else items(inventory) { item ->
                            Card(Modifier.fillMaxWidth()) {
                                Row(Modifier.fillMaxWidth().padding(12.dp), Arrangement.SpaceBetween) {
                                    Column(Modifier.weight(1f)) {
                                        Text(erpStr(item, "name", "nombre", "itemName"), fontWeight = FontWeight.Bold)
                                        val serial = erpStr(item, "serial", "serialNumber")
                                        if (serial.isNotBlank()) Text(serial, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                                    }
                                    val qty = erpStr(item, "quantity", "cantidad")
                                    if (qty.isNotBlank()) Text("x$qty", fontWeight = FontWeight.Bold, color = MaterialTheme.colorScheme.primary)
                                }
                            }
                        }
                    }
                }
            }
        }
        return
    }

    val filtered = if (query.isBlank()) state.items else state.items.filter { c ->
        val q = query.lowercase()
        c.displayTitle.lowercase().contains(q) ||
            c.clientName.lowercase().contains(q) ||
            c.contractNumber.lowercase().contains(q)
    }

    LazyColumn(Modifier.fillMaxSize().padding(16.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
        item {
            Text("Contratos de servicio", style = MaterialTheme.typography.headlineSmall.copy(fontWeight = FontWeight.Bold))
            Text("SLA, vigencias y alcance", style = MaterialTheme.typography.bodySmall, color = Color(0xFF64748B))
            Spacer(Modifier.height(8.dp))
            OutlinedTextField(value = query, onValueChange = { query = it }, placeholder = { Text("Buscar contrato o cliente…") }, singleLine = true, modifier = Modifier.fillMaxWidth())
        }
        if (state.loading) { item { LinearProgressIndicator(Modifier.fillMaxWidth()) }; return@LazyColumn }
        if (filtered.isEmpty()) { item { Text("Sin contratos activos.", color = Color(0xFF64748B)) }; return@LazyColumn }
        items(filtered, key = { it.rowKey }) { c ->
            val statusColor = mcStatusColor(c.status)
            Card(Modifier.fillMaxWidth().clickable { selected = c }) {
                Column(Modifier.padding(14.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                    Row(Modifier.fillMaxWidth(), Arrangement.SpaceBetween, androidx.compose.ui.Alignment.CenterVertically) {
                        Text(c.displayTitle, fontWeight = FontWeight.Bold, modifier = Modifier.weight(1f))
                        if (c.status.isNotBlank()) Text(c.status, color = statusColor, fontWeight = FontWeight.SemiBold, style = MaterialTheme.typography.labelSmall)
                    }
                    Text(c.clientName, style = MaterialTheme.typography.bodySmall, color = Color(0xFF64748B))
                    val dates = listOfNotNull(
                        c.startDate.take(10).takeIf { it.isNotBlank() },
                        c.endDate.take(10).takeIf { it.isNotBlank() },
                    ).joinToString(" → ")
                    if (dates.isNotBlank()) Text(dates, style = MaterialTheme.typography.labelSmall, color = Color(0xFF64748B))
                }
            }
        }
    }
}

private fun mcStatusColor(status: String): Color = when (status.lowercase()) {
    "activo", "active", "vigente" -> Color(0xFF2E7D32)
    "vencido", "expired", "inactivo" -> Color(0xFFDC2626)
    "por_vencer", "por vencer", "próximo" -> Color(0xFFE65100)
    else -> Color.Gray
}

// ── Shared UI helpers ───────────────────────────────────────────────────────

@Composable
private fun ErpSectionTitle(title: String, detail: String? = null) {
    Row(Modifier.fillMaxWidth().padding(vertical = 4.dp), horizontalArrangement = Arrangement.SpaceBetween) {
        Text(title, fontWeight = FontWeight.SemiBold, color = Color(0xFF0F172A))
        detail?.let { Text(it, style = MaterialTheme.typography.labelMedium, color = Color(0xFF64748B)) }
    }
}

@Composable
private fun ErpMetricTile(modifier: Modifier, label: String, value: String, accent: Color) {
    Card(modifier, shape = RoundedCornerShape(12.dp), colors = CardDefaults.cardColors(containerColor = accent.copy(0.1f))) {
        Column(Modifier.padding(12.dp)) {
            Text(label, style = MaterialTheme.typography.labelSmall, color = accent)
            Text(value, style = MaterialTheme.typography.titleMedium.copy(fontWeight = FontWeight.Bold))
        }
    }
}

@Composable
private fun ErpListCard(title: String, subtitle: String, trailing: String = "", accent: Color = Color(0xFF0D9488)) {
    Card(Modifier.fillMaxWidth(), shape = RoundedCornerShape(12.dp), elevation = CardDefaults.cardElevation(1.dp)) {
        Row(Modifier.padding(12.dp), verticalAlignment = Alignment.CenterVertically) {
            Column(Modifier.weight(1f)) {
                Text(title, fontWeight = FontWeight.SemiBold, color = Color(0xFF0F172A))
                if (subtitle.isNotBlank()) Text(subtitle, style = MaterialTheme.typography.bodySmall, color = Color(0xFF64748B))
            }
            if (trailing.isNotBlank()) {
                Text(trailing, fontWeight = FontWeight.Bold, color = accent, modifier = Modifier.background(accent.copy(0.12f), RoundedCornerShape(8.dp)).padding(horizontal = 8.dp, vertical = 4.dp))
            }
        }
    }
}

private val erpMxn: NumberFormat = NumberFormat.getCurrencyInstance(Locale("es", "MX")).apply { maximumFractionDigits = 0 }

private fun erpFmtMxn(v: Double) = erpMxn.format(v)
private fun erpFmtPct(v: Double) = "${String.format(Locale.US, "%.1f", v)}%"
private fun erpFmtValue(v: Any?) = when (v) {
    is Double -> if (v > 1000) erpFmtMxn(v) else String.format("%.1f", v)
    is Number -> v.toString()
    else -> v?.toString() ?: "—"
}

private fun erpStr(m: Map<String, Any?>, vararg keys: String): String {
    for (k in keys) {
        val v = m[k] ?: continue
        val s = v.toString()
        if (s.isNotBlank() && s != "null") return s
    }
    return ""
}

private fun erpMap(any: Any?): Map<String, Any?> = when (any) {
    is Map<*, *> -> any.entries.associate { (k, v) -> k.toString() to v }
    else -> emptyMap()
}

private fun erpDbl(m: Map<String, Any?>, key: String): Double = when (val v = m[key]) {
    is Double -> v; is Float -> v.toDouble(); is Int -> v.toDouble(); is Long -> v.toDouble()
    is Number -> v.toDouble(); is String -> v.toDoubleOrNull() ?: 0.0; else -> 0.0
}
private fun erpInt(m: Map<String, Any?>, key: String) = erpDbl(m, key).toInt()
