package mx.nexara.mobile.nativeapp.ui.console.screens

import android.app.Application
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
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
import mx.nexara.mobile.nativeapp.data.console.ConsoleRepository
import mx.nexara.mobile.nativeapp.data.realtime.refreshOnModels

// ── State & ViewModel ────────────────────────────────────────────────────────

data class ActivitiesUiState(
    val isLoading: Boolean = true,
    val teamLoading: Boolean = false,
    val error: String? = null,
    val query: String = "",
    val statusFilter: String = "Todos",
    val teamActivities: List<ActivityDto> = emptyList(),
    val myActivities: List<ActivityDto> = emptyList(),
)

class ConsoleActivitiesViewModel(app: Application) : AndroidViewModel(app) {
    private val authRepo = AuthRepository(app.applicationContext)
    private val repo = ConsoleRepository(app.applicationContext)
    private val _state = MutableStateFlow(ActivitiesUiState())
    val state: StateFlow<ActivitiesUiState> = _state

    init {
        refreshOnModels(
            models = setOf("Activity", "ActivityEvidence", "ServiceSheet"),
            refresh = { loadAll(currentUserId = authRepo.loadSession()?.id) },
        )
    }

    fun setQuery(v: String) = _state.update { it.copy(query = v) }
    fun setStatusFilter(v: String) = _state.update { it.copy(statusFilter = v) }

    fun loadAll(
        isAdmin: Boolean = false,
        isSuperAdmin: Boolean = false,
        currentUserId: Long? = null,
    ) {
        _state.update { it.copy(isLoading = true, error = null) }
        viewModelScope.launch {
            try {
                // Team activities (admin/superadmin)
                val team = if (isAdmin || isSuperAdmin) {
                    withContext(Dispatchers.IO) { repo.activitiesFetch(scope = null) }
                } else emptyList()
                // My activities (not superadmin)
                val mine = if (!isSuperAdmin) {
                    withContext(Dispatchers.IO) {
                        val scopedMine = runCatching { repo.activitiesFetch(scope = "mine") }.getOrDefault(emptyList())
                        if (scopedMine.isNotEmpty() || currentUserId == null) {
                            scopedMine
                        } else {
                            // Some environments return empty for scope=mine; fallback to local filtering.
                            repo.activitiesFetch(scope = null).filter { a ->
                                a.responsableId == currentUserId || a.responsable?.id == currentUserId
                            }
                        }
                    }
                } else emptyList()
                _state.update {
                    it.copy(
                        isLoading = false,
                        teamActivities = team,
                        myActivities = mine,
                        error = null,
                    )
                }
            } catch (e: Exception) {
                _state.update {
                    it.copy(
                        isLoading = false,
                        error = e.message?.takeIf { m -> m.isNotBlank() } ?: "No se pudieron cargar actividades",
                    )
                }
            }
        }
    }
}

// ── Color helpers ────────────────────────────────────────────────────────────

private val ActivStatusColors = mapOf(
    "pendiente" to Color(0xFFF59E0B),
    "en proceso" to Color(0xFF3B82F6),
    "proceso" to Color(0xFF3B82F6),
    "asignada" to Color(0xFF8B5CF6),
    "asignado" to Color(0xFF8B5CF6),
    "finalizada" to Color(0xFF10B981),
    "finalizado" to Color(0xFF10B981),
    "completada" to Color(0xFF10B981),
    "cancelada" to Color(0xFFEF4444),
    "cancelado" to Color(0xFFEF4444),
    "rechazado" to Color(0xFFEF4444),
)

private fun activStatusColor(estatus: String): Color {
    val s = estatus.lowercase()
    return ActivStatusColors.entries.firstOrNull { s.contains(it.key) }?.value ?: Color(0xFF64748B)
}

private val STATUS_FILTER_OPTIONS = listOf("Todos", "Pendiente", "En proceso", "Asignada", "Finalizada", "Cancelada")

private fun matchesFilter(estatus: String, filter: String): Boolean {
    if (filter == "Todos") return true
    return estatus.lowercase().contains(filter.lowercase())
}

// ── Main composable ──────────────────────────────────────────────────────────

@Composable
fun ConsoleActivitiesScreen(
    title: String = "Actividades",
    scope: String? = null,
    contentPadding: PaddingValues = PaddingValues(16.dp),
) {
    val context = LocalContext.current
    val authRepo = remember(context) { AuthRepository(context) }
    val user = remember { authRepo.loadSession() }
    val isSuperAdmin = user?.isSuperAdmin == true
    val isAdmin = !isSuperAdmin && (user?.permissions ?: emptyList()).contains("console.admin")

    val vm: ConsoleActivitiesViewModel = viewModel()
    val state by vm.state.collectAsState()

    // Initial load — pass role flags so VM fetches right datasets
    if (state.isLoading && state.error == null && state.teamActivities.isEmpty() && state.myActivities.isEmpty()) {
        vm.loadAll(isAdmin = isAdmin, isSuperAdmin = isSuperAdmin, currentUserId = user?.id)
    }

    val q = state.query.trim().lowercase()

    fun applyFilters(list: List<ActivityDto>) = list
        .filter { matchesFilter(it.estatus, state.statusFilter) }
        .filter { a ->
            if (q.isBlank()) true else buildString {
                append(a.titulo ?: ""); append(" "); append(a.estatus)
                append(" "); append(a.responsable?.nombre ?: "")
            }.lowercase().contains(q)
        }

    val teamFiltered = applyFilters(state.teamActivities)
    val myFiltered = applyFilters(state.myActivities)

    LazyColumn(
        modifier = Modifier
            .fillMaxSize()
            .padding(contentPadding),
        verticalArrangement = Arrangement.spacedBy(0.dp),
    ) {
        // ── Header: only counts (title is in TopAppBar) ─────────────────────
        item {
            Column {
                Text(
                    buildString {
                        if (isSuperAdmin || isAdmin) append("${state.teamActivities.size} del equipo")
                        if (!isSuperAdmin && (isAdmin || true)) {
                            if (isNotEmpty()) append("  ·  ")
                            append("${state.myActivities.size} propias")
                        }
                    },
                    style = MaterialTheme.typography.bodySmall,
                    color = Color(0xFF64748B),
                )
                Spacer(Modifier.height(12.dp))
            }
        }

        if (state.isLoading) {
            item { Text("Cargando actividades...", color = Color(0xFF64748B)) }
            return@LazyColumn
        }

        if (!state.error.isNullOrBlank()) {
            item {
                Text(state.error!!, color = MaterialTheme.colorScheme.error)
                Spacer(Modifier.height(8.dp))
                Button(onClick = { vm.loadAll(isAdmin, isSuperAdmin, currentUserId = user?.id) }) { Text("Reintentar") }
            }
            return@LazyColumn
        }

        // ── Search ──────────────────────────────────────────────────────────
        item {
            OutlinedTextField(
                value = state.query,
                onValueChange = vm::setQuery,
                label = { Text("Buscar actividades") },
                singleLine = true,
                modifier = Modifier.fillMaxWidth(),
                shape = RoundedCornerShape(12.dp),
            )
            Spacer(Modifier.height(10.dp))
        }

        // ── Status filter chips ──────────────────────────────────────────────
        item {
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .horizontalScroll(rememberScrollState()),
                horizontalArrangement = Arrangement.spacedBy(8.dp),
            ) {
                STATUS_FILTER_OPTIONS.forEach { opt ->
                    val selected = state.statusFilter == opt
                    Box(
                        modifier = Modifier
                            .clip(RoundedCornerShape(20.dp))
                            .background(
                                if (selected) Color(0xFF0D9488) else Color(0xFFF1F5F9),
                            )
                            .clickable { vm.setStatusFilter(opt) }
                            .padding(horizontal = 14.dp, vertical = 7.dp),
                    ) {
                        Text(
                            opt,
                            style = MaterialTheme.typography.labelMedium.copy(fontWeight = FontWeight.SemiBold),
                            color = if (selected) Color.White else Color(0xFF475569),
                        )
                    }
                }
            }
            Spacer(Modifier.height(16.dp))
        }

        // ── Team section (admin/superadmin) ──────────────────────────────────
        if (isSuperAdmin || isAdmin) {
            item {
                ActivitySectionHeader(
                    label = if (isSuperAdmin) "Todos los usuarios — Equipo" else "Actividades del equipo",
                    count = teamFiltered.size,
                    icon = "🗂️",
                )
                Spacer(Modifier.height(8.dp))
            }
            if (teamFiltered.isEmpty()) {
                item {
                    Text(
                        "Sin actividades con este filtro",
                        color = Color(0xFF94A3B8),
                        modifier = Modifier.padding(vertical = 8.dp),
                    )
                    Spacer(Modifier.height(8.dp))
                }
            } else {
                items(teamFiltered.take(150)) { a ->
                    ActivityCard(a)
                    Spacer(Modifier.height(8.dp))
                }
            }
        }

        // ── Divider between sections for admin ───────────────────────────────
        if ((isSuperAdmin || isAdmin) && !isSuperAdmin) {
            item {
                HorizontalDivider(color = Color(0xFFE2E8F0), modifier = Modifier.padding(vertical = 8.dp))
            }
        }

        // ── My activities (not superadmin) ───────────────────────────────────
        if (!isSuperAdmin) {
            item {
                Column {
                    Text(
                        "MI ESPACIO DE TRABAJO",
                        style = MaterialTheme.typography.labelSmall.copy(
                            fontWeight = FontWeight.Bold,
                            letterSpacing = 1.sp,
                        ),
                        color = Color(0xFF64748B),
                    )
                    Spacer(Modifier.height(2.dp))
                }
                ActivitySectionHeader(
                    label = "Mis actividades",
                    count = myFiltered.size,
                    icon = "📋",
                )
                Spacer(Modifier.height(8.dp))
            }
            if (myFiltered.isEmpty()) {
                item {
                    Text(
                        "Sin actividades asignadas con este filtro",
                        color = Color(0xFF94A3B8),
                        modifier = Modifier.padding(vertical = 8.dp),
                    )
                }
            } else {
                items(myFiltered.take(100)) { a ->
                    ActivityCard(a, showResponsable = false)
                    Spacer(Modifier.height(8.dp))
                }
            }
        }

        item { Spacer(Modifier.height(24.dp)) }
    }
}

// ── Sub-composables ──────────────────────────────────────────────────────────

@Composable
private fun ActivitySectionHeader(label: String, count: Int, icon: String) {
    Row(
        modifier = Modifier.fillMaxWidth(),
        horizontalArrangement = Arrangement.SpaceBetween,
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(6.dp)) {
            Text(icon, fontSize = 18.sp)
            Text(
                label,
                style = MaterialTheme.typography.titleMedium.copy(fontWeight = FontWeight.Bold),
                color = Color(0xFF0F172A),
            )
        }
        Box(
            modifier = Modifier
                .clip(RoundedCornerShape(12.dp))
                .background(Color(0xFFE2E8F0))
                .padding(horizontal = 10.dp, vertical = 3.dp),
        ) {
            Text(
                count.toString(),
                style = MaterialTheme.typography.labelMedium.copy(fontWeight = FontWeight.Bold),
                color = Color(0xFF475569),
            )
        }
    }
}

@Composable
private fun ActivityCard(a: ActivityDto, showResponsable: Boolean = true) {
    val statusColor = activStatusColor(a.estatus)
    Card(
        modifier = Modifier.fillMaxWidth(),
        shape = RoundedCornerShape(14.dp),
        colors = CardDefaults.cardColors(containerColor = Color.White),
        elevation = CardDefaults.cardElevation(2.dp),
    ) {
        Row(
            modifier = Modifier.padding(14.dp),
            horizontalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            // Status strip
            Box(
                modifier = Modifier
                    .width(4.dp)
                    .height(48.dp)
                    .clip(RoundedCornerShape(2.dp))
                    .background(statusColor),
            )
            Column(modifier = Modifier.weight(1f)) {
                Text(
                    a.titulo?.takeIf { it.isNotBlank() } ?: "Actividad #${a.id}",
                    style = MaterialTheme.typography.bodyMedium.copy(fontWeight = FontWeight.SemiBold),
                    color = Color(0xFF0F172A),
                )
                Spacer(Modifier.height(4.dp))
                Row(
                    horizontalArrangement = Arrangement.spacedBy(8.dp),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    // Status badge
                    Box(
                        modifier = Modifier
                            .clip(RoundedCornerShape(6.dp))
                            .background(statusColor.copy(alpha = 0.13f))
                            .padding(horizontal = 8.dp, vertical = 3.dp),
                    ) {
                        Text(
                            a.estatus.ifBlank { "—" },
                            style = MaterialTheme.typography.labelSmall.copy(fontWeight = FontWeight.SemiBold),
                            color = statusColor,
                        )
                    }
                }
                val assignedBy = a.creador?.nombre
                val assignedTo = a.responsable?.nombre
                if (!assignedBy.isNullOrBlank() || (showResponsable && !assignedTo.isNullOrBlank())) {
                    Spacer(Modifier.height(4.dp))
                    Text(
                        buildString {
                            if (!assignedBy.isNullOrBlank()) append("Asigno: $assignedBy")
                            if (showResponsable && !assignedTo.isNullOrBlank()) {
                                if (isNotEmpty()) append("  ·  ")
                                append("Asignada a: $assignedTo")
                            }
                        },
                        style = MaterialTheme.typography.bodySmall,
                        color = Color(0xFF64748B),
                    )
                }
                val dates = listOfNotNull(
                    a.fechaAsignacion?.takeIf { it.isNotBlank() },
                    a.fechaInicio?.takeIf { it.isNotBlank() },
                    a.fechaFinalizacion?.takeIf { it.isNotBlank() },
                )
                if (dates.isNotEmpty()) {
                    Spacer(Modifier.height(4.dp))
                    Text(
                        dates.joinToString("  →  "),
                        style = MaterialTheme.typography.labelSmall,
                        color = Color(0xFF94A3B8),
                    )
                }
            }
        }
    }
}

