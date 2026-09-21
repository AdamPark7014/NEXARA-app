package mx.nexara.mobile.nativeapp.ui.console.viaticos

import androidx.compose.foundation.Image
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.PhotoCamera
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FilterChip
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.collectAsState
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
import mx.nexara.mobile.nativeapp.data.api.MyActivityItemDto
import mx.nexara.mobile.nativeapp.ui.common.GeoPhoto
import mx.nexara.mobile.nativeapp.ui.common.LiveCameraCaptureDialog
import mx.nexara.mobile.nativeapp.ui.enterprise.NxColors
import mx.nexara.mobile.nativeapp.ui.enterprise.NxErrorBlock
import mx.nexara.mobile.nativeapp.ui.enterprise.NxFormTextField
import mx.nexara.mobile.nativeapp.ui.enterprise.NxPanelShell
import mx.nexara.mobile.nativeapp.ui.enterprise.NxScreenScaffold
import mx.nexara.mobile.nativeapp.ui.enterprise.NxSectionHeader

/**
 * Pedir un viático desde donde se gastó: cuánto, en qué, y la foto del ticket.
 *
 * La foto se toma con la **misma cámara en vivo de las evidencias**
 * ([LiveCameraCaptureDialog]); no hay galería y no se escribió otro flujo. El
 * servidor exige evidencia, así que «Pedir» no se habilita sin ella.
 *
 * El reparto entre actividades no está aquí a propósito: viaja en el detalle,
 * porque un multipart no lleva listas anidadas y porque a menudo se sabe qué
 * visitas cubrió el viaje solo al volver.
 */
@OptIn(ExperimentalMaterial3Api::class, ExperimentalLayoutApi::class)
@Composable
fun NuevoViaticoScreen(
    onCancelar: () -> Unit,
    onCreado: () -> Unit,
) {
    val vm: ViaticosViewModel = viewModel()
    val state by vm.state.collectAsState()

    var importe by remember { mutableStateOf("") }
    var categoria by remember { mutableStateOf(CATEGORIAS_VIATICO.first().first) }
    var motivo by remember { mutableStateOf("") }
    var actividad by remember { mutableStateOf<MyActivityItemDto?>(null) }
    var ticket by remember { mutableStateOf<GeoPhoto?>(null) }
    var camaraAbierta by remember { mutableStateOf(false) }
    var eligiendoActividad by remember { mutableStateOf(false) }
    var intentado by remember { mutableStateOf(false) }

    val centavos = Dinero.parsearCentavos(importe) ?: 0L
    val errorImporte = when {
        !intentado -> null
        importe.isBlank() -> "Captura cuánto gastaste"
        centavos <= 0L -> "El importe tiene que ser mayor que cero"
        else -> null
    }
    val errorMotivo = if (intentado && motivo.isBlank()) "Di en qué se gastó" else null
    val completo = centavos > 0L && motivo.isNotBlank() && ticket != null

    NxScreenScaffold {
        LazyColumn(
            modifier = Modifier.fillMaxSize(),
            contentPadding = androidx.compose.foundation.layout.PaddingValues(16.dp),
            verticalArrangement = Arrangement.spacedBy(14.dp),
        ) {
            item {
                CampoImporte(
                    valor = importe,
                    onValorChange = { importe = it },
                    label = "¿Cuánto?",
                    error = errorImporte,
                    ayuda = "Lo que pusiste de tu bolsa, con centavos.",
                    enabled = !state.enviando,
                    imeAction = ImeAction.Next,
                )
            }

            item {
                Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    NxSectionHeader(title = "¿En qué?")
                    FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        CATEGORIAS_VIATICO.forEach { (clave, etiqueta) ->
                            FilterChip(
                                selected = categoria == clave,
                                onClick = { categoria = clave },
                                enabled = !state.enviando,
                                label = { Text(etiqueta) },
                                modifier = Modifier.heightIn(min = AlturaToque),
                            )
                        }
                    }
                }
            }

            item {
                NxFormTextField(
                    value = motivo,
                    onValueChange = { motivo = it },
                    label = "Concepto",
                    error = errorMotivo,
                    singleLine = false,
                    minLines = 2,
                    imeAction = ImeAction.Done,
                )
            }

            item {
                SelectorActividad(
                    actividad = actividad,
                    habilitado = !state.enviando,
                    onAbrir = { eligiendoActividad = true },
                    onQuitar = { actividad = null },
                )
            }

            item {
                FotoDelTicket(
                    ticket = ticket,
                    habilitado = !state.enviando,
                    onTomar = { camaraAbierta = true },
                )
            }

            state.accionError?.let { msg ->
                item { NxErrorBlock(msg) }
            }

            item {
                Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
                    Button(
                        onClick = {
                            intentado = true
                            val foto = ticket
                            if (completo && foto != null) {
                                vm.pedir(
                                    centavos = centavos,
                                    motivo = motivo,
                                    categoria = categoria,
                                    actividadId = actividad?.id,
                                    ticket = foto,
                                    onListo = onCreado,
                                )
                            }
                        },
                        enabled = !state.enviando,
                        colors = ButtonDefaults.buttonColors(containerColor = NxColors.Brand),
                        modifier = Modifier.fillMaxWidth().heightIn(min = 56.dp),
                    ) {
                        if (state.enviando) {
                            CircularProgressIndicator(
                                color = Color.White,
                                strokeWidth = 2.dp,
                                modifier = Modifier.size(20.dp),
                            )
                            Spacer(Modifier.size(10.dp))
                            Text("Enviando…")
                        } else {
                            Text("Pedir viático", fontWeight = FontWeight.Bold)
                        }
                    }
                    TextButton(
                        onClick = onCancelar,
                        enabled = !state.enviando,
                        modifier = Modifier.fillMaxWidth().heightIn(min = AlturaToque),
                    ) { Text("Cancelar") }
                    Text(
                        "Sin señal se guarda en la cola con su foto y sale solo al volver la red.",
                        style = MaterialTheme.typography.labelMedium,
                        color = NxColors.Muted,
                    )
                }
            }
        }
    }

    if (camaraAbierta) {
        LiveCameraCaptureDialog(
            title = "Foto del ticket",
            // Un ticket se fotografía donde caiga —gasolinera, caseta, sótano—:
            // la ubicación viaja si la hay, pero no bloquea el gasto.
            requireLocation = false,
            subtitle = "Encuadra el ticket completo y que se lea el total.",
            onCaptured = { foto ->
                ticket = foto
                camaraAbierta = false
            },
            onDismiss = { camaraAbierta = false },
        )
    }

    if (eligiendoActividad) {
        ModalBottomSheet(onDismissRequest = { eligiendoActividad = false }) {
            Column(Modifier.fillMaxWidth().padding(bottom = 24.dp)) {
                Text(
                    "¿A qué actividad se carga?",
                    style = MaterialTheme.typography.titleMedium,
                    fontWeight = FontWeight.Bold,
                    modifier = Modifier.padding(horizontal = 24.dp, vertical = 10.dp),
                )
                Text(
                    "Si el viaje cubrió varias, elige una ahora y repártelo después desde el detalle.",
                    style = MaterialTheme.typography.bodySmall,
                    color = NxColors.Muted,
                    modifier = Modifier.padding(horizontal = 24.dp),
                )
                Spacer(Modifier.height(8.dp))
                HorizontalDivider()
                if (state.actividades.isEmpty()) {
                    Text(
                        "No traes actividades abiertas.",
                        style = MaterialTheme.typography.bodyMedium,
                        color = NxColors.Muted,
                        modifier = Modifier.padding(24.dp),
                    )
                } else {
                    LazyColumn(Modifier.heightIn(max = 420.dp)) {
                        items(state.actividades, key = { it.id }) { item ->
                            TextButton(
                                onClick = {
                                    actividad = item
                                    eligiendoActividad = false
                                },
                                modifier = Modifier.fillMaxWidth().heightIn(min = AlturaToque),
                            ) {
                                Column(Modifier.fillMaxWidth().padding(horizontal = 8.dp, vertical = 4.dp)) {
                                    Text(
                                        item.titulo?.takeIf { it.isNotBlank() } ?: "Actividad #${item.id}",
                                        style = MaterialTheme.typography.bodyLarge,
                                        color = NxColors.Slate,
                                        maxLines = 2,
                                        overflow = TextOverflow.Ellipsis,
                                    )
                                    Text(
                                        listOfNotNull(item.anNumber, item.cliente)
                                            .filter { it.isNotBlank() }
                                            .joinToString(" · "),
                                        style = MaterialTheme.typography.labelMedium,
                                        color = NxColors.Muted,
                                    )
                                }
                            }
                        }
                    }
                }
            }
        }
    }
}

/** Qué actividad carga el gasto. Opcional: hay viáticos que no son de ninguna. */
@Composable
private fun SelectorActividad(
    actividad: MyActivityItemDto?,
    habilitado: Boolean,
    onAbrir: () -> Unit,
    onQuitar: () -> Unit,
) {
    NxPanelShell(onClick = if (habilitado) onAbrir else null) {
        Row(
            modifier = Modifier.fillMaxWidth().heightIn(min = AlturaToque),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(10.dp),
        ) {
            Column(Modifier.weight(1f)) {
                Text(
                    "Actividad",
                    style = MaterialTheme.typography.labelMedium,
                    color = NxColors.Muted,
                )
                Text(
                    actividad?.let { a ->
                        listOfNotNull(a.anNumber, a.titulo).firstOrNull { it.isNotBlank() }
                            ?: "Actividad #${a.id}"
                    } ?: "Sin actividad (opcional)",
                    style = MaterialTheme.typography.bodyLarge,
                    color = if (actividad == null) NxColors.Muted else NxColors.Slate,
                    maxLines = 2,
                    overflow = TextOverflow.Ellipsis,
                )
            }
            if (actividad != null) {
                TextButton(onClick = onQuitar, enabled = habilitado) { Text("Quitar") }
            }
        }
    }
}

/** La evidencia. Sin ella el servidor rechaza el alta, así que se pide de frente. */
@Composable
private fun FotoDelTicket(
    ticket: GeoPhoto?,
    habilitado: Boolean,
    onTomar: () -> Unit,
) {
    NxPanelShell {
        Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
            NxSectionHeader(
                title = "Foto del ticket",
                subtitle = "Obligatoria: es el comprobante del gasto.",
            )
            if (ticket != null) {
                Image(
                    bitmap = ticket.preview.asImageBitmap(),
                    contentDescription = "Ticket fotografiado",
                    contentScale = ContentScale.Crop,
                    modifier = Modifier
                        .fillMaxWidth()
                        .height(180.dp)
                        .clip(RoundedCornerShape(12.dp)),
                )
            }
            OutlinedButton(
                onClick = onTomar,
                enabled = habilitado,
                modifier = Modifier.fillMaxWidth().heightIn(min = AlturaToque),
            ) {
                Icon(Icons.Default.PhotoCamera, contentDescription = null, modifier = Modifier.size(18.dp))
                Spacer(Modifier.size(8.dp))
                Text(if (ticket == null) "Tomar foto del ticket" else "Tomar otra")
            }
        }
    }
}
