package mx.nexara.mobile.nativeapp.ui.integra.map

import android.app.Application
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import mx.nexara.mobile.nativeapp.data.api.toUserMessage
import mx.nexara.mobile.nativeapp.data.integra.IntegraRepository
import mx.nexara.mobile.nativeapp.data.integra.map.Floorplan
import mx.nexara.mobile.nativeapp.data.integra.map.IntegraMapRepository
import mx.nexara.mobile.nativeapp.data.integra.map.IntegraPanoramaRepository
import mx.nexara.mobile.nativeapp.data.integra.map.MapPin
import mx.nexara.mobile.nativeapp.data.integra.map.MapSnapshot
import mx.nexara.mobile.nativeapp.data.integra.map.PanoramaSnapshot
import mx.nexara.mobile.nativeapp.data.integra.map.PinCard
import mx.nexara.mobile.nativeapp.data.integra.map.PinKind
import mx.nexara.mobile.nativeapp.ui.integra.common.IntegraSitesCache

/**
 * ViewModels del PLANO y del PANORAMA.
 *
 * Todo el trabajo de red y de parseo va en `withContext(Dispatchers.IO)` dentro
 * de `viewModelScope`; ni `GlobalScope` ni llamadas bloqueantes en el hilo
 * principal. El estado sale como `StateFlow` inmutable, igual que en el resto de
 * INTEGRA.
 */

// ── Plano ────────────────────────────────────────────────────────────────────

/** Filtro de la vista. Un plano con 80 pines es ilegible sin él. */
enum class MapFilter(val label: String) {
    ALL("Todo"),
    DOORS("Puertas"),
    CAMERAS("Cámaras"),
    PROBLEMS("Con problema"),
}

data class MapUiState(
    val loading: Boolean = true,
    val refreshing: Boolean = false,
    val error: String? = null,
    val snapshot: MapSnapshot = MapSnapshot.EMPTY,
    val activePlanId: Int? = null,
    val filter: MapFilter = MapFilter.ALL,
    /** Pin cuya ficha está abierta. Tocar un pin **abre**; nunca borra. */
    val selectedPinId: Int? = null,
) {
    val plans: List<Floorplan> get() = snapshot.floorplans

    val activePlan: Floorplan?
        get() = plans.firstOrNull { it.id == activePlanId } ?: plans.firstOrNull()

    /** Todos los pines del plano activo, ya casados con su equipo. */
    val cards: List<PinCard>
        get() = activePlan?.let { snapshot.cards(it) }.orEmpty()

    /** Los que se dibujan, según el filtro. */
    val visibleCards: List<PinCard>
        get() = cards.filter { card ->
            when (filter) {
                MapFilter.ALL -> true
                MapFilter.DOORS -> card.pin.kind == PinKind.DOOR
                MapFilter.CAMERAS -> card.pin.kind == PinKind.CAMERA
                MapFilter.PROBLEMS -> card.orphan || card.entity?.online == false
            }
        }

    val selected: PinCard?
        get() = cards.firstOrNull { it.pin.id == selectedPinId }

    /** Cuántos pines esconde el filtro, para poder decirlo en vez de callarlo. */
    val hiddenByFilter: Int get() = (cards.size - visibleCards.size).coerceAtLeast(0)
}

class IntegraMapViewModel(app: Application) : AndroidViewModel(app) {

    private val repo = IntegraMapRepository(app.applicationContext)
    private val integraRepo = IntegraRepository(app.applicationContext)

    private val _state = MutableStateFlow(MapUiState())
    val state: StateFlow<MapUiState> = _state.asStateFlow()

    init {
        load(initial = true)
    }

    fun load(initial: Boolean = false) {
        _state.update {
            it.copy(
                loading = initial && it.snapshot.floorplans.isEmpty(),
                refreshing = !initial,
                error = null,
            )
        }
        viewModelScope.launch {
            try {
                val snapshot = withContext(Dispatchers.IO) {
                    IntegraSitesCache.ensure(integraRepo)
                    repo.snapshot()
                }
                _state.update { s ->
                    // Si el plano activo desapareció (cambio de sitio), se cae al
                    // primero en vez de dejar la pantalla mirando a un id muerto.
                    val stillThere = snapshot.floorplans.any { it.id == s.activePlanId }
                    s.copy(
                        loading = false,
                        refreshing = false,
                        error = null,
                        snapshot = snapshot,
                        activePlanId = if (stillThere) s.activePlanId else snapshot.floorplans.firstOrNull()?.id,
                        selectedPinId = if (stillThere) s.selectedPinId else null,
                    )
                }
            } catch (e: Exception) {
                _state.update {
                    it.copy(
                        loading = false,
                        refreshing = false,
                        error = e.toUserMessage("No se pudo cargar el plano del sitio"),
                    )
                }
            }
        }
    }

    fun selectSite(siteId: Int?) {
        integraRepo.selectSite(siteId)
        _state.update {
            it.copy(snapshot = MapSnapshot.EMPTY, activePlanId = null, selectedPinId = null)
        }
        load(initial = true)
    }

    fun selectPlan(planId: Int) {
        _state.update { it.copy(activePlanId = planId, selectedPinId = null) }
    }

    fun setFilter(filter: MapFilter) {
        // Al cambiar de filtro se cierra la ficha: dejarla abierta sobre un pin
        // que ya no se dibuja es una ficha huérfana en pantalla.
        _state.update { it.copy(filter = filter, selectedPinId = null) }
    }

    /** Tocar un pin abre su ficha; tocarlo otra vez la cierra. Nada más. */
    fun togglePin(pin: MapPin) {
        _state.update { it.copy(selectedPinId = if (it.selectedPinId == pin.id) null else pin.id) }
    }

    fun closePin() = _state.update { it.copy(selectedPinId = null) }
}

// ── Panorama ─────────────────────────────────────────────────────────────────

data class PanoramaUiState(
    val loading: Boolean = true,
    val refreshing: Boolean = false,
    val error: String? = null,
    val snapshot: PanoramaSnapshot? = null,
)

class IntegraPanoramaViewModel(app: Application) : AndroidViewModel(app) {

    private val repo = IntegraPanoramaRepository(app.applicationContext)
    private val integraRepo = IntegraRepository(app.applicationContext)

    private val _state = MutableStateFlow(PanoramaUiState())
    val state: StateFlow<PanoramaUiState> = _state.asStateFlow()

    init {
        load(initial = true)
    }

    fun load(initial: Boolean = false) {
        _state.update {
            it.copy(loading = initial && it.snapshot == null, refreshing = !initial, error = null)
        }
        viewModelScope.launch {
            try {
                val snapshot = withContext(Dispatchers.IO) {
                    IntegraSitesCache.ensure(integraRepo)
                    repo.snapshot()
                }
                _state.value = PanoramaUiState(
                    loading = false,
                    refreshing = false,
                    error = null,
                    snapshot = snapshot,
                )
            } catch (e: Exception) {
                _state.update {
                    it.copy(
                        loading = false,
                        refreshing = false,
                        error = e.toUserMessage("No se pudo leer el estado del sitio"),
                    )
                }
            }
        }
    }

    fun selectSite(siteId: Int?) {
        integraRepo.selectSite(siteId)
        _state.value = PanoramaUiState()
        load(initial = true)
    }
}
