package mx.nexara.mobile.nativeapp.ui.console.screens

import android.app.Application
import android.util.Base64
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.horizontalScroll
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
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.pulltorefresh.PullToRefreshBox
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.FilterChip
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
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
import mx.nexara.mobile.nativeapp.data.api.ViaticDto
import mx.nexara.mobile.nativeapp.data.api.VisibleUserDto
import mx.nexara.mobile.nativeapp.data.console.ConsoleRepository
import mx.nexara.mobile.nativeapp.ui.common.CapturedMedia
import mx.nexara.mobile.nativeapp.ui.common.MediaPickerBar
import mx.nexara.mobile.nativeapp.ui.enterprise.NxColors
import mx.nexara.mobile.nativeapp.ui.enterprise.NxEmptyState
import mx.nexara.mobile.nativeapp.ui.enterprise.NxErrorBlock
import mx.nexara.mobile.nativeapp.ui.enterprise.NxKpi
import mx.nexara.mobile.nativeapp.ui.enterprise.NxKpiGrid
import mx.nexara.mobile.nativeapp.ui.enterprise.NxSkeletonList
import mx.nexara.mobile.nativeapp.ui.enterprise.NxPanelShell
import mx.nexara.mobile.nativeapp.ui.enterprise.NxSectionHeader
import mx.nexara.mobile.nativeapp.ui.enterprise.NxStatusChip
import mx.nexara.mobile.nativeapp.ui.enterprise.NxTone
import mx.nexara.mobile.nativeapp.ui.util.openExternalUrl
import java.util.Locale

data class ViaticsUiState(
    val isLoading: Boolean = true,
    val isRefreshing: Boolean = false,
    val error: String? = null,
    val query: String = "",
    val viatics: List<ViaticDto> = emptyList(),
    val actingId: Long? = null,
    val actionMessage: String? = null,
    val creating: Boolean = false,
)

private val VIATIC_CATEGORIES = listOf(
    "COMBUSTIBLE", "CASETA", "HOSPEDAJE", "ALIMENTACION", "TRANSPORTE", "OTROS",
)

class ConsoleViaticsViewModel(app: Application) : AndroidViewModel(app) {
    private val repo = ConsoleRepository(app.applicationContext)
    private val _state = MutableStateFlow(ViaticsUiState())
    val state: StateFlow<ViaticsUiState> = _state

    fun setQuery(v: String) = _state.update { it.copy(query = v) }
    fun clearMessage() = _state.update { it.copy(actionMessage = null) }

    fun refresh(initial: Boolean = true) {
        _state.update {
            it.copy(
                isLoading = initial && it.viatics.isEmpty(),
                isRefreshing = !initial,
                error = null,
            )
        }
        viewModelScope.launch {
            try {
                val list = withContext(Dispatchers.IO) { repo.viaticsFetch() }
                _state.update { it.copy(isLoading = false, isRefreshing = false, viatics = list, error = null) }
            } catch (e: Exception) {
                _state.update {
                    it.copy(
                        isLoading = false,
                        isRefreshing = false,
                        error = e.message ?: "No se pudieron cargar viáticos",
                    )
                }
            }
        }
    }

    fun create(
        amount: Double,
        motivo: String,
        categoria: String?,
        ticketDataUrl: String,
        onDone: () -> Unit,
    ) {
        _state.update { it.copy(creating = true, actionMessage = null) }
        viewModelScope.launch {
            try {
                withContext(Dispatchers.IO) {
                    repo.createViatic(
                        amount = amount,
                        motivo = motivo,
                        categoria = categoria,
                        activityId = null,
                        ticketEvidenciaUrl = ticketDataUrl,
                    )
                }
                _state.update { it.copy(creating = false, actionMessage = "✅ Solicitud enviada a aprobación") }
                refresh()
                onDone()
            } catch (e: Exception) {
                _state.update {
                    it.copy(
                        creating = false,
                        actionMessage = "❌ ${e.message?.takeIf { m -> m.isNotBlank() } ?: "No se pudo crear"}",
                    )
                }
            }
        }
    }

    fun assign(
        usuarioId: Long,
        amount: Double,
        motivo: String,
        categoria: String?,
        activityId: Long?,
        onDone: () -> Unit,
    ) {
        _state.update { it.copy(creating = true, actionMessage = null) }
        viewModelScope.launch {
            try {
                withContext(Dispatchers.IO) {
                    repo.assignViatic(
                        usuarioId = usuarioId,
                        amount = amount,
                        motivo = motivo,
                        categoria = categoria,
                        activityId = activityId,
                    )
                }
                _state.update { it.copy(creating = false, actionMessage = "✅ Viático asignado") }
                refresh()
                onDone()
            } catch (e: Exception) {
                _state.update {
                    it.copy(
                        creating = false,
                        actionMessage = "❌ ${e.message?.takeIf { m -> m.isNotBlank() } ?: "No se pudo asignar"}",
                    )
                }
            }
        }
    }

    fun decide(id: Long, approve: Boolean, note: String?) {
        if (!approve && note.isNullOrBlank()) {
            _state.update { it.copy(actionMessage = "❌ Indica motivo de rechazo") }
            return
        }
        _state.update { it.copy(actingId = id, actionMessage = null) }
        viewModelScope.launch {
            try {
                withContext(Dispatchers.IO) { repo.approveViatic(id, approve, note) }
                _state.update {
                    it.copy(
                        actingId = null,
                        actionMessage = if (approve) "✅ Viático aprobado" else "✅ Viático rechazado",
                    )
                }
                refresh()
            } catch (e: Exception) {
                _state.update {
                    it.copy(
                        actingId = null,
                        actionMessage = "❌ ${e.message?.takeIf { m -> m.isNotBlank() } ?: "No se pudo actualizar"}",
                    )
                }
            }
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ConsoleViaticsScreen(
    contentPadding: PaddingValues = PaddingValues(16.dp),
    initialHighlightId: Long? = null,
) {
    val context = LocalContext.current
    val vm: ConsoleViaticsViewModel = viewModel()
    val state by vm.state.collectAsState()
    val user = remember { AuthRepository(context).loadSession() }
    val canApprove = user?.isSuperAdmin == true ||
        (user?.permissions ?: emptyList()).any {
            it.contains("viatics.manage") || it.contains("console.admin") || it.contains("finance")
        }
    val canAssign = user?.isSuperAdmin == true ||
        (user?.permissions ?: emptyList()).any {
            it.contains("viatics.manage") || it.contains("console.admin")
        }
    val repo = remember(context) { ConsoleRepository(context) }

    var selected by remember { mutableStateOf<ViaticDto?>(null) }
    var statusFilter by remember { mutableStateOf("todos") }
    var showCreate by remember { mutableStateOf(false) }
    var showAssign by remember { mutableStateOf(false) }
    var amountText by remember { mutableStateOf("") }
    var motivo by remember { mutableStateOf("") }
    var categoria by remember { mutableStateOf(VIATIC_CATEGORIES.first()) }
    var ticketDataUrl by remember { mutableStateOf<String?>(null) }
    var rejectNote by remember { mutableStateOf("") }
    var users by remember { mutableStateOf<List<VisibleUserDto>>(emptyList()) }
    var assigneeId by remember { mutableStateOf<Long?>(null) }
    var activityIdText by remember { mutableStateOf("") }

    LaunchedEffect(canAssign) {
        if (canAssign) {
            users = runCatching {
                withContext(Dispatchers.IO) { repo.usersFetch() }
            }.getOrDefault(emptyList())
        }
    }

    if (state.viatics.isEmpty() && state.isLoading && state.error == null) vm.refresh(initial = true)

    LaunchedEffect(initialHighlightId, state.viatics) {
        if (initialHighlightId != null && selected == null) {
            state.viatics.firstOrNull { it.id == initialHighlightId }?.let { selected = it }
        }
    }

    fun mediaToDataUrl(media: CapturedMedia): String? {
        val bytes = runCatching { context.contentResolver.openInputStream(media.uri)?.use { it.readBytes() } }.getOrNull()
            ?: return null
        val mime = media.mimeType.takeIf { it.isNotBlank() } ?: "image/jpeg"
        return "data:$mime;base64,${Base64.encodeToString(bytes, Base64.NO_WRAP)}"
    }

    if (showCreate) {
        LazyColumn(
            modifier = Modifier.fillMaxSize().background(NxColors.Surface).padding(contentPadding),
            verticalArrangement = Arrangement.spacedBy(10.dp),
        ) {
            item {
                Row(Modifier.fillMaxWidth(), Arrangement.SpaceBetween, Alignment.CenterVertically) {
                    OutlinedButton(onClick = { showCreate = false }) { Text("← Cancelar") }
                    Text("Nueva solicitud", fontWeight = FontWeight.Bold)
                }
            }
            item {
                NxPanelShell {
                    Text(
                        "Adjunta el ticket/comprobante y envía a la cadena de aprobación.",
                        style = MaterialTheme.typography.bodySmall,
                        color = NxColors.Muted,
                    )
                }
            }
            item {
                NxPanelShell {
                    Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
                        OutlinedTextField(
                            value = amountText,
                            onValueChange = { amountText = it.filter { c -> c.isDigit() || c == '.' } },
                            label = { Text("Monto (MXN)") },
                            singleLine = true,
                            modifier = Modifier.fillMaxWidth(),
                        )
                        OutlinedTextField(
                            value = motivo,
                            onValueChange = { motivo = it },
                            label = { Text("Motivo / concepto") },
                            minLines = 2,
                            modifier = Modifier.fillMaxWidth(),
                        )
                        Text("Categoría", style = MaterialTheme.typography.labelMedium)
                        Row(Modifier.horizontalScroll(rememberScrollState()), horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                            VIATIC_CATEGORIES.forEach { cat ->
                                FilterChip(
                                    selected = categoria == cat,
                                    onClick = { categoria = cat },
                                    label = { Text(cat, style = MaterialTheme.typography.labelSmall) },
                                )
                            }
                        }
                    }
                }
            }
            item {
                NxPanelShell {
                    Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                        Text("Comprobante", fontWeight = FontWeight.SemiBold)
                        MediaPickerBar(
                            onPicked = { picked ->
                                ticketDataUrl = picked.firstOrNull()?.let { mediaToDataUrl(it) }
                            },
                            allowCamera = true,
                            allowGallery = true,
                            allowDocuments = true,
                        )
                        if (ticketDataUrl != null) {
                            Text("✓ Comprobante listo", color = NxColors.Success, style = MaterialTheme.typography.bodySmall)
                        }
                    }
                }
            }
            if (!state.actionMessage.isNullOrBlank()) {
                item {
                    Text(
                        state.actionMessage!!,
                        color = if (state.actionMessage!!.startsWith("✅")) NxColors.Success else NxColors.Danger,
                    )
                }
            }
            item {
                Button(
                    onClick = {
                        val amount = amountText.toDoubleOrNull() ?: return@Button
                        val ticket = ticketDataUrl ?: return@Button
                        if (amount <= 0 || motivo.isBlank()) return@Button
                        vm.create(amount, motivo.trim(), categoria, ticket) { showCreate = false }
                    },
                    enabled = !state.creating &&
                        amountText.toDoubleOrNull()?.let { it > 0 } == true &&
                        motivo.isNotBlank() &&
                        ticketDataUrl != null,
                    modifier = Modifier.fillMaxWidth(),
                    colors = ButtonDefaults.buttonColors(containerColor = NxColors.Teal),
                ) {
                    Text(if (state.creating) "Enviando…" else "Enviar a aprobación")
                }
            }
        }
        return
    }

    if (showAssign) {
        LazyColumn(
            modifier = Modifier.fillMaxSize().background(NxColors.Surface).padding(contentPadding),
            verticalArrangement = Arrangement.spacedBy(10.dp),
        ) {
            item {
                Row(Modifier.fillMaxWidth(), Arrangement.SpaceBetween, Alignment.CenterVertically) {
                    OutlinedButton(onClick = { showAssign = false; vm.clearMessage() }) { Text("← Cancelar") }
                    Text("Asignar viático", fontWeight = FontWeight.Bold)
                }
            }
            item {
                NxPanelShell {
                    Text(
                        "Presupuesto anticipado para actividad o proyecto (sin comprobante).",
                        style = MaterialTheme.typography.bodySmall,
                        color = NxColors.Muted,
                    )
                }
            }
            item {
                NxPanelShell {
                    Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
                        Text("Usuario beneficiario", style = MaterialTheme.typography.labelMedium)
                        var userMenu by remember { mutableStateOf(false) }
                        Box {
                            OutlinedButton(onClick = { userMenu = true }, modifier = Modifier.fillMaxWidth()) {
                                Text(users.firstOrNull { it.id == assigneeId }?.nombre ?: "— Seleccionar —")
                            }
                            DropdownMenu(expanded = userMenu, onDismissRequest = { userMenu = false }) {
                                users.forEach { u ->
                                    DropdownMenuItem(
                                        text = { Text(u.nombre) },
                                        onClick = {
                                            assigneeId = u.id
                                            userMenu = false
                                        },
                                    )
                                }
                            }
                        }
                        OutlinedTextField(
                            value = activityIdText,
                            onValueChange = { activityIdText = it.filter { c -> c.isDigit() } },
                            label = { Text("ID actividad (opcional)") },
                            singleLine = true,
                            modifier = Modifier.fillMaxWidth(),
                        )
                        OutlinedTextField(
                            value = amountText,
                            onValueChange = { amountText = it.filter { c -> c.isDigit() || c == '.' } },
                            label = { Text("Monto (MXN)") },
                            singleLine = true,
                            modifier = Modifier.fillMaxWidth(),
                        )
                        OutlinedTextField(
                            value = motivo,
                            onValueChange = { motivo = it },
                            label = { Text("Motivo / concepto") },
                            minLines = 2,
                            modifier = Modifier.fillMaxWidth(),
                        )
                        Text("Categoría", style = MaterialTheme.typography.labelMedium)
                        Row(Modifier.horizontalScroll(rememberScrollState()), horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                            VIATIC_CATEGORIES.forEach { cat ->
                                FilterChip(
                                    selected = categoria == cat,
                                    onClick = { categoria = cat },
                                    label = { Text(cat, style = MaterialTheme.typography.labelSmall) },
                                )
                            }
                        }
                    }
                }
            }
            if (!state.actionMessage.isNullOrBlank()) {
                item {
                    Text(
                        state.actionMessage!!,
                        color = if (state.actionMessage!!.startsWith("✅")) NxColors.Success else NxColors.Danger,
                    )
                }
            }
            item {
                Button(
                    onClick = {
                        val amount = amountText.toDoubleOrNull() ?: return@Button
                        val uid = assigneeId ?: return@Button
                        if (amount <= 0 || motivo.isBlank()) return@Button
                        val actId = activityIdText.toLongOrNull()
                        vm.assign(uid, amount, motivo.trim(), categoria, actId) {
                            showAssign = false
                            amountText = ""
                            motivo = ""
                            activityIdText = ""
                            assigneeId = null
                        }
                    },
                    enabled = !state.creating &&
                        assigneeId != null &&
                        amountText.toDoubleOrNull()?.let { it > 0 } == true &&
                        motivo.isNotBlank(),
                    modifier = Modifier.fillMaxWidth(),
                    colors = ButtonDefaults.buttonColors(containerColor = NxColors.Teal),
                ) {
                    Text(if (state.creating) "Asignando…" else "Asignar")
                }
            }
        }
        return
    }

    if (selected != null) {
        val v = selected!!
        val status = v.displayStatus()
        val statusTone = viaticStatusTone(status)
        val pending = status.equals("pendiente", true)
        LazyColumn(
            modifier = Modifier.fillMaxSize().background(NxColors.Surface),
            contentPadding = PaddingValues(16.dp),
            verticalArrangement = Arrangement.spacedBy(8.dp),
        ) {
            item {
                Row(Modifier.fillMaxWidth(), Arrangement.SpaceBetween, Alignment.CenterVertically) {
                    OutlinedButton(onClick = { selected = null; rejectNote = "" }) { Text("← Volver") }
                    NxStatusChip(status.replaceFirstChar { if (it.isLowerCase()) it.titlecase() else it.toString() }, statusTone)
                }
            }
            item {
                Row(Modifier.fillMaxWidth(), Arrangement.SpaceBetween, Alignment.CenterVertically) {
                    Text("Viático #${v.id}", style = MaterialTheme.typography.titleLarge, fontWeight = FontWeight.Bold)
                    Text(
                        viaticFmtFull(v.montoSolicitado),
                        style = MaterialTheme.typography.titleMedium,
                        fontWeight = FontWeight.Bold,
                        color = NxColors.Teal,
                    )
                }
            }
            item {
                NxPanelShell {
                    Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                        if (!v.actividad?.anNumber.isNullOrBlank()) DetailLine("Actividad (AN)", v.actividad!!.anNumber)
                        if (!v.usuario?.nombre.isNullOrBlank()) DetailLine("Empleado", v.usuario!!.nombre)
                        DetailLine("Razón de gasto", v.razonGasto ?: "—")
                        if (!v.categoria.isNullOrBlank()) DetailLine("Categoría", v.categoria!!)
                        DetailLine("Monto solicitado", viaticFmtFull(v.montoSolicitado))
                        DetailLine("Fecha", v.createdAt?.take(10) ?: "—")
                    }
                }
            }
            if (!v.ticketEvidenciaUrl.isNullOrBlank()) {
                item {
                    Button(
                        onClick = { openExternalUrl(context, v.ticketEvidenciaUrl!!) },
                        Modifier.fillMaxWidth(),
                        colors = ButtonDefaults.buttonColors(containerColor = NxColors.Teal),
                    ) {
                        Text("Ver comprobante / ticket")
                    }
                }
            }
            if (canApprove && pending) {
                item {
                    NxPanelShell {
                        Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
                            Text("Decisión de aprobación", fontWeight = FontWeight.SemiBold)
                            OutlinedTextField(
                                value = rejectNote,
                                onValueChange = { rejectNote = it },
                                label = { Text("Nota / motivo de rechazo") },
                                modifier = Modifier.fillMaxWidth(),
                                minLines = 2,
                            )
                            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                                Button(
                                    onClick = { vm.decide(v.id, true, rejectNote.ifBlank { null }); selected = null },
                                    enabled = state.actingId == null,
                                    colors = ButtonDefaults.buttonColors(containerColor = NxColors.Success),
                                    modifier = Modifier.weight(1f),
                                ) { Text("Aprobar") }
                                OutlinedButton(
                                    onClick = { vm.decide(v.id, false, rejectNote); selected = null },
                                    enabled = state.actingId == null,
                                    modifier = Modifier.weight(1f),
                                ) { Text("Rechazar", color = NxColors.Danger) }
                            }
                        }
                    }
                }
            }
            if (!state.actionMessage.isNullOrBlank()) {
                item {
                    Text(
                        state.actionMessage!!,
                        color = if (state.actionMessage!!.startsWith("✅")) NxColors.Success else NxColors.Danger,
                    )
                }
            }
        }
        return
    }

    val allStatuses = listOf("todos") + state.viatics.map { it.displayStatus() }.filter { it != "—" }.distinct().sorted()
    val q = state.query.trim().lowercase()
    val filtered = state.viatics.filter { v ->
        val st = v.displayStatus()
        val matchStatus = statusFilter == "todos" || st.equals(statusFilter, true)
        val matchQuery = q.isBlank() || buildString {
            append(v.actividad?.anNumber ?: ""); append(" ")
            append(v.razonGasto ?: ""); append(" ")
            append(v.usuario?.nombre ?: "")
        }.lowercase().contains(q)
        matchStatus && matchQuery
    }

    val totalPendiente = state.viatics.filter { it.displayStatus().equals("pendiente", true) }
        .sumOf { it.montoSolicitado ?: 0.0 }
    val totalPagado = state.viatics.filter {
        val s = it.displayStatus().lowercase()
        s == "pagado" || s == "pagada" || s == "aprobado"
    }.sumOf { it.montoSolicitado ?: 0.0 }
    val pendingCount = state.viatics.count { it.displayStatus().equals("pendiente", true) }

    @OptIn(ExperimentalMaterial3Api::class)
    PullToRefreshBox(
        isRefreshing = state.isRefreshing,
        onRefresh = { vm.refresh(initial = false) },
        modifier = Modifier.fillMaxSize(),
    ) {
        LazyColumn(
            modifier = Modifier
                .fillMaxSize()
                .background(NxColors.Surface)
                .padding(contentPadding),
            verticalArrangement = Arrangement.spacedBy(10.dp),
        ) {
            item {
                NxSectionHeader(
                    title = "Viáticos",
                    subtitle = "Solicitudes · aprobación · liquidez",
                    trailing = {
                        Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                            if (canAssign) {
                                OutlinedButton(onClick = { showAssign = true; vm.clearMessage() }) { Text("+ Asignar") }
                            }
                            Button(
                                onClick = { showCreate = true; vm.clearMessage() },
                                colors = ButtonDefaults.buttonColors(containerColor = NxColors.Teal),
                            ) { Text("+ Solicitar") }
                        }
                    },
                )
            }

            if (!state.error.isNullOrBlank()) {
                item { NxErrorBlock(state.error!!) { vm.refresh(initial = false) } }
                return@LazyColumn
            }

            if (state.isLoading && !state.isRefreshing) {
                item { NxSkeletonList() }
                return@LazyColumn
            }

            if (!state.actionMessage.isNullOrBlank()) {
                item {
                    Text(
                        state.actionMessage!!,
                        color = if (state.actionMessage!!.startsWith("✅")) NxColors.Success else NxColors.Danger,
                        style = MaterialTheme.typography.bodySmall,
                    )
                }
            }

            item {
                NxKpiGrid(
                    items = listOf(
                        NxKpi("Solicitudes", "${state.viatics.size}", hint = "Totales", tone = NxTone.Brand),
                        NxKpi("Pendiente $", viaticFmt(totalPendiente), hint = "$pendingCount en cola", tone = NxTone.Warning),
                        NxKpi("Aprobado/Pagado", viaticFmt(totalPagado), tone = NxTone.Success),
                        NxKpi("Ticket promedio", viaticFmt(
                            state.viatics.mapNotNull { it.montoSolicitado }.let { if (it.isEmpty()) 0.0 else it.average() },
                        ), tone = NxTone.Info),
                    ),
                )
            }

            item {
                OutlinedTextField(
                    value = state.query,
                    onValueChange = vm::setQuery,
                    placeholder = { Text("Buscar (AN, empleado, razón)") },
                    singleLine = true,
                    modifier = Modifier.fillMaxWidth(),
                )
            }

            item {
                Row(Modifier.horizontalScroll(rememberScrollState()), horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                    allStatuses.forEach { st ->
                        FilterChip(
                            selected = statusFilter == st,
                            onClick = { statusFilter = st },
                            label = {
                                Text(
                                    st.replaceFirstChar { if (it.isLowerCase()) it.titlecase() else it.toString() },
                                    style = MaterialTheme.typography.labelSmall,
                                )
                            },
                        )
                    }
                }
            }

            if (filtered.isEmpty()) {
                item {
                    NxEmptyState(
                        title = "Sin viáticos",
                        subtitle = "Crea tu primera solicitud de viático con el botón +.",
                        actionLabel = "Nueva solicitud",
                        onAction = { showCreate = true },
                    )
                }
            } else {
                item { NxSectionHeader("Solicitudes", "${filtered.size} resultado(s)") }
                items(filtered.take(200), key = { it.id }) { v ->
                    val statusTone = viaticStatusTone(v.displayStatus())
                    NxPanelShell(onClick = { selected = v }) {
                        Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
                            Row(Modifier.fillMaxWidth(), Arrangement.SpaceBetween, Alignment.CenterVertically) {
                                Text(
                                    v.actividad?.anNumber?.let { "AN: $it" } ?: "Viático #${v.id}",
                                    fontWeight = FontWeight.Bold,
                                    modifier = Modifier.weight(1f),
                                )
                                Text(
                                    viaticFmtFull(v.montoSolicitado),
                                    fontWeight = FontWeight.Bold,
                                    color = NxColors.Teal,
                                )
                            }
                            Row(Modifier.fillMaxWidth(), Arrangement.SpaceBetween, Alignment.CenterVertically) {
                                Text(
                                    v.usuario?.nombre ?: "",
                                    fontSize = 12.sp,
                                    color = NxColors.Muted,
                                    modifier = Modifier.weight(1f),
                                )
                                NxStatusChip(
                                    v.displayStatus().replaceFirstChar { if (it.isLowerCase()) it.titlecase() else it.toString() },
                                    statusTone,
                                )
                            }
                            if (!v.categoria.isNullOrBlank()) {
                                Text(
                                    v.categoria!!,
                                    style = MaterialTheme.typography.labelSmall,
                                    color = NxColors.Muted,
                                )
                            }
                            if (!v.razonGasto.isNullOrBlank()) {
                                Text(
                                    v.razonGasto!!,
                                    style = MaterialTheme.typography.bodySmall,
                                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                                    maxLines = 2,
                                )
                            }
                        }
                    }
                }
            }
            item { Spacer(Modifier.height(24.dp)) }
        }
    }
}

private fun viaticStatusTone(status: String): NxTone = when {
    status.equals("pagado", true) || status.equals("pagada", true) || status.equals("aprobado", true) -> NxTone.Success
    status.equals("pendiente", true) -> NxTone.Warning
    status.equals("rechazado", true) || status.equals("cancelado", true) -> NxTone.Danger
    else -> NxTone.Neutral
}

private fun viaticFmtFull(amount: Double?): String {
    if (amount == null) return "$0.00"
    return String.format(Locale("es", "MX"), "$%,.2f", amount)
}

private fun viaticFmt(amount: Double?): String {
    if (amount == null) return "$0"
    return when {
        amount >= 1_000_000 -> "$" + String.format("%.1fM", amount / 1_000_000)
        amount >= 1_000 -> "$" + String.format("%.0fK", amount / 1_000)
        else -> "$" + String.format("%,.0f", amount)
    }
}
