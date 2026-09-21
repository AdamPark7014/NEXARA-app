package mx.nexara.mobile.nativeapp.ui.console.herramientas

import android.app.Application
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import java.time.LocalDate
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import mx.nexara.mobile.nativeapp.data.api.KitAsignacionDto
import mx.nexara.mobile.nativeapp.data.api.PrestamoHerramientaDto
import mx.nexara.mobile.nativeapp.data.api.toUserMessage
import mx.nexara.mobile.nativeapp.data.tools.HerramientasRepository

/**
 * Estado de Herramientas.
 *
 * La regla que ordena todo: **un refresco fallido no borra lo que ya se veía**.
 * La primera carga fallida sí deja [error] y pantalla de error; a partir de ahí,
 * lo que falla se cuenta en [avisoRefresco], que es una cinta encima de la lista
 * de siempre. En una bodega con media raya de señal, media lista vieja vale más
 * que una pantalla en blanco.
 *
 * [error] y «no tienes nada» nunca conviven: mientras haya [error] no se pinta
 * el estado vacío, porque no sabemos si está vacío o si no se pudo leer.
 */
data class HerramientasUiState(
    val cargando: Boolean = true,
    val refrescando: Boolean = false,
    /** Primera carga fallida: no hay nada en pantalla. */
    val error: String? = null,
    /** Refresco fallido con datos viejos todavía puestos. */
    val avisoRefresco: String? = null,
    /** Una de las dos mitades falló y la otra no: se dice, pero no tapa lo que sí llegó. */
    val avisoParcial: String? = null,
    val kit: List<KitAsignacionDto> = emptyList(),
    val prestamos: List<PrestamoHerramientaDto> = emptyList(),
    val cargado: Boolean = false,
    /** Prórroga en curso: el diálogo se bloquea mientras tanto. */
    val enviando: Boolean = false,
    val accionError: String? = null,
    val mensaje: String? = null,
)

/**
 * «Mi kit» y «Mis préstamos» del personal de campo.
 *
 * El día de hoy se guarda en el estado del ViewModel ([hoy]) en vez de leerse en
 * cada recomposición: los plazos («vence mañana») se calculan en varios sitios
 * de la misma pantalla y dos lecturas del reloj a caballo de la medianoche
 * darían dos respuestas distintas en la misma lista.
 */
class HerramientasViewModel(app: Application) : AndroidViewModel(app) {
    private val repo = HerramientasRepository(app.applicationContext)

    private val _state = MutableStateFlow(HerramientasUiState())
    val state: StateFlow<HerramientasUiState> = _state

    private val _vista = MutableStateFlow(HerramientasRules.Vista.KIT)
    val vista: StateFlow<HerramientasRules.Vista> = _vista

    private val _filtro = MutableStateFlow(HerramientasRules.FiltroPrestamo.ABIERTOS)
    val filtro: StateFlow<HerramientasRules.FiltroPrestamo> = _filtro

    private val _consulta = MutableStateFlow("")
    val consulta: StateFlow<String> = _consulta

    /** Qué día es hoy donde está la persona, no donde está el servidor. */
    val hoy: LocalDate = LocalDate.now(HerramientasRules.ZONA)

    private var arrancado = false

    /**
     * La primera carga la dispara la pantalla, no el constructor: girar el
     * teléfono no vuelve a pedirlo todo.
     */
    fun arrancar() {
        if (arrancado) return
        arrancado = true
        cargar(refresco = false)
    }

    fun refrescar() = cargar(refresco = true)

    fun reintentar() = cargar(refresco = _state.value.cargado)

    fun descartarAviso() = _state.update { it.copy(avisoRefresco = null) }

    fun cambiarVista(nueva: HerramientasRules.Vista) {
        _vista.value = nueva
    }

    fun cambiarFiltro(nuevo: HerramientasRules.FiltroPrestamo) {
        _filtro.value = nuevo
    }

    fun buscar(texto: String) {
        _consulta.value = texto
    }

    fun limpiarMensaje() = _state.update { it.copy(mensaje = null) }

    fun limpiarAccionError() = _state.update { it.copy(accionError = null) }

    private fun cargar(refresco: Boolean) {
        _state.update {
            if (refresco) it.copy(refrescando = true, avisoRefresco = null)
            else it.copy(cargando = true, error = null, avisoRefresco = null)
        }
        viewModelScope.launch {
            val datos = withContext(Dispatchers.IO) { repo.cargar() }
            // Las dos listas caídas es lo único que cuenta como «no se pudo»:
            // con una sola viva la pantalla sigue sirviendo para algo.
            if (datos.todoFallo) {
                // Se prefiere el fallo de los préstamos: es la mitad que todo el
                // mundo tiene, así que su mensaje es el que más veces acierta.
                val mensaje = (datos.falloPrestamos ?: datos.falloKit)
                    ?.toUserMessage("No se pudieron cargar tus herramientas")
                    ?: "No se pudieron cargar tus herramientas"
                _state.update {
                    if (it.cargado) it.copy(cargando = false, refrescando = false, avisoRefresco = mensaje)
                    else it.copy(cargando = false, refrescando = false, error = mensaje)
                }
                return@launch
            }
            _state.update {
                it.copy(
                    cargando = false,
                    refrescando = false,
                    error = null,
                    avisoRefresco = null,
                    avisoParcial = avisoParcial(datos),
                    kit = datos.kit,
                    prestamos = datos.prestamos,
                    cargado = true,
                )
            }
        }
    }

    /** Qué mitad no llegó, en una línea. `null` cuando llegaron las dos. */
    private fun avisoParcial(datos: HerramientasRepository.Datos): String? {
        datos.falloKit?.let { return it.toUserMessage("No se pudo leer tu kit") }
        datos.falloPrestamos?.let { return it.toUserMessage("No se pudieron leer tus préstamos") }
        return null
    }

    /**
     * Pide más plazo. [onListo] solo corre si salió (o si quedó en cola): mientras
     * falle, el diálogo se queda abierto con lo que la persona eligió.
     */
    fun renovar(
        prestamo: PrestamoHerramientaDto,
        nuevaFecha: LocalDate,
        motivo: String?,
        onListo: () -> Unit,
    ) {
        if (_state.value.enviando) return
        _state.update { it.copy(enviando = true, accionError = null) }
        viewModelScope.launch {
            try {
                val encolado = withContext(Dispatchers.IO) {
                    repo.pedirRenovacion(prestamo.id, nuevaFecha, motivo)
                }
                _state.update {
                    it.copy(
                        enviando = false,
                        mensaje = if (encolado) {
                            "Sin conexión: la prórroga quedó en la cola y sale sola al volver la señal."
                        } else {
                            "Prórroga solicitada. Queda pendiente de que la autoricen."
                        },
                    )
                }
                onListo()
                cargar(refresco = true)
            } catch (e: Throwable) {
                _state.update {
                    it.copy(enviando = false, accionError = e.toUserMessage("No se pudo pedir la prórroga"))
                }
            }
        }
    }
}
