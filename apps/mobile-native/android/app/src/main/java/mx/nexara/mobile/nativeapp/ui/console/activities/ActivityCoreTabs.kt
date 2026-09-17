package mx.nexara.mobile.nativeapp.ui.console.activities

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.drawBehind
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import mx.nexara.mobile.nativeapp.data.AuthRepository
import mx.nexara.mobile.nativeapp.data.api.ActivityDto
import mx.nexara.mobile.nativeapp.data.api.toUserMessage
import mx.nexara.mobile.nativeapp.data.console.ConsoleRepository
import mx.nexara.mobile.nativeapp.ui.enterprise.NxColors
import mx.nexara.mobile.nativeapp.ui.enterprise.NxEmptyState
import mx.nexara.mobile.nativeapp.ui.enterprise.NxErrorBlock
import mx.nexara.mobile.nativeapp.ui.enterprise.NxLoadingBlock
import mx.nexara.mobile.nativeapp.ui.enterprise.NxPanelShell

/**
 * Pestaña «Evidencias» de Core: quien ejecuta captura aquí; quien reparte ve el
 * aviso; todos ven las evidencias del equipo que la API les deja ver.
 *
 * Va en un Column con scroll (no Lazy) a propósito: el borrador de fotos del
 * flujo de captura vive en el estado del composable y una lista perezosa lo
 * tiraría al salir de pantalla.
 */
@Composable
fun ActivityEvidenciasTab(activity: ActivityDto) {
    val context = LocalContext.current
    val user = remember(context) { AuthRepository(context).loadSession() }
    val viewerId = user?.id
    val myRow = viewerId?.let { uid ->
        activity.assignees.orEmpty().firstOrNull { it.user?.id == uid && it.retiradoAt.isNullOrBlank() }
    }
    val role = CoreActivityRules.captureRole(
        viewerId = viewerId,
        viewerEmail = user?.email,
        assignmentCharge = activity.assignmentCharge,
        responsableId = activity.responsable?.id ?: activity.responsableId,
        myActiveRol = myRow?.rol,
        hasActiveRow = myRow != null,
    )
    var refreshKey by remember(activity.id) { mutableIntStateOf(0) }

    Column(
        modifier = Modifier
            .fillMaxSize()
            .verticalScroll(rememberScrollState())
            .padding(16.dp),
        verticalArrangement = Arrangement.spacedBy(14.dp),
    ) {
        if (role == CoreActivityRules.CaptureRole.REPARTE) {
            NxPanelShell {
                Text(
                    "📨 Tú repartes esta actividad",
                    style = MaterialTheme.typography.titleMedium.copy(fontWeight = FontWeight.Bold),
                    color = NxColors.Slate,
                )
                Text(
                    "En despacho tu parte es pasarla a quien la ejecuta; no subes evidencias. " +
                        "El registro de a quién se la pasaste está en la pestaña Historial.",
                    fontSize = 13.5.sp,
                    color = NxColors.Muted,
                )
            }
        }
        if (role == CoreActivityRules.CaptureRole.CAPTURA) {
            EvidenceCaptureFlow(activity = activity, onFlowChanged = { refreshKey++ })
        }
        NxPanelShell {
            TeamEvidenceSection(activityId = activity.id, refreshKey = refreshKey)
        }
        Spacer(Modifier.height(24.dp))
    }
}

/** Pestaña «Historial»: línea de tiempo unificada (GET activities/:id/timeline). */
@Composable
fun ActivityHistorialTab(activity: ActivityDto) {
    val context = LocalContext.current
    val repo = remember(context) { ConsoleRepository(context) }
    var events by remember(activity.id) { mutableStateOf<List<Map<String, Any?>>>(emptyList()) }
    var loading by remember(activity.id) { mutableStateOf(true) }
    var error by remember(activity.id) { mutableStateOf<String?>(null) }
    var reload by remember { mutableIntStateOf(0) }

    LaunchedEffect(activity.id, reload) {
        loading = true
        try {
            events = withContext(Dispatchers.IO) { repo.activityTimelineEvents(activity.id) }
            error = null
        } catch (e: Exception) {
            error = e.toUserMessage("No se pudo cargar el historial")
        } finally {
            loading = false
        }
    }

    LazyColumn(
        contentPadding = androidx.compose.foundation.layout.PaddingValues(16.dp),
        verticalArrangement = Arrangement.spacedBy(10.dp),
    ) {
        item {
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                ToneChip("📅 ${events.size} evento${if (events.size == 1) "" else "s"}")
                val cerrada = !activity.fechaFinalizacion.isNullOrBlank()
                ToneChip(
                    if (cerrada) "Finalizada" else activity.estatus.ifBlank { "Sin estado" },
                    if (cerrada) CoreActivityRules.VERDE else CoreActivityRules.AZUL,
                )
                Spacer(Modifier.weight(1f))
                OutlinedButton(onClick = { reload++ }, enabled = !loading) { Text("↻") }
            }
        }
        when {
            loading && events.isEmpty() -> item { NxLoadingBlock("Cargando historial…") }
            error != null && events.isEmpty() -> item { NxErrorBlock(error!!) { reload++ } }
            events.isEmpty() -> item {
                NxEmptyState(
                    title = "Sin eventos",
                    subtitle = "Aún no hay movimientos registrados en esta actividad.",
                )
            }
        }
        itemsIndexed(events, key = { index, ev -> "ev-${activityMapStr(ev, "id")}-$index" }) { index, ev ->
            TimelineEventCard(ev = ev, highlighted = index == 0)
        }
        item { Spacer(Modifier.height(24.dp)) }
    }
}

@Composable
private fun TimelineEventCard(ev: Map<String, Any?>, highlighted: Boolean) {
    val icon = activityMapStr(ev, "icon").ifBlank { "•" }
    val title = activityMapStr(ev, "title")
    val subtitle = activityMapStr(ev, "subtitle")
    val at = activityMapStr(ev, "at")
    val kind = activityMapStr(ev, "kind")
    val color = when (kind.lowercase()) {
        "enviada", "despacho" -> CoreActivityRules.AZUL
        "reprogramada" -> CoreActivityRules.NARANJA
        "cumplida" -> CoreActivityRules.VERDE
        "revision", "revisión" -> CoreActivityRules.MORADO
        else -> null
    }
    Card(
        modifier = Modifier.fillMaxWidth(),
        shape = RoundedCornerShape(12.dp),
        colors = CardDefaults.cardColors(
            containerColor = if (highlighted) NxColors.BrandSoft.copy(alpha = 0.35f) else Color.White,
        ),
        border = BorderStroke(1.dp, Color(0xFFE2E8F0)),
    ) {
        Column(
            modifier = Modifier
                .drawBehind {
                    drawRect(
                        color = color?.let { Color(it) } ?: NxColors.Brand,
                        size = Size(3.dp.toPx(), size.height),
                    )
                }
                .padding(start = 16.dp, end = 12.dp, top = 12.dp, bottom = 12.dp),
            verticalArrangement = Arrangement.spacedBy(6.dp),
        ) {
            Row(verticalAlignment = Alignment.Top, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                Text(
                    "$icon $title",
                    fontSize = 13.5.sp,
                    fontWeight = FontWeight.SemiBold,
                    color = NxColors.Slate,
                    modifier = Modifier.weight(1f),
                )
                Text(CoreActivityRules.relativeTime(at), fontSize = 11.sp, color = NxColors.Muted)
            }
            ToneChip(CoreActivityRules.timelineKindLabel(kind), color)
            if (subtitle.isNotBlank()) {
                Text(subtitle, fontSize = 12.5.sp, color = NxColors.Muted)
            }
            CoreActivityRules.formatFull(at)?.let { Text(it, fontSize = 11.5.sp, color = NxColors.Muted) }
        }
    }
}
