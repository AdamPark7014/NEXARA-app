package mx.nexara.mobile.nativeapp.ui.console.screens

import android.app.Application
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.Divider
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
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
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import mx.nexara.mobile.nativeapp.data.AuthRepository
import mx.nexara.mobile.nativeapp.data.api.ActivityDto
import mx.nexara.mobile.nativeapp.data.api.AttendanceRangeDto
import mx.nexara.mobile.nativeapp.data.api.ExecutiveCLevelDto
import mx.nexara.mobile.nativeapp.data.api.ViaticDto
import mx.nexara.mobile.nativeapp.data.console.ConsoleRepository
import mx.nexara.mobile.nativeapp.data.extra.ExtraRepository
import mx.nexara.mobile.nativeapp.ui.console.isAdministrativoRole
import mx.nexara.mobile.nativeapp.ui.commandcenter.CommandCenterRail
import mx.nexara.mobile.nativeapp.ui.commandcenter.CommandPanelFilter
import mx.nexara.mobile.nativeapp.ui.commandcenter.buildExecutiveDynamicWidgets
import mx.nexara.mobile.nativeapp.ui.enterprise.NxAlert
import mx.nexara.mobile.nativeapp.ui.enterprise.NxAlertBanner
import mx.nexara.mobile.nativeapp.ui.enterprise.NxColors
import mx.nexara.mobile.nativeapp.ui.enterprise.NxDimens
import mx.nexara.mobile.nativeapp.ui.enterprise.NxErrorBlock
import mx.nexara.mobile.nativeapp.ui.enterprise.NxKpi
import mx.nexara.mobile.nativeapp.ui.enterprise.NxKpiGrid
import mx.nexara.mobile.nativeapp.ui.enterprise.NxSkeletonList
import mx.nexara.mobile.nativeapp.ui.enterprise.NxPanelShell
import mx.nexara.mobile.nativeapp.ui.enterprise.NxSectionHeader
import mx.nexara.mobile.nativeapp.ui.enterprise.NxTone
import mx.nexara.mobile.nativeapp.ui.enterprise.sparklineFromCounts
import java.time.DayOfWeek
import java.time.LocalDate
import java.time.format.DateTimeFormatter

data class DashboardUiState(
    val isLoading: Boolean = true,
    val error: String? = null,
    val viatics: List<ViaticDto> = emptyList(),
    val activities: List<ActivityDto> = emptyList(),
    val attendance: AttendanceRangeDto? = null,
    val weekFrom: String = "",
    val weekTo: String = "",
    val executive: ExecutiveCLevelDto = ExecutiveCLevelDto(),
    val approvals: List<mx.nexara.mobile.nativeapp.data.api.WorkflowApprovalDto> = emptyList(),
)

class ConsoleDashboardViewModel(app: Application) : AndroidViewModel(app) {
    private val repo = ConsoleRepository(app.applicationContext)
    private val authRepo = AuthRepository(app.applicationContext)
    private val extraRepo = ExtraRepository(app.applicationContext)

    private val _state = MutableStateFlow(DashboardUiState())
    val state: StateFlow<DashboardUiState> = _state

    private fun currentWeekRange(): Pair<String, String> {
        val fmt = DateTimeFormatter.ISO_LOCAL_DATE
        val today = LocalDate.now()
        val daysSinceMonday = (today.dayOfWeek.value - DayOfWeek.MONDAY.value + 7) % 7
        val monday = today.minusDays(daysSinceMonday.toLong())
        val sunday = monday.plusDays(6)
        return Pair(monday.format(fmt), sunday.format(fmt))
    }

    fun decideApproval(id: Long, approved: Boolean) {
        viewModelScope.launch {
            runCatching {
                withContext(Dispatchers.IO) {
                    extraRepo.workflowDecide(id, if (approved) "APPROVED" else "REJECTED")
                }
            }
            refresh()
        }
    }

    fun refresh() {
        val (from, to) = currentWeekRange()
        _state.update { it.copy(isLoading = true, error = null, weekFrom = from, weekTo = to) }
        viewModelScope.launch {
            try {
                val viatics    = withContext(Dispatchers.IO) { repo.viaticsFetch() }
                val activities = withContext(Dispatchers.IO) { repo.activitiesFetch() }
                val attendance = withContext(Dispatchers.IO) { runCatching { repo.attendanceRange(from, to) }.getOrNull() }
                val executive  = withContext(Dispatchers.IO) { runCatching { extraRepo.executiveCLevelDto() }.getOrElse { ExecutiveCLevelDto() } }
                val approvals  = withContext(Dispatchers.IO) { runCatching { extraRepo.workflowApprovals() }.getOrElse { emptyList() } }
                _state.update {
                    it.copy(
                        isLoading = false,
                        viatics = viatics,
                        activities = activities,
                        attendance = attendance,
                        executive = executive,
                        approvals = approvals,
                        error = null,
                    )
                }
            } catch (e: Exception) {
                _state.update {
                    it.copy(isLoading = false, error = e.message?.takeIf { m -> m.isNotBlank() } ?: "No se pudo cargar el dashboard")
                }
            }
        }
    }
}

private val TealColor = Color(0xFF0D9488)
private val TealLight = Color(0xFFCCFBF1)
private val BlueLight = Color(0xFFDBEAFE)
private val BlueColor = Color(0xFF3B82F6)
private val AmberLight = Color(0xFFFEF3C7)
private val AmberColor = Color(0xFFF59E0B)
private val GreenLight = Color(0xFFD1FAE5)
private val GreenColor = Color(0xFF10B981)
private val RedLight = Color(0xFFFEE2E2)
private val RedColor = Color(0xFFEF4444)
private val SlateText = Color(0xFF0F172A)
private val SubText = Color(0xFF64748B)

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ConsoleDashboardScreen(
    contentPadding: PaddingValues = PaddingValues(16.dp),
    isOps: Boolean = false,
    onOpenModule: ((String) -> Unit)? = null,
) {
    val vm: ConsoleDashboardViewModel = viewModel()
    val state by vm.state.collectAsState()
    val context = LocalContext.current
    val user = remember { AuthRepository(context).loadSession() }
    val isAdministrativo = user?.isAdministrativoRole() == true
    var nocAlerts by remember { mutableStateOf<List<mx.nexara.mobile.nativeapp.data.api.NocAlertDto>>(emptyList()) }

    if (isOps) {
        val extraRepo = remember { ExtraRepository(context) }
        androidx.compose.runtime.LaunchedEffect(Unit) {
            nocAlerts = withContext(Dispatchers.IO) { extraRepo.nocAlertDtos() }
        }
    }

    if (state.activities.isEmpty() && state.isLoading && state.error == null) {
        vm.refresh()
    }

    LazyColumn(
        modifier = Modifier
            .fillMaxSize()
            .background(NxColors.Surface)
            .padding(contentPadding),
        verticalArrangement = Arrangement.spacedBy(16.dp),
    ) {
        item {
            Column {
                Text(
                    "Resumen ejecutivo",
                    style = MaterialTheme.typography.headlineSmall.copy(fontWeight = FontWeight.Bold),
                    color = SlateText,
                )
                Text(
                    buildString {
                        append("Semana: ")
                        if (state.weekFrom.isNotBlank()) {
                            append(state.weekFrom)
                            append(" → ")
                            append(state.weekTo)
                        } else {
                            append("–")
                        }
                    },
                    style = MaterialTheme.typography.bodySmall,
                    color = SubText,
                )
            }
        }

        if (state.isLoading) {
            item { NxSkeletonList(itemCount = 4, itemHeight = 88.dp) }
            return@LazyColumn
        }

        if (!state.error.isNullOrBlank()) {
            item {
                NxErrorBlock(state.error!!, onRetry = { vm.refresh() })
            }
            return@LazyColumn
        }

        if (onOpenModule != null) {
            item {
                CommandCenterRail(
                    user = user,
                    panel = if (isOps) CommandPanelFilter.OPS else CommandPanelFilter.ALL,
                    extraWidgets = buildExecutiveDynamicWidgets(state.executive),
                    onOpenModule = onOpenModule,
                    title = "Centro de comando",
                )
            }
        }

        // ── Acciones rápidas ─────────────────────────────────────────────────
        if (onOpenModule != null) {
            val actPending = state.activities.count {
                val s = it.estatus.lowercase()
                s.contains("pendiente") || s.contains("proceso") || s.contains("asignad")
            }
            val viaticPending = state.viatics.count { (it.estatusPago ?: "").lowercase().contains("pendiente") }
            val quickActions = buildList {
                add(QuickAction("activities", "🗂️", "Actividades", BlueColor, actPending.takeIf { it > 0 }))
                add(QuickAction("evidences", "📸", "Evidencias", Color(0xFF8B5CF6), null))
                add(QuickAction("viatics", "✈️", "Viáticos", AmberColor, viaticPending.takeIf { it > 0 }))
                add(QuickAction("chat", "💬", "Chat", TealColor, null))
                add(QuickAction("approvals", "🛡️", "Aprobaciones", RedColor, state.approvals.size.takeIf { it > 0 }))
                add(QuickAction("gps", "📍", "GPS", GreenColor, null))
            }
            item {
                NxSectionHeader(title = "Acciones rápidas", subtitle = "Operación diaria")
                Spacer(Modifier.height(8.dp))
                Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    quickActions.chunked(3).forEach { row ->
                        Row(
                            horizontalArrangement = Arrangement.spacedBy(8.dp),
                            modifier = Modifier.fillMaxWidth(),
                        ) {
                            row.forEach { action ->
                                ConsoleQuickActionCard(
                                    modifier = Modifier.weight(1f),
                                    icon = action.icon,
                                    label = action.label,
                                    accent = action.accent,
                                    badge = action.badge,
                                    onClick = { onOpenModule(action.key) },
                                )
                            }
                            repeat(3 - row.size) { Spacer(Modifier.weight(1f)) }
                        }
                    }
                }
            }
        }

        // ── Alertas operativas accionables ───────────────────────────────────
        run {
            val actPending = state.activities.count {
                val s = it.estatus.lowercase()
                s.contains("pendiente") || s.contains("proceso") || s.contains("asignad")
            }
            val viaticPending = state.viatics.count { (it.estatusPago ?: "").lowercase().contains("pendiente") }
            val alerts = buildList {
                if (state.approvals.isNotEmpty()) {
                    add(
                        NxAlert(
                            id = "approvals",
                            title = "${state.approvals.size} aprobaciones esperando decisión",
                            subtitle = "Retrasan pagos, viáticos y liberaciones",
                            tone = NxTone.Danger,
                            actionLabel = if (onOpenModule != null) "Ver" else null,
                            onAction = onOpenModule?.let { { it("approvals") } },
                        ),
                    )
                }
                if (viaticPending > 0) {
                    add(
                        NxAlert(
                            id = "viatics",
                            title = "$viaticPending viáticos sin liquidar",
                            subtitle = "Impacta flujo de caja y campo",
                            tone = NxTone.Warning,
                            actionLabel = if (onOpenModule != null) "Abrir" else null,
                            onAction = onOpenModule?.let { { it("viatics") } },
                        ),
                    )
                }
                if (actPending > 0 && !isAdministrativo) {
                    add(
                        NxAlert(
                            id = "activities",
                            title = "$actPending actividades en curso / pendientes",
                            subtitle = "Prioriza backlog de campo",
                            tone = NxTone.Info,
                            actionLabel = if (onOpenModule != null) "Ir" else null,
                            onAction = onOpenModule?.let { { it("activities") } },
                        ),
                    )
                }
                if (isOps && nocAlerts.isNotEmpty()) {
                    add(
                        NxAlert(
                            id = "noc",
                            title = "${nocAlerts.size} alertas NOC activas",
                            subtitle = "Monitoreo de servicio",
                            tone = NxTone.Danger,
                            actionLabel = if (onOpenModule != null) "NOC" else null,
                            onAction = onOpenModule?.let { { it("noc") } },
                        ),
                    )
                }
            }
            if (alerts.isNotEmpty()) {
                item {
                    NxSectionHeader(title = "Alertas", subtitle = "${alerts.size} requieren atención")
                    Spacer(Modifier.height(8.dp))
                    Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                        alerts.forEach { NxAlertBanner(it) }
                    }
                }
            }
        }

        // ── Executive KPIs (admins + administrativo con datos ejecutivos) ───
        val exec = state.executive
        val hasExecutiveData = exec.raw.isNotEmpty() ||
            exec.headline.revenueMtd > 0 ||
            exec.operations.otOpen > 0 ||
            exec.finance.invoicedMtd > 0
        if (hasExecutiveData && (isAdministrativo || user?.isSuperAdmin == true || user?.permissions?.contains("console.admin") == true)) {
            item {
                NxSectionHeader(title = "Resumen ejecutivo", subtitle = "Este período")
            }
            item {
                val headline = exec.headline
                val ops = exec.operations
                Row(horizontalArrangement = Arrangement.spacedBy(10.dp), modifier = Modifier.fillMaxWidth()) {
                    KpiCard(modifier = Modifier.weight(1f), title = "Ingresos MTD", value = formatMxn(headline.revenueMtd), subtitle = "Acumulado", bgColor = GreenLight, accentColor = GreenColor, icon = "💰")
                    KpiCard(modifier = Modifier.weight(1f), title = "Pipeline", value = formatMxn(headline.pipelineValue), subtitle = "Ventas", bgColor = BlueLight, accentColor = BlueColor, icon = "📈")
                }
                Spacer(Modifier.height(10.dp))
                Row(horizontalArrangement = Arrangement.spacedBy(10.dp), modifier = Modifier.fillMaxWidth()) {
                    KpiCard(modifier = Modifier.weight(1f), title = "OT abiertas", value = ops.otOpen.toString(), subtitle = "${ops.otOverdue} vencidas", bgColor = AmberLight, accentColor = AmberColor, icon = "🔧")
                    KpiCard(modifier = Modifier.weight(1f), title = "Tickets", value = ops.ticketsOpen.toString(), subtitle = "Abiertos", bgColor = TealLight, accentColor = TealColor, icon = "🎫")
                }
            }
        }

        // ── Aprobaciones pendientes ──────────────────────────────────────────
        if (state.approvals.isNotEmpty()) {
            item { NxSectionHeader(title = "Aprobaciones pendientes", subtitle = "${state.approvals.size} esperando") }
            item {
                LazyRow(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                    items(state.approvals.take(8), key = { it.rowKey }) { a ->
                        val id = a.id
                        val title = a.displayTitle
                        val who = a.requestedByName
                        val urgency = a.urgencyLabel
                        val uColor  = when (urgency.lowercase()) {
                            "alta","high" -> RedColor; "media","medium" -> AmberColor; else -> BlueColor
                        }
                        Card(modifier = Modifier.width(220.dp), shape = RoundedCornerShape(14.dp),
                            colors = CardDefaults.cardColors(containerColor = Color.White),
                            elevation = CardDefaults.cardElevation(2.dp)) {
                            Column(Modifier.padding(14.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                                Row(horizontalArrangement = Arrangement.SpaceBetween, modifier = Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
                                    Text("🛡️", fontSize = 20.sp)
                                    Box(Modifier.clip(RoundedCornerShape(6.dp)).background(uColor.copy(0.12f)).padding(horizontal=6.dp,vertical=2.dp)) {
                                        Text(urgency, fontSize = 10.sp, fontWeight = FontWeight.Bold, color = uColor)
                                    }
                                }
                                Text(title.take(50), style = MaterialTheme.typography.bodySmall.copy(fontWeight = FontWeight.SemiBold), color = SlateText, maxLines = 2)
                                if (who.isNotBlank()) Text("Por: $who", fontSize = 10.sp, color = SubText, maxLines = 1)
                                if (id > 0) {
                                    Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                                        Button(
                                            onClick = { vm.decideApproval(id, true) },
                                            modifier = Modifier.weight(1f),
                                            contentPadding = PaddingValues(horizontal = 8.dp, vertical = 4.dp),
                                        ) { Text("✓", fontSize = 12.sp) }
                                        OutlinedButton(
                                            onClick = { vm.decideApproval(id, false) },
                                            modifier = Modifier.weight(1f),
                                            contentPadding = PaddingValues(horizontal = 8.dp, vertical = 4.dp),
                                        ) { Text("✕", fontSize = 12.sp) }
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }

        // ── Atajos administrativo (módulos back-office) ─────────────────────
        if (isAdministrativo && onOpenModule != null) {
            item { NxSectionHeader(title = "Atajos", subtitle = "Acceso rápido") }
            item {
                val shortcuts = listOf(
                    Triple("approvals", "🛡️", "Aprobaciones"),
                    Triple("documents", "📂", "Documentos"),
                    Triple("viatics", "✈️", "Viáticos"),
                    Triple("expenses", "💳", "Gastos"),
                    Triple("calendar", "📅", "Calendario"),
                    Triple("companies", "🏛️", "Empresas"),
                )
                Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    shortcuts.chunked(2).forEach { row ->
                        Row(horizontalArrangement = Arrangement.spacedBy(8.dp), modifier = Modifier.fillMaxWidth()) {
                            row.forEach { (key, icon, label) ->
                                Card(
                                    onClick = { onOpenModule(key) },
                                    modifier = Modifier.weight(1f),
                                    shape = RoundedCornerShape(NxDimens.PanelRadius),
                                    colors = CardDefaults.cardColors(containerColor = Color.White),
                                    elevation = CardDefaults.cardElevation(2.dp),
                                ) {
                                    Column(Modifier.padding(12.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                                        Text(icon, fontSize = 22.sp)
                                        Text(label, style = MaterialTheme.typography.labelLarge.copy(fontWeight = FontWeight.SemiBold))
                                    }
                                }
                            }
                            if (row.size == 1) Spacer(Modifier.weight(1f))
                        }
                    }
                }
            }
        }

        // ── KPI Row (operaciones — oculto para administrativo) ──────────────
        if (!isAdministrativo) {
        item {
            val actTotal = state.activities.size
            val actPending = state.activities.count {
                val s = it.estatus.lowercase()
                s.contains("pendiente") || s.contains("proceso") || s.contains("asignad")
            }
            val actDone = state.activities.count { it.estatus.lowercase().contains("finaliz") || it.estatus.lowercase().contains("complet") }
            val viaticAmount = state.viatics.sumOf { it.montoSolicitado ?: 0.0 }
            val viaticPending = state.viatics.count { (it.estatusPago ?: "").lowercase().contains("pendiente") }
            val attendMinutes = state.attendance?.totalMinutesAll ?: 0
            val attendHours = String.format("%.1f", attendMinutes / 60.0)
            val attendUsers = state.attendance?.totalUsers ?: 0
            val completionRate = if (actTotal > 0) (actDone * 100 / actTotal) else 0
            val sparkActs = sparklineFromCounts(
                listOf(
                    (actTotal * 0.4).toInt(),
                    (actTotal * 0.55).toInt(),
                    (actTotal * 0.7).toInt(),
                    (actTotal * 0.85).toInt(),
                    actPending,
                    actDone,
                    actTotal,
                ),
            )

            NxSectionHeader(title = "Operación de la semana", subtitle = "KPIs + tendencia")
            Spacer(Modifier.height(8.dp))
            NxKpiGrid(
                items = listOf(
                    NxKpi(
                        label = "Actividades",
                        value = actTotal.toString(),
                        hint = "$actPending pendientes · $actDone hechas",
                        delta = "$completionRate% cierre",
                        tone = NxTone.Brand,
                        sparkline = sparkActs,
                    ),
                    NxKpi(
                        label = "Viáticos",
                        value = formatMxn(viaticAmount),
                        hint = "$viaticPending por aprobar",
                        delta = "${state.viatics.size} solicitudes",
                        tone = if (viaticPending > 0) NxTone.Warning else NxTone.Info,
                    ),
                    NxKpi(
                        label = "Horas campo",
                        value = "${attendHours}h",
                        hint = "$attendUsers usuarios activos",
                        tone = NxTone.Success,
                    ),
                    NxKpi(
                        label = "Aprobaciones",
                        value = state.approvals.size.toString(),
                        hint = "Cola de workflow",
                        delta = if (state.approvals.isEmpty()) "Al día" else "Requieren acción",
                        tone = if (state.approvals.isEmpty()) NxTone.Success else NxTone.Danger,
                    ),
                ),
            )
        }
        }

        // ── Estado de actividades ────────────────────────────────────────────
        if (!isAdministrativo && state.activities.isNotEmpty()) {
            item {
                NxSectionHeader(title = "Estado de actividades", subtitle = "${state.activities.size} total")
            }
            item {
                val statusGroups = state.activities
                    .groupBy { it.estatus.ifBlank { "Sin estatus" } }
                    .entries.sortedByDescending { it.value.size }

                NxPanelShell(contentPadding = PaddingValues(16.dp)) {
                        statusGroups.forEach { (status, list) ->
                            val pct = if (state.activities.isNotEmpty()) list.size.toFloat() / state.activities.size else 0f
                            val barColor = statusColor(status)
                            Column {
                                Row(
                                    modifier = Modifier.fillMaxWidth(),
                                    horizontalArrangement = Arrangement.SpaceBetween,
                                ) {
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
                                        .background(Color(0xFFF1F5F9))
                                ) {
                                    Box(
                                        modifier = Modifier
                                            .fillMaxWidth(pct.coerceIn(0f, 1f))
                                            .height(6.dp)
                                            .clip(RoundedCornerShape(3.dp))
                                            .background(barColor)
                                    )
                                }
                            }
                        }
                    }
            }
        }

        // ── Actividades recientes ────────────────────────────────────────────
        if (!isAdministrativo) {
        item {
            NxSectionHeader(title = "Actividades recientes", subtitle = "Últimas 8")
        }
        items(state.activities.take(8), key = { it.id }) { a ->
            ActivityCard(a)
        }

        // ── Viáticos recientes ───────────────────────────────────────────────
        if (state.viatics.isNotEmpty()) {
            item {
                NxSectionHeader(title = "Viáticos recientes", subtitle = "${state.viatics.size} registros")
            }
            item {
                LazyRow(
                    horizontalArrangement = Arrangement.spacedBy(10.dp),
                    modifier = Modifier.fillMaxWidth(),
                ) {
                    items(state.viatics.take(10), key = { it.id }) { v ->
                        ViaticCard(v)
                    }
                }
            }
        }

        // ── Asistencia semanal ───────────────────────────────────────────────
        state.attendance?.users?.takeIf { it.isNotEmpty() }?.let { attendUsers ->
            item {
                NxSectionHeader(
                    title = "Asistencia semanal",
                    subtitle = "${attendUsers.size} usuarios",
                )
            }
            items(
                attendUsers.sortedByDescending { it.totalMinutes ?: 0 }.take(8),
                key = { it.userId },
            ) { u ->
                NxPanelShell {
                    Row(
                        horizontalArrangement = Arrangement.SpaceBetween,
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        Column(modifier = Modifier.weight(1f)) {
                            Text(
                                u.userName ?: "Usuario ${u.userId}",
                                style = MaterialTheme.typography.bodyMedium.copy(fontWeight = FontWeight.SemiBold),
                                color = SlateText,
                            )
                            Text(
                                "${u.days?.size ?: 0} días registrados",
                                style = MaterialTheme.typography.bodySmall,
                                color = SubText,
                            )
                        }
                        Box(
                            modifier = Modifier
                                .clip(RoundedCornerShape(8.dp))
                                .background(TealLight)
                                .padding(horizontal = 12.dp, vertical = 6.dp),
                        ) {
                            val hrs = String.format("%.1f", (u.totalMinutes ?: 0) / 60.0)
                            Text("${hrs}h", style = MaterialTheme.typography.labelLarge.copy(fontWeight = FontWeight.Bold), color = TealColor)
                        }
                    }
                }
            }
        }
        }

        // ── OPS: NOC Alerts ────────────────────────────────────────────────
        if (isOps && nocAlerts.isNotEmpty()) {
            item { NxSectionHeader("Alertas NOC", "${nocAlerts.size} activas") }
            items(nocAlerts.take(5), key = { it.rowKey }) { alert ->
                val severity = alert.severity.lowercase()
                val alertColor = when {
                    alert.isCritical -> Color(0xFFEF4444)
                    alert.isWarningBand -> Color(0xFFF59E0B)
                    else -> Color(0xFF3B82F6)
                }
                val device = alert.deviceName.ifBlank { "Dispositivo" }
                val title = alert.displayTitle.ifBlank { alert.message.ifBlank { "Alerta" } }
                Card(
                    modifier = androidx.compose.ui.Modifier.fillMaxWidth(),
                    shape = RoundedCornerShape(NxDimens.PanelRadius),
                    colors = CardDefaults.cardColors(containerColor = alertColor.copy(alpha = 0.08f)),
                    elevation = CardDefaults.cardElevation(0.dp),
                ) {
                    Row(
                        modifier = androidx.compose.ui.Modifier.padding(14.dp),
                        horizontalArrangement = Arrangement.spacedBy(12.dp),
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        Text(if (severity == "critical") "🔴" else if (severity == "warning") "🟡" else "🔵", fontSize = 20.sp)
                        Column(androidx.compose.ui.Modifier.weight(1f)) {
                            Text(title, style = MaterialTheme.typography.bodyMedium.copy(fontWeight = FontWeight.SemiBold), color = alertColor)
                            Text(device, style = MaterialTheme.typography.bodySmall, color = Color(0xFF64748B))
                        }
                    }
                }
            }
        }

        item { Spacer(Modifier.height(24.dp)) }
    }
}

private data class QuickAction(
    val key: String,
    val icon: String,
    val label: String,
    val accent: Color,
    val badge: Int?,
)

@Composable
private fun ConsoleQuickActionCard(
    modifier: Modifier,
    icon: String,
    label: String,
    accent: Color,
    badge: Int? = null,
    onClick: () -> Unit,
) {
    Card(
        onClick = onClick,
        modifier = modifier
            .heightIn(min = 48.dp)
            .semantics {
                contentDescription = if (badge != null && badge > 0) {
                    "$label, $badge pendientes"
                } else {
                    label
                }
                role = Role.Button
            },
        shape = RoundedCornerShape(NxDimens.PanelRadius),
        colors = CardDefaults.cardColors(containerColor = accent.copy(alpha = 0.12f)),
        elevation = CardDefaults.cardElevation(0.dp),
    ) {
        Box(modifier = Modifier.fillMaxWidth()) {
            Column(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(vertical = 12.dp, horizontal = 8.dp),
                horizontalAlignment = Alignment.CenterHorizontally,
                verticalArrangement = Arrangement.spacedBy(4.dp),
            ) {
                Text(icon, fontSize = 22.sp)
                Text(
                    label,
                    style = MaterialTheme.typography.labelSmall.copy(fontWeight = FontWeight.SemiBold),
                    color = accent,
                    maxLines = 1,
                )
            }
            if (badge != null && badge > 0) {
                Box(
                    modifier = Modifier
                        .align(Alignment.TopEnd)
                        .padding(6.dp)
                        .size(18.dp)
                        .clip(RoundedCornerShape(9.dp))
                        .background(RedColor),
                    contentAlignment = Alignment.Center,
                ) {
                    Text(
                        if (badge > 9) "9+" else badge.toString(),
                        fontSize = 9.sp,
                        fontWeight = FontWeight.Bold,
                        color = Color.White,
                    )
                }
            }
        }
    }
}

@Composable
private fun KpiCard(
    modifier: Modifier = Modifier,
    title: String,
    value: String,
    subtitle: String,
    bgColor: Color,
    accentColor: Color,
    icon: String,
) {
    Card(
        modifier = modifier,
        shape = RoundedCornerShape(NxDimens.PanelRadius),
        colors = CardDefaults.cardColors(containerColor = bgColor),
        elevation = CardDefaults.cardElevation(0.dp),
    ) {
        Column(modifier = Modifier.padding(14.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                Text(icon, fontSize = 18.sp)
                Text(
                    title,
                    style = MaterialTheme.typography.labelMedium,
                    color = accentColor,
                )
            }
            Spacer(Modifier.height(8.dp))
            Text(
                value,
                style = MaterialTheme.typography.headlineSmall.copy(fontWeight = FontWeight.Bold),
                color = SlateText,
            )
            Spacer(Modifier.height(4.dp))
            Text(subtitle, style = MaterialTheme.typography.bodySmall, color = SubText)
        }
    }
}

@Composable
private fun ActivityCard(a: ActivityDto) {
    val statusColor = statusColor(a.estatus)
    NxPanelShell {
        Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
            Box(
                modifier = Modifier
                    .size(42.dp)
                    .clip(RoundedCornerShape(10.dp))
                    .background(statusColor.copy(alpha = 0.12f)),
                contentAlignment = Alignment.Center,
            ) {
                Text("🗂️", fontSize = 20.sp)
            }
            Column(modifier = Modifier.weight(1f)) {
                Text(
                    a.titulo?.takeIf { it.isNotBlank() } ?: "Actividad #${a.id}",
                    style = MaterialTheme.typography.bodyMedium.copy(fontWeight = FontWeight.SemiBold),
                    color = SlateText,
                )
                Spacer(Modifier.height(2.dp))
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalAlignment = Alignment.CenterVertically) {
                    StatusBadge(a.estatus, statusColor)
                    if (!a.responsable?.nombre.isNullOrBlank()) {
                        Text(
                            "• ${a.responsable!!.nombre}",
                            style = MaterialTheme.typography.bodySmall,
                            color = SubText,
                        )
                    }
                }
            }
        }
    }
}

@Composable
private fun StatusBadge(status: String, color: Color) {
    Box(
        modifier = Modifier
            .clip(RoundedCornerShape(6.dp))
            .background(color.copy(alpha = 0.15f))
            .padding(horizontal = 8.dp, vertical = 3.dp),
    ) {
        Text(
            status.ifBlank { "–" },
            style = MaterialTheme.typography.labelSmall.copy(fontWeight = FontWeight.SemiBold),
            color = color,
        )
    }
}

@Composable
private fun ViaticCard(v: ViaticDto) {
    val statusColor = if ((v.estatusPago ?: "").lowercase().contains("aprobad")) GreenColor
    else if ((v.estatusPago ?: "").lowercase().contains("pendiente")) AmberColor
    else SubText

    Card(
        modifier = Modifier.width(180.dp),
        shape = RoundedCornerShape(NxDimens.PanelRadius),
        colors = CardDefaults.cardColors(containerColor = Color.White),
        elevation = CardDefaults.cardElevation(2.dp),
    ) {
        Column(modifier = Modifier.padding(14.dp)) {
            Text("💼", fontSize = 22.sp)
            Spacer(Modifier.height(6.dp))
            Text(
                formatMxn(v.montoSolicitado ?: 0.0),
                style = MaterialTheme.typography.titleMedium.copy(fontWeight = FontWeight.Bold),
                color = SlateText,
            )
            Spacer(Modifier.height(4.dp))
            Text(
                v.razonGasto?.takeIf { it.isNotBlank() } ?: "Sin descripción",
                style = MaterialTheme.typography.bodySmall,
                color = SubText,
                maxLines = 2,
            )
            Spacer(Modifier.height(8.dp))
            StatusBadge(v.estatusPago ?: "–", statusColor)
        }
    }
}

private fun statusColor(status: String): Color {
    val s = status.lowercase()
    return when {
        s.contains("finaliz") || s.contains("complet") -> GreenColor
        s.contains("proceso") || s.contains("progreso") -> BlueColor
        s.contains("pendiente") || s.contains("asignad") -> AmberColor
        s.contains("cancelad") || s.contains("rechazad") -> RedColor
        else -> Color(0xFF8B5CF6)
    }
}

private fun formatMxn(amount: Double): String {
    val rounded = kotlin.math.round(amount).toLong()
    return "$%,d".format(rounded)
}
