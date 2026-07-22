package mx.nexara.mobile.nativeapp.ui.shared

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import kotlinx.coroutines.launch
import mx.nexara.mobile.nativeapp.data.AuthRepository
import mx.nexara.mobile.nativeapp.data.offline.NetworkMonitor
import mx.nexara.mobile.nativeapp.data.offline.NexaraOffline
import mx.nexara.mobile.nativeapp.data.offline.OfflineSyncCoordinator
import mx.nexara.mobile.nativeapp.data.offline.QueuedMutation
import mx.nexara.mobile.nativeapp.ui.enterprise.NxColors
import java.net.URI
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

/**
 * Cola de mutaciones offline: listar, sincronizar y descartar.
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
    val isOnline by NetworkMonitor.isOnline.collectAsState()

    fun refresh() {
        items = queue.load()
    }

    DisposableEffect(queue) {
        val listener = { refresh() }
        queue.addListener(listener)
        refresh()
        onDispose { queue.removeListener(listener) }
    }

    LazyColumn(
        modifier = Modifier.fillMaxSize().padding(contentPadding),
        verticalArrangement = Arrangement.spacedBy(10.dp),
    ) {
        item {
            Text("Cola offline", style = MaterialTheme.typography.titleLarge, fontWeight = FontWeight.Bold)
            Text(
                if (isOnline) "Con conexión — puedes sincronizar ahora"
                else "Sin conexión — los cambios se encolan aquí",
                style = MaterialTheme.typography.bodySmall,
                color = NxColors.Muted,
            )
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
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                Button(
                    onClick = {
                        scope.launch {
                            syncing = true
                            message = null
                            OfflineSyncCoordinator.replay(queue, auth.token())
                            refresh()
                            message = if (queue.load().isEmpty()) "✅ Cola vacía"
                            else "Quedan ${queue.load().size} pendientes"
                            syncing = false
                        }
                    },
                    enabled = !syncing && isOnline && items.isNotEmpty(),
                ) {
                    Text(if (syncing) "Sincronizando…" else "Sincronizar ahora")
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
                Card(
                    modifier = Modifier.fillMaxWidth(),
                    colors = CardDefaults.cardColors(containerColor = NxColors.SuccessSoft),
                ) {
                    Text(
                        "Sin mutaciones pendientes",
                        modifier = Modifier.padding(16.dp),
                        color = NxColors.Success,
                        fontWeight = FontWeight.SemiBold,
                    )
                }
            }
        } else {
            items(items, key = { it.id }) { item ->
                OfflineQueueCard(
                    item = item,
                    onDiscard = {
                        NexaraOffline.mediaStore().purgeRefsInBody(item.body)
                        queue.removeIds(setOf(item.id))
                        refresh()
                    },
                )
            }
        }

        item { Spacer(Modifier.height(24.dp)) }
    }
}

@Composable
private fun OfflineQueueCard(
    item: QueuedMutation,
    onDiscard: () -> Unit,
) {
    val path = remember(item.url) {
        runCatching { URI(item.url).path }.getOrNull()?.removePrefix("/api/") ?: item.url
    }
    val whenCreated = remember(item.createdAt) {
        SimpleDateFormat("dd MMM HH:mm", Locale.getDefault()).format(Date(item.createdAt))
    }
    Card(
        modifier = Modifier.fillMaxWidth(),
        colors = CardDefaults.cardColors(containerColor = Color.White),
        elevation = CardDefaults.cardElevation(1.dp),
    ) {
        Column(Modifier.padding(14.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
            Row(Modifier.fillMaxWidth()) {
                Text(item.method, fontWeight = FontWeight.Bold, color = NxColors.Teal)
                Spacer(Modifier.weight(1f))
                Text(whenCreated, style = MaterialTheme.typography.labelSmall, color = NxColors.Muted)
            }
            Text(path, style = MaterialTheme.typography.bodySmall)
            if (item.attempts > 0) {
                Text(
                    "Intentos: ${item.attempts}" + (item.lastError?.let { " · $it" } ?: ""),
                    style = MaterialTheme.typography.labelSmall,
                    color = NxColors.Warning,
                )
            }
            if (item.body?.contains("nexara-media://") == true) {
                Text("Incluye media local", style = MaterialTheme.typography.labelSmall, color = NxColors.Info)
            }
            TextButton(onClick = onDiscard) { Text("Descartar") }
        }
    }
}
