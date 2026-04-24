package mx.nexara.mobile.nativeapp.ui.shared

import android.app.Application
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
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Modifier
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
import mx.nexara.mobile.nativeapp.data.AuthRepository
import mx.nexara.mobile.nativeapp.data.api.NotificationRowDto
import mx.nexara.mobile.nativeapp.data.notifications.NotificationsRepository
import mx.nexara.mobile.nativeapp.data.realtime.RealtimeBus

data class NotificationsUiState(
    val isLoading: Boolean = true,
    val saving: Boolean = false,
    val error: String? = null,
    val message: String? = null,
    val unreadCount: Int = 0,
    val rows: List<NotificationRowDto> = emptyList(),
)

class NotificationsViewModel(app: Application) : AndroidViewModel(app) {
    private val repo = NotificationsRepository(app.applicationContext)
    private val _state = MutableStateFlow(NotificationsUiState())
    val state: StateFlow<NotificationsUiState> = _state

    init {
        refresh()
        var lastEventAt = 0L
        viewModelScope.launch {
            RealtimeBus.events.collect { event ->
                val model = event.model?.trim()?.lowercase()
                if (model != null && model != "notification") return@collect
                val now = System.currentTimeMillis()
                if (now - lastEventAt < 750) return@collect
                lastEventAt = now
                refresh()
            }
        }
    }

    fun dismissMessage() = _state.update { it.copy(message = null) }

    fun refresh() {
        _state.update { it.copy(isLoading = true, error = null, message = null) }
        viewModelScope.launch {
            try {
                val count = withContext(Dispatchers.IO) { repo.unreadCount().unreadCount }
                val list = withContext(Dispatchers.IO) { repo.list(limit = 50, offset = 0) }
                _state.update { it.copy(isLoading = false, rows = list, unreadCount = count, error = null) }
            } catch (e: Exception) {
                _state.update {
                    it.copy(
                        isLoading = false,
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
                refresh()
            } catch (e: Exception) {
                _state.update { it.copy(saving = false, error = e.message ?: "No se pudo marcar") }
            }
        }
    }

    fun markRead(id: Long) {
        _state.update { it.copy(saving = true, error = null, message = null) }
        viewModelScope.launch {
            try {
                withContext(Dispatchers.IO) { repo.markRead(id) }
                _state.update { it.copy(saving = false) }
                refresh()
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
                refresh()
            } catch (e: Exception) {
                _state.update { it.copy(saving = false, error = e.message ?: "No se pudo eliminar") }
            }
        }
    }
}

@Composable
fun NotificationsScreen(
    onBack: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val vm: NotificationsViewModel = viewModel()
    val state by vm.state.collectAsState()

    Column(
        modifier = modifier
            .fillMaxSize()
            .padding(16.dp),
        verticalArrangement = Arrangement.Top,
    ) {
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp), modifier = Modifier.fillMaxWidth()) {
            OutlinedButton(onClick = onBack, modifier = Modifier.weight(1f)) { Text("Volver") }
            OutlinedButton(onClick = { vm.refresh() }, modifier = Modifier.weight(1f)) { Text("Actualizar") }
            Button(
                onClick = { vm.markAllRead() },
                enabled = !state.saving,
                modifier = Modifier.weight(1f),
            ) { Text("Leer todo") }
        }

        Spacer(Modifier.height(12.dp))
        Text("Notificaciones", style = MaterialTheme.typography.titleLarge)
        Spacer(Modifier.height(6.dp))
        Text("No leídas: ${state.unreadCount}", color = MaterialTheme.colorScheme.onSurfaceVariant)
        Spacer(Modifier.height(8.dp))

        if (!state.message.isNullOrBlank()) {
            Text(state.message!!, color = MaterialTheme.colorScheme.primary)
            OutlinedButton(onClick = vm::dismissMessage) { Text("Cerrar") }
            Spacer(Modifier.height(8.dp))
        }

        if (state.isLoading) {
            Text("Cargando…", color = MaterialTheme.colorScheme.onSurfaceVariant)
            return@Column
        }

        if (!state.error.isNullOrBlank()) {
            Text(state.error!!, color = MaterialTheme.colorScheme.error)
            Spacer(Modifier.height(8.dp))
            Button(onClick = { vm.refresh() }) { Text("Reintentar") }
            return@Column
        }

        if (state.rows.isEmpty()) {
            Text("No hay notificaciones.", color = MaterialTheme.colorScheme.onSurfaceVariant)
            return@Column
        }

        LazyColumn(
            modifier = Modifier.fillMaxWidth(),
            verticalArrangement = Arrangement.spacedBy(10.dp),
        ) {
            items(state.rows, key = { it.id }) { n ->
                Card(
                    modifier = Modifier.fillMaxWidth(),
                    colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
                ) {
                    Column(Modifier.padding(12.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                        Text(n.title ?: "Notificación", style = MaterialTheme.typography.titleMedium)
                        if (!n.message.isNullOrBlank()) {
                            Text(n.message!!, color = MaterialTheme.colorScheme.onSurfaceVariant)
                        }
                        val meta = buildList {
                            n.category?.takeIf { it.isNotBlank() }?.let { add(it) }
                            n.createdAt?.takeIf { it.isNotBlank() }?.let { add(it) }
                            if (n.isRead == true) add("Leída") else add("No leída")
                        }.joinToString(" · ")
                        Text(meta, style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)

                        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                            OutlinedButton(
                                onClick = { vm.markRead(n.id) },
                                enabled = !state.saving && n.isRead != true,
                            ) { Text("Marcar leída") }
                            OutlinedButton(
                                onClick = { vm.delete(n.id) },
                                enabled = !state.saving,
                            ) { Text("Eliminar") }
                        }
                    }
                }
            }
        }
    }
}

