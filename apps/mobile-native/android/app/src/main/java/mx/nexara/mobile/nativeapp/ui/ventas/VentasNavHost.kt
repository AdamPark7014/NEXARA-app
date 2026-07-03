package mx.nexara.mobile.nativeapp.ui.ventas

import android.app.Application
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
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
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import androidx.lifecycle.viewmodel.compose.viewModel
import mx.nexara.mobile.nativeapp.ui.shared.NotificationsScreen
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.currentBackStackEntryAsState
import androidx.navigation.compose.rememberNavController
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import mx.nexara.mobile.nativeapp.data.api.CotizacionDto
import mx.nexara.mobile.nativeapp.data.extra.ExtraRepository
import mx.nexara.mobile.nativeapp.access.PanelId
import mx.nexara.mobile.nativeapp.navigation.PendingDeepLink
import mx.nexara.mobile.nativeapp.ui.console.screens.MyProfileScreen
import mx.nexara.mobile.nativeapp.ui.console.screens.PlaceholderScreen
import mx.nexara.mobile.nativeapp.data.AuthRepository
import mx.nexara.mobile.nativeapp.ui.console.ConsoleSidebarGroup
import mx.nexara.mobile.nativeapp.ui.console.ventasSidebarGroups

// ── Routes ────────────────────────────────────────────────────────────────────

private object VentasRoutes {
    const val Dashboard       = "v/dashboard"
    const val Cotizaciones    = "v/cotizaciones"
    const val Leads           = "v/leads"
    const val More            = "v/more"
    const val ModulePattern   = "v/m/{key}"
    fun module(key: String)   = "v/m/$key"
}

// ── NavHost ───────────────────────────────────────────────────────────────────

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun VentasNavHost(
    onExitToPanels: () -> Unit,
    panelTitle: String = "NEXARA CRM",
) {
    val nav = rememberNavController()
    val entry by nav.currentBackStackEntryAsState()
    val ctx = LocalContext.current
    val user = remember(ctx) { AuthRepository(ctx).loadSession() }
    val crmMoreGroups = remember(user) { ventasSidebarGroups(user) }

    LaunchedEffect(Unit) {
        val key = PendingDeepLink.consumeModuleFor(PanelId.CRM) ?: return@LaunchedEffect
        nav.navigate(VentasRoutes.module(key)) { launchSingleTop = true }
    }

    val currentRoute = entry?.destination?.route ?: VentasRoutes.Dashboard

    val bottomTabs = listOf(
        Triple(VentasRoutes.Dashboard,    Icons.Default.BarChart,       "Inicio"),
        Triple(VentasRoutes.Cotizaciones, Icons.Default.Description,    "Cotizaciones"),
        Triple(VentasRoutes.Leads,        Icons.Default.PersonAdd,      "Leads"),
        Triple(VentasRoutes.More,         Icons.Default.MoreHoriz,      "Más"),
    )

    val isBottomLevel = bottomTabs.any { it.first == currentRoute }

    Scaffold(
        bottomBar = {
            if (isBottomLevel) {
                NavigationBar {
                    bottomTabs.forEach { (route, icon, label) ->
                        NavigationBarItem(
                            selected = currentRoute == route,
                            onClick = {
                                if (currentRoute != route) {
                                    nav.navigate(route) {
                                        popUpTo(VentasRoutes.Dashboard) { saveState = true }
                                        launchSingleTop = true; restoreState = true
                                    }
                                }
                            },
                            icon  = { Icon(icon, contentDescription = label) },
                            label = { Text(label, fontSize = 10.sp) }
                        )
                    }
                }
            }
        }
    ) { padding ->
        NavHost(
            navController = nav,
            startDestination = VentasRoutes.Dashboard,
            modifier = Modifier.padding(padding)
        ) {
            composable(VentasRoutes.Dashboard) {
                VentasDashboardScreen()
            }
            composable(VentasRoutes.Cotizaciones) {
                VentasCotizacionesScreen()
            }
            composable(VentasRoutes.Leads) {
                VentasLeadsApiScreen()
            }
            composable(VentasRoutes.More) {
                VentasMoreScreen(
                    groups = crmMoreGroups,
                    onOpenModule = { key -> nav.navigate(VentasRoutes.module(key)) },
                    onExitToPanels = onExitToPanels,
                )
            }
            composable(VentasRoutes.ModulePattern) { backStack ->
                val key = backStack.arguments?.getString("key").orEmpty()
                when (key) {
                    "dashboard"           -> VentasDashboardScreen()
                    "cotizaciones"          -> VentasCotizacionesScreen()
                    "plantillas", "templates" -> VentasTemplatesScreen()
                    "leads"               -> VentasLeadsApiScreen()
                    "oportunidades"       -> VentasOportunidadesScreen()
                    "clientes"            -> VentasClientesScreen()
                    "productos"           -> VentasProductsScreen()
                    "proyectos"           -> VentasProyectosScreen()
                    "pipeline"            -> VentasPipelineScreen()
                    "agenda"              -> VentasAgendaScreen()
                    "licitaciones", "tenders" -> VentasTendersScreen()
                    "metas", "targets"    -> VentasTargetsScreen()
                    "gestion-vendedores", "equipo-comercial", "sales-team" -> VentasSalesTeamScreen()
                    "reportes"            -> CrmReportsScreen(CrmReportMode.REPORTES)
                    "crecimiento"           -> CrmReportsScreen(CrmReportMode.CRECIMIENTO)
                    "equipo-comparativa"    -> CrmReportsScreen(CrmReportMode.EQUIPO)
                    "notificaciones"      -> NotificationsScreen(onBack = { nav.popBackStack() })
                    "my-profile"          -> MyProfileScreen()
                    else -> PlaceholderScreen(
                        title = key,
                        subtitle = "Módulo CRM: implementación pendiente.",
                        primaryActionText = "Volver",
                        onPrimaryAction = { nav.popBackStack() }
                    )
                }
            }
        }
    }
}

// ── Cotizaciones Screen ────────────────────────────────────────────────────────

data class VentasCotizacionesUiState(
    val isLoading: Boolean = true,
    val items: List<CotizacionDto> = emptyList(),
    val query: String = "",
    val statusFilter: String = "todos",
)

class VentasCotizacionesViewModel(app: Application) : AndroidViewModel(app) {
    private val repo = ExtraRepository(app.applicationContext)
    private val _state = MutableStateFlow(VentasCotizacionesUiState())
    val state: StateFlow<VentasCotizacionesUiState> = _state

    init { load() }

    fun load() {
        viewModelScope.launch {
            _state.update { it.copy(isLoading = true) }
            val items = withContext(Dispatchers.IO) { repo.cotizaciones() }
            _state.update { it.copy(isLoading = false, items = items) }
        }
    }

    fun setQuery(q: String)  { _state.update { it.copy(query = q) } }
    fun setStatus(s: String) { _state.update { it.copy(statusFilter = s) } }

    val filtered: List<CotizacionDto> get() {
        val s = _state.value
        return s.items
            .let { list -> if (s.statusFilter == "todos") list else list.filter { c -> c.estatus?.lowercase() == s.statusFilter } }
            .let { list -> if (s.query.isBlank()) list else list.filter { c ->
                c.folio.orEmpty().contains(s.query, ignoreCase = true) ||
                c.cliente.orEmpty().contains(s.query, ignoreCase = true)
            }}
    }
}

private val CotStatuses = listOf("todos", "pendiente", "aprobada", "rechazada", "en proceso")

@Composable
fun VentasCotizacionesScreen() {
    val ctx = LocalContext.current
    val vm: VentasCotizacionesViewModel = viewModel(factory = object : androidx.lifecycle.ViewModelProvider.Factory {
        override fun <T : androidx.lifecycle.ViewModel> create(c: Class<T>): T {
            @Suppress("UNCHECKED_CAST")
            return VentasCotizacionesViewModel(ctx.applicationContext as Application) as T
        }
    })
    val state by vm.state.collectAsState()
    val items by remember { derivedStateOf { vm.filtered } }
    var selected by remember { mutableStateOf<CotizacionDto?>(null) }

    val sel = selected
    if (sel != null) {
        CotizacionDetail(cot = sel, onBack = { selected = null })
        return
    }

    LazyColumn(modifier = Modifier.fillMaxSize(), contentPadding = PaddingValues(12.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
        // KPI strip
        if (!state.isLoading && state.items.isNotEmpty()) {
            item {
                val total      = state.items.size
                val aprobadas  = state.items.count { it.estatus?.lowercase() in listOf("aprobada","completada","won") }
                val pendientes = state.items.count { it.estatus?.lowercase() in listOf("pendiente","en proceso") }
                val totalMxn   = state.items.sumOf { it.total ?: 0.0 }
                Row(
                    Modifier.fillMaxWidth().clip(RoundedCornerShape(12.dp))
                        .background(MaterialTheme.colorScheme.surfaceVariant).padding(12.dp),
                    horizontalArrangement = Arrangement.SpaceEvenly
                ) {
                    CrmKpiChip("Total", "$total", MaterialTheme.colorScheme.onSurface)
                    CrmKpiChip("Aprobadas", "$aprobadas", Color(0xFF2E7D32))
                    CrmKpiChip("Pendientes", "$pendientes", Color(0xFFE65100))
                    CrmKpiChip("Monto", fmtMxnShort(totalMxn), MaterialTheme.colorScheme.primary)
                }
            }
        }

        // Search
        item {
            OutlinedTextField(
                value = state.query,
                onValueChange = { vm.setQuery(it) },
                placeholder = { Text("Buscar cotización…") },
                leadingIcon = { Icon(Icons.Default.Search, null) },
                trailingIcon = {
                    if (state.query.isNotEmpty()) IconButton({ vm.setQuery("") }) { Icon(Icons.Default.Clear, null) }
                },
                modifier = Modifier.fillMaxWidth(),
                singleLine = true,
            )
        }

        // Status chips
        item {
            Row(
                Modifier.horizontalScroll(rememberScrollState()),
                horizontalArrangement = Arrangement.spacedBy(8.dp)
            ) {
                CotStatuses.forEach { st ->
                    val isSelected = state.statusFilter == st
                    FilterChip(
                        selected = isSelected,
                        onClick = { vm.setStatus(st) },
                        label = { Text(st.replaceFirstChar { it.uppercase() }, fontSize = 12.sp) }
                    )
                }
            }
        }

        if (state.isLoading) {
            item { Box(Modifier.fillMaxWidth().padding(40.dp), Alignment.Center) { CircularProgressIndicator() } }
        } else if (items.isEmpty()) {
            item { Text("Sin cotizaciones", color = MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.padding(20.dp)) }
        } else {
            items(items, key = { it.id }) { cot ->
                CotizacionRowCard(cot, onClick = { selected = cot })
            }
        }
    }
}

@Composable
private fun CotizacionDetail(cot: CotizacionDto, onBack: () -> Unit) {
    val color = cotStatusColorAndroid(cot.estatus)
    LazyColumn(modifier = Modifier.fillMaxSize(), contentPadding = PaddingValues(12.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
        item {
            Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
                OutlinedButton(onClick = onBack) { Text("← Cotizaciones") }
                Spacer(Modifier.weight(1f))
                if (!cot.estatus.isNullOrBlank()) {
                    Box(
                        Modifier.clip(RoundedCornerShape(50)).background(color.copy(alpha = 0.15f))
                            .padding(horizontal = 12.dp, vertical = 4.dp)
                    ) { Text(cot.estatus.replaceFirstChar { it.uppercase() }, color = color, fontWeight = FontWeight.Bold, fontSize = 13.sp) }
                }
            }
        }
        item {
            Card(Modifier.fillMaxWidth()) {
                Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    Text("Cotización", fontWeight = FontWeight.Bold, fontSize = 16.sp)
                    CotDetailLine("Folio", cot.folio)
                    CotDetailLine("Cliente", cot.cliente)
                    CotDetailLine("Total", cot.total?.let { fmtMxnShort(it) })
                    CotDetailLine("Fecha", (cot.fecha ?: cot.createdAt)?.take(10))
                }
            }
        }
    }
}

@Composable
private fun CotizacionRowCard(cot: CotizacionDto, onClick: () -> Unit = {}) {
    val color = cotStatusColorAndroid(cot.estatus)
    Row(
        Modifier.fillMaxWidth().clip(RoundedCornerShape(12.dp))
            .background(MaterialTheme.colorScheme.surface)
            .clickable { onClick() }
    ) {
        Box(Modifier.width(4.dp).height(72.dp).background(color))
        Column(Modifier.padding(horizontal = 12.dp, vertical = 8.dp).weight(1f)) {
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween, verticalAlignment = Alignment.CenterVertically) {
                Text(cot.folio ?: "Sin folio", fontWeight = FontWeight.Bold, fontSize = 14.sp, modifier = Modifier.weight(1f))
                Text(fmtMxnShort(cot.total ?: 0.0), fontWeight = FontWeight.SemiBold, fontSize = 13.sp)
            }
            if (!cot.cliente.isNullOrBlank()) {
                Text(cot.cliente, fontSize = 12.sp, color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
            Row(horizontalArrangement = Arrangement.SpaceBetween, modifier = Modifier.fillMaxWidth()) {
                Box(
                    Modifier.clip(RoundedCornerShape(50)).background(color.copy(alpha = 0.15f)).padding(horizontal = 8.dp, vertical = 2.dp)
                ) { Text(cot.estatus?.replaceFirstChar { it.uppercase() } ?: "–", color = color, fontSize = 11.sp, fontWeight = FontWeight.Bold) }
                Text((cot.fecha ?: cot.createdAt)?.take(10) ?: "", fontSize = 11.sp, color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
        }
    }
}

@Composable
private fun CotDetailLine(label: String, value: String?) {
    if (value.isNullOrBlank()) return
    Row(Modifier.fillMaxWidth()) {
        Text(label, fontWeight = FontWeight.Medium)
        Spacer(Modifier.weight(1f))
        Text(value, color = MaterialTheme.colorScheme.onSurfaceVariant)
    }
}

// ── Leads Screen ──────────────────────────────────────────────────────────────

data class VentasLeadsUiState(
    val isLoading: Boolean = true,
    val items: List<Map<String, Any?>> = emptyList(),
    val query: String = "",
)

class VentasLeadsViewModel(app: Application) : AndroidViewModel(app) {
    private val repo = ExtraRepository(app.applicationContext)
    private val _state = MutableStateFlow(VentasLeadsUiState())
    val state: StateFlow<VentasLeadsUiState> = _state

    init { load() }

    fun load() {
        viewModelScope.launch {
            _state.update { it.copy(isLoading = true) }
            val items = withContext(Dispatchers.IO) { repo.clientTicketRequests() }
            _state.update { it.copy(isLoading = false, items = items) }
        }
    }

    fun setQuery(q: String) { _state.update { it.copy(query = q) } }

    val filtered: List<Map<String, Any?>> get() {
        val s = _state.value
        if (s.query.isBlank()) return s.items
        val q = s.query.lowercase()
        return s.items.filter { t ->
            lStr(t, "description", "descripcion", "title").lowercase().contains(q) ||
            lStr(t, "branchName", "clientName", "cliente").lowercase().contains(q) ||
            lStr(t, "status", "estatus").lowercase().contains(q)
        }
    }
}

@Composable
fun VentasLeadsScreen() {
    val ctx = LocalContext.current
    val vm: VentasLeadsViewModel = viewModel(factory = object : androidx.lifecycle.ViewModelProvider.Factory {
        override fun <T : androidx.lifecycle.ViewModel> create(c: Class<T>): T {
            @Suppress("UNCHECKED_CAST")
            return VentasLeadsViewModel(ctx.applicationContext as Application) as T
        }
    })
    val state by vm.state.collectAsState()
    val items by remember { derivedStateOf { vm.filtered } }
    var selected by remember { mutableStateOf<Map<String, Any?>?>(null) }

    if (selected != null) {
        val lead = selected!!
        val status = lStr(lead, "status", "estatus", "estado")
        val color  = cotStatusColorAndroid(status)
        LazyColumn(Modifier.fillMaxSize(), contentPadding = PaddingValues(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
            item {
                Row(Modifier.fillMaxWidth(), Arrangement.SpaceBetween, Alignment.CenterVertically) {
                    OutlinedButton(onClick = { selected = null }) { Text("← Leads") }
                    if (status.isNotBlank()) Text(status.replaceFirstChar { it.uppercase() }, color = color, fontWeight = FontWeight.SemiBold)
                }
            }
            item { Text(lStr(lead, "title", "subject", "asunto", "description"), style = MaterialTheme.typography.titleLarge, fontWeight = FontWeight.Bold) }
            item {
                Card(Modifier.fillMaxWidth()) {
                    Column(Modifier.padding(14.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                        LeadDetailLine("Cliente", lStr(lead, "clientName", "cliente"))
                        LeadDetailLine("Email", lStr(lead, "email", "correo"))
                        LeadDetailLine("Teléfono", lStr(lead, "phone", "telefono"))
                        LeadDetailLine("Origen", lStr(lead, "source", "origen", "fuente"))
                        LeadDetailLine("Asignado a", lStr(lead, "ownerName", "assignedTo"))
                        LeadDetailLine("Estado", status)
                        LeadDetailLine("Fecha", lStr(lead, "createdAt", "fecha").take(10))
                        val notes = lStr(lead, "notes", "notas")
                        if (notes.isNotBlank()) { Divider(); Text(notes, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant) }
                    }
                }
            }
        }
        return
    }

    LazyColumn(modifier = Modifier.fillMaxSize(), contentPadding = PaddingValues(12.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
        item {
            OutlinedTextField(
                value = state.query,
                onValueChange = { vm.setQuery(it) },
                placeholder = { Text("Buscar lead…") },
                leadingIcon = { Icon(Icons.Default.Search, null) },
                trailingIcon = {
                    if (state.query.isNotEmpty()) IconButton({ vm.setQuery("") }) { Icon(Icons.Default.Clear, null) }
                },
                modifier = Modifier.fillMaxWidth(),
                singleLine = true,
            )
        }

        if (state.isLoading) {
            item { Box(Modifier.fillMaxWidth().padding(40.dp), Alignment.Center) { CircularProgressIndicator() } }
        } else if (items.isEmpty()) {
            item { Text("Sin leads", color = MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.padding(20.dp)) }
        } else {
            items(items, key = { it["id"]?.toString() ?: it.hashCode().toString() }) { lead ->
                Box(Modifier.clickable { selected = lead }) { LeadRowCard(lead) }
            }
        }
    }
}

@Composable
private fun LeadRowCard(lead: Map<String, Any?>) {
    val description = lStr(lead, "description", "descripcion", "title")
    val branch      = lStr(lead, "branchName", "clientName", "cliente")
    val status      = lStr(lead, "status", "estatus")
    val date        = lStr(lead, "createdAt", "fecha").take(10)
    val color = cotStatusColorAndroid(status)
    Row(
        Modifier.fillMaxWidth().clip(RoundedCornerShape(12.dp))
            .background(MaterialTheme.colorScheme.surface).padding(12.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(10.dp)
    ) {
        Box(Modifier.size(10.dp).clip(RoundedCornerShape(50)).background(color))
        Column(Modifier.weight(1f)) {
            Text(description.ifBlank { "Sin descripción" }.take(60), fontWeight = FontWeight.SemiBold, fontSize = 14.sp)
            if (branch.isNotBlank()) {
                Text(branch, fontSize = 12.sp, color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
        }
        Column(horizontalAlignment = Alignment.End) {
            Box(
                Modifier.clip(RoundedCornerShape(50)).background(color.copy(alpha = 0.15f)).padding(horizontal = 8.dp, vertical = 2.dp)
            ) { Text(status.replaceFirstChar { it.uppercase() }.ifBlank { "–" }, color = color, fontSize = 11.sp, fontWeight = FontWeight.Bold) }
            if (date.isNotBlank()) Text(date, fontSize = 11.sp, color = MaterialTheme.colorScheme.onSurfaceVariant)
        }
    }
}

@Composable
private fun LeadDetailLine(label: String, value: String) {
    if (value.isBlank()) return
    Row(Modifier.fillMaxWidth()) { Text(label, fontWeight = FontWeight.Medium); Spacer(Modifier.weight(1f)); Text(value, color = MaterialTheme.colorScheme.onSurfaceVariant) }
}

// ── More Screen ───────────────────────────────────────────────────────────────

@Composable
private fun VentasMoreScreen(
    groups: List<ConsoleSidebarGroup>,
    onOpenModule: (String) -> Unit,
    onExitToPanels: () -> Unit,
) {
    LazyColumn(contentPadding = PaddingValues(16.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
        groups.forEach { group ->
            item {
                Text(
                    group.title,
                    style = MaterialTheme.typography.labelLarge,
                    color = MaterialTheme.colorScheme.primary,
                    modifier = Modifier.padding(vertical = 8.dp),
                )
            }
            items(group.modules, key = { "${group.id}-${it.key}" }) { m ->
                MoreRow(m.icon, m.label) { onOpenModule(m.key) }
            }
        }
        item {
            HorizontalDivider(modifier = Modifier.padding(vertical = 8.dp))
            TextButton(
                onClick = onExitToPanels,
                colors = ButtonDefaults.textButtonColors(contentColor = MaterialTheme.colorScheme.error),
            ) { Text("← Cambiar panel") }
        }
    }
}

@Composable
private fun MoreRow(icon: String, label: String, onClick: () -> Unit) {
    Row(
        Modifier.fillMaxWidth().clip(RoundedCornerShape(10.dp))
            .background(MaterialTheme.colorScheme.surface)
            .padding(horizontal = 14.dp, vertical = 12.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(14.dp)
    ) {
        Text(icon, fontSize = 18.sp)
        Text(label, Modifier.weight(1f), fontWeight = FontWeight.Normal, fontSize = 14.sp)
        IconButton(onClick = onClick, modifier = Modifier.size(24.dp)) {
            Icon(Icons.Default.ChevronRight, contentDescription = null, modifier = Modifier.size(18.dp))
        }
    }
}

// ── Shared helpers ────────────────────────────────────────────────────────────

@Composable
private fun CrmKpiChip(label: String, value: String, color: Color) {
    Column(horizontalAlignment = Alignment.CenterHorizontally) {
        Text(value, fontWeight = FontWeight.Bold, fontSize = 16.sp, color = color)
        Text(label, fontSize = 10.sp, color = MaterialTheme.colorScheme.onSurfaceVariant)
    }
}

private fun fmtMxnShort(v: Double): String {
    return when {
        v >= 1_000_000 -> "$" + String.format("%.1fM", v / 1_000_000)
        v >= 1_000     -> "$" + String.format("%.1fK", v / 1_000)
        else           -> "$" + String.format("%,.0f", v)
    }
}

private fun lStr(m: Map<String, Any?>, vararg keys: String): String {
    for (k in keys) {
        val v = m[k]
        if (v != null) {
            val s = v.toString()
            if (s.isNotBlank() && s != "null") return s
        }
    }
    return ""
}

private fun cotStatusColorAndroid(status: String?): Color = when (status?.lowercase()) {
    "aprobada", "aprobado", "completada", "completado", "won", "cerrado" -> Color(0xFF2E7D32)
    "pendiente", "pending", "abierto", "open"                            -> Color(0xFFE65100)
    "rechazada", "rechazado", "cancelada", "cancelado", "lost"           -> Color(0xFFC62828)
    "en proceso", "in_progress", "en revision"                           -> Color(0xFF1565C0)
    else -> Color(0xFF757575)
}
