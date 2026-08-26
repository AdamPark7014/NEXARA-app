package mx.nexara.mobile.nativeapp.ui.console

import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.Assignment
import androidx.compose.material.icons.filled.Folder
import androidx.compose.material.icons.filled.Home
import androidx.compose.material.icons.filled.Map
import androidx.compose.material.icons.filled.Menu
import androidx.compose.material.icons.filled.PhotoCamera
import androidx.compose.material.icons.filled.Schedule
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.material3.MaterialTheme
import mx.nexara.mobile.nativeapp.ui.enterprise.NxBottomTab
import mx.nexara.mobile.nativeapp.ui.enterprise.NxBottomTabBar
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.unit.dp
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.FilledTonalButton
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.navigation.NavDestination.Companion.hierarchy
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.currentBackStackEntryAsState
import androidx.navigation.compose.rememberNavController
import mx.nexara.mobile.nativeapp.ui.enterprise.NxNavAnimStyle
import mx.nexara.mobile.nativeapp.ui.enterprise.nxComposable
import mx.nexara.mobile.nativeapp.data.AuthRepository
import mx.nexara.mobile.nativeapp.ui.console.activities.ConsoleActivityDetailByIdScreen
import mx.nexara.mobile.nativeapp.ui.console.screens.ConsoleActivitiesScreen
import mx.nexara.mobile.nativeapp.ui.console.screens.OpsNewActivityScreen
import mx.nexara.mobile.nativeapp.ui.console.screens.ConsoleAttendanceScreen
import mx.nexara.mobile.nativeapp.ui.console.screens.ConsoleClientsScreen
import mx.nexara.mobile.nativeapp.ui.console.screens.ConsoleDashboardScreen
import mx.nexara.mobile.nativeapp.ui.console.screens.ConsoleEvidencesScreen
import mx.nexara.mobile.nativeapp.ui.console.screens.ConsoleGpsScreen
import mx.nexara.mobile.nativeapp.ui.console.screens.ConsoleProjectsScreen
import mx.nexara.mobile.nativeapp.ui.console.screens.ConsoleToolInventoryScreen
import mx.nexara.mobile.nativeapp.ui.console.screens.ConsoleToolMyKitScreen
import mx.nexara.mobile.nativeapp.ui.console.screens.ConsoleToolRenewalsScreen
import mx.nexara.mobile.nativeapp.ui.console.screens.ConsoleToolsScreen
import mx.nexara.mobile.nativeapp.ui.console.screens.ConsoleToolsKitsUsersScreen
import mx.nexara.mobile.nativeapp.ui.console.screens.ConsoleSettingsScreen
import mx.nexara.mobile.nativeapp.ui.console.screens.ConsoleUsersScreen
import mx.nexara.mobile.nativeapp.ui.console.screens.ConsoleViaticsScreen
import mx.nexara.mobile.nativeapp.ui.console.screens.ConsoleVehiclesScreen
import mx.nexara.mobile.nativeapp.ui.console.screens.ConsoleMoreScreen
import mx.nexara.mobile.nativeapp.ui.console.screens.MyProfileScreen
import mx.nexara.mobile.nativeapp.ui.console.screens.PlaceholderScreen
import mx.nexara.mobile.nativeapp.access.ModulePanelMap
import mx.nexara.mobile.nativeapp.access.DeepLinkNavigation
import mx.nexara.mobile.nativeapp.access.PanelId
import mx.nexara.mobile.nativeapp.navigation.PendingDeepLink
import mx.nexara.mobile.nativeapp.ui.catalog.ModuleCatalog
import mx.nexara.mobile.nativeapp.ui.enterprise.NxTealTopAppBarColors
import mx.nexara.mobile.nativeapp.ui.contabilidad.ContabilidadNavHost

private object ConsoleRoutes {
    const val Dashboard = "console/dashboard"
    const val Activities = "console/activities"
    const val MyActivities = "console/my-activities"
    const val Evidences = "console/evidences"
    const val MyEvidences = "console/my-evidences"
    const val Viatics = "console/viatics"
    const val Vehicles = "console/vehicles"
    const val Gps = "console/gps"
    const val Tools = "console/tools"
    const val ToolsInventory = "console/tools/inventory"
    const val ToolsMyKit = "console/tools/my-kit"
    const val ToolsKitsUsers = "console/tools/kits-users"
    const val ToolsRenewals = "console/tools/renewals"
    const val Clients = "console/clients"
    const val Projects = "console/projects"
    const val Users = "console/users"
    const val Attendance = "console/attendance"
    const val Settings = "console/settings"
    const val OfflineQueue = "console/offline-queue"
    const val More = "console/more"
    const val MyProfile = "console/my-profile"
    const val ActivityDetail = "console/activity/{id}?tab={tab}"
    const val NewActivity = "console/activities/new?requestId={requestId}"
    const val ModulePattern = "console/m/{key}"
    fun module(key: String) = "console/m/$key"
}

data class ConsoleNavItem(
    val route: String,
    val label: String,
    val icon: ImageVector,
)

private fun routeForModuleKey(key: String): String {
    return when (key) {
        "dashboard" -> ConsoleRoutes.Dashboard
        "activities" -> ConsoleRoutes.Activities
        "my-activities" -> ConsoleRoutes.MyActivities
        "evidences" -> ConsoleRoutes.Evidences
        "my-evidences" -> ConsoleRoutes.MyEvidences
        "viatics" -> ConsoleRoutes.Viatics
        "vehicles" -> ConsoleRoutes.Vehicles
        "gps" -> ConsoleRoutes.Gps
        "tools" -> ConsoleRoutes.Tools
        "clients" -> ConsoleRoutes.Clients
        "projects" -> ConsoleRoutes.Projects
        "users" -> ConsoleRoutes.Users
        "attendance" -> ConsoleRoutes.Attendance
        "settings" -> ConsoleRoutes.Settings
        "offline-queue", "offline" -> ConsoleRoutes.OfflineQueue
        "my-profile" -> ConsoleRoutes.MyProfile
        else -> ConsoleRoutes.module(key)
    }
}

@Composable
@OptIn(ExperimentalMaterial3Api::class)
fun ConsoleNavHost(
    onExitToPanels: () -> Unit,
    onLogout: () -> Unit = onExitToPanels,
    panelId: PanelId = PanelId.ERP,
) {
    val context = LocalContext.current
    val authRepo = remember(context) { AuthRepository(context) }
    var showLogoutDialog by remember { mutableStateOf(false) }
    val user = authRepo.loadSession()
    val roleLower = (user?.role ?: "").lowercase()
    val isSuperAdmin = user?.isSuperAdmin == true
    val isAdmin = !isSuperAdmin && (user?.permissions ?: emptyList()).contains("console.admin")
    val isIngeniero = !isSuperAdmin && !isAdmin && roleLower.contains("ingenier")
    val isAdministrativo = user?.isAdministrativoRole() == true
    val canFinance = isSuperAdmin
        || (user?.permissions ?: emptyList()).any { it.contains("contabilidad", ignoreCase = true) }
        || roleLower.contains("contab")
    var showContabilidad by remember { mutableStateOf(false) }
    val navController = rememberNavController()
    var chatChannelId by remember { mutableStateOf<Long?>(null) }
    var chatMessageId by remember { mutableStateOf<Long?>(null) }
    var viaticHighlightId by remember { mutableStateOf<Long?>(null) }

    val deepLinkSignal by PendingDeepLink.signal.collectAsState()
    LaunchedEffect(panelId, deepLinkSignal) {
        val link = PendingDeepLink.consumeModuleDestination(panelId) ?: return@LaunchedEffect
        if (link.key == "chat") {
            chatChannelId = DeepLinkNavigation.chatChannelId(link)
            chatMessageId = DeepLinkNavigation.chatMessageId(link)
        }
        viaticHighlightId = DeepLinkNavigation.viaticHighlightId(link)
        val entityRoute = DeepLinkNavigation.consoleRoute(link)
        val target = entityRoute ?: routeForModuleKey(DeepLinkNavigation.consoleModuleKey(link))
        navController.navigate(target) { launchSingleTop = true }
    }

    if (showContabilidad) {
        ContabilidadNavHost(onExitToPanels = { showContabilidad = false })
        return
    }

    val panelKeys = remember(panelId) { ModulePanelMap.consoleKeysFor(panelId) }

    val visibleModules = remember(user, panelKeys) {
        ModuleCatalog.console.filter { module ->
            canAccessConsoleModule(user, module) &&
                (panelKeys == null || module.key in panelKeys)
        }
    }
    val visibleRoutes = remember(visibleModules) {
        visibleModules.map { routeForModuleKey(it.key) }.toSet()
    }
    val sidebarGroups = remember(user, panelId) { consoleSidebarGroupsForMore(user, panelId) }
    val panelTitle = panelId.displayName

    // Máximo 5 tabs: módulos principales visibles + "Más".
    val items = remember(isIngeniero, isAdministrativo, isSuperAdmin, isAdmin, visibleRoutes) {
        fun isVisible(route: String) = visibleRoutes.contains(route)

        buildList {
            if (isVisible(ConsoleRoutes.Dashboard)) {
                add(ConsoleNavItem(ConsoleRoutes.Dashboard, "Inicio", Icons.Default.Home))
            }

            if (isAdministrativo) {
                if (isVisible(ConsoleRoutes.Attendance)) {
                    add(ConsoleNavItem(ConsoleRoutes.Attendance, "Asistencia", Icons.Default.Schedule))
                }
            } else if (isSuperAdmin || isAdmin) {
                if (isVisible(ConsoleRoutes.Activities)) add(ConsoleNavItem(ConsoleRoutes.Activities, "Operación", Icons.Default.Folder))
                if (isVisible(ConsoleRoutes.Evidences)) add(ConsoleNavItem(ConsoleRoutes.Evidences, "Evidencias", Icons.Default.PhotoCamera))
                if (isVisible(ConsoleRoutes.Attendance)) add(ConsoleNavItem(ConsoleRoutes.Attendance, "Asistencia", Icons.Default.Schedule))
            } else if (isIngeniero) {
                if (isVisible(ConsoleRoutes.MyActivities)) add(ConsoleNavItem(ConsoleRoutes.MyActivities, "Mis act.", Icons.Default.Assignment))
                if (isVisible(ConsoleRoutes.MyEvidences)) add(ConsoleNavItem(ConsoleRoutes.MyEvidences, "Mis evid.", Icons.Default.PhotoCamera))
                if (isVisible(ConsoleRoutes.Attendance)) {
                    add(ConsoleNavItem(ConsoleRoutes.Attendance, "Asistencia", Icons.Default.Schedule))
                } else if (isVisible(ConsoleRoutes.Gps)) {
                    add(ConsoleNavItem(ConsoleRoutes.Gps, "GPS", Icons.Default.Map))
                }
            } else {
                if (isVisible(ConsoleRoutes.MyActivities)) add(ConsoleNavItem(ConsoleRoutes.MyActivities, "Mis act.", Icons.Default.Assignment))
                if (isVisible(ConsoleRoutes.MyEvidences)) add(ConsoleNavItem(ConsoleRoutes.MyEvidences, "Mis evid.", Icons.Default.PhotoCamera))
                if (isVisible(ConsoleRoutes.Attendance)) {
                    add(ConsoleNavItem(ConsoleRoutes.Attendance, "Asistencia", Icons.Default.Schedule))
                } else if (isVisible(ConsoleRoutes.Gps)) {
                    add(ConsoleNavItem(ConsoleRoutes.Gps, "GPS", Icons.Default.Map))
                }
            }

            if (isEmpty()) {
                add(ConsoleNavItem(ConsoleRoutes.Dashboard, "Inicio", Icons.Default.Home))
            }
            add(ConsoleNavItem(ConsoleRoutes.More, "Más", Icons.Default.Menu))
        }
    }
    val startRoute = remember(items) {
        items.firstOrNull { it.route != ConsoleRoutes.More }?.route ?: ConsoleRoutes.More
    }

    val backStackEntry by navController.currentBackStackEntryAsState()
    val currentDestination = backStackEntry?.destination
    val currentTitle = remember(currentDestination?.route) {
        when (currentDestination?.route) {
            ConsoleRoutes.Dashboard -> "Resumen ejecutivo"
            ConsoleRoutes.Activities -> "Operación de actividades"
            ConsoleRoutes.MyActivities -> "Mis actividades"
            ConsoleRoutes.Evidences -> "Evidencias"
            ConsoleRoutes.MyEvidences -> "Mis evidencias"
            ConsoleRoutes.Viatics -> "Viáticos"
            ConsoleRoutes.Vehicles -> "Vehículos"
            ConsoleRoutes.Gps -> "GPS"
            ConsoleRoutes.Tools -> "Herramientas"
            ConsoleRoutes.Users -> "Gestión de usuarios"
            ConsoleRoutes.Attendance -> "Asistencia y jornadas"
            ConsoleRoutes.Settings -> "Ajustes del sistema"
            ConsoleRoutes.OfflineQueue -> "Cola offline"
            ConsoleRoutes.More -> "Todos los módulos"
            ConsoleRoutes.MyProfile -> "Mi perfil"
            ConsoleRoutes.ToolsInventory -> "Inventario de herramientas"
            ConsoleRoutes.ToolsMyKit -> "Mi kit"
            ConsoleRoutes.ToolsKitsUsers -> "Kits y usuarios"
            ConsoleRoutes.ToolsRenewals -> "Renovaciones"
            ConsoleRoutes.Clients -> "Clientes"
            ConsoleRoutes.Projects -> "Proyectos"
            ConsoleRoutes.ActivityDetail -> "Detalle de actividad"
            ConsoleRoutes.ModulePattern -> {
                val key = backStackEntry?.arguments?.getString("key").orEmpty()
                ModuleCatalog.console.firstOrNull { it.key == key }?.label ?: "Módulo"
            }
            else -> "NEXARA"
        }
    }

    val tabRoutes = remember(items) { items.map { it.route }.toSet() }
    val showBack = currentDestination?.route != null && currentDestination.route !in tabRoutes

    Scaffold(
        topBar = {
            TopAppBar(
                title = {
                    Text(
                        currentTitle,
                        style = MaterialTheme.typography.titleMedium.copy(fontWeight = FontWeight.SemiBold),
                        color = Color.White,
                    )
                },
                colors = NxTealTopAppBarColors(),
                navigationIcon = {
                    if (showBack) {
                        IconButton(onClick = { navController.popBackStack() }) {
                            Icon(
                                Icons.AutoMirrored.Filled.ArrowBack,
                                contentDescription = "Volver",
                                tint = Color.White,
                            )
                        }
                    }
                },
                actions = {
                    FilledTonalButton(
                        onClick = { showLogoutDialog = true },
                        colors = ButtonDefaults.filledTonalButtonColors(
                            containerColor = Color(0xFFFFE4E6),
                            contentColor = Color(0xFFDC2626),
                        ),
                        contentPadding = androidx.compose.foundation.layout.PaddingValues(horizontal = 12.dp, vertical = 0.dp),
                        modifier = androidx.compose.ui.Modifier
                            .padding(end = 8.dp)
                            .heightIn(min = 48.dp),
                    ) {
                        Text("Salir", style = MaterialTheme.typography.labelMedium.copy(fontWeight = FontWeight.Bold))
                    }
                }
            )
        },
        bottomBar = {
            NxBottomTabBar(
                tabs = items.map { NxBottomTab(it.route, it.icon, it.label) },
                isSelected = { route ->
                    currentDestination?.hierarchy?.any { it.route == route } == true
                },
                onTabSelected = { route ->
                    navController.navigate(route) { launchSingleTop = true }
                },
            )
        }
    ) { inner ->
        NavHost(
            navController = navController,
            startDestination = startRoute,
            modifier = Modifier.padding(inner),
        ) {
            nxComposable(ConsoleRoutes.Dashboard) {
                ConsoleDashboardScreen(
                    isOps = panelId == PanelId.OPS,
                    onOpenModule = { key ->
                        navController.navigate(routeForModuleKey(key)) { launchSingleTop = true }
                    },
                )
            }
            nxComposable(ConsoleRoutes.Activities) {
                ConsoleActivitiesScreen(
                    title = "Actividades",
                    onNewOt = { navController.navigate("console/activities/new?requestId=-1") { launchSingleTop = true } },
                )
            }
            nxComposable(ConsoleRoutes.NewActivity, style = NxNavAnimStyle.Modal) { entry ->
                val rid = entry.arguments?.getString("requestId")?.toLongOrNull()
                OpsNewActivityScreen(
                    requestId = if (rid != null && rid > 0) rid else null,
                    onBack = { navController.popBackStack() },
                    onCreated = { id ->
                        navController.navigate("console/activity/$id") { launchSingleTop = true }
                    },
                )
            }
            nxComposable(ConsoleRoutes.MyActivities) {
                // My-activities route: shows only personal section (non-admin users)
                ConsoleActivitiesScreen(title = "Mis actividades")
            }
            nxComposable(ConsoleRoutes.Evidences) {
                // Combined view: admins see team review + personal; normal users see only personal
                ConsoleEvidencesScreen(mode = "combined")
            }
            nxComposable(ConsoleRoutes.MyEvidences) {
                // Dedicated personal evidences route
                ConsoleEvidencesScreen(mode = "user")
            }
            nxComposable(ConsoleRoutes.Viatics) {
                ConsoleViaticsScreen(initialHighlightId = viaticHighlightId)
            }
            nxComposable(ConsoleRoutes.Vehicles) {
                ConsoleVehiclesScreen()
            }
            nxComposable(ConsoleRoutes.Gps) {
                ConsoleGpsScreen()
            }
            nxComposable(ConsoleRoutes.Tools) {
                ConsoleToolsScreen(
                    onOpenInventory = { navController.navigate(ConsoleRoutes.ToolsInventory) { launchSingleTop = true } },
                    onOpenMyKit = { navController.navigate(ConsoleRoutes.ToolsMyKit) { launchSingleTop = true } },
                    onOpenKitsUsers = { navController.navigate(ConsoleRoutes.ToolsKitsUsers) { launchSingleTop = true } },
                    onOpenRenewals = { navController.navigate(ConsoleRoutes.ToolsRenewals) { launchSingleTop = true } },
                )
            }
            nxComposable(ConsoleRoutes.ToolsInventory, style = NxNavAnimStyle.Push) {
                ConsoleToolInventoryScreen(onBack = { navController.popBackStack() })
            }
            nxComposable(ConsoleRoutes.ToolsMyKit, style = NxNavAnimStyle.Push) {
                ConsoleToolMyKitScreen(onBack = { navController.popBackStack() })
            }
            nxComposable(ConsoleRoutes.ToolsRenewals, style = NxNavAnimStyle.Push) {
                ConsoleToolRenewalsScreen(onBack = { navController.popBackStack() })
            }
            nxComposable(ConsoleRoutes.ToolsKitsUsers, style = NxNavAnimStyle.Push) {
                ConsoleToolsKitsUsersScreen(onBack = { navController.popBackStack() })
            }
            nxComposable(ConsoleRoutes.Clients) {
                ConsoleClientsScreen()
            }
            nxComposable(ConsoleRoutes.Projects) {
                ConsoleProjectsScreen()
            }
            nxComposable(ConsoleRoutes.Users) {
                ConsoleUsersScreen()
            }
            nxComposable(ConsoleRoutes.Attendance) {
                ConsoleAttendanceScreen()
            }
            nxComposable(ConsoleRoutes.Settings) {
                ConsoleSettingsScreen(
                    onExitToPanels = onExitToPanels,
                    onOpenOfflineQueue = {
                        navController.navigate(ConsoleRoutes.OfflineQueue) { launchSingleTop = true }
                    },
                )
            }
            nxComposable(ConsoleRoutes.OfflineQueue) {
                mx.nexara.mobile.nativeapp.ui.shared.OfflineQueueScreen()
            }
            nxComposable(ConsoleRoutes.More) {
                ConsoleMoreScreen(
                    modules = visibleModules,
                    groups = sidebarGroups,
                    userName = user?.nombre,
                    userEmail = user?.email,
                    userRoleLabel = if (user?.isSuperAdmin == true) "Super Administrador" else user?.role,
                    userAvatarUrl = user?.avatarUrl,
                    isSuperAdmin = user?.isSuperAdmin == true,
                    showContabilidadHub = canFinance,
                    onOpenContabilidad = { showContabilidad = true },
                    onOpenOfflineQueue = {
                        navController.navigate(ConsoleRoutes.OfflineQueue) { launchSingleTop = true }
                    },
                    onOpenModule = { m ->
                        val target = routeForModuleKey(m.key)
                        navController.navigate(target) { launchSingleTop = true }
                    },
                    onExitToPanels = onExitToPanels,
                    onLogout = { showLogoutDialog = true },
                )
            }
            nxComposable(ConsoleRoutes.MyProfile) {
                MyProfileScreen(
                    onOpenOfflineQueue = {
                        navController.navigate(ConsoleRoutes.OfflineQueue) { launchSingleTop = true }
                    },
                )
            }
            nxComposable(ConsoleRoutes.ActivityDetail, style = NxNavAnimStyle.Push) { entry ->
                val id = entry.arguments?.getString("id")?.toLongOrNull() ?: return@nxComposable
                val tab = entry.arguments?.getString("tab").orEmpty().ifBlank { null }
                ConsoleActivityDetailByIdScreen(
                    activityId = id,
                    onBack = { navController.popBackStack() },
                    initialTabKey = tab,
                    onOpenGps = {
                        navController.navigate(ConsoleRoutes.Gps) { launchSingleTop = true }
                    },
                )
            }
            nxComposable(ConsoleRoutes.ModulePattern, style = NxNavAnimStyle.Push) { backStack ->
                val key = backStack.arguments?.getString("key").orEmpty()
                val m = ModuleCatalog.console.firstOrNull { it.key == key }
                // Despachar a pantallas nativas ya implementadas para este módulo.
                val handled: @androidx.compose.runtime.Composable () -> Unit = when (key) {
                    "dashboard" -> { {
                        ConsoleDashboardScreen(
                            isOps = panelId == PanelId.OPS,
                            onOpenModule = { k ->
                                navController.navigate(routeForModuleKey(k)) { launchSingleTop = true }
                            },
                        )
                    } }
                    "activities" -> { { ConsoleActivitiesScreen(title = "Actividades") } }
                    "my-activities" -> { { ConsoleActivitiesScreen(title = "Mis actividades") } }
                    "evidences" -> { { ConsoleEvidencesScreen(mode = "combined") } }
                    "my-evidences" -> { { ConsoleEvidencesScreen(mode = "user") } }
                    "viatics" -> { { ConsoleViaticsScreen(initialHighlightId = viaticHighlightId) } }
                    "vehicles" -> { { ConsoleVehiclesScreen() } }
                    "gps" -> { { ConsoleGpsScreen() } }
                    "tools" -> { {
                        ConsoleToolsScreen(
                            onOpenInventory = { navController.navigate(ConsoleRoutes.ToolsInventory) { launchSingleTop = true } },
                            onOpenMyKit = { navController.navigate(ConsoleRoutes.ToolsMyKit) { launchSingleTop = true } },
                            onOpenKitsUsers = { navController.navigate(ConsoleRoutes.ToolsKitsUsers) { launchSingleTop = true } },
                            onOpenRenewals = { navController.navigate(ConsoleRoutes.ToolsRenewals) { launchSingleTop = true } },
                        )
                    } }
                    "clients" -> { { ConsoleClientsScreen() } }
                    "projects" -> { { ConsoleProjectsScreen() } }
                    "users" -> { { ConsoleUsersScreen() } }
                    "attendance" -> { { ConsoleAttendanceScreen() } }
                    "settings" -> { {
                        ConsoleSettingsScreen(
                            onExitToPanels = onExitToPanels,
                            onOpenOfflineQueue = {
                                navController.navigate(ConsoleRoutes.OfflineQueue) { launchSingleTop = true }
                            },
                        )
                    } }
                    "offline-queue", "offline" -> { { mx.nexara.mobile.nativeapp.ui.shared.OfflineQueueScreen() } }
                    "my-profile" -> { {
                        MyProfileScreen(
                            onOpenOfflineQueue = {
                                navController.navigate(ConsoleRoutes.OfflineQueue) { launchSingleTop = true }
                            },
                        )
                    } }
                    "news" -> { { mx.nexara.mobile.nativeapp.ui.modules.NewsModuleScreen() } }
                    "contact-messages" -> { { mx.nexara.mobile.nativeapp.ui.modules.ContactMessagesModuleScreen() } }
                    "newsletter" -> { { mx.nexara.mobile.nativeapp.ui.modules.NewsletterModuleScreen() } }
                    "audit" -> { { mx.nexara.mobile.nativeapp.ui.modules.AuditModuleScreen() } }
                    "analytics", "bi" -> { { mx.nexara.mobile.nativeapp.ui.console.screens.ErpBiScreen() } }
                    "executive" -> { {
                        mx.nexara.mobile.nativeapp.ui.console.screens.ExecutiveScreen(
                            onOpenModule = { k ->
                                navController.navigate(routeForModuleKey(k)) { launchSingleTop = true }
                            },
                        )
                    } }
                    "dispatch" -> { {
                        mx.nexara.mobile.nativeapp.ui.console.screens.ConsoleDispatchScreen(
                            onOpenActivity = { id ->
                                navController.navigate("console/activity/$id") { launchSingleTop = true }
                            },
                        )
                    } }
                    "approvals" -> { { mx.nexara.mobile.nativeapp.ui.console.screens.ApprovalsScreen() } }
                    "notifications-center" -> { {
                        mx.nexara.mobile.nativeapp.ui.shared.NotificationsScreen(
                            onBack = { navController.popBackStack() },
                            onOpenDestination = { dest ->
                                when (dest) {
                                    is mx.nexara.mobile.nativeapp.access.DeepLinkDestination.Module -> {
                                        if (dest.panel == panelId) {
                                            navController.navigate(routeForModuleKey(dest.key)) { launchSingleTop = true }
                                        } else {
                                            PendingDeepLink.destination = dest
                                            onExitToPanels()
                                        }
                                    }
                                    else -> Unit
                                }
                            },
                        )
                    } }
                    "chat" -> { {
                        mx.nexara.mobile.nativeapp.ui.chat.ChatScreen(
                            onBack = { navController.popBackStack() },
                            initialChannelId = chatChannelId,
                            initialMessageId = chatMessageId,
                        )
                    } }
                    "noc" -> { { mx.nexara.mobile.nativeapp.ui.console.screens.NocModuleScreen() } }
                    "support-sla" -> { { mx.nexara.mobile.nativeapp.ui.console.screens.SlaModuleScreen() } }
                    "support" -> { { mx.nexara.mobile.nativeapp.ui.console.screens.ClientTicketsModuleScreen() } }
                    "maintenance-contracts" -> { { mx.nexara.mobile.nativeapp.ui.console.screens.MaintenanceContractsScreen() } }
                    "companies" -> { { mx.nexara.mobile.nativeapp.ui.console.screens.CompaniesScreen() } }
                    "kb" -> { { mx.nexara.mobile.nativeapp.ui.console.screens.KbScreen() } }
                    "exports" -> { { mx.nexara.mobile.nativeapp.ui.console.screens.ExportsScreen() } }
                    "architecture" -> { { mx.nexara.mobile.nativeapp.ui.console.screens.ArchitectureScreen() } }
                    "calendar" -> { { mx.nexara.mobile.nativeapp.ui.console.screens.ErpCalendarScreen() } }
                    "orgchart" -> { { mx.nexara.mobile.nativeapp.ui.console.screens.OrgchartScreen() } }
                    "kpis-hr" -> { { mx.nexara.mobile.nativeapp.ui.console.screens.HrKpisScreen() } }
                    "expenses" -> { { mx.nexara.mobile.nativeapp.ui.console.screens.ExpensesRichScreen() } }
                    "fines" -> { { mx.nexara.mobile.nativeapp.ui.console.screens.FinesRichScreen() } }
                    "employee-payments" -> { { mx.nexara.mobile.nativeapp.ui.console.screens.EmployeePaymentsRichScreen() } }
                    "cotizaciones" -> { { mx.nexara.mobile.nativeapp.ui.modules.CotizacionesModuleScreen() } }
                    "lunch-breaks" -> { { mx.nexara.mobile.nativeapp.ui.modules.LunchBreaksModuleScreen() } }
                    "my-lunch-breaks" -> { { mx.nexara.mobile.nativeapp.ui.modules.MyLunchBreaksModuleScreen(
                        currentUserId = authRepo.loadSession()?.id,
                    ) } }
                    "documents" -> { { mx.nexara.mobile.nativeapp.ui.console.screens.DocumentsRichScreen() } }
                    "accounting" -> { { mx.nexara.mobile.nativeapp.ui.console.screens.AccountingRichScreen() } }
                    "invoicing" -> { { mx.nexara.mobile.nativeapp.ui.console.screens.InvoicesRichScreen() } }
                    "banking" -> { { mx.nexara.mobile.nativeapp.ui.console.screens.BankingRichScreen() } }
                    "my-viatics" -> { { mx.nexara.mobile.nativeapp.ui.modules.MyViaticsScreen() } }
                    "my-vehicles" -> { { mx.nexara.mobile.nativeapp.ui.modules.MyVehiclesScreen() } }
                    "my-preferences" -> { {
                        mx.nexara.mobile.nativeapp.ui.modules.MyPreferencesScreen(
                            onOpenOfflineQueue = {
                                navController.navigate(ConsoleRoutes.OfflineQueue) { launchSingleTop = true }
                            },
                        )
                    } }
                    "work-projects" -> { { mx.nexara.mobile.nativeapp.ui.console.screens.WorkProjectsRichScreen() } }
                    "hr" -> { { mx.nexara.mobile.nativeapp.ui.console.screens.HrLeavesScreen() } }
                    "warehouse" -> { { mx.nexara.mobile.nativeapp.ui.console.screens.WarehouseHubScreen(initialTab = 1) } }
                    "stock" -> { { mx.nexara.mobile.nativeapp.ui.console.screens.WarehouseHubScreen(initialTab = 0) } }
                    "procurement" -> { { mx.nexara.mobile.nativeapp.ui.console.screens.ProcurementModuleScreen() } }
                    "maintenance" -> { { mx.nexara.mobile.nativeapp.ui.console.screens.MaintenanceModuleScreen(initialTab = 0) } }
                    "assets" -> { { mx.nexara.mobile.nativeapp.ui.console.screens.MaintenanceModuleScreen(initialTab = 1) } }
                    "service-sheets" -> { { mx.nexara.mobile.nativeapp.ui.console.screens.ServiceSheetsModuleScreen() } }
                    "cvs" -> { { mx.nexara.mobile.nativeapp.ui.console.screens.CvsRichScreen() } }
                    "recruiting" -> { { mx.nexara.mobile.nativeapp.ui.console.screens.RecruitingScreen() } }
                    "service-clients" -> { { mx.nexara.mobile.nativeapp.ui.console.screens.ConsoleClientsScreen() } }
                    "client-tickets" -> { { mx.nexara.mobile.nativeapp.ui.console.screens.ClientTicketsModuleScreen() } }
                    "gestion-vendedores" -> { { mx.nexara.mobile.nativeapp.ui.ventas.VentasSalesTeamScreen() } }
                    else -> { {} }
                }
                if (key in setOf(
                        "dashboard", "activities", "my-activities", "evidences", "my-evidences",
                        "viatics", "vehicles", "gps", "tools", "clients", "projects", "users",
                        "attendance", "settings", "offline-queue", "offline", "my-profile",
                        "news","contact-messages","newsletter","audit","analytics","bi","executive","dispatch","approvals",
                        "notifications-center","chat","noc","support-sla","support","maintenance-contracts",
                        "companies","kb","exports","architecture","calendar","orgchart","kpis-hr",
                        "expenses",
                        "fines","employee-payments","cotizaciones","lunch-breaks","my-lunch-breaks",
                        "documents","accounting","invoicing","banking","my-viatics",
                        "my-vehicles","my-preferences","work-projects",
                        "hr","warehouse","stock","procurement",
                        "maintenance","assets","service-sheets","cvs","recruiting","client-tickets","service-clients",
                        "gestion-vendedores",
                    )) {
                    handled()
                    return@nxComposable
                }
                PlaceholderScreen(
                    title = m?.label ?: "Módulo",
                    moduleKey = key,
                    webPath = m?.webPath,
                    icon = m?.icon,
                    onBack = { navController.popBackStack() },
                )
            }
        }
    }

    if (showLogoutDialog) {
        AlertDialog(
            onDismissRequest = { showLogoutDialog = false },
            title = { Text("Cerrar sesión") },
            text = { Text("¿Deseas cerrar tu sesión actual?") },
            confirmButton = {
                TextButton(onClick = {
                    showLogoutDialog = false
                    authRepo.logout()
                    onLogout()
                }) { Text("Cerrar sesión") }
            },
            dismissButton = {
                TextButton(onClick = { showLogoutDialog = false }) { Text("Cancelar") }
            },
        )
    }
}

