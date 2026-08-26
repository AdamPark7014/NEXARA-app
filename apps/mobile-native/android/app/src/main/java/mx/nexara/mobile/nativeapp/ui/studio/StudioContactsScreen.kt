package mx.nexara.mobile.nativeapp.ui.studio

import android.app.Application
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.pulltorefresh.PullToRefreshBox
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import mx.nexara.mobile.nativeapp.data.api.ContactMessageDto
import mx.nexara.mobile.nativeapp.data.api.UpdateContactMessageBody
import mx.nexara.mobile.nativeapp.data.studio.StudioRepository
import mx.nexara.mobile.nativeapp.ui.enterprise.NxColors
import mx.nexara.mobile.nativeapp.ui.enterprise.NxEmptyState
import mx.nexara.mobile.nativeapp.ui.enterprise.NxErrorBlock
import mx.nexara.mobile.nativeapp.ui.enterprise.NxLoadingBlock
import mx.nexara.mobile.nativeapp.ui.enterprise.NxPanelShell
import mx.nexara.mobile.nativeapp.ui.enterprise.NxSectionHeader

data class StudioContactsUiState(
    val loading: Boolean = true,
    val refreshing: Boolean = false,
    val saving: Boolean = false,
    val error: String? = null,
    val items: List<ContactMessageDto> = emptyList(),
    val selected: ContactMessageDto? = null,
    val responseDraft: String = "",
    val statusDraft: String = "new",
)

class StudioContactsViewModel(
    app: Application,
    private val leadsOnly: Boolean = false,
) : AndroidViewModel(app) {
    private val repo = StudioRepository(app.applicationContext)
    private val _state = MutableStateFlow(StudioContactsUiState())
    val state: StateFlow<StudioContactsUiState> = _state

    init { refresh() }

    fun refresh(pullToRefresh: Boolean = false) {
        _state.update {
            if (pullToRefresh) it.copy(refreshing = true, error = null)
            else it.copy(loading = true, error = null)
        }
        viewModelScope.launch {
            try {
                val list = withContext(Dispatchers.IO) { repo.contactMessages(limit = 100) }
                _state.update { it.copy(loading = false, refreshing = false, items = list) }
            } catch (e: Exception) {
                _state.update { it.copy(loading = false, refreshing = false, error = e.message) }
            }
        }
    }

    fun open(item: ContactMessageDto) = _state.update {
        it.copy(selected = item, responseDraft = "", statusDraft = item.status ?: "new")
    }

    fun closeDetail() = _state.update { it.copy(selected = null) }
    fun patchResponse(v: String) = _state.update { it.copy(responseDraft = v) }
    fun patchStatus(v: String) = _state.update { it.copy(statusDraft = v) }

    fun saveSelected() {
        val sel = _state.value.selected ?: return
        _state.update { it.copy(saving = true) }
        viewModelScope.launch {
            try {
                withContext(Dispatchers.IO) {
                    repo.updateContactMessage(
                        sel.id,
                        UpdateContactMessageBody(
                            status = _state.value.statusDraft.ifBlank { null },
                            responseMessage = _state.value.responseDraft.ifBlank { null },
                        ),
                    )
                }
                _state.update { it.copy(saving = false, selected = null) }
                refresh()
            } catch (e: Exception) {
                _state.update { it.copy(saving = false, error = e.message) }
            }
        }
    }

    fun deleteSelected() {
        val id = _state.value.selected?.id ?: return
        viewModelScope.launch {
            try {
                withContext(Dispatchers.IO) { repo.deleteContactMessage(id) }
                _state.update { it.copy(selected = null) }
                refresh()
            } catch (e: Exception) {
                _state.update { it.copy(error = e.message) }
            }
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun StudioContactsScreen(
    onBack: () -> Unit,
    leadsOnly: Boolean = false,
    vm: StudioContactsViewModel,
) {
    val ui by vm.state.collectAsState()

    if (ui.selected != null) {
        val m = ui.selected!!
        StudioScaffold(title = m.subject ?: m.name ?: "Contacto", subtitle = m.email, onBack = vm::closeDetail) { inner ->
            Column(
                Modifier
                    .fillMaxSize()
                    .background(NxColors.Surface)
                    .padding(inner)
                    .padding(16.dp),
                verticalArrangement = Arrangement.spacedBy(10.dp),
            ) {
                NxPanelShell {
                    Text(m.message ?: "", style = MaterialTheme.typography.bodyMedium, color = NxColors.Slate)
                    Text(
                        "Categoría: ${m.category ?: "—"} · Tel: ${m.phone ?: "—"}",
                        style = MaterialTheme.typography.labelSmall,
                        color = StudioMuted,
                    )
                }
                OutlinedTextField(ui.statusDraft, vm::patchStatus, label = { Text("Estado") }, modifier = Modifier.fillMaxWidth())
                OutlinedTextField(ui.responseDraft, vm::patchResponse, label = { Text("Respuesta interna") }, modifier = Modifier.fillMaxWidth().height(120.dp), minLines = 4)
                TextButton(onClick = vm::saveSelected, enabled = !ui.saving) { Text("Guardar cambios") }
                TextButton(onClick = vm::deleteSelected) { Text("Eliminar", color = MaterialTheme.colorScheme.error) }
            }
        }
        return
    }

    val listTitle = if (leadsOnly) "Leads" else "Contactos"
    val listSubtitle = if (leadsOnly) "Prospectos del sitio" else "Mensajes del formulario web"

    StudioScaffold(
        title = listTitle,
        subtitle = listSubtitle,
        onBack = onBack,
    ) { inner ->
        PullToRefreshBox(
            isRefreshing = ui.refreshing,
            onRefresh = { vm.refresh(pullToRefresh = true) },
            modifier = Modifier
                .fillMaxSize()
                .background(NxColors.Surface)
                .padding(inner),
        ) {
            LazyColumn(
                Modifier.fillMaxSize(),
                contentPadding = PaddingValues(16.dp),
                verticalArrangement = Arrangement.spacedBy(10.dp),
            ) {
                item {
                    NxSectionHeader(
                        listTitle,
                        listSubtitle,
                        trailing = if (ui.items.isNotEmpty()) {
                            { Text("${ui.items.size} mensajes", style = MaterialTheme.typography.labelSmall, color = StudioMuted) }
                        } else {
                            null
                        },
                    )
                }

                if (ui.loading && !ui.refreshing) {
                    item { NxLoadingBlock("Cargando mensajes…") }
                    return@LazyColumn
                }

                if (!ui.error.isNullOrBlank() && ui.items.isEmpty()) {
                    item { NxErrorBlock(ui.error!!, onRetry = { vm.refresh() }) }
                    return@LazyColumn
                }

                if (ui.items.isEmpty()) {
                    item {
                        NxEmptyState(
                            title = "Sin mensajes",
                            subtitle = "Los formularios del sitio aparecerán aquí.",
                        )
                    }
                } else {
                    items(ui.items, key = { it.id }) { m ->
                        NxPanelShell(onClick = { vm.open(m) }) {
                            Text(m.subject ?: m.name ?: "—", fontWeight = FontWeight.SemiBold, color = NxColors.Slate)
                            Text(
                                listOfNotNull(m.name, m.email).joinToString(" · "),
                                style = MaterialTheme.typography.labelSmall,
                                color = StudioMuted,
                            )
                            StudioStatusChip(m.status ?: "new")
                        }
                    }
                }

                item { Spacer(Modifier.height(24.dp)) }
            }
        }
    }
}

@Composable
fun StudioLeadsScreen(onBack: () -> Unit) {
    StudioContactsRoute(onBack = onBack, leadsOnly = true)
}
