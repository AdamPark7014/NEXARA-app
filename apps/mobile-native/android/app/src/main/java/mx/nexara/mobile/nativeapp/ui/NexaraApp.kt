package mx.nexara.mobile.nativeapp.ui

import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.rememberNavController
import kotlinx.coroutines.launch
import mx.nexara.mobile.nativeapp.access.PanelAccessResolver
import mx.nexara.mobile.nativeapp.data.AuthRepository
import mx.nexara.mobile.nativeapp.data.onboarding.OnboardingStore
import mx.nexara.mobile.nativeapp.ui.console.ConsoleNavHost
import mx.nexara.mobile.nativeapp.ui.enterprise.NxLoadingBlock
import mx.nexara.mobile.nativeapp.ui.onboarding.OnboardingScreen
import mx.nexara.mobile.nativeapp.ui.screens.LoginScreen
import mx.nexara.mobile.nativeapp.ui.session.SessionExpiredHost
import mx.nexara.mobile.nativeapp.ui.tickets.TicketsNavHost

private object Routes {
    const val Login = "login"
    const val Onboarding = "onboarding"

    /** NEXARA Core — la única superficie del personal interno. */
    const val Erp = "erp"

    /** Portal de clientes — solo cuentas de cliente y de sucursal. */
    const val Portal = "portal"
}

/**
 * Raíz de la app. Solo existe NEXARA Core: tras el login el personal entra
 * directo a Actividades (`/erp/pizarra`); las cuentas de cliente y de sucursal
 * entran directo al portal. Ya no hay selector de paneles.
 *
 * Los deep links y los toques de notificación los consume la superficie activa
 * (`ConsoleNavHost` o `TicketsNavHost`), que manda a su inicio lo que no le toca.
 */
@Composable
fun NexaraApp() {
    val context = LocalContext.current
    val navController = rememberNavController()
    val repo = remember(context) { AuthRepository(context) }
    val onboardingStore = remember(context) { OnboardingStore(context) }
    val onboardingCompleted by onboardingStore.isCompleted.collectAsState(initial = null)
    val scope = rememberCoroutineScope()
    val session = remember { repo.loadSession() }

    fun homeRoute(): String {
        val panel = PanelAccessResolver.homePanel(repo.loadSession()) ?: return Routes.Login
        return PanelAccessResolver.routeForPanel(panel)
    }

    if (session != null && onboardingCompleted == null) {
        Box(Modifier.fillMaxSize()) {
            NxLoadingBlock("Preparando sesión…")
        }
        return
    }

    val startDestination = when {
        session == null -> Routes.Login
        onboardingCompleted == false -> Routes.Onboarding
        else -> homeRoute()
    }

    fun logout() {
        repo.logout()
        navController.navigate(Routes.Login) {
            popUpTo(0) { inclusive = true }
        }
    }

    fun completeOnboarding() {
        scope.launch {
            onboardingStore.markCompleted()
            navController.navigate(homeRoute()) {
                popUpTo(Routes.Onboarding) { inclusive = true }
                launchSingleTop = true
            }
        }
    }

    SessionExpiredHost(onSessionExpired = { logout() }) {
        NavHost(navController = navController, startDestination = startDestination) {
            composable(Routes.Login) {
                LoginScreen(
                    onLoggedIn = {
                        val target = if (onboardingCompleted != true) Routes.Onboarding else homeRoute()
                        navController.navigate(target) {
                            popUpTo(Routes.Login) { inclusive = true }
                            launchSingleTop = true
                        }
                    },
                )
            }

            composable(Routes.Onboarding) {
                OnboardingScreen(onFinish = ::completeOnboarding)
            }

            composable(Routes.Erp) {
                ConsoleNavHost(onLogout = { logout() })
            }

            composable(Routes.Portal) {
                TicketsNavHost(onLogout = { logout() })
            }
        }
    }
}
