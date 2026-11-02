package mx.nexara.mobile.nativeapp.ui.console.vehiculos

import android.graphics.Bitmap
import androidx.activity.compose.BackHandler
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.selection.selectable
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.outlined.ReceiptLong
import androidx.compose.material.icons.outlined.PhotoCamera
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import kotlinx.coroutines.launch
import mx.nexara.mobile.nativeapp.data.api.FichaVehiculoDto
import mx.nexara.mobile.nativeapp.data.api.TableroLeidoDto
import mx.nexara.mobile.nativeapp.data.api.TicketLeidoDto
import mx.nexara.mobile.nativeapp.ui.common.GeoPhoto
import mx.nexara.mobile.nativeapp.ui.common.LiveCameraCaptureDialog
import mx.nexara.mobile.nativeapp.ui.console.vehiculos.GasolinaRules.FormCarga
import mx.nexara.mobile.nativeapp.ui.console.vehiculos.GasolinaRules.Rendimiento
import mx.nexara.mobile.nativeapp.ui.console.viaticos.MoneyVisualTransformation
import mx.nexara.mobile.nativeapp.ui.enterprise.NxColors
import mx.nexara.mobile.nativeapp.ui.enterprise.NxErrorBlock
import mx.nexara.mobile.nativeapp.ui.theme.InterTight

/** Qué foto está abierta en la cámara. */
private enum class FotoCarga(val titulo: String, val pista: String) {
    TICKET("Foto del ticket", "Encuadra el ticket completo y toca «Tomar foto»."),
    TABLERO("Foto del tablero", "Que se lean el odómetro y la aguja de gasolina."),
}

/**
 * «Cargar gasolina»: dos fotos, lo que se pudo leer de ellas y la persona confirma. Ni la lectura ni
 * el guardado pasan por la IA desde aquí: la app solo habla con la API de NEXARA.
 *
 * @param leerTicket regresa `null` si no se pudo leer; entonces se captura a mano.
 */
@Composable
internal fun CargarGasolinaFlow(
    vehiculo: String,
    ficha: FichaVehiculoDto,
    enviando: Boolean,
    error: String?,
    onCancelar: () -> Unit,
    onGuardar: (form: FormCarga, ticket: GeoPhoto?, tablero: GeoPhoto?) -> Unit,
    leerTicket: suspend (GeoPhoto) -> TicketLeidoDto?,
    leerTablero: suspend (GeoPhoto) -> TableroLeidoDto?,
) {
    val veCostos = ficha.acceso?.veCostos == true
    val cargas = remember(ficha) { ficha.cargasPrevias() }
    val scope = rememberCoroutineScope()
    var form by remember { mutableStateOf(FormCarga()) }
    var ticket by remember { mutableStateOf<GeoPhoto?>(null) }
    var tablero by remember { mutableStateOf<GeoPhoto?>(null) }
    var leyendoTicket by remember { mutableStateOf(false) }
    var leyendoTablero by remember { mutableStateOf(false) }
    var leido by remember { mutableStateOf(false) }
    var aviso by remember { mutableStateOf<String?>(null) }
    var camara by remember { mutableStateOf<FotoCarga?>(null) }
    var confirmaSalir by remember { mutableStateOf(false) }

    fun pedirSalir() {
        if ((form.tieneDatos || ticket != null || tablero != null) && !enviando) confirmaSalir = true else onCancelar()
    }

    BackHandler(enabled = !enviando) { pedirSalir() }

    fun tomoTicket(foto: GeoPhoto) {
        ticket = foto
        leyendoTicket = true
        aviso = null
        scope.launch {
            val r = leerTicket(foto)
            if (r != null) {
                form = GasolinaRules.conTicket(form, r.litros, r.importe, r.revisar == true, veCostos)
                if (r.litros != null || r.importe != null) leido = true
            }
            aviso = GasolinaRules.avisoTicket(legible = r?.legible == true, revisar = r?.revisar == true, veCostos = veCostos)
            leyendoTicket = false
        }
    }

    fun tomoTablero(foto: GeoPhoto) {
        tablero = foto
        leyendoTablero = true
        scope.launch {
            val r = leerTablero(foto)
            form = GasolinaRules.conTablero(form, r?.odometroKm)
            if (r?.odometroKm != null) leido = true else aviso = GasolinaRules.AVISO_TABLERO
            leyendoTablero = false
        }
    }

    CargarGasolinaContenido(
        vehiculo = vehiculo,
        form = form,
        veCostos = veCostos,
        ticket = ticket?.preview,
        tablero = tablero?.preview,
        leyendoTicket = leyendoTicket,
        leyendoTablero = leyendoTablero,
        leido = leido,
        rendimiento = GasolinaRules.rendimientoDelForm(form, cargas),
        aviso = aviso,
        error = error,
        enviando = enviando,
        onForm = { form = it },
        onTicket = { camara = FotoCarga.TICKET },
        onTablero = { camara = FotoCarga.TABLERO },
        onGuardar = {
            val falta = GasolinaRules.faltaEnCarga(form)
            if (falta != null) aviso = falta else onGuardar(form, ticket, tablero)
        },
    )

    camara?.let { foto ->
        LiveCameraCaptureDialog(
            title = foto.titulo,
            requireLocation = false,
            // La carga no guarda ubicación: no hay por qué pedir el permiso.
            captureLocation = false,
            subtitle = foto.pista,
            onCaptured = { capturada ->
                camara = null
                if (foto == FotoCarga.TICKET) tomoTicket(capturada) else tomoTablero(capturada)
            },
            onDismiss = { camara = null },
        )
    }

    if (confirmaSalir) {
        AlertDialog(
            onDismissRequest = { confirmaSalir = false },
            title = { Text("¿Salir sin guardar?") },
            text = { Text("La carga y sus fotos solo viven en esta pantalla hasta que la guardas.") },
            confirmButton = {
                TextButton(
                    onClick = {
                        confirmaSalir = false
                        onCancelar()
                    },
                ) { Text("Salir sin guardar") }
            },
            dismissButton = {
                TextButton(onClick = { confirmaSalir = false }) { Text("Seguir aquí") }
            },
        )
    }
}

internal fun FichaVehiculoDto.cargasPrevias(): List<GasolinaRules.CargaPrevia> =
    cargas.orEmpty().mapNotNull { c ->
        val odometro = c.odometro ?: return@mapNotNull null
        val litros = c.litros ?: return@mapNotNull null
        GasolinaRules.CargaPrevia(odometro, litros, c.tanqueLleno == true)
    }

/** La pantalla, sin cámara ni red: lo que pintan las capturas contra el mockup `AppGasolina`. */
@Composable
internal fun CargarGasolinaContenido(
    vehiculo: String,
    form: FormCarga,
    veCostos: Boolean,
    ticket: Bitmap?,
    tablero: Bitmap?,
    leyendoTicket: Boolean,
    leyendoTablero: Boolean,
    leido: Boolean,
    rendimiento: Rendimiento?,
    aviso: String?,
    error: String?,
    enviando: Boolean,
    onForm: (FormCarga) -> Unit,
    onTicket: () -> Unit,
    onTablero: () -> Unit,
    onGuardar: () -> Unit,
) {
    val leyendo = leyendoTicket || leyendoTablero
    Column(modifier = Modifier.fillMaxSize().imePadding()) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .weight(1f)
                .verticalScroll(rememberScrollState())
                .padding(start = 16.dp, top = 20.dp, end = 16.dp, bottom = 6.dp),
            verticalArrangement = Arrangement.spacedBy(14.dp),
        ) {
            EncabezadoVehiculo(titulo = "Cargar gasolina", lineas = listOf(vehiculo))
            Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                CasillaFotoVehiculo(
                    etiqueta = FotoCarga.TICKET.titulo,
                    icono = Icons.AutoMirrored.Outlined.ReceiptLong,
                    foto = ticket,
                    leyendo = leyendoTicket,
                    onTomar = onTicket,
                    alto = 132.dp,
                    modifier = Modifier.weight(1f),
                    habilitada = !enviando,
                )
                CasillaFotoVehiculo(
                    etiqueta = FotoCarga.TABLERO.titulo,
                    icono = Icons.Outlined.PhotoCamera,
                    foto = tablero,
                    leyendo = leyendoTablero,
                    onTomar = onTablero,
                    alto = 132.dp,
                    modifier = Modifier.weight(1f),
                    habilitada = !enviando,
                )
            }
            TarjetaVehiculo {
                RotuloLectura(
                    texto = when {
                        leyendo -> "Leyendo la foto…"
                        leido -> "Esto leímos en las fotos"
                        ticket != null || tablero != null -> "Escribe los datos de la carga"
                        else -> "Toma las fotos o escribe los datos"
                    },
                    leyendo = leyendo,
                )
                Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                    CampoVehiculo(
                        etiqueta = "Litros",
                        valor = form.litros,
                        onValor = { onForm(form.copy(litros = GasolinaRules.soloDecimal(it, 6), litrosEscritos = true)) },
                        teclado = KeyboardType.Decimal,
                        modifier = Modifier.weight(1f),
                        habilitado = !enviando,
                    )
                    if (GasolinaRules.totalLeidoOculto(veCostos, form)) {
                        CampoSinImporte(etiqueta = "Total", texto = "Leído del ticket", modifier = Modifier.weight(1f))
                    } else {
                        CampoVehiculo(
                            etiqueta = "Total",
                            valor = form.total,
                            onValor = { onForm(form.copy(total = GasolinaRules.soloDecimal(it), totalEscrito = true)) },
                            teclado = KeyboardType.Decimal,
                            transformacion = MoneyVisualTransformation,
                            prefijo = "$",
                            modifier = Modifier.weight(1f),
                            habilitado = !enviando,
                        )
                    }
                }
                CampoVehiculo(
                    etiqueta = "Odómetro",
                    valor = form.odometro,
                    onValor = { onForm(form.copy(odometro = GasolinaRules.soloDigitos(it), odometroEscrito = true)) },
                    transformacion = MoneyVisualTransformation,
                    habilitado = !enviando,
                )
            }
            TanqueLleno(lleno = form.lleno, habilitado = !enviando, onLleno = { onForm(form.copy(lleno = it)) })
            rendimiento?.let { TarjetaRendimiento(it) }
            aviso?.let { AvisoLectura(it) }
            error?.let { NxErrorBlock(it) }
        }
        BotonVehiculo(
            texto = if (enviando) "Guardando…" else "Guardar carga",
            habilitado = !enviando && !leyendo,
            onClick = onGuardar,
            modifier = Modifier.padding(start = 16.dp, top = 8.dp, end = 16.dp, bottom = 20.dp),
        )
    }
}

@Composable
private fun TanqueLleno(lleno: Boolean, habilitado: Boolean, onLleno: (Boolean) -> Unit) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .background(NxColors.Card, RoundedCornerShape(14.dp))
            .padding(horizontal = 16.dp, vertical = 12.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        Text(
            "¿Llenaste el tanque?",
            fontSize = 15.sp,
            fontWeight = FontWeight.Medium,
            color = NxColors.Slate,
            modifier = Modifier.weight(1f),
        )
        Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
            OpcionTanque("Sí", elegida = lleno, habilitada = habilitado) { onLleno(true) }
            OpcionTanque("No", elegida = !lleno, habilitada = habilitado) { onLleno(false) }
        }
    }
}

@Composable
private fun OpcionTanque(texto: String, elegida: Boolean, habilitada: Boolean, onClick: () -> Unit) {
    val forma = RoundedCornerShape(10.dp)
    val base = Modifier
        .widthIn(min = 56.dp)
        .heightIn(min = 44.dp)
        .clip(forma)
        .selectable(selected = elegida, enabled = habilitada, role = Role.RadioButton, onClick = onClick)
    Row(
        modifier = if (elegida) {
            base.background(NxColors.Brand, forma)
        } else {
            base.background(NxColors.Card, forma).border(1.dp, ColoresVehiculo.Contorno, forma)
        },
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.Center,
    ) {
        Text(
            texto,
            fontSize = 15.sp,
            fontWeight = if (elegida) FontWeight.SemiBold else FontWeight.Normal,
            color = if (elegida) Color.White else NxColors.Slate,
            textAlign = TextAlign.Center,
        )
    }
}

@Composable
private fun TarjetaRendimiento(r: Rendimiento) {
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .background(NxColors.BrandSoft, RoundedCornerShape(14.dp))
            .padding(horizontal = 16.dp, vertical = 14.dp),
    ) {
        Text(
            GasolinaRules.tituloRendimiento(r),
            fontFamily = InterTight,
            fontWeight = FontWeight.SemiBold,
            fontSize = 20.sp,
            lineHeight = 26.sp,
            color = NxColors.BrandDark,
        )
        Text(GasolinaRules.detalleRendimiento(r), fontSize = 13.5.sp, lineHeight = 19.sp, color = NxColors.BrandDark)
    }
}
