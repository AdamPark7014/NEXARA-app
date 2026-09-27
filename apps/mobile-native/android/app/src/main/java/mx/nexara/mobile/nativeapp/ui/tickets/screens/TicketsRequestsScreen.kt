package mx.nexara.mobile.nativeapp.ui.tickets.screens

import android.app.Application
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.outlined.Inbox
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.ExtendedFloatingActionButton
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
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
import mx.nexara.mobile.nativeapp.data.api.ClientTicketRequestDto
import mx.nexara.mobile.nativeapp.data.api.toUserMessage
import mx.nexara.mobile.nativeapp.data.realtime.refreshOnModels
import mx.nexara.mobile.nativeapp.data.tickets.TicketsRepository
import mx.nexara.mobile.nativeapp.ui.enterprise.NxAlert
import mx.nexara.mobile.nativeapp.ui.enterprise.NxAlertBanner
import mx.nexara.mobile.nativeapp.ui.enterprise.NxColors
import mx.nexara.mobile.nativeapp.ui.enterprise.NxEmptyState
import mx.nexara.mobile.nativeapp.ui.enterprise.NxErrorState
import mx.nexara.mobile.nativeapp.ui.enterprise.NxFilterBar
import mx.nexara.mobile.nativeapp.ui.enterprise.NxFilterPill
import mx.nexara.mobile.nativeapp.ui.enterprise.NxFormat
import mx.nexara.mobile.nativeapp.ui.enterprise.NxKpi
import mx.nexara.mobile.nativeapp.ui.enterprise.NxKpiGrid
import mx.nexara.mobile.nativeapp.ui.enterprise.NxPanelShell
import mx.nexara.mobile.nativeapp.ui.enterprise.NxPrimaryButton
import mx.nexara.mobile.nativeapp.ui.enterprise.NxRefreshErrorBanner
import mx.nexara.mobile.nativeapp.ui.enterprise.NxScreenScaffold
import mx.nexara.mobile.nativeapp.ui.enterprise.NxSearchField
import mx.nexara.mobile.nativeapp.ui.enterprise.NxSecondaryButton
import mx.nexara.mobile.nativeapp.ui.enterprise.NxSectionHeader
import mx.nexara.mobile.nativeapp.ui.enterprise.NxSkeletonList
import mx.nexara.mobile.nativeapp.ui.enterprise.NxSpacing
import mx.nexara.mobile.nativeapp.ui.enterprise.NxStatusChip
import mx.nexara.mobile.nativeapp.ui.enterprise.NxStatusLabels
import mx.nexara.mobile.nativeapp.ui.enterprise.NxTone

data class TicketsRequestsUiState(
    val isLoading: Boolean = true,
    val isRefreshing: Boolean = false,
    val saving: Boolean = false,
    val error: String? = null,
    val message: String? = null,
    val requests: List<ClientTicketRequestDto> = emptyList(),
)

class TicketsRequestsViewModel(app: Application) : AndroidViewModel(app) {
    private val repo = TicketsRepository(app.applicationContext)
    private val _state = MutableStateFlow(TicketsRequestsUiState())
    val state: StateFlow<TicketsRequestsUiState> = _state

    init {
        refresh(initial = true)
        refreshOnModels(
            models = setOf("ClientTicketRequest", "Activity"),
            refresh = { refresh(initial = false) },
        )
    }

    fun refresh(initial: Boolean = false) {
        _state.update {
            if (initial) it.copy(isLoading = true, error = null, message = null)
            else it.copy(isRefreshing = true, error = null, message = null)
        }
        viewModelScope.launch {
            try {
                val list = withContext(Dispatchers.IO) { repo.requests() }
                _state.update { it.copy(isLoading = false, isRefreshing = false, requests = list, error = null) }
            } catch (e: Exception) {
                _state.update {
                    it.copy(
                        isLoading = false,
                        isRefreshing = false,
                        error = e.toUserMessage("No se pudieron cargar solicitudes"),
                    )
                }
            }
        }
    }

    fun dismissMessage() = _state.update { it.copy(message = null) }

    fun dismissError() = _state.update { it.copy(error = null) }

    fun closeRequest(id: Long) {
        _state.update { it.copy(saving = true, error = null, message = null) }
        viewModelScope.launch {
            try {
                withContext(Dispatchers.IO) { repo.closeRequest(id) }
                _state.update { it.copy(saving = false, message = "Solicitud cerrada") }
                refresh(initial = false)
            } catch (e: Exception) {
                _state.update {
                    it.copy(
                        saving = false,
                        error = e.toUserMessage("No se pudo cerrar la solicitud"),
                    )
                }
            }
        }
    }

    fun decideRequest(id: Long, decision: String) {
        _state.update { it.copy(saving = true, error = null, message = null) }
        viewModelScope.launch {
            try {
                withContext(Dispatchers.IO) { repo.decideRequest(id, decision) }
                val label = if (decision == "APPROVED") "Solicitud autorizada" else "Solicitud rechazada"
                _state.update { it.copy(saving = false, message = label) }
                refresh(initial = false)
            } catch (e: Exception) {
                _state.update {
                    it.copy(
                        saving = false,
                        error = e.toUserMessage("No se pudo actualizar la solicitud"),
                    )
                }
            }
        }
    }
}

private fun requestStatusTone(status: String?): NxTone {
    val s = (status ?: "").uppercase()
    return when {
        s == "CLOSED" -> NxTone.Neutral
        s == "NEW" -> NxTone.Warning
        s.contains("APPROV") -> NxTone.Success
        s.contains("REJECT") -> NxTone.Danger
        else -> NxTone.Info
    }
}

private fun requestStatusLabel(status: String?): String = when ((status ?: "").uppercase()) {
    "NEW" -> "Nueva"
    "APPROVED" -> "Autorizada"
    "REJECTED" -> "Rechazada"
    "CLOSED" -> "Cerrada"
    else -> NxStatusLabels.label(status)
}

private fun requestTypeLabel(type: String?): String = when (type?.uppercase()) {
    "PREVENTIVE_INVENTORY" -> "Mantenimiento e inventario"
    "ISSUE" -> "Ticket por problema"
    else -> NxStatusLabels.label(type)
}

private val REQUEST_FILTERS = listOf(
    "activas" to "Activas",
    "nuevas" to "Nuevas",
    "cerradas" to "Cerradas",
    "todas" to "Todas",
)

/** Acción que espera confirmación: cerrar o rechazar no se deshacen. */
private data class PendingRequestAction(val id: Long, val kind: String)

@Suppress("UNUSED_PARAMETER")
@Composable
fun TicketsRequestsScreen(
    onBack: () -> Unit,
    onCreate: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val vm: TicketsRequestsViewModel = viewModel()
    val state by vm.state.collectAsState()
    var filter by rememberSaveable { mutableStateOf("activas") }
    var query by rememberSaveable { mutableStateOf("") }
    var pending by remember { mutableStateOf<PendingRequestAction?>(null) }

    val requests = state.requests
    val kpis = remember(requests) {
        val open = requests.count { (it.status ?: "").uppercase() != "CLOSED" }
        val newCount = requests.count { (it.status ?: "").uppercase() == "NEW" }
        listOf(
            NxKpi("Activas", "$open", tone = if (open > 0) NxTone.Warning else NxTone.Success),
            NxKpi("Nuevas", "$newCount", tone = if (newCount > 0) NxTone.Info else NxTone.Neutral),
            NxKpi("Total", "${requests.size}", tone = NxTone.Brand),
        )
    }
    val filtered = remember(requests, filter, query) {
        val q = query.trim().lowercase()
        requests.filter { r ->
            val status = (r.status ?: "").uppercase()
            val matchFilter = when (filter) {
                "activas" -> status != "CLOSED"
                "cerradas" -> status == "CLOSED"
                "nuevas" -> status == "NEW"
                else -> true
            }
            val matchQuery = q.isBlank() || buildString {
                append(r.description); append(" ")
                append(r.branchName ?: ""); append(" ")
                append(r.urgency ?: ""); append(" ")
                append(r.status ?: "")
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
                itemCount = 5,
                itemHeight = 120.dp,
                modifier = Modifier.fillMaxWidth().padding(NxSpacing.ListPadding),
            )
            requests.isEmpty() && !state.error.isNullOrBlank() -> NxErrorState(
                message = state.error,
                onRetry = { vm.refresh(initial = true) },
            )
            else -> LazyColumn(
                modifier = Modifier.fillMaxSize(),
                contentPadding = PaddingValues(start = 16.dp, end = 16.dp, top = 12.dp, bottom = 96.dp),
                verticalArrangement = Arrangement.spacedBy(NxSpacing.ListGap),
            ) {
                state.message?.takeIf { it.isNotBlank() }?.let { msg ->
                    item(key = "message") {
                        NxAlertBanner(
                            NxAlert(
                                id = "message",
                                title = msg,
                                tone = NxTone.Success,
                                actionLabel = "Cerrar",
                                onAction = vm::dismissMessage,
                            ),
                        )
                    }
                }
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
                        title = "Solicitudes",
                        subtitle = "Levanta tickets y revisa el estatus de cada solicitud.",
                    )
                }

                item(key = "kpis") { NxKpiGrid(items = kpis, columns = 3) }

                item(key = "search") {
                    NxSearchField(
                        value = query,
                        onValueChange = { query = it },
                        placeholder = "Buscar descripción o sucursal",
                    )
                }

                item(key = "filters") {
                    NxFilterBar(contentPadding = PaddingValues(0.dp)) {
                        REQUEST_FILTERS.forEach { (key, label) ->
                            NxFilterPill(
                                label = label,
                                count = null,
                                selected = filter == key,
                                onClick = { filter = key },
                            )
                        }
                    }
                }

                if (filtered.isEmpty()) {
                    item(key = "empty") {
                        NxEmptyState(
                            title = if (requests.isEmpty()) "Sin solicitudes" else "Sin resultados",
                            subtitle = if (requests.isEmpty()) {
                                "Cuando levantes una solicitud aparecerá aquí."
                            } else {
                                "Ninguna solicitud coincide con el filtro o la búsqueda."
                            },
                            icon = Icons.Outlined.Inbox,
                        )
                    }
                } else {
                    items(filtered, key = { it.id }, contentType = { "request" }) { r ->
                        RequestCard(
                            request = r,
                            saving = state.saving,
                            onClose = { pending = PendingRequestAction(r.id, "close") },
                            onApprove = { vm.decideRequest(r.id, "APPROVED") },
                            onReject = { pending = PendingRequestAction(r.id, "reject") },
                        )
                    }
                }
            }
        }

        if (!state.isLoading) {
            ExtendedFloatingActionButton(
                onClick = onCreate,
                icon = { Icon(Icons.Default.Add, contentDescription = null) },
                text = { Text("Nueva solicitud") },
                containerColor = NxColors.Brand,
                contentColor = Color.White,
                modifier = Modifier
                    .align(Alignment.BottomEnd)
                    .padding(16.dp),
            )
        }
    }

    pending?.let { action ->
        val closing = action.kind == "close"
        AlertDialog(
            onDismissRequest = { pending = null },
            title = { Text(if (closing) "¿Cerrar solicitud?" else "¿Rechazar solicitud?") },
            text = {
                Text(
                    if (closing) {
                        "La solicitud dejará de estar activa. Esta acción no se puede deshacer."
                    } else {
                        "La solicitud quedará rechazada y no se atenderá."
                    },
                )
            },
            confirmButton = {
                TextButton(onClick = {
                    pending = null
                    if (closing) vm.closeRequest(action.id) else vm.decideRequest(action.id, "REJECTED")
                }) {
                    Text(if (closing) "Cerrar solicitud" else "Rechazar", color = NxColors.Danger, fontWeight = FontWeight.Bold)
                }
            },
            dismissButton = {
                TextButton(onClick = { pending = null }) { Text("Cancelar") }
            },
        )
    }
}

@Composable
private fun RequestCard(
    request: ClientTicketRequestDto,
    saving: Boolean,
    onClose: () -> Unit,
    onApprove: () -> Unit,
    onReject: () -> Unit,
) {
    val r = request
    val status = (r.status ?: "").uppercase()
    NxPanelShell {
        Row(
            Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.spacedBy(8.dp),
            verticalAlignment = Alignment.Top,
        ) {
            Text(
                r.branchName?.takeIf { it.isNotBlank() } ?: "Solicitud #${r.id}",
                style = MaterialTheme.typography.titleSmall,
                color = NxColors.Slate,
                maxLines = 2,
                overflow = TextOverflow.Ellipsis,
                modifier = Modifier.weight(1f),
            )
            NxStatusChip(requestStatusLabel(r.status), requestStatusTone(r.status))
        }
        Text(
            r.description,
            style = MaterialTheme.typography.bodyMedium,
            color = NxColors.Slate,
            modifier = Modifier.padding(top = 6.dp),
        )
        val meta = buildList {
            add(requestTypeLabel(r.requestType))
            NxStatusLabels.priority(r.urgency)?.let { add("Urgencia $it") }
            r.dueAt?.takeIf { it.isNotBlank() }?.let { add("Límite ${NxFormat.dateTime(it)}") }
            r.branchNumber?.takeIf { it.isNotBlank() }?.let { add("Sucursal $it") }
        }.joinToString(" · ")
        Text(
            meta,
            color = NxColors.Muted,
            style = MaterialTheme.typography.bodySmall,
            modifier = Modifier.padding(top = 4.dp),
        )
        if (status != "CLOSED") {
            Column(
                modifier = Modifier.padding(top = NxSpacing.M),
                verticalArrangement = Arrangement.spacedBy(NxSpacing.S),
            ) {
                if (status == "NEW") {
                    Row(horizontalArrangement = Arrangement.spacedBy(NxSpacing.S)) {
                        NxPrimaryButton(
                            text = "Autorizar",
                            onClick = onApprove,
                            enabled = !saving,
                            containerColor = NxColors.Success,
                            modifier = Modifier.weight(1f),
                        )
                        NxSecondaryButton(
                            text = "Rechazar",
                            onClick = onReject,
                            enabled = !saving,
                            contentColor = NxColors.Danger,
                            modifier = Modifier.weight(1f),
                        )
                    }
                }
                NxSecondaryButton(
                    text = "Cerrar solicitud",
                    onClick = onClose,
                    enabled = !saving,
                    contentColor = NxColors.Muted,
                    modifier = Modifier.fillMaxWidth(),
                )
            }
        }
    }
}
