package mx.nexara.mobile.nativeapp.ui.ventas

import android.app.Application
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.*
import androidx.compose.material3.pulltorefresh.PullToRefreshBox
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.role
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import androidx.lifecycle.viewmodel.compose.viewModel
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.async
import kotlinx.coroutines.coroutineScope
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import mx.nexara.mobile.nativeapp.data.api.CotizacionDto
import mx.nexara.mobile.nativeapp.data.api.CrmActivityDto
import mx.nexara.mobile.nativeapp.data.api.CrmLeadDto
import mx.nexara.mobile.nativeapp.data.api.CrmOpportunityDto
import mx.nexara.mobile.nativeapp.data.crm.CrmRepository
import mx.nexara.mobile.nativeapp.ui.enterprise.NxColors
import mx.nexara.mobile.nativeapp.ui.enterprise.NxDimens
import mx.nexara.mobile.nativeapp.ui.enterprise.NxErrorBlock
import mx.nexara.mobile.nativeapp.ui.enterprise.NxSkeletonList
import mx.nexara.mobile.nativeapp.ui.enterprise.NxPanelShell
import mx.nexara.mobile.nativeapp.ui.enterprise.NxSectionHeader
import java.time.LocalDate

// ── Colors
private val GreenLight  = Color(0xFFD1FAE5)
private val GreenColor  = Color(0xFF059669)
private val TealLight   = Color(0xFFCCFBF1)
private val TealColor   = Color(0xFF0D9488)
private val BlueLight   = Color(0xFFDBEAFE)
private val BlueColor   = Color(0xFF3B82F6)
private val AmberLight  = Color(0xFFFEF3C7)
private val AmberColor  = Color(0xFFF59E0B)
private val PurpleLight = Color(0xFFEDE9FE)
private val PurpleColor = Color(0xFF7C3AED)
private val RedLight    = Color(0xFFFEE2E2)
private val RedColor    = Color(0xFFEF4444)
private val SlateText   = Color(0xFF0F172A)
private val SubText     = Color(0xFF64748B)

// ── State

data class VentasDashboardState(
    val loading: Boolean = true,
    val isRefreshing: Boolean = false,
    val error: String? = null,
    val cotizaciones: List<CotizacionDto> = emptyList(),
    val leads: List<CrmLeadDto> = emptyList(),
    val opportunities: List<CrmOpportunityDto> = emptyList(),
    val metrics: Map<String, Any?> = emptyMap(),
    val agendaToday: List<CrmActivityDto> = emptyList(),
    val agendaOverdue: List<CrmActivityDto> = emptyList(),
)

// ── ViewModel

class VentasDashboardViewModel(app: Application) : AndroidViewModel(app) {
    private val crmRepo = CrmRepository(app.applicationContext)
    private val _state = MutableStateFlow(VentasDashboardState())
    val state: StateFlow<VentasDashboardState> = _state
    private var hasLoaded = false

    fun load(initial: Boolean = false) {
        if (initial && !hasLoaded) {
            _state.update { it.copy(loading = true, error = null) }
        } else if (!initial) {
            _state.update { it.copy(isRefreshing = true, error = null) }
        }
        viewModelScope.launch {
            try {
                val result = withContext(Dispatchers.IO) {
                    coroutineScope {
                        val cotsDef = async { crmRepo.cotizaciones() }
                        val leadsDef = async { crmRepo.leadDtos() }
                        val oppsDef = async { crmRepo.opportunityDtos() }
                        val metricsDef = async { runCatching { crmRepo.salesMetrics("month") }.getOrDefault(emptyMap()) }
                        val agendaDef = async { runCatching { crmRepo.crmAgenda() }.getOrNull() }
                        val agenda = agendaDef.await()
                        DashboardLoadResult(
                            cotizaciones = cotsDef.await(),
                            leads = leadsDef.await(),
                            opportunities = oppsDef.await(),
                            metrics = metricsDef.await(),
                            agendaToday = agenda?.pendingToday ?: emptyList(),
                            agendaOverdue = agenda?.overdue ?: emptyList(),
                        )
                    }
                }
                hasLoaded = true
                _state.update {
                    it.copy(
                        loading = false,
                        isRefreshing = false,
                        cotizaciones = result.cotizaciones,
                        leads = result.leads,
                        opportunities = result.opportunities,
                        metrics = result.metrics,
                        agendaToday = result.agendaToday,
                        agendaOverdue = result.agendaOverdue,
                        error = null,
                    )
                }
            } catch (e: Exception) {
                _state.update {
                    it.copy(
                        loading = false,
                        isRefreshing = false,
                        error = e.message ?: "Error al cargar CRM",
                    )
                }
            }
        }
    }

    private data class DashboardLoadResult(
        val cotizaciones: List<CotizacionDto>,
        val leads: List<CrmLeadDto>,
        val opportunities: List<CrmOpportunityDto>,
        val metrics: Map<String, Any?>,
        val agendaToday: List<CrmActivityDto>,
        val agendaOverdue: List<CrmActivityDto>,
    )
}

// ── Screen

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun VentasDashboardScreen(
    onNewQuote: () -> Unit = {},
    onOpenLeads: () -> Unit = {},
    onOpenPipeline: () -> Unit = {},
    onOpenAgenda: () -> Unit = {},
    onOpenChat: () -> Unit = {},
) {
    val vm: VentasDashboardViewModel = viewModel()
    val state by vm.state.collectAsState()

    LaunchedEffect(Unit) { vm.load(initial = true) }

    val showInitialSkeleton = state.loading && !state.isRefreshing && state.cotizaciones.isEmpty() && state.error == null

    PullToRefreshBox(
        isRefreshing = state.isRefreshing,
        onRefresh = { vm.load(initial = false) },
        modifier = Modifier.fillMaxSize(),
    ) {
        LazyColumn(
            modifier = Modifier.fillMaxSize().background(NxColors.Surface).padding(16.dp),
            verticalArrangement = Arrangement.spacedBy(16.dp),
        ) {
            // Header
            item {
                Column {
                    Text(
                        "Dashboard CRM",
                        style = MaterialTheme.typography.headlineSmall.copy(fontWeight = FontWeight.Bold),
                        color = SlateText,
                    )
                    Text(
                        "Pipeline · Leads · Cotizaciones",
                        style = MaterialTheme.typography.bodySmall,
                        color = SubText,
                    )
                }
            }

            // Quick actions
            item {
                LazyRow(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                    item {
                        QuickActionCard("⚡", "Cotizar", "Smart Quote", TealColor, onNewQuote)
                    }
                    item {
                        QuickActionCard("🎯", "Leads", "Captura", BlueColor, onOpenLeads)
                    }
                    item {
                        QuickActionCard("📊", "Pipeline", "Oportunidades", PurpleColor, onOpenPipeline)
                    }
                    item {
                        QuickActionCard("📅", "Agenda", "Hoy", AmberColor, onOpenAgenda)
                    }
                    item {
                        QuickActionCard("💬", "Chat", "Equipo", BlueColor, onOpenChat)
                    }
                }
            }

            if (!state.error.isNullOrBlank()) {
                item {
                    NxErrorBlock(state.error!!, onRetry = { vm.load(initial = false) })
                }
            }

            if (showInitialSkeleton) {
                item { NxSkeletonList(itemCount = 4, itemHeight = 88.dp) }
                return@LazyColumn
            }

            // ── KPI cards (CRM parity)
            item {
                val openOpps = state.opportunities.count { !isClosedOpportunityStage(it.stage) }
                val quotesMonth = state.cotizaciones.count { isCurrentMonth(it.createdAt ?: it.fecha) }
                val pipelineValue = dashDouble(state.metrics, "pipelineValue").takeIf { it > 0 }
                    ?: state.opportunities
                        .filter { !isClosedOpportunityStage(it.stage) }
                        .sumOf { it.value }

                Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
                    Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                        CrmKpiCard(
                            Modifier.weight(1f),
                            icon = "🎯",
                            title = "Leads",
                            value = state.leads.size.toString(),
                            sub = "Capturados",
                            bg = BlueLight,
                            accent = BlueColor,
                        )
                        CrmKpiCard(
                            Modifier.weight(1f),
                            icon = "📈",
                            title = "Oportunidades",
                            value = openOpps.toString(),
                            sub = "Abiertas",
                            bg = PurpleLight,
                            accent = PurpleColor,
                        )
                    }
                    Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                        CrmKpiCard(
                            Modifier.weight(1f),
                            icon = "📝",
                            title = "Cotizaciones",
                            value = quotesMonth.toString(),
                            sub = "Este mes",
                            bg = TealLight,
                            accent = TealColor,
                        )
                        CrmKpiCard(
                            Modifier.weight(1f),
                            icon = "💰",
                            title = "Pipeline",
                            value = fmtMxnCompact(pipelineValue),
                            sub = "Valor activo",
                            bg = GreenLight,
                            accent = GreenColor,
                        )
                    }
                }
            }

            // ── Pipeline del mes (API métricas)
            if (state.metrics.isNotEmpty()) {
                item { NxSectionHeader("Métricas del mes", "Periodo actual") }
                item {
                    val revenue = dashDouble(state.metrics, "totalRevenue")
                    val conversion = dashDouble(state.metrics, "conversionRate")
                    val oppCount = dashDouble(state.metrics, "opportunityCount").toInt()
                    Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                        CrmKpiCard(
                            Modifier.weight(1f),
                            "💵",
                            "Ingresos",
                            fmtMxnCompact(revenue),
                            "Mes actual",
                            GreenLight,
                            GreenColor,
                        )
                        CrmKpiCard(
                            Modifier.weight(1f),
                            "🎯",
                            "Conversión",
                            "${String.format("%.1f", conversion)}%",
                            "$oppCount opps",
                            AmberLight,
                            AmberColor,
                        )
                    }
                }
            }

            // ── Agenda de hoy
            val agendaItems = (state.agendaOverdue + state.agendaToday).distinctBy { it.id }
            if (agendaItems.isNotEmpty()) {
                item {
                    NxSectionHeader(
                        "Tu agenda de hoy",
                        if (state.agendaOverdue.isNotEmpty()) "${state.agendaOverdue.size} vencidas" else "${agendaItems.size} pendientes",
                    )
                }
                items(agendaItems.take(6), key = { it.rowKey }) { act ->
                    AgendaRowCard(act)
                }
            }

            // ── Oportunidades activas
            val activeOpps = state.opportunities.filter { !isClosedOpportunityStage(it.stage) }
            if (activeOpps.isNotEmpty()) {
                item { NxSectionHeader("Oportunidades activas", "${activeOpps.size} en pipeline") }
                items(activeOpps.take(5), key = { it.rowKey }) { opp ->
                    OpportunityRowCard(opp)
                }
            }

            // ── Status breakdown
            if (state.cotizaciones.isNotEmpty()) {
                item {
                    NxSectionHeader("Estado de cotizaciones", "${state.cotizaciones.size} total")
                }
                item {
                    val groups = state.cotizaciones
                        .groupBy { it.estatus?.ifBlank { "Sin estado" } ?: "Sin estado" }
                        .entries.sortedByDescending { it.value.size }

                    NxPanelShell(contentPadding = PaddingValues(16.dp)) {
                            groups.forEach { (status, list) ->
                                val pct = list.size.toFloat() / state.cotizaciones.size
                                val color = cotStatusColor(status)
                                Column {
                                    Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                                        Text(
                                            status,
                                            style = MaterialTheme.typography.bodyMedium.copy(fontWeight = FontWeight.Medium),
                                            color = SlateText,
                                        )
                                        Text(
                                            "${list.size}  (${(pct * 100).toInt()}%)",
                                            style = MaterialTheme.typography.bodySmall,
                                            color = SubText,
                                        )
                                    }
                                    Spacer(Modifier.height(4.dp))
                                    Box(
                                        modifier = Modifier
                                            .fillMaxWidth()
                                            .height(6.dp)
                                            .clip(RoundedCornerShape(3.dp))
                                            .background(Color(0xFFF1F5F9)),
                                    ) {
                                        Box(
                                            Modifier
                                                .fillMaxWidth(pct.coerceIn(0f, 1f))
                                                .height(6.dp)
                                                .clip(RoundedCornerShape(3.dp))
                                                .background(color),
                                        )
                                    }
                                }
                            }
                    }
                }
            }

            // ── Recent cotizaciones
            if (state.cotizaciones.isNotEmpty()) {
                item { NxSectionHeader("Cotizaciones recientes", "Últimas 8") }
                items(state.cotizaciones.take(8), key = { it.id }) { c ->
                    CotizacionRowCard(c)
                }
            }

            // ── Recent leads
            if (state.leads.isNotEmpty()) {
                item { NxSectionHeader("Leads recientes", "${state.leads.size} total") }
                item {
                    LazyRow(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                        items(state.leads.take(8), key = { it.rowKey }) { lead ->
                            LeadCard(lead)
                        }
                    }
                }
            }

            item { Spacer(Modifier.height(24.dp)) }
        }
    }
}

// ── Composables

@Composable
private fun QuickActionCard(
    icon: String,
    title: String,
    subtitle: String,
    color: Color,
    onClick: () -> Unit,
) {
    Card(
        onClick = onClick,
        modifier = Modifier
            .width(108.dp)
            .heightIn(min = 48.dp)
            .semantics {
                contentDescription = "$title, $subtitle"
                role = Role.Button
            },
        shape = RoundedCornerShape(NxDimens.PanelRadius),
        colors = CardDefaults.cardColors(containerColor = color),
    ) {
        Column(Modifier.padding(12.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
            Text(icon, fontSize = 20.sp)
            Text(title, color = Color.White, fontWeight = FontWeight.Bold, fontSize = 13.sp)
            Text(subtitle, color = Color.White.copy(alpha = 0.9f), fontSize = 10.sp, maxLines = 1)
        }
    }
}

@Composable
private fun CrmKpiCard(
    modifier: Modifier = Modifier,
    icon: String,
    title: String,
    value: String,
    sub: String,
    bg: Color,
    accent: Color,
) {
    Card(
        modifier = modifier,
        shape = RoundedCornerShape(NxDimens.PanelRadius),
        colors = CardDefaults.cardColors(containerColor = bg),
        elevation = CardDefaults.cardElevation(0.dp),
    ) {
        Column(modifier = Modifier.padding(14.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                Text(icon, fontSize = 18.sp)
                Text(title, style = MaterialTheme.typography.labelMedium, color = accent)
            }
            Spacer(Modifier.height(8.dp))
            Text(
                value,
                style = MaterialTheme.typography.headlineSmall.copy(fontWeight = FontWeight.Bold),
                color = SlateText,
            )
            Spacer(Modifier.height(2.dp))
            Text(sub, style = MaterialTheme.typography.bodySmall, color = SubText)
        }
    }
}

@Composable
private fun AgendaRowCard(act: CrmActivityDto) {
    val accent = when (act.activityType.uppercase()) {
        "CALL" -> GreenColor
        "MEETING" -> AmberColor
        "VISIT" -> BlueColor
        "EMAIL" -> PurpleColor
        else -> SubText
    }
    NxPanelShell {
        Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
            Box(
                Modifier
                    .width(4.dp)
                    .height(48.dp)
                    .clip(RoundedCornerShape(2.dp))
                    .background(if (act.isOverdue) RedColor else accent),
            )
            Column(Modifier.weight(1f)) {
                Text(
                    act.displayTitle,
                    style = MaterialTheme.typography.bodyMedium.copy(fontWeight = FontWeight.SemiBold),
                    color = SlateText,
                )
                if (act.relatedLabel.isNotBlank()) {
                    Text(act.relatedLabel, style = MaterialTheme.typography.bodySmall, color = SubText)
                }
            }
            val time = act.dueDate?.take(16)?.substringAfter("T")?.take(5)
                ?: act.dueDate?.take(10)
                ?: ""
            if (time.isNotBlank()) {
                Text(time, style = MaterialTheme.typography.labelSmall, color = SubText)
            }
        }
    }
}

@Composable
private fun OpportunityRowCard(opp: CrmOpportunityDto) {
    NxPanelShell {
        Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
            Box(
                Modifier
                    .width(4.dp)
                    .height(48.dp)
                    .clip(RoundedCornerShape(2.dp))
                    .background(PurpleColor),
            )
            Column(Modifier.weight(1f)) {
                Text(
                    opp.clientName.ifBlank { opp.displayTitle },
                    style = MaterialTheme.typography.bodyMedium.copy(fontWeight = FontWeight.SemiBold),
                    color = SlateText,
                )
                Text(
                    opp.stageKey,
                    style = MaterialTheme.typography.bodySmall,
                    color = SubText,
                )
            }
            Text(
                fmtMxnCompact(opp.value),
                style = MaterialTheme.typography.titleSmall.copy(fontWeight = FontWeight.Bold),
                color = SlateText,
            )
        }
    }
}

@Composable
private fun CotizacionRowCard(c: CotizacionDto) {
    val color = cotStatusColor(c.estatus ?: "")
    NxPanelShell {
        Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
            Box(Modifier.width(4.dp).height(56.dp).clip(RoundedCornerShape(2.dp)).background(color))
            Column(Modifier.weight(1f)) {
                Row(
                    Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Text(
                        c.folio ?: "Cot. #${c.id}",
                        style = MaterialTheme.typography.bodyMedium.copy(fontWeight = FontWeight.Bold),
                        color = TealColor,
                    )
                    Box(
                        Modifier
                            .clip(RoundedCornerShape(6.dp))
                            .background(color.copy(alpha = 0.13f))
                            .padding(horizontal = 8.dp, vertical = 3.dp),
                    ) {
                        Text(
                            c.estatus ?: "–",
                            style = MaterialTheme.typography.labelSmall.copy(fontWeight = FontWeight.SemiBold),
                            color = color,
                        )
                    }
                }
                if (!c.cliente.isNullOrBlank()) {
                    Text(c.cliente!!, style = MaterialTheme.typography.bodySmall, color = SlateText)
                }
                Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                    Text(c.fecha ?: c.createdAt ?: "—", style = MaterialTheme.typography.labelSmall, color = SubText)
                    Text(
                        fmtMxn(c.total ?: 0.0),
                        style = MaterialTheme.typography.titleSmall.copy(fontWeight = FontWeight.Bold),
                        color = SlateText,
                    )
                }
            }
        }
    }
}

@Composable
private fun LeadCard(lead: CrmLeadDto) {
    val status = lead.status.ifBlank { "–" }
    Card(
        modifier = Modifier.width(180.dp),
        shape = RoundedCornerShape(NxDimens.PanelRadius),
        colors = CardDefaults.cardColors(containerColor = Color.White),
        elevation = CardDefaults.cardElevation(2.dp),
    ) {
        Column(modifier = Modifier.padding(14.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
            Text("🎯", fontSize = 22.sp)
            Text(
                lead.displayTitle,
                style = MaterialTheme.typography.bodyMedium.copy(fontWeight = FontWeight.Bold),
                color = SlateText,
                maxLines = 2,
            )
            val client = lead.clientName.ifBlank { lead.branchName }
            if (client.isNotBlank()) {
                Text(client, style = MaterialTheme.typography.bodySmall, color = SubText, maxLines = 1)
            }
            Box(
                Modifier
                    .clip(RoundedCornerShape(6.dp))
                    .background(AmberColor.copy(alpha = 0.13f))
                    .padding(horizontal = 8.dp, vertical = 3.dp),
            ) {
                Text(status, style = MaterialTheme.typography.labelSmall, color = AmberColor)
            }
        }
    }
}

private fun isClosedOpportunityStage(stage: String): Boolean {
    val s = stage.uppercase()
    return s == "WON" || s == "LOST" || s.contains("GANAD") || s.contains("PERDID") || s.contains("CLOSED")
}

private fun isCurrentMonth(dateStr: String?): Boolean {
    if (dateStr.isNullOrBlank()) return false
    val now = LocalDate.now()
    return try {
        val d = LocalDate.parse(dateStr.take(10))
        d.year == now.year && d.month == now.month
    } catch (_: Exception) {
        false
    }
}

private fun fmtMxn(v: Double): String {
    val r = kotlin.math.round(v).toLong()
    return "$%,d".format(r)
}

private fun fmtMxnCompact(v: Double): String = when {
    v >= 1_000_000 -> "$" + String.format("%.1fM", v / 1_000_000)
    v >= 1_000 -> "$" + String.format("%.1fK", v / 1_000)
    else -> fmtMxn(v)
}

private fun cotStatusColor(status: String): Color {
    val s = status.lowercase()
    return when {
        s.contains("aprobad") || s.contains("firmad") -> GreenColor
        s.contains("enviada") || s.contains("sent") -> BlueColor
        s.contains("rechazad") || s.contains("vencid") -> RedColor
        else -> AmberColor
    }
}

private fun dashDouble(m: Map<String, Any?>, key: String): Double = when (val v = m[key]) {
    is Double -> v
    is Float -> v.toDouble()
    is Int -> v.toDouble()
    is Long -> v.toDouble()
    is Number -> v.toDouble()
    is String -> v.toDoubleOrNull() ?: 0.0
    else -> 0.0
}
