package mx.nexara.mobile.nativeapp.ui.console.vehiculos

import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
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
import androidx.compose.material.icons.outlined.CheckCircle
import androidx.compose.material.icons.outlined.Info
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.FilterChip
import androidx.compose.material3.FilterChipDefaults
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.activity.compose.BackHandler
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateMapOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import java.time.Instant
import java.time.ZoneId
import java.time.format.DateTimeFormatter
import kotlinx.coroutines.launch
import mx.nexara.mobile.nativeapp.data.api.TableroLeidoDto
import mx.nexara.mobile.nativeapp.ui.common.GeoPhoto
import mx.nexara.mobile.nativeapp.ui.common.LiveCameraCaptureDialog
import mx.nexara.mobile.nativeapp.ui.console.vehiculos.ChecklistVehiculoRules.Grupo
import mx.nexara.mobile.nativeapp.ui.console.vehiculos.ChecklistVehiculoRules.Slot
import mx.nexara.mobile.nativeapp.ui.enterprise.NxColors
import mx.nexara.mobile.nativeapp.ui.enterprise.NxErrorBlock
import mx.nexara.mobile.nativeapp.ui.enterprise.NxFormTextField
import mx.nexara.mobile.nativeapp.ui.enterprise.NxGlyph
import mx.nexara.mobile.nativeapp.ui.enterprise.NxSectionHeader
import mx.nexara.mobile.nativeapp.ui.enterprise.icon

/** Los cuatro pasos del checklist, en orden. */
private enum class Paso(val titulo: String) {
    FOTOS("Fotos"),
    TABLERO("Tablero"),
    DATOS("Km y combustible"),
    CONFIRMAR("Confirmar"),
    REGRESO("Regreso"),
}

/** La salida va por sus cuatro pasos; el regreso junta tablero, datos y confirmar en una pantalla. */
private val PASOS_SALIDA = listOf(Paso.FOTOS, Paso.TABLERO, Paso.DATOS, Paso.CONFIRMAR)
private val PASOS_REGRESO = listOf(Paso.FOTOS, Paso.REGRESO)

private val HORA_MEXICO: DateTimeFormatter =
    DateTimeFormatter.ofPattern("HH:mm").withZone(ZoneId.of("America/Mexico_City"))

private fun horaDe(capturedAt: String?): String? =
    capturedAt?.let { runCatching { HORA_MEXICO.format(Instant.parse(it)) }.getOrNull() }

/**
 * Checklist de salida / devolución: 7 fotos con cámara en vivo, km y nivel de
 * combustible. No hay galería en ningún paso — el servidor rechaza una foto sin
 * hora, y así es como se niegan las subidas de galería.
 *
 * @param kmInicio en devolución, el km con el que salió (piso del km final).
 * @param encabezadoRegreso con valor, el flujo es el regreso: «Regreso del vehículo» y estas líneas.
 * @param leerTablero lee km y gasolina de la foto; `null` si no pudo, y entonces se captura a mano.
 */
@Composable
fun ChecklistVehiculoFlow(
    titulo: String,
    vehiculo: String,
    enviando: Boolean,
    error: String?,
    onCancelar: () -> Unit,
    onEnviar: (fotos: Map<String, GeoPhoto>, odometroKm: Int, combustible: String) -> Unit,
    kmInicio: Int? = null,
    encabezadoRegreso: List<String>? = null,
    leerTablero: (suspend (GeoPhoto) -> TableroLeidoDto?)? = null,
) {
    val pasos = if (encabezadoRegreso != null) PASOS_REGRESO else PASOS_SALIDA
    val fotos = remember { mutableStateMapOf<String, GeoPhoto>() }
    var paso by remember { mutableStateOf(Paso.FOTOS) }
    var km by remember { mutableStateOf("") }
    var nivel by remember { mutableStateOf<String?>(null) }
    var kmEscrito by remember { mutableStateOf(false) }
    var nivelEscrito by remember { mutableStateOf(false) }
    var lectura by remember { mutableStateOf(LecturaTablero.SIN_FOTO) }
    val scope = rememberCoroutineScope()
    val permiso = rememberPermisoLecturaIa()
    var abierta by remember { mutableStateOf<Slot?>(null) }
    var aviso by remember { mutableStateOf<String?>(null) }
    var confirmaSalir by remember { mutableStateOf(false) }
    val tieneAvance = fotos.isNotEmpty() || km.isNotBlank() || nivel != null

    fun pedirSalir() {
        if (tieneAvance && !enviando) confirmaSalir = true else onCancelar()
    }

    BackHandler(enabled = !enviando) {
        if (paso == Paso.FOTOS) pedirSalir() else {
            aviso = null
            paso = pasos[pasos.indexOf(paso) - 1]
        }
    }

    /** Lo leído llena lo que la persona no ha escrito; si no se pudo, se escribe a mano. */
    fun leerFotoDelTablero(foto: GeoPhoto) {
        val leer = leerTablero ?: return
        if (!permiso.puedeLeer) return
        lectura = LecturaTablero.LEYENDO
        scope.launch {
            val r = leer(foto)
            km = GasolinaRules.tras(r?.odometroKm?.toString(), km, kmEscrito)
            r?.combustible?.takeIf { ChecklistVehiculoRules.combustiblePct(it) != null }?.let { leido ->
                if (!nivelEscrito || nivel == null) nivel = leido
            }
            lectura = if (r?.odometroKm != null || r?.combustible != null) LecturaTablero.LEIDA else LecturaTablero.NO_SE_PUDO
        }
    }

    val metas = fotos.mapValues { (_, foto) ->
        ChecklistVehiculoRules.SlotMeta(
            capturedAt = foto.capturedAt,
            lat = foto.latitude,
            lng = foto.longitude,
        )
    }
    val validacion = ChecklistVehiculoRules.validar(
        metas = metas,
        odometroKm = km.trim().toIntOrNull(),
        combustible = nivel,
        kmInicio = kmInicio,
    )

    fun faltaEn(slots: List<Slot>): String? =
        slots.filter { fotos[it.id] == null }.map { it.etiqueta }
            .takeIf { it.isNotEmpty() }
            ?.let { "Faltan fotos: ${it.joinToString(", ")}" }

    fun avanzar() {
        aviso = when (paso) {
            Paso.FOTOS -> faltaEn(ChecklistVehiculoRules.SLOTS_FOTOS)
            Paso.TABLERO -> faltaEn(ChecklistVehiculoRules.slots(Grupo.TABLERO))
            Paso.DATOS -> validacion.errores.firstOrNull()
            Paso.CONFIRMAR, Paso.REGRESO -> validacion.mensaje
        }
        if (aviso != null) return
        val siguiente = pasos.getOrNull(pasos.indexOf(paso) + 1)
        if (siguiente != null) {
            paso = siguiente
        } else {
            onEnviar(fotos.toMap(), km.trim().toInt(), nivel.orEmpty())
        }
    }

    /** Solo el tablero se lee: las otras fotos no van a ningún servicio. */
    fun tomarFoto(slot: Slot) {
        if (slot.id == ChecklistVehiculoRules.TABLERO && leerTablero != null) {
            permiso.antesDeLaFoto { abierta = slot }
        } else {
            abierta = slot
        }
    }

    AvisoLecturaIa(permiso)

    if (paso == Paso.REGRESO) {
        val tablero = fotos[ChecklistVehiculoRules.TABLERO]
        RegresoVehiculoContenido(
            encabezado = encabezadoRegreso.orEmpty(),
            foto = tablero?.preview,
            horaFoto = horaDe(tablero?.capturedAt),
            lectura = lectura,
            km = km,
            nivel = nivel,
            kmInicio = kmInicio,
            aviso = aviso,
            error = error,
            enviando = enviando,
            onFoto = { tomarFoto(ChecklistVehiculoRules.slots(Grupo.TABLERO).first()) },
            onKm = {
                km = it
                kmEscrito = true
                aviso = null
            },
            onNivel = {
                nivel = it
                nivelEscrito = true
                aviso = null
            },
            onConfirmar = { avanzar() },
        )
    } else Column(modifier = Modifier.fillMaxSize()) {
        LazyColumn(
            modifier = Modifier.fillMaxWidth().weight(1f),
            contentPadding = PaddingValues(16.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            item {
                NxSectionHeader(
                    title = "$titulo · ${paso.titulo}",
                    subtitle = "$vehiculo · Paso ${pasos.indexOf(paso) + 1} de ${pasos.size}",
                    trailing = { PistaCamara() },
                )
            }
            when (paso) {
                Paso.FOTOS -> item {
                    RejillaFotos(
                        slots = ChecklistVehiculoRules.SLOTS_FOTOS,
                        fotos = fotos,
                        onTomar = ::tomarFoto,
                    )
                }
                Paso.TABLERO -> item {
                    RejillaFotos(
                        slots = ChecklistVehiculoRules.slots(Grupo.TABLERO),
                        fotos = fotos,
                        onTomar = ::tomarFoto,
                    )
                }
                Paso.REGRESO -> Unit
                Paso.DATOS -> {
                    if (lectura == LecturaTablero.LEIDA || lectura == LecturaTablero.LEYENDO) {
                        item {
                            Text(
                                if (lectura == LecturaTablero.LEYENDO) {
                                    "Leyendo la foto del tablero…"
                                } else {
                                    "Esto leímos en la foto. Si no cuadra, corrígelo: la foto queda de respaldo."
                                },
                                fontSize = 13.sp,
                                color = NxColors.Muted,
                            )
                        }
                    }
                    item {
                        NxFormTextField(
                            value = km,
                            onValueChange = { v ->
                                km = v.filter { it.isDigit() }.take(7)
                                kmEscrito = true
                            },
                            label = if (kmInicio != null) "Km final" else "Km",
                            keyboardType = KeyboardType.Number,
                            error = validacion.errores.firstOrNull { it.contains("kilometraje") },
                        )
                    }
                    item {
                        SelectorCombustible(
                            nivel = nivel,
                            onNivel = {
                                nivel = it
                                nivelEscrito = true
                            },
                        )
                    }
                }
                Paso.CONFIRMAR -> item {
                    Resumen(fotos = fotos, km = km, nivel = nivel)
                }
            }
            aviso?.let { texto -> item { Text(texto, color = NxColors.Danger, fontSize = 13.sp) } }
            error?.let { texto -> item { NxErrorBlock(texto) } }
            item { Spacer(Modifier.height(8.dp)) }
        }
        Row(
            modifier = Modifier.fillMaxWidth().padding(16.dp),
            horizontalArrangement = Arrangement.spacedBy(8.dp),
        ) {
            OutlinedButton(
                onClick = {
                    aviso = null
                    if (paso == Paso.FOTOS) pedirSalir() else paso = pasos[pasos.indexOf(paso) - 1]
                },
                enabled = !enviando,
                modifier = Modifier.weight(1f).heightIn(min = 48.dp),
            ) { Text(if (paso == Paso.FOTOS) "Cancelar" else "Atrás") }
            Button(
                onClick = { avanzar() },
                enabled = !enviando,
                colors = ButtonDefaults.buttonColors(containerColor = NxColors.Brand),
                modifier = Modifier.weight(1f).heightIn(min = 48.dp),
            ) {
                Text(
                    when {
                        enviando -> "Enviando…"
                        paso == Paso.CONFIRMAR -> "Enviar"
                        else -> "Siguiente"
                    },
                    fontWeight = FontWeight.Bold,
                )
            }
        }
    }

    abierta?.let { slot ->
        LiveCameraCaptureDialog(
            title = slot.etiqueta,
            requireLocation = false,
            subtitle = "Encuadra ${slot.etiqueta.lowercase()} y toca «Tomar foto».",
            onCaptured = { foto ->
                fotos[slot.id] = foto
                aviso = null
                abierta = null
                if (slot.id == ChecklistVehiculoRules.TABLERO) leerFotoDelTablero(foto)
            },
            onDismiss = { abierta = null },
        )
    }

    if (confirmaSalir) {
        AlertDialog(
            onDismissRequest = { confirmaSalir = false },
            title = { Text("¿Salir sin enviar?") },
            text = {
                Text("Las fotos del checklist solo viven en esta pantalla hasta que las envías, y si sales ahora hay que volver a tomarlas.")
            },
            confirmButton = {
                TextButton(
                    onClick = {
                        confirmaSalir = false
                        onCancelar()
                    },
                ) { Text("Salir y perder fotos") }
            },
            dismissButton = {
                TextButton(onClick = { confirmaSalir = false }) { Text("Seguir aquí") }
            },
        )
    }
}

/** El «por qué» va detrás de la ⓘ, no en un párrafo en pantalla. */
@Composable
private fun PistaCamara() {
    var abierta by remember { mutableStateOf(false) }
    Column(horizontalAlignment = Alignment.End) {
        IconButton(onClick = { abierta = !abierta }, modifier = Modifier.size(28.dp)) {
            Icon(Icons.Outlined.Info, contentDescription = "Por qué", tint = NxColors.Muted)
        }
        if (abierta) {
            Text("Solo cámara: guarda hora y GPS.", fontSize = 11.5.sp, color = NxColors.Muted)
        }
    }
}

@Composable
private fun RejillaFotos(
    slots: List<Slot>,
    fotos: Map<String, GeoPhoto>,
    onTomar: (Slot) -> Unit,
) {
    Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
        slots.forEach { slot ->
            CasillaFoto(
                slot = slot,
                foto = fotos[slot.id],
                onTomar = { onTomar(slot) },
                modifier = Modifier.fillMaxWidth(),
            )
        }
    }
}

@Composable
private fun CasillaFoto(
    slot: Slot,
    foto: GeoPhoto?,
    onTomar: () -> Unit,
    modifier: Modifier = Modifier,
) {
    Column(
        modifier = modifier.clickable { onTomar() },
        verticalArrangement = Arrangement.spacedBy(4.dp),
    ) {
        Box(
            modifier = Modifier
                .fillMaxWidth()
                .height(112.dp)
                .clip(RoundedCornerShape(12.dp))
                .background(if (foto == null) NxColors.BrandTint else Color.Black),
            contentAlignment = Alignment.Center,
        ) {
            if (foto == null) {
                Icon(NxGlyph.PHOTO.icon, contentDescription = null, tint = NxColors.Brand, modifier = Modifier.size(28.dp))
            } else {
                Image(
                    bitmap = foto.preview.asImageBitmap(),
                    contentDescription = slot.etiqueta,
                    contentScale = ContentScale.Crop,
                    modifier = Modifier.fillMaxSize(),
                )
                Icon(
                    Icons.Outlined.CheckCircle,
                    contentDescription = "Lista",
                    tint = NxColors.Success,
                    modifier = Modifier.align(Alignment.TopEnd).padding(6.dp).size(20.dp),
                )
            }
        }
        Text(
            slot.etiqueta,
            style = MaterialTheme.typography.labelMedium,
            color = if (foto == null) NxColors.Muted else NxColors.Slate,
            fontWeight = if (foto == null) FontWeight.Normal else FontWeight.SemiBold,
        )
    }
}

/** E · ¼ · ½ · ¾ · F — un toque, sin escribir. */
@Composable
private fun SelectorCombustible(nivel: String?, onNivel: (String) -> Unit) {
    Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
        Text("Combustible", style = MaterialTheme.typography.labelLarge, color = NxColors.Slate)
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            ChecklistVehiculoRules.NIVELES.forEach { valor ->
                FilterChip(
                    selected = nivel == valor,
                    onClick = { onNivel(valor) },
                    label = { Text(ChecklistVehiculoRules.nivelCorto(valor), fontWeight = FontWeight.SemiBold) },
                    colors = FilterChipDefaults.filterChipColors(
                        selectedContainerColor = NxColors.BrandSoft,
                        selectedLabelColor = NxColors.Brand,
                    ),
                    modifier = Modifier.weight(1f),
                )
            }
        }
    }
}

@Composable
private fun Resumen(fotos: Map<String, GeoPhoto>, km: String, nivel: String?) {
    Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
        ChecklistVehiculoRules.SLOTS.chunked(4).forEach { fila ->
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                fila.forEach { slot ->
                    val foto = fotos[slot.id]
                    Box(
                        modifier = Modifier
                            .weight(1f)
                            .height(64.dp)
                            .clip(RoundedCornerShape(8.dp))
                            .background(if (foto == null) NxColors.DangerSoft else Color.Black),
                        contentAlignment = Alignment.Center,
                    ) {
                        if (foto == null) {
                            Text(slot.etiqueta, fontSize = 10.sp, color = NxColors.Danger)
                        } else {
                            Image(
                                bitmap = foto.preview.asImageBitmap(),
                                contentDescription = slot.etiqueta,
                                contentScale = ContentScale.Crop,
                                modifier = Modifier.fillMaxSize(),
                            )
                        }
                    }
                }
                repeat(4 - fila.size) { Spacer(Modifier.weight(1f)) }
            }
        }
        val pct = ChecklistVehiculoRules.combustiblePct(nivel)
        Text(
            "Km $km · Combustible ${nivel?.let { ChecklistVehiculoRules.nivelCorto(it) } ?: "—"}" +
                (pct?.let { " ($it%)" } ?: ""),
            style = MaterialTheme.typography.bodyMedium,
            color = NxColors.Slate,
            fontWeight = FontWeight.SemiBold,
        )
    }
}
