package mx.nexara.mobile.nativeapp.ui.console.vehiculos

import android.app.Application
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import mx.nexara.mobile.nativeapp.data.api.AsignacionActivaDto
import mx.nexara.mobile.nativeapp.data.api.MyActivityItemDto
import mx.nexara.mobile.nativeapp.data.api.SolicitudResumenDto
import mx.nexara.mobile.nativeapp.data.api.VehiculoFlotaDto
import mx.nexara.mobile.nativeapp.data.api.toUserMessage
import mx.nexara.mobile.nativeapp.data.console.CoreActivitiesRepository
import mx.nexara.mobile.nativeapp.data.vehicles.VehiclesRepository
import mx.nexara.mobile.nativeapp.ui.common.GeoPhoto

/**
 * Vehículos de Core en el teléfono: lo que traigo asignado, mis solicitudes y
 * la flota libre. Los mensajes de error del servidor (400 con la lista de lo
 * que falta, en español) se enseñan tal cual.
 */

/** Qué checklist está abierto: salida o devolución, de solicitud o de inventario. */
data class FlujoChecklist(
    /** Id de la asignación (solicitud) o del vehículo (inventario). */
    val id: Long,
    val vehiculo: String,
    val devolucion: Boolean,
    val inventario: Boolean,
    /** Devolución: el km con el que salió; el final no puede ser menor. */
    val kmInicio: Int? = null,
) {
    val titulo: String get() = if (devolucion) "Regreso" else "Salida"
}

data class VehiculosUiState(
    val loading: Boolean = true,
    val refreshing: Boolean = false,
    val error: String? = null,
    val activa: AsignacionActivaDto? = null,
    val solicitudes: List<SolicitudResumenDto> = emptyList(),
    val disponibles: List<VehiculoFlotaDto> = emptyList(),
    /** Para «Solicitar»: la actividad a la que se carga el uso del vehículo. */
    val actividades: List<MyActivityItemDto> = emptyList(),
    val flujo: FlujoChecklist? = null,
    val enviando: Boolean = false,
    /** Error dentro del checklist o del alta de solicitud (texto del servidor). */
    val accionError: String? = null,
    val mensaje: String? = null,
) {
    val vacio: Boolean
        get() = activa == null && solicitudes.isEmpty() && disponibles.isEmpty()
}

class VehiculosViewModel(app: Application) : AndroidViewModel(app) {
    private val repo = VehiclesRepository(app.applicationContext)
    private val actividadesRepo = CoreActivitiesRepository(app.applicationContext)
    private val _state = MutableStateFlow(VehiculosUiState())
    val state: StateFlow<VehiculosUiState> = _state

    init {
        load()
        cargarActividades()
    }

    fun load(refresh: Boolean = false) {
        _state.update {
            if (refresh) it.copy(refreshing = true, error = null) else it.copy(loading = true, error = null)
        }
        viewModelScope.launch {
            try {
                val data = withContext(Dispatchers.IO) { repo.misVehiculos() }
                _state.update {
                    it.copy(
                        loading = false,
                        refreshing = false,
                        error = null,
                        activa = data.activa,
                        solicitudes = data.solicitudes.orEmpty(),
                        disponibles = data.disponibles.orEmpty(),
                    )
                }
            } catch (e: Throwable) {
                _state.update {
                    it.copy(loading = false, refreshing = false, error = e.toUserMessage("No se pudo cargar Vehículos"))
                }
            }
        }
    }

    /** Se pide aparte: sin actividades se puede seguir viendo lo asignado. */
    private fun cargarActividades() {
        viewModelScope.launch {
            val abiertas = withContext(Dispatchers.IO) {
                runCatching { actividadesRepo.myActivities().open.orEmpty() }.getOrDefault(emptyList())
            }
            _state.update { it.copy(actividades = abiertas) }
        }
    }

    fun abrirChecklist(flujo: FlujoChecklist) = _state.update { it.copy(flujo = flujo, accionError = null) }

    fun cerrarChecklist() = _state.update { it.copy(flujo = null, accionError = null) }

    fun limpiarMensaje() = _state.update { it.copy(mensaje = null) }

    fun limpiarAccionError() = _state.update { it.copy(accionError = null) }

    fun solicitar(
        actividadId: Long,
        vehicleId: Long,
        motivoUso: String,
        fechaInicio: String,
        fechaFin: String,
        onListo: () -> Unit,
    ) {
        if (_state.value.enviando) return
        _state.update { it.copy(enviando = true, accionError = null) }
        viewModelScope.launch {
            try {
                withContext(Dispatchers.IO) {
                    repo.solicitar(actividadId, vehicleId, motivoUso, fechaInicio, fechaFin)
                }
                _state.update { it.copy(enviando = false, mensaje = "Solicitud enviada") }
                onListo()
                load(refresh = true)
            } catch (e: Throwable) {
                // 400 del servidor: lista en español de lo que falta. Se enseña igual.
                _state.update { it.copy(enviando = false, accionError = e.toUserMessage("No se pudo solicitar")) }
            }
        }
    }

    /** Manda el checklist al endpoint que toca según [FlujoChecklist]. */
    fun enviarChecklist(
        fotos: Map<String, GeoPhoto>,
        odometroKm: Int,
        combustible: String,
    ) {
        val flujo = _state.value.flujo ?: return
        if (_state.value.enviando) return
        _state.update { it.copy(enviando = true, accionError = null) }
        viewModelScope.launch {
            try {
                val checklist = repo.checklist(fotos, odometroKm, combustible)
                withContext(Dispatchers.IO) {
                    when {
                        flujo.inventario && flujo.devolucion -> repo.devolucionInventario(flujo.id, checklist)
                        flujo.inventario -> repo.salidaInventario(flujo.id, checklist)
                        flujo.devolucion -> repo.devolucion(flujo.id, checklist)
                        else -> repo.salida(flujo.id, checklist)
                    }
                }
                _state.update {
                    it.copy(
                        enviando = false,
                        flujo = null,
                        mensaje = if (flujo.devolucion) "Regreso registrado" else "Salida registrada",
                    )
                }
                load(refresh = true)
            } catch (e: Throwable) {
                _state.update {
                    it.copy(enviando = false, accionError = e.toUserMessage("No se pudo enviar el checklist"))
                }
            }
        }
    }
}
