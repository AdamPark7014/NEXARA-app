package mx.nexara.mobile.nativeapp.ui.console.screens

import android.app.Application
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.*
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
import mx.nexara.mobile.nativeapp.data.console.ConsoleRepository
import mx.nexara.mobile.nativeapp.ui.console.util.currentWeekRange

// ── State ────────────────────────────────────────────────────────────────────

data class AttendanceUiState(
    val isLoading: Boolean = true,
    val error: String? = null,
    val checkInLoading: Boolean = false,
    val checkInMessage: String? = null,
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

    fun refresh() {
        val snapshot = _state.value
        _state.update { it.copy(isLoading = true, error = null) }
        viewModelScope.launch {
            try {
                val current = withContext(Dispatchers.IO) {
                    runCatching { repo.attendanceCurrent() }.getOrNull()
                }
                val range = withContext(Dispatchers.IO) {
                    repo.attendanceRange(from = snapshot.from, to = snapshot.to, tryHierarchyFirst = true)
                }
                _state.update { it.copy(isLoading = false, current = current, payload = range, error = null) }
            } catch (e: Exception) {
                _state.update {
                    it.copy(isLoading = false, error = e.message?.takeIf { m -> m.isNotBlank() } ?: "No se pudo cargar asistencia")
                }
            }
        }
    }

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
                refresh()
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

// ── Main composable ──────────────────────────────────────────────────────────

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

    if (state.payload == null && state.isLoading && state.error == null) vm.refresh()

    val selUser = selectedUser
    if (selUser != null) {
        AttendanceUserDetail(selUser, onBack = { selectedUser = null })
        return
    }

    val current = state.current
    val isCheckedIn = current?.isOpen == true

    LazyColumn(
        modifier = Modifier.fillMaxSize().padding(contentPadding),
        verticalArrangement = Arrangement.spacedBy(16.dp),
    ) {
        item {
            Column {
                Text(
                    "Semana: ${state.from} → ${state.to}",
                    style = MaterialTheme.typography.bodySmall,
                    color = SubText,
                )
            }
        }

        if (state.isLoading) {
            item { Text("Cargando asistencia...", color = SubText) }
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
                    Text("${users.size} usuarios", style = MaterialTheme.typography.bodySmall, color = SubText)
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

            // User rows sorted by hours desc
            items(users.sortedByDescending { it.totalMinutes ?: 0 }.take(200)) { u ->
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

