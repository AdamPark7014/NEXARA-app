package mx.nexara.mobile.nativeapp.ui.console.pagos

import android.app.Application
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.KeyboardArrowLeft
import androidx.compose.material.icons.automirrored.filled.KeyboardArrowRight
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FilterChip
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.pulltorefresh.PullToRefreshBox
import androidx.compose.material3.rememberModalBottomSheetState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import androidx.lifecycle.viewmodel.compose.viewModel
import java.time.LocalDate
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import mx.nexara.mobile.nativeapp.data.api.PagoDetalleDto
import mx.nexara.mobile.nativeapp.data.api.PagoFilaDto
import mx.nexara.mobile.nativeapp.data.api.PagoSemanaDto
import mx.nexara.mobile.nativeapp.data.api.toUserMessage
import mx.nexara.mobile.nativeapp.data.console.PagoSemanalRepository
import mx.nexara.mobile.nativeapp.ui.common.GeoPhoto
import mx.nexara.mobile.nativeapp.ui.common.LiveCameraCaptureDialog
import mx.nexara.mobile.nativeapp.ui.console.herramientas.BotonDeHoja
import mx.nexara.mobile.nativeapp.ui.console.herramientas.CampoDeFoto
import mx.nexara.mobile.nativeapp.ui.console.horarios.HorariosRules
import mx.nexara.mobile.nativeapp.ui.console.more.CargaUiState
import mx.nexara.mobile.nativeapp.ui.console.viaticos.CampoImporte
import mx.nexara.mobile.nativeapp.ui.console.viaticos.Dinero
import mx.nexara.mobile.nativeapp.ui.enterprise.NxColors
import mx.nexara.mobile.nativeapp.ui.enterprise.NxEmptyState
import mx.nexara.mobile.nativeapp.ui.enterprise.NxErrorBlock
import mx.nexara.mobile.nativeapp.ui.enterprise.NxSegmented
import mx.nexara.mobile.nativeapp.ui.enterprise.NxSkeletonList
import mx.nexara.mobile.nativeapp.ui.enterprise.NxUi

/** El detalle abierto: se carga aparte y su error no tapa la lista. */
data class DetallePagoUi(
    val userId: Long,
    val nombre: String,
    val datos: PagoDetalleDto? = null,
    val error: String? = null,
    val enviando: Boolean = false,
    val errorPago: String? = null,
    val aviso: String? = null,
)

class PagoSemanalViewModel(app: Application) : AndroidViewModel(app) {
    private val repo = PagoSemanalRepository(app.applicationContext)

    /** La semana que se paga es la pasada. */
    private val _lunes = MutableStateFlow(PagoSemanalRules.lunes(HorariosRules.hoy()).minusWeeks(1))
    val lunes: StateFlow<LocalDate> = _lunes

    private val _state = MutableStateFlow(CargaUiState<PagoSemanaDto>())
    val state: StateFlow<CargaUiState<PagoSemanaDto>> = _state

    private val _detalle = MutableStateFlow<DetallePagoUi?>(null)
    val detalle: StateFlow<DetallePagoUi?> = _detalle

    fun mover(semanas: Long) {
        val nuevo = _lunes.value.plusWeeks(semanas)
        if (nuevo.isAfter(HorariosRules.hoy())) return
        _lunes.value = nuevo
        // Otra semana, otros montos: lo anterior no se queda en pantalla.
        _state.value = CargaUiState()
        cargar()
    }

    fun cargar() {
        val semana = _lunes.value
        _state.update { it.copy(cargando = !it.hayDatos, refrescando = it.hayDatos, error = null) }
        viewModelScope.launch {
            try {
                val datos = repo.semana(semana.toString())
                if (semana == _lunes.value) _state.value = CargaUiState(cargando = false, datos = datos)
            } catch (e: Throwable) {
                // Con dinero no se deja un saldo viejo a la vista.
                if (semana == _lunes.value) {
                    _state.value = CargaUiState(cargando = false, error = e.toUserMessage("No se pudieron cargar los pagos"))
                }
            }
        }
    }

    fun abrir(fila: PagoFilaDto) {
        val id = fila.userId ?: return
        _detalle.value = DetallePagoUi(id, fila.nombre.orEmpty())
        cargarDetalle()
    }

    fun cerrar() { _detalle.value = null }

    fun cargarDetalle() {
        val d = _detalle.value ?: return
        val semana = _lunes.value.toString()
        _detalle.update { it?.copy(error = null) }
        viewModelScope.launch {
            try {
                val datos = repo.detalle(semana, d.userId)
                _detalle.update { if (it?.userId == d.userId) it.copy(datos = datos) else it }
            } catch (e: Throwable) {
                _detalle.update { if (it?.userId == d.userId) it.copy(error = e.toUserMessage("No se pudo leer el pago")) else it }
            }
        }
    }

    fun registrar(importe: String, forma: String, comprobante: GeoPhoto?) {
        val d = _detalle.value ?: return
        val centavos = Dinero.parsearCentavos(importe) ?: return
        if (d.enviando) return
        val semana = _lunes.value.toString()
        _detalle.update { it?.copy(enviando = true, errorPago = null) }
        viewModelScope.launch {
            try {
                val r = repo.registrar(semana, d.userId, centavos, forma, HorariosRules.hoy().toString(), comprobante)
                val aviso = r.aviso
                // El pago sí quedó; si falta su póliza, se lee antes de cerrar.
                if (aviso == null) {
                    cerrar()
                } else {
                    _detalle.update { it?.copy(enviando = false, aviso = aviso) }
                    cargarDetalle()
                }
                cargar()
            } catch (e: Throwable) {
                _detalle.update { it?.copy(enviando = false, errorPago = e.toUserMessage("No se pudo registrar el pago")) }
                // Otra persona pudo pagar mientras tanto: se vuelve a leer el saldo.
                cargarDetalle()
            }
        }
    }
}

/** «Pagos a empleados»: la semana por pagar y la lista de siempre. */
@Composable
fun PagosEmpleadosConSemana() {
    var semana by rememberSaveable { mutableStateOf(true) }
    Column(Modifier.fillMaxSize().background(NxColors.Surface)) {
        NxSegmented(
            options = listOf("Semana", "Lista de pagos"),
            selectedIndex = if (semana) 0 else 1,
            onSelect = { semana = it == 0 },
            modifier = Modifier.fillMaxWidth().padding(start = 16.dp, end = 16.dp, top = 12.dp),
        )
        if (semana) PagoSemanalPanel(Modifier.weight(1f).fillMaxWidth()) else PagosEmpleadosScreen()
    }
}

/** Pago de la semana: quién falta, cuánto y por qué. Solo dirección llega a este módulo. */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun PagoSemanalPanel(modifier: Modifier = Modifier, vm: PagoSemanalViewModel = viewModel()) {
    val lunes by vm.lunes.collectAsState()
    val state by vm.state.collectAsState()
    val detalle by vm.detalle.collectAsState()
    LaunchedEffect(Unit) { vm.cargar() }

    PullToRefreshBox(isRefreshing = state.refrescando, onRefresh = vm::cargar, modifier = modifier) {
        LazyColumn(
            modifier = Modifier.fillMaxSize(),
            contentPadding = PaddingValues(16.dp),
            verticalArrangement = Arrangement.spacedBy(14.dp),
        ) {
            item(key = "semana") {
                Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
                    IconButton(onClick = { vm.mover(-1) }) {
                        Icon(Icons.AutoMirrored.Filled.KeyboardArrowLeft, contentDescription = "Semana anterior")
                    }
                    Text(
                        PagoSemanalRules.titulo(lunes),
                        modifier = Modifier.weight(1f),
                        style = MaterialTheme.typography.titleSmall.copy(fontWeight = FontWeight.SemiBold),
                        color = NxColors.Slate,
                    )
                    IconButton(onClick = { vm.mover(1) }, enabled = !lunes.plusWeeks(1).isAfter(HorariosRules.hoy())) {
                        Icon(Icons.AutoMirrored.Filled.KeyboardArrowRight, contentDescription = "Semana siguiente")
                    }
                }
            }
            val error = state.error
            val datos = state.datos
            when {
                error != null -> item(key = "error") { NxErrorBlock(error, onRetry = vm::cargar) }
                datos == null -> item(key = "esqueleto") { NxSkeletonList(itemCount = 5, itemHeight = 64.dp) }
                datos.montosOcultos == true -> item(key = "oculto") {
                    NxEmptyState(title = "Montos ocultos", subtitle = "Los montos los ven dirección y contabilidad.")
                }
                datos.filas.isNullOrEmpty() -> item(key = "vacio") {
                    NxEmptyState(title = "Nadie en esta semana", subtitle = "Aparecen las personas con nómina en la semana elegida.")
                }
                else -> {
                    val (pendientes, resto) = datos.filas.partition { PagoSemanalRules.centavos(it.saldo?.saldo) > 0 }
                    item(key = "resumen") {
                        Superficie {
                            Column(Modifier.padding(18.dp)) {
                                Text("Por pagar", style = MaterialTheme.typography.bodySmall, color = NxColors.Muted)
                                Text(
                                    PagoSemanalRules.pesos(datos.totales?.saldo),
                                    fontSize = 30.sp,
                                    fontWeight = FontWeight.Bold,
                                    color = NxColors.Slate,
                                )
                                Text(
                                    "Pagado ${PagoSemanalRules.pesos(datos.totales?.pagado)} de ${PagoSemanalRules.pesos(datos.totales?.final)}",
                                    style = MaterialTheme.typography.bodyMedium,
                                    color = NxUi.Fg2,
                                )
                            }
                        }
                    }
                    listOf("pendientes" to pendientes, "resto" to resto).forEach { (clave, lista) ->
                        if (lista.isNotEmpty()) {
                            item(key = clave) {
                                Superficie {
                                    lista.forEachIndexed { i, f ->
                                        if (i > 0) HorizontalDivider(color = NxUi.BorderSubtle)
                                        Fila(f) { vm.abrir(f) }
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }
    }

    detalle?.let { HojaDetallePago(it, vm) }
}

@Composable
private fun Superficie(content: @Composable () -> Unit) {
    val forma = RoundedCornerShape(NxUi.RadiusLg)
    Column(Modifier.fillMaxWidth().clip(forma).background(NxColors.Card).border(1.dp, NxUi.Border, forma)) { content() }
}

@Composable
private fun Fila(f: PagoFilaDto, onTocar: () -> Unit) {
    val debe = PagoSemanalRules.centavos(f.saldo?.saldo) > 0
    Row(
        Modifier
            .fillMaxWidth()
            .clickable(onClickLabel = "Ver cómo se calculó", onClick = onTocar)
            .heightIn(min = 56.dp)
            .padding(horizontal = 18.dp, vertical = 10.dp),
        horizontalArrangement = Arrangement.spacedBy(12.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Column(Modifier.weight(1f)) {
            Text(
                f.nombre.orEmpty(),
                style = MaterialTheme.typography.bodyMedium.copy(fontWeight = FontWeight.SemiBold),
                color = NxColors.Slate,
            )
            Text(PagoSemanalRules.estado(f.estado), style = MaterialTheme.typography.bodySmall, color = NxColors.Muted)
        }
        Text(
            PagoSemanalRules.pesos(if (debe) f.saldo?.saldo else f.saldo?.final),
            style = MaterialTheme.typography.bodyMedium.copy(fontWeight = FontWeight.SemiBold),
            color = NxColors.Slate,
        )
    }
}

@Composable
private fun Renglon(titulo: String, detalle: String?, monto: String) {
    Row(Modifier.fillMaxWidth().padding(vertical = 8.dp), horizontalArrangement = Arrangement.spacedBy(12.dp)) {
        Column(Modifier.weight(1f)) {
            Text(titulo, style = MaterialTheme.typography.bodyMedium, color = NxColors.Slate)
            detalle?.takeIf { it.isNotBlank() }?.let {
                Text(it, style = MaterialTheme.typography.bodySmall, color = NxColors.Muted)
            }
        }
        Text(monto, style = MaterialTheme.typography.bodyMedium.copy(fontWeight = FontWeight.SemiBold), color = NxColors.Slate)
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun HojaDetallePago(ui: DetallePagoUi, vm: PagoSemanalViewModel) {
    var registrando by rememberSaveable(ui.userId) { mutableStateOf(false) }
    ModalBottomSheet(
        onDismissRequest = { if (!ui.enviando) vm.cerrar() },
        sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true),
    ) {
        Column(
            Modifier.verticalScroll(rememberScrollState()).padding(start = 20.dp, end = 20.dp, bottom = 28.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            Text(
                ui.nombre,
                style = MaterialTheme.typography.titleMedium.copy(fontWeight = FontWeight.Bold),
                color = NxColors.Slate,
            )
            val d = ui.datos
            when {
                d == null && ui.error != null -> NxErrorBlock(ui.error, onRetry = vm::cargarDetalle)
                d == null -> NxSkeletonList(itemCount = 3, itemHeight = 48.dp)
                else -> {
                    Text("Saldo por pagar", style = MaterialTheme.typography.bodySmall, color = NxColors.Muted)
                    Text(
                        PagoSemanalRules.pesos(d.saldo?.saldo),
                        fontSize = 28.sp,
                        fontWeight = FontWeight.Bold,
                        color = NxColors.Slate,
                    )
                    val puede = d.puedeRegistrar == true && PagoSemanalRules.centavos(d.saldo?.saldo) > 0
                    if (puede) {
                        NxSegmented(
                            options = listOf("Cómo se calculó", "Registrar pago"),
                            selectedIndex = if (registrando) 1 else 0,
                            onSelect = { registrando = it == 1 },
                            modifier = Modifier.fillMaxWidth(),
                        )
                    }
                    ui.aviso?.let { Text(it, style = MaterialTheme.typography.bodySmall, color = NxColors.Warning) }
                    if (puede && registrando) FormularioPago(d, ui, vm) else Calculo(d)
                }
            }
            TextButton(
                onClick = vm::cerrar,
                enabled = !ui.enviando,
                modifier = Modifier.fillMaxWidth().heightIn(min = 48.dp),
            ) { Text("Cerrar") }
        }
    }
}

@Composable
private fun Calculo(d: PagoDetalleDto) {
    Column {
        d.comoSeCalculo.orEmpty().forEach { Renglon(it.titulo.orEmpty(), it.detalle, PagoSemanalRules.pesos(it.monto)) }
        val movs = d.movimientos.orEmpty()
        movs.filter { it.tipo == "ajuste" }.forEach {
            Renglon("Ajuste manual", listOfNotNull(it.motivo, it.autorNombre?.let { a -> "Lo puso $a" }).joinToString(". "), PagoSemanalRules.ajuste(it.monto))
        }
        HorizontalDivider(color = NxUi.Border)
        Renglon("A pagar", null, PagoSemanalRules.pesos(d.saldo?.final))
        movs.filter { it.tipo == "pago" }.forEach {
            Renglon(
                PagoSemanalRules.forma(it.forma),
                listOfNotNull(HorariosRules.dia(it.fecha).ifEmpty { null }, it.autorNombre?.let { a -> "la registró $a" }).joinToString(", "),
                PagoSemanalRules.pesos(-(it.monto ?: 0.0)),
            )
        }
        val pendiente = d.extraPendienteMin ?: 0
        if (pendiente > 0) {
            Text(
                "Quedan ${HorariosRules.horas(pendiente)} extra sin autorizar; no se pagan hasta que su jefe decida.",
                style = MaterialTheme.typography.bodySmall,
                color = NxColors.Muted,
            )
        }
    }
}

@Composable
private fun FormularioPago(d: PagoDetalleDto, ui: DetallePagoUi, vm: PagoSemanalViewModel) {
    var importe by rememberSaveable(ui.userId) {
        mutableStateOf(Dinero.formatear(PagoSemanalRules.centavos(d.saldo?.saldo)))
    }
    var forma by rememberSaveable(ui.userId) { mutableStateOf("transferencia") }
    var comprobante by remember { mutableStateOf<GeoPhoto?>(null) }
    var camara by remember { mutableStateOf(false) }
    val falta = PagoSemanalRules.faltaParaPagar(importe, d.saldo?.saldo)

    CampoImporte(valor = importe, onValorChange = { importe = it }, label = "¿Cuánto?", enabled = !ui.enviando)
    Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
        PagoSemanalRules.FORMAS.forEach { (clave, texto) ->
            FilterChip(
                selected = forma == clave,
                onClick = { forma = clave },
                enabled = !ui.enviando,
                label = { Text(texto) },
                modifier = Modifier.heightIn(min = 48.dp),
            )
        }
    }
    CampoDeFoto(titulo = "Comprobante (opcional)", foto = comprobante, enabled = !ui.enviando, onTomar = { camara = true })
    ui.errorPago?.let { Text(it, style = MaterialTheme.typography.bodySmall, color = NxColors.Danger) }
    BotonDeHoja(
        texto = Dinero.parsearCentavos(importe)?.takeIf { it > 0 }?.let { "Registrar ${Dinero.pesos(it)}" } ?: "Registrar pago",
        enviando = ui.enviando,
        habilitado = falta == null,
        onClick = { vm.registrar(importe, forma, comprobante) },
    )
    Text(
        falta ?: "Queda con fecha de hoy. Puedes pagar una parte; al completar se marca pagado en la lista.",
        style = MaterialTheme.typography.bodySmall,
        color = if (falta != null) NxColors.Warning else NxColors.Muted,
    )

    if (camara) {
        LiveCameraCaptureDialog(
            title = "Comprobante del pago",
            requireLocation = false,
            captureLocation = false,
            subtitle = "Encuadra el comprobante completo y que se lea el importe.",
            onCaptured = {
                comprobante = it
                camara = false
            },
            onDismiss = { camara = false },
        )
    }
}
