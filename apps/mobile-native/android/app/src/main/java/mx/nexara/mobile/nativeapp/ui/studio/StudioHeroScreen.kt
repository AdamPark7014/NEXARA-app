package mx.nexara.mobile.nativeapp.ui.studio

import android.app.Application
import android.net.Uri
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
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
import androidx.compose.material.icons.filled.Delete
import androidx.compose.material.icons.filled.KeyboardArrowDown
import androidx.compose.material.icons.filled.KeyboardArrowUp
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.FloatingActionButton
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Switch
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
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
import mx.nexara.mobile.nativeapp.data.api.HeroSlideDto
import mx.nexara.mobile.nativeapp.data.api.toAbsoluteAssetUrl
import mx.nexara.mobile.nativeapp.data.studio.StudioRepository

data class HeroEditorState(
    val altText: String = "",
    val caption: String = "",
    val href: String = "",
    val isActive: Boolean = true,
    val imageUri: Uri? = null,
)

data class StudioHeroUiState(
    val loading: Boolean = true,
    val saving: Boolean = false,
    val error: String? = null,
    val message: String? = null,
    val slides: List<HeroSlideDto> = emptyList(),
    val editing: HeroSlideDto? = null,
    val editor: HeroEditorState = HeroEditorState(),
    val showEditor: Boolean = false,
)

class StudioHeroViewModel(app: Application) : AndroidViewModel(app) {
    private val repo = StudioRepository(app.applicationContext)
    private val _state = MutableStateFlow(StudioHeroUiState())
    val state: StateFlow<StudioHeroUiState> = _state

    init { refresh() }

    fun refresh() {
        _state.update { it.copy(loading = true, error = null) }
        viewModelScope.launch {
            try {
                val list = withContext(Dispatchers.IO) { repo.heroSlides() }
                _state.update { it.copy(loading = false, slides = list.sortedBy { s -> s.position ?: 0 }) }
            } catch (e: Exception) {
                _state.update { it.copy(loading = false, error = e.message ?: "Error al cargar carrusel") }
            }
        }
    }

    fun openCreate() = _state.update {
        it.copy(showEditor = true, editing = null, editor = HeroEditorState(), message = null, error = null)
    }

    fun openEdit(slide: HeroSlideDto) = _state.update {
        it.copy(
            showEditor = true,
            editing = slide,
            editor = HeroEditorState(
                altText = slide.altText.orEmpty(),
                caption = slide.caption.orEmpty(),
                href = slide.href.orEmpty(),
                isActive = slide.isActive != false,
            ),
            message = null,
            error = null,
        )
    }

    fun closeEditor() = _state.update { it.copy(showEditor = false, editing = null) }

    fun patchEditor(patch: HeroEditorState) = _state.update { it.copy(editor = patch) }

    fun save() {
        val s = _state.value
        val ed = s.editor
        _state.update { it.copy(saving = true, error = null) }
        viewModelScope.launch {
            try {
                withContext(Dispatchers.IO) {
                    if (s.editing == null) {
                        repo.createHeroSlide(
                            altText = ed.altText.ifBlank { null },
                            caption = ed.caption.ifBlank { null },
                            href = ed.href.ifBlank { null },
                            position = s.slides.size,
                            isActive = ed.isActive,
                            imageUri = ed.imageUri,
                        )
                    } else {
                        repo.updateHeroSlide(
                            id = s.editing.id,
                            altText = ed.altText.ifBlank { null },
                            caption = ed.caption.ifBlank { null },
                            href = ed.href.ifBlank { null },
                            position = s.editing.position,
                            isActive = ed.isActive,
                            imageUri = ed.imageUri,
                        )
                    }
                }
                _state.update { it.copy(saving = false, showEditor = false, message = "Guardado") }
                refresh()
            } catch (e: Exception) {
                _state.update { it.copy(saving = false, error = e.message ?: "No se pudo guardar") }
            }
        }
    }

    fun delete(id: Long) {
        viewModelScope.launch {
            try {
                withContext(Dispatchers.IO) { repo.deleteHeroSlide(id) }
                refresh()
            } catch (e: Exception) {
                _state.update { it.copy(error = e.message) }
            }
        }
    }

    fun move(id: Long, direction: Int) {
        val list = _state.value.slides.toMutableList()
        val idx = list.indexOfFirst { it.id == id }
        if (idx < 0) return
        val target = idx + direction
        if (target !in list.indices) return
        val tmp = list[idx]
        list[idx] = list[target]
        list[target] = tmp
        viewModelScope.launch {
            try {
                withContext(Dispatchers.IO) { repo.reorderHeroSlides(list.map { it.id }) }
                refresh()
            } catch (e: Exception) {
                _state.update { it.copy(error = e.message) }
            }
        }
    }
}

@Composable
fun StudioHeroScreen(onBack: () -> Unit, vm: StudioHeroViewModel = viewModel()) {
    val ui by vm.state.collectAsState()
    val picker = rememberLauncherForActivityResult(ActivityResultContracts.GetContent()) { uri ->
        if (uri != null) vm.patchEditor(ui.editor.copy(imageUri = uri))
    }

    if (ui.showEditor) {
        StudioScaffold(
            title = if (ui.editing == null) "Nuevo slide" else "Editar slide",
            onBack = vm::closeEditor,
        ) { inner ->
            Column(
                modifier = Modifier.fillMaxSize().padding(inner).padding(16.dp),
                verticalArrangement = Arrangement.spacedBy(10.dp),
            ) {
                val previewUrl = ui.editor.imageUri?.toString()
                    ?: ui.editing?.imageUrl?.let { toAbsoluteAssetUrl(it) }
                if (!previewUrl.isNullOrBlank()) {
                    AsyncImage(
                        model = previewUrl,
                        contentDescription = null,
                        modifier = Modifier.fillMaxWidth().height(180.dp).clip(RoundedCornerShape(12.dp)),
                        contentScale = ContentScale.Crop,
                    )
                }
                TextButton(onClick = { picker.launch("image/*") }) { Text("Elegir imagen") }
                OutlinedTextField(
                    value = ui.editor.altText,
                    onValueChange = { vm.patchEditor(ui.editor.copy(altText = it)) },
                    label = { Text("Texto alternativo") },
                    modifier = Modifier.fillMaxWidth(),
                )
                OutlinedTextField(
                    value = ui.editor.caption,
                    onValueChange = { vm.patchEditor(ui.editor.copy(caption = it)) },
                    label = { Text("Caption") },
                    modifier = Modifier.fillMaxWidth(),
                )
                OutlinedTextField(
                    value = ui.editor.href,
                    onValueChange = { vm.patchEditor(ui.editor.copy(href = it)) },
                    label = { Text("Enlace (href)") },
                    modifier = Modifier.fillMaxWidth(),
                )
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Text("Activo", modifier = Modifier.weight(1f))
                    Switch(
                        checked = ui.editor.isActive,
                        onCheckedChange = { vm.patchEditor(ui.editor.copy(isActive = it)) },
                    )
                }
                ui.error?.let { Text(it, color = MaterialTheme.colorScheme.error) }
                TextButton(onClick = vm::save, enabled = !ui.saving) {
                    Text(if (ui.saving) "Guardando…" else "Guardar slide")
                }
            }
        }
        return
    }

    StudioScaffold(
        title = "Carrusel inicio",
        subtitle = "Hero del sitio público",
        onBack = onBack,
        floatingAction = {
            FloatingActionButton(onClick = vm::openCreate, containerColor = StudioAccent) {
                Icon(Icons.Default.Add, contentDescription = "Nuevo", tint = MaterialTheme.colorScheme.onPrimary)
            }
        },
    ) { inner ->
        when {
            ui.loading -> StudioLoadingBox()
            ui.error != null && ui.slides.isEmpty() -> StudioErrorState(ui.error!!, onRetry = vm::refresh)
            else -> LazyColumn(
                modifier = Modifier.fillMaxSize().padding(inner),
                contentPadding = PaddingValues(16.dp),
                verticalArrangement = Arrangement.spacedBy(10.dp),
            ) {
                ui.message?.let { item { Text(it, color = StudioAccent) } }
                if (ui.slides.isEmpty()) {
                    item { StudioEmptyState("Sin slides", "Toca + para agregar el primer slide del carrusel.") }
                }
                items(ui.slides, key = { it.id }) { slide ->
                    HeroSlideCard(
                        slide = slide,
                        onEdit = { vm.openEdit(slide) },
                        onDelete = { vm.delete(slide.id) },
                        onUp = { vm.move(slide.id, -1) },
                        onDown = { vm.move(slide.id, 1) },
                    )
                }
            }
        }
    }
}

@Composable
private fun HeroSlideCard(
    slide: HeroSlideDto,
    onEdit: () -> Unit,
    onDelete: () -> Unit,
    onUp: () -> Unit,
    onDown: () -> Unit,
) {
    Card(
        modifier = Modifier.fillMaxWidth().clickable(onClick = onEdit),
        shape = RoundedCornerShape(14.dp),
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
    ) {
        Row(Modifier.padding(12.dp), verticalAlignment = Alignment.CenterVertically) {
            AsyncImage(
                model = toAbsoluteAssetUrl(slide.imageUrl),
                contentDescription = slide.altText,
                modifier = Modifier.size(72.dp).clip(RoundedCornerShape(10.dp)),
                contentScale = ContentScale.Crop,
            )
            Column(Modifier.weight(1f).padding(horizontal = 12.dp)) {
                Text(slide.caption ?: slide.altText ?: "Slide #${slide.id}", fontWeight = FontWeight.SemiBold)
                Text(
                    listOfNotNull(
                        slide.href?.takeIf { it.isNotBlank() }?.let { "→ $it" },
                        if (slide.isActive == false) "Inactivo" else "Activo",
                        slide.position?.let { "Pos $it" },
                    ).joinToString(" · "),
                    style = MaterialTheme.typography.labelSmall,
                    color = StudioMuted,
                )
            }
            Column {
                IconButton(onClick = onUp) { Icon(Icons.Default.KeyboardArrowUp, null) }
                IconButton(onClick = onDown) { Icon(Icons.Default.KeyboardArrowDown, null) }
                IconButton(onClick = onDelete) {
                    Icon(Icons.Default.Delete, null, tint = MaterialTheme.colorScheme.error)
                }
            }
        }
    }
}
