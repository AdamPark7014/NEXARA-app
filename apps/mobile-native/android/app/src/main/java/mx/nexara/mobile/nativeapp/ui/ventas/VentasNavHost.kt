package mx.nexara.mobile.nativeapp.ui.ventas

import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.runtime.Composable
import androidx.compose.ui.unit.dp
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.rememberNavController
import mx.nexara.mobile.nativeapp.ui.catalog.ModuleCatalog
import mx.nexara.mobile.nativeapp.ui.catalog.PortalModuleListScreen
import mx.nexara.mobile.nativeapp.ui.console.screens.PlaceholderScreen

private const val Home = "ventas/home"
private const val ModulePattern = "ventas/m/{key}"
private fun moduleRoute(key: String) = "ventas/m/$key"

@Composable
fun VentasNavHost(
    onExitToPanels: () -> Unit,
    panelTitle: String = "NEXARA CRM",
) {
    val nav = rememberNavController()
    NavHost(navController = nav, startDestination = Home) {
        composable(Home) {
            PortalModuleListScreen(
                title = panelTitle,
                modules = ModuleCatalog.ventas,
                onOpenModule = { m -> nav.navigate(moduleRoute(m.key)) },
                onBack = onExitToPanels,
            )
        }
        composable(ModulePattern) { backStack ->
            val key = backStack.arguments?.getString("key").orEmpty()
            val m = ModuleCatalog.ventas.firstOrNull { it.key == key }
            when (key) {
                "cotizaciones" -> { mx.nexara.mobile.nativeapp.ui.modules.CotizacionesModuleScreen(); return@composable }
                "clientes" -> { mx.nexara.mobile.nativeapp.ui.modules.ServiceClientsModuleScreen(); return@composable }
                "notificaciones" -> {
                    mx.nexara.mobile.nativeapp.ui.shared.NotificationsScreen(onBack = { nav.popBackStack() })
                    return@composable
                }
                "my-profile" -> {
                    mx.nexara.mobile.nativeapp.ui.console.screens.MyProfileScreen()
                    return@composable
                }
                "leads" -> { mx.nexara.mobile.nativeapp.ui.modules.LeadsModuleScreen(); return@composable }
                "oportunidades" -> { mx.nexara.mobile.nativeapp.ui.modules.LeadsModuleScreen(); return@composable }
                "proyectos" -> { mx.nexara.mobile.nativeapp.ui.modules.ProjectsModuleScreen(); return@composable }
                "plantillas" -> { mx.nexara.mobile.nativeapp.ui.modules.CotizacionesModuleScreen(); return@composable }
                "gestion-vendedores" -> { mx.nexara.mobile.nativeapp.ui.modules.ClientTicketsModuleScreen(); return@composable }
                "reportes" -> { mx.nexara.mobile.nativeapp.ui.modules.AnalyticsModuleScreen(); return@composable }
                "crecimiento" -> { mx.nexara.mobile.nativeapp.ui.modules.AnalyticsModuleScreen(); return@composable }
                "dashboard" -> { VentasDashboardScreen(); return@composable }
                "equipo-comparativa" -> { mx.nexara.mobile.nativeapp.ui.modules.AnalyticsModuleScreen(); return@composable }
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
