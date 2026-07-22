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
import androidx.compose.material3.FilterChip
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
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
import mx.nexara.mobile.nativeapp.data.api.ClientPortalTicketDto
import mx.nexara.mobile.nativeapp.data.realtime.refreshOnModels
import mx.nexara.mobile.nativeapp.data.tickets.TicketsRepository
import mx.nexara.mobile.nativeapp.ui.enterprise.NxKpi
import mx.nexara.mobile.nativeapp.ui.enterprise.NxKpiGrid
import mx.nexara.mobile.nativeapp.ui.enterprise.NxStatusChip
import mx.nexara.mobile.nativeapp.ui.enterprise.NxTone
import java.time.Instant
import java.time.temporal.ChronoUnit

data class TicketsTicketsUiState(
    val isLoading: Boolean = true,
    val error: String? = null,
    val tickets: List<ClientPortalTicketDto> = emptyList(),
)

class TicketsTicketsViewModel(app: Application) : AndroidViewModel(app) {
    private val repo = TicketsRepository(app.applicationContext)
    private val _state = MutableStateFlow(TicketsTicketsUiState())
    val state: StateFlow<TicketsTicketsUiState> = _state

    init {
        refresh()
        refreshOnModels(
            models = setOf("Activity", "ActivityEvidence", "ServiceSheet"),
            refresh = ::refresh,
        )
    }

    fun refresh() {
        _state.update { it.copy(isLoading = true, error = null) }
        viewModelScope.launch {
            try {
                val list = withContext(Dispatchers.IO) { repo.tickets() }
                _state.update { it.copy(isLoading = false, tickets = list, error = null) }
            } catch (e: Exception) {
                _state.update {
                    it.copy(
                        isLoading = false,
                        error = e.message?.takeIf { m -> m.isNotBlank() } ?: "No se pudieron cargar tickets",
                    )
                }
            }
        }
    }
}

@Composable
fun TicketsTicketsScreen(
    onBack: () -> Unit,
    onOpenTicket: (Long) -> Unit,
    modifier: Modifier = Modifier,
) {
    val vm: TicketsTicketsViewModel = viewModel()
    val state by vm.state.collectAsState()
    var query by remember { mutableStateOf("") }
    var filter by remember { mutableStateOf("todos") } // todos | abiertos | alta | aging

    Column(
        modifier = modifier
            .fillMaxSize()
            .padding(16.dp),
        verticalArrangement = Arrangement.Top,
    ) {
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp), modifier = Modifier.fillMaxWidth()) {
            OutlinedButton(onClick = onBack, modifier = Modifier.weight(1f)) { Text("Volver") }
            OutlinedButton(onClick = { vm.refresh() }, modifier = Modifier.weight(1f)) { Text("Actualizar") }
        }

        Spacer(Modifier.height(12.dp))
        Text("Tickets", style = MaterialTheme.typography.titleLarge, fontWeight = FontWeight.Bold)
        Text(
            "Prioridad · antigüedad · estado operativo",
            style = MaterialTheme.typography.bodySmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
        Spacer(Modifier.height(10.dp))

        if (state.isLoading) {
            Text("Cargando…", color = MaterialTheme.colorScheme.onSurfaceVariant)
            return@Column
        }

        if (!state.error.isNullOrBlank()) {
            Text(state.error!!, color = MaterialTheme.colorScheme.error)
            Spacer(Modifier.height(10.dp))
            Button(onClick = { vm.refresh() }) { Text("Reintentar") }
            return@Column
        }

        val open = state.tickets.count { it.isOpen() }
        val high = state.tickets.count { it.isOpen() && it.isHighPriority() }
        val aging = state.tickets.count { it.isOpen() && ticketAgeHours(it) >= 48 }
        NxKpiGrid(
            items = listOf(
                NxKpi("Abiertos", "$open", tone = if (open > 0) NxTone.Warning else NxTone.Success),
                NxKpi("Alta prioridad", "$high", tone = if (high > 0) NxTone.Danger else NxTone.Neutral),
                NxKpi(">48h", "$aging", hint = "Sin cierre", tone = if (aging > 0) NxTone.Danger else NxTone.Info),
                NxKpi("Total", "${state.tickets.size}", tone = NxTone.Brand),
            ),
        )
        Spacer(Modifier.height(10.dp))

        OutlinedTextField(
            value = query,
            onValueChange = { query = it },
            modifier = Modifier.fillMaxWidth(),
            placeholder = { Text("Buscar AN, título o sucursal") },
            singleLine = true,
        )
        Spacer(Modifier.height(8.dp))
        Row(
            Modifier.horizontalScroll(rememberScrollState()),
            horizontalArrangement = Arrangement.spacedBy(6.dp),
        ) {
            listOf(
                "todos" to "Todos",
                "abiertos" to "Abiertos",
                "alta" to "Alta",
                "aging" to ">48h",
            ).forEach { (key, label) ->
                FilterChip(
                    selected = filter == key,
                    onClick = { filter = key },
                    label = { Text(label) },
                )
            }
        }
        Spacer(Modifier.height(10.dp))

        val q = query.trim().lowercase()
        val filtered = state.tickets.filter { t ->
            val matchFilter = when (filter) {
                "abiertos" -> t.isOpen()
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

        if (filtered.isEmpty()) {
            Text("No hay tickets con este filtro.", color = MaterialTheme.colorScheme.onSurfaceVariant)
            return@Column
        }

        LazyColumn(
            modifier = Modifier.fillMaxWidth(),
            verticalArrangement = Arrangement.spacedBy(10.dp),
        ) {
            items(filtered, key = { it.id }) { t ->
                val ageH = ticketAgeHours(t)
                val tone = when {
                    !t.isOpen() -> NxTone.Success
                    t.isHighPriority() || ageH >= 72 -> NxTone.Danger
                    ageH >= 48 -> NxTone.Warning
                    else -> NxTone.Info
                }
                Card(
                    modifier = Modifier.fillMaxWidth(),
                    shape = RoundedCornerShape(14.dp),
                    colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
                    elevation = CardDefaults.cardElevation(2.dp),
                ) {
                    Column(Modifier.padding(12.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                            Text(
                                t.titulo ?: "Ticket #${t.id}",
                                style = MaterialTheme.typography.titleMedium,
                                fontWeight = FontWeight.SemiBold,
                                modifier = Modifier.weight(1f),
                            )
                            NxStatusChip(t.estatus ?: "—", tone)
                        }
                        val meta = buildList {
                            t.anNumber?.takeIf { it.isNotBlank() }?.let { add(it) }
                            t.displayPriority().takeIf { it != "—" }?.let { add("Prioridad $it") }
                            t.branchName?.takeIf { it.isNotBlank() }?.let { add(it) }
                            if (t.isOpen()) add("${ageH}h abiertos")
                        }.joinToString(" · ")
                        if (meta.isNotBlank()) {
                            Text(meta, color = MaterialTheme.colorScheme.onSurfaceVariant, style = MaterialTheme.typography.bodySmall)
                        }
                        if (t.isOpen() && ageH >= 48) {
                            Text(
                                "⚠ Fuera de ventana operativa (>48h)",
                                color = Color(0xFFEF4444),
                                style = MaterialTheme.typography.labelSmall,
                                fontWeight = FontWeight.SemiBold,
                            )
                        }
                        OutlinedButton(onClick = { onOpenTicket(t.id) }) { Text("Ver detalle") }
                    }
                }
            }
        }
    }
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
