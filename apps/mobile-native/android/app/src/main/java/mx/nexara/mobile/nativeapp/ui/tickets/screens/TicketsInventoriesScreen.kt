package mx.nexara.mobile.nativeapp.ui.tickets.screens

import android.app.Application
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.KeyboardArrowRight
import androidx.compose.material.icons.filled.PictureAsPdf
import androidx.compose.material.icons.outlined.Inventory2
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
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
import mx.nexara.mobile.nativeapp.data.api.ClientPortalInventorySnapshotDto
import mx.nexara.mobile.nativeapp.data.api.toUserMessage
import mx.nexara.mobile.nativeapp.data.realtime.refreshOnModels
import mx.nexara.mobile.nativeapp.data.tickets.TicketsRepository
import mx.nexara.mobile.nativeapp.ui.enterprise.NxAlert
import mx.nexara.mobile.nativeapp.ui.enterprise.NxAlertBanner
import mx.nexara.mobile.nativeapp.ui.enterprise.NxColors
import mx.nexara.mobile.nativeapp.ui.enterprise.NxDimens
import mx.nexara.mobile.nativeapp.ui.enterprise.NxEmptyState
import mx.nexara.mobile.nativeapp.ui.enterprise.NxErrorState
import mx.nexara.mobile.nativeapp.ui.enterprise.NxRefreshErrorBanner
import mx.nexara.mobile.nativeapp.ui.enterprise.NxScreenScaffold
import mx.nexara.mobile.nativeapp.ui.enterprise.NxSecondaryButton
import mx.nexara.mobile.nativeapp.ui.enterprise.NxSectionHeader
import mx.nexara.mobile.nativeapp.ui.enterprise.NxSkeletonList
import mx.nexara.mobile.nativeapp.ui.enterprise.NxSpacing
import mx.nexara.mobile.nativeapp.ui.enterprise.NxStatusChip
import mx.nexara.mobile.nativeapp.ui.enterprise.NxStatusLabels
import mx.nexara.mobile.nativeapp.ui.enterprise.NxTone
import mx.nexara.mobile.nativeapp.ui.util.openFile
import java.io.File

data class TicketsInventoriesUiState(
    val isLoading: Boolean = true,
    val isRefreshing: Boolean = false,
    val loaded: Boolean = false,
    val downloading: Boolean = false,
    val error: String? = null,
    val message: String? = null,
    val inventories: List<ClientPortalInventorySnapshotDto> = emptyList(),
)

class TicketsInventoriesViewModel(app: Application) : AndroidViewModel(app) {
    private val repo = TicketsRepository(app.applicationContext)
    private val _state = MutableStateFlow(TicketsInventoriesUiState())
    val state: StateFlow<TicketsInventoriesUiState> = _state

    init {
        refresh()
        refreshOnModels(
            models = setOf("InventorySnapshot", "InventoryItem"),
            refresh = ::refresh,
        )
    }

    fun dismissMessage() = _state.update { it.copy(message = null) }

    fun dismissError() = _state.update { it.copy(error = null) }

    fun refresh() {
        _state.update {
            if (it.loaded) it.copy(isRefreshing = true, error = null, message = null)
            else it.copy(isLoading = true, error = null, message = null)
        }
        viewModelScope.launch {
            try {
                val list = withContext(Dispatchers.IO) { repo.inventories() }
                _state.update {
                    it.copy(isLoading = false, isRefreshing = false, loaded = true, inventories = list, error = null)
                }
            } catch (e: Exception) {
                _state.update {
                    it.copy(
                        isLoading = false,
                        isRefreshing = false,
                        error = e.toUserMessage("No se pudieron cargar inventarios"),
                    )
                }
            }
        }
    }

    fun downloadPortalReportPdf() {
        _state.update { it.copy(downloading = true, error = null, message = null) }
        viewModelScope.launch {
            try {
                val app = getApplication<Application>()
                val file = withContext(Dispatchers.IO) {
                    val bytes = repo.portalReportPdfBytes()
                    val dir = File(app.cacheDir, "downloads").apply { mkdirs() }
                    File(dir, "reporte-tickets.pdf").apply { writeBytes(bytes) }
                }
                openFile(app, file, "application/pdf")
                _state.update { it.copy(downloading = false, message = "Reporte descargado") }
            } catch (e: Exception) {
                _state.update {
                    it.copy(
                        downloading = false,
                        error = e.toUserMessage("No se pudo descargar el reporte"),
                    )
                }
            }
        }
    }
}

@Suppress("UNUSED_PARAMETER")
@Composable
fun TicketsInventoriesScreen(
    onBack: () -> Unit,
    onOpenInventory: (Long) -> Unit,
    modifier: Modifier = Modifier,
) {
    val vm: TicketsInventoriesViewModel = viewModel()
    val state by vm.state.collectAsState()

    NxScreenScaffold(modifier = modifier, isRefreshing = state.isRefreshing, onRefresh = vm::refresh) {
        when {
            state.isLoading && !state.loaded -> NxSkeletonList(
                itemCount = 5,
                modifier = Modifier.fillMaxWidth().padding(NxSpacing.ListPadding),
            )
            !state.loaded && !state.error.isNullOrBlank() -> NxErrorState(message = state.error, onRetry = vm::refresh)
            else -> LazyColumn(
                modifier = Modifier.fillMaxSize(),
                contentPadding = NxSpacing.ListPadding,
                verticalArrangement = Arrangement.spacedBy(NxSpacing.ListGap),
            ) {
                state.message?.takeIf { it.isNotBlank() }?.let { msg ->
                    item(key = "message") {
                        NxAlertBanner(
                            NxAlert(id = "message", title = msg, tone = NxTone.Success, actionLabel = "Cerrar", onAction = vm::dismissMessage),
                        )
                    }
                }
                state.error?.takeIf { it.isNotBlank() }?.let { msg ->
                    item(key = "refresh-error") {
                        NxRefreshErrorBanner(message = msg, onRetry = vm::refresh, onDismiss = vm::dismissError)
                    }
                }
                item(key = "header") {
                    NxSectionHeader(
                        title = "Inventarios",
                        subtitle = "Equipos registrados en tus sucursales.",
                    )
                }
                item(key = "report") {
                    NxSecondaryButton(
                        text = if (state.downloading) "Descargando reporte…" else "Descargar reporte PDF",
                        icon = Icons.Default.PictureAsPdf,
                        onClick = vm::downloadPortalReportPdf,
                        loading = state.downloading,
                        modifier = Modifier.fillMaxWidth(),
                    )
                }
                if (state.inventories.isEmpty()) {
                    item(key = "empty") {
                        NxEmptyState(
                            title = "Sin inventarios",
                            subtitle = "Todavía no hay inventarios disponibles para tu empresa.",
                            icon = Icons.Outlined.Inventory2,
                        )
                    }
                } else {
                    items(state.inventories, key = { it.id }, contentType = { "inventory" }) { inv ->
                        InventoryRow(inv = inv, onOpen = { onOpenInventory(inv.id) })
                    }
                }
            }
        }
    }
}

@Composable
private fun InventoryRow(inv: ClientPortalInventorySnapshotDto, onOpen: () -> Unit) {
    Card(
        onClick = onOpen,
        modifier = Modifier.fillMaxWidth(),
        shape = RoundedCornerShape(NxDimens.PanelRadius),
        colors = CardDefaults.cardColors(containerColor = NxColors.Card),
        elevation = CardDefaults.cardElevation(NxDimens.PanelElevation),
    ) {
        Row(
            modifier = Modifier.padding(start = 14.dp, top = 12.dp, bottom = 12.dp, end = 6.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalAlignment = Alignment.Top) {
                    Text(
                        inv.title?.takeIf { it.isNotBlank() } ?: "Inventario #${inv.id}",
                        style = MaterialTheme.typography.titleSmall,
                        color = NxColors.Slate,
                        maxLines = 2,
                        overflow = TextOverflow.Ellipsis,
                        modifier = Modifier.weight(1f),
                    )
                    inv.status?.takeIf { it.isNotBlank() }?.let {
                        NxStatusChip(NxStatusLabels.label(it), NxStatusLabels.tone(it))
                    }
                }
                val meta = buildList {
                    inv.branch?.name?.takeIf { it.isNotBlank() }?.let { add(it) }
                    val count = inv.currentCount ?: inv.items?.size
                    if (count != null) add(if (count == 1) "1 equipo" else "$count equipos")
                }.joinToString(" · ")
                if (meta.isNotBlank()) {
                    Text(meta, color = NxColors.Muted, style = MaterialTheme.typography.bodySmall)
                }
            }
            Icon(
                Icons.AutoMirrored.Filled.KeyboardArrowRight,
                contentDescription = "Ver detalle",
                tint = NxColors.Muted,
            )
        }
    }
}
