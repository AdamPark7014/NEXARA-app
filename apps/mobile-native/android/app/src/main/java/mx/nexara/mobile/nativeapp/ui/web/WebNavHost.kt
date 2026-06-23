package mx.nexara.mobile.nativeapp.ui.web

import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.runtime.Composable
import androidx.compose.ui.unit.dp
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.rememberNavController
import mx.nexara.mobile.nativeapp.ui.catalog.ModuleCatalog
import mx.nexara.mobile.nativeapp.ui.catalog.PortalModuleListScreen
import mx.nexara.mobile.nativeapp.ui.console.screens.PlaceholderScreen

private const val Home = "web/home"
private const val ModulePattern = "web/m/{key}"
private fun moduleRoute(key: String) = "web/m/$key"

@Composable
fun WebNavHost(onExitToPanels: () -> Unit) {
    val nav = rememberNavController()
    NavHost(navController = nav, startDestination = Home) {
        composable(Home) {
            PortalModuleListScreen(
                title = "Panel Web",
                modules = ModuleCatalog.web,
                onOpenModule = { m -> nav.navigate(moduleRoute(m.key)) },
                onBack = onExitToPanels,
            )
        }
        composable(ModulePattern) { backStack ->
            val key = backStack.arguments?.getString("key").orEmpty()
            val m = ModuleCatalog.web.firstOrNull { it.key == key }
            when (key) {
                "noticias" -> { mx.nexara.mobile.nativeapp.ui.modules.NewsModuleScreen(); return@composable }
                "contactos" -> { mx.nexara.mobile.nativeapp.ui.modules.ContactMessagesModuleScreen(); return@composable }
                "clientes" -> { mx.nexara.mobile.nativeapp.ui.modules.ServiceClientsModuleScreen(); return@composable }
                "proyectos" -> { mx.nexara.mobile.nativeapp.ui.modules.ProjectsModuleScreen(); return@composable }
                "dashboard" -> { mx.nexara.mobile.nativeapp.ui.modules.AnalyticsModuleScreen(); return@composable }
            }
            PlaceholderScreen(
                title = m?.label ?: "Módulo",
                subtitle = (m?.webPath ?: "") + "\n\nImplementación nativa pendiente.",
                contentPadding = PaddingValues(20.dp),
                primaryActionText = "Volver",
                onPrimaryAction = { nav.popBackStack() },
            )
        }
    }
}
