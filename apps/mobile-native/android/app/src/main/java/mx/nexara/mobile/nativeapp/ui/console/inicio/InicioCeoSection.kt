package mx.nexara.mobile.nativeapp.ui.console.inicio

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.outlined.KeyboardArrowRight
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.drawBehind
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import java.time.Instant
import mx.nexara.mobile.nativeapp.data.api.TeamBoardUserDto
import mx.nexara.mobile.nativeapp.ui.console.activities.EquipoEstado
import mx.nexara.mobile.nativeapp.ui.enterprise.NxTheme
import mx.nexara.mobile.nativeapp.ui.enterprise.nxFlotante
import mx.nexara.mobile.nativeapp.ui.theme.InterTight

/**
 * Inicio de dirección general (canvas «App · Inicio CEO»): la banda oscura con el equipo de hoy,
 * «Requiere tu atención», el desempeño de 7 días y «Para atender». Lo que no llegue no se pinta.
 */
@Composable
internal fun InicioCeoContenido(
    ceo: CeoInicio,
    onPizarra: () -> Unit,
    onPendiente: (String) -> Unit,
    onDesempeno: (() -> Unit)?,
    onPersona: (Long) -> Unit,
) {
    val c = NxTheme.colors
    Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
        InicioCeoRules.equipoHoy(ceo.equipo.orEmpty())?.let { EquipoHoyBanda(it, onPizarra) }

        val pendientes = InicioCeoRules.pendientes(ceo.revisiones, ceo.aprobaciones, ceo.pagos)
        if (pendientes.isNotEmpty()) {
            Titulo("Requiere tu atención")
            Tarjeta {
                pendientes.forEachIndexed { i, p ->
                    if (i > 0) HorizontalDivider(color = c.borderSubtle)
                    Row(
                        modifier = Modifier
                            .fillMaxWidth()
                            .clickable { onPendiente(p.clave) }
                            .padding(horizontal = 16.dp, vertical = 13.dp),
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(12.dp),
                    ) {
                        Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(2.dp)) {
                            Text(p.titulo, fontSize = 15.sp, fontWeight = FontWeight.SemiBold, color = c.fg)
                            Text(p.detalle, fontSize = 13.sp, color = c.muted, maxLines = 1, overflow = TextOverflow.Ellipsis)
                        }
                        Text(p.cuenta.toString(), fontFamily = InterTight, fontSize = 20.sp, fontWeight = FontWeight.Bold, color = c.fg)
                    }
                }
            }
        }

        InicioCeoRules.desempeno(ceo.kpis)?.let { d ->
            Tarjeta(onClick = onDesempeno) {
                Row(
                    modifier = Modifier.padding(horizontal = 16.dp, vertical = 14.dp),
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(16.dp),
                ) {
                    Anillo(d.cumplimientoPct)
                    Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                        Text("Desempeño · 7 días", fontSize = 15.sp, fontWeight = FontWeight.SemiBold, color = c.fg)
                        d.renglones.forEach { Text(it, fontSize = 13.sp, color = c.fg2) }
                    }
                    if (onDesempeno != null) {
                        Icon(Icons.AutoMirrored.Outlined.KeyboardArrowRight, contentDescription = null, tint = c.fg4)
                    }
                }
            }
        }

        val atender = ParaAtender.renglones(ceo.equipo.orEmpty())
        if (atender.isNotEmpty()) {
            Titulo("Para atender")
            Tarjeta {
                atender.forEachIndexed { i, r ->
                    if (i > 0) HorizontalDivider(color = c.borderSubtle)
                    Row(
                        modifier = Modifier
                            .fillMaxWidth()
                            .clickable { onPersona(r.personaId) }
                            .padding(horizontal = 16.dp, vertical = 12.dp),
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(12.dp),
                    ) {
                        Box(Modifier.size(8.dp).clip(CircleShape).background(r.color?.let { Color(it) } ?: c.fg4))
                        Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(2.dp)) {
                            Text(r.titulo, fontSize = 14.sp, fontWeight = FontWeight.SemiBold, color = c.fg, maxLines = 1, overflow = TextOverflow.Ellipsis)
                            r.detalle?.let { Text(it, fontSize = 13.sp, color = c.muted, maxLines = 1, overflow = TextOverflow.Ellipsis) }
                        }
                    }
                }
            }
        }
    }
}

/** Los primeros renglones de «Para atender» de la pizarra (`EquipoEstado.gruposAtencion`). */
internal object ParaAtender {
    data class Renglon(val personaId: Long, val titulo: String, val detalle: String?, val color: Long?)

    fun renglones(users: List<TeamBoardUserDto>, max: Int = 4, ahora: Instant = Instant.now()): List<Renglon> =
        EquipoEstado.gruposAtencion(users, ahora).flatMap { g ->
            g.renglones.map { r ->
                Renglon(
                    personaId = r.persona.id,
                    titulo = "${r.persona.nombre?.trim()?.split(Regex("\\s+"))?.take(2)?.joinToString(" ").orEmpty()} · ${motivo(g)}",
                    detalle = r.principal,
                    color = g.color,
                )
            }
        }.take(max)

    /** El motivo en singular, para el renglón de una persona. */
    private fun motivo(g: EquipoEstado.GrupoAtencion): String = when (g.clave) {
        "atrasados" -> "con retraso"
        "sin-nada" -> "sin nada asignado"
        "sin-entrada" -> "sin entrada hoy"
        else -> g.titulo.lowercase()
    }
}

@Composable
private fun EquipoHoyBanda(e: InicioCeoRules.EquipoHoy, onPizarra: () -> Unit) {
    val shape = RoundedCornerShape(26.dp)
    val tenue = Color(0xFFC9CED8)
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .nxFlotante(shape, 14.dp)
            .clip(shape)
            .background(Color(0xFF0D0F12))
            .drawBehind {
                drawRect(Brush.radialGradient(listOf(Color(0xFF10A183).copy(alpha = 0.55f), Color.Transparent), Offset(size.width, 0f), size.width * 0.85f))
                drawRect(Brush.radialGradient(listOf(Color(0xFF0060F0).copy(alpha = 0.45f), Color.Transparent), Offset(0f, size.height * 1.2f), size.width * 0.75f))
            }
            .clickable(onClick = onPizarra)
            .padding(horizontal = 20.dp, vertical = 18.dp),
        verticalArrangement = Arrangement.spacedBy(14.dp),
    ) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Text(
                "EN JORNADA",
                fontSize = 12.sp,
                fontWeight = FontWeight.SemiBold,
                letterSpacing = 0.5.sp,
                color = Color(0xFFB9BFCC),
                modifier = Modifier.weight(1f),
            )
            Text("Pizarra ›", fontSize = 13.sp, fontWeight = FontWeight.SemiBold, color = Color.White)
        }
        Row(verticalAlignment = Alignment.Bottom, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            Text(
                e.enJornada.toString(),
                fontFamily = InterTight,
                fontSize = 44.sp,
                lineHeight = 46.sp,
                fontWeight = FontWeight.Bold,
                color = Color.White,
                style = TextStyle(fontFeatureSettings = "tnum"),
            )
            Text("de ${e.total} checaron entrada", fontSize = 15.sp, color = tenue, modifier = Modifier.padding(bottom = 6.dp))
        }
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp), modifier = Modifier.fillMaxWidth()) {
            Cifra(e.trabajando, "Trabajando", Modifier.weight(1f))
            Cifra(e.sinActividad, "Sin actividad", Modifier.weight(1f))
            Cifra(e.atrasadas, "Atrasadas", Modifier.weight(1f), color = if (e.atrasadas > 0) Color(0xFFFFB27A) else Color.White)
        }
    }
}

@Composable
private fun Cifra(n: Int, etiqueta: String, modifier: Modifier, color: Color = Color.White) {
    Column(
        modifier = modifier
            .clip(RoundedCornerShape(14.dp))
            .background(Color.White.copy(alpha = 0.08f))
            .padding(10.dp)
            .semantics { contentDescription = "$etiqueta: $n" },
        verticalArrangement = Arrangement.spacedBy(2.dp),
    ) {
        Text(n.toString(), fontFamily = InterTight, fontSize = 22.sp, fontWeight = FontWeight.Bold, color = color)
        Text(etiqueta, fontSize = 12.sp, color = Color(0xFFC9CED8), maxLines = 1)
    }
}

@Composable
private fun Anillo(pct: Int?) {
    val c = NxTheme.colors
    Box(Modifier.size(76.dp), contentAlignment = Alignment.Center) {
        Canvas(Modifier.size(76.dp)) {
            val grosor = 8.dp.toPx()
            val st = Stroke(width = grosor, cap = StrokeCap.Round)
            drawArc(Color(0xFFEEF0F4), 0f, 360f, false, topLeft = Offset(grosor / 2, grosor / 2), size = androidx.compose.ui.geometry.Size(size.width - grosor, size.height - grosor), style = st)
            if (pct != null && pct > 0) {
                drawArc(c.brand, -90f, 360f * pct / 100f, false, topLeft = Offset(grosor / 2, grosor / 2), size = androidx.compose.ui.geometry.Size(size.width - grosor, size.height - grosor), style = st)
            }
        }
        Text(pct?.let { "$it %" } ?: "—", fontFamily = InterTight, fontSize = 16.sp, fontWeight = FontWeight.Bold, color = c.fg)
    }
}

@Composable
private fun Titulo(texto: String) {
    Text(
        texto,
        fontSize = 15.sp,
        fontWeight = FontWeight.SemiBold,
        color = NxTheme.colors.fg,
        modifier = Modifier.padding(start = 4.dp, top = 2.dp),
    )
}

@Composable
private fun Tarjeta(onClick: (() -> Unit)? = null, content: @Composable () -> Unit) {
    val shape = RoundedCornerShape(22.dp)
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .nxFlotante(shape)
            .clip(shape)
            .background(NxTheme.colors.card)
            .then(if (onClick != null) Modifier.clickable(onClick = onClick) else Modifier),
    ) { content() }
}
