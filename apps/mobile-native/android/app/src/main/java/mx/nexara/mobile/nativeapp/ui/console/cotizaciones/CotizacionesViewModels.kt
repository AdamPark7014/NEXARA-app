package mx.nexara.mobile.nativeapp.ui.console.cotizaciones

import android.app.Application
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import mx.nexara.mobile.nativeapp.data.api.CotizacionDetalleDto
import mx.nexara.mobile.nativeapp.data.api.CotizacionResumenDto
import mx.nexara.mobile.nativeapp.data.api.toUserMessage
import mx.nexara.mobile.nativeapp.data.console.CotizacionesRepository
import mx.nexara.mobile.nativeapp.ui.console.more.CargaUiState
import mx.nexara.mobile.nativeapp.ui.util.openFile
import mx.nexara.mobile.nativeapp.ui.util.savePdfToCache

/**
 * La lista de cotizaciones.
 *
 * Reutiliza [CargaUiState] —el estado de las pantallas de consulta de «Más»—
 * porque la regla que ordena todo es la misma: **un fallo al refrescar no borra
 * lo que ya se veía**. La primera carga fallida va a `error` (no hay nada que
 * enseñar); un refresco fallido deja los datos viejos en pantalla y avisa en una
 * cinta. En campo, leer un dato de hace dos minutos es mucho mejor que quedarse
 * con la pantalla en blanco.
 *
 * El filtro y la búsqueda no vuelven a pedir nada al servidor: la lista de Core
 * llega entera y `CotizacionesRules` la filtra en memoria.
 */
class CotizacionesViewModel(app: Application) : AndroidViewModel(app) {
    private val repo = CotizacionesRepository(app.applicationContext)

    private val _state = MutableStateFlow(CargaUiState<List<CotizacionResumenDto>>())
    val state: StateFlow<CargaUiState<List<CotizacionResumenDto>>> = _state

    private val _filtro = MutableStateFlow(CotizacionesRules.Filtro.TODAS)
    val filtro: StateFlow<CotizacionesRules.Filtro> = _filtro

    private val _consulta = MutableStateFlow("")
    val consulta: StateFlow<String> = _consulta

    private var arrancado = false

    /**
     * La primera carga la dispara la pantalla, y solo una vez: girar el
     * teléfono no vuelve a pedirlo todo.
     */
    fun arrancar() {
        if (arrancado) return
        arrancado = true
        lanzar(refresco = false)
    }

    fun refrescar() = lanzar(refresco = true)

    fun reintentar() = lanzar(refresco = _state.value.hayDatos)

    fun descartarAviso() = _state.update { it.copy(avisoRefresco = null) }

    fun cambiarFiltro(nuevo: CotizacionesRules.Filtro) { _filtro.value = nuevo }

    fun buscar(texto: String) { _consulta.value = texto }

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
                val mensaje = e.toUserMessage("No se pudieron cargar las cotizaciones")
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

/**
 * Una cotización por dentro: cliente, importes, partidas agrupadas, términos y
 * quién intervino. Más el PDF, que es lo único que se «hace» desde el teléfono.
 */
data class CotizacionDetalleUiState(
    val cargando: Boolean = true,
    val refrescando: Boolean = false,
    /** Primera carga fallida: no hay nada que enseñar. */
    val error: String? = null,
    val cotizacion: CotizacionDetalleDto? = null,
    /** Refresco fallido con el detalle viejo todavía en pantalla. */
    val avisoRefresco: String? = null,
    val descargandoPdf: Boolean = false,
    val errorPdf: String? = null,
) {
    val hayDatos: Boolean get() = cotizacion != null
}

class CotizacionDetalleViewModel(app: Application) : AndroidViewModel(app) {
    private val repo = CotizacionesRepository(app.applicationContext)

    private val _state = MutableStateFlow(CotizacionDetalleUiState())
    val state: StateFlow<CotizacionDetalleUiState> = _state

    private var cotizacionId: Long = 0L

    fun cargar(id: Long, refresco: Boolean = false) {
        cotizacionId = id
        _state.update {
            if (refresco) it.copy(refrescando = true, avisoRefresco = null)
            else it.copy(cargando = true, error = null, avisoRefresco = null)
        }
        viewModelScope.launch {
            try {
                val detalle = repo.detalle(id)
                _state.update {
                    it.copy(
                        cargando = false,
                        refrescando = false,
                        cotizacion = detalle,
                        error = null,
                        avisoRefresco = null,
                    )
                }
            } catch (e: Throwable) {
                val mensaje = e.toUserMessage("No se pudo abrir la cotización")
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

    fun refrescar() {
        if (cotizacionId > 0L) cargar(cotizacionId, refresco = true)
    }

    fun descartarAviso() = _state.update { it.copy(avisoRefresco = null) }

    fun limpiarErrorPdf() = _state.update { it.copy(errorPdf = null) }

    /**
     * Descarga el PDF y lo abre con el visor del teléfono.
     *
     * Es la propuesta tal como la recibe el cliente, así que se puede enseñar
     * en una visita o reenviar desde el propio visor. El archivo se llama como
     * el folio: en la carpeta de descargas, «NEX-LJ75100126-0007.pdf» dice qué
     * es, y «cotizacion-482.pdf» no.
     *
     * Un fallo aquí no toca el detalle que está en pantalla: se avisa aparte,
     * porque no poder bajar el PDF no invalida lo que se está leyendo.
     */
    fun abrirPdf() {
        val id = cotizacionId
        if (id <= 0L || _state.value.descargandoPdf) return
        _state.update { it.copy(descargandoPdf = true, errorPdf = null) }
        viewModelScope.launch {
            try {
                val bytes = repo.pdf(id)
                val app = getApplication<Application>()
                val nombre = CotizacionesRules.nombreArchivoPdf(id, _state.value.cotizacion?.folio)
                val archivo = withContext(Dispatchers.IO) { savePdfToCache(app, nombre, bytes) }
                openFile(app, archivo, "application/pdf")
                _state.update { it.copy(descargandoPdf = false) }
            } catch (e: Throwable) {
                _state.update {
                    it.copy(
                        descargandoPdf = false,
                        errorPdf = e.toUserMessage("No se pudo abrir el PDF de la cotización"),
                    )
                }
            }
        }
    }
}
