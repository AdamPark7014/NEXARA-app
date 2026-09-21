package mx.nexara.mobile.nativeapp.ui.console.viaticos

import androidx.compose.foundation.Image
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.CallSplit
import androidx.compose.material.icons.filled.PhotoCamera
import androidx.compose.material.icons.filled.ReceiptLong
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
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
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.lifecycle.viewmodel.compose.viewModel
import mx.nexara.mobile.nativeapp.data.api.ViaticoDto
import mx.nexara.mobile.nativeapp.ui.common.GeoPhoto
import mx.nexara.mobile.nativeapp.ui.common.LiveCameraCaptureDialog
import mx.nexara.mobile.nativeapp.ui.common.ProtectedImage
import mx.nexara.mobile.nativeapp.ui.enterprise.NxAlert
import mx.nexara.mobile.nativeapp.ui.enterprise.NxAlertBanner
import mx.nexara.mobile.nativeapp.ui.enterprise.NxColors
import mx.nexara.mobile.nativeapp.ui.enterprise.NxErrorBlock
import mx.nexara.mobile.nativeapp.ui.enterprise.NxFormTextField
import mx.nexara.mobile.nativeapp.ui.enterprise.NxLoadingBlock
import mx.nexara.mobile.nativeapp.ui.enterprise.NxPanelShell
import mx.nexara.mobile.nativeapp.ui.enterprise.NxScreenScaffold
import mx.nexara.mobile.nativeapp.ui.enterprise.NxSectionHeader
import mx.nexara.mobile.nativeapp.ui.enterprise.NxSnackbarHost
import mx.nexara.mobile.nativeapp.ui.enterprise.NxStatusChip
import mx.nexara.mobile.nativeapp.ui.enterprise.NxTone
import mx.nexara.mobile.nativeapp.ui.enterprise.rememberNxSnackbarHostState
import kotlin.math.abs

/**
 * El viático por dentro: cuánto se pidió, cuánto se autorizó, cuánto se
 * comprobó y qué falta. Desde aquí se reparte entre actividades, se suben los
 * tickets y —si me toca— se autoriza, se rechaza o se marca pagado.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ViaticoDetalleScreen(
    viaticoId: Long,
    onRepartir: (Long) -> Unit,
    onCambio: () -> Unit = {},
    /** Se pone a true al volver del reparto: lo de pantalla ya no es lo guardado. */
    recargar: Boolean = false,
    onRecargaConsumida: () -> Unit = {},
) {
    val vm: ViaticoDetalleViewModel = viewModel()
    val state by vm.state.collectAsState()
    val snackbar = rememberNxSnackbarHostState()
    var comprobando by remember { mutableStateOf(false) }
    var decidiendo by remember { mutableStateOf(false) }
    var confirmandoPago by remember { mutableStateOf(false) }

    LaunchedEffect(viaticoId) { vm.cargar(viaticoId) }
    LaunchedEffect(recargar) {
        if (recargar) {
            vm.cargar(viaticoId, refresh = true)
            onRecargaConsumida()
        }
    }
    LaunchedEffect(state.mensaje) {
        val msg = state.mensaje ?: return@LaunchedEffect
        vm.limpiarMensaje()
        onCambio()
        snackbar.showSnackbar(msg)
    }

    val viatico = state.viatico

    NxScreenScaffold(
        isRefreshing = state.refreshing,
        onRefresh = { vm.cargar(viaticoId, refresh = true) },
    ) {
        LazyColumn(
            modifier = Modifier.fillMaxSize(),
            contentPadding = PaddingValues(16.dp),
            verticalArrangement = Arrangement.spacedBy(14.dp),
        ) {
            state.error?.let { msg ->
                item {
                    NxAlertBanner(
                        NxAlert(
                            id = "viatico-error",
                            title = msg,
                            subtitle = if (viatico == null) null else "Abajo sigue lo último que se pudo leer.",
                            tone = NxTone.Danger,
                            actionLabel = "Reintentar",
                            onAction = { vm.cargar(viaticoId, refresh = true) },
                        ),
                    )
                }
            }

            if (viatico == null) {
                if (state.loading) item { NxLoadingBlock("Abriendo el viático…") }
                return@LazyColumn
            }

            item { Encabezado(viatico) }
            item { BloqueImportes(viatico) }
            item {
                BloqueReparto(
                    viatico = viatico,
                    puedeRepartir = state.puedeRepartir,
                    onRepartir = { onRepartir(viaticoId) },
                )
            }
            viatico.ticketEvidenciaUrl?.takeIf { it.isNotBlank() }?.let { url ->
                item { BloqueTicket(url) }
            }

            state.accionError?.let { msg ->
                item { NxErrorBlock(msg) }
            }

            item {
                Acciones(
                    puedeComprobar = state.puedeComprobar,
                    puedeDecidir = state.puedeDecidir,
                    puedePagar = state.puedePagar,
                    enviando = state.enviando,
                    onComprobar = { comprobando = true },
                    onDecidir = { decidiendo = true },
                    onPagar = { confirmandoPago = true },
                )
            }

            item { Spacer(Modifier.height(16.dp)) }
        }

        NxSnackbarHost(snackbar, modifier = Modifier.align(Alignment.BottomCenter))
    }

    if (comprobando && viatico != null) {
        HojaComprobar(
            viatico = viatico,
            enviando = state.enviando,
            error = state.accionError,
            onCerrar = {
                comprobando = false
                vm.limpiarAccionError()
            },
            onEnviar = { centavos, nota, foto ->
                vm.comprobar(centavos, nota, foto) { comprobando = false }
            },
        )
    }

    if (decidiendo && viatico != null) {
        HojaDecision(
            viatico = viatico,
            enviando = state.enviando,
            error = state.accionError,
            onCerrar = {
                decidiendo = false
                vm.limpiarAccionError()
            },
            onAprobar = { centavos, nota -> vm.aprobar(centavos, nota) { decidiendo = false } },
            onRechazar = { nota -> vm.rechazar(nota) { decidiendo = false } },
        )
    }

    if (confirmandoPago) {
        AlertDialog(
            onDismissRequest = { if (!state.enviando) confirmandoPago = false },
            title = { Text("¿Marcar como pagado?") },
            text = {
                Text(
                    "Se levanta la póliza contable con lo autorizado. Después de esto el " +
                        "viático ya no se puede repartir entre actividades: el asiento ya salió.",
                )
            },
            confirmButton = {
                Button(
                    onClick = { vm.marcarPagado { confirmandoPago = false } },
                    enabled = !state.enviando,
                    colors = ButtonDefaults.buttonColors(containerColor = NxColors.Brand),
                ) { Text("Sí, pagado") }
            },
            dismissButton = {
                TextButton(
                    onClick = { confirmandoPago = false },
                    enabled = !state.enviando,
                ) { Text("Cancelar") }
            },
        )
    }
}

@Composable
private fun Encabezado(viatico: ViaticoDto) {
    NxPanelShell {
        Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
            Text(
                viatico.motivo?.trim()?.takeIf { it.isNotEmpty() } ?: etiquetaCategoria(viatico.categoria),
                style = MaterialTheme.typography.titleLarge.copy(fontWeight = FontWeight.Bold),
                color = NxColors.Slate,
            )
            Text(
                listOfNotNull(
                    etiquetaCategoria(viatico.categoria),
                    viatico.usuario?.nombre?.trim()?.takeIf { it.isNotEmpty() },
                    viatico.fechaSolicitud?.take(10),
                    viatico.actividad?.anNumber?.trim()?.takeIf { it.isNotEmpty() },
                    viatico.contabilidadRef?.trim()?.takeIf { it.isNotEmpty() },
                ).joinToString(" · "),
                style = MaterialTheme.typography.labelMedium,
                color = NxColors.Muted,
            )
            ChipsDeViatico(viatico)
        }
    }
}

/** Solicitado, autorizado, comprobado y el saldo, con lo que falta dicho en una línea. */
@Composable
private fun BloqueImportes(viatico: ViaticoDto) {
    val solicitado = Dinero.deApi(viatico.montoSolicitado)
    val aprobado = viatico.montoAprobado?.let { Dinero.deApi(it) }
    val comprobado = viatico.montoComprobado?.let { Dinero.deApi(it) }
    val liquidacion = viatico.liquidacion
    val saldo = liquidacion?.saldo?.let { Dinero.deApi(it) }

    NxPanelShell {
        Column(verticalArrangement = Arrangement.spacedBy(14.dp)) {
            NxSectionHeader(title = "Importes")
            ParDeImportes(
                izquierdaLabel = "Solicitado",
                izquierdaCentavos = solicitado,
                derechaLabel = "Autorizado",
                derechaCentavos = aprobado,
                derechaTono = if (aprobado != null && aprobado < solicitado) NxTone.Warning else NxTone.Success,
            )
            if (aprobado != null && aprobado < solicitado) {
                Text(
                    "Se autorizó ${Dinero.pesos(solicitado - aprobado)} menos de lo que pediste.",
                    style = MaterialTheme.typography.bodySmall,
                    color = NxColors.Warning,
                )
            }
            HorizontalDivider()
            ParDeImportes(
                izquierdaLabel = "Comprobado",
                izquierdaCentavos = comprobado ?: 0L,
                derechaLabel = "Saldo",
                derechaCentavos = saldo,
                derechaTono = when {
                    saldo == null || saldo == 0L -> NxTone.Success
                    saldo > 0L -> NxTone.Info
                    else -> NxTone.Brand
                },
            )
            explicacionLiquidacion(liquidacion)?.let { texto ->
                Text(texto, style = MaterialTheme.typography.bodyMedium, color = NxColors.Slate)
            }
            if (comprobado == null) {
                Text(
                    "Falta subir tickets por ${Dinero.pesos(abs(aprobado ?: solicitado))}.",
                    style = MaterialTheme.typography.bodySmall,
                    color = NxColors.Muted,
                )
            }
        }
    }
}

/** Entre qué actividades se reparte el gasto, y el botón para cambiarlo. */
@Composable
private fun BloqueReparto(
    viatico: ViaticoDto,
    puedeRepartir: Boolean,
    onRepartir: () -> Unit,
) {
    val partes = viatico.repartos.orEmpty()
    NxPanelShell {
        Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
            NxSectionHeader(
                title = "Reparto entre actividades",
                subtitle = if (partes.isEmpty()) {
                    "Todo el costo cae en una sola actividad."
                } else {
                    "El costo se divide en ${partes.size} actividades."
                },
            )
            partes.forEach { parte ->
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.spacedBy(10.dp),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Column(Modifier.weight(1f)) {
                        Text(
                            parte.actividad?.let { a ->
                                listOfNotNull(a.anNumber, a.titulo).firstOrNull { it.isNotBlank() }
                            } ?: "Actividad #${parte.actividadId ?: 0}",
                            style = MaterialTheme.typography.bodyMedium,
                            color = NxColors.Slate,
                            maxLines = 2,
                            overflow = TextOverflow.Ellipsis,
                        )
                        parte.nota?.takeIf { it.isNotBlank() }?.let { nota ->
                            Text(nota, style = MaterialTheme.typography.labelSmall, color = NxColors.Muted)
                        }
                    }
                    Text(
                        Dinero.pesos(Dinero.deApi(parte.monto)),
                        style = MaterialTheme.typography.titleMedium.copy(fontWeight = FontWeight.Bold),
                        color = NxColors.Slate,
                    )
                }
            }
            when {
                puedeRepartir -> OutlinedButton(
                    onClick = onRepartir,
                    modifier = Modifier.fillMaxWidth().heightIn(min = AlturaToque),
                ) {
                    Icon(Icons.Default.CallSplit, contentDescription = null, modifier = Modifier.size(18.dp))
                    Spacer(Modifier.size(8.dp))
                    Text(if (partes.isEmpty()) "Repartir entre actividades" else "Cambiar el reparto")
                }
                viatico.estaPagado() -> NxStatusChip(
                    "Pagado: el asiento contable ya salió y el reparto queda fijo",
                    NxTone.Neutral,
                )
                viatico.estaRechazado() -> NxStatusChip("Rechazado: no hay costo que repartir", NxTone.Neutral)
            }
        }
    }
}

@Composable
private fun BloqueTicket(url: String) {
    NxPanelShell {
        Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
            NxSectionHeader(title = "Comprobante")
            ProtectedImage(
                url = url,
                contentDescription = "Foto del ticket del viático",
                contentScale = ContentScale.Fit,
                modifier = Modifier
                    .fillMaxWidth()
                    .height(240.dp)
                    .clip(RoundedCornerShape(12.dp)),
            )
        }
    }
}

@Composable
private fun Acciones(
    puedeComprobar: Boolean,
    puedeDecidir: Boolean,
    puedePagar: Boolean,
    enviando: Boolean,
    onComprobar: () -> Unit,
    onDecidir: () -> Unit,
    onPagar: () -> Unit,
) {
    Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
        if (puedeDecidir) {
            Button(
                onClick = onDecidir,
                enabled = !enviando,
                colors = ButtonDefaults.buttonColors(containerColor = NxColors.Brand),
                modifier = Modifier.fillMaxWidth().heightIn(min = 56.dp),
            ) { Text("Autorizar o rechazar", fontWeight = FontWeight.Bold) }
        }
        if (puedeComprobar) {
            Button(
                onClick = onComprobar,
                enabled = !enviando,
                colors = ButtonDefaults.buttonColors(containerColor = NxColors.Success),
                modifier = Modifier.fillMaxWidth().heightIn(min = 56.dp),
            ) {
                Icon(Icons.Default.ReceiptLong, contentDescription = null, modifier = Modifier.size(18.dp))
                Spacer(Modifier.size(8.dp))
                Text("Comprobar con tickets", fontWeight = FontWeight.Bold)
            }
        }
        if (puedePagar) {
            OutlinedButton(
                onClick = onPagar,
                enabled = !enviando,
                modifier = Modifier.fillMaxWidth().heightIn(min = AlturaToque),
            ) { Text("Marcar como pagado") }
        }
    }
}

/** Subir tickets contra el anticipo: cuánto se gastó de verdad y, si hay, su foto. */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun HojaComprobar(
    viatico: ViaticoDto,
    enviando: Boolean,
    error: String?,
    onCerrar: () -> Unit,
    onEnviar: (centavos: Long, nota: String?, foto: GeoPhoto?) -> Unit,
) {
    val entregado = Dinero.deApi(viatico.montoVigente())
    var importe by remember { mutableStateOf("") }
    var nota by remember { mutableStateOf("") }
    var foto by remember { mutableStateOf<GeoPhoto?>(null) }
    var camara by remember { mutableStateOf(false) }

    val centavos = Dinero.parsearCentavos(importe)
    val diferencia = centavos?.let { entregado - it }

    ModalBottomSheet(onDismissRequest = { if (!enviando) onCerrar() }) {
        Column(
            Modifier.fillMaxWidth().padding(horizontal = 20.dp).padding(bottom = 28.dp),
            verticalArrangement = Arrangement.spacedBy(14.dp),
        ) {
            Text(
                "Comprobar el anticipo",
                style = MaterialTheme.typography.titleMedium,
                fontWeight = FontWeight.Bold,
                color = NxColors.Slate,
            )
            Text(
                "Se te entregaron ${Dinero.pesos(entregado)}. Captura cuánto suman tus tickets.",
                style = MaterialTheme.typography.bodyMedium,
                color = NxColors.Muted,
            )
            CampoImporte(
                valor = importe,
                onValorChange = { importe = it },
                label = "Total de los tickets",
                enabled = !enviando,
                imeAction = ImeAction.Next,
                ayuda = when {
                    diferencia == null -> "Si no gastaste nada, captura 0."
                    diferencia == 0L -> "Cuadra exacto con lo entregado."
                    diferencia > 0L -> "Sobran ${Dinero.pesos(diferencia)}: hay que devolverlos."
                    else -> "Gastaste ${Dinero.pesos(-diferencia)} de más: la empresa te los debe."
                },
            )
            NxFormTextField(
                value = nota,
                onValueChange = { nota = it },
                label = "Nota (opcional)",
                singleLine = false,
                minLines = 2,
                imeAction = ImeAction.Done,
            )
            foto?.let { f ->
                Image(
                    bitmap = f.preview.asImageBitmap(),
                    contentDescription = "Comprobante fotografiado",
                    contentScale = ContentScale.Crop,
                    modifier = Modifier.fillMaxWidth().height(160.dp).clip(RoundedCornerShape(12.dp)),
                )
            }
            OutlinedButton(
                onClick = { camara = true },
                enabled = !enviando,
                modifier = Modifier.fillMaxWidth().heightIn(min = AlturaToque),
            ) {
                Icon(Icons.Default.PhotoCamera, contentDescription = null, modifier = Modifier.size(18.dp))
                Spacer(Modifier.size(8.dp))
                Text(if (foto == null) "Foto del comprobante (opcional)" else "Tomar otra")
            }
            if (error != null) NxErrorBlock(error)
            Button(
                onClick = { centavos?.let { onEnviar(it, nota, foto) } },
                enabled = !enviando && centavos != null,
                colors = ButtonDefaults.buttonColors(containerColor = NxColors.Success),
                modifier = Modifier.fillMaxWidth().heightIn(min = 56.dp),
            ) {
                if (enviando) {
                    CircularProgressIndicator(
                        color = Color.White,
                        strokeWidth = 2.dp,
                        modifier = Modifier.size(20.dp),
                    )
                } else {
                    Text("Enviar comprobación", fontWeight = FontWeight.Bold)
                }
            }
        }
    }

    if (camara) {
        LiveCameraCaptureDialog(
            title = "Foto del comprobante",
            requireLocation = false,
            subtitle = "Que se lea el total del ticket.",
            onCaptured = {
                foto = it
                camara = false
            },
            onDismiss = { camara = false },
        )
    }
}

/**
 * La decisión del jefe: autorizar (con recorte opcional) o rechazar.
 *
 * El recorte no puede pasarse de lo solicitado —el servidor lo rechaza— y la
 * hoja lo dice antes de intentarlo.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun HojaDecision(
    viatico: ViaticoDto,
    enviando: Boolean,
    error: String?,
    onCerrar: () -> Unit,
    onAprobar: (centavos: Long?, nota: String?) -> Unit,
    onRechazar: (nota: String?) -> Unit,
) {
    val solicitado = Dinero.deApi(viatico.montoSolicitado)
    var recorte by remember { mutableStateOf("") }
    var nota by remember { mutableStateOf("") }

    val centavosRecorte = Dinero.parsearCentavos(recorte)
    val errorRecorte = when {
        recorte.isBlank() -> null
        centavosRecorte == null || centavosRecorte <= 0L -> "Captura un importe mayor que cero"
        centavosRecorte > solicitado ->
            "No puedes autorizar más de ${Dinero.pesos(solicitado)}. Si hace falta más, " +
                "que levante otro viático por la diferencia."
        else -> null
    }

    ModalBottomSheet(onDismissRequest = { if (!enviando) onCerrar() }) {
        Column(
            Modifier.fillMaxWidth().padding(horizontal = 20.dp).padding(bottom = 28.dp),
            verticalArrangement = Arrangement.spacedBy(14.dp),
        ) {
            Text(
                viatico.usuario?.nombre?.trim()?.takeIf { it.isNotEmpty() }
                    ?.let { "$it pide ${Dinero.pesos(solicitado)}" }
                    ?: "Pide ${Dinero.pesos(solicitado)}",
                style = MaterialTheme.typography.titleMedium,
                fontWeight = FontWeight.Bold,
                color = NxColors.Slate,
            )
            viatico.motivo?.trim()?.takeIf { it.isNotEmpty() }?.let { motivo ->
                Text(motivo, style = MaterialTheme.typography.bodyMedium, color = NxColors.Muted)
            }
            CampoImporte(
                valor = recorte,
                onValorChange = { recorte = it },
                label = "Autorizar otra cantidad (opcional)",
                error = errorRecorte,
                ayuda = "Vacío autoriza los ${Dinero.pesos(solicitado)} completos.",
                enabled = !enviando,
                imeAction = ImeAction.Next,
            )
            NxFormTextField(
                value = nota,
                onValueChange = { nota = it },
                label = "Nota para quien lo pidió",
                singleLine = false,
                minLines = 2,
                imeAction = ImeAction.Done,
            )
            if (error != null) NxErrorBlock(error)
            Button(
                onClick = { onAprobar(centavosRecorte, nota) },
                enabled = !enviando && errorRecorte == null,
                colors = ButtonDefaults.buttonColors(containerColor = NxColors.Success),
                modifier = Modifier.fillMaxWidth().heightIn(min = 56.dp),
            ) {
                if (enviando) {
                    CircularProgressIndicator(
                        color = Color.White,
                        strokeWidth = 2.dp,
                        modifier = Modifier.size(20.dp),
                    )
                } else {
                    Text(
                        centavosRecorte?.takeIf { errorRecorte == null && recorte.isNotBlank() }
                            ?.let { "Autorizar ${Dinero.pesos(it)}" }
                            ?: "Autorizar ${Dinero.pesos(solicitado)}",
                        fontWeight = FontWeight.Bold,
                    )
                }
            }
            OutlinedButton(
                onClick = { onRechazar(nota) },
                enabled = !enviando,
                modifier = Modifier.fillMaxWidth().heightIn(min = AlturaToque),
            ) { Text("Rechazar", color = NxColors.Danger) }
        }
    }
}
