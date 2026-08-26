package mx.nexara.mobile.nativeapp.ui.tickets

import androidx.compose.foundation.layout.padding
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.ExitToApp
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.currentBackStackEntryAsState
import androidx.navigation.compose.rememberNavController
import mx.nexara.mobile.nativeapp.ui.enterprise.NxNavAnimStyle
import mx.nexara.mobile.nativeapp.ui.enterprise.nxComposable
import mx.nexara.mobile.nativeapp.ui.enterprise.NxTealTopAppBarColors
import androidx.compose.ui.graphics.Color
import mx.nexara.mobile.nativeapp.access.DeepLinkNavigation
import mx.nexara.mobile.nativeapp.access.PanelId
import mx.nexara.mobile.nativeapp.navigation.PendingDeepLink
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
    const val Chat = "tickets/chat"
    const val Services = "tickets/services"
    const val Help = "tickets/help"

    fun routeForModuleKey(key: String): String = when (key) {
        "profile", "my-profile", "mi-perfil" -> Profile
        "branches", "sucursales" -> Branches
        "requests", "solicitudes" -> Requests
        "tickets" -> Tickets
        "inventories", "inventarios" -> Inventories
        "feedback-pending", "feedback" -> FeedbackPending
        "chat" -> Chat
        "mis-servicios", "services", "my-services" -> Services
        "help", "ayuda", "centro-de-ayuda" -> Help
        "portal", "home", "dashboard" -> Portal
        else -> Portal
    }
}

@Composable
@OptIn(ExperimentalMaterial3Api::class)
fun TicketsNavHost(
    onExitToPanels: () -> Unit,
) {
    val navController = rememberNavController()
    var chatChannelId by remember { mutableStateOf<Long?>(null) }
    var chatMessageId by remember { mutableStateOf<Long?>(null) }

    val deepLinkSignal by PendingDeepLink.signal.collectAsState()
    LaunchedEffect(deepLinkSignal) {
        val link = PendingDeepLink.consumeModuleDestination(PanelId.PORTAL) ?: return@LaunchedEffect
        if (link.key == "chat") {
            chatChannelId = DeepLinkNavigation.chatChannelId(link)
            chatMessageId = DeepLinkNavigation.chatMessageId(link)
        }
        val entityRoute = DeepLinkNavigation.ticketsRoute(link)
        val target = entityRoute ?: TicketsRoutes.routeForModuleKey(DeepLinkNavigation.ticketsModuleKey(link))
        navController.navigate(target) { launchSingleTop = true }
    }

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
            TicketsRoutes.Chat -> "Chat equipo"
            TicketsRoutes.Services -> "Mis servicios"
            TicketsRoutes.Help -> "Centro de ayuda"
            else -> "Tickets / Portal"
        }
    }

    val showBack = route != TicketsRoutes.Portal

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text(title, color = Color.White) },
                colors = NxTealTopAppBarColors(),
                navigationIcon = {
                    if (showBack) {
                        IconButton(onClick = { navController.popBackStack() }) {
                            Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = "Volver")
                        }
                    }
                },
                actions = {
                    IconButton(onClick = onExitToPanels) {
                        Icon(Icons.Default.ExitToApp, contentDescription = "Salir a paneles")
                    }
                },
            )
        },
    ) { inner ->
        NavHost(
            navController = navController,
            startDestination = TicketsRoutes.Portal,
            modifier = Modifier.padding(inner),
        ) {
            nxComposable(TicketsRoutes.Portal) {
                TicketsPortalScreen(
                    onExitToPanels = onExitToPanels,
                    onOpenProfile = { navController.navigate(TicketsRoutes.Profile) { launchSingleTop = true } },
                    onOpenBranches = { navController.navigate(TicketsRoutes.Branches) { launchSingleTop = true } },
                    onOpenRequests = { navController.navigate(TicketsRoutes.Requests) { launchSingleTop = true } },
                    onOpenTickets = { navController.navigate(TicketsRoutes.Tickets) { launchSingleTop = true } },
                    onOpenFeedbackPending = { navController.navigate(TicketsRoutes.FeedbackPending) { launchSingleTop = true } },
                    onOpenInventories = { navController.navigate(TicketsRoutes.Inventories) { launchSingleTop = true } },
                    onOpenChat = { navController.navigate(TicketsRoutes.Chat) { launchSingleTop = true } },
                    onOpenServices = { navController.navigate(TicketsRoutes.Services) { launchSingleTop = true } },
                    onOpenHelp = { navController.navigate(TicketsRoutes.Help) { launchSingleTop = true } },
                )
            }
            nxComposable(TicketsRoutes.Help, style = NxNavAnimStyle.Push) {
                mx.nexara.mobile.nativeapp.ui.tickets.screens.PortalHelpScreen(
                    onBack = { navController.popBackStack() },
                )
            }
            nxComposable(TicketsRoutes.Services, style = NxNavAnimStyle.Push) {
                mx.nexara.mobile.nativeapp.ui.tickets.screens.PortalServicesScreen(
                    onBack = { navController.popBackStack() },
                )
            }
            nxComposable(TicketsRoutes.Chat, style = NxNavAnimStyle.Push) {
                mx.nexara.mobile.nativeapp.ui.chat.ChatScreen(
                    onBack = { navController.popBackStack() },
                    initialChannelId = chatChannelId,
                    initialMessageId = chatMessageId,
                )
            }
            nxComposable(TicketsRoutes.Profile, style = NxNavAnimStyle.Push) {
                TicketsProfileScreen(
                    onBack = { navController.popBackStack() },
                )
            }
            nxComposable(TicketsRoutes.Branches, style = NxNavAnimStyle.Push) {
                mx.nexara.mobile.nativeapp.ui.tickets.screens.TicketsBranchesScreen(
                    onBack = { navController.popBackStack() },
                    onCreate = { navController.navigate(TicketsRoutes.BranchNew) { launchSingleTop = true } },
                    onEdit = { id ->
                        navController.navigate("tickets/branches/edit/$id") { launchSingleTop = true }
                    },
                )
            }
            nxComposable(TicketsRoutes.BranchNew, style = NxNavAnimStyle.Modal) {
                mx.nexara.mobile.nativeapp.ui.tickets.screens.TicketsBranchEditScreen(
                    branchId = null,
                    onBack = { navController.popBackStack() },
                )
            }
            nxComposable(TicketsRoutes.BranchEdit, style = NxNavAnimStyle.Push) { entry ->
                val id = entry.arguments?.getString("id")?.toLongOrNull()
                mx.nexara.mobile.nativeapp.ui.tickets.screens.TicketsBranchEditScreen(
                    branchId = id,
                    onBack = { navController.popBackStack() },
                )
            }

            nxComposable(TicketsRoutes.Requests, style = NxNavAnimStyle.Push) {
                mx.nexara.mobile.nativeapp.ui.tickets.screens.TicketsRequestsScreen(
                    onBack = { navController.popBackStack() },
                    onCreate = { navController.navigate(TicketsRoutes.RequestNew) { launchSingleTop = true } },
                )
            }
            nxComposable(TicketsRoutes.RequestNew, style = NxNavAnimStyle.Modal) {
                mx.nexara.mobile.nativeapp.ui.tickets.screens.TicketsRequestNewScreen(
                    onBack = { navController.popBackStack() },
                )
            }

            nxComposable(TicketsRoutes.Tickets, style = NxNavAnimStyle.Push) {
                mx.nexara.mobile.nativeapp.ui.tickets.screens.TicketsTicketsScreen(
                    onBack = { navController.popBackStack() },
                    onOpenTicket = { id ->
                        navController.navigate("tickets/tickets/$id") { launchSingleTop = true }
                    },
                )
            }
            nxComposable(TicketsRoutes.TicketDetail, style = NxNavAnimStyle.Push) { entry ->
                val id = entry.arguments?.getString("id")?.toLongOrNull()
                mx.nexara.mobile.nativeapp.ui.tickets.screens.TicketsTicketDetailScreen(
                    ticketId = id,
                    onBack = { navController.popBackStack() },
                )
            }

            nxComposable(TicketsRoutes.FeedbackPending, style = NxNavAnimStyle.Push) {
                mx.nexara.mobile.nativeapp.ui.tickets.screens.TicketsFeedbackPendingScreen(
                    onBack = { navController.popBackStack() },
                )
            }

            nxComposable(TicketsRoutes.Inventories, style = NxNavAnimStyle.Push) {
                mx.nexara.mobile.nativeapp.ui.tickets.screens.TicketsInventoriesScreen(
                    onBack = { navController.popBackStack() },
                    onOpenInventory = { id ->
                        navController.navigate("tickets/inventories/$id") { launchSingleTop = true }
                    },
                )
            }
            nxComposable(TicketsRoutes.InventoryDetail, style = NxNavAnimStyle.Push) { entry ->
                val id = entry.arguments?.getString("id")?.toLongOrNull()
                mx.nexara.mobile.nativeapp.ui.tickets.screens.TicketsInventoryDetailScreen(
                    inventoryId = id,
                    onBack = { navController.popBackStack() },
                )
            }
        }
    }
}

