package mx.nexara.mobile.nativeapp.ui.console.screens

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
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
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.lifecycle.viewmodel.compose.viewModel
import mx.nexara.mobile.nativeapp.data.AuthRepository
import mx.nexara.mobile.nativeapp.data.api.ActivityDto
import mx.nexara.mobile.nativeapp.ui.console.activities.ActivityDetailScreen
import mx.nexara.mobile.nativeapp.ui.console.activities.ConsoleActivitiesViewModel
import mx.nexara.mobile.nativeapp.ui.console.activities.STATUS_FILTER_OPTIONS
import mx.nexara.mobile.nativeapp.ui.console.activities.activStatusTone
import mx.nexara.mobile.nativeapp.ui.console.activities.matchesFilter
import mx.nexara.mobile.nativeapp.ui.enterprise.NxColors
import mx.nexara.mobile.nativeapp.ui.enterprise.NxEmptyState
import mx.nexara.mobile.nativeapp.ui.enterprise.NxErrorBlock
import mx.nexara.mobile.nativeapp.ui.enterprise.NxLoadingBlock
import mx.nexara.mobile.nativeapp.ui.enterprise.NxPanelShell
import mx.nexara.mobile.nativeapp.ui.enterprise.NxSectionHeader
import mx.nexara.mobile.nativeapp.ui.enterprise.NxStatusChip

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ConsoleActivitiesScreen(
    title: String = "Actividades",
    scope: String? = null,
    contentPadding: PaddingValues = PaddingValues(16.dp),
    onNewOt: (() -> Unit)? = null,
) {
    val context = LocalContext.current
    val authRepo = remember(context) { AuthRepository(context) }
    val user = remember { authRepo.loadSession() }
    val isSuperAdmin = user?.isSuperAdmin == true
    val isAdmin = !isSuperAdmin && (user?.permissions ?: emptyList()).contains("console.admin")
    var selectedActivity by remember { mutableStateOf<ActivityDto?>(null) }
    var evidenceFocusId by remember { mutableStateOf<Long?>(null) }

    val vm: ConsoleActivitiesViewModel = viewModel()
    val state by vm.state.collectAsState()

    if (evidenceFocusId != null) {
        Column(Modifier.fillMaxSize()) {
            TextButton(
                onClick = { evidenceFocusId = null },
                modifier = Modifier.padding(8.dp),
            ) { Text("← Volver a actividad") }
            ConsoleEvidencesScreen(mode = "user", initialActivityId = evidenceFocusId)
        }
        return
    }

    if (selectedActivity != null) {
        ActivityDetailScreen(
            activity = selectedActivity!!,
            onBack = { selectedActivity = null },
            onCaptureEvidence = { id -> evidenceFocusId = id },
        )
        return
    }

    // Initial load — pass role flags so VM fetches right datasets
    if (state.isLoading && state.error == null && state.teamActivities.isEmpty() && state.myActivities.isEmpty()) {
        vm.loadAll(initial = true, isAdmin = isAdmin, isSuperAdmin = isSuperAdmin, currentUserId = user?.id)
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

    PullToRefreshBox(
        isRefreshing = state.isRefreshing,
        onRefresh = { vm.loadAll(initial = false, isAdmin = isAdmin, isSuperAdmin = isSuperAdmin, currentUserId = user?.id) },
        modifier = Modifier.fillMaxSize(),
    ) {
    LazyColumn(
        modifier = Modifier
            .fillMaxSize()
            .background(NxColors.Surface)
            .padding(contentPadding),
        verticalArrangement = Arrangement.spacedBy(0.dp),
    ) {
        // ── Header: only counts (title is in TopAppBar) ─────────────────────
        item {
            Column {
                Row(
                    Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Text(
                        buildString {
                            if (isSuperAdmin || isAdmin) append("${state.teamActivities.size} del equipo")
                            if (!isSuperAdmin && (isAdmin || true)) {
                                if (isNotEmpty()) append("  ·  ")
                                append("${state.myActivities.size} propias")
                            }
                        },
                        style = MaterialTheme.typography.bodySmall,
                        color = NxColors.Muted,
                    )
                    if (onNewOt != null && (isAdmin || isSuperAdmin)) {
                        Button(onClick = onNewOt, modifier = Modifier.height(36.dp)) {
                            Text("Nueva OT", style = MaterialTheme.typography.labelMedium)
                        }
                    }
                }
                Spacer(Modifier.height(12.dp))
            }
        }

        if (state.isLoading) {
            item { NxLoadingBlock("Cargando actividades…") }
            return@LazyColumn
        }

        if (!state.error.isNullOrBlank()) {
            item { NxErrorBlock(state.error!!) { vm.loadAll(initial = false, isAdmin = isAdmin, isSuperAdmin = isSuperAdmin, currentUserId = user?.id) } }
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
                NxSectionHeader(
                    title = if (isSuperAdmin) "Todos los usuarios — Equipo" else "Actividades del equipo",
                    subtitle = "${teamFiltered.size} actividad(es)",
                )
                Spacer(Modifier.height(8.dp))
            }
            if (teamFiltered.isEmpty()) {
                item {
                    NxEmptyState(
                        title = "Sin actividades",
                        subtitle = "No hay actividades del equipo con este filtro.",
                        actionLabel = "Actualizar",
                        onAction = { vm.loadAll(initial = false, isAdmin = isAdmin, isSuperAdmin = isSuperAdmin, currentUserId = user?.id) },
                    )
                    Spacer(Modifier.height(8.dp))
                }
            } else {
                items(teamFiltered.take(150)) { a ->
                    ActivityCard(a, onClick = { selectedActivity = a })
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
                NxSectionHeader(
                    title = "Mis actividades",
                    subtitle = "${myFiltered.size} asignada(s)",
                )
                Spacer(Modifier.height(8.dp))
            }
            if (myFiltered.isEmpty()) {
                item {
                    NxEmptyState(
                        title = "Sin actividades",
                        subtitle = "No tienes actividades asignadas con este filtro.",
                        actionLabel = "Actualizar",
                        onAction = { vm.loadAll(initial = false, isAdmin = isAdmin, isSuperAdmin = isSuperAdmin, currentUserId = user?.id) },
                    )
                }
            } else {
                items(myFiltered.take(100), key = { it.id }) { a ->
                    ActivityCard(a, showResponsable = false, onClick = { selectedActivity = a })
                    Spacer(Modifier.height(8.dp))
                }
            }
        }

        item { Spacer(Modifier.height(24.dp)) }
    }
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
private fun ActivityCard(a: ActivityDto, showResponsable: Boolean = true, onClick: (() -> Unit)? = null) {
    val statusTone = activStatusTone(a.estatus)
    NxPanelShell(onClick = onClick) {
        Column(modifier = Modifier.fillMaxWidth()) {
            Text(
                a.titulo?.takeIf { it.isNotBlank() } ?: "Actividad #${a.id}",
                style = MaterialTheme.typography.bodyMedium.copy(fontWeight = FontWeight.SemiBold),
                color = NxColors.Slate,
            )
            Spacer(Modifier.height(6.dp))
            NxStatusChip(a.estatus.ifBlank { "Sin estado" }, statusTone)
            val assignedBy = a.creador?.nombre
            val assignedTo = a.responsable?.nombre
            if (!assignedBy.isNullOrBlank() || (showResponsable && !assignedTo.isNullOrBlank())) {
                Spacer(Modifier.height(6.dp))
                Text(
                    buildString {
                        if (!assignedBy.isNullOrBlank()) append("Asignó: $assignedBy")
                        if (showResponsable && !assignedTo.isNullOrBlank()) {
                            if (isNotEmpty()) append("  ·  ")
                            append("Asignada a: $assignedTo")
                        }
                    },
                    style = MaterialTheme.typography.bodySmall,
                    color = NxColors.Muted,
                )
            }
            val dates = listOfNotNull(
                a.fechaAsignacion?.takeIf { it.isNotBlank() }?.take(10),
                a.fechaInicio?.takeIf { it.isNotBlank() }?.take(10),
                a.fechaFinalizacion?.takeIf { it.isNotBlank() }?.take(10),
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
