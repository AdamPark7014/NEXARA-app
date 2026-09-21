package mx.nexara.mobile.nativeapp.ui.console.gastos

import android.app.Application
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import mx.nexara.mobile.nativeapp.data.api.GastoDto
import mx.nexara.mobile.nativeapp.data.api.toUserMessage
import mx.nexara.mobile.nativeapp.data.console.GastosRepository
import mx.nexara.mobile.nativeapp.ui.common.GeoPhoto
import mx.nexara.mobile.nativeapp.ui.console.more.CargaUiState
import mx.nexara.mobile.nativeapp.ui.console.viaticos.Dinero

/**
 * Lo que está pasando con una acción: registrar, autorizar, rechazar o pagar.
 *
 * El resultado bueno también es un mensaje ([aviso]) y no un silencio: quien
 * autoriza un gasto desde la calle necesita ver que se mandó, porque la lista
 * tarda un instante en releerse y sin eso vuelve a tocar el botón.
 */
data class GastoAccionUiState(
    val enviando: Boolean = false,
    val error: String? = null,
    val aviso: String? = null,
)

/**
 * La pantalla de Gastos: la lista, sus filtros y las cuatro cosas que se pueden
 * hacer con un gasto desde el teléfono.
 *
 * Reutiliza [CargaUiState] —el estado de las pantallas de consulta de «Más»—
 * porque la regla que ordena todo es la misma: **un fallo al refrescar no borra
 * lo que ya se veía**. La primera carga fallida va a `error` (no hay nada que
 * enseñar); un refresco fallido deja los datos viejos en pantalla y avisa en
 * una cinta. En campo, leer un dato de hace dos minutos es mucho mejor que
 * quedarse con la pantalla en blanco.
 *
 * El filtro y la búsqueda no vuelven a pedir nada al servidor: la lista llega
 * entera y [GastosRules] la filtra en memoria. Teclear contra el servidor
 * obligaría a esperar a cada letra, y en campo, con media raya, eso es una
 * pantalla parpadeando.
 */
class GastosViewModel(app: Application) : AndroidViewModel(app) {
    private val repo = GastosRepository(app.applicationContext)

    private val _state = MutableStateFlow(CargaUiState<List<GastoDto>>())
    val state: StateFlow<CargaUiState<List<GastoDto>>> = _state

    private val _filtro = MutableStateFlow(GastosRules.Filtro.TODOS)
    val filtro: StateFlow<GastosRules.Filtro> = _filtro

    private val _consulta = MutableStateFlow("")
    val consulta: StateFlow<String> = _consulta

    private val _accion = MutableStateFlow(GastoAccionUiState())
    val accion: StateFlow<GastoAccionUiState> = _accion

    /**
     * Si le enseñamos los botones de decidir.
     *
     * Se lee una vez al construir porque la sesión no cambia mientras la
     * pantalla está abierta. Es una pista para no ofrecer lo que casi seguro va
     * a fallar; la autoridad es el 403 del servidor, que se enseña tal cual.
     */
    val puedeDecidir: Boolean = repo.administraGastos()

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

    fun cambiarFiltro(nuevo: GastosRules.Filtro) { _filtro.value = nuevo }

    /** Tocar el filtro que ya está puesto vuelve a «Todos»: es el gesto de deshacerlo. */
    fun alternarFiltro(nuevo: GastosRules.Filtro) {
        _filtro.value = if (_filtro.value == nuevo) GastosRules.Filtro.TODOS else nuevo
    }

    /** La tira de cifras manda la clave de la celda que se tocó, no el filtro. */
    fun alternarPorClave(clave: String) {
        GastosRules.Filtro.porClave(clave)?.let(::alternarFiltro)
    }

    fun buscar(texto: String) { _consulta.value = texto }

    fun limpiarAccion() = _accion.update { it.copy(error = null, aviso = null) }

    /** Autoriza el gasto. Solo tiene sentido sobre un pendiente. */
    fun autorizar(id: Long) = ejecutar(
        hecho = "Gasto autorizado",
        enCola = "Sin conexión: la autorización quedó en la cola y se mandará al recuperar señal",
        fallo = "No se pudo autorizar el gasto",
    ) { repo.resolver(id, aprobar = true, nota = null) }

    /**
     * Rechaza el gasto con un motivo.
     *
     * El motivo es obligatorio en la pantalla aunque el servidor lo acepte
     * vacío: un gasto rechazado sin decir por qué obliga a quien lo pidió a
     * preguntar por WhatsApp, y ese ida y vuelta es justo lo que la app
     * tendría que ahorrar. El texto se le concatena al concepto del lado del
     * servidor, así que queda en el registro.
     */
    fun rechazar(id: Long, motivo: String) = ejecutar(
        hecho = "Gasto rechazado",
        enCola = "Sin conexión: el rechazo quedó en la cola y se mandará al recuperar señal",
        fallo = "No se pudo rechazar el gasto",
    ) { repo.resolver(id, aprobar = false, nota = motivo) }

    /** Marca el pago; el servidor levanta el asiento contable y sella el folio. */
    fun marcarPagado(id: Long) = ejecutar(
        hecho = "Gasto marcado como pagado",
        enCola = "Sin conexión: el pago quedó en la cola y se mandará al recuperar señal",
        fallo = "No se pudo marcar el gasto como pagado",
    ) { repo.marcarPagado(id) }

    /**
     * Registra un gasto con la foto del ticket.
     *
     * El importe llega como lo tecleó la persona y se convierte a centavos aquí
     * —no en la pantalla— para que la cifra que viaja sea exactamente la que
     * validó [GastosRules.faltaParaRegistrar].
     */
    fun registrar(
        concepto: String,
        importe: String,
        categoria: String,
        esRecurrente: Boolean,
        fecha: String,
        ticket: GeoPhoto,
    ) {
        val centavos = Dinero.parsearCentavos(importe)
        if (centavos == null || centavos <= 0L) {
            _accion.value = GastoAccionUiState(error = "Ese importe no se entiende")
            return
        }
        ejecutar(
            hecho = "Gasto registrado; queda por autorizar",
            enCola = "Sin conexión: el gasto quedó en la cola con su foto y se mandará al recuperar señal",
            fallo = "No se pudo registrar el gasto",
        ) {
            repo.registrar(
                concepto = concepto,
                centavos = centavos,
                categoria = categoria,
                esRecurrente = esRecurrente,
                fecha = fecha,
                ticket = ticket,
            )
        }
    }

    /**
     * El molde de las cuatro acciones: avisar que se está enviando, contar la
     * verdad del resultado y releer del servidor.
     *
     * Se relee siempre en vez de parchear la fila en memoria porque el servidor
     * hace más de lo que se le pidió —al autorizar sella el folio contable, al
     * pagar levanta la póliza— y una fila adivinada aquí enseñaría un gasto
     * «Pagado» sin referencia que en el servidor sí la tiene.
     *
     * [enCola] es un resultado distinto de [hecho], no un éxito con otro
     * nombre: el 202 del interceptor sin conexión significa que la petición se
     * guardó, no que el servidor la haya aceptado, y el servidor todavía puede
     * rechazarla al reintentarla.
     */
    private fun ejecutar(
        hecho: String,
        enCola: String,
        fallo: String,
        bloque: suspend () -> Boolean,
    ) {
        if (_accion.value.enviando) return
        _accion.value = GastoAccionUiState(enviando = true)
        viewModelScope.launch {
            try {
                val seEncolo = bloque()
                _accion.value = GastoAccionUiState(aviso = if (seEncolo) enCola else hecho)
                // Sin conexión no hay nada nuevo que leer; con ella, el
                // servidor es quien dice cómo quedó.
                if (!seEncolo) lanzar(refresco = true)
            } catch (e: Throwable) {
                _accion.value = GastoAccionUiState(error = e.toUserMessage(fallo))
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
                val mensaje = e.toUserMessage("No se pudieron cargar los gastos")
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
