package mx.nexara.mobile.nativeapp.ui.studio

import android.app.Application
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
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
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
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
import mx.nexara.mobile.nativeapp.data.api.CreateNewsBody
import mx.nexara.mobile.nativeapp.data.api.NewsPostDto
import mx.nexara.mobile.nativeapp.data.api.UpdateNewsBody
import mx.nexara.mobile.nativeapp.data.studio.StudioRepository

data class NewsEditorState(
    val title: String = "",
    val summary: String = "",
    val content: String = "",
    val status: String = "draft",
)

data class StudioNewsUiState(
    val loading: Boolean = true,
    val saving: Boolean = false,
    val error: String? = null,
    val items: List<NewsPostDto> = emptyList(),
    val editing: NewsPostDto? = null,
    val editor: NewsEditorState = NewsEditorState(),
    val showEditor: Boolean = false,
)

class StudioNewsViewModel(app: Application) : AndroidViewModel(app) {
    private val repo = StudioRepository(app.applicationContext)
    private val _state = MutableStateFlow(StudioNewsUiState())
    val state: StateFlow<StudioNewsUiState> = _state

    init { refresh() }

    fun refresh() {
        _state.update { it.copy(loading = true, error = null) }
        viewModelScope.launch {
            try {
                val list = withContext(Dispatchers.IO) { repo.news() }
                _state.update { it.copy(loading = false, items = list) }
            } catch (e: Exception) {
                _state.update { it.copy(loading = false, error = e.message) }
            }
        }
    }

    fun openCreate() = _state.update { it.copy(showEditor = true, editing = null, editor = NewsEditorState()) }
    fun openEdit(n: NewsPostDto) = _state.update {
        it.copy(
            showEditor = true,
            editing = n,
            editor = NewsEditorState(
                title = n.title.orEmpty(),
                summary = n.excerpt.orEmpty(),
                content = n.body.orEmpty(),
                status = n.status ?: "draft",
            ),
        )
    }
    fun closeEditor() = _state.update { it.copy(showEditor = false) }
    fun patchEditor(e: NewsEditorState) = _state.update { it.copy(editor = e) }

    fun save() {
        val s = _state.value
        val e = s.editor
        if (e.title.isBlank() || e.content.isBlank()) {
            _state.update { it.copy(error = "Título y contenido son obligatorios") }
            return
        }
        _state.update { it.copy(saving = true, error = null) }
        viewModelScope.launch {
            try {
                withContext(Dispatchers.IO) {
                    if (s.editing == null) {
                        repo.createNews(
                            CreateNewsBody(
                                title = e.title.trim(),
                                summary = e.summary.ifBlank { null },
                                content = e.content.trim(),
                                status = e.status,
                            ),
                        )
                    } else {
                        repo.updateNews(
                            s.editing.id,
                            UpdateNewsBody(
                                title = e.title.trim(),
                                summary = e.summary.ifBlank { null },
                                content = e.content.trim(),
                                status = e.status,
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

    fun delete(id: Long) {
        viewModelScope.launch {
            try {
                withContext(Dispatchers.IO) { repo.deleteNews(id) }
                refresh()
            } catch (e: Exception) {
                _state.update { it.copy(error = e.message) }
            }
        }
    }
}

@Composable
fun StudioNewsScreen(onBack: () -> Unit, vm: StudioNewsViewModel = viewModel()) {
    val ui by vm.state.collectAsState()

    if (ui.showEditor) {
        StudioScaffold(title = if (ui.editing == null) "Nueva noticia" else "Editar noticia", onBack = vm::closeEditor) { inner ->
            Column(Modifier.fillMaxSize().padding(inner).padding(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                OutlinedTextField(ui.editor.title, { vm.patchEditor(ui.editor.copy(title = it)) }, label = { Text("Título") }, modifier = Modifier.fillMaxWidth())
                OutlinedTextField(ui.editor.summary, { vm.patchEditor(ui.editor.copy(summary = it)) }, label = { Text("Resumen") }, modifier = Modifier.fillMaxWidth())
                OutlinedTextField(
                    ui.editor.content,
                    { vm.patchEditor(ui.editor.copy(content = it)) },
                    label = { Text("Contenido") },
                    modifier = Modifier.fillMaxWidth().height(160.dp),
                    minLines = 6,
                )
                OutlinedTextField(ui.editor.status, { vm.patchEditor(ui.editor.copy(status = it)) }, label = { Text("Estado (draft/published)") }, modifier = Modifier.fillMaxWidth())
                ui.error?.let { Text(it, color = MaterialTheme.colorScheme.error) }
                TextButton(onClick = vm::save, enabled = !ui.saving) { Text(if (ui.saving) "Guardando…" else "Guardar") }
            }
        }
        return
    }

    StudioScaffold(
        title = "Noticias",
        subtitle = "Blog y comunicados",
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
            else -> LazyColumn(Modifier.fillMaxSize().padding(inner), contentPadding = PaddingValues(16.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
                if (ui.items.isEmpty()) item { StudioEmptyState("Sin noticias", "Crea la primera entrada del blog.") }
                items(ui.items, key = { it.id }) { n ->
                    Card(Modifier.fillMaxWidth().clickable { vm.openEdit(n) }, shape = RoundedCornerShape(14.dp)) {
                        Column(Modifier.padding(14.dp)) {
                            Text(n.title ?: "—", fontWeight = FontWeight.Bold)
                            Text(n.excerpt ?: "", style = MaterialTheme.typography.bodySmall, color = StudioMuted, maxLines = 2)
                            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                                StudioStatusChip(n.status ?: "draft")
                                TextButton(onClick = { vm.delete(n.id) }) { Text("Eliminar", color = MaterialTheme.colorScheme.error) }
                            }
                        }
                    }
                }
            }
        }
    }
}
