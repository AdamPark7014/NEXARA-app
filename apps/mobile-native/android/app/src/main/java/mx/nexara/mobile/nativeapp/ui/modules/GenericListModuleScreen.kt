package mx.nexara.mobile.nativeapp.ui.modules

import androidx.compose.foundation.clickable
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FilterChip
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.Text
import androidx.compose.material3.pulltorefresh.PullToRefreshBox
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import androidx.lifecycle.viewmodel.compose.viewModel
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import mx.nexara.mobile.nativeapp.data.extra.ExtraRepository
import mx.nexara.mobile.nativeapp.ui.common.SimpleListScreen
import mx.nexara.mobile.nativeapp.ui.common.SimpleRow
import mx.nexara.mobile.nativeapp.ui.enterprise.NxColors
import mx.nexara.mobile.nativeapp.ui.enterprise.NxEmptyState
import mx.nexara.mobile.nativeapp.ui.enterprise.NxLoadingBlock
import mx.nexara.mobile.nativeapp.ui.enterprise.NxPanelShell
import mx.nexara.mobile.nativeapp.ui.enterprise.NxSearchField

/**
 * Estado genérico para las pantallas de módulos que listan datos planos.
 */
data class ModuleListUiState(
    val loading: Boolean = false,
    val rows: List<SimpleRow>? = null,
    val error: String? = null,
)

/**
 * ViewModel base: dispara un loader que devuelve filas ya mapeadas.
 */
class SimpleListViewModel : ViewModel() {
    private val _state = MutableStateFlow(ModuleListUiState())
    val state: StateFlow<ModuleListUiState> = _state

    private var loader: (suspend () -> List<SimpleRow>)? = null

    fun configure(loader: suspend () -> List<SimpleRow>) {
        this.loader = loader
    }

    fun load() {
        val fn = loader ?: return
        _state.update { it.copy(loading = true, error = null) }
        viewModelScope.launch {
            try {
                val rows = withContext(Dispatchers.IO) { fn() }
                _state.update { it.copy(loading = false, rows = rows, error = null) }
            } catch (t: Throwable) {
                _state.update { it.copy(loading = false, error = t.message ?: "Error inesperado") }
            }
        }
    }
}

/**
 * Pantalla genérica: crea un VM, configura el loader y muestra SimpleListScreen.
 */
@Composable
fun GenericListModuleScreen(
    title: String,
    loader: suspend (ExtraRepository) -> List<SimpleRow>,
) {
    val context = LocalContext.current
    val repo = remember(context) { ExtraRepository(context) }
    val vm: SimpleListViewModel = viewModel()
    val state by vm.state.collectAsState()

    LaunchedEffect(Unit) {
        vm.configure { loader(repo) }
        vm.load()
    }

    SimpleListScreen(
        title = title,
        rows = state.rows,
        loading = state.loading,
        error = state.error,
        onRetry = { vm.load() },
    )
}

// ── Typed list with KPIs, filters and tap-to-detail ───────────────────────

@Composable
fun ModuleKpiRow(kpis: List<Pair<String, String>>, modifier: Modifier = Modifier) {
    if (kpis.isEmpty()) return
    Row(
        modifier = modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 6.dp),
        horizontalArrangement = Arrangement.SpaceEvenly,
    ) {
        kpis.forEach { (label, value) ->
            Column(horizontalAlignment = Alignment.CenterHorizontally, modifier = Modifier.weight(1f)) {
                Text(value, fontWeight = FontWeight.Bold, style = MaterialTheme.typography.titleSmall)
                Text(label, style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun ModuleDetailSheet(
    pairs: List<Pair<String, String>>,
    onDismiss: () -> Unit,
) {
    ModalBottomSheet(onDismissRequest = onDismiss) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = 20.dp, vertical = 8.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            Text(
                "Detalle",
                style = MaterialTheme.typography.titleMedium.copy(fontWeight = FontWeight.Bold),
                color = NxColors.Slate,
            )
            NxPanelShell {
                pairs.filter { it.second.isNotBlank() }.forEach { (label, value) ->
                    Row(Modifier.fillMaxWidth()) {
                        Text(
                            label,
                            fontWeight = FontWeight.Medium,
                            color = NxColors.Slate,
                            modifier = Modifier.weight(1f),
                        )
                        Text(
                            value,
                            color = NxColors.Muted,
                            modifier = Modifier.weight(1.2f),
                        )
                    }
                    Spacer(Modifier.height(4.dp))
                }
            }
            Spacer(Modifier.height(24.dp))
        }
    }
}

/**
 * Lista tipada con KPI strip, búsqueda, filtros opcionales y detalle al tocar.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun <T> TypedModuleListScreen(
    title: String,
    loadingMessage: String = "Cargando…",
    searchPlaceholder: String = "Buscar…",
    statusOptions: List<String> = emptyList(),
    statusOf: (T) -> String = { "" },
    statusMatches: (T, String) -> Boolean = { item, opt ->
        if (opt.equals("Todos", true)) true
        else statusOf(item).lowercase().contains(opt.lowercase())
    },
    kpisOf: (List<T>) -> List<Pair<String, String>> = { emptyList() },
    load: suspend (ExtraRepository) -> List<T>,
    keyOf: (T) -> String,
    titleOf: (T) -> String,
    subtitleOf: (T) -> String = { "" },
    metaOf: (T) -> String = { "" },
    trailingOf: (T) -> String = { "" },
    matches: (T, String) -> Boolean,
    detailPairs: (T) -> List<Pair<String, String>>,
) {
    val context = LocalContext.current
    val repo = remember(context) { ExtraRepository(context) }
    var loading by remember { mutableStateOf(true) }
    var refreshing by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf<String?>(null) }
    var query by remember { mutableStateOf("") }
    var statusFilter by remember { mutableStateOf(statusOptions.firstOrNull() ?: "Todos") }
    var items by remember { mutableStateOf<List<T>>(emptyList()) }
    var selected by remember { mutableStateOf<T?>(null) }

    val scope = rememberCoroutineScope()

    suspend fun fetchItems() {
        items = withContext(Dispatchers.IO) { load(repo) }
        error = null
    }

    LaunchedEffect(Unit) {
        loading = true
        try {
            fetchItems()
        } catch (e: Exception) {
            error = e.message ?: "Error al cargar"
        } finally {
            loading = false
        }
    }

    val q = query.trim().lowercase()
    val filtered = remember(items, q, statusFilter) {
        items.filter { item ->
            val matchStatus = statusOptions.isEmpty() || statusMatches(item, statusFilter)
            val matchQuery = q.isBlank() || matches(item, q)
            matchStatus && matchQuery
        }
    }

    selected?.let { sel ->
        ModuleDetailSheet(
            pairs = detailPairs(sel),
            onDismiss = { selected = null },
        )
    }

    Column(Modifier.fillMaxSize()) {
        if (!loading && error == null && items.isNotEmpty()) {
            ModuleKpiRow(kpisOf(items))
        }
        NxSearchField(
            value = query,
            onValueChange = { query = it },
            placeholder = searchPlaceholder,
            modifier = Modifier.padding(horizontal = 16.dp),
        )
        if (statusOptions.isNotEmpty()) {
            Spacer(Modifier.height(6.dp))
            Row(
                Modifier.fillMaxWidth().horizontalScroll(rememberScrollState()).padding(horizontal = 16.dp),
                horizontalArrangement = Arrangement.spacedBy(8.dp),
            ) {
                statusOptions.forEach { opt ->
                    FilterChip(
                        selected = statusFilter == opt,
                        onClick = { statusFilter = opt },
                        label = { Text(opt) },
                    )
                }
            }
        }
        Spacer(Modifier.height(8.dp))
        Text(
            "${filtered.size} de ${items.size} registros",
            style = MaterialTheme.typography.bodySmall,
            color = Color(0xFF64748B),
            modifier = Modifier.padding(horizontal = 16.dp),
        )
        Spacer(Modifier.height(6.dp))
        PullToRefreshBox(
            isRefreshing = refreshing,
            onRefresh = {
                scope.launch {
                    refreshing = true
                    try {
                        fetchItems()
                    } catch (e: Exception) {
                        error = e.message ?: "Error al cargar"
                    } finally {
                        refreshing = false
                        loading = false
                    }
                }
            },
            modifier = Modifier.fillMaxSize(),
        ) {
            when {
                loading && items.isEmpty() -> NxLoadingBlock(loadingMessage)
                error != null && items.isEmpty() -> {
                    Column(Modifier.padding(16.dp)) {
                        Text(error!!, color = MaterialTheme.colorScheme.error)
                        Spacer(Modifier.height(8.dp))
                        Button(onClick = {
                            loading = true
                            scope.launch {
                                try {
                                    fetchItems()
                                } catch (e: Exception) {
                                    error = e.message
                                } finally {
                                    loading = false
                                }
                            }
                        }) { Text("Reintentar") }
                    }
                }
                filtered.isEmpty() -> NxEmptyState(
                    title = if (items.isEmpty()) "Sin registros" else "Sin resultados",
                    subtitle = if (items.isEmpty()) "No hay datos para mostrar en $title." else "Prueba otro filtro o término de búsqueda.",
                )
                else -> {
                    LazyColumn(
                        modifier = Modifier.fillMaxWidth().padding(horizontal = 16.dp),
                        verticalArrangement = Arrangement.spacedBy(8.dp),
                    ) {
                        items(filtered.take(100), key = { keyOf(it) }) { row ->
                            Card(
                                modifier = Modifier.fillMaxWidth().clickable { selected = row },
                                colors = CardDefaults.cardColors(containerColor = Color.White),
                                elevation = CardDefaults.cardElevation(1.dp),
                            ) {
                                Column(Modifier.padding(14.dp)) {
                                    Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                                        Text(
                                            titleOf(row).ifBlank { "—" },
                                            fontWeight = FontWeight.SemiBold,
                                            modifier = Modifier.weight(1f),
                                        )
                                        val trail = trailingOf(row)
                                        if (trail.isNotBlank()) {
                                            Text(trail, style = MaterialTheme.typography.labelSmall, color = Color(0xFF0D9488))
                                        }
                                    }
                                    val sub = subtitleOf(row)
                                    if (sub.isNotBlank()) {
                                        Text(sub, style = MaterialTheme.typography.bodySmall, color = Color(0xFF334155))
                                    }
                                    val meta = metaOf(row)
                                    if (meta.isNotBlank()) {
                                        Text(meta, style = MaterialTheme.typography.labelSmall, color = Color(0xFF64748B))
                                    }
                                }
                            }
                        }
                        item { Spacer(Modifier.height(24.dp)) }
                    }
                }
            }
        }
    }
}

internal fun statusPending(s: String): Boolean {
    val v = s.lowercase()
    return v.contains("pend") || v == "pending" || v == "submitted" || v.contains("abiert") || v == "open"
}

internal fun statusApproved(s: String): Boolean {
    val v = s.lowercase()
    return v.contains("aprob") || v.contains("approv") || v.contains("complet") || v == "done" || v.contains("cerrad")
}

internal fun statusRejected(s: String): Boolean {
    val v = s.lowercase()
    return v.contains("rechaz") || v.contains("reject") || v.contains("cancel")
}
