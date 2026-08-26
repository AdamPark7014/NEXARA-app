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
import mx.nexara.mobile.nativeapp.ui.enterprise.NxLoadingBlock
import mx.nexara.mobile.nativeapp.ui.enterprise.NxSearchField

private fun fmtMoney(v: Double?): String =
    if (v == null) "—" else "$" + String.format("%,.2f", v)

private fun nn(s: String?): String = if (s.isNullOrBlank()) "—" else s

// ── News ──────────────────────────────────────────────────────────────────
@Composable
fun NewsModuleScreen() = TypedModuleListScreen(
    title = "Noticias",
    loadingMessage = "Cargando noticias…",
    searchPlaceholder = "Buscar noticia…",
    statusOptions = listOf("Todos", "Publicadas", "Borradores"),
    statusOf = { it.status.orEmpty() },
    statusMatches = { item, opt ->
        val st = item.status?.lowercase().orEmpty()
        when (opt.lowercase()) {
            "todos" -> true
            "publicadas" -> st.contains("publish") || st.contains("publicad")
            "borradores" -> st.contains("draft") || st.contains("borrador")
            else -> true
        }
    },
    kpisOf = { list ->
        val published = list.count {
            val st = it.status?.lowercase().orEmpty()
            st.contains("publish") || st.contains("publicad")
        }
        listOf(
            "Total" to list.size.toString(),
            "Publicadas" to published.toString(),
            "Borradores" to (list.size - published).toString(),
        )
    },
    load = { it.news() },
    keyOf = { "nw-${it.id}" },
    titleOf = { nn(it.title) },
    subtitleOf = { it.excerpt.orEmpty() },
    metaOf = { it.publishedAt.orEmpty().take(10) },
    trailingOf = {
        val st = it.status?.lowercase().orEmpty()
        if (st.contains("draft") || st.contains("borrador")) "Borrador" else "Publicada"
    },
    matches = { row, q ->
        (row.title ?: "").lowercase().contains(q) || (row.excerpt ?: "").lowercase().contains(q)
    },
    detailPairs = { d ->
        listOf(
            "Título" to nn(d.title),
            "Resumen" to (d.excerpt ?: ""),
            "Estado" to (d.status ?: ""),
            "Publicación" to (d.publishedAt ?: ""),
        )
    },
)

// ── Contact messages ──────────────────────────────────────────────────────
@Composable
fun ContactMessagesModuleScreen() = TypedModuleListScreen(
    title = "Mensajes de contacto",
    loadingMessage = "Cargando mensajes…",
    searchPlaceholder = "Buscar mensaje…",
    kpisOf = { list ->
        listOf(
            "Mensajes" to list.size.toString(),
            "Sin leer" to list.count { it.status?.lowercase() == "unread" || it.status == null }.toString(),
        )
    },
    load = { it.contactMessages() },
    keyOf = { "cm-${it.id}" },
    titleOf = { nn(it.subject ?: it.name) },
    subtitleOf = { it.message.orEmpty().take(80) },
    metaOf = { it.email.orEmpty() },
    trailingOf = { it.createdAt.orEmpty().take(10) },
    matches = { row, q ->
        listOfNotNull(row.name, row.subject, row.email, row.message).any { s -> s.contains(q, true) }
    },
    detailPairs = { d ->
        listOf(
            "Asunto" to nn(d.subject ?: d.name),
            "Nombre" to nn(d.name),
            "Email" to nn(d.email),
            "Teléfono" to nn(d.phone),
            "Mensaje" to (d.message ?: ""),
            "Estado" to (d.status ?: ""),
            "Fecha" to (d.createdAt ?: ""),
        )
    },
)

// ── Newsletter ────────────────────────────────────────────────────────────
@Composable
fun NewsletterModuleScreen() = TypedModuleListScreen(
    title = "Newsletter",
    loadingMessage = "Cargando suscriptores…",
    searchPlaceholder = "Buscar suscriptor…",
    kpisOf = { list ->
        val active = list.count { it.status?.lowercase() != "unsubscribed" }
        listOf(
            "Suscriptores" to list.size.toString(),
            "Activos" to active.toString(),
        )
    },
    load = { it.newsletter() },
    keyOf = { "nl-${it.id}" },
    titleOf = { nn(it.email) },
    subtitleOf = { it.name.orEmpty() },
    trailingOf = {
        if (it.status?.lowercase() == "unsubscribed") "Baja" else "Activo"
    },
    matches = { row, q ->
        listOfNotNull(row.name, row.email).any { s -> s.contains(q, true) }
    },
    detailPairs = { d ->
        listOf(
            "Email" to nn(d.email),
            "Nombre" to nn(d.name),
            "Estado" to (d.status ?: ""),
            "Fecha" to (d.createdAt ?: ""),
        )
    },
)

// ── Audit ─────────────────────────────────────────────────────────────────
@Composable
fun AuditModuleScreen() = TypedModuleListScreen(
    title = "Auditoría",
    loadingMessage = "Cargando auditoría…",
    searchPlaceholder = "Buscar acción…",
    kpisOf = { list -> listOf("Registros" to list.size.toString()) },
    load = { it.audit() },
    keyOf = { "au-${it.id}" },
    titleOf = { listOfNotNull(it.action, it.entityType).joinToString(" · ").ifBlank { "Evento" } },
    subtitleOf = { it.userName.orEmpty() },
    metaOf = { it.description.orEmpty().take(80) },
    trailingOf = { it.createdAt.orEmpty().take(10) },
    matches = { row, q ->
        listOfNotNull(row.action, row.description, row.userName, row.entityType).any { s -> s.contains(q, true) }
    },
    detailPairs = { d ->
        listOf(
            "Acción" to (d.action ?: ""),
            "Usuario" to (d.userName ?: ""),
            "Entidad" to (d.entityType ?: ""),
            "Descripción" to (d.description ?: ""),
            "Fecha" to (d.createdAt ?: ""),
        )
    },
)

// ── Expenses ──────────────────────────────────────────────────────────────
@Composable
fun ExpensesModuleScreen() = TypedModuleListScreen(
    title = "Gastos",
    loadingMessage = "Cargando gastos…",
    searchPlaceholder = "Buscar gasto…",
    kpisOf = { list ->
        listOf(
            "Gastos" to list.size.toString(),
            "Total" to fmtMoney(list.sumOf { it.monto ?: 0.0 }),
        )
    },
    load = { it.expenses() },
    keyOf = { "ex-${it.id}" },
    titleOf = { nn(it.concepto) },
    subtitleOf = { it.usuario?.nombre.orEmpty() },
    metaOf = { it.createdAt.orEmpty().take(10) },
    trailingOf = { fmtMoney(it.monto) },
    matches = { row, q ->
        listOfNotNull(row.concepto, row.usuario?.nombre).any { s -> s.contains(q, true) }
    },
    detailPairs = { d ->
        listOf(
            "Concepto" to nn(d.concepto),
            "Monto" to fmtMoney(d.monto),
            "Categoría" to nn(d.categoria),
            "Estado" to d.displayStatus(),
            "Empleado" to nn(d.usuario?.nombre),
            "Fecha" to (d.createdAt ?: ""),
        )
    },
)

// ── Fines ─────────────────────────────────────────────────────────────────
@Composable
fun FinesModuleScreen() = TypedModuleListScreen(
    title = "Multas",
    loadingMessage = "Cargando multas…",
    searchPlaceholder = "Buscar multa…",
    kpisOf = { list ->
        listOf(
            "Multas" to list.size.toString(),
            "Total" to fmtMoney(list.sumOf { it.displayAmount() }),
        )
    },
    load = { it.fines() },
    keyOf = { "fn-${it.id}" },
    titleOf = { nn(it.displayMotivo()) },
    subtitleOf = { it.displayUserName().orEmpty() },
    metaOf = { it.displayDate().orEmpty().take(10) },
    trailingOf = { fmtMoney(it.displayAmount()) },
    matches = { row, q ->
        listOfNotNull(row.displayMotivo(), row.displayUserName()).any { s -> s.contains(q, true) }
    },
    detailPairs = { d ->
        listOf(
            "Motivo" to nn(d.displayMotivo()),
            "Tipo" to d.displayTipo(),
            "Monto" to fmtMoney(d.displayAmount()),
            "Estado" to d.displayStatus(),
            "Aprobación" to d.displayApproval(),
            "Empleado" to nn(d.displayUserName()),
            "Fecha" to (d.displayDate() ?: ""),
        )
    },
)

// ── Employee payments ─────────────────────────────────────────────────────
@Composable
fun EmployeePaymentsModuleScreen() = TypedModuleListScreen(
    title = "Pagos a empleados",
    loadingMessage = "Cargando pagos…",
    searchPlaceholder = "Buscar pago…",
    kpisOf = { list ->
        listOf(
            "Pagos" to list.size.toString(),
            "Total" to fmtMoney(list.sumOf { it.displayAmount() }),
        )
    },
    load = { it.employeePayments() },
    keyOf = { "ep-${it.id}" },
    titleOf = { nn(it.displayConcepto()) },
    subtitleOf = { it.displayUserName().orEmpty() },
    metaOf = { it.createdAt.orEmpty().take(10) },
    trailingOf = { fmtMoney(it.displayAmount()) },
    matches = { row, q ->
        listOfNotNull(row.displayConcepto(), row.displayUserName()).any { s -> s.contains(q, true) }
    },
    detailPairs = { d ->
        listOf(
            "Concepto" to nn(d.displayConcepto()),
            "Monto" to fmtMoney(d.displayAmount()),
            "Estado" to d.displayStatus(),
            "Empleado" to nn(d.displayUserName()),
            "Periodo" to listOfNotNull(d.displayPeriodStart(), d.displayPeriodEnd()).joinToString(" → "),
            "Horas" to (d.displayHours() ?: ""),
            "Fecha" to (d.createdAt ?: ""),
        )
    },
)

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
            item { NxLoadingBlock("Cargando cotizaciones…") }
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
            NxSearchField(
                value = query,
                onValueChange = { query = it },
                placeholder = "Buscar folio, cliente",
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

// ── Lunch breaks (admin equipo) ───────────────────────────────────────────

data class LunchBreaksAdminState(
    val loading: Boolean = true,
    val error: String? = null,
    val items: List<LunchBreakDto> = emptyList(),
    val query: String = "",
)

class LunchBreaksAdminViewModel(app: Application) : AndroidViewModel(app) {
    private val repo = ExtraRepository(app.applicationContext)
    private val _state = MutableStateFlow(LunchBreaksAdminState())
    val state: StateFlow<LunchBreaksAdminState> = _state

    fun setQuery(q: String) = _state.update { it.copy(query = q) }

    fun load() {
        _state.update { it.copy(loading = true, error = null) }
        viewModelScope.launch {
            try {
                val items = withContext(Dispatchers.IO) { repo.usersLunchBreaks() }
                _state.update { it.copy(loading = false, items = items) }
            } catch (e: Exception) {
                _state.update { it.copy(loading = false, error = e.message ?: "Error al cargar") }
            }
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun LunchBreaksModuleScreen() {
    val vm: LunchBreaksAdminViewModel = viewModel()
    val state by vm.state.collectAsState()

    LaunchedEffect(Unit) { vm.load() }

    val filtered = remember(state.items, state.query) {
        val q = state.query.trim().lowercase()
        if (q.isEmpty()) state.items
        else state.items.filter {
            nn(it.user?.nombre ?: "").lowercase().contains(q) ||
                (it.status ?: "").lowercase().contains(q) ||
                (it.date ?: "").contains(q)
        }
    }

    val lateCount = state.items.count { it.isCheckinLate == true || it.isCheckoutLate == true }
    val activeCount = state.items.count { (it.status ?: "").lowercase().let { s -> s.contains("active") || s.contains("open") || s.contains("abiert") } }

    Column(Modifier.fillMaxSize()) {
        if (state.loading && state.items.isEmpty()) {
            NxLoadingBlock("Cargando comidas del equipo…")
            return
        }

        LazyColumn(
            modifier = Modifier.fillMaxSize().padding(horizontal = 16.dp),
            verticalArrangement = Arrangement.spacedBy(10.dp),
            contentPadding = PaddingValues(vertical = 16.dp),
        ) {
            item {
                Text("Comidas del equipo", style = MaterialTheme.typography.headlineSmall.copy(fontWeight = FontWeight.Bold))
                Text("Registro de entradas y salidas", style = MaterialTheme.typography.bodySmall, color = Color(0xFF64748B))
            }

            item {
                NxSearchField(
                    value = state.query,
                    onValueChange = { vm.setQuery(it) },
                    placeholder = "Buscar empleado…",
                )
            }

            item {
                Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                    LunchKpiChip(Modifier.weight(1f), "Hoy", "${state.items.size}", Color(0xFF0D9488))
                    LunchKpiChip(Modifier.weight(1f), "Activas", "$activeCount", Color(0xFF3B82F6))
                    LunchKpiChip(Modifier.weight(1f), "Tarde", "$lateCount", Color(0xFFEF4444))
                }
            }

            if (state.error != null) {
                item {
                    Text(state.error!!, color = MaterialTheme.colorScheme.error)
                    Button(onClick = { vm.load() }) { Text("Reintentar") }
                }
            }

            if (filtered.isEmpty() && !state.loading) {
                item { Text("Sin registros para mostrar.", color = Color(0xFF64748B)) }
            }

            items(filtered, key = { it.id }) { row ->
                LunchBreakAdminCard(row)
            }
        }
    }
}

@Composable
private fun LunchKpiChip(modifier: Modifier, label: String, value: String, accent: Color) {
    Card(
        modifier = modifier,
        colors = CardDefaults.cardColors(containerColor = accent.copy(alpha = 0.1f)),
        shape = RoundedCornerShape(12.dp),
    ) {
        Column(Modifier.padding(12.dp)) {
            Text(label, style = MaterialTheme.typography.labelSmall, color = accent)
            Text(value, style = MaterialTheme.typography.titleMedium.copy(fontWeight = FontWeight.Bold))
        }
    }
}

@Composable
private fun LunchBreakAdminCard(row: LunchBreakDto) {
    val name = nn(row.user?.nombre ?: "Usuario ${row.userId}")
    val times = listOfNotNull(row.checkinTime?.take(5), row.checkoutTime?.take(5)).joinToString(" → ")
    val late = listOfNotNull(
        if (row.isCheckinLate == true) "Entrada tarde" else null,
        if (row.isCheckoutLate == true) "Salida tarde" else null,
    )

    Card(
        modifier = Modifier.fillMaxWidth(),
        shape = RoundedCornerShape(14.dp),
        colors = CardDefaults.cardColors(containerColor = Color.White),
        elevation = CardDefaults.cardElevation(1.dp),
    ) {
        Column(Modifier.padding(14.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                Text(name, fontWeight = FontWeight.SemiBold, color = Color(0xFF0F172A))
                Text(row.date ?: "", style = MaterialTheme.typography.labelSmall, color = Color(0xFF94A3B8))
            }
            if (times.isNotBlank()) {
                Text(times, style = MaterialTheme.typography.bodySmall, color = Color(0xFF64748B))
            }
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalAlignment = Alignment.CenterVertically) {
                row.status?.let { status ->
                    Text(
                        status,
                        style = MaterialTheme.typography.labelSmall,
                        color = Color(0xFF0D9488),
                        modifier = Modifier
                            .background(Color(0xFFCCFBF1), RoundedCornerShape(8.dp))
                            .padding(horizontal = 8.dp, vertical = 2.dp),
                    )
                }
                late.forEach { tag ->
                    Text(
                        tag,
                        style = MaterialTheme.typography.labelSmall,
                        color = Color(0xFFEF4444),
                        modifier = Modifier
                            .background(Color(0xFFFEE2E2), RoundedCornerShape(8.dp))
                            .padding(horizontal = 8.dp, vertical = 2.dp),
                    )
                }
            }
        }
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
                val coords = mx.nexara.mobile.nativeapp.util.DeviceLocation.current(getApplication())
                withContext(Dispatchers.IO) { repo.lunchCheckin(now, photoDataUrl) }
                val geo = when {
                    coords == null -> " (sin GPS)"
                    coords.accuracyM != null -> " · GPS ±${coords.accuracyM.toInt()}m"
                    else -> " · GPS ok"
                }
                _state.update { it.copy(actionLoading = false, actionMessage = "✅ Entrada a comida registrada$geo") }
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
                val coords = mx.nexara.mobile.nativeapp.util.DeviceLocation.current(getApplication())
                withContext(Dispatchers.IO) { repo.lunchCheckout(now, photoDataUrl) }
                val geo = when {
                    coords == null -> " (sin GPS)"
                    coords.accuracyM != null -> " · GPS ±${coords.accuracyM.toInt()}m"
                    else -> " · GPS ok"
                }
                _state.update { it.copy(actionLoading = false, actionMessage = "✅ Salida de comida registrada$geo") }
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
            item { NxLoadingBlock("Cargando historial de comidas…") }
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

