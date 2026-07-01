package mx.nexara.mobile.nativeapp.ui.ventas

import android.app.Application
import android.net.Uri
import androidx.compose.foundation.clickable
import androidx.compose.foundation.background
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
import mx.nexara.mobile.nativeapp.data.api.toAbsoluteAssetUrl
import mx.nexara.mobile.nativeapp.data.crm.CrmRepository
import mx.nexara.mobile.nativeapp.ui.common.CapturedMedia
import mx.nexara.mobile.nativeapp.ui.common.MediaPickerBar
import mx.nexara.mobile.nativeapp.ui.common.PdfViewerScreen
import java.io.File

private val tabs = listOf("Resumen", "Notas", "Adjuntos", "Cotizaciones", "Historial")

data class OppDetailUiState(
    val isLoading: Boolean = true,
    val error: String? = null,
    val data: Map<String, Any?> = emptyMap(),
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
                val data = withContext(Dispatchers.IO) { repo.getOpportunity(oppId) }
                _state.update { it.copy(isLoading = false, data = data) }
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
        it.copy(showEditForm = true, form = it.data.toOpportunityFormState(), actionError = null)
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

@Suppress("UNCHECKED_CAST")
private fun nestedMaps(data: Map<String, Any?>, key: String): List<Map<String, Any?>> {
    val v = data[key] ?: return emptyList()
    if (v is List<*>) {
        return v.mapNotNull { it as? Map<String, Any?> }
    }
    return emptyList()
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
    val data = state.data
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
                oppStr(data, "title", "name", "titulo").ifBlank { "Oportunidad" },
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
            !state.error.isNullOrBlank() && data.isEmpty() -> Column(Modifier.padding(20.dp)) {
                Text(state.error ?: "", color = MaterialTheme.colorScheme.error)
                Button(onClick = vm::refresh) { Text("Reintentar") }
            }
            else -> when (state.tab) {
                0 -> OppSummaryTab(data)
                1 -> OppNotesTab(data, state, vm)
                2 -> OppAttachmentsTab(data, state, vm)
                3 -> OppQuotesTab(data, onOpen = { url, title -> vm.openQuotePdf(url, title) })
                else -> OppHistorialTab(data)
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
private fun OppSummaryTab(data: Map<String, Any?>) {
    LazyColumn(contentPadding = PaddingValues(16.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
        item {
            OppStageChip(oppStr(data, "stage", "etapa", "status"))
            Spacer(Modifier.height(8.dp))
            detailRow("Valor", oppFmtMxn(oppDouble(data, "value", "amount") ?: 0.0))
            detailRow("Probabilidad", "${oppStr(data, "probability", "probabilidad")}%")
            detailRow("Cliente", oppStr(data, "clientName") + nestedClientName(data))
            detailRow("Cierre estimado", oppStr(data, "expectedCloseDate", "closeDate").take(10))
            detailRow("Descripción", oppStr(data, "description", "descripcion"))
        }
    }
}

private fun nestedClientName(data: Map<String, Any?>): String {
    val client = data["client"] as? Map<*, *> ?: return ""
    val name = client["name"]?.toString() ?: client["nombre"]?.toString() ?: return ""
    return if (name.isBlank()) "" else " ($name)"
}

@Composable
private fun OppNotesTab(data: Map<String, Any?>, state: OppDetailUiState, vm: OppDetailViewModel) {
    val notes = nestedMaps(data, "notes").ifEmpty { nestedMaps(data, "notas") }
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
                item { Text("Sin notas de seguimiento", color = MaterialTheme.colorScheme.onSurfaceVariant) }
            } else {
                items(notes, key = { oppStr(it, "id") }) { note ->
                    Card(shape = RoundedCornerShape(10.dp)) {
                        Column(Modifier.padding(12.dp)) {
                            Text(oppStr(note, "message", "mensaje", "content"), style = MaterialTheme.typography.bodyMedium)
                            Text(
                                oppStr(note, "createdAt", "fecha").take(16),
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
private fun OppAttachmentsTab(data: Map<String, Any?>, state: OppDetailUiState, vm: OppDetailViewModel) {
    val evidences = nestedMaps(data, "evidences").ifEmpty { nestedMaps(data, "evidencias") }
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
        if (evidences.isEmpty()) {
            Text("Sin archivos adjuntos", color = MaterialTheme.colorScheme.onSurfaceVariant)
        } else {
            evidences.forEach { ev ->
                val url = oppStr(ev, "url", "fileUrl")
                val name = oppStr(ev, "name", "nombre", "fileName").ifBlank { "Archivo" }
                Card(shape = RoundedCornerShape(10.dp)) {
                    Column(Modifier.padding(12.dp)) {
                        Text(name, fontWeight = FontWeight.SemiBold)
                        Text(
                            if (url.isNotBlank()) toAbsoluteAssetUrl(url) else "—",
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
private fun OppQuotesTab(data: Map<String, Any?>, onOpen: (String, String) -> Unit) {
    val quotes = nestedMaps(data, "quotes").ifEmpty { nestedMaps(data, "cotizaciones") }
    LazyColumn(contentPadding = PaddingValues(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
        if (quotes.isEmpty()) {
            item { Text("Sin cotizaciones vinculadas", color = MaterialTheme.colorScheme.onSurfaceVariant) }
        } else {
            items(quotes, key = { oppStr(it, "id") }) { q ->
                val pdfUrl = oppStr(q, "pdfUrl", "url")
                val label = oppStr(q, "versionLabel", "folio", "name").ifBlank { "Cotización" }
                Card(
                    shape = RoundedCornerShape(10.dp),
                    modifier = Modifier.then(
                        if (pdfUrl.isNotBlank()) Modifier.clickable { onOpen(pdfUrl, label) } else Modifier,
                    ),
                ) {
                    Column(Modifier.padding(12.dp)) {
                        Text(label, fontWeight = FontWeight.SemiBold)
                        if (pdfUrl.isNotBlank()) {
                            Text("Toca para ver PDF", style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.primary)
                        }
                        Text(oppStr(q, "createdAt", "fecha").take(16), style = MaterialTheme.typography.labelSmall)
                    }
                }
            }
        }
    }
}

@Composable
private fun OppHistorialTab(data: Map<String, Any?>) {
    val history = nestedMaps(data, "history").ifEmpty {
        nestedMaps(data, "historial").ifEmpty {
            nestedMaps(data, "activityLog").ifEmpty { nestedMaps(data, "changelog") }
        }
    }
    LazyColumn(contentPadding = PaddingValues(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
        if (history.isEmpty()) {
            item { Text("Sin historial de cambios disponible", color = MaterialTheme.colorScheme.onSurfaceVariant) }
        } else {
            items(history.take(50), key = { System.identityHashCode(it).toString() }) { h ->
                val action = oppStr(h, "action", "accion", "event", "type")
                val by     = oppStr(h, "userName", "createdByName", "usuario")
                val date   = oppStr(h, "createdAt", "timestamp", "fecha").take(16)
                val detail = oppStr(h, "detail", "description", "changes", "mensaje")
                Card(shape = RoundedCornerShape(10.dp), modifier = Modifier.fillMaxWidth()) {
                    Column(Modifier.padding(12.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                            Text(action.ifBlank { "Cambio" }, fontWeight = FontWeight.SemiBold, fontSize = 13.sp)
                            if (date.isNotBlank()) Text(date, fontSize = 11.sp, color = MaterialTheme.colorScheme.onSurfaceVariant)
                        }
                        if (by.isNotBlank()) Text("Por: $by", fontSize = 12.sp, color = MaterialTheme.colorScheme.onSurfaceVariant)
                        if (detail.isNotBlank()) Text(detail, fontSize = 12.sp, color = MaterialTheme.colorScheme.onSurfaceVariant, maxLines = 3)
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

private fun oppStr(m: Map<String, Any?>, vararg keys: String): String {
    for (k in keys) {
        val v = m[k] ?: continue
        val s = v.toString()
        if (s.isNotBlank() && s != "null") return s
    }
    return ""
}

private fun oppDouble(m: Map<String, Any?>, vararg keys: String): Double? {
    for (k in keys) {
        when (val v = m[k]) {
            is Number -> return v.toDouble()
            is String -> v.toDoubleOrNull()?.let { return it }
        }
    }
    return null
}
