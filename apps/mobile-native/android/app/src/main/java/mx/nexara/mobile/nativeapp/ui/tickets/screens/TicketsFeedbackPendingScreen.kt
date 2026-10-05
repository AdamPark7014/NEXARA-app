package mx.nexara.mobile.nativeapp.ui.tickets.screens

import android.app.Application
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Star
import androidx.compose.material.icons.outlined.StarOutline
import androidx.compose.material.icons.outlined.ThumbUp
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.input.KeyboardCapitalization
import androidx.compose.ui.text.style.TextOverflow
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
import mx.nexara.mobile.nativeapp.data.api.toUserMessage
import mx.nexara.mobile.nativeapp.data.realtime.refreshOnModels
import mx.nexara.mobile.nativeapp.data.tickets.TicketsRepository
import mx.nexara.mobile.nativeapp.ui.enterprise.NxAlert
import mx.nexara.mobile.nativeapp.ui.enterprise.NxAlertBanner
import mx.nexara.mobile.nativeapp.ui.enterprise.NxColors
import mx.nexara.mobile.nativeapp.ui.enterprise.NxDimens
import mx.nexara.mobile.nativeapp.ui.enterprise.NxEmptyState
import mx.nexara.mobile.nativeapp.ui.enterprise.NxErrorState
import mx.nexara.mobile.nativeapp.ui.enterprise.NxFormat
import mx.nexara.mobile.nativeapp.ui.enterprise.NxPanelShell
import mx.nexara.mobile.nativeapp.ui.enterprise.NxPrimaryButton
import mx.nexara.mobile.nativeapp.ui.enterprise.NxRefreshErrorBanner
import mx.nexara.mobile.nativeapp.ui.enterprise.NxScreenScaffold
import mx.nexara.mobile.nativeapp.ui.enterprise.NxSectionHeader
import mx.nexara.mobile.nativeapp.ui.enterprise.NxSegmented
import mx.nexara.mobile.nativeapp.ui.enterprise.NxSkeletonList
import mx.nexara.mobile.nativeapp.ui.enterprise.NxSpacing
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
            refresh = { refresh(initial = false, keepMessage = true) },
        )
    }

    /**
     * `keepMessage`: la recarga que sigue a enviar (y el aviso en tiempo real
     * que dispara el propio envío) conserva «Evaluación enviada. ¡Gracias!»;
     * antes esa recarga lo borraba al instante. El gesto de recargar sí lo quita.
     */
    fun refresh(initial: Boolean = false, keepMessage: Boolean = false) {
        _state.update {
            when {
                initial -> it.copy(isLoading = true, error = null, message = null)
                keepMessage -> it.copy(isRefreshing = true, error = null)
                else -> it.copy(isRefreshing = true, error = null, message = null)
            }
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
                        error = e.toUserMessage("No se pudo cargar feedback pendiente"),
                    )
                }
            }
        }
    }

    fun setDraft(id: Long, next: FeedbackDraft) = _state.update { it.copy(drafts = it.drafts + (id to next)) }

    fun dismissMessage() = _state.update { it.copy(message = null) }

    fun dismissError() = _state.update { it.copy(error = null) }

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
                _state.update { it.copy(saving = false, message = "Evaluación enviada. ¡Gracias!") }
                refresh(initial = false, keepMessage = true)
            } catch (e: Exception) {
                _state.update {
                    it.copy(
                        saving = false,
                        error = e.toUserMessage("No se pudo enviar feedback"),
                    )
                }
            }
        }
    }
}

private val YES_NO = listOf("YES" to "Sí", "NO" to "No")

@Composable
private fun YesNoRow(
    label: String,
    value: String,
    onChange: (String) -> Unit,
) {
    Row(
        modifier = Modifier.fillMaxWidth(),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(NxSpacing.M),
    ) {
        Text(
            label,
            style = MaterialTheme.typography.bodyMedium,
            color = NxColors.Slate,
            modifier = Modifier.weight(1f),
        )
        NxSegmented(
            options = YES_NO.map { it.second },
            selectedIndex = YES_NO.indexOfFirst { it.first == value.uppercase() }.coerceAtLeast(0),
            onSelect = { i -> onChange(YES_NO[i].first) },
        )
    }
}

@Composable
private fun StarRating(rating: Int, onRate: (Int) -> Unit) {
    Row(verticalAlignment = Alignment.CenterVertically) {
        (1..5).forEach { score ->
            val on = score <= rating
            IconButton(onClick = { onRate(score) }) {
                Icon(
                    if (on) Icons.Filled.Star else Icons.Outlined.StarOutline,
                    contentDescription = if (score == 1) "1 estrella" else "$score estrellas",
                    tint = if (on) Color(0xFFF59E0B) else NxColors.Muted,
                    modifier = Modifier.size(30.dp),
                )
            }
        }
    }
}

@Suppress("UNUSED_PARAMETER")
@Composable
fun TicketsFeedbackPendingScreen(
    onBack: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val vm: TicketsFeedbackPendingViewModel = viewModel()
    val state by vm.state.collectAsState()

    NxScreenScaffold(
        modifier = modifier,
        isRefreshing = state.isRefreshing,
        onRefresh = { vm.refresh(initial = false) },
    ) {
        when {
            state.isLoading -> NxSkeletonList(
                itemCount = 3,
                itemHeight = 220.dp,
                modifier = Modifier.fillMaxWidth().padding(NxSpacing.ListPadding),
            )
            state.items.isEmpty() && !state.error.isNullOrBlank() -> NxErrorState(
                message = state.error,
                onRetry = { vm.refresh(initial = true) },
            )
            else -> LazyColumn(
                modifier = Modifier.fillMaxSize(),
                contentPadding = NxSpacing.ListPadding,
                verticalArrangement = Arrangement.spacedBy(NxSpacing.ListGap),
            ) {
                item(key = "header") {
                    NxSectionHeader(
                        title = "Confirmación de servicio",
                        subtitle = "Ayúdanos a validar la calidad del servicio recibido.",
                    )
                }
                state.message?.takeIf { it.isNotBlank() }?.let { msg ->
                    item(key = "message") {
                        NxAlertBanner(
                            NxAlert(id = "message", title = msg, tone = NxTone.Success, actionLabel = "Cerrar", onAction = vm::dismissMessage),
                        )
                    }
                }
                state.error?.takeIf { it.isNotBlank() }?.let { msg ->
                    item(key = "refresh-error") {
                        NxRefreshErrorBanner(
                            message = msg,
                            onRetry = { vm.refresh(initial = false) },
                            onDismiss = vm::dismissError,
                        )
                    }
                }

                if (state.items.isEmpty()) {
                    item(key = "empty") {
                        NxEmptyState(
                            title = "Todo al día",
                            subtitle = "No tienes servicios pendientes de evaluar.",
                            icon = Icons.Outlined.ThumbUp,
                        )
                    }
                } else {
                    items(state.items, key = { it.id }, contentType = { "feedback" }) { item ->
                        val d = state.drafts[item.id] ?: FeedbackDraft()
                        FeedbackCard(
                            item = item,
                            draft = d,
                            saving = state.saving,
                            onDraft = { vm.setDraft(item.id, it) },
                            onSubmit = { vm.submit(item.id) },
                        )
                    }
                }
            }
        }
    }
}

@Composable
private fun FeedbackCard(
    item: PendingFeedbackTicketDto,
    draft: FeedbackDraft,
    saving: Boolean,
    onDraft: (FeedbackDraft) -> Unit,
    onSubmit: () -> Unit,
) {
    val d = draft
    NxPanelShell {
        Column(verticalArrangement = Arrangement.spacedBy(NxSpacing.S)) {
            Row(
                Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(8.dp),
                verticalAlignment = Alignment.Top,
            ) {
                Text(
                    item.anNumber?.takeIf { it.isNotBlank() } ?: "Ticket",
                    style = MaterialTheme.typography.titleSmall,
                    color = NxColors.Slate,
                    modifier = Modifier.weight(1f),
                )
                NxStatusChip("Por evaluar", NxTone.Warning)
            }
            Text(
                item.titulo?.takeIf { it.isNotBlank() } ?: "Servicio finalizado",
                style = MaterialTheme.typography.bodyMedium,
                color = NxColors.Slate,
                maxLines = 3,
                overflow = TextOverflow.Ellipsis,
            )
            item.fechaFinalizacion?.takeIf { it.isNotBlank() }?.let {
                Text(
                    "Finalizado el ${NxFormat.dateTime(it)}",
                    color = NxColors.Muted,
                    style = MaterialTheme.typography.bodySmall,
                )
            }

            Text(
                "¿Cómo calificas el servicio?",
                style = MaterialTheme.typography.labelLarge,
                color = NxColors.Slate,
                modifier = Modifier.padding(top = NxSpacing.S),
            )
            StarRating(rating = d.rating.toIntOrNull() ?: 0) { onDraft(d.copy(rating = it.toString())) }

            YesNoRow("Llegó a tiempo", d.wasOnTime) { onDraft(d.copy(wasOnTime = it)) }
            YesNoRow("Atención amable", d.wasFriendly) { onDraft(d.copy(wasFriendly = it)) }
            YesNoRow("Problema resuelto", d.wasSolved) { onDraft(d.copy(wasSolved = it)) }

            OutlinedTextField(
                value = d.comments,
                onValueChange = { onDraft(d.copy(comments = it)) },
                label = { Text("Comentarios (opcional)") },
                modifier = Modifier.fillMaxWidth(),
                shape = RoundedCornerShape(NxDimens.PanelRadius),
                minLines = 2,
                keyboardOptions = KeyboardOptions(capitalization = KeyboardCapitalization.Sentences),
            )
            NxPrimaryButton(
                text = if (saving) "Enviando…" else "Enviar evaluación",
                onClick = onSubmit,
                enabled = !saving,
                loading = saving,
            )
        }
    }
}
