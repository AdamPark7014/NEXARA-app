package mx.nexara.mobile.nativeapp.ui.console.screens

import android.app.Application
import android.content.Context
import android.content.Intent
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.*
import androidx.compose.material3.pulltorefresh.PullToRefreshBox
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.core.content.FileProvider
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
import mx.nexara.mobile.nativeapp.data.api.AttendanceCurrentDto
import mx.nexara.mobile.nativeapp.data.api.AttendanceRangeDto
import mx.nexara.mobile.nativeapp.data.api.AttendanceRangeUserDto
import mx.nexara.mobile.nativeapp.data.console.ConsoleRepository
import mx.nexara.mobile.nativeapp.ui.console.util.currentMonthRange
import mx.nexara.mobile.nativeapp.ui.console.util.currentWeekRange
import mx.nexara.mobile.nativeapp.ui.console.util.lastWeekRange
import mx.nexara.mobile.nativeapp.ui.enterprise.NxEmptyState
import mx.nexara.mobile.nativeapp.ui.enterprise.NxLoadingBlock
import java.io.File

// ── State ────────────────────────────────────────────────────────────────────

private val ATTENDANCE_RANGE_PRESETS = listOf(
    "week" to "Esta semana",
    "lastWeek" to "Semana pasada",
    "month" to "Este mes",
)

data class AttendanceUiState(
    val isLoading: Boolean = true,
    val isRefreshing: Boolean = false,
    val error: String? = null,
    val checkInLoading: Boolean = false,
    val checkInMessage: String? = null,
    val exportMessage: String? = null,
    val rangePreset: String = "week",
    val userQuery: String = "",
    val from: String = currentWeekRange().from,
    val to: String = currentWeekRange().to,
    val current: AttendanceCurrentDto? = null,
    val payload: AttendanceRangeDto? = null,
)

// ── ViewModel ────────────────────────────────────────────────────────────────

class ConsoleAttendanceViewModel(app: Application) : AndroidViewModel(app) {
    private val repo = ConsoleRepository(app.applicationContext)
    private val _state = MutableStateFlow(AttendanceUiState())
    val state: StateFlow<AttendanceUiState> = _state

    fun setRangePreset(preset: String) {
        val range = when (preset) {
            "lastWeek" -> lastWeekRange()
            "month" -> currentMonthRange()
            else -> currentWeekRange()
        }
        _state.update { it.copy(rangePreset = preset, from = range.from, to = range.to) }
        refresh(initial = true)
    }

    fun setUserQuery(value: String) = _state.update { it.copy(userQuery = value) }

    fun refresh(initial: Boolean = true) {
        val snapshot = _state.value
        _state.update {
            it.copy(
                isLoading = initial && it.payload == null,
                isRefreshing = !initial,
                error = null,
            )
        }
        viewModelScope.launch {
            try {
                val current = withContext(Dispatchers.IO) {
                    runCatching { repo.attendanceCurrent() }.getOrNull()
                }
                val range = withContext(Dispatchers.IO) {
                    repo.attendanceRange(from = snapshot.from, to = snapshot.to, tryHierarchyFirst = true)
                }
                _state.update {
                    it.copy(isLoading = false, isRefreshing = false, current = current, payload = range, error = null)
                }
            } catch (e: Exception) {
                _state.update {
                    it.copy(
                        isLoading = false,
                        isRefreshing = false,
                        error = e.message?.takeIf { m -> m.isNotBlank() } ?: "No se pudo cargar asistencia",
                    )
                }
            }
        }
    }

    fun exportCsv(context: Context) {
        val users = _state.value.payload?.users.orEmpty()
        if (users.isEmpty()) {
            _state.update { it.copy(exportMessage = "Sin datos para exportar") }
            return
        }
        viewModelScope.launch {
            try {
                val snapshot = _state.value
                val csv = buildString {
                    appendLine("Usuario,Horas,Dias registrados")
                    users.forEach { u ->
                        val name = (u.userName ?: "Usuario ${u.userId}").replace("\"", "\"\"")
                        val hours = String.format("%.2f", (u.totalMinutes ?: 0) / 60.0)
                        appendLine("\"$name\",$hours,${u.days?.size ?: 0}")
                    }
                }
                val dir = File(context.cacheDir, "exports").apply { mkdirs() }
                val file = File(dir, "asistencia-${snapshot.from}-${snapshot.to}.csv")
                withContext(Dispatchers.IO) { file.writeText(csv) }
                shareCsv(context, file)
                _state.update { it.copy(exportMessage = "✅ CSV listo para compartir") }
            } catch (e: Exception) {
                _state.update { it.copy(exportMessage = "❌ ${e.message ?: "No se pudo exportar"}") }
            }
        }
    }

    fun clearExportMessage() = _state.update { it.copy(exportMessage = null) }

    fun checkIn(type: String) {
        _state.update { it.copy(checkInLoading = true, checkInMessage = null) }
        viewModelScope.launch {
            try {
                val coords = withContext(Dispatchers.IO) {
                    mx.nexara.mobile.nativeapp.util.DeviceLocation.current(getApplication())
                }
                val res = withContext(Dispatchers.IO) {
                    repo.attendanceCheckIn(type, lat = coords?.lat, lng = coords?.lng)
                }
                val base = res.message ?: if (type == "entrada") "✅ Entrada registrada" else "✅ Salida registrada"
                val geoHint = when {
                    coords == null -> " (sin GPS — activa ubicación)"
                    coords.accuracyM != null && coords.accuracyM > 100f ->
                        " · GPS ${"%.5f".format(coords.lat)}, ${"%.5f".format(coords.lng)} (±${coords.accuracyM.toInt()}m — baja precisión)"
                    coords.accuracyM != null ->
                        " · GPS ${"%.5f".format(coords.lat)}, ${"%.5f".format(coords.lng)} (±${coords.accuracyM.toInt()}m)"
                    else -> " · GPS ${"%.5f".format(coords.lat)}, ${"%.5f".format(coords.lng)}"
                }
                _state.update { it.copy(checkInLoading = false, checkInMessage = base + geoHint) }
                refresh(initial = false)
            } catch (e: Exception) {
                _state.update {
                    it.copy(
                        checkInLoading = false,
                        checkInMessage = "❌ ${e.message?.takeIf { m -> m.isNotBlank() } ?: "Error al registrar"}",
                    )
                }
            }
        }
    }

    fun clearMessage() = _state.update { it.copy(checkInMessage = null) }
}

// ── Color palette ─────────────────────────────────────────────────────────────

private val TealColor = Color(0xFF0D9488)
private val TealLight = Color(0xFFCCFBF1)
private val GreenColor = Color(0xFF10B981)
private val GreenLight = Color(0xFFD1FAE5)
private val BlueColor = Color(0xFF3B82F6)
private val BlueLight = Color(0xFFDBEAFE)
private val RedColor = Color(0xFFEF4444)
private val RedLight = Color(0xFFFEE2E2)
private val SlateText = Color(0xFF0F172A)
private val SubText = Color(0xFF64748B)

private fun shareCsv(context: Context, file: File) {
    val uri = FileProvider.getUriForFile(context, "${context.packageName}.fileprovider", file)
    val intent = Intent(Intent.ACTION_SEND).apply {
        type = "text/csv"
        putExtra(Intent.EXTRA_STREAM, uri)
        addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
    }
    context.startActivity(Intent.createChooser(intent, "Compartir asistencia"))
}

// ── Main composable ──────────────────────────────────────────────────────────

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ConsoleAttendanceScreen(
    contentPadding: PaddingValues = PaddingValues(16.dp),
) {
    val context = LocalContext.current
    val authRepo = remember(context) { AuthRepository(context) }
    val user = remember { authRepo.loadSession() }
    val isSuperAdmin = user?.isSuperAdmin == true
    val isAdmin = !isSuperAdmin && (user?.permissions ?: emptyList()).contains("console.admin")

    val vm: ConsoleAttendanceViewModel = viewModel()
    val state by vm.state.collectAsState()
    var selectedUser by remember { mutableStateOf<mx.nexara.mobile.nativeapp.data.api.AttendanceRangeUserDto?>(null) }

    if (state.payload == null && state.isLoading && state.error == null) vm.refresh(initial = true)

    val selUser = selectedUser
    if (selUser != null) {
        AttendanceUserDetail(selUser, onBack = { selectedUser = null })
        return
    }

    val current = state.current
    val isCheckedIn = current?.isOpen == true
    val userQuery = state.userQuery.trim().lowercase()
    val teamUsers = (state.payload?.users ?: emptyList())
        .filter { u ->
            if (userQuery.isBlank()) true
            else (u.userName ?: "Usuario ${u.userId}").lowercase().contains(userQuery)
        }
        .sortedByDescending { it.totalMinutes ?: 0 }

    PullToRefreshBox(
        isRefreshing = state.isRefreshing,
        onRefresh = { vm.refresh(initial = false) },
        modifier = Modifier.fillMaxSize(),
    ) {
    LazyColumn(
        modifier = Modifier.fillMaxSize().padding(contentPadding),
        verticalArrangement = Arrangement.spacedBy(16.dp),
    ) {
        item {
            Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                Text(
                    "Periodo: ${state.from} → ${state.to}",
                    style = MaterialTheme.typography.bodySmall,
                    color = SubText,
                )
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .horizontalScroll(rememberScrollState()),
                    horizontalArrangement = Arrangement.spacedBy(8.dp),
                ) {
                    ATTENDANCE_RANGE_PRESETS.forEach { (key, label) ->
                        val sel = state.rangePreset == key
                        Box(
                            modifier = Modifier
                                .clip(RoundedCornerShape(20.dp))
                                .background(if (sel) TealColor else Color(0xFFF1F5F9))
                                .clickable { vm.setRangePreset(key) }
                                .padding(horizontal = 14.dp, vertical = 7.dp),
                        ) {
                            Text(
                                label,
                                style = MaterialTheme.typography.labelMedium.copy(fontWeight = FontWeight.SemiBold),
                                color = if (sel) Color.White else Color(0xFF475569),
                            )
                        }
                    }
                }
                if (!state.exportMessage.isNullOrBlank()) {
                    Text(
                        state.exportMessage!!,
                        style = MaterialTheme.typography.bodySmall,
                        color = if (state.exportMessage!!.startsWith("✅")) GreenColor else RedColor,
                    )
                }
            }
        }

        if (state.isLoading) {
            item { NxLoadingBlock("Cargando asistencia…") }
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

        // ── Personal check-in (not superadmin) ──────────────────────────────
        if (!isSuperAdmin) {
            item {
                mx.nexara.mobile.nativeapp.ui.common.LocationPermissionBanner(
                    message = "La asistencia registra tu GPS al marcar entrada o salida.",
                    requestOnAppear = true,
                )
            }
            item {
                Card(
                    modifier = Modifier.fillMaxWidth(),
                    shape = RoundedCornerShape(20.dp),
                    colors = CardDefaults.cardColors(
                        containerColor = if (isCheckedIn) GreenLight else Color(0xFFF8FAFC),
                    ),
                    elevation = CardDefaults.cardElevation(2.dp),
                ) {
                    Column(
                        modifier = Modifier.padding(20.dp),
                        horizontalAlignment = Alignment.CenterHorizontally,
                    ) {
                        Text(
                            "MI REGISTRO DIARIO",
                            style = MaterialTheme.typography.labelSmall.copy(
                                fontWeight = FontWeight.Bold,
                                letterSpacing = 1.sp,
                            ),
                            color = SubText,
                        )
                        Spacer(Modifier.height(12.dp))

                        // Big status indicator
                        Box(
                            modifier = Modifier
                                .size(80.dp)
                                .clip(CircleShape)
                                .background(if (isCheckedIn) GreenColor else Color(0xFFE2E8F0)),
                            contentAlignment = Alignment.Center,
                        ) {
                            Text(
                                if (isCheckedIn) "🟢" else "⚫",
                                fontSize = 32.sp,
                            )
                        }
                        Spacer(Modifier.height(8.dp))
                        Text(
                            if (isCheckedIn) "Jornada en curso" else "Sin entrada registrada hoy",
                            style = MaterialTheme.typography.titleMedium.copy(fontWeight = FontWeight.SemiBold),
                            color = if (isCheckedIn) GreenColor else SlateText,
                        )

                        if (current != null) {
                            Spacer(Modifier.height(4.dp))
                            val mins = current.totalMinutes ?: 0
                            Text(
                                "${String.format("%.1f", mins / 60.0)}h acumuladas hoy",
                                style = MaterialTheme.typography.bodySmall,
                                color = SubText,
                            )
                        }

                        Spacer(Modifier.height(16.dp))

                        // Check-in / Check-out buttons
                        Row(
                            horizontalArrangement = Arrangement.spacedBy(12.dp),
                            modifier = Modifier.fillMaxWidth(),
                        ) {
                            if (!isCheckedIn) {
                                Button(
                                    onClick = { vm.checkIn("entrada") },
                                    enabled = !state.checkInLoading,
                                    modifier = Modifier.weight(1f).height(52.dp),
                                    colors = ButtonDefaults.buttonColors(containerColor = GreenColor),
                                    shape = RoundedCornerShape(12.dp),
                                ) {
                                    Text(
                                        if (state.checkInLoading) "Registrando..." else "▶  Registrar Entrada",
                                        fontWeight = FontWeight.Bold,
                                    )
                                }
                            } else {
                                Button(
                                    onClick = { vm.checkIn("salida") },
                                    enabled = !state.checkInLoading,
                                    modifier = Modifier.weight(1f).height(52.dp),
                                    colors = ButtonDefaults.buttonColors(containerColor = RedColor),
                                    shape = RoundedCornerShape(12.dp),
                                ) {
                                    Text(
                                        if (state.checkInLoading) "Registrando..." else "⏹  Registrar Salida",
                                        fontWeight = FontWeight.Bold,
                                    )
                                }
                            }
                        }

                        if (!state.checkInMessage.isNullOrBlank()) {
                            Spacer(Modifier.height(8.dp))
                            Text(
                                state.checkInMessage!!,
                                style = MaterialTheme.typography.bodySmall,
                                color = if (state.checkInMessage!!.startsWith("✅")) GreenColor else RedColor,
                                textAlign = TextAlign.Center,
                            )
                        }
                    }
                }
            }
        }

        // ── Team / All summary ───────────────────────────────────────────────
        if (isAdmin || isSuperAdmin) {
            val users = state.payload?.users ?: emptyList()
            item {
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Text(
                        if (isSuperAdmin) "Asistencia de todos los usuarios" else "Asistencia del equipo",
                        style = MaterialTheme.typography.titleMedium.copy(fontWeight = FontWeight.Bold),
                        color = SlateText,
                    )
                    Text("${teamUsers.size}/${users.size}", style = MaterialTheme.typography.bodySmall, color = SubText)
                }
            }

            item {
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp), modifier = Modifier.fillMaxWidth()) {
                    OutlinedTextField(
                        value = state.userQuery,
                        onValueChange = vm::setUserQuery,
                        label = { Text("Buscar usuario") },
                        singleLine = true,
                        modifier = Modifier.weight(1f),
                        shape = RoundedCornerShape(12.dp),
                    )
                    OutlinedButton(
                        onClick = { vm.clearExportMessage(); vm.exportCsv(context) },
                        enabled = users.isNotEmpty(),
                    ) {
                        Text("CSV")
                    }
                }
            }

            // Summary card
            item {
                val totalMins = state.payload?.totalMinutesAll ?: 0
                Row(horizontalArrangement = Arrangement.spacedBy(10.dp), modifier = Modifier.fillMaxWidth()) {
                    SummaryKpi(
                        modifier = Modifier.weight(1f),
                        label = "Usuarios",
                        value = users.size.toString(),
                        bg = BlueLight,
                        accent = BlueColor,
                    )
                    SummaryKpi(
                        modifier = Modifier.weight(1f),
                        label = "Total horas",
                        value = "${String.format("%.1f", totalMins / 60.0)}h",
                        bg = TealLight,
                        accent = TealColor,
                    )
                    SummaryKpi(
                        modifier = Modifier.weight(1f),
                        label = "Promedio",
                        value = if (users.isEmpty()) "–" else "${String.format("%.1f", (totalMins.toDouble() / users.size) / 60.0)}h",
                        bg = GreenLight,
                        accent = GreenColor,
                    )
                }
            }

            if (teamUsers.isEmpty()) {
                item {
                    NxEmptyState(
                        title = "Sin registros",
                        subtitle = if (userQuery.isBlank()) "No hay asistencia en este periodo." else "Ningún usuario coincide con la búsqueda.",
                    )
                }
            }

            // User rows sorted by hours desc
            items(teamUsers.take(200)) { u ->
                val hours = String.format("%.1f", (u.totalMinutes ?: 0) / 60.0)
                val daysCount = u.days?.size ?: 0
                Card(
                    onClick = { selectedUser = u },
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
                                "$daysCount días registrados",
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
                            Text(
                                "${hours}h",
                                style = MaterialTheme.typography.labelLarge.copy(fontWeight = FontWeight.Bold),
                                color = TealColor,
                            )
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
private fun AttendanceUserDetail(
    u: mx.nexara.mobile.nativeapp.data.api.AttendanceRangeUserDto,
    onBack: () -> Unit,
) {
    val hours = String.format("%.1f", (u.totalMinutes ?: 0) / 60.0)
    LazyColumn(
        modifier = Modifier.fillMaxSize(),
        contentPadding = PaddingValues(16.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        item { Button(onClick = onBack) { Text("← Asistencia") } }
        item {
            Text(u.userName ?: "Usuario ${u.userId}", style = MaterialTheme.typography.headlineSmall.copy(fontWeight = FontWeight.Bold))
            Text("${hours}h · ${u.days?.size ?: 0} días", style = MaterialTheme.typography.bodySmall, color = SubText)
        }
        val days = u.days
        if (!days.isNullOrEmpty()) {
            item {
                Card(Modifier.fillMaxWidth(), shape = RoundedCornerShape(14.dp),
                    colors = CardDefaults.cardColors(containerColor = Color.White),
                    elevation = CardDefaults.cardElevation(1.dp)) {
                    Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                        Text("Días registrados", style = MaterialTheme.typography.titleSmall.copy(fontWeight = FontWeight.SemiBold))
                        days.forEach { day ->
                            val dayHours = String.format("%.1f", day.totalMinutes / 60.0)
                            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                                Text(day.date.take(10), style = MaterialTheme.typography.bodySmall, color = SubText)
                                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                                    if (day.isOpen == true) {
                                        Text("Abierta", style = MaterialTheme.typography.labelSmall, color = TealColor)
                                    }
                                    Text("${dayHours}h", style = MaterialTheme.typography.bodySmall, fontWeight = FontWeight.Medium)
                                }
                            }
                        }
                    }
                }
            }
        }
        val events = u.attendances
        if (!events.isNullOrEmpty()) {
            item {
                Card(Modifier.fillMaxWidth(), shape = RoundedCornerShape(14.dp),
                    colors = CardDefaults.cardColors(containerColor = Color.White),
                    elevation = CardDefaults.cardElevation(1.dp)) {
                    Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                        Text("Eventos", style = MaterialTheme.typography.titleSmall.copy(fontWeight = FontWeight.SemiBold))
                        events.forEach { ev ->
                            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                                Text(ev.type.replaceFirstChar { it.uppercase() }, style = MaterialTheme.typography.bodySmall)
                                Text(ev.timestamp.take(16), style = MaterialTheme.typography.bodySmall, color = SubText)
                            }
                        }
                    }
                }
            }
        }
        item { Spacer(Modifier.height(24.dp)) }
    }
}

@Composable
private fun SummaryKpi(
    modifier: Modifier,
    label: String,
    value: String,
    bg: Color,
    accent: Color,
) {
    Card(
        modifier = modifier,
        shape = RoundedCornerShape(14.dp),
        colors = CardDefaults.cardColors(containerColor = bg),
        elevation = CardDefaults.cardElevation(0.dp),
    ) {
        Column(
            modifier = Modifier.padding(12.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
        ) {
            Text(
                value,
                style = MaterialTheme.typography.titleLarge.copy(fontWeight = FontWeight.Bold),
                color = accent,
            )
            Text(label, style = MaterialTheme.typography.labelSmall, color = SubText)
        }
    }
}

