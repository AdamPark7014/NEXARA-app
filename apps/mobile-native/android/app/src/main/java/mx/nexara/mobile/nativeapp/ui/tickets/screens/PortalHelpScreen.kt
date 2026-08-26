package mx.nexara.mobile.nativeapp.ui.tickets.screens

import android.app.Application
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
import androidx.compose.material3.Button
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.material3.pulltorefresh.PullToRefreshBox
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import androidx.lifecycle.viewmodel.compose.viewModel
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import mx.nexara.mobile.nativeapp.data.api.ApiClient
import mx.nexara.mobile.nativeapp.data.api.KbPublicArticleDto
import mx.nexara.mobile.nativeapp.ui.enterprise.NxColors
import mx.nexara.mobile.nativeapp.ui.enterprise.NxEmptyState
import mx.nexara.mobile.nativeapp.ui.enterprise.NxErrorBlock
import mx.nexara.mobile.nativeapp.ui.enterprise.NxLoadingBlock
import mx.nexara.mobile.nativeapp.ui.enterprise.NxPanelShell
import java.time.Instant
import java.time.ZoneId
import java.time.format.DateTimeFormatter
import java.util.Locale

data class PortalHelpUiState(
    val isLoading: Boolean = true,
    val isRefreshing: Boolean = false,
    val isMarkingHelpful: Boolean = false,
    val error: String? = null,
    val search: String = "",
    val articles: List<KbPublicArticleDto> = emptyList(),
    val selected: KbPublicArticleDto? = null,
)

class PortalHelpViewModel(app: Application) : AndroidViewModel(app) {
    private val api = ApiClient.kbPublic
    private var searchJob: Job? = null

    private val _state = MutableStateFlow(PortalHelpUiState())
    val state: StateFlow<PortalHelpUiState> = _state

    init {
        refresh(initial = true)
    }

    fun setSearch(value: String) {
        _state.update { it.copy(search = value) }
        searchJob?.cancel()
        searchJob = viewModelScope.launch {
            delay(300)
            fetchArticles(value.trim().takeIf { it.isNotBlank() })
        }
    }

    fun refresh(initial: Boolean = false) {
        _state.update {
            if (initial) it.copy(isLoading = true, error = null)
            else it.copy(isRefreshing = true, error = null)
        }
        viewModelScope.launch {
            fetchArticles(_state.value.search.trim().takeIf { it.isNotBlank() })
        }
    }

    fun selectArticle(article: KbPublicArticleDto?) {
        _state.update { it.copy(selected = article) }
    }

    fun markHelpful(id: Long) {
        _state.update { it.copy(isMarkingHelpful = true) }
        viewModelScope.launch {
            try {
                withContext(Dispatchers.IO) { api.markHelpful(id) }
                fetchArticles(_state.value.search.trim().takeIf { it.isNotBlank() })
                val updated = _state.value.articles.find { it.id == id }
                _state.update {
                    it.copy(
                        isMarkingHelpful = false,
                        selected = updated ?: it.selected,
                    )
                }
            } catch (_: Exception) {
                _state.update { it.copy(isMarkingHelpful = false) }
            }
        }
    }

    private suspend fun fetchArticles(query: String?) {
        try {
            val list = withContext(Dispatchers.IO) { api.listArticles(query) }
            val selectedId = _state.value.selected?.id
            _state.update {
                it.copy(
                    isLoading = false,
                    isRefreshing = false,
                    articles = list,
                    error = null,
                    selected = selectedId?.let { id -> list.find { a -> a.id == id } },
                )
            }
        } catch (e: Exception) {
            _state.update {
                it.copy(
                    isLoading = false,
                    isRefreshing = false,
                    error = e.message?.takeIf { m -> m.isNotBlank() } ?: "No se pudieron cargar los artículos",
                )
            }
        }
    }
}

private fun formatPublishedAt(raw: String?): String {
    if (raw.isNullOrBlank()) return ""
    return runCatching {
        val instant = Instant.parse(raw)
        val formatter = DateTimeFormatter.ofPattern("d MMM yyyy", Locale("es", "MX"))
        formatter.format(instant.atZone(ZoneId.systemDefault()))
    }.getOrDefault(raw.take(10))
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun PortalHelpScreen(
    onBack: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val vm: PortalHelpViewModel = viewModel()
    val state by vm.state.collectAsState()

    PullToRefreshBox(
        isRefreshing = state.isRefreshing,
        onRefresh = { vm.refresh(initial = false) },
        modifier = modifier.fillMaxSize(),
    ) {
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(16.dp),
        ) {
            OutlinedButton(onClick = onBack) { Text("← Portal") }

            Spacer(Modifier.height(12.dp))

            Text(
                "🆘 Centro de ayuda",
                style = MaterialTheme.typography.headlineSmall,
                fontWeight = FontWeight.Bold,
                color = NxColors.Slate,
            )
            Text(
                "Encuentra respuestas a las preguntas más frecuentes sobre nuestros servicios.",
                style = MaterialTheme.typography.bodyMedium,
                color = NxColors.Muted,
                modifier = Modifier.padding(top = 4.dp),
            )

            OutlinedTextField(
                value = state.search,
                onValueChange = vm::setSearch,
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(top = 12.dp),
                placeholder = { Text("🔍 Buscar artículos…") },
                singleLine = true,
            )

            Spacer(Modifier.height(12.dp))

            when {
                state.isLoading -> NxLoadingBlock("Cargando artículos…")
                !state.error.isNullOrBlank() -> NxErrorBlock(state.error!!, onRetry = { vm.refresh(initial = true) })
                state.selected != null -> PortalHelpArticleDetail(
                    article = state.selected!!,
                    isMarkingHelpful = state.isMarkingHelpful,
                    onBack = { vm.selectArticle(null) },
                    onMarkHelpful = { vm.markHelpful(state.selected!!.id) },
                )
                state.articles.isEmpty() -> NxEmptyState(
                    title = "Sin artículos",
                    subtitle = if (state.search.isNotBlank()) {
                        "No se encontraron artículos para \"${state.search}\"."
                    } else {
                        "No hay artículos publicados por ahora."
                    },
                )
                else -> LazyColumn(
                    verticalArrangement = Arrangement.spacedBy(10.dp),
                    contentPadding = PaddingValues(bottom = 16.dp),
                ) {
                    items(state.articles, key = { it.id }) { article ->
                        PortalHelpArticleCard(
                            article = article,
                            onClick = { vm.selectArticle(article) },
                        )
                    }
                }
            }
        }
    }
}

@Composable
private fun PortalHelpArticleCard(
    article: KbPublicArticleDto,
    onClick: () -> Unit,
) {
    NxPanelShell(
        onClick = onClick,
        contentPadding = PaddingValues(14.dp),
    ) {
        val category = article.category
        if (category != null) {
            Text(
                "${category.icon.orEmpty()} ${category.name}".trim(),
                style = MaterialTheme.typography.labelSmall,
                color = NxColors.Muted,
            )
        }
        Text(
            article.title,
            style = MaterialTheme.typography.titleMedium,
            fontWeight = FontWeight.SemiBold,
            color = NxColors.Slate,
            modifier = Modifier.padding(top = 4.dp),
        )
        val excerpt = article.excerpt?.trim().orEmpty()
        if (excerpt.isNotBlank()) {
            Text(
                excerpt,
                style = MaterialTheme.typography.bodySmall,
                color = NxColors.Muted,
                modifier = Modifier.padding(top = 4.dp),
            )
        }
        Text(
            "👁️ ${article.viewCount} · 👍 ${article.helpfulCount}",
            style = MaterialTheme.typography.labelSmall,
            color = NxColors.Muted,
            modifier = Modifier.padding(top = 8.dp),
        )
    }
}

@Composable
private fun PortalHelpArticleDetail(
    article: KbPublicArticleDto,
    isMarkingHelpful: Boolean,
    onBack: () -> Unit,
    onMarkHelpful: () -> Unit,
) {
    LazyColumn(
        verticalArrangement = Arrangement.spacedBy(12.dp),
        contentPadding = PaddingValues(bottom = 16.dp),
    ) {
        item {
            OutlinedButton(onClick = onBack) { Text("← Volver al listado") }
        }
        item {
            NxPanelShell(contentPadding = PaddingValues(16.dp)) {
                val category = article.category
                if (category != null) {
                    Text(
                        "${category.icon.orEmpty()} ${category.name}".trim(),
                        style = MaterialTheme.typography.labelMedium,
                        color = NxColors.Muted,
                    )
                }
                Text(
                    article.title,
                    style = MaterialTheme.typography.titleLarge,
                    fontWeight = FontWeight.Bold,
                    color = NxColors.Slate,
                    modifier = Modifier.padding(top = 4.dp),
                )
                val published = formatPublishedAt(article.publishedAt)
                val meta = buildList {
                    if (published.isNotBlank()) add(published)
                    add("👁️ ${article.viewCount}")
                    add("👍 ${article.helpfulCount}")
                }.joinToString(" · ")
                Text(
                    meta,
                    style = MaterialTheme.typography.labelSmall,
                    color = NxColors.Muted,
                    modifier = Modifier.padding(top = 8.dp, bottom = 12.dp),
                )
                Text(
                    article.content,
                    style = MaterialTheme.typography.bodyMedium,
                    color = NxColors.Slate,
                )
            }
        }
        item {
            NxPanelShell(contentPadding = PaddingValues(16.dp)) {
                Text(
                    "¿Te fue útil este artículo?",
                    style = MaterialTheme.typography.bodyMedium,
                    modifier = Modifier.fillMaxWidth(),
                )
                Spacer(Modifier.height(8.dp))
                Button(
                    onClick = onMarkHelpful,
                    enabled = !isMarkingHelpful,
                ) {
                    Text(if (isMarkingHelpful) "…" else "👍 Sí, gracias")
                }
            }
        }
    }
}
