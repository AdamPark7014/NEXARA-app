package mx.nexara.mobile.nativeapp.ui.modules

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
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
import mx.nexara.mobile.nativeapp.data.offline.NetworkMonitor
import mx.nexara.mobile.nativeapp.data.offline.NexaraOffline
import mx.nexara.mobile.nativeapp.data.offline.OfflineSyncCoordinator
import mx.nexara.mobile.nativeapp.security.AppLockSettingsCard
import mx.nexara.mobile.nativeapp.ui.common.SimpleListScreen
import mx.nexara.mobile.nativeapp.ui.common.SimpleRow
import mx.nexara.mobile.nativeapp.ui.enterprise.NxColors
import mx.nexara.mobile.nativeapp.ui.enterprise.NxPanelShell

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

// ── My Preferences ────────────────────────────────────────────────────────
@Composable
fun MyPreferencesScreen(
    onOpenOfflineQueue: (() -> Unit)? = null,
) {
    val context = LocalContext.current
    val auth = remember(context) { AuthRepository(context) }
    val user = auth.loadSession()
    val queue = remember { NexaraOffline.mutationQueue() }
    val isOnline by NetworkMonitor.isOnline.collectAsState()
    val syncStatus by OfflineSyncCoordinator.syncStatus.collectAsState()
    var pending by remember { mutableStateOf(0) }
    var withErrors by remember { mutableStateOf(0) }
    var wasOffline by remember { mutableStateOf(!NetworkMonitor.isOnline.value) }
    var autoSyncPulse by remember { mutableStateOf(false) }

    DisposableEffect(queue) {
        val listener = {
            val list = queue.load()
            pending = list.size
            withErrors = list.count { it.attempts > 0 }
        }
        queue.addListener(listener)
        listener()
        onDispose { queue.removeListener(listener) }
    }

    LaunchedEffect(isOnline) {
        if (isOnline && wasOffline && pending > 0) {
            autoSyncPulse = true
            OfflineSyncCoordinator.replay(queue, auth.token())
            autoSyncPulse = false
        }
        wasOffline = !isOnline
    }

    val isSyncing = syncStatus.isSyncing || autoSyncPulse

  Column(modifier = Modifier.padding(16.dp)) {
        Text("Mis preferencias", style = MaterialTheme.typography.headlineSmall)
        Spacer(Modifier.height(8.dp))
        Text(
            "Configuración de cuenta para ${user?.nombre ?: user?.email ?: "este dispositivo"}.",
            style = MaterialTheme.typography.bodyMedium,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
        Spacer(Modifier.height(16.dp))

        if (isSyncing) {
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .background(NxColors.TealSoft, MaterialTheme.shapes.small)
                    .padding(horizontal = 14.dp, vertical = 10.dp),
                horizontalArrangement = Arrangement.spacedBy(10.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                CircularProgressIndicator(modifier = Modifier.size(18.dp), color = NxColors.Teal, strokeWidth = 2.dp)
                Text(
                    "Sincronizando cambios pendientes…",
                    style = MaterialTheme.typography.labelMedium,
                    color = NxColors.Teal,
                    fontWeight = FontWeight.SemiBold,
                )
            }
            Spacer(Modifier.height(10.dp))
        }

        NxPanelShell {
            Row(
                Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                    Text("Cola offline", fontWeight = FontWeight.SemiBold, color = NxColors.Slate)
                    Row(horizontalArrangement = Arrangement.spacedBy(6.dp), verticalAlignment = Alignment.CenterVertically) {
                        Box(
                            modifier = Modifier
                                .size(8.dp)
                                .clip(CircleShape)
                                .background(if (isOnline) NxColors.Success else NxColors.Warning),
                        )
                        Text(
                            if (isOnline) "Con conexión" else "Sin conexión",
                            style = MaterialTheme.typography.bodySmall,
                            color = if (isOnline) NxColors.Success else NxColors.Warning,
                        )
                    }
                    if (pending == 0) {
                        Text(
                            "Todo sincronizado ✓",
                            style = MaterialTheme.typography.bodySmall,
                            color = NxColors.Success,
                            fontWeight = FontWeight.SemiBold,
                        )
                    } else {
                        Text(
                            "$pending pendiente(s)" +
                                (if (withErrors > 0) " · $withErrors con reintentos" else ""),
                            style = MaterialTheme.typography.bodySmall,
                            color = NxColors.Muted,
                        )
                        if (syncStatus.lastSyncAt != null) {
                            Text(
                                "Última sync: ${syncStatus.lastReplayed} enviadas, ${syncStatus.lastPending} restantes",
                                style = MaterialTheme.typography.labelSmall,
                                color = NxColors.Muted,
                            )
                        }
                    }
                }
                if (pending > 0) {
                    Text(
                        "$pending",
                        style = MaterialTheme.typography.headlineMedium,
                        fontWeight = FontWeight.Bold,
                        color = if (withErrors > 0) NxColors.Warning else NxColors.Teal,
                    )
                }
            }
            if (onOpenOfflineQueue != null) {
                Spacer(Modifier.height(8.dp))
                TextButton(onClick = onOpenOfflineQueue) { Text("Ver cola offline") }
            }
        }
        Spacer(Modifier.height(10.dp))
        AppLockSettingsCard(containerColor = MaterialTheme.colorScheme.surface)
        Spacer(Modifier.height(10.dp))
        Card(
            modifier = Modifier.fillMaxWidth(),
            colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
        ) {
            Column(Modifier.padding(14.dp)) {
                Text("Notificaciones", fontWeight = FontWeight.SemiBold)
                Spacer(Modifier.height(4.dp))
                Text(
                    "Push FCM activo: el token se registra al iniciar sesión. " +
                        "Las alertas llegan según los roles asignados a tu cuenta.",
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
                        "Puedes revisar y editar tu perfil en «Mi perfil».",
                    style = MaterialTheme.typography.bodySmall,
                )
            }
        }
    }
}
