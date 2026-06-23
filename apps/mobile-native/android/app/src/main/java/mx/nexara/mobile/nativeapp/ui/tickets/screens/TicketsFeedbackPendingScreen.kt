package mx.nexara.mobile.nativeapp.ui.tickets.screens

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
import androidx.compose.material3.OutlinedTextField
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
import mx.nexara.mobile.nativeapp.data.api.PendingFeedbackTicketDto
import mx.nexara.mobile.nativeapp.data.realtime.refreshOnModels
import mx.nexara.mobile.nativeapp.data.tickets.TicketsRepository

data class FeedbackDraft(
    val rating: String = "5",
    val wasOnTime: String = "YES",
    val wasFriendly: String = "YES",
    val wasSolved: String = "YES",
    val comments: String = "",
)

data class FeedbackUiState(
    val isLoading: Boolean = true,
    val saving: Boolean = false,
    val error: String? = null,
    val message: String? = null,
    val items: List<PendingFeedbackTicketDto> = emptyList(),
    val drafts: Map<Long, FeedbackDraft> = emptyMap(),
)

class TicketsFeedbackPendingViewModel(app: Application) : AndroidViewModel(app) {
    private val repo = TicketsRepository(app.applicationContext)
    private val _state = MutableStateFlow(FeedbackUiState())
    val state: StateFlow<FeedbackUiState> = _state

    init {
        refresh()
        refreshOnModels(
            models = setOf("Activity", "ClientSurvey", "ClientFeedback"),
            refresh = ::refresh,
        )
    }

    fun refresh() {
        _state.update { it.copy(isLoading = true, error = null, message = null) }
        viewModelScope.launch {
            try {
                val list = withContext(Dispatchers.IO) { repo.pendingFeedback() }
                _state.update { s ->
                    s.copy(
                        isLoading = false,
                        items = list,
                        drafts = list.associate { it.id to (s.drafts[it.id] ?: FeedbackDraft()) },
                    )
                }
            } catch (e: Exception) {
                _state.update {
                    it.copy(
                        isLoading = false,
                        error = e.message?.takeIf { m -> m.isNotBlank() } ?: "No se pudo cargar feedback pendiente",
                    )
                }
            }
        }
    }

    fun setDraft(id: Long, next: FeedbackDraft) = _state.update { it.copy(drafts = it.drafts + (id to next)) }

    fun dismissMessage() = _state.update { it.copy(message = null) }

    fun submit(activityId: Long) {
        val draft = _state.value.drafts[activityId] ?: FeedbackDraft()
        val ratingInt = draft.rating.trim().toIntOrNull()
        _state.update { it.copy(saving = true, error = null, message = null) }
        viewModelScope.launch {
            try {
                withContext(Dispatchers.IO) {
                    repo.submitFeedback(
                        activityId = activityId,
                        rating = ratingInt,
                        wasOnTime = draft.wasOnTime,
                        wasFriendly = draft.wasFriendly,
                        wasSolved = draft.wasSolved,
                        comments = draft.comments,
                    )
                }
                _state.update { it.copy(saving = false, message = "Feedback enviado") }
                refresh()
            } catch (e: Exception) {
                _state.update {
                    it.copy(
                        saving = false,
                        error = e.message?.takeIf { m -> m.isNotBlank() } ?: "No se pudo enviar feedback",
                    )
                }
            }
        }
    }
}

@Composable
fun TicketsFeedbackPendingScreen(
    onBack: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val vm: TicketsFeedbackPendingViewModel = viewModel()
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
        }

        Spacer(Modifier.height(12.dp))
        Text("Feedback pendiente", style = MaterialTheme.typography.titleLarge)
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
            Spacer(Modifier.height(10.dp))
            Button(onClick = { vm.refresh() }) { Text("Reintentar") }
            return@Column
        }

        if (state.items.isEmpty()) {
            Text("No hay feedback pendiente.", color = MaterialTheme.colorScheme.onSurfaceVariant)
            return@Column
        }

        LazyColumn(
            modifier = Modifier.fillMaxWidth(),
            verticalArrangement = Arrangement.spacedBy(10.dp),
        ) {
            items(state.items, key = { it.id }) { item ->
                val d = state.drafts[item.id] ?: FeedbackDraft()
                Card(
                    modifier = Modifier.fillMaxWidth(),
                    colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
                ) {
                    Column(Modifier.padding(12.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                        Text(item.titulo ?: "Ticket #${item.id}", style = MaterialTheme.typography.titleMedium)
                        val meta = listOfNotNull(item.anNumber?.takeIf { it.isNotBlank() }, item.fechaFinalizacion?.takeIf { it.isNotBlank() }).joinToString(" · ")
                        if (meta.isNotBlank()) Text(meta, color = MaterialTheme.colorScheme.onSurfaceVariant)

                        OutlinedTextField(
                            value = d.rating,
                            onValueChange = { vm.setDraft(item.id, d.copy(rating = it)) },
                            label = { Text("Rating (1-5)") },
                            singleLine = true,
                            modifier = Modifier.fillMaxWidth(),
                        )
                        OutlinedTextField(
                            value = d.comments,
                            onValueChange = { vm.setDraft(item.id, d.copy(comments = it)) },
                            label = { Text("Comentarios") },
                            modifier = Modifier.fillMaxWidth(),
                            minLines = 2,
                        )
                        Button(
                            onClick = { vm.submit(item.id) },
                            enabled = !state.saving,
                            modifier = Modifier.fillMaxWidth(),
                        ) { Text(if (state.saving) "Enviando…" else "Enviar feedback") }
                    }
                }
            }
        }
    }
}

