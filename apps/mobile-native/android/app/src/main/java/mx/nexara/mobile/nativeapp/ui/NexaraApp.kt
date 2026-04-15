package mx.nexara.mobile.nativeapp.ui

import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.rememberNavController
import mx.nexara.mobile.nativeapp.data.AuthRepository
import mx.nexara.mobile.nativeapp.ui.screens.LoginScreen
import mx.nexara.mobile.nativeapp.ui.screens.PanelHubScreen
import androidx.compose.ui.platform.LocalContext

private object Routes {
    const val Login = "login"
    const val Panels = "panels"
    const val Console = "console"
}

@Composable
fun NexaraApp() {
    val context = LocalContext.current
    val navController = rememberNavController()
    val repo = remember(context) { AuthRepository(context) }
    val startDestination = if (repo.loadSession() != null) Routes.Panels else Routes.Login

    NavHost(
        navController = navController,
        startDestination = startDestination
    ) {
        composable(Routes.Login) {
            LoginScreen(
                onLoggedIn = {
                    navController.navigate(Routes.Panels) {
                        popUpTo(Routes.Login) { inclusive = true }
                        launchSingleTop = true
                    }
                }
            )
        }
        composable(Routes.Panels) {
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
            )
        }

        composable(Routes.Console) {
            mx.nexara.mobile.nativeapp.ui.console.ConsoleNavHost(
                onExitToPanels = {
                    navController.navigate(Routes.Panels) {
                        popUpTo(Routes.Console) { inclusive = true }
                        launchSingleTop = true
                    }
                }
            )
        }
    }
}

