package mx.nexara.mobile.nativeapp.ui

import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.remember
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.rememberNavController
import mx.nexara.mobile.nativeapp.data.AuthRepository
import mx.nexara.mobile.nativeapp.ui.screens.LoginScreen
import mx.nexara.mobile.nativeapp.ui.screens.PanelHubScreen
import mx.nexara.mobile.nativeapp.ui.screens.getAccessiblePanels
import androidx.compose.ui.platform.LocalContext
import mx.nexara.mobile.nativeapp.ui.tickets.TicketsNavHost

private object Routes {
    const val Login = "login"
    const val Panels = "panels"
    const val Console = "console"
    const val Tickets = "tickets"
    const val Ventas = "ventas"
    const val Contabilidad = "contabilidad"
    const val Web = "web"
    const val Notifications = "notifications"
}

private fun routeForSinglePanel(user: mx.nexara.mobile.nativeapp.data.SessionUser?): String? {
    if (user == null) return null
    val panels = getAccessiblePanels(
        role = user.role,
        permissions = user.permissions,
        isSuperAdmin = user.isSuperAdmin,
        isClient = user.isClient,
        isBranchUser = user.isBranchUser,
    )
    if (panels.size != 1) return null
    return when (panels.first().key) {
        "console" -> Routes.Console
        "tickets" -> Routes.Tickets
        "ventas" -> Routes.Ventas
        "contabilidad" -> Routes.Contabilidad
        "web" -> Routes.Web
        else -> null
    }
}

@Composable
fun NexaraApp() {
    val context = LocalContext.current
    val navController = rememberNavController()
    val repo = remember(context) { AuthRepository(context) }
    val session = remember { repo.loadSession() }
    val startDestination = when {
        session == null -> Routes.Login
        else -> routeForSinglePanel(session) ?: Routes.Panels
    }

    NavHost(
        navController = navController,
        startDestination = startDestination
    ) {
        composable(Routes.Login) {
            LoginScreen(
                onLoggedIn = {
                    val target = routeForSinglePanel(repo.loadSession()) ?: Routes.Panels
                    navController.navigate(target) {
                        popUpTo(Routes.Login) { inclusive = true }
                        launchSingleTop = true
                    }
                }
            )
        }
        composable(Routes.Panels) {
            val singlePanelRoute = remember { routeForSinglePanel(repo.loadSession()) }
            if (singlePanelRoute != null) {
                LaunchedEffect(singlePanelRoute) {
                    navController.navigate(singlePanelRoute) {
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
                    onOpenConsole = {
                        navController.navigate(Routes.Console) {
                            launchSingleTop = true
                        }
                    },
                    onOpenTickets = {
                        navController.navigate(Routes.Tickets) {
                            launchSingleTop = true
                        }
                    },
                    onOpenVentas = {
                        navController.navigate(Routes.Ventas) { launchSingleTop = true }
                    },
                    onOpenContabilidad = {
                        navController.navigate(Routes.Contabilidad) { launchSingleTop = true }
                    },
                    onOpenWeb = {
                        navController.navigate(Routes.Web) { launchSingleTop = true }
                    },
                    onOpenNotifications = {
                        navController.navigate(Routes.Notifications) {
                            launchSingleTop = true
                        }
                    },
                )
            }
        }

        composable(Routes.Console) {
            mx.nexara.mobile.nativeapp.ui.console.ConsoleNavHost(
                onExitToPanels = {
                    navController.navigate(Routes.Panels) {
                        popUpTo(Routes.Console) { inclusive = true }
                        launchSingleTop = true
                    }
                },
                onLogout = {
                    repo.logout()
                    navController.navigate(Routes.Login) {
                        popUpTo(0) { inclusive = true }
                        launchSingleTop = true
                    }
                },
            )
        }

        composable(Routes.Tickets) {
            TicketsNavHost(
                onExitToPanels = {
                    navController.navigate(Routes.Panels) {
                        popUpTo(Routes.Tickets) { inclusive = true }
                        launchSingleTop = true
                    }
                },
            )
        }

        composable(Routes.Notifications) {
            mx.nexara.mobile.nativeapp.ui.shared.NotificationsScreen(
                onBack = { navController.popBackStack() },
            )
        }

        composable(Routes.Ventas) {
            mx.nexara.mobile.nativeapp.ui.ventas.VentasNavHost(
                onExitToPanels = {
                    navController.navigate(Routes.Panels) {
                        popUpTo(Routes.Ventas) { inclusive = true }
                        launchSingleTop = true
                    }
                },
            )
        }
        composable(Routes.Contabilidad) {
            mx.nexara.mobile.nativeapp.ui.contabilidad.ContabilidadNavHost(
                onExitToPanels = {
                    navController.navigate(Routes.Panels) {
                        popUpTo(Routes.Contabilidad) { inclusive = true }
                        launchSingleTop = true
                    }
                },
            )
        }
        composable(Routes.Web) {
            mx.nexara.mobile.nativeapp.ui.web.WebNavHost(
                onExitToPanels = {
                    navController.navigate(Routes.Panels) {
                        popUpTo(Routes.Web) { inclusive = true }
                        launchSingleTop = true
                    }
                },
            )
        }
    }
}

