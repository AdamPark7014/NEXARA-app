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
import androidx.compose.material3.OutlinedButton
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
import mx.nexara.mobile.nativeapp.ui.enterprise.NxLoadingBlock
import mx.nexara.mobile.nativeapp.ui.enterprise.NxSearchField
import mx.nexara.mobile.nativeapp.ui.enterprise.NxStatusChip
import mx.nexara.mobile.nativeapp.ui.enterprise.NxTone
import mx.nexara.mobile.nativeapp.ui.integra.common.DOOR_STATE_FILTERS
import mx.nexara.mobile.nativeapp.ui.integra.common.DoorControl
import mx.nexara.mobile.nativeapp.ui.integra.common.DoorControlDialog
import mx.nexara.mobile.nativeapp.ui.integra.common.IntegraNotice
import mx.nexara.mobile.nativeapp.ui.integra.common.IntegraOpMessage
import mx.nexara.mobile.nativeapp.ui.integra.common.IntegraShowingCount
import mx.nexara.mobile.nativeapp.ui.integra.common.IntegraSiteBar
import mx.nexara.mobile.nativeapp.ui.integra.common.IntegraSitesCache
import mx.nexara.mobile.nativeapp.ui.integra.common.bool
import mx.nexara.mobile.nativeapp.ui.integra.common.doorState
import mx.nexara.mobile.nativeapp.ui.integra.common.doorStateLabel
import mx.nexara.mobile.nativeapp.ui.integra.common.doorStateTone
import mx.nexara.mobile.nativeapp.ui.integra.common.matchesQuery
import mx.nexara.mobile.nativeapp.ui.integra.common.motivoValido
import mx.nexara.mobile.nativeapp.ui.integra.common.str
import mx.nexara.mobile.nativeapp.ui.integra.common.subMap

/** Cuántas puertas se pintan de golpe. Mismo tamaño que la web. */
private const val DOOR_PAGE = 24

data class IntegraAccessUiState(
    val loading: Boolean = true,
    val isRefreshing: Boolean = false,
    val error: String? = null,
    val message: String? = null,
    val messageIsError: Boolean = false,
    val items: List<Map<String, Any?>> = emptyList(),
    /** `mirror` = espejo sincronizado · `live` = estado consultado al ACS. */
    val source: String = "",
    val live: Boolean = false,
    val canControl: Boolean = true,
    val devices: Int = 0,
    val query: String = "",
    val stateFilter: String = "",
    val regionFilter: String = "",
    val limit: Int = DOOR_PAGE,
    /** Puerta sobre la que está abierto el diálogo de control. */
    val target: Map<String, Any?>? = null,
    val control: DoorControl = DoorControl.Abrir,
    val reason: String = "",
    val sending: Boolean = false,
    val dialogError: String? = null,
)

class IntegraAccessViewModel(app: Application) : AndroidViewModel(app) {
    private val repo = IntegraRepository(app.applicationContext)
    private val _state = MutableStateFlow(IntegraAccessUiState())
    val state: StateFlow<IntegraAccessUiState> = _state

    init { refresh() }

    fun setQuery(v: String) = _state.update { it.copy(query = v, limit = DOOR_PAGE) }
    fun setStateFilter(v: String) = _state.update {
        it.copy(stateFilter = if (it.stateFilter == v) "" else v, limit = DOOR_PAGE)
    }
    fun setRegionFilter(v: String) = _state.update {
        it.copy(regionFilter = if (it.regionFilter == v) "" else v, limit = DOOR_PAGE)
    }
    fun clearFilters() = _state.update {
        it.copy(query = "", stateFilter = "", regionFilter = "", limit = DOOR_PAGE)
    }
    fun showMore() = _state.update { it.copy(limit = it.limit + DOOR_PAGE) }

    fun setLive(v: Boolean) {
        _state.update { it.copy(live = v) }
        refresh(initial = false)
    }

    fun selectSite(siteId: Int?) {
        repo.selectSite(siteId)
        _state.update { it.copy(items = emptyList(), limit = DOOR_PAGE) }
        refresh()
    }

    // ── Diálogo de control ────────────────────────────────────────────────────

    fun openDialog(door: Map<String, Any?>) = _state.update {
        it.copy(target = door, reason = "", dialogError = null, control = DoorControl.Abrir)
    }

    /** Cerrar sólo se permite si no hay una orden en vuelo. */
    fun closeDialog() = _state.update {
        if (it.sending) it else it.copy(target = null, reason = "", dialogError = null)
    }

    fun setControl(c: DoorControl) = _state.update { it.copy(control = c, dialogError = null) }
    fun setReason(v: String) = _state.update { it.copy(reason = v, dialogError = null) }

    fun confirm() {
        val s = _state.value
        // Un segundo toque mientras la primera orden vuela no manda otra.
        if (s.sending) return
        val door = s.target ?: return
        val id = str(door, "id", "doorIndexCode", "doorId")
        if (id.isBlank()) {
            _state.update { it.copy(dialogError = "Esta puerta no trae identificador; no se puede accionar.") }
            return
        }
        if (!motivoValido(s.reason)) {
            _state.update { it.copy(dialogError = "Indica un motivo de al menos 3 caracteres.") }
            return
        }
        val control = s.control
        val nombre = str(door, "name", "doorName").ifBlank { id }
        _state.update { it.copy(sending = true, dialogError = null) }
        viewModelScope.launch {
            try {
                withContext(Dispatchers.IO) { repo.controlDoor(id, control.controlType, s.reason) }
                _state.update {
                    it.copy(
                        sending = false,
                        target = null,
                        reason = "",
                        message = "${control.label} enviada · $nombre",
                        messageIsError = false,
                    )
                }
                refresh(initial = false)
            } catch (e: Exception) {
                // La orden pudo llegar al equipo aunque la respuesta fallara: se
                // deja el diálogo abierto con el error, sin reintento automático.
                _state.update {
                    it.copy(
                        sending = false,
                        dialogError = e.toUserMessage("No se pudo enviar la orden a «$nombre»"),
                    )
                }
            }
        }
    }

    // ── Carga ─────────────────────────────────────────────────────────────────

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
            try {
                val live = _state.value.live
                val doors = withContext(Dispatchers.IO) { repo.doors(live = live) }
                // Ni las capacidades ni el inventario deben tumbar la pantalla.
                val dash = runCatching { withContext(Dispatchers.IO) { repo.dashboard() } }.getOrNull()
                val caps = dash?.let { subMap(it, "capabilities") }
                val devices = runCatching { withContext(Dispatchers.IO) { repo.devices() } }
                    .getOrDefault(emptyList())
                _state.update {
                    it.copy(
                        loading = false,
                        isRefreshing = false,
                        items = doors.items,
                        source = doors.source,
                        devices = devices.size,
                        canControl = caps?.let { c -> bool(c, "canControlDoors") } ?: true,
                    )
                }
            } catch (e: Exception) {
                _state.update {
                    it.copy(
                        loading = false,
                        isRefreshing = false,
                        error = e.toUserMessage("No se pudieron cargar las puertas"),
                    )
                }
            }
        }
    }

    // ── Derivados ─────────────────────────────────────────────────────────────

    fun regiones(): List<String> = _state.value.items
        .map { str(it, "location", "regionName") }
        .filter { it.isNotBlank() }
        .distinct()
        .sorted()

    fun filtered(): List<Map<String, Any?>> {
        val s = _state.value
        return s.items.filter { d ->
            val estado = doorState(bool(d, "online"), str(d, "status", "doorState"))
            (s.stateFilter.isEmpty() || estado == s.stateFilter) &&
                (s.regionFilter.isEmpty() || str(d, "location", "regionName") == s.regionFilter) &&
                matchesQuery(d, s.query, "name", "doorName", "location", "regionName", "id", "doorIndexCode")
        }
    }

    fun online(): Int = _state.value.items.count { bool(it, "online") != false }
}

@OptIn(ExperimentalMaterial3Api::class, ExperimentalLayoutApi::class)
@Composable
fun IntegraAccessScreen(vm: IntegraAccessViewModel = viewModel()) {
    val s by vm.state.collectAsState()
    val sites by IntegraSitesCache.sites.collectAsState()
    val sitesLoading by IntegraSitesCache.loading.collectAsState()
    val matching = vm.filtered()
    val rows = matching.take(s.limit)
    val regiones = vm.regiones()

    s.target?.let { door ->
        DoorControlDialog(
            doorName = str(door, "name", "doorName"),
            doorId = str(door, "id", "doorIndexCode"),
            doorLocation = str(door, "location", "regionName"),
            doorStateLabel = doorStateLabel(
                doorState(bool(door, "online"), str(door, "status", "doorState")),
            ),
            siteName = IntegraSitesCache.currentSiteName(),
            control = s.control,
            reason = s.reason,
            sending = s.sending,
            error = s.dialogError,
            onControlChange = vm::setControl,
            onReasonChange = vm::setReason,
            onConfirm = vm::confirm,
            onDismiss = vm::closeDialog,
        )
    }

    PullToRefreshBox(
        isRefreshing = s.isRefreshing,
        onRefresh = { vm.refresh(initial = false) },
        modifier = Modifier.fillMaxSize(),
    ) {
        when {
            s.loading -> NxLoadingBlock("Cargando puertas…")
            s.error != null && s.items.isEmpty() -> NxErrorBlock(s.error.orEmpty()) { vm.refresh() }
            else -> LazyColumn(
                contentPadding = PaddingValues(16.dp),
                verticalArrangement = Arrangement.spacedBy(8.dp),
            ) {
                item {
                    IntegraSiteBar(sites = sites, loading = sitesLoading, onSelect = vm::selectSite)
                }
                item {
                    Text(
                        buildString {
                            append("${vm.online()}/${s.items.size} puertas en línea · ${s.devices} equipos")
                            when (s.source) {
                                "live" -> append(" · estado consultado al ACS")
                                "mirror" -> append(" · espejo sincronizado")
                            }
                        },
                        style = MaterialTheme.typography.labelSmall,
                        color = NxColors.Muted,
                    )
                }
                if (!s.canControl) {
                    item {
                        IntegraNotice(
                            "Modo consulta: esta cuenta puede ver el estado, pero no abrir ni cerrar puertas.",
                            NxTone.Warning,
                        )
                    }
                }
                item { IntegraOpMessage(s.message, s.messageIsError) }
                s.error?.let { err -> item { IntegraOpMessage(err, isError = true) } }

                item {
                    NxSearchField(
                        value = s.query,
                        onValueChange = vm::setQuery,
                        placeholder = "Nombre, región o ID…",
                    )
                }
                item {
                    FlowRow(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                        FilterChip(
                            selected = s.live,
                            onClick = { vm.setLive(!s.live) },
                            label = { Text(if (s.live) "Estado live" else "Espejo") },
                        )
                        DOOR_STATE_FILTERS.forEach { st ->
                            FilterChip(
                                selected = s.stateFilter == st,
                                onClick = { vm.setStateFilter(st) },
                                label = { Text(doorStateLabel(st)) },
                            )
                        }
                    }
                }
                if (regiones.isNotEmpty()) {
                    item {
                        FlowRow(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                            regiones.forEach { r ->
                                FilterChip(
                                    selected = s.regionFilter == r,
                                    onClick = { vm.setRegionFilter(r) },
                                    label = { Text(r) },
                                )
                            }
                        }
                    }
                }

                if (rows.isEmpty()) {
                    item {
                        if (s.items.isEmpty()) {
                            NxEmptyState(
                                "Sin puertas",
                                "No hay puertas en el espejo de este sitio. Sincroniza desde la consola web.",
                            )
                        } else {
                            NxEmptyState(
                                "Ninguna coincide",
                                "Ninguna de las ${s.items.size} puertas cargadas coincide con el filtro.",
                                actionLabel = "Quitar filtros",
                                onAction = vm::clearFilters,
                            )
                        }
                    }
                } else {
                    items(rows, key = { str(it, "id", "doorIndexCode") }) { door ->
                        DoorCard(
                            door = door,
                            canControl = s.canControl,
                            onControl = { vm.openDialog(door) },
                        )
                    }
                    item {
                        IntegraShowingCount(
                            shown = rows.size,
                            matching = matching.size,
                            total = s.items.size,
                            noun = "puertas",
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
private fun DoorCard(
    door: Map<String, Any?>,
    canControl: Boolean,
    onControl: () -> Unit,
) {
    val estado = doorState(bool(door, "online"), str(door, "status", "doorState"))
    Card(
        modifier = Modifier.fillMaxWidth(),
        colors = CardDefaults.cardColors(containerColor = NxColors.Card),
    ) {
        Column(Modifier.padding(14.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
            Row(
                Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Column(Modifier.weight(1f)) {
                    Text(
                        str(door, "name", "doorName"),
                        fontWeight = FontWeight.SemiBold,
                        color = NxColors.Slate,
                    )
                    Text(
                        str(door, "location", "regionName")
                            .ifBlank { str(door, "id", "doorIndexCode") },
                        style = MaterialTheme.typography.bodySmall,
                        color = NxColors.Muted,
                    )
                }
                NxStatusChip(doorStateLabel(estado), doorStateTone(estado))
            }
            if (canControl) {
                OutlinedButton(onClick = onControl, modifier = Modifier.fillMaxWidth()) {
                    Text("Accionar…")
                }
            }
        }
    }
}
