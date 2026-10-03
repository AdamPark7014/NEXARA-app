package mx.nexara.mobile.nativeapp.ui.console.inicio

import android.app.Application
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import mx.nexara.mobile.nativeapp.access.CoreKeys
import mx.nexara.mobile.nativeapp.data.AuthRepository
import mx.nexara.mobile.nativeapp.data.api.MyActivityItemDto
import mx.nexara.mobile.nativeapp.data.api.toUserMessage
import mx.nexara.mobile.nativeapp.data.console.CoreActivitiesRepository
import mx.nexara.mobile.nativeapp.data.realtime.refreshOnModels
import mx.nexara.mobile.nativeapp.ui.console.CoreMenu

data class InicioUiState(
    val isLoading: Boolean = true,
    val isRefreshing: Boolean = false,
    val error: String? = null,
    /** El rol abre Actividades: sin esto no se pide `me/activities` ni se pinta «Ahora». */
    val tieneActividades: Boolean = false,
    val open: List<MyActivityItemDto> = emptyList(),
    val hechasHoy: Int = 0,
    /** Actividad sobre la que corre «Iniciar» o «Reanudar». */
    val accionEnCurso: Long? = null,
    val accionError: String? = null,
) {
    val actual: MyActivityItemDto? get() = InicioRules.actividadActual(open)
    val siguientes: List<MyActivityItemDto> get() = InicioRules.siguientes(open, actual)
    val pendientes: Int get() = InicioRules.pendientes(open)
}

/**
 * Inicio: lo de actividades. La jornada la lleva `ConsoleAttendanceViewModel`
 * (misma checada con foto, GPS y diálogo de rechazo que Asistencias). Vive en
 * el ámbito del shell para que la pestaña Actividades tenga su insignia.
 */
class InicioViewModel(app: Application) : AndroidViewModel(app) {
    private val authRepo = AuthRepository(app.applicationContext)
    private val repo = CoreActivitiesRepository(app.applicationContext)
    private val _state = MutableStateFlow(
        InicioUiState(tieneActividades = CoreMenu.canOpen(authRepo.loadSession(), CoreKeys.ACTIVITIES)),
    )
    val state: StateFlow<InicioUiState> = _state

    init {
        refreshOnModels(
            models = setOf("Activity", "ActivityEvidence", "ServiceSheet"),
            refresh = { load(initial = false) },
        )
        load(initial = true)
    }

    fun load(initial: Boolean = true) {
        if (!_state.value.tieneActividades) {
            _state.update { it.copy(isLoading = false, isRefreshing = false) }
            return
        }
        _state.update {
            it.copy(
                isLoading = initial && it.open.isEmpty() && it.hechasHoy == 0,
                isRefreshing = !initial,
            )
        }
        viewModelScope.launch {
            try {
                val data = withContext(Dispatchers.IO) { repo.myActivities() }
                _state.update {
                    it.copy(
                        isLoading = false,
                        isRefreshing = false,
                        error = null,
                        open = data.open.orEmpty(),
                        hechasHoy = data.doneToday.orEmpty().size,
                    )
                }
            } catch (e: CancellationException) {
                throw e
            } catch (e: Exception) {
                _state.update {
                    it.copy(
                        isLoading = false,
                        isRefreshing = false,
                        error = e.toUserMessage("No se pudieron cargar tus actividades"),
                    )
                }
            }
        }
    }

    fun clearAccionError() = _state.update { it.copy(accionError = null) }

    /** «Iniciar»: guarda la hora real de inicio y avisa; lo siguiente es la foto de entrada. */
    fun iniciar(activityId: Long, onDone: () -> Unit) {
        accion(activityId, "No se pudo iniciar la actividad", onDone) { repo.iniciarActividad(activityId) }
    }

    /** «Reanudar»: el reloj vuelve a correr en esa actividad. */
    fun reanudar(activityId: Long, onDone: () -> Unit) {
        accion(activityId, "No se pudo reanudar la actividad", onDone) { repo.reanudarActividad(activityId) }
    }

    private fun accion(
        activityId: Long,
        fallback: String,
        onDone: () -> Unit,
        llamada: suspend () -> Unit,
    ) {
        if (_state.value.accionEnCurso != null) return
        _state.update { it.copy(accionEnCurso = activityId, accionError = null) }
        viewModelScope.launch {
            try {
                withContext(Dispatchers.IO) { llamada() }
                _state.update { it.copy(accionEnCurso = null) }
                load(initial = false)
                onDone()
            } catch (e: CancellationException) {
                throw e
            } catch (e: Exception) {
                _state.update { it.copy(accionEnCurso = null, accionError = e.toUserMessage(fallback)) }
            }
        }
    }
}
