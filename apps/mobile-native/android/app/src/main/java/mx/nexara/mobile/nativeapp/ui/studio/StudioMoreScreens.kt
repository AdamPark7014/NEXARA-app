package mx.nexara.mobile.nativeapp.ui.studio

import android.app.Application
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Card
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import androidx.lifecycle.viewmodel.compose.viewModel
import com.squareup.moshi.Moshi
import com.squareup.moshi.kotlin.reflect.KotlinJsonAdapterFactory
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import mx.nexara.mobile.nativeapp.data.api.NewsletterSubscriberDto
import mx.nexara.mobile.nativeapp.data.api.PageContentDto
import mx.nexara.mobile.nativeapp.data.studio.StudioRepository

// ── Newsletter ──────────────────────────────────────────────────────────────
data class StudioNewsletterUiState(
    val loading: Boolean = true,
    val error: String? = null,
    val items: List<NewsletterSubscriberDto> = emptyList(),
    val search: String = "",
)

class StudioNewsletterViewModel(app: Application) : AndroidViewModel(app) {
    private val repo = StudioRepository(app.applicationContext)
    private val _state = MutableStateFlow(StudioNewsletterUiState())
    val state: StateFlow<StudioNewsletterUiState> = _state

    init { refresh() }

    fun setSearch(v: String) {
        _state.update { it.copy(search = v) }
        refresh()
    }

    fun refresh() {
        _state.update { it.copy(loading = true, error = null) }
        viewModelScope.launch {
            try {
                val q = _state.value.search.ifBlank { null }
                val list = withContext(Dispatchers.IO) { repo.newsletter(q) }
                _state.update { it.copy(loading = false, items = list) }
            } catch (e: Exception) {
                _state.update { it.copy(loading = false, error = e.message) }
            }
        }
    }
}

@Composable
fun StudioNewsletterScreen(onBack: () -> Unit, vm: StudioNewsletterViewModel = viewModel()) {
    val ui by vm.state.collectAsState()
    StudioScaffold(title = "Newsletter", subtitle = "Suscriptores", onBack = onBack) { inner ->
        Column(Modifier.fillMaxSize().padding(inner)) {
            OutlinedTextField(
                ui.search,
                vm::setSearch,
                label = { Text("Buscar email") },
                modifier = Modifier.fillMaxWidth().padding(16.dp),
            )
            when {
                ui.loading -> StudioLoadingBox()
                ui.error != null -> StudioErrorState(ui.error!!, vm::refresh)
                else -> LazyColumn(contentPadding = PaddingValues(horizontal = 16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    items(ui.items, key = { it.id }) { s ->
                        Card(shape = RoundedCornerShape(12.dp)) {
                            Column(Modifier.padding(14.dp)) {
                                Text(s.email, fontWeight = FontWeight.SemiBold)
                                Text(s.name ?: "—", style = MaterialTheme.typography.bodySmall, color = StudioMuted)
                                StudioStatusChip(s.status ?: "active")
                            }
                        }
                    }
                }
            }
        }
    }
}

// ── Pages ─────────────────────────────────────────────────────────────────────
data class StudioPagesUiState(
    val loading: Boolean = true,
    val saving: Boolean = false,
    val error: String? = null,
    val sections: List<String> = emptyList(),
    val selected: String? = null,
    val jsonDraft: String = "",
)

class StudioPagesViewModel(app: Application) : AndroidViewModel(app) {
    private val repo = StudioRepository(app.applicationContext)
    private val moshi = Moshi.Builder().add(KotlinJsonAdapterFactory()).build()
    private val _state = MutableStateFlow(StudioPagesUiState())
    val state: StateFlow<StudioPagesUiState> = _state

    init { refresh() }

    fun refresh() {
        _state.update { it.copy(loading = true, error = null) }
        viewModelScope.launch {
            try {
                val sections = withContext(Dispatchers.IO) { repo.pageSections() }
                _state.update { it.copy(loading = false, sections = sections) }
            } catch (e: Exception) {
                _state.update { it.copy(loading = false, error = e.message) }
            }
        }
    }

    fun openSection(section: String) {
        _state.update { it.copy(selected = section, loading = true) }
        viewModelScope.launch {
            try {
                val row = withContext(Dispatchers.IO) { repo.getPageContent(section) }
                val json = moshi.adapter(Any::class.java).toJson(row.content ?: emptyMap<String, Any>())
                _state.update { it.copy(loading = false, jsonDraft = json) }
            } catch (e: Exception) {
                _state.update { it.copy(loading = false, error = e.message) }
            }
        }
    }

    fun closeSection() = _state.update { it.copy(selected = null, jsonDraft = "") }
    fun patchJson(v: String) = _state.update { it.copy(jsonDraft = v) }

    fun save() {
        val section = _state.value.selected ?: return
        _state.update { it.copy(saving = true, error = null) }
        viewModelScope.launch {
            try {
                val parsed = moshi.adapter(Any::class.java).fromJson(_state.value.jsonDraft)
                    ?: emptyMap<String, Any>()
                withContext(Dispatchers.IO) { repo.upsertPageContent(section, parsed) }
                _state.update { it.copy(saving = false) }
            } catch (e: Exception) {
                _state.update { it.copy(saving = false, error = e.message ?: "JSON inválido") }
            }
        }
    }
}

@Composable
fun StudioPagesScreen(onBack: () -> Unit, vm: StudioPagesViewModel = viewModel()) {
    val ui by vm.state.collectAsState()

    if (ui.selected != null) {
        StudioScaffold(title = "Sección", subtitle = ui.selected, onBack = vm::closeSection) { inner ->
            Column(Modifier.fillMaxSize().padding(inner).padding(16.dp)) {
                Text("Edita el JSON de contenido (métricas, servicios, CTA…)", style = MaterialTheme.typography.bodySmall, color = StudioMuted)
                OutlinedTextField(
                    ui.jsonDraft,
                    vm::patchJson,
                    modifier = Modifier.fillMaxWidth().height(320.dp).padding(vertical = 8.dp),
                    textStyle = MaterialTheme.typography.bodySmall.copy(fontFamily = FontFamily.Monospace),
                    minLines = 12,
                )
                ui.error?.let { Text(it, color = MaterialTheme.colorScheme.error) }
                TextButton(onClick = vm::save, enabled = !ui.saving) { Text(if (ui.saving) "Guardando…" else "Guardar sección") }
            }
        }
        return
    }

    StudioScaffold(title = "Secciones del sitio", subtitle = "Contenido de la landing", onBack = onBack) { inner ->
        when {
            ui.loading -> StudioLoadingBox()
            ui.error != null && ui.sections.isEmpty() -> StudioErrorState(ui.error!!, vm::refresh)
            else -> LazyColumn(Modifier.fillMaxSize().padding(inner), contentPadding = PaddingValues(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                items(ui.sections) { section ->
                    Card(
                        shape = RoundedCornerShape(12.dp),
                        modifier = Modifier.fillMaxWidth().clickable { vm.openSection(section) },
                    ) {
                        Text(section.replace('_', ' '), modifier = Modifier.padding(16.dp), fontWeight = FontWeight.Medium)
                    }
                }
            }
        }
    }
}
