package mx.nexara.mobile.nativeapp.ui.integra

import android.app.Application
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FilterChip
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.pulltorefresh.PullToRefreshBox
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
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
import mx.nexara.mobile.nativeapp.data.api.toUserMessage
import mx.nexara.mobile.nativeapp.data.integra.IntegraRepository
import mx.nexara.mobile.nativeapp.ui.enterprise.NxColors
import mx.nexara.mobile.nativeapp.ui.enterprise.NxEmptyState
import mx.nexara.mobile.nativeapp.ui.enterprise.NxErrorBlock
import mx.nexara.mobile.nativeapp.ui.enterprise.NxKpi
import mx.nexara.mobile.nativeapp.ui.enterprise.NxKpiGrid
import mx.nexara.mobile.nativeapp.ui.enterprise.NxLoadingBlock
import mx.nexara.mobile.nativeapp.ui.enterprise.NxSearchField
import mx.nexara.mobile.nativeapp.ui.enterprise.NxStatusChip
import mx.nexara.mobile.nativeapp.ui.enterprise.NxTone
import mx.nexara.mobile.nativeapp.ui.integra.common.DEVICE_KIND_FILTERS
import mx.nexara.mobile.nativeapp.ui.integra.common.IntegraFormat
import mx.nexara.mobile.nativeapp.ui.integra.common.IntegraNotice
import mx.nexara.mobile.nativeapp.ui.integra.common.IntegraShowingCount
import mx.nexara.mobile.nativeapp.ui.integra.common.IntegraSiteBar
import mx.nexara.mobile.nativeapp.ui.integra.common.IntegraSitesCache
import mx.nexara.mobile.nativeapp.ui.integra.common.bool
import mx.nexara.mobile.nativeapp.ui.integra.common.deviceKindLabel
import mx.nexara.mobile.nativeapp.ui.integra.common.deviceMatches
import mx.nexara.mobile.nativeapp.ui.integra.common.ordenarEquipos
import mx.nexara.mobile.nativeapp.ui.integra.common.str
import java.time.Instant
import java.time.ZoneId

private const val DEVICE_PAGE = 30

/**
 * Inventario de equipos.
 *
 * Esta pantalla existe para una sola pregunta: **¿qué se cayó?**. Por eso los
 * equipos sin conexión van arriba, hay un filtro de un toque para verlos solos,
 * y se enseña la antigüedad de la última sincronización: un inventario de hace
 * dos días que se pinta como si fuera de ahora es peor que no tener inventario.
 */
data class IntegraDevicesUiState(
    val loading: Boolean = true,
    val isRefreshing: Boolean = false,
    val error: String? = null,
    val items: List<Map<String, Any?>> = emptyList(),
    val query: String = "",
    val kindFilter: String = "",
    val soloCaidos: Boolean = false,
    val limit: Int = DEVICE_PAGE,
    /** `integra/sync/last`: cuándo se refrescó el espejo por última vez. */
    val lastSyncAt: String = "",
    val zone: ZoneId = IntegraFormat.MexicoCity,
)

class IntegraDevicesViewModel(app: Application) : AndroidViewModel(app) {
    private val repo = IntegraRepository(app.applicationContext)
    private val _state = MutableStateFlow(IntegraDevicesUiState(zone = ZoneId.systemDefault()))
    val state: StateFlow<IntegraDevicesUiState> = _state

    init { refresh() }

    fun setQuery(v: String) = _state.update { it.copy(query = v, limit = DEVICE_PAGE) }
    fun setKind(v: String) = _state.update {
        it.copy(kindFilter = if (it.kindFilter == v) "" else v, limit = DEVICE_PAGE)
    }
    fun toggleCaidos() = _state.update {
        it.copy(soloCaidos = !it.soloCaidos, limit = DEVICE_PAGE)
    }
    fun clearFilters() = _state.update {
        it.copy(query = "", kindFilter = "", soloCaidos = false, limit = DEVICE_PAGE)
    }
    fun showMore() = _state.update { it.copy(limit = it.limit + DEVICE_PAGE) }

    fun selectSite(siteId: Int?) {
        repo.selectSite(siteId)
        _state.update { it.copy(items = emptyList(), limit = DEVICE_PAGE) }
        refresh()
    }

    fun refresh(initial: Boolean = true) {
        _state.update {
            it.copy(loading = initial && it.items.isEmpty(), isRefreshing = !initial, error = null)
        }
        viewModelScope.launch {
            IntegraSitesCache.ensure(repo)
            try {
                val list = withContext(Dispatchers.IO) { repo.devices() }
                // Que no haya dato de sincronización no puede tumbar el inventario.
                val sync = runCatching { withContext(Dispatchers.IO) { repo.lastSync() } }
                    .getOrDefault(emptyMap())
                _state.update {
                    it.copy(
                        loading = false,
                        isRefreshing = false,
                        items = ordenarEquipos(list),
                        lastSyncAt = str(sync, "finishedAt", "startedAt", "at", "lastSyncAt"),
                    )
                }
            } catch (e: Exception) {
                _state.update {
                    it.copy(
                        loading = false,
                        isRefreshing = false,
                        error = e.toUserMessage("No se pudieron cargar los equipos"),
                    )
                }
            }
        }
    }

    fun filtered(): List<Map<String, Any?>> {
        val s = _state.value
        return s.items.filter { d ->
            val kind = str(d, "kind", "deviceType").uppercase()
            (s.kindFilter.isEmpty() || kind == s.kindFilter) &&
                (!s.soloCaidos || bool(d, "online") == false) &&
                deviceMatches(d, s.query)
        }
    }

    fun caidos(): Int = _state.value.items.count { bool(it, "online") == false }
}

@OptIn(ExperimentalMaterial3Api::class, ExperimentalLayoutApi::class)
@Composable
fun IntegraDevicesScreen(vm: IntegraDevicesViewModel = viewModel()) {
    val s by vm.state.collectAsState()
    val sites by IntegraSitesCache.sites.collectAsState()
    val sitesLoading by IntegraSitesCache.loading.collectAsState()
    val matching = vm.filtered()
    val rows = matching.take(s.limit)
    val caidos = vm.caidos()

    PullToRefreshBox(
        isRefreshing = s.isRefreshing,
        onRefresh = { vm.refresh(initial = false) },
        modifier = Modifier.fillMaxSize(),
    ) {
        when {
            s.loading -> NxLoadingBlock("Cargando equipos…")
            s.error != null && s.items.isEmpty() -> NxErrorBlock(s.error.orEmpty()) { vm.refresh() }
            else -> LazyColumn(
                contentPadding = PaddingValues(16.dp),
                verticalArrangement = Arrangement.spacedBy(8.dp),
            ) {
                item {
                    IntegraSiteBar(sites = sites, loading = sitesLoading, onSelect = vm::selectSite)
                }
                item {
                    NxKpiGrid(
                        items = listOf(
                            NxKpi(
                                label = "Equipos",
                                value = s.items.size.toString(),
                                tone = NxTone.Brand,
                            ),
                            NxKpi(
                                label = "Sin conexión",
                                value = caidos.toString(),
                                hint = if (caidos == 0) "Todo en línea" else "Requieren revisión",
                                tone = if (caidos == 0) NxTone.Success else NxTone.Danger,
                            ),
                        ),
                    )
                }
                if (s.lastSyncAt.isNotBlank()) {
                    item {
                        Text(
                            "Espejo sincronizado ${IntegraFormat.relative(s.lastSyncAt, s.zone, Instant.now())} " +
                                "(${IntegraFormat.dateTime(s.lastSyncAt, s.zone)})",
                            style = MaterialTheme.typography.labelSmall,
                            color = NxColors.Muted,
                        )
                    }
                } else {
                    item {
                        IntegraNotice(
                            "Sin registro de sincronización: el estado de estos equipos puede " +
                                "estar desfasado. Sincroniza desde la consola web.",
                            NxTone.Warning,
                        )
                    }
                }
                item {
                    NxSearchField(
                        value = s.query,
                        onValueChange = vm::setQuery,
                        placeholder = "Nombre, IP o tipo…",
                    )
                }
                item {
                    FlowRow(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                        FilterChip(
                            selected = s.soloCaidos,
                            onClick = vm::toggleCaidos,
                            label = { Text("Solo caídos ($caidos)") },
                        )
                        DEVICE_KIND_FILTERS.forEach { k ->
                            FilterChip(
                                selected = s.kindFilter == k,
                                onClick = { vm.setKind(k) },
                                label = { Text(deviceKindLabel(k)) },
                            )
                        }
                    }
                }

                if (rows.isEmpty()) {
                    item {
                        if (s.items.isEmpty()) {
                            NxEmptyState(
                                "Sin equipos",
                                "No hay dispositivos en el espejo de este sitio.",
                            )
                        } else {
                            NxEmptyState(
                                "Ninguno coincide",
                                "Ninguno de los ${s.items.size} equipos coincide con el filtro.",
                                actionLabel = "Quitar filtros",
                                onAction = vm::clearFilters,
                            )
                        }
                    }
                } else {
                    items(rows, key = { str(it, "id", "ip") }) { device -> DeviceCard(device) }
                    item {
                        IntegraShowingCount(
                            shown = rows.size,
                            matching = matching.size,
                            total = s.items.size,
                            noun = "equipos",
                            onMore = vm::showMore,
                        )
                    }
                }
            }
        }
    }
}

@Composable
private fun DeviceCard(device: Map<String, Any?>) {
    val online = bool(device, "online")
    Card(
        modifier = Modifier.fillMaxWidth(),
        colors = CardDefaults.cardColors(containerColor = NxColors.Card),
    ) {
        Row(
            Modifier.fillMaxWidth().padding(14.dp),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Column(Modifier.weight(1f)) {
                Text(
                    str(device, "name").ifBlank { str(device, "ip", "id") },
                    fontWeight = FontWeight.SemiBold,
                    color = NxColors.Slate,
                )
                Text(
                    listOf(
                        deviceKindLabel(str(device, "kind")),
                        str(device, "ip"),
                        str(device, "deviceType"),
                    ).filter { it.isNotBlank() && it != IntegraFormat.EMPTY }.joinToString(" · "),
                    style = MaterialTheme.typography.bodySmall,
                    color = NxColors.Muted,
                )
                Text(
                    "ID ${str(device, "id").ifBlank { IntegraFormat.EMPTY }}",
                    style = MaterialTheme.typography.labelSmall,
                    color = NxColors.Muted,
                )
            }
            // `null` no es «offline»: es que el espejo no trae el dato.
            NxStatusChip(
                when (online) {
                    true -> "En línea"
                    false -> "Sin conexión"
                    null -> "Sin dato"
                },
                when (online) {
                    true -> NxTone.Success
                    false -> NxTone.Danger
                    null -> NxTone.Neutral
                },
            )
        }
    }
}
