package mx.nexara.mobile.nativeapp.ui.shared

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.outlined.Assignment
import androidx.compose.material.icons.outlined.AttachMoney
import androidx.compose.material.icons.outlined.Chat
import androidx.compose.material.icons.outlined.CloudSync
import androidx.compose.material.icons.outlined.Delete
import androidx.compose.material.icons.outlined.DirectionsCar
import androidx.compose.material.icons.outlined.Event
import androidx.compose.material.icons.outlined.GpsFixed
import androidx.compose.material.icons.outlined.PhotoCamera
import androidx.compose.material.icons.outlined.Refresh
import androidx.compose.material.icons.outlined.RequestQuote
import androidx.compose.material.icons.outlined.Support
import androidx.compose.material.icons.outlined.Sync
import androidx.compose.material.icons.outlined.SyncProblem
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.SwipeToDismissBox
import androidx.compose.material3.SwipeToDismissBoxValue
import androidx.compose.material3.Text
import androidx.compose.material3.rememberSwipeToDismissBoxState
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
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import kotlinx.coroutines.launch
import mx.nexara.mobile.nativeapp.data.AuthRepository
import mx.nexara.mobile.nativeapp.data.offline.NetworkMonitor
import mx.nexara.mobile.nativeapp.data.offline.NexaraOffline
import mx.nexara.mobile.nativeapp.data.offline.OfflineSyncCoordinator
import mx.nexara.mobile.nativeapp.data.offline.OfflineSyncStatus
import mx.nexara.mobile.nativeapp.data.offline.QueuedMutation
import mx.nexara.mobile.nativeapp.ui.enterprise.NxColors
import mx.nexara.mobile.nativeapp.ui.enterprise.NxEmptyState
import mx.nexara.mobile.nativeapp.ui.enterprise.NxPanelShell
import java.net.URI
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

enum class OfflineMutationKind(
    val label: String,
    val icon: ImageVector,
    val tint: Color,
) {
    Evidence("Evidencia", Icons.Outlined.PhotoCamera, NxColors.Info),
    Activity("Actividad", Icons.Outlined.Event, NxColors.Teal),
    Viatic("Viático", Icons.Outlined.AttachMoney, NxColors.Warning),
    Vehicle("Vehículo", Icons.Outlined.DirectionsCar, NxColors.Slate),
    Ticket("Ticket", Icons.Outlined.Support, NxColors.Danger),
    Chat("Chat", Icons.Outlined.Chat, Color(0xFF6366F1)),
    Quote("Cotización", Icons.Outlined.RequestQuote, Color(0xFF7C3AED)),
    Attendance("Asistencia", Icons.AutoMirrored.Outlined.Assignment, Color(0xFF0891B2)),
    Gps("GPS", Icons.Outlined.GpsFixed, Color(0xFF059669)),
    Generic("Mutación", Icons.Outlined.CloudSync, NxColors.Muted),
}

fun classifyOfflineMutation(item: QueuedMutation): OfflineMutationKind {
    val path = runCatching { URI(item.url).path }.getOrNull()?.lowercase() ?: item.url.lowercase()
    return when {
        "evidencia" in path || "evidence" in path -> OfflineMutationKind.Evidence
        "actividad" in path || "activity" in path || "activities" in path -> OfflineMutationKind.Activity
        "viatic" in path -> OfflineMutationKind.Viatic
        "vehiculo" in path || "vehicle" in path -> OfflineMutationKind.Vehicle
        "ticket" in path -> OfflineMutationKind.Ticket
        "chat" in path || "message" in path -> OfflineMutationKind.Chat
        "cotizacion" in path || "quote" in path -> OfflineMutationKind.Quote
        "asistencia" in path || "attendance" in path -> OfflineMutationKind.Attendance
        "gps" in path || "location" in path -> OfflineMutationKind.Gps
        else -> OfflineMutationKind.Generic
    }
}

/**
 * Cola de mutaciones offline: timeline visual, swipe para descartar/reintentar, auto-sync al volver online.
 */
@Composable
fun OfflineQueueScreen(
    contentPadding: PaddingValues = PaddingValues(16.dp),
) {
    val context = LocalContext.current
    val queue = remember { NexaraOffline.mutationQueue() }
    val auth = remember(context) { AuthRepository(context) }
    val scope = rememberCoroutineScope()
    var items by remember { mutableStateOf(queue.load()) }
    var syncing by remember { mutableStateOf(false) }
    var message by remember { mutableStateOf<String?>(null) }
    var wasOffline by remember { mutableStateOf(!NetworkMonitor.isOnline.value) }
    var autoSyncPulse by remember { mutableStateOf(false) }
    val isOnline by NetworkMonitor.isOnline.collectAsState()
    val syncStatus by OfflineSyncCoordinator.syncStatus.collectAsState()

    fun refresh() {
        items = queue.load()
    }

    val withErrors = items.count { it.attempts > 0 }
    val isSyncing = syncing || syncStatus.isSyncing

    DisposableEffect(queue) {
        val listener = { refresh() }
        queue.addListener(listener)
        refresh()
        onDispose { queue.removeListener(listener) }
    }

    LaunchedEffect(isOnline) {
        if (isOnline && wasOffline && items.isNotEmpty()) {
            autoSyncPulse = true
            OfflineSyncCoordinator.replay(queue, auth.token())
            refresh()
            autoSyncPulse = false
        }
        wasOffline = !isOnline
    }

    LazyColumn(
        modifier = Modifier.fillMaxSize().padding(contentPadding),
        verticalArrangement = Arrangement.spacedBy(10.dp),
    ) {
        item {
            Text("Cola offline", style = MaterialTheme.typography.titleLarge, fontWeight = FontWeight.Bold)
            Text(
                if (isOnline) "Con conexión — los cambios se sincronizan automáticamente"
                else "Sin conexión — los cambios se encolan aquí",
                style = MaterialTheme.typography.bodySmall,
                color = NxColors.Muted,
            )
        }

        if (isSyncing || autoSyncPulse) {
            item { AutoSyncIndicator() }
        }

        if (!message.isNullOrBlank()) {
            item {
                Text(
                    message!!,
                    color = if (message!!.startsWith("❌")) MaterialTheme.colorScheme.error else NxColors.Success,
                    fontWeight = FontWeight.SemiBold,
                )
            }
        }

        item {
            SyncStatusCard(
                pending = items.size,
                withErrors = withErrors,
                isOnline = isOnline,
                syncStatus = syncStatus,
            )
        }

        item {
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                Button(
                    onClick = {
                        scope.launch {
                            syncing = true
                            message = null
                            OfflineSyncCoordinator.replay(queue, auth.token())
                            refresh()
                            val remaining = queue.load().size
                            message = if (remaining == 0) "✅ Todo sincronizado"
                            else "Quedan $remaining pendientes"
                            syncing = false
                        }
                    },
                    enabled = !isSyncing && isOnline && items.isNotEmpty(),
                ) {
                    Text(if (isSyncing) "Sincronizando…" else "Sincronizar ahora")
                }
                if (items.isNotEmpty()) {
                    OutlinedButton(
                        onClick = {
                            items.forEach { NexaraOffline.mediaStore().purgeRefsInBody(it.body) }
                            queue.clear()
                            refresh()
                            message = "Cola descartada"
                        },
                    ) { Text("Vaciar cola") }
                }
            }
        }

        if (items.isEmpty()) {
            item {
                NxEmptyState(
                    title = "Todo sincronizado ✓",
                    subtitle = "No hay mutaciones pendientes en este dispositivo.",
                )
            }
        } else {
            item {
                Text(
                    "Desliza → reintentar · ← descartar",
                    style = MaterialTheme.typography.labelSmall,
                    color = NxColors.Muted,
                )
            }
            itemsIndexed(items, key = { _, it -> it.id }) { index, item ->
                OfflineTimelineItem(
                    item = item,
                    isFirst = index == 0,
                    isLast = index == items.lastIndex,
                    isOnline = isOnline,
                    onDiscard = {
                        NexaraOffline.mediaStore().purgeRefsInBody(item.body)
                        queue.removeIds(setOf(item.id))
                        refresh()
                    },
                    onRetry = {
                        scope.launch {
                            val ok = OfflineSyncCoordinator.replaySingle(queue, auth.token(), item.id)
                            refresh()
                            message = if (ok) "✅ Enviado" else "❌ No se pudo enviar — revisa el error"
                        }
                    },
                )
            }
        }

        item { Spacer(Modifier.height(24.dp)) }
    }
}

@Composable
private fun AutoSyncIndicator() {
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
            "Sincronizando al recuperar conexión…",
            style = MaterialTheme.typography.labelMedium,
            color = NxColors.Teal,
            fontWeight = FontWeight.SemiBold,
        )
    }
}

@Composable
private fun SyncStatusCard(
    pending: Int,
    withErrors: Int,
    isOnline: Boolean,
    syncStatus: OfflineSyncStatus,
) {
    val lastSyncLabel = syncStatus.lastSyncAt?.let { ts ->
        SimpleDateFormat("dd MMM HH:mm", Locale.getDefault()).format(Date(ts))
    }
    Card(
        modifier = Modifier.fillMaxWidth(),
        colors = CardDefaults.cardColors(
            containerColor = if (pending == 0) NxColors.SuccessSoft else NxColors.WarningSoft,
        ),
    ) {
        Column(Modifier.padding(14.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
            Row(horizontalArrangement = Arrangement.spacedBy(16.dp)) {
                Column {
                    Text("$pending", style = MaterialTheme.typography.headlineSmall, fontWeight = FontWeight.Bold)
                    Text("Pendientes", style = MaterialTheme.typography.labelSmall, color = NxColors.Muted)
                }
                Column {
                    Text(
                        "$withErrors",
                        style = MaterialTheme.typography.headlineSmall,
                        fontWeight = FontWeight.Bold,
                        color = NxColors.Warning,
                    )
                    Text("Con reintentos", style = MaterialTheme.typography.labelSmall, color = NxColors.Muted)
                }
                Column {
                    Text(
                        if (isOnline) "Online" else "Offline",
                        style = MaterialTheme.typography.titleSmall,
                        fontWeight = FontWeight.Bold,
                        color = if (isOnline) NxColors.Success else NxColors.Warning,
                    )
                    Text("Red", style = MaterialTheme.typography.labelSmall, color = NxColors.Muted)
                }
            }
            if (lastSyncLabel != null) {
                Text(
                    "Última sync: $lastSyncLabel · ${syncStatus.lastReplayed} enviadas, ${syncStatus.lastPending} restantes",
                    style = MaterialTheme.typography.labelSmall,
                    color = NxColors.Muted,
                )
            }
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun OfflineTimelineItem(
    item: QueuedMutation,
    isFirst: Boolean,
    isLast: Boolean,
    isOnline: Boolean,
    onDiscard: () -> Unit,
    onRetry: () -> Unit,
) {
    val kind = remember(item.url) { classifyOfflineMutation(item) }
    val path = remember(item.url) {
        runCatching { URI(item.url).path }.getOrNull()?.removePrefix("/api/") ?: item.url
    }
    val whenCreated = remember(item.createdAt) {
        SimpleDateFormat("dd MMM HH:mm", Locale.getDefault()).format(Date(item.createdAt))
    }
    val dismissState = rememberSwipeToDismissBoxState(
        confirmValueChange = { value ->
            when (value) {
                SwipeToDismissBoxValue.EndToStart -> {
                    onDiscard()
                    true
                }
                SwipeToDismissBoxValue.StartToEnd -> {
                    if (isOnline) onRetry()
                    false
                }
                else -> false
            }
        },
    )

    Row(modifier = Modifier.fillMaxWidth()) {
        Column(
            modifier = Modifier.width(44.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
        ) {
            if (!isFirst) {
                Box(
                    modifier = Modifier
                        .width(2.dp)
                        .height(8.dp)
                        .background(NxColors.Muted.copy(alpha = 0.35f)),
                )
            }
            Box(
                modifier = Modifier
                    .size(36.dp)
                    .clip(CircleShape)
                    .background(kind.tint.copy(alpha = 0.12f)),
                contentAlignment = Alignment.Center,
            ) {
                Icon(kind.icon, kind.label, modifier = Modifier.size(20.dp), tint = kind.tint)
            }
            if (!isLast) {
                Box(
                    modifier = Modifier
                        .width(2.dp)
                        .height(24.dp)
                        .background(NxColors.Muted.copy(alpha = 0.35f)),
                )
            }
        }

        Spacer(Modifier.width(8.dp))

        SwipeToDismissBox(
            state = dismissState,
            modifier = Modifier.weight(1f),
            enableDismissFromStartToEnd = isOnline,
            enableDismissFromEndToStart = true,
            backgroundContent = {
                val direction = dismissState.dismissDirection
                val color = when (direction) {
                    SwipeToDismissBoxValue.StartToEnd -> NxColors.Teal
                    SwipeToDismissBoxValue.EndToStart -> NxColors.Danger
                    else -> Color.Transparent
                }
                Box(
                    modifier = Modifier
                        .fillMaxSize()
                        .background(color, MaterialTheme.shapes.medium)
                        .padding(horizontal = 16.dp),
                    contentAlignment = when (direction) {
                        SwipeToDismissBoxValue.StartToEnd -> Alignment.CenterStart
                        SwipeToDismissBoxValue.EndToStart -> Alignment.CenterEnd
                        else -> Alignment.Center
                    },
                ) {
                    when (direction) {
                        SwipeToDismissBoxValue.StartToEnd ->
                            Icon(Icons.Outlined.Refresh, "Reintentar", tint = Color.White)
                        SwipeToDismissBoxValue.EndToStart ->
                            Icon(Icons.Outlined.Delete, "Descartar", tint = Color.White)
                        SwipeToDismissBoxValue.Settled -> { /* settled — no icon */ }
                    }
                }
            },
            content = {
                NxPanelShell(contentPadding = PaddingValues(12.dp)) {
                    Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
                        Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(2.dp)) {
                            Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                                Text(kind.label, fontWeight = FontWeight.SemiBold, color = NxColors.Slate)
                                Text(
                                    item.method,
                                    style = MaterialTheme.typography.labelSmall,
                                    color = NxColors.Teal,
                                    fontWeight = FontWeight.Bold,
                                )
                            }
                            Text(path, style = MaterialTheme.typography.bodySmall, color = NxColors.Muted)
                            Text(whenCreated, style = MaterialTheme.typography.labelSmall, color = NxColors.Muted)
                            if (item.attempts > 0) {
                                Row(
                                    horizontalArrangement = Arrangement.spacedBy(4.dp),
                                    verticalAlignment = Alignment.CenterVertically,
                                ) {
                                    Icon(
                                        Icons.Outlined.SyncProblem,
                                        null,
                                        modifier = Modifier.size(14.dp),
                                        tint = NxColors.Warning,
                                    )
                                    Text(
                                        "Intentos: ${item.attempts}" + (item.lastError?.let { " · $it" } ?: ""),
                                        style = MaterialTheme.typography.labelSmall,
                                        color = NxColors.Warning,
                                    )
                                }
                            }
                            if (item.body?.contains("nexara-media://") == true) {
                                Text("Incluye media local", style = MaterialTheme.typography.labelSmall, color = NxColors.Info)
                            }
                        }
                        if (isOnline) {
                            Icon(
                                Icons.Outlined.Sync,
                                "Reintentar",
                                modifier = Modifier.size(20.dp),
                                tint = NxColors.Muted.copy(alpha = 0.5f),
                            )
                        }
                    }
                }
            },
        )
    }
}
