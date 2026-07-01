package mx.nexara.mobile.nativeapp.ui.contabilidad

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.currentBackStackEntryAsState
import androidx.navigation.compose.rememberNavController
import mx.nexara.mobile.nativeapp.ui.console.screens.MyProfileScreen
import mx.nexara.mobile.nativeapp.ui.console.screens.PlaceholderScreen
import mx.nexara.mobile.nativeapp.ui.console.screens.AccountingRichScreen
import mx.nexara.mobile.nativeapp.ui.console.screens.BankingRichScreen
import mx.nexara.mobile.nativeapp.ui.console.screens.EmployeePaymentsRichScreen
import mx.nexara.mobile.nativeapp.ui.console.screens.ExpensesRichScreen
import mx.nexara.mobile.nativeapp.ui.console.screens.FinesRichScreen
import mx.nexara.mobile.nativeapp.ui.console.screens.InvoicesRichScreen
import mx.nexara.mobile.nativeapp.ui.console.screens.WorkProjectsRichScreen

// ── Routes ────────────────────────────────────────────────────────────────────

private object ContaRoutes {
    const val Dashboard   = "c/dashboard"
    const val Invoicing   = "c/invoicing"
    const val Expenses    = "c/expenses"
    const val More        = "c/more"
    const val ModulePat   = "c/m/{key}"
    fun module(key: String) = "c/m/$key"
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

    Scaffold(
        bottomBar = {
            if (isBottomLevel) {
                NavigationBar {
                    bottomTabs.forEach { (route, icon, label) ->
                        NavigationBarItem(
                            selected = currentRoute == route,
                            onClick = {
                                if (currentRoute != route) {
                                    nav.navigate(route) {
                                        popUpTo(ContaRoutes.Dashboard) { saveState = true }
                                        launchSingleTop = true; restoreState = true
                                    }
                                }
                            },
                            icon  = { Icon(icon, contentDescription = label) },
                            label = { Text(label, fontSize = 10.sp) }
                        )
                    }
                }
            }
        }
    ) { padding ->
        NavHost(
            navController = nav,
            startDestination = ContaRoutes.Dashboard,
            modifier = Modifier.padding(padding)
        ) {
            composable(ContaRoutes.Dashboard) { ContabilidadDashboardScreen() }
            composable(ContaRoutes.Invoicing) { InvoicesRichScreen() }
            composable(ContaRoutes.Expenses)  { ExpensesRichScreen() }
            composable(ContaRoutes.More) {
                ContabilidadMoreScreen(
                    onOpenModule   = { key -> nav.navigate(ContaRoutes.module(key)) },
                    onExitToPanels = onExitToPanels,
                )
            }
            composable(ContaRoutes.ModulePat) { backStack ->
                val key = backStack.arguments?.getString("key").orEmpty()
                when (key) {
                    "dashboard"          -> ContabilidadDashboardScreen()
                    "invoicing"          -> InvoicesRichScreen()
                    "expenses"           -> ExpensesRichScreen()
                    "accounting"         -> AccountingRichScreen()
                    "banking"            -> BankingRichScreen()
                    "employee-payments",
                    "pagos"              -> EmployeePaymentsRichScreen()
                    "viaticos"           -> mx.nexara.mobile.nativeapp.ui.modules.MyViaticsScreen()
                    "multas"             -> FinesRichScreen()
                    "work-projects",
                    "proyectos"          -> WorkProjectsRichScreen()
                    "horas"              -> mx.nexara.mobile.nativeapp.ui.modules.LunchBreaksModuleScreen()
                    "my-profile"         -> MyProfileScreen()
                    else -> PlaceholderScreen(
                        title = key,
                        subtitle = "Módulo contabilidad: implementación pendiente.",
                        primaryActionText = "Volver",
                        onPrimaryAction = { nav.popBackStack() }
                    )
                }
            }
        }
    }
}

// ── More screen ───────────────────────────────────────────────────────────────

@Composable
private fun ContabilidadMoreScreen(
    onOpenModule: (String) -> Unit,
    onExitToPanels: () -> Unit,
) {
    LazyColumn(contentPadding = PaddingValues(16.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
        item { ContaSectionLabel("Finanzas") }
        item { ContaMoreRow("🧾", "Facturación",       { onOpenModule("invoicing") }) }
        item { ContaMoreRow("📊", "Gastos",             { onOpenModule("expenses") }) }
        item { ContaMoreRow("🏦", "Banca",              { onOpenModule("banking") }) }
        item { ContaMoreRow("📒", "Contabilidad",       { onOpenModule("accounting") }) }
        item { ContaMoreRow("💳", "Pagos a empleados",  { onOpenModule("employee-payments") }) }
        item { ContaMoreRow("⚠️", "Multas",             { onOpenModule("multas") }) }
        item { ContaMoreRow("💼", "Viáticos",           { onOpenModule("viaticos") }) }
        item { Divider(modifier = Modifier.padding(vertical = 8.dp)) }
        item { ContaSectionLabel("Proyectos · Operación") }
        item { ContaMoreRow("🛠️", "Proyectos internos", { onOpenModule("work-projects") }) }
        item { ContaMoreRow("📐", "Proyectos",          { onOpenModule("proyectos") }) }
        item { ContaMoreRow("🍽️", "Comidas (equipo)",   { onOpenModule("horas") }) }
        item { Divider(modifier = Modifier.padding(vertical = 8.dp)) }
        item { ContaSectionLabel("Mi cuenta") }
        item { ContaMoreRow("👤", "Mi perfil",          { onOpenModule("my-profile") }) }
        item { Divider(modifier = Modifier.padding(vertical = 8.dp)) }
        item {
            TextButton(
                onClick = onExitToPanels,
                colors = ButtonDefaults.textButtonColors(contentColor = MaterialTheme.colorScheme.error)
            ) { Text("← Cambiar panel") }
        }
    }
}

@Composable
private fun ContaSectionLabel(label: String) {
    Text(
        label,
        style = MaterialTheme.typography.labelLarge,
        color = MaterialTheme.colorScheme.primary,
        modifier = Modifier.padding(vertical = 4.dp)
    )
}

@Composable
private fun ContaMoreRow(icon: String, label: String, onClick: () -> Unit) {
    Row(
        Modifier.fillMaxWidth().clip(RoundedCornerShape(10.dp))
            .background(MaterialTheme.colorScheme.surface)
            .padding(horizontal = 14.dp, vertical = 12.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(14.dp)
    ) {
        Text(icon, fontSize = 18.sp)
        Text(label, Modifier.weight(1f), fontSize = 14.sp)
        IconButton(onClick = onClick, modifier = Modifier.size(24.dp)) {
            Icon(Icons.Default.ChevronRight, contentDescription = null, modifier = Modifier.size(18.dp))
        }
    }
}
