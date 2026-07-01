package mx.nexara.mobile.nativeapp.ui.studio

import android.app.Application
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Add
import androidx.compose.material3.Card
import androidx.compose.material3.FloatingActionButton
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Switch
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import androidx.lifecycle.viewmodel.compose.viewModel
import coil.compose.AsyncImage
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import mx.nexara.mobile.nativeapp.data.api.CaseStudyDto
import mx.nexara.mobile.nativeapp.data.api.CreateCaseStudyBody
import mx.nexara.mobile.nativeapp.data.api.UpdateCaseStudyBody
import mx.nexara.mobile.nativeapp.data.api.toAbsoluteAssetUrl
import mx.nexara.mobile.nativeapp.data.studio.StudioRepository

data class CaseEditorState(
    val titulo: String = "",
    val cliente: String = "",
    val vertical: String = "",
    val impacto: String = "",
    val descripcion: String = "",
    val publicado: Boolean = false,
)

data class StudioCasesUiState(
    val loading: Boolean = true,
    val saving: Boolean = false,
    val error: String? = null,
    val items: List<CaseStudyDto> = emptyList(),
    val editing: CaseStudyDto? = null,
    val editor: CaseEditorState = CaseEditorState(),
    val showEditor: Boolean = false,
)

class StudioCasesViewModel(app: Application) : AndroidViewModel(app) {
    private val repo = StudioRepository(app.applicationContext)
    private val _state = MutableStateFlow(StudioCasesUiState())
    val state: StateFlow<StudioCasesUiState> = _state

    init { refresh() }

    fun refresh() {
        _state.update { it.copy(loading = true, error = null) }
        viewModelScope.launch {
            try {
                val list = withContext(Dispatchers.IO) { repo.caseStudies() }
                _state.update { it.copy(loading = false, items = list) }
            } catch (e: Exception) {
                _state.update { it.copy(loading = false, error = e.message ?: "Error") }
            }
        }
    }

    fun openCreate() = _state.update {
        it.copy(showEditor = true, editing = null, editor = CaseEditorState())
    }

    fun openEdit(item: CaseStudyDto) = _state.update {
        it.copy(
            showEditor = true,
            editing = item,
            editor = CaseEditorState(
                titulo = item.titulo.orEmpty(),
                cliente = item.cliente.orEmpty(),
                vertical = item.vertical.orEmpty(),
                impacto = item.impacto.orEmpty(),
                descripcion = item.descripcion.orEmpty(),
                publicado = item.publicado == true,
            ),
        )
    }

    fun closeEditor() = _state.update { it.copy(showEditor = false) }

    fun patchEditor(e: CaseEditorState) = _state.update { it.copy(editor = e) }

    fun save() {
        val s = _state.value
        val e = s.editor
        if (e.titulo.isBlank() || e.cliente.isBlank()) {
            _state.update { it.copy(error = "Título y cliente son obligatorios") }
            return
        }
        _state.update { it.copy(saving = true, error = null) }
        viewModelScope.launch {
            try {
                withContext(Dispatchers.IO) {
                    if (s.editing == null) {
                        repo.createCaseStudy(
                            CreateCaseStudyBody(
                                titulo = e.titulo.trim(),
                                cliente = e.cliente.trim(),
                                vertical = e.vertical.trim().ifBlank { "General" },
                                impacto = e.impacto.trim().ifBlank { "—" },
                                descripcion = e.descripcion.ifBlank { null },
                                publicado = e.publicado,
                            ),
                        )
                    } else {
                        repo.updateCaseStudy(
                            s.editing.id,
                            UpdateCaseStudyBody(
                                titulo = e.titulo.trim(),
                                cliente = e.cliente.trim(),
                                vertical = e.vertical.trim(),
                                impacto = e.impacto.trim(),
                                descripcion = e.descripcion.ifBlank { null },
                                publicado = e.publicado,
                            ),
                        )
                    }
                }
                _state.update { it.copy(saving = false, showEditor = false) }
                refresh()
            } catch (ex: Exception) {
                _state.update { it.copy(saving = false, error = ex.message) }
            }
        }
    }

    fun togglePublicado(id: Long) {
        viewModelScope.launch {
            try {
                withContext(Dispatchers.IO) { repo.toggleCasePublicado(id) }
                refresh()
            } catch (e: Exception) {
                _state.update { it.copy(error = e.message) }
            }
        }
    }

    fun delete(id: Long) {
        viewModelScope.launch {
            try {
                withContext(Dispatchers.IO) { repo.deleteCaseStudy(id) }
                refresh()
            } catch (e: Exception) {
                _state.update { it.copy(error = e.message) }
            }
        }
    }
}

@Composable
fun StudioCasesScreen(onBack: () -> Unit, vm: StudioCasesViewModel = viewModel()) {
    val ui by vm.state.collectAsState()

    if (ui.showEditor) {
        StudioScaffold(title = if (ui.editing == null) "Nuevo caso" else "Editar caso", onBack = vm::closeEditor) { inner ->
            Column(
                Modifier.fillMaxSize().padding(inner).padding(16.dp),
                verticalArrangement = Arrangement.spacedBy(8.dp),
            ) {
                listOf(
                    "titulo" to ui.editor.titulo,
                    "cliente" to ui.editor.cliente,
                    "vertical" to ui.editor.vertical,
                    "impacto" to ui.editor.impacto,
                ).forEach { (field, value) ->
                    OutlinedTextField(
                        value = value,
                        onValueChange = { v ->
                            val next = when (field) {
                                "titulo" -> ui.editor.copy(titulo = v)
                                "cliente" -> ui.editor.copy(cliente = v)
                                "vertical" -> ui.editor.copy(vertical = v)
                                else -> ui.editor.copy(impacto = v)
                            }
                            vm.patchEditor(next)
                        },
                        label = { Text(field.replaceFirstChar { it.uppercase() }) },
                        modifier = Modifier.fillMaxWidth(),
                    )
                }
                OutlinedTextField(
                    value = ui.editor.descripcion,
                    onValueChange = { vm.patchEditor(ui.editor.copy(descripcion = it)) },
                    label = { Text("Descripción") },
                    modifier = Modifier.fillMaxWidth().height(120.dp),
                    minLines = 4,
                )
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Text("Publicado", Modifier.weight(1f))
                    Switch(ui.editor.publicado, onCheckedChange = { vm.patchEditor(ui.editor.copy(publicado = it)) })
                }
                ui.error?.let { Text(it, color = MaterialTheme.colorScheme.error) }
                TextButton(onClick = vm::save, enabled = !ui.saving) {
                    Text(if (ui.saving) "Guardando…" else "Guardar")
                }
            }
        }
        return
    }

    StudioScaffold(
        title = "Casos de éxito",
        subtitle = "Proyectos publicados en el sitio",
        onBack = onBack,
        floatingAction = {
            FloatingActionButton(onClick = vm::openCreate, containerColor = StudioAccent) {
                Icon(Icons.Default.Add, contentDescription = null)
            }
        },
    ) { inner ->
        when {
            ui.loading -> StudioLoadingBox()
            ui.error != null && ui.items.isEmpty() -> StudioErrorState(ui.error!!, vm::refresh)
            else -> LazyColumn(
                Modifier.fillMaxSize().padding(inner),
                contentPadding = PaddingValues(16.dp),
                verticalArrangement = Arrangement.spacedBy(10.dp),
            ) {
                if (ui.items.isEmpty()) item { StudioEmptyState("Sin casos", "Publica el primer caso de éxito.") }
                items(ui.items, key = { it.id }) { c ->
                    CaseCard(c, onOpen = { vm.openEdit(c) }, onToggle = { vm.togglePublicado(c.id) }, onDelete = { vm.delete(c.id) })
                }
            }
        }
    }
}

@Composable
private fun CaseCard(
    item: CaseStudyDto,
    onOpen: () -> Unit,
    onToggle: () -> Unit,
    onDelete: () -> Unit,
) {
    androidx.compose.material3.Card(
        Modifier.fillMaxWidth().clickable(onClick = onOpen),
        shape = RoundedCornerShape(14.dp),
    ) {
        Row(Modifier.padding(12.dp)) {
            val img = item.imageUrl ?: item.cover
            if (!img.isNullOrBlank()) {
                AsyncImage(
                    toAbsoluteAssetUrl(img),
                    contentDescription = null,
                    modifier = Modifier.size(64.dp).clip(RoundedCornerShape(8.dp)),
                    contentScale = ContentScale.Crop,
                )
                Spacer(Modifier.size(12.dp))
            }
            Column(Modifier.weight(1f)) {
                Text(item.titulo ?: "—", fontWeight = FontWeight.Bold)
                Text(item.cliente ?: "", style = MaterialTheme.typography.bodySmall, color = StudioMuted)
                Text(item.impacto ?: "", style = MaterialTheme.typography.labelSmall)
                StudioStatusChip(
                    if (item.publicado == true) "Publicado" else "Borrador",
                    if (item.publicado == true) Color(0xFF10B981) else StudioMuted,
                )
            }
        }
        Row(Modifier.fillMaxWidth().padding(horizontal = 12.dp, vertical = 4.dp)) {
            TextButton(onClick = onToggle) { Text("Toggle publicado") }
            TextButton(onClick = onDelete) { Text("Eliminar", color = MaterialTheme.colorScheme.error) }
        }
    }
}
