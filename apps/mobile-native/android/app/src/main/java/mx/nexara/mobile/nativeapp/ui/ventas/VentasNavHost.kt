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
import androidx.compose.material3.pulltorefresh.PullToRefreshBox
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.role
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import androidx.lifecycle.viewmodel.compose.viewModel
import mx.nexara.mobile.nativeapp.ui.shared.NotificationsScreen
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.currentBackStackEntryAsState
import androidx.navigation.compose.rememberNavController
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import mx.nexara.mobile.nativeapp.data.AuthRepository
import mx.nexara.mobile.nativeapp.data.api.CotizacionDto
import mx.nexara.mobile.nativeapp.data.api.CrmLeadDto
import mx.nexara.mobile.nativeapp.data.crm.CrmRepository
import mx.nexara.mobile.nativeapp.data.extra.ExtraRepository
import mx.nexara.mobile.nativeapp.access.DeepLinkDestination
import mx.nexara.mobile.nativeapp.access.DeepLinkNavigation
import mx.nexara.mobile.nativeapp.access.PanelId
import mx.nexara.mobile.nativeapp.navigation.PendingDeepLink
import mx.nexara.mobile.nativeapp.ui.enterprise.NxNavAnimStyle
import mx.nexara.mobile.nativeapp.ui.enterprise.NxBottomTab
import mx.nexara.mobile.nativeapp.ui.enterprise.NxBottomTabBar
import mx.nexara.mobile.nativeapp.ui.enterprise.NxColors
import mx.nexara.mobile.nativeapp.ui.enterprise.NxEmptyState
import mx.nexara.mobile.nativeapp.ui.enterprise.NxLoadingBlock
import mx.nexara.mobile.nativeapp.ui.enterprise.NxModuleScaffold
import mx.nexara.mobile.nativeapp.ui.enterprise.NxSkeletonList
import mx.nexara.mobile.nativeapp.ui.enterprise.NxPanelShell
import mx.nexara.mobile.nativeapp.ui.enterprise.NxSearchField
import mx.nexara.mobile.nativeapp.ui.enterprise.NxSectionHeader
import mx.nexara.mobile.nativeapp.ui.enterprise.nxComposable
import mx.nexara.mobile.nativeapp.ui.console.ConsoleSidebarGroup
import mx.nexara.mobile.nativeapp.ui.console.screens.MyProfileScreen
import mx.nexara.mobile.nativeapp.ui.console.screens.PlaceholderScreen
import mx.nexara.mobile.nativeapp.ui.console.ventasSidebarGroups
import mx.nexara.mobile.nativeapp.ui.catalog.ModuleCatalog

// ── Routes ────────────────────────────────────────────────────────────────────

private object VentasRoutes {
    const val Dashboard       = "v/dashboard"
    const val Cotizaciones    = "v/cotizaciones"
    const val SmartQuote      = "v/smart-quote"
    const val Leads           = "v/leads"
    const val More            = "v/more"
    const val ModulePattern   = "v/m/{key}"
    const val OpportunityDetail = "v/opportunity/{id}"
    const val LeadDetail      = "v/lead/{id}"
    const val QuoteDetail     = "v/quote/{id}"
    const val ClientDetail    = "v/client/{id}"
    fun module(key: String)   = "v/m/$key"
}

private fun ventasModuleTitle(key: String): String = when (key) {
    "chat" -> "Chat del equipo"
    "my-profile" -> "Mi perfil"
    "smart-quote", "cotizar", "nueva-cotizacion" -> "Cotizador inteligente"
    "plantillas", "templates" -> "Plantillas"
    "licitaciones", "tenders" -> "Licitaciones"
    "metas", "targets" -> "Metas"
    "gestion-vendedores", "equipo-comercial", "sales-team" -> "Gestión vendedores"
    "equipo-comparativa" -> "Comparativa equipo"
    else -> ModuleCatalog.ventas.firstOrNull { it.key == key }?.label ?: key
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
    var chatChannelId by remember { mutableStateOf<Long?>(null) }
    var chatMessageId by remember { mutableStateOf<Long?>(null) }

    val deepLinkSignal by PendingDeepLink.signal.collectAsState()
    LaunchedEffect(deepLinkSignal) {
        val link = PendingDeepLink.consumeModuleDestination(PanelId.CRM) ?: return@LaunchedEffect
        if (link.key == "chat") {
            chatChannelId = DeepLinkNavigation.chatChannelId(link)
            chatMessageId = DeepLinkNavigation.chatMessageId(link)
        }
        nav.navigate(DeepLinkNavigation.ventasRoute(link)) { launchSingleTop = true }
    }

    val currentRoute = entry?.destination?.route ?: VentasRoutes.Dashboard

    val bottomTabs = listOf(
        Triple(VentasRoutes.Dashboard,    Icons.Default.BarChart,       "Inicio"),
        Triple(VentasRoutes.Cotizaciones, Icons.Default.Description,    "Cotizaciones"),
        Triple(VentasRoutes.Leads,        Icons.Default.PersonAdd,      "Leads"),
        Triple(VentasRoutes.More,         Icons.Default.MoreHoriz,      "Más"),
    )

    val isBottomLevel = bottomTabs.any { it.first == currentRoute }
    val showBack = !isBottomLevel

    val currentTitle = when (currentRoute) {
        VentasRoutes.Dashboard    -> panelTitle
        VentasRoutes.Cotizaciones -> "Cotizaciones"
        VentasRoutes.SmartQuote   -> "Cotizador inteligente"
        VentasRoutes.Leads        -> "Leads"
        VentasRoutes.More         -> "Más opciones"
        VentasRoutes.OpportunityDetail -> "Oportunidad"
        VentasRoutes.LeadDetail   -> "Lead"
        VentasRoutes.QuoteDetail  -> "Cotización"
        VentasRoutes.ClientDetail -> "Cliente"
        VentasRoutes.ModulePattern -> ventasModuleTitle(entry?.arguments?.getString("key").orEmpty())
        else -> panelTitle
    }

    NxModuleScaffold(
        title = currentTitle,
        showBack = showBack,
        onBack = { nav.popBackStack() },
        onExitToPanels = onExitToPanels,
        bottomBar = {
            if (isBottomLevel) {
                NxBottomTabBar(
                    tabs = bottomTabs.map { (route, icon, label) ->
                        NxBottomTab(route, icon, label, 10.sp)
                    },
                    isSelected = { it == currentRoute },
                    onTabSelected = { route ->
                        nav.navigate(route) {
                            popUpTo(VentasRoutes.Dashboard) { saveState = true }
                            launchSingleTop = true
                            restoreState = true
                        }
                    },
                )
            }
        },
    ) { padding ->
        NavHost(
            navController = nav,
            startDestination = VentasRoutes.Dashboard,
            modifier = Modifier.padding(padding)
        ) {
            nxComposable(VentasRoutes.Dashboard) {
                VentasDashboardScreen(
                    onNewQuote = { nav.navigate(VentasRoutes.SmartQuote) },
                    onOpenLeads = { nav.navigate(VentasRoutes.Leads) },
                    onOpenPipeline = { nav.navigate(VentasRoutes.module("pipeline")) },
                    onOpenAgenda = { nav.navigate(VentasRoutes.module("agenda")) },
                    onOpenChat = { nav.navigate(VentasRoutes.module("chat")) },
                )
            }
            nxComposable(VentasRoutes.Cotizaciones) {
                VentasCotizacionesScreen(
                    onNewQuote = { nav.navigate(VentasRoutes.SmartQuote) },
                )
            }
            nxComposable(VentasRoutes.SmartQuote, style = NxNavAnimStyle.Modal) {
                SmartQuoteBuilderScreen(
                    onBack = { nav.popBackStack() },
                    onSaved = { id ->
                        nav.navigate("v/quote/$id") {
                            popUpTo(VentasRoutes.SmartQuote) { inclusive = true }
                        }
                    },
                )
            }
            nxComposable(VentasRoutes.Leads) {
                VentasLeadsFullScreen(
                    onNavigateToOpportunity = { id -> nav.navigate("v/opportunity/$id") { launchSingleTop = true } },
                )
            }
            nxComposable(VentasRoutes.OpportunityDetail, style = NxNavAnimStyle.Push) { entry ->
                val id = entry.arguments?.getString("id")?.toLongOrNull() ?: return@nxComposable
                VentasOpportunityDetailScreen(oppId = id, onBack = { nav.popBackStack() })
            }
            nxComposable(VentasRoutes.LeadDetail, style = NxNavAnimStyle.Push) { entry ->
                val id = entry.arguments?.getString("id")?.toLongOrNull() ?: return@nxComposable
                VentasLeadDetailByIdScreen(leadId = id, onBack = { nav.popBackStack() })
            }
            nxComposable(VentasRoutes.QuoteDetail, style = NxNavAnimStyle.Push) { entry ->
                val id = entry.arguments?.getString("id")?.toLongOrNull() ?: return@nxComposable
                VentasQuoteDetailScreen(cotizacionId = id, onBack = { nav.popBackStack() })
            }
            nxComposable(VentasRoutes.ClientDetail, style = NxNavAnimStyle.Push) { entry ->
                val id = entry.arguments?.getString("id")?.toLongOrNull() ?: return@nxComposable
                VentasClientDetailByIdScreen(clientId = id, onBack = { nav.popBackStack() })
            }
            nxComposable(VentasRoutes.More) {
                VentasMoreScreen(
                    groups = crmMoreGroups,
                    onOpenModule = { key -> nav.navigate(VentasRoutes.module(key)) },
                    onExitToPanels = onExitToPanels,
                )
            }
            nxComposable(VentasRoutes.ModulePattern, style = NxNavAnimStyle.Push) { backStack ->
                val key = backStack.arguments?.getString("key").orEmpty()
                when (key) {
                    "dashboard"           -> VentasDashboardScreen(
                        onNewQuote = { nav.navigate(VentasRoutes.SmartQuote) },
                        onOpenLeads = { nav.navigate(VentasRoutes.Leads) },
                        onOpenPipeline = { nav.navigate(VentasRoutes.module("pipeline")) },
                        onOpenAgenda = { nav.navigate(VentasRoutes.module("agenda")) },
                        onOpenChat = { nav.navigate(VentasRoutes.module("chat")) },
                    )
                    "cotizaciones"          -> VentasCotizacionesScreen()
                    "smart-quote", "cotizar", "nueva-cotizacion" -> SmartQuoteBuilderScreen(
                        onBack = { nav.popBackStack() },
                        onSaved = { id ->
                            nav.popBackStack()
                            nav.navigate("v/quote/$id") { launchSingleTop = true }
                        },
                    )
                    "plantillas", "templates" -> VentasTemplatesScreen()
                    "leads"               -> VentasLeadsFullScreen(
                        onNavigateToOpportunity = { id -> nav.navigate("v/opportunity/$id") { launchSingleTop = true } },
                    )
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
                    "notificaciones"      -> NotificationsScreen(
                        onBack = { nav.popBackStack() },
                        onOpenDestination = { dest ->
                            when (dest) {
                                is DeepLinkDestination.Module -> {
                                    if (dest.panel == PanelId.CRM) {
                                        nav.navigate(VentasRoutes.module(dest.key)) { launchSingleTop = true }
                                    } else {
                                        PendingDeepLink.destination = dest
                                        onExitToPanels()
                                    }
                                }
                                else -> Unit
                            }
                        },
                    )
                    "chat"                -> mx.nexara.mobile.nativeapp.ui.chat.ChatScreen(
                        onBack = { nav.popBackStack() },
                        initialChannelId = chatChannelId,
                        initialMessageId = chatMessageId,
                    )
                    "my-profile"          -> MyProfileScreen()
                    else -> {
                        val entry = ModuleCatalog.ventas.firstOrNull { it.key == key }
                        PlaceholderScreen(
                            title = entry?.label ?: key,
                            moduleKey = key,
                            webPath = entry?.webPath,
                            icon = entry?.icon,
                            onBack = { nav.popBackStack() },
                        )
                    }
                }
            }
        }
    }
}

// ── Cotizaciones Screen ────────────────────────────────────────────────────────

data class VentasCotizacionesUiState(
    val isLoading: Boolean = true,
    val isRefreshing: Boolean = false,
    val items: List<CotizacionDto> = emptyList(),
    val query: String = "",
    val statusFilter: String = "todos",
)

class VentasCotizacionesViewModel(app: Application) : AndroidViewModel(app) {
    private val repo = CrmRepository(app.applicationContext)
    private val _state = MutableStateFlow(VentasCotizacionesUiState())
    val state: StateFlow<VentasCotizacionesUiState> = _state

    init { load() }

    fun load(refresh: Boolean = false) {
        viewModelScope.launch {
            _state.update {
                if (refresh) it.copy(isRefreshing = true) else it.copy(isLoading = true)
            }
            val items = runCatching {
                withContext(Dispatchers.IO) { repo.cotizaciones() }
            }.getOrDefault(emptyList())
            _state.update {
                it.copy(isLoading = false, isRefreshing = false, items = items)
            }
        }
    }

    fun setQuery(q: String)  { _state.update { it.copy(query = q) } }
    fun setStatus(s: String) { _state.update { it.copy(statusFilter = s) } }

    val filtered: List<CotizacionDto> get() {
        val s = _state.value
        return s.items
            .let { list ->
                if (s.statusFilter == "todos") list
                else list.filter { c -> c.estatus?.uppercase() == s.statusFilter.uppercase() }
            }
            .let { list -> if (s.query.isBlank()) list else list.filter { c ->
                c.folio.orEmpty().contains(s.query, ignoreCase = true) ||
                c.cliente.orEmpty().contains(s.query, ignoreCase = true) ||
                c.projectName.orEmpty().contains(s.query, ignoreCase = true)
            }}
    }
}

private val CotStatuses = listOf(
    "todos" to "Todos",
    "DRAFT" to "Borrador",
    "SENT" to "Enviada",
    "APPROVED" to "Aprobada",
    "REJECTED" to "Rechazada",
)

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun VentasCotizacionesScreen(onNewQuote: () -> Unit = {}) {
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
        VentasQuoteDetailScreen(cotizacionId = sel.id, onBack = { selected = null })
        return
    }

    val sqRepo = remember(ctx) { mx.nexara.mobile.nativeapp.data.crm.SmartQuoteRepository(ctx.applicationContext) }

    Scaffold(
        floatingActionButton = {
            ExtendedFloatingActionButton(
                onClick = onNewQuote,
                icon = { Icon(Icons.Default.Add, contentDescription = "Nueva cotización") },
                text = { Text("Cotizar") },
            )
        },
    ) { innerPadding ->
    PullToRefreshBox(
        isRefreshing = state.isRefreshing,
        onRefresh = { vm.load(refresh = true) },
        modifier = Modifier.fillMaxSize().padding(innerPadding),
    ) {
    LazyColumn(
        modifier = Modifier.fillMaxSize().background(NxColors.Surface),
        contentPadding = PaddingValues(12.dp),
        verticalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        if (!state.isLoading && state.items.isNotEmpty()) {
            item { NxSectionHeader("Cotizaciones", "${state.items.size} total") }
            item {
                val total      = state.items.size
                val aprobadas  = state.items.count { it.estatus?.uppercase() == "APPROVED" }
                val pendientes = state.items.count { it.estatus?.uppercase() in listOf("DRAFT", "SENT") }
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
            NxSearchField(
                value = state.query,
                onValueChange = vm::setQuery,
                placeholder = "Buscar cotización…",
            )
        }

        // Status chips
        item {
            Row(
                Modifier.horizontalScroll(rememberScrollState()),
                horizontalArrangement = Arrangement.spacedBy(8.dp)
            ) {
                CotStatuses.forEach { (st, label) ->
                    val isSelected = state.statusFilter == st
                    FilterChip(
                        selected = isSelected,
                        onClick = { vm.setStatus(st) },
                        label = { Text(label, fontSize = 12.sp) }
                    )
                }
            }
        }

        if (!state.isLoading && state.items.isNotEmpty()) {
            item { SupplierStatsBar(repo = sqRepo) }
        }

        if (state.isLoading && !state.isRefreshing) {
            item { NxSkeletonList() }
        } else if (items.isEmpty()) {
            item {
                NxEmptyState(
                    title = "Sin cotizaciones",
                    subtitle = if (state.query.isNotBlank() || state.statusFilter != "todos") {
                        "No hay coincidencias con los filtros actuales. Ajusta la búsqueda o el estado."
                    } else {
                        "Crea tu primera cotización con el botón Cotizar en la esquina inferior."
                    },
                )
            }
        } else {
            item { NxSectionHeader("Resultados", "${items.size} cotizaciones") }
            items(items, key = { it.id }) { cot ->
                NxPanelShell(onClick = { selected = cot }, contentPadding = PaddingValues(0.dp)) {
                    CotizacionRowContent(cot)
                }
            }
        }
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
    NxPanelShell(onClick = onClick, contentPadding = PaddingValues(0.dp)) {
        CotizacionRowContent(cot)
    }
}

@Composable
private fun CotizacionRowContent(cot: CotizacionDto) {
    val color = cotStatusColorAndroid(cot.estatus)
    Row(Modifier.fillMaxWidth()) {
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
                ) { Text(cot.estatus?.let { cotStatusLabel(it) } ?: "–", color = color, fontSize = 11.sp, fontWeight = FontWeight.Bold) }
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
    val isRefreshing: Boolean = false,
    val items: List<CrmLeadDto> = emptyList(),
    val query: String = "",
)

class VentasLeadsViewModel(app: Application) : AndroidViewModel(app) {
    private val repo = ExtraRepository(app.applicationContext)
    private val _state = MutableStateFlow(VentasLeadsUiState())
    val state: StateFlow<VentasLeadsUiState> = _state

    init { load() }

    fun load(refresh: Boolean = false) {
        viewModelScope.launch {
            _state.update {
                if (refresh) it.copy(isRefreshing = true) else it.copy(isLoading = true)
            }
            val items = withContext(Dispatchers.IO) { repo.clientTicketLeadDtos() }
            _state.update { it.copy(isLoading = false, isRefreshing = false, items = items) }
        }
    }

    fun setQuery(q: String) { _state.update { it.copy(query = q) } }

    val filtered: List<CrmLeadDto> get() {
        val s = _state.value
        if (s.query.isBlank()) return s.items
        val q = s.query.lowercase()
        return s.items.filter { t ->
            t.displayTitle.lowercase().contains(q) ||
            t.clientName.lowercase().contains(q) ||
            t.branchName.lowercase().contains(q) ||
            t.status.lowercase().contains(q) ||
            t.description.lowercase().contains(q)
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
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
    var selected by remember { mutableStateOf<CrmLeadDto?>(null) }

    if (selected != null) {
        val lead = selected!!
        val status = lead.status
        val color  = cotStatusColorAndroid(status)
        val raw = lead.raw
        LazyColumn(Modifier.fillMaxSize(), contentPadding = PaddingValues(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
            item {
                Row(Modifier.fillMaxWidth(), Arrangement.SpaceBetween, Alignment.CenterVertically) {
                    OutlinedButton(onClick = { selected = null }) { Text("← Leads") }
                    if (status.isNotBlank()) Text(status.replaceFirstChar { it.uppercase() }, color = color, fontWeight = FontWeight.SemiBold)
                }
            }
            item { Text(lead.displayTitle, style = MaterialTheme.typography.titleLarge, fontWeight = FontWeight.Bold) }
            item {
                Card(Modifier.fillMaxWidth()) {
                    Column(Modifier.padding(14.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                        LeadDetailLine("Cliente", lead.clientName.ifBlank { lead.branchName })
                        LeadDetailLine("Email", lStr(raw, "email", "correo"))
                        LeadDetailLine("Teléfono", lStr(raw, "phone", "telefono"))
                        LeadDetailLine("Origen", lStr(raw, "source", "origen", "fuente"))
                        LeadDetailLine("Asignado a", lStr(raw, "ownerName", "assignedTo"))
                        LeadDetailLine("Estado", status)
                        LeadDetailLine("Fecha", lStr(raw, "createdAt", "fecha").take(10))
                        val notes = lead.description.ifBlank { lStr(raw, "notes", "notas") }
                        if (notes.isNotBlank()) { HorizontalDivider(); Text(notes, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant) }
                    }
                }
            }
        }
        return
    }

    PullToRefreshBox(
        isRefreshing = state.isRefreshing,
        onRefresh = { vm.load(refresh = true) },
        modifier = Modifier.fillMaxSize(),
    ) {
    LazyColumn(
        modifier = Modifier.fillMaxSize().background(NxColors.Surface),
        contentPadding = PaddingValues(12.dp),
        verticalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        item { NxSectionHeader("Leads", "${state.items.size} registrados") }
        item {
            NxSearchField(
                value = state.query,
                onValueChange = vm::setQuery,
                placeholder = "Buscar lead…",
            )
        }

        if (state.isLoading && !state.isRefreshing) {
            item { NxLoadingBlock("Cargando leads…") }
        } else if (items.isEmpty()) {
            item {
                NxEmptyState(
                    title = "Sin leads",
                    subtitle = if (state.query.isNotBlank()) {
                        "No hay coincidencias para \"${state.query}\". Prueba otro término o limpia el filtro."
                    } else {
                        "Los leads de tickets y solicitudes aparecerán aquí al sincronizarse."
                    },
                )
            }
        } else {
            items(items, key = { it.rowKey }) { lead ->
                NxPanelShell(onClick = { selected = lead }, contentPadding = PaddingValues(0.dp)) {
                    LeadRowContent(lead)
                }
            }
        }
    }
    }
}

@Composable
private fun LeadRowContent(lead: CrmLeadDto) {
    val description = lead.displayTitle
    val branch      = lead.branchName.ifBlank { lead.clientName }
    val status      = lead.status
    val date        = lStr(lead.raw, "createdAt", "fecha").take(10)
    val color = cotStatusColorAndroid(status)
    Row(
        Modifier.fillMaxWidth().padding(12.dp),
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
    var searchQuery by remember { mutableStateOf("") }
    val normalizedQuery = searchQuery.trim()
    val filteredGroups = remember(groups, normalizedQuery) {
        if (normalizedQuery.isBlank()) groups
        else groups.mapNotNull { group ->
            val mods = group.modules.filter { m ->
                m.label.contains(normalizedQuery, ignoreCase = true) ||
                    m.key.contains(normalizedQuery, ignoreCase = true)
            }
            if (mods.isEmpty()) null else group.copy(modules = mods)
        }
    }

    LazyColumn(contentPadding = PaddingValues(16.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
        item {
            NxSearchField(
                value = searchQuery,
                onValueChange = { searchQuery = it },
                placeholder = "Buscar módulo…",
            )
            Spacer(Modifier.height(8.dp))
        }
        if (filteredGroups.isNotEmpty()) {
            filteredGroups.forEach { group ->
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
        } else if (normalizedQuery.isNotBlank()) {
            item {
                NxEmptyState(
                    title = "Sin resultados",
                    subtitle = "Prueba con otro término o revisa el nombre del módulo.",
                )
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
        Modifier
            .fillMaxWidth()
            .heightIn(min = 48.dp)
            .clip(RoundedCornerShape(10.dp))
            .clickable(onClick = onClick)
            .semantics {
                contentDescription = label
                role = Role.Button
            }
            .background(MaterialTheme.colorScheme.surface)
            .padding(horizontal = 14.dp, vertical = 12.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(14.dp),
    ) {
        Text(icon, fontSize = 18.sp)
        Text(label, Modifier.weight(1f), fontWeight = FontWeight.Normal, fontSize = 14.sp)
        Icon(
            Icons.Default.ChevronRight,
            contentDescription = null,
            modifier = Modifier.size(18.dp),
        )
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

