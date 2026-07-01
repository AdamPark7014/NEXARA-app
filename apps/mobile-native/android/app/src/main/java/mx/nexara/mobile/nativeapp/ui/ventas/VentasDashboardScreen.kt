package mx.nexara.mobile.nativeapp.ui.ventas

import android.app.Application
import androidx.compose.foundation.background
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
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
import mx.nexara.mobile.nativeapp.data.api.CotizacionDto
import mx.nexara.mobile.nativeapp.data.extra.ExtraRepository

// ── Colors
private val GreenLight  = Color(0xFFD1FAE5)
private val GreenColor  = Color(0xFF059669)
private val TealLight   = Color(0xFFCCFBF1)
private val TealColor   = Color(0xFF0D9488)
private val BlueLight   = Color(0xFFDBEAFE)
private val BlueColor   = Color(0xFF3B82F6)
private val AmberLight  = Color(0xFFFEF3C7)
private val AmberColor  = Color(0xFFF59E0B)
private val RedLight    = Color(0xFFFEE2E2)
private val RedColor    = Color(0xFFEF4444)
private val SlateText   = Color(0xFF0F172A)
private val SubText     = Color(0xFF64748B)

// ── State

data class VentasDashboardState(
    val loading: Boolean = true,
    val error: String? = null,
    val cotizaciones: List<CotizacionDto> = emptyList(),
    // generic leads/oportunidades from client-ticket-requests endpoint
    val leads: List<Map<String, Any?>> = emptyList(),
)

// ── ViewModel

class VentasDashboardViewModel(app: Application) : AndroidViewModel(app) {
    private val repo = ExtraRepository(app.applicationContext)
    private val _state = MutableStateFlow(VentasDashboardState())
    val state: StateFlow<VentasDashboardState> = _state

    fun load() {
        _state.update { it.copy(loading = true, error = null) }
        viewModelScope.launch {
            try {
                val cots = withContext(Dispatchers.IO) { repo.cotizaciones() }
                val leads = withContext(Dispatchers.IO) { repo.clientTicketRequests() }
                _state.update { it.copy(loading = false, cotizaciones = cots, leads = leads) }
            } catch (e: Exception) {
                _state.update { it.copy(loading = false, error = e.message ?: "Error al cargar CRM") }
            }
        }
    }
}

// ── Screen

@Composable
fun VentasDashboardScreen() {
    val vm: VentasDashboardViewModel = viewModel()
    val state by vm.state.collectAsState()

    if (state.cotizaciones.isEmpty() && state.loading && state.error == null) {
        vm.load()
    }

    LazyColumn(
        modifier = Modifier.fillMaxSize().padding(16.dp),
        verticalArrangement = Arrangement.spacedBy(16.dp),
    ) {
        // Header
        item {
            Column {
                Text("Dashboard CRM", style = MaterialTheme.typography.headlineSmall.copy(fontWeight = FontWeight.Bold), color = SlateText)
                Text("Cotizaciones · Leads · Pipeline", style = MaterialTheme.typography.bodySmall, color = SubText)
            }
        }

        if (state.loading) {
            item { Text("Cargando…", color = SubText) }
            return@LazyColumn
        }

        if (!state.error.isNullOrBlank()) {
            item {
                Text(state.error!!, color = Color(0xFFEF4444))
                Spacer(Modifier.height(8.dp))
                Button(onClick = { vm.load() }) { Text("Reintentar") }
            }
            return@LazyColumn
        }

        // ── KPI cards
        item {
            val total     = state.cotizaciones.size
            val totalVal  = state.cotizaciones.sumOf { it.total ?: 0.0 }
            val approved  = state.cotizaciones.count { (it.estatus ?: "").lowercase().contains("aprobad") }
            val approvedV = state.cotizaciones.filter { (it.estatus ?: "").lowercase().contains("aprobad") }.sumOf { it.total ?: 0.0 }
            val pending   = state.cotizaciones.count { val s = (it.estatus ?: "").lowercase(); s.contains("enviada") || s.contains("borrador") }
            val rejected  = state.cotizaciones.count { (it.estatus ?: "").lowercase().let { s -> s.contains("rechazad") || s.contains("vencid") } }

            Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
                Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                    CrmKpiCard(
                        Modifier.weight(1f),
                        icon = "📝", title = "Cotizaciones",
                        value = total.toString(), sub = fmtMxn(totalVal),
                        bg = TealLight, accent = TealColor,
                    )
                    CrmKpiCard(
                        Modifier.weight(1f),
                        icon = "✅", title = "Aprobadas",
                        value = approved.toString(), sub = fmtMxn(approvedV),
                        bg = GreenLight, accent = GreenColor,
                    )
                }
                Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                    CrmKpiCard(
                        Modifier.weight(1f),
                        icon = "⏳", title = "En proceso",
                        value = pending.toString(), sub = "Enviadas + borradores",
                        bg = AmberLight, accent = AmberColor,
                    )
                    CrmKpiCard(
                        Modifier.weight(1f),
                        icon = "🎯", title = "Leads / Tickets",
                        value = state.leads.size.toString(), sub = "Solicitudes abiertas",
                        bg = BlueLight, accent = BlueColor,
                    )
                }
            }
        }

        // ── Status breakdown
        if (state.cotizaciones.isNotEmpty()) {
            item {
                CrmSectionHeader("Estado de cotizaciones", "${state.cotizaciones.size} total")
            }
            item {
                val groups = state.cotizaciones
                    .groupBy { it.estatus?.ifBlank { "Sin estado" } ?: "Sin estado" }
                    .entries.sortedByDescending { it.value.size }

                Card(
                    modifier = Modifier.fillMaxWidth(),
                    shape = RoundedCornerShape(16.dp),
                    colors = CardDefaults.cardColors(containerColor = Color.White),
                    elevation = CardDefaults.cardElevation(2.dp),
                ) {
                    Column(modifier = Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
                        groups.forEach { (status, list) ->
                            val pct = list.size.toFloat() / state.cotizaciones.size
                            val color = cotStatusColor(status)
                            Column {
                                Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                                    Text(status, style = MaterialTheme.typography.bodyMedium.copy(fontWeight = FontWeight.Medium), color = SlateText)
                                    Text("${list.size}  (${(pct * 100).toInt()}%)", style = MaterialTheme.typography.bodySmall, color = SubText)
                                }
                                Spacer(Modifier.height(4.dp))
                                Box(
                                    modifier = Modifier.fillMaxWidth().height(6.dp)
                                        .clip(RoundedCornerShape(3.dp)).background(Color(0xFFF1F5F9))
                                ) {
                                    Box(Modifier.fillMaxWidth(pct.coerceIn(0f, 1f)).height(6.dp)
                                        .clip(RoundedCornerShape(3.dp)).background(color))
                                }
                            }
                        }
                    }
                }
            }
        }

        // ── Recent cotizaciones
        item { CrmSectionHeader("Cotizaciones recientes", "Últimas 8") }
        items(state.cotizaciones.take(8)) { c ->
            CotizacionRowCard(c)
        }

        // ── Recent leads
        if (state.leads.isNotEmpty()) {
            item { CrmSectionHeader("Leads · Solicitudes recientes", "${state.leads.size} total") }
            item {
                LazyRow(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                    items(state.leads.take(8)) { lead ->
                        LeadCard(lead)
                    }
                }
            }
        }

        item { Spacer(Modifier.height(24.dp)) }
    }
}

// ── Composables

@Composable
private fun CrmKpiCard(
    modifier: Modifier = Modifier,
    icon: String, title: String, value: String, sub: String,
    bg: Color, accent: Color,
) {
    Card(
        modifier = modifier,
        shape = RoundedCornerShape(16.dp),
        colors = CardDefaults.cardColors(containerColor = bg),
        elevation = CardDefaults.cardElevation(0.dp),
    ) {
        Column(modifier = Modifier.padding(14.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                Text(icon, fontSize = 18.sp)
                Text(title, style = MaterialTheme.typography.labelMedium, color = accent)
            }
            Spacer(Modifier.height(8.dp))
            Text(value, style = MaterialTheme.typography.headlineSmall.copy(fontWeight = FontWeight.Bold), color = SlateText)
            Spacer(Modifier.height(2.dp))
            Text(sub, style = MaterialTheme.typography.bodySmall, color = SubText)
        }
    }
}

@Composable
private fun CrmSectionHeader(title: String, detail: String = "") {
    Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween, verticalAlignment = Alignment.Bottom) {
        Text(title, style = MaterialTheme.typography.titleMedium.copy(fontWeight = FontWeight.Bold), color = SlateText)
        if (detail.isNotBlank()) Text(detail, style = MaterialTheme.typography.bodySmall, color = SubText)
    }
}

@Composable
private fun CotizacionRowCard(c: CotizacionDto) {
    val color = cotStatusColor(c.estatus ?: "")
    Card(
        modifier = Modifier.fillMaxWidth(),
        shape = RoundedCornerShape(14.dp),
        colors = CardDefaults.cardColors(containerColor = Color.White),
        elevation = CardDefaults.cardElevation(2.dp),
    ) {
        Row(modifier = Modifier.padding(14.dp), horizontalArrangement = Arrangement.spacedBy(12.dp)) {
            Box(Modifier.width(4.dp).height(56.dp).clip(RoundedCornerShape(2.dp)).background(color))
            Column(Modifier.weight(1f)) {
                Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween, verticalAlignment = Alignment.CenterVertically) {
                    Text(
                        c.folio ?: "Cot. #${c.id}",
                        style = MaterialTheme.typography.bodyMedium.copy(fontWeight = FontWeight.Bold),
                        color = TealColor,
                    )
                    Box(
                        Modifier.clip(RoundedCornerShape(6.dp)).background(color.copy(alpha = 0.13f)).padding(horizontal = 8.dp, vertical = 3.dp)
                    ) {
                        Text(c.estatus ?: "–", style = MaterialTheme.typography.labelSmall.copy(fontWeight = FontWeight.SemiBold), color = color)
                    }
                }
                if (!c.cliente.isNullOrBlank()) {
                    Text(c.cliente!!, style = MaterialTheme.typography.bodySmall, color = SlateText)
                }
                Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                    Text(c.fecha ?: c.createdAt ?: "—", style = MaterialTheme.typography.labelSmall, color = SubText)
                    Text(fmtMxn(c.total ?: 0.0), style = MaterialTheme.typography.titleSmall.copy(fontWeight = FontWeight.Bold), color = SlateText)
                }
            }
        }
    }
}

@Composable
private fun LeadCard(lead: Map<String, Any?>) {
    val title  = nn(lead["title"] as? String ?: lead["subject"] as? String ?: lead["asunto"] as? String)
    val client = lead["clientName"] as? String ?: lead["cliente"] as? String
    val status = lead["status"] as? String ?: lead["estatus"] as? String ?: "–"

    Card(
        modifier = Modifier.width(180.dp),
        shape = RoundedCornerShape(16.dp),
        colors = CardDefaults.cardColors(containerColor = Color.White),
        elevation = CardDefaults.cardElevation(2.dp),
    ) {
        Column(modifier = Modifier.padding(14.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
            Text("🎯", fontSize = 22.sp)
            Text(title, style = MaterialTheme.typography.bodyMedium.copy(fontWeight = FontWeight.Bold), color = SlateText, maxLines = 2)
            if (!client.isNullOrBlank()) Text(client, style = MaterialTheme.typography.bodySmall, color = SubText, maxLines = 1)
            Box(Modifier.clip(RoundedCornerShape(6.dp)).background(AmberColor.copy(alpha = 0.13f)).padding(horizontal = 8.dp, vertical = 3.dp)) {
                Text(status, style = MaterialTheme.typography.labelSmall, color = AmberColor)
            }
        }
    }
}

private fun nn(s: String?): String = if (s.isNullOrBlank()) "—" else s

private fun fmtMxn(v: Double): String {
    val r = kotlin.math.round(v).toLong()
    return "$%,d".format(r)
}

private fun cotStatusColor(status: String): Color {
    val s = status.lowercase()
    return when {
        s.contains("aprobad") -> GreenColor
        s.contains("enviada") -> BlueColor
        s.contains("rechazad") || s.contains("vencid") -> RedColor
        else -> AmberColor
    }
}
