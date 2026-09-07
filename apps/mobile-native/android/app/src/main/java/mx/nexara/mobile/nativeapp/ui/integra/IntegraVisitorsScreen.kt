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
import androidx.compose.material3.ScrollableTabRow
import androidx.compose.material3.Tab
import androidx.compose.material3.Text
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
import mx.nexara.mobile.nativeapp.ui.integra.common.IntegraConfirmDialog
import mx.nexara.mobile.nativeapp.ui.integra.common.IntegraDetailLine
import mx.nexara.mobile.nativeapp.ui.integra.common.IntegraFormat
import mx.nexara.mobile.nativeapp.ui.integra.common.IntegraNotice
import mx.nexara.mobile.nativeapp.ui.integra.common.IntegraOpMessage
import mx.nexara.mobile.nativeapp.ui.integra.common.IntegraSiteBar
import mx.nexara.mobile.nativeapp.ui.integra.common.IntegraSitesCache
import mx.nexara.mobile.nativeapp.ui.integra.common.VisitorStatus
import mx.nexara.mobile.nativeapp.ui.integra.common.WEEKDAYS
import mx.nexara.mobile.nativeapp.ui.integra.common.WEEKDAYS_LABORALES
import mx.nexara.mobile.nativeapp.ui.integra.common.ordenarVisitas
import mx.nexara.mobile.nativeapp.ui.integra.common.puedeCancelarVisita
import mx.nexara.mobile.nativeapp.ui.integra.common.str
import mx.nexara.mobile.nativeapp.ui.integra.common.stringList
import mx.nexara.mobile.nativeapp.ui.integra.common.strOrNull
import mx.nexara.mobile.nativeapp.ui.integra.common.validarVisitaRecurrente
import mx.nexara.mobile.nativeapp.ui.integra.common.visitorMatches
import mx.nexara.mobile.nativeapp.ui.integra.common.visitorStatus
import mx.nexara.mobile.nativeapp.ui.integra.common.weekdaysLabel
import java.time.Instant
import java.time.LocalDate
import java.time.ZoneId

/**
 * Visitantes.
 *
 * La pestaña que funciona en este parque es **Recurrentes**: `visitors/register`
 * y `visitors/search` son passthrough de Artemis y devuelven 400 en los sitios
 * ISAPI, que es lo que hay instalado. Por eso las citas puntuales avisan de la
 * limitación en vez de fallar en silencio, y el alta recurrente es el camino
 * principal: nombre, puertas, días, horario y vigencia se empujan al terminal.
 *
 * Cancelar una visita apaga el acceso de una persona en una puerta física, así
 * que pide confirmación y no se cierra con la orden en vuelo.
 */
data class IntegraVisitorsUiState(
    val loading: Boolean = true,
    val isRefreshing: Boolean = false,
    val error: String? = null,
    val message: String? = null,
    val messageIsError: Boolean = false,
    val recurring: List<Map<String, Any?>> = emptyList(),
    val appointments: List<Map<String, Any?>> = emptyList(),
    val appointmentsNote: String = "",
    val doors: List<Map<String, Any?>> = emptyList(),
    val note: String = "",
    val tab: Int = 0,
    val query: String = "",
    // ── Alta recurrente ──────────────────────────────────────────────────────
    val nombre: String = "",
    val telefono: String = "",
    val anfitrion: String = "",
    val puertas: Set<String> = emptySet(),
    val dias: List<String> = WEEKDAYS_LABORALES,
    val horaDesde: String = "09:00",
    val horaHasta: String = "18:00",
    val validFrom: String = "",
    val validTo: String = "",
    val creando: Boolean = false,
    /** Visita que se va a cancelar, pendiente de confirmar. */
    val cancelando: Map<String, Any?>? = null,
    val enviandoCancelacion: Boolean = false,
    val zone: ZoneId = IntegraFormat.MexicoCity,
)

class IntegraVisitorsViewModel(app: Application) : AndroidViewModel(app) {
    private val repo = IntegraRepository(app.applicationContext)
    private val _state = MutableStateFlow(estadoInicial())
    val state: StateFlow<IntegraVisitorsUiState> = _state

    init { refresh() }

    private fun estadoInicial(): IntegraVisitorsUiState {
        val zone = ZoneId.systemDefault()
        val hoy = LocalDate.now(zone)
        return IntegraVisitorsUiState(
            zone = zone,
            validFrom = hoy.toString(),
            validTo = hoy.plusDays(90).toString(),
        )
    }

    fun setTab(v: Int) = _state.update { it.copy(tab = v, message = null) }
    fun setQuery(v: String) = _state.update { it.copy(query = v) }
    fun setNombre(v: String) = _state.update { it.copy(nombre = v) }
    fun setTelefono(v: String) = _state.update { it.copy(telefono = v) }
    fun setAnfitrion(v: String) = _state.update { it.copy(anfitrion = v) }
    fun setHoraDesde(v: String) = _state.update { it.copy(horaDesde = v) }
    fun setHoraHasta(v: String) = _state.update { it.copy(horaHasta = v) }
    fun setValidFrom(v: String) = _state.update { it.copy(validFrom = v) }
    fun setValidTo(v: String) = _state.update { it.copy(validTo = v) }
    fun clearMessage() = _state.update { it.copy(message = null) }

    fun togglePuerta(id: String) = _state.update {
        it.copy(puertas = if (id in it.puertas) it.puertas - id else it.puertas + id)
    }

    fun toggleDia(dia: String) = _state.update {
        it.copy(dias = if (dia in it.dias) it.dias - dia else it.dias + dia)
    }

    fun diasLaborales() = _state.update { it.copy(dias = WEEKDAYS_LABORALES) }
    fun diasTodos() = _state.update { it.copy(dias = WEEKDAYS.map { d -> d.first }) }
    fun diasNinguno() = _state.update { it.copy(dias = emptyList()) }

    fun pedirCancelacion(v: Map<String, Any?>) = _state.update { it.copy(cancelando = v, message = null) }
    fun cancelarDialogo() = _state.update {
        if (it.enviandoCancelacion) it else it.copy(cancelando = null)
    }

    fun selectSite(siteId: Int?) {
        repo.selectSite(siteId)
        _state.update { it.copy(recurring = emptyList(), doors = emptyList(), puertas = emptySet()) }
        refresh()
    }

    fun refresh(initial: Boolean = true) {
        _state.update {
            it.copy(
                loading = initial && it.recurring.isEmpty(),
                isRefreshing = !initial,
                error = null,
            )
        }
        viewModelScope.launch {
            IntegraSitesCache.ensure(repo)
            try {
                val rec = withContext(Dispatchers.IO) { repo.recurringVisitors() }
                // El catálogo de puertas y las citas cloud son accesorios: si
                // fallan, el alta recurrente tiene que seguir siendo posible.
                val puertas = runCatching { withContext(Dispatchers.IO) { repo.doors() }.items }
                    .getOrDefault(emptyList())
                val citas = runCatching { withContext(Dispatchers.IO) { repo.visitorAppointments() } }
                _state.update {
                    it.copy(
                        loading = false,
                        isRefreshing = false,
                        recurring = rec.items,
                        note = rec.note,
                        doors = puertas,
                        appointments = citas.getOrDefault(emptyList()),
                        appointmentsNote = citas.exceptionOrNull()
                            ?.toUserMessage("Las citas puntuales no están disponibles en este sitio")
                            .orEmpty(),
                        puertas = it.puertas.ifEmpty { puertasPorDefecto(puertas) },
                    )
                }
            } catch (e: Exception) {
                _state.update {
                    it.copy(
                        loading = false,
                        isRefreshing = false,
                        error = e.toUserMessage("No se pudieron cargar las visitas"),
                    )
                }
            }
        }
    }

    /** Preselección con el mismo criterio que la web: sala de juntas o acceso general. */
    private fun puertasPorDefecto(doors: List<Map<String, Any?>>): Set<String> {
        val patron = Regex("junta|general|acceso|meeting", RegexOption.IGNORE_CASE)
        val elegidas = doors.filter { patron.containsMatchIn(str(it, "name", "doorName")) }
        return (elegidas.ifEmpty { doors.take(2) })
            .mapNotNull { strOrNull(it, "id", "doorIndexCode") }
            .toSet()
    }

    fun crear() {
        val s = _state.value
        if (s.creando) return
        if (s.puertas.isEmpty()) {
            _state.update { it.copy(message = "Elige al menos una puerta", messageIsError = true) }
            return
        }
        val validacion = validarVisitaRecurrente(
            visitorName = s.nombre,
            weekdays = s.dias,
            timeFrom = s.horaDesde,
            timeTo = s.horaHasta,
            validFrom = s.validFrom,
            validTo = s.validTo,
        )
        if (!validacion.ok) {
            _state.update { it.copy(message = validacion.error, messageIsError = true) }
            return
        }
        _state.update { it.copy(creando = true, message = null) }
        viewModelScope.launch {
            try {
                withContext(Dispatchers.IO) {
                    repo.createRecurringVisitor(
                        visitorName = s.nombre,
                        weekdays = s.dias,
                        timeFrom = s.horaDesde,
                        timeTo = s.horaHasta,
                        validFrom = s.validFrom,
                        validTo = s.validTo,
                        phone = s.telefono,
                        hostName = s.anfitrion,
                        doorIndexCodes = s.puertas.toList(),
                    )
                }
                // Puertas, días, horario y vigencia se conservan: dar de alta a
                // cuatro visitantes del mismo grupo es el caso normal.
                _state.update {
                    it.copy(
                        creando = false,
                        nombre = "",
                        telefono = "",
                        message = "Visita creada y empujada a los terminales",
                        messageIsError = false,
                        tab = 0,
                    )
                }
                refresh(initial = false)
            } catch (e: Exception) {
                _state.update {
                    it.copy(
                        creando = false,
                        message = e.toUserMessage("No se pudo crear la visita recurrente"),
                        messageIsError = true,
                    )
                }
            }
        }
    }

    fun confirmarCancelacion() {
        val s = _state.value
        if (s.enviandoCancelacion) return
        val visita = s.cancelando ?: return
        val id = strOrNull(visita, "id")
        if (id == null) {
            _state.update {
                it.copy(cancelando = null, message = "Esta visita no trae identificador", messageIsError = true)
            }
            return
        }
        _state.update { it.copy(enviandoCancelacion = true) }
        viewModelScope.launch {
            try {
                withContext(Dispatchers.IO) { repo.cancelRecurringVisitor(id) }
                _state.update {
                    it.copy(
                        enviandoCancelacion = false,
                        cancelando = null,
                        message = "Acceso deshabilitado en los terminales",
                        messageIsError = false,
                    )
                }
                refresh(initial = false)
            } catch (e: Exception) {
                _state.update {
                    it.copy(
                        enviandoCancelacion = false,
                        cancelando = null,
                        message = e.toUserMessage("No se pudo cancelar la visita"),
                        messageIsError = true,
                    )
                }
            }
        }
    }

    fun estadoDe(v: Map<String, Any?>): VisitorStatus {
        val zone = _state.value.zone
        return visitorStatus(
            raw = strOrNull(v, "status", "syncStatus"),
            validToEpochDay = IntegraFormat.epochDay(strOrNull(v, "validTo"), zone),
            nowEpochDay = Instant.now().atZone(zone).toLocalDate().toEpochDay(),
        )
    }

    fun visitasFiltradas(): List<Map<String, Any?>> {
        val q = _state.value.query
        val filtradas = _state.value.recurring.filter { visitorMatches(it, q) }
        return ordenarVisitas(filtradas, ::estadoDe)
    }

    fun nombreDePuerta(id: String): String = _state.value.doors
        .firstOrNull { strOrNull(it, "id", "doorIndexCode") == id }
        ?.let { str(it, "name", "doorName") }
        ?: id
}

@OptIn(ExperimentalMaterial3Api::class, ExperimentalLayoutApi::class)
@Composable
fun IntegraVisitorsScreen(vm: IntegraVisitorsViewModel = viewModel()) {
    val s by vm.state.collectAsState()
    val sites by IntegraSitesCache.sites.collectAsState()
    val sitesLoading by IntegraSitesCache.loading.collectAsState()

    s.cancelando?.let { visita ->
        IntegraConfirmDialog(
            title = "Cancelar la visita recurrente",
            message = "Se deshabilita el acceso de «${str(visita, "visitorName", "name")}» en los " +
                "terminales ACS. Dejará de poder abrir las puertas asignadas en su horario. " +
                "Para volver a darle acceso hay que crear otra visita.",
            confirmLabel = "Cancelar acceso",
            sending = s.enviandoCancelacion,
            onConfirm = vm::confirmarCancelacion,
            onDismiss = vm::cancelarDialogo,
        )
    }

    PullToRefreshBox(
        isRefreshing = s.isRefreshing,
        onRefresh = { vm.refresh(initial = false) },
        modifier = Modifier.fillMaxSize(),
    ) {
        when {
            s.loading -> NxLoadingBlock("Cargando visitas…")
            s.error != null && s.recurring.isEmpty() ->
                NxErrorBlock(s.error.orEmpty()) { vm.refresh() }
            else -> LazyColumn(
                contentPadding = PaddingValues(16.dp),
                verticalArrangement = Arrangement.spacedBy(8.dp),
            ) {
                item {
                    IntegraSiteBar(sites = sites, loading = sitesLoading, onSelect = vm::selectSite)
                }
                item {
                    ScrollableTabRow(selectedTabIndex = s.tab, edgePadding = 0.dp) {
                        Tab(
                            selected = s.tab == 0,
                            onClick = { vm.setTab(0) },
                            text = { Text("Recurrentes") },
                        )
                        Tab(
                            selected = s.tab == 1,
                            onClick = { vm.setTab(1) },
                            text = { Text("Nueva") },
                        )
                        Tab(
                            selected = s.tab == 2,
                            onClick = { vm.setTab(2) },
                            text = { Text("Citas puntuales") },
                        )
                    }
                }
                item { IntegraOpMessage(s.message, s.messageIsError) }

                when (s.tab) {
                    0 -> recurringTab(s, vm)
                    1 -> altaTab(s, vm)
                    else -> citasTab(s)
                }
            }
        }
    }
}

// ── Pestaña: listado ──────────────────────────────────────────────────────────

private fun androidx.compose.foundation.lazy.LazyListScope.recurringTab(
    s: IntegraVisitorsUiState,
    vm: IntegraVisitorsViewModel,
) {
    val visitas = vm.visitasFiltradas()
    item {
        NxSectionHeader(
            title = "Visitas recurrentes",
            subtitle = "${visitas.size} de ${s.recurring.size} · acceso limitado en terminales",
        )
    }
    item { IntegraNotice(s.note, NxTone.Info) }
    item {
        NxSearchField(
            value = s.query,
            onValueChange = vm::setQuery,
            placeholder = "Visitante, anfitrión o teléfono…",
        )
    }
    if (visitas.isEmpty()) {
        item {
            NxEmptyState(
                if (s.recurring.isEmpty()) "Sin visitas recurrentes" else "Ninguna coincide",
                if (s.recurring.isEmpty()) {
                    "Crea la primera en la pestaña «Nueva»: nombre, puertas, días y vigencia. " +
                        "Al guardar se empuja al control de acceso."
                } else {
                    "Ninguna de las ${s.recurring.size} visitas coincide con la búsqueda."
                },
            )
        }
    } else {
        items(visitas, key = { str(it, "id", "visitorName") }) { v ->
            VisitorCard(
                visita = v,
                estado = vm.estadoDe(v),
                zone = s.zone,
                nombreDePuerta = vm::nombreDePuerta,
                onCancelar = { vm.pedirCancelacion(v) },
            )
        }
    }
}

// ── Pestaña: alta ─────────────────────────────────────────────────────────────

private fun androidx.compose.foundation.lazy.LazyListScope.altaTab(
    s: IntegraVisitorsUiState,
    vm: IntegraVisitorsViewModel,
) {
    item {
        NxSectionHeader(
            title = "Nueva visita recurrente",
            subtitle = "Sólo abrirá las puertas marcadas, en los días y horas indicados",
        )
    }
    item {
        OutlinedTextField(
            value = s.nombre,
            onValueChange = vm::setNombre,
            label = { Text("Nombre del visitante") },
            modifier = Modifier.fillMaxWidth(),
            singleLine = true,
            enabled = !s.creando,
        )
    }
    item {
        OutlinedTextField(
            value = s.telefono,
            onValueChange = vm::setTelefono,
            label = { Text("Teléfono (opcional)") },
            modifier = Modifier.fillMaxWidth(),
            singleLine = true,
            enabled = !s.creando,
        )
    }
    item {
        OutlinedTextField(
            value = s.anfitrion,
            onValueChange = vm::setAnfitrion,
            label = { Text("Anfitrión (opcional)") },
            modifier = Modifier.fillMaxWidth(),
            singleLine = true,
            enabled = !s.creando,
        )
    }
    item {
        NxSectionHeader(
            title = "Puertas con acceso",
            subtitle = "${s.puertas.size} seleccionada(s) de ${s.doors.size}",
        )
    }
    if (s.doors.isEmpty()) {
        item {
            IntegraNotice(
                "No hay puertas en el espejo de este sitio. Sincroniza desde la consola web " +
                    "antes de dar de alta una visita: sin puertas, el acceso no abre nada.",
                NxTone.Warning,
            )
        }
    } else {
        item {
            @OptIn(ExperimentalLayoutApi::class)
            FlowRow(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                s.doors.forEach { d ->
                    val id = str(d, "id", "doorIndexCode")
                    FilterChip(
                        selected = id in s.puertas,
                        onClick = { vm.togglePuerta(id) },
                        enabled = !s.creando,
                        label = { Text(str(d, "name", "doorName").ifBlank { id }) },
                    )
                }
            }
        }
    }
    item { NxSectionHeader(title = "Días de la semana", subtitle = weekdaysLabel(s.dias)) }
    item {
        @OptIn(ExperimentalLayoutApi::class)
        FlowRow(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
            WEEKDAYS.forEach { (clave, etiqueta) ->
                FilterChip(
                    selected = clave in s.dias,
                    onClick = { vm.toggleDia(clave) },
                    enabled = !s.creando,
                    label = { Text(etiqueta) },
                )
            }
        }
    }
    item {
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            OutlinedButton(onClick = vm::diasLaborales, enabled = !s.creando, modifier = Modifier.weight(1f)) {
                Text("Lun–Vie")
            }
            OutlinedButton(onClick = vm::diasTodos, enabled = !s.creando, modifier = Modifier.weight(1f)) {
                Text("Todos")
            }
            OutlinedButton(onClick = vm::diasNinguno, enabled = !s.creando, modifier = Modifier.weight(1f)) {
                Text("Limpiar")
            }
        }
    }
    item {
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            OutlinedTextField(
                value = s.horaDesde,
                onValueChange = vm::setHoraDesde,
                label = { Text("Desde") },
                placeholder = { Text("09:00") },
                modifier = Modifier.weight(1f),
                singleLine = true,
                enabled = !s.creando,
            )
            OutlinedTextField(
                value = s.horaHasta,
                onValueChange = vm::setHoraHasta,
                label = { Text("Hasta") },
                placeholder = { Text("18:00") },
                modifier = Modifier.weight(1f),
                singleLine = true,
                enabled = !s.creando,
            )
        }
    }
    item {
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            OutlinedTextField(
                value = s.validFrom,
                onValueChange = vm::setValidFrom,
                label = { Text("Vigencia desde") },
                placeholder = { Text("AAAA-MM-DD") },
                modifier = Modifier.weight(1f),
                singleLine = true,
                enabled = !s.creando,
            )
            OutlinedTextField(
                value = s.validTo,
                onValueChange = vm::setValidTo,
                label = { Text("Vigencia hasta") },
                placeholder = { Text("AAAA-MM-DD") },
                modifier = Modifier.weight(1f),
                singleLine = true,
                enabled = !s.creando,
            )
        }
    }
    item { IntegraOpMessage(s.message, s.messageIsError) }
    item {
        Button(
            onClick = vm::crear,
            enabled = !s.creando && s.doors.isNotEmpty(),
            modifier = Modifier.fillMaxWidth(),
        ) {
            Text(if (s.creando) "Creando acceso…" else "Crear visita recurrente")
        }
    }
    item {
        Text(
            "El nombre y el teléfono se limpian al guardar; puertas, días, horario y vigencia " +
                "se conservan para dar de alta al resto del grupo.",
            style = MaterialTheme.typography.labelSmall,
            color = NxColors.Muted,
        )
    }
}

// ── Pestaña: citas puntuales ──────────────────────────────────────────────────

private fun androidx.compose.foundation.lazy.LazyListScope.citasTab(s: IntegraVisitorsUiState) {
    item {
        NxSectionHeader(
            title = "Citas puntuales",
            subtitle = "Módulo cloud (Artemis) · últimas 8 horas",
        )
    }
    item {
        IntegraNotice(
            "Las citas puntuales viven en el módulo cloud de Artemis. En un sitio ISAPI —lo que " +
                "hay instalado aquí— el servidor las rechaza: para dar acceso usa la pestaña " +
                "«Nueva», que empuja el permiso al terminal.",
            NxTone.Warning,
        )
    }
    if (s.appointmentsNote.isNotBlank()) {
        item { IntegraOpMessage(s.appointmentsNote, isError = true) }
    }
    if (s.appointments.isEmpty()) {
        item {
            NxEmptyState(
                "Sin citas",
                "No hay visitas en el rango reciente, o este sitio no usa el módulo cloud.",
            )
        }
    } else {
        items(s.appointments, key = { str(it, "orderId", "appointRecordId", "id") }) { cita ->
            Card(
                modifier = Modifier.fillMaxWidth(),
                colors = CardDefaults.cardColors(containerColor = NxColors.Card),
            ) {
                Column(Modifier.padding(14.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                    Text(
                        str(cita, "visitorName", "personName", "name").ifBlank { "Visitante" },
                        fontWeight = FontWeight.SemiBold,
                        color = NxColors.Slate,
                    )
                    Text(
                        listOf(
                            IntegraFormat.dateTime(str(cita, "visitStartTime"), s.zone),
                            IntegraFormat.dateTime(str(cita, "visitEndTime"), s.zone),
                        ).filter { it != IntegraFormat.EMPTY }.joinToString(" → "),
                        style = MaterialTheme.typography.bodySmall,
                        color = NxColors.Muted,
                    )
                    Text(
                        str(cita, "visitPurpose", "purpose", "status"),
                        style = MaterialTheme.typography.labelSmall,
                        color = NxColors.Muted,
                    )
                }
            }
        }
    }
}

@Composable
private fun VisitorCard(
    visita: Map<String, Any?>,
    estado: VisitorStatus,
    zone: ZoneId,
    nombreDePuerta: (String) -> String,
    onCancelar: () -> Unit,
) {
    val puertas = stringList(visita, "doorNames").ifEmpty {
        stringList(visita, "doorIndexCodes", "doorIds").map(nombreDePuerta)
    }
    Card(
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
                    str(visita, "visitorName", "name").ifBlank { "Visitante" },
                    fontWeight = FontWeight.SemiBold,
                    color = NxColors.Slate,
                    modifier = Modifier.weight(1f),
                )
                NxStatusChip(estado.label, estado.tone)
            }
            IntegraDetailLine(
                "Ritmo",
                "${weekdaysLabel(stringList(visita, "weekdays"))} · " +
                    "${str(visita, "timeFrom").take(5)}–${str(visita, "timeTo").take(5)}",
            )
            IntegraDetailLine(
                "Vigencia",
                listOf(
                    IntegraFormat.isoDate(str(visita, "validFrom"), zone),
                    IntegraFormat.isoDate(str(visita, "validTo"), zone),
                ).filter { it.isNotBlank() }.joinToString(" → "),
            )
            if (puertas.isNotEmpty()) {
                IntegraDetailLine("Puertas", puertas.joinToString(" · "))
            }
            IntegraDetailLine(
                "Contacto",
                listOf(str(visita, "hostName", "hostEmployeeName"), str(visita, "phone"))
                    .filter { it.isNotBlank() }.joinToString(" · "),
            )
            if (puedeCancelarVisita(estado)) {
                OutlinedButton(onClick = onCancelar, modifier = Modifier.fillMaxWidth()) {
                    Text("Cancelar acceso", color = NxColors.Danger)
                }
            }
        }
    }
}
