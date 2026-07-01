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
import androidx.lifecycle.ViewModel
import androidx.lifecycle.ViewModelProvider
import androidx.lifecycle.viewModelScope
import androidx.lifecycle.viewmodel.compose.viewModel
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import mx.nexara.mobile.nativeapp.data.api.CreateSocialPostBody
import mx.nexara.mobile.nativeapp.data.api.SocialPostDto
import mx.nexara.mobile.nativeapp.data.api.UpdateSocialPostBody
import mx.nexara.mobile.nativeapp.data.studio.StudioRepository

data class SocialEditorState(
    val red: String = "LinkedIn",
    val titulo: String = "",
    val contenido: String = "",
    val cuando: String = "",
    val estado: String = "Borrador",
    val mediaUrl: String = "",
)

data class StudioSocialUiState(
    val loading: Boolean = true,
    val saving: Boolean = false,
    val error: String? = null,
    val items: List<SocialPostDto> = emptyList(),
    val editing: SocialPostDto? = null,
    val editor: SocialEditorState = SocialEditorState(),
    val showEditor: Boolean = false,
)

class StudioSocialViewModel(app: Application) : AndroidViewModel(app) {
    private val repo = StudioRepository(app.applicationContext)
    private val _state = MutableStateFlow(StudioSocialUiState())
    val state: StateFlow<StudioSocialUiState> = _state

    init { refresh() }

    fun refresh() {
        _state.update { it.copy(loading = true, error = null) }
        viewModelScope.launch {
            try {
                val list = withContext(Dispatchers.IO) { repo.socialPosts() }
                _state.update { it.copy(loading = false, items = list) }
            } catch (e: Exception) {
                _state.update { it.copy(loading = false, error = e.message) }
            }
        }
    }

    fun openCreate() = _state.update { it.copy(showEditor = true, editing = null, editor = SocialEditorState()) }
    fun openEdit(p: SocialPostDto) = _state.update {
        it.copy(
            showEditor = true,
            editing = p,
            editor = SocialEditorState(
                red = p.red.orEmpty(),
                titulo = p.titulo.orEmpty(),
                contenido = p.contenido.orEmpty(),
                cuando = p.cuando.orEmpty(),
                estado = p.estado ?: "Borrador",
                mediaUrl = p.mediaUrl.orEmpty(),
            ),
        )
    }
    fun closeEditor() = _state.update { it.copy(showEditor = false) }
    fun patchEditor(e: SocialEditorState) = _state.update { it.copy(editor = e) }

    fun save() {
        val s = _state.value
        val e = s.editor
        if (e.titulo.isBlank() || e.contenido.isBlank() || e.cuando.isBlank()) {
            _state.update { it.copy(error = "Título, contenido y fecha son obligatorios") }
            return
        }
        _state.update { it.copy(saving = true, error = null) }
        viewModelScope.launch {
            try {
                withContext(Dispatchers.IO) {
                    if (s.editing == null) {
                        repo.createSocialPost(
                            CreateSocialPostBody(
                                red = e.red,
                                titulo = e.titulo.trim(),
                                contenido = e.contenido.trim(),
                                cuando = e.cuando.trim(),
                                estado = e.estado,
                                mediaUrl = e.mediaUrl.ifBlank { null },
                            ),
                        )
                    } else {
                        repo.updateSocialPost(
                            s.editing.id,
                            UpdateSocialPostBody(
                                red = e.red,
                                titulo = e.titulo.trim(),
                                contenido = e.contenido.trim(),
                                cuando = e.cuando.trim(),
                                estado = e.estado,
                                mediaUrl = e.mediaUrl.ifBlank { null },
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

    fun publish(id: Long) {
        viewModelScope.launch {
            try {
                withContext(Dispatchers.IO) { repo.setSocialEstado(id, "Publicado") }
                refresh()
            } catch (e: Exception) {
                _state.update { it.copy(error = e.message) }
            }
        }
    }

    fun delete(id: Long) {
        viewModelScope.launch {
            try {
                withContext(Dispatchers.IO) { repo.deleteSocialPost(id) }
                refresh()
            } catch (e: Exception) {
                _state.update { it.copy(error = e.message) }
            }
        }
    }
}

@Composable
fun StudioSocialScreen(onBack: () -> Unit, vm: StudioSocialViewModel = viewModel()) {
    val ui by vm.state.collectAsState()

    if (ui.showEditor) {
        StudioScaffold(title = if (ui.editing == null) "Nueva publicación" else "Editar publicación", onBack = vm::closeEditor) { inner ->
            Column(Modifier.fillMaxSize().padding(inner).padding(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                OutlinedTextField(ui.editor.red, { vm.patchEditor(ui.editor.copy(red = it)) }, label = { Text("Red") }, modifier = Modifier.fillMaxWidth())
                OutlinedTextField(ui.editor.titulo, { vm.patchEditor(ui.editor.copy(titulo = it)) }, label = { Text("Título") }, modifier = Modifier.fillMaxWidth())
                OutlinedTextField(ui.editor.contenido, { vm.patchEditor(ui.editor.copy(contenido = it)) }, label = { Text("Contenido") }, modifier = Modifier.fillMaxWidth().height(120.dp), minLines = 4)
                OutlinedTextField(ui.editor.cuando, { vm.patchEditor(ui.editor.copy(cuando = it)) }, label = { Text("Fecha ISO (cuando)") }, modifier = Modifier.fillMaxWidth())
                OutlinedTextField(ui.editor.estado, { vm.patchEditor(ui.editor.copy(estado = it)) }, label = { Text("Estado") }, modifier = Modifier.fillMaxWidth())
                OutlinedTextField(ui.editor.mediaUrl, { vm.patchEditor(ui.editor.copy(mediaUrl = it)) }, label = { Text("Media URL") }, modifier = Modifier.fillMaxWidth())
                ui.error?.let { Text(it, color = MaterialTheme.colorScheme.error) }
                TextButton(onClick = vm::save, enabled = !ui.saving) { Text(if (ui.saving) "Guardando…" else "Guardar") }
            }
        }
        return
    }

    StudioScaffold(
        title = "Redes sociales",
        subtitle = "Calendario editorial",
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
            else -> LazyColumn(Modifier.fillMaxSize().padding(inner), contentPadding = PaddingValues(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                items(ui.items, key = { it.id }) { p ->
                    Card(Modifier.fillMaxWidth().clickable { vm.openEdit(p) }, shape = RoundedCornerShape(12.dp)) {
                        Column(Modifier.padding(14.dp)) {
                            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                                StudioStatusChip(p.red ?: "—")
                                StudioStatusChip(p.estado ?: "—", StudioMuted)
                            }
                            Text(p.titulo ?: "—", fontWeight = FontWeight.SemiBold)
                            Text(p.cuando ?: "", style = MaterialTheme.typography.labelSmall, color = StudioMuted)
                            Row {
                                TextButton(onClick = { vm.publish(p.id) }) { Text("Publicar") }
                                TextButton(onClick = { vm.delete(p.id) }) { Text("Eliminar", color = MaterialTheme.colorScheme.error) }
                            }
                        }
                    }
                }
            }
        }
    }
}
