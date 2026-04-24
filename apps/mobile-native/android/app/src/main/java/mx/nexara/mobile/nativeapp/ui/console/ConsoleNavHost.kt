package mx.nexara.mobile.nativeapp.ui.console

import androidx.compose.foundation.layout.padding
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.NavigationBar
import androidx.compose.material3.NavigationBarItem
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
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
import mx.nexara.mobile.nativeapp.ui.console.screens.userCanManageSystemSettings
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.ui.unit.dp

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

@Composable
@OptIn(ExperimentalMaterial3Api::class)
fun ConsoleNavHost(
    onExitToPanels: () -> Unit,
) {
    val context = LocalContext.current
    val authRepo = remember(context) { AuthRepository(context) }
    val user = authRepo.loadSession()
    val roleLower = (user?.role ?: "").lowercase()
    val isSuperAdmin = user?.isSuperAdmin == true
    val isIngeniero = !isSuperAdmin && roleLower.contains("ingenier")
    val canManageSettings = userCanManageSystemSettings(
        isSuperAdmin = isSuperAdmin,
        permissions = user?.permissions ?: emptyList(),
    )

    val navController = rememberNavController()
    val items = remember(isIngeniero, isSuperAdmin, canManageSettings) {
        buildList {
            add(ConsoleNavItem(ConsoleRoutes.Dashboard, "Inicio", "📊"))
            if (isIngeniero) {
                add(ConsoleNavItem(ConsoleRoutes.MyActivities, "Mis act.", "📋"))
                add(ConsoleNavItem(ConsoleRoutes.MyEvidences, "Evidencias", "📸"))
                add(ConsoleNavItem(ConsoleRoutes.Gps, "GPS", "🗺️"))
                add(ConsoleNavItem(ConsoleRoutes.Tools, "Tools", "🧰"))
            } else if (isSuperAdmin) {
                add(ConsoleNavItem(ConsoleRoutes.Activities, "Operación", "🗂️"))
                add(ConsoleNavItem(ConsoleRoutes.Evidences, "Evidencias", "📸"))
                add(ConsoleNavItem(ConsoleRoutes.Viatics, "Viáticos", "💼"))
                add(ConsoleNavItem(ConsoleRoutes.Vehicles, "Vehículos", "🚗"))
                add(ConsoleNavItem(ConsoleRoutes.Gps, "GPS", "🗺️"))
                add(ConsoleNavItem(ConsoleRoutes.Tools, "Tools", "🧰"))
                add(ConsoleNavItem(ConsoleRoutes.Clients, "Clientes", "🤝"))
                add(ConsoleNavItem(ConsoleRoutes.Projects, "Proyectos", "🧩"))
                add(ConsoleNavItem(ConsoleRoutes.Users, "Usuarios", "🧑‍💼"))
            } else {
                add(ConsoleNavItem(ConsoleRoutes.Activities, "Operación", "🗂️"))
                add(ConsoleNavItem(ConsoleRoutes.Evidences, "Evidencias", "📸"))
                add(ConsoleNavItem(ConsoleRoutes.Viatics, "Viáticos", "💼"))
                add(ConsoleNavItem(ConsoleRoutes.Vehicles, "Vehículos", "🚗"))
                add(ConsoleNavItem(ConsoleRoutes.Gps, "GPS", "🗺️"))
                add(ConsoleNavItem(ConsoleRoutes.Tools, "Tools", "🧰"))
                add(ConsoleNavItem(ConsoleRoutes.Clients, "Clientes", "🤝"))
                add(ConsoleNavItem(ConsoleRoutes.Projects, "Proyectos", "🧩"))
                add(ConsoleNavItem(ConsoleRoutes.Users, "Usuarios", "🧑‍💼"))
            }
            add(ConsoleNavItem(ConsoleRoutes.Attendance, "Asistencia", "🕒"))
            if (canManageSettings) {
                add(ConsoleNavItem(ConsoleRoutes.Settings, "Ajustes", "⚙️"))
            }
            add(ConsoleNavItem(ConsoleRoutes.More, "Más", "🧭"))
        }
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
            else -> "Consola"
        }
    }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text(currentTitle) },
                actions = {
                    // TODO: notificaciones, perfil, etc.
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
            startDestination = ConsoleRoutes.Dashboard,
            modifier = Modifier.padding(inner),
        ) {
            composable(ConsoleRoutes.Dashboard) {
                ConsoleDashboardScreen()
            }
            composable(ConsoleRoutes.Activities) {
                ConsoleActivitiesScreen(title = "Actividades", scope = null)
            }
            composable(ConsoleRoutes.MyActivities) {
                ConsoleActivitiesScreen(title = "Mis actividades", scope = "mine")
            }
            composable(ConsoleRoutes.Evidences) {
                ConsoleEvidencesScreen(mode = "admin")
            }
            composable(ConsoleRoutes.MyEvidences) {
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
                    onOpenModule = { m ->
                        val target = when (m.key) {
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
                            else -> ConsoleRoutes.module(m.key)
                        }
                        navController.navigate(target) { launchSingleTop = true }
                    }
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
                    "workflow" -> { { mx.nexara.mobile.nativeapp.ui.modules.WorkflowModuleScreen() } }
                    "my-viatics" -> { { mx.nexara.mobile.nativeapp.ui.modules.MyViaticsScreen() } }
                    "my-vehicles" -> { { mx.nexara.mobile.nativeapp.ui.modules.MyVehiclesScreen() } }
                    "my-preferences" -> { { mx.nexara.mobile.nativeapp.ui.modules.MyPreferencesScreen() } }
                    "service-clients" -> { { mx.nexara.mobile.nativeapp.ui.modules.ServiceClientsModuleScreen() } }
                    "work-projects" -> { { mx.nexara.mobile.nativeapp.ui.modules.WorkProjectsModuleScreen() } }
                    "hr" -> { { mx.nexara.mobile.nativeapp.ui.modules.HrModuleScreen() } }
                    "safety" -> { { mx.nexara.mobile.nativeapp.ui.modules.SafetyModuleScreen() } }
                    "warehouse" -> { { mx.nexara.mobile.nativeapp.ui.modules.WarehouseModuleScreen() } }
                    "stock" -> { { mx.nexara.mobile.nativeapp.ui.modules.StockModuleScreen() } }
                    "procurement" -> { { mx.nexara.mobile.nativeapp.ui.modules.ProcurementModuleScreen() } }
                    "manufacturing" -> { { mx.nexara.mobile.nativeapp.ui.modules.ManufacturingModuleScreen() } }
                    "production" -> { { mx.nexara.mobile.nativeapp.ui.modules.ProductionModuleScreen() } }
                    "maintenance" -> { { mx.nexara.mobile.nativeapp.ui.modules.MaintenanceModuleScreen() } }
                    "assets" -> { { mx.nexara.mobile.nativeapp.ui.modules.AssetsModuleScreen() } }
                    "quality" -> { { mx.nexara.mobile.nativeapp.ui.modules.QualityModuleScreen() } }
                    "service-sheets" -> { { mx.nexara.mobile.nativeapp.ui.modules.ServiceSheetsModuleScreen() } }
                    "cvs" -> { { mx.nexara.mobile.nativeapp.ui.modules.CvsModuleScreen() } }
                    "client-tickets" -> { { mx.nexara.mobile.nativeapp.ui.modules.ClientTicketsModuleScreen() } }
                    "gestion-vendedores" -> { { mx.nexara.mobile.nativeapp.ui.modules.ClientTicketsModuleScreen() } }
                    else -> { {} }
                }
                if (key in setOf(
                        "news","contact-messages","newsletter","audit","analytics","expenses",
                        "fines","employee-payments","cotizaciones","lunch-breaks","my-lunch-breaks",
                        "documents","accounting","invoicing","banking","workflow","my-viatics",
                        "my-vehicles","my-preferences","service-clients","work-projects",
                        "hr","safety","warehouse","stock","procurement","manufacturing","production",
                        "maintenance","assets","quality","service-sheets","cvs","client-tickets",
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
}

