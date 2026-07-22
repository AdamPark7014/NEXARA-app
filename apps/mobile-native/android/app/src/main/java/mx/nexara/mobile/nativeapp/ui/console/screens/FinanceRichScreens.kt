package mx.nexara.mobile.nativeapp.ui.console.screens

import android.app.Application
import androidx.compose.foundation.clickable
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Card
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Divider
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
import mx.nexara.mobile.nativeapp.data.api.EmployeePaymentDto
import mx.nexara.mobile.nativeapp.data.api.ExpenseDto
import mx.nexara.mobile.nativeapp.data.api.FineDto
import mx.nexara.mobile.nativeapp.data.api.InvoiceDto
import mx.nexara.mobile.nativeapp.data.api.JournalEntryDto
import mx.nexara.mobile.nativeapp.data.extra.ExtraRepository
import java.util.Locale

private fun fmtMoney(v: Double?): String {
    if (v == null) return "—"
    return String.format(Locale("es", "MX"), "$%,.0f", v)
}

// ── Expenses ───────────────────────────────────────────────────────────────

data class ExpensesRichUiState(
    val loading: Boolean = true,
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
        _state.update { it.copy(loading = true) }
        viewModelScope.launch {
            val list = withContext(Dispatchers.IO) { repo.expenses() }
            _state.update { it.copy(loading = false, items = list) }
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
            item { Text(sel.concepto ?: "Gasto", fontWeight = FontWeight.Bold, style = MaterialTheme.typography.titleMedium) }
            item { FinanceRow("Monto", fmtMoney(sel.displayAmount())) }
            item { FinanceRow("Estatus", sel.displayStatus()) }
            item { FinanceRow("Categoría", sel.categoria) }
            item { FinanceRow("Responsable", sel.usuario?.nombre) }
            item { FinanceRow("Fecha", sel.createdAt?.take(10)) }
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
                Triple("Gastos", "${s.items.size}", null),
                Triple("Total", fmtMoney(vm.total()), Color(0xFFC62828)),
                Triple("Pendiente", fmtMoney(vm.pendingTotal()), Color(0xFFE65100)),
            ),
            query = s.query,
            onQuery = vm::setQuery,
            placeholder = "Buscar gasto…",
            loading = s.loading,
            isEmpty = vm.filtered().isEmpty(),
            empty = "Sin gastos — registra el primero",
        ) {
            items(vm.filtered().take(80), key = { it.id }) { e ->
                Card(Modifier.fillMaxWidth().padding(vertical = 4.dp).clickable { selected = e }) {
                    Column(Modifier.padding(12.dp)) {
                        Text(e.concepto ?: "Gasto", fontWeight = FontWeight.Bold)
                        Text(e.usuario?.nombre ?: "", style = MaterialTheme.typography.bodySmall)
                        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                            Text(fmtMoney(e.displayAmount()), fontWeight = FontWeight.SemiBold, color = Color(0xFFC62828))
                            Text(e.displayStatus(), style = MaterialTheme.typography.labelSmall)
                        }
                    }
                }
            }
        }
    }
}

// ── Invoices ───────────────────────────────────────────────────────────────

data class InvoicesRichUiState(
    val loading: Boolean = true,
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
        _state.update { it.copy(loading = true) }
        viewModelScope.launch {
            val list = withContext(Dispatchers.IO) { repo.invoices() }
            _state.update { it.copy(loading = false, items = list) }
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
        val pending = (sel.status ?: "").lowercase().let {
            it.contains("pendiente") || it.contains("parcial") || it.contains("open") || it.contains("posted")
        }
        FinanceDetailScaffold(onBack = { selected = null; vm.clearMessage(); payAmount = ""; payRef = "" }) {
            item { Text(sel.folio ?: "Factura #${sel.id}", fontWeight = FontWeight.Bold, style = MaterialTheme.typography.titleMedium) }
            item { FinanceRow("Cliente", sel.clientName) }
            item { FinanceRow("Total", fmtMoney(sel.total)) }
            if (balance != null) item { FinanceRow("Saldo", fmtMoney(balance)) }
            item { FinanceRow("Estatus", sel.status) }
            item { FinanceRow("Fecha", sel.issueDate?.take(10)) }
            if (!matchStatus.isNullOrBlank()) item { FinanceRow("3-way match", matchStatus) }
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
                Triple("Facturas", "${s.items.size}", null),
                Triple("Pagadas", fmtMoney(vm.totalPaid()), Color(0xFF2E7D32)),
                Triple("Pendiente", fmtMoney(vm.totalPending()), Color(0xFFE65100)),
            ),
            query = s.query,
            onQuery = vm::setQuery,
            placeholder = "Buscar factura…",
            loading = s.loading,
            isEmpty = vm.filtered().isEmpty(),
            empty = "Sin facturas",
            chips = {
                Row(Modifier.horizontalScroll(rememberScrollState()), horizontalArrangement = Arrangement.spacedBy(6.dp)) {
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
                Card(Modifier.fillMaxWidth().padding(vertical = 4.dp).clickable { selected = inv }) {
                    Column(Modifier.padding(12.dp)) {
                        Text(inv.folio ?: "Factura #${inv.id}", fontWeight = FontWeight.Bold)
                        Text(inv.clientName ?: "", style = MaterialTheme.typography.bodySmall)
                        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                            Text(fmtMoney(inv.total), fontWeight = FontWeight.SemiBold)
                            Text(inv.status ?: "", style = MaterialTheme.typography.labelSmall)
                        }
                    }
                }
            }
        }
    }
}

// ── Banking ────────────────────────────────────────────────────────────────

data class BankingRichUiState(val loading: Boolean = true, val query: String = "", val items: List<BankAccountDto> = emptyList())

class BankingRichViewModel(app: Application) : AndroidViewModel(app) {
    private val repo = ExtraRepository(app.applicationContext)
    private val _state = MutableStateFlow(BankingRichUiState())
    val state: StateFlow<BankingRichUiState> = _state
    init { refresh() }
    fun setQuery(v: String) = _state.update { it.copy(query = v) }
    fun refresh() {
        _state.update { it.copy(loading = true) }
        viewModelScope.launch {
            val list = withContext(Dispatchers.IO) { repo.bankAccounts() }
            _state.update { it.copy(loading = false, items = list) }
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
    val sel = selected
    if (sel != null) {
        FinanceDetailScaffold(onBack = { selected = null }) {
            item {
                Card(Modifier.fillMaxWidth()) {
                    Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(4.dp), horizontalAlignment = Alignment.CenterHorizontally) {
                        Text("Saldo", style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                        Text(fmtMoney(sel.balance), fontWeight = FontWeight.Bold, style = MaterialTheme.typography.headlineMedium, color = Color(0xFF1565C0))
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
            Triple("Cuentas", "${s.items.size}", null),
            Triple("Saldo total", fmtMoney(vm.totalBalance()), Color(0xFF1565C0)),
        ),
        query = s.query,
        onQuery = vm::setQuery,
        placeholder = "Buscar cuenta…",
        loading = s.loading,
        isEmpty = vm.filtered().isEmpty(),
        empty = "Sin cuentas",
    ) {
        items(vm.filtered().take(40), key = { it.id }) { acc ->
            Card(Modifier.fillMaxWidth().padding(vertical = 4.dp).clickable { selected = acc }) {
                Column(Modifier.padding(12.dp)) {
                    Text(acc.name ?: "Cuenta", fontWeight = FontWeight.Bold)
                    Text(acc.bank ?: "", style = MaterialTheme.typography.bodySmall)
                    Text(fmtMoney(acc.balance), fontWeight = FontWeight.SemiBold, color = Color(0xFF1565C0))
                    Text(acc.accountNumber?.takeLast(4)?.let { "···$it" } ?: "", style = MaterialTheme.typography.labelSmall)
                }
            }
        }
    }
}

// ── Fines ──────────────────────────────────────────────────────────────────

@Composable
fun FinesRichScreen() = SimpleMoneyListScreen(
    title = "Multas",
    load = { repo -> repo.fines() },
    label = { it.motivo ?: "Multa" },
    subtitle = { it.usuario?.nombre ?: "" },
    amount = { it.monto },
    status = { it.estatus },
)

// ── Employee payments ──────────────────────────────────────────────────────

@Composable
fun EmployeePaymentsRichScreen() = SimpleMoneyListScreen(
    title = "Pagos a empleados",
    load = { repo -> repo.employeePayments() },
    label = { it.concepto ?: "Pago" },
    subtitle = { it.usuario?.nombre ?: "" },
    amount = { it.monto },
    status = { it.estatus },
)

// ── Accounting ─────────────────────────────────────────────────────────────

data class AccountingRichUiState(val loading: Boolean = true, val query: String = "", val items: List<JournalEntryDto> = emptyList())

class AccountingRichViewModel(app: Application) : AndroidViewModel(app) {
    private val repo = ExtraRepository(app.applicationContext)
    private val _state = MutableStateFlow(AccountingRichUiState())
    val state: StateFlow<AccountingRichUiState> = _state
    init { refresh() }
    fun setQuery(v: String) = _state.update { it.copy(query = v) }
    fun refresh() {
        _state.update { it.copy(loading = true) }
        viewModelScope.launch {
            val list = withContext(Dispatchers.IO) { repo.journalEntries() }
            _state.update { it.copy(loading = false, items = list) }
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
    val sel = selected
    if (sel != null) {
        FinanceDetailScaffold(onBack = { selected = null }) {
            item { Text(sel.description ?: "Asiento", fontWeight = FontWeight.Bold, style = MaterialTheme.typography.titleMedium) }
            item { FinanceRow("Debe", fmtMoney(sel.totalDebit)) }
            item { FinanceRow("Haber", fmtMoney(sel.totalCredit)) }
            item { FinanceRow("Fecha", sel.entryDate?.take(10)) }
            item { FinanceRow("Referencia", sel.reference) }
            item { FinanceRow("Estatus", sel.status) }
        }
        return
    }
    FinanceScaffold(
        kpis = listOf(
            Triple("Asientos", "${s.items.size}", null),
            Triple("Debe", fmtMoney(vm.totalDebit()), Color(0xFFC62828)),
            Triple("Haber", fmtMoney(vm.totalCredit()), Color(0xFF2E7D32)),
        ),
        query = s.query,
        onQuery = vm::setQuery,
        placeholder = "Buscar asiento…",
        loading = s.loading,
        isEmpty = vm.filtered().isEmpty(),
        empty = "Sin asientos",
    ) {
        items(vm.filtered().take(80), key = { it.id }) { e ->
            Card(Modifier.fillMaxWidth().padding(vertical = 4.dp).clickable { selected = e }) {
                Column(Modifier.padding(12.dp)) {
                    Text(e.description ?: "Asiento", fontWeight = FontWeight.Bold)
                    Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                        Text("D: ${fmtMoney(e.totalDebit)}", style = MaterialTheme.typography.labelSmall, color = Color(0xFFC62828))
                        Text("H: ${fmtMoney(e.totalCredit)}", style = MaterialTheme.typography.labelSmall, color = Color(0xFF2E7D32))
                    }
                    Text(e.entryDate?.take(10) ?: "", style = MaterialTheme.typography.bodySmall)
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
private fun FinanceRow(label: String, value: String?) {
    if (value.isNullOrBlank()) return
    Row(Modifier.fillMaxWidth()) {
        Text(label, fontWeight = FontWeight.Medium, modifier = Modifier.weight(1f))
        Text(value, color = MaterialTheme.colorScheme.onSurfaceVariant)
    }
}

@Composable
private fun FinanceScaffold(
    kpis: List<Triple<String, String, Color?>>,
    query: String,
    onQuery: (String) -> Unit,
    placeholder: String,
    loading: Boolean,
    isEmpty: Boolean,
    empty: String,
    chips: @Composable () -> Unit = {},
    content: androidx.compose.foundation.lazy.LazyListScope.() -> Unit,
) {
    Column(Modifier.fillMaxSize()) {
        if (kpis.isNotEmpty()) {
            Row(Modifier.fillMaxWidth().padding(16.dp), horizontalArrangement = Arrangement.SpaceEvenly) {
                kpis.forEach { (label, value, color) ->
                    Column(horizontalAlignment = Alignment.CenterHorizontally) {
                        Text(value, fontWeight = FontWeight.Bold, color = color ?: MaterialTheme.colorScheme.primary)
                        Text(label, style = MaterialTheme.typography.labelSmall)
                    }
                }
            }
        }
        chips()
        OutlinedTextField(
            value = query,
            onValueChange = onQuery,
            modifier = Modifier.fillMaxWidth().padding(horizontal = 16.dp),
            placeholder = { Text(placeholder) },
            singleLine = true,
        )
        when {
            loading -> Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) { CircularProgressIndicator() }
            isEmpty -> Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                Text(empty, color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
            else -> LazyColumn(Modifier.padding(horizontal = 16.dp), content = content)
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
    var loading by remember { mutableStateOf(true) }
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
        kpis = listOf(Triple(title, "${items.size}", null), Triple("Total", fmtMoney(total), Color(0xFFC62828))),
        query = query,
        onQuery = { query = it },
        placeholder = "Buscar…",
        loading = loading,
        isEmpty = filtered.isEmpty(),
        empty = "Sin registros",
    ) {
        items(filtered.take(80)) { row ->
            Card(Modifier.fillMaxWidth().padding(vertical = 4.dp)) {
                Column(Modifier.padding(12.dp)) {
                    Text(label(row), fontWeight = FontWeight.Bold)
                    Text(subtitle(row), style = MaterialTheme.typography.bodySmall)
                    Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                        Text(fmtMoney(amount(row)), fontWeight = FontWeight.SemiBold)
                        Text(status(row) ?: "", style = MaterialTheme.typography.labelSmall)
                    }
                }
            }
        }
    }
}
