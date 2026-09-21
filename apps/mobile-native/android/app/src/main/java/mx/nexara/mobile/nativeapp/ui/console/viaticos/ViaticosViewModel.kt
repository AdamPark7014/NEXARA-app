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
 * «Mis viáticos» y, para quien autoriza, los de su gente.
 *
 * `GET viatics` ya viene filtrado por el servidor: a quien solo pide viáticos le
 * manda los suyos; a quien los administra, además los de su departamento. La app
 * solo los separa en dos pestañas comparando contra el id de la sesión.
 *
 * Un fallo al refrescar **no borra la lista**: se guarda el aviso aparte y lo que
 * ya se veía sigue en pantalla. En la calle, media lista vieja vale más que una
 * pantalla en blanco.
 */
data class ViaticosUiState(
    val loading: Boolean = true,
    val refreshing: Boolean = false,
    /** Aviso de un refresco que falló; la lista de abajo sigue siendo la buena. */
    val error: String? = null,
    val mios: List<ViaticoDto> = emptyList(),
    val delEquipo: List<ViaticoDto> = emptyList(),
    val miUsuarioId: Long? = null,
    val puedeAutorizar: Boolean = false,
    /** Alta en curso (incluye la subida de la foto). */
    val enviando: Boolean = false,
    val accionError: String? = null,
    val mensaje: String? = null,
    /** Actividades abiertas: a cuál se carga el viático nuevo. */
    val actividades: List<MyActivityItemDto> = emptyList(),
) {
    /** Cuántos del equipo esperan una decisión: es la insignia de la pestaña. */
    val porAutorizar: Int get() = delEquipo.count { it.estaPendiente() }

    val vacio: Boolean get() = mios.isEmpty() && delEquipo.isEmpty()
}

class ViaticosViewModel(app: Application) : AndroidViewModel(app) {
    private val repo = ViaticosRepository(app.applicationContext)
    private val actividadesRepo = CoreActivitiesRepository(app.applicationContext)
    private val _state = MutableStateFlow(
        ViaticosUiState(
            miUsuarioId = repo.miUsuarioId(),
            puedeAutorizar = repo.administraViaticos(),
        ),
    )
    val state: StateFlow<ViaticosUiState> = _state

    init {
        cargar()
        cargarActividades()
    }

    fun cargar(refresh: Boolean = false) {
        _state.update {
            if (refresh) it.copy(refreshing = true) else it.copy(loading = true)
        }
        viewModelScope.launch {
            try {
                val todos = withContext(Dispatchers.IO) { repo.lista() }
                val yo = _state.value.miUsuarioId
                _state.update {
                    it.copy(
                        loading = false,
                        refreshing = false,
                        error = null,
                        mios = todos.filter { v -> yo == null || v.usuarioId == null || v.usuarioId == yo },
                        delEquipo = todos.filter { v -> yo != null && v.usuarioId != null && v.usuarioId != yo },
                    )
                }
            } catch (e: Throwable) {
                // Se conserva lo que ya estaba: el aviso va arriba, no en su lugar.
                _state.update {
                    it.copy(
                        loading = false,
                        refreshing = false,
                        error = e.toUserMessage("No se pudieron cargar tus viáticos"),
                    )
                }
            }
        }
    }

    /** Aparte: sin actividades se puede pedir igual un viático suelto. */
    private fun cargarActividades() {
        viewModelScope.launch {
            val abiertas = withContext(Dispatchers.IO) {
                runCatching { actividadesRepo.myActivities().open.orEmpty() }.getOrDefault(emptyList())
            }
            _state.update { it.copy(actividades = abiertas) }
        }
    }

    fun limpiarMensaje() = _state.update { it.copy(mensaje = null) }

    fun limpiarAccionError() = _state.update { it.copy(accionError = null) }

    /**
     * Pide un viático nuevo. [onListo] solo corre si salió (o si quedó en cola):
     * mientras falle, la hoja se queda abierta con lo que la persona tecleó.
     */
    fun pedir(
        centavos: Long,
        motivo: String,
        categoria: String,
        actividadId: Long?,
        ticket: GeoPhoto,
        onListo: () -> Unit,
    ) {
        if (_state.value.enviando) return
        _state.update { it.copy(enviando = true, accionError = null) }
        viewModelScope.launch {
            try {
                val encolado = withContext(Dispatchers.IO) {
                    repo.crear(
                        centavos = centavos,
                        motivo = motivo,
                        categoria = categoria,
                        actividadId = actividadId,
                        ticket = ticket,
                    )
                }
                _state.update {
                    it.copy(
                        enviando = false,
                        mensaje = if (encolado) {
                            "Sin conexión: tu viático quedó en la cola con su foto y sale solo al volver la señal."
                        } else {
                            "Viático solicitado"
                        },
                    )
                }
                onListo()
                cargar(refresh = true)
            } catch (e: Throwable) {
                _state.update {
                    it.copy(enviando = false, accionError = e.toUserMessage("No se pudo pedir el viático"))
                }
            }
        }
    }
}
