package mx.nexara.mobile.nativeapp.ui.console.activities

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.IntrinsicSize
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.outlined.KeyboardArrowRight
import androidx.compose.material.icons.outlined.Check
import androidx.compose.material.icons.outlined.Map
import androidx.compose.material.icons.outlined.Place
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.VerticalDivider
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import mx.nexara.mobile.nativeapp.data.api.ActivityDto
import mx.nexara.mobile.nativeapp.ui.enterprise.NxDimens
import mx.nexara.mobile.nativeapp.ui.enterprise.NxFormat
import mx.nexara.mobile.nativeapp.ui.enterprise.NxGlyph
import mx.nexara.mobile.nativeapp.ui.enterprise.NxIconText
import mx.nexara.mobile.nativeapp.ui.enterprise.NxPalette
import mx.nexara.mobile.nativeapp.ui.enterprise.NxTheme
import mx.nexara.mobile.nativeapp.ui.enterprise.icon

/*
 * Piezas del detalle de actividad v2 (`.ai/ui-maquetas/movil-actividad.html`):
 * cabecera con chips y título grande, tarjeta del sitio, tira de datos, lista
 * de pasos de evidencia y el dock inferior. Todas leen el tema ([NxTheme]) para
 * que el modo oscuro funcione.
 */

/** Color de categoría por tipo de actividad (acentos del logotipo; es color de TIPO, no de estado). */
fun categoryColor(coreKind: String?, c: NxPalette): Color = when (coreKind?.trim()?.lowercase()) {
    "obra" -> c.categoryOrange
    "proyecto" -> c.categorySky
    "comercial" -> c.categoryMagenta
    "servicio" -> c.categoryCctv
    else -> c.brand
}

/** Chip plano v2: fondo al 12 %, texto en el color. */
@Composable
fun NxChip(
    text: String,
    color: Color,
    modifier: Modifier = Modifier,
    icon: ImageVector? = null,
    dot: Boolean = false,
) {
    Row(
        modifier = modifier
            .clip(RoundedCornerShape(999.dp))
            .background(color.copy(alpha = 0.12f))
            .padding(horizontal = 10.dp, vertical = 5.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(5.dp),
    ) {
        if (dot) Box(Modifier.size(7.dp).clip(CircleShape).background(color))
        if (icon != null) Icon(icon, contentDescription = null, tint = color, modifier = Modifier.size(14.dp))
        Text(text, fontSize = 12.5.sp, fontWeight = FontWeight.SemiBold, color = color, maxLines = 1)
    }
}

/** Cabecera: tipo · estado · semáforo, título a 22 sp y folio. */
@OptIn(ExperimentalLayoutApi::class)
@Composable
fun ActivityHeaderV2(
    detail: ActivityDto,
    sesion: SesionActividad?,
    modifier: Modifier = Modifier,
) {
    val c = NxTheme.colors
    val kindColor = categoryColor(detail.coreKind, c)
    val estado = when {
        sesion?.enPausa == true -> "En pausa" to c.warning
        sesion?.enCurso == true -> "En curso" to c.info
        else -> {
            val ui = CoreActivityRules.estatusUi(detail.estatus)
            ui.label to when (ui.color) {
                CoreActivityRules.ROJO -> c.danger
                CoreActivityRules.VERDE -> c.success
                CoreActivityRules.AZUL, CoreActivityRules.MORADO -> c.info
                else -> c.fg2
            }
        }
    }
    val luz = ActivitySemaforo.luz(detail.semaforo)
    Column(modifier = modifier.fillMaxWidth(), verticalArrangement = Arrangement.spacedBy(8.dp)) {
        FlowRow(horizontalArrangement = Arrangement.spacedBy(6.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
            NxChip(
                text = CoreActivityRules.kindLabel(detail.coreKind, detail.ticketTypeCustom),
                color = kindColor,
                icon = CoreActivityRules.kindGlyph(detail.coreKind).icon,
            )
            NxChip(text = estado.first, color = estado.second, dot = true)
            luz?.let { NxChip(text = it.etiqueta, color = Color(it.color)) }
            if (CoreActivityRules.isUrgent(detail.prioridad)) NxChip(text = "Urgente", color = c.danger)
            if (detail.assignmentCharge == "despacho") NxChip(text = "Despacho", color = c.categoryMagenta, icon = NxGlyph.DISPATCH.icon)
        }
        Text(
            detail.titulo?.takeIf { it.isNotBlank() }
                ?: detail.anNumber?.takeIf { it.isNotBlank() }
                ?: "Actividad #${detail.id}",
            fontSize = 22.sp,
            lineHeight = 27.sp,
            fontWeight = FontWeight.Bold,
            color = c.fg,
            maxLines = 3,
            overflow = TextOverflow.Ellipsis,
        )
        val meta = listOfNotNull(
            detail.anNumber?.takeIf { it.isNotBlank() }?.let { "Folio $it" },
            ActivitySemaforo.asignadaPorTexto(detail.asignadoPor?.nombre),
            ActivitySemaforo.planRealTexto(detail.minutosPlan, detail.minutosReales),
        ).joinToString(" · ")
        if (meta.isNotBlank()) {
            Text(meta, fontSize = 13.sp, color = c.muted, maxLines = 2, overflow = TextOverflow.Ellipsis)
        }
    }
}

/** Dónde es el trabajo: cliente, sucursal y «Mapa» si hay coordenadas. */
@Composable
fun ActivityPlaceCard(
    detail: ActivityDto,
    onOpenMap: (String) -> Unit,
    modifier: Modifier = Modifier,
) {
    val c = NxTheme.colors
    val titulo = detail.client?.name?.takeIf { it.isNotBlank() } ?: detail.branchName?.takeIf { it.isNotBlank() } ?: return
    val sub = listOfNotNull(
        detail.branchName?.takeIf { it.isNotBlank() && it != titulo },
        detail.branchCity?.takeIf { it.isNotBlank() },
        detail.branchState?.takeIf { it.isNotBlank() },
    ).joinToString(" · ").ifBlank { detail.branchAddress?.takeIf { it.isNotBlank() } ?: "" }
    val mapa = CoreActivityRules.mapsUrl(detail.branchLatitude, detail.branchLongitude)
    val shape = RoundedCornerShape(NxDimens.PanelRadius)
    Row(
        modifier = modifier
            .fillMaxWidth()
            .clip(shape)
            .background(c.card)
            .border(1.dp, c.border, shape)
            .padding(12.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        Box(
            modifier = Modifier.size(44.dp).background(c.infoSoft, RoundedCornerShape(NxDimens.ControlRadius)),
            contentAlignment = Alignment.Center,
        ) {
            Icon(Icons.Outlined.Place, contentDescription = null, tint = c.info, modifier = Modifier.size(22.dp))
        }
        Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(1.dp)) {
            Text(titulo, fontSize = 15.sp, fontWeight = FontWeight.Bold, color = c.fg, maxLines = 1, overflow = TextOverflow.Ellipsis)
            if (sub.isNotBlank()) Text(sub, fontSize = 13.sp, color = c.muted, maxLines = 2, overflow = TextOverflow.Ellipsis)
        }
        if (mapa != null) {
            Button(
                onClick = { onOpenMap(mapa) },
                colors = ButtonDefaults.buttonColors(containerColor = c.brandSoft, contentColor = c.brandText),
                shape = RoundedCornerShape(NxDimens.ControlRadius),
                modifier = Modifier.heightIn(min = 44.dp),
                contentPadding = androidx.compose.foundation.layout.PaddingValues(horizontal = 14.dp),
            ) {
                Icon(Icons.Outlined.Map, contentDescription = null, modifier = Modifier.size(18.dp))
                Spacer(Modifier.width(6.dp))
                Text("Mapa", fontWeight = FontWeight.Bold)
            }
        }
    }
}

/** Tira de tres datos: plan, real y entrega (o la hora de inicio real). */
@Composable
fun ActivityFactsStrip(
    detail: ActivityDto,
    sesion: SesionActividad?,
    modifier: Modifier = Modifier,
) {
    val c = NxTheme.colors
    val plan = CoreActivityRules.formatMinutes(detail.minutosPlan)
    val real = CoreActivityRules.formatMinutes(detail.minutosReales)
    val entrega = detail.fechaEntregaEsperada?.takeIf { it.isNotBlank() }?.let { NxFormat.date(it) }
        ?: detail.fechaMaxima?.takeIf { it.isNotBlank() }?.let { CoreActivityRules.formatWhen(it) }
    val desde = sesion?.sesionAbiertaDesde?.let { CoreActivityRules.formatClock(it) }?.takeIf { it != "—" }
    val celdas = listOf(
        "Plan" to plan,
        (if (sesion?.enCurso == true && desde != null) "Desde" else "Real") to
            (if (sesion?.enCurso == true && desde != null) desde else real),
        "Entrega" to (entrega ?: "—"),
    )
    if (celdas.all { it.second == "—" }) return
    val shape = RoundedCornerShape(NxDimens.PanelRadius)
    Row(
        modifier = modifier
            .fillMaxWidth()
            .clip(shape)
            .background(c.card)
            .border(1.dp, c.border, shape)
            .height(IntrinsicSize.Min),
    ) {
        celdas.forEachIndexed { i, (etiqueta, valor) ->
            if (i > 0) VerticalDivider(color = c.borderSubtle)
            Column(Modifier.weight(1f).padding(horizontal = 12.dp, vertical = 10.dp), verticalArrangement = Arrangement.spacedBy(2.dp)) {
                Text(etiqueta, fontSize = 11.5.sp, fontWeight = FontWeight.Medium, color = c.muted, maxLines = 1)
                Text(valor, fontSize = 14.5.sp, fontWeight = FontWeight.Bold, color = if (valor == "—") c.fg4 else c.fg, maxLines = 1, overflow = TextOverflow.Ellipsis)
            }
        }
    }
}

/** Lista de pasos de evidencia: hecho · actual · pendiente, con avance arriba. */
@Composable
fun ActivityStepsCard(
    pasos: List<ActivityDockRules.Paso>,
    onOpen: () -> Unit,
    modifier: Modifier = Modifier,
) {
    if (pasos.isEmpty()) return
    val c = NxTheme.colors
    val hechos = ActivityDockRules.hechos(pasos)
    val shape = RoundedCornerShape(NxDimens.PanelRadius)
    Column(
        modifier = modifier
            .fillMaxWidth()
            .clip(shape)
            .background(c.card)
            .border(1.dp, c.border, shape),
    ) {
        Column(Modifier.padding(start = 16.dp, end = 16.dp, top = 14.dp, bottom = 8.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Text("Pasos de evidencia", fontSize = 16.sp, fontWeight = FontWeight.Bold, color = c.fg, modifier = Modifier.weight(1f))
                Text("$hechos de ${pasos.size}", fontSize = 13.5.sp, fontWeight = FontWeight.SemiBold, color = c.muted)
            }
            LinearProgressIndicator(
                progress = { if (pasos.isEmpty()) 0f else hechos.toFloat() / pasos.size },
                modifier = Modifier.fillMaxWidth().height(8.dp).clip(RoundedCornerShape(999.dp)),
                color = c.brand,
                trackColor = c.sunken,
                drawStopIndicator = {},
            )
        }
        pasos.forEachIndexed { i, paso ->
            if (i > 0) HorizontalDivider(color = c.borderSubtle)
            val actual = paso.estado == ActivityDockRules.PasoEstado.ACTUAL
            val hecho = paso.estado == ActivityDockRules.PasoEstado.HECHO
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .background(if (actual) c.brandSoft.copy(alpha = 0.6f) else Color.Transparent)
                    .clickable(onClick = onOpen)
                    .padding(horizontal = 16.dp, vertical = 12.dp),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(12.dp),
            ) {
                if (actual) Box(Modifier.width(3.dp).height(40.dp).background(c.brand, RoundedCornerShape(2.dp)))
                Box(
                    modifier = Modifier
                        .size(40.dp)
                        .background(
                            when {
                                hecho -> c.successSoft
                                actual -> c.brand
                                else -> c.sunken
                            },
                            RoundedCornerShape(NxDimens.ControlRadius),
                        )
                        .then(if (!hecho && !actual) Modifier.border(1.5.dp, c.borderStrong, RoundedCornerShape(NxDimens.ControlRadius)) else Modifier),
                    contentAlignment = Alignment.Center,
                ) {
                    when {
                        hecho -> Icon(Icons.Outlined.Check, contentDescription = null, tint = c.success, modifier = Modifier.size(20.dp))
                        actual -> Icon(glyphFor(paso.step), contentDescription = null, tint = Color.White, modifier = Modifier.size(20.dp))
                        else -> Icon(glyphFor(paso.step), contentDescription = null, tint = c.muted, modifier = Modifier.size(20.dp))
                    }
                }
                Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(1.dp)) {
                    Text(
                        paso.label,
                        fontSize = 14.5.sp,
                        fontWeight = FontWeight.SemiBold,
                        color = if (hecho || actual) c.fg else c.fg2,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis,
                    )
                    Text(paso.detalle, fontSize = 12.5.sp, color = c.muted, maxLines = 1, overflow = TextOverflow.Ellipsis)
                }
                if (actual) {
                    NxChip(text = "Sigue", color = c.brandText)
                } else {
                    Icon(Icons.AutoMirrored.Outlined.KeyboardArrowRight, contentDescription = null, tint = c.fg4)
                }
            }
        }
    }
}

private fun glyphFor(step: String): ImageVector = when (step) {
    CoreActivityRules.STEP_ENTRY -> NxGlyph.ENTRY.icon
    CoreActivityRules.STEP_EXIT -> NxGlyph.EXIT.icon
    CoreActivityRules.STEP_PDF -> NxGlyph.PROCEDURE.icon
    CoreActivityRules.STEP_DATA -> NxGlyph.DOCUMENTATION.icon
    else -> NxGlyph.PHOTO.icon
}

/** Acción secundaria del dock. */
data class DockSecondary(
    val label: String,
    val icon: ImageVector? = null,
    val enabled: Boolean = true,
    val onClick: () -> Unit,
)

/**
 * Dock inferior fijo: botón principal de 56 dp al alcance del pulgar, las
 * secundarias en una fila debajo y una línea de ayuda.
 */
@Composable
fun ActivityDock(
    label: String,
    onPrimary: () -> Unit,
    modifier: Modifier = Modifier,
    enabled: Boolean = true,
    loading: Boolean = false,
    icon: ImageVector? = null,
    hint: String? = null,
    error: String? = null,
    secondary: List<DockSecondary> = emptyList(),
) {
    val c = NxTheme.colors
    Surface(
        modifier = modifier.fillMaxWidth(),
        color = c.card,
        shadowElevation = 8.dp,
        tonalElevation = 0.dp,
    ) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .navigationBarsPadding()
                .padding(start = 16.dp, end = 16.dp, top = 12.dp, bottom = 12.dp),
            verticalArrangement = Arrangement.spacedBy(8.dp),
        ) {
            HorizontalDivider(color = c.borderSubtle, modifier = Modifier.padding(bottom = 2.dp))
            Button(
                onClick = onPrimary,
                enabled = enabled && !loading,
                colors = ButtonDefaults.buttonColors(
                    containerColor = c.brand,
                    contentColor = Color.White,
                    disabledContainerColor = c.sunken,
                    disabledContentColor = c.fg4,
                ),
                shape = RoundedCornerShape(18.dp),
                modifier = Modifier.fillMaxWidth().heightIn(min = NxDimens.DockButtonHeight),
            ) {
                if (loading) {
                    CircularProgressIndicator(modifier = Modifier.size(20.dp), strokeWidth = 2.dp, color = Color.White)
                    Spacer(Modifier.width(10.dp))
                } else if (icon != null) {
                    Icon(icon, contentDescription = null, modifier = Modifier.size(22.dp))
                    Spacer(Modifier.width(8.dp))
                }
                Text(label, fontSize = 16.sp, fontWeight = FontWeight.Bold, maxLines = 1, overflow = TextOverflow.Ellipsis)
            }
            if (secondary.isNotEmpty()) {
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    secondary.forEach { s ->
                        OutlinedButton(
                            onClick = s.onClick,
                            enabled = s.enabled && !loading,
                            shape = RoundedCornerShape(NxDimens.ControlRadius),
                            colors = ButtonDefaults.outlinedButtonColors(contentColor = c.fg),
                            border = androidx.compose.foundation.BorderStroke(1.dp, c.borderStrong),
                            modifier = Modifier.weight(1f).heightIn(min = NxDimens.PrimaryButtonHeight),
                        ) {
                            if (s.icon != null) {
                                Icon(s.icon, contentDescription = null, modifier = Modifier.size(18.dp))
                                Spacer(Modifier.width(6.dp))
                            }
                            Text(s.label, fontWeight = FontWeight.SemiBold, maxLines = 1, overflow = TextOverflow.Ellipsis)
                        }
                    }
                }
            }
            val nota = error ?: hint
            if (!nota.isNullOrBlank()) {
                NxIconText(
                    text = nota,
                    icon = null,
                    fontSize = 12.5.sp,
                    color = if (error != null) c.danger else c.muted,
                    maxLines = 2,
                    overflow = TextOverflow.Ellipsis,
                    modifier = Modifier.fillMaxWidth(),
                )
            }
        }
    }
}
