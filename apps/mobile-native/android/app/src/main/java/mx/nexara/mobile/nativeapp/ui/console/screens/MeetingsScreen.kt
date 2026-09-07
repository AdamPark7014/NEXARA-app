package mx.nexara.mobile.nativeapp.ui.console.screens

import android.app.Application
import androidx.compose.foundation.background
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Checkbox
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
import mx.nexara.mobile.nativeapp.access.RolePanelMatrix
import mx.nexara.mobile.nativeapp.data.AuthRepository
import mx.nexara.mobile.nativeapp.data.api.MeetingAgreementDto
import mx.nexara.mobile.nativeapp.data.api.MeetingAttendeeMark
import mx.nexara.mobile.nativeapp.data.api.MeetingCatalog
import mx.nexara.mobile.nativeapp.data.api.MeetingDetailDto
import mx.nexara.mobile.nativeapp.data.api.MeetingDto
import mx.nexara.mobile.nativeapp.data.api.VisibleUserDto
import mx.nexara.mobile.nativeapp.data.api.toUserMessage
import mx.nexara.mobile.nativeapp.data.console.ConsoleRepository
import mx.nexara.mobile.nativeapp.data.meetings.MeetingsRepository
import mx.nexara.mobile.nativeapp.ui.console.util.MeetingForms
import mx.nexara.mobile.nativeapp.ui.enterprise.NxColors
import mx.nexara.mobile.nativeapp.ui.enterprise.NxEmptyState
import mx.nexara.mobile.nativeapp.ui.enterprise.NxErrorBlock
import mx.nexara.mobile.nativeapp.ui.enterprise.NxKpi
import mx.nexara.mobile.nativeapp.ui.enterprise.NxKpiCard
import mx.nexara.mobile.nativeapp.ui.enterprise.NxListRow
import mx.nexara.mobile.nativeapp.ui.enterprise.NxLoadingBlock
import mx.nexara.mobile.nativeapp.ui.enterprise.NxPanelShell
import mx.nexara.mobile.nativeapp.ui.enterprise.NxSearchField
import mx.nexara.mobile.nativeapp.ui.enterprise.NxSectionHeader
import mx.nexara.mobile.nativeapp.ui.enterprise.NxStatusChip
import mx.nexara.mobile.nativeapp.ui.enterprise.NxTone
import java.time.LocalDate

/**
 * Ritmo operativo — reuniones, acuerdos y lecciones aprendidas.
 *
 * El módulo no existía en el móvil. La junta diaria de las 10:00, los acuerdos
 * que salen de ella y las lecciones de la junta del viernes sólo se podían
 * consultar desde la web, así que quien está en campo —que es justo quien tiene
 * los acuerdos asignados— no podía ni ver los suyos ni moverlos.
 *
 * Cuatro pestañas, las mismas que la web (`/erp/reuniones`):
 *
 *  · **Mis acuerdos** — la pantalla de entrada. Lo que me toca a mí, no el
 *    archivo de juntas.
 *  · **Reuniones** — convocar, pasar lista, registrar acuerdos y cerrar con
 *    minuta.
 *  · **Vencidos** — el tablero con el que arranca la junta de cierre.
 *  · **Lecciones** — buscable, para que dejen de decirse el viernes y
 *    olvidarse el lunes.
 *
 * Quién puede escribir lo decide el rol, igual que en `url-matrix.ts`: todo el
 * personal mueve **lo suyo**; sólo quien conduce la reunión convoca, cierra y
 * registra acuerdos ajenos. Enseñar «Convocar» a quien va a recibir un 403 es
 * peor que no enseñarlo.
 */

enum class MeetingsTab(val label: String) {
    Mios("Mis acuerdos"),
    Reuniones("Reuniones"),
    Vencidos("Vencidos"),
    Lecciones("Lecciones"),
}

data class MeetingsUiState(
    val loading: Boolean = true,
    val isRefreshing: Boolean = false,
    val error: String? = null,
    val tab: MeetingsTab = MeetingsTab.Mios,
    val canLead: Boolean = false,
    val myUserId: Long? = null,

    val mios: List<MeetingAgreementDto> = emptyList(),
    val miosVencidos: Int = 0,
    val meetings: List<MeetingDto> = emptyList(),
    val vencidos: List<MeetingAgreementDto> = emptyList(),
    val lecciones: List<MeetingAgreementDto> = emptyList(),
    val leccionesQuery: String = "",

    /** Detalle abierto; `null` = estamos en la lista. */
    val detail: MeetingDetailDto? = null,
    val detailLoading: Boolean = false,

    val showConvocar: Boolean = false,
    val staff: List<VisibleUserDto> = emptyList(),

    val busy: Boolean = false,
    val actionMessage: String? = null,
) {
    val proximas: Int get() = meetings.count { !it.isClosed }
}

class MeetingsViewModel(app: Application) : AndroidViewModel(app) {

    private val repo = MeetingsRepository(app.applicationContext)
    private val consoleRepo = ConsoleRepository(app.applicationContext)
    private val authRepo = AuthRepository(app.applicationContext)

    private val _state = MutableStateFlow(MeetingsUiState())
    val state: StateFlow<MeetingsUiState> = _state

    init {
        loadSessionFacts()
        refresh()
    }

    /**
     * Quién soy y qué puedo hacer.
     *
     * Se resuelve en el ViewModel y no dentro de un `remember`: leer la sesión
     * del disco mientras se compone bloquea el hilo principal y además se
     * perdía al rotar.
     */
    private fun loadSessionFacts() {
        viewModelScope.launch {
            val session = withContext(Dispatchers.IO) { runCatching { authRepo.loadSession() }.getOrNull() }
            val canonical = RolePanelMatrix.canonicalRoleKey(
                roleKey = session?.roleKey,
                orgRoleKey = session?.orgRoleKey,
                roleDisplayName = session?.role,
            )
            _state.update {
                it.copy(
                    myUserId = session?.id,
                    canLead = MeetingForms.canLeadMeetings(canonical, session?.isSuperAdmin == true),
                )
            }
        }
    }

    fun setTab(tab: MeetingsTab) {
        _state.update { it.copy(tab = tab, actionMessage = null) }
        // Vencidos y lecciones se piden cuando se miran: son dos consultas que
        // no hacen falta para abrir la pantalla.
        when (tab) {
            MeetingsTab.Vencidos -> if (_state.value.vencidos.isEmpty()) loadOverdue()
            MeetingsTab.Lecciones -> if (_state.value.lecciones.isEmpty()) loadLessons()
            else -> Unit
        }
    }

    fun setLeccionesQuery(value: String) {
        _state.update { it.copy(leccionesQuery = value) }
    }

    /**
     * Carga inicial y refresco.
     *
     * Cada bloque falla por su cuenta: que no se puedan leer las reuniones no
     * puede vaciar «Mis acuerdos». El error se enseña arriba y la pantalla
     * conserva lo que ya tenía — nunca se borra el contenido por un fallo de
     * red.
     */
    fun refresh(initial: Boolean = true) {
        _state.update {
            it.copy(
                loading = initial && it.mios.isEmpty() && it.meetings.isEmpty(),
                isRefreshing = !initial,
                error = null,
            )
        }
        viewModelScope.launch {
            var firstError: String? = null

            val mine = withContext(Dispatchers.IO) { runCatching { repo.myAgreements() } }
            mine.onFailure { firstError = firstError ?: it.toUserMessage("No se pudieron cargar tus acuerdos") }

            val juntas = withContext(Dispatchers.IO) { runCatching { repo.meetings() } }
            juntas.onFailure { firstError = firstError ?: it.toUserMessage("No se pudieron cargar las reuniones") }

            _state.update { s ->
                s.copy(
                    loading = false,
                    isRefreshing = false,
                    error = firstError,
                    mios = mine.getOrNull()?.acuerdos ?: s.mios,
                    miosVencidos = mine.getOrNull()?.vencidos ?: s.miosVencidos,
                    meetings = juntas.getOrNull() ?: s.meetings,
                )
            }
        }
    }

    private fun loadOverdue() {
        viewModelScope.launch {
            val result = withContext(Dispatchers.IO) { runCatching { repo.overdueAgreements() } }
            _state.update { s ->
                result.fold(
                    onSuccess = { s.copy(vencidos = it) },
                    onFailure = { s.copy(error = it.toUserMessage("No se pudieron cargar los acuerdos vencidos")) },
                )
            }
        }
    }

    fun loadLessons() {
        val q = _state.value.leccionesQuery
        viewModelScope.launch {
            val result = withContext(Dispatchers.IO) { runCatching { repo.lessons(q) } }
            _state.update { s ->
                result.fold(
                    onSuccess = { s.copy(lecciones = it) },
                    onFailure = { s.copy(error = it.toUserMessage("No se pudieron cargar las lecciones")) },
                )
            }
        }
    }

    // ── Detalle ───────────────────────────────────────────────────────────

    fun openMeeting(id: Long) {
        _state.update { it.copy(detailLoading = true, actionMessage = null) }
        viewModelScope.launch {
            val result = withContext(Dispatchers.IO) { runCatching { repo.meeting(id) } }
            _state.update { s ->
                result.fold(
                    onSuccess = { s.copy(detailLoading = false, detail = it) },
                    onFailure = {
                        s.copy(
                            detailLoading = false,
                            actionMessage = "❌ ${it.toUserMessage("No se pudo abrir la reunión")}",
                        )
                    },
                )
            }
        }
    }

    fun closeDetail() = _state.update { it.copy(detail = null, actionMessage = null) }

    /** Toda mutación del detalle pasa por aquí: el API devuelve el acta entera. */
    private fun mutateDetail(okMessage: String, fallback: String, block: suspend () -> MeetingDetailDto) {
        _state.update { it.copy(busy = true, actionMessage = null) }
        viewModelScope.launch {
            val result = withContext(Dispatchers.IO) { runCatching { block() } }
            _state.update { s ->
                result.fold(
                    onSuccess = { s.copy(busy = false, detail = it, actionMessage = "✅ $okMessage") },
                    onFailure = { s.copy(busy = false, actionMessage = "❌ ${it.toUserMessage(fallback)}") },
                )
            }
            if (result.isSuccess) refresh(initial = false)
        }
    }

    fun addAgreement(tipo: String, descripcion: String, responsableId: Long?, fechaCompromiso: String) {
        val meetingId = _state.value.detail?.meeting?.id ?: return
        when (val v = MeetingForms.validateAgreement(tipo, descripcion, responsableId, fechaCompromiso)) {
            is MeetingForms.Result.Invalid -> _state.update { it.copy(actionMessage = "❌ ${v.message}") }
            is MeetingForms.Result.Valid -> {
                val d = v.value
                mutateDetail("Registrado", "No se pudo registrar") {
                    repo.addAgreement(
                        meetingId = meetingId,
                        tipo = d.tipo,
                        descripcion = d.descripcion,
                        responsableId = d.responsableId,
                        fechaCompromiso = d.fechaCompromiso,
                    )
                }
            }
        }
    }

    fun setAgreementStatus(agreementId: Long, estado: String) {
        val meetingId = _state.value.detail?.meeting?.id ?: return
        mutateDetail("Acuerdo actualizado", "No se pudo actualizar el acuerdo") {
            repo.updateAgreement(meetingId = meetingId, agreementId = agreementId, estado = estado)
        }
    }

    fun closeMeeting(notas: String) {
        val meetingId = _state.value.detail?.meeting?.id ?: return
        mutateDetail("Reunión cerrada con minuta", "No se pudo cerrar la reunión") {
            repo.closeMeeting(meetingId, notas)
        }
    }

    /**
     * Pasa lista.
     *
     * Se manda la lista **completa** de convocados, presentes y ausentes: el
     * servidor reemplaza el acta, y enviar sólo las casillas marcadas borraba a
     * los ausentes de la lista de asistencia.
     */
    fun setAttendance(marks: Map<Long, Boolean>) {
        val detail = _state.value.detail ?: return
        val payload = detail.asistentes.map { MeetingAttendeeMark(it.userId, marks[it.userId] ?: it.asistio) }
        mutateDetail("Lista pasada", "No se pudo pasar lista") {
            repo.setAttendance(detail.meeting.id, payload)
        }
    }

    // ── Convocar ──────────────────────────────────────────────────────────

    fun setShowConvocar(show: Boolean) {
        _state.update { it.copy(showConvocar = show, actionMessage = null) }
        if (show && _state.value.staff.isEmpty()) loadStaff()
    }

    private fun loadStaff() {
        viewModelScope.launch {
            // La lista de convocables es un extra: si falla, se puede convocar
            // igualmente y pasar lista después.
            val people = withContext(Dispatchers.IO) { runCatching { consoleRepo.usersFetch() }.getOrNull() }
            if (people != null) _state.update { it.copy(staff = people) }
        }
    }

    fun convocar(tipo: String, fecha: String, titulo: String, hora: String, agenda: String, asistentes: Set<Long>) {
        when (val v = MeetingForms.validateMeeting(tipo, fecha, titulo, hora, agenda, asistentes)) {
            is MeetingForms.Result.Invalid -> _state.update { it.copy(actionMessage = "❌ ${v.message}") }
            is MeetingForms.Result.Valid -> {
                val d = v.value
                _state.update { it.copy(busy = true, actionMessage = null) }
                viewModelScope.launch {
                    val result = withContext(Dispatchers.IO) {
                        runCatching {
                            repo.createMeeting(
                                tipo = d.tipo,
                                fecha = d.fecha,
                                titulo = d.titulo,
                                horaInicio = d.horaInicio,
                                agenda = d.agenda,
                                asistentes = d.asistentes,
                            )
                        }
                    }
                    _state.update { s ->
                        result.fold(
                            onSuccess = {
                                s.copy(
                                    busy = false,
                                    showConvocar = false,
                                    detail = it,
                                    tab = MeetingsTab.Reuniones,
                                    actionMessage = "✅ Reunión convocada",
                                )
                            },
                            onFailure = {
                                s.copy(busy = false, actionMessage = "❌ ${it.toUserMessage("No se pudo convocar")}")
                            },
                        )
                    }
                    if (result.isSuccess) refresh(initial = false)
                }
            }
        }
    }

    // ── Mis acuerdos ──────────────────────────────────────────────────────

    /** Avanza un acuerdo propio. El API rechaza mover el de otra persona. */
    fun advanceMine(agreementId: Long, estado: String) {
        _state.update { it.copy(busy = true, actionMessage = null) }
        viewModelScope.launch {
            val result = withContext(Dispatchers.IO) {
                runCatching { repo.updateMyAgreement(agreementId, estado) }
            }
            _state.update { s ->
                result.fold(
                    onSuccess = {
                        s.copy(busy = false, actionMessage = "✅ ${MeetingCatalog.agreementStatusLabel(estado)}")
                    },
                    onFailure = {
                        s.copy(busy = false, actionMessage = "❌ ${it.toUserMessage("No se pudo actualizar el acuerdo")}")
                    },
                )
            }
            if (result.isSuccess) refresh(initial = false)
        }
    }
}

// ── Pantalla ──────────────────────────────────────────────────────────────

internal fun agreementTone(row: MeetingAgreementDto): NxTone = when {
    row.vencido -> NxTone.Danger
    row.estado.equals("CUMPLIDO", true) -> NxTone.Success
    row.estado.equals("EN_PROCESO", true) -> NxTone.Info
    row.estado.equals("CANCELADO", true) -> NxTone.Neutral
    else -> NxTone.Warning
}

internal fun meetingTone(row: MeetingDto): NxTone = when {
    row.estado.equals("CANCELADA", true) -> NxTone.Danger
    row.isClosed -> NxTone.Success
    else -> NxTone.Info
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun MeetingsScreen(contentPadding: PaddingValues = PaddingValues(16.dp)) {
    val vm: MeetingsViewModel = viewModel()
    val state by vm.state.collectAsState()

    if (state.showConvocar) {
        ConvocarForm(
            staff = state.staff,
            busy = state.busy,
            message = state.actionMessage,
            onSubmit = { tipo, fecha, titulo, hora, agenda, ids ->
                vm.convocar(tipo, fecha, titulo, hora, agenda, ids)
            },
            onCancel = { vm.setShowConvocar(false) },
        )
        return
    }

    val detail = state.detail
    if (detail != null) {
        MeetingDetail(
            detail = detail,
            canLead = state.canLead,
            busy = state.busy,
            staff = state.staff,
            message = state.actionMessage,
            onBack = { vm.closeDetail() },
            onAddAgreement = { tipo, desc, owner, fecha -> vm.addAgreement(tipo, desc, owner, fecha) },
            onAgreementStatus = { id, estado -> vm.setAgreementStatus(id, estado) },
            onClose = { notas -> vm.closeMeeting(notas) },
            onAttendance = { marks -> vm.setAttendance(marks) },
        )
        return
    }

    PullToRefreshBox(
        isRefreshing = state.isRefreshing,
        onRefresh = { vm.refresh(initial = false) },
        modifier = Modifier.fillMaxSize(),
    ) {
        Column(
            Modifier.fillMaxSize().background(NxColors.Surface).padding(contentPadding),
            verticalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            NxSectionHeader(
                title = "Ritmo operativo",
                subtitle = "Reuniones, acuerdos y lecciones aprendidas",
                trailing = {
                    if (state.canLead) {
                        Button(
                            onClick = { vm.setShowConvocar(true) },
                            colors = ButtonDefaults.buttonColors(containerColor = NxColors.Teal),
                        ) { Text("Convocar") }
                    }
                },
            )

            Row(
                Modifier.fillMaxWidth().horizontalScroll(rememberScrollState()),
                horizontalArrangement = Arrangement.spacedBy(8.dp),
            ) {
                NxKpiCard(
                    NxKpi("Acuerdos míos", state.mios.size.toString(), hint = "Abiertos a mi nombre"),
                    modifier = Modifier.width(158.dp),
                )
                NxKpiCard(
                    NxKpi(
                        label = "Fuera de fecha",
                        value = state.miosVencidos.toString(),
                        hint = "Míos vencidos",
                        tone = if (state.miosVencidos > 0) NxTone.Danger else NxTone.Success,
                    ),
                    modifier = Modifier.width(158.dp),
                )
                NxKpiCard(
                    NxKpi("Programadas", state.proximas.toString(), hint = "Aún sin cerrar"),
                    modifier = Modifier.width(158.dp),
                )
                NxKpiCard(
                    NxKpi("Registradas", state.meetings.size.toString(), hint = "En el histórico"),
                    modifier = Modifier.width(158.dp),
                )
            }

            Row(
                Modifier.fillMaxWidth().horizontalScroll(rememberScrollState()),
                horizontalArrangement = Arrangement.spacedBy(8.dp),
            ) {
                MeetingsTab.entries.forEach { tab ->
                    FilterChip(
                        selected = state.tab == tab,
                        onClick = { vm.setTab(tab) },
                        label = { Text(tab.label) },
                    )
                }
            }

            state.actionMessage?.let {
                Text(it, color = if (it.startsWith("✅")) NxColors.Success else NxColors.Danger)
            }
            // El error se enseña ARRIBA de la lista, nunca en lugar de ella:
            // un fallo al refrescar no puede dejar la pantalla en blanco.
            state.error?.let { NxErrorBlock(it, onRetry = { vm.refresh(initial = false) }) }

            if (state.loading) {
                NxLoadingBlock("Cargando el ritmo operativo…")
                return@Column
            }

            when (state.tab) {
                MeetingsTab.Mios -> MyAgreementsList(
                    rows = state.mios,
                    busy = state.busy,
                    onAdvance = { id, estado -> vm.advanceMine(id, estado) },
                )

                MeetingsTab.Reuniones -> MeetingsList(
                    rows = state.meetings,
                    loading = state.detailLoading,
                    canLead = state.canLead,
                    onOpen = { vm.openMeeting(it) },
                    onConvocar = { vm.setShowConvocar(true) },
                )

                MeetingsTab.Vencidos -> OverdueList(rows = state.vencidos)

                MeetingsTab.Lecciones -> LessonsList(
                    rows = state.lecciones,
                    query = state.leccionesQuery,
                    onQuery = { vm.setLeccionesQuery(it) },
                    onSearch = { vm.loadLessons() },
                )
            }
        }
    }
}

@Composable
internal fun MyAgreementsList(
    rows: List<MeetingAgreementDto>,
    busy: Boolean,
    onAdvance: (Long, String) -> Unit,
) {
    if (rows.isEmpty()) {
        NxEmptyState(
            title = "Nada pendiente",
            subtitle = "No tienes acuerdos abiertos a tu nombre.",
        )
        return
    }
    var expanded by remember { mutableStateOf<Long?>(null) }
    LazyColumn(verticalArrangement = Arrangement.spacedBy(8.dp)) {
        items(rows, key = { it.rowKey }) { row ->
            Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
                NxListRow(
                    title = row.descripcion,
                    subtitle = listOf(row.meetingTitulo, row.activityLabel)
                        .filter { it.isNotBlank() }
                        .joinToString(" · ")
                        .ifBlank { row.tipoLabel },
                    meta = row.dueLabel,
                    chipText = row.estadoLabel,
                    chipTone = agreementTone(row),
                    onClick = { expanded = if (expanded == row.id) null else row.id },
                )
                if (expanded == row.id) {
                    NxPanelShell {
                        Text("Marcar como", fontWeight = FontWeight.SemiBold, color = NxColors.Slate)
                        Spacer(Modifier.height(6.dp))
                        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                            MeetingCatalog.AGREEMENT_STATUSES
                                .filter { !it.first.equals(row.estado, ignoreCase = true) }
                                .forEach { (key, label) ->
                                    OutlinedButton(
                                        onClick = { onAdvance(row.id, key) },
                                        enabled = !busy,
                                    ) { Text(label) }
                                }
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun MeetingsList(
    rows: List<MeetingDto>,
    loading: Boolean,
    canLead: Boolean,
    onOpen: (Long) -> Unit,
    onConvocar: () -> Unit,
) {
    if (loading) {
        NxLoadingBlock("Abriendo el acta…")
        return
    }
    if (rows.isEmpty()) {
        NxEmptyState(
            title = "Sin reuniones registradas",
            subtitle = "La diaria de las 10:00 se convoca en un toque.",
            actionLabel = if (canLead) "Convocar" else null,
            onAction = if (canLead) onConvocar else null,
        )
        return
    }
    LazyColumn(verticalArrangement = Arrangement.spacedBy(8.dp)) {
        items(rows, key = { it.rowKey }) { row ->
            NxListRow(
                title = row.titulo.ifBlank { row.tipoLabel },
                subtitle = row.whenLabel,
                meta = buildString {
                    append("${row.acuerdos} acuerdo${if (row.acuerdos == 1) "" else "s"}")
                    append(" · ${row.asistentes} convocado${if (row.asistentes == 1) "" else "s"}")
                    if (row.facilitadorNombre.isNotBlank()) append(" · ${row.facilitadorNombre}")
                },
                chipText = row.estadoLabel,
                chipTone = meetingTone(row),
                onClick = { onOpen(row.id) },
            )
        }
    }
}

@Composable
private fun OverdueList(rows: List<MeetingAgreementDto>) {
    if (rows.isEmpty()) {
        NxEmptyState(
            title = "Ningún acuerdo fuera de fecha",
            subtitle = "El tablero de la junta de cierre está limpio.",
        )
        return
    }
    LazyColumn(verticalArrangement = Arrangement.spacedBy(8.dp)) {
        items(rows, key = { it.rowKey }) { row ->
            NxListRow(
                title = row.descripcion,
                subtitle = listOf(row.responsableNombre, row.meetingTitulo)
                    .filter { it.isNotBlank() }
                    .joinToString(" · "),
                meta = row.dueLabel,
                chipText = row.estadoLabel,
                chipTone = NxTone.Danger,
            )
        }
    }
}

@Composable
private fun LessonsList(
    rows: List<MeetingAgreementDto>,
    query: String,
    onQuery: (String) -> Unit,
    onSearch: () -> Unit,
) {
    Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
        Row(
            Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.spacedBy(8.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            NxSearchField(
                value = query,
                onValueChange = onQuery,
                placeholder = "Buscar en lecciones…",
                modifier = Modifier.weight(1f),
            )
            Button(
                onClick = onSearch,
                colors = ButtonDefaults.buttonColors(containerColor = NxColors.Teal),
            ) { Text("Buscar") }
        }
        if (rows.isEmpty()) {
            NxEmptyState(
                title = "Sin lecciones registradas",
                subtitle = "Se escriben en la junta de cierre, en la pestaña Reuniones.",
            )
            return@Column
        }
        LazyColumn(verticalArrangement = Arrangement.spacedBy(8.dp)) {
            items(rows, key = { it.rowKey }) { row ->
                NxListRow(
                    title = row.descripcion,
                    subtitle = row.meetingTitulo.ifBlank { "Lección aprendida" },
                    meta = listOf(row.meetingFecha.take(10), row.activityLabel)
                        .filter { it.isNotBlank() }
                        .joinToString(" · "),
                    chipText = "Lección",
                    chipTone = NxTone.Info,
                )
            }
        }
    }
}
