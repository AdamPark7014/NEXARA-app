package mx.nexara.mobile.nativeapp.ui.tickets.screens

import android.app.Application
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FilterChip
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.material3.pulltorefresh.PullToRefreshBox
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
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
import mx.nexara.mobile.nativeapp.data.realtime.refreshOnModels
import mx.nexara.mobile.nativeapp.data.tickets.TicketsRepository
import mx.nexara.mobile.nativeapp.ui.enterprise.NxKpi
import mx.nexara.mobile.nativeapp.ui.enterprise.NxKpiGrid
import mx.nexara.mobile.nativeapp.ui.enterprise.NxLoadingBlock
import mx.nexara.mobile.nativeapp.ui.enterprise.NxStatusChip
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
                        error = e.message?.takeIf { m -> m.isNotBlank() } ?: "No se pudieron cargar solicitudes",
                    )
                }
            }
        }
    }

    fun dismissMessage() = _state.update { it.copy(message = null) }

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
                        error = e.message?.takeIf { m -> m.isNotBlank() } ?: "No se pudo cerrar la solicitud",
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
                        error = e.message?.takeIf { m -> m.isNotBlank() } ?: "No se pudo actualizar la solicitud",
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

private fun requestTypeLabel(type: String?): String = when (type?.uppercase()) {
    "PREVENTIVE_INVENTORY" -> "Mantenimiento e inventario"
    "ISSUE" -> "Ticket por problema"
    else -> type ?: "—"
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun TicketsRequestsScreen(
    onBack: () -> Unit,
    onCreate: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val vm: TicketsRequestsViewModel = viewModel()
    val state by vm.state.collectAsState()
    var filter by remember { mutableStateOf("activas") }
    var query by remember { mutableStateOf("") }

    Column(modifier = modifier.fillMaxSize()) {
        Row(
            horizontalArrangement = Arrangement.spacedBy(8.dp),
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = 16.dp, vertical = 16.dp),
        ) {
            OutlinedButton(onClick = onBack, modifier = Modifier.weight(1f)) { Text("Volver") }
            OutlinedButton(onClick = { vm.refresh(initial = false) }, modifier = Modifier.weight(1f)) { Text("Actualizar") }
            Button(onClick = onCreate, modifier = Modifier.weight(1f)) { Text("+ Nueva") }
        }

        if (state.isLoading) {
            NxLoadingBlock("Cargando solicitudes…")
            return@Column
        }

        PullToRefreshBox(
            isRefreshing = state.isRefreshing,
            onRefresh = { vm.refresh(initial = false) },
            modifier = Modifier.fillMaxSize(),
        ) {
            LazyColumn(
                modifier = Modifier
                    .fillMaxSize()
                    .padding(horizontal = 16.dp),
                verticalArrangement = Arrangement.spacedBy(10.dp),
            ) {
                item {
                    Text("Solicitudes", style = MaterialTheme.typography.titleLarge, fontWeight = FontWeight.Bold)
                    Text(
                        "Levanta tickets y revisa el estatus de cada solicitud",
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }

                if (!state.message.isNullOrBlank()) {
                    item {
                        Text(state.message!!, color = MaterialTheme.colorScheme.primary)
                        OutlinedButton(onClick = vm::dismissMessage) { Text("Cerrar aviso") }
                    }
                }

                if (!state.error.isNullOrBlank()) {
                    item {
                        Text(state.error!!, color = MaterialTheme.colorScheme.error)
                        Button(onClick = { vm.refresh(initial = true) }) { Text("Reintentar") }
                    }
                }

                item {
                    val open = state.requests.count { (it.status ?: "").uppercase() != "CLOSED" }
                    val newCount = state.requests.count { (it.status ?: "").uppercase() == "NEW" }
                    NxKpiGrid(
                        items = listOf(
                            NxKpi("Activas", "$open", tone = if (open > 0) NxTone.Warning else NxTone.Success),
                            NxKpi("Nuevas", "$newCount", tone = if (newCount > 0) NxTone.Info else NxTone.Neutral),
                            NxKpi("Total", "${state.requests.size}", tone = NxTone.Brand),
                        ),
                    )
                }

                item {
                    OutlinedTextField(
                        value = query,
                        onValueChange = { query = it },
                        modifier = Modifier.fillMaxWidth(),
                        placeholder = { Text("Buscar descripción o sucursal") },
                        singleLine = true,
                    )
                }

                item {
                    Row(
                        Modifier.horizontalScroll(rememberScrollState()),
                        horizontalArrangement = Arrangement.spacedBy(6.dp),
                    ) {
                        listOf(
                            "activas" to "Activas",
                            "nuevas" to "Nuevas",
                            "cerradas" to "Cerradas",
                            "todas" to "Todas",
                        ).forEach { (key, label) ->
                            FilterChip(
                                selected = filter == key,
                                onClick = { filter = key },
                                label = { Text(label) },
                            )
                        }
                    }
                }

                val q = query.trim().lowercase()
                val filtered = state.requests.filter { r ->
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

                if (filtered.isEmpty()) {
                    item {
                        Text("No hay solicitudes con este filtro.", color = MaterialTheme.colorScheme.onSurfaceVariant)
                    }
                } else {
                    items(filtered, key = { it.id }) { r ->
                        Card(
                            modifier = Modifier.fillMaxWidth(),
                            shape = RoundedCornerShape(14.dp),
                            colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
                            elevation = CardDefaults.cardElevation(2.dp),
                        ) {
                            Column(Modifier.padding(12.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                                Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                                    Text(
                                        r.branchName ?: "Solicitud #${r.id}",
                                        style = MaterialTheme.typography.titleSmall,
                                        fontWeight = FontWeight.SemiBold,
                                        modifier = Modifier.weight(1f),
                                    )
                                    NxStatusChip(r.status ?: "—", requestStatusTone(r.status))
                                }
                                Text(r.description, style = MaterialTheme.typography.bodyMedium)
                                Text(
                                    "Flujo: ${requestTypeLabel(r.requestType)}",
                                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                                    style = MaterialTheme.typography.bodySmall,
                                )
                                val meta = buildList {
                                    r.urgency?.takeIf { it.isNotBlank() }?.let { add("Urgencia: $it") }
                                    r.dueAt?.takeIf { it.isNotBlank() }?.let { add("Límite: $it") }
                                    r.branchNumber?.takeIf { it.isNotBlank() }?.let { add("No. $it") }
                                }.joinToString(" · ")
                                if (meta.isNotBlank()) {
                                    Text(meta, color = MaterialTheme.colorScheme.onSurfaceVariant, style = MaterialTheme.typography.bodySmall)
                                }
                                val status = (r.status ?: "").uppercase()
                                if (status != "CLOSED") {
                                    Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                                        OutlinedButton(
                                            onClick = { vm.closeRequest(r.id) },
                                            enabled = !state.saving,
                                        ) { Text(if (state.saving) "…" else "Cerrar") }
                                        if (status == "NEW") {
                                            Button(
                                                onClick = { vm.decideRequest(r.id, "APPROVED") },
                                                enabled = !state.saving,
                                            ) { Text("Autorizar") }
                                            OutlinedButton(
                                                onClick = { vm.decideRequest(r.id, "REJECTED") },
                                                enabled = !state.saving,
                                            ) { Text("Rechazar") }
                                        }
                                    }
                                }
                            }
                        }
                    }
                }

                item { Spacer(Modifier.height(8.dp)) }
            }
        }
    }
}
