package mx.nexara.mobile.nativeapp.ui.contabilidad

import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.runtime.Composable
import androidx.compose.ui.unit.dp
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.rememberNavController
import mx.nexara.mobile.nativeapp.ui.catalog.ModuleCatalog
import mx.nexara.mobile.nativeapp.ui.catalog.PortalModuleListScreen
import mx.nexara.mobile.nativeapp.ui.console.screens.PlaceholderScreen

private const val Home = "contabilidad/home"
private const val ModulePattern = "contabilidad/m/{key}"
private fun moduleRoute(key: String) = "contabilidad/m/$key"

@Composable
fun ContabilidadNavHost(onExitToPanels: () -> Unit) {
    val nav = rememberNavController()
    NavHost(navController = nav, startDestination = Home) {
        composable(Home) {
            PortalModuleListScreen(
                title = "Panel de Contabilidad",
                modules = ModuleCatalog.contabilidad,
                onOpenModule = { m -> nav.navigate(moduleRoute(m.key)) },
                onBack = onExitToPanels,
            )
        }
        composable(ModulePattern) { backStack ->
            val key = backStack.arguments?.getString("key").orEmpty()
            val m = ModuleCatalog.contabilidad.firstOrNull { it.key == key }
            when (key) {
                "accounting" -> { mx.nexara.mobile.nativeapp.ui.modules.AccountingModuleScreen(); return@composable }
                "banking" -> { mx.nexara.mobile.nativeapp.ui.modules.BankingModuleScreen(); return@composable }
                "invoicing" -> { mx.nexara.mobile.nativeapp.ui.modules.InvoicingModuleScreen(); return@composable }
                "expenses" -> { mx.nexara.mobile.nativeapp.ui.modules.ExpensesModuleScreen(); return@composable }
                "employee-payments" -> { mx.nexara.mobile.nativeapp.ui.modules.EmployeePaymentsModuleScreen(); return@composable }
                "viaticos" -> { mx.nexara.mobile.nativeapp.ui.modules.MyViaticsScreen(); return@composable }
                "multas" -> { mx.nexara.mobile.nativeapp.ui.modules.FinesModuleScreen(); return@composable }
                "work-projects" -> { mx.nexara.mobile.nativeapp.ui.modules.WorkProjectsModuleScreen(); return@composable }
                "dashboard" -> { ContabilidadDashboardScreen(); return@composable }
                "pagos" -> { mx.nexara.mobile.nativeapp.ui.modules.EmployeePaymentsModuleScreen(); return@composable }
                "horas" -> { mx.nexara.mobile.nativeapp.ui.modules.LunchBreaksModuleScreen(); return@composable }
                "proyectos" -> { mx.nexara.mobile.nativeapp.ui.modules.ProjectsModuleScreen(); return@composable }
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
