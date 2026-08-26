package mx.nexara.mobile.nativeapp.ui.shared

import android.app.Application
import androidx.compose.foundation.clickable
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FilterChip
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Text
import androidx.compose.material3.pulltorefresh.PullToRefreshBox
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import androidx.lifecycle.viewmodel.compose.viewModel
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import mx.nexara.mobile.nativeapp.access.DeepLinkDestination
import mx.nexara.mobile.nativeapp.access.NotificationDeepLinkResolver
import mx.nexara.mobile.nativeapp.data.api.NotificationRowDto
import mx.nexara.mobile.nativeapp.data.notifications.NotificationsRepository
import mx.nexara.mobile.nativeapp.data.realtime.RealtimeBus
import mx.nexara.mobile.nativeapp.ui.enterprise.NxSkeletonList

enum class NotificationFilter { ALL, UNREAD }

enum class NotificationViewMode { BANDEJA, FEED }

data class NotificationsUiState(
    val isLoading: Boolean = true,
    val isRefreshing: Boolean = false,
    val saving: Boolean = false,
    val error: String? = null,
    val message: String? = null,
    val unreadCount: Int = 0,
    val rows: List<NotificationRowDto> = emptyList(),
    val filter: NotificationFilter = NotificationFilter.ALL,
    val viewMode: NotificationViewMode = NotificationViewMode.BANDEJA,
    val feedItems: List<Map<String, Any?>> = emptyList(),
)

class NotificationsViewModel(app: Application) : AndroidViewModel(app) {
    private val repo = NotificationsRepository(app.applicationContext)
    private val consoleRepo = mx.nexara.mobile.nativeapp.data.console.ConsoleRepository(app.applicationContext)
    private val _state = MutableStateFlow(NotificationsUiState())
    val state: StateFlow<NotificationsUiState> = _state

    init {
        refresh(initial = true)
        var lastEventAt = 0L
        viewModelScope.launch {
            RealtimeBus.events.collect { event ->
                val model = event.model?.trim()?.lowercase()
                if (model != null && model != "notification") return@collect
                val now = System.currentTimeMillis()
                if (now - lastEventAt < 750) return@collect
                lastEventAt = now
                refresh(initial = false)
            }
        }
    }

    fun dismissMessage() = _state.update { it.copy(message = null) }

    fun setFilter(filter: NotificationFilter) = _state.update { it.copy(filter = filter) }

    fun setViewMode(mode: NotificationViewMode) {
        _state.update { it.copy(viewMode = mode) }
        if (mode == NotificationViewMode.FEED && _state.value.feedItems.isEmpty()) {
            loadFeed()
        }
    }

    fun loadFeed() {
        _state.update { it.copy(isLoading = true, error = null) }
        viewModelScope.launch {
            try {
                val items = withContext(Dispatchers.IO) { consoleRepo.activityFeed(limit = 40) }
                _state.update { it.copy(isLoading = false, feedItems = items, error = null) }
            } catch (e: Exception) {
                _state.update {
                    it.copy(
                        isLoading = false,
                        error = e.message ?: "No se pudo cargar el feed",
                    )
                }
            }
        }
    }

    fun refresh(initial: Boolean = false) {
        _state.update {
            if (initial) it.copy(isLoading = true, error = null, message = null)
            else it.copy(isRefreshing = true, error = null)
        }
        viewModelScope.launch {
            try {
                val count = withContext(Dispatchers.IO) { repo.unreadCount().unreadCount }
                val list = withContext(Dispatchers.IO) { repo.list(limit = 50, offset = 0) }
                _state.update {
                    it.copy(
                        isLoading = false,
                        isRefreshing = false,
                        rows = list,
                        unreadCount = count,
                        error = null,
                    )
                }
            } catch (e: Exception) {
                _state.update {
                    it.copy(
                        isLoading = false,
                        isRefreshing = false,
                        error = e.message?.takeIf { m -> m.isNotBlank() } ?: "No se pudieron cargar notificaciones",
                    )
                }
            }
        }
    }

    fun markAllRead() {
        _state.update { it.copy(saving = true, error = null, message = null) }
        viewModelScope.launch {
            try {
                withContext(Dispatchers.IO) { repo.markAllRead() }
                _state.update { it.copy(saving = false, message = "Marcadas como leídas") }
                refresh(initial = false)
            } catch (e: Exception) {
                _state.update { it.copy(saving = false, error = e.message ?: "No se pudo marcar") }
            }
        }
    }

    fun markRead(id: Long, onDone: (() -> Unit)? = null) {
        val row = _state.value.rows.firstOrNull { it.id == id }
        if (row?.isRead == true) {
            onDone?.invoke()
            return
        }
        _state.update { it.copy(saving = true, error = null, message = null) }
        viewModelScope.launch {
            try {
                withContext(Dispatchers.IO) { repo.markRead(id) }
                _state.update { state ->
                    state.copy(
                        saving = false,
                        rows = state.rows.map { if (it.id == id) it.copy(isRead = true) else it },
                        unreadCount = (state.unreadCount - 1).coerceAtLeast(0),
                    )
                }
                onDone?.invoke()
            } catch (e: Exception) {
                _state.update { it.copy(saving = false, error = e.message ?: "No se pudo marcar") }
            }
        }
    }

    fun delete(id: Long) {
        _state.update { it.copy(saving = true, error = null, message = null) }
        viewModelScope.launch {
            try {
                withContext(Dispatchers.IO) { repo.delete(id) }
                _state.update { it.copy(saving = false, message = "Eliminada") }
                refresh(initial = false)
            } catch (e: Exception) {
                _state.update { it.copy(saving = false, error = e.message ?: "No se pudo eliminar") }
            }
        }
    }

    fun openNotification(notification: NotificationRowDto, onNavigate: (DeepLinkDestination) -> Unit) {
        val destination = NotificationDeepLinkResolver.resolve(notification)
        val navigate: () -> Unit = {
            if (destination != null) onNavigate(destination)
        }
        if (notification.isRead != true) {
            markRead(notification.id, onDone = navigate)
        } else {
            navigate()
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun NotificationsScreen(
    onBack: () -> Unit,
    onOpenDestination: ((DeepLinkDestination) -> Unit)? = null,
    modifier: Modifier = Modifier,
) {
    val vm: NotificationsViewModel = viewModel()
    val state by vm.state.collectAsState()
    val filteredRows = when (state.filter) {
        NotificationFilter.ALL -> state.rows
        NotificationFilter.UNREAD -> state.rows.filter { it.isRead != true }
    }

    Column(
        modifier = modifier.fillMaxSize(),
        verticalArrangement = Arrangement.Top,
    ) {
        Row(
            horizontalArrangement = Arrangement.spacedBy(8.dp),
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = 16.dp, vertical = 16.dp),
        ) {
            OutlinedButton(onClick = onBack, modifier = Modifier.weight(1f)) { Text("Volver") }
            Button(
                onClick = { vm.markAllRead() },
                enabled = !state.saving && state.unreadCount > 0,
                modifier = Modifier.weight(1f),
            ) { Text("Leer todo") }
        }

        PullToRefreshBox(
            isRefreshing = state.isRefreshing,
            onRefresh = { vm.refresh(initial = false) },
            modifier = Modifier.fillMaxSize(),
        ) {
            LazyColumn(
                modifier = Modifier
                    .fillMaxSize()
                    .padding(horizontal = 16.dp),
                verticalArrangement = Arrangement.spacedBy(10.dp),
            ) {
                item {
                    Text("Notificaciones", style = MaterialTheme.typography.titleLarge)
                    Spacer(Modifier.height(4.dp))
                    Text(
                        "${state.unreadCount} sin leer · ${state.rows.size} total",
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }

                if (state.isLoading && state.rows.isEmpty()) {
                    item { NxSkeletonList() }
                    return@LazyColumn
                }

                item {
                    Row(
                        Modifier
                            .fillMaxWidth()
                            .horizontalScroll(rememberScrollState()),
                        horizontalArrangement = Arrangement.spacedBy(8.dp),
                    ) {
                        FilterChip(
                            selected = state.viewMode == NotificationViewMode.BANDEJA,
                            onClick = { vm.setViewMode(NotificationViewMode.BANDEJA) },
                            label = { Text("Bandeja") },
                        )
                        FilterChip(
                            selected = state.viewMode == NotificationViewMode.FEED,
                            onClick = { vm.setViewMode(NotificationViewMode.FEED) },
                            label = { Text("Feed") },
                        )
                    }
                }

                if (state.viewMode == NotificationViewMode.FEED) {
                    if (state.isLoading && state.feedItems.isEmpty()) {
                        item { NxSkeletonList() }
                    } else if (state.feedItems.isEmpty() && state.error.isNullOrBlank()) {
                        item {
                            Text(
                                "Sin actividad reciente",
                                color = MaterialTheme.colorScheme.onSurfaceVariant,
                                modifier = Modifier.padding(vertical = 24.dp),
                            )
                        }
                    } else {
                        items(state.feedItems.size) { idx ->
                            val item = state.feedItems[idx]
                            val title = (item["title"] as? String).orEmpty().ifBlank { "Evento" }
                            val subtitle = (item["subtitle"] as? String).orEmpty()
                            Card(modifier = Modifier.fillMaxWidth()) {
                                Column(Modifier.padding(12.dp)) {
                                    Text(title, style = MaterialTheme.typography.titleMedium)
                                    if (subtitle.isNotBlank()) {
                                        Text(subtitle, color = MaterialTheme.colorScheme.onSurfaceVariant)
                                    }
                                }
                            }
                        }
                    }
                    return@LazyColumn
                }

                item {
                    Row(
                        Modifier
                            .fillMaxWidth()
                            .horizontalScroll(rememberScrollState()),
                        horizontalArrangement = Arrangement.spacedBy(8.dp),
                    ) {
                        FilterChip(
                            selected = state.filter == NotificationFilter.ALL,
                            onClick = { vm.setFilter(NotificationFilter.ALL) },
                            label = { Text("Todas (${state.rows.size})") },
                        )
                        FilterChip(
                            selected = state.filter == NotificationFilter.UNREAD,
                            onClick = { vm.setFilter(NotificationFilter.UNREAD) },
                            label = { Text("Sin leer (${state.unreadCount})") },
                        )
                    }
                }

                if (!state.message.isNullOrBlank()) {
                    item {
                        Text(state.message!!, color = MaterialTheme.colorScheme.primary)
                        OutlinedButton(onClick = vm::dismissMessage) { Text("Cerrar") }
                    }
                }

                if (!state.error.isNullOrBlank()) {
                    item {
                        Text(state.error!!, color = MaterialTheme.colorScheme.error)
                        Button(onClick = { vm.refresh(initial = true) }) { Text("Reintentar") }
                    }
                }

                if (filteredRows.isEmpty() && state.error.isNullOrBlank()) {
                    item {
                        Text(
                            if (state.filter == NotificationFilter.UNREAD) "No hay notificaciones sin leer."
                            else "No hay notificaciones.",
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                            modifier = Modifier.padding(vertical = 24.dp),
                        )
                    }
                } else {
                    items(filteredRows, key = { it.id }) { n ->
                        val destination = NotificationDeepLinkResolver.resolve(n)
                        val isNavigable = destination != null && onOpenDestination != null
                        val isUnread = n.isRead != true
                        Card(
                            modifier = Modifier
                                .fillMaxWidth()
                                .then(
                                    if (isNavigable) {
                                        Modifier.clickable {
                                            vm.openNotification(n) { dest -> onOpenDestination?.invoke(dest) }
                                        }
                                    } else Modifier,
                                ),
                            colors = CardDefaults.cardColors(
                                containerColor = if (isUnread) {
                                    MaterialTheme.colorScheme.primaryContainer.copy(alpha = 0.25f)
                                } else {
                                    MaterialTheme.colorScheme.surface
                                },
                            ),
                        ) {
                            Column(Modifier.padding(12.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                                Text(
                                    n.title ?: "Notificación",
                                    style = MaterialTheme.typography.titleMedium,
                                    fontWeight = if (isUnread) FontWeight.SemiBold else FontWeight.Normal,
                                )
                                if (!n.message.isNullOrBlank()) {
                                    Text(n.message!!, color = MaterialTheme.colorScheme.onSurfaceVariant)
                                }
                                val meta = buildList {
                                    n.category?.takeIf { it.isNotBlank() }?.let { add(it) }
                                    n.createdAt?.takeIf { it.isNotBlank() }?.let { add(it.take(16)) }
                                    if (n.isRead == true) add("Leída") else add("No leída")
                                    if (isNavigable) add("Abrir módulo")
                                }.joinToString(" · ")
                                Text(
                                    meta,
                                    style = MaterialTheme.typography.labelMedium,
                                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                                )

                                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                                    if (isUnread) {
                                        OutlinedButton(
                                            onClick = { vm.markRead(n.id) },
                                            enabled = !state.saving,
                                        ) { Text("Marcar leída") }
                                    }
                                    OutlinedButton(
                                        onClick = { vm.delete(n.id) },
                                        enabled = !state.saving,
                                    ) { Text("Eliminar") }
                                }
                            }
                        }
                    }
                }

                item { Spacer(Modifier.height(16.dp)) }
            }
        }
    }
}
