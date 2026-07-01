package mx.nexara.mobile.nativeapp.ui.console.screens

import android.app.Application
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
    val dashboard: Map<String, Any?> = emptyMap(),
    val computedKpis: List<Map<String, Any?>> = emptyList(),
    val margin: List<Map<String, Any?>> = emptyList(),
    val engineers: List<Map<String, Any?>> = emptyList(),
    val clientsRoi: List<Map<String, Any?>> = emptyList(),
)

class ErpBiViewModel(app: Application) : AndroidViewModel(app) {
    private val repo = ExtraRepository(app.applicationContext)
    private val _state = MutableStateFlow(ErpBiState())
    val state: StateFlow<ErpBiState> = _state

    fun load() {
        _state.update { it.copy(loading = true, error = null) }
        viewModelScope.launch {
            try {
                val dash = withContext(Dispatchers.IO) { repo.analyticsDashboardMap() }
                val kpis = withContext(Dispatchers.IO) { repo.analyticsComputedKpisList() }
                val margin = withContext(Dispatchers.IO) { repo.biMarginByType() }
                val engineers = withContext(Dispatchers.IO) { repo.biEngineers() }
                val clients = withContext(Dispatchers.IO) { repo.biClientsRoi() }
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

        if (state.loading && state.dashboard.isEmpty()) {
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
                ErpMetricTile(Modifier.weight(1f), "Ingresos", erpFmtMxn(erpDbl(d, "revenue")), Color(0xFF059669))
                ErpMetricTile(Modifier.weight(1f), "Gastos", erpFmtMxn(erpDbl(d, "expenses")), Color(0xFFEF4444))
            }
            Spacer(Modifier.height(8.dp))
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                ErpMetricTile(Modifier.weight(1f), "OC abiertas", "${erpInt(d, "openPurchaseOrders")}", Color(0xFF3B82F6))
                ErpMetricTile(Modifier.weight(1f), "Mant. activos", "${erpInt(d, "pendingMaintenanceOrders")}", Color(0xFFF59E0B))
                ErpMetricTile(Modifier.weight(1f), "Stock bajo", "${erpInt(d, "lowStockAlerts")}", Color(0xFF8B5CF6))
            }
        }

        if (state.computedKpis.isNotEmpty()) {
            item { ErpSectionTitle("KPIs en tiempo real") }
            val grouped = state.computedKpis.groupBy { erpStr(it, "category").ifBlank { "General" } }
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
                val totalBudget = state.margin.sumOf { erpDbl(it, "budget") }
                val totalMargin = state.margin.sumOf { erpDbl(it, "margin") }
                ErpSectionTitle("Margen por línea", erpFmtMxn(totalMargin))
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    ErpMetricTile(Modifier.weight(1f), "Presupuesto", erpFmtMxn(totalBudget), Color(0xFF0D9488))
                    ErpMetricTile(Modifier.weight(1f), "Margen total", erpFmtMxn(totalMargin), Color(0xFF059669))
                }
            }
            items(state.margin, key = { erpStr(it, "projectType") }) { row ->
                MarginRowCard(row)
            }
        }

        if (state.engineers.isNotEmpty()) {
            item { ErpSectionTitle("Ranking ingenieros (90d)") }
            items(state.engineers, key = { erpStr(it, "engineerId", "id") }) { eng ->
                EngineerRowCard(eng)
            }
        }

        if (state.clientsRoi.isNotEmpty()) {
            item { ErpSectionTitle("ROI por cliente") }
            items(state.clientsRoi, key = { erpStr(it, "clientId", "id") }) { c ->
                ClientRoiCard(c)
            }
        }

        item { Spacer(Modifier.height(24.dp)) }
    }
}

@Composable
private fun ComputedKpiRow(kpi: Map<String, Any?>) {
    val status = erpStr(kpi, "status")
    val accent = when (status) {
        "danger" -> Color(0xFFEF4444)
        "warning" -> Color(0xFFF59E0B)
        "ok" -> Color(0xFF059669)
        else -> Color(0xFF64748B)
    }
    Card(shape = RoundedCornerShape(12.dp), colors = CardDefaults.cardColors(containerColor = accent.copy(0.08f))) {
        Row(Modifier.fillMaxWidth().padding(12.dp), horizontalArrangement = Arrangement.SpaceBetween) {
            Column(Modifier.weight(1f)) {
                Text(erpStr(kpi, "name"), fontWeight = FontWeight.Medium, color = Color(0xFF0F172A))
                Text(erpStr(kpi, "unit"), style = MaterialTheme.typography.labelSmall, color = Color(0xFF64748B))
            }
            Text("${erpFmtValue(kpi["value"])}", fontWeight = FontWeight.Bold, color = accent)
        }
    }
}

@Composable
private fun MarginRowCard(row: Map<String, Any?>) {
    ErpListCard(
        title = erpStr(row, "projectType"),
        subtitle = "${erpInt(row, "count")} proyectos · ${erpFmtPct(erpDbl(row, "marginPercent"))} margen",
        trailing = erpFmtMxn(erpDbl(row, "margin")),
    )
}

@Composable
private fun EngineerRowCard(row: Map<String, Any?>) {
    ErpListCard(
        title = erpStr(row, "engineerName", "nombre"),
        subtitle = "${erpInt(row, "completed")}/${erpInt(row, "totalActivities")} OT · ${erpFmtPct(erpDbl(row, "completionRate"))} cierre",
        trailing = row["avgDurationMin"]?.let { "${it} min" } ?: "—",
    )
}

@Composable
private fun ClientRoiCard(row: Map<String, Any?>) {
    ErpListCard(
        title = erpStr(row, "clientName", "nombre"),
        subtitle = "${erpInt(row, "projects")} proy. · ${erpFmtMxn(erpDbl(row, "revenue"))}",
        trailing = erpFmtPct(erpDbl(row, "roi")),
    )
}

// ── Vista ejecutiva C-Level ─────────────────────────────────────────────────

data class ExecutiveState(val loading: Boolean = true, val error: String? = null, val data: Map<String, Any?> = emptyMap())

class ExecutiveViewModel(app: Application) : AndroidViewModel(app) {
    private val repo = ExtraRepository(app.applicationContext)
    private val _state = MutableStateFlow(ExecutiveState())
    val state: StateFlow<ExecutiveState> = _state

    fun load() {
        _state.update { it.copy(loading = true, error = null) }
        viewModelScope.launch {
            try {
                val data = withContext(Dispatchers.IO) { repo.executiveCLevel() }
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

    val headline = erpMap(state.data["headlineKpis"])
    val ops = erpMap(state.data["operations"])
    val finance = erpMap(state.data["finance"])
    val alerts = state.data["alerts"] as? List<*> ?: emptyList<Any>()

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
                ErpMetricTile(Modifier.weight(1f), "Ingresos MTD", erpFmtMxn(erpDbl(headline, "revenueMtd")), Color(0xFF059669))
                ErpMetricTile(Modifier.weight(1f), "Pipeline", erpFmtMxn(erpDbl(headline, "pipelineValue")), Color(0xFF3B82F6))
            }
            Spacer(Modifier.height(8.dp))
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                ErpMetricTile(Modifier.weight(1f), "Caja", erpFmtMxn(erpDbl(headline, "cashOnHand")), Color(0xFF0D9488))
                ErpMetricTile(Modifier.weight(1f), "CxC", erpFmtMxn(erpDbl(headline, "arOutstanding")), Color(0xFFF59E0B))
            }
        }

        item {
            ErpSectionTitle("Operaciones")
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                ErpMetricTile(Modifier.weight(1f), "OT abiertas", "${erpInt(ops, "otOpen")}", Color(0xFF6366F1))
                ErpMetricTile(Modifier.weight(1f), "OT vencidas", "${erpInt(ops, "otOverdue")}", Color(0xFFEF4444))
                ErpMetricTile(Modifier.weight(1f), "Tickets", "${erpInt(ops, "ticketsOpen")}", Color(0xFF8B5CF6))
            }
        }

        item {
            ErpSectionTitle("Facturación")
            ErpMetricTile(Modifier.fillMaxWidth(), "Facturado MTD", erpFmtMxn(erpDbl(finance, "invoicedMtd")), Color(0xFF059669))
        }

        if (alerts.isNotEmpty()) {
            item { ErpSectionTitle("Alertas", "${alerts.size}") }
            items(alerts.filterIsInstance<Map<*, *>>()) { alert ->
                val map = erpMap(alert)
                Card(Modifier.fillMaxWidth(), colors = CardDefaults.cardColors(containerColor = Color(0xFFFFF7ED))) {
                    Column(Modifier.padding(12.dp)) {
                        Text(erpStr(map, "title", "message"), fontWeight = FontWeight.SemiBold)
                        Text(erpStr(map, "detail", "description"), style = MaterialTheme.typography.bodySmall, color = Color(0xFF64748B))
                    }
                }
            }
        }
    }
}

// ── Aprobaciones workflow ───────────────────────────────────────────────────

data class ApprovalsState(val loading: Boolean = true, val error: String? = null, val items: List<Map<String, Any?>> = emptyList(), val acting: Long? = null)

class ApprovalsViewModel(app: Application) : AndroidViewModel(app) {
    private val repo = ExtraRepository(app.applicationContext)
    private val _state = MutableStateFlow(ApprovalsState())
    val state: StateFlow<ApprovalsState> = _state

    fun load() {
        _state.update { it.copy(loading = true, error = null) }
        viewModelScope.launch {
            try {
                val items = withContext(Dispatchers.IO) { repo.workflowPending() }
                _state.update { it.copy(loading = false, items = items) }
            } catch (e: Exception) {
                _state.update { it.copy(loading = false, error = e.message) }
            }
        }
    }

    fun decide(id: Long, approved: Boolean) {
        _state.update { it.copy(acting = id) }
        viewModelScope.launch {
            try {
                withContext(Dispatchers.IO) { repo.workflowDecide(id, if (approved) "APPROVED" else "REJECTED") }
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
    LaunchedEffect(Unit) { vm.load() }

    LazyColumn(Modifier.fillMaxSize().padding(16.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
        item {
            Text("Aprobaciones", style = MaterialTheme.typography.headlineSmall.copy(fontWeight = FontWeight.Bold))
            Text("Pendientes de tu decisión", style = MaterialTheme.typography.bodySmall, color = Color(0xFF64748B))
        }
        if (state.loading) { item { LinearProgressIndicator(Modifier.fillMaxWidth()) }; return@LazyColumn }
        if (state.items.isEmpty()) {
            item { Text("Sin aprobaciones pendientes.", color = Color(0xFF64748B)) }
            return@LazyColumn
        }
        items(state.items, key = { erpStr(it, "id", "approvalId") }) { item ->
            val id = erpLong(item, "id", "approvalId")
            Card(Modifier.fillMaxWidth(), shape = RoundedCornerShape(14.dp)) {
                Column(Modifier.padding(14.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    Text(approvalTitle(item), fontWeight = FontWeight.SemiBold)
                    Text(approvalSubtitle(item), style = MaterialTheme.typography.bodySmall, color = Color(0xFF64748B))
                    Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        Button(
                            onClick = { if (id > 0) vm.decide(id, true) },
                            enabled = state.acting != id,
                            modifier = Modifier.weight(1f),
                        ) { Text("Aprobar") }
                        OutlinedButton(
                            onClick = { if (id > 0) vm.decide(id, false) },
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

data class NocState(val loading: Boolean = true, val error: String? = null, val summary: Map<String, Any?> = emptyMap(), val alerts: List<Map<String, Any?>> = emptyList(), val devices: List<Map<String, Any?>> = emptyList())

class NocViewModel(app: Application) : AndroidViewModel(app) {
    private val repo = ExtraRepository(app.applicationContext)
    private val _state = MutableStateFlow(NocState())
    val state: StateFlow<NocState> = _state

    fun load() {
        _state.update { it.copy(loading = true, error = null) }
        viewModelScope.launch {
            try {
                val summary = withContext(Dispatchers.IO) { repo.nocSummary() }
                val alerts = withContext(Dispatchers.IO) { repo.nocAlerts() }
                val devices = withContext(Dispatchers.IO) { repo.nocDevices() }
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
    LaunchedEffect(Unit) { vm.load() }

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
            item { ErpSectionTitle("Alertas activas", "${state.alerts.size}") }
            items(state.alerts.take(15), key = { erpStr(it, "id") }) { a ->
                val sev = erpStr(a, "severity")
                val color = if (sev == "critical") Color(0xFFEF4444) else Color(0xFFF59E0B)
                ErpListCard(erpStr(a, "title", "deviceName"), erpStr(a, "message"), trailing = sev, accent = color)
            }
        }

        if (state.devices.isNotEmpty()) {
            item { ErpSectionTitle("Dispositivos") }
            items(state.devices.take(20), key = { erpStr(it, "id") }) { d ->
                val st = erpStr(d, "status")
                val color = when (st) { "ONLINE" -> Color(0xFF059669); "OFFLINE", "ALERT" -> Color(0xFFEF4444); else -> Color(0xFFF59E0B) }
                ErpListCard(erpStr(d, "name"), "${erpStr(d, "type")} · ${erpStr(d, "clientName")}", trailing = st, accent = color)
            }
        }
    }
}

// ── SLA ─────────────────────────────────────────────────────────────────────

data class SlaState(val loading: Boolean = true, val error: String? = null, val stats: Map<String, Any?> = emptyMap())

class SlaViewModel(app: Application) : AndroidViewModel(app) {
    private val repo = ExtraRepository(app.applicationContext)
    private val _state = MutableStateFlow(SlaState())
    val state: StateFlow<SlaState> = _state

    fun load() {
        _state.update { it.copy(loading = true, error = null) }
        viewModelScope.launch {
            try {
                val stats = withContext(Dispatchers.IO) { repo.slaStats() }
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

    val resp = erpMap(state.stats["responseSla"])
    val resol = erpMap(state.stats["resolutionSla"])
    val breaches = state.stats["recentBreaches"] as? List<*> ?: emptyList<Any>()

    LazyColumn(Modifier.fillMaxSize().padding(16.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
        item {
            Text("SLA y tiempos", style = MaterialTheme.typography.headlineSmall.copy(fontWeight = FontWeight.Bold))
            Text("Cumplimiento por contrato y prioridad", style = MaterialTheme.typography.bodySmall, color = Color(0xFF64748B))
        }
        if (state.loading) { item { LinearProgressIndicator(Modifier.fillMaxWidth()) }; return@LazyColumn }

        item {
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                ErpMetricTile(Modifier.weight(1f), "Tickets", "${erpInt(state.stats, "total")}", Color(0xFF3B82F6))
                ErpMetricTile(Modifier.weight(1f), "Abiertos", "${erpInt(state.stats, "stillOpen")}", Color(0xFFF59E0B))
            }
            Spacer(Modifier.height(8.dp))
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                ErpMetricTile(Modifier.weight(1f), "Resp. a tiempo", "${erpInt(resp, "onTime")}", Color(0xFF059669))
                ErpMetricTile(Modifier.weight(1f), "Resp. tarde", "${erpInt(resp, "late")}", Color(0xFFEF4444))
                ErpMetricTile(Modifier.weight(1f), "% resp.", erpFmtPct(erpDbl(resp, "compliancePercent")), Color(0xFF0D9488))
            }
            Spacer(Modifier.height(8.dp))
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                ErpMetricTile(Modifier.weight(1f), "Res. a tiempo", "${erpInt(resol, "onTime")}", Color(0xFF059669))
                ErpMetricTile(Modifier.weight(1f), "Res. tarde", "${erpInt(resol, "late")}", Color(0xFFEF4444))
                ErpMetricTile(Modifier.weight(1f), "% res.", erpFmtPct(erpDbl(resol, "compliancePercent")), Color(0xFF0D9488))
            }
        }

        if (breaches.isNotEmpty()) {
            item { ErpSectionTitle("Incumplimientos recientes") }
            items(breaches.filterIsInstance<Map<*, *>>().take(15)) { b ->
                val map = erpMap(b)
                ErpListCard(
                    erpStr(map, "titulo", "anNumber"),
                    "${erpStr(map, "type")} · ${erpStr(map, "priority")}",
                    trailing = "+${erpFmtValue(map["hoursLate"])}h",
                    accent = Color(0xFFEF4444),
                )
            }
        }
    }
}

// ── Contratos de mantenimiento ──────────────────────────────────────────────

data class MaintContractsState(val loading: Boolean = true, val error: String? = null, val items: List<Map<String, Any?>> = emptyList())

class MaintContractsViewModel(app: Application) : AndroidViewModel(app) {
    private val repo = ExtraRepository(app.applicationContext)
    private val _state = MutableStateFlow(MaintContractsState())
    val state: StateFlow<MaintContractsState> = _state

    fun load() {
        _state.update { it.copy(loading = true, error = null) }
        viewModelScope.launch {
            try {
                val items = withContext(Dispatchers.IO) { repo.maintenanceContracts() }
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
    LaunchedEffect(Unit) { vm.load() }

    LazyColumn(Modifier.fillMaxSize().padding(16.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
        item {
            Text("Contratos de servicio", style = MaterialTheme.typography.headlineSmall.copy(fontWeight = FontWeight.Bold))
            Text("SLA, vigencias y alcance", style = MaterialTheme.typography.bodySmall, color = Color(0xFF64748B))
        }
        if (state.loading) { item { LinearProgressIndicator(Modifier.fillMaxWidth()) }; return@LazyColumn }
        if (state.items.isEmpty()) { item { Text("Sin contratos activos.", color = Color(0xFF64748B)) }; return@LazyColumn }
        items(state.items, key = { erpStr(it, "id") }) { c ->
            ErpListCard(
                title = erpStr(c, "name", "title", "contractNumber"),
                subtitle = listOfNotNull(
                    erpStr(c, "clientName", "client"),
                    erpStr(c, "status"),
                    listOfNotNull(erpStr(c, "startDate"), erpStr(c, "endDate")).filter { it.isNotBlank() }.joinToString(" → ").takeIf { it.isNotBlank() },
                ).joinToString(" · "),
                trailing = erpStr(c, "slaResponseHours").let { if (it.isNotBlank()) "${it}h resp." else erpStr(c, "status") },
            )
        }
    }
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
private fun erpLong(m: Map<String, Any?>, vararg keys: String): Long {
    for (k in keys) {
        val v = m[k]
        if (v is Number) return v.toLong()
        if (v is String) v.toLongOrNull()?.let { return it }
    }
    return 0L
}

private fun approvalTitle(item: Map<String, Any?>): String {
    val inst = erpMap(item["instance"])
    val wf = erpMap(inst["workflow"])
    val name = wf["name"]?.toString()
    if (!name.isNullOrBlank()) return name
    return erpStr(item, "title", "entityType")
}

private fun approvalSubtitle(item: Map<String, Any?>): String {
    val inst = erpMap(item["instance"])
    val entityId = inst["entityId"]?.toString()
    val step = erpMap(item["step"])
    val stepNum = step["stepNumber"]?.toString()
    return listOfNotNull(entityId?.let { "Entidad #$it" }, stepNum?.let { "Paso $it" }).joinToString(" · ")
}
