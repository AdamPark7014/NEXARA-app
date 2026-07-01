package mx.nexara.mobile.nativeapp.ui.lab

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import kotlinx.coroutines.launch
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import mx.nexara.mobile.nativeapp.data.AuthRepository
import mx.nexara.mobile.nativeapp.data.api.ApiClient
import mx.nexara.mobile.nativeapp.ui.catalog.ModuleEntry
import mx.nexara.mobile.nativeapp.ui.catalog.PortalModuleListScreen
import mx.nexara.mobile.nativeapp.ui.console.screens.PlaceholderScreen
import androidx.compose.foundation.layout.PaddingValues
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.rememberNavController

private const val Home = "lab/home"
private const val Health = "lab/health"
private const val ModulePattern = "lab/m/{key}"
private fun moduleRoute(key: String) = "lab/m/$key"

@Composable
fun LabNavHost(onExitToPanels: () -> Unit) {
    val nav = rememberNavController()
    NavHost(navController = nav, startDestination = Home) {
        composable(Home) {
            PortalModuleListScreen(
                title = "NEXARA LAB",
                modules = listOf(
                    ModuleEntry("health", "API Health", "💚", "/lab/health", nativeImplemented = true),
                    ModuleEntry("flags", "Feature flags", "🚩", "/lab/flags"),
                ),
                onOpenModule = { m ->
                    if (m.key == "health") nav.navigate(Health)
                    else nav.navigate(moduleRoute(m.key))
                },
                onBack = onExitToPanels,
            )
        }
        composable(Health) {
            LabHealthScreen(onBack = { nav.popBackStack() })
        }
        composable(ModulePattern) { backStack ->
            val key = backStack.arguments?.getString("key").orEmpty()
            PlaceholderScreen(
                title = key,
                subtitle = "Sandbox LAB — implementación nativa pendiente.",
                contentPadding = PaddingValues(20.dp),
                primaryActionText = "Volver",
                onPrimaryAction = { nav.popBackStack() },
            )
        }
    }
}

@Composable
private fun LabHealthScreen(onBack: () -> Unit) {
    val context = LocalContext.current
    val auth = remember(context) { AuthRepository(context) }
    var loading by remember { mutableStateOf(true) }
    var body by remember { mutableStateOf<String?>(null) }
    var error by remember { mutableStateOf<String?>(null) }

    suspend fun load() {
        loading = true
        error = null
        try {
            val res = withContext(Dispatchers.IO) {
                ApiClient.healthApi { auth.token() }.health()
            }
            body = res
        } catch (e: Exception) {
            error = e.message ?: "Error"
        } finally {
            loading = false
        }
    }

    val scope = rememberCoroutineScope()
    LaunchedEffect(Unit) { load() }

    Column(
        modifier = Modifier.fillMaxSize().padding(20.dp).verticalScroll(rememberScrollState()),
        verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        Text("API Health", style = MaterialTheme.typography.headlineSmall)
        when {
            loading -> CircularProgressIndicator(modifier = Modifier.align(Alignment.CenterHorizontally))
            error != null -> Text("Error: $error", color = MaterialTheme.colorScheme.error)
            else -> Text(body ?: "—", style = MaterialTheme.typography.bodySmall)
        }
        Button(onClick = { scope.launch { load() } }) { Text("Actualizar") }
        Button(onClick = onBack) { Text("Volver") }
    }
}
