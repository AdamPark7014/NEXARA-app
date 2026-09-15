package mx.nexara.mobile.nativeapp.ui.console

import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.Assignment
import androidx.compose.material.icons.filled.Business
import androidx.compose.material.icons.filled.Chat
import androidx.compose.material.icons.filled.Notifications
import androidx.compose.material.icons.filled.Person
import androidx.compose.material.icons.filled.Schedule
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Badge
import androidx.compose.material3.BadgedBox
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FilledTonalButton
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.navigation.NavDestination.Companion.hierarchy
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.currentBackStackEntryAsState
import androidx.navigation.compose.rememberNavController
import kotlinx.coroutines.delay
import mx.nexara.mobile.nativeapp.access.CoreKeys
import mx.nexara.mobile.nativeapp.access.DeepLinkDestination
import mx.nexara.mobile.nativeapp.access.DeepLinkNavigation
import mx.nexara.mobile.nativeapp.access.PanelId
import mx.nexara.mobile.nativeapp.data.AuthRepository
import mx.nexara.mobile.nativeapp.data.notifications.NotificationsRepository
import mx.nexara.mobile.nativeapp.navigation.PendingDeepLink
import mx.nexara.mobile.nativeapp.navigation.PendingModuleLink
import mx.nexara.mobile.nativeapp.ui.chat.ChatScreen
import mx.nexara.mobile.nativeapp.ui.console.activities.ActividadesScreen
import mx.nexara.mobile.nativeapp.ui.console.activities.BoardPersonScreen
import mx.nexara.mobile.nativeapp.ui.console.activities.ConsoleActivityDetailByIdScreen
import mx.nexara.mobile.nativeapp.ui.console.screens.ConsoleAttendanceScreen
import mx.nexara.mobile.nativeapp.ui.console.screens.ConsoleClientsScreen
import mx.nexara.mobile.nativeapp.ui.console.screens.MyProfileScreen
import mx.nexara.mobile.nativeapp.ui.console.screens.OpsNewActivityScreen
import mx.nexara.mobile.nativeapp.ui.enterprise.NxBottomTab
import mx.nexara.mobile.nativeapp.ui.enterprise.NxBottomTabBar
import mx.nexara.mobile.nativeapp.ui.enterprise.NxNavAnimStyle
import mx.nexara.mobile.nativeapp.ui.enterprise.NxTealTopAppBarColors
import mx.nexara.mobile.nativeapp.ui.enterprise.nxComposable
import mx.nexara.mobile.nativeapp.ui.shared.NotificationsScreen
import mx.nexara.mobile.nativeapp.ui.shared.OfflineQueueScreen

internal object ConsoleRoutes {
    const val Activities = "console/activities"
    const val Attendance = "console/attendance"
    const val Chat = "console/chat"
    const val Clients = "console/clients"
    const val MyProfile = "console/my-profile"
    const val Notifications = "console/notifications"
    const val OfflineQueue = "console/offline-queue"
    const val ActivityDetail = "console/activity/{id}?tab={tab}"
    const val NewActivity = "console/activities/new?requestId={requestId}&self={self}"

    /** El día de una persona del equipo (/erp/pizarra/:userId). */
    const val BoardPerson = "console/board/{userId}"

    fun forModule(module: CoreModule): String = when (module) {
        CoreModule.ACTIVIDADES -> Activities
        CoreModule.ASISTENCIAS -> Attendance
        CoreModule.CHAT -> Chat
        CoreModule.CLIENTES -> Clients
        CoreModule.MI_PERFIL -> MyProfile
    }

    fun forModuleKey(key: String): CoreModule? = when (key) {
        CoreKeys.ACTIVITIES, CoreKeys.MY_ACTIVITIES -> CoreModule.ACTIVIDADES
        CoreKeys.ATTENDANCE -> CoreModule.ASISTENCIAS
        CoreKeys.CHAT -> CoreModule.CHAT
        CoreKeys.CLIENTS -> CoreModule.CLIENTES
        CoreKeys.MY_PROFILE -> CoreModule.MI_PERFIL
        else -> null
    }
}

private fun CoreModule.icon(): ImageVector = when (this) {
    CoreModule.ACTIVIDADES -> Icons.Default.Assignment
    CoreModule.ASISTENCIAS -> Icons.Default.Schedule
    CoreModule.CHAT -> Icons.Default.Chat
    CoreModule.CLIENTES -> Icons.Default.Business
    CoreModule.MI_PERFIL -> Icons.Default.Person
}

/** La web consulta el contador de la campana cada 45 s (AppShell.tsx). */
private const val UNREAD_POLL_MS = 45_000L

/**
 * NEXARA Core en el teléfono: una barra inferior con exactamente los módulos de
 * `CORE_OLA1_MODULE_IDS` que el rol puede abrir ([CoreMenu]) y la campana de
 * notificaciones arriba. No hay «Más», ni módulos genéricos, ni salida a paneles.
 */
@Composable
@OptIn(ExperimentalMaterial3Api::class)
fun ConsoleNavHost(
    onLogout: () -> Unit,
) {
    val context = LocalContext.current
    val authRepo = remember(context) { AuthRepository(context) }
    val notificationsRepo = remember(context) { NotificationsRepository(context) }
    var showLogoutDialog by remember { mutableStateOf(false) }
    val user = remember { authRepo.loadSession() }
    val navController = rememberNavController()
    var chatChannelId by remember { mutableStateOf<Long?>(null) }
    var chatMessageId by remember { mutableStateOf<Long?>(null) }
    /** `?vista=mias|equipo` que llegó por deep link a Actividades. */
    var actividadesVista by remember { mutableStateOf<String?>(null) }
    /** `comidas` cuando un aviso de hora de comida abre Asistencias. */
    var attendanceTab by remember { mutableStateOf<String?>(null) }
    var unreadCount by remember { mutableIntStateOf(0) }

    val modules = remember(user) { CoreMenu.modulesFor(user) }
    val tabs = remember(modules) { modules.map { ConsoleRoutes.forModule(it) to it } }
    val startRoute = tabs.firstOrNull()?.first ?: ConsoleRoutes.MyProfile

    val backStackEntry by navController.currentBackStackEntryAsState()
    val currentDestination = backStackEntry?.destination
    val currentRoute = currentDestination?.route

    // Campana: al entrar, cada 45 s y al volver de cualquier pantalla.
    LaunchedEffect(currentRoute) {
        while (true) {
            runCatching { notificationsRepo.unreadCount() }
                .onSuccess { unreadCount = it.unreadCount }
            delay(UNREAD_POLL_MS)
        }
    }

    val deepLinkSignal by PendingDeepLink.signal.collectAsState()
    LaunchedEffect(deepLinkSignal) {
        val pending = PendingDeepLink.consume() ?: return@LaunchedEffect
        if (pending is DeepLinkDestination.Notifications) {
            navController.navigate(ConsoleRoutes.Notifications) { launchSingleTop = true }
            return@LaunchedEffect
        }
        val module = pending as DeepLinkDestination.Module
        // El personal interno no abre el portal: ese enlace cae en la casa de Core.
        if (module.panel != PanelId.ERP) {
            navController.navigate(startRoute) { launchSingleTop = true }
            return@LaunchedEffect
        }
        val link = PendingModuleLink(key = module.key, entityId = module.entityId, params = module.params)
        if (link.key == CoreKeys.CHAT) {
            chatChannelId = DeepLinkNavigation.chatChannelId(link)
            chatMessageId = DeepLinkNavigation.chatMessageId(link)
        }
        DeepLinkNavigation.actividadesVista(link)?.let { actividadesVista = it }
        DeepLinkNavigation.attendanceTab(link)?.let { attendanceTab = it }

        val target = DeepLinkNavigation.consoleRoute(link)
            ?: ConsoleRoutes.forModuleKey(link.key)
                ?.takeIf { it in modules }
                ?.let { ConsoleRoutes.forModule(it) }
            ?: startRoute
        navController.navigate(target) { launchSingleTop = true }
    }

    val openActivity: (Long, String?) -> Unit = { id, tab ->
        val route = if (tab.isNullOrBlank()) "console/activity/$id" else "console/activity/$id?tab=$tab"
        navController.navigate(route) { launchSingleTop = true }
    }
    val openPerson: (Long) -> Unit = { personId ->
        navController.navigate("console/board/$personId") { launchSingleTop = true }
    }
    val openSelfAssign: () -> Unit = {
        navController.navigate("console/activities/new?requestId=-1&self=true") { launchSingleTop = true }
    }

    val currentTitle = when (currentRoute) {
        ConsoleRoutes.Activities -> "Actividades"
        ConsoleRoutes.Attendance -> "Asistencias"
        ConsoleRoutes.Chat -> "Chat"
        ConsoleRoutes.Clients -> "Clientes"
        ConsoleRoutes.MyProfile -> "Mi perfil"
        ConsoleRoutes.Notifications -> "Notificaciones"
        ConsoleRoutes.OfflineQueue -> "Cola offline"
        ConsoleRoutes.ActivityDetail -> "Detalle de actividad"
        ConsoleRoutes.BoardPerson -> "Equipo"
        ConsoleRoutes.NewActivity -> "Nueva actividad"
        else -> "NEXARA"
    }

    val tabRoutes = tabs.map { it.first }.toSet()
    val showBack = currentRoute != null && currentRoute !in tabRoutes

    Scaffold(
        topBar = {
            TopAppBar(
                title = {
                    Text(
                        currentTitle,
                        style = MaterialTheme.typography.titleMedium.copy(fontWeight = FontWeight.SemiBold),
                        color = Color.White,
                    )
                },
                colors = NxTealTopAppBarColors(),
                navigationIcon = {
                    if (showBack) {
                        IconButton(onClick = { navController.popBackStack() }) {
                            Icon(
                                Icons.AutoMirrored.Filled.ArrowBack,
                                contentDescription = "Volver",
                                tint = Color.White,
                            )
                        }
                    }
                },
                actions = {
                    IconButton(
                        onClick = { navController.navigate(ConsoleRoutes.Notifications) { launchSingleTop = true } },
                    ) {
                        BadgedBox(
                            badge = {
                                if (unreadCount > 0) {
                                    Badge { Text(if (unreadCount > 99) "99+" else "$unreadCount") }
                                }
                            },
                        ) {
                            Icon(
                                Icons.Default.Notifications,
                                contentDescription = if (unreadCount > 0) "Notificaciones, $unreadCount sin leer" else "Notificaciones",
                                tint = Color.White,
                            )
                        }
                    }
                    FilledTonalButton(
                        onClick = { showLogoutDialog = true },
                        colors = ButtonDefaults.filledTonalButtonColors(
                            containerColor = Color(0xFFFFE4E6),
                            contentColor = Color(0xFFDC2626),
                        ),
                        contentPadding = PaddingValues(horizontal = 12.dp, vertical = 0.dp),
                        modifier = Modifier
                            .padding(end = 8.dp)
                            .heightIn(min = 48.dp),
                    ) {
                        Text("Salir", style = MaterialTheme.typography.labelMedium.copy(fontWeight = FontWeight.Bold))
                    }
                },
            )
        },
        bottomBar = {
            if (tabs.size > 1) {
                NxBottomTabBar(
                    tabs = tabs.map { (route, module) -> NxBottomTab(route, module.icon(), module.label) },
                    isSelected = { route ->
                        currentDestination?.hierarchy?.any { it.route == route } == true
                    },
                    onTabSelected = { route ->
                        navController.navigate(route) {
                            popUpTo(startRoute) { saveState = true }
                            launchSingleTop = true
                            restoreState = true
                        }
                    },
                )
            }
        },
    ) { inner ->
        NavHost(
            navController = navController,
            startDestination = startRoute,
            modifier = Modifier.padding(inner),
        ) {
            nxComposable(ConsoleRoutes.Activities) {
                // Core (/erp/pizarra): CEO → pizarra; con equipo → pestañas; resto → lo suyo.
                ActividadesScreen(
                    initialVista = actividadesVista,
                    onOpenActivity = openActivity,
                    onOpenPerson = openPerson,
                    onSelfAssign = openSelfAssign,
                )
            }
            nxComposable(ConsoleRoutes.NewActivity, style = NxNavAnimStyle.Modal) { entry ->
                val rid = entry.arguments?.getString("requestId")?.toLongOrNull()
                val self = entry.arguments?.getString("self") == "true"
                OpsNewActivityScreen(
                    requestId = if (rid != null && rid > 0) rid else null,
                    selfAssign = self,
                    onBack = { navController.popBackStack() },
                    onCreated = { id ->
                        navController.navigate("console/activity/$id") { launchSingleTop = true }
                    },
                )
            }
            nxComposable(ConsoleRoutes.Attendance) {
                val tab = attendanceTab
                ConsoleAttendanceScreen(initialTab = tab)
                // Se consume una vez: al volver a Asistencias después, abre en su pestaña normal.
                LaunchedEffect(tab) { if (tab != null) attendanceTab = null }
            }
            nxComposable(ConsoleRoutes.Chat) {
                ChatScreen(
                    initialChannelId = chatChannelId,
                    initialMessageId = chatMessageId,
                )
            }
            nxComposable(ConsoleRoutes.Clients) {
                ConsoleClientsScreen()
            }
            nxComposable(ConsoleRoutes.MyProfile) {
                MyProfileScreen(
                    onOpenOfflineQueue = {
                        navController.navigate(ConsoleRoutes.OfflineQueue) { launchSingleTop = true }
                    },
                )
            }
            nxComposable(ConsoleRoutes.Notifications, style = NxNavAnimStyle.Push) {
                NotificationsScreen(
                    onBack = { navController.popBackStack() },
                    // El destino pasa por el mismo camino que un push: abre detalle y pestaña.
                    onOpenDestination = { dest -> PendingDeepLink.publish(dest) },
                )
            }
            nxComposable(ConsoleRoutes.OfflineQueue, style = NxNavAnimStyle.Push) {
                OfflineQueueScreen()
            }
            nxComposable(ConsoleRoutes.ActivityDetail, style = NxNavAnimStyle.Push) { entry ->
                val id = entry.arguments?.getString("id")?.toLongOrNull() ?: return@nxComposable
                val tab = entry.arguments?.getString("tab").orEmpty().ifBlank { null }
                ConsoleActivityDetailByIdScreen(
                    activityId = id,
                    onBack = { navController.popBackStack() },
                    initialTabKey = tab,
                )
            }
            nxComposable(ConsoleRoutes.BoardPerson, style = NxNavAnimStyle.Push) { entry ->
                val personId = entry.arguments?.getString("userId")?.toLongOrNull() ?: return@nxComposable
                BoardPersonScreen(
                    userId = personId,
                    onOpenActivity = openActivity,
                    onAssign = {
                        navController.navigate("console/activities/new?requestId=-1") { launchSingleTop = true }
                    },
                )
            }
        }
    }

    if (showLogoutDialog) {
        AlertDialog(
            onDismissRequest = { showLogoutDialog = false },
            title = { Text("Cerrar sesión") },
            text = { Text("¿Deseas cerrar tu sesión actual?") },
            confirmButton = {
                TextButton(onClick = {
                    showLogoutDialog = false
                    onLogout()
                }) { Text("Cerrar sesión") }
            },
            dismissButton = {
                TextButton(onClick = { showLogoutDialog = false }) { Text("Cancelar") }
            },
        )
    }
}
