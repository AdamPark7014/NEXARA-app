package mx.nexara.mobile.nativeapp.ui.console.pagos

import android.app.Application
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import kotlinx.coroutines.Dispatchers
import mx.nexara.mobile.nativeapp.data.api.PagoEmpleadoDto
import mx.nexara.mobile.nativeapp.data.api.toUserMessage
import mx.nexara.mobile.nativeapp.data.console.ConsoleRepository
import mx.nexara.mobile.nativeapp.data.console.PagosEmpleadosRepository
import mx.nexara.mobile.nativeapp.ui.common.GeoPhoto
import mx.nexara.mobile.nativeapp.ui.console.more.CargaUiState
import mx.nexara.mobile.nativeapp.ui.console.viaticos.Dinero

/** Registrar o marcar pagado. Mientras falle, el diálogo se queda abierto con el mensaje del servidor. */
data class PagoAccionUiState(
    val enviando: Boolean = false,
    val error: String? = null,
    val aviso: String? = null,
)

/**
 * La lista de pagos a empleados.
 *
 * Reutiliza [CargaUiState] —el estado de las pantallas de consulta de «Más»—
 * porque la regla que ordena todo es la misma: **un fallo al refrescar no borra
 * lo que ya se veía**. La primera carga fallida va a `error` (no hay nada que
 * enseñar); un refresco fallido deja los datos viejos en pantalla y avisa en una
 * cinta. Vaciar una lista de nómina porque se cayó la red un segundo es peor que
 * leer un dato de hace dos minutos, sobre todo si alguien la está enseñando.
 *
 * El filtro y la búsqueda no vuelven a pedir nada al servidor: la lista llega
 * entera —ya acotada por el API a la empresa y al alcance del rol— y
 * [PagosRules] la filtra en memoria.
 */
class PagosViewModel(app: Application) : AndroidViewModel(app) {
    private val repo = PagosEmpleadosRepository(app.applicationContext)
    private val usuarios = ConsoleRepository(app.applicationContext)

    private val _state = MutableStateFlow(CargaUiState<List<PagoEmpleadoDto>>())
    val state: StateFlow<CargaUiState<List<PagoEmpleadoDto>>> = _state

    private val _filtro = MutableStateFlow(PagosRules.Filtro.TODOS)
    val filtro: StateFlow<PagosRules.Filtro> = _filtro

    private val _consulta = MutableStateFlow("")
    val consulta: StateFlow<String> = _consulta

    private val _accion = MutableStateFlow(PagoAccionUiState())
    val accion: StateFlow<PagoAccionUiState> = _accion

    /** A quién se le puede pagar: id y nombre, en orden alfabético. */
    private val _personas = MutableStateFlow<List<Pair<Long, String>>>(emptyList())
    val personas: StateFlow<List<Pair<Long, String>>> = _personas

    private var arrancado = false

    /**
     * La primera carga la dispara la pantalla, y solo una vez: girar el teléfono
     * no vuelve a pedirlo todo.
     */
    fun arrancar() {
        if (arrancado) return
        arrancado = true
        lanzar(refresco = false)
    }

    fun refrescar() = lanzar(refresco = true)

    fun reintentar() = lanzar(refresco = _state.value.hayDatos)

    fun descartarAviso() = _state.update { it.copy(avisoRefresco = null) }

    fun cambiarFiltro(nuevo: PagosRules.Filtro) { _filtro.value = nuevo }

    /** Tocar la celda ya marcada de la tira de cifras vuelve a «Todos». */
    fun alternarFiltro(nuevo: PagosRules.Filtro) {
        _filtro.value = if (_filtro.value == nuevo) PagosRules.Filtro.TODOS else nuevo
    }

    fun buscar(texto: String) { _consulta.value = texto }

    fun limpiarAccion() = _accion.update { it.copy(error = null, aviso = null) }

    /** Se pide al abrir el alta: quien solo consulta los pagos no la necesita. */
    fun cargarPersonas() {
        if (_personas.value.isNotEmpty()) return
        viewModelScope.launch {
            try {
                val lista = withContext(Dispatchers.IO) { usuarios.usersFetch() }
                _personas.value = lista.map { it.id to it.nombre }.sortedBy { it.second }
            } catch (e: Throwable) {
                _accion.update { it.copy(error = e.toUserMessage("No se pudo cargar al personal")) }
            }
        }
    }

    fun registrar(
        personaId: Long,
        importe: String,
        concepto: String,
        desde: String,
        hasta: String,
        nota: String,
        comprobante: GeoPhoto?,
        onListo: () -> Unit,
    ) {
        val centavos = Dinero.parsearCentavos(importe)
        if (centavos == null || centavos <= 0L) {
            _accion.value = PagoAccionUiState(error = "Ese importe no se entiende")
            return
        }
        ejecutar(
            hecho = PagosRules.AVISO_PAGO_REGISTRADO,
            fallo = "No se pudo registrar el pago",
            onListo = onListo,
        ) { repo.registrar(personaId, centavos, concepto, desde, hasta, nota, comprobante) }
    }

    fun marcarPagado(pago: PagoEmpleadoDto, onListo: () -> Unit) {
        val id = pago.id ?: return
        ejecutar(
            hecho = PagosRules.avisoPagoMarcado(pago),
            fallo = "No se pudo marcar el pago como pagado",
            onListo = onListo,
        ) { repo.marcarPagado(id) }
    }

    /**
     * Nada optimista: mueve dinero. La lista se relee hasta que el servidor confirmó, y si contesta
     * error se enseña su mensaje y no se cierra nada.
     */
    private fun ejecutar(hecho: String, fallo: String, onListo: () -> Unit, bloque: suspend () -> Unit) {
        if (_accion.value.enviando) return
        _accion.value = PagoAccionUiState(enviando = true)
        viewModelScope.launch {
            try {
                bloque()
                _accion.value = PagoAccionUiState(aviso = hecho)
                onListo()
                lanzar(refresco = true)
            } catch (e: Throwable) {
                _accion.value = PagoAccionUiState(error = e.toUserMessage(fallo))
            }
        }
    }

    private fun lanzar(refresco: Boolean) {
        _state.update {
            if (refresco) it.copy(refrescando = true, avisoRefresco = null)
            else it.copy(cargando = true, error = null, avisoRefresco = null)
        }
        viewModelScope.launch {
            try {
                val datos = repo.lista()
                _state.update {
                    it.copy(
                        cargando = false,
                        refrescando = false,
                        datos = datos,
                        error = null,
                        avisoRefresco = null,
                    )
                }
            } catch (e: Throwable) {
                // Un 403 aquí es una respuesta legítima: `CONTABILIDAD_VIEW` lo
                // decide el servidor, y su mensaje se enseña tal cual.
                val mensaje = e.toUserMessage("No se pudieron cargar los pagos a empleados")
                _state.update {
                    if (it.hayDatos) {
                        it.copy(cargando = false, refrescando = false, avisoRefresco = mensaje)
                    } else {
                        it.copy(cargando = false, refrescando = false, error = mensaje)
                    }
                }
            }
        }
    }
}
