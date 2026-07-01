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
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.grid.GridCells
import androidx.compose.foundation.lazy.grid.LazyVerticalGrid
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Card
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
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
import mx.nexara.mobile.nativeapp.data.api.SocialPostDto
import mx.nexara.mobile.nativeapp.data.studio.StudioDashboardStats
import mx.nexara.mobile.nativeapp.data.studio.StudioRepository

data class StudioDashboardUiState(
    val loading: Boolean = true,
    val error: String? = null,
    val stats: StudioDashboardStats? = null,
)

class StudioDashboardViewModel(app: Application) : AndroidViewModel(app) {
    private val repo = StudioRepository(app.applicationContext)
    private val _state = MutableStateFlow(StudioDashboardUiState())
    val state: StateFlow<StudioDashboardUiState> = _state

    init { refresh() }

    fun refresh() {
        _state.update { it.copy(loading = true, error = null) }
        viewModelScope.launch {
            try {
                val stats = withContext(Dispatchers.IO) { repo.dashboardStats() }
                _state.update { it.copy(loading = false, stats = stats) }
            } catch (e: Exception) {
                _state.update { it.copy(loading = false, error = e.message ?: "Error al cargar dashboard") }
            }
        }
    }
}

@Composable
fun StudioDashboardScreen(
    onBack: () -> Unit,
    onOpenModule: (String) -> Unit,
    vm: StudioDashboardViewModel = viewModel(),
) {
    val ui by vm.state.collectAsState()
    StudioScaffold(title = "STUDIO", subtitle = "Marca y marketing", onBack = onBack) { inner ->
        when {
            ui.loading -> StudioLoadingBox()
            ui.error != null -> StudioErrorState(ui.error!!, onRetry = vm::refresh)
            else -> {
                val s = ui.stats!!
                LazyColumn(
                    modifier = Modifier.fillMaxSize().padding(inner),
                    contentPadding = PaddingValues(16.dp),
                    verticalArrangement = Arrangement.spacedBy(12.dp),
                ) {
                    item {
                        Text("Sitio en producción", style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold, color = StudioSlate)
                        Spacer(Modifier.height(4.dp))
                        Text("Gestiona contenido público, leads y calendario social.", style = MaterialTheme.typography.bodySmall, color = StudioMuted)
                    }
                    item {
                        androidx.compose.foundation.lazy.grid.LazyVerticalGrid(
                            columns = androidx.compose.foundation.lazy.grid.GridCells.Fixed(2),
                            verticalArrangement = Arrangement.spacedBy(10.dp),
                            horizontalArrangement = Arrangement.spacedBy(10.dp),
                            modifier = Modifier.fillMaxWidth().height(330.dp),
                            userScrollEnabled = false,
                        ) {
                            item { StudioKpiCard("Contactos web", s.contactTotal.toString(), "Formularios recibidos", "📥") }
                            item { StudioKpiCard("Casos de éxito", "${s.casesPublished}/${s.casesTotal}", "Publicados / total", "🏆", accent = Color(0xFF10B981)) }
                            item { StudioKpiCard("Noticias", "${s.newsPublished}/${s.newsTotal}", "Publicadas / total", "📰", accent = Color(0xFFF59E0B)) }
                            item { StudioKpiCard("Suscriptores", s.newsletterActive.toString(), "Newsletter activos", "📮", accent = Color(0xFF8B5CF6)) }
                            item { StudioKpiCard("Social", s.socialDrafts.size.toString(), "Pendientes de publicar", "📱", accent = Color(0xFF0EA5E9)) }
                        }
                    }
                    item { Text("Accesos rápidos", fontWeight = FontWeight.SemiBold) }
                    val quick = listOf(
                        "hero" to "🖼️ Carrusel inicio",
                        "cases" to "🏆 Casos de éxito",
                        "news" to "📰 Noticias",
                        "pages" to "🌐 Secciones del sitio",
                        "contacts" to "✉️ Contactos",
                        "leads" to "✨ Leads",
                        "social" to "📱 Redes sociales",
                        "newsletter" to "📬 Newsletter",
                    )
                    items(quick) { (key, label) ->
                        Card(
                            modifier = Modifier.fillMaxWidth().clickable { onOpenModule(key) },
                            shape = RoundedCornerShape(14.dp),
                        ) {
                            Text(label, modifier = Modifier.padding(16.dp), fontWeight = FontWeight.Medium)
                        }
                    }
                    if (s.socialDrafts.isNotEmpty()) {
                        item { Spacer(Modifier.height(8.dp)); Text("Próximas publicaciones", fontWeight = FontWeight.SemiBold) }
                        items(s.socialDrafts) { post -> SocialPreviewCard(post) }
                    }
                }
            }
        }
    }
}

@Composable
private fun SocialPreviewCard(post: SocialPostDto) {
    Card(modifier = Modifier.fillMaxWidth(), shape = RoundedCornerShape(12.dp)) {
        Column(Modifier.padding(14.dp)) {
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                StudioStatusChip(post.red ?: "Red")
                StudioStatusChip(post.estado ?: "", StudioMuted)
            }
            Text(post.titulo ?: "Sin título", fontWeight = FontWeight.SemiBold)
            if (!post.cuando.isNullOrBlank()) Text(post.cuando, style = MaterialTheme.typography.labelSmall, color = StudioMuted)
        }
    }
}
