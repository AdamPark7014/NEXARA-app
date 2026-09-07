package mx.nexara.mobile.nativeapp.ui.integra.schedules

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import mx.nexara.mobile.nativeapp.data.integra.schedules.AcsTime
import mx.nexara.mobile.nativeapp.data.integra.schedules.ScheduleDayPlan
import mx.nexara.mobile.nativeapp.data.integra.schedules.ScheduleTemplate
import mx.nexara.mobile.nativeapp.data.integra.schedules.WeekDay
import mx.nexara.mobile.nativeapp.ui.enterprise.NxColors

/**
 * Vista semanal de una plantilla ACS: siete barras de 24 h con las franjas
 * reales que publica el `WeekPlanCfg` del terminal.
 *
 * Las horas se pintan **tal cual las manda el ACS**, sin pasar por ninguna zona
 * horaria: son el reloj de pared del terminal instalado en sitio. Convertirlas
 * a la zona del teléfono movería la franja de oficina a las 02:00.
 *
 * Cuando el terminal no publica el detalle se dice explícitamente, en lugar de
 * dibujar un horario por convención: una barra inventada que resulta ser falsa
 * es peor que un hueco honesto.
 */
@Composable
fun ScheduleWeekGrid(
    template: ScheduleTemplate?,
    modifier: Modifier = Modifier,
) {
    if (template == null || template.id == ScheduleTemplate.NO_ACCESS_ID) {
        Text(
            "Sin acceso en esta puerta — no abre en ningún horario.",
            style = MaterialTheme.typography.bodySmall,
            color = NxColors.Muted,
            modifier = modifier.padding(vertical = 6.dp),
        )
        return
    }
    if (template.days.isEmpty()) {
        Column(modifier.padding(vertical = 6.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
            Text(
                "El terminal no publica el detalle semanal de «${template.name}».",
                style = MaterialTheme.typography.bodySmall,
                color = NxColors.Muted,
            )
            template.weekPlanNo?.let {
                Text(
                    "Plantilla ${template.id} → plan semanal $it",
                    style = MaterialTheme.typography.labelSmall,
                    color = NxColors.Muted,
                )
            }
        }
        return
    }

    Column(modifier.fillMaxWidth(), verticalArrangement = Arrangement.spacedBy(6.dp)) {
        Text(
            "Horario semanal · ${template.name}",
            style = MaterialTheme.typography.labelMedium.copy(fontWeight = FontWeight.SemiBold),
            color = NxColors.Slate,
        )
        WeekDay.entries.forEach { day ->
            val segments = template.days.firstOrNull { it.week == day }
            DayRow(day = day, plan = segments)
        }
        Text(
            "Franjas leídas del terminal (hora del ACS en sitio, sin convertir).",
            style = MaterialTheme.typography.labelSmall,
            color = NxColors.Muted,
        )
    }
}

@Composable
private fun DayRow(day: WeekDay, plan: ScheduleDayPlan?) {
    val segments = plan?.segments.orEmpty()
    val text = if (segments.isEmpty()) {
        "Cerrado"
    } else {
        segments.joinToString(" · ") {
            "${AcsTime.acsHhMm(it.beginTime)}–${AcsTime.acsHhMm(it.endTime)}"
        }
    }
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .semantics { contentDescription = "${day.label}: $text" },
        horizontalArrangement = Arrangement.spacedBy(8.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Text(
            day.short,
            style = MaterialTheme.typography.labelSmall,
            color = NxColors.Muted,
            modifier = Modifier.width(30.dp),
        )
        BoxWithConstraints(
            modifier = Modifier
                .weight(1f)
                .height(14.dp)
                .background(NxColors.Surface, RoundedCornerShape(4.dp)),
        ) {
            val trackWidth = maxWidth
            segments.forEach { segment ->
                val geometry = AcsTime.bandGeometry(segment.beginTime, segment.endTime)
                if (geometry != null) {
                    val (start, width) = geometry
                    Box(
                        modifier = Modifier
                            .offset(x = trackWidth * start)
                            .width(trackWidth * width)
                            .height(14.dp)
                            .background(NxColors.Teal, RoundedCornerShape(4.dp)),
                    )
                }
            }
        }
        Text(
            text,
            style = MaterialTheme.typography.labelSmall,
            color = if (segments.isEmpty()) NxColors.Muted else NxColors.Slate,
            modifier = Modifier.width(112.dp),
        )
    }
}

/** Resumen de una línea; `null` cuando el ACS no publicó franjas. */
@Composable
fun ScheduleWeekSummary(template: ScheduleTemplate?, modifier: Modifier = Modifier) {
    val summary = template?.summary
    Text(
        text = summary ?: "Sin franjas publicadas por el terminal",
        style = MaterialTheme.typography.labelSmall,
        color = NxColors.Muted,
        modifier = modifier,
    )
}
