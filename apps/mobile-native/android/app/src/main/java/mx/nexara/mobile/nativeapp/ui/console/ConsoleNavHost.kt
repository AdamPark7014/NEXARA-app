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
import mx.nexara.mobile.nativeapp.ui.console.screens.ConsoleUsersScreen
import mx.nexara.mobile.nativeapp.ui.console.screens.ConsoleViaticsScreen
import mx.nexara.mobile.nativeapp.ui.console.screens.ConsoleVehiclesScreen
import mx.nexara.mobile.nativeapp.ui.console.screens.PlaceholderScreen

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

    val navController = rememberNavController()
    val items = remember(isIngeniero, isSuperAdmin) {
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
            add(ConsoleNavItem(ConsoleRoutes.Settings, "Ajustes", "⚙️"))
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
            ConsoleRoutes.Settings -> "Configuración del sistema"
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
                PlaceholderScreen(
                    title = "Ajustes",
                    subtitle = "Migración en progreso",
                    primaryActionText = "Salir a paneles",
                    onPrimaryAction = onExitToPanels,
                )
            }
        }
    }
}

