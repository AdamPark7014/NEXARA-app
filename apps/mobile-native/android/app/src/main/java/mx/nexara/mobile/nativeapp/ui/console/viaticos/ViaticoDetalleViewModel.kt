package mx.nexara.mobile.nativeapp.ui.console.viaticos

import android.app.Application
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import mx.nexara.mobile.nativeapp.data.api.MyActivityItemDto
import mx.nexara.mobile.nativeapp.data.api.ViaticoDto
import mx.nexara.mobile.nativeapp.data.api.toUserMessage
import mx.nexara.mobile.nativeapp.data.console.CoreActivitiesRepository
import mx.nexara.mobile.nativeapp.data.viaticos.ViaticosRepository
import mx.nexara.mobile.nativeapp.ui.common.GeoPhoto

/**
 * Un viático por dentro: importes, reparto, comprobación y —si me toca— la
 * decisión de autorizarlo, rechazarlo o marcarlo pagado.
 *
 * Lo comparten el detalle y la pantalla de reparto; cada una vive en su propia
 * entrada de navegación, así que cada una carga su copia y ninguna se queda con
 * datos viejos de la otra.
 */
data class ViaticoDetalleUiState(
    val loading: Boolean = true,
    val refreshing: Boolean = false,
    /** Aviso de un refresco fallido: lo que ya se veía sigue abajo. */
    val error: String? = null,
    val viatico: ViaticoDto? = null,
    val miUsuarioId: Long? = null,
    val administraViaticos: Boolean = false,
    /** Actividades abiertas, para repartir el gasto entre ellas. */
    val actividades: List<MyActivityItemDto> = emptyList(),
    val cargandoActividades: Boolean = false,
    val enviando: Boolean = false,
    val accionError: String? = null,
    val mensaje: String? = null,
) {
    val esMio: Boolean
        get() {
            val v = viatico ?: return false
            return v.usuarioId == null || miUsuarioId == null || v.usuarioId == miUsuarioId
        }

    /**
     * Repartir es de quien lo pidió: es quien sabe qué visitas cubrió el viaje.
     * Un viático pagado ya salió en una póliza y no se vuelve a repartir.
     */
    val puedeRepartir: Boolean
        get() {
            val v = viatico ?: return false
            return esMio && !v.estaPagado() && !v.estaRechazado()
        }

    /** Solo se comprueba contra dinero ya entregado: `Aprobado` o `Pagado`. */
    val puedeComprobar: Boolean
        get() {
            val v = viatico ?: return false
            return (v.estaAprobado() || v.estaPagado()) && (esMio || administraViaticos)
        }

    /** Nadie autoriza lo suyo: la cadena de aprobación del servidor tampoco lo permite. */
    val puedeDecidir: Boolean
        get() {
            val v = viatico ?: return false
            return administraViaticos && !esMio && v.estaPendiente()
        }

    val puedePagar: Boolean
        get() {
            val v = viatico ?: return false
            return administraViaticos && v.estaAprobado()
        }
}

class ViaticoDetalleViewModel(app: Application) : AndroidViewModel(app) {
    private val repo = ViaticosRepository(app.applicationContext)
    private val actividadesRepo = CoreActivitiesRepository(app.applicationContext)
    private val _state = MutableStateFlow(
        ViaticoDetalleUiState(
            miUsuarioId = repo.miUsuarioId(),
            administraViaticos = repo.administraViaticos(),
        ),
    )
    val state: StateFlow<ViaticoDetalleUiState> = _state

    private var viaticoId: Long = 0L

    fun cargar(id: Long, refresh: Boolean = false) {
        viaticoId = id
        _state.update { if (refresh) it.copy(refreshing = true) else it.copy(loading = true) }
        viewModelScope.launch {
            try {
                val viatico = withContext(Dispatchers.IO) { repo.detalle(id) }
                _state.update {
                    it.copy(loading = false, refreshing = false, error = null, viatico = viatico)
                }
            } catch (e: Throwable) {
                _state.update {
                    it.copy(
                        loading = false,
                        refreshing = false,
                        error = e.toUserMessage("No se pudo abrir el viático"),
                    )
                }
            }
        }
    }

    /** Las actividades solo hacen falta al repartir; se piden cuando se abre esa pantalla. */
    fun cargarActividades() {
        if (_state.value.cargandoActividades || _state.value.actividades.isNotEmpty()) return
        _state.update { it.copy(cargandoActividades = true) }
        viewModelScope.launch {
            val abiertas = withContext(Dispatchers.IO) {
                runCatching { actividadesRepo.myActivities().open.orEmpty() }.getOrDefault(emptyList())
            }
            _state.update { it.copy(cargandoActividades = false, actividades = abiertas) }
        }
    }

    fun limpiarMensaje() = _state.update { it.copy(mensaje = null) }

    fun limpiarAccionError() = _state.update { it.copy(accionError = null) }

    /**
     * Guarda el reparto. El cuadre ya se comprobó en pantalla ([RepartoViatico]),
     * pero si el servidor discrepa —porque el monto cambió mientras tanto— su
     * mensaje se enseña tal cual: dice al centavo cuánto falta o sobra.
     */
    fun guardarReparto(partes: List<ParteReparto>, onListo: () -> Unit) {
        ejecutar(
            accion = { repo.guardarReparto(viaticoId, partes) },
            exito = { encolado ->
                if (encolado) {
                    "Sin conexión: el reparto quedó en la cola y se manda al volver la señal."
                } else if (partes.isEmpty()) {
                    "Reparto deshecho"
                } else {
                    "Reparto guardado"
                }
            },
            fallback = "No se pudo guardar el reparto",
            onListo = onListo,
        )
    }

    fun comprobar(centavos: Long, nota: String?, ticket: GeoPhoto?, onListo: () -> Unit) {
        ejecutar(
            accion = { repo.comprobar(viaticoId, centavos, nota, ticket) },
            exito = { encolado ->
                if (encolado) {
                    "Sin conexión: la comprobación quedó en la cola y sale al volver la señal."
                } else {
                    "Comprobación registrada"
                }
            },
            fallback = "No se pudo comprobar el viático",
            onListo = onListo,
        )
    }

    fun aprobar(centavosAprobados: Long?, nota: String?, onListo: () -> Unit) {
        ejecutar(
            accion = {
                repo.aprobar(viaticoId, centavosAprobados, nota)
                false
            },
            exito = { "Viático autorizado" },
            fallback = "No se pudo autorizar",
            onListo = onListo,
        )
    }

    fun rechazar(nota: String?, onListo: () -> Unit) {
        ejecutar(
            accion = {
                repo.rechazar(viaticoId, nota)
                false
            },
            exito = { "Viático rechazado" },
            fallback = "No se pudo rechazar",
            onListo = onListo,
        )
    }

    fun marcarPagado(onListo: () -> Unit) {
        ejecutar(
            accion = {
                repo.marcarPagado(viaticoId)
                false
            },
            exito = { "Marcado como pagado" },
            fallback = "No se pudo marcar como pagado",
            onListo = onListo,
        )
    }

    /**
     * Una mutación: bloquea el botón, manda, recarga el detalle y avisa.
     *
     * Si falla, [onListo] no corre: la hoja sigue abierta con lo que la persona
     * escribió y el error del servidor debajo, para que corrija sin volver a
     * teclear nada.
     */
    private fun ejecutar(
        accion: suspend () -> Boolean,
        exito: (encolado: Boolean) -> String,
        fallback: String,
        onListo: () -> Unit,
    ) {
        if (_state.value.enviando || viaticoId <= 0L) return
        _state.update { it.copy(enviando = true, accionError = null) }
        viewModelScope.launch {
            try {
                val encolado = withContext(Dispatchers.IO) { accion() }
                _state.update { it.copy(enviando = false, mensaje = exito(encolado)) }
                onListo()
                cargar(viaticoId, refresh = true)
            } catch (e: Throwable) {
                _state.update { it.copy(enviando = false, accionError = e.toUserMessage(fallback)) }
            }
        }
    }
}
