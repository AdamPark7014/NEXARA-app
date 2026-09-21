package mx.nexara.mobile.nativeapp.ui.enterprise

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.IntrinsicSize
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.RowScope
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Text
import androidx.compose.material3.VerticalDivider
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.TextUnit
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp

/**
 * Las piezas «densas» del panel: la tira de cifras, el estado como punto y
 * palabra, la barra única de filtros y el control segmentado.
 *
 * Existen porque el contrato de diseño que aprobó el dueño (`.ai/DISENO-FINANZAS.md`)
 * pide exactamente esto y la app no lo tenía: las pantallas resolvían cada caso
 * a mano con cajas dentro de cajas, pastillas rellenas y rejillas de tarjetas
 * con sombra. Están en `ui/enterprise` porque las comparten Actividades y
 * Asistencias; la lógica de QUÉ cifras se pintan vive aparte, en [NxMetric] y en
 * las reglas de cada pantalla, y se prueba en la JVM.
 */

/**
 * Tokens que el panel usa y que [NxColors] no declaraba: son los mismos valores
 * de `apps/web/app/ui-tokens.scss`, para que móvil y web se vean iguales.
 */
object NxUi {
    /** `--ui-border`: borde por defecto de tarjeta, campo y botón secundario. */
    val Border = Color(0xFFE2E8F0)

    /** `--ui-border-subtle`: separadores internos (entre filas, entre celdas). */
    val BorderSubtle = Color(0xFFEEF2F6)

    /** `--ui-border-strong`: divisor de sección, borde exterior. */
    val BorderStrong = Color(0xFFCBD5E1)

    /** `--ui-surface-2`: superficie hundida (encabezado de tabla, campo de solo lectura). */
    val Sunken = Color(0xFFF8FAFC)

    /** `--ui-fg-2`: texto secundario que SÍ hay que leer (no es `--ui-fg-3`). */
    val Fg2 = Color(0xFF475569)

    /** `--ui-radius` / `--ui-radius-lg`. */
    val Radius = 8.dp
    val RadiusLg = 12.dp

    /** `--ui-control-h`: 32 px de alto de control. En el teléfono, 44 de zona táctil. */
    val ControlH = 32.dp
    val TouchH = 44.dp
}

// ── Tira de cifras (regla 1 y regla 7) ───────────────────────────────────────

/**
 * Una sola caja con divisiones internas: etiqueta pequeña, cifra grande, pista.
 * No es una rejilla de tarjetas con sombra ni lleva minigráfica.
 *
 * Con la lista vacía **no dibuja nada** (regla 7: una fila de ceros no informa).
 * Quien la llama no tiene que acordarse de comprobarlo.
 *
 * Si [onSelect] viene, cada celda filtra la vista en el sitio y la seleccionada
 * se marca; es la misma celda, no un control extra debajo.
 */
@Composable
fun NxMetricStrip(
    items: List<NxMetric>,
    modifier: Modifier = Modifier,
    seleccion: String? = null,
    onSelect: ((String) -> Unit)? = null,
) {
    if (items.isEmpty()) return
    // En un teléfono, más de tres celdas en fila dejan las cifras sin sitio.
    val columnas = if (items.size >= 4) 2 else items.size
    val shape = RoundedCornerShape(NxUi.RadiusLg)
    Column(
        modifier = modifier
            .fillMaxWidth()
            .clip(shape)
            .background(NxColors.Card)
            .border(1.dp, NxUi.Border, shape),
    ) {
        items.chunked(columnas).forEachIndexed { fila, celdas ->
            if (fila > 0) HorizontalDivider(color = NxUi.BorderSubtle)
            Row(Modifier.fillMaxWidth().height(IntrinsicSize.Min)) {
                celdas.forEachIndexed { i, metric ->
                    if (i > 0) VerticalDivider(color = NxUi.BorderSubtle)
                    NxMetricCell(
                        metric = metric,
                        modifier = Modifier.weight(1f),
                        activa = seleccion != null && seleccion == metric.clave,
                        onSelect = onSelect,
                    )
                }
                // Hueco de la última fila incompleta: sin borde, para no fingir una celda.
                repeat(columnas - celdas.size) { Spacer(Modifier.weight(1f)) }
            }
        }
    }
}

@Composable
private fun NxMetricCell(
    metric: NxMetric,
    modifier: Modifier,
    activa: Boolean,
    onSelect: ((String) -> Unit)?,
) {
    val clickable = if (onSelect != null) {
        Modifier.clickable { onSelect(metric.clave) }
    } else {
        Modifier
    }
    Column(
        modifier = modifier
            .then(clickable)
            .background(if (activa) NxColors.BrandSoft.copy(alpha = 0.55f) else Color.Transparent)
            .padding(horizontal = 12.dp, vertical = 10.dp),
        verticalArrangement = Arrangement.spacedBy(1.dp),
    ) {
        Text(
            metric.etiqueta,
            fontSize = 11.sp,
            fontWeight = FontWeight.Medium,
            color = NxUi.Fg2,
            maxLines = 1,
            overflow = TextOverflow.Ellipsis,
        )
        Text(
            metric.valor,
            fontSize = 24.sp,
            fontWeight = FontWeight.Bold,
            color = metric.color?.let { Color(it) } ?: NxColors.Slate,
            maxLines = 1,
        )
        metric.pista?.takeIf { it.isNotBlank() }?.let {
            Text(
                it,
                fontSize = 11.sp,
                color = NxColors.Muted,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
            )
        }
    }
}

// ── Estado: un punto y una palabra (regla 3) ─────────────────────────────────

/**
 * El estado de una fila, sin pastilla rellena. Con seis estados por tarjeta las
 * pastillas convierten la pantalla en un semáforo y deja de distinguirse lo que
 * urge; el punto hace el mismo trabajo sin gritar.
 *
 * `color = null` es el gris del flujo normal. Se pone color **solo** cuando ese
 * renglón pide acción o algo salió mal.
 */
@Composable
fun NxStatusDot(
    text: String,
    modifier: Modifier = Modifier,
    color: Long? = null,
    fontSize: TextUnit = 12.5.sp,
    fontWeight: FontWeight = FontWeight.Medium,
    maxLines: Int = 1,
) {
    val tinta = color?.let { Color(it) } ?: NxUi.Fg2
    Row(
        modifier = modifier,
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(6.dp),
    ) {
        Box(Modifier.size(6.dp).clip(CircleShape).background(tinta))
        Text(
            text,
            fontSize = fontSize,
            fontWeight = fontWeight,
            color = tinta,
            maxLines = maxLines,
            overflow = TextOverflow.Ellipsis,
        )
    }
}

// ── Filtros: UNA barra, sin caja (regla 8) ───────────────────────────────────

/**
 * Los filtros van en una fila que se desliza, sin fondo y sin recuadro propio.
 * Un control ya trae su borde; meterlo en una caja es dibujar el borde dos veces.
 */
@Composable
fun NxFilterBar(
    modifier: Modifier = Modifier,
    contentPadding: androidx.compose.foundation.layout.PaddingValues =
        androidx.compose.foundation.layout.PaddingValues(horizontal = 16.dp),
    content: @Composable RowScope.() -> Unit,
) {
    Row(
        modifier = modifier
            .fillMaxWidth()
            .horizontalScroll(rememberScrollState())
            .padding(contentPadding),
        horizontalArrangement = Arrangement.spacedBy(8.dp),
        verticalAlignment = Alignment.CenterVertically,
        content = content,
    )
}

/** Pastilla de filtro con su punto de color y su conteo. Tocar la activa vuelve a «Todos». */
@Composable
fun NxFilterPill(
    label: String,
    count: Int?,
    selected: Boolean,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
    color: Long? = null,
) {
    val tinta = color?.let { Color(it) }
    val shape = RoundedCornerShape(999.dp)
    Row(
        modifier = modifier
            .clip(shape)
            .background(
                when {
                    selected && tinta != null -> tinta.copy(alpha = 0.12f)
                    selected -> NxColors.BrandSoft
                    else -> NxColors.Card
                },
            )
            .border(
                if (selected) 1.5.dp else 1.dp,
                when {
                    selected && tinta != null -> tinta.copy(alpha = 0.55f)
                    selected -> NxColors.Brand
                    else -> NxUi.Border
                },
                shape,
            )
            .clickable(onClick = onClick)
            .heightIn(min = 36.dp)
            .padding(horizontal = 12.dp, vertical = 7.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(6.dp),
    ) {
        if (tinta != null) Box(Modifier.size(7.dp).clip(CircleShape).background(tinta))
        Text(
            label,
            fontSize = 13.sp,
            fontWeight = if (selected) FontWeight.Bold else FontWeight.Medium,
            color = if (selected) NxColors.Slate else NxUi.Fg2,
            maxLines = 1,
        )
        if (count != null) {
            Text(
                count.toString(),
                fontSize = 13.sp,
                fontWeight = FontWeight.Bold,
                color = (if (selected) NxColors.Slate else NxUi.Fg2).copy(alpha = 0.65f),
                maxLines = 1,
            )
        }
    }
}

/** Control segmentado (Hoy · Semana · Mes). Es un solo control: un borde, no tres. */
@Composable
fun NxSegmented(
    options: List<String>,
    selectedIndex: Int,
    onSelect: (Int) -> Unit,
    modifier: Modifier = Modifier,
) {
    val shape = RoundedCornerShape(NxUi.Radius)
    Row(
        modifier = modifier
            .clip(shape)
            .background(NxColors.Card)
            .border(1.dp, NxUi.Border, shape)
            .padding(2.dp),
        horizontalArrangement = Arrangement.spacedBy(2.dp),
    ) {
        options.forEachIndexed { i, label ->
            val on = i == selectedIndex
            Box(
                modifier = Modifier
                    .clip(RoundedCornerShape(6.dp))
                    .background(if (on) NxColors.Brand else Color.Transparent)
                    .clickable { onSelect(i) }
                    .heightIn(min = 32.dp)
                    .padding(horizontal = 14.dp),
                contentAlignment = Alignment.Center,
            ) {
                Text(
                    label,
                    fontSize = 13.sp,
                    fontWeight = if (on) FontWeight.Bold else FontWeight.Medium,
                    color = if (on) Color.White else NxUi.Fg2,
                    maxLines = 1,
                )
            }
        }
    }
}

// ── Encabezados y separadores ────────────────────────────────────────────────

/**
 * Encabezado de sección: la jerarquía la dan el aire y la tipografía, no una
 * caja más (regla 9). Nunca dibuja fondo ni borde.
 */
@Composable
fun NxDenseSectionHeader(
    title: String,
    modifier: Modifier = Modifier,
    hint: String? = null,
    trailing: (@Composable () -> Unit)? = null,
) {
    Row(
        modifier = modifier.fillMaxWidth(),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        Column(Modifier.weight(1f)) {
            Text(
                title,
                fontSize = 13.sp,
                fontWeight = FontWeight.Bold,
                color = NxColors.Slate,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
            )
            hint?.takeIf { it.isNotBlank() }?.let {
                Text(it, fontSize = 11.5.sp, color = NxColors.Muted, maxLines = 2, overflow = TextOverflow.Ellipsis)
            }
        }
        trailing?.invoke()
    }
}

/** Separador de 1 px entre filas de una misma superficie. */
@Composable
fun NxRowDivider(modifier: Modifier = Modifier) {
    HorizontalDivider(modifier = modifier, color = NxUi.BorderSubtle)
}
