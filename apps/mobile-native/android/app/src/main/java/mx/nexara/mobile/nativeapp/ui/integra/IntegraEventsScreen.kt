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
import mx.nexara.mobile.nativeapp.ui.integra.common.EVENT_STATE_FILTERS
import mx.nexara.mobile.nativeapp.ui.integra.common.EventQuickView
import mx.nexara.mobile.nativeapp.ui.integra.common.IntegraFormat
import mx.nexara.mobile.nativeapp.ui.integra.common.IntegraOpMessage
import mx.nexara.mobile.nativeapp.ui.integra.common.IntegraShowingCount
import mx.nexara.mobile.nativeapp.ui.integra.common.IntegraSiteBar
import mx.nexara.mobile.nativeapp.ui.integra.common.IntegraSitesCache
import mx.nexara.mobile.nativeapp.ui.integra.common.deviceLabel
import mx.nexara.mobile.nativeapp.ui.integra.common.eventMatches
import mx.nexara.mobile.nativeapp.ui.integra.common.eventStateLabel
import mx.nexara.mobile.nativeapp.ui.integra.common.eventStateTone
import mx.nexara.mobile.nativeapp.ui.integra.common.int
import mx.nexara.mobile.nativeapp.ui.integra.common.outcomeLabel
import mx.nexara.mobile.nativeapp.ui.integra.common.outcomeTone
import mx.nexara.mobile.nativeapp.ui.integra.common.quickViewRange
import mx.nexara.mobile.nativeapp.ui.integra.common.str
import mx.nexara.mobile.nativeapp.ui.integra.common.strOrNull
import mx.nexara.mobile.nativeapp.ui.integra.common.verifyModeLabel
import java.time.Instant
import java.time.ZoneId

/**
 * Bitácora ACS.
 *
 * Tres decisiones que la separan de la versión anterior:
 *
 *  1. **Pagina de verdad.** `integra/push/events` devuelve `hasMore` y
 *     `nextBeforeId`; «Ver más» pide la página siguiente al servidor en vez de
 *     traerse la tabla entera y recortarla en el móvil.
 *  2. **No clasifica códigos.** `label`, `outcome` y `eventState` llegan
 *     resueltos por la tabla única del servidor (`hikvision-isapi/acs-codes.ts`).
 *     Aquí no hay ni un `when (minor)`.
 *  3. **Las horas se pintan en la zona del sitio.** Antes se enseñaba la marca
 *     ISO cruda: un acceso de las 13:24 de Puebla se leía «19:24Z».
 */
private const val EVENT_PAGE = 60

data class IntegraEventsUiState(
    val loading: Boolean = true,
    val isRefreshing: Boolean = false,
    val loadingMore: Boolean = false,
    val error: String? = null,
    val items: List<Map<String, Any?>> = emptyList(),
    val hasMore: Boolean = false,
    val nextBeforeId: Long? = null,
    val view: EventQuickView = EventQuickView.Hoy,
    /** `active` · `inactive` · `null` (sin filtrar). */
    val eventState: String? = null,
    val query: String = "",
    val stats: Map<String, Any?> = emptyMap(),
    val zone: ZoneId = IntegraFormat.MexicoCity,
)

class IntegraEventsViewModel(app: Application) : AndroidViewModel(app) {
    private val repo = IntegraRepository(app.applicationContext)
    private val _state = MutableStateFlow(IntegraEventsUiState(zone = ZoneId.systemDefault()))
    val state: StateFlow<IntegraEventsUiState> = _state

    init { refresh() }

    fun setQuery(v: String) = _state.update { it.copy(query = v) }

    fun setView(v: EventQuickView) {
        if (_state.value.view == v) return
        _state.update { it.copy(view = v, items = emptyList(), nextBeforeId = null) }
        refresh()
    }

    fun setEventState(v: String?) {
        val nuevo = if (_state.value.eventState == v) null else v
        _state.update { it.copy(eventState = nuevo, items = emptyList(), nextBeforeId = null) }
        refresh()
    }

    fun selectSite(siteId: Int?) {
        repo.selectSite(siteId)
        _state.update { it.copy(items = emptyList(), nextBeforeId = null) }
        refresh()
    }

    fun refresh(initial: Boolean = true) {
        _state.update {
            it.copy(
                loading = initial && it.items.isEmpty(),
                isRefreshing = !initial,
                error = null,
            )
        }
        viewModelScope.launch {
            IntegraSitesCache.ensure(repo)
            val s = _state.value
            val (desde, hasta) = quickViewRange(s.view, Instant.now(), s.zone)
            try {
                val page = withContext(Dispatchers.IO) {
                    repo.pushEvents(
                        limit = EVENT_PAGE,
                        scope = s.view.scope,
                        outcome = s.view.outcome,
                        eventState = s.eventState,
                        from = desde,
                        to = hasta,
                    )
                }
                // Los KPI son del día completo y no dependen de la vista: si
                // fallan, la bitácora se pinta igual.
                val stats = runCatching { withContext(Dispatchers.IO) { repo.pushEventStats() } }
                    .getOrDefault(emptyMap())
                _state.update {
                    it.copy(
                        loading = false,
                        isRefreshing = false,
                        items = page.items,
                        hasMore = page.hasMore,
                        nextBeforeId = page.nextBeforeId,
                        stats = stats,
                    )
                }
            } catch (e: Exception) {
                _state.update {
                    it.copy(
                        loading = false,
                        isRefreshing = false,
                        error = e.toUserMessage("No se pudieron cargar los eventos"),
                    )
                }
            }
        }
    }

    /** Página siguiente hacia atrás, con el cursor que dio el servidor. */
    fun loadMore() {
        val s = _state.value
        if (s.loadingMore || !s.hasMore) return
        val cursor = s.nextBeforeId ?: return
        _state.update { it.copy(loadingMore = true) }
        viewModelScope.launch {
            val (desde, hasta) = quickViewRange(s.view, Instant.now(), s.zone)
            try {
                val page = withContext(Dispatchers.IO) {
                    repo.pushEvents(
                        limit = EVENT_PAGE,
                        scope = s.view.scope,
                        outcome = s.view.outcome,
                        eventState = s.eventState,
                        from = desde,
                        to = hasta,
                        beforeId = cursor,
                    )
                }
                _state.update {
                    it.copy(
                        loadingMore = false,
                        items = it.items + page.items,
                        hasMore = page.hasMore,
                        nextBeforeId = page.nextBeforeId,
                    )
                }
            } catch (e: Exception) {
                _state.update {
                    it.copy(
                        loadingMore = false,
                        error = e.toUserMessage("No se pudo traer la página siguiente"),
                    )
                }
            }
        }
    }

    fun filtered(): List<Map<String, Any?>> {
        val q = _state.value.query
        if (q.isBlank()) return _state.value.items
        return _state.value.items.filter { eventMatches(it, q) }
    }
}

@OptIn(ExperimentalMaterial3Api::class, ExperimentalLayoutApi::class)
@Composable
fun IntegraEventsScreen(vm: IntegraEventsViewModel = viewModel()) {
    val s by vm.state.collectAsState()
    val sites by IntegraSitesCache.sites.collectAsState()
    val sitesLoading by IntegraSitesCache.loading.collectAsState()
    val rows = vm.filtered()

    PullToRefreshBox(
        isRefreshing = s.isRefreshing,
        onRefresh = { vm.refresh(initial = false) },
        modifier = Modifier.fillMaxSize(),
    ) {
        when {
            s.loading -> NxLoadingBlock("Cargando eventos…")
            s.error != null && s.items.isEmpty() -> NxErrorBlock(s.error.orEmpty()) { vm.refresh() }
            else -> LazyColumn(
                contentPadding = PaddingValues(16.dp),
                verticalArrangement = Arrangement.spacedBy(8.dp),
            ) {
                item {
                    IntegraSiteBar(sites = sites, loading = sitesLoading, onSelect = vm::selectSite)
                }
                if (s.stats.isNotEmpty()) {
                    item { EventStatsStrip(s.stats) }
                }
                item {
                    FlowRow(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                        EventQuickView.entries.forEach { v ->
                            FilterChip(
                                selected = s.view == v,
                                onClick = { vm.setView(v) },
                                label = { Text(v.label) },
                            )
                        }
                    }
                }
                item {
                    FlowRow(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                        EVENT_STATE_FILTERS.forEach { (clave, etiqueta) ->
                            FilterChip(
                                selected = s.eventState == clave,
                                onClick = { vm.setEventState(clave) },
                                label = { Text(etiqueta) },
                            )
                        }
                    }
                }
                item {
                    NxSearchField(
                        value = s.query,
                        onValueChange = vm::setQuery,
                        placeholder = "Persona, equipo, IP o etiqueta…",
                    )
                }
                s.error?.let { err -> item { IntegraOpMessage(err, isError = true) } }

                if (rows.isEmpty()) {
                    item {
                        NxEmptyState(
                            if (s.items.isEmpty()) "Sin eventos" else "Ninguno coincide",
                            if (s.items.isEmpty()) {
                                "No hay eventos de «${s.view.label}» en este sitio."
                            } else {
                                "Ninguno de los ${s.items.size} eventos cargados coincide con la búsqueda."
                            },
                        )
                    }
                } else {
                    items(rows, key = { str(it, "id") }) { ev -> EventCard(ev, s.zone) }
                    item {
                        IntegraShowingCount(
                            shown = rows.size,
                            matching = s.items.size,
                            total = s.items.size,
                            noun = "eventos",
                            loading = s.loadingMore,
                            onMore = if (s.hasMore) vm::loadMore else null,
                        )
                    }
                    if (!s.hasMore) {
                        item {
                            Text(
                                "Fin de la bitácora para este rango.",
                                style = MaterialTheme.typography.labelSmall,
                                color = NxColors.Muted,
                            )
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun EventStatsStrip(stats: Map<String, Any?>) {
    NxKpiGrid(
        items = listOf(
            NxKpi(
                label = "Entradas hoy",
                value = (int(stats, "entradas", "granted") ?: 0).toString(),
                tone = NxTone.Success,
            ),
            NxKpi(
                label = "Denegados",
                value = (int(stats, "denegados", "denied") ?: 0).toString(),
                tone = NxTone.Danger,
            ),
            NxKpi(
                label = "Personas únicas",
                value = (int(stats, "unicos", "uniquePersons") ?: 0).toString(),
                tone = NxTone.Info,
            ),
            NxKpi(
                label = "En sitio",
                value = (int(stats, "enSitio", "onSite") ?: 0).toString(),
                tone = NxTone.Brand,
            ),
        ),
    )
}

@Composable
private fun EventCard(ev: Map<String, Any?>, zone: ZoneId) {
    val outcome = strOrNull(ev, "outcome")
    val label = strOrNull(ev, "label")
    val estado = strOrNull(ev, "eventState")
    Card(
        modifier = Modifier.fillMaxWidth(),
        colors = CardDefaults.cardColors(containerColor = NxColors.Card),
    ) {
        Column(Modifier.padding(14.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
            Row(
                Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Text(
                    str(ev, "personName").ifBlank { "Sin persona identificada" },
                    fontWeight = FontWeight.SemiBold,
                    color = NxColors.Slate,
                    modifier = Modifier.weight(1f),
                )
                NxStatusChip(
                    outcomeLabel(outcome, label, strOrNull(ev, "eventType")),
                    outcomeTone(outcome, label),
                )
            }
            Text(
                deviceLabel(strOrNull(ev, "deviceName"), int(ev, "doorNo"), strOrNull(ev, "deviceIp")),
                style = MaterialTheme.typography.bodySmall,
                color = NxColors.Muted,
            )
            Row(
                Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Text(
                    buildString {
                        append(IntegraFormat.dateTime(str(ev, "occurredAt"), zone))
                        val verificacion = verifyModeLabel(strOrNull(ev, "verifyMode"))
                        if (verificacion.isNotBlank()) append(" · $verificacion")
                    },
                    style = MaterialTheme.typography.labelSmall,
                    color = NxColors.Muted,
                    modifier = Modifier.weight(1f),
                )
                val estadoTexto = eventStateLabel(estado)
                if (estadoTexto.isNotBlank()) {
                    NxStatusChip(estadoTexto, eventStateTone(estado))
                }
            }
        }
    }
}
