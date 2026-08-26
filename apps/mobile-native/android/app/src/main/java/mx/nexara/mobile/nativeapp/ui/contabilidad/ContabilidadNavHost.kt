package mx.nexara.mobile.nativeapp.ui.contabilidad

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.currentBackStackEntryAsState
import androidx.navigation.compose.rememberNavController
import mx.nexara.mobile.nativeapp.ui.console.screens.ConsoleProjectsScreen
import mx.nexara.mobile.nativeapp.ui.console.screens.MyProfileScreen
import mx.nexara.mobile.nativeapp.ui.console.screens.PlaceholderScreen
import mx.nexara.mobile.nativeapp.ui.catalog.ModuleCatalog
import mx.nexara.mobile.nativeapp.ui.console.screens.AccountingRichScreen
import mx.nexara.mobile.nativeapp.ui.console.screens.BankingRichScreen
import mx.nexara.mobile.nativeapp.ui.console.screens.EmployeePaymentsRichScreen
import mx.nexara.mobile.nativeapp.ui.console.screens.ExpensesRichScreen
import mx.nexara.mobile.nativeapp.ui.console.screens.FinesRichScreen
import mx.nexara.mobile.nativeapp.ui.console.screens.InvoicesRichScreen
import mx.nexara.mobile.nativeapp.ui.console.screens.WorkProjectsRichScreen
import mx.nexara.mobile.nativeapp.ui.enterprise.NxBottomTab
import mx.nexara.mobile.nativeapp.ui.enterprise.NxBottomTabBar
import mx.nexara.mobile.nativeapp.ui.enterprise.NxListRow
import mx.nexara.mobile.nativeapp.ui.enterprise.NxModuleScaffold
import mx.nexara.mobile.nativeapp.ui.enterprise.NxNavAnimStyle
import mx.nexara.mobile.nativeapp.ui.enterprise.NxSectionHeader
import mx.nexara.mobile.nativeapp.ui.enterprise.nxComposable

// ── Routes ────────────────────────────────────────────────────────────────────

private object ContaRoutes {
    const val Dashboard   = "c/dashboard"
    const val Invoicing   = "c/invoicing"
    const val Expenses    = "c/expenses"
    const val More        = "c/more"
    const val ModulePat   = "c/m/{key}"
    fun module(key: String) = "c/m/$key"
}

private fun contaModuleTitle(key: String): String = when (key) {
    "chat" -> "Chat del equipo"
    "my-profile" -> "Mi perfil"
    "pagos" -> "Pagos"
    "horas" -> "Horas"
    "proyectos" -> "Proyectos"
    else -> ModuleCatalog.contabilidad.firstOrNull { it.key == key }?.label ?: key
}

// ── NavHost ───────────────────────────────────────────────────────────────────

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ContabilidadNavHost(onExitToPanels: () -> Unit) {
    val nav = rememberNavController()
    val entry by nav.currentBackStackEntryAsState()
    val currentRoute = entry?.destination?.route ?: ContaRoutes.Dashboard

    val bottomTabs = listOf(
        Triple(ContaRoutes.Dashboard, Icons.Default.Dashboard,    "Inicio"),
        Triple(ContaRoutes.Invoicing, Icons.Default.Receipt,      "Facturas"),
        Triple(ContaRoutes.Expenses,  Icons.Default.MoneyOff,     "Gastos"),
        Triple(ContaRoutes.More,      Icons.Default.MoreHoriz,    "Más"),
    )
    val isBottomLevel = bottomTabs.any { it.first == currentRoute }
    val showBack = !isBottomLevel

    val currentTitle = when (currentRoute) {
        ContaRoutes.Dashboard -> "Contabilidad"
        ContaRoutes.Invoicing -> "Facturas"
        ContaRoutes.Expenses  -> "Gastos"
        ContaRoutes.More      -> "Más opciones"
        ContaRoutes.ModulePat -> contaModuleTitle(entry?.arguments?.getString("key").orEmpty())
        else -> "Contabilidad"
    }

    NxModuleScaffold(
        title = currentTitle,
        showBack = showBack,
        onBack = { nav.popBackStack() },
        onExitToPanels = onExitToPanels,
        bottomBar = {
            if (isBottomLevel) {
                NxBottomTabBar(
                    tabs = bottomTabs.map { (route, icon, label) ->
                        NxBottomTab(route, icon, label, 10.sp)
                    },
                    isSelected = { it == currentRoute },
                    onTabSelected = { route ->
                        nav.navigate(route) {
                            popUpTo(ContaRoutes.Dashboard) { saveState = true }
                            launchSingleTop = true
                            restoreState = true
                        }
                    },
                )
            }
        },
    ) { padding ->
        NavHost(
            navController = nav,
            startDestination = ContaRoutes.Dashboard,
            modifier = Modifier.padding(padding),
        ) {
            nxComposable(ContaRoutes.Dashboard) {
                ContabilidadDashboardScreen(
                    onOpenInvoicing = { nav.navigate(ContaRoutes.Invoicing) },
                    onOpenExpenses  = { nav.navigate(ContaRoutes.Expenses) },
                    onOpenChat      = { nav.navigate(ContaRoutes.module("chat")) },
                    onOpenViaticos  = { nav.navigate(ContaRoutes.module("viaticos")) },
                )
            }
            nxComposable(ContaRoutes.Invoicing) { InvoicesRichScreen() }
            nxComposable(ContaRoutes.Expenses)  { ExpensesRichScreen() }
            nxComposable(ContaRoutes.More) {
                ContabilidadMoreScreen(
                    onOpenModule   = { key -> nav.navigate(ContaRoutes.module(key)) },
                )
            }
            nxComposable(ContaRoutes.ModulePat, style = NxNavAnimStyle.Push) { backStack ->
                val key = backStack.arguments?.getString("key").orEmpty()
                when (key) {
                    "dashboard"          -> ContabilidadDashboardScreen(
                        onOpenInvoicing = { nav.navigate(ContaRoutes.Invoicing) },
                        onOpenExpenses  = { nav.navigate(ContaRoutes.Expenses) },
                        onOpenChat      = { nav.navigate(ContaRoutes.module("chat")) },
                        onOpenViaticos  = { nav.navigate(ContaRoutes.module("viaticos")) },
                    )
                    "invoicing"          -> InvoicesRichScreen()
                    "expenses"           -> ExpensesRichScreen()
                    "accounting"         -> AccountingRichScreen()
                    "banking"            -> BankingRichScreen()
                    "employee-payments",
                    "pagos"              -> EmployeePaymentsRichScreen()
                    "viaticos"           -> mx.nexara.mobile.nativeapp.ui.modules.MyViaticsScreen()
                    "multas"             -> FinesRichScreen()
                    "work-projects"          -> WorkProjectsRichScreen()
                    "proyectos"              -> ConsoleProjectsScreen()
                    "horas"              -> mx.nexara.mobile.nativeapp.ui.modules.LunchBreaksModuleScreen()
                    "my-profile"         -> MyProfileScreen()
                    "chat"               -> mx.nexara.mobile.nativeapp.ui.chat.ChatScreen(onBack = { nav.popBackStack() })
                    else -> {
                        val mod = ModuleCatalog.contabilidad.firstOrNull { it.key == key }
                        PlaceholderScreen(
                            title = mod?.label ?: key,
                            moduleKey = key,
                            webPath = mod?.webPath,
                            icon = mod?.icon,
                            onBack = { nav.popBackStack() },
                        )
                    }
                }
            }
        }
    }
}

// ── More screen ───────────────────────────────────────────────────────────────

@Composable
private fun ContabilidadMoreScreen(
    onOpenModule: (String) -> Unit,
) {
    LazyColumn(
        contentPadding = PaddingValues(16.dp),
        verticalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        item { NxSectionHeader("Finanzas") }
        item { ContaMoreRow("Facturación",       { onOpenModule("invoicing") }) }
        item { ContaMoreRow("Gastos",             { onOpenModule("expenses") }) }
        item { ContaMoreRow("Banca",              { onOpenModule("banking") }) }
        item { ContaMoreRow("Contabilidad",       { onOpenModule("accounting") }) }
        item { ContaMoreRow("Pagos a empleados",  { onOpenModule("employee-payments") }) }
        item { ContaMoreRow("Pagos",              { onOpenModule("pagos") }) }
        item { ContaMoreRow("Multas",             { onOpenModule("multas") }) }
        item { ContaMoreRow("Viáticos",           { onOpenModule("viaticos") }) }
        item { HorizontalDivider(modifier = Modifier.padding(vertical = 4.dp)) }
        item { NxSectionHeader("Proyectos · Operación") }
        item { ContaMoreRow("Proyectos internos", { onOpenModule("work-projects") }) }
        item { ContaMoreRow("Proyectos",          { onOpenModule("proyectos") }) }
        item { ContaMoreRow("Horas",              { onOpenModule("horas") }) }
        item { ContaMoreRow("Chat del equipo",    { onOpenModule("chat") }) }
        item { HorizontalDivider(modifier = Modifier.padding(vertical = 4.dp)) }
        item { NxSectionHeader("Mi cuenta") }
        item { ContaMoreRow("Mi perfil",          { onOpenModule("my-profile") }) }
    }
}

@Composable
private fun ContaMoreRow(label: String, onClick: () -> Unit) {
    NxListRow(
        title = label,
        onClick = onClick,
        trailing = {
            Icon(
                Icons.Default.ChevronRight,
                contentDescription = null,
                tint = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        },
    )
}
