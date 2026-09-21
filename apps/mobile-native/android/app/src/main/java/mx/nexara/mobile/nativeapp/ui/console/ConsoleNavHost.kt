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
import androidx.navigation.NavHostController
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.currentBackStackEntryAsState
import androidx.navigation.compose.rememberNavController
import kotlinx.coroutines.delay
import mx.nexara.mobile.nativeapp.access.CoreKeys
import mx.nexara.mobile.nativeapp.access.DeepLinkDestination
import mx.nexara.mobile.nativeapp.access.DeepLinkNavigation
import mx.nexara.mobile.nativeapp.access.PanelId
import mx.nexara.mobile.nativeapp.data.AuthRepository
import mx.nexara.mobile.nativeapp.data.SessionRevision
import mx.nexara.mobile.nativeapp.data.notifications.NotificationsRepository
import mx.nexara.mobile.nativeapp.navigation.PendingDeepLink
import mx.nexara.mobile.nativeapp.navigation.PendingModuleLink
import mx.nexara.mobile.nativeapp.ui.chat.ChatScreen
import mx.nexara.mobile.nativeapp.ui.console.activities.ActividadesScreen
import mx.nexara.mobile.nativeapp.ui.console.activities.BoardPersonScreen
import mx.nexara.mobile.nativeapp.ui.console.activities.ConsoleActivityDetailByIdScreen
import mx.nexara.mobile.nativeapp.ui.console.activities.CoreActivityFormScreen
import mx.nexara.mobile.nativeapp.ui.console.aprobaciones.AprobacionesScreen
import mx.nexara.mobile.nativeapp.access.ClientSector
import mx.nexara.mobile.nativeapp.ui.console.clients.ClientDetailScreen
import mx.nexara.mobile.nativeapp.ui.console.clients.ClientsListScreen
import mx.nexara.mobile.nativeapp.ui.console.clients.NewClientScreen
import mx.nexara.mobile.nativeapp.ui.console.cotizaciones.CotizacionDetalleScreen
import mx.nexara.mobile.nativeapp.ui.console.cotizaciones.CotizacionesScreen
import mx.nexara.mobile.nativeapp.ui.console.gastos.GastosScreen
import mx.nexara.mobile.nativeapp.ui.console.herramientas.HerramientasScreen
import mx.nexara.mobile.nativeapp.ui.console.screens.ConsoleAttendanceScreen
import mx.nexara.mobile.nativeapp.ui.console.more.AlmacenScreen
import mx.nexara.mobile.nativeapp.ui.console.more.KpisEquipoScreen
import mx.nexara.mobile.nativeapp.ui.console.more.ModulePlaceholderScreen
import mx.nexara.mobile.nativeapp.ui.console.more.MoreHubScreen
import mx.nexara.mobile.nativeapp.ui.console.more.OrgchartScreen
import mx.nexara.mobile.nativeapp.ui.console.more.ProyectosScreen
import mx.nexara.mobile.nativeapp.ui.console.pagos.PagosEmpleadosScreen
import mx.nexara.mobile.nativeapp.ui.console.screens.MyProfileScreen
import mx.nexara.mobile.nativeapp.ui.console.vehiculos.VehiculosScreen
import mx.nexara.mobile.nativeapp.ui.console.viaticos.NuevoViaticoScreen
import mx.nexara.mobile.nativeapp.ui.console.viaticos.RepartoViaticoScreen
import mx.nexara.mobile.nativeapp.ui.console.viaticos.ViaticoDetalleScreen
import mx.nexara.mobile.nativeapp.ui.console.viaticos.ViaticosScreen
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

    /** Cotizaciones (`/erp/cotizaciones`) — consulta: lista, detalle y PDF. */
    const val Cotizaciones = "console/cotizaciones"

    /** Una cotización por dentro (`/erp/cotizaciones/:id`). */
    const val CotizacionDetalle = "console/cotizaciones/{id}"

    fun cotizacionDetalle(id: Long): String = "console/cotizaciones/$id"

    /** KPIs del equipo (`/erp/asistencias/indicadores`) — consulta del periodo. */
    const val KpisEquipo = "console/kpis-equipo"

    /** Organigrama (`/erp/organigrama`) — se recorre por niveles, no es el árbol. */
    const val Organigrama = "console/organigrama"

    /** Proyectos (`/erp/proyectos`) — tarjetas por salud. */
    const val Proyectos = "console/proyectos"

    /** Almacén (`/erp/almacen`) — existencias y bajo mínimo, solo consulta. */
    const val Almacen = "console/almacen"

    /** Herramientas (`/erp/almacen/herramientas`) — mi kit, mis préstamos y pedir más plazo. */
    const val Herramientas = "console/herramientas"

    /**
     * Pagos a empleados (`/erp/finance/employee-payments`) — consulta.
     *
     * Solo la lista: capturar un pago, autorizarlo, marcarlo pagado o anularlo
     * piden `CONTABILIDAD_MANAGE` y asientan contabilidad, así que se quedan en
     * la computadora.
     */
    const val PagosEmpleados = "console/pagos-empleados"

    /**
     * Gastos administrativos (`/erp/finance/expenses`) — registrar con la foto
     * del ticket, autorizar y marcar pagado.
     *
     * Una sola ruta: la ficha de un gasto y el alta son hojas de la misma
     * pantalla, porque de ninguna de las dos se sale a otro sitio.
     */
    const val Gastos = "console/gastos"

    /**
     * Aprobaciones (`/erp/approvals`) — el único módulo de «Más» que **decide**.
     *
     * Aquí sí se escribe: aprobar o rechazar lo que está detenido esperando tu
     * firma. Es lo que más gana al salir de la computadora, porque quien
     * autoriza casi nunca está sentado y cada solicitud parada bloquea a alguien.
     */
    const val Aprobaciones = "console/aprobaciones"

    /** Viáticos: mis anticipos y, para quien autoriza, los de su gente. */
    const val Viaticos = "console/viaticos"

    /**
     * Alta de viático con foto del ticket.
     *
     * No cuelga de `console/viaticos/` para no competir con [ViaticoDetalle] al
     * resolver la ruta (mismo motivo que [NewClient]).
     */
    const val NuevoViatico = "console/viaticos-nuevo"

    const val ViaticoDetalle = "console/viaticos/{id}"

    /** Repartir el viático entre actividades; la suma cuadra al centavo. */
    const val RepartoViatico = "console/viaticos/{id}/reparto"

    /** Marca en la lista: un viático cambió (alta, decisión, comprobación) y toca releer. */
    const val VIATICOS_CHANGED_KEY = "viaticos_cambiaron"

    fun viaticoDetalle(id: Long): String = "console/viaticos/$id"

    fun repartoViatico(id: Long): String = "console/viaticos/$id/reparto"

    /**
     * A dónde lleva un módulo de «Más»: su pantalla nativa si ya existe, si no
     * la ficha con el enlace a la web.
     *
     * En la ficha queda Documentos, que entró al menú
     * con la segunda ola y todavía no tienen pantalla. El `else` también protege
     * el día que se añada un módulo nuevo a [CoreExtraModule]: cae ahí y no
     * rompe la compilación de una pantalla que todavía no existe.
     */
    fun forExtra(module: CoreExtraModule): String = when (module) {
        CoreExtraModule.VEHICULOS -> Vehiculos
        CoreExtraModule.KPIS_EQUIPO -> KpisEquipo
        CoreExtraModule.ORGANIGRAMA -> Organigrama
        CoreExtraModule.PROYECTOS -> Proyectos
        CoreExtraModule.ALMACEN -> Almacen
        CoreExtraModule.HERRAMIENTAS -> Herramientas
        CoreExtraModule.VIATICOS -> Viaticos
        CoreExtraModule.COTIZACIONES -> Cotizaciones
        CoreExtraModule.PAGOS_EMPLEADOS -> PagosEmpleados
        CoreExtraModule.GASTOS -> Gastos
        CoreExtraModule.APROBACIONES -> Aprobaciones
        else -> modulePlaceholder(module.key)
    }

    /** ¿Este módulo de «Más» ya se abre dentro de la app? */
    fun tienePantallaNativa(module: CoreExtraModule): Boolean =
        !forExtra(module).startsWith("console/more/")

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

    /**
     * La misma sesión, pero releída cuando se guarda una versión nueva.
     *
     * La sesión se enriquece DESPUÉS del login: `me/navigation` llega segundos
     * más tarde y es quien trae la lista de módulos. Leyéndola una sola vez, el
     * menú de «Más» se quedaba recortado a los cuatro que tiene todo el personal
     * —sin Cotizaciones, Proyectos, Almacén ni KPIs— hasta que se cerraba la app.
     *
     * **Sólo alimenta «Más».** Las pestañas de abajo y el destino inicial del
     * grafo siguen saliendo de la primera lectura a propósito: cambiar
     * `startDestination` con el NavHost ya vivo deja la pila incoherente y las
     * pestañas dejan de responder —probado: con esto enchufado a `modules`, el
     * botón de Chat no abría nada y ninguna pestaña quedaba marcada—.
     */
    val revisionSesion by SessionRevision.valor.collectAsState()
    val userAlDia = remember(revisionSesion) { authRepo.loadSession() } ?: user
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
    val extras = remember(userAlDia) { CoreMenu.extraModulesFor(userAlDia) }
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

        // Módulo de «Más»: su pantalla nativa o su ficha, si el rol lo tiene.
        val extra = CoreExtraModule.fromKey(link.key)
        if (extra != null) {
            val ruta = when {
                extra !in extras -> startRoute
                // El aviso de un viático trae su id: abre ESE viático, no la
                // lista. Es la diferencia entre «te autorizaron algo» y saber qué.
                extra == CoreExtraModule.VIATICOS && (link.entityId ?: 0L) > 0L ->
                    ConsoleRoutes.viaticoDetalle(link.entityId!!)
                // Igual con una cotización: el aviso de «aprobada» o
                // «rechazada» trae su id, y `/erp/cotizaciones/:id` también.
                // Abrir la lista y dejar que la busque sería perder el enlace.
                extra == CoreExtraModule.COTIZACIONES && (link.entityId ?: 0L) > 0L ->
                    ConsoleRoutes.cotizacionDetalle(link.entityId!!)
                else -> ConsoleRoutes.forExtra(extra)
            }
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
        ConsoleRoutes.KpisEquipo -> "KPIs del equipo"
        ConsoleRoutes.Organigrama -> "Organigrama"
        ConsoleRoutes.Proyectos -> "Proyectos"
        ConsoleRoutes.Almacen -> "Almacén"
        ConsoleRoutes.Herramientas -> "Herramientas"
        ConsoleRoutes.Cotizaciones -> "Cotizaciones"
        ConsoleRoutes.CotizacionDetalle -> "Cotización"
        ConsoleRoutes.PagosEmpleados -> "Pagos a empleados"
        ConsoleRoutes.Aprobaciones -> "Aprobaciones"
        ConsoleRoutes.Viaticos -> "Viáticos"
        ConsoleRoutes.NuevoViatico -> "Pedir viático"
        ConsoleRoutes.ViaticoDetalle -> "Viático"
        ConsoleRoutes.RepartoViatico -> "Repartir viático"
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
            // Los cuatro de solo consulta. Cada uno comprueba su permiso igual que
            // el resto de «Más»: sin el módulo en el rol, de vuelta a la casa.
            nxComposable(ConsoleRoutes.KpisEquipo, style = NxNavAnimStyle.Push) {
                if (CoreExtraModule.KPIS_EQUIPO in extras) KpisEquipoScreen()
            }
            nxComposable(ConsoleRoutes.Organigrama, style = NxNavAnimStyle.Push) {
                if (CoreExtraModule.ORGANIGRAMA in extras) OrgchartScreen()
            }
            nxComposable(ConsoleRoutes.Proyectos, style = NxNavAnimStyle.Push) {
                if (CoreExtraModule.PROYECTOS in extras) ProyectosScreen()
            }
            nxComposable(ConsoleRoutes.Almacen, style = NxNavAnimStyle.Push) {
                if (CoreExtraModule.ALMACEN in extras) AlmacenScreen()
            }
            // Herramientas: mi kit, mis préstamos y pedir más plazo. Comprueba el
            // módulo igual que el resto de «Más»; el permiso de verdad
            // (`tools.view`) lo decide el API, y su 403 se enseña tal cual —la
            // pantalla aguanta que falle solo una de las dos listas.
            nxComposable(ConsoleRoutes.Herramientas, style = NxNavAnimStyle.Push) {
                if (CoreExtraModule.HERRAMIENTAS in extras) HerramientasScreen()
            }
            // Gastos: registrar con la foto del ticket donde se pagó, y
            // autorizar o marcar pagado desde donde estés. Comprueba el módulo
            // igual que el resto de «Más»; los permisos de verdad
            // (`contabilidad.view` para ver y registrar, `contabilidad.manage`
            // para decidir) los aplica el API, y su 403 se enseña tal cual.
            nxComposable(ConsoleRoutes.Gastos, style = NxNavAnimStyle.Push) {
                if (CoreExtraModule.GASTOS in extras) GastosScreen()
            }
            // Cotizaciones: consulta. La lista y el detalle comprueban el
            // módulo igual que el resto de «Más»; el permiso de verdad
            // (`cotizaciones.access`) lo decide el API, y su 403 se enseña tal
            // cual.
            nxComposable(ConsoleRoutes.Cotizaciones, style = NxNavAnimStyle.Push) {
                if (CoreExtraModule.COTIZACIONES in extras) {
                    CotizacionesScreen(
                        onAbrirCotizacion = { id ->
                            navController.navigate(ConsoleRoutes.cotizacionDetalle(id)) {
                                launchSingleTop = true
                            }
                        },
                    )
                }
            }
            nxComposable(ConsoleRoutes.CotizacionDetalle, style = NxNavAnimStyle.Push) { entry ->
                val id = entry.arguments?.getString("id")?.toLongOrNull() ?: return@nxComposable
                if (CoreExtraModule.COTIZACIONES in extras) CotizacionDetalleScreen(cotizacionId = id)
            }
            // Pagos a empleados: consulta. Comprueba el módulo igual que el resto
            // de «Más»; el permiso de verdad (`CONTABILIDAD_VIEW`) y hasta dónde
            // llega el alcance —toda la empresa o solo el departamento— los
            // decide el API, y su 403 se enseña tal cual.
            nxComposable(ConsoleRoutes.PagosEmpleados, style = NxNavAnimStyle.Push) {
                if (CoreExtraModule.PAGOS_EMPLEADOS in extras) PagosEmpleadosScreen()
            }
            // Aprobaciones: aquí sí se decide. Comprueba el módulo igual que el
            // resto de «Más»; quién puede firmar **qué paso** lo decide el API
            // (`workflow.service.ts` exige ser el aprobador de ese paso, por
            // usuario o por rol), y su 403 se enseña tal cual.
            nxComposable(ConsoleRoutes.Aprobaciones, style = NxNavAnimStyle.Push) {
                if (CoreExtraModule.APROBACIONES in extras) AprobacionesScreen()
            }
            // Viáticos: el técnico pide desde la calle y la dirección resuelve
            // desde donde esté. La lista se recarga sola cuando el alta, una
            // decisión o una comprobación la dejan desfasada.
            nxComposable(ConsoleRoutes.Viaticos, style = NxNavAnimStyle.Push) { entry ->
                val recargar by entry.savedStateHandle
                    .getStateFlow(ConsoleRoutes.VIATICOS_CHANGED_KEY, false)
                    .collectAsState()
                ViaticosScreen(
                    onAbrirViatico = { id ->
                        navController.navigate(ConsoleRoutes.viaticoDetalle(id)) { launchSingleTop = true }
                    },
                    onNuevoViatico = {
                        navController.navigate(ConsoleRoutes.NuevoViatico) { launchSingleTop = true }
                    },
                    recargar = recargar,
                    onRecargaConsumida = {
                        entry.savedStateHandle[ConsoleRoutes.VIATICOS_CHANGED_KEY] = false
                    },
                )
            }
            nxComposable(ConsoleRoutes.NuevoViatico, style = NxNavAnimStyle.Modal) {
                NuevoViaticoScreen(
                    onCancelar = { navController.popBackStack() },
                    onCreado = {
                        marcarViaticosCambiaron(navController)
                        navController.popBackStack()
                    },
                )
            }
            nxComposable(ConsoleRoutes.ViaticoDetalle, style = NxNavAnimStyle.Push) { entry ->
                val id = entry.arguments?.getString("id")?.toLongOrNull() ?: return@nxComposable
                val recargar by entry.savedStateHandle
                    .getStateFlow(ConsoleRoutes.VIATICOS_CHANGED_KEY, false)
                    .collectAsState()
                ViaticoDetalleScreen(
                    viaticoId = id,
                    onRepartir = { viaticoId ->
                        navController.navigate(ConsoleRoutes.repartoViatico(viaticoId)) {
                            launchSingleTop = true
                        }
                    },
                    onCambio = { marcarViaticosCambiaron(navController) },
                    recargar = recargar,
                    onRecargaConsumida = {
                        entry.savedStateHandle[ConsoleRoutes.VIATICOS_CHANGED_KEY] = false
                    },
                )
            }
            nxComposable(ConsoleRoutes.RepartoViatico, style = NxNavAnimStyle.Push) { entry ->
                val id = entry.arguments?.getString("id")?.toLongOrNull() ?: return@nxComposable
                RepartoViaticoScreen(
                    viaticoId = id,
                    onListo = {
                        marcarViaticosCambiaron(navController)
                        // El detalle que quedó debajo tiene el reparto viejo en
                        // pantalla: se le avisa antes de volver a él.
                        navController.previousBackStackEntry
                            ?.savedStateHandle
                            ?.set(ConsoleRoutes.VIATICOS_CHANGED_KEY, true)
                        navController.popBackStack()
                    },
                )
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

/**
 * Avisa a la lista de Viáticos que quedó desfasada.
 *
 * Igual que el padrón de clientes: quien cambia algo (alta, autorización,
 * comprobación, reparto) marca la pantalla que quedó debajo, y ésta relee al
 * volver. Sin esto el técnico regresa de pedir un viático y no lo ve, o el jefe
 * autoriza y la lista le sigue diciendo «Pendiente».
 *
 * Si la lista no está en la pila —se llegó por un aviso directo al detalle— no
 * hay nada que marcar y no pasa nada.
 */
private fun marcarViaticosCambiaron(navController: NavHostController) {
    runCatching { navController.getBackStackEntry(ConsoleRoutes.Viaticos) }
        .getOrNull()
        ?.savedStateHandle
        ?.set(ConsoleRoutes.VIATICOS_CHANGED_KEY, true)
}
