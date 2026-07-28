package mx.nexara.mobile.nativeapp.ui.console.screens

import android.app.Application
import android.content.Context
import android.content.Intent
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
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.core.content.FileProvider
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import androidx.lifecycle.viewmodel.compose.viewModel
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import mx.nexara.mobile.nativeapp.access.ModulePanelMap
import mx.nexara.mobile.nativeapp.data.extra.ExtraRepository
import mx.nexara.mobile.nativeapp.ui.catalog.ModuleCatalog
import mx.nexara.mobile.nativeapp.ui.catalog.ModuleEntry
import java.io.File
import java.time.LocalDate
import java.time.format.DateTimeFormatter
import java.time.temporal.ChronoUnit

// ── Multi-empresa ───────────────────────────────────────────────────────────

data class CompaniesState(
    val loading: Boolean = true,
    val error: String? = null,
    val items: List<mx.nexara.mobile.nativeapp.data.api.CompanyDto> = emptyList(),
)

class CompaniesViewModel(app: Application) : AndroidViewModel(app) {
    private val repo = ExtraRepository(app.applicationContext)
    private val _state = MutableStateFlow(CompaniesState())
    val state: StateFlow<CompaniesState> = _state

    fun load() {
        _state.update { it.copy(loading = true, error = null) }
        viewModelScope.launch {
            try {
                val items = withContext(Dispatchers.IO) { repo.companyDtos() }
                _state.update { it.copy(loading = false, items = items) }
            } catch (e: Exception) {
                _state.update { it.copy(loading = false, error = e.message) }
            }
        }
    }
}

@Composable
fun CompaniesScreen() {
    val vm: CompaniesViewModel = viewModel()
    val state by vm.state.collectAsState()
    LaunchedEffect(Unit) { vm.load() }

    LazyColumn(Modifier.fillMaxSize().padding(16.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
        item {
            GovHeader("Multi-empresa", "Razones sociales y sucursales")
        }
        if (state.loading) { item { LinearProgressIndicator(Modifier.fillMaxWidth()) }; return@LazyColumn }
        if (state.error != null) { item { Text(state.error!!, color = MaterialTheme.colorScheme.error) }; return@LazyColumn }
        if (state.items.isEmpty()) { item { Text("Sin empresas registradas.", color = Color(0xFF64748B)) }; return@LazyColumn }
        items(state.items, key = { it.rowKey }) { c ->
            GovCard(
                title = c.displayName,
                subtitle = listOfNotNull(c.rfc.takeIf { it.isNotBlank() }, c.fiscalRegime.takeIf { it.isNotBlank() }).joinToString(" · "),
                trailing = c.trailingLabel,
                accent = if (c.isPrimary) Color(0xFF059669) else Color(0xFF64748B),
            )
        }
    }
}

// ── Knowledge Base ──────────────────────────────────────────────────────────

data class KbState(
    val loading: Boolean = true,
    val error: String? = null,
    val query: String = "",
    val articles: List<mx.nexara.mobile.nativeapp.data.api.KbArticleDto> = emptyList(),
    val selected: mx.nexara.mobile.nativeapp.data.api.KbArticleDto? = null,
)

class KbViewModel(app: Application) : AndroidViewModel(app) {
    private val repo = ExtraRepository(app.applicationContext)
    private val _state = MutableStateFlow(KbState())
    val state: StateFlow<KbState> = _state

    fun setQuery(q: String) = _state.update { it.copy(query = q) }

    fun load() {
        _state.update { it.copy(loading = true, error = null) }
        viewModelScope.launch {
            try {
                val q = _state.value.query.trim().ifBlank { null }
                val articles = withContext(Dispatchers.IO) { repo.kbArticleDtos(q) }
                _state.update { it.copy(loading = false, articles = articles) }
            } catch (e: Exception) {
                _state.update { it.copy(loading = false, error = e.message) }
            }
        }
    }

    fun openArticle(slugOrId: String) {
        viewModelScope.launch {
            try {
                val article = withContext(Dispatchers.IO) { repo.kbArticleDto(slugOrId) }
                _state.update { it.copy(selected = article) }
            } catch (_: Exception) { }
        }
    }

    fun closeArticle() = _state.update { it.copy(selected = null) }
}

@Composable
fun KbScreen() {
    val vm: KbViewModel = viewModel()
    val state by vm.state.collectAsState()
    LaunchedEffect(Unit) { vm.load() }

    val filtered = remember(state.articles, state.query) {
        val q = state.query.trim().lowercase()
        if (q.isEmpty()) state.articles
        else state.articles.filter {
            it.title.lowercase().contains(q) || it.tags.lowercase().contains(q)
        }
    }

    Box(Modifier.fillMaxSize()) {
        LazyColumn(Modifier.fillMaxSize().padding(16.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
            item { GovHeader("Knowledge Base", "Procedimientos y documentación interna") }
            item {
                OutlinedTextField(
                    value = state.query,
                    onValueChange = { vm.setQuery(it) },
                    modifier = Modifier.fillMaxWidth(),
                    placeholder = { Text("Buscar artículo…") },
                    singleLine = true,
                )
            }
            if (state.loading) { item { LinearProgressIndicator(Modifier.fillMaxWidth()) }; return@LazyColumn }
            items(filtered, key = { it.rowKey }) { a ->
                GovCard(
                    title = a.title,
                    subtitle = a.excerpt.ifBlank { a.category },
                    trailing = a.status,
                    accent = Color(0xFF6366F1),
                    modifier = Modifier.clickable { vm.openArticle(a.openKey) },
                )
            }
        }
        state.selected?.let { article ->
            AlertDialog(
                onDismissRequest = { vm.closeArticle() },
                title = { Text(article.title) },
                text = {
                    Column {
                        Text(article.excerpt, style = MaterialTheme.typography.bodySmall, color = Color(0xFF64748B))
                        Spacer(Modifier.height(8.dp))
                        Text(
                            article.content.take(2000).ifBlank { "Sin contenido." },
                            style = MaterialTheme.typography.bodyMedium,
                        )
                    }
                },
                confirmButton = { TextButton(onClick = { vm.closeArticle() }) { Text("Cerrar") } },
            )
        }
    }
}

// ── Exportaciones CSV ───────────────────────────────────────────────────────

private val EXPORT_ENTITIES = listOf(
    Triple("activities", "Actividades / OT", "🧰"),
    Triple("viatics", "Viáticos", "💸"),
    Triple("vehicles", "Vehículos", "🚐"),
    Triple("evidences", "Evidencias", "📷"),
    Triple("users", "Usuarios", "👥"),
)

data class ExportsState(val from: String = defaultFrom(), val to: String = defaultTo(), val downloading: String? = null, val error: String? = null, val message: String? = null)

private fun defaultFrom() = LocalDate.now().minusDays(30).format(DateTimeFormatter.ISO_LOCAL_DATE)
private fun defaultTo() = LocalDate.now().format(DateTimeFormatter.ISO_LOCAL_DATE)

class ExportsViewModel(app: Application) : AndroidViewModel(app) {
    private val repo = ExtraRepository(app.applicationContext)
    private val _state = MutableStateFlow(ExportsState())
    val state: StateFlow<ExportsState> = _state

    fun setFrom(v: String) = _state.update { it.copy(from = v) }
    fun setTo(v: String) = _state.update { it.copy(to = v) }

    fun download(context: Context, entity: String) {
        val from = _state.value.from
        val to = _state.value.to
        _state.update { it.copy(downloading = entity, error = null, message = null) }
        viewModelScope.launch {
            try {
                val bytes = withContext(Dispatchers.IO) { repo.exportCsv(entity, from, to) }
                val dir = File(context.cacheDir, "exports").apply { mkdirs() }
                val file = File(dir, "$entity-$from-$to.csv")
                file.writeBytes(bytes)
                shareFile(context, file)
                _state.update { it.copy(downloading = null, message = "✅ Exportación lista para compartir") }
            } catch (e: Exception) {
                _state.update { it.copy(downloading = null, error = e.message ?: "Error al exportar") }
            }
        }
    }
}

private fun shareFile(context: Context, file: File) {
    val uri = FileProvider.getUriForFile(context, "${context.packageName}.fileprovider", file)
    val intent = Intent(Intent.ACTION_SEND).apply {
        type = "text/csv"
        putExtra(Intent.EXTRA_STREAM, uri)
        addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
    }
    context.startActivity(Intent.createChooser(intent, "Compartir CSV"))
}

@Composable
fun ExportsScreen() {
    val context = LocalContext.current
    val vm: ExportsViewModel = viewModel()
    val state by vm.state.collectAsState()

    LazyColumn(Modifier.fillMaxSize().padding(16.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
        item { GovHeader("Exportaciones", "Reportes CSV por rango de fechas") }
        item {
            Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                OutlinedTextField(value = state.from, onValueChange = { vm.setFrom(it) }, label = { Text("Desde") }, modifier = Modifier.weight(1f))
                OutlinedTextField(value = state.to, onValueChange = { vm.setTo(it) }, label = { Text("Hasta") }, modifier = Modifier.weight(1f))
            }
        }
        state.error?.let { item { Text(it, color = MaterialTheme.colorScheme.error) } }
        state.message?.let { item { Text(it, color = Color(0xFF059669)) } }
        items(EXPORT_ENTITIES) { (key, label, icon) ->
            Card(Modifier.fillMaxWidth(), shape = RoundedCornerShape(14.dp)) {
                Row(
                    Modifier.fillMaxWidth().padding(14.dp),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                        Text(icon, style = MaterialTheme.typography.titleLarge)
                        Text(label, fontWeight = FontWeight.Medium)
                    }
                    Button(
                        onClick = { vm.download(context, key) },
                        enabled = state.downloading != key,
                    ) {
                        Text(if (state.downloading == key) "…" else "CSV")
                    }
                }
            }
        }
    }
}

// ── Arquitectura (mapa local — paridad web, sin API) ────────────────────────

private data class ArchPanel(val id: String, val title: String, val icon: String, val accent: Color, val modules: List<ModuleEntry>)

private fun architecturePanels(): List<ArchPanel> {
    val erpKeys = ModulePanelMap.consoleKeysFor(mx.nexara.mobile.nativeapp.access.PanelId.ERP) ?: emptySet()
    val opsKeys = ModulePanelMap.consoleKeysFor(mx.nexara.mobile.nativeapp.access.PanelId.OPS) ?: emptySet()
    val consoleByKey = ModuleCatalog.console.associateBy { it.key }
    return listOf(
        ArchPanel("erp", "NEXARA ERP", "⚙️", Color(0xFF0EA5E9), erpKeys.mapNotNull { consoleByKey[it] }),
        ArchPanel("crm", "NEXARA CRM", "📈", Color(0xFF10B981), ModuleCatalog.ventas),
        ArchPanel("ops", "NEXARA OPS", "🚀", Color(0xFFF97316), opsKeys.mapNotNull { consoleByKey[it] }),
        ArchPanel("studio", "NEXARA STUDIO", "🎨", Color(0xFFA855F7), ModuleCatalog.studio),
        ArchPanel("lab", "NEXARA LAB", "🧪", Color(0xFF64748B), ModuleCatalog.lab),
    )
}

@Composable
fun ArchitectureScreen() {
    var selected by remember { mutableStateOf("all") }
    val panels = remember { architecturePanels() }

    LazyColumn(Modifier.fillMaxSize().padding(16.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
        item {
            GovHeader("Arquitectura del ERP", "5 paneles · módulos nativos implementados")
        }
        item {
            Row(Modifier.horizontalScroll(rememberScrollState()), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                FilterChip(selected = selected == "all", onClick = { selected = "all" }, label = { Text("Todos") })
                panels.forEach { p ->
                    FilterChip(selected = selected == p.id, onClick = { selected = p.id }, label = { Text("${p.icon} ${p.title}") })
                }
            }
        }
        val toShow = if (selected == "all") panels else panels.filter { it.id == selected }
        toShow.forEach { panel ->
            item {
                Text("${panel.icon} ${panel.title}", fontWeight = FontWeight.Bold, color = panel.accent)
                Text("${panel.modules.count { it.nativeImplemented }} módulos nativos", style = MaterialTheme.typography.labelSmall, color = Color(0xFF64748B))
            }
            items(panel.modules, key = { "${panel.id}-${it.key}" }) { m ->
                GovCard(
                    title = "${m.icon} ${m.label}",
                    subtitle = m.webPath,
                    trailing = if (m.nativeImplemented) "✓" else "—",
                    accent = if (m.nativeImplemented) panel.accent else Color(0xFF94A3B8),
                )
            }
        }
    }
}

// ── Calendario personal ERP ─────────────────────────────────────────────────

data class CalendarState(
    val loading: Boolean = true,
    val error: String? = null,
    val rangeDays: Int = 30,
    val events: List<mx.nexara.mobile.nativeapp.data.api.CalendarEventDto> = emptyList(),
)

class ErpCalendarViewModel(app: Application) : AndroidViewModel(app) {
    private val repo = ExtraRepository(app.applicationContext)
    private val _state = MutableStateFlow(CalendarState())
    val state: StateFlow<CalendarState> = _state

    fun setRange(days: Int) {
        _state.update { it.copy(rangeDays = days) }
        load()
    }

    fun load() {
        _state.update { it.copy(loading = true, error = null) }
        viewModelScope.launch {
            try {
                val from = java.time.Instant.now().toString()
                val to = java.time.Instant.now().plus(_state.value.rangeDays.toLong(), ChronoUnit.DAYS).toString()
                val events = withContext(Dispatchers.IO) { repo.calendarEventDtos(from, to) }
                _state.update { it.copy(loading = false, events = events) }
            } catch (e: Exception) {
                _state.update { it.copy(loading = false, error = e.message) }
            }
        }
    }
}

@Composable
fun ErpCalendarScreen() {
    val vm: ErpCalendarViewModel = viewModel()
    val state by vm.state.collectAsState()
    LaunchedEffect(Unit) { vm.load() }

    val grouped = remember(state.events) {
        state.events.groupBy { it.dayKey.ifBlank { "Sin fecha" } }
            .entries.sortedBy { it.key }
    }

    LazyColumn(Modifier.fillMaxSize().padding(16.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
        item { GovHeader("Mi calendario", "OT · CRM · mantenimiento · licitaciones") }
        item {
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                listOf(7 to "7 días", 30 to "30 días", 90 to "90 días").forEach { (d, label) ->
                    FilterChip(selected = state.rangeDays == d, onClick = { vm.setRange(d) }, label = { Text(label) })
                }
            }
        }
        if (state.loading) { item { LinearProgressIndicator(Modifier.fillMaxWidth()) }; return@LazyColumn }
        if (state.events.isEmpty()) { item { Text("Sin eventos en este rango.", color = Color(0xFF64748B)) }; return@LazyColumn }
        grouped.forEach { (day, list) ->
            item { Text(day, fontWeight = FontWeight.SemiBold, color = Color(0xFF0F172A)) }
            items(list, key = { it.rowKey }) { ev ->
                GovCard(
                    title = ev.displayTitle,
                    subtitle = "${ev.source} · ${ev.type}",
                    trailing = ev.timeLabel,
                    accent = Color(0xFF3B82F6),
                )
            }
        }
    }
}

// ── Organigrama ─────────────────────────────────────────────────────────────

@Composable
fun OrgchartScreen() {
    var roots by remember { mutableStateOf<List<mx.nexara.mobile.nativeapp.data.api.OrgNodeDto>>(emptyList()) }
    var loading by remember { mutableStateOf(true) }
    var error by remember { mutableStateOf<String?>(null) }
    val context = LocalContext.current

    LaunchedEffect(Unit) {
        loading = true
        try {
            roots = withContext(Dispatchers.IO) { ExtraRepository(context).orgNodeDtos() }
        } catch (e: Exception) {
            error = e.message
        }
        loading = false
    }

    LazyColumn(Modifier.fillMaxSize().padding(16.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
        item { GovHeader("Organigrama", "Jerarquía y reportes") }
        if (loading) { item { LinearProgressIndicator(Modifier.fillMaxWidth()) }; return@LazyColumn }
        if (error != null) { item { Text(error!!, color = MaterialTheme.colorScheme.error) }; return@LazyColumn }
        item { OrgchartTree(roots, depth = 0) }
    }
}

@Composable
private fun OrgchartTree(nodes: List<mx.nexara.mobile.nativeapp.data.api.OrgNodeDto>, depth: Int) {
    nodes.forEach { node ->
        val pad = (depth * 16).dp
        GovCard(
            title = node.name,
            subtitle = listOfNotNull(
                node.roleName.takeIf { it.isNotBlank() },
                node.departmentName.takeIf { it.isNotBlank() },
            ).joinToString(" · "),
            trailing = if (node.children.isNotEmpty()) "${node.children.size} ↓" else "",
            accent = Color(0xFF0D9488),
            modifier = Modifier.padding(start = pad),
        )
        if (node.children.isNotEmpty()) {
            OrgchartTree(node.children, depth + 1)
        }
    }
}

// ── KPIs RH ─────────────────────────────────────────────────────────────────

data class HrKpisState(
    val loading: Boolean = true,
    val error: String? = null,
    val staff: List<mx.nexara.mobile.nativeapp.data.api.HrStaffDto> = emptyList(),
    val engineers: List<mx.nexara.mobile.nativeapp.data.api.BiEngineerRowDto> = emptyList(),
)

class HrKpisViewModel(app: Application) : AndroidViewModel(app) {
    private val repo = ExtraRepository(app.applicationContext)
    private val _state = MutableStateFlow(HrKpisState())
    val state: StateFlow<HrKpisState> = _state

    fun load() {
        _state.update { it.copy(loading = true, error = null) }
        viewModelScope.launch {
            try {
                val allStaff = mutableListOf<mx.nexara.mobile.nativeapp.data.api.HrStaffDto>()
                var page = 1
                repeat(10) {
                    val batch = withContext(Dispatchers.IO) { repo.hrStaffDtos(page) }
                    if (batch.isEmpty()) return@repeat
                    allStaff.addAll(batch)
                    if (batch.size < 100) return@repeat
                    page++
                }
                val engineers = withContext(Dispatchers.IO) { repo.biEngineerRowDtos(15) }
                _state.update { it.copy(loading = false, staff = allStaff, engineers = engineers) }
            } catch (e: Exception) {
                _state.update { it.copy(loading = false, error = e.message) }
            }
        }
    }
}

@Composable
fun HrKpisScreen() {
    val vm: HrKpisViewModel = viewModel()
    val state by vm.state.collectAsState()
    LaunchedEffect(Unit) { vm.load() }

    val total = state.staff.size
    val bajas = state.staff.count { it.isBaja }
    val rotacion = if (total > 0) (bajas.toDouble() / total * 100) else 0.0
    val avgCompletion = state.engineers.map { it.completionRate }.average().let { if (it.isNaN()) 0.0 else it }

    LazyColumn(Modifier.fillMaxSize().padding(16.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
        item { GovHeader("KPIs de personas", "Plantilla · rotación · productividad") }
        if (state.loading) { item { LinearProgressIndicator(Modifier.fillMaxWidth()) }; return@LazyColumn }
        item {
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                GovMetric(Modifier.weight(1f), "Plantilla", "$total", Color(0xFF3B82F6))
                GovMetric(Modifier.weight(1f), "Rotación", "${"%.1f".format(rotacion)}%", Color(0xFFF59E0B))
                GovMetric(Modifier.weight(1f), "Cierre OT", "${avgCompletion.toInt()}%", Color(0xFF059669))
            }
        }
        if (state.engineers.isNotEmpty()) {
            item { Text("Productividad operativa (90d)", fontWeight = FontWeight.SemiBold) }
            items(state.engineers, key = { it.rowKey }) { e ->
                GovCard(
                    title = e.engineerName,
                    subtitle = "${e.completed}/${e.totalActivities} OT",
                    trailing = "${e.completionRate.toInt()}%",
                    accent = Color(0xFF6366F1),
                )
            }
        }
    }
}

// ── Shared UI ───────────────────────────────────────────────────────────────

@Composable
private fun GovHeader(title: String, subtitle: String) {
    Column(Modifier.padding(bottom = 4.dp)) {
        Text(title, style = MaterialTheme.typography.headlineSmall.copy(fontWeight = FontWeight.Bold))
        Text(subtitle, style = MaterialTheme.typography.bodySmall, color = Color(0xFF64748B))
    }
}

@Composable
private fun GovMetric(modifier: Modifier, label: String, value: String, accent: Color) {
    Card(modifier, colors = CardDefaults.cardColors(containerColor = accent.copy(0.1f)), shape = RoundedCornerShape(12.dp)) {
        Column(Modifier.padding(12.dp)) {
            Text(label, style = MaterialTheme.typography.labelSmall, color = accent)
            Text(value, style = MaterialTheme.typography.titleMedium.copy(fontWeight = FontWeight.Bold))
        }
    }
}

@Composable
private fun GovCard(
    title: String,
    subtitle: String,
    trailing: String = "",
    accent: Color = Color(0xFF0D9488),
    modifier: Modifier = Modifier,
) {
    Card(modifier.fillMaxWidth(), shape = RoundedCornerShape(12.dp), elevation = CardDefaults.cardElevation(1.dp)) {
        Row(Modifier.padding(12.dp), verticalAlignment = Alignment.CenterVertically) {
            Column(Modifier.weight(1f)) {
                Text(title, fontWeight = FontWeight.SemiBold, color = Color(0xFF0F172A))
                if (subtitle.isNotBlank()) Text(subtitle, style = MaterialTheme.typography.bodySmall, color = Color(0xFF64748B))
            }
            if (trailing.isNotBlank()) {
                Text(trailing, fontWeight = FontWeight.Bold, color = accent, modifier = Modifier.background(accent.copy(0.12f), RoundedCornerShape(8.dp)).padding(horizontal = 8.dp, vertical = 4.dp))
            }
        }
    }
}

// ── Recruiting Screen ─────────────────────────────────────────────────────────

private val STAGE_LABELS = mapOf(
    "INBOX" to "Postulado",
    "RECRUITER_SHORTLIST" to "Entrevista técnica",
    "RECRUITER_REJECTED" to "Rechazado (técnico)",
    "ADMIN_SHORTLIST" to "Entrevista admin",
    "ADMIN_REJECTED" to "Rechazado (admin)",
    "SUPERADMIN_SHORTLIST" to "Oferta",
    "SUPERADMIN_REJECTED" to "Rechazado (dir.)",
    "APPROVED" to "Contratado",
)

private val STAGE_ORDER = listOf(
    "INBOX", "RECRUITER_SHORTLIST", "ADMIN_SHORTLIST", "SUPERADMIN_SHORTLIST", "APPROVED",
    "RECRUITER_REJECTED", "ADMIN_REJECTED", "SUPERADMIN_REJECTED",
)

private fun stageColor(key: String) = when (key) {
    "INBOX"                  -> Color(0xFF6B7280)
    "RECRUITER_SHORTLIST"    -> Color(0xFF3B82F6)
    "ADMIN_SHORTLIST"        -> Color(0xFF8B5CF6)
    "SUPERADMIN_SHORTLIST"   -> Color(0xFFF59E0B)
    "APPROVED"               -> Color(0xFF22C55E)
    else                     -> Color(0xFFEF4444)
}

@Composable
fun RecruitingScreen() {
    val context = LocalContext.current
    val repo = remember { mx.nexara.mobile.nativeapp.data.extra.ExtraRepository(context) }
    var loading by remember { mutableStateOf(true) }
    var candidates by remember { mutableStateOf<List<mx.nexara.mobile.nativeapp.data.api.CandidateDto>>(emptyList()) }
    var query by remember { mutableStateOf("") }
    var showRejected by remember { mutableStateOf(false) }
    var selected by remember { mutableStateOf<mx.nexara.mobile.nativeapp.data.api.CandidateDto?>(null) }

    LaunchedEffect(Unit) {
        loading = true
        candidates = kotlinx.coroutines.withContext(kotlinx.coroutines.Dispatchers.IO) { repo.candidateDtos() }
        loading = false
    }

    val filtered = remember(candidates, query, showRejected) {
        candidates.filter { c ->
            if (!showRejected && c.isRejected) return@filter false
            if (query.isBlank()) return@filter true
            val q = query.lowercase()
            c.displayName.lowercase().contains(q) ||
            c.email.lowercase().contains(q) ||
            c.category.lowercase().contains(q)
        }
    }

    val grouped = remember(filtered) {
        val map = filtered.groupBy { it.stageKey }
        STAGE_ORDER.filter { map.containsKey(it) }.map { key -> key to map[key]!! }
    }

    val sel = selected
    if (sel != null) { CandidateDetail(sel, onBack = { selected = null }); return }

    Column(Modifier.fillMaxSize()) {
        // KPI strip
        if (!loading) {
            Row(
                Modifier.fillMaxWidth().background(MaterialTheme.colorScheme.surfaceVariant).padding(10.dp),
                horizontalArrangement = Arrangement.SpaceEvenly,
            ) {
                val total      = candidates.size
                val inProcess  = candidates.count { !it.isRejected && !it.isApproved }
                val approved   = candidates.count { it.isApproved }
                val rejected   = candidates.count { it.isRejected }
                RecruKpiChip("Total", "$total")
                RecruKpiChip("En proceso", "$inProcess", Color(0xFF3B82F6))
                RecruKpiChip("Contratados", "$approved", Color(0xFF22C55E))
                RecruKpiChip("Rechazados", "$rejected", Color(0xFFEF4444))
            }
        }
        // Search + toggle
        Row(Modifier.fillMaxWidth().padding(horizontal = 12.dp, vertical = 8.dp), horizontalArrangement = Arrangement.spacedBy(8.dp), verticalAlignment = Alignment.CenterVertically) {
            OutlinedTextField(
                value = query,
                onValueChange = { query = it },
                placeholder = { Text("Buscar candidato…") },
                modifier = Modifier.weight(1f),
                singleLine = true,
            )
            FilterChip(selected = showRejected, onClick = { showRejected = !showRejected }, label = { Text("Rechazados", style = MaterialTheme.typography.labelSmall) })
        }

        if (loading) {
            Box(Modifier.fillMaxSize(), Alignment.Center) { CircularProgressIndicator() }
        } else {
            LazyColumn(contentPadding = PaddingValues(bottom = 24.dp)) {
                grouped.forEach { (stageKey, list) ->
                    val color = stageColor(stageKey)
                    val label = STAGE_LABELS[stageKey] ?: stageKey
                    item(key = "hdr-$stageKey") {
                        Row(
                            Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 8.dp),
                            horizontalArrangement = Arrangement.SpaceBetween,
                            verticalAlignment = Alignment.CenterVertically,
                        ) {
                            Text(label, fontWeight = FontWeight.Bold, color = color)
                            Box(Modifier.background(color.copy(alpha = 0.12f), RoundedCornerShape(8.dp)).padding(horizontal = 8.dp, vertical = 2.dp)) {
                                Text("${list.size}", style = MaterialTheme.typography.labelSmall, color = color)
                            }
                        }
                    }
                    items(list, key = { it.rowKey }) { c ->
                        RecruCandidateCard(c, color, onClick = { selected = c })
                    }
                }
            }
        }
    }
}

@Composable
private fun RecruKpiChip(label: String, value: String, color: Color = MaterialTheme.colorScheme.onSurface) {
    Column(horizontalAlignment = Alignment.CenterHorizontally) {
        Text(value, fontWeight = FontWeight.Bold, color = color)
        Text(label, style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
    }
}

@Composable
private fun CandidateDetail(c: mx.nexara.mobile.nativeapp.data.api.CandidateDto, onBack: () -> Unit) {
    val name     = c.displayName
    val email    = c.email
    val phone    = c.whatsapp
    val position = c.category.ifBlank { c.position }
    val stage    = c.stageKey
    val cv       = c.cvUrl
    val exp      = c.experience
    val notes    = c.notes
    val source   = c.source
    val salary   = c.expectedSalary

    LazyColumn(Modifier.fillMaxSize(), contentPadding = PaddingValues(12.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
        item { OutlinedButton(onClick = onBack) { Text("← Candidatos") } }
        item {
            Card(Modifier.fillMaxWidth()) {
                Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                    Text(name.ifBlank { "Candidato" }, fontWeight = FontWeight.Bold, style = MaterialTheme.typography.titleMedium)
                    if (stage.isNotBlank()) {
                        Box(Modifier.background(stageColor(stage).copy(0.15f), RoundedCornerShape(6.dp)).padding(horizontal = 8.dp, vertical = 2.dp)) {
                            Text(STAGE_LABELS[stage] ?: stage, style = MaterialTheme.typography.labelSmall, color = stageColor(stage))
                        }
                    }
                }
            }
        }
        item {
            Card(Modifier.fillMaxWidth()) {
                Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    if (position.isNotBlank()) CandLine("Posición", position)
                    if (email.isNotBlank())    CandLine("Email", email)
                    if (phone.isNotBlank())    CandLine("WhatsApp / Tel.", phone)
                    if (exp.isNotBlank())      CandLine("Experiencia", exp)
                    if (salary.isNotBlank())   CandLine("Salario esperado", salary)
                    if (source.isNotBlank())   CandLine("Fuente", source)
                    if (cv.isNotBlank())       CandLine("CV URL", cv.take(60))
                }
            }
        }
        if (notes.isNotBlank()) {
            item {
                Card(Modifier.fillMaxWidth()) {
                    Column(Modifier.padding(16.dp)) {
                        Text("Notas", fontWeight = FontWeight.SemiBold)
                        Spacer(Modifier.height(6.dp))
                        Text(notes, style = MaterialTheme.typography.bodyMedium)
                    }
                }
            }
        }
    }
}

@Composable
private fun CandLine(label: String, value: String) {
    Row(Modifier.fillMaxWidth()) {
        Text(label, fontWeight = FontWeight.Medium, modifier = Modifier.weight(1f))
        Text(value, color = MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.weight(1.2f))
    }
}

@Composable
private fun RecruCandidateCard(c: mx.nexara.mobile.nativeapp.data.api.CandidateDto, accent: Color, onClick: () -> Unit = {}) {
    val name     = c.displayName
    val email    = c.email
    val category = c.category
    val whatsapp = c.whatsapp
    val initials = name.split(" ").take(2).mapNotNull { it.firstOrNull()?.uppercaseChar() }.joinToString("")

    Row(
        Modifier.fillMaxWidth().clickable { onClick() }.padding(horizontal = 16.dp, vertical = 4.dp),
        horizontalArrangement = Arrangement.spacedBy(12.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Box(
            Modifier.size(44.dp).background(accent.copy(0.15f), RoundedCornerShape(22.dp)),
            Alignment.Center
        ) { Text(initials.ifBlank { "?" }, fontWeight = FontWeight.Bold, color = accent) }
        Column(Modifier.weight(1f)) {
            Text(name.ifBlank { "Candidato" }, fontWeight = FontWeight.SemiBold)
            if (category.isNotBlank()) Text(category, style = MaterialTheme.typography.bodySmall, color = Color(0xFF64748B))
            if (email.isNotBlank()) Text(email, style = MaterialTheme.typography.labelSmall, color = Color(0xFF94A3B8))
        }
        if (whatsapp.isNotBlank()) {
            Text("📱", style = MaterialTheme.typography.bodySmall)
        }
    }
}


