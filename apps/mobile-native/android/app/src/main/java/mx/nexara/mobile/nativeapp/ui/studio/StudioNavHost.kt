package mx.nexara.mobile.nativeapp.ui.studio

import android.app.Application
import androidx.compose.runtime.Composable
import androidx.lifecycle.ViewModel
import androidx.lifecycle.ViewModelProvider
import androidx.compose.ui.platform.LocalContext
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.rememberNavController
import mx.nexara.mobile.nativeapp.ui.catalog.ModuleCatalog
import mx.nexara.mobile.nativeapp.ui.catalog.PortalModuleListScreen

private const val Home = "studio/home"
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
    NavHost(navController = nav, startDestination = Home) {
        composable(Home) {
            PortalModuleListScreen(
                title = panelTitle,
                modules = ModuleCatalog.studio,
                onOpenModule = { m -> nav.navigate(moduleRoute(m.key)) },
                onBack = onExitToPanels,
            )
        }
        composable(ModulePattern) { backStack ->
            val key = backStack.arguments?.getString("key").orEmpty()
            val pop = { nav.popBackStack() }
            when (key) {
                "dashboard" -> StudioDashboardScreen(onBack = pop, onOpenModule = { mod ->
                    nav.navigate(moduleRoute(mod))
                })
                "hero" -> StudioHeroScreen(onBack = pop)
                "cases" -> StudioCasesScreen(onBack = pop)
                "news" -> StudioNewsScreen(onBack = pop)
                "pages" -> StudioPagesScreen(onBack = pop)
                "contacts" -> StudioContactsRoute(onBack = pop, leadsOnly = false)
                "leads" -> StudioContactsRoute(onBack = pop, leadsOnly = true)
                "social" -> StudioSocialScreen(onBack = pop)
                "newsletter" -> StudioNewsletterScreen(onBack = pop)
                else -> StudioDashboardScreen(onBack = pop, onOpenModule = { mod ->
                    nav.navigate(moduleRoute(mod))
                })
            }
        }
    }
}
