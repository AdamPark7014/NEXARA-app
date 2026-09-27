package mx.nexara.mobile.nativeapp.ui.tickets.screens

import android.app.Application
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.KeyboardArrowRight
import androidx.compose.material.icons.outlined.ConfirmationNumber
import androidx.compose.material.icons.outlined.WarningAmber
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.ExposedDropdownMenuBox
import androidx.compose.material3.ExposedDropdownMenuDefaults
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.MenuAnchorType
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.style.TextOverflow
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
import mx.nexara.mobile.nativeapp.data.api.ClientPortalProjectDto
import mx.nexara.mobile.nativeapp.data.api.ClientPortalTicketDto
import mx.nexara.mobile.nativeapp.data.api.toUserMessage
import mx.nexara.mobile.nativeapp.data.realtime.refreshOnModels
import mx.nexara.mobile.nativeapp.data.tickets.TicketsRepository
import mx.nexara.mobile.nativeapp.ui.enterprise.NxColors
import mx.nexara.mobile.nativeapp.ui.enterprise.NxDimens
import mx.nexara.mobile.nativeapp.ui.enterprise.NxEmptyState
import mx.nexara.mobile.nativeapp.ui.enterprise.NxErrorState
import mx.nexara.mobile.nativeapp.ui.enterprise.NxFilterBar
import mx.nexara.mobile.nativeapp.ui.enterprise.NxFilterPill
import mx.nexara.mobile.nativeapp.ui.enterprise.NxIconText
import mx.nexara.mobile.nativeapp.ui.enterprise.NxKpi
import mx.nexara.mobile.nativeapp.ui.enterprise.NxKpiGrid
import mx.nexara.mobile.nativeapp.ui.enterprise.NxRefreshErrorBanner
import mx.nexara.mobile.nativeapp.ui.enterprise.NxScreenScaffold
import mx.nexara.mobile.nativeapp.ui.enterprise.NxSearchField
import mx.nexara.mobile.nativeapp.ui.enterprise.NxSectionHeader
import mx.nexara.mobile.nativeapp.ui.enterprise.NxSegmented
import mx.nexara.mobile.nativeapp.ui.enterprise.NxSkeletonList
import mx.nexara.mobile.nativeapp.ui.enterprise.NxSpacing
import mx.nexara.mobile.nativeapp.ui.enterprise.NxStatusChip
import mx.nexara.mobile.nativeapp.ui.enterprise.NxStatusLabels
import mx.nexara.mobile.nativeapp.ui.enterprise.NxTone
import java.time.Instant
import java.time.temporal.ChronoUnit

data class TicketsTicketsUiState(
    val isLoading: Boolean = true,
    val isRefreshing: Boolean = false,
    val error: String? = null,
    val tickets: List<ClientPortalTicketDto> = emptyList(),
    val projects: List<ClientPortalProjectDto> = emptyList(),
    val dateRange: String = "7d",
    val projectId: Long? = null,
)

class TicketsTicketsViewModel(app: Application) : AndroidViewModel(app) {
    private val repo = TicketsRepository(app.applicationContext)
    private val _state = MutableStateFlow(TicketsTicketsUiState())
    val state: StateFlow<TicketsTicketsUiState> = _state

    init {
        refresh(initial = true)
        refreshOnModels(
            models = setOf("Activity", "ActivityEvidence", "ServiceSheet"),
            refresh = { refresh(initial = false) },
        )
    }

    fun setDateRange(value: String) {
        _state.update { it.copy(dateRange = value) }
        refresh(initial = false)
    }

    fun setProjectId(value: Long?) {
        _state.update { it.copy(projectId = value) }
        refresh(initial = false)
    }

    fun refresh(initial: Boolean = false) {
        val s = _state.value
        _state.update {
            if (initial) it.copy(isLoading = true, error = null)
            else it.copy(isRefreshing = true, error = null)
        }
        viewModelScope.launch {
            try {
                val (start, end) = resolveTicketDateRange(s.dateRange)
                val result = withContext(Dispatchers.IO) {
                    val projects = runCatching { repo.projects() }.getOrDefault(emptyList())
                    val list = repo.tickets(start = start, end = end, projectId = s.projectId)
                    projects to list
                }
                _state.update {
                    it.copy(
                        isLoading = false,
                        isRefreshing = false,
                        projects = result.first,
                        tickets = result.second,
                        error = null,
                    )
                }
            } catch (e: Exception) {
                _state.update {
                    it.copy(
                        isLoading = false,
                        isRefreshing = false,
                        error = e.toUserMessage("No se pudieron cargar tickets"),
                    )
                }
            }
        }
    }

    fun dismissError() {
        _state.update { it.copy(error = null) }
    }
}

internal fun resolveTicketDateRange(range: String): Pair<String?, String?> {
    if (range == "all") return null to null
    val now = Instant.now()
    val end = now.toString()
    val start = when (range) {
        "today" -> now.atZone(java.time.ZoneOffset.UTC).toLocalDate().atStartOfDay(java.time.ZoneOffset.UTC).toInstant()
        "30d" -> now.minus(30, ChronoUnit.DAYS)
        else -> now.minus(7, ChronoUnit.DAYS)
    }.toString()
    return start to end
}

private val DATE_RANGES = listOf("today" to "Hoy", "7d" to "7 días", "30d" to "30 días", "all" to "Todos")

private val TICKET_FILTERS = listOf(
    "todos" to "Todos",
    "abiertos" to "Abiertos",
    "cerrados" to "Cerrados",
    "alta" to "Alta prioridad",
    "aging" to "Más de 48 h",
)

@Suppress("UNUSED_PARAMETER")
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun TicketsTicketsScreen(
    onBack: () -> Unit,
    onOpenTicket: (Long) -> Unit,
    modifier: Modifier = Modifier,
) {
    val vm: TicketsTicketsViewModel = viewModel()
    val state by vm.state.collectAsState()
    var query by rememberSaveable { mutableStateOf("") }
    var filter by rememberSaveable { mutableStateOf("todos") }
    var projectMenuExpanded by remember { mutableStateOf(false) }

    val tickets = state.tickets
    val kpis = remember(tickets) {
        val open = tickets.count { it.isOpen() }
        val high = tickets.count { it.isOpen() && it.isHighPriority() }
        val aging = tickets.count { it.isOpen() && ticketAgeHours(it) >= 48 }
        listOf(
            NxKpi("Abiertos", "$open", tone = if (open > 0) NxTone.Warning else NxTone.Success),
            NxKpi("Alta prioridad", "$high", tone = if (high > 0) NxTone.Danger else NxTone.Neutral),
            NxKpi("Más de 48 h", "$aging", hint = "Sin cierre", tone = if (aging > 0) NxTone.Danger else NxTone.Info),
            NxKpi("Total", "${tickets.size}", tone = NxTone.Brand),
        )
    }
    val filtered = remember(tickets, filter, query) {
        val q = query.trim().lowercase()
        tickets.filter { t ->
            val matchFilter = when (filter) {
                "abiertos" -> t.isOpen()
                "cerrados" -> !t.isOpen()
                "alta" -> t.isOpen() && t.isHighPriority()
                "aging" -> t.isOpen() && ticketAgeHours(t) >= 48
                else -> true
            }
            val matchQuery = q.isBlank() || buildString {
                append(t.titulo ?: ""); append(" ")
                append(t.anNumber ?: ""); append(" ")
                append(t.branchName ?: ""); append(" ")
                append(t.estatus ?: "")
            }.lowercase().contains(q)
            matchFilter && matchQuery
        }
    }

    NxScreenScaffold(
        modifier = modifier,
        isRefreshing = state.isRefreshing,
        onRefresh = { vm.refresh(initial = false) },
    ) {
        when {
            state.isLoading -> NxSkeletonList(
                itemCount = 6,
                itemHeight = 92.dp,
                modifier = Modifier.fillMaxWidth().padding(NxSpacing.ListPadding),
            )
            tickets.isEmpty() && !state.error.isNullOrBlank() -> NxErrorState(
                message = state.error,
                onRetry = { vm.refresh(initial = true) },
            )
            else -> LazyColumn(
                modifier = Modifier.fillMaxSize(),
                contentPadding = NxSpacing.ListPadding,
                verticalArrangement = Arrangement.spacedBy(NxSpacing.ListGap),
            ) {
                state.error?.takeIf { it.isNotBlank() }?.let { msg ->
                    item(key = "refresh-error") {
                        NxRefreshErrorBanner(
                            message = msg,
                            onRetry = { vm.refresh(initial = false) },
                            onDismiss = vm::dismissError,
                        )
                    }
                }

                item(key = "header") {
                    NxSectionHeader(
                        title = "Tickets",
                        subtitle = "Prioridad, antigüedad y estado de cada servicio.",
                    )
                }

                item(key = "kpis") { NxKpiGrid(items = kpis) }

                item(key = "range") {
                    NxSegmented(
                        options = DATE_RANGES.map { it.second },
                        selectedIndex = DATE_RANGES.indexOfFirst { it.first == state.dateRange }.coerceAtLeast(0),
                        onSelect = { i -> vm.setDateRange(DATE_RANGES[i].first) },
                    )
                }

                if (state.projects.isNotEmpty()) {
                    item(key = "project") {
                        val selectedTitle = state.projects.firstOrNull { it.id == state.projectId }?.title ?: "Todos los proyectos"
                        ExposedDropdownMenuBox(
                            expanded = projectMenuExpanded,
                            onExpandedChange = { projectMenuExpanded = it },
                        ) {
                            OutlinedTextField(
                                value = selectedTitle,
                                onValueChange = {},
                                readOnly = true,
                                singleLine = true,
                                label = { Text("Proyecto") },
                                trailingIcon = { ExposedDropdownMenuDefaults.TrailingIcon(expanded = projectMenuExpanded) },
                                shape = RoundedCornerShape(NxDimens.PanelRadius),
                                modifier = Modifier
                                    .menuAnchor(MenuAnchorType.PrimaryNotEditable)
                                    .fillMaxWidth(),
                            )
                            ExposedDropdownMenu(
                                expanded = projectMenuExpanded,
                                onDismissRequest = { projectMenuExpanded = false },
                            ) {
                                DropdownMenuItem(
                                    text = { Text("Todos los proyectos") },
                                    onClick = {
                                        projectMenuExpanded = false
                                        vm.setProjectId(null)
                                    },
                                )
                                state.projects.forEach { project ->
                                    DropdownMenuItem(
                                        text = { Text(project.title ?: "Proyecto #${project.id}") },
                                        onClick = {
                                            projectMenuExpanded = false
                                            vm.setProjectId(project.id)
                                        },
                                    )
                                }
                            }
                        }
                    }
                }

                item(key = "search") {
                    NxSearchField(
                        value = query,
                        onValueChange = { query = it },
                        placeholder = "Buscar folio, título o sucursal",
                    )
                }

                item(key = "filters") {
                    NxFilterBar(contentPadding = androidx.compose.foundation.layout.PaddingValues(0.dp)) {
                        TICKET_FILTERS.forEach { (key, label) ->
                            NxFilterPill(
                                label = label,
                                count = null,
                                selected = filter == key,
                                onClick = { filter = if (filter == key && key != "todos") "todos" else key },
                            )
                        }
                    }
                }

                if (filtered.isEmpty()) {
                    item(key = "empty") {
                        NxEmptyState(
                            title = if (tickets.isEmpty()) "Sin tickets" else "Sin resultados",
                            subtitle = if (tickets.isEmpty()) {
                                "No hay tickets en este periodo."
                            } else {
                                "Ningún ticket coincide con el filtro o la búsqueda."
                            },
                            icon = Icons.Outlined.ConfirmationNumber,
                        )
                    }
                } else {
                    items(filtered, key = { it.id }, contentType = { "ticket" }) { t ->
                        TicketRow(ticket = t, onOpen = { onOpenTicket(t.id) })
                    }
                }
            }
        }
    }
}

@Composable
private fun TicketRow(ticket: ClientPortalTicketDto, onOpen: () -> Unit) {
    val t = ticket
    val ageH = remember(t.id, t.fechaAsignacion, t.fechaInicio) { ticketAgeHours(t) }
    val open = t.isOpen()
    val tone = when {
        !open -> NxTone.Success
        t.isHighPriority() || ageH >= 72 -> NxTone.Danger
        ageH >= 48 -> NxTone.Warning
        else -> NxTone.Info
    }
    Card(
        onClick = onOpen,
        modifier = Modifier.fillMaxWidth(),
        shape = RoundedCornerShape(NxDimens.PanelRadius),
        colors = CardDefaults.cardColors(containerColor = NxColors.Card),
        elevation = CardDefaults.cardElevation(NxDimens.PanelElevation),
    ) {
        Row(
            modifier = Modifier.padding(start = 14.dp, top = 12.dp, bottom = 12.dp, end = 6.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                Row(
                    Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.spacedBy(8.dp),
                    verticalAlignment = Alignment.Top,
                ) {
                    Text(
                        t.titulo?.takeIf { it.isNotBlank() } ?: "Ticket #${t.id}",
                        style = MaterialTheme.typography.titleSmall,
                        color = NxColors.Slate,
                        maxLines = 2,
                        overflow = TextOverflow.Ellipsis,
                        modifier = Modifier.weight(1f),
                    )
                    NxStatusChip(NxStatusLabels.label(t.estatus), tone)
                }
                val meta = buildList {
                    t.anNumber?.takeIf { it.isNotBlank() }?.let { add(it) }
                    NxStatusLabels.priority(t.displayPriority())?.let { add("Prioridad $it") }
                    t.branchName?.takeIf { it.isNotBlank() }?.let { add(it) }
                    if (open) add(ticketAgeText(ageH))
                }.joinToString(" · ")
                if (meta.isNotBlank()) {
                    Text(meta, color = NxColors.Muted, style = MaterialTheme.typography.bodySmall)
                }
                if (open && ageH >= 48) {
                    NxIconText(
                        text = "Fuera de ventana operativa (más de 48 h)",
                        icon = Icons.Outlined.WarningAmber,
                        color = NxColors.Danger,
                        style = MaterialTheme.typography.labelSmall,
                    )
                }
            }
            Icon(
                Icons.AutoMirrored.Filled.KeyboardArrowRight,
                contentDescription = "Ver detalle",
                tint = NxColors.Muted,
            )
        }
    }
}

private fun ticketAgeText(hours: Long): String = when {
    hours < 1 -> "Abierto hace menos de 1 h"
    hours < 48 -> "Abierto hace $hours h"
    else -> "Abierto hace ${hours / 24} días"
}

internal fun ticketAgeHours(t: ClientPortalTicketDto): Long {
    val raw = t.fechaAsignacion ?: t.fechaInicio ?: return 0
    return try {
        val normalized = when {
            raw.length >= 19 && raw[10] == ' ' -> raw.take(19).replace(' ', 'T') + "Z"
            raw.endsWith("Z") || raw.contains('+') -> raw
            raw.length >= 19 -> raw.take(19) + "Z"
            else -> raw
        }
        val start = Instant.parse(normalized)
        ChronoUnit.HOURS.between(start, Instant.now()).coerceAtLeast(0)
    } catch (_: Exception) {
        0
    }
}
