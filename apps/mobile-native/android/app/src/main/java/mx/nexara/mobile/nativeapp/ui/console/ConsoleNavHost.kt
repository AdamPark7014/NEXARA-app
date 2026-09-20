package mx.nexara.mobile.nativeapp.ui.console

import androidx.compose.foundation.layout.padding
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.Apps
import androidx.compose.material.icons.filled.Assignment
import androidx.compose.material.icons.filled.Business
import androidx.compose.material.icons.filled.Chat
import androidx.compose.material.icons.filled.Notifications
import androidx.compose.material.icons.filled.Person
import androidx.compose.material.icons.filled.Schedule
import androidx.compose.material3.Badge
import androidx.compose.material3.BadgedBox
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
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
import mx.nexara.mobile.nativeapp.ui.console.activities.CoreActivityFormScreen
import mx.nexara.mobile.nativeapp.access.ClientSector
import mx.nexara.mobile.nativeapp.ui.console.clients.ClientDetailScreen
import mx.nexara.mobile.nativeapp.ui.console.clients.ClientsListScreen
import mx.nexara.mobile.nativeapp.ui.console.clients.NewClientScreen
import mx.nexara.mobile.nativeapp.ui.console.screens.ConsoleAttendanceScreen
import mx.nexara.mobile.nativeapp.ui.console.more.ModulePlaceholderScreen
import mx.nexara.mobile.nativeapp.ui.console.more.MoreHubScreen
import mx.nexara.mobile.nativeapp.ui.console.screens.MyProfileScreen
import mx.nexara.mobile.nativeapp.ui.console.vehiculos.VehiculosScreen
import mx.nexara.mobile.nativeapp.ui.enterprise.NxBottomTab
import mx.nexara.mobile.nativeapp.ui.enterprise.NxBottomTabBar
import mx.nexara.mobile.nativeapp.ui.enterprise.NxNavAnimStyle
import mx.nexara.mobile.nativeapp.ui.enterprise.NxBrandTopAppBarColors
import mx.nexara.mobile.nativeapp.ui.enterprise.nxComposable
import mx.nexara.mobile.nativeapp.ui.shared.NotificationsScreen
import mx.nexara.mobile.nativeapp.ui.shared.OfflineQueueScreen

internal object ConsoleRoutes {
    const val Activities = "console/activities"
    const val Attendance = "console/attendance"
    const val Chat = "console/chat"
    const val Clients = "console/clients"

    /** Ficha del cliente (`/erp/clientes/:id`); es la ruta que arma [DeepLinkNavigation]. */
    const val ClientDetail = "console/clients/{id}"

    /**
     * Alta de cliente (`/erp/clientes/nuevo?sector=`). No cuelga de
     * `console/clients/` para no competir con [ClientDetail] al resolver la ruta.
     */
    const val NewClient = "console/clients-new?sector={sector}"

    /** Marca en el padrón: la ficha cambió o eliminó un cliente y la lista debe recargarse. */
    const val CLIENTS_CHANGED_KEY = "clientes_cambiaron"

    const val MyProfile = "console/my-profile"

    /** «Más»: el resto de Core que el rol puede abrir ([CoreExtraModule]). */
    const val More = "console/more"

    /** Módulo de «Más» sin pantalla propia todavía: se abre en la web. */
    const val ModulePlaceholder = "console/more/{key}"

    fun modulePlaceholder(key: String): String = "console/more/$key"

    /** Vehículos: ya tiene pantalla nativa (solicitar, salida y regreso con fotos). */
    const val Vehiculos = "console/vehiculos"

    /**
     * A dónde lleva un módulo de «Más»: su pantalla nativa si ya existe, si no
     * la ficha «Disponible pronto» con el enlace a la web.
     */
    fun forExtra(module: CoreExtraModule): String = when (module) {
        CoreExtraModule.VEHICULOS -> Vehiculos
        else -> modulePlaceholder(module.key)
    }

    const val Notifications = "console/notifications"
    const val OfflineQueue = "console/offline-queue"
    const val ActivityDetail = "console/activity/{id}?tab={tab}"
    /**
     * Alta Core: `self=true` = /erp/mis-actividades/nueva; `userId` = /erp/pizarra/:userId/asignar.
     */
    const val NewActivity = "console/activities/new?self={self}&userId={userId}"

    fun clientDetail(id: Long): String = "console/clients/$id"

    fun newClient(sectorSlug: String?): String = "console/clients-new?sector=${sectorSlug.orEmpty()}"

    fun selfAssign(): String = "console/activities/new?self=true&userId=-1"

    fun assignTo(userId: Long): String = "console/activities/new?self=false&userId=$userId"

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
    val user = remember { authRepo.loadSession() }
    val navController = rememberNavController()
    var chatChannelId by remember { mutableStateOf<Long?>(null) }
    var chatMessageId by remember { mutableStateOf<Long?>(null) }
    /** `?vista=mias|equipo` que llegó por deep link a Actividades. */
    var actividadesVista by remember { mutableStateOf<String?>(null) }
    /** `comidas` cuando un aviso de hora de comida abre Asistencias. */
    var attendanceTab by remember { mutableStateOf<String?>(null) }
    /** `?nueva=` de la web: la actividad recién auto-asignada se resalta en Mis actividades. */
    var nuevaActividadId by remember { mutableStateOf<Long?>(null) }
    var unreadCount by remember { mutableIntStateOf(0) }

    val modules = remember(user) { CoreMenu.modulesFor(user) }
    /** «Más»: el resto de Core (cotizaciones, proyectos, KPIs, almacén, herramientas, vehículos, organigrama). */
    val extras = remember(user) { CoreMenu.extraModulesFor(user) }
    val tabs = remember(modules) { modules.map { ConsoleRoutes.forModule(it) to it } }
    val startRoute = tabs.firstOrNull()?.first ?: ConsoleRoutes.MyProfile

    val backStackEntry by navController.currentBackStackEntryAsState()
    val currentDestination = backStackEntry?.destination
    val currentRoute = currentDestination?.route

    // Campana: al entrar, cada 45 s y al volver de cualquier pantalla.
    val rutaAnterior = remember { arrayOfNulls<String>(1) }
    LaunchedEffect(currentRoute) {
        val vieneDeBandeja = rutaAnterior[0] == ConsoleRoutes.Notifications
        rutaAnterior[0] = currentRoute
        // Abrir la bandeja la da por vista (NotificationsScreen llama a «leer todo»):
        // el contador vuelve a cero y no se consulta mientras sigas ahí.
        if (currentRoute == ConsoleRoutes.Notifications) {
            unreadCount = 0
            return@LaunchedEffect
        }
        // Al salir de la bandeja se da tiempo a que termine ese «leer todo» antes de contar.
        if (vieneDeBandeja) delay(1_500)
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

        // Módulo de «Más» (aún sin pantalla propia): su ficha, si el rol lo tiene.
        val extra = CoreExtraModule.fromKey(link.key)
        if (extra != null) {
            val ruta = if (extra in extras) ConsoleRoutes.forExtra(extra) else startRoute
            navController.navigate(ruta) { launchSingleTop = true }
            return@LaunchedEffect
        }

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
        navController.navigate(ConsoleRoutes.selfAssign()) { launchSingleTop = true }
    }

    val currentTitle = when (currentRoute) {
        ConsoleRoutes.Activities -> "Actividades"
        ConsoleRoutes.Attendance -> "Asistencias"
        ConsoleRoutes.Chat -> "Chat"
        ConsoleRoutes.Clients -> "Clientes"
        ConsoleRoutes.ClientDetail -> "Cliente"
        ConsoleRoutes.NewClient -> "Nuevo cliente"
        ConsoleRoutes.MyProfile -> "Mi perfil"
        ConsoleRoutes.More, ConsoleRoutes.ModulePlaceholder -> "Más"
        ConsoleRoutes.Vehiculos -> "Vehículos"
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
                colors = NxBrandTopAppBarColors(),
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
                    // «Más»: el resto de Core. No cabe una sexta pestaña abajo (Material deja 5),
                    // así que vive aquí, junto a la campana.
                    if (extras.isNotEmpty() && currentRoute != ConsoleRoutes.More) {
                        IconButton(
                            onClick = { navController.navigate(ConsoleRoutes.More) { launchSingleTop = true } },
                        ) {
                            Icon(Icons.Default.Apps, contentDescription = "Más módulos", tint = Color.White)
                        }
                    }
                    // Sin «Salir» aquí: cerrar sesión vive al final de Mi perfil, con confirmación.
                    // En la bandeja no hace falta la campana: abrirla ya da todo por visto.
                    if (currentRoute != ConsoleRoutes.Notifications) {
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
                    highlightActivityId = nuevaActividadId,
                )
                // El resaltado dura mientras sigues en la lista; al salir se olvida.
                DisposableEffect(Unit) { onDispose { nuevaActividadId = null } }
            }
            nxComposable(ConsoleRoutes.NewActivity, style = NxNavAnimStyle.Modal) { entry ->
                val self = entry.arguments?.getString("self") == "true"
                val targetId = entry.arguments?.getString("userId")?.toLongOrNull()?.takeIf { it > 0L }
                CoreActivityFormScreen(
                    selfAssign = self,
                    targetUserId = targetId,
                    onCancel = { navController.popBackStack() },
                    onCreated = { id ->
                        if (self) {
                            // Web: /erp/pizarra?vista=mias&nueva=:id — de vuelta a la lista, resaltada.
                            actividadesVista = "mias"
                            nuevaActividadId = id
                            if (!navController.popBackStack(ConsoleRoutes.Activities, inclusive = false)) {
                                navController.navigate(ConsoleRoutes.Activities) { launchSingleTop = true }
                            }
                        } else {
                            // Web: /erp/pizarra/:userId — de vuelta al día de la persona (se recarga).
                            navController.popBackStack()
                        }
                    },
                    onAssignOther = { otherId -> navController.navigate(ConsoleRoutes.assignTo(otherId)) },
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
            nxComposable(ConsoleRoutes.Clients) { entry ->
                val recargar by entry.savedStateHandle
                    .getStateFlow(ConsoleRoutes.CLIENTS_CHANGED_KEY, false)
                    .collectAsState()
                ClientsListScreen(
                    refreshRequested = recargar,
                    onRefreshConsumed = { entry.savedStateHandle[ConsoleRoutes.CLIENTS_CHANGED_KEY] = false },
                    onOpenClient = { clientId ->
                        navController.navigate(ConsoleRoutes.clientDetail(clientId)) {
                            launchSingleTop = true
                        }
                    },
                    onNewClient = { sector ->
                        navController.navigate(ConsoleRoutes.newClient(sector?.slug)) {
                            launchSingleTop = true
                        }
                    },
                )
            }
            nxComposable(ConsoleRoutes.ClientDetail, style = NxNavAnimStyle.Push) { entry ->
                val clientId = entry.arguments?.getString("id")?.toLongOrNull() ?: return@nxComposable
                // El padrón que quedó debajo se entera por su savedStateHandle y se recarga al volver.
                val marcarPadron: () -> Unit = {
                    runCatching { navController.getBackStackEntry(ConsoleRoutes.Clients) }
                        .getOrNull()
                        ?.savedStateHandle
                        ?.set(ConsoleRoutes.CLIENTS_CHANGED_KEY, true)
                }
                ClientDetailScreen(
                    clientId = clientId,
                    onBack = { navController.popBackStack() },
                    onChanged = marcarPadron,
                    onDeleted = {
                        marcarPadron()
                        if (!navController.popBackStack(ConsoleRoutes.Clients, inclusive = false)) {
                            // Llegó por un enlace, sin padrón debajo: se abre uno nuevo (ya viene fresco).
                            navController.popBackStack()
                            navController.navigate(ConsoleRoutes.Clients) {
                                popUpTo(startRoute)
                                launchSingleTop = true
                            }
                        }
                    },
                )
            }
            nxComposable(ConsoleRoutes.NewClient, style = NxNavAnimStyle.Modal) { entry ->
                val slug = entry.arguments?.getString("sector").orEmpty()
                NewClientScreen(
                    presetSector = ClientSector.fromApi(slug),
                    onBack = { navController.popBackStack() },
                    onCreated = { clientId ->
                        // Igual que la web: del alta se sale a la ficha recién creada.
                        navController.popBackStack()
                        navController.navigate(ConsoleRoutes.clientDetail(clientId)) {
                            launchSingleTop = true
                        }
                    },
                )
            }
            nxComposable(ConsoleRoutes.MyProfile) {
                MyProfileScreen(
                    onOpenOfflineQueue = {
                        navController.navigate(ConsoleRoutes.OfflineQueue) { launchSingleTop = true }
                    },
                    onLogout = onLogout,
                )
            }
            nxComposable(ConsoleRoutes.More, style = NxNavAnimStyle.Push) {
                MoreHubScreen(
                    modules = extras,
                    onOpen = { module ->
                        navController.navigate(ConsoleRoutes.forExtra(module)) {
                            launchSingleTop = true
                        }
                    },
                )
            }
            nxComposable(ConsoleRoutes.Vehiculos, style = NxNavAnimStyle.Push) {
                VehiculosScreen()
            }
            nxComposable(ConsoleRoutes.ModulePlaceholder, style = NxNavAnimStyle.Push) { entry ->
                val module = CoreExtraModule.fromKey(entry.arguments?.getString("key"))
                    ?.takeIf { it in extras }
                    ?: return@nxComposable
                ModulePlaceholderScreen(module)
            }
            nxComposable(ConsoleRoutes.Notifications, style = NxNavAnimStyle.Push) {
                NotificationsScreen(
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
                        navController.navigate(ConsoleRoutes.assignTo(personId)) { launchSingleTop = true }
                    },
                )
            }
        }
    }
}
