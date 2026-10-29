package mx.nexara.mobile.nativeapp.ui.console.activities

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
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
