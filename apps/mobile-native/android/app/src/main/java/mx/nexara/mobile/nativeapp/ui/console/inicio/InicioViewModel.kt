package mx.nexara.mobile.nativeapp.ui.console.inicio

import android.app.Application
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.async
import kotlinx.coroutines.coroutineScope
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import mx.nexara.mobile.nativeapp.access.CoreKeys
import mx.nexara.mobile.nativeapp.access.PlatformAccounts
import mx.nexara.mobile.nativeapp.data.AuthRepository
import mx.nexara.mobile.nativeapp.data.api.AprobacionPendienteDto
import mx.nexara.mobile.nativeapp.data.api.FestivosMioDto
import mx.nexara.mobile.nativeapp.data.api.KpisEquipoDto
import mx.nexara.mobile.nativeapp.data.api.MyActivityItemDto
import mx.nexara.mobile.nativeapp.data.api.PagoEmpleadoDto
import mx.nexara.mobile.nativeapp.data.api.RevisionPendienteDto
import mx.nexara.mobile.nativeapp.data.api.TeamBoardUserDto
import mx.nexara.mobile.nativeapp.data.api.toUserMessage
import mx.nexara.mobile.nativeapp.data.console.AprobacionesRepository
import mx.nexara.mobile.nativeapp.data.console.CoreActivitiesRepository
import mx.nexara.mobile.nativeapp.data.console.CoreExtrasRepository
import mx.nexara.mobile.nativeapp.data.console.PagosEmpleadosRepository
import mx.nexara.mobile.nativeapp.data.realtime.refreshOnModels
import mx.nexara.mobile.nativeapp.ui.console.CoreMenu

data class InicioUiState(
    val isLoading: Boolean = true,
    val isRefreshing: Boolean = false,
    val error: String? = null,
    /** El rol abre Actividades: sin esto no se pide `me/activities` ni se pinta «Ahora». */
    val tieneActividades: Boolean = false,
    /**
     * Dirección general (Christian y su equivalente): el API le niega «Mis actividades» (403
     * «no aplica a dirección general»); Inicio le muestra la pizarra del equipo en su lugar.
     */
    val esDireccion: Boolean = false,
    val open: List<MyActivityItemDto> = emptyList(),
    val hechasHoy: Int = 0,
    /** Actividad sobre la que corre «Iniciar» o «Reanudar». */
    val accionEnCurso: Long? = null,
    val accionError: String? = null,
    /** Dirección general: su tablero (`InicioCeoRules`); null mientras carga la primera vez. */
    val ceo: CeoInicio? = null,
    /** `GET festivos/mio` (`FestivoRules`); null si falló o la API aún no lo tiene. */
    val festivos: FestivosMioDto? = null,
) {
    val actual: MyActivityItemDto? get() = InicioRules.actividadActual(open)
    val siguientes: List<MyActivityItemDto> get() = InicioRules.siguientes(open, actual)
    val pendientes: Int get() = InicioRules.pendientes(open)
}

/**
 * Lo que ve dirección general en su inicio. Cada lista es null si su endpoint falló o el rol no
 * la ve: esa sección no se pinta y las demás siguen.
 */
data class CeoInicio(
    val equipo: List<TeamBoardUserDto>? = null,
    val revisiones: List<RevisionPendienteDto>? = null,
    val aprobaciones: List<AprobacionPendienteDto>? = null,
    val pagos: List<PagoEmpleadoDto>? = null,
    val kpis: KpisEquipoDto? = null,
)

/**
 * Inicio: lo de actividades. La jornada la lleva `ConsoleAttendanceViewModel`
 * (misma checada con foto, GPS y diálogo de rechazo que Asistencias). Vive en
 * el ámbito del shell para que la pestaña Actividades tenga su insignia.
 */
class InicioViewModel(app: Application) : AndroidViewModel(app) {
    private val authRepo = AuthRepository(app.applicationContext)
    private val repo = CoreActivitiesRepository(app.applicationContext)
    private val aprobacionesRepo = AprobacionesRepository(app.applicationContext)
    private val pagosRepo = PagosEmpleadosRepository(app.applicationContext)
    private val extrasRepo = CoreExtrasRepository(app.applicationContext)
    private val _state = MutableStateFlow(
        authRepo.loadSession().let { session ->
            InicioUiState(
                tieneActividades = CoreMenu.canOpen(session, CoreKeys.ACTIVITIES),
                esDireccion = PlatformAccounts.isCeoEquivalentEmail(session?.email),
            )
        },
    )
    val state: StateFlow<InicioUiState> = _state

    init {
        refreshOnModels(
            models = setOf("Activity", "ActivityEvidence", "ServiceSheet"),
            refresh = { load(initial = false, enVivo = true) },
        )
        load(initial = true)
    }

    /** [enVivo]: lo pidió un aviso en vivo (no la persona); el tablero de dirección lo espacia. */
    fun load(initial: Boolean = true, enVivo: Boolean = false) {
        cargarFestivos(enVivo)
        if (_state.value.esDireccion) {
            cargarCeo(initial, enVivo)
            return
        }
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

    /** Los festivos cambian poco: un aviso en vivo no los vuelve a pedir antes de 10 min. */
    private var festivosCargadoMs = 0L

    private fun cargarFestivos(enVivo: Boolean) {
        val ahora = System.currentTimeMillis()
        if (enVivo && ahora - festivosCargadoMs < 10 * 60_000) return
        festivosCargadoMs = ahora
        viewModelScope.launch {
            val f = withContext(Dispatchers.IO) { runCatching { repo.festivosMio() }.getOrNull() }
            // Si falla se queda lo último; la pantalla lo ignora si ya no es de hoy.
            if (f != null) _state.update { it.copy(festivos = f) }
        }
    }

    /** Última carga del tablero de dirección: los avisos en vivo no lo vuelven a pedir antes de 30 s. */
    private var ceoCargadoMs = 0L

    /** El tablero de dirección: cinco consultas a la vez, cada una por su lado. */
    private fun cargarCeo(initial: Boolean, enVivo: Boolean) {
        val ahora = System.currentTimeMillis()
        if (enVivo && _state.value.ceo != null && ahora - ceoCargadoMs < 30_000) return
        ceoCargadoMs = ahora
        _state.update { it.copy(isLoading = initial && it.ceo == null, isRefreshing = !initial) }
        viewModelScope.launch {
            val (desde, hasta) = InicioCeoRules.rangoSieteDias()
            val ceo = withContext(Dispatchers.IO) {
                coroutineScope {
                    val equipo = async { runCatching { repo.board().users.orEmpty() }.getOrNull() }
                    val revisiones = async { runCatching { repo.revisionesPendientes() }.getOrNull() }
                    val aprobaciones = async { runCatching { aprobacionesRepo.pendientes() }.getOrNull() }
                    val pagos = async { runCatching { pagosRepo.lista() }.getOrNull() }
                    val kpis = async { runCatching { extrasRepo.kpisEquipo(desde, hasta) }.getOrNull() }
                    CeoInicio(equipo.await(), revisiones.await(), aprobaciones.await(), pagos.await(), kpis.await())
                }
            }
            val nada = ceo.equipo == null && ceo.revisiones == null && ceo.aprobaciones == null && ceo.kpis == null
            _state.update {
                it.copy(
                    isLoading = false,
                    isRefreshing = false,
                    ceo = ceo,
                    error = if (nada) "No se pudo cargar el tablero de hoy" else null,
                )
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
