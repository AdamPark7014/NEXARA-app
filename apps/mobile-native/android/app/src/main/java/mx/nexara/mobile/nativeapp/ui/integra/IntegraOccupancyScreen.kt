package mx.nexara.mobile.nativeapp.ui.integra

import android.app.Application
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
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
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
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
import mx.nexara.mobile.nativeapp.ui.enterprise.NxLoadingBlock
import mx.nexara.mobile.nativeapp.ui.enterprise.NxSearchField
import mx.nexara.mobile.nativeapp.ui.enterprise.NxSectionHeader
import mx.nexara.mobile.nativeapp.ui.enterprise.NxStatusChip
import mx.nexara.mobile.nativeapp.ui.enterprise.NxTone
import mx.nexara.mobile.nativeapp.ui.integra.common.AVISO_SIN_SALIDA
import mx.nexara.mobile.nativeapp.ui.integra.common.IntegraDetailLine
import mx.nexara.mobile.nativeapp.ui.integra.common.IntegraFormat
import mx.nexara.mobile.nativeapp.ui.integra.common.IntegraNotice
import mx.nexara.mobile.nativeapp.ui.integra.common.IntegraShowingCount
import mx.nexara.mobile.nativeapp.ui.integra.common.IntegraSiteBar
import mx.nexara.mobile.nativeapp.ui.integra.common.IntegraSitesCache
import mx.nexara.mobile.nativeapp.ui.integra.common.int
import mx.nexara.mobile.nativeapp.ui.integra.common.mapList
import mx.nexara.mobile.nativeapp.ui.integra.common.occupancyMatches
import mx.nexara.mobile.nativeapp.ui.integra.common.occupancySubtitle
import mx.nexara.mobile.nativeapp.ui.integra.common.str
import mx.nexara.mobile.nativeapp.ui.integra.common.strOrNull
import mx.nexara.mobile.nativeapp.ui.integra.common.subMap
import mx.nexara.mobile.nativeapp.ui.integra.common.verifyModeLabel
import java.time.Instant
import java.time.ZoneId

/** Cuántas personas se pintan de golpe. */
private const val OCCUPANCY_PAGE = 25

/**
 * Quién está en sitio ahora.
 *
 * Es una lista deducida de accesos concedidos, no un conteo óptico, y eso se
 * dice en pantalla con el aviso del propio servidor: **este control de acceso no
 * emite señal de salida**, así que nadie «sale» de esta lista por marcar. No se
 * inventa un cierre de jornada para vaciarla.
 *
 * La ficha de cada persona (`integra/presence/:personId`) es lo que convierte
 * esto en algo útil en una caseta: por dónde pasó hoy, a qué hora, y —si está
 * vinculada a un usuario ERP— qué órdenes de trabajo trae abiertas.
 */
data class IntegraOccupancyUiState(
    val loading: Boolean = true,
    val isRefreshing: Boolean = false,
    val error: String? = null,
    val items: List<Map<String, Any?>> = emptyList(),
    val total: Int = 0,
    val day: String = "",
    val note: String = "",
    val query: String = "",
    val limit: Int = OCCUPANCY_PAGE,
    val zone: ZoneId = IntegraFormat.MexicoCity,
    /** Ficha abierta. `null` = lista. */
    val detail: Map<String, Any?>? = null,
    val detailId: String = "",
    val detailLoading: Boolean = false,
    val detailError: String? = null,
)

class IntegraOccupancyViewModel(app: Application) : AndroidViewModel(app) {
    private val repo = IntegraRepository(app.applicationContext)
    private val _state = MutableStateFlow(IntegraOccupancyUiState(zone = ZoneId.systemDefault()))
    val state: StateFlow<IntegraOccupancyUiState> = _state

    init { refresh() }

    fun setQuery(v: String) = _state.update { it.copy(query = v, limit = OCCUPANCY_PAGE) }
    fun showMore() = _state.update { it.copy(limit = it.limit + OCCUPANCY_PAGE) }
    fun closeDetail() = _state.update {
        it.copy(detail = null, detailId = "", detailError = null, detailLoading = false)
    }

    fun selectSite(siteId: Int?) {
        repo.selectSite(siteId)
        _state.update { it.copy(items = emptyList(), limit = OCCUPANCY_PAGE) }
        refresh()
    }

    fun openPerson(personId: String) {
        if (personId.isBlank()) return
        _state.update {
            it.copy(detailId = personId, detailLoading = true, detailError = null, detail = null)
        }
        viewModelScope.launch {
            try {
                val data = withContext(Dispatchers.IO) { repo.presence(personId) }
                _state.update { it.copy(detailLoading = false, detail = data) }
            } catch (e: Exception) {
                _state.update {
                    it.copy(
                        detailLoading = false,
                        detailError = e.toUserMessage("No se pudo abrir la ficha de presencia"),
                    )
                }
            }
        }
    }

    fun refresh(initial: Boolean = true) {
        _state.update {
            it.copy(loading = initial && it.items.isEmpty(), isRefreshing = !initial, error = null)
        }
        viewModelScope.launch {
            IntegraSitesCache.ensure(repo)
            try {
                val result = withContext(Dispatchers.IO) { repo.occupancy() }
                _state.update {
                    it.copy(
                        loading = false,
                        isRefreshing = false,
                        items = result.items,
                        total = result.total,
                        day = result.day,
                        note = result.note,
                    )
                }
            } catch (e: Exception) {
                _state.update {
                    it.copy(
                        loading = false,
                        isRefreshing = false,
                        error = e.toUserMessage("No se pudo cargar quién está en sitio"),
                    )
                }
            }
        }
    }

    fun filtered(): List<Map<String, Any?>> {
        val q = _state.value.query
        if (q.isBlank()) return _state.value.items
        return _state.value.items.filter { occupancyMatches(it, q) }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun IntegraOccupancyScreen(vm: IntegraOccupancyViewModel = viewModel()) {
    val s by vm.state.collectAsState()
    val sites by IntegraSitesCache.sites.collectAsState()
    val sitesLoading by IntegraSitesCache.loading.collectAsState()

    if (s.detailId.isNotBlank()) {
        PresenceDetail(
            state = s,
            onBack = vm::closeDetail,
            onRetry = { vm.openPerson(s.detailId) },
        )
        return
    }

    val matching = vm.filtered()
    val rows = matching.take(s.limit)

    PullToRefreshBox(
        isRefreshing = s.isRefreshing,
        onRefresh = { vm.refresh(initial = false) },
        modifier = Modifier.fillMaxSize(),
    ) {
        when {
            s.loading -> NxLoadingBlock("Cargando presencia…")
            s.error != null && s.items.isEmpty() -> NxErrorBlock(s.error.orEmpty()) { vm.refresh() }
            else -> LazyColumn(
                contentPadding = PaddingValues(16.dp),
                verticalArrangement = Arrangement.spacedBy(8.dp),
            ) {
                item {
                    IntegraSiteBar(sites = sites, loading = sitesLoading, onSelect = vm::selectSite)
                }
                item {
                    NxSectionHeader(
                        title = "En sitio ahora",
                        subtitle = buildString {
                            append("${s.total} persona(s)")
                            if (s.day.isNotBlank()) {
                                append(" · ${IntegraFormat.dayLabel(s.day, s.zone)}")
                            }
                        },
                    )
                }
                item { IntegraNotice(s.note.ifBlank { AVISO_SIN_SALIDA }, NxTone.Info) }
                item {
                    NxSearchField(
                        value = s.query,
                        onValueChange = vm::setQuery,
                        placeholder = "Buscar persona o puerta…",
                    )
                }
                if (rows.isEmpty()) {
                    item {
                        NxEmptyState(
                            if (s.items.isEmpty()) "Nadie en sitio" else "Ninguna coincide",
                            if (s.items.isEmpty()) {
                                "No hay accesos concedidos hoy, o este sitio no empuja eventos ACS."
                            } else {
                                "Ninguna de las ${s.items.size} personas dentro coincide con la búsqueda."
                            },
                        )
                    }
                } else {
                    items(rows, key = { str(it, "personId") }) { row ->
                        OccupancyCard(row, s.zone) { vm.openPerson(str(row, "personId")) }
                    }
                    item {
                        IntegraShowingCount(
                            shown = rows.size,
                            matching = matching.size,
                            total = s.items.size,
                            noun = "personas",
                            onMore = vm::showMore,
                        )
                    }
                }
            }
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun OccupancyCard(row: Map<String, Any?>, zone: ZoneId, onOpen: () -> Unit) {
    val erp = subMap(row, "erpUser")
    Card(
        onClick = onOpen,
        modifier = Modifier.fillMaxWidth(),
        colors = CardDefaults.cardColors(containerColor = NxColors.Card),
    ) {
        Column(Modifier.padding(14.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
            Row(
                Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Text(
                    str(row, "personName").ifBlank { str(row, "personId") },
                    fontWeight = FontWeight.SemiBold,
                    color = NxColors.Slate,
                    modifier = Modifier.weight(1f),
                )
                NxStatusChip(
                    IntegraFormat.relative(str(row, "lastAt"), zone, Instant.now()),
                    NxTone.Success,
                )
            }
            Text(
                occupancySubtitle(strOrNull(row, "lastDoor"), strOrNull(row, "verifyMode")),
                style = MaterialTheme.typography.bodySmall,
                color = NxColors.Muted,
            )
            Text(
                buildString {
                    append("Último pase ${IntegraFormat.time(str(row, "lastAt"), zone)}")
                    append(" · ${int(row, "passes") ?: 0} acceso(s) hoy")
                    erp?.let { append(" · ${str(it, "nombre", "email")}") }
                },
                style = MaterialTheme.typography.labelSmall,
                color = NxColors.Muted,
            )
        }
    }
}

/**
 * Ficha de presencia. Se pinta con lo que `integra/presence/:personId` devuelve
 * y nada más: si no hay vínculo con un usuario ERP, no hay actividades ni CRM y
 * se dice, en vez de enseñar secciones vacías.
 */
@Composable
private fun PresenceDetail(
    state: IntegraOccupancyUiState,
    onBack: () -> Unit,
    onRetry: () -> Unit,
) {
    when {
        state.detailLoading -> NxLoadingBlock("Cargando ficha…")
        state.detailError != null -> NxErrorBlock(state.detailError.orEmpty(), onRetry)
        else -> {
            val d = state.detail.orEmpty()
            val erp = subMap(d, "erpUser")
            val puertas = mapList(d, "doorsToday")
            val actividades = mapList(d, "openActivities")
            val crm = subMap(d, "crm")
            LazyColumn(
                Modifier.fillMaxSize().padding(16.dp),
                verticalArrangement = Arrangement.spacedBy(8.dp),
            ) {
                item {
                    Text(
                        str(d, "personName").ifBlank { state.detailId },
                        style = MaterialTheme.typography.titleLarge,
                        color = NxColors.Slate,
                    )
                }
                item {
                    NxStatusChip(
                        if (d["onSite"] == true) "Dentro ahora" else "Sin presencia activa",
                        if (d["onSite"] == true) NxTone.Success else NxTone.Neutral,
                    )
                }
                item { IntegraDetailLine("ID ACS", state.detailId) }
                item { IntegraDetailLine("Código", str(d, "personCode")) }
                item {
                    IntegraDetailLine(
                        "Último acceso",
                        IntegraFormat.dateTime(str(d, "lastAt"), state.zone),
                    )
                }
                item { IntegraDetailLine("Última puerta", str(d, "lastDoor")) }
                item {
                    IntegraDetailLine("Verificación", verifyModeLabel(strOrNull(d, "verifyMode")))
                }
                erp?.let { u ->
                    item { IntegraDetailLine("Usuario ERP", str(u, "nombre", "email")) }
                    item { IntegraDetailLine("Puesto", str(u, "role")) }
                    item { IntegraDetailLine("Departamento", str(u, "department")) }
                }

                item {
                    NxSectionHeader(
                        title = "Pasos de hoy",
                        subtitle = "${puertas.size} evento(s) de acceso",
                    )
                }
                if (puertas.isEmpty()) {
                    item {
                        Text(
                            "Sin pasos registrados hoy.",
                            style = MaterialTheme.typography.bodySmall,
                            color = NxColors.Muted,
                        )
                    }
                } else {
                    items(puertas, key = { str(it, "id") }) { p ->
                        Card(
                            modifier = Modifier.fillMaxWidth(),
                            colors = CardDefaults.cardColors(containerColor = NxColors.Card),
                        ) {
                            Column(Modifier.padding(12.dp)) {
                                Text(
                                    str(p, "door"),
                                    fontWeight = FontWeight.SemiBold,
                                    color = NxColors.Slate,
                                )
                                Text(
                                    buildString {
                                        append(IntegraFormat.time(str(p, "at"), state.zone))
                                        val etiqueta = str(p, "label")
                                        if (etiqueta.isNotBlank()) append(" · $etiqueta")
                                        val modo = verifyModeLabel(strOrNull(p, "verifyMode"))
                                        if (modo.isNotBlank()) append(" · $modo")
                                    },
                                    style = MaterialTheme.typography.labelSmall,
                                    color = NxColors.Muted,
                                )
                            }
                        }
                    }
                }

                if (actividades.isNotEmpty()) {
                    item {
                        NxSectionHeader(
                            title = "Órdenes abiertas",
                            subtitle = "${actividades.size} en curso a su nombre",
                        )
                    }
                    items(actividades, key = { "act-" + str(it, "id") }) { a ->
                        Card(
                            modifier = Modifier.fillMaxWidth(),
                            colors = CardDefaults.cardColors(containerColor = NxColors.Card),
                        ) {
                            Column(Modifier.padding(12.dp)) {
                                Text(
                                    "${str(a, "anNumber")} · ${str(a, "titulo")}",
                                    fontWeight = FontWeight.SemiBold,
                                    color = NxColors.Slate,
                                )
                                Text(
                                    buildString {
                                        append(str(a, "estatus"))
                                        val cliente = str(a, "clientName")
                                        if (cliente.isNotBlank()) append(" · $cliente")
                                        val entrega = IntegraFormat.dateTime(
                                            str(a, "fechaEntregaEsperada"),
                                            state.zone,
                                        )
                                        if (entrega != IntegraFormat.EMPTY) append(" · entrega $entrega")
                                    },
                                    style = MaterialTheme.typography.labelSmall,
                                    color = NxColors.Muted,
                                )
                            }
                        }
                    }
                }

                crm?.let { c ->
                    val leads = mapList(c, "leads")
                    val oportunidades = mapList(c, "opportunities")
                    if (leads.isNotEmpty() || oportunidades.isNotEmpty()) {
                        item {
                            NxSectionHeader(
                                title = "CRM",
                                subtitle = "${leads.size} prospecto(s) · ${oportunidades.size} oportunidad(es)",
                            )
                        }
                        items(leads, key = { "lead-" + str(it, "id") }) { l ->
                            IntegraDetailLine(
                                str(l, "name").ifBlank { "Prospecto" },
                                "${str(l, "company")} · ${str(l, "status")}",
                            )
                        }
                        items(oportunidades, key = { "opp-" + str(it, "id") }) { o ->
                            IntegraDetailLine(
                                str(o, "title"),
                                "${str(o, "stage")} · ${str(o, "clientName")}",
                            )
                        }
                    }
                }

                item { IntegraNotice(str(d, "note").ifBlank { AVISO_SIN_SALIDA }, NxTone.Info) }
                item {
                    TextButton(onClick = onBack, modifier = Modifier.fillMaxWidth()) {
                        Text("Volver a la lista")
                    }
                }
            }
        }
    }
}
