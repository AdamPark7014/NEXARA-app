package mx.nexara.mobile.nativeapp.ui

import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.remember
import androidx.compose.ui.platform.LocalContext
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.rememberNavController
import mx.nexara.mobile.nativeapp.access.PanelAccessResolver
import mx.nexara.mobile.nativeapp.access.PanelId
import mx.nexara.mobile.nativeapp.data.AuthRepository
import mx.nexara.mobile.nativeapp.ui.screens.LoginScreen
import mx.nexara.mobile.nativeapp.ui.screens.PanelHubScreen
import mx.nexara.mobile.nativeapp.ui.tickets.TicketsNavHost

private object Routes {
    const val Login = "login"
    const val Panels = "panels"
    const val Erp = "erp"
    const val Ops = "ops"
    const val Crm = "crm"
    const val Studio = "studio"
    const val Lab = "lab"
    const val Portal = "portal"
    const val Notifications = "notifications"
    // Legacy aliases (deep links / bookmarks)
    const val Console = "console"
    const val Ventas = "ventas"
    const val Contabilidad = "contabilidad"
    const val Web = "web"
    const val Tickets = "tickets"
}

@Composable
fun NexaraApp() {
    val context = LocalContext.current
    val navController = rememberNavController()
    val repo = remember(context) { AuthRepository(context) }
    val session = remember { repo.loadSession() }
    val startDestination = when {
        session == null -> Routes.Login
        else -> PanelAccessResolver.routeForSinglePanelUser(session) ?: Routes.Panels
    }

    fun navigateToPanel(panel: PanelId) {
        val route = when (panel) {
            PanelId.ERP -> Routes.Erp
            PanelId.OPS -> Routes.Ops
            PanelId.CRM -> Routes.Crm
            PanelId.STUDIO -> Routes.Studio
            PanelId.LAB -> Routes.Lab
            PanelId.PORTAL -> Routes.Portal
        }
        navController.navigate(route) { launchSingleTop = true }
    }

    NavHost(navController = navController, startDestination = startDestination) {
        composable(Routes.Login) {
            LoginScreen(
                onLoggedIn = {
                    val target = PanelAccessResolver.routeForSinglePanelUser(repo.loadSession()) ?: Routes.Panels
                    navController.navigate(target) {
                        popUpTo(Routes.Login) { inclusive = true }
                        launchSingleTop = true
                    }
                },
            )
        }

        composable(Routes.Panels) {
            val single = remember { PanelAccessResolver.routeForSinglePanelUser(repo.loadSession()) }
            if (single != null) {
                LaunchedEffect(single) {
                    navController.navigate(single) {
                        popUpTo(Routes.Panels) { inclusive = true }
                        launchSingleTop = true
                    }
                }
            } else {
                PanelHubScreen(
                    onLogout = {
                        repo.logout()
                        navController.navigate(Routes.Login) {
                            popUpTo(Routes.Panels) { inclusive = true }
                            launchSingleTop = true
                        }
                    },
                    onOpenPanel = { navigateToPanel(it) },
                    onOpenNotifications = {
                        navController.navigate(Routes.Notifications) { launchSingleTop = true }
                    },
                )
            }
        }

        composable(Routes.Erp) {
            mx.nexara.mobile.nativeapp.ui.console.ConsoleNavHost(
                panelId = PanelId.ERP,
                onExitToPanels = { navController.navigate(Routes.Panels) { popUpTo(Routes.Erp) { inclusive = true } } },
                onLogout = {
                    repo.logout()
                    navController.navigate(Routes.Login) { popUpTo(0) { inclusive = true } }
                },
            )
        }

        composable(Routes.Ops) {
            mx.nexara.mobile.nativeapp.ui.console.ConsoleNavHost(
                panelId = PanelId.OPS,
                onExitToPanels = { navController.navigate(Routes.Panels) { popUpTo(Routes.Ops) { inclusive = true } } },
                onLogout = {
                    repo.logout()
                    navController.navigate(Routes.Login) { popUpTo(0) { inclusive = true } }
                },
            )
        }

        composable(Routes.Crm) {
            mx.nexara.mobile.nativeapp.ui.ventas.VentasNavHost(
                panelTitle = PanelId.CRM.displayName,
                onExitToPanels = { navController.navigate(Routes.Panels) { popUpTo(Routes.Crm) { inclusive = true } } },
            )
        }

        composable(Routes.Studio) {
            mx.nexara.mobile.nativeapp.ui.web.WebNavHost(
                panelTitle = PanelId.STUDIO.displayName,
                onExitToPanels = { navController.navigate(Routes.Panels) { popUpTo(Routes.Studio) { inclusive = true } } },
            )
        }

        composable(Routes.Lab) {
            mx.nexara.mobile.nativeapp.ui.lab.LabNavHost(
                onExitToPanels = { navController.navigate(Routes.Panels) { popUpTo(Routes.Lab) { inclusive = true } } },
            )
        }

        composable(Routes.Portal) {
            TicketsNavHost(
                onExitToPanels = { navController.navigate(Routes.Panels) { popUpTo(Routes.Portal) { inclusive = true } } },
            )
        }

        composable(Routes.Notifications) {
            mx.nexara.mobile.nativeapp.ui.shared.NotificationsScreen(onBack = { navController.popBackStack() })
        }

        // Legacy routes → paneles consolidados
        composable(Routes.Console) {
            LaunchedEffect(Unit) { navController.navigate(Routes.Erp) { popUpTo(Routes.Console) { inclusive = true } } }
        }
        composable(Routes.Contabilidad) {
            LaunchedEffect(Unit) { navController.navigate(Routes.Erp) { popUpTo(Routes.Contabilidad) { inclusive = true } } }
        }
        composable(Routes.Ventas) {
            LaunchedEffect(Unit) { navController.navigate(Routes.Crm) { popUpTo(Routes.Ventas) { inclusive = true } } }
        }
        composable(Routes.Web) {
            LaunchedEffect(Unit) { navController.navigate(Routes.Studio) { popUpTo(Routes.Web) { inclusive = true } } }
        }
        composable(Routes.Tickets) {
            LaunchedEffect(Unit) { navController.navigate(Routes.Portal) { popUpTo(Routes.Tickets) { inclusive = true } } }
        }
    }
}
