package mx.nexara.mobile.nativeapp.ui.console.activities

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.HorizontalDivider
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.style.TextAlign
import kotlinx.coroutines.launch
import kotlin.math.roundToInt
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.drawBehind
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import mx.nexara.mobile.nativeapp.data.api.ActivityAssigneeRefDto
import mx.nexara.mobile.nativeapp.data.api.ActivityDto
import mx.nexara.mobile.nativeapp.ui.enterprise.NxDimens
import mx.nexara.mobile.nativeapp.ui.enterprise.nxFlotante
import mx.nexara.mobile.nativeapp.ui.theme.InterTight

/** Colores de la banda oscura (los de «Mi día» y de la tarjeta de la web). */
private val TiempoFondo = Color(0xFF0D0F12)
private val TiempoTenue = Color(0xFFC9CED8)
private val TiempoPie = Color(0xFFB9BFCC)
private val TiempoVerde = Color(0xFF10A183)

/** Anillo y píldora de estado por color: verde en tiempo, ámbar cerca del tope, rojo excedida. */
private data class TonoTiempo(val anillo: Color, val pildora: Color, val texto: Color)

private fun tonoDe(estado: ActividadTiempoRules.Estado): TonoTiempo = when (estado) {
    ActividadTiempoRules.Estado.EN_TIEMPO -> TonoTiempo(TiempoVerde, TiempoVerde.copy(alpha = 0.22f), Color(0xFF9BE3D2))
    ActividadTiempoRules.Estado.CERCA -> TonoTiempo(Color(0xFFF5B25C), Color(0xFFF5B25C).copy(alpha = 0.2f), Color(0xFFF8CD8F))
    ActividadTiempoRules.Estado.EXCEDIDA -> TonoTiempo(Color(0xFFF87171), Color(0xFFF87171).copy(alpha = 0.2f), Color(0xFFFCA5A5))
    ActividadTiempoRules.Estado.SIN_PLAN -> TonoTiempo(TiempoVerde, Color.White.copy(alpha = 0.1f), Color(0xFFD6DAE2))
}

/**
 * Tarjeta «Tiempo» del detalle (web `TiempoActividad.tsx`, 28-10): lo trabajado contra lo
 * planeado y el tope, con un anillo que da la vuelta en el plan. Banda oscura con aurora verde
 * como la de «Mi día». «En curso» si el reloj de cualquiera del equipo está corriendo.
 * Sin plan y sin nada trabajado no se pinta.
 */
@Composable
fun ActividadTiempoCard(
    detail: ActivityDto,
    miFila: ActivityAssigneeRefDto?,
    modifier: Modifier = Modifier,
    soyQuienEjecuta: Boolean = false,
    onDecirTiempo: suspend (Int) -> Unit = {},
) {
    val m = ActividadTiempoRules.medidorDe(detail, miFila)
    if (!ActividadTiempoRules.visible(m)) return
    val enCurso = ActividadTiempoRules.enCurso(detail.assignees)
    val tono = tonoDe(m.estado)
    val shape = RoundedCornerShape(NxDimens.SheetRadius)
    Column(
        modifier = modifier
            .fillMaxWidth()
            .nxFlotante(shape, 12.dp)
            .clip(shape)
            .background(TiempoFondo)
            .drawBehind {
                drawRect(
                    Brush.radialGradient(
                        listOf(TiempoVerde.copy(alpha = 0.5f), Color.Transparent),
                        center = Offset(size.width, 0f),
                        radius = size.width * 0.75f,
                    ),
                )
                drawRect(
                    Brush.radialGradient(
                        listOf(Color(0xFF0060F0).copy(alpha = 0.42f), Color.Transparent),
                        center = Offset(0f, size.height * 1.3f),
                        radius = size.width * 0.7f,
                    ),
                )
            }
            .padding(horizontal = 20.dp, vertical = 18.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            Text("Tiempo", fontSize = 14.sp, fontWeight = FontWeight.SemiBold, color = TiempoTenue)
            if (enCurso) {
                Text(
                    "en curso",
                    fontSize = 11.sp,
                    fontWeight = FontWeight.Bold,
                    color = Color(0xFF9BE3D2),
                    modifier = Modifier
                        .clip(RoundedCornerShape(999.dp))
                        .background(TiempoVerde.copy(alpha = 0.25f))
                        .padding(horizontal = 8.dp, vertical = 2.dp),
                )
            }
        }
        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(16.dp)) {
            if (m.plan != null) {
                AnilloTiempo(
                    avance = m.avance ?: 0f,
                    color = tono.anillo,
                    descripcion = ActividadTiempoRules.etiquetaAccesible(m),
                )
            }
            Column(verticalArrangement = Arrangement.spacedBy(2.dp), modifier = Modifier.weight(1f)) {
                Text(
                    ActividadTiempoRules.realTexto(m),
                    fontFamily = InterTight,
                    fontSize = 32.sp,
                    lineHeight = 34.sp,
                    fontWeight = FontWeight.Bold,
                    color = Color.White,
                    style = TextStyle(fontFeatureSettings = "tnum"),
                    maxLines = 1,
                )
                Text(ActividadTiempoRules.contraTexto(m), fontSize = 13.sp, color = TiempoTenue)
                Text(
                    m.texto,
                    fontSize = 12.sp,
                    fontWeight = FontWeight.SemiBold,
                    color = tono.texto,
                    modifier = Modifier
                        .padding(top = 4.dp)
                        .clip(RoundedCornerShape(999.dp))
                        .background(tono.pildora)
                        .padding(horizontal = 9.dp, vertical = 2.dp),
                )
            }
        }
        ActividadTiempoRules.pieEstandar(detail.tiempoEstandarMin, m)?.let {
            Text(it, fontSize = 12.sp, color = TiempoPie)
        }
        ActividadTiempoRules.pieTope(m, detail.tiempoMaximoMin?.toDouble())?.let {
            Text(it, fontSize = 12.sp, color = TiempoPie)
        }
        TiempoDichoFila(
            relojMin = (detail.minutosReales ?: 0.0).roundToInt(),
            dichoInicial = detail.tiempoDichoMin,
            preguntar = detail.preguntarTiempo == true,
            soyQuienEjecuta = soyQuienEjecuta,
            onDecir = onDecirTiempo,
        )
    }
}

/**
 * «¿Te tomó…?» (Velocidad Core, Ola 4; web `TiempoDicho.tsx`): quien la ejecutó confirma el reloj o dice
 * otro tiempo, una vez y si quiere. No toca reloj, KPI ni nómina: enseña a los tiempos que se sugieren.
 */
@Composable
private fun TiempoDichoFila(
    relojMin: Int,
    dichoInicial: Int?,
    preguntar: Boolean,
    soyQuienEjecuta: Boolean,
    onDecir: suspend (Int) -> Unit,
) {
    var dicho by remember(dichoInicial) { mutableStateOf(dichoInicial) }
    var otro by remember { mutableStateOf(false) }
    var horas by remember { mutableStateOf("") }
    var minutos by remember { mutableStateOf("") }
    var guardando by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf<String?>(null) }
    val scope = rememberCoroutineScope()

    dicho?.let {
        Text(ActividadTiempoRules.textoDicho(it, soyQuienEjecuta), fontSize = 12.sp, color = TiempoPie)
        return
    }
    if (!preguntar || !soyQuienEjecuta) return

    fun guardar(valor: Int) {
        guardando = true
        error = null
        scope.launch {
            runCatching { onDecir(valor) }
                .onSuccess { dicho = valor }
                .onFailure { error = "No se pudo guardar. Intenta de nuevo." }
            guardando = false
        }
    }
    val escrito = ActividadTiempoRules.minutosEscritos(horas, minutos)

    Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
        HorizontalDivider(color = Color.White.copy(alpha = 0.14f))
        Text(
            "¿Te tomó ${ActividadTiempoRules.formatoMinutos(relojMin)}?",
            fontSize = 14.sp,
            fontWeight = FontWeight.SemiBold,
            color = Color.White,
        )
        Text("Así mejoran los tiempos que se sugieren.", fontSize = 12.sp, color = TiempoPie)
        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            if (otro) {
                CampoDeTiempo(horas, "h", 3) { horas = it }
                CampoDeTiempo(minutos, "min", 2) { minutos = it }
                BotonDeTiempo("Guardar", principal = true, activo = !guardando && escrito >= 1) { guardar(escrito) }
            } else {
                BotonDeTiempo("Sí", principal = true, activo = !guardando) { guardar(relojMin) }
                BotonDeTiempo("Fue otro tiempo", principal = false, activo = !guardando) { otro = true }
            }
        }
        error?.let { Text(it, fontSize = 12.sp, color = Color(0xFFFFB4AB)) }
    }
}

@Composable
private fun BotonDeTiempo(texto: String, principal: Boolean, activo: Boolean, alTocar: () -> Unit) {
    val forma = RoundedCornerShape(999.dp)
    Box(
        modifier = Modifier
            .heightIn(min = 40.dp)
            .clip(forma)
            .background(if (principal) Color.White.copy(alpha = if (activo) 1f else 0.55f) else Color.Transparent)
            .border(1.dp, if (principal) Color.Transparent else Color.White.copy(alpha = 0.35f), forma)
            .clickable(enabled = activo, onClick = alTocar)
            .padding(horizontal = 14.dp),
        contentAlignment = Alignment.Center,
    ) {
        Text(
            texto,
            fontSize = 13.sp,
            fontWeight = FontWeight.SemiBold,
            color = if (principal) TiempoFondo else Color.White,
        )
    }
}

@Composable
private fun CampoDeTiempo(valor: String, unidad: String, largo: Int, alCambiar: (String) -> Unit) {
    Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(4.dp)) {
        BasicTextField(
            value = valor,
            onValueChange = { alCambiar(it.filter(Char::isDigit).take(largo)) },
            singleLine = true,
            textStyle = TextStyle(color = Color.White, fontSize = 14.sp, textAlign = TextAlign.Center),
            cursorBrush = SolidColor(Color.White),
            keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
            modifier = Modifier
                .width(48.dp)
                .clip(RoundedCornerShape(8.dp))
                .background(Color.White.copy(alpha = 0.08f))
                .border(1.dp, Color.White.copy(alpha = 0.35f), RoundedCornerShape(8.dp))
                .padding(vertical = 10.dp)
                .semantics { contentDescription = if (unidad == "h") "Horas" else "Minutos" },
        )
        Text(unidad, fontSize = 13.sp, color = Color.White)
    }
}

/** Anillo de 84 dp: pista blanca tenue y el avance encima, empezando arriba. */
@Composable
private fun AnilloTiempo(avance: Float, color: Color, descripcion: String) {
    Box(
        Modifier
            .size(84.dp)
            .semantics { contentDescription = descripcion },
        contentAlignment = Alignment.Center,
    ) {
        Canvas(Modifier.size(84.dp)) {
            val grosor = 9.dp.toPx()
            val trazo = Stroke(width = grosor, cap = StrokeCap.Round)
            val esquina = Offset(grosor / 2, grosor / 2)
            val lado = Size(size.width - grosor, size.height - grosor)
            drawArc(Color.White.copy(alpha = 0.16f), 0f, 360f, false, topLeft = esquina, size = lado, style = trazo)
            val barrido = 360f * avance.coerceIn(0f, 1f)
            if (barrido > 0f) {
                drawArc(color, -90f, barrido, false, topLeft = esquina, size = lado, style = trazo)
            }
        }
    }
}
