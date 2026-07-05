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
import mx.nexara.mobile.nativeapp.data.crm.CrmRepository
import java.text.NumberFormat
import java.util.Locale

enum class CrmReportMode(val title: String, val subtitle: String) {
    REPORTES("Reportes de ventas", "KPIs del periodo y desempeño del equipo"),
    CRECIMIENTO("Crecimiento", "Ingresos, conversión y pipeline"),
    EQUIPO("Comparativa equipo", "Ranking y cuotas por vendedor"),
}

data class CrmReportsState(
    val loading: Boolean = true,
    val error: String? = null,
    val period: String = "month",
    val metrics: Map<String, Any?> = emptyMap(),
    val vendors: List<Map<String, Any?>> = emptyList(),
)

class CrmReportsViewModel(app: Application) : AndroidViewModel(app) {
    private val repo = CrmRepository(app.applicationContext)
    private val _state = MutableStateFlow(CrmReportsState())
    val state: StateFlow<CrmReportsState> = _state

    fun setPeriod(period: String) {
        if (_state.value.period == period) return
        _state.update { it.copy(period = period) }
        load()
    }

    fun load() {
        val period = _state.value.period
        _state.update { it.copy(loading = true, error = null) }
        viewModelScope.launch {
            try {
                val metrics = withContext(Dispatchers.IO) { repo.salesMetrics(period) }
                val vendors = withContext(Dispatchers.IO) { repo.vendorStats(period) }
                _state.update { it.copy(loading = false, metrics = metrics, vendors = vendors) }
            } catch (e: Exception) {
                _state.update { it.copy(loading = false, error = e.message ?: "Error al cargar reportes") }
            }
        }
    }
}

@Composable
fun CrmReportsScreen(mode: CrmReportMode) {
    val vm: CrmReportsViewModel = viewModel()
    val state by vm.state.collectAsState()
    var selectedVendor by remember { mutableStateOf<Map<String, Any?>?>(null) }

    LaunchedEffect(Unit) {
        if (state.metrics.isEmpty() && state.loading) vm.load()
    }

    val sel = selectedVendor
    if (sel != null) {
        VendorDetail(sel, onBack = { selectedVendor = null })
        return
    }

    LazyColumn(
        modifier = Modifier.fillMaxSize().padding(16.dp),
        verticalArrangement = Arrangement.spacedBy(14.dp),
    ) {
        item {
            Column {
                Text(mode.title, style = MaterialTheme.typography.headlineSmall.copy(fontWeight = FontWeight.Bold))
                Text(mode.subtitle, style = MaterialTheme.typography.bodySmall, color = Color(0xFF64748B))
            }
        }

        item {
            PeriodChips(
                selected = state.period,
                onSelect = { vm.setPeriod(it) },
            )
        }

        if (state.loading && state.metrics.isEmpty()) {
            item { LinearProgressIndicator(modifier = Modifier.fillMaxWidth()) }
            return@LazyColumn
        }

        if (state.error != null) {
            item {
                Text(state.error!!, color = MaterialTheme.colorScheme.error)
                Spacer(Modifier.height(8.dp))
                Button(onClick = { vm.load() }) { Text("Reintentar") }
            }
            return@LazyColumn
        }

        when (mode) {
            CrmReportMode.REPORTES -> {
                item { MetricsGrid(state.metrics, full = true) }
                if (state.vendors.isNotEmpty()) {
                    item { SectionTitle("Equipo de ventas", "${state.vendors.size} vendedores") }
                    items(state.vendors, key = { mapStr(it, "userId", "id") }) { v ->
                        VendorCard(v, onClick = { selectedVendor = v })
                    }
                }
            }
            CrmReportMode.CRECIMIENTO -> {
                item { GrowthHighlight(state.metrics) }
                item { MetricsGrid(state.metrics, full = false) }
            }
            CrmReportMode.EQUIPO -> {
                if (state.vendors.isEmpty()) {
                    item { Text("Sin datos de vendedores para este periodo.", color = Color(0xFF64748B)) }
                } else {
                    item { SectionTitle("Ranking", periodLabel(state.period)) }
                    items(state.vendors.sortedByDescending { mapDouble(it, "revenue") ?: 0.0 }) { v ->
                        VendorCard(v, showQuota = true, onClick = { selectedVendor = v })
                    }
                }
            }
        }

        item { Spacer(Modifier.height(24.dp)) }
    }
}

@Composable
private fun VendorDetail(v: Map<String, Any?>, onBack: () -> Unit) {
    val name    = mapStr(v, "userName", "nombre", "name").ifBlank { "Vendedor" }
    val revenue = mapDouble(v, "revenue") ?: 0.0
    val target  = mapDouble(v, "targetRevenue") ?: 0.0
    val att     = mapDouble(v, "attainmentRevenue") ?: 0.0
    val status  = mapStr(v, "status")
    val statusColor = when (status) {
        "on-track" -> Color(0xFF059669); "risk" -> Color(0xFFF59E0B); "off-track" -> Color(0xFFEF4444)
        else -> Color(0xFF64748B)
    }
    LazyColumn(Modifier.fillMaxSize().padding(16.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
        item {
            TextButton(onClick = onBack) { Text("← Reportes") }
        }
        item {
            Text(name, style = MaterialTheme.typography.headlineSmall.copy(fontWeight = FontWeight.Bold))
            if (status.isNotBlank()) {
                Text(
                    status.replace("-", " ").replaceFirstChar { it.uppercase() },
                    style = MaterialTheme.typography.labelSmall,
                    color = statusColor,
                    modifier = Modifier.background(statusColor.copy(alpha = 0.12f), RoundedCornerShape(8.dp))
                        .padding(horizontal = 8.dp, vertical = 2.dp),
                )
            }
        }
        item {
            Card(Modifier.fillMaxWidth(), shape = RoundedCornerShape(14.dp),
                colors = CardDefaults.cardColors(containerColor = Color.White),
                elevation = CardDefaults.cardElevation(1.dp)) {
                Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    Text("Ventas", style = MaterialTheme.typography.titleSmall.copy(fontWeight = FontWeight.SemiBold))
                    vRow("Ingresos",     fmtMxn(revenue))
                    vRow("Meta",         fmtMxn(target))
                    if (target > 0) vRow("Cumplimiento", fmtPct(att))
                    vRow("Oportunidades", "${mapInt(v, "opportunities")}")
                    vRow("Proyectos",    "${mapInt(v, "projects")}")
                    vRow("Leads",        "${mapInt(v, "leads")}")
                    vRow("Actividades",  "${mapInt(v, "activities")}")
                    mapDouble(v, "performance")?.let { vRow("Performance",   fmtPct(it)) }
                    vRow("Email",        mapStr(v, "email"))
                    vRow("Rol",          mapStr(v, "role", "rol"))
                }
            }
        }
        if (target > 0) {
            item {
                Card(Modifier.fillMaxWidth(), shape = RoundedCornerShape(14.dp),
                    colors = CardDefaults.cardColors(containerColor = Color.White),
                    elevation = CardDefaults.cardElevation(1.dp)) {
                    Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                        Text("Cuota", style = MaterialTheme.typography.titleSmall.copy(fontWeight = FontWeight.SemiBold))
                        LinearProgressIndicator(
                            progress = { (att / 100.0).toFloat().coerceIn(0f, 1f) },
                            modifier = Modifier.fillMaxWidth(),
                            color = statusColor,
                        )
                        Text("${fmtPct(att)} de ${fmtMxn(target)}", style = MaterialTheme.typography.bodySmall, color = statusColor)
                    }
                }
            }
        }
    }
}

@Composable
private fun vRow(label: String, value: String) {
    if (value.isNotBlank() && value != "0" && value != "MXN$0") {
        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
            Text(label, style = MaterialTheme.typography.bodySmall, color = Color(0xFF64748B))
            Text(value, style = MaterialTheme.typography.bodySmall.copy(fontWeight = FontWeight.Medium))
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
private fun SectionTitle(title: String, detail: String) {
    Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween, verticalAlignment = Alignment.CenterVertically) {
        Text(title, style = MaterialTheme.typography.titleMedium.copy(fontWeight = FontWeight.SemiBold))
        Text(detail, style = MaterialTheme.typography.labelMedium, color = Color(0xFF64748B))
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
            Triple("Conversión", "${fmtPct(mapDouble(metrics, "conversionRate"))}", Color(0xFFF59E0B)),
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

    Card(
        modifier = Modifier.fillMaxWidth(),
        colors = CardDefaults.cardColors(containerColor = Color(0xFFF0FDF4)),
        shape = RoundedCornerShape(16.dp),
    ) {
        Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
            Text("Resumen de crecimiento", fontWeight = FontWeight.SemiBold, color = Color(0xFF065F46))
            Text(
                "Ingresos ${fmtMxn(revenue)} · Pipeline ${fmtMxn(pipeline)} · Conversión ${fmtPct(conversion)}",
                style = MaterialTheme.typography.bodyMedium,
                color = Color(0xFF047857),
            )
            val closed = mapInt(metrics, "closedProjects")
            val opps = mapInt(metrics, "opportunityCount")
            if (opps > 0) {
                LinearProgressIndicator(
                    progress = { (closed.toFloat() / opps).coerceIn(0f, 1f) },
                    modifier = Modifier.fillMaxWidth(),
                    color = Color(0xFF059669),
                )
                Text("$closed de $opps oportunidades cerradas", style = MaterialTheme.typography.labelSmall, color = Color(0xFF64748B))
            }
        }
    }
}

@Composable
private fun MetricCard(modifier: Modifier, label: String, value: String, accent: Color) {
    Card(
        modifier = modifier,
        shape = RoundedCornerShape(14.dp),
        colors = CardDefaults.cardColors(containerColor = accent.copy(alpha = 0.1f)),
    ) {
        Column(Modifier.padding(14.dp)) {
            Text(label, style = MaterialTheme.typography.labelMedium, color = accent)
            Spacer(Modifier.height(4.dp))
            Text(value, style = MaterialTheme.typography.titleLarge.copy(fontWeight = FontWeight.Bold), color = Color(0xFF0F172A))
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
    val statusColor = when (status) {
        "on-track" -> Color(0xFF059669)
        "risk" -> Color(0xFFF59E0B)
        "off-track" -> Color(0xFFEF4444)
        else -> Color(0xFF64748B)
    }

    Card(
        onClick = onClick,
        modifier = Modifier.fillMaxWidth(),
        shape = RoundedCornerShape(14.dp),
        colors = CardDefaults.cardColors(containerColor = Color.White),
        elevation = CardDefaults.cardElevation(1.dp),
    ) {
        Column(Modifier.padding(14.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween, verticalAlignment = Alignment.CenterVertically) {
                Text(name, fontWeight = FontWeight.SemiBold, color = Color(0xFF0F172A))
                Text(fmtMxn(revenue), fontWeight = FontWeight.Bold, color = Color(0xFF0D9488))
            }
            Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                Text("${mapInt(vendor, "opportunities")} opps", style = MaterialTheme.typography.labelSmall, color = Color(0xFF64748B))
                Text("${mapInt(vendor, "projects")} proy.", style = MaterialTheme.typography.labelSmall, color = Color(0xFF64748B))
                performance?.let {
                    Text("${it.toInt()}% perf.", style = MaterialTheme.typography.labelSmall, color = Color(0xFF64748B))
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
                Text(
                    status.replace("-", " ").replaceFirstChar { it.uppercase() },
                    style = MaterialTheme.typography.labelSmall,
                    color = statusColor,
                    modifier = Modifier
                        .background(statusColor.copy(alpha = 0.12f), RoundedCornerShape(8.dp))
                        .padding(horizontal = 8.dp, vertical = 2.dp),
                )
            }
        }
    }
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
