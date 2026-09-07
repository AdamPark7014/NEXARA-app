package mx.nexara.mobile.nativeapp.ui.console.screens

import android.app.Application
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.horizontalScroll
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FilterChip
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
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
import androidx.compose.material3.OutlinedTextField
import mx.nexara.mobile.nativeapp.data.AuthRepository
import mx.nexara.mobile.nativeapp.data.api.HrLeaveBalanceDto
import mx.nexara.mobile.nativeapp.data.api.HrLeaveCatalog
import mx.nexara.mobile.nativeapp.data.api.HrLeaveDto
import mx.nexara.mobile.nativeapp.data.api.toUserMessage
import mx.nexara.mobile.nativeapp.data.extra.ExtraRepository
import mx.nexara.mobile.nativeapp.ui.console.util.HrLeaveRequestForm
import mx.nexara.mobile.nativeapp.ui.enterprise.NxColors
import mx.nexara.mobile.nativeapp.ui.enterprise.NxEmptyState
import mx.nexara.mobile.nativeapp.ui.enterprise.NxErrorBlock
import mx.nexara.mobile.nativeapp.ui.enterprise.NxLoadingBlock
import mx.nexara.mobile.nativeapp.ui.enterprise.NxPanelShell
import mx.nexara.mobile.nativeapp.ui.enterprise.NxSearchField
import mx.nexara.mobile.nativeapp.ui.enterprise.NxSectionHeader

data class HrLeavesUiState(
    val loading: Boolean = true,
    val isRefreshing: Boolean = false,
    val error: String? = null,
    val query: String = "",
    val typeFilter: String = "todos",
    val items: List<HrLeaveDto> = emptyList(),
    val actingId: Long? = null,
    val actionMessage: String? = null,
    /** Formulario de alta abierto. */
    val showCreate: Boolean = false,
    val creating: Boolean = false,
    /** Saldo del año del usuario; `null` mientras no se haya podido leer. */
    val balance: HrLeaveBalanceDto? = null,
    val myUserId: Long? = null,
    val canApprove: Boolean = false,
)

class HrLeavesViewModel(app: Application) : AndroidViewModel(app) {
    private val repo = ExtraRepository(app.applicationContext)
    private val authRepo = AuthRepository(app.applicationContext)
    private val _state = MutableStateFlow(HrLeavesUiState())
    val state: StateFlow<HrLeavesUiState> = _state

    init {
        loadSessionFacts()
        refresh()
    }

    /**
     * Quién soy y qué puedo hacer.
     *
     * Se resuelve una sola vez en el ViewModel y no dentro de un `remember` de
     * la composición: leer la sesión del disco mientras se dibuja bloquea el
     * hilo principal, y además se perdía al rotar.
     */
    private fun loadSessionFacts() {
        viewModelScope.launch {
            val session = withContext(Dispatchers.IO) { runCatching { authRepo.loadSession() }.getOrNull() }
            val perms = session?.permissions.orEmpty()
            _state.update {
                it.copy(
                    myUserId = session?.id,
                    canApprove = session?.isSuperAdmin == true || perms.any { p ->
                        p.contains("hr.approve_leave") || p.contains("hr.manage") || p.contains("console.admin")
                    },
                )
            }
            loadBalance()
        }
    }

    private fun loadBalance() {
        val uid = _state.value.myUserId ?: return
        viewModelScope.launch {
            // El saldo es informativo: si falla, la pantalla sigue sirviendo.
            val bal = withContext(Dispatchers.IO) { runCatching { repo.hrLeaveBalance(uid) }.getOrNull() }
            if (bal != null) _state.update { it.copy(balance = bal) }
        }
    }

    fun setQuery(v: String) = _state.update { it.copy(query = v) }
    fun setTypeFilter(v: String) = _state.update { it.copy(typeFilter = v) }
    fun setShowCreate(show: Boolean) = _state.update { it.copy(showCreate = show, actionMessage = null) }

    /**
     * Da de alta la solicitud.
     *
     * La validación vive en `HrLeaveRequestForm` para que el conteo de días que
     * ve el empleado sea el mismo que guarda el servidor.
     */
    fun create(type: String, startDate: String, endDate: String, reason: String) {
        val result = HrLeaveRequestForm.validate(
            type = type,
            startDate = startDate,
            endDate = endDate,
            reason = reason,
            knownTypes = HrLeaveCatalog.TYPES.map { it.first },
        )
        if (result is HrLeaveRequestForm.Result.Invalid) {
            _state.update { it.copy(actionMessage = "❌ ${result.message}") }
            return
        }
        val valid = result as HrLeaveRequestForm.Result.Valid
        _state.update { it.copy(creating = true, actionMessage = null) }
        viewModelScope.launch {
            try {
                withContext(Dispatchers.IO) {
                    repo.createHrLeave(valid.type, valid.startDate, valid.endDate, valid.reason)
                }
                _state.update {
                    it.copy(
                        creating = false,
                        showCreate = false,
                        actionMessage = "✅ Solicitud enviada (${valid.days} día${if (valid.days == 1L) "" else "s"})",
                    )
                }
                refresh(initial = false)
                loadBalance()
            } catch (e: Exception) {
                _state.update {
                    it.copy(creating = false, actionMessage = "❌ ${e.toUserMessage("No se pudo enviar la solicitud")}")
                }
            }
        }
    }

    /** Cancela la solicitud propia. El API rechaza cancelar la de otro. */
    fun cancel(id: Long) {
        _state.update { it.copy(actingId = id, actionMessage = null) }
        viewModelScope.launch {
            try {
                withContext(Dispatchers.IO) { repo.cancelHrLeave(id) }
                _state.update { it.copy(actingId = null, actionMessage = "✅ Solicitud cancelada") }
                refresh(initial = false)
                loadBalance()
            } catch (e: Exception) {
                _state.update {
                    it.copy(actingId = null, actionMessage = "❌ ${e.toUserMessage("No se pudo cancelar")}")
                }
            }
        }
    }

    fun refresh(initial: Boolean = true) {
        val refresh = !initial
        _state.update { it.copy(loading = initial && it.items.isEmpty(), isRefreshing = refresh, error = null) }
        viewModelScope.launch {
            try {
                val list = withContext(Dispatchers.IO) { repo.hrLeaveDtos() }
                _state.update { it.copy(loading = false, isRefreshing = false, items = list) }
            } catch (e: Exception) {
                _state.update { it.copy(loading = false, isRefreshing = false, error = e.toUserMessage("No se pudieron cargar las solicitudes")) }
            }
        }
    }

    fun filtered(): List<HrLeaveDto> {
        val s = _state.value
        var list = s.items
        if (s.typeFilter != "todos") {
            list = list.filter { it.type.equals(s.typeFilter, ignoreCase = true) }
        }
        val q = s.query.trim().lowercase()
        if (q.isNotBlank()) {
            list = list.filter { row ->
                row.displayReason.lowercase().contains(q) ||
                    row.userName.lowercase().contains(q) ||
                    row.type.lowercase().contains(q)
            }
        }
        return list
    }

    fun approve(id: Long) {
        _state.update { it.copy(actingId = id, actionMessage = null) }
        viewModelScope.launch {
            try {
                withContext(Dispatchers.IO) { repo.approveHrLeave(id) }
                _state.update { it.copy(actingId = null, actionMessage = "✅ Permiso aprobado") }
                refresh(initial = false)
            } catch (e: Exception) {
                _state.update {
                    it.copy(actingId = null, actionMessage = "❌ ${e.toUserMessage("No se pudo aprobar")}")
                }
            }
        }
    }

    fun reject(id: Long, reason: String) {
        if (reason.isBlank()) {
            _state.update { it.copy(actionMessage = "❌ Indica motivo de rechazo") }
            return
        }
        _state.update { it.copy(actingId = id, actionMessage = null) }
        viewModelScope.launch {
            try {
                withContext(Dispatchers.IO) { repo.rejectHrLeave(id, reason.trim()) }
                _state.update { it.copy(actingId = null, actionMessage = "✅ Permiso rechazado") }
                refresh(initial = false)
            } catch (e: Exception) {
                _state.update {
                    it.copy(actingId = null, actionMessage = "❌ ${e.toUserMessage("No se pudo rechazar")}")
                }
            }
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun HrLeavesScreen(onBack: () -> Unit = {}, contentPadding: PaddingValues = PaddingValues(16.dp)) {
    val vm: HrLeavesViewModel = viewModel()
    val state by vm.state.collectAsState()
    val filtered = vm.filtered()
    var selected by remember { mutableStateOf<HrLeaveDto?>(null) }
    // Los tipos del filtro se muestran traducidos; el valor que viaja sigue
    // siendo la clave del enum.
    val types = listOf("todos") + state.items.map { it.type }.filter { it.isNotBlank() }.distinct().sorted()
    // El API devuelve `PENDING`; comparar contra «pendiente» daba siempre cero.
    val pending = state.items.count { it.isPending }

    if (state.showCreate) {
        LeaveRequestForm(
            creating = state.creating,
            message = state.actionMessage,
            onSubmit = { type, start, end, reason -> vm.create(type, start, end, reason) },
            onCancel = { vm.setShowCreate(false) },
        )
        return
    }

    val sel = selected
    if (sel != null) {
        // `selected` guarda una copia; tras aprobar/cancelar hay que releer la
        // fila de la lista o el detalle seguiría enseñando el estatus viejo.
        val fresh = state.items.firstOrNull { it.id == sel.id } ?: sel
        LeaveDetail(
            row = fresh,
            canApprove = state.canApprove,
            isMine = state.myUserId != null && fresh.userId == state.myUserId,
            acting = state.actingId == fresh.id,
            actionMessage = state.actionMessage,
            onApprove = { vm.approve(fresh.id) },
            onReject = { reason -> vm.reject(fresh.id, reason) },
            onCancel = { vm.cancel(fresh.id) },
            onBack = { selected = null },
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
        ) {
            NxSectionHeader(
                title = "RR. HH. · Permisos",
                subtitle = if (!state.loading && state.items.isNotEmpty()) {
                    "${state.items.size} solicitudes · $pending pendientes"
                } else {
                    "Solicitudes de permiso y ausencias"
                },
            )
            Spacer(Modifier.height(8.dp))
            Button(onClick = { vm.setShowCreate(true) }, modifier = Modifier.fillMaxWidth()) {
                Text("+ Solicitar permiso")
            }
            state.balance?.let { bal ->
                if (bal.totalUsed > 0.0) {
                    Spacer(Modifier.height(8.dp))
                    NxPanelShell {
                        Text(
                            "Mis días usados en ${bal.year}: ${formatDays(bal.totalUsed)}",
                            fontWeight = FontWeight.SemiBold,
                            color = NxColors.Slate,
                        )
                        bal.usedByType.forEach { (label, days) ->
                            Text(
                                "$label · ${formatDays(days)}",
                                style = MaterialTheme.typography.bodySmall,
                                color = NxColors.Muted,
                            )
                        }
                    }
                }
            }
            if (!state.actionMessage.isNullOrBlank()) {
                Spacer(Modifier.height(6.dp))
                Text(
                    state.actionMessage.orEmpty(),
                    color = if (state.actionMessage?.startsWith("✅") == true) NxColors.Success else NxColors.Danger,
                )
            }
            Spacer(Modifier.height(8.dp))
            NxSearchField(value = state.query, onValueChange = vm::setQuery, placeholder = "Buscar solicitud…")
            Spacer(Modifier.height(8.dp))
            Row(
                Modifier.horizontalScroll(rememberScrollState()),
                horizontalArrangement = Arrangement.spacedBy(8.dp),
            ) {
                types.take(6).forEach { t ->
                    FilterChip(
                        selected = state.typeFilter == t,
                        onClick = { vm.setTypeFilter(t) },
                        label = {
                            Text(if (t == "todos") "Todos" else HrLeaveCatalog.typeLabel(t))
                        },
                    )
                }
            }
            Spacer(Modifier.height(8.dp))
            when {
                state.loading -> Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                    NxLoadingBlock("Cargando solicitudes…")
                }
                state.error != null -> NxErrorBlock(state.error!!) { vm.refresh() }
                filtered.isEmpty() -> Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                    NxEmptyState(
                        title = "Sin solicitudes",
                        subtitle = "No hay permisos con los filtros actuales.",
                        actionLabel = "Actualizar",
                        onAction = { vm.refresh(initial = false) },
                    )
                }
                else -> LazyColumn(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    items(filtered.take(80), key = { it.rowKey }) { row ->
                        HrLeaveCard(row, onClick = { selected = row })
                    }
                }
            }
            Spacer(Modifier.height(12.dp))
            Button(onClick = onBack) { Text("Volver") }
        }
    }
}

/** «3 días», «1 día», «1.5 días» — sin decimales cuando no hacen falta. */
private fun formatDays(value: Double): String {
    val n = if (value % 1.0 == 0.0) value.toInt().toString() else value.toString()
    return if (value == 1.0) "$n día" else "$n días"
}

@Composable
private fun HrLeaveCard(row: HrLeaveDto, onClick: () -> Unit = {}) {
    NxPanelShell(onClick = onClick) {
        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
            Text(row.displayReason, fontWeight = FontWeight.SemiBold, modifier = Modifier.weight(1f), color = NxColors.Slate)
            Text(row.statusLabel, style = MaterialTheme.typography.labelSmall, color = NxColors.Teal)
        }
        Text(
            listOfNotNull(
                row.userName.takeIf { it.isNotBlank() },
                row.typeLabel,
                row.dateRange.takeIf { it.isNotBlank() },
            ).joinToString(" · "),
            style = MaterialTheme.typography.bodySmall,
            color = NxColors.Muted,
        )
    }
}

/**
 * Alta de solicitud de permiso.
 *
 * Es la mitad que faltaba del proceso: la app ya dejaba **aprobar** permisos
 * desde el teléfono, pero no **pedirlos**, así que el empleado seguía teniendo
 * que entrar a la web.
 */
@Composable
private fun LeaveRequestForm(
    creating: Boolean,
    message: String?,
    onSubmit: (type: String, startDate: String, endDate: String, reason: String) -> Unit,
    onCancel: () -> Unit,
) {
    var type by remember { mutableStateOf(HrLeaveCatalog.TYPES.first().first) }
    var startDate by remember { mutableStateOf("") }
    var endDate by remember { mutableStateOf("") }
    var reason by remember { mutableStateOf("") }

    val preview = HrLeaveRequestForm.daysPreview(startDate, endDate)
    val reasonRequired = type in HrLeaveRequestForm.TYPES_REQUIRING_REASON

    LazyColumn(
        Modifier.fillMaxSize().background(NxColors.Surface),
        contentPadding = PaddingValues(16.dp),
        verticalArrangement = Arrangement.spacedBy(10.dp),
    ) {
        item { OutlinedButton(onClick = onCancel) { Text("← Cancelar") } }
        item {
            NxSectionHeader(
                title = "Nueva solicitud",
                subtitle = "Vacaciones, incapacidad o permiso personal",
            )
        }
        item {
            Text("Tipo de permiso", fontWeight = FontWeight.Medium, color = NxColors.Slate)
        }
        item {
            Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
                HrLeaveCatalog.TYPES.forEach { (key, label) ->
                    FilterChip(
                        selected = type == key,
                        onClick = { type = key },
                        label = { Text(label) },
                        modifier = Modifier.fillMaxWidth(),
                    )
                }
            }
        }
        item {
            OutlinedTextField(
                value = startDate,
                onValueChange = { startDate = it },
                label = { Text("Inicio (AAAA-MM-DD)") },
                placeholder = { Text("2026-09-15") },
                singleLine = true,
                modifier = Modifier.fillMaxWidth(),
            )
        }
        item {
            OutlinedTextField(
                value = endDate,
                onValueChange = { endDate = it },
                label = { Text("Fin (AAAA-MM-DD)") },
                placeholder = { Text("2026-09-19") },
                singleLine = true,
                modifier = Modifier.fillMaxWidth(),
            )
        }
        if (preview.isNotBlank()) {
            item {
                Text(
                    "Se solicitarán $preview (ambos días incluidos).",
                    style = MaterialTheme.typography.bodySmall,
                    color = NxColors.Teal,
                )
            }
        }
        item {
            OutlinedTextField(
                value = reason,
                onValueChange = { reason = it },
                label = { Text(if (reasonRequired) "Motivo (obligatorio)" else "Motivo (opcional)") },
                minLines = 3,
                modifier = Modifier.fillMaxWidth(),
            )
        }
        if (!message.isNullOrBlank()) {
            item {
                Text(
                    message,
                    color = if (message.startsWith("✅")) NxColors.Success else NxColors.Danger,
                )
            }
        }
        item {
            Button(
                onClick = { onSubmit(type, startDate, endDate, reason) },
                enabled = !creating,
                modifier = Modifier.fillMaxWidth(),
            ) {
                Text(if (creating) "Enviando…" else "Enviar solicitud")
            }
        }
    }
}

@Composable
private fun LeaveDetail(
    row: HrLeaveDto,
    canApprove: Boolean,
    isMine: Boolean,
    acting: Boolean,
    actionMessage: String?,
    onApprove: () -> Unit,
    onReject: (String) -> Unit,
    onCancel: () -> Unit,
    onBack: () -> Unit,
) {
    var rejectReason by remember { mutableStateOf("") }
    val pending = row.isPending

    LazyColumn(
        Modifier.fillMaxSize().background(NxColors.Surface),
        contentPadding = PaddingValues(12.dp),
        verticalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        item { OutlinedButton(onClick = onBack) { Text("← Permisos") } }
        item {
            NxPanelShell {
                Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
                    Text(row.displayReason, style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold, color = NxColors.Slate)
                    LRow("Empleado", row.userName)
                    LRow("Tipo", row.typeLabel)
                    LRow("Estatus", row.statusLabel)
                    LRow("Inicio", row.startDate.take(10))
                    LRow("Fin", row.endDate.take(10))
                    LRow("Días solicitados", row.days)
                    LRow("Aprobado por", row.approverName)
                }
            }
        }
        if (row.notes.isNotBlank()) {
            item {
                NxPanelShell {
                    Text("Notas / Motivo", fontWeight = FontWeight.SemiBold, color = NxColors.Slate)
                    Spacer(Modifier.height(6.dp))
                    Text(row.notes, style = MaterialTheme.typography.bodyMedium)
                }
            }
        }
        if (canApprove && pending) {
            item {
                NxPanelShell {
                    Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                        Text("Aprobación", fontWeight = FontWeight.SemiBold)
                        OutlinedTextField(
                            value = rejectReason,
                            onValueChange = { rejectReason = it },
                            label = { Text("Motivo rechazo (opcional para aprobar)") },
                            modifier = Modifier.fillMaxWidth(),
                        )
                        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                            Button(onClick = onApprove, enabled = !acting, modifier = Modifier.weight(1f)) {
                                Text("Aprobar")
                            }
                            OutlinedButton(
                                onClick = { onReject(rejectReason) },
                                enabled = !acting,
                                modifier = Modifier.weight(1f),
                            ) { Text("Rechazar") }
                        }
                    }
                }
            }
        }
        // Cancelar la solicitud propia: sólo mientras siga pendiente y sólo si
        // es mía. El API rechaza cancelar la de otro, así que enseñar el botón
        // sería prometer algo que no se cumple.
        if (isMine && pending) {
            item {
                NxPanelShell {
                    Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                        Text("Mi solicitud", fontWeight = FontWeight.SemiBold)
                        Text(
                            "Puedes cancelarla mientras nadie la haya decidido.",
                            style = MaterialTheme.typography.bodySmall,
                            color = NxColors.Muted,
                        )
                        OutlinedButton(
                            onClick = onCancel,
                            enabled = !acting,
                            modifier = Modifier.fillMaxWidth(),
                        ) { Text("Cancelar solicitud") }
                    }
                }
            }
        }
        if (!actionMessage.isNullOrBlank()) {
            item {
                Text(
                    actionMessage,
                    color = if (actionMessage.startsWith("✅")) NxColors.Success else NxColors.Danger,
                )
            }
        }
    }
}

@Composable
private fun LRow(label: String, value: String) {
    if (value.isNotBlank()) {
        Row(Modifier.fillMaxWidth()) {
            Text(label, fontWeight = FontWeight.Medium, modifier = Modifier.weight(1f))
            Text(value, color = NxColors.Muted, modifier = Modifier.weight(1.2f))
        }
    }
}
