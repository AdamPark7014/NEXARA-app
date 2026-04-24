package mx.nexara.mobile.nativeapp.ui.modules

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import androidx.lifecycle.viewmodel.compose.viewModel
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import mx.nexara.mobile.nativeapp.data.AuthRepository
import mx.nexara.mobile.nativeapp.data.console.ConsoleRepository
import mx.nexara.mobile.nativeapp.ui.common.SimpleListScreen
import mx.nexara.mobile.nativeapp.ui.common.SimpleRow

private fun fmtMoney(v: Double?): String =
    if (v == null) "—" else "$" + String.format("%,.2f", v)

private fun nn(s: String?): String = if (s.isNullOrBlank()) "—" else s

// ── My Viatics ───────────────────────────────────────────────────────────
@Composable
fun MyViaticsScreen() {
    val context = LocalContext.current
    val repo = remember(context) { ConsoleRepository(context) }
    val auth = remember(context) { AuthRepository(context) }
    val me = auth.loadSession()
    val myId = me?.id
    val vm: SimpleListViewModel = viewModel()
    val state by vm.state.collectAsState()
    LaunchedEffect(Unit) {
        vm.configure {
            val list = repo.viaticsFetch()
            list.filter { myId == null || it.usuarioId == myId || it.usuario?.id == myId }
                .map { v ->
                    SimpleRow(
                        id = v.id.toString(),
                        title = fmtMoney(v.montoSolicitado),
                        subtitle = nn(v.razonGasto),
                        meta = listOfNotNull(v.createdAt, v.actividad?.anNumber).joinToString(" · "),
                        trailing = v.estatusPago,
                    )
                }
        }
        vm.load()
    }
    SimpleListScreen(
        title = "Mis viáticos",
        rows = state.rows,
        loading = state.loading,
        error = state.error,
        onRetry = { vm.load() },
    )
}

// ── My Vehicles ──────────────────────────────────────────────────────────
@Composable
fun MyVehiclesScreen() {
    val context = LocalContext.current
    val repo = remember(context) { ConsoleRepository(context) }
    val auth = remember(context) { AuthRepository(context) }
    val me = auth.loadSession()
    val myId = me?.id
    val vm: SimpleListViewModel = viewModel()
    val state by vm.state.collectAsState()
    LaunchedEffect(Unit) {
        vm.configure {
            val list = repo.vehiclesFetch()
            list.filter { myId == null || it.solicitante?.id == myId }
                .map { v ->
                    SimpleRow(
                        id = v.id.toString(),
                        title = nn(v.nombreVehiculo ?: v.vehiculo?.nombre),
                        subtitle = nn(v.placasVehiculo ?: v.vehiculo?.placas),
                        meta = listOfNotNull(v.fechaInicio, v.fechaFin).joinToString(" → "),
                        trailing = v.estatusAprobacion,
                    )
                }
        }
        vm.load()
    }
    SimpleListScreen(
        title = "Mis vehículos",
        rows = state.rows,
        loading = state.loading,
        error = state.error,
        onRetry = { vm.load() },
    )
}

// ── Service Clients (listado simple; gestión avanzada sigue en ConsoleClientsScreen)
@Composable
fun ServiceClientsModuleScreen() {
    val context = LocalContext.current
    val repo = remember(context) { ConsoleRepository(context) }
    val vm: SimpleListViewModel = viewModel()
    val state by vm.state.collectAsState()
    LaunchedEffect(Unit) {
        vm.configure {
            repo.serviceClients().map { c ->
                SimpleRow(
                    id = c.id.toString(),
                    title = nn(c.name ?: c.nombre ?: c.razonSocial),
                    subtitle = listOfNotNull(c.contactName, c.contactEmail, c.contactPhone).joinToString(" · "),
                    meta = listOfNotNull(c.city, c.state, c.country).joinToString(", "),
                    trailing = if ((c.isActive ?: c.activo) == false) "Inactivo" else "Activo",
                )
            }
        }
        vm.load()
    }
    SimpleListScreen(
        title = "Clientes de servicio",
        rows = state.rows,
        loading = state.loading,
        error = state.error,
        onRetry = { vm.load() },
    )
}

// ── Work Projects (operational projects) ────────────────────────────────
@Composable
fun WorkProjectsModuleScreen() {
    val context = LocalContext.current
    val repo = remember(context) { ConsoleRepository(context) }
    val vm: SimpleListViewModel = viewModel()
    val state by vm.state.collectAsState()
    LaunchedEffect(Unit) {
        vm.configure {
            repo.operationalProjects().map { p ->
                SimpleRow(
                    id = p.id.toString(),
                    title = nn(p.title),
                    subtitle = p.description,
                    meta = listOfNotNull(
                        p.client?.name ?: p.client?.nombre,
                        p.vendor?.nombre,
                        listOfNotNull(p.startDate, p.endDate).takeIf { it.isNotEmpty() }?.joinToString(" → "),
                    ).joinToString(" · "),
                    trailing = p.status,
                )
            }
        }
        vm.load()
    }
    SimpleListScreen(
        title = "Proyectos internos",
        rows = state.rows,
        loading = state.loading,
        error = state.error,
        onRetry = { vm.load() },
    )
}

// ── Analytics (dashboard KPIs + computed KPIs en texto) ─────────────────
class AnalyticsVm : ViewModel() {
    private val _state = MutableStateFlow(AnalyticsState())
    val state: StateFlow<AnalyticsState> = _state

    fun load(context: android.content.Context) {
        val repo = mx.nexara.mobile.nativeapp.data.extra.ExtraRepository(context)
        _state.update { it.copy(loading = true, error = null) }
        viewModelScope.launch {
            try {
                val (dash, kpis) = withContext(Dispatchers.IO) {
                    (try { repo.analyticsDashboardRaw() } catch (_: Exception) { null }) to
                        (try { repo.analyticsKpisRaw() } catch (_: Exception) { null })
                }
                _state.update { it.copy(loading = false, dashboardRaw = dash, kpisRaw = kpis) }
            } catch (t: Throwable) {
                _state.update { it.copy(loading = false, error = t.message ?: "Error") }
            }
        }
    }
}

data class AnalyticsState(
    val loading: Boolean = false,
    val dashboardRaw: String? = null,
    val kpisRaw: String? = null,
    val error: String? = null,
)

@Composable
fun AnalyticsModuleScreen() {
    val context = LocalContext.current
    val vm: AnalyticsVm = viewModel()
    val state by vm.state.collectAsState()
    LaunchedEffect(Unit) { vm.load(context) }

    Column(modifier = Modifier.padding(16.dp)) {
        Text("Analítica", style = MaterialTheme.typography.headlineSmall)
        Spacer(Modifier.height(12.dp))
        if (state.loading && state.dashboardRaw == null && state.kpisRaw == null) {
            Text("Cargando…", style = MaterialTheme.typography.bodyMedium)
        } else if (state.error != null) {
            Text("Error: ${state.error}", style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.error)
        } else {
            Card(
                modifier = Modifier.fillMaxWidth(),
                colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
            ) {
                Column(Modifier.padding(14.dp)) {
                    Text("Dashboard ejecutivo", fontWeight = FontWeight.SemiBold)
                    Spacer(Modifier.height(6.dp))
                    Text(
                        text = state.dashboardRaw ?: "Sin datos.",
                        style = MaterialTheme.typography.bodySmall,
                    )
                }
            }
            Spacer(Modifier.height(10.dp))
            Card(
                modifier = Modifier.fillMaxWidth(),
                colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
            ) {
                Column(Modifier.padding(14.dp)) {
                    Text("KPIs calculados", fontWeight = FontWeight.SemiBold)
                    Spacer(Modifier.height(6.dp))
                    Text(
                        text = state.kpisRaw ?: "Sin datos.",
                        style = MaterialTheme.typography.bodySmall,
                    )
                }
            }
        }
    }
}

// ── My Preferences (UI local, sin endpoint dedicado) ────────────────────
@Composable
fun MyPreferencesScreen() {
    val context = LocalContext.current
    val auth = remember(context) { AuthRepository(context) }
    val user = auth.loadSession()
    Column(modifier = Modifier.padding(16.dp)) {
        Text("Mis preferencias", style = MaterialTheme.typography.headlineSmall)
        Spacer(Modifier.height(8.dp))
        Text(
            "Configuración de cuenta para ${user?.nombre ?: user?.email ?: "este dispositivo"}.",
            style = MaterialTheme.typography.bodyMedium,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
        Spacer(Modifier.height(16.dp))
        Card(
            modifier = Modifier.fillMaxWidth(),
            colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
        ) {
            Column(Modifier.padding(14.dp)) {
                Text("Notificaciones", fontWeight = FontWeight.SemiBold)
                Spacer(Modifier.height(4.dp))
                Text(
                    "Las preferencias de notificación se sincronizan con el servidor cuando se abre este panel. " +
                        "Actualmente, el dispositivo recibe alertas según los roles asignados a tu cuenta.",
                    style = MaterialTheme.typography.bodySmall,
                )
            }
        }
        Spacer(Modifier.height(10.dp))
        Card(
            modifier = Modifier.fillMaxWidth(),
            colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
        ) {
            Column(Modifier.padding(14.dp)) {
                Text("Dispositivo", fontWeight = FontWeight.SemiBold)
                Spacer(Modifier.height(4.dp))
                Text(
                    "La app usa tu serial y modelo para identificar el dispositivo en accesos. " +
                        "Puedes revisar la sesión activa en «Mi perfil».",
                    style = MaterialTheme.typography.bodySmall,
                )
            }
        }
    }
}
