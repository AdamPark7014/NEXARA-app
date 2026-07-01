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
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
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
import mx.nexara.mobile.nativeapp.data.api.ViaticDto
import mx.nexara.mobile.nativeapp.data.console.ConsoleRepository
import mx.nexara.mobile.nativeapp.data.extra.ExtraRepository
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
    val executive: Map<String, Any?> = emptyMap(),
    val approvals: List<Map<String, Any?>> = emptyList(),
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

    fun refresh() {
        val (from, to) = currentWeekRange()
        _state.update { it.copy(isLoading = true, error = null, weekFrom = from, weekTo = to) }
        viewModelScope.launch {
            try {
                val viatics    = withContext(Dispatchers.IO) { repo.viaticsFetch() }
                val activities = withContext(Dispatchers.IO) { repo.activitiesFetch() }
                val attendance = withContext(Dispatchers.IO) { runCatching { repo.attendanceRange(from, to) }.getOrNull() }
                val executive  = withContext(Dispatchers.IO) { runCatching { extraRepo.executiveCLevel() }.getOrElse { emptyMap() } }
                val approvals  = withContext(Dispatchers.IO) { runCatching { extraRepo.workflowPending() }.getOrElse { emptyList() } }
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

@Composable
fun ConsoleDashboardScreen(
    contentPadding: PaddingValues = PaddingValues(16.dp),
    isOps: Boolean = false,
) {
    val vm: ConsoleDashboardViewModel = viewModel()
    val state by vm.state.collectAsState()
    val context = LocalContext.current
    val user = remember { AuthRepository(context).loadSession() }
    var nocAlerts by remember { mutableStateOf<List<Map<String, Any?>>>(emptyList()) }

    if (isOps) {
        val extraRepo = remember { ExtraRepository(context) }
        androidx.compose.runtime.LaunchedEffect(Unit) {
            nocAlerts = withContext(Dispatchers.IO) { extraRepo.nocAlerts() }
        }
    }

    if (state.activities.isEmpty() && state.isLoading && state.error == null) {
        vm.refresh()
    }

    LazyColumn(
        modifier = Modifier
            .fillMaxSize()
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
            item {
                Text("Cargando dashboard...", color = SubText, modifier = Modifier.padding(top = 16.dp))
            }
            return@LazyColumn
        }

        if (!state.error.isNullOrBlank()) {
            item {
                Text(state.error!!, color = MaterialTheme.colorScheme.error)
                Spacer(Modifier.height(8.dp))
                Button(onClick = { vm.refresh() }) { Text("Reintentar") }
            }
            return@LazyColumn
        }

        // ── Executive KPIs (solo admins/finance) ────────────────────────────
        if (state.executive.isNotEmpty()) {
            item {
                SectionHeader(title = "Resumen ejecutivo", subtitle = "Este período")
            }
            item {
                val revenue  = execDbl(state.executive, "revenue", "totalRevenue", "ingresos")
                val projects = execInt(state.executive, "activeProjects", "proyectosActivos")
                val engineers = execInt(state.executive, "activeEngineers", "ingenieros", "activeUsers")
                val clients  = execInt(state.executive, "activeClients", "clientesActivos", "clients")
                Row(horizontalArrangement = Arrangement.spacedBy(10.dp), modifier = Modifier.fillMaxWidth()) {
                    KpiCard(modifier = Modifier.weight(1f), title = "Ingresos", value = revenue?.let { formatMxn(it) } ?: "—", subtitle = "Acumulado", bgColor = GreenLight, accentColor = GreenColor, icon = "💰")
                    KpiCard(modifier = Modifier.weight(1f), title = "Proyectos", value = projects?.toString() ?: "—", subtitle = "Activos", bgColor = BlueLight, accentColor = BlueColor, icon = "🧩")
                }
                Spacer(Modifier.height(10.dp))
                Row(horizontalArrangement = Arrangement.spacedBy(10.dp), modifier = Modifier.fillMaxWidth()) {
                    KpiCard(modifier = Modifier.weight(1f), title = "Ingenieros", value = engineers?.toString() ?: "—", subtitle = "En campo", bgColor = AmberLight, accentColor = AmberColor, icon = "👷")
                    KpiCard(modifier = Modifier.weight(1f), title = "Clientes", value = clients?.toString() ?: "—", subtitle = "Activos", bgColor = TealLight, accentColor = TealColor, icon = "🤝")
                }
            }
        }

        // ── Aprobaciones pendientes ──────────────────────────────────────────
        if (state.approvals.isNotEmpty()) {
            item { SectionHeader(title = "Aprobaciones pendientes", subtitle = "${state.approvals.size} esperando") }
            item {
                LazyRow(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                    items(state.approvals.take(8)) { a ->
                        val title   = (a["title"] ?: a["stepName"] ?: a["entityType"])?.toString() ?: "Aprobación"
                        val who     = (a["requestedBy"] ?: a["userName"] ?: a["solicita"])?.toString() ?: ""
                        val urgency = (a["urgencia"] ?: a["priority"] ?: "normal").toString()
                        val uColor  = when (urgency.lowercase()) {
                            "alta","high" -> RedColor; "media","medium" -> AmberColor; else -> BlueColor
                        }
                        Card(modifier = Modifier.width(185.dp), shape = RoundedCornerShape(14.dp),
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
                            }
                        }
                    }
                }
            }
        }

        // ── KPI Row ──────────────────────────────────────────────────────────
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

            Row(horizontalArrangement = Arrangement.spacedBy(10.dp), modifier = Modifier.fillMaxWidth()) {
                KpiCard(
                    modifier = Modifier.weight(1f),
                    title = "Actividades",
                    value = actTotal.toString(),
                    subtitle = "$actPending pendientes · $actDone finalizadas",
                    bgColor = TealLight,
                    accentColor = TealColor,
                    icon = "🗂️",
                )
                KpiCard(
                    modifier = Modifier.weight(1f),
                    title = "Viáticos",
                    value = formatMxn(viaticAmount),
                    subtitle = "$viaticPending por aprobar",
                    bgColor = BlueLight,
                    accentColor = BlueColor,
                    icon = "💼",
                )
            }
            Spacer(Modifier.height(10.dp))
            Row(horizontalArrangement = Arrangement.spacedBy(10.dp), modifier = Modifier.fillMaxWidth()) {
                KpiCard(
                    modifier = Modifier.weight(1f),
                    title = "Horas esta semana",
                    value = "${attendHours}h",
                    subtitle = "$attendUsers usuarios",
                    bgColor = GreenLight,
                    accentColor = GreenColor,
                    icon = "🕒",
                )
                KpiCard(
                    modifier = Modifier.weight(1f),
                    title = "Total viáticos",
                    value = state.viatics.size.toString(),
                    subtitle = "${state.viatics.count { (it.estatusPago ?: "").lowercase().contains("aprobad") }} aprobados",
                    bgColor = AmberLight,
                    accentColor = AmberColor,
                    icon = "✅",
                )
            }
        }

        // ── Estado de actividades ────────────────────────────────────────────
        if (state.activities.isNotEmpty()) {
            item {
                SectionHeader(title = "Estado de actividades", subtitle = "${state.activities.size} total")
            }
            item {
                val statusGroups = state.activities
                    .groupBy { it.estatus.ifBlank { "Sin estatus" } }
                    .entries.sortedByDescending { it.value.size }

                Card(
                    modifier = Modifier.fillMaxWidth(),
                    shape = RoundedCornerShape(16.dp),
                    colors = CardDefaults.cardColors(containerColor = Color.White),
                    elevation = CardDefaults.cardElevation(2.dp),
                ) {
                    Column(modifier = Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
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
        }

        // ── Actividades recientes ────────────────────────────────────────────
        item {
            SectionHeader(title = "Actividades recientes", subtitle = "Últimas 8")
        }
        items(state.activities.take(8)) { a ->
            ActivityCard(a)
        }

        // ── Viáticos recientes ───────────────────────────────────────────────
        if (state.viatics.isNotEmpty()) {
            item {
                SectionHeader(title = "Viáticos recientes", subtitle = "${state.viatics.size} registros")
            }
            item {
                LazyRow(
                    horizontalArrangement = Arrangement.spacedBy(10.dp),
                    modifier = Modifier.fillMaxWidth(),
                ) {
                    items(state.viatics.take(10)) { v ->
                        ViaticCard(v)
                    }
                }
            }
        }

        // ── Asistencia semanal ───────────────────────────────────────────────
        state.attendance?.users?.takeIf { it.isNotEmpty() }?.let { attendUsers ->
            item {
                SectionHeader(
                    title = "Asistencia semanal",
                    subtitle = "${attendUsers.size} usuarios",
                )
            }
            items(attendUsers.sortedByDescending { it.totalMinutes ?: 0 }.take(8)) { u ->
                Card(
                    modifier = Modifier.fillMaxWidth(),
                    shape = RoundedCornerShape(14.dp),
                    colors = CardDefaults.cardColors(containerColor = Color.White),
                    elevation = CardDefaults.cardElevation(2.dp),
                ) {
                    Row(
                        modifier = Modifier.padding(14.dp),
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

        // ── OPS: NOC Alerts ────────────────────────────────────────────────
        if (isOps && nocAlerts.isNotEmpty()) {
            item { SectionHeader("Alertas NOC", "${nocAlerts.size} activas") }
            items(nocAlerts.take(5), key = { it["id"]?.toString() ?: it.hashCode().toString() }) { alert ->
                val severity = (alert["severity"] as? String ?: "info").lowercase()
                val alertColor = when (severity) { "critical" -> Color(0xFFEF4444); "warning" -> Color(0xFFF59E0B); else -> Color(0xFF3B82F6) }
                val device = alert["deviceName"] as? String ?: "Dispositivo"
                val title = alert["title"] as? String ?: alert["message"] as? String ?: "Alerta"
                Card(
                    modifier = androidx.compose.ui.Modifier.fillMaxWidth(),
                    shape = RoundedCornerShape(14.dp),
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
        shape = RoundedCornerShape(16.dp),
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
private fun SectionHeader(title: String, subtitle: String = "") {
    Row(
        modifier = Modifier.fillMaxWidth(),
        horizontalArrangement = Arrangement.SpaceBetween,
        verticalAlignment = Alignment.Bottom,
    ) {
        Text(
            title,
            style = MaterialTheme.typography.titleMedium.copy(fontWeight = FontWeight.Bold),
            color = SlateText,
        )
        if (subtitle.isNotBlank()) {
            Text(subtitle, style = MaterialTheme.typography.bodySmall, color = SubText)
        }
    }
}

@Composable
private fun ActivityCard(a: ActivityDto) {
    val statusColor = statusColor(a.estatus)
    Card(
        modifier = Modifier.fillMaxWidth(),
        shape = RoundedCornerShape(14.dp),
        colors = CardDefaults.cardColors(containerColor = Color.White),
        elevation = CardDefaults.cardElevation(2.dp),
    ) {
        Row(modifier = Modifier.padding(14.dp), horizontalArrangement = Arrangement.spacedBy(12.dp)) {
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
        shape = RoundedCornerShape(16.dp),
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

private fun execDbl(map: Map<String, Any?>, vararg keys: String): Double? {
    for (k in keys) {
        val v = map[k] ?: continue
        when (v) {
            is Double -> return v
            is Number -> return v.toDouble()
            is String -> v.toDoubleOrNull()?.let { return it }
        }
    }
    return null
}

private fun execInt(map: Map<String, Any?>, vararg keys: String): Int? {
    for (k in keys) {
        val v = map[k] ?: continue
        when (v) {
            is Int    -> return v
            is Number -> return v.toInt()
            is String -> v.toIntOrNull()?.let { return it }
        }
    }
    return null
}

