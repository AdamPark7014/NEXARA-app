package mx.nexara.mobile.nativeapp.ui.ventas

import android.app.Application
import android.net.Uri
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import androidx.lifecycle.viewmodel.compose.viewModel
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import mx.nexara.mobile.nativeapp.data.api.CrmOppAttachmentDto
import mx.nexara.mobile.nativeapp.data.api.CrmOppHistoryEventDto
import mx.nexara.mobile.nativeapp.data.api.CrmOppNoteDto
import mx.nexara.mobile.nativeapp.data.api.CrmOppQuoteDto
import mx.nexara.mobile.nativeapp.data.api.CrmOpportunityDetailDto
import mx.nexara.mobile.nativeapp.data.api.toAbsoluteAssetUrl
import mx.nexara.mobile.nativeapp.data.crm.CrmRepository
import mx.nexara.mobile.nativeapp.ui.common.CapturedMedia
import mx.nexara.mobile.nativeapp.ui.common.MediaPickerBar
import mx.nexara.mobile.nativeapp.ui.common.PdfViewerScreen
import mx.nexara.mobile.nativeapp.ui.enterprise.NxEmptyState
import java.io.File

private val tabs = listOf("Resumen", "Notas", "Adjuntos", "Cotizaciones", "Historial")

data class OppDetailUiState(
    val isLoading: Boolean = true,
    val error: String? = null,
    val detail: CrmOpportunityDetailDto = CrmOpportunityDetailDto(),
    val tab: Int = 0,
    val noteText: String = "",
    val savingNote: Boolean = false,
    val uploading: Boolean = false,
    val actionError: String? = null,
    val showEditForm: Boolean = false,
    val form: OpportunityFormState = OpportunityFormState(),
    val savingForm: Boolean = false,
    val pdfFile: File? = null,
    val pdfTitle: String = "",
)

class OppDetailViewModel(app: Application, private val oppId: Long) : AndroidViewModel(app) {
    private val repo = CrmRepository(app.applicationContext)
    private val _state = MutableStateFlow(OppDetailUiState())
    val state: StateFlow<OppDetailUiState> = _state

    init { refresh() }

    fun refresh() {
        viewModelScope.launch {
            _state.update { it.copy(isLoading = true, error = null) }
            try {
                val detail = withContext(Dispatchers.IO) { repo.opportunityDetail(oppId) }
                _state.update { it.copy(isLoading = false, detail = detail) }
            } catch (e: Exception) {
                _state.update { it.copy(isLoading = false, error = e.message) }
            }
        }
    }

    fun setTab(i: Int) = _state.update { it.copy(tab = i) }
    fun setNoteText(t: String) = _state.update { it.copy(noteText = t) }

    fun addNote() {
        val msg = _state.value.noteText.trim()
        if (msg.isBlank()) return
        viewModelScope.launch {
            _state.update { it.copy(savingNote = true, actionError = null) }
            try {
                withContext(Dispatchers.IO) { repo.addOpportunityNote(oppId, msg) }
                _state.update { it.copy(savingNote = false, noteText = "") }
                refresh()
            } catch (e: Exception) {
                _state.update { it.copy(savingNote = false, actionError = e.message) }
            }
        }
    }

    fun uploadFiles(uris: List<Uri>) {
        if (uris.isEmpty()) return
        viewModelScope.launch {
            _state.update { it.copy(uploading = true, actionError = null) }
            try {
                withContext(Dispatchers.IO) { repo.addOpportunityEvidences(oppId, uris) }
                _state.update { it.copy(uploading = false) }
                refresh()
            } catch (e: Exception) {
                _state.update { it.copy(uploading = false, actionError = e.message) }
            }
        }
    }

    fun openEdit() = _state.update {
        it.copy(showEditForm = true, form = it.detail.raw.toOpportunityFormState(), actionError = null)
    }

    fun closeEdit() = _state.update { it.copy(showEditForm = false) }

    fun setForm(f: OpportunityFormState) = _state.update { it.copy(form = f) }

    fun saveEdit() {
        val f = _state.value.form
        if (f.title.isBlank()) {
            _state.update { it.copy(actionError = "El título es obligatorio") }
            return
        }
        viewModelScope.launch {
            _state.update { it.copy(savingForm = true, actionError = null) }
            try {
                withContext(Dispatchers.IO) { repo.updateOpportunity(oppId, f.toPayload()) }
                _state.update { it.copy(savingForm = false, showEditForm = false) }
                refresh()
            } catch (e: Exception) {
                _state.update { it.copy(savingForm = false, actionError = e.message) }
            }
        }
    }

    fun delete(onDone: () -> Unit) {
        viewModelScope.launch {
            try {
                withContext(Dispatchers.IO) { repo.deleteOpportunity(oppId) }
                onDone()
            } catch (e: Exception) {
                _state.update { it.copy(actionError = e.message) }
            }
        }
    }

    fun openQuotePdf(url: String, title: String) {
        if (url.isBlank()) return
        viewModelScope.launch {
            try {
                val bytes = withContext(Dispatchers.IO) { repo.downloadAssetBytes(url) }
                val file = File(getApplication<Application>().cacheDir, "quote-${oppId}.pdf")
                file.writeBytes(bytes)
                _state.update { it.copy(pdfFile = file, pdfTitle = title) }
            } catch (e: Exception) {
                _state.update { it.copy(actionError = e.message) }
            }
        }
    }

    fun closePdf() = _state.update { it.copy(pdfFile = null, pdfTitle = "") }
}

private val OppGreen = Color(0xFF10B981)

@Composable
private fun OppStageChip(text: String) {
    Surface(shape = RoundedCornerShape(999.dp), color = OppGreen.copy(alpha = 0.12f)) {
        Text(
            text.ifBlank { "—" },
            modifier = Modifier.padding(horizontal = 10.dp, vertical = 4.dp),
            style = MaterialTheme.typography.labelSmall,
            color = OppGreen,
            fontWeight = FontWeight.SemiBold,
        )
    }
}

private fun oppFmtMxn(v: Double): String = "$" + String.format("%,.0f", v)

@Composable
fun VentasOpportunityDetailScreen(oppId: Long, onBack: () -> Unit) {
    val ctx = LocalContext.current
    val vm: OppDetailViewModel = viewModel(
        key = "opp-$oppId",
        factory = object : androidx.lifecycle.ViewModelProvider.Factory {
            @Suppress("UNCHECKED_CAST")
            override fun <T : androidx.lifecycle.ViewModel> create(modelClass: Class<T>): T =
                OppDetailViewModel(ctx.applicationContext as Application, oppId) as T
        },
    )
    val state by vm.state.collectAsState()
    val detail = state.detail
    var confirmDelete by remember { mutableStateOf(false) }

    if (state.pdfFile != null) {
        PdfViewerScreen(
            file = state.pdfFile!!,
            title = state.pdfTitle.ifBlank { "Cotización PDF" },
            onClose = vm::closePdf,
        )
        return
    }

    Column(Modifier.fillMaxSize()) {
        Row(
            Modifier.fillMaxWidth().padding(horizontal = 8.dp, vertical = 4.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            TextButton(onClick = onBack) { Text("← Volver") }
            Text(
                detail.displayTitle,
                style = MaterialTheme.typography.titleMedium,
                fontWeight = FontWeight.Bold,
                modifier = Modifier.weight(1f),
            )
            TextButton(onClick = vm::openEdit) { Text("Editar") }
            TextButton(onClick = { confirmDelete = true }) { Text("Eliminar", color = MaterialTheme.colorScheme.error) }
        }
        ScrollableTabRow(selectedTabIndex = state.tab, edgePadding = 8.dp) {
            tabs.forEachIndexed { i, label ->
                Tab(selected = state.tab == i, onClick = { vm.setTab(i) }, text = { Text(label) })
            }
        }
        when {
            state.isLoading -> Box(Modifier.fillMaxSize(), Alignment.Center) { CircularProgressIndicator() }
            !state.error.isNullOrBlank() && detail.isEmpty -> NxEmptyState(
                title = "No se pudo cargar",
                subtitle = state.error ?: "",
                actionLabel = "Reintentar",
                onAction = vm::refresh,
            )
            else -> when (state.tab) {
                0 -> OppSummaryTab(detail)
                1 -> OppNotesTab(detail.notes, state, vm)
                2 -> OppAttachmentsTab(detail.attachments, state, vm)
                3 -> OppQuotesTab(detail.quotes, onOpen = { url, title -> vm.openQuotePdf(url, title) })
                else -> OppHistorialTab(detail.history)
            }
        }
    }

    if (state.showEditForm) {
        OpportunityFormSheet(
            title = "Editar oportunidad",
            state = state.form,
            onChange = vm::setForm,
            saving = state.savingForm,
            error = state.actionError,
            onDismiss = vm::closeEdit,
            onSave = vm::saveEdit,
        )
    }

    if (confirmDelete) {
        AlertDialog(
            onDismissRequest = { confirmDelete = false },
            title = { Text("Eliminar oportunidad") },
            text = { Text("¿Eliminar esta oportunidad del pipeline?") },
            confirmButton = {
                TextButton(onClick = { confirmDelete = false; vm.delete(onBack) }) {
                    Text("Eliminar", color = MaterialTheme.colorScheme.error)
                }
            },
            dismissButton = { TextButton(onClick = { confirmDelete = false }) { Text("Cancelar") } },
        )
    }
}

@Composable
private fun OppSummaryTab(detail: CrmOpportunityDetailDto) {
    LazyColumn(contentPadding = PaddingValues(16.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
        item {
            OppStageChip(detail.stageKey)
            Spacer(Modifier.height(8.dp))
            detailRow("Valor", oppFmtMxn(detail.value))
            if (detail.probability > 0) {
                detailRow("Probabilidad", "${detail.probability.toInt()}%")
            }
            detailRow("Cliente", detail.clientName)
            detailRow("Cierre estimado", detail.expectedCloseDate.take(10))
            detailRow("Descripción", detail.description)
        }
    }
}

@Composable
private fun OppNotesTab(notes: List<CrmOppNoteDto>, state: OppDetailUiState, vm: OppDetailViewModel) {
    Column(Modifier.fillMaxSize()) {
        LazyColumn(
            modifier = Modifier.weight(1f),
            contentPadding = PaddingValues(16.dp),
            verticalArrangement = Arrangement.spacedBy(8.dp),
        ) {
            if (!state.actionError.isNullOrBlank()) {
                item { Text(state.actionError ?: "", color = MaterialTheme.colorScheme.error, style = MaterialTheme.typography.bodySmall) }
            }
            if (notes.isEmpty()) {
                item {
                    NxEmptyState(
                        title = "Sin notas",
                        subtitle = "Agrega notas de seguimiento para el equipo comercial.",
                    )
                }
            } else {
                items(notes, key = { it.rowKey }) { note ->
                    Card(shape = RoundedCornerShape(10.dp)) {
                        Column(Modifier.padding(12.dp)) {
                            Text(note.message, style = MaterialTheme.typography.bodyMedium)
                            Text(
                                note.createdAt.take(16),
                                style = MaterialTheme.typography.labelSmall,
                                color = MaterialTheme.colorScheme.onSurfaceVariant,
                            )
                        }
                    }
                }
            }
        }
        Column(Modifier.fillMaxWidth().padding(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
            OutlinedTextField(
                state.noteText,
                vm::setNoteText,
                modifier = Modifier.fillMaxWidth(),
                placeholder = { Text("Nueva nota de seguimiento…") },
                minLines = 2,
            )
            Button(
                onClick = vm::addNote,
                enabled = !state.savingNote && state.noteText.isNotBlank(),
                modifier = Modifier.fillMaxWidth(),
            ) {
                if (state.savingNote) CircularProgressIndicator(Modifier.size(18.dp), strokeWidth = 2.dp)
                else Text("Agregar nota")
            }
        }
    }
}

@Composable
private fun OppAttachmentsTab(attachments: List<CrmOppAttachmentDto>, state: OppDetailUiState, vm: OppDetailViewModel) {
    Column(Modifier.fillMaxSize().padding(16.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
        if (!state.actionError.isNullOrBlank()) {
            Text(state.actionError ?: "", color = MaterialTheme.colorScheme.error, style = MaterialTheme.typography.bodySmall)
        }
        if (state.uploading) {
            LinearProgressIndicator(Modifier.fillMaxWidth())
        }
        MediaPickerBar(
            onPicked = { picked: List<CapturedMedia> ->
                vm.uploadFiles(picked.map { it.uri })
            },
            allowCamera = true,
            allowGallery = true,
            allowDocuments = true,
        )
        if (attachments.isEmpty()) {
            NxEmptyState(
                title = "Sin adjuntos",
                subtitle = "Sube fotos o documentos vinculados a esta oportunidad.",
            )
        } else {
            attachments.forEach { ev ->
                Card(shape = RoundedCornerShape(10.dp)) {
                    Column(Modifier.padding(12.dp)) {
                        Text(ev.displayName, fontWeight = FontWeight.SemiBold)
                        Text(
                            if (ev.url.isNotBlank()) toAbsoluteAssetUrl(ev.url) else "—",
                            style = MaterialTheme.typography.labelSmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                        )
                    }
                }
            }
        }
    }
}

@Composable
private fun OppQuotesTab(quotes: List<CrmOppQuoteDto>, onOpen: (String, String) -> Unit) {
    LazyColumn(contentPadding = PaddingValues(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
        if (quotes.isEmpty()) {
            item {
                NxEmptyState(
                    title = "Sin cotizaciones",
                    subtitle = "Las cotizaciones vinculadas a esta oportunidad aparecerán aquí.",
                )
            }
        } else {
            items(quotes, key = { it.rowKey }) { q ->
                Card(
                    shape = RoundedCornerShape(10.dp),
                    modifier = Modifier.then(
                        if (q.pdfUrl.isNotBlank()) Modifier.clickable { onOpen(q.pdfUrl, q.displayLabel) } else Modifier,
                    ),
                ) {
                    Column(Modifier.padding(12.dp)) {
                        Text(q.displayLabel, fontWeight = FontWeight.SemiBold)
                        if (q.pdfUrl.isNotBlank()) {
                            Text("Toca para ver PDF", style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.primary)
                        }
                        Text(q.createdAt.take(16), style = MaterialTheme.typography.labelSmall)
                    }
                }
            }
        }
    }
}

@Composable
private fun OppHistorialTab(history: List<CrmOppHistoryEventDto>) {
    LazyColumn(contentPadding = PaddingValues(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
        if (history.isEmpty()) {
            item {
                NxEmptyState(
                    title = "Sin historial",
                    subtitle = "Los cambios de etapa y actividad se registrarán aquí.",
                )
            }
        } else {
            items(history.take(50), key = { it.rowKey }) { h ->
                Card(shape = RoundedCornerShape(10.dp), modifier = Modifier.fillMaxWidth()) {
                    Column(Modifier.padding(12.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                            Text(h.displayAction, fontWeight = FontWeight.SemiBold, fontSize = 13.sp)
                            if (h.createdAt.isNotBlank()) {
                                Text(h.createdAt.take(16), fontSize = 11.sp, color = MaterialTheme.colorScheme.onSurfaceVariant)
                            }
                        }
                        if (h.userName.isNotBlank()) {
                            Text("Por: ${h.userName}", fontSize = 12.sp, color = MaterialTheme.colorScheme.onSurfaceVariant)
                        }
                        if (h.detail.isNotBlank()) {
                            Text(h.detail, fontSize = 12.sp, color = MaterialTheme.colorScheme.onSurfaceVariant, maxLines = 3)
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun detailRow(label: String, value: String) {
    if (value.isBlank() || value == "—") return
    Row(Modifier.fillMaxWidth().padding(vertical = 4.dp), horizontalArrangement = Arrangement.SpaceBetween) {
        Text(label, color = MaterialTheme.colorScheme.onSurfaceVariant)
        Text(value, fontWeight = FontWeight.Medium)
    }
}
