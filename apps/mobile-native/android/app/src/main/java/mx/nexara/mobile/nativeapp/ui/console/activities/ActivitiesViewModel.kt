package mx.nexara.mobile.nativeapp.ui.console.activities

import android.app.Application
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import mx.nexara.mobile.nativeapp.data.AuthRepository
import mx.nexara.mobile.nativeapp.data.api.ActivityDto
import mx.nexara.mobile.nativeapp.data.console.ConsoleRepository
import mx.nexara.mobile.nativeapp.data.realtime.refreshOnModels

data class ActivitiesUiState(
    val isLoading: Boolean = true,
    val isRefreshing: Boolean = false,
    val teamLoading: Boolean = false,
    val error: String? = null,
    val query: String = "",
    val statusFilter: String = "Todos",
    val teamActivities: List<ActivityDto> = emptyList(),
    val myActivities: List<ActivityDto> = emptyList(),
)

class ConsoleActivitiesViewModel(app: Application) : AndroidViewModel(app) {
    private val authRepo = AuthRepository(app.applicationContext)
    private val repo = ConsoleRepository(app.applicationContext)
    private val _state = MutableStateFlow(ActivitiesUiState())
    val state: StateFlow<ActivitiesUiState> = _state

    init {
        refreshOnModels(
            models = setOf("Activity", "ActivityEvidence", "ServiceSheet"),
            refresh = { loadAll(currentUserId = authRepo.loadSession()?.id) },
        )
    }

    fun setQuery(v: String) = _state.update { it.copy(query = v) }
    fun setStatusFilter(v: String) = _state.update { it.copy(statusFilter = v) }

    fun loadAll(
        initial: Boolean = true,
        isAdmin: Boolean = false,
        isSuperAdmin: Boolean = false,
        currentUserId: Long? = null,
    ) {
        _state.update {
            it.copy(
                isLoading = initial && it.teamActivities.isEmpty() && it.myActivities.isEmpty(),
                isRefreshing = !initial,
                error = null,
            )
        }
        viewModelScope.launch {
            try {
                val team = if (isAdmin || isSuperAdmin) {
                    withContext(Dispatchers.IO) { repo.activitiesFetch(scope = null) }
                } else emptyList()
                val mine = if (!isSuperAdmin) {
                    withContext(Dispatchers.IO) {
                        val scopedMine = runCatching { repo.activitiesFetch(scope = "mine") }.getOrDefault(emptyList())
                        if (scopedMine.isNotEmpty() || currentUserId == null) {
                            scopedMine
                        } else {
                            repo.activitiesFetch(scope = null).filter { a ->
                                a.responsableId == currentUserId || a.responsable?.id == currentUserId
                            }
                        }
                    }
                } else emptyList()
                _state.update {
                    it.copy(
                        isLoading = false,
                        isRefreshing = false,
                        teamActivities = team,
                        myActivities = mine,
                        error = null,
                    )
                }
            } catch (e: Exception) {
                _state.update {
                    it.copy(
                        isLoading = false,
                        isRefreshing = false,
                        error = e.message?.takeIf { m -> m.isNotBlank() } ?: "No se pudieron cargar actividades",
                    )
                }
            }
        }
    }
}

fun activityDetailTabIndex(tabKey: String?): Int = when (tabKey?.lowercase()) {
    "info" -> 0
    "operacion" -> 1
    "evidencias" -> 2
    "viaticos" -> 3
    "equipo" -> 4
    "materiales" -> 5
    "historial" -> 6
    "incidencias" -> 7
    "aprobaciones" -> 8
    else -> 0
}
