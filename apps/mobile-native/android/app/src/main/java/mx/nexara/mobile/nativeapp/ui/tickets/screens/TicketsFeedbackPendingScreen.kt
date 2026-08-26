package mx.nexara.mobile.nativeapp.ui.tickets.screens

import android.app.Application
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
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FilterChip
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
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
import mx.nexara.mobile.nativeapp.data.api.PendingFeedbackTicketDto
import mx.nexara.mobile.nativeapp.data.realtime.refreshOnModels
import mx.nexara.mobile.nativeapp.data.tickets.TicketsRepository
import mx.nexara.mobile.nativeapp.ui.enterprise.NxLoadingBlock
import mx.nexara.mobile.nativeapp.ui.enterprise.NxStatusChip
import mx.nexara.mobile.nativeapp.ui.enterprise.NxTone

data class FeedbackDraft(
    val rating: String = "5",
    val wasOnTime: String = "YES",
    val wasFriendly: String = "YES",
    val wasSolved: String = "YES",
    val comments: String = "",
)

data class FeedbackUiState(
    val isLoading: Boolean = true,
    val isRefreshing: Boolean = false,
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
        refresh(initial = true)
        refreshOnModels(
            models = setOf("Activity", "ClientSurvey", "ClientFeedback"),
            refresh = { refresh(initial = false) },
        )
    }

    fun refresh(initial: Boolean = false) {
        _state.update {
            if (initial) it.copy(isLoading = true, error = null, message = null)
            else it.copy(isRefreshing = true, error = null, message = null)
        }
        viewModelScope.launch {
            try {
                val list = withContext(Dispatchers.IO) { repo.pendingFeedback() }
                _state.update { s ->
                    s.copy(
                        isLoading = false,
                        isRefreshing = false,
                        items = list,
                        drafts = list.associate { it.id to (s.drafts[it.id] ?: FeedbackDraft()) },
                    )
                }
            } catch (e: Exception) {
                _state.update {
                    it.copy(
                        isLoading = false,
                        isRefreshing = false,
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
                _state.update { it.copy(saving = false, message = "Evaluación enviada") }
                refresh(initial = false)
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
private fun YesNoChipRow(
    label: String,
    value: String,
    onChange: (String) -> Unit,
) {
    Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
        Text(label, style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
        Row(
            Modifier.horizontalScroll(rememberScrollState()),
            horizontalArrangement = Arrangement.spacedBy(6.dp),
        ) {
            listOf("YES" to "Sí", "NO" to "No").forEach { (key, labelText) ->
                FilterChip(
                    selected = value.uppercase() == key,
                    onClick = { onChange(key) },
                    label = { Text(labelText) },
                )
            }
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun TicketsFeedbackPendingScreen(
    onBack: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val vm: TicketsFeedbackPendingViewModel = viewModel()
    val state by vm.state.collectAsState()

    Column(modifier = modifier.fillMaxSize()) {
        Row(
            horizontalArrangement = Arrangement.spacedBy(8.dp),
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = 16.dp, vertical = 16.dp),
        ) {
            OutlinedButton(onClick = onBack, modifier = Modifier.weight(1f)) { Text("Volver") }
            OutlinedButton(onClick = { vm.refresh(initial = false) }, modifier = Modifier.weight(1f)) { Text("Actualizar") }
        }

        if (state.isLoading) {
            NxLoadingBlock("Cargando feedback pendiente…")
            return@Column
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
                    Text("Confirmación de servicio", style = MaterialTheme.typography.titleLarge, fontWeight = FontWeight.Bold)
                    Text(
                        "Ayúdanos a validar la calidad del servicio recibido",
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
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

                if (state.items.isEmpty()) {
                    item {
                        Text("No hay feedback pendiente.", color = MaterialTheme.colorScheme.onSurfaceVariant)
                    }
                } else {
                    items(state.items, key = { it.id }) { item ->
                        val d = state.drafts[item.id] ?: FeedbackDraft()
                        Card(
                            modifier = Modifier.fillMaxWidth(),
                            shape = RoundedCornerShape(14.dp),
                            colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
                            elevation = CardDefaults.cardElevation(2.dp),
                        ) {
                            Column(Modifier.padding(12.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                                Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                                    Text(
                                        item.anNumber ?: "Ticket",
                                        style = MaterialTheme.typography.titleMedium,
                                        fontWeight = FontWeight.SemiBold,
                                        modifier = Modifier.weight(1f),
                                    )
                                    NxStatusChip("Pendiente", NxTone.Warning)
                                }
                                Text(item.titulo ?: "Servicio finalizado", color = MaterialTheme.colorScheme.onSurfaceVariant)
                                val meta = listOfNotNull(
                                    item.fechaFinalizacion?.takeIf { it.isNotBlank() }?.let { "Finalizado: $it" },
                                ).joinToString(" · ")
                                if (meta.isNotBlank()) {
                                    Text(meta, color = MaterialTheme.colorScheme.onSurfaceVariant, style = MaterialTheme.typography.bodySmall)
                                }

                                Text("Calificación (1-5)", style = MaterialTheme.typography.labelMedium)
                                Row(
                                    Modifier.horizontalScroll(rememberScrollState()),
                                    horizontalArrangement = Arrangement.spacedBy(6.dp),
                                ) {
                                    (1..5).forEach { score ->
                                        FilterChip(
                                            selected = d.rating == score.toString(),
                                            onClick = { vm.setDraft(item.id, d.copy(rating = score.toString())) },
                                            label = { Text(score.toString()) },
                                        )
                                    }
                                }

                                YesNoChipRow("Llegó a tiempo", d.wasOnTime) { vm.setDraft(item.id, d.copy(wasOnTime = it)) }
                                YesNoChipRow("Atención amable", d.wasFriendly) { vm.setDraft(item.id, d.copy(wasFriendly = it)) }
                                YesNoChipRow("Problema resuelto", d.wasSolved) { vm.setDraft(item.id, d.copy(wasSolved = it)) }

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
                                ) { Text(if (state.saving) "Enviando…" else "Enviar evaluación") }
                            }
                        }
                    }
                }

                item { Spacer(Modifier.height(8.dp)) }
            }
        }
    }
}
