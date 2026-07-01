package mx.nexara.mobile.nativeapp.ui.lab

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.rememberNavController
import mx.nexara.mobile.nativeapp.navigation.PendingDeepLink
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import mx.nexara.mobile.nativeapp.data.api.LabHealthSummaryDto
import mx.nexara.mobile.nativeapp.data.lab.LabRepository

private const val Home = "lab/home"
private const val Health = "lab/health"
private const val Flags = "lab/flags"
private const val Ai = "lab/ai"

private fun labRouteForKey(key: String): String = when (key) {
    "health" -> Health
    "flags" -> Flags
    "ai" -> Ai
    else -> Home
}

@Composable
fun LabNavHost(onExitToPanels: () -> Unit) {
    val nav = rememberNavController()

    LaunchedEffect(Unit) {
        val key = PendingDeepLink.consumeModuleFor(mx.nexara.mobile.nativeapp.access.PanelId.LAB) ?: return@LaunchedEffect
        nav.navigate(labRouteForKey(key)) { launchSingleTop = true }
    }

    NavHost(navController = nav, startDestination = Home) {
        composable(Home) {
            LabHomeScreen(
                onOpenHealth = { nav.navigate(Health) },
                onOpenFlags = { nav.navigate(Flags) },
                onOpenAi = { nav.navigate(Ai) },
                onBack = onExitToPanels,
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
    }
}

@Composable
private fun LabHomeScreen(
    onOpenHealth: () -> Unit,
    onOpenFlags: () -> Unit,
    onOpenAi: () -> Unit,
    onBack: () -> Unit,
) {
    val context = LocalContext.current
    val repo = remember(context) { LabRepository(context) }
    var loading by remember { mutableStateOf(true) }
    var summary by remember { mutableStateOf<LabHealthSummaryDto?>(null) }

    LaunchedEffect(Unit) {
        loading = true
        summary = runCatching { withContext(Dispatchers.IO) { repo.healthSummary() } }.getOrNull()
        loading = false
    }

    LazyColumn(
        modifier = Modifier.fillMaxSize().padding(16.dp),
        verticalArrangement = Arrangement.spacedBy(10.dp),
    ) {
        item {
            Text("NEXARA LAB", style = MaterialTheme.typography.headlineSmall)
            Text("Sandbox técnico", color = MaterialTheme.colorScheme.onSurfaceVariant)
            Spacer(Modifier.height(12.dp))
        }
        item {
            if (loading) {
                CircularProgressIndicator()
            } else {
                summary?.counts?.let { c ->
                    Text("Usuarios ${c.users ?: 0} · Proyectos ${c.projects ?: 0} · OT ${c.openTickets ?: 0}",
                        style = MaterialTheme.typography.bodySmall)
                }
            }
        }
        item { LabToolRow("❤️", "API Health", "Estado de servicios", onOpenHealth) }
        item { LabToolRow("🚩", "Feature flags", "Activar o desactivar", onOpenFlags) }
        item { LabToolRow("🤖", "AI Sandbox", "Probar prompts", onOpenAi) }
        item {
            Spacer(Modifier.height(16.dp))
            Button(onClick = onBack, modifier = Modifier.fillMaxWidth()) { Text("← Cambiar panel") }
        }
    }
}

@Composable
private fun LabToolRow(icon: String, title: String, subtitle: String, onClick: () -> Unit) {
    Row(
        Modifier.fillMaxWidth().padding(vertical = 8.dp),
        horizontalArrangement = Arrangement.spacedBy(12.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Text(icon, style = MaterialTheme.typography.headlineSmall)
        Column(Modifier.weight(1f)) {
            Text(title, style = MaterialTheme.typography.titleMedium)
            Text(subtitle, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
        }
        Button(onClick = onClick) { Text("Abrir") }
    }
}
