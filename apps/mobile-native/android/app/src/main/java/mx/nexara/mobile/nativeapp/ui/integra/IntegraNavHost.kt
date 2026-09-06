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
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.navigation.NavType
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.currentBackStackEntryAsState
import androidx.navigation.compose.rememberNavController
import androidx.navigation.navArgument
import mx.nexara.mobile.nativeapp.access.PanelId
import mx.nexara.mobile.nativeapp.navigation.PendingDeepLink
import mx.nexara.mobile.nativeapp.ui.enterprise.NxColors
import mx.nexara.mobile.nativeapp.ui.enterprise.NxDimens
import mx.nexara.mobile.nativeapp.ui.enterprise.NxModuleScaffold

private const val Home = "integra/home"
private const val Access = "integra/access"
private const val Events = "integra/events"
private const val People = "integra/people"
private const val PersonDetail = "integra/people/{personId}"
private const val Attendance = "integra/attendance"
private const val Visitors = "integra/visitors"

private fun integraRouteForKey(key: String): String = when (key.lowercase()) {
    "integra-access", "access", "acceso", "puertas", "doors" -> Access
    "integra-events", "events", "eventos" -> Events
    "integra-people", "people", "personas" -> People
    "integra-attendance", "attendance", "asistencia" -> Attendance
    "integra-visitors", "visitors", "visitantes" -> Visitors
    else -> Home
}

private fun personDetailRoute(personId: String) = "integra/people/$personId"

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun IntegraNavHost(onExitToPanels: () -> Unit) {
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
    val topBarTitle = when {
        currentRoute == Home -> "NEXARA INTEGRA"
        currentRoute == Access -> "Control de acceso"
        currentRoute == Events -> "Eventos ACS"
        currentRoute == People -> "Personas"
        currentRoute?.startsWith("integra/people/") == true -> "Detalle de persona"
        currentRoute == Attendance -> "Asistencia ACS"
        currentRoute == Visitors -> "Visitantes"
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
                    onOpenAccess = { nav.navigate(Access) { launchSingleTop = true } },
                    onOpenEvents = { nav.navigate(Events) { launchSingleTop = true } },
                    onOpenPeople = { nav.navigate(People) { launchSingleTop = true } },
                    onOpenAttendance = { nav.navigate(Attendance) { launchSingleTop = true } },
                    onOpenVisitors = { nav.navigate(Visitors) { launchSingleTop = true } },
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
                IntegraPersonDetailScreen(personId = personId)
            }
            composable(Attendance) { IntegraAttendanceScreen() }
            composable(Visitors) { IntegraVisitorsScreen() }
        }
    }
}

@Composable
private fun IntegraHomeScreen(
    onOpenAccess: () -> Unit,
    onOpenEvents: () -> Unit,
    onOpenPeople: () -> Unit,
    onOpenAttendance: () -> Unit,
    onOpenVisitors: () -> Unit,
) {
    LazyColumn(
        modifier = Modifier
            .fillMaxSize()
            .background(NxColors.Surface)
            .padding(16.dp),
        verticalArrangement = Arrangement.spacedBy(16.dp),
    ) {
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
        item {
            Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
                Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                    IntegraQuickCard(
                        modifier = Modifier.weight(1f),
                        icon = "🚪",
                        title = "Acceso",
                        subtitle = "Puertas y apertura",
                        bg = Color(0xFF2563EB),
                        onClick = onOpenAccess,
                    )
                    IntegraQuickCard(
                        modifier = Modifier.weight(1f),
                        icon = "📋",
                        title = "Eventos",
                        subtitle = "Bitácora ACS",
                        bg = Color(0xFF0D9488),
                        onClick = onOpenEvents,
                    )
                }
                Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                    IntegraQuickCard(
                        modifier = Modifier.weight(1f),
                        icon = "👤",
                        title = "Personas",
                        subtitle = "Directorio ACS",
                        bg = Color(0xFF7C3AED),
                        onClick = onOpenPeople,
                    )
                    IntegraQuickCard(
                        modifier = Modifier.weight(1f),
                        icon = "🕒",
                        title = "Asistencia",
                        subtitle = "Entradas / salidas",
                        bg = Color(0xFFF97316),
                        onClick = onOpenAttendance,
                    )
                }
                IntegraQuickCard(
                    modifier = Modifier.fillMaxWidth(),
                    icon = "🪪",
                    title = "Visitantes",
                    subtitle = "Citas y registro",
                    bg = Color(0xFF059669),
                    onClick = onOpenVisitors,
                )
            }
        }
        item { Spacer(Modifier.height(24.dp)) }
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
