package mx.nexara.mobile.nativeapp.ui.console.herramientas

import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.PhotoCamera
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.RadioButton
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
import androidx.compose.ui.unit.dp
import androidx.compose.ui.window.Dialog
import mx.nexara.mobile.nativeapp.data.api.PrestamoHerramientaDto
import mx.nexara.mobile.nativeapp.ui.common.GeoPhoto
import mx.nexara.mobile.nativeapp.ui.common.LiveCameraCaptureDialog
import mx.nexara.mobile.nativeapp.ui.common.ProtectedImage
import mx.nexara.mobile.nativeapp.ui.enterprise.NxColors
import mx.nexara.mobile.nativeapp.ui.enterprise.NxDenseSectionHeader
import mx.nexara.mobile.nativeapp.ui.enterprise.NxFormTextField
import mx.nexara.mobile.nativeapp.ui.enterprise.NxStatusChip
import mx.nexara.mobile.nativeapp.ui.enterprise.NxTone
import mx.nexara.mobile.nativeapp.ui.enterprise.NxUi
import mx.nexara.mobile.nativeapp.ui.enterprise.bg

/** Lado de la miniatura de una foto de evidencia. */
private val LadoMiniatura = 84.dp

/**
 * Fotos tomadas con la cámara en vivo, con su miniatura y «Quitar». La evidencia se toma en el
 * momento: no se elige de la galería, para que la foto sea de esta entrega y no de otra.
 *
 * También la usa la salida de material de Almacén.
 */
@Composable
internal fun FotosDeEvidencia(
    titulo: String,
    fotos: List<GeoPhoto>,
    maximo: Int,
    enabled: Boolean,
    onTomar: () -> Unit,
    onQuitar: (GeoPhoto) -> Unit,
    hint: String? = null,
) {
    Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
        NxDenseSectionHeader(title = titulo, hint = hint)
        if (fotos.isNotEmpty()) {
            Row(
                horizontalArrangement = Arrangement.spacedBy(10.dp),
                modifier = Modifier.fillMaxWidth().horizontalScroll(rememberScrollState()),
            ) {
                fotos.forEachIndexed { i, foto ->
                    Column(horizontalAlignment = Alignment.CenterHorizontally) {
                        Image(
                            bitmap = foto.preview.asImageBitmap(),
                            contentDescription = "Foto ${i + 1}",
                            contentScale = ContentScale.Crop,
                            modifier = Modifier.size(LadoMiniatura).clip(RoundedCornerShape(NxUi.RadiusLg)),
                        )
                        TextButton(
                            onClick = { onQuitar(foto) },
                            enabled = enabled,
                            modifier = Modifier.heightIn(min = AlturaToque),
                        ) { Text("Quitar") }
                    }
                }
            }
        }
        if (fotos.size < maximo) {
            OutlinedButton(
                onClick = onTomar,
                enabled = enabled,
                modifier = Modifier.fillMaxWidth().heightIn(min = AlturaToque),
            ) {
                Icon(Icons.Default.PhotoCamera, contentDescription = null, modifier = Modifier.size(18.dp))
                Spacer(Modifier.size(8.dp))
                Text(if (fotos.isEmpty()) "Tomar foto" else "Tomar otra (${fotos.size} de $maximo)")
            }
        } else {
            Text("Ya son $maximo fotos, el máximo.", style = MaterialTheme.typography.labelMedium, color = NxColors.Muted)
        }
    }
}

/**
 * «Entregar»: el código de quien la recoge (si el préstamo lo tiene) y las fotos de cómo sale.
 * Sin foto no hay entrega: es lo que después permite decir si volvió igual.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
internal fun HojaEntregarHerramienta(
    titulo: String,
    persona: String,
    pideCodigo: Boolean,
    enviando: Boolean,
    error: String?,
    onEntregar: (codigo: String?, fotos: List<GeoPhoto>) -> Unit,
    onCerrar: () -> Unit,
    codigoVencido: Boolean = false,
    /**
     * Si sin código no se puede mandar. El escáner enseña el campo siempre y solo lo exige cuando
     * sabe que el préstamo tiene código; si no lo sabe, decide el servidor.
     */
    codigoObligatorio: Boolean = pideCodigo,
) {
    val estadoHoja = rememberModalBottomSheetState(skipPartiallyExpanded = true)
    var codigo by remember { mutableStateOf("") }
    var fotos by remember { mutableStateOf<List<GeoPhoto>>(emptyList()) }
    var camara by remember { mutableStateOf(false) }

    val falta = EvidenciaPrestamoRules.faltaParaEntregar(pideCodigo && codigoObligatorio, codigo, fotos.size)

    ModalBottomSheet(onDismissRequest = { if (!enviando) onCerrar() }, sheetState = estadoHoja) {
        Column(
            modifier = Modifier
                .verticalScroll(rememberScrollState())
                .padding(start = 20.dp, end = 20.dp, bottom = 28.dp),
            verticalArrangement = Arrangement.spacedBy(14.dp),
        ) {
            Text(
                "Entregar herramienta",
                style = MaterialTheme.typography.titleMedium.copy(fontWeight = FontWeight.Bold),
                color = NxColors.Slate,
            )
            Text(titulo, style = MaterialTheme.typography.bodyLarge.copy(fontWeight = FontWeight.SemiBold), color = NxColors.Slate)
            Text("Se la lleva $persona.", style = MaterialTheme.typography.bodyMedium, color = NxColors.Slate)
            if (codigoVencido) {
                Text(
                    "El código de recolección ya venció: genera otro en Préstamos.",
                    style = MaterialTheme.typography.bodyMedium,
                    color = NxColors.Danger,
                )
            }
            if (pideCodigo) {
                NxFormTextField(
                    value = codigo,
                    onValueChange = { codigo = it.take(12) },
                    label = "Código que enseña quien la recoge",
                    imeAction = ImeAction.Done,
                )
            }
            FotosDeEvidencia(
                titulo = "Cómo sale",
                hint = "La herramienta completa y, si ya trae golpes o desgaste, un acercamiento.",
                fotos = fotos,
                maximo = EvidenciaPrestamoRules.MAX_FOTOS,
                enabled = !enviando,
                onTomar = { camara = true },
                onQuitar = { quitada -> fotos = fotos.filter { it !== quitada } },
            )
            error?.let { Text(it, style = MaterialTheme.typography.bodySmall, color = NxColors.Danger) }
            BotonDeHoja(
                texto = "Entregar",
                enviando = enviando,
                habilitado = falta == null,
                onClick = { if (falta == null) onEntregar(codigo.trim().takeIf { pideCodigo }, fotos) },
            )
            falta?.let { Text(it, style = MaterialTheme.typography.bodySmall, color = NxColors.Warning) }
            TextButton(
                onClick = onCerrar,
                enabled = !enviando,
                modifier = Modifier.fillMaxWidth().heightIn(min = AlturaToque),
            ) { Text("Cancelar") }
        }
    }

    if (camara) {
        LiveCameraCaptureDialog(
            title = "Cómo sale",
            requireLocation = false,
            captureLocation = false,
            subtitle = "Encuadra la herramienta completa.",
            onCaptured = { foto ->
                fotos = (fotos + foto).take(EvidenciaPrestamoRules.MAX_FOTOS)
                camara = false
            },
            onDismiss = { camara = false },
        )
    }
}

/**
 * «Recibir»: enseña cómo salió, pregunta cómo volvió y pide las fotos de después. Dañada o
 * incompleta piden explicación; extraviada no pide foto porque no hay qué fotografiar.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
internal fun HojaRecibirHerramienta(
    titulo: String,
    persona: String,
    fotosDeSalida: List<String>,
    enviando: Boolean,
    error: String?,
    onRecibir: (condicion: EvidenciaPrestamoRules.Condicion, descripcion: String?, fotos: List<GeoPhoto>) -> Unit,
    onCerrar: () -> Unit,
) {
    val estadoHoja = rememberModalBottomSheetState(skipPartiallyExpanded = true)
    var condicion by remember { mutableStateOf<EvidenciaPrestamoRules.Condicion?>(null) }
    var descripcion by remember { mutableStateOf("") }
    var fotos by remember { mutableStateOf<List<GeoPhoto>>(emptyList()) }
    var camara by remember { mutableStateOf(false) }

    val falta = EvidenciaPrestamoRules.faltaParaRecibir(condicion, descripcion, fotos.size)

    ModalBottomSheet(onDismissRequest = { if (!enviando) onCerrar() }, sheetState = estadoHoja) {
        Column(
            modifier = Modifier
                .verticalScroll(rememberScrollState())
                .padding(start = 20.dp, end = 20.dp, bottom = 28.dp),
            verticalArrangement = Arrangement.spacedBy(14.dp),
        ) {
            Text(
                "Recibir herramienta",
                style = MaterialTheme.typography.titleMedium.copy(fontWeight = FontWeight.Bold),
                color = NxColors.Slate,
            )
            Text(titulo, style = MaterialTheme.typography.bodyLarge.copy(fontWeight = FontWeight.SemiBold), color = NxColors.Slate)
            Text("La regresa $persona.", style = MaterialTheme.typography.bodyMedium, color = NxColors.Slate)

            NxDenseSectionHeader(
                title = "Cómo salió",
                hint = if (fotosDeSalida.isEmpty()) "Salió sin foto: no hay con qué comparar." else "Compárala con estas fotos.",
            )
            MiniaturasProtegidas(urls = fotosDeSalida, descripcion = "Cómo salió")

            NxDenseSectionHeader(title = "¿Cómo volvió?")
            EvidenciaPrestamoRules.Condicion.entries.forEach { opcion ->
                Row(
                    verticalAlignment = Alignment.CenterVertically,
                    modifier = Modifier
                        .fillMaxWidth()
                        .heightIn(min = AlturaToque)
                        .clickable(enabled = !enviando) { condicion = opcion },
                ) {
                    RadioButton(selected = condicion == opcion, onClick = { condicion = opcion }, enabled = !enviando)
                    Column {
                        Text(
                            opcion.etiqueta,
                            style = MaterialTheme.typography.bodyMedium.copy(fontWeight = FontWeight.SemiBold),
                            color = NxColors.Slate,
                        )
                        Text(opcion.ayuda, style = MaterialTheme.typography.labelMedium, color = NxColors.Muted)
                    }
                }
            }

            if (condicion?.pideFoto != false) {
                FotosDeEvidencia(
                    titulo = "Cómo volvió",
                    hint = "Desde el mismo ángulo que al salir; si hay daño, un acercamiento.",
                    fotos = fotos,
                    maximo = EvidenciaPrestamoRules.MAX_FOTOS,
                    enabled = !enviando,
                    onTomar = { camara = true },
                    onQuitar = { quitada -> fotos = fotos.filter { it !== quitada } },
                )
            }

            NxFormTextField(
                value = descripcion,
                onValueChange = { descripcion = it.take(500) },
                label = EvidenciaPrestamoRules.preguntaDescripcion(condicion),
                singleLine = false,
                minLines = 2,
                imeAction = ImeAction.Done,
            )

            error?.let { Text(it, style = MaterialTheme.typography.bodySmall, color = NxColors.Danger) }
            BotonDeHoja(
                texto = "Recibir",
                enviando = enviando,
                habilitado = falta == null,
                onClick = {
                    val elegida = condicion
                    if (falta == null && elegida != null) {
                        onRecibir(
                            elegida,
                            descripcion.trim().takeIf { it.isNotEmpty() },
                            if (elegida.pideFoto) fotos else emptyList(),
                        )
                    }
                },
            )
            falta?.let { Text(it, style = MaterialTheme.typography.bodySmall, color = NxColors.Warning) }
            TextButton(
                onClick = onCerrar,
                enabled = !enviando,
                modifier = Modifier.fillMaxWidth().heightIn(min = AlturaToque),
            ) { Text("Cancelar") }
        }
    }

    if (camara) {
        LiveCameraCaptureDialog(
            title = "Cómo volvió",
            requireLocation = false,
            captureLocation = false,
            subtitle = "Encuadra la herramienta como en la foto de salida.",
            onCaptured = { foto ->
                fotos = (fotos + foto).take(EvidenciaPrestamoRules.MAX_FOTOS)
                camara = false
            },
            onDismiss = { camara = false },
        )
    }
}

/**
 * Antes y después de un préstamo, dentro de su tarjeta: cómo salió, cómo volvió, en qué
 * condición y quién firmó cada paso. Lo que falta se dice («Salió sin foto»). No pinta nada en
 * un préstamo que todavía no sale.
 */
@Composable
internal fun EvidenciaDelPrestamo(prestamo: PrestamoHerramientaDto) {
    val salida = EvidenciaPrestamoRules.urls(prestamo.deliveryPhotos)
    val entrada = EvidenciaPrestamoRules.urls(prestamo.returnPhotos)
    val falta = EvidenciaPrestamoRules.faltaEvidencia(prestamo)
    val condicion = EvidenciaPrestamoRules.etiquetaCondicion(prestamo)
    val firmas = EvidenciaPrestamoRules.quienesFirmaron(prestamo)
    if (salida.isEmpty() && entrada.isEmpty() && falta == null && condicion == null && firmas.isEmpty()) return

    Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
        if (salida.isNotEmpty()) {
            Text("Cómo salió", style = MaterialTheme.typography.labelMedium, color = NxColors.Muted)
            MiniaturasProtegidas(urls = salida, descripcion = "Cómo salió")
        }
        if (entrada.isNotEmpty() || condicion != null) {
            Text(
                listOfNotNull("Cómo volvió", condicion).joinToString(": "),
                style = MaterialTheme.typography.labelMedium,
                color = NxColors.Muted,
            )
            MiniaturasProtegidas(urls = entrada, descripcion = "Cómo volvió")
        }
        prestamo.returnNotes?.trim()?.takeIf { it.isNotEmpty() }?.let {
            Text(it, style = MaterialTheme.typography.bodySmall, color = NxColors.Slate)
        }
        if (firmas.isNotEmpty()) {
            Text(firmas, style = MaterialTheme.typography.labelSmall, color = NxColors.Muted)
        }
        falta?.let { NxStatusChip(it, NxTone.Warning) }
    }
}

/** Miniaturas de fotos guardadas en el servidor. Un toque abre la foto completa. */
@Composable
internal fun MiniaturasProtegidas(urls: List<String>, descripcion: String) {
    if (urls.isEmpty()) return
    var abierta by remember { mutableStateOf<String?>(null) }
    Row(
        horizontalArrangement = Arrangement.spacedBy(8.dp),
        modifier = Modifier.fillMaxWidth().horizontalScroll(rememberScrollState()),
    ) {
        urls.forEachIndexed { i, url ->
            Box(
                modifier = Modifier
                    .size(LadoMiniatura)
                    .clip(RoundedCornerShape(NxUi.RadiusLg))
                    .background(NxTone.Neutral.bg())
                    .clickable { abierta = url },
            ) {
                ProtectedImage(
                    url = url,
                    contentDescription = "$descripcion, foto ${i + 1}",
                    modifier = Modifier.fillMaxSize(),
                )
            }
        }
    }
    abierta?.let { url ->
        Dialog(onDismissRequest = { abierta = null }) {
            Column(
                horizontalAlignment = Alignment.CenterHorizontally,
                verticalArrangement = Arrangement.spacedBy(8.dp),
                modifier = Modifier
                    .clip(RoundedCornerShape(NxUi.RadiusLg))
                    .background(Color.Black)
                    .padding(8.dp),
            ) {
                ProtectedImage(
                    url = url,
                    contentDescription = descripcion,
                    contentScale = ContentScale.Fit,
                    modifier = Modifier.fillMaxWidth().heightIn(min = 240.dp, max = 520.dp),
                )
                TextButton(onClick = { abierta = null }, modifier = Modifier.heightIn(min = AlturaToque)) {
                    Text("Cerrar", color = Color.White)
                }
            }
        }
    }
}
