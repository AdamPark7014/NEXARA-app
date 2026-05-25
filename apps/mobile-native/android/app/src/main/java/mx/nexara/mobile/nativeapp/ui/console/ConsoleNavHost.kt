package mx.nexara.mobile.nativeapp.ui.console

import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.NavigationBar
import androidx.compose.material3.NavigationBarItem
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.unit.dp
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.FilledTonalButton
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.navigation.NavDestination.Companion.hierarchy
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.currentBackStackEntryAsState
import androidx.navigation.compose.rememberNavController
import mx.nexara.mobile.nativeapp.data.AuthRepository
import mx.nexara.mobile.nativeapp.ui.console.screens.ConsoleActivitiesScreen
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
import mx.nexara.mobile.nativeapp.ui.catalog.ModuleCatalog

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
    const val More = "console/more"
    const val MyProfile = "console/my-profile"
    const val ModulePattern = "console/m/{key}"
    fun module(key: String) = "console/m/$key"
}

data class ConsoleNavItem(
    val route: String,
    val label: String,
    val iconText: String,
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
        "my-profile" -> ConsoleRoutes.MyProfile
        else -> ConsoleRoutes.module(key)
    }
}

@Composable
@OptIn(ExperimentalMaterial3Api::class)
fun ConsoleNavHost(
    onExitToPanels: () -> Unit,
    onLogout: () -> Unit = onExitToPanels,
) {
    val context = LocalContext.current
    val authRepo = remember(context) { AuthRepository(context) }
    var showLogoutDialog by remember { mutableStateOf(false) }
    val user = authRepo.loadSession()
    val roleLower = (user?.role ?: "").lowercase()
    val isSuperAdmin = user?.isSuperAdmin == true
    val isAdmin = !isSuperAdmin && (user?.permissions ?: emptyList()).contains("console.admin")
    val isIngeniero = !isSuperAdmin && !isAdmin && roleLower.contains("ingenier")
    val navController = rememberNavController()

    val visibleModules = remember(user) {
        ModuleCatalog.console.filter { canAccessConsoleModule(user, it) }
    }
    val visibleRoutes = remember(visibleModules) {
        visibleModules.map { routeForModuleKey(it.key) }.toSet()
    }
    val sidebarGroups = remember(user) { consoleSidebarGroups(user) }

    // Máximo 5 tabs: módulos principales visibles + "Más".
    val items = remember(isIngeniero, isSuperAdmin, isAdmin, visibleRoutes) {
        fun isVisible(route: String) = visibleRoutes.contains(route)

        buildList {
            if (isVisible(ConsoleRoutes.Dashboard)) {
                add(ConsoleNavItem(ConsoleRoutes.Dashboard, "Inicio", "📊"))
            }

            if (isSuperAdmin || isAdmin) {
                if (isVisible(ConsoleRoutes.Activities)) add(ConsoleNavItem(ConsoleRoutes.Activities, "Operación", "🗂️"))
                if (isVisible(ConsoleRoutes.Evidences)) add(ConsoleNavItem(ConsoleRoutes.Evidences, "Evidencias", "📸"))
                if (isVisible(ConsoleRoutes.Attendance)) add(ConsoleNavItem(ConsoleRoutes.Attendance, "Asistencia", "🕒"))
            } else if (isIngeniero) {
                if (isVisible(ConsoleRoutes.MyActivities)) add(ConsoleNavItem(ConsoleRoutes.MyActivities, "Mis act.", "📋"))
                if (isVisible(ConsoleRoutes.MyEvidences)) add(ConsoleNavItem(ConsoleRoutes.MyEvidences, "Mis evid.", "📸"))
                if (isVisible(ConsoleRoutes.Attendance)) {
                    add(ConsoleNavItem(ConsoleRoutes.Attendance, "Asistencia", "🕒"))
                } else if (isVisible(ConsoleRoutes.Gps)) {
                    add(ConsoleNavItem(ConsoleRoutes.Gps, "GPS", "🗺️"))
                }
            } else {
                if (isVisible(ConsoleRoutes.MyActivities)) add(ConsoleNavItem(ConsoleRoutes.MyActivities, "Mis act.", "📋"))
                if (isVisible(ConsoleRoutes.MyEvidences)) add(ConsoleNavItem(ConsoleRoutes.MyEvidences, "Mis evid.", "📸"))
                if (isVisible(ConsoleRoutes.Attendance)) {
                    add(ConsoleNavItem(ConsoleRoutes.Attendance, "Asistencia", "🕒"))
                } else if (isVisible(ConsoleRoutes.Gps)) {
                    add(ConsoleNavItem(ConsoleRoutes.Gps, "GPS", "🗺️"))
                }
            }

            if (isEmpty()) {
                add(ConsoleNavItem(ConsoleRoutes.Dashboard, "Inicio", "📊"))
            }
            add(ConsoleNavItem(ConsoleRoutes.More, "Más", "🧭"))
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
            ConsoleRoutes.More -> "Todos los módulos"
            ConsoleRoutes.MyProfile -> "Mi perfil"
            ConsoleRoutes.ModulePattern -> {
                val key = backStackEntry?.arguments?.getString("key").orEmpty()
                ModuleCatalog.console.firstOrNull { it.key == key }?.label ?: "Módulo"
            }
            else -> "NEXARA"
        }
    }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text(currentTitle, style = MaterialTheme.typography.titleMedium.copy(fontWeight = FontWeight.SemiBold)) },
                actions = {
                    FilledTonalButton(
                        onClick = { showLogoutDialog = true },
                        colors = ButtonDefaults.filledTonalButtonColors(
                            containerColor = Color(0xFFFFE4E6),
                            contentColor = Color(0xFFDC2626),
                        ),
                        contentPadding = androidx.compose.foundation.layout.PaddingValues(horizontal = 12.dp, vertical = 0.dp),
                        modifier = androidx.compose.ui.Modifier.padding(end = 8.dp).size(width = 100.dp, height = 34.dp),
                    ) {
                        Text("Salir", style = MaterialTheme.typography.labelMedium.copy(fontWeight = FontWeight.Bold))
                    }
                }
            )
        },
        bottomBar = {
            NavigationBar {
                items.forEach { item ->
                    val selected = currentDestination?.hierarchy?.any { it.route == item.route } == true
                    NavigationBarItem(
                        selected = selected,
                        onClick = {
                            navController.navigate(item.route) {
                                launchSingleTop = true
                            }
                        },
                        icon = {
                            Text(item.iconText, style = MaterialTheme.typography.titleMedium)
                        },
                        label = { Text(item.label) },
                    )
                }
            }
        }
    ) { inner ->
        NavHost(
            navController = navController,
            startDestination = startRoute,
            modifier = Modifier.padding(inner),
        ) {
            composable(ConsoleRoutes.Dashboard) {
                ConsoleDashboardScreen()
            }
            composable(ConsoleRoutes.Activities) {
                // Combined view: admins see team + personal; normal users see only personal
                ConsoleActivitiesScreen(title = "Actividades")
            }
            composable(ConsoleRoutes.MyActivities) {
                // My-activities route: shows only personal section (non-admin users)
                ConsoleActivitiesScreen(title = "Mis actividades")
            }
            composable(ConsoleRoutes.Evidences) {
                // Combined view: admins see team review + personal; normal users see only personal
                ConsoleEvidencesScreen(mode = "combined")
            }
            composable(ConsoleRoutes.MyEvidences) {
                // Dedicated personal evidences route
                ConsoleEvidencesScreen(mode = "user")
            }
            composable(ConsoleRoutes.Viatics) {
                ConsoleViaticsScreen()
            }
            composable(ConsoleRoutes.Vehicles) {
                ConsoleVehiclesScreen()
            }
            composable(ConsoleRoutes.Gps) {
                ConsoleGpsScreen()
            }
            composable(ConsoleRoutes.Tools) {
                ConsoleToolsScreen(
                    onOpenInventory = { navController.navigate(ConsoleRoutes.ToolsInventory) { launchSingleTop = true } },
                    onOpenMyKit = { navController.navigate(ConsoleRoutes.ToolsMyKit) { launchSingleTop = true } },
                    onOpenKitsUsers = { navController.navigate(ConsoleRoutes.ToolsKitsUsers) { launchSingleTop = true } },
                    onOpenRenewals = { navController.navigate(ConsoleRoutes.ToolsRenewals) { launchSingleTop = true } },
                )
            }
            composable(ConsoleRoutes.ToolsInventory) {
                ConsoleToolInventoryScreen(onBack = { navController.popBackStack() })
            }
            composable(ConsoleRoutes.ToolsMyKit) {
                ConsoleToolMyKitScreen(onBack = { navController.popBackStack() })
            }
            composable(ConsoleRoutes.ToolsRenewals) {
                ConsoleToolRenewalsScreen(onBack = { navController.popBackStack() })
            }
            composable(ConsoleRoutes.ToolsKitsUsers) {
                ConsoleToolsKitsUsersScreen(onBack = { navController.popBackStack() })
            }
            composable(ConsoleRoutes.Clients) {
                ConsoleClientsScreen()
            }
            composable(ConsoleRoutes.Projects) {
                ConsoleProjectsScreen()
            }
            composable(ConsoleRoutes.Users) {
                ConsoleUsersScreen()
            }
            composable(ConsoleRoutes.Attendance) {
                ConsoleAttendanceScreen()
            }
            composable(ConsoleRoutes.Settings) {
                ConsoleSettingsScreen(onExitToPanels = onExitToPanels)
            }
            composable(ConsoleRoutes.More) {
                ConsoleMoreScreen(
                    modules = visibleModules,
                    groups = sidebarGroups,
                    userName = user?.nombre,
                    userEmail = user?.email,
                    userRoleLabel = if (user?.isSuperAdmin == true) "Super Administrador" else user?.role,
                    userAvatarUrl = user?.avatarUrl,
                    isSuperAdmin = user?.isSuperAdmin == true,
                    onOpenModule = { m ->
                        val target = routeForModuleKey(m.key)
                        navController.navigate(target) { launchSingleTop = true }
                    },
                    onExitToPanels = onExitToPanels,
                    onLogout = { showLogoutDialog = true },
                )
            }
            composable(ConsoleRoutes.MyProfile) {
                MyProfileScreen()
            }
            composable(ConsoleRoutes.ModulePattern) { backStack ->
                val key = backStack.arguments?.getString("key").orEmpty()
                val m = ModuleCatalog.console.firstOrNull { it.key == key }
                // Despachar a pantallas nativas ya implementadas para este módulo.
                val handled: @androidx.compose.runtime.Composable () -> Unit = when (key) {
                    "news" -> { { mx.nexara.mobile.nativeapp.ui.modules.NewsModuleScreen() } }
                    "contact-messages" -> { { mx.nexara.mobile.nativeapp.ui.modules.ContactMessagesModuleScreen() } }
                    "newsletter" -> { { mx.nexara.mobile.nativeapp.ui.modules.NewsletterModuleScreen() } }
                    "audit" -> { { mx.nexara.mobile.nativeapp.ui.modules.AuditModuleScreen() } }
                    "analytics" -> { { mx.nexara.mobile.nativeapp.ui.modules.AnalyticsModuleScreen() } }
                    "expenses" -> { { mx.nexara.mobile.nativeapp.ui.modules.ExpensesModuleScreen() } }
                    "fines" -> { { mx.nexara.mobile.nativeapp.ui.modules.FinesModuleScreen() } }
                    "employee-payments" -> { { mx.nexara.mobile.nativeapp.ui.modules.EmployeePaymentsModuleScreen() } }
                    "cotizaciones" -> { { mx.nexara.mobile.nativeapp.ui.modules.CotizacionesModuleScreen() } }
                    "lunch-breaks" -> { { mx.nexara.mobile.nativeapp.ui.modules.LunchBreaksModuleScreen() } }
                    "my-lunch-breaks" -> { { mx.nexara.mobile.nativeapp.ui.modules.MyLunchBreaksModuleScreen(
                        currentUserId = authRepo.loadSession()?.id,
                    ) } }
                    "documents" -> { { mx.nexara.mobile.nativeapp.ui.modules.DocumentsModuleScreen() } }
                    "accounting" -> { { mx.nexara.mobile.nativeapp.ui.modules.AccountingModuleScreen() } }
                    "invoicing" -> { { mx.nexara.mobile.nativeapp.ui.modules.InvoicingModuleScreen() } }
                    "banking" -> { { mx.nexara.mobile.nativeapp.ui.modules.BankingModuleScreen() } }
                    "my-viatics" -> { { mx.nexara.mobile.nativeapp.ui.modules.MyViaticsScreen() } }
                    "my-vehicles" -> { { mx.nexara.mobile.nativeapp.ui.modules.MyVehiclesScreen() } }
                    "my-preferences" -> { { mx.nexara.mobile.nativeapp.ui.modules.MyPreferencesScreen() } }
                    "work-projects" -> { { mx.nexara.mobile.nativeapp.ui.modules.WorkProjectsModuleScreen() } }
                    "hr" -> { { mx.nexara.mobile.nativeapp.ui.modules.HrModuleScreen() } }
                    "warehouse" -> { { mx.nexara.mobile.nativeapp.ui.modules.WarehouseModuleScreen() } }
                    "stock" -> { { mx.nexara.mobile.nativeapp.ui.modules.StockModuleScreen() } }
                    "procurement" -> { { mx.nexara.mobile.nativeapp.ui.modules.ProcurementModuleScreen() } }
                    "maintenance" -> { { mx.nexara.mobile.nativeapp.ui.modules.MaintenanceModuleScreen() } }
                    "assets" -> { { mx.nexara.mobile.nativeapp.ui.modules.AssetsModuleScreen() } }
                    "service-sheets" -> { { mx.nexara.mobile.nativeapp.ui.modules.ServiceSheetsModuleScreen() } }
                    "cvs" -> { { mx.nexara.mobile.nativeapp.ui.modules.CvsModuleScreen() } }
                    "client-tickets" -> { { mx.nexara.mobile.nativeapp.ui.modules.ClientTicketsModuleScreen() } }
                    "gestion-vendedores" -> { { mx.nexara.mobile.nativeapp.ui.modules.ClientTicketsModuleScreen() } }
                    else -> { {} }
                }
                if (key in setOf(
                        "news","contact-messages","newsletter","audit","analytics","expenses",
                        "fines","employee-payments","cotizaciones","lunch-breaks","my-lunch-breaks",
                        "documents","accounting","invoicing","banking","my-viatics",
                        "my-vehicles","my-preferences","work-projects",
                        "hr","warehouse","stock","procurement",
                        "maintenance","assets","service-sheets","cvs","client-tickets",
                        "gestion-vendedores",
                    )) {
                    handled()
                    return@composable
                }
                PlaceholderScreen(
                    title = m?.label ?: "Módulo",
                    subtitle = (m?.webPath ?: "") + "\n\nImplementación nativa pendiente.",
                    contentPadding = PaddingValues(20.dp),
                    primaryActionText = "Volver",
                    onPrimaryAction = { navController.popBackStack() },
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

