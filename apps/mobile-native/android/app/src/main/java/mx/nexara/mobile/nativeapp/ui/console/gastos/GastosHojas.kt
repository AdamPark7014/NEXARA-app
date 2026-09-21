package mx.nexara.mobile.nativeapp.ui.console.gastos

import androidx.compose.foundation.Image
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.PhotoCamera
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FilterChip
import androidx.compose.material3.Icon
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.rememberModalBottomSheetState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import java.time.LocalDate
import mx.nexara.mobile.nativeapp.data.api.GastoDto
import mx.nexara.mobile.nativeapp.ui.common.GeoPhoto
import mx.nexara.mobile.nativeapp.ui.common.LiveCameraCaptureDialog
import mx.nexara.mobile.nativeapp.ui.common.ProtectedImage
import mx.nexara.mobile.nativeapp.ui.console.viaticos.AlturaToque
import mx.nexara.mobile.nativeapp.ui.console.viaticos.CampoImporte
import mx.nexara.mobile.nativeapp.ui.enterprise.NxColors
import mx.nexara.mobile.nativeapp.ui.enterprise.NxDenseSectionHeader
import mx.nexara.mobile.nativeapp.ui.enterprise.NxFormTextField
import mx.nexara.mobile.nativeapp.ui.enterprise.NxRowDivider
import mx.nexara.mobile.nativeapp.ui.enterprise.NxStatusDot
import mx.nexara.mobile.nativeapp.ui.enterprise.NxUi

/**
 * Las dos hojas de Gastos: la ficha de uno y el alta de otro nuevo.
 *
 * Van en hojas y no en pantallas propias porque ninguna de las dos es un sitio
 * donde uno se quede: se abren, se resuelve una cosa y se cierran volviendo a
 * la lista, que es donde está el contexto. Además así el módulo entero entra
 * por una sola ruta y el botón de atrás del teléfono hace lo obvio.
 *
 * Ninguna dibuja tarjetas por dentro: la hoja ya es una superficie, y meterle
 * recuadros sería la caja dentro de la caja que prohíbe la regla 9.
 */

/**
 * La ficha de un gasto y lo que se puede decidir sobre él.
 *
 * Contesta en este orden: **qué se compró y cuánto**, **en qué va**, **dónde
 * está el papel** y **qué puedo hacer**. El comprobante se enseña aquí mismo,
 * no como un enlace: quien autoriza necesita mirar el ticket antes de decir que
 * sí, y mandarlo al visor del sistema le hace perder la hoja.
 *
 * Los botones de decidir solo aparecen cuando el estado los permite —un gasto
 * ya pagado no se vuelve a autorizar— y cuando la sesión dice que la persona
 * administra contabilidad. Esa comprobación es para no ofrecer lo que va a
 * fallar; la autoridad sigue siendo el 403 del servidor.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
internal fun HojaDeGasto(
    gasto: GastoDto,
    puedeDecidir: Boolean,
    enviando: Boolean,
    onAutorizar: (Long) -> Unit,
    onRechazar: (Long, String) -> Unit,
    onMarcarPagado: (Long) -> Unit,
    onCerrar: () -> Unit,
) {
    val estadoHoja = rememberModalBottomSheetState(skipPartiallyExpanded = true)
    val id = gasto.id
    val estado = GastosRules.estadoDe(gasto)
    val faltaTicket = GastosRules.sinComprobante(gasto)

    // El rechazo pide motivo, y el motivo se teclea aquí mismo: mandar a otra
    // hoja a escribir dos palabras es perder de vista el gasto que se rechaza.
    var pidiendoMotivo by remember { mutableStateOf(false) }
    var motivo by remember { mutableStateOf("") }

    ModalBottomSheet(onDismissRequest = onCerrar, sheetState = estadoHoja) {
        Column(
            modifier = Modifier
                .verticalScroll(rememberScrollState())
                .padding(start = 20.dp, end = 20.dp, bottom = 28.dp),
            verticalArrangement = Arrangement.spacedBy(14.dp),
        ) {
            Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
                Text(
                    GastosRules.conceptoTexto(gasto),
                    fontSize = 17.sp,
                    fontWeight = FontWeight.Bold,
                    color = NxColors.Slate,
                    maxLines = 3,
                    overflow = TextOverflow.Ellipsis,
                )
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.spacedBy(10.dp),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Text(
                        GastosRules.montoTexto(gasto),
                        style = CIFRAS_TABULARES,
                        fontSize = 26.sp,
                        fontWeight = FontWeight.Bold,
                        color = NxColors.Slate,
                        modifier = Modifier.weight(1f),
                        maxLines = 1,
                    )
                    NxStatusDot(
                        GastosRules.etiquetaEstado(gasto),
                        color = GastosRules.colorEstado(estado),
                        fontSize = 13.sp,
                        fontWeight = FontWeight.SemiBold,
                    )
                }
            }

            Column(Modifier.fillMaxWidth()) {
                DatoDeGasto("Fecha del gasto", GastosRules.fechaLarga(gasto.fechaGasto ?: gasto.fechaSolicitud))
                DatoDeGasto("Categoría", GastosRules.categoriaTexto(gasto))
                DatoDeGasto("De quién", GastosRules.solicitanteTexto(gasto))
                DatoDeGasto("Se repite cada mes", if (gasto.esRecurrente == true) "Sí" else null)
                // El folio de la póliza solo existe cuando el API ya lo escribió.
                DatoDeGasto("Folio contable", gasto.contabilidadRef?.trim()?.ifEmpty { null })
            }

            Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                NxDenseSectionHeader(
                    title = "Comprobante",
                    hint = if (faltaTicket) "Sin él, el gasto no se puede deducir" else null,
                )
                if (faltaTicket) {
                    NxStatusDot(
                        "Este gasto no tiene comprobante",
                        color = GastosRules.colorEstado(GastosRules.Estado.RECHAZADO),
                        fontSize = 13.sp,
                        fontWeight = FontWeight.SemiBold,
                        maxLines = 2,
                    )
                } else {
                    ProtectedImage(
                        url = gasto.ticketEvidenciaUrl,
                        contentDescription = "Comprobante del gasto",
                        contentScale = ContentScale.Fit,
                        modifier = Modifier
                            .fillMaxWidth()
                            .height(240.dp)
                            .clip(RoundedCornerShape(NxUi.RadiusLg)),
                    )
                }
            }

            if (puedeDecidir && id != null) {
                AccionesDeGasto(
                    id = id,
                    gasto = gasto,
                    enviando = enviando,
                    pidiendoMotivo = pidiendoMotivo,
                    motivo = motivo,
                    onMotivoChange = { motivo = it },
                    onPedirMotivo = { pidiendoMotivo = true },
                    onCancelarMotivo = {
                        pidiendoMotivo = false
                        motivo = ""
                    },
                    onAutorizar = onAutorizar,
                    onRechazar = onRechazar,
                    onMarcarPagado = onMarcarPagado,
                )
            } else if (id != null) {
                Text(
                    "Autorizar y pagar los hace contabilidad.",
                    fontSize = 12.sp,
                    color = NxColors.Muted,
                )
            }
        }
    }
}

/**
 * Los botones de decidir, uno por lo que el estado permite ahora mismo.
 *
 * Nunca se enseñan los cuatro a la vez: sobre un pendiente se autoriza o se
 * rechaza, sobre un autorizado se paga, y un pagado o un rechazado ya no admite
 * nada. Enseñar un botón que el servidor va a rechazar con un 400 es prometer
 * algo que no se puede cumplir.
 */
@Composable
private fun AccionesDeGasto(
    id: Long,
    gasto: GastoDto,
    enviando: Boolean,
    pidiendoMotivo: Boolean,
    motivo: String,
    onMotivoChange: (String) -> Unit,
    onPedirMotivo: () -> Unit,
    onCancelarMotivo: () -> Unit,
    onAutorizar: (Long) -> Unit,
    onRechazar: (Long, String) -> Unit,
    onMarcarPagado: (Long) -> Unit,
) {
    Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
        when {
            pidiendoMotivo -> {
                NxFormTextField(
                    value = motivo,
                    onValueChange = onMotivoChange,
                    label = "¿Por qué se rechaza?",
                    error = if (motivo.isBlank()) "Sin motivo, quien lo pidió tendrá que preguntarlo" else null,
                    singleLine = false,
                    minLines = 2,
                    imeAction = ImeAction.Done,
                )
                BotonDeAccion(
                    texto = "Rechazar el gasto",
                    enviando = enviando,
                    habilitado = motivo.isNotBlank(),
                    onClick = { onRechazar(id, motivo) },
                )
                TextButton(
                    onClick = onCancelarMotivo,
                    enabled = !enviando,
                    modifier = Modifier.fillMaxWidth().heightIn(min = AlturaToque),
                ) { Text("Mejor no") }
            }

            GastosRules.puedeAutorizar(gasto) -> {
                BotonDeAccion(
                    texto = "Autorizar",
                    enviando = enviando,
                    habilitado = true,
                    onClick = { onAutorizar(id) },
                )
                OutlinedButton(
                    onClick = onPedirMotivo,
                    enabled = !enviando,
                    modifier = Modifier.fillMaxWidth().heightIn(min = AlturaToque),
                ) { Text("Rechazar") }
            }

            GastosRules.puedePagar(gasto) -> {
                BotonDeAccion(
                    texto = "Marcar como pagado",
                    enviando = enviando,
                    habilitado = true,
                    onClick = { onMarcarPagado(id) },
                )
                Text(
                    "Al marcarlo, el sistema levanta la póliza contable con su folio.",
                    fontSize = 12.sp,
                    color = NxColors.Muted,
                )
            }

            else -> Text(
                "Este gasto ya está cerrado; no queda nada por decidir.",
                fontSize = 12.sp,
                color = NxColors.Muted,
            )
        }
    }
}

/** El botón principal de una hoja, con su estado de «enviando» a la vista. */
@Composable
private fun BotonDeAccion(
    texto: String,
    enviando: Boolean,
    habilitado: Boolean,
    onClick: () -> Unit,
) {
    Button(
        onClick = onClick,
        enabled = habilitado && !enviando,
        colors = ButtonDefaults.buttonColors(containerColor = NxColors.Brand),
        modifier = Modifier.fillMaxWidth().heightIn(min = 56.dp),
    ) {
        if (enviando) {
            CircularProgressIndicator(
                color = Color.White,
                strokeWidth = 2.dp,
                modifier = Modifier.size(20.dp),
            )
            Spacer(Modifier.size(10.dp))
            Text("Enviando…")
        } else {
            Text(texto, fontWeight = FontWeight.Bold)
        }
    }
}

/**
 * Una línea de la ficha: etiqueta a la izquierda, dato a la derecha.
 *
 * Con [valor] nulo **no se dibuja nada**. Una ficha llena de «—» hace creer que
 * faltan datos que en realidad no aplican: un gasto que no se repite cada mes
 * no tiene por qué decirlo.
 */
@Composable
private fun DatoDeGasto(etiqueta: String, valor: String?) {
    val texto = valor?.trim()?.ifEmpty { null } ?: return
    Column(Modifier.fillMaxWidth()) {
        Row(
            modifier = Modifier.fillMaxWidth().padding(vertical = 9.dp),
            horizontalArrangement = Arrangement.spacedBy(12.dp),
            verticalAlignment = Alignment.Top,
        ) {
            Text(etiqueta, fontSize = 12.5.sp, color = NxUi.Fg2, modifier = Modifier.weight(1f))
            Text(
                texto,
                fontSize = 12.5.sp,
                fontWeight = FontWeight.SemiBold,
                color = NxColors.Slate,
                textAlign = TextAlign.End,
                modifier = Modifier.weight(1.4f),
            )
        }
        NxRowDivider()
    }
}

/**
 * El alta: cuánto, en qué, de cuándo y la foto del ticket.
 *
 * Es la razón de que este módulo tenga pantalla en el teléfono. La foto se toma
 * con la **misma cámara en vivo de las evidencias** ([LiveCameraCaptureDialog]);
 * no hay galería, porque el servidor exige comprobante y una captura de pantalla
 * de una captura de pantalla no lo es.
 *
 * El botón dice qué falta en vez de quedarse gris y callado: un botón
 * deshabilitado sin explicación es la forma más rápida de que alguien cierre la
 * app pensando que está rota.
 */
@OptIn(ExperimentalMaterial3Api::class, ExperimentalLayoutApi::class)
@Composable
internal fun HojaDeAltaDeGasto(
    enviando: Boolean,
    onRegistrar: (
        concepto: String,
        importe: String,
        categoria: String,
        esRecurrente: Boolean,
        fecha: String,
        ticket: GeoPhoto,
    ) -> Unit,
    onCerrar: () -> Unit,
) {
    val estadoHoja = rememberModalBottomSheetState(skipPartiallyExpanded = true)

    var importe by remember { mutableStateOf("") }
    var concepto by remember { mutableStateOf("") }
    var categoria by remember { mutableStateOf(GastosRules.CATEGORIA_POR_OMISION) }
    var recurrente by remember { mutableStateOf(false) }
    var ticket by remember { mutableStateOf<GeoPhoto?>(null) }
    var camaraAbierta by remember { mutableStateOf(false) }

    // Los días se fijan una vez por composición: si alguien deja la hoja
    // abierta a medianoche, «Hoy» no puede cambiar de significado a media
    // captura y mandar el gasto al día equivocado.
    val dias = remember { GastosRules.opcionesDeFecha(LocalDate.now()) }
    var dia by remember { mutableStateOf(dias.first()) }

    val falta = GastosRules.faltaParaRegistrar(
        concepto = concepto,
        importe = importe,
        tieneTicket = ticket != null,
    )

    ModalBottomSheet(onDismissRequest = onCerrar, sheetState = estadoHoja) {
        Column(
            modifier = Modifier
                .verticalScroll(rememberScrollState())
                .padding(start = 20.dp, end = 20.dp, bottom = 28.dp),
            verticalArrangement = Arrangement.spacedBy(14.dp),
        ) {
            Text(
                "Registrar un gasto",
                fontSize = 17.sp,
                fontWeight = FontWeight.Bold,
                color = NxColors.Slate,
            )

            CampoImporte(
                valor = importe,
                onValorChange = { importe = it },
                label = "¿Cuánto?",
                ayuda = "Pesos, con IVA incluido.",
                enabled = !enviando,
                imeAction = ImeAction.Next,
            )

            NxFormTextField(
                value = concepto,
                onValueChange = { concepto = it },
                label = "¿En qué se gastó?",
                singleLine = false,
                minLines = 2,
                imeAction = ImeAction.Done,
            )

            Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                NxDenseSectionHeader(title = "Categoría")
                FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    GastosRules.CATEGORIAS.forEach { opcion ->
                        FilterChip(
                            selected = categoria == opcion,
                            onClick = { categoria = opcion },
                            enabled = !enviando,
                            label = { Text(opcion) },
                            modifier = Modifier.heightIn(min = AlturaToque),
                        )
                    }
                }
            }

            Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                NxDenseSectionHeader(
                    title = "¿Cuándo?",
                    hint = "Un gasto de más atrás se captura en la computadora.",
                )
                FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    dias.forEach { opcion ->
                        FilterChip(
                            selected = dia.fecha == opcion.fecha,
                            onClick = { dia = opcion },
                            enabled = !enviando,
                            label = { Text(opcion.etiqueta) },
                            modifier = Modifier.heightIn(min = AlturaToque),
                        )
                    }
                }
            }

            FilterChip(
                selected = recurrente,
                onClick = { recurrente = !recurrente },
                enabled = !enviando,
                label = { Text("Se repite cada mes") },
                modifier = Modifier.heightIn(min = AlturaToque),
            )

            Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
                NxDenseSectionHeader(
                    title = "Foto del ticket",
                    hint = "Obligatoria: sin ella el gasto no se puede deducir.",
                )
                ticket?.let { foto ->
                    Image(
                        bitmap = foto.preview.asImageBitmap(),
                        contentDescription = "Ticket fotografiado",
                        contentScale = ContentScale.Crop,
                        modifier = Modifier
                            .fillMaxWidth()
                            .height(180.dp)
                            .clip(RoundedCornerShape(NxUi.RadiusLg)),
                    )
                }
                OutlinedButton(
                    onClick = { camaraAbierta = true },
                    enabled = !enviando,
                    modifier = Modifier.fillMaxWidth().heightIn(min = AlturaToque),
                ) {
                    Icon(Icons.Default.PhotoCamera, contentDescription = null, modifier = Modifier.size(18.dp))
                    Spacer(Modifier.size(8.dp))
                    Text(if (ticket == null) "Tomar foto del ticket" else "Tomar otra")
                }
            }

            BotonDeAccion(
                texto = "Registrar gasto",
                enviando = enviando,
                habilitado = falta == null,
                onClick = {
                    val foto = ticket
                    if (falta == null && foto != null) {
                        onRegistrar(concepto, importe, categoria, recurrente, dia.valorApi, foto)
                    }
                },
            )
            Text(
                // Lo que falta, o lo que pasa si no hay señal. Nunca los dos:
                // con el formulario a medias, la cola todavía no viene a cuento.
                falta ?: "Sin señal se guarda en la cola con su foto y sale solo al volver la red.",
                fontSize = 12.sp,
                color = if (falta != null) NxColors.Warning else NxColors.Muted,
            )
            TextButton(
                onClick = onCerrar,
                enabled = !enviando,
                modifier = Modifier.fillMaxWidth().heightIn(min = AlturaToque),
            ) { Text("Cancelar") }
        }
    }

    if (camaraAbierta) {
        LiveCameraCaptureDialog(
            title = "Foto del ticket",
            // Un ticket se fotografía donde caiga —oficina, tienda, sótano—: la
            // ubicación viaja si la hay, pero no bloquea el gasto.
            requireLocation = false,
            subtitle = "Encuadra el ticket completo y que se lea el total.",
            onCaptured = { foto ->
                ticket = foto
                camaraAbierta = false
            },
            onDismiss = { camaraAbierta = false },
        )
    }
}
