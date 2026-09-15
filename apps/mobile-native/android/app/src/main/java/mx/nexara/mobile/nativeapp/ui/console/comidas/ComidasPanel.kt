package mx.nexara.mobile.nativeapp.ui.console.comidas

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableLongStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.drawBehind
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.window.Dialog
import androidx.compose.ui.window.DialogProperties
import kotlin.coroutines.cancellation.CancellationException
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import mx.nexara.mobile.nativeapp.data.api.ComidaEquipoDto
import mx.nexara.mobile.nativeapp.data.api.ComidaFilaDto
import mx.nexara.mobile.nativeapp.data.api.ComidaMiDiaDto
import mx.nexara.mobile.nativeapp.data.api.ComidaRegistroDto
import mx.nexara.mobile.nativeapp.data.api.toUserMessage
import mx.nexara.mobile.nativeapp.data.console.ComidasRepository
import mx.nexara.mobile.nativeapp.ui.common.GeoPhoto
import mx.nexara.mobile.nativeapp.ui.common.LiveCameraCaptureDialog
import mx.nexara.mobile.nativeapp.ui.common.ProtectedImage
import mx.nexara.mobile.nativeapp.ui.console.activities.CoreActivityRules
import mx.nexara.mobile.nativeapp.ui.console.activities.PersonAvatar
import mx.nexara.mobile.nativeapp.ui.console.activities.SoftNote
import mx.nexara.mobile.nativeapp.ui.console.activities.ToneChip
import mx.nexara.mobile.nativeapp.ui.enterprise.NxColors
import mx.nexara.mobile.nativeapp.ui.enterprise.NxLoadingBlock

private data class RegistroEnCurso(val momento: String, val aDestiempo: Boolean)

/**
 * Pestaña «Comidas» de Asistencias — paridad con ComidasPanel.tsx:
 * tu salida y regreso con foto (todos menos dirección) y, para jefes, las
 * comidas de su gente con aprobación de las que fueron fuera de 3 a 4 p.m.
 */
@OptIn(ExperimentalLayoutApi::class)
@Composable
fun ComidasPanel(modifier: Modifier = Modifier) {
    val context = LocalContext.current
    val repo = remember(context) { ComidasRepository(context) }
    val scope = rememberCoroutineScope()

    var mi by remember { mutableStateOf<ComidaMiDiaDto?>(null) }
    var equipo by remember { mutableStateOf<ComidaEquipoDto?>(null) }
    var loading by remember { mutableStateOf(true) }
    var error by remember { mutableStateOf<String?>(null) }
    var aviso by remember { mutableStateOf<String?>(null) }
    var reload by remember { mutableIntStateOf(0) }
    var offsetMs by remember { mutableLongStateOf(0L) }
    var nowMs by remember { mutableLongStateOf(System.currentTimeMillis()) }
    var filtro by remember { mutableStateOf(ComidasRules.Filtro.TODOS) }

    var registro by remember { mutableStateOf<RegistroEnCurso?>(null) }
    var camaraAbierta by remember { mutableStateOf(false) }
    var foto by remember { mutableStateOf<GeoPhoto?>(null) }
    var pideMotivo by remember { mutableStateOf(false) }
    var motivo by remember { mutableStateOf("") }
    var enviando by remember { mutableStateOf(false) }
    var registroError by remember { mutableStateOf<String?>(null) }

    var revisando by remember { mutableStateOf<Pair<ComidaFilaDto, Boolean>?>(null) }
    var visor by remember { mutableStateOf<Pair<String, String>?>(null) }

    LaunchedEffect(reload) {
        loading = true
        var fallo: String? = null
        try {
            val dia = withContext(Dispatchers.IO) { repo.miDia() }
            mi = dia
            offsetMs = ComidasRules.offsetMs(dia.ahora, System.currentTimeMillis())
        } catch (e: CancellationException) {
            throw e
        } catch (e: Exception) {
            fallo = e.toUserMessage("No se pudieron cargar las comidas")
        }
        try {
            equipo = withContext(Dispatchers.IO) { repo.equipo() }
        } catch (e: CancellationException) {
            throw e
        } catch (e: Exception) {
            fallo = fallo ?: e.toUserMessage("No se pudieron cargar las comidas")
        }
        error = fallo
        loading = false
    }

    // La tarjeta sabe si ya es a destiempo sin recargar: reloj del servidor cada 30 s.
    LaunchedEffect(Unit) {
        while (true) {
            nowMs = System.currentTimeMillis()
            delay(30_000)
        }
    }

    LaunchedEffect(aviso) {
        if (aviso != null) {
            delay(6_000)
            aviso = null
        }
    }

    val serverNow = nowMs + offsetMs
    val dia = mi
    val eq = equipo
    val tieneEquipo = eq != null && eq.alcance != "propio"
    val filas = ComidasRules.filtrar(eq?.filas.orEmpty(), filtro)

    fun empezar(momento: String, aDestiempo: Boolean) {
        registro = RegistroEnCurso(momento, aDestiempo)
        pideMotivo = aDestiempo
        motivo = ""
        registroError = null
        foto = null
        camaraAbierta = true
    }

    fun cerrarRegistro() {
        registro = null
        foto = null
        camaraAbierta = false
        registroError = null
    }

    fun registrar() {
        val r = registro ?: return
        val f = foto ?: return
        val texto = motivo.trim()
        if (pideMotivo && !ComidasRules.justificacionValida(texto)) {
            registroError = "Escribe por qué (al menos ${ComidasRules.MIN_JUSTIFICACION} letras): tu jefe lo revisará."
            return
        }
        scope.launch {
            enviando = true
            registroError = null
            try {
                val hora = ComidasRules.ahoraIso()
                val enviado = withContext(Dispatchers.IO) {
                    if (r.momento == ComidasRules.SALIDA) {
                        repo.registrarSalida(hora, f.dataUrl, texto)
                    } else {
                        repo.registrarRegreso(hora, f.dataUrl, texto)
                    }
                }
                aviso = if (enviado) {
                    ComidasRules.mensajeRegistro(r.momento, pideMotivo)
                } else {
                    "📶 Sin conexión: tu registro se enviará en cuanto vuelva la red."
                }
                cerrarRegistro()
                reload++
            } catch (e: CancellationException) {
                throw e
            } catch (e: Exception) {
                val msg = e.toUserMessage("No se pudo registrar tu comida")
                if (ComidasRules.pideMotivoPorError(msg)) pideMotivo = true
                registroError = msg
            } finally {
                enviando = false
            }
        }
    }

    LazyColumn(
        modifier = modifier.fillMaxSize().background(NxColors.Surface),
        contentPadding = PaddingValues(16.dp),
        verticalArrangement = Arrangement.spacedBy(14.dp),
    ) {
        error?.let { msg ->
            item {
                Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    Text(msg, fontSize = 13.5.sp, color = Color(0xFFB91C1C), modifier = Modifier.weight(1f))
                    OutlinedButton(onClick = { reload++ }) { Text("Reintentar") }
                }
            }
        }
        aviso?.let { item { SoftNote(text = it, color = CoreActivityRules.VERDE) } }

        if (loading && dia == null && eq == null) {
            item { NxLoadingBlock("Cargando comidas…") }
        }

        if (dia?.debeRegistrar == true) {
            item {
                MiComidaCard(
                    mi = dia,
                    serverNowMs = serverNow,
                    onRegistrar = ::empezar,
                    onVerFoto = { url, titulo -> visor = url to titulo },
                )
            }
        }

        if (tieneEquipo && eq != null) {
            item {
                Row(verticalAlignment = Alignment.Top, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    Column(Modifier.weight(1f)) {
                        Text("Comidas de tu equipo", fontSize = 18.sp, fontWeight = FontWeight.ExtraBold, color = NxColors.Slate)
                        Text(
                            (if (eq.alcance == "todo") "Toda la empresa." else "Tu gente por organigrama.") +
                                " Horario 3:00 a 4:00 p.m.; lo que sea fuera de esa hora trae justificación y lo apruebas o rechazas.",
                            fontSize = 13.sp,
                            color = NxColors.Muted,
                        )
                    }
                    OutlinedButton(onClick = { reload++ }, enabled = !loading) {
                        Text(if (loading) "Actualizando…" else "↻ Actualizar", fontSize = 13.sp)
                    }
                }
            }
            val pendientes = eq.resumen?.pendientes ?: 0
            if (pendientes > 0) {
                item {
                    SoftNote(
                        text = "⏳ Tienes $pendientes comida${if (pendientes == 1) "" else "s"} a destiempo por aprobar.",
                        color = CoreActivityRules.NARANJA,
                    )
                }
            }
            item {
                Row(
                    modifier = Modifier.fillMaxWidth().horizontalScroll(rememberScrollState()),
                    horizontalArrangement = Arrangement.spacedBy(6.dp),
                ) {
                    ComidasRules.Filtro.entries.forEach { f ->
                        val on = filtro == f
                        val n = ComidasRules.conteo(f, eq.resumen)
                        val shape = RoundedCornerShape(999.dp)
                        Box(
                            modifier = Modifier
                                .heightIn(min = 36.dp)
                                .clip(shape)
                                .background(if (on) NxColors.TealSoft else Color.White)
                                .border(1.dp, if (on) NxColors.Teal else Color(0xFFE2E8F0), shape)
                                .clickable { filtro = f }
                                .padding(horizontal = 12.dp, vertical = 8.dp),
                            contentAlignment = Alignment.Center,
                        ) {
                            Text(
                                if (n != null) "${f.label} $n" else f.label,
                                fontSize = 13.sp,
                                fontWeight = FontWeight.SemiBold,
                                color = if (on) NxColors.Teal else NxColors.Slate,
                            )
                        }
                    }
                }
            }
            if (filas.isEmpty()) {
                item { Text("Nadie en este filtro.", fontSize = 13.sp, color = NxColors.Muted) }
            }
            items(filas, key = { "comida-${it.userId}" }) { fila ->
                FilaComidaCard(
                    fila = fila,
                    onRevisar = { f, aprobar -> revisando = f to aprobar },
                    onVerFoto = { url, titulo -> visor = url to titulo },
                )
            }
        }

        if (!loading && !tieneEquipo && dia?.debeRegistrar != true && error == null) {
            item {
                Text(
                    "No tienes comidas que registrar ni gente a tu cargo.",
                    fontSize = 13.sp,
                    color = NxColors.Muted,
                )
            }
        }
        item { Spacer(Modifier.height(24.dp)) }
    }

    val enCurso = registro
    if (enCurso != null && camaraAbierta) {
        LiveCameraCaptureDialog(
            title = if (enCurso.momento == ComidasRules.SALIDA) "📸 Foto de salida a comer" else "📸 Foto de regreso de comer",
            requireLocation = false,
            captureLocation = false,
            frontCamera = true,
            subtitle = if (enCurso.momento == ComidasRules.SALIDA) {
                "Acomódate y toma la foto: se guarda con la hora en que sales."
            } else {
                "Toma la foto al volver a tu lugar: se guarda con la hora en que regresas."
            },
            onCaptured = { photo ->
                foto = photo
                camaraAbierta = false
            },
            onDismiss = { cerrarRegistro() },
        )
    }
    val capturada = foto
    if (enCurso != null && capturada != null && !camaraAbierta) {
        ComidaRegistroDialog(
            momento = enCurso.momento,
            photo = capturada,
            pideMotivo = pideMotivo,
            motivo = motivo,
            onMotivo = { motivo = it.take(1000) },
            ventanaTexto = dia?.ventana?.texto ?: "3:00 a 4:00 p.m.",
            enviando = enviando,
            error = registroError,
            onRegistrar = ::registrar,
            onOtra = {
                foto = null
                registroError = null
                camaraAbierta = true
            },
            onCancelar = { if (!enviando) cerrarRegistro() },
        )
    }

    revisando?.let { (fila, aprobar) ->
        ComidaRevisionDialog(
            fila = fila,
            aprobarInicial = aprobar,
            onClose = { revisando = null },
            onDone = { texto ->
                revisando = null
                aviso = texto
                reload++
            },
            repo = repo,
        )
    }

    visor?.let { (url, titulo) ->
        Dialog(onDismissRequest = { visor = null }, properties = DialogProperties(usePlatformDefaultWidth = false)) {
            Surface(modifier = Modifier.fillMaxSize(), color = Color(0xF2020617)) {
                Column(Modifier.fillMaxSize().padding(16.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Text(titulo, color = Color.White, fontWeight = FontWeight.ExtraBold, modifier = Modifier.weight(1f))
                        TextButton(onClick = { visor = null }) { Text("✕", color = Color.White, fontSize = 20.sp) }
                    }
                    ProtectedImage(
                        url = url,
                        contentDescription = titulo,
                        modifier = Modifier.fillMaxWidth().weight(1f),
                        contentScale = ContentScale.Fit,
                    )
                }
            }
        }
    }
}

@Composable
private fun FotoComida(url: String?, titulo: String, onOpen: (String, String) -> Unit) {
    if (url.isNullOrBlank()) return
    Box(
        modifier = Modifier
            .size(72.dp)
            .clip(RoundedCornerShape(12.dp))
            .border(1.dp, Color(0xFFE2E8F0), RoundedCornerShape(12.dp))
            .background(Color(0xFFF1F5F9))
            .clickable { onOpen(url, titulo) },
    ) {
        ProtectedImage(url = url, contentDescription = titulo, modifier = Modifier.fillMaxSize())
    }
}

@Composable
private fun CardConBorde(color: Long?, content: @Composable () -> Unit) {
    val c = color?.let { Color(it) } ?: Color(0xFFE2E8F0)
    Card(
        modifier = Modifier.fillMaxWidth(),
        shape = RoundedCornerShape(18.dp),
        colors = CardDefaults.cardColors(containerColor = Color.White),
        border = BorderStroke(1.dp, Color(0xFFE2E8F0)),
    ) {
        Column(
            modifier = Modifier
                .drawBehind { drawRect(color = c, size = Size(4.dp.toPx(), size.height)) }
                .padding(start = 18.dp, end = 14.dp, top = 14.dp, bottom = 14.dp),
            verticalArrangement = Arrangement.spacedBy(10.dp),
        ) { content() }
    }
}

@Composable
private fun MiComidaCard(
    mi: ComidaMiDiaDto,
    serverNowMs: Long,
    onRegistrar: (String, Boolean) -> Unit,
    onVerFoto: (String, String) -> Unit,
) {
    val r = mi.registro
    val revision = ComidasRules.estadoRevision(r?.revisionEstado)
    when {
        mi.siguiente == "salida" -> {
            val destiempo = ComidasRules.salidaADestiempo(mi, serverNowMs)
            CardConBorde(if (destiempo) CoreActivityRules.NARANJA else CoreActivityRules.VERDE) {
                Row(verticalAlignment = Alignment.Top, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    Column(Modifier.weight(1f)) {
                        Text("🍽️ Tu hora de comida", fontSize = 17.sp, fontWeight = FontWeight.ExtraBold, color = NxColors.Slate)
                        Text(
                            "Horario: ${mi.ventana?.texto ?: "3:00 a 4:00 p.m."} · registra tu salida y tu regreso con foto.",
                            fontSize = 13.sp,
                            color = NxColors.Muted,
                        )
                    }
                    ToneChip(
                        if (destiempo) "⏰ Fuera de horario" else "✓ Es tu horario",
                        if (destiempo) CoreActivityRules.NARANJA else CoreActivityRules.VERDE,
                    )
                }
                if (destiempo) {
                    Text(
                        "Si sales a comer ahora tendrás que escribir por qué; tu jefe lo aprobará o rechazará.",
                        fontSize = 13.sp,
                        color = NxColors.Muted,
                    )
                }
                Button(
                    onClick = { onRegistrar(ComidasRules.SALIDA, destiempo) },
                    colors = ButtonDefaults.buttonColors(
                        containerColor = Color(if (destiempo) CoreActivityRules.NARANJA else CoreActivityRules.VERDE),
                    ),
                    modifier = Modifier.heightIn(min = 48.dp),
                ) { Text("🍽️ Salir a comer", fontWeight = FontWeight.Bold) }
            }
        }
        mi.siguiente == "regreso" && r != null -> {
            val destiempo = ComidasRules.regresoADestiempo(mi, serverNowMs)
            val minutos = ComidasRules.minutosDesde(r.checkinTime, serverNowMs)
            CardConBorde(if (destiempo) CoreActivityRules.NARANJA else CoreActivityRules.AZUL) {
                Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                    FotoComida(r.checkinPhotoUrl, "Tu foto de salida", onVerFoto)
                    Column(Modifier.weight(1f)) {
                        Text("🍽️ Estás en tu hora de comida", fontSize = 17.sp, fontWeight = FontWeight.ExtraBold, color = NxColors.Slate)
                        Text(
                            "Saliste a las ${CoreActivityRules.formatClock(r.checkinTime)} · llevas $minutos min",
                            fontSize = 13.sp,
                            color = NxColors.Muted,
                        )
                    }
                }
                revision?.let { ToneChip(it) }
                if (destiempo) {
                    Text(
                        "⏰ Ya pasó la hora de regreso (4:00 p.m.): al registrar tendrás que escribir por qué.",
                        fontSize = 13.sp,
                        color = NxColors.Muted,
                    )
                }
                Button(
                    onClick = { onRegistrar(ComidasRules.REGRESO, destiempo) },
                    colors = ButtonDefaults.buttonColors(
                        containerColor = Color(if (destiempo) CoreActivityRules.NARANJA else CoreActivityRules.AZUL),
                    ),
                    modifier = Modifier.heightIn(min = 48.dp),
                ) { Text("↩️ Ya regresé", fontWeight = FontWeight.Bold) }
            }
        }
        mi.siguiente == "listo" && r != null -> {
            val borde = when (r.revisionEstado) {
                "RECHAZADA" -> CoreActivityRules.ROJO
                "PENDIENTE" -> CoreActivityRules.NARANJA
                else -> CoreActivityRules.VERDE
            }
            CardConBorde(borde) {
                Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                    FotoComida(r.checkinPhotoUrl, "Tu foto de salida", onVerFoto)
                    FotoComida(r.checkoutPhotoUrl, "Tu foto de regreso", onVerFoto)
                    Column(Modifier.weight(1f)) {
                        Text("✅ Comida registrada", fontSize = 16.sp, fontWeight = FontWeight.ExtraBold, color = NxColors.Slate)
                        Text(
                            "${CoreActivityRules.formatClock(r.checkinTime)} → ${CoreActivityRules.formatClock(r.checkoutTime)}" +
                                (r.minutos?.let { " · ${it.toLong()} min" } ?: ""),
                            fontSize = 13.sp,
                            color = NxColors.Muted,
                        )
                    }
                }
                ToneChip(revision ?: CoreActivityRules.Tone("A tiempo", CoreActivityRules.VERDE))
                ComidasRules.decisionPropia(r)?.let { Text(it, fontSize = 13.sp, color = NxColors.Muted) }
            }
        }
    }
}

@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun FilaComidaCard(
    fila: ComidaFilaDto,
    onRevisar: (ComidaFilaDto, Boolean) -> Unit,
    onVerFoto: (String, String) -> Unit,
) {
    val r = fila.registro
    val revision = ComidasRules.estadoRevision(r?.revisionEstado)
    val corto = CoreActivityRules.shortName(fila.nombre)
    CardConBorde(ComidasRules.colorFila(r)) {
        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp)) {
            PersonAvatar(fila.nombre, fila.avatarUrl, 40.dp)
            Column(Modifier.weight(1f)) {
                Text(fila.nombre ?: "—", fontSize = 14.5.sp, fontWeight = FontWeight.Bold, color = NxColors.Slate)
                fila.puesto?.takeIf { it.isNotBlank() }?.let { Text(it, fontSize = 12.sp, color = NxColors.Muted) }
            }
        }
        FlowRow(horizontalArrangement = Arrangement.spacedBy(6.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
            ToneChip(ComidasRules.estadoFila(r))
            revision?.let { ToneChip(it) }
        }
        if (r != null) {
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                FotoComida(r.checkinPhotoUrl, "$corto · salida", onVerFoto)
                FotoComida(r.checkoutPhotoUrl, "$corto · regreso", onVerFoto)
                Column {
                    Row {
                        Text(
                            CoreActivityRules.formatClock(r.checkinTime),
                            fontSize = 14.sp,
                            fontWeight = FontWeight.Bold,
                            color = if (r.isCheckinLate == true) Color(CoreActivityRules.NARANJA) else NxColors.Slate,
                        )
                        Text("  →  ", fontSize = 14.sp, color = NxColors.Muted)
                        Text(
                            if (r.checkoutTime.isNullOrBlank()) "en comida" else CoreActivityRules.formatClock(r.checkoutTime),
                            fontSize = 14.sp,
                            fontWeight = FontWeight.Bold,
                            color = if (r.isCheckoutLate == true) Color(CoreActivityRules.NARANJA) else NxColors.Slate,
                        )
                    }
                    r.minutos?.let { Text("${it.toLong()} min", fontSize = 12.5.sp, color = NxColors.Muted) }
                }
            }
            val justificaciones = listOfNotNull(
                r.checkinJustificacion?.takeIf { it.isNotBlank() }?.let {
                    "💬 Salida a las ${CoreActivityRules.formatClock(r.checkinTime)}: «$it»"
                },
                r.checkoutJustificacion?.takeIf { it.isNotBlank() }?.let {
                    "💬 Regreso a las ${CoreActivityRules.formatClock(r.checkoutTime)}: «$it»"
                },
                ComidasRules.decisionEquipo(r),
            )
            if (justificaciones.isNotEmpty()) {
                SoftNote(text = justificaciones.joinToString("\n"))
            }
            if (fila.puedoRevisar == true) {
                if (r.revisionEstado == "PENDIENTE") {
                    Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        Button(
                            onClick = { onRevisar(fila, true) },
                            colors = ButtonDefaults.buttonColors(containerColor = Color(CoreActivityRules.VERDE)),
                            modifier = Modifier.weight(1f).heightIn(min = 44.dp),
                        ) { Text("✅ Aprobar", fontWeight = FontWeight.Bold) }
                        Button(
                            onClick = { onRevisar(fila, false) },
                            colors = ButtonDefaults.buttonColors(containerColor = Color(CoreActivityRules.ROJO)),
                            modifier = Modifier.weight(1f).heightIn(min = 44.dp),
                        ) { Text("❌ Rechazar", fontWeight = FontWeight.Bold) }
                    }
                } else if (!r.revisionEstado.isNullOrBlank()) {
                    OutlinedButton(onClick = { onRevisar(fila, r.revisionEstado != "APROBADA") }) {
                        Text("Cambiar decisión", fontSize = 13.sp)
                    }
                }
            }
        }
    }
}

@Composable
private fun ComidaRegistroDialog(
    momento: String,
    photo: GeoPhoto,
    pideMotivo: Boolean,
    motivo: String,
    onMotivo: (String) -> Unit,
    ventanaTexto: String,
    enviando: Boolean,
    error: String?,
    onRegistrar: () -> Unit,
    onOtra: () -> Unit,
    onCancelar: () -> Unit,
) {
    val salida = momento == ComidasRules.SALIDA
    Dialog(onDismissRequest = onCancelar, properties = DialogProperties(usePlatformDefaultWidth = false)) {
        Surface(
            modifier = Modifier.fillMaxWidth().padding(16.dp),
            shape = RoundedCornerShape(20.dp),
            color = Color.White,
        ) {
            Column(
                modifier = Modifier.padding(18.dp).verticalScroll(rememberScrollState()),
                verticalArrangement = Arrangement.spacedBy(12.dp),
            ) {
                Text(
                    if (salida) "📸 Tu foto de salida a comer" else "📸 Tu foto de regreso de comer",
                    fontSize = 18.sp,
                    fontWeight = FontWeight.ExtraBold,
                    color = NxColors.Slate,
                )
                Image(
                    bitmap = photo.preview.asImageBitmap(),
                    contentDescription = "Tu foto",
                    contentScale = ContentScale.Fit,
                    modifier = Modifier
                        .fillMaxWidth()
                        .heightIn(max = 360.dp)
                        .clip(RoundedCornerShape(14.dp))
                        .background(Color(0xFF0F172A)),
                )
                if (pideMotivo) {
                    SoftNote(
                        text = "⏰ Estás fuera del horario de comida ($ventanaTexto). Escribe por qué; " +
                            "tu jefe lo aprobará o rechazará y queda en el registro.",
                        color = CoreActivityRules.NARANJA,
                    )
                    OutlinedTextField(
                        value = motivo,
                        onValueChange = onMotivo,
                        label = { Text("¿Por qué?") },
                        placeholder = {
                            Text(
                                if (salida) {
                                    "Ej. Estaba en sitio con el cliente de 2 a 4 y salí a comer al terminar."
                                } else {
                                    "Ej. La fila del comedor tardó; regresé en cuanto pude."
                                },
                            )
                        },
                        minLines = 3,
                        enabled = !enviando,
                        modifier = Modifier.fillMaxWidth(),
                    )
                }
                error?.let { Text(it, fontSize = 13.5.sp, color = Color(0xFFB91C1C)) }
                Button(
                    onClick = onRegistrar,
                    enabled = !enviando,
                    colors = ButtonDefaults.buttonColors(
                        containerColor = Color(if (pideMotivo) CoreActivityRules.NARANJA else CoreActivityRules.VERDE),
                    ),
                    modifier = Modifier.fillMaxWidth().heightIn(min = 48.dp),
                ) {
                    Text(
                        when {
                            enviando -> "Registrando…"
                            salida -> "✓ Registrar salida"
                            else -> "✓ Registrar regreso"
                        },
                        fontWeight = FontWeight.Bold,
                    )
                }
                Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    OutlinedButton(onClick = onOtra, enabled = !enviando, modifier = Modifier.weight(1f)) {
                        Text("📷 Tomar otra")
                    }
                    TextButton(onClick = onCancelar, enabled = !enviando) { Text("Cancelar", color = NxColors.Muted) }
                }
            }
        }
    }
}

@Composable
private fun ComidaRevisionDialog(
    fila: ComidaFilaDto,
    aprobarInicial: Boolean,
    onClose: () -> Unit,
    onDone: (String) -> Unit,
    repo: ComidasRepository,
) {
    val r: ComidaRegistroDto = fila.registro ?: return
    val scope = rememberCoroutineScope()
    var aprobar by remember { mutableStateOf(aprobarInicial) }
    var notas by remember { mutableStateOf("") }
    var enviando by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf<String?>(null) }
    val corto = CoreActivityRules.shortName(fila.nombre)

    Dialog(onDismissRequest = { if (!enviando) onClose() }, properties = DialogProperties(usePlatformDefaultWidth = false)) {
        Surface(
            modifier = Modifier.fillMaxWidth().padding(16.dp),
            shape = RoundedCornerShape(20.dp),
            color = Color.White,
        ) {
            Column(
                modifier = Modifier.padding(18.dp).verticalScroll(rememberScrollState()),
                verticalArrangement = Arrangement.spacedBy(12.dp),
            ) {
                Text("Comida a destiempo de $corto", fontSize = 18.sp, fontWeight = FontWeight.ExtraBold, color = NxColors.Slate)
                Text(
                    "🍽️ Salió ${CoreActivityRules.formatClock(r.checkinTime)}" +
                        if (!r.checkoutTime.isNullOrBlank()) {
                            " · regresó ${CoreActivityRules.formatClock(r.checkoutTime)}" +
                                (r.minutos?.let { " (${it.toLong()} min)" } ?: "")
                        } else {
                            " · sigue en comida"
                        },
                    fontSize = 13.5.sp,
                    color = NxColors.Slate,
                )
                r.checkinJustificacion?.takeIf { it.isNotBlank() }?.let {
                    Text("💬 Salida: «$it»", fontSize = 13.5.sp, color = NxColors.Slate)
                }
                r.checkoutJustificacion?.takeIf { it.isNotBlank() }?.let {
                    Text("💬 Regreso: «$it»", fontSize = 13.5.sp, color = NxColors.Slate)
                }
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    listOf(true to "✅ Aprobar", false to "❌ Rechazar").forEach { (valor, label) ->
                        val on = aprobar == valor
                        val c = Color(if (valor) CoreActivityRules.VERDE else CoreActivityRules.ROJO)
                        Box(
                            modifier = Modifier
                                .weight(1f)
                                .heightIn(min = 48.dp)
                                .clip(RoundedCornerShape(12.dp))
                                .background(if (on) c.copy(alpha = 0.12f) else Color.White)
                                .border(2.dp, if (on) c else Color(0xFFE2E8F0), RoundedCornerShape(12.dp))
                                .clickable { aprobar = valor },
                            contentAlignment = Alignment.Center,
                        ) {
                            Text(label, fontWeight = FontWeight.Bold, color = if (on) c else NxColors.Slate)
                        }
                    }
                }
                OutlinedTextField(
                    value = notas,
                    onValueChange = { notas = it.take(1000) },
                    label = { Text(if (aprobar) "Comentario (opcional)" else "¿Por qué la rechazas?") },
                    minLines = 3,
                    enabled = !enviando,
                    modifier = Modifier.fillMaxWidth(),
                )
                error?.let { Text(it, fontSize = 13.5.sp, color = Color(0xFFB91C1C)) }
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    OutlinedButton(onClick = onClose, enabled = !enviando, modifier = Modifier.weight(1f)) { Text("Cancelar") }
                    Button(
                        onClick = {
                            if (!aprobar && !ComidasRules.justificacionValida(notas)) {
                                error = "Escribe por qué la rechazas (al menos ${ComidasRules.MIN_JUSTIFICACION} letras)."
                                return@Button
                            }
                            scope.launch {
                                enviando = true
                                error = null
                                try {
                                    withContext(Dispatchers.IO) { repo.revisar(r.id, aprobar, notas) }
                                    onDone(
                                        if (aprobar) {
                                            "Aprobaste la comida a destiempo de $corto."
                                        } else {
                                            "Rechazaste la comida a destiempo de $corto."
                                        },
                                    )
                                } catch (e: CancellationException) {
                                    throw e
                                } catch (e: Exception) {
                                    error = e.toUserMessage("No se pudo guardar la revisión")
                                } finally {
                                    enviando = false
                                }
                            }
                        },
                        enabled = !enviando,
                        colors = ButtonDefaults.buttonColors(
                            containerColor = Color(if (aprobar) CoreActivityRules.VERDE else CoreActivityRules.ROJO),
                        ),
                        modifier = Modifier.weight(1f),
                    ) {
                        Text(
                            when {
                                enviando -> "Guardando…"
                                aprobar -> "✅ Aprobar"
                                else -> "❌ Rechazar"
                            },
                            fontWeight = FontWeight.Bold,
                        )
                    }
                }
                Spacer(Modifier.width(1.dp))
            }
        }
    }
}
