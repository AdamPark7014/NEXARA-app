package mx.nexara.mobile.nativeapp.ui.enterprise

import androidx.compose.animation.core.LinearEasing
import androidx.compose.animation.core.RepeatMode
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.tween
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxScope
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Clear
import androidx.compose.material.icons.filled.Search
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.OutlinedTextFieldDefaults
import androidx.compose.material3.Snackbar
import androidx.compose.material3.SnackbarHost
import androidx.compose.material3.SnackbarHostState
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TopAppBarDefaults
import androidx.compose.material3.pulltorefresh.PullToRefreshBox
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.style.TextAlign
import mx.nexara.mobile.nativeapp.ui.NexaraAppMeta
import androidx.compose.ui.draw.clip
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.Dp
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

object NxDimens {
    val PanelRadius = 12.dp
    val PanelElevation = 2.dp
}

enum class NxTone { Neutral, Success, Warning, Danger, Info, Brand }

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun NxTealTopAppBarColors() = TopAppBarDefaults.topAppBarColors(
    containerColor = NxColors.Teal,
    titleContentColor = Color.White,
    navigationIconContentColor = Color.White,
    actionIconContentColor = Color.White,
)

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

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun NxPanelShell(
    modifier: Modifier = Modifier,
    onClick: (() -> Unit)? = null,
    contentPadding: PaddingValues = PaddingValues(14.dp),
    content: @Composable ColumnScope.() -> Unit,
) {
    val shape = RoundedCornerShape(NxDimens.PanelRadius)
    val colors = CardDefaults.cardColors(containerColor = NxColors.Card)
    val elevation = CardDefaults.cardElevation(NxDimens.PanelElevation)
    if (onClick != null) {
        Card(
            onClick = onClick,
            modifier = modifier.fillMaxWidth(),
            shape = shape,
            colors = colors,
            elevation = elevation,
        ) {
            Column(Modifier.padding(contentPadding), content = content)
        }
    } else {
        Card(
            modifier = modifier.fillMaxWidth(),
            shape = shape,
            colors = colors,
            elevation = elevation,
        ) {
            Column(Modifier.padding(contentPadding), content = content)
        }
    }
}

@Composable
fun NxKpiCard(
    kpi: NxKpi,
    modifier: Modifier = Modifier,
) {
    Card(
        modifier = modifier,
        shape = RoundedCornerShape(NxDimens.PanelRadius),
        colors = CardDefaults.cardColors(containerColor = NxColors.Card),
        elevation = CardDefaults.cardElevation(NxDimens.PanelElevation),
    ) {
        Column(modifier = Modifier.padding(14.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
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
        shape = RoundedCornerShape(NxDimens.PanelRadius),
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
        shape = RoundedCornerShape(NxDimens.PanelRadius),
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
        shape = RoundedCornerShape(NxDimens.PanelRadius),
        colors = CardDefaults.cardColors(containerColor = NxColors.Card),
        elevation = CardDefaults.cardElevation(NxDimens.PanelElevation),
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

// ── UI primitives (listas, búsqueda, carga, scaffold) ─────────────────────────

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun NxSearchField(
    value: String,
    onValueChange: (String) -> Unit,
    modifier: Modifier = Modifier,
    placeholder: String = "Buscar…",
    enabled: Boolean = true,
) {
    OutlinedTextField(
        value = value,
        onValueChange = onValueChange,
        placeholder = { Text(placeholder, color = NxColors.Muted) },
        leadingIcon = {
            Icon(Icons.Default.Search, contentDescription = "Buscar", tint = NxColors.Muted)
        },
        trailingIcon = {
            if (value.isNotEmpty()) {
                IconButton(onClick = { onValueChange("") }) {
                    Icon(Icons.Default.Clear, contentDescription = "Limpiar búsqueda", tint = NxColors.Muted)
                }
            }
        },
        modifier = modifier.fillMaxWidth(),
        singleLine = true,
        enabled = enabled,
        shape = RoundedCornerShape(NxDimens.PanelRadius),
        colors = OutlinedTextFieldDefaults.colors(
            focusedBorderColor = NxColors.Teal,
            cursorColor = NxColors.Teal,
            focusedLeadingIconColor = NxColors.Teal,
        ),
    )
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun NxListRow(
    title: String,
    modifier: Modifier = Modifier,
    subtitle: String? = null,
    meta: String? = null,
    chipText: String? = null,
    chipTone: NxTone = NxTone.Neutral,
    trailing: (@Composable () -> Unit)? = null,
    onClick: (() -> Unit)? = null,
) {
    val shape = RoundedCornerShape(NxDimens.PanelRadius)
    val rowContent: @Composable ColumnScope.() -> Unit = {
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.spacedBy(10.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Column(modifier = Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(2.dp)) {
                Text(
                    title,
                    style = MaterialTheme.typography.bodyMedium.copy(fontWeight = FontWeight.SemiBold),
                    color = NxColors.Slate,
                    maxLines = 2,
                    overflow = TextOverflow.Ellipsis,
                )
                if (!subtitle.isNullOrBlank()) {
                    Text(
                        subtitle,
                        style = MaterialTheme.typography.bodySmall,
                        color = NxColors.Muted,
                        maxLines = 2,
                        overflow = TextOverflow.Ellipsis,
                    )
                }
                if (!meta.isNullOrBlank()) {
                    Text(meta, style = MaterialTheme.typography.labelSmall, color = NxColors.Muted)
                }
            }
            if (!chipText.isNullOrBlank()) {
                NxStatusChip(chipText, chipTone)
            }
            trailing?.invoke()
        }
    }
    if (onClick != null) {
        Card(
            onClick = onClick,
            modifier = modifier.fillMaxWidth(),
            shape = shape,
            colors = CardDefaults.cardColors(containerColor = NxColors.Card),
            elevation = CardDefaults.cardElevation(NxDimens.PanelElevation),
        ) {
            Column(Modifier.padding(14.dp), content = rowContent)
        }
    } else {
        Card(
            modifier = modifier.fillMaxWidth(),
            shape = shape,
            colors = CardDefaults.cardColors(containerColor = NxColors.Card),
            elevation = CardDefaults.cardElevation(NxDimens.PanelElevation),
        ) {
            Column(Modifier.padding(14.dp), content = rowContent)
        }
    }
}

@Composable
fun NxSkeletonBlock(
    modifier: Modifier = Modifier,
    height: Dp = 16.dp,
    cornerRadius: Dp = 8.dp,
) {
    val transition = rememberInfiniteTransition(label = "nxShimmer")
    val shimmer by transition.animateFloat(
        initialValue = 0f,
        targetValue = 1f,
        animationSpec = infiniteRepeatable(
            animation = tween(durationMillis = 1200, easing = LinearEasing),
            repeatMode = RepeatMode.Restart,
        ),
        label = "nxShimmerOffset",
    )
    val base = Color(0xFFE2E8F0)
    val highlight = Color(0xFFF8FAFC)
    val brush = Brush.linearGradient(
        colors = listOf(base, highlight, base),
        start = Offset(shimmer * 600f - 200f, 0f),
        end = Offset(shimmer * 600f + 200f, 0f),
    )
    Box(
        modifier = modifier
            .height(height)
            .clip(RoundedCornerShape(cornerRadius))
            .background(brush),
    )
}

@Composable
fun NxSkeletonList(
    itemCount: Int = 5,
    itemHeight: Dp = 72.dp,
    modifier: Modifier = Modifier,
) {
    Column(modifier = modifier, verticalArrangement = Arrangement.spacedBy(8.dp)) {
        repeat(itemCount) {
            NxSkeletonBlock(
                modifier = Modifier.fillMaxWidth(),
                height = itemHeight,
                cornerRadius = NxDimens.PanelRadius,
            )
        }
    }
}

/**
 * Surface de pantalla con fondo Nx y pull-to-refresh opcional.
 *
 * ```
 * NxScreenScaffold(isRefreshing = state.isRefreshing, onRefresh = vm::refresh) {
 *     LazyColumn(Modifier.fillMaxSize()) { ... }
 * }
 * ```
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun NxScreenScaffold(
    modifier: Modifier = Modifier,
    isRefreshing: Boolean = false,
    onRefresh: (() -> Unit)? = null,
    content: @Composable BoxScope.() -> Unit,
) {
    Surface(modifier = modifier.fillMaxSize(), color = NxColors.Surface) {
        if (onRefresh != null) {
            PullToRefreshBox(
                isRefreshing = isRefreshing,
                onRefresh = onRefresh,
                modifier = Modifier.fillMaxSize(),
            ) {
                Box(Modifier.fillMaxSize(), content = content)
            }
        } else {
            Box(Modifier.fillMaxSize(), content = content)
        }
    }
}

/**
 * Snackbar con estilo NEXARA. Patrón recomendado:
 *
 * ```
 * val snackbarHostState = rememberNxSnackbarHostState()
 * val scope = rememberCoroutineScope()
 *
 * Scaffold(snackbarHost = { NxSnackbarHost(snackbarHostState) }) { padding ->
 *     // ...
 * }
 *
 * scope.launch { snackbarHostState.showSnackbar("Guardado correctamente") }
 * ```
 */
@Composable
fun rememberNxSnackbarHostState(): SnackbarHostState = remember { SnackbarHostState() }

@Composable
fun NxSnackbarHost(
    hostState: SnackbarHostState,
    modifier: Modifier = Modifier,
) {
    SnackbarHost(hostState = hostState, modifier = modifier) { data ->
        Snackbar(
            snackbarData = data,
            containerColor = NxColors.Slate,
            contentColor = Color.White,
            actionColor = NxColors.TealSoft,
            shape = RoundedCornerShape(NxDimens.PanelRadius),
        )
    }
}

/** Pie de pantalla con versión de la app (estándar en hub, perfil y login). */
@Composable
fun NxAppMetaFooter(
    modifier: Modifier = Modifier,
    onOpenPrivacy: (() -> Unit)? = null,
) {
    val context = androidx.compose.ui.platform.LocalContext.current
    val label = remember(context) { NexaraAppMeta.buildLabel(context) }
    Column(
        modifier = modifier.fillMaxWidth(),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(4.dp),
    ) {
        Text(
            text = "NEXARA · $label",
            style = MaterialTheme.typography.labelSmall,
            color = NxColors.Muted,
            textAlign = TextAlign.Center,
        )
        if (onOpenPrivacy != null) {
            TextButton(onClick = onOpenPrivacy) {
                Text(
                    "Política de privacidad",
                    style = MaterialTheme.typography.labelSmall,
                    color = NxColors.Teal,
                )
            }
        }
    }
}
