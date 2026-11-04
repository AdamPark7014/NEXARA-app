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
import mx.nexara.mobile.nativeapp.data.AuthRepository
import mx.nexara.mobile.nativeapp.data.api.HerramientaActividadDto
import mx.nexara.mobile.nativeapp.data.api.KitAsignacionDto
import mx.nexara.mobile.nativeapp.data.api.KitPiezaDto
import mx.nexara.mobile.nativeapp.data.api.PrestamoHerramientaDto
import mx.nexara.mobile.nativeapp.data.api.RenovacionPendienteDto
import mx.nexara.mobile.nativeapp.data.api.toUserMessage
import mx.nexara.mobile.nativeapp.data.console.EscaneoRepository
import mx.nexara.mobile.nativeapp.data.tools.HerramientasRepository
import mx.nexara.mobile.nativeapp.ui.common.GeoPhoto
import mx.nexara.mobile.nativeapp.ui.console.PorRol

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
    /** Dirección e Iván: lo abierto de toda la empresa. */
    val empresa: List<PrestamoHerramientaDto> = emptyList(),
    val renovaciones: List<RenovacionPendienteDto> = emptyList(),
    val inventario: List<KitPiezaDto> = emptyList(),
    /** Los kits de la empresa: solo para decir quién trae cada pieza del inventario. */
    val kitsEmpresa: List<KitAsignacionDto> = emptyList(),
    val cargado: Boolean = false,
    /** Prórroga en curso: el diálogo se bloquea mientras tanto. */
    val enviando: Boolean = false,
    val accionError: String? = null,
    val mensaje: String? = null,
)

/**
 * Aviso cuando la prórroga salió, en una frase.
 *
 * Sigue siendo lo mismo: ya se pidió y queda pendiente de que la autoricen.
 */
internal fun avisoProrrogaSolicitada(): String =
    "Prórroga solicitada: queda pendiente de que la autoricen."

/**
 * Herramientas según quién mira ([HerramientasRules.Perfil]): «Mi kit» y «Mis préstamos» del personal,
 * y los préstamos e inventario de la empresa para dirección e Iván.
 *
 * El día de hoy se guarda en el estado del ViewModel ([hoy]) en vez de leerse en
 * cada recomposición: los plazos («vence mañana») se calculan en varios sitios
 * de la misma pantalla y dos lecturas del reloj a caballo de la medianoche
 * darían dos respuestas distintas en la misma lista.
 */
class HerramientasViewModel(app: Application) : AndroidViewModel(app) {
    private val repo = HerramientasRepository(app.applicationContext)
    private val escaneo = EscaneoRepository(app.applicationContext)

    /** Se lee una vez: la sesión no cambia con la pantalla abierta, y el servidor decide de todos modos. */
    val perfil: HerramientasRules.Perfil = AuthRepository(app.applicationContext).loadSession().let { sesion ->
        HerramientasRules.perfil(PorRol.esDireccion(sesion), PorRol.administraHerramientas(sesion))
    }

    private val _state = MutableStateFlow(HerramientasUiState())
    val state: StateFlow<HerramientasUiState> = _state

    private val _vista = MutableStateFlow(HerramientasRules.vistas(perfil).first())
    val vista: StateFlow<HerramientasRules.Vista> = _vista

    private val _filtroEmpresa = MutableStateFlow(HerramientasRules.FiltroEmpresa.ABIERTOS)
    val filtroEmpresa: StateFlow<HerramientasRules.FiltroEmpresa> = _filtroEmpresa

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
        // Cada pestaña busca en lo suyo: una búsqueda vieja escondería filas sin caja a la vista.
        _consulta.value = ""
    }

    fun cambiarFiltro(nuevo: HerramientasRules.FiltroPrestamo) {
        _filtro.value = nuevo
    }

    fun cambiarFiltroEmpresa(nuevo: HerramientasRules.FiltroEmpresa) {
        _filtroEmpresa.value = nuevo
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
            // Dirección no tiene kit ni préstamos propios; el personal no lee los de la empresa.
            val propios = if (perfil == HerramientasRules.Perfil.DIRECCION) null else withContext(Dispatchers.IO) { repo.cargar() }
            val empresa = if (perfil == HerramientasRules.Perfil.PERSONAL) {
                null
            } else {
                withContext(Dispatchers.IO) {
                    repo.cargarEmpresa(conRenovaciones = perfil == HerramientasRules.Perfil.ADMINISTRA)
                }
            }
            // Todo caído es lo único que cuenta como «no se pudo»: con una lista viva la pantalla
            // sigue sirviendo para algo.
            if (propios?.todoFallo != false && empresa?.todoFallo != false) {
                // Primero el de la empresa, que es lo que esa persona abrió a ver; luego los préstamos,
                // la mitad que todo el mundo tiene, así que su mensaje es el que más veces acierta.
                val mensaje = (empresa?.falloPrestamos ?: propios?.falloPrestamos ?: propios?.falloKit)
                    ?.toUserMessage("No se pudieron cargar las herramientas")
                    ?: "No se pudieron cargar las herramientas"
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
                    avisoParcial = avisoParcial(propios, empresa),
                    kit = propios?.kit.orEmpty(),
                    prestamos = propios?.prestamos.orEmpty(),
                    empresa = empresa?.prestamos.orEmpty(),
                    renovaciones = empresa?.renovaciones.orEmpty(),
                    inventario = empresa?.inventario.orEmpty(),
                    kitsEmpresa = empresa?.kits.orEmpty(),
                    cargado = true,
                )
            }
        }
    }

    /** Qué lista no llegó, en una línea. `null` cuando llegaron todas. */
    private fun avisoParcial(
        propios: HerramientasRepository.Datos?,
        empresa: HerramientasRepository.DatosEmpresa?,
    ): String? {
        empresa?.falloPrestamos?.let { return it.toUserMessage("No se pudieron leer los préstamos de la empresa") }
        empresa?.falloRenovaciones?.let { return it.toUserMessage("No se pudieron leer las prórrogas por aprobar") }
        empresa?.falloInventario?.let { return it.toUserMessage("No se pudo leer el inventario") }
        propios?.falloKit?.let { return it.toUserMessage("No se pudo leer tu kit") }
        propios?.falloPrestamos?.let { return it.toUserMessage("No se pudieron leer tus préstamos") }
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
                            avisoProrrogaSolicitada()
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

    /**
     * El molde de lo demás que se hace aquí: bloquear mientras va, enseñar lo que diga el servidor si
     * falla y releer al terminar. Nada se pinta como hecho antes de que el servidor lo confirme.
     *
     * [bloque] devuelve el aviso a enseñar. [onListo] solo corre si salió: mientras falle, el diálogo
     * se queda abierto con lo que la persona escribió. Sin diálogo, el error sale en la cinta.
     */
    private fun accion(fallo: String, enDialogo: Boolean, onListo: () -> Unit, bloque: suspend () -> String) {
        if (_state.value.enviando) return
        _state.update { it.copy(enviando = true, accionError = null) }
        viewModelScope.launch {
            try {
                val aviso = withContext(Dispatchers.IO) { bloque() }
                _state.update { it.copy(enviando = false, mensaje = aviso) }
                onListo()
                cargar(refresco = true)
            } catch (e: Throwable) {
                val mensaje = e.toUserMessage(fallo)
                _state.update {
                    if (enDialogo) it.copy(enviando = false, accionError = mensaje)
                    else it.copy(enviando = false, mensaje = mensaje)
                }
            }
        }
    }

    // ── Personal ─────────────────────────────────────────────────────────────

    /** La búsqueda de «Pedir préstamo»: la hoja se encarga del fallo. */
    suspend fun buscarInventario(consulta: String): List<KitPiezaDto> =
        withContext(Dispatchers.IO) { repo.buscarInventario(consulta) }

    /** Sin actividades se puede pedir igual: es un préstamo suelto. */
    suspend fun misActividades(): List<HerramientaActividadDto> = withContext(Dispatchers.IO) {
        runCatching { repo.misActividades() }.getOrDefault(emptyList())
    }

    fun pedirPrestamo(
        piezaId: Long,
        regreso: LocalDate,
        motivo: String,
        actividadId: Long?,
        onListo: () -> Unit,
    ) = accion(
        fallo = "No se pudo pedir el préstamo",
        enDialogo = true,
        onListo = {
            _vista.value = HerramientasRules.Vista.PRESTAMOS
            onListo()
        },
    ) {
        repo.pedirPrestamo(piezaId, regreso, motivo, actividadId, hoy)
        HerramientasRules.AVISO_PRESTAMO_PEDIDO
    }

    fun reportarDanio(asignacion: KitAsignacionDto, descripcion: String, onListo: () -> Unit) = accion(
        fallo = "No se pudo reportar el daño",
        enDialogo = true,
        onListo = onListo,
    ) {
        if (repo.reportarDanio(asignacion.id, descripcion)) {
            HerramientasRules.AVISO_DANIO_COLA
        } else {
            HerramientasRules.AVISO_DANIO
        }
    }

    // ── Iván ─────────────────────────────────────────────────────────────────

    fun aprobarPrestamo(prestamo: PrestamoHerramientaDto) = accion(
        fallo = "No se pudo aprobar el préstamo",
        enDialogo = false,
        onListo = {},
    ) {
        repo.aprobarPrestamo(prestamo.id)
        "Préstamo aprobado: ya tiene su código para recogerla."
    }

    fun rechazarPrestamo(prestamo: PrestamoHerramientaDto, motivo: String, onListo: () -> Unit) = accion(
        fallo = "No se pudo rechazar el préstamo",
        enDialogo = true,
        onListo = onListo,
    ) {
        repo.rechazarPrestamo(prestamo.id, motivo)
        "Préstamo rechazado."
    }

    fun aprobarRenovacion(renovacion: RenovacionPendienteDto) {
        val id = renovacion.id ?: return
        accion(fallo = "No se pudo aprobar la prórroga", enDialogo = false, onListo = {}) {
            repo.aprobarRenovacion(id)
            "Prórroga aprobada."
        }
    }

    fun rechazarRenovacion(renovacion: RenovacionPendienteDto, motivo: String, onListo: () -> Unit) {
        val id = renovacion.id ?: return
        accion(fallo = "No se pudo rechazar la prórroga", enDialogo = true, onListo = onListo) {
            repo.rechazarRenovacion(id, motivo)
            "Prórroga rechazada."
        }
    }

    fun entregar(prestamo: PrestamoHerramientaDto, codigo: String?, onListo: () -> Unit) = accion(
        fallo = "No se pudo registrar la entrega",
        enDialogo = true,
        onListo = onListo,
    ) {
        escaneo.entregarHerramienta(prestamo.id, codigo)
        "Entrega registrada."
    }

    /** Volver a aprobar es lo que el servidor entiende por «dame otro código». */
    fun generarOtroCodigo(prestamo: PrestamoHerramientaDto) = accion(
        fallo = "No se pudo generar otro código",
        enDialogo = false,
        onListo = {},
    ) {
        repo.aprobarPrestamo(prestamo.id)
        "Código nuevo generado: ya le llegó a quien la pidió."
    }

    fun recibir(prestamo: PrestamoHerramientaDto, danio: String?, onListo: () -> Unit) = accion(
        fallo = "No se pudo registrar la entrada",
        enDialogo = true,
        onListo = onListo,
    ) {
        escaneo.recibirHerramienta(prestamo.id, danio)
        if (danio.isNullOrBlank()) "Entrada registrada." else "Entrada registrada con daño: queda en reparación."
    }

    fun nuevaHerramienta(
        nombre: String,
        modelo: String,
        serie: String,
        panoramica: GeoPhoto,
        fotoSerie: GeoPhoto,
        onListo: () -> Unit,
    ) = accion(
        fallo = "No se pudo dar de alta la herramienta",
        enDialogo = true,
        onListo = onListo,
    ) {
        repo.nuevaHerramienta(nombre, modelo, serie, panoramica, fotoSerie)
        "Herramienta dada de alta."
    }
}
