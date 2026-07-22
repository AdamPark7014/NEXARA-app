package mx.nexara.mobile.nativeapp.ui.enterprise

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp

/**
 * Design system Enterprise compartido — KPIs, alertas, tendencias, estados vacíos.
 * Uso: dashboards y pantallas de decisión (no CRUD genérico).
 */
object NxColors {
    val Teal = Color(0xFF0D9488)
    val TealSoft = Color(0xFFCCFBF1)
    val Slate = Color(0xFF0F172A)
    val Muted = Color(0xFF64748B)
    val Success = Color(0xFF10B981)
    val SuccessSoft = Color(0xFFD1FAE5)
    val Warning = Color(0xFFF59E0B)
    val WarningSoft = Color(0xFFFEF3C7)
    val Danger = Color(0xFFEF4444)
    val DangerSoft = Color(0xFFFEE2E2)
    val Info = Color(0xFF3B82F6)
    val InfoSoft = Color(0xFFDBEAFE)
    val Surface = Color(0xFFF8FAFC)
    val Card = Color.White
}

enum class NxTone { Neutral, Success, Warning, Danger, Info, Brand }

fun NxTone.fg(): Color = when (this) {
    NxTone.Neutral -> NxColors.Muted
    NxTone.Success -> NxColors.Success
    NxTone.Warning -> NxColors.Warning
    NxTone.Danger -> NxColors.Danger
    NxTone.Info -> NxColors.Info
    NxTone.Brand -> NxColors.Teal
}

fun NxTone.bg(): Color = when (this) {
    NxTone.Neutral -> Color(0xFFF1F5F9)
    NxTone.Success -> NxColors.SuccessSoft
    NxTone.Warning -> NxColors.WarningSoft
    NxTone.Danger -> NxColors.DangerSoft
    NxTone.Info -> NxColors.InfoSoft
    NxTone.Brand -> NxColors.TealSoft
}

data class NxKpi(
    val label: String,
    val value: String,
    val hint: String? = null,
    val delta: String? = null,
    val tone: NxTone = NxTone.Brand,
    val sparkline: List<Float> = emptyList(),
)

data class NxAlert(
    val id: String,
    val title: String,
    val subtitle: String? = null,
    val tone: NxTone = NxTone.Warning,
    val actionLabel: String? = null,
    val onAction: (() -> Unit)? = null,
)

@Composable
fun NxSectionHeader(
    title: String,
    subtitle: String? = null,
    trailing: (@Composable () -> Unit)? = null,
) {
    Row(
        modifier = Modifier.fillMaxWidth(),
        horizontalArrangement = Arrangement.SpaceBetween,
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Column(modifier = Modifier.weight(1f)) {
            Text(
                title,
                style = MaterialTheme.typography.titleMedium.copy(fontWeight = FontWeight.Bold),
                color = NxColors.Slate,
            )
            if (!subtitle.isNullOrBlank()) {
                Text(subtitle, style = MaterialTheme.typography.bodySmall, color = NxColors.Muted)
            }
        }
        trailing?.invoke()
    }
}

@Composable
fun NxKpiCard(
    kpi: NxKpi,
    modifier: Modifier = Modifier,
) {
    Card(
        modifier = modifier,
        shape = RoundedCornerShape(16.dp),
        colors = CardDefaults.cardColors(containerColor = NxColors.Card),
        elevation = CardDefaults.cardElevation(2.dp),
    ) {
        Column(Modifier = Modifier.padding(14.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
            Text(kpi.label, style = MaterialTheme.typography.labelMedium, color = NxColors.Muted)
            Text(
                kpi.value,
                style = MaterialTheme.typography.headlineSmall.copy(fontWeight = FontWeight.Bold),
                color = NxColors.Slate,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
            )
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Column {
                    if (!kpi.hint.isNullOrBlank()) {
                        Text(kpi.hint, style = MaterialTheme.typography.labelSmall, color = NxColors.Muted)
                    }
                    if (!kpi.delta.isNullOrBlank()) {
                        Text(
                            kpi.delta,
                            style = MaterialTheme.typography.labelSmall.copy(fontWeight = FontWeight.SemiBold),
                            color = kpi.tone.fg(),
                        )
                    }
                }
                if (kpi.sparkline.size >= 2) {
                    NxSparkline(
                        values = kpi.sparkline,
                        color = kpi.tone.fg(),
                        modifier = Modifier.width(64.dp).height(28.dp),
                    )
                }
            }
        }
    }
}

@Composable
fun NxKpiGrid(
    items: List<NxKpi>,
    columns: Int = 2,
    modifier: Modifier = Modifier,
) {
    Column(modifier = modifier, verticalArrangement = Arrangement.spacedBy(10.dp)) {
        items.chunked(columns).forEach { row ->
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(10.dp),
            ) {
                row.forEach { kpi ->
                    NxKpiCard(kpi = kpi, modifier = Modifier.weight(1f))
                }
                repeat(columns - row.size) { Spacer(Modifier.weight(1f)) }
            }
        }
    }
}

@Composable
fun NxSparkline(
    values: List<Float>,
    color: Color,
    modifier: Modifier = Modifier,
) {
    val min = values.minOrNull() ?: 0f
    val max = values.maxOrNull() ?: 1f
    val range = (max - min).takeIf { it > 0f } ?: 1f
    Canvas(modifier = modifier) {
        val stepX = if (values.size <= 1) size.width else size.width / (values.size - 1)
        val path = Path()
        values.forEachIndexed { i, v ->
            val x = i * stepX
            val y = size.height - ((v - min) / range) * size.height
            if (i == 0) path.moveTo(x, y) else path.lineTo(x, y)
        }
        drawPath(path, color = color, style = Stroke(width = 3f, cap = StrokeCap.Round))
        val last = values.last()
        val lx = (values.size - 1) * stepX
        val ly = size.height - ((last - min) / range) * size.height
        drawCircle(color = color, radius = 4f, center = Offset(lx, ly))
    }
}

@Composable
fun NxAlertBanner(alert: NxAlert, modifier: Modifier = Modifier) {
    Card(
        modifier = modifier.fillMaxWidth(),
        shape = RoundedCornerShape(14.dp),
        colors = CardDefaults.cardColors(containerColor = alert.tone.bg()),
        elevation = CardDefaults.cardElevation(0.dp),
    ) {
        Row(
            modifier = Modifier.padding(14.dp),
            horizontalArrangement = Arrangement.spacedBy(10.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Box(
                modifier = Modifier
                    .size(8.dp)
                    .background(alert.tone.fg(), RoundedCornerShape(4.dp)),
            )
            Column(modifier = Modifier.weight(1f)) {
                Text(
                    alert.title,
                    style = MaterialTheme.typography.bodyMedium.copy(fontWeight = FontWeight.SemiBold),
                    color = NxColors.Slate,
                )
                if (!alert.subtitle.isNullOrBlank()) {
                    Text(alert.subtitle, style = MaterialTheme.typography.bodySmall, color = NxColors.Muted)
                }
            }
            if (alert.actionLabel != null && alert.onAction != null) {
                TextButton(onClick = alert.onAction) {
                    Text(alert.actionLabel, color = alert.tone.fg(), fontWeight = FontWeight.Bold)
                }
            }
        }
    }
}

@Composable
fun NxStatusChip(text: String, tone: NxTone = NxTone.Neutral) {
    Box(
        modifier = Modifier
            .background(tone.bg(), RoundedCornerShape(8.dp))
            .padding(horizontal = 10.dp, vertical = 4.dp),
    ) {
        Text(
            text,
            style = MaterialTheme.typography.labelSmall.copy(fontWeight = FontWeight.SemiBold),
            color = tone.fg(),
            fontSize = 11.sp,
        )
    }
}

@Composable
fun NxEmptyState(
    title: String,
    subtitle: String,
    actionLabel: String? = null,
    onAction: (() -> Unit)? = null,
) {
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .padding(vertical = 32.dp, horizontal = 16.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        Text(title, style = MaterialTheme.typography.titleMedium.copy(fontWeight = FontWeight.SemiBold), color = NxColors.Slate)
        Text(subtitle, style = MaterialTheme.typography.bodySmall, color = NxColors.Muted)
        if (actionLabel != null && onAction != null) {
            Spacer(Modifier.height(4.dp))
            Button(onClick = onAction, colors = ButtonDefaults.buttonColors(containerColor = NxColors.Teal)) {
                Text(actionLabel)
            }
        }
    }
}

@Composable
fun NxLoadingBlock(message: String = "Cargando…") {
    Column(
        modifier = Modifier.fillMaxWidth().padding(24.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        CircularProgressIndicator(color = NxColors.Teal)
        Text(message, color = NxColors.Muted, style = MaterialTheme.typography.bodySmall)
    }
}

@Composable
fun NxErrorBlock(message: String, onRetry: (() -> Unit)? = null) {
    Card(
        modifier = Modifier.fillMaxWidth(),
        colors = CardDefaults.cardColors(containerColor = NxColors.DangerSoft),
        shape = RoundedCornerShape(14.dp),
    ) {
        Column(Modifier.padding(14.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
            Text("No se pudo cargar", fontWeight = FontWeight.SemiBold, color = NxColors.Danger)
            Text(message, style = MaterialTheme.typography.bodySmall, color = NxColors.Slate)
            if (onRetry != null) {
                OutlinedButton(onClick = onRetry) { Text("Reintentar") }
            }
        }
    }
}

@Composable
fun NxDecisionCard(
    title: String,
    subtitle: String? = null,
    status: String? = null,
    statusTone: NxTone = NxTone.Warning,
    meta: String? = null,
    approveLabel: String = "Aprobar",
    rejectLabel: String = "Rechazar",
    acting: Boolean = false,
    onApprove: () -> Unit,
    onReject: () -> Unit,
    content: (@Composable ColumnScope.() -> Unit)? = null,
) {
    Card(
        modifier = Modifier.fillMaxWidth(),
        shape = RoundedCornerShape(16.dp),
        colors = CardDefaults.cardColors(containerColor = NxColors.Card),
        elevation = CardDefaults.cardElevation(2.dp),
    ) {
        Column(Modifier.padding(14.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.Top,
            ) {
                Column(modifier = Modifier.weight(1f)) {
                    Text(title, fontWeight = FontWeight.Bold, color = NxColors.Slate)
                    if (!subtitle.isNullOrBlank()) {
                        Text(subtitle, style = MaterialTheme.typography.bodySmall, color = NxColors.Muted)
                    }
                    if (!meta.isNullOrBlank()) {
                        Text(meta, style = MaterialTheme.typography.labelSmall, color = NxColors.Muted)
                    }
                }
                if (!status.isNullOrBlank()) {
                    NxStatusChip(status, statusTone)
                }
            }
            content?.invoke(this)
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                Button(
                    onClick = onApprove,
                    enabled = !acting,
                    colors = ButtonDefaults.buttonColors(containerColor = NxColors.Success),
                    contentPadding = PaddingValues(horizontal = 14.dp, vertical = 8.dp),
                ) { Text(approveLabel) }
                OutlinedButton(
                    onClick = onReject,
                    enabled = !acting,
                    contentPadding = PaddingValues(horizontal = 14.dp, vertical = 8.dp),
                ) { Text(rejectLabel, color = NxColors.Danger) }
            }
        }
    }
}

/** Construye sparkline simple a partir de conteos diarios (rellena con 0). */
fun sparklineFromCounts(counts: List<Int>, padTo: Int = 7): List<Float> {
    val padded = if (counts.size >= padTo) counts.takeLast(padTo)
    else List(padTo - counts.size) { 0 } + counts
    return padded.map { it.toFloat() }
}
