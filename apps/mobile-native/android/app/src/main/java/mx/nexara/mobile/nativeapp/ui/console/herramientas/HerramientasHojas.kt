package mx.nexara.mobile.nativeapp.ui.console.herramientas

import androidx.compose.foundation.Image
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
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
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FilterChip
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.rememberModalBottomSheetState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.unit.dp
import java.time.LocalDate
import kotlinx.coroutines.delay
import mx.nexara.mobile.nativeapp.data.api.HerramientaActividadDto
import mx.nexara.mobile.nativeapp.data.api.KitPiezaDto
import mx.nexara.mobile.nativeapp.data.api.toUserMessage
import mx.nexara.mobile.nativeapp.ui.common.GeoPhoto
import mx.nexara.mobile.nativeapp.ui.common.LiveCameraCaptureDialog
import mx.nexara.mobile.nativeapp.ui.console.activities.DatePickerField
import mx.nexara.mobile.nativeapp.ui.enterprise.NxColors
import mx.nexara.mobile.nativeapp.ui.enterprise.NxDenseSectionHeader
import mx.nexara.mobile.nativeapp.ui.enterprise.NxEmptyState
import mx.nexara.mobile.nativeapp.ui.enterprise.NxFormTextField
import mx.nexara.mobile.nativeapp.ui.enterprise.NxSearchField
import mx.nexara.mobile.nativeapp.ui.enterprise.NxUi

/** Lo que tarda en buscar desde la última letra: en campo, una petición por tecla es una pantalla parpadeando. */
private const val ESPERA_BUSQUEDA_MS = 350L

/**
 * «Pedir préstamo»: qué herramienta, cuándo la regresas, para qué y, si quieres, para qué actividad.
 *
 * El botón dice qué falta en vez de quedarse gris y callado. Si la búsqueda no encuentra nada no es un
 * error: hoy el inventario está vacío, y el texto dice qué sigue.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
internal fun HojaPedirPrestamo(
    hoy: LocalDate,
    enviando: Boolean,
    error: String?,
    buscar: suspend (String) -> List<KitPiezaDto>,
    cargarActividades: suspend () -> List<HerramientaActividadDto>,
    onPedir: (piezaId: Long, regreso: LocalDate, motivo: String, actividadId: Long?) -> Unit,
    onCerrar: () -> Unit,
) {
    val estadoHoja = rememberModalBottomSheetState(skipPartiallyExpanded = true)
    var consulta by remember { mutableStateOf("") }
    var resultados by remember { mutableStateOf<List<KitPiezaDto>?>(null) }
    var errorBusqueda by remember { mutableStateOf<String?>(null) }
    var pieza by remember { mutableStateOf<KitPiezaDto?>(null) }
    var regresoTexto by remember { mutableStateOf("") }
    var motivo by remember { mutableStateOf("") }
    var actividades by remember { mutableStateOf<List<HerramientaActividadDto>>(emptyList()) }
    var actividad by remember { mutableStateOf<HerramientaActividadDto?>(null) }
    var menuAbierto by remember { mutableStateOf(false) }

    LaunchedEffect(Unit) { actividades = cargarActividades() }

    // Cambiar la consulta cancela la búsqueda en curso: siempre gana la última letra.
    LaunchedEffect(consulta) {
        errorBusqueda = null
        val texto = consulta.trim()
        if (texto.isEmpty()) {
            resultados = null
            return@LaunchedEffect
        }
        delay(ESPERA_BUSQUEDA_MS)
        try {
            resultados = buscar(texto)
        } catch (e: kotlinx.coroutines.CancellationException) {
            throw e
        } catch (e: Throwable) {
            resultados = null
            errorBusqueda = e.toUserMessage("No se pudo buscar en el inventario")
        }
    }

    val regreso = HerramientasRules.fecha(regresoTexto)
    val falta = HerramientasRules.faltaParaPedir(pieza?.id, regreso, motivo, hoy)

    ModalBottomSheet(onDismissRequest = { if (!enviando) onCerrar() }, sheetState = estadoHoja) {
        Column(
            modifier = Modifier
                .verticalScroll(rememberScrollState())
                .padding(start = 20.dp, end = 20.dp, bottom = 28.dp),
            verticalArrangement = Arrangement.spacedBy(14.dp),
        ) {
            Text(
                "Pedir préstamo",
                style = MaterialTheme.typography.titleMedium.copy(fontWeight = FontWeight.Bold),
                color = NxColors.Slate,
            )

            NxDenseSectionHeader(title = "¿Qué herramienta?", hint = HerramientasRules.AYUDA_BUSQUEDA)
            val elegida = pieza
            if (elegida != null) {
                FilterChip(
                    selected = true,
                    onClick = { pieza = null },
                    enabled = !enviando,
                    label = {
                        Text(
                            listOf(HerramientasRules.tituloPieza(elegida))
                                .plus(HerramientasRules.renglonesPieza(elegida))
                                .joinToString(" · "),
                        )
                    },
                    modifier = Modifier.fillMaxWidth().heightIn(min = AlturaToque),
                )
            } else {
                NxSearchField(
                    value = consulta,
                    onValueChange = { consulta = it },
                    placeholder = "Buscar herramienta",
                )
                errorBusqueda?.let { Text(it, style = MaterialTheme.typography.bodySmall, color = NxColors.Danger) }
                resultados?.let { lista ->
                    if (lista.isEmpty()) {
                        val vacio = HerramientasRules.vacioDeBusqueda(consulta)
                        NxEmptyState(title = vacio.titulo, subtitle = vacio.texto)
                    }
                    lista.forEach { opcion ->
                        Column(
                            modifier = Modifier
                                .fillMaxWidth()
                                .clickable { pieza = opcion }
                                .padding(vertical = 10.dp),
                        ) {
                            Text(
                                HerramientasRules.tituloPieza(opcion),
                                style = MaterialTheme.typography.bodyMedium.copy(fontWeight = FontWeight.SemiBold),
                                color = NxColors.Slate,
                            )
                            Text(
                                HerramientasRules.renglonesPieza(opcion).joinToString(" · "),
                                style = MaterialTheme.typography.labelMedium,
                                color = NxColors.Muted,
                            )
                        }
                    }
                }
            }

            DatePickerField(
                label = "¿Cuándo la regresas?",
                value = regresoTexto,
                onValueChange = { regresoTexto = it },
            )

            NxFormTextField(
                value = motivo,
                onValueChange = { motivo = it.take(500) },
                label = "¿Para qué la necesitas?",
                singleLine = false,
                minLines = 2,
                imeAction = ImeAction.Done,
            )

            // Sin actividades abiertas no hay nada que elegir: es un préstamo suelto.
            if (actividades.isNotEmpty()) {
                Box {
                    OutlinedButton(
                        onClick = { menuAbierto = true },
                        enabled = !enviando,
                        modifier = Modifier.fillMaxWidth().heightIn(min = AlturaToque),
                    ) {
                        Text(actividad?.let(::textoActividad) ?: "Actividad (opcional)")
                    }
                    DropdownMenu(expanded = menuAbierto, onDismissRequest = { menuAbierto = false }) {
                        DropdownMenuItem(
                            text = { Text("Sin actividad") },
                            onClick = {
                                actividad = null
                                menuAbierto = false
                            },
                        )
                        actividades.forEach { opcion ->
                            DropdownMenuItem(
                                text = { Text(textoActividad(opcion)) },
                                onClick = {
                                    actividad = opcion
                                    menuAbierto = false
                                },
                            )
                        }
                    }
                }
            }

            error?.let { Text(it, style = MaterialTheme.typography.bodySmall, color = NxColors.Danger) }

            BotonDeHoja(
                texto = "Pedir préstamo",
                enviando = enviando,
                habilitado = falta == null,
                onClick = {
                    val id = pieza?.id
                    val fecha = regreso
                    if (falta == null && id != null && fecha != null) {
                        onPedir(id, fecha, motivo, actividad?.id)
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
}

private fun textoActividad(a: HerramientaActividadDto): String =
    listOfNotNull(a.anNumber?.trim()?.ifEmpty { null }, a.titulo?.trim()?.ifEmpty { null })
        .joinToString(" · ")
        .ifEmpty { "Actividad ${a.id}" }

/** «Nueva herramienta» (Iván): nombre, modelo, serie y las dos fotos que exige el servidor. */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
internal fun HojaNuevaHerramienta(
    enviando: Boolean,
    error: String?,
    onGuardar: (nombre: String, modelo: String, serie: String, panoramica: GeoPhoto, fotoSerie: GeoPhoto) -> Unit,
    onCerrar: () -> Unit,
) {
    val estadoHoja = rememberModalBottomSheetState(skipPartiallyExpanded = true)
    var nombre by remember { mutableStateOf("") }
    var modelo by remember { mutableStateOf("") }
    var serie by remember { mutableStateOf("") }
    var panoramica by remember { mutableStateOf<GeoPhoto?>(null) }
    var fotoSerie by remember { mutableStateOf<GeoPhoto?>(null) }
    /** Qué foto se está tomando: «completa», «serie» o ninguna. */
    var camara by remember { mutableStateOf<String?>(null) }

    val falta = HerramientasRules.faltaParaAlta(nombre, modelo, serie, panoramica != null, fotoSerie != null)

    ModalBottomSheet(onDismissRequest = { if (!enviando) onCerrar() }, sheetState = estadoHoja) {
        Column(
            modifier = Modifier
                .verticalScroll(rememberScrollState())
                .padding(start = 20.dp, end = 20.dp, bottom = 28.dp),
            verticalArrangement = Arrangement.spacedBy(14.dp),
        ) {
            Text(
                "Nueva herramienta",
                style = MaterialTheme.typography.titleMedium.copy(fontWeight = FontWeight.Bold),
                color = NxColors.Slate,
            )
            NxFormTextField(value = nombre, onValueChange = { nombre = it.take(120) }, label = "Nombre")
            NxFormTextField(value = modelo, onValueChange = { modelo = it.take(120) }, label = "Modelo")
            NxFormTextField(
                value = serie,
                onValueChange = { serie = it.take(120) },
                label = "Número de serie",
                imeAction = ImeAction.Done,
            )
            CampoDeFoto(
                titulo = "Foto de la herramienta completa",
                foto = panoramica,
                enabled = !enviando,
                onTomar = { camara = FOTO_COMPLETA },
            )
            CampoDeFoto(
                titulo = "Foto del número de serie",
                foto = fotoSerie,
                enabled = !enviando,
                onTomar = { camara = FOTO_SERIE },
            )
            error?.let { Text(it, style = MaterialTheme.typography.bodySmall, color = NxColors.Danger) }
            BotonDeHoja(
                texto = "Dar de alta",
                enviando = enviando,
                habilitado = falta == null,
                onClick = {
                    val completa = panoramica
                    val deSerie = fotoSerie
                    if (falta == null && completa != null && deSerie != null) {
                        onGuardar(nombre, modelo, serie, completa, deSerie)
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

    camara?.let { cual ->
        LiveCameraCaptureDialog(
            title = if (cual == FOTO_COMPLETA) "Herramienta completa" else "Número de serie",
            requireLocation = false,
            captureLocation = false,
            subtitle = if (cual == FOTO_COMPLETA) {
                "Encuadra la herramienta completa."
            } else {
                "Acércate hasta que se lea el número."
            },
            onCaptured = { foto ->
                if (cual == FOTO_COMPLETA) panoramica = foto else fotoSerie = foto
                camara = null
            },
            onDismiss = { camara = null },
        )
    }
}

private const val FOTO_COMPLETA = "completa"
private const val FOTO_SERIE = "serie"

/** Una foto tomada con la cámara en vivo, con su vista previa. También la usa el comprobante de un pago. */
@Composable
internal fun CampoDeFoto(
    titulo: String,
    foto: GeoPhoto?,
    enabled: Boolean,
    onTomar: () -> Unit,
    hint: String? = null,
) {
    Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
        NxDenseSectionHeader(title = titulo, hint = hint)
        foto?.let {
            Image(
                bitmap = it.preview.asImageBitmap(),
                contentDescription = titulo,
                contentScale = ContentScale.Crop,
                modifier = Modifier
                    .fillMaxWidth()
                    .height(160.dp)
                    .clip(RoundedCornerShape(NxUi.RadiusLg)),
            )
        }
        OutlinedButton(
            onClick = onTomar,
            enabled = enabled,
            modifier = Modifier.fillMaxWidth().heightIn(min = AlturaToque),
        ) {
            Icon(Icons.Default.PhotoCamera, contentDescription = null, modifier = Modifier.size(18.dp))
            Spacer(Modifier.size(8.dp))
            Text(if (foto == null) "Tomar foto" else "Tomar otra")
        }
    }
}

/** El botón principal de una hoja, con su estado de «enviando» a la vista. */
@Composable
internal fun BotonDeHoja(
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
            CircularProgressIndicator(color = Color.White, strokeWidth = 2.dp, modifier = Modifier.size(20.dp))
            Spacer(Modifier.size(10.dp))
            Text("Enviando…")
        } else {
            Text(texto, fontWeight = FontWeight.Bold)
        }
    }
}
