package mx.nexara.mobile.nativeapp.ui.ventas

import android.app.Application
import androidx.compose.foundation.background
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.*
import androidx.compose.material3.pulltorefresh.PullToRefreshBox
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
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
import mx.nexara.mobile.nativeapp.data.crm.CrmRepository
import mx.nexara.mobile.nativeapp.ui.enterprise.NxColors
import mx.nexara.mobile.nativeapp.ui.enterprise.NxDimens
import mx.nexara.mobile.nativeapp.ui.enterprise.NxEmptyState
import mx.nexara.mobile.nativeapp.ui.enterprise.NxErrorBlock
import mx.nexara.mobile.nativeapp.ui.enterprise.NxLoadingBlock
import mx.nexara.mobile.nativeapp.ui.enterprise.NxPanelShell
import mx.nexara.mobile.nativeapp.ui.enterprise.NxSectionHeader
import java.text.NumberFormat
import java.util.Locale

enum class CrmReportMode(val title: String, val subtitle: String) {
    REPORTES("Reportes de ventas", "KPIs del periodo y desempeño del equipo"),
    CRECIMIENTO("Crecimiento", "Ingresos, conversión y pipeline"),
    EQUIPO("Comparativa equipo", "Ranking y cuotas por vendedor"),
}

data class CrmReportsState(
    val loading: Boolean = true,
    val isRefreshing: Boolean = false,
    val error: String? = null,
    val period: String = "month",
    val metrics: Map<String, Any?> = emptyMap(),
    val vendors: List<Map<String, Any?>> = emptyList(),
)

class CrmReportsViewModel(app: Application) : AndroidViewModel(app) {
    private val repo = CrmRepository(app.applicationContext)
    private val _state = MutableStateFlow(CrmReportsState())
    val state: StateFlow<CrmReportsState> = _state

    init { load() }

    fun setPeriod(period: String) {
        if (_state.value.period == period) return
        _state.update { it.copy(period = period) }
        load()
    }

    fun load(pull: Boolean = false) {
        val period = _state.value.period
        _state.update {
            if (pull) it.copy(isRefreshing = true, error = null)
            else it.copy(loading = true, error = null)
        }
        viewModelScope.launch {
            try {
                val metrics = withContext(Dispatchers.IO) { repo.salesMetrics(period) }
                val vendors = withContext(Dispatchers.IO) { repo.vendorStats(period) }
                _state.update { it.copy(loading = false, isRefreshing = false, metrics = metrics, vendors = vendors) }
            } catch (e: Exception) {
                _state.update {
                    it.copy(loading = false, isRefreshing = false, error = e.message ?: "Error al cargar reportes")
                }
            }
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun CrmReportsScreen(mode: CrmReportMode) {
    val vm: CrmReportsViewModel = viewModel()
    val state by vm.state.collectAsState()
    var selectedVendor by remember { mutableStateOf<Map<String, Any?>?>(null) }

    val sel = selectedVendor
    if (sel != null) {
        VendorDetail(sel, onBack = { selectedVendor = null })
        return
    }

    PullToRefreshBox(
        isRefreshing = state.isRefreshing,
        onRefresh = { vm.load(pull = true) },
        modifier = Modifier.fillMaxSize(),
    ) {
        LazyColumn(
            modifier = Modifier.fillMaxSize().background(NxColors.Surface).padding(16.dp),
            verticalArrangement = Arrangement.spacedBy(14.dp),
        ) {
            item { NxSectionHeader(mode.title, mode.subtitle) }

            item {
                PeriodChips(
                    selected = state.period,
                    onSelect = { vm.setPeriod(it) },
                )
            }

            when {
                state.loading && !state.isRefreshing && state.metrics.isEmpty() -> {
                    item { NxLoadingBlock("Cargando reportes…") }
                }
                state.error != null && state.metrics.isEmpty() -> {
                    item { NxErrorBlock(state.error!!, onRetry = { vm.load() }) }
                }
                else -> {
                    if (state.error != null) {
                        item { NxErrorBlock(state.error!!, onRetry = { vm.load(pull = true) }) }
                    }

                    when (mode) {
                        CrmReportMode.REPORTES -> {
                            if (state.metrics.isNotEmpty()) {
                                item { NxSectionHeader("Indicadores clave", periodLabel(state.period)) }
                                item { MetricsGrid(state.metrics, full = true) }
                            }
                            if (state.vendors.isNotEmpty()) {
                                item { NxSectionHeader("Equipo de ventas", "${state.vendors.size} vendedores") }
                                items(state.vendors, key = { mapStr(it, "userId", "id") }) { v ->
                                    VendorCard(v, onClick = { selectedVendor = v })
                                }
                            } else if (!state.loading && state.metrics.isEmpty()) {
                                item {
                                    NxEmptyState(
                                        title = "Sin datos de reportes",
                                        subtitle = "Los KPIs aparecerán cuando haya actividad comercial en el periodo seleccionado.",
                                    )
                                }
                            }
                        }
                        CrmReportMode.CRECIMIENTO -> {
                            if (state.metrics.isNotEmpty()) {
                                item { GrowthHighlight(state.metrics) }
                                item { NxSectionHeader("Métricas de crecimiento", periodLabel(state.period)) }
                                item { MetricsGrid(state.metrics, full = false) }
                            } else if (!state.loading) {
                                item {
                                    NxEmptyState(
                                        title = "Sin métricas de crecimiento",
                                        subtitle = "Selecciona otro periodo o sincroniza datos del CRM.",
                                        actionLabel = "Reintentar",
                                        onAction = { vm.load() },
                                    )
                                }
                            }
                        }
                        CrmReportMode.EQUIPO -> {
                            if (state.vendors.isEmpty() && !state.loading) {
                                item {
                                    NxEmptyState(
                                        title = "Sin datos de vendedores",
                                        subtitle = "No hay información de equipo para ${periodLabel(state.period).lowercase()}.",
                                    )
                                }
                            } else if (state.vendors.isNotEmpty()) {
                                item { NxSectionHeader("Ranking", periodLabel(state.period)) }
                                item { TeamRankingChart(state.vendors) }
                                items(state.vendors.sortedByDescending { mapDouble(it, "revenue") ?: 0.0 }) { v ->
                                    VendorCard(v, showQuota = true, onClick = { selectedVendor = v })
                                }
                            }
                        }
                    }
                }
            }

            item { Spacer(Modifier.height(24.dp)) }
        }
    }
}

@Composable
private fun VendorDetail(v: Map<String, Any?>, onBack: () -> Unit) {
    val name = mapStr(v, "userName", "nombre", "name").ifBlank { "Vendedor" }
    val revenue = mapDouble(v, "revenue") ?: 0.0
    val target = mapDouble(v, "targetRevenue") ?: 0.0
    val att = mapDouble(v, "attainmentRevenue") ?: 0.0
    val status = mapStr(v, "status")
    val statusColor = vendorStatusColor(status)

    LazyColumn(
        Modifier.fillMaxSize().background(NxColors.Surface).padding(16.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        item { OutlinedButton(onClick = onBack) { Text("← Reportes") } }
        item {
            Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
                Text(
                    name,
                    style = MaterialTheme.typography.headlineSmall.copy(fontWeight = FontWeight.Bold),
                    color = NxColors.Slate,
                )
                if (status.isNotBlank()) {
                    Surface(shape = RoundedCornerShape(8.dp), color = statusColor.copy(alpha = 0.12f)) {
                        Text(
                            status.replace("-", " ").replaceFirstChar { it.uppercase() },
                            style = MaterialTheme.typography.labelSmall.copy(fontWeight = FontWeight.SemiBold),
                            color = statusColor,
                            modifier = Modifier.padding(horizontal = 8.dp, vertical = 4.dp),
                        )
                    }
                }
            }
        }
        item {
            NxPanelShell {
                Text("Ventas", style = MaterialTheme.typography.titleSmall.copy(fontWeight = FontWeight.SemiBold), color = NxColors.Slate)
                Spacer(Modifier.height(8.dp))
                vRow("Ingresos", fmtMxn(revenue))
                vRow("Meta", fmtMxn(target))
                if (target > 0) vRow("Cumplimiento", fmtPct(att))
                vRow("Oportunidades", "${mapInt(v, "opportunities")}")
                vRow("Proyectos", "${mapInt(v, "projects")}")
                vRow("Leads", "${mapInt(v, "leads")}")
                vRow("Actividades", "${mapInt(v, "activities")}")
                mapDouble(v, "performance")?.let { vRow("Performance", fmtPct(it)) }
                vRow("Email", mapStr(v, "email"))
                vRow("Rol", mapStr(v, "role", "rol"))
            }
        }
        if (target > 0) {
            item {
                NxPanelShell {
                    Text("Cuota", style = MaterialTheme.typography.titleSmall.copy(fontWeight = FontWeight.SemiBold), color = NxColors.Slate)
                    Spacer(Modifier.height(8.dp))
                    LinearProgressIndicator(
                        progress = { (att / 100.0).toFloat().coerceIn(0f, 1f) },
                        modifier = Modifier.fillMaxWidth(),
                        color = statusColor,
                    )
                    Text(
                        "${fmtPct(att)} de ${fmtMxn(target)}",
                        style = MaterialTheme.typography.bodySmall,
                        color = statusColor,
                    )
                }
            }
        }
    }
}

@Composable
private fun vRow(label: String, value: String) {
    if (value.isNotBlank() && value != "0" && value != "MXN$0") {
        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
            Text(label, style = MaterialTheme.typography.bodySmall, color = NxColors.Muted)
            Text(value, style = MaterialTheme.typography.bodySmall.copy(fontWeight = FontWeight.Medium), color = NxColors.Slate)
        }
    }
}

@Composable
private fun PeriodChips(selected: String, onSelect: (String) -> Unit) {
    Row(
        modifier = Modifier.horizontalScroll(rememberScrollState()),
        horizontalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        listOf("week" to "Semana", "month" to "Mes", "year" to "Año").forEach { (id, label) ->
            FilterChip(
                selected = selected == id,
                onClick = { onSelect(id) },
                label = { Text(label) },
            )
        }
    }
}

@Composable
private fun MetricsGrid(metrics: Map<String, Any?>, full: Boolean) {
    val items = if (full) {
        listOf(
            Triple("Ingresos", fmtMxn(mapDouble(metrics, "totalRevenue")), Color(0xFF059669)),
            Triple("Pipeline", fmtMxn(mapDouble(metrics, "pipelineValue")), Color(0xFF3B82F6)),
            Triple("Oportunidades", "${mapInt(metrics, "opportunityCount")}", Color(0xFF0D9488)),
            Triple("Proyectos", "${mapInt(metrics, "projectCount")}", Color(0xFF6366F1)),
            Triple("Conversión", fmtPct(mapDouble(metrics, "conversionRate")), Color(0xFFF59E0B)),
            Triple("Margen prom.", fmtPct(mapDouble(metrics, "averageMargin")), Color(0xFF8B5CF6)),
            Triple("Cerrados", "${mapInt(metrics, "closedProjects")}", Color(0xFF10B981)),
            Triple("Clientes nuevos", "${mapInt(metrics, "activeClients")}", Color(0xFFEC4899)),
        )
    } else {
        listOf(
            Triple("Ingresos", fmtMxn(mapDouble(metrics, "totalRevenue")), Color(0xFF059669)),
            Triple("Pipeline", fmtMxn(mapDouble(metrics, "pipelineValue")), Color(0xFF3B82F6)),
            Triple("Conversión", fmtPct(mapDouble(metrics, "conversionRate")), Color(0xFFF59E0B)),
            Triple("Oportunidades", "${mapInt(metrics, "opportunityCount")}", Color(0xFF0D9488)),
        )
    }

    Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
        items.chunked(2).forEach { row ->
            Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                row.forEach { (label, value, accent) ->
                    MetricCard(Modifier.weight(1f), label, value, accent)
                }
                if (row.size == 1) Spacer(Modifier.weight(1f))
            }
        }
    }
}

@Composable
private fun GrowthHighlight(metrics: Map<String, Any?>) {
    val revenue = mapDouble(metrics, "totalRevenue") ?: 0.0
    val conversion = mapDouble(metrics, "conversionRate") ?: 0.0
    val pipeline = mapDouble(metrics, "pipelineValue") ?: 0.0
    val closed = mapInt(metrics, "closedProjects")
    val opps = mapInt(metrics, "opportunityCount")

    NxPanelShell(contentPadding = PaddingValues(16.dp)) {
        Text(
            "Resumen de crecimiento",
            style = MaterialTheme.typography.titleSmall.copy(fontWeight = FontWeight.SemiBold),
            color = Color(0xFF065F46),
        )
        Text(
            "Ingresos ${fmtMxn(revenue)} · Pipeline ${fmtMxn(pipeline)} · Conversión ${fmtPct(conversion)}",
            style = MaterialTheme.typography.bodyMedium,
            color = Color(0xFF047857),
        )
        if (opps > 0) {
            Spacer(Modifier.height(8.dp))
            Box(
                modifier = Modifier
                    .fillMaxWidth()
                    .height(8.dp)
                    .clip(RoundedCornerShape(4.dp))
                    .background(Color(0xFFD1FAE5)),
            ) {
                Box(
                    Modifier
                        .fillMaxWidth((closed.toFloat() / opps).coerceIn(0f, 1f))
                        .height(8.dp)
                        .clip(RoundedCornerShape(4.dp))
                        .background(Color(0xFF059669)),
                )
            }
            Text(
                "$closed de $opps oportunidades cerradas",
                style = MaterialTheme.typography.labelSmall,
                color = NxColors.Muted,
            )
        }
    }
}

@Composable
private fun TeamRankingChart(vendors: List<Map<String, Any?>>) {
    val sorted = vendors.sortedByDescending { mapDouble(it, "revenue") ?: 0.0 }.take(5)
    val maxRevenue = sorted.maxOfOrNull { mapDouble(it, "revenue") ?: 0.0 } ?: 1.0
    if (sorted.isEmpty()) return

    NxPanelShell(contentPadding = PaddingValues(16.dp)) {
        Text(
            "Top vendedores por ingresos",
            style = MaterialTheme.typography.titleSmall.copy(fontWeight = FontWeight.SemiBold),
            color = NxColors.Slate,
        )
        Spacer(Modifier.height(12.dp))
        sorted.forEach { v ->
            val name = mapStr(v, "userName", "nombre", "name").ifBlank { "Vendedor" }
            val revenue = mapDouble(v, "revenue") ?: 0.0
            val pct = if (maxRevenue > 0) (revenue / maxRevenue).toFloat().coerceIn(0f, 1f) else 0f
            Column(Modifier.fillMaxWidth().padding(vertical = 4.dp)) {
                Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                    Text(name, style = MaterialTheme.typography.bodySmall, color = NxColors.Slate, maxLines = 1)
                    Text(fmtMxn(revenue), style = MaterialTheme.typography.labelSmall.copy(fontWeight = FontWeight.Bold), color = NxColors.Teal)
                }
                Spacer(Modifier.height(4.dp))
                Box(
                    modifier = Modifier
                        .fillMaxWidth()
                        .height(6.dp)
                        .clip(RoundedCornerShape(3.dp))
                        .background(NxColors.Surface),
                ) {
                    Box(
                        Modifier
                            .fillMaxWidth(pct)
                            .height(6.dp)
                            .clip(RoundedCornerShape(3.dp))
                            .background(NxColors.Teal),
                    )
                }
            }
        }
    }
}

@Composable
private fun MetricCard(modifier: Modifier, label: String, value: String, accent: Color) {
    Card(
        modifier = modifier,
        shape = RoundedCornerShape(NxDimens.PanelRadius),
        colors = CardDefaults.cardColors(containerColor = accent.copy(alpha = 0.1f)),
        elevation = CardDefaults.cardElevation(0.dp),
    ) {
        Column(Modifier.padding(14.dp)) {
            Text(label, style = MaterialTheme.typography.labelMedium, color = accent)
            Spacer(Modifier.height(4.dp))
            Text(
                value,
                style = MaterialTheme.typography.titleLarge.copy(fontWeight = FontWeight.Bold),
                color = NxColors.Slate,
            )
        }
    }
}

@Composable
private fun VendorCard(vendor: Map<String, Any?>, showQuota: Boolean = false, onClick: () -> Unit = {}) {
    val name = mapStr(vendor, "userName", "nombre", "name").ifBlank { "Vendedor" }
    val revenue = mapDouble(vendor, "revenue") ?: 0.0
    val status = mapStr(vendor, "status")
    val performance = mapDouble(vendor, "performance")
    val attainment = mapDouble(vendor, "attainmentRevenue")
    val statusColor = vendorStatusColor(status)

    NxPanelShell(onClick = onClick) {
        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween, verticalAlignment = Alignment.CenterVertically) {
            Text(name, style = MaterialTheme.typography.bodyMedium.copy(fontWeight = FontWeight.SemiBold), color = NxColors.Slate)
            Text(fmtMxn(revenue), style = MaterialTheme.typography.titleSmall.copy(fontWeight = FontWeight.Bold), color = NxColors.Teal)
        }
        Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
            Text("${mapInt(vendor, "opportunities")} opps", style = MaterialTheme.typography.labelSmall, color = NxColors.Muted)
            Text("${mapInt(vendor, "projects")} proy.", style = MaterialTheme.typography.labelSmall, color = NxColors.Muted)
            performance?.let {
                Text("${it.toInt()}% perf.", style = MaterialTheme.typography.labelSmall, color = NxColors.Muted)
            }
        }
        if (showQuota || attainment != null) {
            val target = mapDouble(vendor, "targetRevenue") ?: 0.0
            val att = attainment ?: 0.0
            if (target > 0) {
                LinearProgressIndicator(
                    progress = { (att / 100.0).toFloat().coerceIn(0f, 1f) },
                    modifier = Modifier.fillMaxWidth(),
                    color = statusColor,
                )
                Text(
                    "Cuota ${fmtMxn(target)} · ${fmtPct(att)} cumplimiento",
                    style = MaterialTheme.typography.labelSmall,
                    color = statusColor,
                )
            }
        }
        if (status.isNotBlank()) {
            Surface(shape = RoundedCornerShape(8.dp), color = statusColor.copy(alpha = 0.12f)) {
                Text(
                    status.replace("-", " ").replaceFirstChar { it.uppercase() },
                    style = MaterialTheme.typography.labelSmall.copy(fontWeight = FontWeight.SemiBold),
                    color = statusColor,
                    modifier = Modifier.padding(horizontal = 8.dp, vertical = 2.dp),
                )
            }
        }
    }
}

private fun vendorStatusColor(status: String) = when (status) {
    "on-track" -> Color(0xFF059669)
    "risk" -> Color(0xFFF59E0B)
    "off-track" -> Color(0xFFEF4444)
    else -> NxColors.Muted
}

private fun periodLabel(period: String) = when (period) {
    "week" -> "Esta semana"
    "year" -> "Este año"
    else -> "Este mes"
}

private val mxnFmt: NumberFormat = NumberFormat.getCurrencyInstance(Locale("es", "MX")).apply { maximumFractionDigits = 0 }

private fun fmtMxn(v: Double?) = mxnFmt.format(v ?: 0.0)

private fun fmtPct(v: Double?) = "${String.format(Locale.US, "%.1f", v ?: 0.0)}%"

private fun mapStr(m: Map<String, Any?>, vararg keys: String): String {
    for (k in keys) {
        val v = m[k] ?: continue
        val s = v.toString()
        if (s.isNotBlank() && s != "null") return s
    }
    return ""
}

private fun mapDouble(m: Map<String, Any?>, key: String): Double? = when (val v = m[key]) {
    is Double -> v
    is Float -> v.toDouble()
    is Int -> v.toDouble()
    is Long -> v.toDouble()
    is Number -> v.toDouble()
    is String -> v.toDoubleOrNull()
    else -> null
}

private fun mapInt(m: Map<String, Any?>, key: String): Int = mapDouble(m, key)?.toInt() ?: 0
