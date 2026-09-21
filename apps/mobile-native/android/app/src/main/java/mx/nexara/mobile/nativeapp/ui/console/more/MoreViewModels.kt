package mx.nexara.mobile.nativeapp.ui.console.more

import android.app.Application
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import java.time.LocalDate
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import mx.nexara.mobile.nativeapp.data.api.KpisEquipoDto
import mx.nexara.mobile.nativeapp.data.api.OrgNodeDto
import mx.nexara.mobile.nativeapp.data.api.ProyectoResumenDto
import mx.nexara.mobile.nativeapp.data.api.toUserMessage
import mx.nexara.mobile.nativeapp.data.console.CoreExtrasRepository
import mx.nexara.mobile.nativeapp.ui.console.activities.BoardRange

/**
 * Estado de una pantalla de consulta.
 *
 * La regla que ordena todo esto: **un fallo al refrescar no borra lo que ya se
 * veía**. Si la primera carga falla no hay nada que enseñar y va [error]; si
 * falla un refresco posterior, los datos viejos se quedan en pantalla y el fallo
 * se cuenta en [avisoRefresco], que es una cinta, no una pantalla en blanco.
 * En campo, con media raya de señal, perder la lista por un refresco fallido es
 * peor que leer un dato de hace dos minutos.
 */
data class CargaUiState<T>(
    val cargando: Boolean = true,
    val refrescando: Boolean = false,
    val datos: T? = null,
    /** Primera carga fallida: no hay nada en pantalla. */
    val error: String? = null,
    /** Refresco fallido con datos viejos todavía en pantalla. */
    val avisoRefresco: String? = null,
) {
    val hayDatos: Boolean get() = datos != null
}

/** Base de las cuatro pantallas: cargar, refrescar y reintentar, sin repetirse. */
abstract class CargaViewModel<T>(app: Application) : AndroidViewModel(app) {
    protected val repo = CoreExtrasRepository(app.applicationContext)

    private val _state = MutableStateFlow(CargaUiState<T>())
    val state: StateFlow<CargaUiState<T>> = _state

    /** Qué pedir al API. Se llama fuera del hilo principal (el repo ya lo hace). */
    protected abstract suspend fun cargar(): T

    /** Texto del error cuando ni el servidor dice nada útil. */
    protected abstract val mensajeDeFallo: String

    private var arrancado = false

    /**
     * La primera carga la dispara la pantalla, no el constructor.
     *
     * `viewModelScope` usa `Dispatchers.Main.immediate`: lanzar desde el `init`
     * de esta clase base ejecutaría [cargar] —que vive en la subclase— antes de
     * que las propiedades de la subclase (el rango, el filtro) existan. Se
     * llama desde un `LaunchedEffect`, y solo una vez: girar el teléfono no
     * vuelve a pedirlo todo.
     */
    fun arrancar() {
        if (arrancado) return
        arrancado = true
        lanzar(refresco = false)
    }

    fun refrescar() = lanzar(refresco = true)

    fun reintentar() = lanzar(refresco = _state.value.hayDatos)

    fun descartarAviso() = _state.update { it.copy(avisoRefresco = null) }

    protected fun lanzar(refresco: Boolean) {
        _state.update {
            if (refresco) it.copy(refrescando = true, avisoRefresco = null)
            else it.copy(cargando = true, error = null, avisoRefresco = null)
        }
        viewModelScope.launch {
            try {
                val datos = cargar()
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
                val mensaje = e.toUserMessage(mensajeDeFallo)
                _state.update {
                    if (it.hayDatos) {
                        // Lo de antes se queda: solo se avisa de que no se pudo actualizar.
                        it.copy(cargando = false, refrescando = false, avisoRefresco = mensaje)
                    } else {
                        it.copy(cargando = false, refrescando = false, error = mensaje)
                    }
                }
            }
        }
    }
}

// ── KPIs del equipo ──────────────────────────────────────────────────────────

/**
 * Los KPI del equipo del periodo elegido. El rango reutiliza [BoardRange], el
 * mismo Hoy · Semana · Mes de la pizarra: dos controles distintos para la misma
 * idea serían dos cosas que aprender.
 */
class KpisEquipoViewModel(app: Application) : CargaViewModel<KpisEquipoDto>(app) {
    override val mensajeDeFallo = "No se pudieron cargar los KPIs del equipo"

    private val _rango = MutableStateFlow(BoardRange.SEMANA)
    val rango: StateFlow<BoardRange> = _rango

    private val _consulta = MutableStateFlow("")
    val consulta: StateFlow<String> = _consulta

    override suspend fun cargar(): KpisEquipoDto {
        val (desde, hasta) = BoardRange.fechas(_rango.value)
        return repo.kpisEquipo(desde, hasta)
    }

    fun cambiarRango(nuevo: BoardRange) {
        if (_rango.value == nuevo) return
        _rango.value = nuevo
        // Cambiar de periodo es pedir otra cosa, no refrescar la misma: se
        // enseña el esqueleto en vez de dejar los números del rango anterior,
        // que se leerían como si fueran del nuevo.
        lanzar(refresco = false)
    }

    fun buscar(texto: String) { _consulta.value = texto }

    fun descripcionRango(hoy: LocalDate = LocalDate.now()): String =
        BoardRange.descripcion(_rango.value, hoy)
}

// ── Organigrama ──────────────────────────────────────────────────────────────

/**
 * El organigrama entero se trae de una vez (`users/orgchart` devuelve el árbol
 * completo de la empresa) y se navega sin volver a pedir nada: bajar y subir de
 * nivel es instantáneo aunque no haya señal.
 */
class OrgchartViewModel(app: Application) : CargaViewModel<List<OrgNodeDto>>(app) {
    override val mensajeDeFallo = "No se pudo cargar el organigrama"

    override suspend fun cargar(): List<OrgNodeDto> = repo.orgchart()

    /** A quién se está viendo. `null` = la cúpula. */
    private val _foco = MutableStateFlow<Long?>(null)
    val foco: StateFlow<Long?> = _foco

    private val _consulta = MutableStateFlow("")
    val consulta: StateFlow<String> = _consulta

    fun enfocar(id: Long?) {
        _foco.value = id
        _consulta.value = ""
    }

    fun buscar(texto: String) { _consulta.value = texto }

    /** Sube un escalón; en la cúpula ya no hay a dónde subir. */
    fun subir(indice: OrgchartRules.Indice) {
        _foco.value = OrgchartRules.arriba(indice, _foco.value)
    }
}

// ── Proyectos ────────────────────────────────────────────────────────────────

class ProyectosViewModel(app: Application) : CargaViewModel<List<ProyectoResumenDto>>(app) {
    override val mensajeDeFallo = "No se pudieron cargar los proyectos"

    override suspend fun cargar(): List<ProyectoResumenDto> = repo.proyectos()

    private val _filtro = MutableStateFlow(ProyectosRules.Filtro.ACTIVOS)
    val filtro: StateFlow<ProyectosRules.Filtro> = _filtro

    private val _consulta = MutableStateFlow("")
    val consulta: StateFlow<String> = _consulta

    fun cambiarFiltro(nuevo: ProyectosRules.Filtro) { _filtro.value = nuevo }

    fun buscar(texto: String) { _consulta.value = texto }
}

// ── Almacén ──────────────────────────────────────────────────────────────────

class AlmacenViewModel(app: Application) : CargaViewModel<CoreExtrasRepository.Almacen>(app) {
    override val mensajeDeFallo = "No se pudo cargar el almacén"

    override suspend fun cargar(): CoreExtrasRepository.Almacen = repo.almacen()

    private val _vista = MutableStateFlow(AlmacenRules.Vista.BAJO_MINIMO)
    val vista: StateFlow<AlmacenRules.Vista> = _vista

    private val _consulta = MutableStateFlow("")
    val consulta: StateFlow<String> = _consulta

    fun cambiarVista(nueva: AlmacenRules.Vista) { _vista.value = nueva }

    fun buscar(texto: String) { _consulta.value = texto }
}
