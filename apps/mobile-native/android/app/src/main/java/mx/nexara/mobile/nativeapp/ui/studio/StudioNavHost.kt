package mx.nexara.mobile.nativeapp.ui.studio

import android.app.Application
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.lifecycle.ViewModel
import androidx.lifecycle.ViewModelProvider
import androidx.compose.ui.platform.LocalContext
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.rememberNavController
import mx.nexara.mobile.nativeapp.access.PanelId
import mx.nexara.mobile.nativeapp.navigation.PendingDeepLink
import mx.nexara.mobile.nativeapp.ui.catalog.ModuleCatalog
import mx.nexara.mobile.nativeapp.ui.catalog.PortalModuleListScreen

private const val Dashboard    = "studio/dashboard"
private const val Home         = "studio/home"
private const val ModulePattern = "studio/m/{key}"
private fun moduleRoute(key: String) = "studio/m/$key"

class StudioContactsViewModelFactory(
    private val app: Application,
    private val leadsOnly: Boolean,
) : ViewModelProvider.Factory {
    @Suppress("UNCHECKED_CAST")
    override fun <T : ViewModel> create(modelClass: Class<T>): T =
        StudioContactsViewModel(app, leadsOnly) as T
}

@Composable
fun StudioContactsRoute(onBack: () -> Unit, leadsOnly: Boolean) {
    val app = LocalContext.current.applicationContext as Application
    val vm: StudioContactsViewModel = androidx.lifecycle.viewmodel.compose.viewModel(
        key = "studio-contacts-$leadsOnly",
        factory = StudioContactsViewModelFactory(app, leadsOnly),
    )
    StudioContactsScreen(onBack = onBack, leadsOnly = leadsOnly, vm = vm)
}

@Composable
fun StudioNavHost(
    onExitToPanels: () -> Unit,
    panelTitle: String = "NEXARA STUDIO",
) {
    val nav = rememberNavController()
    val deepLinkSignal by PendingDeepLink.signal.collectAsState()

    LaunchedEffect(deepLinkSignal) {
        val key = PendingDeepLink.consumeModuleFor(PanelId.STUDIO) ?: return@LaunchedEffect
        val route = when (key) {
            "dashboard" -> Dashboard
            "more", "modules" -> Home
            else -> moduleRoute(key)
        }
        nav.navigate(route) { launchSingleTop = true }
    }

    NavHost(navController = nav, startDestination = Dashboard) {
        composable(Dashboard) {
            StudioDashboardScreen(
                onBack = onExitToPanels,
                onOpenModule = { mod -> nav.navigate(moduleRoute(mod)) }
            )
        }
        composable(Home) {
            PortalModuleListScreen(
                title = panelTitle,
                modules = ModuleCatalog.studio,
                onOpenModule = { m -> nav.navigate(moduleRoute(m.key)) },
                onBack = { nav.popBackStack() },
            )
        }
        composable(ModulePattern) { backStack ->
            val key = backStack.arguments?.getString("key").orEmpty()
            val pop: () -> Unit = { nav.popBackStack() }
            when (key) {
                "dashboard" -> StudioDashboardScreen(onBack = pop, onOpenModule = { mod ->
                    nav.navigate(moduleRoute(mod))
                })
                "more", "modules" -> PortalModuleListScreen(
                    title = "Módulos Studio",
                    modules = ModuleCatalog.studio,
                    onOpenModule = { m -> nav.navigate(moduleRoute(m.key)) },
                    onBack = pop,
                )
                "hero" -> StudioHeroScreen(onBack = pop)
                "cases" -> StudioCasesScreen(onBack = pop)
                "news" -> StudioNewsScreen(onBack = pop)
                "pages" -> StudioPagesScreen(onBack = pop)
                "contacts" -> StudioContactsRoute(onBack = pop, leadsOnly = false)
                "leads" -> StudioContactsRoute(onBack = pop, leadsOnly = true)
                "social" -> StudioSocialScreen(onBack = pop)
                "newsletter" -> StudioNewsletterScreen(onBack = pop)
                "chat" -> mx.nexara.mobile.nativeapp.ui.chat.ChatScreen(onBack = pop)
                else -> StudioDashboardScreen(onBack = pop, onOpenModule = { mod ->
                    nav.navigate(moduleRoute(mod))
                })
            }
        }
    }
}
