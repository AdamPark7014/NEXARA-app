package mx.nexara.mobile.nativeapp.ui.integra

import android.app.Application
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FilterChip
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.pulltorefresh.PullToRefreshBox
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
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
import mx.nexara.mobile.nativeapp.data.api.toUserMessage
import mx.nexara.mobile.nativeapp.data.integra.IntegraRepository
import mx.nexara.mobile.nativeapp.ui.enterprise.NxColors
import mx.nexara.mobile.nativeapp.ui.enterprise.NxEmptyState
import mx.nexara.mobile.nativeapp.ui.enterprise.NxErrorBlock
import mx.nexara.mobile.nativeapp.ui.enterprise.NxLoadingBlock
import mx.nexara.mobile.nativeapp.ui.enterprise.NxSearchField
import mx.nexara.mobile.nativeapp.ui.enterprise.NxSectionHeader
import mx.nexara.mobile.nativeapp.ui.enterprise.NxStatusChip
import mx.nexara.mobile.nativeapp.ui.enterprise.NxTone
import mx.nexara.mobile.nativeapp.ui.integra.common.ALARM_HOUR_WINDOWS
import mx.nexara.mobile.nativeapp.ui.integra.common.AlarmGroup
import mx.nexara.mobile.nativeapp.ui.integra.common.AlarmSeverity
import mx.nexara.mobile.nativeapp.ui.integra.common.AlarmStatusFilter
import mx.nexara.mobile.nativeapp.ui.integra.common.IntegraConfirmDialog
import mx.nexara.mobile.nativeapp.ui.integra.common.IntegraDetailLine
import mx.nexara.mobile.nativeapp.ui.integra.common.IntegraFormat
import mx.nexara.mobile.nativeapp.ui.integra.common.IntegraNotice
import mx.nexara.mobile.nativeapp.ui.integra.common.IntegraOpMessage
import mx.nexara.mobile.nativeapp.ui.integra.common.IntegraSiteBar
import mx.nexara.mobile.nativeapp.ui.integra.common.IntegraSitesCache
import mx.nexara.mobile.nativeapp.ui.integra.common.SEVERITY_MIN_FILTERS
import mx.nexara.mobile.nativeapp.ui.integra.common.agruparAlarmas
import mx.nexara.mobile.nativeapp.ui.integra.common.alarmActions
import mx.nexara.mobile.nativeapp.ui.integra.common.alarmAlcanzaSeveridad
import mx.nexara.mobile.nativeapp.ui.integra.common.alarmKindLabel
import mx.nexara.mobile.nativeapp.ui.integra.common.alarmMatches
import mx.nexara.mobile.nativeapp.ui.integra.common.alarmPasaFiltro
import mx.nexara.mobile.nativeapp.ui.integra.common.alarmSeverityLabel
import mx.nexara.mobile.nativeapp.ui.integra.common.alarmSeverityTone
import mx.nexara.mobile.nativeapp.ui.integra.common.alarmSourceLabel
import mx.nexara.mobile.nativeapp.ui.integra.common.alarmStatusLabel
import mx.nexara.mobile.nativeapp.ui.integra.common.alarmStatusTone
import mx.nexara.mobile.nativeapp.ui.integra.common.alarmWindowLabel
import mx.nexara.mobile.nativeapp.ui.integra.common.esKindConocido
import mx.nexara.mobile.nativeapp.ui.integra.common.int
import mx.nexara.mobile.nativeapp.ui.integra.common.isAlarmPending
import mx.nexara.mobile.nativeapp.ui.integra.common.str
import mx.nexara.mobile.nativeapp.ui.integra.common.strOrNull
import mx.nexara.mobile.nativeapp.ui.integra.common.tituloTicketValido
import java.time.Instant
import java.time.ZoneId

/** Qué se va a hacer con la alarma seleccionada. */
enum class AlarmOp(val etiqueta: String, val verbo: String) {
    Atender("Marcar atendida", "atendiendo"),
    Cerrar("Cerrar alarma", "cerrando"),
    Escalar("Escalar a ticket OPS", "escalando"),
}

/**
 * Cola SOC.
 *
 * Atender o cerrar una alarma es una decisión de operación que queda firmada:
 * por eso, a diferencia de la web —donde un clic muta el estado sin preguntar—,
 * aquí hay confirmación explícita, la ventana no se cierra con la orden en
 * vuelo, y un segundo toque no manda una segunda petición.
 *
 * Los duplicados se agrupan en ventanas de cinco minutos: una puerta forzada
 * que repica quince veces tapaba las otras tres alarmas del turno.
 */
data class IntegraAlarmsUiState(
    val loading: Boolean = true,
    val isRefreshing: Boolean = false,
    val error: String? = null,
    val message: String? = null,
    val messageIsError: Boolean = false,
    val items: List<Map<String, Any?>> = emptyList(),
    val openCount: Int = 0,
    val source: String = "",
    val hours: Int = 24,
    val statusFilter: AlarmStatusFilter = AlarmStatusFilter.Pendientes,
    val severityMin: AlarmSeverity? = null,
    val query: String = "",
    val agrupar: Boolean = true,
    /** Grupo abierto en la ficha. `null` = la cola. */
    val selected: AlarmGroup? = null,
    val note: String = "",
    val ticketTitle: String = "",
    val ticketDescription: String = "",
    /** Operación pendiente de confirmar. */
    val pending: AlarmOp? = null,
    val sending: Boolean = false,
    val zone: ZoneId = IntegraFormat.MexicoCity,
)

class IntegraAlarmsViewModel(app: Application) : AndroidViewModel(app) {
    private val repo = IntegraRepository(app.applicationContext)
    private val _state = MutableStateFlow(IntegraAlarmsUiState(zone = ZoneId.systemDefault()))
    val state: StateFlow<IntegraAlarmsUiState> = _state

    init { refresh() }

    fun setQuery(v: String) = _state.update { it.copy(query = v) }
    fun setNote(v: String) = _state.update { it.copy(note = v) }
    fun setTicketTitle(v: String) = _state.update { it.copy(ticketTitle = v) }
    fun setTicketDescription(v: String) = _state.update { it.copy(ticketDescription = v) }
    fun setStatusFilter(v: AlarmStatusFilter) = _state.update { it.copy(statusFilter = v) }
    fun toggleAgrupar() = _state.update { it.copy(agrupar = !it.agrupar) }
    fun setSeverityMin(v: AlarmSeverity) = _state.update {
        it.copy(severityMin = if (it.severityMin == v) null else v)
    }

    fun setHours(h: Int) {
        if (_state.value.hours == h) return
        _state.update { it.copy(hours = h, items = emptyList()) }
        refresh()
    }

    fun selectSite(siteId: Int?) {
        repo.selectSite(siteId)
        _state.update { it.copy(items = emptyList(), selected = null) }
        refresh()
    }

    fun select(group: AlarmGroup?) = _state.update {
        val alarma = group?.representante
        it.copy(
            selected = group,
            message = null,
            pending = null,
            ticketTitle = alarma?.let { a -> "Alarma INTEGRA: " + str(a, "title") }.orEmpty(),
            ticketDescription = alarma?.let { a -> descripcionTicket(a, it.zone, it.note) }.orEmpty(),
        )
    }

    fun pedirConfirmacion(op: AlarmOp) = _state.update { it.copy(pending = op, message = null) }

    /** Cancelar sólo vale si no hay nada en vuelo. */
    fun cancelarConfirmacion() = _state.update { if (it.sending) it else it.copy(pending = null) }

    fun refresh(initial: Boolean = true) {
        _state.update {
            it.copy(loading = initial && it.items.isEmpty(), isRefreshing = !initial, error = null)
        }
        viewModelScope.launch {
            IntegraSitesCache.ensure(repo)
            try {
                val result = withContext(Dispatchers.IO) { repo.alarmQueue(hours = _state.value.hours) }
                _state.update {
                    it.copy(
                        loading = false,
                        isRefreshing = false,
                        items = result.items,
                        openCount = result.openCount,
                        source = result.source,
                    )
                }
            } catch (e: Exception) {
                _state.update {
                    it.copy(
                        loading = false,
                        isRefreshing = false,
                        error = e.toUserMessage("No se pudo cargar la cola de alarmas"),
                    )
                }
            }
        }
    }

    /**
     * Ejecuta la operación confirmada sobre **todos** los miembros del grupo:
     * si se fusionaron quince repeticiones, atender una y dejar catorce abiertas
     * dejaría la cola igual de sucia que antes.
     */
    fun confirmar() {
        val s = _state.value
        if (s.sending) return
        val op = s.pending ?: return
        val grupo = s.selected ?: return
        val ids = grupo.miembros.mapNotNull { strOrNull(it, "id") }
        if (ids.isEmpty()) {
            _state.update {
                it.copy(pending = null, message = "Esta alarma no trae identificador.", messageIsError = true)
            }
            return
        }
        if (op == AlarmOp.Escalar && !tituloTicketValido(s.ticketTitle)) {
            _state.update {
                it.copy(message = "El título del ticket necesita al menos 5 caracteres.", messageIsError = true)
            }
            return
        }
        _state.update { it.copy(sending = true) }
        viewModelScope.launch {
            try {
                withContext(Dispatchers.IO) {
                    when (op) {
                        AlarmOp.Atender -> ids.forEach { repo.ackAlarm(it, s.note) }
                        AlarmOp.Cerrar -> ids.forEach { repo.clearAlarm(it, s.note) }
                        // El ticket se abre una sola vez, sobre el representante:
                        // un incidente son N repeticiones, pero un ticket.
                        AlarmOp.Escalar -> repo.ticketAlarm(
                            alarmId = ids.first(),
                            title = s.ticketTitle,
                            description = s.ticketDescription,
                            severity = str(grupo.representante, "severity"),
                        )
                    }
                }
                _state.update {
                    it.copy(
                        sending = false,
                        pending = null,
                        selected = null,
                        note = "",
                        message = when (op) {
                            AlarmOp.Atender -> "Alarma marcada como atendida (${ids.size})"
                            AlarmOp.Cerrar -> "Alarma cerrada (${ids.size})"
                            AlarmOp.Escalar -> "Ticket OPS creado"
                        },
                        messageIsError = false,
                    )
                }
                refresh(initial = false)
            } catch (e: Exception) {
                // La orden pudo llegar: no se reintenta sola ni se cierra la ficha.
                _state.update {
                    it.copy(
                        sending = false,
                        pending = null,
                        message = e.toUserMessage("No se pudo completar la operación (${op.verbo})"),
                        messageIsError = true,
                    )
                }
            }
        }
    }

    private fun instante(alarm: Map<String, Any?>): Long? =
        IntegraFormat.parse(str(alarm, "timestamp"), _state.value.zone)?.toInstant()?.toEpochMilli()

    fun grupos(): List<AlarmGroup> {
        val s = _state.value
        val filtradas = s.items.filter { a ->
            alarmPasaFiltro(strOrNull(a, "status"), s.statusFilter) &&
                alarmAlcanzaSeveridad(strOrNull(a, "severity"), s.severityMin) &&
                alarmMatches(a, s.query)
        }
        val grupos = if (s.agrupar) {
            agruparAlarmas(filtradas) { instante(it) }
        } else {
            filtradas.map { AlarmGroup(it, listOf(it), (int(it, "occurrenceCount") ?: 1).coerceAtLeast(1)) }
        }
        // Lo más reciente primero; sin hora, al final.
        return grupos.sortedByDescending { instante(it.representante) ?: Long.MIN_VALUE }
    }

    fun pendientes(): Int = _state.value.items.count { isAlarmPending(strOrNull(it, "status")) }
}

/** Descripción del ticket OPS con lo que un técnico necesita saber sin abrir la app. */
private fun descripcionTicket(alarm: Map<String, Any?>, zone: ZoneId, note: String): String =
    buildList {
        add("Severidad: ${alarmSeverityLabel(strOrNull(alarm, "severity"))}")
        add("Tipo: ${alarmKindLabel(strOrNull(alarm, "kind"), strOrNull(alarm, "eventType"))}")
        add("Origen: ${alarmSourceLabel(alarm)}")
        strOrNull(alarm, "personName")?.let { add("Persona: $it") }
        add("Hora: ${IntegraFormat.dateTime(str(alarm, "timestamp"), zone)}")
        int(alarm, "occurrenceCount")?.takeIf { it > 1 }?.let { add("Repeticiones: $it") }
        note.trim().takeIf { it.isNotEmpty() }?.let { add("Nota: $it") }
        add("alarmId=${str(alarm, "id")}")
    }.joinToString("\n")

@OptIn(ExperimentalMaterial3Api::class, ExperimentalLayoutApi::class)
@Composable
fun IntegraAlarmsScreen(vm: IntegraAlarmsViewModel = viewModel()) {
    val s by vm.state.collectAsState()
    val sites by IntegraSitesCache.sites.collectAsState()
    val sitesLoading by IntegraSitesCache.loading.collectAsState()

    s.pending?.let { op ->
        val n = s.selected?.miembros?.size ?: 1
        IntegraConfirmDialog(
            title = op.etiqueta,
            message = when (op) {
                AlarmOp.Atender ->
                    "Vas a marcar como atendida${if (n > 1) " $n alarma(s) fusionada(s)" else " esta alarma"}. " +
                        "Queda registrado con tu usuario y deja de contar como pendiente."
                AlarmOp.Cerrar ->
                    "Vas a cerrar${if (n > 1) " $n alarma(s) fusionada(s)" else " esta alarma"}. " +
                        "Sale de la cola SOC; sólo volverá si el equipo la vuelve a disparar."
                AlarmOp.Escalar ->
                    "Se abrirá un ticket OPS con el título y la descripción de abajo. " +
                        "Si el sitio no tiene cliente operativo vinculado, el servidor lo rechazará."
            },
            confirmLabel = op.etiqueta,
            sending = s.sending,
            danger = op != AlarmOp.Atender,
            onConfirm = vm::confirmar,
            onDismiss = vm::cancelarConfirmacion,
        )
    }

    val seleccionada = s.selected
    if (seleccionada != null) {
        AlarmDetail(state = s, group = seleccionada, vm = vm)
        return
    }

    val grupos = vm.grupos()

    PullToRefreshBox(
        isRefreshing = s.isRefreshing,
        onRefresh = { vm.refresh(initial = false) },
        modifier = Modifier.fillMaxSize(),
    ) {
        when {
            s.loading -> NxLoadingBlock("Cargando alarmas…")
            s.error != null && s.items.isEmpty() -> NxErrorBlock(s.error.orEmpty()) { vm.refresh() }
            else -> LazyColumn(
                contentPadding = PaddingValues(16.dp),
                verticalArrangement = Arrangement.spacedBy(8.dp),
            ) {
                item {
                    IntegraSiteBar(sites = sites, loading = sitesLoading, onSelect = vm::selectSite)
                }
                item {
                    NxSectionHeader(
                        title = "Cola SOC",
                        subtitle = buildString {
                            append("${vm.pendientes()} pendiente(s) de ${s.items.size} en ${alarmWindowLabel(s.hours)}")
                            when (s.source) {
                                "push" -> append(" · empuje ACS")
                                "artemis" -> append(" · Artemis")
                                "mixed" -> append(" · ACS + Artemis")
                            }
                        },
                    )
                }
                item { IntegraOpMessage(s.message, s.messageIsError) }
                s.error?.let { err -> item { IntegraOpMessage(err, isError = true) } }

                item {
                    FlowRow(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                        AlarmStatusFilter.entries.forEach { f ->
                            FilterChip(
                                selected = s.statusFilter == f,
                                onClick = { vm.setStatusFilter(f) },
                                label = { Text(f.label) },
                            )
                        }
                    }
                }
                item {
                    FlowRow(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                        SEVERITY_MIN_FILTERS.forEach { sev ->
                            FilterChip(
                                selected = s.severityMin == sev,
                                onClick = { vm.setSeverityMin(sev) },
                                label = { Text("${sev.label} o más") },
                            )
                        }
                    }
                }
                item {
                    FlowRow(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                        ALARM_HOUR_WINDOWS.forEach { h ->
                            FilterChip(
                                selected = s.hours == h,
                                onClick = { vm.setHours(h) },
                                label = { Text(alarmWindowLabel(h)) },
                            )
                        }
                        FilterChip(
                            selected = s.agrupar,
                            onClick = vm::toggleAgrupar,
                            label = { Text(if (s.agrupar) "Duplicados agrupados" else "Una fila por alarma") },
                        )
                    }
                }
                item {
                    NxSearchField(
                        value = s.query,
                        onValueChange = vm::setQuery,
                        placeholder = "Título, persona, puerta o equipo…",
                    )
                }

                if (grupos.isEmpty()) {
                    item {
                        NxEmptyState(
                            if (s.items.isEmpty()) "Sin alarmas" else "Ninguna coincide",
                            if (s.items.isEmpty()) {
                                "La cola está vacía en ${alarmWindowLabel(s.hours)}."
                            } else {
                                "Ninguna de las ${s.items.size} alarmas cargadas pasa el filtro."
                            },
                        )
                    }
                } else {
                    items(grupos, key = { str(it.representante, "id") }) { g ->
                        AlarmCard(g, s.zone) { vm.select(g) }
                    }
                    item {
                        Text(
                            "${grupos.size} fila(s) · ${s.items.size} alarma(s) en la ventana.",
                            style = MaterialTheme.typography.labelSmall,
                            color = NxColors.Muted,
                        )
                    }
                }
            }
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun AlarmCard(group: AlarmGroup, zone: ZoneId, onOpen: () -> Unit) {
    val a = group.representante
    val severity = strOrNull(a, "severity")
    Card(
        onClick = onOpen,
        modifier = Modifier.fillMaxWidth(),
        colors = CardDefaults.cardColors(containerColor = NxColors.Card),
    ) {
        Column(Modifier.padding(14.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
            Row(
                Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Text(
                    str(a, "title").ifBlank {
                        alarmKindLabel(strOrNull(a, "kind"), strOrNull(a, "eventType")).ifBlank { "Alarma" }
                    },
                    fontWeight = FontWeight.SemiBold,
                    color = NxColors.Slate,
                    modifier = Modifier.weight(1f),
                )
                NxStatusChip(alarmSeverityLabel(severity), alarmSeverityTone(severity))
            }
            Text(
                listOf(strOrNull(a, "personName").orEmpty(), alarmSourceLabel(a))
                    .filter { it.isNotBlank() && it != IntegraFormat.EMPTY }
                    .joinToString(" · "),
                style = MaterialTheme.typography.bodySmall,
                color = NxColors.Muted,
            )
            Row(
                Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Text(
                    buildString {
                        append(IntegraFormat.relative(str(a, "timestamp"), zone, Instant.now()))
                        append(" · ${IntegraFormat.dateTime(str(a, "timestamp"), zone)}")
                        if (group.totalOcurrencias > 1) append(" · ×${group.totalOcurrencias}")
                    },
                    style = MaterialTheme.typography.labelSmall,
                    color = NxColors.Muted,
                    modifier = Modifier.weight(1f),
                )
                NxStatusChip(
                    alarmStatusLabel(strOrNull(a, "status")),
                    alarmStatusTone(strOrNull(a, "status")),
                )
            }
        }
    }
}

@Composable
private fun AlarmDetail(
    state: IntegraAlarmsUiState,
    group: AlarmGroup,
    vm: IntegraAlarmsViewModel,
) {
    val a = group.representante
    val kind = strOrNull(a, "kind")
    val ticketId = int(a, "ticketRequestId")
    val acciones = alarmActions(strOrNull(a, "status"), ticketId)

    LazyColumn(
        Modifier.fillMaxSize().padding(16.dp),
        verticalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        item {
            Text(
                str(a, "title").ifBlank { "Alarma" },
                style = MaterialTheme.typography.titleLarge,
                color = NxColors.Slate,
            )
        }
        item {
            Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                NxStatusChip(
                    alarmSeverityLabel(strOrNull(a, "severity")),
                    alarmSeverityTone(strOrNull(a, "severity")),
                )
                NxStatusChip(
                    alarmStatusLabel(strOrNull(a, "status")),
                    alarmStatusTone(strOrNull(a, "status")),
                )
                if (group.totalOcurrencias > 1) {
                    NxStatusChip("×${group.totalOcurrencias}", NxTone.Warning)
                }
            }
        }
        item { IntegraOpMessage(state.message, state.messageIsError) }

        item {
            IntegraDetailLine(
                "Tipo",
                alarmKindLabel(kind, strOrNull(a, "eventType")),
            )
        }
        item { IntegraDetailLine("Persona", str(a, "personName", "personId")) }
        item { IntegraDetailLine("Origen", alarmSourceLabel(a)) }
        item { IntegraDetailLine("Equipo", str(a, "deviceName", "deviceIp")) }
        item {
            IntegraDetailLine("Última vez", IntegraFormat.dateTime(str(a, "timestamp"), state.zone))
        }
        if (group.miembros.size > 1) {
            item {
                IntegraDetailLine(
                    "Primera del grupo",
                    IntegraFormat.dateTime(
                        str(group.miembros.minByOrNull { str(it, "timestamp") } ?: a, "timestamp"),
                        state.zone,
                    ),
                )
            }
        }
        item { IntegraDetailLine("Atendida", IntegraFormat.dateTime(str(a, "ackedAt"), state.zone)) }
        item { IntegraDetailLine("Cerrada", IntegraFormat.dateTime(str(a, "clearedAt"), state.zone)) }
        item { IntegraDetailLine("Nota del operador", str(a, "note")) }
        ticketId?.let { item { IntegraDetailLine("Ticket OPS", "#$it") } }
        item {
            IntegraDetailLine(
                "Origen del dato",
                when (str(a, "source")) {
                    "push" -> "Empuje ACS del terminal (verificado)"
                    "" -> IntegraFormat.EMPTY
                    else -> "Artemis · registro de eventos"
                },
            )
        }
        item { IntegraDetailLine("ID de alarma", str(a, "id")) }

        if (!kind.isNullOrBlank() && !esKindConocido(kind)) {
            item {
                IntegraNotice(
                    "Este panel no conoce el tipo «$kind». Se enseña tal cual en vez de " +
                        "meterlo en la caja equivocada.",
                    NxTone.Warning,
                )
            }
        }
        item {
            IntegraNotice(
                "El servidor guarda quién atendió cada alarma, pero no lo devuelve en esta " +
                    "consulta: por eso no aparece el nombre del operador.",
                NxTone.Neutral,
            )
        }

        item {
            OutlinedTextField(
                value = state.note,
                onValueChange = vm::setNote,
                modifier = Modifier.fillMaxWidth(),
                label = { Text("Nota (opcional)") },
                placeholder = { Text("Qué se comprobó, qué se hizo…") },
                minLines = 2,
                enabled = !state.sending,
            )
        }
        if (acciones.puedeAtender) {
            item {
                Button(
                    onClick = { vm.pedirConfirmacion(AlarmOp.Atender) },
                    enabled = !state.sending,
                    modifier = Modifier.fillMaxWidth(),
                ) { Text(AlarmOp.Atender.etiqueta) }
            }
        }
        if (acciones.puedeCerrar) {
            item {
                OutlinedButton(
                    onClick = { vm.pedirConfirmacion(AlarmOp.Cerrar) },
                    enabled = !state.sending,
                    modifier = Modifier.fillMaxWidth(),
                ) { Text(AlarmOp.Cerrar.etiqueta) }
            }
        }
        if (acciones.puedeEscalar) {
            item {
                OutlinedTextField(
                    value = state.ticketTitle,
                    onValueChange = vm::setTicketTitle,
                    modifier = Modifier.fillMaxWidth(),
                    label = { Text("Título del ticket") },
                    enabled = !state.sending,
                    isError = state.ticketTitle.isNotEmpty() && !tituloTicketValido(state.ticketTitle),
                    singleLine = true,
                )
            }
            item {
                OutlinedTextField(
                    value = state.ticketDescription,
                    onValueChange = vm::setTicketDescription,
                    modifier = Modifier.fillMaxWidth(),
                    label = { Text("Descripción") },
                    enabled = !state.sending,
                    minLines = 3,
                )
            }
            item {
                OutlinedButton(
                    onClick = { vm.pedirConfirmacion(AlarmOp.Escalar) },
                    enabled = !state.sending,
                    modifier = Modifier.fillMaxWidth(),
                ) { Text(AlarmOp.Escalar.etiqueta) }
            }
        } else if (ticketId != null) {
            item {
                IntegraNotice("Ya escalada al ticket OPS #$ticketId.", NxTone.Info)
            }
        }
        item {
            TextButton(
                onClick = { vm.select(null) },
                enabled = !state.sending,
                modifier = Modifier.fillMaxWidth(),
            ) { Text("Volver a la cola") }
        }
    }
}
