package mx.nexara.mobile.nativeapp.ui.modules

import android.app.Application
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.runtime.Composable
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import androidx.lifecycle.viewmodel.compose.viewModel
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import mx.nexara.mobile.nativeapp.data.extra.ExtraRepository
import mx.nexara.mobile.nativeapp.data.api.LunchBreakDto
import mx.nexara.mobile.nativeapp.ui.common.MediaPickerBar
import mx.nexara.mobile.nativeapp.ui.common.CapturedMedia
import mx.nexara.mobile.nativeapp.ui.common.SimpleRow

private fun fmtMoney(v: Double?): String =
    if (v == null) "—" else "$" + String.format("%,.2f", v)

private fun nn(s: String?): String = if (s.isNullOrBlank()) "—" else s

// ── News ──────────────────────────────────────────────────────────────────
@Composable
fun NewsModuleScreen() = GenericListModuleScreen(title = "Noticias") { repo ->
    repo.news().map { n ->
        SimpleRow(
            id = n.id.toString(),
            title = nn(n.title),
            subtitle = n.excerpt,
            meta = listOfNotNull(n.status, n.publishedAt).joinToString(" · "),
            trailing = n.category,
        )
    }
}

// ── Contact messages ──────────────────────────────────────────────────────
@Composable
fun ContactMessagesModuleScreen() = GenericListModuleScreen(title = "Mensajes de contacto") { repo ->
    repo.contactMessages().map { m ->
        SimpleRow(
            id = m.id.toString(),
            title = nn(m.subject ?: m.name),
            subtitle = m.message,
            meta = listOfNotNull(m.name, m.email, m.phone).joinToString(" · "),
            trailing = listOfNotNull(m.status, m.category).joinToString(" · "),
        )
    }
}

// ── Newsletter ────────────────────────────────────────────────────────────
@Composable
fun NewsletterModuleScreen() = GenericListModuleScreen(title = "Suscriptores newsletter") { repo ->
    repo.newsletter().map { s ->
        SimpleRow(
            id = s.id.toString(),
            title = nn(s.name ?: s.email),
            subtitle = s.email,
            meta = s.createdAt,
            trailing = s.status,
        )
    }
}

// ── Audit ─────────────────────────────────────────────────────────────────
@Composable
fun AuditModuleScreen() = GenericListModuleScreen(title = "Auditoría") { repo ->
    repo.audit().map { a ->
        SimpleRow(
            id = a.id.toString(),
            title = listOfNotNull(a.action, a.entityType).joinToString(" · ").ifBlank { "Evento" },
            subtitle = a.description,
            meta = listOfNotNull(a.userName, a.createdAt).joinToString(" · "),
            trailing = a.entityId?.let { "ID $it" },
        )
    }
}

// ── Expenses ──────────────────────────────────────────────────────────────
@Composable
fun ExpensesModuleScreen() = GenericListModuleScreen(title = "Gastos") { repo ->
    repo.expenses().map { e ->
        SimpleRow(
            id = e.id.toString(),
            title = nn(e.concepto),
            subtitle = fmtMoney(e.monto),
            meta = listOfNotNull(e.usuario?.nombre, e.createdAt).joinToString(" · "),
            trailing = e.estatus,
        )
    }
}

// ── Fines ─────────────────────────────────────────────────────────────────
@Composable
fun FinesModuleScreen() = GenericListModuleScreen(title = "Multas") { repo ->
    repo.fines().map { f ->
        SimpleRow(
            id = f.id.toString(),
            title = nn(f.motivo),
            subtitle = fmtMoney(f.monto),
            meta = listOfNotNull(f.usuario?.nombre, f.createdAt).joinToString(" · "),
            trailing = f.estatus,
        )
    }
}

// ── Employee payments ─────────────────────────────────────────────────────
@Composable
fun EmployeePaymentsModuleScreen() = GenericListModuleScreen(title = "Pagos a empleados") { repo ->
    repo.employeePayments().map { p ->
        SimpleRow(
            id = p.id.toString(),
            title = nn(p.concepto),
            subtitle = fmtMoney(p.monto),
            meta = listOfNotNull(
                p.usuario?.nombre,
                listOfNotNull(p.periodoInicio, p.periodoFin).takeIf { it.isNotEmpty() }?.joinToString(" → "),
                p.createdAt,
            ).joinToString(" · "),
            trailing = p.estatus,
        )
    }
}

// ── Cotizaciones ──────────────────────────────────────────────────────────
@Composable
fun CotizacionesModuleScreen() {
    val context = androidx.compose.ui.platform.LocalContext.current
    val repo = remember(context) { mx.nexara.mobile.nativeapp.data.extra.ExtraRepository(context) }
    var loading by remember { mutableStateOf(true) }
    var error by remember { mutableStateOf<String?>(null) }
    var items by remember { mutableStateOf(emptyList<mx.nexara.mobile.nativeapp.data.api.CotizacionDto>()) }
    var query by remember { mutableStateOf("") }
    var statusFilter by remember { mutableStateOf("Todos") }

    LaunchedEffect(Unit) {
        try {
            items = kotlinx.coroutines.withContext(kotlinx.coroutines.Dispatchers.IO) { repo.cotizaciones() }
        } catch (e: Exception) {
            error = e.message ?: "Error al cargar cotizaciones"
        } finally {
            loading = false
        }
    }

    val statusOptions = listOf("Todos", "Borrador", "Enviada", "Aprobada", "Rechazada", "Vencida")
    val q = query.trim().lowercase()
    val filtered = items.filter { c ->
        val matchQ = q.isBlank() || buildString {
            append(c.folio ?: ""); append(" "); append(c.cliente ?: "")
            append(" "); append(c.estatus ?: "")
        }.lowercase().contains(q)
        val matchStatus = statusFilter == "Todos" || (c.estatus ?: "").lowercase().contains(statusFilter.lowercase())
        matchQ && matchStatus
    }

    // KPIs
    val totalValue = items.sumOf { it.total ?: 0.0 }
    val approvedValue = items.filter { (it.estatus ?: "").lowercase().contains("aprobad") }.sumOf { it.total ?: 0.0 }
    val pendingCount = items.count { val s = (it.estatus ?: "").lowercase(); s.contains("enviada") || s.contains("borrador") }

    LazyColumn(
        modifier = Modifier.fillMaxSize().padding(16.dp),
        verticalArrangement = Arrangement.spacedBy(0.dp),
    ) {
        item {
            Column {
                // Title omitted — TopAppBar shows it
                Text("${items.size} registros", style = MaterialTheme.typography.bodySmall, color = Color(0xFF64748B))
                Spacer(Modifier.height(12.dp))
            }
        }

        if (loading) {
            item { Text("Cargando cotizaciones...", color = Color(0xFF64748B)) }
            return@LazyColumn
        }

        if (!error.isNullOrBlank()) {
            item { Text(error!!, color = Color(0xFFEF4444)) }
            return@LazyColumn
        }

        // KPI row
        item {
            Row(horizontalArrangement = Arrangement.spacedBy(10.dp), modifier = Modifier.fillMaxWidth()) {
                CotKpi(Modifier.weight(1f), "Total cotizado", fmtMoney(totalValue), Color(0xFFCCFBF1), Color(0xFF0D9488))
                CotKpi(Modifier.weight(1f), "Aprobado", fmtMoney(approvedValue), Color(0xFFD1FAE5), Color(0xFF10B981))
                CotKpi(Modifier.weight(1f), "Pendientes", pendingCount.toString(), Color(0xFFFEF3C7), Color(0xFFF59E0B))
            }
            Spacer(Modifier.height(14.dp))
        }

        // Search
        item {
            OutlinedTextField(
                value = query,
                onValueChange = { query = it },
                label = { Text("Buscar folio, cliente") },
                singleLine = true,
                modifier = Modifier.fillMaxWidth(),
                shape = RoundedCornerShape(12.dp),
            )
            Spacer(Modifier.height(10.dp))
        }

        // Filter chips
        item {
            Row(
                modifier = Modifier.fillMaxWidth().horizontalScroll(rememberScrollState()),
                horizontalArrangement = Arrangement.spacedBy(8.dp),
            ) {
                statusOptions.forEach { opt ->
                    val sel = statusFilter == opt
                    Box(
                        modifier = Modifier
                            .clip(RoundedCornerShape(20.dp))
                            .background(if (sel) Color(0xFF0D9488) else Color(0xFFF1F5F9))
                            .clickable { statusFilter = opt }
                            .padding(horizontal = 14.dp, vertical = 7.dp),
                    ) {
                        Text(
                            opt,
                            style = MaterialTheme.typography.labelMedium.copy(fontWeight = FontWeight.SemiBold),
                            color = if (sel) Color.White else Color(0xFF475569),
                        )
                    }
                }
            }
            Spacer(Modifier.height(12.dp))
        }

        // List
        if (filtered.isEmpty()) {
            item { Text("Sin cotizaciones con este filtro", color = Color(0xFF94A3B8), modifier = Modifier.padding(vertical = 8.dp)) }
        } else {
            items(filtered.take(200)) { c ->
                CotizacionCard(c)
                Spacer(Modifier.height(8.dp))
            }
        }

        item { Spacer(Modifier.height(24.dp)) }
    }
}

@Composable
private fun CotKpi(modifier: Modifier, label: String, value: String, bg: Color, accent: Color) {
    Card(modifier = modifier, shape = RoundedCornerShape(14.dp), colors = CardDefaults.cardColors(containerColor = bg), elevation = CardDefaults.cardElevation(0.dp)) {
        Column(modifier = Modifier.padding(12.dp)) {
            Text(value, style = MaterialTheme.typography.titleMedium.copy(fontWeight = FontWeight.Bold), color = accent)
            Text(label, style = MaterialTheme.typography.labelSmall, color = Color(0xFF64748B))
        }
    }
}

@Composable
private fun CotizacionCard(c: mx.nexara.mobile.nativeapp.data.api.CotizacionDto) {
    val statusColor = when {
        (c.estatus ?: "").lowercase().contains("aprobad") -> Color(0xFF10B981)
        (c.estatus ?: "").lowercase().contains("enviada") -> Color(0xFF3B82F6)
        (c.estatus ?: "").lowercase().contains("rechazad") || (c.estatus ?: "").lowercase().contains("vencid") -> Color(0xFFEF4444)
        else -> Color(0xFFF59E0B)
    }
    Card(
        modifier = Modifier.fillMaxWidth(),
        shape = RoundedCornerShape(14.dp),
        colors = CardDefaults.cardColors(containerColor = Color.White),
        elevation = CardDefaults.cardElevation(2.dp),
    ) {
        Row(modifier = Modifier.padding(14.dp), horizontalArrangement = Arrangement.spacedBy(12.dp)) {
            androidx.compose.foundation.layout.Box(
                modifier = Modifier.width(4.dp).height(56.dp).clip(RoundedCornerShape(2.dp)).background(statusColor)
            )
            Column(modifier = Modifier.weight(1f)) {
                Row(horizontalArrangement = Arrangement.SpaceBetween, modifier = Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
                    Text(
                        c.folio ?: "Cotización #${c.id}",
                        style = MaterialTheme.typography.bodyMedium.copy(fontWeight = FontWeight.Bold),
                        color = Color(0xFF0D9488),
                    )
                    Box(
                        modifier = Modifier.clip(RoundedCornerShape(6.dp)).background(statusColor.copy(alpha = 0.13f)).padding(horizontal = 8.dp, vertical = 3.dp)
                    ) {
                        Text(c.estatus ?: "–", style = MaterialTheme.typography.labelSmall.copy(fontWeight = FontWeight.SemiBold), color = statusColor)
                    }
                }
                if (!c.cliente.isNullOrBlank()) {
                    Text(c.cliente!!, style = MaterialTheme.typography.bodySmall, color = Color(0xFF0F172A))
                }
                Row(horizontalArrangement = Arrangement.SpaceBetween, modifier = Modifier.fillMaxWidth()) {
                    Text(c.fecha ?: c.createdAt ?: "", style = MaterialTheme.typography.labelSmall, color = Color(0xFF94A3B8))
                    Text(fmtMoney(c.total), style = MaterialTheme.typography.titleSmall.copy(fontWeight = FontWeight.Bold), color = Color(0xFF0F172A))
                }
            }
        }
    }
}

// ── Lunch breaks ──────────────────────────────────────────────────────────
@Composable
fun LunchBreaksModuleScreen() = GenericListModuleScreen(title = "Comidas") { repo ->
    repo.usersLunchBreaks().map { l ->
        val late = listOfNotNull(
            if (l.isCheckinLate == true) "Entrada tarde" else null,
            if (l.isCheckoutLate == true) "Salida tarde" else null,
        ).joinToString(", ")
        SimpleRow(
            id = l.id.toString(),
            title = nn(l.user?.nombre ?: "Usuario ${l.userId}"),
            subtitle = listOfNotNull(l.checkinTime?.take(5), l.checkoutTime?.take(5)).joinToString(" → "),
            meta = l.date,
            trailing = late.ifEmpty { l.status },
        )
    }
}

// ── My lunch breaks — ViewModel ───────────────────────────────────────────

data class MyLunchUiState(
    val loading: Boolean = true,
    val error: String? = null,
    val breaks: List<LunchBreakDto> = emptyList(),
    val actionLoading: Boolean = false,
    val actionMessage: String? = null,
)

class MyLunchBreaksViewModel(app: Application) : AndroidViewModel(app) {
    private val repo = ExtraRepository(app.applicationContext)
    private val _state = MutableStateFlow(MyLunchUiState())
    val state: StateFlow<MyLunchUiState> = _state

    fun load(userId: Long?) {
        _state.update { it.copy(loading = true, error = null) }
        viewModelScope.launch {
            try {
                val all = withContext(Dispatchers.IO) { repo.myLunchBreaks() }
                val filtered = if (userId == null) all
                else all.filter { it.userId == userId || it.user?.id == userId }
                _state.update { it.copy(loading = false, breaks = filtered) }
            } catch (e: Exception) {
                _state.update { it.copy(loading = false, error = e.message ?: "Error al cargar") }
            }
        }
    }

    fun checkin(photoDataUrl: String, userId: Long?) {
        _state.update { it.copy(actionLoading = true, actionMessage = null) }
        viewModelScope.launch {
            try {
                val now = java.time.Instant.now().toString()
                withContext(Dispatchers.IO) { repo.lunchCheckin(now, photoDataUrl) }
                _state.update { it.copy(actionLoading = false, actionMessage = "✅ Entrada a comida registrada") }
                load(userId)
            } catch (e: Exception) {
                _state.update { it.copy(actionLoading = false, actionMessage = "❌ ${e.message ?: "Error"}") }
            }
        }
    }

    fun checkout(photoDataUrl: String, userId: Long?) {
        _state.update { it.copy(actionLoading = true, actionMessage = null) }
        viewModelScope.launch {
            try {
                val now = java.time.Instant.now().toString()
                withContext(Dispatchers.IO) { repo.lunchCheckout(now, photoDataUrl) }
                _state.update { it.copy(actionLoading = false, actionMessage = "✅ Salida de comida registrada") }
                load(userId)
            } catch (e: Exception) {
                _state.update { it.copy(actionLoading = false, actionMessage = "❌ ${e.message ?: "Error"}") }
            }
        }
    }

    fun clearMessage() = _state.update { it.copy(actionMessage = null) }

    fun setActionError(message: String) = _state.update { it.copy(actionMessage = "❌ $message") }
}

// ── My lunch breaks — Screen with camera check-in/check-out ───────────────

private fun mediaToDataUrl(context: android.content.Context, media: CapturedMedia): String? {
    return try {
        val bytes = context.contentResolver.openInputStream(media.uri)?.readBytes() ?: return null
        val b64 = android.util.Base64.encodeToString(bytes, android.util.Base64.NO_WRAP)
        val mime = context.contentResolver.getType(media.uri) ?: "image/jpeg"
        "data:$mime;base64,$b64"
    } catch (_: Exception) { null }
}

@Composable
fun MyLunchBreaksModuleScreen(currentUserId: Long?) {
    val context = LocalContext.current
    val vm: MyLunchBreaksViewModel = viewModel()
    val state by vm.state.collectAsState()

    LaunchedEffect(currentUserId) { vm.load(currentUserId) }

    // Determine today's record
    val today = java.time.LocalDate.now().toString() // YYYY-MM-DD
    val todayBreak = state.breaks.firstOrNull { it.date?.startsWith(today) == true }
    val isCheckedIn = todayBreak?.checkinTime != null
    val isCheckedOut = todayBreak?.checkoutTime != null

    // Action state
    var pendingAction by remember { mutableStateOf<String?>(null) } // "checkin" | "checkout"
    var capturedPhoto by remember { mutableStateOf<CapturedMedia?>(null) }

    val TealColor = Color(0xFF0D9488)
    val SubText = Color(0xFF64748B)

    // Snackbar
    state.actionMessage?.let { msg ->
        LaunchedEffect(msg) {
            kotlinx.coroutines.delay(2500)
            vm.clearMessage()
        }
    }

    LazyColumn(
        modifier = Modifier.fillMaxSize().padding(16.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        // Today card
        item {
            Card(
                modifier = Modifier.fillMaxWidth(),
                shape = RoundedCornerShape(14.dp),
                colors = CardDefaults.cardColors(containerColor = Color(0xFFF0FDFA)),
                elevation = CardDefaults.cardElevation(2.dp),
            ) {
                Column(modifier = Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
                    Text("Hoy — $today", style = MaterialTheme.typography.titleSmall.copy(fontWeight = FontWeight.Bold), color = TealColor)
                    if (isCheckedOut) {
                        Text("✅ Comida completada: ${todayBreak?.checkinTime?.take(5)} → ${todayBreak?.checkoutTime?.take(5)}", color = Color(0xFF059669))
                    } else if (isCheckedIn) {
                        Text("🟡 En comida desde ${todayBreak?.checkinTime?.take(5)}", color = Color(0xFFF59E0B))
                    } else {
                        Text("Sin registro de comida hoy", style = MaterialTheme.typography.bodySmall, color = SubText)
                    }

                    if (state.actionMessage != null) {
                        Text(state.actionMessage!!, style = MaterialTheme.typography.bodySmall,
                            color = if (state.actionMessage!!.startsWith("✅")) Color(0xFF059669) else Color(0xFFEF4444))
                    }

                    // Action buttons
                    if (!isCheckedIn && pendingAction == null) {
                        OutlinedButton(
                            onClick = { pendingAction = "checkin"; capturedPhoto = null },
                            modifier = Modifier.fillMaxWidth(),
                            colors = ButtonDefaults.outlinedButtonColors(contentColor = TealColor),
                        ) { Text("📷 Registrar entrada a comida") }
                    }
                    if (isCheckedIn && !isCheckedOut && pendingAction == null) {
                        OutlinedButton(
                            onClick = { pendingAction = "checkout"; capturedPhoto = null },
                            modifier = Modifier.fillMaxWidth(),
                            colors = ButtonDefaults.outlinedButtonColors(contentColor = Color(0xFFF59E0B)),
                        ) { Text("📷 Registrar salida de comida") }
                    }

                    // Camera picker when action pending
                    if (pendingAction != null) {
                        Text(
                            if (pendingAction == "checkin") "Toma una foto para registrar entrada" else "Toma una foto para registrar salida",
                            style = MaterialTheme.typography.bodySmall, color = SubText,
                        )
                        if (capturedPhoto == null) {
                            MediaPickerBar(
                                onPicked = { picked ->
                                    capturedPhoto = picked.firstOrNull()
                                },
                                allowCamera = true,
                                allowGallery = false,
                                allowDocuments = false,
                            )
                        } else {
                            Row(horizontalArrangement = Arrangement.spacedBy(8.dp), modifier = Modifier.fillMaxWidth()) {
                                Button(
                                    onClick = {
                                        val dataUrl = mediaToDataUrl(context, capturedPhoto!!)
                                        if (dataUrl.isNullOrBlank()) {
                                            vm.setActionError("No se pudo leer la foto. Inténtalo de nuevo.")
                                            pendingAction = null
                                            capturedPhoto = null
                                            return@Button
                                        }
                                        if (pendingAction == "checkin") vm.checkin(dataUrl, currentUserId)
                                        else vm.checkout(dataUrl, currentUserId)
                                        pendingAction = null
                                        capturedPhoto = null
                                    },
                                    enabled = !state.actionLoading,
                                    colors = ButtonDefaults.buttonColors(containerColor = TealColor),
                                    modifier = Modifier.weight(1f),
                                ) { Text(if (state.actionLoading) "Enviando…" else "Confirmar") }
                                OutlinedButton(
                                    onClick = { capturedPhoto = null },
                                    modifier = Modifier.weight(1f),
                                ) { Text("Repetir foto") }
                            }
                        }
                        TextButton(onClick = { pendingAction = null; capturedPhoto = null }) {
                            Text("Cancelar", color = Color(0xFFEF4444))
                        }
                    }
                }
            }
        }

        // History header
        item {
            Text("Historial", style = MaterialTheme.typography.titleSmall.copy(fontWeight = FontWeight.SemiBold), color = SubText)
        }

        if (state.loading) {
            item { Text("Cargando…", color = SubText) }
        } else if (!state.error.isNullOrBlank()) {
            item { Text(state.error!!, color = Color(0xFFEF4444)) }
        } else if (state.breaks.isEmpty()) {
            item { Text("Sin registros de comida", color = SubText) }
        } else {
            items(state.breaks) { l ->
                val late = listOfNotNull(
                    if (l.isCheckinLate == true) "Entrada tarde" else null,
                    if (l.isCheckoutLate == true) "Salida tarde" else null,
                ).joinToString(", ")
                Card(
                    modifier = Modifier.fillMaxWidth(),
                    shape = RoundedCornerShape(10.dp),
                    colors = CardDefaults.cardColors(containerColor = Color.White),
                    elevation = CardDefaults.cardElevation(1.dp),
                ) {
                    Row(modifier = Modifier.padding(12.dp), horizontalArrangement = Arrangement.SpaceBetween, verticalAlignment = Alignment.CenterVertically) {
                        Column(modifier = Modifier.weight(1f)) {
                            Text(l.date ?: "—", style = MaterialTheme.typography.bodyMedium.copy(fontWeight = FontWeight.SemiBold))
                            Text(
                                listOfNotNull(l.checkinTime?.take(5), l.checkoutTime?.take(5)).joinToString(" → "),
                                style = MaterialTheme.typography.bodySmall, color = SubText,
                            )
                        }
                        Text(late.ifEmpty { l.status ?: "" }, style = MaterialTheme.typography.labelSmall,
                            color = if (late.isNotEmpty()) Color(0xFFEF4444) else Color(0xFF059669))
                    }
                }
            }
        }

        item { Spacer(Modifier.height(24.dp)) }
    }
}

// ── Documents ─────────────────────────────────────────────────────────────
@Composable
fun DocumentsModuleScreen() = GenericListModuleScreen(title = "Documentos") { repo ->
    repo.documents().map { d ->
        SimpleRow(
            id = d.id.toString(),
            title = nn(d.title),
            subtitle = d.fileUrl,
            meta = d.createdAt,
            trailing = d.type,
        )
    }
}

// ── Accounting journal entries ────────────────────────────────────────────
@Composable
fun AccountingModuleScreen() = GenericListModuleScreen(title = "Contabilidad · Asientos") { repo ->
    repo.journalEntries().map { j ->
        SimpleRow(
            id = j.id.toString(),
            title = nn(j.description ?: j.reference),
            subtitle = "Débito ${fmtMoney(j.totalDebit)}  ·  Crédito ${fmtMoney(j.totalCredit)}",
            meta = j.entryDate,
            trailing = j.status,
        )
    }
}

// ── Invoicing ─────────────────────────────────────────────────────────────
@Composable
fun InvoicingModuleScreen() = GenericListModuleScreen(title = "Facturación") { repo ->
    repo.invoices().map { i ->
        SimpleRow(
            id = i.id.toString(),
            title = nn(i.folio ?: "Factura #${i.id}"),
            subtitle = nn(i.clientName),
            meta = i.issueDate,
            trailing = listOfNotNull(fmtMoney(i.total), i.status).joinToString(" · "),
        )
    }
}

// ── Banking ───────────────────────────────────────────────────────────────
@Composable
fun BankingModuleScreen() = GenericListModuleScreen(title = "Banca · Cuentas") { repo ->
    repo.bankAccounts().map { b ->
        SimpleRow(
            id = b.id.toString(),
            title = nn(b.name),
            subtitle = listOfNotNull(b.bank, b.accountNumber).joinToString(" · "),
            trailing = listOfNotNull(fmtMoney(b.balance), b.currency).joinToString(" · "),
        )
    }
}

