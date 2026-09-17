package mx.nexara.mobile.nativeapp.ui.console.activities

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.pulltorefresh.PullToRefreshBox
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.SpanStyle
import androidx.compose.ui.text.buildAnnotatedString
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.withStyle
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import kotlin.math.roundToInt
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.delay
import kotlinx.coroutines.withContext
import mx.nexara.mobile.nativeapp.data.AuthRepository
import mx.nexara.mobile.nativeapp.data.api.TeamBoardHistoryItemDto
import mx.nexara.mobile.nativeapp.data.api.TeamBoardUserDto
import mx.nexara.mobile.nativeapp.data.api.toUserMessage
import mx.nexara.mobile.nativeapp.data.console.CoreActivitiesRepository
import mx.nexara.mobile.nativeapp.ui.common.ProtectedImage
import mx.nexara.mobile.nativeapp.ui.common.ProtectedPdfButton
import mx.nexara.mobile.nativeapp.ui.enterprise.NxColors
import mx.nexara.mobile.nativeapp.ui.enterprise.NxErrorBlock
import mx.nexara.mobile.nativeapp.ui.enterprise.NxLoadingBlock
import mx.nexara.mobile.nativeapp.ui.enterprise.NxPanelShell

/**
 * El día de una persona del equipo (/erp/pizarra/:userId): entrada, tiempo en
 * sitio, actividad en curso, despachos por repartir (si eres tú) e historial
 * con sus evidencias.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun BoardPersonScreen(
    userId: Long,
    onOpenActivity: (Long, String?) -> Unit,
    onAssign: (() -> Unit)? = null,
) {
    val context = LocalContext.current
    val me = remember(context) { AuthRepository(context).loadSession() }
    val repo = remember(context) { CoreActivitiesRepository(context) }
    val isSelf = me?.id == userId
    var person by remember(userId) { mutableStateOf<TeamBoardUserDto?>(null) }
    var history by remember(userId) { mutableStateOf<List<TeamBoardHistoryItemDto>>(emptyList()) }
    var loading by remember(userId) { mutableStateOf(true) }
    var refreshing by remember { mutableStateOf(false) }
    var error by remember(userId) { mutableStateOf<String?>(null) }
    var reload by remember { mutableIntStateOf(0) }
    var expandedId by remember { mutableStateOf<Long?>(null) }
    var visor by remember { mutableStateOf<Pair<List<CoreActivityRules.EvidencePhoto>, Int>?>(null) }
    /** Contrato C: Hoy · Semana · Mes (`me/board?desde&hasta`). */
    var rango by rememberSaveable { mutableStateOf(BoardRange.HOY) }

    LaunchedEffect(userId, reload, rango) {
        val (desde, hasta) = BoardRange.fechas(rango)
        try {
            val (card, hist) = withContext(Dispatchers.IO) {
                val c = repo.boardUser(userId, desde = desde, hasta = hasta)
                val h = runCatching { repo.boardUserHistory(userId, desde = desde, hasta = hasta) }
                    .getOrDefault(emptyList())
                c to h
            }
            person = card
            history = hist
            error = null
        } catch (e: Exception) {
            error = e.toUserMessage("No se pudo cargar el perfil")
        } finally {
            loading = false
            refreshing = false
        }
    }

    // Igual que la web: el día de la persona se refresca solo cada 30 s.
    LaunchedEffect(userId) {
        while (true) {
            delay(30_000)
            reload++
        }
    }

    val p = person
    if (p == null) {
        if (loading) {
            NxLoadingBlock("Cargando perfil…")
        } else {
            Column(Modifier.padding(16.dp)) { NxErrorBlock(error ?: "No encontrado") { reload++ } }
        }
        return
    }

    PullToRefreshBox(
        isRefreshing = refreshing,
        onRefresh = {
            refreshing = true
            reload++
        },
        modifier = Modifier.fillMaxSize(),
    ) {
        LazyColumn(
            modifier = Modifier.fillMaxSize().background(NxColors.Surface),
            contentPadding = PaddingValues(16.dp),
            verticalArrangement = Arrangement.spacedBy(14.dp),
        ) {
            item {
                NxPanelShell {
                    Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(16.dp)) {
                        PersonAvatar(p.nombre, p.avatarUrl, 80.dp)
                        Column(Modifier.weight(1f)) {
                            Text(p.nombre ?: "—", fontSize = 22.sp, fontWeight = FontWeight.ExtraBold, color = NxColors.Slate)
                            Text(
                                p.puesto?.takeIf { it.isNotBlank() } ?: p.email.orEmpty(),
                                fontSize = 13.5.sp,
                                color = NxColors.Muted,
                            )
                            Spacer(Modifier.height(8.dp))
                            val color = Color(CoreActivityRules.boardStatusColor(p.status))
                            Row(
                                verticalAlignment = Alignment.CenterVertically,
                                horizontalArrangement = Arrangement.spacedBy(8.dp),
                                modifier = Modifier
                                    .clip(RoundedCornerShape(999.dp))
                                    .background(color.copy(alpha = 0.14f))
                                    .padding(horizontal = 12.dp, vertical = 6.dp),
                            ) {
                                Box(Modifier.size(10.dp).clip(CircleShape).background(color))
                                Text(
                                    CoreActivityRules.boardEstadoTexto(p.status, p.currentLateMinutes, p.idleSinceAt),
                                    fontSize = 13.sp,
                                    fontWeight = FontWeight.Bold,
                                    color = color,
                                )
                            }
                            Spacer(Modifier.height(6.dp))
                            BoardStatusExtras(user = p, centered = false)
                        }
                    }
                }
            }

            item {
                BoardRangeSelector(
                    rango = rango,
                    onRango = { rango = it },
                    modifier = Modifier.fillMaxWidth(),
                )
            }

            // Contrato C: a tiempo, eficiencia, productividad y cerradas del rango.
            val tiles = BoardKpis.tiles(p.kpis)
            if (tiles.isNotEmpty()) {
                item {
                    Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                        tiles.chunked(2).forEach { fila ->
                            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                                fila.forEach { tile ->
                                    KpiTile(tile = tile, modifier = Modifier.weight(1f))
                                }
                                if (fila.size == 1) Spacer(Modifier.weight(1f))
                            }
                        }
                    }
                }
            }

            item {
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    PersonStat(
                        label = "Entrada hoy",
                        value = if (p.clockInAt != null) CoreActivityRules.formatClock(p.clockInAt) else "Sin entrada",
                        hint = if (p.clockInAt != null) "Check-in" else "Sin registro",
                        modifier = Modifier.weight(1f),
                    )
                    PersonStat(
                        label = "Tiempo en sitio",
                        value = CoreActivityRules.formatBoardMinutes(p.workedMinutes),
                        hint = "Desde la entrada",
                        modifier = Modifier.weight(1f),
                    )
                    PersonStat(
                        label = "En actividad",
                        value = CoreActivityRules.formatBoardMinutes(p.activityElapsedMinutes),
                        hint = p.activityStartedAt?.let { "Desde ${CoreActivityRules.formatClock(it)}" } ?: "Sin actividad",
                        modifier = Modifier.weight(1f),
                    )
                }
            }

            item {
                NxPanelShell {
                    Text("ACTIVIDAD EN CURSO", fontSize = 12.sp, fontWeight = FontWeight.ExtraBold, color = NxColors.Muted)
                    Spacer(Modifier.height(6.dp))
                    val act = p.currentActivity
                    if (act != null) {
                        act.anNumber?.let { Text(it, fontSize = 15.sp, fontWeight = FontWeight.ExtraBold, color = NxColors.Slate) }
                        Text(act.titulo.orEmpty(), fontSize = 16.sp, color = NxColors.Slate)
                        Text("Estatus: ${act.estatus.orEmpty()}", fontSize = 13.sp, color = NxColors.Muted)
                        TextButton(onClick = { onOpenActivity(act.id, null) }) {
                            Text("Abrir actividad →", color = NxColors.Brand, fontWeight = FontWeight.Bold)
                        }
                    } else {
                        Text("Sin actividad abierta en este momento.", fontSize = 14.sp, color = NxColors.Muted)
                    }
                }
            }

            if (isSelf) {
                item {
                    DespachoPendingPanel(
                        managerEmail = me?.email ?: p.email,
                        managerUserId = p.id,
                        pending = p.openActivities.orEmpty(),
                        onDone = { reload++ },
                    )
                }
            }

            item {
                Text("HISTORIAL DE ACTIVIDADES", fontSize = 12.sp, fontWeight = FontWeight.ExtraBold, color = NxColors.Muted)
                Text(
                    BoardRange.descripcion(rango),
                    fontSize = 12.sp,
                    color = NxColors.Muted,
                )
            }
            if (history.isEmpty()) {
                item { Text("Sin historial todavía.", fontSize = 14.sp, color = NxColors.Muted) }
            }
            items(history, key = { "h-${it.id}" }) { h ->
                HistoryCard(
                    h = h,
                    nombre = p.nombre,
                    open = expandedId == h.id,
                    onToggle = { expandedId = if (expandedId == h.id) null else h.id },
                    onOpenActivity = { onOpenActivity(h.id, null) },
                    onOpenPhoto = { fotos, index -> visor = fotos to index },
                )
            }

            if (!isSelf && onAssign != null) {
                item {
                    Button(
                        onClick = onAssign,
                        colors = ButtonDefaults.buttonColors(containerColor = NxColors.Brand),
                        modifier = Modifier.fillMaxWidth().heightIn(min = 52.dp),
                    ) { Text("Asignar actividad", fontWeight = FontWeight.Bold) }
                }
            }
            item { Spacer(Modifier.height(24.dp)) }
        }
    }

    visor?.let { (fotos, index) ->
        EvidencePhotoViewer(fotos = fotos, startIndex = index, onClose = { visor = null })
    }
}

/** Hoy · Semana · Mes (contrato C); lo que se elige va como `desde`/`hasta`. */
@Composable
fun BoardRangeSelector(
    rango: BoardRange,
    onRango: (BoardRange) -> Unit,
    modifier: Modifier = Modifier,
) {
    Column(modifier = modifier, verticalArrangement = Arrangement.spacedBy(4.dp)) {
        Row(
            modifier = Modifier
                .clip(RoundedCornerShape(14.dp))
                .background(Color.White)
                .border(1.dp, Color(0xFFE2E8F0), RoundedCornerShape(14.dp))
                .padding(4.dp),
            horizontalArrangement = Arrangement.spacedBy(6.dp),
        ) {
            BoardRange.entries.forEach { opcion ->
                val on = opcion == rango
                Box(
                    modifier = Modifier
                        .weight(1f)
                        .heightIn(min = 44.dp)
                        .clip(RoundedCornerShape(10.dp))
                        .background(if (on) NxColors.Brand else Color.Transparent)
                        .clickable { onRango(opcion) },
                    contentAlignment = Alignment.Center,
                ) {
                    Text(
                        opcion.etiqueta,
                        fontSize = 13.5.sp,
                        fontWeight = if (on) FontWeight.ExtraBold else FontWeight.SemiBold,
                        color = if (on) Color.White else NxColors.Slate,
                    )
                }
            }
        }
        Text(BoardRange.descripcion(rango), fontSize = 11.5.sp, color = NxColors.Muted)
    }
}

/** Un número de la tira de KPI (a tiempo, eficiencia, productividad, cerradas). */
@Composable
fun KpiTile(tile: BoardKpis.Tile, modifier: Modifier = Modifier) {
    val color = Color(tile.color)
    Column(
        modifier = modifier
            .clip(RoundedCornerShape(16.dp))
            .background(Color.White)
            .border(1.dp, color.copy(alpha = 0.3f), RoundedCornerShape(16.dp))
            .padding(horizontal = 12.dp, vertical = 12.dp),
        verticalArrangement = Arrangement.spacedBy(2.dp),
    ) {
        Text(tile.etiqueta, fontSize = 11.5.sp, fontWeight = FontWeight.SemiBold, color = NxColors.Muted, maxLines = 1)
        Text(tile.valor, fontSize = 20.sp, fontWeight = FontWeight.ExtraBold, color = color, maxLines = 1)
        Text(tile.pie, fontSize = 11.sp, color = NxColors.Muted, maxLines = 2)
    }
}

@Composable
private fun PersonStat(label: String, value: String, hint: String, modifier: Modifier = Modifier) {
    Column(
        modifier = modifier
            .clip(RoundedCornerShape(16.dp))
            .background(Color.White)
            .border(1.dp, Color(0xFFE2E8F0), RoundedCornerShape(16.dp))
            .padding(horizontal = 10.dp, vertical = 12.dp),
        verticalArrangement = Arrangement.spacedBy(4.dp),
    ) {
        Text(label, fontSize = 11.5.sp, fontWeight = FontWeight.SemiBold, color = NxColors.Muted, maxLines = 1)
        Text(value, fontSize = 18.sp, fontWeight = FontWeight.ExtraBold, color = NxColors.Slate, maxLines = 1)
        Text(hint, fontSize = 11.sp, color = NxColors.Muted, maxLines = 2)
    }
}

@Composable
private fun HistoryCard(
    h: TeamBoardHistoryItemDto,
    nombre: String?,
    open: Boolean,
    onToggle: () -> Unit,
    onOpenActivity: () -> Unit,
    onOpenPhoto: (List<CoreActivityRules.EvidencePhoto>, Int) -> Unit,
) {
    val ev = h.evidence
    val charge = when (h.assignmentCharge?.lowercase()) {
        "despacho" -> "Despacho"
        "ejecucion" -> "Ejecución"
        else -> null
    }
    val subtitle = listOfNotNull(
        h.estatus,
        ev?.progressPct?.let { "avance ${it.roundToInt()}%" },
        h.coreKind?.let { CoreActivityRules.kindLabel(it, h.ticketTypeCustom) },
        charge,
    ).joinToString(" · ")

    Card(
        modifier = Modifier.fillMaxWidth(),
        shape = RoundedCornerShape(14.dp),
        colors = CardDefaults.cardColors(containerColor = Color.White),
        border = BorderStroke(1.dp, Color(0xFFE2E8F0)),
    ) {
        Column(Modifier.padding(12.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
            Column(Modifier.fillMaxWidth().clickable(onClick = onToggle)) {
                Text(
                    listOfNotNull(h.anNumber, h.titulo).joinToString(" · "),
                    fontSize = 14.sp,
                    fontWeight = FontWeight.ExtraBold,
                    color = NxColors.Slate,
                )
                if (subtitle.isNotBlank()) Text(subtitle, fontSize = 12.sp, color = NxColors.Muted)
            }
            Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                // Contrato C: sigue en su historial aunque la hayan sacado de la actividad.
                if (h.retirado == true) {
                    ToneChip("Retirado", CoreActivityRules.MORADO)
                }
                ActivitySemaforo.luz(h.semaforo)?.let { luz -> ToneChip("● ${luz.etiqueta}", luz.color) }
                ActivitySemaforo.planRealTexto(h.minutosPlan, h.minutosReales)?.let { texto ->
                    ToneChip(texto, ActivitySemaforo.planRealColor(h.excedida))
                }
            }
            if (open) {
                if (ev != null) {
                    val fotos = CoreActivityRules.fotosEtiquetadas(
                        ev.entryPhotoUrl,
                        ev.evidencePhotos,
                        ev.exitPhotoUrl,
                        nombre,
                    )
                    if (fotos.isNotEmpty()) {
                        Row(
                            modifier = Modifier.horizontalScroll(rememberScrollState()),
                            horizontalArrangement = Arrangement.spacedBy(8.dp),
                        ) {
                            fotos.forEachIndexed { i, foto ->
                                Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
                                    Box(
                                        Modifier
                                            .size(88.dp)
                                            .clip(RoundedCornerShape(10.dp))
                                            .border(1.dp, Color(0xFFE2E8F0), RoundedCornerShape(10.dp))
                                            .clickable { onOpenPhoto(fotos, i) },
                                    ) {
                                        ProtectedImage(url = foto.url, contentDescription = foto.titulo, modifier = Modifier.fillMaxSize())
                                    }
                                    Text(foto.etiqueta, fontSize = 11.5.sp, fontWeight = FontWeight.SemiBold, color = NxColors.Slate)
                                }
                            }
                        }
                    }
                    CoreActivityRules.formEntries(ev.serviceSheetData, h.coreKind).forEach { (label, value) ->
                        Text(
                            buildAnnotatedString {
                                withStyle(SpanStyle(fontWeight = FontWeight.Bold)) { append("$label: ") }
                                append(value)
                            },
                            fontSize = 13.sp,
                            color = NxColors.Slate,
                        )
                    }
                    ev.serviceSheetPdfUrl?.takeIf { it.isNotBlank() }?.let {
                        ProtectedPdfButton(url = it, label = "Ver hoja de servicio (PDF)")
                    }
                } else {
                    Text("Sin evidencia de esta persona.", fontSize = 13.sp, color = NxColors.Muted)
                }
                TextButton(onClick = onOpenActivity) {
                    Text("Abrir actividad →", color = NxColors.Brand, fontWeight = FontWeight.Bold)
                }
            }
        }
    }
}
