package mx.nexara.mobile.nativeapp.ui.console.screens

import android.app.Application
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
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
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
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
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
import mx.nexara.mobile.nativeapp.data.AuthRepository
import mx.nexara.mobile.nativeapp.data.api.BankAccountDto
import mx.nexara.mobile.nativeapp.data.api.ChartAccountDto
import mx.nexara.mobile.nativeapp.data.api.EmployeePaymentDto
import mx.nexara.mobile.nativeapp.data.api.ExpenseDto
import mx.nexara.mobile.nativeapp.data.api.FineDto
import mx.nexara.mobile.nativeapp.data.api.InvoiceDto
import mx.nexara.mobile.nativeapp.data.api.JournalEntryDto
import mx.nexara.mobile.nativeapp.data.api.toUserMessage
import mx.nexara.mobile.nativeapp.data.extra.ExtraRepository
import mx.nexara.mobile.nativeapp.ui.enterprise.NxEmptyState
import mx.nexara.mobile.nativeapp.ui.enterprise.NxLoadingBlock
import mx.nexara.mobile.nativeapp.ui.enterprise.NxKpi
import mx.nexara.mobile.nativeapp.ui.enterprise.NxKpiGrid
import mx.nexara.mobile.nativeapp.ui.enterprise.NxPanelShell
import mx.nexara.mobile.nativeapp.ui.enterprise.NxStatusChip
import mx.nexara.mobile.nativeapp.ui.console.util.financeStatusTone
import mx.nexara.mobile.nativeapp.ui.enterprise.NxTone
import mx.nexara.mobile.nativeapp.ui.enterprise.fg
import java.time.LocalDate
import java.util.Locale

private fun fmtMoney(v: Double?): String {
    if (v == null) return "—"
    return String.format(Locale("es", "MX"), "$%,.0f", v)
}

// ── Expenses ───────────────────────────────────────────────────────────────

data class ExpensesRichUiState(
    val loading: Boolean = true,
    val isRefreshing: Boolean = false,
    val query: String = "",
    val items: List<ExpenseDto> = emptyList(),
    val acting: Boolean = false,
    val message: String? = null,
)

class ExpensesRichViewModel(app: Application) : AndroidViewModel(app) {
    private val repo = ExtraRepository(app.applicationContext)
    private val _state = MutableStateFlow(ExpensesRichUiState())
    val state: StateFlow<ExpensesRichUiState> = _state

    init { refresh() }
    fun setQuery(v: String) = _state.update { it.copy(query = v) }
    fun clearMessage() = _state.update { it.copy(message = null) }

    fun refresh() {
        val hasData = _state.value.items.isNotEmpty()
        _state.update { it.copy(loading = !hasData, isRefreshing = hasData) }
        viewModelScope.launch {
            val list = withContext(Dispatchers.IO) { repo.expenses() }
            _state.update { it.copy(loading = false, isRefreshing = false, items = list) }
        }
    }

    fun create(concepto: String, monto: Double, categoria: String?, ticketUrl: String?, onDone: () -> Unit) {
        _state.update { it.copy(acting = true, message = null) }
        viewModelScope.launch {
            try {
                withContext(Dispatchers.IO) { repo.createExpense(concepto, monto, categoria, ticketUrl) }
                _state.update { it.copy(acting = false, message = "✅ Gasto registrado") }
                refresh()
                onDone()
            } catch (e: Exception) {
                _state.update { it.copy(acting = false, message = "❌ ${e.message ?: "Error"}") }
            }
        }
    }

    fun decide(id: Long, approve: Boolean, note: String?) {
        if (!approve && note.isNullOrBlank()) {
            _state.update { it.copy(message = "❌ Indica motivo de rechazo") }
            return
        }
        _state.update { it.copy(acting = true, message = null) }
        viewModelScope.launch {
            try {
                withContext(Dispatchers.IO) { repo.approveExpense(id, approve, note) }
                _state.update {
                    it.copy(acting = false, message = if (approve) "✅ Gasto aprobado" else "✅ Gasto rechazado")
                }
                refresh()
            } catch (e: Exception) {
                _state.update { it.copy(acting = false, message = "❌ ${e.message ?: "Error"}") }
            }
        }
    }

    fun markPagado(id: Long) {
        _state.update { it.copy(acting = true, message = null) }
        viewModelScope.launch {
            try {
                withContext(Dispatchers.IO) { repo.markExpensePagado(id) }
                _state.update { it.copy(acting = false, message = "✅ Marcado como pagado") }
                refresh()
            } catch (e: Exception) {
                _state.update { it.copy(acting = false, message = "❌ ${e.message ?: "Error"}") }
            }
        }
    }

    fun filtered(): List<ExpenseDto> {
        val q = _state.value.query.trim().lowercase()
        if (q.isBlank()) return _state.value.items
        return _state.value.items.filter {
            (it.concepto ?: "").lowercase().contains(q) ||
                it.displayStatus().lowercase().contains(q)
        }
    }

    fun total() = _state.value.items.sumOf { it.displayAmount() }
    fun pendingTotal() = _state.value.items
        .filter { it.displayStatus().equals("pendiente", true) }
        .sumOf { it.displayAmount() }
}

@Composable
fun ExpensesRichScreen(vm: ExpensesRichViewModel = viewModel()) {
    val s by vm.state.collectAsState()
    val context = LocalContext.current
    val user = remember { AuthRepository(context).loadSession() }
    val canManage = user?.isSuperAdmin == true ||
        (user?.permissions ?: emptyList()).any {
            it.contains("contabilidad.manage") || it.contains("console.admin")
        }

    var selected by remember { mutableStateOf<ExpenseDto?>(null) }
    var showCreate by remember { mutableStateOf(false) }
    var concepto by remember { mutableStateOf("") }
    var montoText by remember { mutableStateOf("") }
    var categoria by remember { mutableStateOf("OTROS") }
    var rejectNote by remember { mutableStateOf("") }

    if (showCreate) {
        FinanceDetailScaffold(onBack = { showCreate = false }) {
            item { Text("Nuevo gasto", fontWeight = FontWeight.Bold, style = MaterialTheme.typography.titleMedium) }
            item {
                OutlinedTextField(
                    value = concepto,
                    onValueChange = { concepto = it },
                    label = { Text("Concepto") },
                    modifier = Modifier.fillMaxWidth(),
                )
            }
            item {
                OutlinedTextField(
                    value = montoText,
                    onValueChange = { montoText = it.filter { c -> c.isDigit() || c == '.' } },
                    label = { Text("Monto") },
                    modifier = Modifier.fillMaxWidth(),
                    singleLine = true,
                )
            }
            item {
                OutlinedTextField(
                    value = categoria,
                    onValueChange = { categoria = it },
                    label = { Text("Categoría") },
                    modifier = Modifier.fillMaxWidth(),
                    singleLine = true,
                )
            }
            if (!s.message.isNullOrBlank()) {
                item {
                    Text(s.message!!, color = if (s.message!!.startsWith("✅")) Color(0xFF2E7D32) else Color(0xFFC62828))
                }
            }
            item {
                Button(
                    onClick = {
                        val m = montoText.toDoubleOrNull() ?: return@Button
                        if (concepto.isBlank() || m <= 0) return@Button
                        vm.create(concepto.trim(), m, categoria, null) { showCreate = false }
                    },
                    enabled = !s.acting,
                    modifier = Modifier.fillMaxWidth(),
                ) { Text(if (s.acting) "Guardando…" else "Registrar gasto") }
            }
        }
        return
    }

    val sel = selected
    if (sel != null) {
        val pending = sel.displayStatus().equals("pendiente", true)
        FinanceDetailScaffold(onBack = { selected = null; rejectNote = "" }) {
            item {
                NxPanelShell {
                    Text(sel.concepto ?: "Gasto", fontWeight = FontWeight.Bold, style = MaterialTheme.typography.titleMedium)
                }
            }
            item { FinanceRow("Monto", fmtMoney(sel.displayAmount())) }
            item { FinanceRow("Estatus", sel.displayStatus(), statusTone = financeStatusTone(sel.displayStatus())) }
            if (!sel.estatus.isNullOrBlank() && sel.estatus != sel.displayStatus()) {
                item { FinanceRow("Estado solicitud", sel.estatus) }
            }
            item { FinanceRow("Categoría", sel.categoria) }
            item { FinanceRow("Responsable", sel.usuario?.nombre) }
            item { FinanceRow("Fecha", sel.createdAt?.take(10)) }
            val ticketUrl = sel.ticketEvidenciaUrl?.takeIf { it.isNotBlank() }
            if (!ticketUrl.isNullOrBlank()) {
                item {
                    OutlinedButton(
                        onClick = {
                            runCatching {
                                val uri = android.net.Uri.parse(ticketUrl)
                                context.startActivity(android.content.Intent(android.content.Intent.ACTION_VIEW, uri))
                            }
                        },
                        modifier = Modifier.fillMaxWidth(),
                    ) { Text("Ver comprobante") }
                }
            }
            if (canManage && pending) {
                item {
                    OutlinedTextField(
                        value = rejectNote,
                        onValueChange = { rejectNote = it },
                        label = { Text("Nota / rechazo") },
                        modifier = Modifier.fillMaxWidth(),
                    )
                }
                item {
                    Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        Button(
                            onClick = {
                                vm.decide(sel.id, true, rejectNote.ifBlank { null })
                                selected = null
                            },
                            enabled = !s.acting,
                            modifier = Modifier.weight(1f),
                            colors = ButtonDefaults.buttonColors(containerColor = Color(0xFF2E7D32)),
                        ) { Text("Aprobar") }
                        OutlinedButton(
                            onClick = {
                                vm.decide(sel.id, false, rejectNote)
                                selected = null
                            },
                            enabled = !s.acting,
                            modifier = Modifier.weight(1f),
                        ) { Text("Rechazar", color = Color(0xFFC62828)) }
                    }
                }
            }
            val approvedUnpaid = sel.displayStatus().equals("aprobado", true) ||
                sel.displayStatus().equals("aprobada", true)
            if (canManage && approvedUnpaid) {
                item {
                    Button(
                        onClick = {
                            vm.markPagado(sel.id)
                            selected = null
                        },
                        enabled = !s.acting,
                        modifier = Modifier.fillMaxWidth(),
                        colors = ButtonDefaults.buttonColors(containerColor = Color(0xFF00695C)),
                    ) { Text(if (s.acting) "Marcando…" else "Marcar pagado") }
                }
            }
            if (!s.message.isNullOrBlank()) {
                item {
                    Text(s.message!!, color = if (s.message!!.startsWith("✅")) Color(0xFF2E7D32) else Color(0xFFC62828))
                }
            }
        }
        return
    }
    Column(Modifier.fillMaxSize()) {
        Row(
            Modifier.fillMaxWidth().padding(horizontal = 12.dp, vertical = 4.dp),
            horizontalArrangement = Arrangement.End,
        ) {
            Button(onClick = { showCreate = true; vm.clearMessage() }) { Text("+ Gasto") }
        }
        FinanceScaffold(
            kpis = listOf(
                NxKpi("Gastos", "${s.items.size}", tone = NxTone.Brand),
                NxKpi("Total", fmtMoney(vm.total()), tone = NxTone.Danger),
                NxKpi("Pendiente", fmtMoney(vm.pendingTotal()), tone = NxTone.Warning),
            ),
            query = s.query,
            onQuery = vm::setQuery,
            placeholder = "Buscar gasto…",
            loading = s.loading,
            isRefreshing = s.isRefreshing,
            onRefresh = vm::refresh,
            isEmpty = vm.filtered().isEmpty(),
            emptyTitle = "Sin gastos",
            emptySubtitle = "Registra el primero con el botón + Gasto.",
            emptyActionLabel = "+ Gasto",
            onEmptyAction = { showCreate = true; vm.clearMessage() },
        ) {
            items(vm.filtered().take(80), key = { it.id }) { e ->
                NxPanelShell(onClick = { selected = e }) {
                    Text(e.concepto ?: "Gasto", fontWeight = FontWeight.Bold)
                    Text(e.usuario?.nombre ?: "", style = MaterialTheme.typography.bodySmall)
                    Row(
                        Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.SpaceBetween,
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        Text(fmtMoney(e.displayAmount()), fontWeight = FontWeight.SemiBold, color = NxTone.Danger.fg())
                        NxStatusChip(e.displayStatus(), financeStatusTone(e.displayStatus()))
                    }
                }
            }
        }
    }
}

// ── Invoices ───────────────────────────────────────────────────────────────

data class InvoicesRichUiState(
    val loading: Boolean = true,
    val isRefreshing: Boolean = false,
    val query: String = "",
    val statusFilter: String = "todos",
    val items: List<InvoiceDto> = emptyList(),
    val acting: Boolean = false,
    val message: String? = null,
    val detail: Map<String, Any?>? = null,
)

class InvoicesRichViewModel(app: Application) : AndroidViewModel(app) {
    private val repo = ExtraRepository(app.applicationContext)
    private val _state = MutableStateFlow(InvoicesRichUiState())
    val state: StateFlow<InvoicesRichUiState> = _state

    init { refresh() }
    fun setQuery(v: String) = _state.update { it.copy(query = v) }
    fun setStatus(v: String) = _state.update { it.copy(statusFilter = v) }
    fun clearMessage() = _state.update { it.copy(message = null) }

    fun refresh() {
        val hasData = _state.value.items.isNotEmpty()
        _state.update { it.copy(loading = !hasData, isRefreshing = hasData) }
        viewModelScope.launch {
            val list = withContext(Dispatchers.IO) { repo.invoices() }
            _state.update { it.copy(loading = false, isRefreshing = false, items = list) }
        }
    }

    fun loadDetail(id: Long) {
        viewModelScope.launch {
            val d = withContext(Dispatchers.IO) { runCatching { repo.invoiceDetail(id) }.getOrNull() }
            _state.update { it.copy(detail = d) }
        }
    }

    fun registerPayment(id: Long, amount: Double, method: String?, reference: String?, onDone: () -> Unit) {
        _state.update { it.copy(acting = true, message = null) }
        viewModelScope.launch {
            try {
                val date = java.time.LocalDate.now().toString()
                withContext(Dispatchers.IO) {
                    repo.registerInvoicePayment(
                        id = id,
                        amount = amount,
                        paymentDate = date,
                        method = method,
                        reference = reference,
                    )
                }
                _state.update { it.copy(acting = false, message = "✅ Pago registrado") }
                loadDetail(id)
                refresh()
                onDone()
            } catch (e: Exception) {
                _state.update { it.copy(acting = false, message = "❌ ${e.message ?: "Error"}") }
            }
        }
    }

    fun evaluateMatch(id: Long) {
        _state.update { it.copy(acting = true, message = null) }
        viewModelScope.launch {
            try {
                val result = withContext(Dispatchers.IO) { repo.evaluateInvoiceMatch(id) }
                val status = result["matchStatus"]?.toString()
                    ?: result["status"]?.toString()
                    ?: "evaluado"
                _state.update { it.copy(acting = false, message = "✅ 3-way match: $status", detail = result) }
                loadDetail(id)
            } catch (e: Exception) {
                _state.update { it.copy(acting = false, message = "❌ ${e.message ?: "Error"}") }
            }
        }
    }

    fun filtered(): List<InvoiceDto> {
        var list = _state.value.items
        if (_state.value.statusFilter != "todos") {
            list = list.filter { (it.status ?: "").lowercase() == _state.value.statusFilter }
        }
        val q = _state.value.query.trim().lowercase()
        if (q.isNotBlank()) {
            list = list.filter {
                (it.folio ?: "").lowercase().contains(q) ||
                    (it.clientName ?: "").lowercase().contains(q)
            }
        }
        return list
    }

    fun totalPaid() = _state.value.items
        .filter { (it.status ?: "").lowercase() == "pagada" }
        .sumOf { it.total ?: 0.0 }

    fun totalPending() = _state.value.items
        .filter { (it.status ?: "").lowercase() == "pendiente" }
        .sumOf { it.total ?: 0.0 }
}

@Composable
fun InvoicesRichScreen(vm: InvoicesRichViewModel = viewModel()) {
    val s by vm.state.collectAsState()
    val context = LocalContext.current
    val user = remember { AuthRepository(context).loadSession() }
    val canManage = user?.isSuperAdmin == true ||
        (user?.permissions ?: emptyList()).any {
            it.contains("invoicing.manage") || it.contains("contabilidad.manage") || it.contains("console.admin")
        }
    val statuses = listOf("todos", "pagada", "pendiente", "cancelada", "vencida")
    var selected by remember { mutableStateOf<InvoiceDto?>(null) }
    var payAmount by remember { mutableStateOf("") }
    var payMethod by remember { mutableStateOf("TRANSFERENCIA") }
    var payRef by remember { mutableStateOf("") }

    val sel = selected
    if (sel != null) {
        LaunchedEffect(sel.id) { vm.loadDetail(sel.id) }
        val detail = s.detail
        val pdfUrl = (detail?.get("pdfUrl") as? String)?.takeIf { it.isNotBlank() } ?: sel.pdfUrl
        val matchStatus = detail?.get("matchStatus")?.toString()
            ?: detail?.get("threeWayMatchStatus")?.toString()
            ?: sel.matchStatus
        val balance = (detail?.get("balance") as? Number)?.toDouble()
            ?: (detail?.get("amountDue") as? Number)?.toDouble()
            ?: sel.balance
        val subtotal = detailNum(detail, "subtotal", "subTotal")
        val taxAmount = detailNum(detail, "taxAmount", "iva", "tax")
        val dueDate = detailStr(detail, "dueDate", "fechaVencimiento")
        val notes = detailStr(detail, "notes", "notas")
        val lineItems = detailMaps(detail, "items", "lineItems", "concepts")
        val payments = detailMaps(detail, "payments", "pagos")
        val pending = (sel.status ?: "").lowercase().let {
            it.contains("pendiente") || it.contains("parcial") || it.contains("open") || it.contains("posted")
        }
        FinanceDetailScaffold(onBack = { selected = null; vm.clearMessage(); payAmount = ""; payRef = "" }) {
            item {
                NxPanelShell {
                    Text(sel.folio ?: "Factura #${sel.id}", fontWeight = FontWeight.Bold, style = MaterialTheme.typography.titleMedium)
                    if (!sel.clientName.isNullOrBlank()) {
                        Text(sel.clientName, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                    }
                }
            }
            if (subtotal != null) item { FinanceRow("Subtotal", fmtMoney(subtotal)) }
            if (taxAmount != null) item { FinanceRow("Impuestos", fmtMoney(taxAmount)) }
            item { FinanceRow("Total", fmtMoney(sel.total)) }
            if (balance != null)             item { FinanceRow("Saldo", fmtMoney(balance)) }
            item { FinanceRow("Estatus", sel.status, statusTone = financeStatusTone(sel.status)) }
            item { FinanceRow("Emisión", sel.issueDate?.take(10)) }
            if (!dueDate.isNullOrBlank()) item { FinanceRow("Vencimiento", dueDate.take(10)) }
            if (!matchStatus.isNullOrBlank()) {
                item { FinanceRow("3-way match", matchStatus, statusTone = financeStatusTone(matchStatus)) }
            }
            if (!notes.isNullOrBlank()) {
                item { Text("Notas", fontWeight = FontWeight.SemiBold) }
                item { Text(notes, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant) }
            }
            if (lineItems.isNotEmpty()) {
                item { Text("Conceptos (${lineItems.size})", fontWeight = FontWeight.SemiBold) }
                lineItems.take(12).forEach { row ->
                    item {
                        val desc = detailStr(row, "description", "descripcion", "concept")
                        val qty = detailNum(row, "quantity", "cantidad") ?: 1.0
                        val unit = detailNum(row, "unitPrice", "precioUnitario", "price") ?: 0.0
                        val lineTotal = detailNum(row, "total", "amount", "lineTotal") ?: (qty * unit)
                        NxPanelShell {
                            Text(desc ?: "Concepto", fontWeight = FontWeight.Medium)
                            Text(
                                "${qty.toInt()} × ${fmtMoney(unit)} = ${fmtMoney(lineTotal)}",
                                style = MaterialTheme.typography.bodySmall,
                                color = MaterialTheme.colorScheme.onSurfaceVariant,
                            )
                        }
                    }
                }
            }
            if (payments.isNotEmpty()) {
                item { Text("Pagos (${payments.size})", fontWeight = FontWeight.SemiBold) }
                payments.take(8).forEach { row ->
                    item {
                        val amt = detailNum(row, "amount", "monto") ?: 0.0
                        val date = detailStr(row, "paymentDate", "fecha", "createdAt")?.take(10)
                        val method = detailStr(row, "method", "metodo", "paymentMethod")
                        NxPanelShell {
                            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                                Column {
                                    Text(fmtMoney(amt), fontWeight = FontWeight.SemiBold, color = NxTone.Success.fg())
                                    if (!method.isNullOrBlank()) {
                                        Text(method, style = MaterialTheme.typography.labelSmall)
                                    }
                                }
                                if (!date.isNullOrBlank()) {
                                    Text(date, style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                                }
                            }
                        }
                    }
                }
            }
            if (!pdfUrl.isNullOrBlank()) {
                item {
                    OutlinedButton(
                        onClick = {
                            runCatching {
                                val uri = android.net.Uri.parse(pdfUrl)
                                context.startActivity(android.content.Intent(android.content.Intent.ACTION_VIEW, uri))
                            }
                        },
                        modifier = Modifier.fillMaxWidth(),
                    ) { Text("Abrir PDF") }
                }
            }
            if (canManage) {
                item {
                    Button(
                        onClick = { vm.evaluateMatch(sel.id) },
                        enabled = !s.acting,
                        modifier = Modifier.fillMaxWidth(),
                        colors = ButtonDefaults.buttonColors(containerColor = Color(0xFF0D9488)),
                    ) { Text(if (s.acting) "Evaluando…" else "Evaluar 3-way match") }
                }
            }
            if (canManage && pending) {
                item { Text("Registrar pago", fontWeight = FontWeight.SemiBold) }
                item {
                    OutlinedTextField(
                        value = payAmount,
                        onValueChange = { payAmount = it.filter { c -> c.isDigit() || c == '.' } },
                        label = { Text("Monto") },
                        modifier = Modifier.fillMaxWidth(),
                        singleLine = true,
                    )
                }
                item {
                    OutlinedTextField(
                        value = payMethod,
                        onValueChange = { payMethod = it },
                        label = { Text("Método") },
                        modifier = Modifier.fillMaxWidth(),
                        singleLine = true,
                    )
                }
                item {
                    OutlinedTextField(
                        value = payRef,
                        onValueChange = { payRef = it },
                        label = { Text("Referencia") },
                        modifier = Modifier.fillMaxWidth(),
                        singleLine = true,
                    )
                }
                item {
                    Button(
                        onClick = {
                            val amt = payAmount.toDoubleOrNull() ?: return@Button
                            if (amt <= 0) return@Button
                            vm.registerPayment(sel.id, amt, payMethod.ifBlank { null }, payRef.ifBlank { null }) {
                                payAmount = ""
                                payRef = ""
                            }
                        },
                        enabled = !s.acting,
                        modifier = Modifier.fillMaxWidth(),
                    ) { Text(if (s.acting) "Guardando…" else "Registrar pago") }
                }
            }
            if (!s.message.isNullOrBlank()) {
                item {
                    Text(
                        s.message!!,
                        color = if (s.message!!.startsWith("✅")) Color(0xFF2E7D32) else Color(0xFFC62828),
                    )
                }
            }
        }
        return
    }
    Column(Modifier.fillMaxSize()) {
        FinanceScaffold(
            kpis = listOf(
                NxKpi("Facturas", "${s.items.size}", tone = NxTone.Brand),
                NxKpi("Pagadas", fmtMoney(vm.totalPaid()), tone = NxTone.Success),
                NxKpi("Pendiente", fmtMoney(vm.totalPending()), tone = NxTone.Warning),
            ),
            query = s.query,
            onQuery = vm::setQuery,
            placeholder = "Buscar factura…",
            loading = s.loading,
            isRefreshing = s.isRefreshing,
            onRefresh = vm::refresh,
            isEmpty = vm.filtered().isEmpty(),
            emptyTitle = "Sin facturas",
            emptySubtitle = "No hay facturas registradas con los filtros actuales.",
            chips = {
                Row(
                    Modifier
                        .horizontalScroll(rememberScrollState())
                        .padding(horizontal = 16.dp, vertical = 4.dp),
                    horizontalArrangement = Arrangement.spacedBy(6.dp),
                ) {
                    statuses.forEach { st ->
                        FilterChip(
                            selected = s.statusFilter == st,
                            onClick = { vm.setStatus(st) },
                            label = { Text(if (st == "todos") "Todos" else st.replaceFirstChar { it.titlecase() }) },
                        )
                    }
                }
            },
        ) {
            items(vm.filtered().take(80), key = { it.id }) { inv ->
                NxPanelShell(onClick = { selected = inv }) {
                    Text(inv.folio ?: "Factura #${inv.id}", fontWeight = FontWeight.Bold)
                    Text(inv.clientName ?: "", style = MaterialTheme.typography.bodySmall)
                    Row(
                        Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.SpaceBetween,
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        Text(fmtMoney(inv.total), fontWeight = FontWeight.SemiBold)
                        NxStatusChip(inv.status ?: "—", financeStatusTone(inv.status))
                    }
                }
            }
        }
    }
}

// ── Banking ────────────────────────────────────────────────────────────────

data class BankingRichUiState(
    val loading: Boolean = true,
    val isRefreshing: Boolean = false,
    val query: String = "",
    val items: List<BankAccountDto> = emptyList(),
    val showCreate: Boolean = false,
    val saving: Boolean = false,
    val actionMessage: String? = null,
)

class BankingRichViewModel(app: Application) : AndroidViewModel(app) {
    private val repo = ExtraRepository(app.applicationContext)
    private val _state = MutableStateFlow(BankingRichUiState())
    val state: StateFlow<BankingRichUiState> = _state
    init { refresh() }
    fun setQuery(v: String) = _state.update { it.copy(query = v) }
    fun setShowCreate(show: Boolean) = _state.update { it.copy(showCreate = show, actionMessage = null) }
    fun refresh() {
        val hasData = _state.value.items.isNotEmpty()
        _state.update { it.copy(loading = !hasData, isRefreshing = hasData) }
        viewModelScope.launch {
            try {
                val list = withContext(Dispatchers.IO) { repo.bankAccounts() }
                _state.update { it.copy(loading = false, isRefreshing = false, items = list) }
            } catch (e: Exception) {
                _state.update { it.copy(loading = false, isRefreshing = false, actionMessage = "❌ ${e.toUserMessage("No se pudieron cargar cuentas")}") }
            }
        }
    }
    fun createAccount(name: String, bankName: String, accountNumber: String, currency: String, onDone: () -> Unit) {
        if (name.isBlank() || bankName.isBlank() || accountNumber.isBlank()) {
            _state.update { it.copy(actionMessage = "❌ Nombre, banco y número son obligatorios") }
            return
        }
        _state.update { it.copy(saving = true, actionMessage = null) }
        viewModelScope.launch {
            try {
                withContext(Dispatchers.IO) {
                    repo.createBankAccount(name.trim(), bankName.trim(), accountNumber.trim(), currency.ifBlank { "MXN" })
                }
                _state.update { it.copy(saving = false, showCreate = false, actionMessage = "✅ Cuenta creada") }
                refresh()
                onDone()
            } catch (e: Exception) {
                _state.update { it.copy(saving = false, actionMessage = "❌ ${e.toUserMessage("No se pudo crear cuenta")}") }
            }
        }
    }
    fun filtered(): List<BankAccountDto> {
        val q = _state.value.query.trim().lowercase()
        if (q.isBlank()) return _state.value.items
        return _state.value.items.filter {
            (it.name ?: "").lowercase().contains(q) || (it.bank ?: "").lowercase().contains(q)
        }
    }
    fun totalBalance() = _state.value.items.sumOf { it.balance ?: 0.0 }
}

@Composable
fun BankingRichScreen(vm: BankingRichViewModel = viewModel()) {
    val s by vm.state.collectAsState()
    var selected by remember { mutableStateOf<BankAccountDto?>(null) }
    var name by remember { mutableStateOf("") }
    var bankName by remember { mutableStateOf("") }
    var accountNumber by remember { mutableStateOf("") }
    var currency by remember { mutableStateOf("MXN") }

    if (s.showCreate) {
        LazyColumn(
            Modifier.fillMaxSize().padding(16.dp),
            verticalArrangement = Arrangement.spacedBy(10.dp),
        ) {
            item { OutlinedButton(onClick = { vm.setShowCreate(false) }) { Text("← Cancelar") } }
            item { Text("Nueva cuenta bancaria", fontWeight = FontWeight.Bold, style = MaterialTheme.typography.titleMedium) }
            item { OutlinedTextField(name, { name = it }, label = { Text("Nombre *") }, modifier = Modifier.fillMaxWidth()) }
            item { OutlinedTextField(bankName, { bankName = it }, label = { Text("Banco *") }, modifier = Modifier.fillMaxWidth()) }
            item { OutlinedTextField(accountNumber, { accountNumber = it }, label = { Text("Número de cuenta *") }, modifier = Modifier.fillMaxWidth()) }
            item { OutlinedTextField(currency, { currency = it }, label = { Text("Moneda") }, modifier = Modifier.fillMaxWidth()) }
            item {
                Button(
                    onClick = { vm.createAccount(name, bankName, accountNumber, currency) { name = ""; bankName = ""; accountNumber = ""; currency = "MXN" } },
                    enabled = !s.saving,
                    modifier = Modifier.fillMaxWidth(),
                ) { Text(if (s.saving) "Creando…" else "Crear cuenta") }
            }
            if (!s.actionMessage.isNullOrBlank()) {
                item {
                    Text(
                        s.actionMessage!!,
                        color = if (s.actionMessage!!.startsWith("✅")) Color(0xFF059669) else MaterialTheme.colorScheme.error,
                    )
                }
            }
        }
        return
    }

    val sel = selected
    if (sel != null) {
        FinanceDetailScaffold(onBack = { selected = null }) {
            item {
                NxPanelShell(contentPadding = PaddingValues(16.dp)) {
                    Column(
                        verticalArrangement = Arrangement.spacedBy(4.dp),
                        horizontalAlignment = Alignment.CenterHorizontally,
                    ) {
                        Text("Saldo", style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                        Text(
                            fmtMoney(sel.balance),
                            fontWeight = FontWeight.Bold,
                            style = MaterialTheme.typography.headlineMedium,
                            color = NxTone.Info.fg(),
                        )
                    }
                }
            }
            item { Spacer(Modifier.height(8.dp)) }
            item { FinanceRow("Nombre", sel.name) }
            item { FinanceRow("Banco", sel.bank) }
            item { FinanceRow("Número de cuenta", sel.accountNumber) }
            item { FinanceRow("Moneda", sel.currency) }
        }
        return
    }
    FinanceScaffold(
        kpis = listOf(
            NxKpi("Cuentas", "${s.items.size}", tone = NxTone.Brand),
            NxKpi("Saldo total", fmtMoney(vm.totalBalance()), tone = NxTone.Info),
        ),
        query = s.query,
        onQuery = vm::setQuery,
        placeholder = "Buscar cuenta…",
        loading = s.loading,
        isRefreshing = s.isRefreshing,
        onRefresh = vm::refresh,
        isEmpty = vm.filtered().isEmpty(),
        emptyTitle = "Sin cuentas bancarias",
        emptySubtitle = "No hay cuentas bancarias registradas en el sistema.",
        emptyActionLabel = "Nueva cuenta",
        onEmptyAction = { vm.setShowCreate(true) },
    ) {
        item {
            Button(onClick = { vm.setShowCreate(true) }, modifier = Modifier.fillMaxWidth().padding(bottom = 8.dp)) {
                Text("+ Nueva cuenta")
            }
        }
        if (!s.actionMessage.isNullOrBlank()) {
            item {
                Text(
                    s.actionMessage!!,
                    color = if (s.actionMessage!!.startsWith("✅")) Color(0xFF059669) else MaterialTheme.colorScheme.error,
                    modifier = Modifier.padding(bottom = 8.dp),
                )
            }
        }
        items(vm.filtered().take(40), key = { it.id }) { acc ->
            NxPanelShell(onClick = { selected = acc }) {
                Text(acc.name ?: "Cuenta", fontWeight = FontWeight.Bold)
                Text(acc.bank ?: "", style = MaterialTheme.typography.bodySmall)
                Row(
                    Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Text(fmtMoney(acc.balance), fontWeight = FontWeight.SemiBold, color = NxTone.Info.fg())
                    val last4 = acc.accountNumber?.takeLast(4)?.let { "···$it" }
                    if (!last4.isNullOrBlank()) {
                        NxStatusChip(last4, NxTone.Neutral)
                    }
                }
            }
        }
    }
}

// ── Fines ──────────────────────────────────────────────────────────────────

data class FinesRichUiState(
    val loading: Boolean = true,
    val isRefreshing: Boolean = false,
    val query: String = "",
    val items: List<FineDto> = emptyList(),
    val actingId: Long? = null,
    val actionMessage: String? = null,
)

class FinesRichViewModel(app: Application) : AndroidViewModel(app) {
    private val repo = ExtraRepository(app.applicationContext)
    private val _state = MutableStateFlow(FinesRichUiState())
    val state: StateFlow<FinesRichUiState> = _state

    init { refresh() }
    fun setQuery(v: String) = _state.update { it.copy(query = v) }

    fun refresh() {
        val hasData = _state.value.items.isNotEmpty()
        _state.update { it.copy(loading = !hasData, isRefreshing = hasData) }
        viewModelScope.launch {
            val list = withContext(Dispatchers.IO) { repo.fines() }
            _state.update { it.copy(loading = false, isRefreshing = false, items = list) }
        }
    }

    fun filtered(): List<FineDto> {
        val q = _state.value.query.trim().lowercase()
        if (q.isBlank()) return _state.value.items
        return _state.value.items.filter {
            it.displayMotivo().lowercase().contains(q) ||
                (it.displayUserName() ?: "").lowercase().contains(q) ||
                (it.displayTipo() ?: "").lowercase().contains(q)
        }
    }

    fun totalAmount() = _state.value.items.sumOf { it.displayAmount() }
    fun pendingTotal() = _state.value.items
        .filter { !it.displayStatus().equals("pagado", true) && !it.displayStatus().equals("pagada", true) }
        .sumOf { it.displayAmount() }

    fun decide(id: Long, approve: Boolean, note: String?) {
        if (!approve && note.isNullOrBlank()) {
            _state.update { it.copy(actionMessage = "❌ Indica motivo de rechazo") }
            return
        }
        _state.update { it.copy(actingId = id, actionMessage = null) }
        viewModelScope.launch {
            try {
                withContext(Dispatchers.IO) { repo.approveFine(id, approve, note) }
                _state.update {
                    it.copy(
                        actingId = null,
                        actionMessage = if (approve) "✅ Multa aprobada" else "✅ Multa rechazada",
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

@Composable
fun FinesRichScreen(vm: FinesRichViewModel = viewModel()) {
    val s by vm.state.collectAsState()
    var selected by remember { mutableStateOf<FineDto?>(null) }
    var rejectNote by remember { mutableStateOf("") }
    val context = LocalContext.current
    val canApprove = remember {
        AuthRepository(context).loadSession()?.let { u ->
            u.isSuperAdmin || u.permissions.any {
                it.contains("console.admin") || it.contains("activities.manage")
            }
        } == true
    }

    val sel = selected
    if (sel != null) {
        val pendingApproval = sel.displayApproval().equals("pendiente", true) ||
            sel.displayApproval().equals("pending", true) ||
            sel.displayApproval() == "—"
        FinanceDetailScaffold(onBack = { selected = null; rejectNote = "" }) {
            item {
                NxPanelShell(contentPadding = PaddingValues(16.dp)) {
                    Column(
                        verticalArrangement = Arrangement.spacedBy(4.dp),
                        horizontalAlignment = Alignment.CenterHorizontally,
                    ) {
                        Text("Monto", style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                        Text(
                            fmtMoney(sel.displayAmount()),
                            fontWeight = FontWeight.Bold,
                            style = MaterialTheme.typography.headlineMedium,
                            color = NxTone.Danger.fg(),
                        )
                    }
                }
            }
            item { Spacer(Modifier.height(8.dp)) }
            item { Text(sel.displayMotivo(), fontWeight = FontWeight.Bold, style = MaterialTheme.typography.titleMedium) }
            item { FinanceRow("Empleado", sel.displayUserName()) }
            item { FinanceRow("Tipo", sel.displayTipo()) }
            item { FinanceRow("Estatus pago", sel.displayStatus(), statusTone = financeStatusTone(sel.displayStatus())) }
            item { FinanceRow("Aprobación", sel.displayApproval(), statusTone = financeStatusTone(sel.displayApproval())) }
            item { FinanceRow("Fecha", sel.displayDate()?.take(10)) }
            item { FinanceRow("Fecha pago", sel.fechaPago?.take(10)) }
            if (!sel.descripcion.isNullOrBlank() && sel.descripcion != sel.razon) {
                item { Text("Descripción", fontWeight = FontWeight.SemiBold) }
                item {
                    Text(
                        sel.descripcion!!,
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }
            }
            if (!sel.notas.isNullOrBlank()) {
                item { Text("Notas", fontWeight = FontWeight.SemiBold) }
                item {
                    Text(
                        sel.notas!!,
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }
            }
            if (sel.referenciaId != null) {
                item { FinanceRow("Referencia", "#${sel.referenciaId}") }
            }
            if (canApprove && pendingApproval) {
                item {
                    OutlinedTextField(
                        value = rejectNote,
                        onValueChange = { rejectNote = it },
                        label = { Text("Motivo rechazo") },
                        modifier = Modifier.fillMaxWidth(),
                    )
                }
                item {
                    Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        Button(
                            onClick = { vm.decide(sel.id, true, null); selected = null },
                            enabled = s.actingId != sel.id,
                            modifier = Modifier.weight(1f),
                        ) { Text("Aprobar") }
                        OutlinedButton(
                            onClick = { vm.decide(sel.id, false, rejectNote); selected = null },
                            enabled = s.actingId != sel.id,
                            modifier = Modifier.weight(1f),
                        ) { Text("Rechazar") }
                    }
                }
            }
            if (!s.actionMessage.isNullOrBlank()) {
                item {
                    Text(
                        s.actionMessage!!,
                        color = if (s.actionMessage!!.startsWith("✅")) Color(0xFF059669) else MaterialTheme.colorScheme.error,
                    )
                }
            }
        }
        return
    }

    FinanceScaffold(
        kpis = listOf(
            NxKpi("Multas", "${s.items.size}", tone = NxTone.Brand),
            NxKpi("Total", fmtMoney(vm.totalAmount()), tone = NxTone.Danger),
            NxKpi("Pendiente", fmtMoney(vm.pendingTotal()), tone = NxTone.Warning),
        ),
        query = s.query,
        onQuery = vm::setQuery,
        placeholder = "Buscar multa…",
        loading = s.loading,
        isRefreshing = s.isRefreshing,
        onRefresh = vm::refresh,
        isEmpty = vm.filtered().isEmpty(),
        emptyTitle = "Sin multas",
        emptySubtitle = "No hay multas registradas con los filtros actuales.",
    ) {
        items(vm.filtered().take(80), key = { it.id }) { f ->
            NxPanelShell(onClick = { selected = f }) {
                Text(f.displayMotivo(), fontWeight = FontWeight.Bold)
                Text(f.displayUserName() ?: "", style = MaterialTheme.typography.bodySmall)
                Row(
                    Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Text(fmtMoney(f.displayAmount()), fontWeight = FontWeight.SemiBold, color = NxTone.Danger.fg())
                    NxStatusChip(f.displayStatus(), financeStatusTone(f.displayStatus()))
                }
                if (!f.displayDate().isNullOrBlank()) {
                    Text(f.displayDate()!!.take(10), style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                }
            }
        }
    }
}

// ── Employee payments ──────────────────────────────────────────────────────

data class EmployeePaymentsRichUiState(
    val loading: Boolean = true,
    val isRefreshing: Boolean = false,
    val query: String = "",
    val items: List<EmployeePaymentDto> = emptyList(),
    val acting: Boolean = false,
    val message: String? = null,
)

class EmployeePaymentsRichViewModel(app: Application) : AndroidViewModel(app) {
    private val repo = ExtraRepository(app.applicationContext)
    private val _state = MutableStateFlow(EmployeePaymentsRichUiState())
    val state: StateFlow<EmployeePaymentsRichUiState> = _state

    init { refresh() }
    fun setQuery(v: String) = _state.update { it.copy(query = v) }
    fun clearMessage() = _state.update { it.copy(message = null) }

    fun refresh() {
        val hasData = _state.value.items.isNotEmpty()
        _state.update { it.copy(loading = !hasData, isRefreshing = hasData) }
        viewModelScope.launch {
            try {
                val list = withContext(Dispatchers.IO) { repo.employeePayments() }
                _state.update { it.copy(loading = false, isRefreshing = false, items = list) }
            } catch (e: Exception) {
                _state.update {
                    it.copy(loading = false, isRefreshing = false, message = "❌ ${e.message ?: "Error al cargar"}")
                }
            }
        }
    }

    fun create(
        userId: Long,
        periodFrom: String,
        periodTo: String,
        amount: Double,
        concepto: String?,
        note: String?,
        onDone: () -> Unit,
    ) {
        if (userId <= 0L || amount <= 0 || periodFrom.isBlank() || periodTo.isBlank()) {
            _state.update { it.copy(message = "❌ Completa empleado, periodo y monto") }
            return
        }
        _state.update { it.copy(acting = true, message = null) }
        viewModelScope.launch {
            try {
                withContext(Dispatchers.IO) {
                    repo.createEmployeePayment(userId, periodFrom, periodTo, amount, concepto, note)
                }
                _state.update { it.copy(acting = false, message = "✅ Pago registrado") }
                refresh()
                onDone()
            } catch (e: Exception) {
                _state.update { it.copy(acting = false, message = "❌ ${e.message ?: "Error"}") }
            }
        }
    }

    fun update(id: Long, amount: Double?, concepto: String?, note: String?, onDone: () -> Unit) {
        _state.update { it.copy(acting = true, message = null) }
        viewModelScope.launch {
            try {
                withContext(Dispatchers.IO) { repo.updateEmployeePayment(id, amount, concepto, note) }
                _state.update { it.copy(acting = false, message = "✅ Pago actualizado") }
                refresh()
                onDone()
            } catch (e: Exception) {
                _state.update { it.copy(acting = false, message = "❌ ${e.message ?: "Error"}") }
            }
        }
    }

    fun markPagado(id: Long) {
        _state.update { it.copy(acting = true, message = null) }
        viewModelScope.launch {
            try {
                withContext(Dispatchers.IO) { repo.markEmployeePaymentPagado(id) }
                _state.update { it.copy(acting = false, message = "✅ Marcado como pagado") }
                refresh()
            } catch (e: Exception) {
                _state.update { it.copy(acting = false, message = "❌ ${e.message ?: "Error"}") }
            }
        }
    }

    fun delete(id: Long, onDone: () -> Unit) {
        _state.update { it.copy(acting = true, message = null) }
        viewModelScope.launch {
            try {
                withContext(Dispatchers.IO) { repo.deleteEmployeePayment(id) }
                _state.update { it.copy(acting = false, message = "✅ Pago eliminado") }
                refresh()
                onDone()
            } catch (e: Exception) {
                _state.update { it.copy(acting = false, message = "❌ ${e.message ?: "Error"}") }
            }
        }
    }

    fun filtered(): List<EmployeePaymentDto> {
        val q = _state.value.query.trim().lowercase()
        if (q.isBlank()) return _state.value.items
        return _state.value.items.filter {
            it.displayConcepto().lowercase().contains(q) ||
                (it.displayUserName() ?: "").lowercase().contains(q)
        }
    }

    fun totalAmount() = _state.value.items.sumOf { it.displayAmount() }
    fun paidTotal() = _state.value.items
        .filter { it.displayStatus().equals("pagado", true) }
        .sumOf { it.displayAmount() }
}

@Composable
fun EmployeePaymentsRichScreen(vm: EmployeePaymentsRichViewModel = viewModel()) {
    val s by vm.state.collectAsState()
    val context = LocalContext.current
    val user = remember { AuthRepository(context).loadSession() }
    val canManage = user?.isSuperAdmin == true ||
        (user?.permissions ?: emptyList()).any {
            it.contains("contabilidad.manage") || it.contains("console.admin")
        }
    val consoleRepo = remember(context) { mx.nexara.mobile.nativeapp.data.console.ConsoleRepository(context) }

    var selected by remember { mutableStateOf<EmployeePaymentDto?>(null) }
    var showCreate by remember { mutableStateOf(false) }
    var showEdit by remember { mutableStateOf(false) }
    var users by remember { mutableStateOf<List<mx.nexara.mobile.nativeapp.data.api.VisibleUserDto>>(emptyList()) }
    var userId by remember { mutableStateOf<Long?>(null) }
    var periodFrom by remember { mutableStateOf(LocalDate.now().withDayOfMonth(1).toString()) }
    var periodTo by remember { mutableStateOf(LocalDate.now().toString()) }
    var amountText by remember { mutableStateOf("") }
    var concepto by remember { mutableStateOf("") }
    var note by remember { mutableStateOf("") }

    LaunchedEffect(canManage, showCreate) {
        if (canManage && showCreate && users.isEmpty()) {
            users = runCatching {
                withContext(Dispatchers.IO) { consoleRepo.usersFetch() }
            }.getOrDefault(emptyList())
        }
    }

    if (showCreate && canManage) {
        FinanceDetailScaffold(onBack = { showCreate = false }) {
            item { Text("Nuevo pago a empleado", fontWeight = FontWeight.Bold, style = MaterialTheme.typography.titleMedium) }
            item {
                OutlinedTextField(
                    value = userId?.toString() ?: "",
                    onValueChange = { userId = it.filter { c -> c.isDigit() }.toLongOrNull() },
                    label = { Text("ID empleado") },
                    modifier = Modifier.fillMaxWidth(),
                    singleLine = true,
                    supportingText = {
                        val name = users.firstOrNull { it.id == userId }?.nombre
                        if (!name.isNullOrBlank()) Text(name)
                    },
                )
            }
            if (users.isNotEmpty()) {
                item {
                    Row(
                        Modifier.fillMaxWidth().horizontalScroll(rememberScrollState()),
                        horizontalArrangement = Arrangement.spacedBy(6.dp),
                    ) {
                        users.take(12).forEach { u ->
                            FilterChip(
                                selected = userId == u.id,
                                onClick = { userId = u.id },
                                label = { Text(u.nombre ?: "#${u.id}") },
                            )
                        }
                    }
                }
            }
            item {
                OutlinedTextField(
                    value = periodFrom,
                    onValueChange = { periodFrom = it },
                    label = { Text("Periodo desde (YYYY-MM-DD)") },
                    modifier = Modifier.fillMaxWidth(),
                    singleLine = true,
                )
            }
            item {
                OutlinedTextField(
                    value = periodTo,
                    onValueChange = { periodTo = it },
                    label = { Text("Periodo hasta (YYYY-MM-DD)") },
                    modifier = Modifier.fillMaxWidth(),
                    singleLine = true,
                )
            }
            item {
                OutlinedTextField(
                    value = amountText,
                    onValueChange = { amountText = it.filter { c -> c.isDigit() || c == '.' } },
                    label = { Text("Monto") },
                    modifier = Modifier.fillMaxWidth(),
                    singleLine = true,
                )
            }
            item {
                OutlinedTextField(
                    value = concepto,
                    onValueChange = { concepto = it },
                    label = { Text("Concepto") },
                    modifier = Modifier.fillMaxWidth(),
                )
            }
            item {
                OutlinedTextField(
                    value = note,
                    onValueChange = { note = it },
                    label = { Text("Nota") },
                    modifier = Modifier.fillMaxWidth(),
                )
            }
            if (!s.message.isNullOrBlank()) {
                item {
                    Text(s.message!!, color = if (s.message!!.startsWith("✅")) Color(0xFF2E7D32) else Color(0xFFC62828))
                }
            }
            item {
                Button(
                    onClick = {
                        val amt = amountText.toDoubleOrNull() ?: return@Button
                        vm.create(
                            userId = userId ?: return@Button,
                            periodFrom = periodFrom.trim(),
                            periodTo = periodTo.trim(),
                            amount = amt,
                            concepto = concepto.ifBlank { null },
                            note = note.ifBlank { null },
                        ) {
                            showCreate = false
                            amountText = ""
                            concepto = ""
                            note = ""
                        }
                    },
                    enabled = !s.acting,
                    modifier = Modifier.fillMaxWidth(),
                ) { Text(if (s.acting) "Guardando…" else "Registrar pago") }
            }
        }
        return
    }

    val sel = selected
    if (sel != null) {
        val periodStart = sel.displayPeriodStart()?.take(10)
        val periodEnd = sel.displayPeriodEnd()?.take(10)
        val periodLabel = when {
            !periodStart.isNullOrBlank() && !periodEnd.isNullOrBlank() -> "$periodStart → $periodEnd"
            !periodStart.isNullOrBlank() -> periodStart
            !periodEnd.isNullOrBlank() -> periodEnd
            else -> null
        }
        val status = sel.displayStatus()
        val isPaid = status.equals("pagado", true)
        val canMarkPaid = canManage && !isPaid && !status.equals("cancelado", true)

        if (showEdit && canManage) {
            FinanceDetailScaffold(onBack = { showEdit = false }) {
                item { Text("Editar pago #${sel.id}", fontWeight = FontWeight.Bold) }
                item {
                    OutlinedTextField(
                        value = amountText.ifBlank { sel.displayAmount().toString() },
                        onValueChange = { amountText = it.filter { c -> c.isDigit() || c == '.' } },
                        label = { Text("Monto") },
                        modifier = Modifier.fillMaxWidth(),
                        singleLine = true,
                    )
                }
                item {
                    OutlinedTextField(
                        value = concepto.ifBlank { sel.concepto.orEmpty() },
                        onValueChange = { concepto = it },
                        label = { Text("Concepto") },
                        modifier = Modifier.fillMaxWidth(),
                    )
                }
                item {
                    OutlinedTextField(
                        value = note.ifBlank { sel.note.orEmpty() },
                        onValueChange = { note = it },
                        label = { Text("Nota") },
                        modifier = Modifier.fillMaxWidth(),
                    )
                }
                item {
                    Button(
                        onClick = {
                            vm.update(
                                id = sel.id,
                                amount = amountText.toDoubleOrNull() ?: sel.displayAmount(),
                                concepto = concepto.ifBlank { sel.concepto },
                                note = note.ifBlank { sel.note },
                            ) {
                                showEdit = false
                                selected = null
                            }
                        },
                        enabled = !s.acting,
                        modifier = Modifier.fillMaxWidth(),
                    ) { Text(if (s.acting) "Guardando…" else "Guardar") }
                }
            }
            return
        }

        FinanceDetailScaffold(onBack = { selected = null; showEdit = false }) {
            item {
                NxPanelShell(contentPadding = PaddingValues(16.dp)) {
                    Column(
                        verticalArrangement = Arrangement.spacedBy(4.dp),
                        horizontalAlignment = Alignment.CenterHorizontally,
                    ) {
                        Text("Monto", style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                        Text(
                            fmtMoney(sel.displayAmount()),
                            fontWeight = FontWeight.Bold,
                            style = MaterialTheme.typography.headlineMedium,
                            color = NxTone.Success.fg(),
                        )
                    }
                }
            }
            item { Spacer(Modifier.height(8.dp)) }
            item { Text(sel.displayConcepto(), fontWeight = FontWeight.Bold, style = MaterialTheme.typography.titleMedium) }
            item { FinanceRow("Empleado", sel.displayUserName()) }
            item { FinanceRow("Estatus", sel.displayStatus(), statusTone = financeStatusTone(sel.displayStatus())) }
            item { FinanceRow("Periodo", periodLabel) }
            item { FinanceRow("Horas", sel.displayHours()) }
            item { FinanceRow("Fecha registro", sel.createdAt?.take(10)) }
            item { FinanceRow("Fecha pago", sel.paidAt?.take(10)) }
            item { FinanceRow("Ref. contabilidad", sel.contabilidadRef) }
            item { FinanceRow("Registrado por", sel.createdBy?.nombre) }
            if (!sel.note.isNullOrBlank() && sel.note != sel.concepto) {
                item { Text("Nota", fontWeight = FontWeight.SemiBold) }
                item {
                    Text(
                        sel.note!!,
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }
            }
            val evidences = sel.evidenceUrls?.filter { it.isNotBlank() }.orEmpty()
            if (evidences.isNotEmpty()) {
                item { Text("Evidencias (${evidences.size})", fontWeight = FontWeight.SemiBold) }
                evidences.take(6).forEachIndexed { idx, url ->
                    item {
                        OutlinedButton(
                            onClick = {
                                runCatching {
                                    val uri = android.net.Uri.parse(url)
                                    context.startActivity(android.content.Intent(android.content.Intent.ACTION_VIEW, uri))
                                }
                            },
                            modifier = Modifier.fillMaxWidth(),
                        ) { Text("Ver evidencia ${idx + 1}") }
                    }
                }
            }
            if (canManage) {
                item {
                    Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        if (!isPaid) {
                            OutlinedButton(
                                onClick = {
                                    amountText = sel.displayAmount().toString()
                                    concepto = sel.concepto.orEmpty()
                                    note = sel.note.orEmpty()
                                    showEdit = true
                                },
                                enabled = !s.acting,
                                modifier = Modifier.weight(1f),
                            ) { Text("Editar") }
                        }
                        if (canMarkPaid) {
                            Button(
                                onClick = {
                                    vm.markPagado(sel.id)
                                    selected = null
                                },
                                enabled = !s.acting,
                                modifier = Modifier.weight(1f),
                                colors = ButtonDefaults.buttonColors(containerColor = Color(0xFF00695C)),
                            ) { Text("Pagado") }
                        }
                    }
                }
                if (!isPaid) {
                    item {
                        OutlinedButton(
                            onClick = {
                                vm.delete(sel.id) { selected = null }
                            },
                            enabled = !s.acting,
                            modifier = Modifier.fillMaxWidth(),
                        ) { Text("Eliminar", color = Color(0xFFC62828)) }
                    }
                }
            }
            if (!s.message.isNullOrBlank()) {
                item {
                    Text(s.message!!, color = if (s.message!!.startsWith("✅")) Color(0xFF2E7D32) else Color(0xFFC62828))
                }
            }
        }
        return
    }

    Column(Modifier.fillMaxSize()) {
        if (canManage) {
            Row(
                Modifier.fillMaxWidth().padding(horizontal = 12.dp, vertical = 4.dp),
                horizontalArrangement = Arrangement.End,
            ) {
                Button(onClick = { showCreate = true; vm.clearMessage() }) { Text("+ Pago") }
            }
        }
        FinanceScaffold(
            kpis = listOf(
                NxKpi("Pagos", "${s.items.size}", tone = NxTone.Brand),
                NxKpi("Total", fmtMoney(vm.totalAmount()), tone = NxTone.Success),
                NxKpi("Pagado", fmtMoney(vm.paidTotal()), tone = NxTone.Info),
            ),
            query = s.query,
            onQuery = vm::setQuery,
            placeholder = "Buscar pago…",
            loading = s.loading,
            isRefreshing = s.isRefreshing,
            onRefresh = vm::refresh,
            isEmpty = vm.filtered().isEmpty(),
            emptyTitle = "Sin pagos a empleados",
            emptySubtitle = if (canManage) "Registra el primero con + Pago." else "No hay pagos con los filtros actuales.",
            emptyActionLabel = if (canManage) "+ Pago" else null,
            onEmptyAction = if (canManage) ({ showCreate = true; vm.clearMessage() }) else null,
        ) {
            items(vm.filtered().take(80), key = { it.id }) { p ->
                NxPanelShell(onClick = { selected = p }) {
                    Text(p.displayConcepto(), fontWeight = FontWeight.Bold)
                    Text(p.displayUserName() ?: "", style = MaterialTheme.typography.bodySmall)
                    Row(
                        Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.SpaceBetween,
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        Text(fmtMoney(p.displayAmount()), fontWeight = FontWeight.SemiBold, color = NxTone.Success.fg())
                        NxStatusChip(p.displayStatus(), financeStatusTone(p.displayStatus()))
                    }
                    val period = listOfNotNull(
                        p.displayPeriodStart()?.take(10),
                        p.displayPeriodEnd()?.take(10),
                    ).joinToString(" → ")
                    if (period.isNotBlank()) {
                        Text(period, style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                    }
                }
            }
        }
    }
}

// ── Accounting ─────────────────────────────────────────────────────────────

data class AccountingRichUiState(
    val loading: Boolean = true,
    val isRefreshing: Boolean = false,
    val query: String = "",
    val items: List<JournalEntryDto> = emptyList(),
    val accounts: List<ChartAccountDto> = emptyList(),
    val showCreate: Boolean = false,
    val saving: Boolean = false,
    val actingId: Long? = null,
    val actionMessage: String? = null,
)

class AccountingRichViewModel(app: Application) : AndroidViewModel(app) {
    private val repo = ExtraRepository(app.applicationContext)
    private val _state = MutableStateFlow(AccountingRichUiState())
    val state: StateFlow<AccountingRichUiState> = _state
    init { refresh() }
    fun setQuery(v: String) = _state.update { it.copy(query = v) }
    fun setShowCreate(show: Boolean) = _state.update { it.copy(showCreate = show, actionMessage = null) }
    fun refresh() {
        val hasData = _state.value.items.isNotEmpty()
        _state.update { it.copy(loading = !hasData, isRefreshing = hasData) }
        viewModelScope.launch {
            try {
                val list = withContext(Dispatchers.IO) { repo.journalEntries() }
                val accounts = withContext(Dispatchers.IO) { runCatching { repo.chartAccounts() }.getOrDefault(emptyList()) }
                _state.update { it.copy(loading = false, isRefreshing = false, items = list, accounts = accounts) }
            } catch (e: Exception) {
                _state.update { it.copy(loading = false, isRefreshing = false, actionMessage = "❌ ${e.toUserMessage("No se pudieron cargar asientos")}") }
            }
        }
    }
    fun createEntry(
        date: String,
        description: String,
        debitAccountId: Long,
        creditAccountId: Long,
        amount: Double,
        reference: String?,
        onDone: () -> Unit,
    ) {
        if (description.isBlank()) {
            _state.update { it.copy(actionMessage = "❌ Descripción obligatoria") }
            return
        }
        if (amount <= 0) {
            _state.update { it.copy(actionMessage = "❌ Importe debe ser mayor a cero") }
            return
        }
        if (debitAccountId <= 0L || creditAccountId <= 0L) {
            _state.update { it.copy(actionMessage = "❌ IDs de cuenta debe/haber obligatorios") }
            return
        }
        _state.update { it.copy(saving = true, actionMessage = null) }
        viewModelScope.launch {
            try {
                withContext(Dispatchers.IO) {
                    repo.createJournalEntry(date, description.trim(), debitAccountId, creditAccountId, amount, reference?.trim()?.ifBlank { null })
                }
                _state.update { it.copy(saving = false, showCreate = false, actionMessage = "✅ Asiento creado") }
                refresh()
                onDone()
            } catch (e: Exception) {
                _state.update { it.copy(saving = false, actionMessage = "❌ ${e.toUserMessage("No se pudo crear asiento")}") }
            }
        }
    }
    fun postEntry(id: Long) {
        _state.update { it.copy(actingId = id, actionMessage = null) }
        viewModelScope.launch {
            try {
                withContext(Dispatchers.IO) { repo.postJournalEntry(id) }
                _state.update { it.copy(actingId = null, actionMessage = "✅ Asiento contabilizado") }
                refresh()
            } catch (e: Exception) {
                _state.update { it.copy(actingId = null, actionMessage = "❌ ${e.toUserMessage("No se pudo contabilizar")}") }
            }
        }
    }
    fun filtered(): List<JournalEntryDto> {
        val q = _state.value.query.trim().lowercase()
        if (q.isBlank()) return _state.value.items
        return _state.value.items.filter { (it.description ?: "").lowercase().contains(q) }
    }
    fun totalDebit() = _state.value.items.sumOf { it.totalDebit ?: 0.0 }
    fun totalCredit() = _state.value.items.sumOf { it.totalCredit ?: 0.0 }
}

@Composable
fun AccountingRichScreen(vm: AccountingRichViewModel = viewModel()) {
    val s by vm.state.collectAsState()
    var selected by remember { mutableStateOf<JournalEntryDto?>(null) }
    var description by remember { mutableStateOf("") }
    var entryDate by remember { mutableStateOf(LocalDate.now().toString()) }
    var debitAccountId by remember { mutableStateOf("") }
    var creditAccountId by remember { mutableStateOf("") }
    var amount by remember { mutableStateOf("") }
    var reference by remember { mutableStateOf("") }

    if (s.showCreate) {
        LazyColumn(
            Modifier.fillMaxSize().padding(16.dp),
            verticalArrangement = Arrangement.spacedBy(10.dp),
        ) {
            item { OutlinedButton(onClick = { vm.setShowCreate(false) }) { Text("← Cancelar") } }
            item { Text("Nuevo asiento", fontWeight = FontWeight.Bold, style = MaterialTheme.typography.titleMedium) }
            item { OutlinedTextField(description, { description = it }, label = { Text("Descripción *") }, modifier = Modifier.fillMaxWidth()) }
            item { OutlinedTextField(entryDate, { entryDate = it }, label = { Text("Fecha (AAAA-MM-DD)") }, modifier = Modifier.fillMaxWidth()) }
            item { OutlinedTextField(debitAccountId, { debitAccountId = it }, label = { Text("Cuenta debe (ID) *") }, modifier = Modifier.fillMaxWidth()) }
            item { OutlinedTextField(creditAccountId, { creditAccountId = it }, label = { Text("Cuenta haber (ID) *") }, modifier = Modifier.fillMaxWidth()) }
            item { OutlinedTextField(amount, { amount = it }, label = { Text("Importe *") }, modifier = Modifier.fillMaxWidth()) }
            item { OutlinedTextField(reference, { reference = it }, label = { Text("Referencia") }, modifier = Modifier.fillMaxWidth()) }
            if (s.accounts.isNotEmpty()) {
                item { Text("Catálogo (referencia)", fontWeight = FontWeight.SemiBold, style = MaterialTheme.typography.labelMedium) }
                items(s.accounts.take(12), key = { it.id }) { acc ->
                    Text(acc.label, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                }
            }
            item {
                Button(
                    onClick = {
                        vm.createEntry(
                            entryDate.trim().ifBlank { LocalDate.now().toString() },
                            description,
                            debitAccountId.trim().toLongOrNull() ?: 0L,
                            creditAccountId.trim().toLongOrNull() ?: 0L,
                            amount.trim().replace(",", ".").toDoubleOrNull() ?: 0.0,
                            reference,
                        ) {
                            description = ""
                            entryDate = LocalDate.now().toString()
                            debitAccountId = ""
                            creditAccountId = ""
                            amount = ""
                            reference = ""
                        }
                    },
                    enabled = !s.saving,
                    modifier = Modifier.fillMaxWidth(),
                ) { Text(if (s.saving) "Creando…" else "Crear asiento") }
            }
            if (!s.actionMessage.isNullOrBlank()) {
                item {
                    Text(
                        s.actionMessage!!,
                        color = if (s.actionMessage!!.startsWith("✅")) Color(0xFF059669) else MaterialTheme.colorScheme.error,
                    )
                }
            }
        }
        return
    }

    val sel = selected
    if (sel != null) {
        FinanceDetailScaffold(onBack = { selected = null }) {
            item {
                NxPanelShell {
                    Text(sel.description ?: "Asiento", fontWeight = FontWeight.Bold, style = MaterialTheme.typography.titleMedium)
                }
            }
            item { FinanceRow("Debe", fmtMoney(sel.totalDebit)) }
            item { FinanceRow("Haber", fmtMoney(sel.totalCredit)) }
            item { FinanceRow("Fecha", sel.entryDate?.take(10)) }
            item { FinanceRow("Referencia", sel.reference) }
            item { FinanceRow("Estatus", sel.status, statusTone = financeStatusTone(sel.status)) }
            if (sel.status.equals("DRAFT", true)) {
                item {
                    Button(
                        onClick = { vm.postEntry(sel.id); selected = null },
                        enabled = s.actingId != sel.id,
                        modifier = Modifier.fillMaxWidth(),
                    ) { Text(if (s.actingId == sel.id) "Contabilizando…" else "Contabilizar asiento") }
                }
            }
            if (!s.actionMessage.isNullOrBlank()) {
                item {
                    Text(
                        s.actionMessage!!,
                        color = if (s.actionMessage!!.startsWith("✅")) Color(0xFF059669) else MaterialTheme.colorScheme.error,
                    )
                }
            }
        }
        return
    }
    FinanceScaffold(
        kpis = listOf(
            NxKpi("Asientos", "${s.items.size}", tone = NxTone.Brand),
            NxKpi("Debe", fmtMoney(vm.totalDebit()), tone = NxTone.Danger),
            NxKpi("Haber", fmtMoney(vm.totalCredit()), tone = NxTone.Success),
        ),
        query = s.query,
        onQuery = vm::setQuery,
        placeholder = "Buscar asiento…",
        loading = s.loading,
        isRefreshing = s.isRefreshing,
        onRefresh = vm::refresh,
        isEmpty = vm.filtered().isEmpty(),
        emptyTitle = "Sin asientos contables",
        emptySubtitle = "No hay asientos registrados con los filtros actuales.",
        emptyActionLabel = "Nuevo asiento",
        onEmptyAction = { vm.setShowCreate(true) },
    ) {
        item {
            Button(onClick = { vm.setShowCreate(true) }, modifier = Modifier.fillMaxWidth().padding(bottom = 8.dp)) {
                Text("+ Nuevo asiento")
            }
        }
        if (!s.actionMessage.isNullOrBlank()) {
            item {
                Text(
                    s.actionMessage!!,
                    color = if (s.actionMessage!!.startsWith("✅")) Color(0xFF059669) else MaterialTheme.colorScheme.error,
                    modifier = Modifier.padding(bottom = 8.dp),
                )
            }
        }
        items(vm.filtered().take(80), key = { it.id }) { e ->
            NxPanelShell(onClick = { selected = e }) {
                Text(e.description ?: "Asiento", fontWeight = FontWeight.Bold)
                Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                    Text("D: ${fmtMoney(e.totalDebit)}", style = MaterialTheme.typography.labelSmall, color = NxTone.Danger.fg())
                    Text("H: ${fmtMoney(e.totalCredit)}", style = MaterialTheme.typography.labelSmall, color = NxTone.Success.fg())
                }
                Row(
                    Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Text(e.entryDate?.take(10) ?: "", style = MaterialTheme.typography.bodySmall)
                    if (!e.status.isNullOrBlank()) {
                        NxStatusChip(e.status, financeStatusTone(e.status))
                    }
                }
            }
        }
    }
}

// ── Shared composables ─────────────────────────────────────────────────────

@Composable
private fun FinanceDetailScaffold(onBack: () -> Unit, content: androidx.compose.foundation.lazy.LazyListScope.() -> Unit) {
    LazyColumn(modifier = Modifier.fillMaxSize(), contentPadding = androidx.compose.foundation.layout.PaddingValues(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
        item { OutlinedButton(onClick = onBack) { Text("← Volver") } }
        item { Spacer(Modifier.height(4.dp)) }
        content()
    }
}

@Composable
private fun FinanceRow(label: String, value: String?, statusTone: NxTone? = null) {
    if (value.isNullOrBlank()) return
    NxPanelShell(contentPadding = PaddingValues(12.dp)) {
        Row(
            Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Text(label, fontWeight = FontWeight.Medium)
            if (statusTone != null) {
                NxStatusChip(value, statusTone)
            } else {
                Text(value, color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
        }
    }
}

@Suppress("UNCHECKED_CAST")
private fun detailMaps(detail: Map<String, Any?>?, vararg keys: String): List<Map<String, Any?>> {
    if (detail == null) return emptyList()
    for (k in keys) {
        val v = detail[k] ?: continue
        if (v is List<*>) return v.mapNotNull { it as? Map<String, Any?> }
    }
    return emptyList()
}

private fun detailStr(map: Map<String, Any?>?, vararg keys: String): String? {
    if (map == null) return null
    for (k in keys) {
        val v = map[k] ?: continue
        val s = v.toString()
        if (s.isNotBlank() && s != "null") return s
    }
    return null
}

private fun detailNum(map: Map<String, Any?>?, vararg keys: String): Double? {
    if (map == null) return null
    for (k in keys) {
        when (val v = map[k]) {
            is Number -> return v.toDouble()
            is String -> v.toDoubleOrNull()?.let { return it }
        }
    }
    return null
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun FinanceScaffold(
    kpis: List<NxKpi>,
    query: String,
    onQuery: (String) -> Unit,
    placeholder: String,
    loading: Boolean,
    isRefreshing: Boolean,
    onRefresh: () -> Unit,
    isEmpty: Boolean,
    emptyTitle: String,
    emptySubtitle: String,
    emptyActionLabel: String? = null,
    onEmptyAction: (() -> Unit)? = null,
    chips: @Composable () -> Unit = {},
    content: androidx.compose.foundation.lazy.LazyListScope.() -> Unit,
) {
    PullToRefreshBox(
        isRefreshing = isRefreshing,
        onRefresh = onRefresh,
        modifier = Modifier.fillMaxSize(),
    ) {
        Column(Modifier.fillMaxSize()) {
            if (kpis.isNotEmpty()) {
                NxKpiGrid(
                    items = kpis,
                    modifier = Modifier.padding(horizontal = 16.dp, vertical = 8.dp),
                )
            }
            chips()
            OutlinedTextField(
                value = query,
                onValueChange = onQuery,
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(horizontal = 16.dp, vertical = 4.dp),
                placeholder = { Text(placeholder) },
                singleLine = true,
            )
            when {
                loading -> NxLoadingBlock("Cargando…")
                isEmpty -> Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                    NxEmptyState(
                        title = emptyTitle,
                        subtitle = emptySubtitle,
                        actionLabel = emptyActionLabel,
                        onAction = onEmptyAction,
                    )
                }
                else -> LazyColumn(
                    modifier = Modifier.padding(horizontal = 16.dp),
                    verticalArrangement = Arrangement.spacedBy(8.dp),
                    content = content,
                )
            }
        }
    }
}

@Composable
private fun <T> SimpleMoneyListScreen(
    title: String,
    load: suspend (ExtraRepository) -> List<T>,
    label: (T) -> String,
    subtitle: (T) -> String,
    amount: (T) -> Double?,
    status: (T) -> String?,
) {
    val app = androidx.compose.ui.platform.LocalContext.current.applicationContext as Application
    val repo = remember { ExtraRepository(app) }
    val scope = rememberCoroutineScope()
    var loading by remember { mutableStateOf(true) }
    var isRefreshing by remember { mutableStateOf(false) }
    var query by remember { mutableStateOf("") }
    var items by remember { mutableStateOf<List<T>>(emptyList()) }

    LaunchedEffect(Unit) {
        loading = true
        items = withContext(Dispatchers.IO) { load(repo) }
        loading = false
    }

    val filtered = if (query.isBlank()) items else {
        val q = query.lowercase()
        items.filter { label(it).lowercase().contains(q) || subtitle(it).lowercase().contains(q) }
    }
    val total = items.sumOf { amount(it) ?: 0.0 }

    FinanceScaffold(
        kpis = listOf(NxKpi(title, "${items.size}", tone = NxTone.Brand), NxKpi("Total", fmtMoney(total), tone = NxTone.Danger)),
        query = query,
        onQuery = { query = it },
        placeholder = "Buscar…",
        loading = loading,
        isRefreshing = isRefreshing,
        onRefresh = {
            val hasData = items.isNotEmpty()
            loading = !hasData
            isRefreshing = hasData
            scope.launch {
                items = withContext(Dispatchers.IO) { load(repo) }
                loading = false
                isRefreshing = false
            }
        },
        isEmpty = filtered.isEmpty(),
        emptyTitle = "Sin registros",
        emptySubtitle = "No hay registros con los filtros actuales.",
    ) {
        items(filtered.take(80)) { row ->
            NxPanelShell {
                Text(label(row), fontWeight = FontWeight.Bold)
                Text(subtitle(row), style = MaterialTheme.typography.bodySmall)
                Row(
                    Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Text(fmtMoney(amount(row)), fontWeight = FontWeight.SemiBold)
                    val st = status(row)
                    if (!st.isNullOrBlank()) {
                        NxStatusChip(st, financeStatusTone(st))
                    }
                }
            }
        }
    }
}
