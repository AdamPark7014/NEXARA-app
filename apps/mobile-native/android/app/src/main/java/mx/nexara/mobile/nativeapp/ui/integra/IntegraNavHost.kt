package mx.nexara.mobile.nativeapp.ui.integra

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.navigation.NavType
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.currentBackStackEntryAsState
import androidx.navigation.compose.rememberNavController
import androidx.navigation.navArgument
import mx.nexara.mobile.nativeapp.access.ModulePanelMap
import mx.nexara.mobile.nativeapp.access.PanelId
import mx.nexara.mobile.nativeapp.data.AuthRepository
import mx.nexara.mobile.nativeapp.data.SessionUser
import mx.nexara.mobile.nativeapp.navigation.PendingDeepLink
import mx.nexara.mobile.nativeapp.ui.enterprise.NxColors
import mx.nexara.mobile.nativeapp.ui.enterprise.NxDimens
import mx.nexara.mobile.nativeapp.ui.enterprise.NxModuleScaffold
import mx.nexara.mobile.nativeapp.ui.integra.detection.IntegraDetectionCamerasScreen
import mx.nexara.mobile.nativeapp.ui.integra.detection.IntegraDetectionCapabilitiesScreen
import mx.nexara.mobile.nativeapp.ui.integra.detection.IntegraDetectionRoutes
import mx.nexara.mobile.nativeapp.ui.integra.detection.IntegraDetectionTuningScreen
import mx.nexara.mobile.nativeapp.ui.integra.detection.IntegraNewSiteScreen
import mx.nexara.mobile.nativeapp.ui.integra.detection.IntegraSettingsScreen
import mx.nexara.mobile.nativeapp.ui.integra.detection.IntegraSiteDetailScreen
import mx.nexara.mobile.nativeapp.ui.integra.governance.IntegraAuditScreen
import mx.nexara.mobile.nativeapp.ui.integra.governance.IntegraGovernanceRoutes
import mx.nexara.mobile.nativeapp.ui.integra.governance.IntegraMyProfileScreen
import mx.nexara.mobile.nativeapp.ui.integra.governance.IntegraNotificationsCenterScreen
import mx.nexara.mobile.nativeapp.ui.integra.map.IntegraDashboardScreen
import mx.nexara.mobile.nativeapp.ui.integra.map.IntegraMapRoutes
import mx.nexara.mobile.nativeapp.ui.integra.map.IntegraMapScreen
import mx.nexara.mobile.nativeapp.ui.integra.schedules.IntegraEspaciosScreen
import mx.nexara.mobile.nativeapp.ui.integra.schedules.IntegraSchedulesScreen
import mx.nexara.mobile.nativeapp.ui.integra.schedules.SchedulesRoutes
import mx.nexara.mobile.nativeapp.ui.integra.vehicles.IntegraVehiclesRoutes
import mx.nexara.mobile.nativeapp.ui.integra.vehicles.integraVehiclesGraph
import mx.nexara.mobile.nativeapp.ui.integra.video.IntegraCameraDetailScreen
import mx.nexara.mobile.nativeapp.ui.integra.video.IntegraVideoRoutes
import mx.nexara.mobile.nativeapp.ui.integra.video.IntegraVideoWallScreen

/** Claves INTEGRA visibles: catálogo ∩ navModuleKeys (soft si nav no trae integra-*). */
private fun allowedIntegraKeys(user: SessionUser?): Set<String> {
    val all = ModulePanelMap.integraKeysFor(PanelId.INTEGRA) ?: emptySet()
    if (user == null || user.isSuperAdmin) return all
    val navIntegra = user.navModuleKeys
        ?.filter { it.startsWith("integra-", ignoreCase = true) }
        ?.toSet()
        .orEmpty()
    if (navIntegra.isEmpty()) return all
    val clipped = all.intersect(navIntegra)
    return clipped.ifEmpty { all }
}

private const val Home = "integra/home"
private const val Access = "integra/access"
private const val Events = "integra/events"
private const val People = "integra/people"
private const val PersonDetail = "integra/people/{personId}"
private const val Attendance = "integra/attendance"
private const val Visitors = "integra/visitors"
private const val Alarms = "integra/alarms"
private const val Occupancy = "integra/occupancy"
private const val Devices = "integra/devices"

/**
 * Ruta de una clave de módulo o de un enlace profundo.
 *
 * Los cinco paquetes nuevos (video, vehículos, horarios, detección, gobierno)
 * traen su propio resolutor y se consultan ANTES que la tabla local: cada uno
 * conoce sus alias y así añadir un módulo no obliga a editar este `when`. El
 * que devuelve `null` cede el turno al siguiente.
 *
 * `integra-sites` cae en el resolutor de detección, que lo manda a la pantalla
 * de Ajustes —alta, etiqueta, activación, módulos por sitio, sincronización y
 * baja—, superconjunto de la lista de solo lectura que había antes.
 */
internal fun integraRouteForKey(key: String): String {
    IntegraVehiclesRoutes.routeParaClave(key)?.let { return it }
    IntegraGovernanceRoutes.rutaDeClave(key)?.let { return it }
    IntegraDetectionRoutes.ROUTE_BY_KEY[key.lowercase()]?.let { return it }
    return when (key.lowercase()) {
        "integra-access", "access", "acceso", "puertas", "doors" -> Access
        "integra-events", "events", "eventos" -> Events
        "integra-people", "people", "personas" -> People
        "integra-attendance", "attendance", "asistencia" -> Attendance
        "integra-visitors", "visitors", "visitantes" -> Visitors
        "integra-alarms", "alarms", "alarmas" -> Alarms
        "integra-occupancy", "occupancy", "en-sitio", "presencia" -> Occupancy
        "integra-devices", "devices", "equipos" -> Devices
        "integra-video", "video", "camaras", "cámaras", "muro" -> IntegraVideoRoutes.WALL
        "integra-schedules", "schedules", "horarios" -> SchedulesRoutes.SCHEDULES
        "integra-espacios", "espacios", "spaces" -> SchedulesRoutes.ESPACIOS
        "integra-map", "map", "plano", "mapa" -> IntegraMapRoutes.MAP
        "integra-dashboard", "dashboard", "panorama", "tablero" -> IntegraMapRoutes.DASHBOARD
        else -> Home
    }
}

private fun personDetailRoute(personId: String) = "integra/people/$personId"

/**
 * Títulos de video y detección.
 *
 * Estos dos paquetes dejaron sus títulos en la documentación del contrato en vez
 * de en una función, así que se traducen aquí. Se compara contra el PATRÓN de
 * ruta (`…/{cameraId}`), que es lo que devuelve la pila de navegación, no contra
 * la ruta ya resuelta.
 */
private fun videoTitleForRoute(route: String?): String? = when (route) {
    IntegraVideoRoutes.WALL -> IntegraVideoRoutes.TITLE_WALL
    IntegraVideoRoutes.CAMERA_DETAIL -> IntegraVideoRoutes.TITLE_DETAIL
    else -> null
}

private fun detectionTitleForRoute(route: String?): String? = when (route) {
    IntegraDetectionRoutes.DETECTION -> "Detección"
    IntegraDetectionRoutes.CAMERA -> "Sintonizar cámara"
    IntegraDetectionRoutes.CAPABILITIES -> "Capacidades del parque"
    IntegraDetectionRoutes.SETTINGS -> "Ajustes INTEGRA"
    IntegraDetectionRoutes.SETTINGS_NEW -> "Nuevo sitio"
    IntegraDetectionRoutes.SETTINGS_SITE -> "Sitio"
    else -> null
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun IntegraNavHost(onExitToPanels: () -> Unit) {
    val context = LocalContext.current
    val session = remember(context) { AuthRepository(context).loadSession() }
    val allowedKeys = remember(session) { allowedIntegraKeys(session) }
    val nav = rememberNavController()
    val entry by nav.currentBackStackEntryAsState()
    val currentRoute = entry?.destination?.route ?: Home

    val deepLinkSignal by PendingDeepLink.signal.collectAsState()
    LaunchedEffect(deepLinkSignal) {
        val link = PendingDeepLink.consumeModuleDestination(PanelId.INTEGRA) ?: return@LaunchedEffect
        if (link.entityId != null && link.key.contains("people", ignoreCase = true)) {
            nav.navigate(personDetailRoute(link.entityId.toString())) { launchSingleTop = true }
            return@LaunchedEffect
        }
        nav.navigate(integraRouteForKey(link.key)) { launchSingleTop = true }
    }

    val showBack = currentRoute != Home
    // Cada paquete nuevo sabe titular sus propias rutas; el `when` local solo
    // cubre las diez pantallas que viven en este módulo.
    val topBarTitle = IntegraVehiclesRoutes.tituloDe(currentRoute)
        ?: SchedulesRoutes.titleForRoute(currentRoute)
        ?: IntegraGovernanceRoutes.tituloDeRuta(currentRoute)
        ?: IntegraMapRoutes.titleForRoute(currentRoute)
        ?: videoTitleForRoute(currentRoute)
        ?: detectionTitleForRoute(currentRoute)
        ?: when {
            currentRoute == Access -> "Control de acceso"
            currentRoute == Events -> "Eventos ACS"
            currentRoute == People -> "Personas"
            currentRoute.startsWith("integra/people/") -> "Detalle de persona"
            currentRoute == Attendance -> "Asistencia ACS"
            currentRoute == Visitors -> "Visitantes"
            currentRoute == Alarms -> "Alarmas SOC"
            currentRoute == Occupancy -> "En sitio ahora"
            currentRoute == Devices -> "Equipos"
            else -> "NEXARA INTEGRA"
        }

    NxModuleScaffold(
        title = topBarTitle,
        showBack = showBack,
        onBack = { nav.popBackStack() },
        onExitToPanels = onExitToPanels,
    ) { padding ->
        NavHost(
            navController = nav,
            startDestination = Home,
            modifier = Modifier.padding(padding),
        ) {
            composable(Home) {
                IntegraHomeScreen(
                    allowedKeys = allowedKeys,
                    onOpenKey = { key ->
                        nav.navigate(integraRouteForKey(key)) { launchSingleTop = true }
                    },
                )
            }
            composable(Access) { IntegraAccessScreen() }
            composable(Events) { IntegraEventsScreen() }
            composable(People) {
                IntegraPeopleScreen(
                    onOpenPerson = { id ->
                        nav.navigate(personDetailRoute(id)) { launchSingleTop = true }
                    },
                )
            }
            composable(
                route = PersonDetail,
                arguments = listOf(navArgument("personId") { type = NavType.StringType }),
            ) { backStack ->
                val personId = backStack.arguments?.getString("personId").orEmpty()
                IntegraPersonDetailScreen(
                    personId = personId,
                    onDeleted = { nav.popBackStack() },
                )
            }
            composable(Attendance) { IntegraAttendanceScreen() }
            composable(Visitors) { IntegraVisitorsScreen() }
            composable(Alarms) { IntegraAlarmsScreen() }
            composable(Occupancy) { IntegraOccupancyScreen() }
            composable(Devices) { IntegraDevicesScreen() }

            // ── Video ─────────────────────────────────────────────────────
            composable(IntegraVideoRoutes.WALL) {
                IntegraVideoWallScreen(
                    onOpenCamera = { id ->
                        nav.navigate(IntegraVideoRoutes.cameraDetail(id)) { launchSingleTop = true }
                    },
                )
            }
            composable(
                route = IntegraVideoRoutes.CAMERA_DETAIL,
                arguments = listOf(
                    navArgument(IntegraVideoRoutes.ARG_CAMERA_ID) { type = NavType.StringType },
                ),
            ) { entry ->
                IntegraCameraDetailScreen(
                    cameraId = entry.arguments
                        ?.getString(IntegraVideoRoutes.ARG_CAMERA_ID).orEmpty(),
                )
            }

            // ── Vehículos y ANPR ──────────────────────────────────────────
            integraVehiclesGraph()

            // ── Horarios y espacios ───────────────────────────────────────
            composable(SchedulesRoutes.SCHEDULES) { IntegraSchedulesScreen() }
            composable(SchedulesRoutes.ESPACIOS) {
                IntegraEspaciosScreen(
                    onOpenSchedules = { doorId ->
                        nav.navigate(SchedulesRoutes.schedulesForDoor(doorId)) {
                            launchSingleTop = true
                        }
                    },
                )
            }
            composable(
                route = SchedulesRoutes.SCHEDULES_FOR_DOOR,
                arguments = listOf(
                    navArgument(SchedulesRoutes.ARG_DOOR_ID) { type = NavType.StringType },
                ),
            ) { entry ->
                // El id de puerta es «10.0.0.5|1»: viaja codificado en la ruta.
                IntegraSchedulesScreen(
                    initialDoorId = SchedulesRoutes.decodeRouteArg(
                        entry.arguments?.getString(SchedulesRoutes.ARG_DOOR_ID),
                    ),
                )
            }

            // ── Detección ─────────────────────────────────────────────────
            composable(IntegraDetectionRoutes.DETECTION) {
                IntegraDetectionCamerasScreen(
                    onOpenCamera = { id ->
                        nav.navigate(IntegraDetectionRoutes.cameraRoute(id)) {
                            launchSingleTop = true
                        }
                    },
                    onOpenCapabilities = {
                        nav.navigate(IntegraDetectionRoutes.CAPABILITIES) {
                            launchSingleTop = true
                        }
                    },
                )
            }
            composable(IntegraDetectionRoutes.CAPABILITIES) {
                IntegraDetectionCapabilitiesScreen()
            }
            composable(
                route = IntegraDetectionRoutes.CAMERA,
                arguments = listOf(
                    navArgument(IntegraDetectionRoutes.ARG_CAMERA_ID) { type = NavType.StringType },
                ),
            ) { entry ->
                IntegraDetectionTuningScreen(
                    cameraId = entry.arguments
                        ?.getString(IntegraDetectionRoutes.ARG_CAMERA_ID).orEmpty(),
                )
            }

            // ── Ajustes (sustituye la lista de sitios de solo lectura) ─────
            composable(IntegraDetectionRoutes.SETTINGS) {
                IntegraSettingsScreen(
                    onOpenSite = { id ->
                        nav.navigate(IntegraDetectionRoutes.siteRoute(id)) {
                            launchSingleTop = true
                        }
                    },
                    onOpenNewSite = {
                        nav.navigate(IntegraDetectionRoutes.SETTINGS_NEW) {
                            launchSingleTop = true
                        }
                    },
                )
            }
            composable(IntegraDetectionRoutes.SETTINGS_NEW) {
                IntegraNewSiteScreen(onCreated = { nav.popBackStack() })
            }
            composable(
                route = IntegraDetectionRoutes.SETTINGS_SITE,
                arguments = listOf(
                    navArgument(IntegraDetectionRoutes.ARG_SITE_ID) { type = NavType.IntType },
                ),
            ) { entry ->
                IntegraSiteDetailScreen(
                    siteId = entry.arguments?.getInt(IntegraDetectionRoutes.ARG_SITE_ID) ?: 0,
                    onDeleted = { nav.popBackStack() },
                )
            }

            // ── Plano y panorama ──────────────────────────────────────────
            // Los dos saltan a otros módulos por CLAVE, con el mismo resolutor
            // que el hub: así un enlace desde el plano a «alarmas» no necesita
            // conocer la ruta.
            composable(IntegraMapRoutes.MAP) {
                IntegraMapScreen(
                    onOpenKey = { key ->
                        nav.navigate(integraRouteForKey(key)) { launchSingleTop = true }
                    },
                )
            }
            composable(IntegraMapRoutes.DASHBOARD) {
                IntegraDashboardScreen(
                    onOpenKey = { key ->
                        nav.navigate(integraRouteForKey(key)) { launchSingleTop = true }
                    },
                )
            }

            // ── Gobierno ──────────────────────────────────────────────────
            composable(IntegraGovernanceRoutes.AUDIT) { IntegraAuditScreen() }
            composable(IntegraGovernanceRoutes.NOTIFICATIONS) {
                IntegraNotificationsCenterScreen()
            }
            composable(IntegraGovernanceRoutes.MY_PROFILE) { IntegraMyProfileScreen() }
        }
    }
}

private data class IntegraHubCard(
    val key: String,
    val icon: String,
    val title: String,
    val subtitle: String,
    val bg: Color,
    val onClick: () -> Unit,
)

/**
 * Tarjeta del hub. Se construye por CLAVE de módulo y la navegación se resuelve
 * con `integraRouteForKey`, no con un callback por módulo: con 18 módulos, un
 * parámetro por cada uno hacía la firma inmanejable y era el motivo por el que
 * añadir una pantalla obligaba a tocar cuatro sitios.
 */
private fun hubCard(
    key: String,
    icon: String,
    title: String,
    subtitle: String,
    bg: Color,
    onOpenKey: (String) -> Unit,
) = IntegraHubCard(key, icon, title, subtitle, bg) { onOpenKey(key) }

@Composable
private fun IntegraHomeScreen(
    allowedKeys: Set<String>,
    onOpenKey: (String) -> Unit,
) {
    fun show(key: String) = key in allowedKeys

    val accessCards = listOf(
        hubCard("integra-access", "🚪", "Acceso", "Puertas y apertura", Color(0xFF2563EB), onOpenKey),
        hubCard("integra-events", "📋", "Eventos", "Bitácora ACS", Color(0xFF0D9488), onOpenKey),
        hubCard("integra-people", "👤", "Personas", "Directorio ACS", Color(0xFF7C3AED), onOpenKey),
        hubCard("integra-attendance", "🕒", "Asistencia", "Entradas / salidas", Color(0xFFF97316), onOpenKey),
        hubCard("integra-visitors", "🪪", "Visitantes", "Citas y registro", Color(0xFF059669), onOpenKey),
        hubCard("integra-schedules", "🗓️", "Horarios", "Vigencia por puerta", Color(0xFF1D4ED8), onOpenKey),
        hubCard("integra-espacios", "🏛️", "Espacios", "Política y reservas", Color(0xFF6D28D9), onOpenKey),
    ).filter { show(it.key) }

    val opsCards = listOf(
        hubCard("integra-dashboard", "📊", "Panorama", "Cómo está todo ahora", Color(0xFF1E40AF), onOpenKey),
        hubCard("integra-alarms", "🚨", "Alarmas", "Cola SOC", Color(0xFFDC2626), onOpenKey),
        hubCard("integra-occupancy", "📍", "En sitio", "Ocupación hoy", Color(0xFF0891B2), onOpenKey),
        hubCard("integra-map", "🗺️", "Plano", "Puertas y cámaras situadas", Color(0xFF475569), onOpenKey),
        hubCard("integra-video", "🎥", "Cámaras", "Vista previa y PTZ", Color(0xFF0F766E), onOpenKey),
        hubCard("integra-vehicles", "🚙", "Vehículos", "Placas registradas", Color(0xFF15803D), onOpenKey),
        hubCard("integra-anpr", "🔎", "ANPR", "Lecturas de placa", Color(0xFF166534), onOpenKey),
        hubCard("integra-devices", "🖥️", "Equipos", "Inventario ACS", Color(0xFF4B5563), onOpenKey),
    ).filter { show(it.key) }

    val governCards = listOf(
        hubCard("integra-detection", "🎯", "Detección", "Perfiles por cámara", Color(0xFFB45309), onOpenKey),
        hubCard("integra-audit", "🧾", "Bitácora", "Quién hizo qué", Color(0xFF334155), onOpenKey),
        hubCard("integra-notifications", "🔔", "Avisos", "Centro de notificaciones", Color(0xFFC2410C), onOpenKey),
        hubCard("integra-my-profile", "🆔", "Mi perfil", "Mis credenciales", Color(0xFF7E22CE), onOpenKey),
        hubCard("integra-sites", "⚙️", "Ajustes", "Sitios y sincronización", Color(0xFF9333EA), onOpenKey),
    ).filter { show(it.key) }

    LazyColumn(
        modifier = Modifier
            .fillMaxSize()
            .background(NxColors.Surface)
            .padding(16.dp),
        verticalArrangement = Arrangement.spacedBy(16.dp),
    ) {
        // Estado vivo arriba del todo: conectado, puertas en línea, alarmas
        // abiertas y gente en sitio. Sin esto el hub era una rejilla muda que
        // no decía nada hasta entrar en un módulo.
        item { IntegraHomeSummary() }
        if (accessCards.isNotEmpty()) {
            item {
                Column {
                    Text(
                        "Control de accesos",
                        style = MaterialTheme.typography.titleMedium.copy(fontWeight = FontWeight.SemiBold),
                        color = NxColors.Slate,
                    )
                    Text(
                        "Puertas, eventos, personas, asistencia y visitantes",
                        style = MaterialTheme.typography.bodySmall,
                        color = NxColors.Muted,
                    )
                }
            }
            item { IntegraCardGrid(cards = accessCards) }
        }
        if (opsCards.isNotEmpty()) {
            item {
                Column {
                    Text(
                        "Operación",
                        style = MaterialTheme.typography.titleMedium.copy(fontWeight = FontWeight.SemiBold),
                        color = NxColors.Slate,
                    )
                    Text(
                        "Alarmas, presencia, cámaras, vehículos y equipos",
                        style = MaterialTheme.typography.bodySmall,
                        color = NxColors.Muted,
                    )
                }
            }
            item { IntegraCardGrid(cards = opsCards) }
        }
        if (governCards.isNotEmpty()) {
            item {
                Column {
                    Text(
                        "Configuración y gobierno",
                        style = MaterialTheme.typography.titleMedium.copy(fontWeight = FontWeight.SemiBold),
                        color = NxColors.Slate,
                    )
                    Text(
                        "Detección, bitácora, avisos, perfil y ajustes",
                        style = MaterialTheme.typography.bodySmall,
                        color = NxColors.Muted,
                    )
                }
            }
            item { IntegraCardGrid(cards = governCards) }
        }
        item { Spacer(Modifier.height(24.dp)) }
    }
}

@Composable
private fun IntegraCardGrid(cards: List<IntegraHubCard>) {
    Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
        cards.chunked(2).forEach { row ->
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                row.forEach { card ->
                    IntegraQuickCard(
                        modifier = Modifier.weight(1f),
                        icon = card.icon,
                        title = card.title,
                        subtitle = card.subtitle,
                        bg = card.bg,
                        onClick = card.onClick,
                    )
                }
                if (row.size == 1) {
                    Spacer(Modifier.weight(1f))
                }
            }
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun IntegraQuickCard(
    modifier: Modifier,
    icon: String,
    title: String,
    subtitle: String,
    bg: Color,
    onClick: () -> Unit,
) {
    Card(
        onClick = onClick,
        modifier = modifier,
        shape = RoundedCornerShape(NxDimens.PanelRadius),
        colors = CardDefaults.cardColors(containerColor = bg),
    ) {
        Column(Modifier.padding(14.dp)) {
            Text(icon, fontSize = 20.sp)
            Spacer(Modifier.height(6.dp))
            Text(title, color = Color.White, fontWeight = FontWeight.Bold, fontSize = 15.sp)
            Text(subtitle, color = Color.White.copy(alpha = 0.9f), fontSize = 11.sp)
        }
    }
}
