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
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.FilterChip
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
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
import mx.nexara.mobile.nativeapp.data.api.ViaticDto
import mx.nexara.mobile.nativeapp.data.api.VehicleControlDto
import mx.nexara.mobile.nativeapp.data.api.toUserMessage
import mx.nexara.mobile.nativeapp.data.console.ConsoleRepository
import mx.nexara.mobile.nativeapp.data.offline.NetworkMonitor
import mx.nexara.mobile.nativeapp.data.offline.NexaraOffline
import mx.nexara.mobile.nativeapp.data.offline.OfflineSyncCoordinator
import mx.nexara.mobile.nativeapp.security.AppLockSettingsCard
import mx.nexara.mobile.nativeapp.ui.common.ImageDataUrl
import mx.nexara.mobile.nativeapp.ui.common.MediaPickerBar
import mx.nexara.mobile.nativeapp.ui.common.SimpleListScreen
import mx.nexara.mobile.nativeapp.ui.common.SimpleRow
import mx.nexara.mobile.nativeapp.ui.enterprise.NxColors
import mx.nexara.mobile.nativeapp.ui.enterprise.NxPanelShell
import mx.nexara.mobile.nativeapp.ui.enterprise.NxStatusChip
import mx.nexara.mobile.nativeapp.ui.enterprise.NxTone

private fun fmtMoney(v: Double?): String =
    if (v == null) "—" else "$" + String.format("%,.2f", v)

private fun nn(s: String?): String = if (s.isNullOrBlank()) "—" else s

private val MY_VIATIC_CATEGORIES = listOf(
    "COMBUSTIBLE", "CASETA", "HOSPEDAJE", "ALIMENTACION", "TRANSPORTE", "OTROS",
)

private fun viaticStatusTone(status: String?): NxTone {
    val s = (status ?: "").lowercase()
    return when {
        s.contains("aprob") || s.contains("pagad") -> NxTone.Success
        s.contains("rechaz") || s.contains("cancel") -> NxTone.Danger
        s.contains("pend") -> NxTone.Warning
        else -> NxTone.Info
    }
}

// ── My Viatics ───────────────────────────────────────────────────────────
@Composable
fun MyViaticsScreen() {
    val context = LocalContext.current
    val repo = remember(context) { ConsoleRepository(context) }
    val auth = remember(context) { AuthRepository(context) }
    val me = auth.loadSession()
    val myId = me?.id
    var loading by remember { mutableStateOf(true) }
    var error by remember { mutableStateOf<String?>(null) }
    var items by remember { mutableStateOf<List<ViaticDto>>(emptyList()) }
    var showCreate by remember { mutableStateOf(false) }
    var creating by remember { mutableStateOf(false) }
    var actionMessage by remember { mutableStateOf<String?>(null) }
    var amountText by remember { mutableStateOf("") }
    var motivo by remember { mutableStateOf("") }
    var categoria by remember { mutableStateOf(MY_VIATIC_CATEGORIES.first()) }
    var ticketDataUrl by remember { mutableStateOf<String?>(null) }
    val scope = rememberCoroutineScope()

    fun reload() {
        scope.launch {
            loading = items.isEmpty()
            error = null
            try {
                val list = withContext(Dispatchers.IO) { repo.viaticsFetch() }
                items = list.filter { myId == null || it.usuarioId == myId || it.usuario?.id == myId }
            } catch (e: Exception) {
                error = e.toUserMessage("No se pudieron cargar viáticos")
            } finally {
                loading = false
            }
        }
    }

    LaunchedEffect(Unit) { reload() }

    if (showCreate) {
        Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                OutlinedButton(onClick = { showCreate = false; actionMessage = null }) { Text("← Cancelar") }
                Text("Nueva solicitud", fontWeight = FontWeight.Bold)
            }
            NxPanelShell {
                Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
                    OutlinedTextField(
                        value = amountText,
                        onValueChange = { amountText = it.filter { c -> c.isDigit() || c == '.' } },
                        label = { Text("Monto (MXN)") },
                        singleLine = true,
                        modifier = Modifier.fillMaxWidth(),
                    )
                    OutlinedTextField(
                        value = motivo,
                        onValueChange = { motivo = it },
                        label = { Text("Motivo") },
                        minLines = 2,
                        modifier = Modifier.fillMaxWidth(),
                    )
                    Row(Modifier.horizontalScroll(rememberScrollState()), horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                        MY_VIATIC_CATEGORIES.forEach { cat ->
                            FilterChip(selected = categoria == cat, onClick = { categoria = cat }, label = { Text(cat) })
                        }
                    }
                    Text("Comprobante (obligatorio)", fontWeight = FontWeight.SemiBold)
                    MediaPickerBar(
                        onPicked = { picked ->
                            ticketDataUrl = picked.firstOrNull()?.let { ImageDataUrl.fromCaptured(context, it) }
                        },
                        allowCamera = true,
                        allowGallery = true,
                        allowDocuments = true,
                    )
                    if (ticketDataUrl != null) Text("✓ Comprobante listo", color = NxColors.Success, style = MaterialTheme.typography.bodySmall)
                }
            }
            actionMessage?.let { Text(it, color = if (it.startsWith("✅")) NxColors.Success else NxColors.Danger) }
            Button(
                onClick = {
                    val amount = amountText.toDoubleOrNull()
                    if (amount == null || amount <= 0) {
                        actionMessage = "❌ Monto inválido"
                        return@Button
                    }
                    if (motivo.isBlank()) {
                        actionMessage = "❌ Indica el motivo"
                        return@Button
                    }
                    if (ticketDataUrl.isNullOrBlank()) {
                        actionMessage = "❌ Adjunta comprobante"
                        return@Button
                    }
                    creating = true
                    scope.launch {
                        try {
                            withContext(Dispatchers.IO) {
                                repo.createViatic(amount, motivo.trim(), categoria, null, ticketDataUrl!!)
                            }
                            actionMessage = "✅ Enviado a aprobación"
                            showCreate = false
                            amountText = ""; motivo = ""; ticketDataUrl = null
                            reload()
                        } catch (e: Exception) {
                            actionMessage = "❌ ${e.toUserMessage("No se pudo crear")}"
                        } finally {
                            creating = false
                        }
                    }
                },
                enabled = !creating,
                modifier = Modifier.fillMaxWidth(),
            ) { Text(if (creating) "Enviando…" else "Enviar solicitud") }
        }
        return
    }

    SimpleListScreen(
        title = "Mis viáticos",
        rows = items.map { v ->
            SimpleRow(
                id = v.id.toString(),
                title = fmtMoney(v.montoSolicitado),
                subtitle = nn(v.razonGasto ?: v.motivo),
                meta = listOfNotNull(v.createdAt?.take(10), v.actividad?.anNumber).joinToString(" · "),
                trailing = v.displayStatus(),
            )
        },
        loading = loading,
        error = error,
        onRetry = { reload() },
        header = {
            Column(Modifier.fillMaxWidth().padding(bottom = 8.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                Text(
                    "Las solicitudes pasan por aprobación de tu jefe — no se aprueban desde aquí.",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
                Button(onClick = { showCreate = true; actionMessage = null }, modifier = Modifier.fillMaxWidth()) {
                    Text("+ Nueva solicitud")
                }
            }
        },
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
    var loading by remember { mutableStateOf(true) }
    var error by remember { mutableStateOf<String?>(null) }
    var items by remember { mutableStateOf<List<VehicleControlDto>>(emptyList()) }
    var selected by remember { mutableStateOf<VehicleControlDto?>(null) }
    var showCreate by remember { mutableStateOf(false) }
    var actionMessage by remember { mutableStateOf<String?>(null) }
    var activityIdText by remember { mutableStateOf("") }
    var motivoUso by remember { mutableStateOf("") }
    var saving by remember { mutableStateOf(false) }
    val scope = rememberCoroutineScope()

    fun reload() {
        scope.launch {
            loading = items.isEmpty()
            error = null
            try {
                val list = withContext(Dispatchers.IO) { repo.vehiclesFetch() }
                items = list.filter { myId == null || it.solicitante?.id == myId }
            } catch (e: Exception) {
                error = e.toUserMessage("No se pudieron cargar vehículos")
            } finally {
                loading = false
            }
        }
    }

    LaunchedEffect(Unit) { reload() }

    val sel = selected
    if (sel != null) {
        Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
            OutlinedButton(onClick = { selected = null; actionMessage = null }) { Text("← Mis vehículos") }
            NxPanelShell {
                Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    Text(nn(sel.nombreVehiculo ?: sel.vehiculo?.nombre), fontWeight = FontWeight.Bold)
                    Text("Placas: ${nn(sel.placasVehiculo ?: sel.vehiculo?.placas)}", style = MaterialTheme.typography.bodySmall)
                    Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        NxStatusChip(sel.estatusAprobacion, viaticStatusTone(sel.estatusAprobacion))
                        sel.renovacionEstatus?.takeIf { it.isNotBlank() }?.let {
                            NxStatusChip("Renovación: $it", NxTone.Info)
                        }
                    }
                    if (!sel.entregaEstatus.isNullOrBlank()) {
                        Text("Entrega: ${sel.entregaEstatus}", style = MaterialTheme.typography.bodySmall)
                    }
                }
            }
            actionMessage?.let { Text(it, color = if (it.startsWith("✅")) NxColors.Success else NxColors.Danger) }
            val approved = sel.estatusAprobacion.equals("Aprobado", true)
            if (approved && sel.renovacionEstatus.isNullOrBlank()) {
                Button(
                    onClick = {
                        saving = true
                        scope.launch {
                            try {
                                withContext(Dispatchers.IO) {
                                    repo.requestVehicleRenewal(sel.id, null, null)
                                }
                                actionMessage = "✅ Renovación solicitada (pendiente de firma/aprobación)"
                                reload()
                            } catch (e: Exception) {
                                actionMessage = "❌ ${e.toUserMessage("No se pudo solicitar renovación")}"
                            } finally {
                                saving = false
                            }
                        }
                    },
                    enabled = !saving,
                    modifier = Modifier.fillMaxWidth(),
                ) { Text("Solicitar renovación") }
            }
            Text(
                "Bitácora km/combustible: requiere 9 fotos (4 int, 4 ext, odómetro) vía salida/devolución — usa consola web por ahora.",
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }
        return
    }

    if (showCreate) {
        Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
            OutlinedButton(onClick = { showCreate = false }) { Text("← Cancelar") }
            Text("Solicitar vehículo", fontWeight = FontWeight.Bold)
            NxPanelShell {
                Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
                    OutlinedTextField(
                        value = activityIdText,
                        onValueChange = { activityIdText = it.filter { c -> c.isDigit() } },
                        label = { Text("ID actividad (OT)") },
                        singleLine = true,
                        modifier = Modifier.fillMaxWidth(),
                    )
                    OutlinedTextField(
                        value = motivoUso,
                        onValueChange = { motivoUso = it },
                        label = { Text("Motivo de uso") },
                        minLines = 2,
                        modifier = Modifier.fillMaxWidth(),
                    )
                }
            }
            actionMessage?.let { Text(it, color = if (it.startsWith("✅")) NxColors.Success else NxColors.Danger) }
            Button(
                onClick = {
                    val actId = activityIdText.toLongOrNull()
                    if (actId == null) {
                        actionMessage = "❌ ID de actividad inválido"
                        return@Button
                    }
                    saving = true
                    scope.launch {
                        try {
                            withContext(Dispatchers.IO) {
                                repo.createVehicleRequest(activityId = actId, motivoUso = motivoUso.trim().ifBlank { null })
                            }
                            actionMessage = "✅ Solicitud enviada — estatus Pendiente"
                            showCreate = false
                            activityIdText = ""; motivoUso = ""
                            reload()
                        } catch (e: Exception) {
                            actionMessage = "❌ ${e.toUserMessage("No se pudo crear solicitud")}"
                        } finally {
                            saving = false
                        }
                    }
                },
                enabled = !saving,
                modifier = Modifier.fillMaxWidth(),
            ) { Text(if (saving) "Enviando…" else "Enviar solicitud") }
        }
        return
    }

    SimpleListScreen(
        title = "Mis vehículos",
        rows = items.map { v ->
            SimpleRow(
                id = v.id.toString(),
                title = nn(v.nombreVehiculo ?: v.vehiculo?.nombre),
                subtitle = nn(v.placasVehiculo ?: v.vehiculo?.placas),
                meta = listOfNotNull(v.fechaInicio ?: v.fechaInicioAprobada, v.fechaFin ?: v.fechaFinAprobada).joinToString(" → "),
                trailing = v.estatusAprobacion,
            )
        },
        loading = loading,
        error = error,
        onRetry = { reload() },
        onRowClick = { id -> items.firstOrNull { it.id.toString() == id }?.let { selected = it } },
        header = {
            Column(Modifier.fillMaxWidth().padding(bottom = 8.dp)) {
                Button(onClick = { showCreate = true; actionMessage = null }, modifier = Modifier.fillMaxWidth()) {
                    Text("+ Solicitar vehículo")
                }
            }
        },
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
