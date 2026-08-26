package mx.nexara.mobile.nativeapp.ui.studio

import android.app.Application
import androidx.compose.foundation.background
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
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
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
import mx.nexara.mobile.nativeapp.data.api.SocialPostDto
import mx.nexara.mobile.nativeapp.data.studio.StudioDashboardStats
import mx.nexara.mobile.nativeapp.data.studio.StudioRepository
import mx.nexara.mobile.nativeapp.ui.enterprise.NxColors
import mx.nexara.mobile.nativeapp.ui.enterprise.NxDimens
import mx.nexara.mobile.nativeapp.ui.enterprise.NxErrorBlock
import mx.nexara.mobile.nativeapp.ui.enterprise.NxLoadingBlock
import mx.nexara.mobile.nativeapp.ui.enterprise.NxPanelShell
import mx.nexara.mobile.nativeapp.ui.enterprise.NxSectionHeader

private val GreenLight = Color(0xFFD1FAE5); private val GreenColor = Color(0xFF059669)
private val TealLight  = Color(0xFFCCFBF1); private val TealColor  = Color(0xFF0D9488)
private val BlueLight  = Color(0xFFDBEAFE); private val BlueColor  = Color(0xFF3B82F6)
private val AmberLight = Color(0xFFFEF3C7); private val AmberColor = Color(0xFFF59E0B)
private val PurpleLight = Color(0xFFF3E8FF); private val PurpleColor = Color(0xFFA855F7)
private val RedColor   = Color(0xFFEF4444)

data class StudioDashboardUiState(
    val loading: Boolean = true,
    val error: String? = null,
    val stats: StudioDashboardStats? = null,
)

class StudioDashboardViewModel(app: Application) : AndroidViewModel(app) {
    private val repo = StudioRepository(app.applicationContext)
    private val _state = MutableStateFlow(StudioDashboardUiState())
    val state: StateFlow<StudioDashboardUiState> = _state

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

    if (ui.stats == null && ui.loading && ui.error == null) {
        vm.refresh()
    }

    StudioScaffold(title = "STUDIO", subtitle = "Marca y marketing", onBack = onBack) { inner ->
        LazyColumn(
            modifier = Modifier.fillMaxSize().background(NxColors.Surface).padding(inner),
            contentPadding = PaddingValues(16.dp),
            verticalArrangement = Arrangement.spacedBy(16.dp),
        ) {
            item {
                Column {
                    Text(
                        "Dashboard Studio",
                        style = MaterialTheme.typography.headlineSmall.copy(fontWeight = FontWeight.Bold),
                        color = StudioSlate,
                    )
                    Text(
                        "Sitio web · Contenido · Social",
                        style = MaterialTheme.typography.bodySmall,
                        color = StudioMuted,
                    )
                }
            }

            item {
                Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
                    Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                        StudioQuickActionCard(
                            modifier = Modifier.weight(1f),
                            icon = "🖼️",
                            title = "Hero",
                            subtitle = "Carrusel inicio",
                            bg = PurpleColor,
                            onClick = { onOpenModule("hero") },
                        )
                        StudioQuickActionCard(
                            modifier = Modifier.weight(1f),
                            icon = "🏆",
                            title = "Casos",
                            subtitle = "Casos de éxito",
                            bg = GreenColor,
                            onClick = { onOpenModule("cases") },
                        )
                    }
                    Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                        StudioQuickActionCard(
                            modifier = Modifier.weight(1f),
                            icon = "📰",
                            title = "Noticias",
                            subtitle = "Blog y novedades",
                            bg = AmberColor,
                            onClick = { onOpenModule("news") },
                        )
                        StudioQuickActionCard(
                            modifier = Modifier.weight(1f),
                            icon = "💬",
                            title = "Chat",
                            subtitle = "Equipo NEXARA",
                            bg = BlueColor,
                            onClick = { onOpenModule("chat") },
                        )
                    }
                }
            }

            if (ui.loading) {
                item { NxLoadingBlock("Cargando Studio…") }
                return@LazyColumn
            }

            if (!ui.error.isNullOrBlank()) {
                item {
                    NxErrorBlock(ui.error!!, onRetry = { vm.refresh() })
                }
                return@LazyColumn
            }

            val s = ui.stats!!

            item {
                Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
                    Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                        StudioDashKpiCard(
                            Modifier.weight(1f),
                            icon = "📥",
                            title = "Contactos",
                            value = s.contactTotal.toString(),
                            sub = "Formularios web",
                            bg = TealLight,
                            accent = TealColor,
                        )
                        StudioDashKpiCard(
                            Modifier.weight(1f),
                            icon = "🏆",
                            title = "Casos",
                            value = "${s.casesPublished}/${s.casesTotal}",
                            sub = "Publicados / total",
                            bg = GreenLight,
                            accent = GreenColor,
                        )
                    }
                    Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                        StudioDashKpiCard(
                            Modifier.weight(1f),
                            icon = "📰",
                            title = "Noticias",
                            value = "${s.newsPublished}/${s.newsTotal}",
                            sub = "Publicadas / total",
                            bg = AmberLight,
                            accent = AmberColor,
                        )
                        StudioDashKpiCard(
                            Modifier.weight(1f),
                            icon = "📮",
                            title = "Newsletter",
                            value = s.newsletterActive.toString(),
                            sub = "Suscriptores activos",
                            bg = PurpleLight,
                            accent = PurpleColor,
                        )
                    }
                }
            }

            if (s.socialDrafts.isNotEmpty()) {
                item {
                    StudioDashKpiCard(
                        Modifier.fillMaxWidth(),
                        icon = "📱",
                        title = "Social pendiente",
                        value = s.socialDrafts.size.toString(),
                        sub = "Borradores y programados",
                        bg = BlueLight,
                        accent = BlueColor,
                    )
                }
                item {
                    NxSectionHeader("Próximas publicaciones", "${s.socialDrafts.size} en cola")
                }
                items(s.socialDrafts) { post -> SocialPreviewCard(post) }
            }

            item { Spacer(Modifier.height(24.dp)) }
        }
    }
}

@Composable
private fun StudioQuickActionCard(
    modifier: Modifier,
    icon: String,
    title: String,
    subtitle: String,
    bg: Color,
    onClick: () -> Unit,
) {
    Card(
        onClick = onClick,
        modifier = modifier,
        shape = RoundedCornerShape(NxDimens.PanelRadius),
        colors = CardDefaults.cardColors(containerColor = bg),
    ) {
        Column(Modifier.padding(14.dp)) {
            Text(icon, fontSize = 20.sp)
            Spacer(Modifier.height(6.dp))
            Text(title, color = Color.White, fontWeight = FontWeight.Bold, fontSize = 15.sp)
            Text(subtitle, color = Color.White.copy(alpha = 0.9f), fontSize = 11.sp)
        }
    }
}

@Composable
private fun StudioDashKpiCard(
    modifier: Modifier,
    icon: String,
    title: String,
    value: String,
    sub: String,
    bg: Color,
    accent: Color,
) {
    Card(
        modifier = modifier,
        shape = RoundedCornerShape(NxDimens.PanelRadius),
        colors = CardDefaults.cardColors(containerColor = bg),
        elevation = CardDefaults.cardElevation(0.dp),
    ) {
        Column(modifier = Modifier.padding(14.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                Text(icon, fontSize = 18.sp)
                Text(title, style = MaterialTheme.typography.labelMedium, color = accent)
            }
            Spacer(Modifier.height(8.dp))
            Text(value, style = MaterialTheme.typography.headlineSmall.copy(fontWeight = FontWeight.Bold), color = StudioSlate)
            Spacer(Modifier.height(2.dp))
            Text(sub, style = MaterialTheme.typography.bodySmall, color = StudioMuted)
        }
    }
}

@Composable
private fun SocialPreviewCard(post: SocialPostDto) {
    NxPanelShell {
        Column {
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                StudioStatusChip(post.red ?: "Red")
                StudioStatusChip(post.estado ?: "", StudioMuted)
            }
            Text(post.titulo ?: "Sin título", fontWeight = FontWeight.SemiBold)
            if (!post.cuando.isNullOrBlank()) {
                Text(post.cuando, style = MaterialTheme.typography.labelSmall, color = StudioMuted)
            }
        }
    }
}
