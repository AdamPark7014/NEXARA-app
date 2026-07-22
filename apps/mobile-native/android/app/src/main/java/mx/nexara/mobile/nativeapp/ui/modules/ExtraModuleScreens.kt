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
import mx.nexara.mobile.nativeapp.data.api.NewsPostDto
import mx.nexara.mobile.nativeapp.data.api.ContactMessageDto
import mx.nexara.mobile.nativeapp.data.api.NewsletterSubscriberDto
import mx.nexara.mobile.nativeapp.data.api.AuditEntryDto
import mx.nexara.mobile.nativeapp.data.api.ExpenseDto
import mx.nexara.mobile.nativeapp.data.api.FineDto
import mx.nexara.mobile.nativeapp.data.api.EmployeePaymentDto
import mx.nexara.mobile.nativeapp.data.api.DocumentDto
import mx.nexara.mobile.nativeapp.data.api.JournalEntryDto
import mx.nexara.mobile.nativeapp.ui.common.MediaPickerBar
import mx.nexara.mobile.nativeapp.ui.common.CapturedMedia
import mx.nexara.mobile.nativeapp.ui.common.SimpleRow

private fun fmtMoney(v: Double?): String =
    if (v == null) "—" else "$" + String.format("%,.2f", v)

private fun nn(s: String?): String = if (s.isNullOrBlank()) "—" else s

// ── News ──────────────────────────────────────────────────────────────────
@Composable
fun NewsModuleScreen() {
    var items by remember { mutableStateOf<List<NewsPostDto>>(emptyList()) }
    var query by remember { mutableStateOf("") }
    var loading by remember { mutableStateOf(true) }
    val context = LocalContext.current
    val repo = remember(context) { ExtraRepository(context) }
    LaunchedEffect(Unit) { items = withContext(Dispatchers.IO) { repo.news() }; loading = false }
    val filtered = if (query.isBlank()) items else items.filter {
        (it.title ?: "").contains(query, true) || (it.excerpt ?: "").contains(query, true)
    }
    val published = items.count { it.status?.lowercase() == "published" || it.status?.lowercase() == "publicada" }
    val drafts = items.size - published
    Column(Modifier.fillMaxSize()) {
        if (items.isNotEmpty()) {
            Row(Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 6.dp)) {
                OpsKpiAndroid("Total", items.size.toString(), Modifier.weight(1f))
                OpsKpiAndroid("Publicadas", published.toString(), Modifier.weight(1f))
                OpsKpiAndroid("Borradores", drafts.toString(), Modifier.weight(1f))
            }
        }
        SearchBarAndroid(query, "Buscar noticia…") { query = it }
        if (loading) { Box(Modifier.fillMaxSize(), Alignment.Center) { CircularProgressIndicator() } }
        else LazyColumn(contentPadding = PaddingValues(horizontal = 12.dp, vertical = 4.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
            items(filtered.take(60), key = { it.id }) { n ->
                Card(shape = RoundedCornerShape(12.dp), modifier = Modifier.fillMaxWidth()) {
                    Row(Modifier.padding(12.dp), verticalAlignment = Alignment.CenterVertically) {
                        Column(Modifier.weight(1f)) {
                            Text(nn(n.title), fontWeight = FontWeight.Bold, style = MaterialTheme.typography.bodyMedium, maxLines = 1)
                            if (!n.excerpt.isNullOrBlank()) Text(n.excerpt!!, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant, maxLines = 2)
                        }
                        Column(horizontalAlignment = Alignment.End) {
                            val isDraft = n.status?.lowercase()?.contains("draft") == true || n.status?.lowercase()?.contains("borrador") == true
                            Text(if (isDraft) "Borrador" else "Publicada", fontSize = 10.sp, fontWeight = FontWeight.Bold, color = if (isDraft) MaterialTheme.colorScheme.secondary else MaterialTheme.colorScheme.primary)
                            if (!n.publishedAt.isNullOrBlank()) Text(n.publishedAt!!.take(10), fontSize = 9.sp, color = MaterialTheme.colorScheme.onSurfaceVariant)
                        }
                    }
                }
            }
        }
    }
}

// ── Contact messages ──────────────────────────────────────────────────────
@Composable
fun ContactMessagesModuleScreen() {
    var items by remember { mutableStateOf<List<ContactMessageDto>>(emptyList()) }
    var query by remember { mutableStateOf("") }
    var loading by remember { mutableStateOf(true) }
    val context = LocalContext.current
    val repo = remember(context) { ExtraRepository(context) }
    LaunchedEffect(Unit) { items = withContext(Dispatchers.IO) { repo.contactMessages() }; loading = false }
    val filtered = if (query.isBlank()) items else items.filter {
        listOfNotNull(it.name, it.subject, it.email, it.message).any { s -> s.contains(query, true) }
    }
    Column(Modifier.fillMaxSize()) {
        if (items.isNotEmpty()) {
            Row(Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 6.dp)) {
                OpsKpiAndroid("Mensajes", items.size.toString(), Modifier.weight(1f))
                OpsKpiAndroid("Sin leer", items.count { it.status?.lowercase() == "unread" || it.status == null }.toString(), Modifier.weight(1f))
            }
        }
        SearchBarAndroid(query, "Buscar mensaje…") { query = it }
        if (loading) { Box(Modifier.fillMaxSize(), Alignment.Center) { CircularProgressIndicator() } }
        else LazyColumn(contentPadding = PaddingValues(horizontal = 12.dp, vertical = 4.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
            items(filtered.take(60), key = { it.id }) { m ->
                Card(shape = RoundedCornerShape(12.dp), modifier = Modifier.fillMaxWidth()) {
                    Row(Modifier.padding(12.dp), verticalAlignment = Alignment.CenterVertically) {
                        Column(Modifier.weight(1f)) {
                            Text(nn(m.subject ?: m.name), fontWeight = FontWeight.Bold, style = MaterialTheme.typography.bodyMedium, maxLines = 1)
                            if (!m.message.isNullOrBlank()) Text(m.message!!.take(80), style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant, maxLines = 2)
                            if (!m.email.isNullOrBlank()) Text(m.email!!, fontSize = 10.sp, color = MaterialTheme.colorScheme.onSurfaceVariant)
                        }
                        if (!m.createdAt.isNullOrBlank()) Text(m.createdAt!!.take(10), fontSize = 9.sp, color = MaterialTheme.colorScheme.onSurfaceVariant)
                    }
                }
            }
        }
    }
}

// ── Newsletter ────────────────────────────────────────────────────────────
@Composable
fun NewsletterModuleScreen() {
    var items by remember { mutableStateOf<List<NewsletterSubscriberDto>>(emptyList()) }
    var query by remember { mutableStateOf("") }
    var loading by remember { mutableStateOf(true) }
    val context = LocalContext.current
    val repo = remember(context) { ExtraRepository(context) }
    LaunchedEffect(Unit) { items = withContext(Dispatchers.IO) { repo.newsletter() }; loading = false }
    val filtered = if (query.isBlank()) items else items.filter {
        listOfNotNull(it.name, it.email).any { s -> s.contains(query, true) }
    }
    val active = items.count { it.status?.lowercase() != "unsubscribed" }
    Column(Modifier.fillMaxSize()) {
        if (items.isNotEmpty()) {
            Row(Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 6.dp)) {
                OpsKpiAndroid("Suscriptores", items.size.toString(), Modifier.weight(1f))
                OpsKpiAndroid("Activos", active.toString(), Modifier.weight(1f))
            }
        }
        SearchBarAndroid(query, "Buscar suscriptor…") { query = it }
        if (loading) { Box(Modifier.fillMaxSize(), Alignment.Center) { CircularProgressIndicator() } }
        else LazyColumn(contentPadding = PaddingValues(horizontal = 12.dp, vertical = 4.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
            items(filtered.take(60), key = { it.id }) { s ->
                Card(shape = RoundedCornerShape(12.dp), modifier = Modifier.fillMaxWidth()) {
                    Row(Modifier.padding(12.dp), verticalAlignment = Alignment.CenterVertically) {
                        Column(Modifier.weight(1f)) {
                            Text(nn(s.email), fontWeight = FontWeight.Bold, style = MaterialTheme.typography.bodyMedium)
                            if (!s.name.isNullOrBlank()) Text(s.name!!, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                        }
                        val unsub = s.status?.lowercase() == "unsubscribed"
                        Text(if (unsub) "Baja" else "Activo", fontSize = 10.sp, fontWeight = FontWeight.Bold,
                            color = if (unsub) MaterialTheme.colorScheme.onSurfaceVariant else MaterialTheme.colorScheme.primary)
                    }
                }
            }
        }
    }
}

// ── Audit ─────────────────────────────────────────────────────────────────
@Composable
fun AuditModuleScreen() {
    var items by remember { mutableStateOf<List<AuditEntryDto>>(emptyList()) }
    var query by remember { mutableStateOf("") }
    var loading by remember { mutableStateOf(true) }
    val context = LocalContext.current
    val repo = remember(context) { ExtraRepository(context) }
    LaunchedEffect(Unit) { items = withContext(Dispatchers.IO) { repo.audit() }; loading = false }
    val filtered = if (query.isBlank()) items else items.filter {
        listOfNotNull(it.action, it.description, it.userName, it.entityType).any { s -> s.contains(query, true) }
    }
    Column(Modifier.fillMaxSize()) {
        if (items.isNotEmpty()) {
            Row(Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 6.dp)) {
                OpsKpiAndroid("Registros", items.size.toString(), Modifier.weight(1f))
            }
        }
        SearchBarAndroid(query, "Buscar acción…") { query = it }
        if (loading) { Box(Modifier.fillMaxSize(), Alignment.Center) { CircularProgressIndicator() } }
        else LazyColumn(contentPadding = PaddingValues(horizontal = 12.dp, vertical = 4.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
            items(filtered.take(80), key = { it.id }) { a ->
                Card(shape = RoundedCornerShape(12.dp), modifier = Modifier.fillMaxWidth()) {
                    Row(Modifier.padding(10.dp), verticalAlignment = Alignment.CenterVertically) {
                        Column(Modifier.weight(1f)) {
                            Text(listOfNotNull(a.action, a.entityType).joinToString(" · ").ifBlank { "Evento" }, fontWeight = FontWeight.Bold, style = MaterialTheme.typography.bodySmall, maxLines = 1)
                            if (!a.userName.isNullOrBlank()) Text(a.userName!!, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                        }
                        if (!a.createdAt.isNullOrBlank()) Text(a.createdAt!!.take(10), fontSize = 9.sp, color = MaterialTheme.colorScheme.onSurfaceVariant)
                    }
                }
            }
        }
    }
}

// ── Expenses ──────────────────────────────────────────────────────────────
@Composable
fun ExpensesModuleScreen() {
    var items by remember { mutableStateOf<List<ExpenseDto>>(emptyList()) }
    var query by remember { mutableStateOf("") }
    var loading by remember { mutableStateOf(true) }
    val context = LocalContext.current
    val repo = remember(context) { ExtraRepository(context) }
    LaunchedEffect(Unit) { items = withContext(Dispatchers.IO) { repo.expenses() }; loading = false }
    val filtered = if (query.isBlank()) items else items.filter {
        listOfNotNull(it.concepto, it.usuario?.nombre).any { s -> s.contains(query, true) }
    }
    val total = items.sumOf { it.monto ?: 0.0 }
    Column(Modifier.fillMaxSize()) {
        if (items.isNotEmpty()) {
            Row(Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 6.dp)) {
                OpsKpiAndroid("Gastos", items.size.toString(), Modifier.weight(1f))
                OpsKpiAndroid("Total", fmtMoney(total), Modifier.weight(1f))
            }
        }
        SearchBarAndroid(query, "Buscar gasto…") { query = it }
        if (loading) { Box(Modifier.fillMaxSize(), Alignment.Center) { CircularProgressIndicator() } }
        else LazyColumn(contentPadding = PaddingValues(horizontal = 12.dp, vertical = 4.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
            items(filtered.take(60), key = { it.id }) { e ->
                Card(shape = RoundedCornerShape(12.dp), modifier = Modifier.fillMaxWidth()) {
                    Row(Modifier.padding(12.dp), verticalAlignment = Alignment.CenterVertically) {
                        Column(Modifier.weight(1f)) {
                            Text(nn(e.concepto), fontWeight = FontWeight.Bold, style = MaterialTheme.typography.bodyMedium, maxLines = 1)
                            if (!e.usuario?.nombre.isNullOrBlank()) Text(e.usuario!!.nombre ?: "", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                        }
                        Column(horizontalAlignment = Alignment.End) {
                            Text(fmtMoney(e.monto), fontWeight = FontWeight.Bold, color = MaterialTheme.colorScheme.error)
                            if (!e.createdAt.isNullOrBlank()) Text(e.createdAt!!.take(10), fontSize = 9.sp, color = MaterialTheme.colorScheme.onSurfaceVariant)
                        }
                    }
                }
            }
        }
    }
}

// ── Fines ─────────────────────────────────────────────────────────────────
@Composable
fun FinesModuleScreen() {
    var items by remember { mutableStateOf<List<FineDto>>(emptyList()) }
    var query by remember { mutableStateOf("") }
    var loading by remember { mutableStateOf(true) }
    val context = LocalContext.current
    val repo = remember(context) { ExtraRepository(context) }
    LaunchedEffect(Unit) { items = withContext(Dispatchers.IO) { repo.fines() }; loading = false }
    val filtered = if (query.isBlank()) items else items.filter {
        listOfNotNull(it.motivo, it.usuario?.nombre).any { s -> s.contains(query, true) }
    }
    val total = items.sumOf { it.monto ?: 0.0 }
    Column(Modifier.fillMaxSize()) {
        if (items.isNotEmpty()) {
            Row(Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 6.dp)) {
                OpsKpiAndroid("Multas", items.size.toString(), Modifier.weight(1f))
                OpsKpiAndroid("Total", fmtMoney(total), Modifier.weight(1f))
            }
        }
        SearchBarAndroid(query, "Buscar multa…") { query = it }
        if (loading) { Box(Modifier.fillMaxSize(), Alignment.Center) { CircularProgressIndicator() } }
        else LazyColumn(contentPadding = PaddingValues(horizontal = 12.dp, vertical = 4.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
            items(filtered.take(60), key = { it.id }) { f ->
                Card(shape = RoundedCornerShape(12.dp), modifier = Modifier.fillMaxWidth()) {
                    Row(Modifier.padding(12.dp), verticalAlignment = Alignment.CenterVertically) {
                        Column(Modifier.weight(1f)) {
                            Text(nn(f.motivo), fontWeight = FontWeight.Bold, style = MaterialTheme.typography.bodyMedium, maxLines = 1)
                            if (!f.usuario?.nombre.isNullOrBlank()) Text(f.usuario!!.nombre ?: "", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                        }
                        Column(horizontalAlignment = Alignment.End) {
                            Text(fmtMoney(f.monto), fontWeight = FontWeight.Bold, color = MaterialTheme.colorScheme.error)
                            if (!f.createdAt.isNullOrBlank()) Text(f.createdAt!!.take(10), fontSize = 9.sp, color = MaterialTheme.colorScheme.onSurfaceVariant)
                        }
                    }
                }
            }
        }
    }
}

// ── Employee payments ─────────────────────────────────────────────────────
@Composable
fun EmployeePaymentsModuleScreen() {
    var items by remember { mutableStateOf<List<EmployeePaymentDto>>(emptyList()) }
    var query by remember { mutableStateOf("") }
    var loading by remember { mutableStateOf(true) }
    val context = LocalContext.current
    val repo = remember(context) { ExtraRepository(context) }
    LaunchedEffect(Unit) { items = withContext(Dispatchers.IO) { repo.employeePayments() }; loading = false }
    val filtered = if (query.isBlank()) items else items.filter {
        listOfNotNull(it.concepto, it.usuario?.nombre).any { s -> s.contains(query, true) }
    }
    val total = items.sumOf { it.monto ?: 0.0 }
    Column(Modifier.fillMaxSize()) {
        if (items.isNotEmpty()) {
            Row(Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 6.dp)) {
                OpsKpiAndroid("Pagos", items.size.toString(), Modifier.weight(1f))
                OpsKpiAndroid("Total", fmtMoney(total), Modifier.weight(1f))
            }
        }
        SearchBarAndroid(query, "Buscar pago…") { query = it }
        if (loading) { Box(Modifier.fillMaxSize(), Alignment.Center) { CircularProgressIndicator() } }
        else LazyColumn(contentPadding = PaddingValues(horizontal = 12.dp, vertical = 4.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
            items(filtered.take(60), key = { it.id }) { p ->
                Card(shape = RoundedCornerShape(12.dp), modifier = Modifier.fillMaxWidth()) {
                    Row(Modifier.padding(12.dp), verticalAlignment = Alignment.CenterVertically) {
                        Column(Modifier.weight(1f)) {
                            Text(nn(p.concepto), fontWeight = FontWeight.Bold, style = MaterialTheme.typography.bodyMedium, maxLines = 1)
                            if (!p.usuario?.nombre.isNullOrBlank()) Text(p.usuario!!.nombre ?: "", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                        }
                        Column(horizontalAlignment = Alignment.End) {
                            Text(fmtMoney(p.monto), fontWeight = FontWeight.Bold, color = MaterialTheme.colorScheme.primary)
                            if (!p.createdAt.isNullOrBlank()) Text(p.createdAt!!.take(10), fontSize = 9.sp, color = MaterialTheme.colorScheme.onSurfaceVariant)
                        }
                    }
                }
            }
        }
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
            Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                CircularProgressIndicator()
            }
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
                OutlinedTextField(
                    value = state.query,
                    onValueChange = { vm.setQuery(it) },
                    modifier = Modifier.fillMaxWidth(),
                    placeholder = { Text("Buscar empleado…") },
                    singleLine = true,
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
fun DocumentsModuleScreen() {
    var items by remember { mutableStateOf<List<DocumentDto>>(emptyList()) }
    var query by remember { mutableStateOf("") }
    var loading by remember { mutableStateOf(true) }
    val context = LocalContext.current
    val repo = remember(context) { ExtraRepository(context) }
    LaunchedEffect(Unit) { items = withContext(Dispatchers.IO) { repo.documents() }; loading = false }
    val filtered = if (query.isBlank()) items else items.filter {
        listOfNotNull(it.title, it.type).any { s -> s.contains(query, true) }
    }
    Column(Modifier.fillMaxSize()) {
        if (items.isNotEmpty()) OpsKpiAndroid("Documentos", items.size.toString(), Modifier.fillMaxWidth().padding(16.dp, 6.dp))
        SearchBarAndroid(query, "Buscar documento…") { query = it }
        if (loading) { Box(Modifier.fillMaxSize(), Alignment.Center) { CircularProgressIndicator() } }
        else LazyColumn(contentPadding = PaddingValues(horizontal = 12.dp, vertical = 4.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
            items(filtered.take(60), key = { it.id }) { d ->
                Card(shape = RoundedCornerShape(12.dp), modifier = Modifier.fillMaxWidth()) {
                    Row(Modifier.padding(12.dp), verticalAlignment = Alignment.CenterVertically) {
                        Column(Modifier.weight(1f)) {
                            Text(nn(d.title), fontWeight = FontWeight.Bold, style = MaterialTheme.typography.bodyMedium, maxLines = 1)
                            if (!d.type.isNullOrBlank())
                                Text(d.type!!, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                        }
                        if (!d.createdAt.isNullOrBlank()) Text(d.createdAt!!.take(10), fontSize = 9.sp, color = MaterialTheme.colorScheme.onSurfaceVariant)
                    }
                }
            }
        }
    }
}

// ── Accounting journal entries ────────────────────────────────────────────
@Composable
fun AccountingModuleScreen() {
    var items by remember { mutableStateOf<List<JournalEntryDto>>(emptyList()) }
    var query by remember { mutableStateOf("") }
    var loading by remember { mutableStateOf(true) }
    val context = LocalContext.current
    val repo = remember(context) { ExtraRepository(context) }
    LaunchedEffect(Unit) { items = withContext(Dispatchers.IO) { repo.journalEntries() }; loading = false }
    val filtered = if (query.isBlank()) items else items.filter {
        listOfNotNull(it.description, it.reference).any { s -> s.contains(query, true) }
    }
    val totalDebit  = items.sumOf { it.totalDebit  ?: 0.0 }
    val totalCredit = items.sumOf { it.totalCredit ?: 0.0 }
    Column(Modifier.fillMaxSize()) {
        if (items.isNotEmpty()) {
            Row(Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 6.dp)) {
                OpsKpiAndroid("Asientos", items.size.toString(), Modifier.weight(1f))
                OpsKpiAndroid("Debe",     fmtMoney(totalDebit),  Modifier.weight(1f))
                OpsKpiAndroid("Haber",    fmtMoney(totalCredit), Modifier.weight(1f))
            }
        }
        SearchBarAndroid(query, "Buscar asiento…") { query = it }
        if (loading) { Box(Modifier.fillMaxSize(), Alignment.Center) { CircularProgressIndicator() } }
        else LazyColumn(contentPadding = PaddingValues(horizontal = 12.dp, vertical = 4.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
            items(filtered.take(60), key = { it.id }) { j ->
                Card(shape = RoundedCornerShape(12.dp), modifier = Modifier.fillMaxWidth()) {
                    Row(Modifier.padding(12.dp), verticalAlignment = Alignment.CenterVertically) {
                        Column(Modifier.weight(1f)) {
                            Text(nn(j.description ?: j.reference), fontWeight = FontWeight.Bold, style = MaterialTheme.typography.bodySmall, maxLines = 1)
                            if (!j.reference.isNullOrBlank()) Text(j.reference!!, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                        }
                        Column(horizontalAlignment = Alignment.End) {
                            if ((j.totalDebit ?: 0.0) > 0.0) Text("D: ${fmtMoney(j.totalDebit)}", fontSize = 10.sp, color = MaterialTheme.colorScheme.error)
                            if ((j.totalCredit ?: 0.0) > 0.0) Text("H: ${fmtMoney(j.totalCredit)}", fontSize = 10.sp, color = MaterialTheme.colorScheme.primary)
                            if (!j.entryDate.isNullOrBlank()) Text(j.entryDate!!.take(10), fontSize = 9.sp, color = MaterialTheme.colorScheme.onSurfaceVariant)
                        }
                    }
                }
            }
        }
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

// ── Shared UI helpers ─────────────────────────────────────────────────────
@Composable
fun OpsKpiAndroid(label: String, value: String, modifier: Modifier = Modifier) {
    Column(modifier = modifier, horizontalAlignment = Alignment.CenterHorizontally) {
        Text(value, fontWeight = FontWeight.Bold, style = MaterialTheme.typography.titleSmall)
        Text(label, style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
    }
}

@Composable
fun SearchBarAndroid(query: String, placeholder: String, onQueryChange: (String) -> Unit) {
    OutlinedTextField(
        value = query,
        onValueChange = onQueryChange,
        placeholder = { Text(placeholder, color = MaterialTheme.colorScheme.onSurfaceVariant) },
        singleLine = true,
        modifier = Modifier.fillMaxWidth().padding(horizontal = 12.dp, vertical = 4.dp),
        shape = RoundedCornerShape(12.dp),
        trailingIcon = if (query.isNotBlank()) ({
            TextButton(onClick = { onQueryChange("") }) { Text("✕", fontSize = 12.sp) }
        }) else null,
    )
}

