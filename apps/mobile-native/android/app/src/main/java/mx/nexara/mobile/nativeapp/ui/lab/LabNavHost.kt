package mx.nexara.mobile.nativeapp.ui.lab

import android.app.Application
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
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import androidx.lifecycle.viewmodel.compose.viewModel
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.currentBackStackEntryAsState
import androidx.navigation.compose.rememberNavController
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import mx.nexara.mobile.nativeapp.access.PanelId
import mx.nexara.mobile.nativeapp.data.api.LabHealthSummaryDto
import mx.nexara.mobile.nativeapp.data.lab.LabRepository
import mx.nexara.mobile.nativeapp.navigation.PendingDeepLink
import mx.nexara.mobile.nativeapp.ui.enterprise.NxColors
import mx.nexara.mobile.nativeapp.ui.enterprise.NxDimens
import mx.nexara.mobile.nativeapp.ui.enterprise.NxErrorBlock
import mx.nexara.mobile.nativeapp.ui.enterprise.NxLoadingBlock
import mx.nexara.mobile.nativeapp.ui.enterprise.NxModuleScaffold

private const val Home = "lab/home"
private const val Health = "lab/health"
private const val Flags = "lab/flags"
private const val Ai = "lab/ai"
private const val Chat = "lab/chat"

private val GreenLight  = Color(0xFFD1FAE5); private val GreenColor  = Color(0xFF059669)
private val TealLight   = Color(0xFFCCFBF1); private val TealColor   = Color(0xFF0D9488)
private val BlueLight   = Color(0xFFDBEAFE); private val BlueColor   = Color(0xFF3B82F6)
private val AmberLight  = Color(0xFFFEF3C7); private val AmberColor  = Color(0xFFF59E0B)
private val PurpleLight = Color(0xFFF3E8FF); private val PurpleColor = Color(0xFF8B5CF6)
private val RedLight    = Color(0xFFFEE2E2); private val RedColor    = Color(0xFFEF4444)
private val SlateText   = Color(0xFF0F172A); private val SubText     = Color(0xFF64748B)

private fun labRouteForKey(key: String): String = when (key) {
    "health" -> Health
    "flags" -> Flags
    "ai" -> Ai
    "chat" -> Chat
    else -> Home
}

data class LabHomeState(
    val loading: Boolean = true,
    val error: String? = null,
    val summary: LabHealthSummaryDto? = null,
    val flagsTotal: Int = 0,
    val flagsEnabled: Int = 0,
)

class LabHomeViewModel(app: Application) : AndroidViewModel(app) {
    private val repo = LabRepository(app.applicationContext)
    private val _state = MutableStateFlow(LabHomeState())
    val state: StateFlow<LabHomeState> = _state

    fun load() {
        _state.update { it.copy(loading = true, error = null) }
        viewModelScope.launch {
            try {
                val summary = withContext(Dispatchers.IO) { repo.healthSummary() }
                val flags = withContext(Dispatchers.IO) { repo.flags() }
                _state.update {
                    it.copy(
                        loading = false,
                        summary = summary,
                        flagsTotal = flags.size,
                        flagsEnabled = flags.count { f -> f.enabled == true },
                    )
                }
            } catch (e: Exception) {
                _state.update { it.copy(loading = false, error = e.message ?: "Error al cargar LAB") }
            }
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun LabNavHost(onExitToPanels: () -> Unit) {
    val nav = rememberNavController()
    val entry by nav.currentBackStackEntryAsState()
    val currentRoute = entry?.destination?.route ?: Home

    val deepLinkSignal by PendingDeepLink.signal.collectAsState()
    LaunchedEffect(deepLinkSignal) {
        val key = PendingDeepLink.consumeModuleFor(PanelId.LAB) ?: return@LaunchedEffect
        nav.navigate(labRouteForKey(key)) { launchSingleTop = true }
    }

    val showBack = currentRoute != Home
    val topBarTitle = when (currentRoute) {
        Home -> "NEXARA LAB"
        Health -> "API Health"
        Flags -> "Feature flags"
        Ai -> "AI Sandbox"
        Chat -> "Chat del equipo"
        else -> "NEXARA LAB"
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
                LabHomeScreen(
                    onOpenHealth = { nav.navigate(Health) },
                    onOpenFlags = { nav.navigate(Flags) },
                    onOpenAi = { nav.navigate(Ai) },
                    onOpenChat = { nav.navigate(Chat) },
                )
            }
            composable(Health) {
                LabHealthScreen(onBack = { nav.popBackStack() })
            }
            composable(Flags) {
                LabFlagsScreen(onBack = { nav.popBackStack() })
            }
            composable(Ai) {
                LabAiScreen(onBack = { nav.popBackStack() })
            }
            composable(Chat) {
                mx.nexara.mobile.nativeapp.ui.chat.ChatScreen(onBack = { nav.popBackStack() })
            }
        }
    }
}

@Composable
private fun LabHomeScreen(
    onOpenHealth: () -> Unit,
    onOpenFlags: () -> Unit,
    onOpenAi: () -> Unit,
    onOpenChat: () -> Unit,
    vm: LabHomeViewModel = viewModel(),
) {
    val state by vm.state.collectAsState()

    if (state.summary == null && state.loading && state.error == null) {
        vm.load()
    }

    LazyColumn(
        modifier = Modifier.fillMaxSize().background(NxColors.Surface).padding(16.dp),
        verticalArrangement = Arrangement.spacedBy(16.dp),
    ) {
        item {
            Column {
                Text(
                    "Sandbox técnico",
                    style = MaterialTheme.typography.titleMedium.copy(fontWeight = FontWeight.SemiBold),
                    color = SlateText,
                )
                Text("Monitoreo, flags y pruebas internas", style = MaterialTheme.typography.bodySmall, color = SubText)
            }
        }

        item {
            Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
                Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                    LabQuickActionCard(
                        modifier = Modifier.weight(1f),
                        icon = "❤️",
                        title = "Health",
                        subtitle = "Estado de servicios",
                        bg = RedColor,
                        onClick = onOpenHealth,
                    )
                    LabQuickActionCard(
                        modifier = Modifier.weight(1f),
                        icon = "🚩",
                        title = "Flags",
                        subtitle = "Feature toggles",
                        bg = AmberColor,
                        onClick = onOpenFlags,
                    )
                }
                Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                    LabQuickActionCard(
                        modifier = Modifier.weight(1f),
                        icon = "🤖",
                        title = "AI",
                        subtitle = "Probar prompts",
                        bg = PurpleColor,
                        onClick = onOpenAi,
                    )
                    LabQuickActionCard(
                        modifier = Modifier.weight(1f),
                        icon = "💬",
                        title = "Chat",
                        subtitle = "Canal técnico",
                        bg = BlueColor,
                        onClick = onOpenChat,
                    )
                }
            }
        }

        if (state.loading) {
            item { NxLoadingBlock("Cargando LAB…") }
            return@LazyColumn
        }

        if (!state.error.isNullOrBlank()) {
            item {
                NxErrorBlock(state.error!!, onRetry = { vm.load() })
            }
            return@LazyColumn
        }

        val summary = state.summary
        val counts = summary?.counts

        item {
            Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
                Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                    LabKpiCard(
                        Modifier.weight(1f),
                        icon = "👥",
                        title = "Usuarios",
                        value = (counts?.users ?: 0).toString(),
                        sub = "Registrados",
                        bg = TealLight,
                        accent = TealColor,
                    )
                    LabKpiCard(
                        Modifier.weight(1f),
                        icon = "📁",
                        title = "Proyectos",
                        value = (counts?.projects ?: 0).toString(),
                        sub = "Activos",
                        bg = BlueLight,
                        accent = BlueColor,
                    )
                }
                Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                    LabKpiCard(
                        Modifier.weight(1f),
                        icon = "🎫",
                        title = "OT abiertas",
                        value = (counts?.openTickets ?: 0).toString(),
                        sub = "Tickets pendientes",
                        bg = AmberLight,
                        accent = AmberColor,
                    )
                    LabKpiCard(
                        Modifier.weight(1f),
                        icon = "🚩",
                        title = "Flags",
                        value = "${state.flagsEnabled}/${state.flagsTotal}",
                        sub = "Activas / total",
                        bg = GreenLight,
                        accent = GreenColor,
                    )
                }
            }
        }

        if (summary != null && (summary.uptime != null || summary.memoryMB != null)) {
            item {
                Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                    if (summary.uptime != null) {
                        LabKpiCard(
                            Modifier.weight(1f),
                            icon = "⏱️",
                            title = "Uptime",
                            value = formatUptime(summary.uptime),
                            sub = "Servidor API",
                            bg = PurpleLight,
                            accent = PurpleColor,
                        )
                    }
                    if (summary.memoryMB != null) {
                        LabKpiCard(
                            Modifier.weight(1f),
                            icon = "💾",
                            title = "Memoria",
                            value = "${summary.memoryMB} MB",
                            sub = "Heap en uso",
                            bg = TealLight,
                            accent = TealColor,
                        )
                    }
                }
            }
        }

        item { Spacer(Modifier.height(24.dp)) }
    }
}

@Composable
private fun LabQuickActionCard(
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

@Composable
private fun LabKpiCard(
    modifier: Modifier,
    icon: String,
    title: String,
    value: String,
    sub: String,
    bg: Color,
    accent: Color,
) {
    Card(
        modifier = modifier,
        shape = RoundedCornerShape(NxDimens.PanelRadius),
        colors = CardDefaults.cardColors(containerColor = bg),
        elevation = CardDefaults.cardElevation(0.dp),
    ) {
        Column(modifier = Modifier.padding(14.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                Text(icon, fontSize = 18.sp)
                Text(title, style = MaterialTheme.typography.labelMedium, color = accent)
            }
            Spacer(Modifier.height(8.dp))
            Text(value, style = MaterialTheme.typography.headlineSmall.copy(fontWeight = FontWeight.Bold), color = SlateText)
            Spacer(Modifier.height(2.dp))
            Text(sub, style = MaterialTheme.typography.bodySmall, color = SubText)
        }
    }
}

private fun formatUptime(seconds: Double): String {
    val total = seconds.toLong()
    val days = total / 86400
    val hours = (total % 86400) / 3600
    val mins = (total % 3600) / 60
    return when {
        days > 0 -> "${days}d ${hours}h"
        hours > 0 -> "${hours}h ${mins}m"
        else -> "${mins}m"
    }
}
