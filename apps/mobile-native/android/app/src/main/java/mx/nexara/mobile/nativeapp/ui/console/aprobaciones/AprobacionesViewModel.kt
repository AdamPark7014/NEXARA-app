package mx.nexara.mobile.nativeapp.ui.console.aprobaciones

import android.app.Application
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import mx.nexara.mobile.nativeapp.data.api.AprobarLoteRequest
import mx.nexara.mobile.nativeapp.data.api.toUserMessage
import mx.nexara.mobile.nativeapp.data.console.CoreActivitiesRepository
import mx.nexara.mobile.nativeapp.data.console.GastosRepository
import mx.nexara.mobile.nativeapp.data.viaticos.ViaticosRepository
import mx.nexara.mobile.nativeapp.ui.console.gastos.GastosRules
import mx.nexara.mobile.nativeapp.data.console.AprobacionesRepository

/**
 * El estado de la bandeja.
 *
 * `cargando`, `error` y «no hay filas» los resuelve `nxEstadoPantalla` al
 * pintar, así que por construcción no pueden coincidir. Lo demás son avisos
 * **sobre lo que ya se ve**, no estados de pantalla: la cinta de «esto es de
 * hace un momento» y el resultado de la última decisión.
 */
data class AprobacionesUiState(
    val cargando: Boolean = true,
    val refrescando: Boolean = false,
    /** Primera carga fallida: no hay nada que enseñar. */
    val error: String? = null,
    val filas: List<AprobacionesRules.Pendiente> = emptyList(),
    /** Refresco fallido con la bandeja vieja todavía en pantalla. */
    val avisoRefresco: String? = null,
    /** La aprobación cuya decisión va en camino. Bloquea los botones de todas. */
    val decidiendo: Long? = null,
    /** El servidor NO aceptó la decisión, y dice por qué. */
    val errorDecision: String? = null,
    /** El servidor confirmó, y dice exactamente qué hizo. */
    val avisoDecision: String? = null,
    /** Evidencias en espera: lo que más le llega a dirección y a los encargados. */
    val evidencias: BandejaRules.Evidencias = BandejaRules.Evidencias(),
    /** Viáticos del equipo por autorizar; abren su pantalla. */
    val viaticos: Int = 0,
    /** Gastos por autorizar; abren su pantalla. */
    val gastos: Int = 0,
    /** Va en camino un lote. Bloquea también las decisiones sueltas. */
    val aprobandoLote: Boolean = false,
)

/**
 * Aprobaciones: cargar la bandeja y decidir.
 *
 * Dos reglas gobiernan este ViewModel, y las dos salen del mismo sitio —que
 * aquí se firma de verdad:
 *
 * 1. **Una decisión a la vez.** Mientras una viaja, los botones de toda la
 *    lista quedan bloqueados. Con dos en vuelo, la recarga de la primera
 *    reordena la lista bajo el dedo que iba a pulsar la segunda.
 * 2. **La fila sale cuando el servidor confirma, no cuando se pulsa.** Un
 *    borrado optimista aquí es peligroso: si otro director con el mismo rol ya
 *    decidió ese paso, el servidor contesta 400 y la aprobación sigue viva —
 *    pero habría desaparecido de la pantalla, y quien la pulsó se quedaría
 *    creyendo que firmó algo que no firmó.
 *
 * Y pase lo que pase, éxito o rechazo, se recarga contra el servidor: si algo
 * cambió mientras tanto, la lista no se queda mintiendo.
 */
class AprobacionesViewModel(app: Application) : AndroidViewModel(app) {

    private val repo = AprobacionesRepository(app.applicationContext)
    private val actividades = CoreActivitiesRepository(app.applicationContext)
    private val viaticosRepo = ViaticosRepository(app.applicationContext)
    private val gastosRepo = GastosRepository(app.applicationContext)

    private val _state = MutableStateFlow(AprobacionesUiState())
    val state: StateFlow<AprobacionesUiState> = _state

    private val _filtro = MutableStateFlow(AprobacionesRules.Filtro.TODAS)
    val filtro: StateFlow<AprobacionesRules.Filtro> = _filtro

    private var arrancado = false

    /** La primera carga la dispara la pantalla, y solo una vez. */
    fun arrancar() {
        if (arrancado) return
        arrancado = true
        cargar(refresco = false)
    }

    fun refrescar() = cargar(refresco = true)

    fun reintentar() = cargar(refresco = _state.value.filas.isNotEmpty())

    fun descartarAvisoRefresco() = _state.update { it.copy(avisoRefresco = null) }

    fun descartarAvisoDecision() =
        _state.update { it.copy(avisoDecision = null, errorDecision = null) }

    /**
     * Alterna el filtro: volver a tocar la celda que ya filtra la quita. Con
     * una sola mano, deshacer un filtro tiene que costar lo mismo que ponerlo.
     */
    fun alternarFiltro(opcion: AprobacionesRules.Filtro) {
        _filtro.value = if (_filtro.value == opcion) AprobacionesRules.Filtro.TODAS else opcion
    }

    fun aprobar(aprobacionId: Long) = decidir(aprobacionId, aprobar = true, motivo = null)

    fun rechazar(aprobacionId: Long, motivo: String) =
        decidir(aprobacionId, aprobar = false, motivo = motivo)

    private fun cargar(refresco: Boolean) {
        _state.update {
            if (refresco) it.copy(refrescando = true, avisoRefresco = null)
            else it.copy(cargando = true, error = null, avisoRefresco = null)
        }
        viewModelScope.launch {
            try {
                // A varios mandos el flujo de firmas les contesta 403 y aun así tienen evidencias que
                // revisar: la bandeja solo falla si no se pudo leer ninguna de las dos.
                val revisiones = runCatching { actividades.revisionesPendientes() }
                val firmas = runCatching { repo.pendientes() }
                revisiones.exceptionOrNull()?.takeIf { firmas.isFailure }?.let { throw firmas.exceptionOrNull() ?: it }
                val viaticos = contar(viaticosRepo.administraViaticos()) {
                    val yo = viaticosRepo.miUsuarioId()
                    viaticosRepo.lista().count { v -> yo != null && v.usuarioId != null && v.usuarioId != yo && v.estaPendiente() }
                }
                val gastos = contar(gastosRepo.administraGastos()) {
                    gastosRepo.lista().count(GastosRules::puedeAutorizar)
                }
                _state.update {
                    it.copy(
                        cargando = false,
                        refrescando = false,
                        filas = AprobacionesRules.ordenadas(firmas.getOrNull().orEmpty()),
                        evidencias = BandejaRules.separar(revisiones.getOrNull().orEmpty()),
                        viaticos = viaticos,
                        gastos = gastos,
                        error = null,
                        avisoRefresco = null,
                    )
                }
            } catch (e: Throwable) {
                // El mensaje del servidor ya viene rescatado del cuerpo por
                // `toUserMessage`: un 403 del guard RBAC dice qué permiso falta.
                val mensaje = e.toUserMessage("No se pudieron cargar las aprobaciones")
                _state.update {
                    if (BandejaRules.hayAlgo(it.filas.size, it.evidencias, it.viaticos, it.gastos)) {
                        it.copy(cargando = false, refrescando = false, avisoRefresco = mensaje)
                    } else {
                        it.copy(cargando = false, refrescando = false, error = mensaje)
                    }
                }
            }
        }
    }

    /** Lo de otras pantallas es un extra: si falla, esa fila no sale y la bandeja sigue. */
    private suspend fun contar(aplica: Boolean, cuenta: suspend () -> Int): Int =
        if (aplica) runCatching { cuenta() }.getOrDefault(0) else 0

    /** Aprueba lo que te toca de un jalón; lo que no pasó se queda en la lista, con su motivo por separado. */
    fun aprobarLote(estrellas: Int, nota: String) {
        val estado = _state.value
        if (estado.aprobandoLote || estado.decidiendo != null) return
        val items = BandejaRules.loteDe(estado.evidencias)
        if (items.isEmpty() || !BandejaRules.calificacionValida(estrellas) || !BandejaRules.notaValida(nota)) return
        _state.update { it.copy(aprobandoLote = true, errorDecision = null, avisoDecision = null) }
        viewModelScope.launch {
            try {
                val r = actividades.aprobarRevisionesLote(AprobarLoteRequest(items, estrellas, nota.trim()))
                _state.update {
                    it.copy(
                        aprobandoLote = false,
                        avisoDecision = BandejaRules.mensajeLote(r.aprobadas.orEmpty().size, r.fallidas.orEmpty().size),
                    )
                }
            } catch (e: Throwable) {
                _state.update {
                    it.copy(aprobandoLote = false, errorDecision = e.toUserMessage("No se pudieron aprobar"))
                }
            }
            cargar(refresco = true)
        }
    }

    private fun decidir(aprobacionId: Long, aprobar: Boolean, motivo: String?) {
        if (_state.value.decidiendo != null) return
        if (!aprobar && !AprobacionesRules.motivoValido(motivo)) {
            _state.update { it.copy(errorDecision = "Escribe el motivo del rechazo.") }
            return
        }
        _state.update {
            it.copy(decidiendo = aprobacionId, errorDecision = null, avisoDecision = null)
        }

        viewModelScope.launch {
            try {
                val respuesta = repo.decidir(aprobacionId, aprobar, motivo)
                _state.update {
                    it.copy(
                        decidiendo = null,
                        // Ahora sí: el servidor confirmó, la fila puede irse.
                        // Se quita aquí además de recargar para que el hueco
                        // desaparezca de inmediato y no parpadee la lista.
                        filas = it.filas.filterNot { fila -> fila.aprobacionId == aprobacionId },
                        avisoDecision = AprobacionesRules.mensajeDeDecision(aprobar, respuesta),
                    )
                }
            } catch (e: Throwable) {
                _state.update {
                    it.copy(
                        decidiendo = null,
                        errorDecision = e.toUserMessage("No se pudo registrar la decisión"),
                    )
                }
            }
            // Falle o no, la bandeja vuelve a pedirse: si otro decidió mientras
            // tanto, esa fila tiene que desaparecer aunque tu decisión fallara.
            cargar(refresco = true)
        }
    }
}
