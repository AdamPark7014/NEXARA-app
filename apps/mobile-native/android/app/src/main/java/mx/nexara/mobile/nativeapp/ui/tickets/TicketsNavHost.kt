package mx.nexara.mobile.nativeapp.ui.tickets

import androidx.compose.foundation.layout.padding
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Modifier
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.currentBackStackEntryAsState
import androidx.navigation.compose.rememberNavController
import mx.nexara.mobile.nativeapp.ui.tickets.screens.TicketsPortalScreen
import mx.nexara.mobile.nativeapp.ui.tickets.screens.TicketsProfileScreen

private object TicketsRoutes {
    const val Portal = "tickets/portal"
    const val Profile = "tickets/profile"
    const val Branches = "tickets/branches"
    const val BranchNew = "tickets/branches/new"
    const val BranchEdit = "tickets/branches/edit/{id}"
    const val Requests = "tickets/requests"
    const val RequestNew = "tickets/requests/new"
    const val Tickets = "tickets/tickets"
    const val TicketDetail = "tickets/tickets/{id}"
    const val FeedbackPending = "tickets/feedback/pending"
    const val Inventories = "tickets/inventories"
    const val InventoryDetail = "tickets/inventories/{id}"
}

@Composable
@OptIn(ExperimentalMaterial3Api::class)
fun TicketsNavHost(
    onExitToPanels: () -> Unit,
) {
    val navController = rememberNavController()
    val backStackEntry by navController.currentBackStackEntryAsState()
    val route = backStackEntry?.destination?.route

    val title = remember(route) {
        when (route) {
            TicketsRoutes.Profile -> "Mi perfil"
            TicketsRoutes.Branches -> "Mis sucursales"
            TicketsRoutes.BranchNew -> "Nueva sucursal"
            TicketsRoutes.Requests -> "Solicitudes"
            TicketsRoutes.RequestNew -> "Nueva solicitud"
            TicketsRoutes.Tickets -> "Tickets"
            TicketsRoutes.FeedbackPending -> "Feedback pendiente"
            TicketsRoutes.Inventories -> "Inventarios"
            else -> "Tickets / Portal"
        }
    }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text(title) },
            )
        },
    ) { inner ->
        NavHost(
            navController = navController,
            startDestination = TicketsRoutes.Portal,
            modifier = Modifier.padding(inner),
        ) {
            composable(TicketsRoutes.Portal) {
                TicketsPortalScreen(
                    onExitToPanels = onExitToPanels,
                    onOpenProfile = { navController.navigate(TicketsRoutes.Profile) { launchSingleTop = true } },
                    onOpenBranches = { navController.navigate(TicketsRoutes.Branches) { launchSingleTop = true } },
                    onOpenRequests = { navController.navigate(TicketsRoutes.Requests) { launchSingleTop = true } },
                    onOpenTickets = { navController.navigate(TicketsRoutes.Tickets) { launchSingleTop = true } },
                    onOpenFeedbackPending = { navController.navigate(TicketsRoutes.FeedbackPending) { launchSingleTop = true } },
                    onOpenInventories = { navController.navigate(TicketsRoutes.Inventories) { launchSingleTop = true } },
                )
            }
            composable(TicketsRoutes.Profile) {
                TicketsProfileScreen(
                    onBack = { navController.popBackStack() },
                )
            }
            composable(TicketsRoutes.Branches) {
                mx.nexara.mobile.nativeapp.ui.tickets.screens.TicketsBranchesScreen(
                    onBack = { navController.popBackStack() },
                    onCreate = { navController.navigate(TicketsRoutes.BranchNew) { launchSingleTop = true } },
                    onEdit = { id ->
                        navController.navigate("tickets/branches/edit/$id") { launchSingleTop = true }
                    },
                )
            }
            composable(TicketsRoutes.BranchNew) {
                mx.nexara.mobile.nativeapp.ui.tickets.screens.TicketsBranchEditScreen(
                    branchId = null,
                    onBack = { navController.popBackStack() },
                )
            }
            composable(TicketsRoutes.BranchEdit) { entry ->
                val id = entry.arguments?.getString("id")?.toLongOrNull()
                mx.nexara.mobile.nativeapp.ui.tickets.screens.TicketsBranchEditScreen(
                    branchId = id,
                    onBack = { navController.popBackStack() },
                )
            }

            composable(TicketsRoutes.Requests) {
                mx.nexara.mobile.nativeapp.ui.tickets.screens.TicketsRequestsScreen(
                    onBack = { navController.popBackStack() },
                    onCreate = { navController.navigate(TicketsRoutes.RequestNew) { launchSingleTop = true } },
                )
            }
            composable(TicketsRoutes.RequestNew) {
                mx.nexara.mobile.nativeapp.ui.tickets.screens.TicketsRequestNewScreen(
                    onBack = { navController.popBackStack() },
                )
            }

            composable(TicketsRoutes.Tickets) {
                mx.nexara.mobile.nativeapp.ui.tickets.screens.TicketsTicketsScreen(
                    onBack = { navController.popBackStack() },
                    onOpenTicket = { id ->
                        navController.navigate("tickets/tickets/$id") { launchSingleTop = true }
                    },
                )
            }
            composable(TicketsRoutes.TicketDetail) { entry ->
                val id = entry.arguments?.getString("id")?.toLongOrNull()
                mx.nexara.mobile.nativeapp.ui.tickets.screens.TicketsTicketDetailScreen(
                    ticketId = id,
                    onBack = { navController.popBackStack() },
                )
            }

            composable(TicketsRoutes.FeedbackPending) {
                mx.nexara.mobile.nativeapp.ui.tickets.screens.TicketsFeedbackPendingScreen(
                    onBack = { navController.popBackStack() },
                )
            }

            composable(TicketsRoutes.Inventories) {
                mx.nexara.mobile.nativeapp.ui.tickets.screens.TicketsInventoriesScreen(
                    onBack = { navController.popBackStack() },
                    onOpenInventory = { id ->
                        navController.navigate("tickets/inventories/$id") { launchSingleTop = true }
                    },
                )
            }
            composable(TicketsRoutes.InventoryDetail) { entry ->
                val id = entry.arguments?.getString("id")?.toLongOrNull()
                mx.nexara.mobile.nativeapp.ui.tickets.screens.TicketsInventoryDetailScreen(
                    inventoryId = id,
                    onBack = { navController.popBackStack() },
                )
            }
        }
    }
}

