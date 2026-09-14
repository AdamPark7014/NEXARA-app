package mx.nexara.mobile.nativeapp.ui.console.activities

import android.content.Context
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
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
import androidx.compose.foundation.lazy.grid.GridCells
import androidx.compose.foundation.lazy.grid.GridItemSpan
import androidx.compose.foundation.lazy.grid.LazyVerticalGrid
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.pulltorefresh.PullToRefreshBox
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.drawBehind
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import mx.nexara.mobile.nativeapp.data.AuthRepository
import mx.nexara.mobile.nativeapp.data.SessionUser
import mx.nexara.mobile.nativeapp.data.api.MyActivitiesResponseDto
import mx.nexara.mobile.nativeapp.data.api.MyActivityItemDto
import mx.nexara.mobile.nativeapp.data.api.TeamBoardResponseDto
import mx.nexara.mobile.nativeapp.data.api.TeamBoardUserDto
import mx.nexara.mobile.nativeapp.data.api.toUserMessage
import mx.nexara.mobile.nativeapp.data.console.CoreActivitiesRepository
import mx.nexara.mobile.nativeapp.ui.enterprise.NxColors
import mx.nexara.mobile.nativeapp.ui.enterprise.NxErrorBlock
import mx.nexara.mobile.nativeapp.ui.enterprise.NxLoadingBlock
import androidx.compose.foundation.lazy.grid.items as gridItems

private const val ACTIVIDADES_PREFS = "nexara_actividades"
private const val VISTA_KEY = "vista"
private const val VISTA_MIAS = "mias"
private const val VISTA_EQUIPO = "equipo"

private data class PendingMove(val item: MyActivityItemDto, val from: Int, val to: Int)

/**
 * «Actividades» de Core — paridad con apps/web/app/(panels)/erp/pizarra/page.tsx:
 *
 * - El CEO solo ve la pizarra del equipo (asigna y revisa, no ejecuta).
 * - Quien tiene gente en su pizarra elige «✅ Mis actividades» o «👥 Mi equipo»
 *   (se recuerda la última).
 * - Todos los demás ven directo su lista.
 */
@Composable
fun ActividadesScreen(
    initialVista: String? = null,
    onOpenActivity: (Long, String?) -> Unit,
    onOpenPerson: (Long) -> Unit,
    onSelfAssign: (() -> Unit)? = null,
) {
    val context = LocalContext.current
    val user = remember(context) { AuthRepository(context).loadSession() }
    val repo = remember(context) { CoreActivitiesRepository(context) }
    val prefs = remember(context) { context.getSharedPreferences(ACTIVIDADES_PREFS, Context.MODE_PRIVATE) }
    val isCeo = CoreActivityRules.isCeoEmail(user?.email)

    var vista by rememberSaveable(initialVista) {
        mutableStateOf(
            CoreActivityRules.normalizeVista(initialVista)
                ?: CoreActivityRules.normalizeVista(runCatching { prefs.getString(VISTA_KEY, null) }.getOrNull())
                ?: VISTA_MIAS,
        )
    }
    var board by remember { mutableStateOf<TeamBoardResponseDto?>(null) }
    var boardError by remember { mutableStateOf<String?>(null) }
    var boardLoading by remember { mutableStateOf(true) }
    var boardReload by remember { mutableIntStateOf(0) }

    LaunchedEffect(boardReload) {
        boardLoading = true
        try {
            board = withContext(Dispatchers.IO) { repo.board() }
            boardError = null
        } catch (e: Exception) {
            boardError = e.toUserMessage("No se pudo cargar Actividades")
        } finally {
            boardLoading = false
        }
    }

    val users = board?.users.orEmpty().let { list ->
        val me = user?.id
        if (me == null) list else list.sortedBy { if (it.id == me) 0 else 1 }
    }
    val otros = users.count { it.id != user?.id }
    val tieneEquipo = otros > 0
    val cargandoEquipo = !isCeo && board == null && boardError == null
    val sinEquipo = !isCeo && !tieneEquipo && (board != null || boardError != null)
    val conPestanas = !isCeo && tieneEquipo
    val verMias = conPestanas && vista == VISTA_MIAS
    val viendoEquipo = isCeo || (conPestanas && vista == VISTA_EQUIPO)

    // La pizarra se actualiza sola cada 30 s mientras se está viendo.
    LaunchedEffect(viendoEquipo) {
        if (!viendoEquipo) return@LaunchedEffect
        while (true) {
            delay(30_000)
            try {
                board = withContext(Dispatchers.IO) { repo.board() }
            } catch (_: Exception) {
                // Sin red: se queda la última pizarra.
            }
        }
    }

    fun cambiarVista(v: String) {
        vista = v
        runCatching { prefs.edit().putString(VISTA_KEY, v).apply() }
    }

    when {
        cargandoEquipo -> NxLoadingBlock("Cargando actividades…")
        sinEquipo -> MisActividadesContent(
            user = user,
            repo = repo,
            onOpenActivity = onOpenActivity,
            onOpenPerson = onOpenPerson,
            onSelfAssign = onSelfAssign,
        )
        else -> Column(Modifier.fillMaxSize().background(NxColors.Surface)) {
            if (conPestanas) {
                VistaTabs(vista = vista, onChange = ::cambiarVista)
            }
            if (verMias) {
                MisActividadesContent(
                    user = user,
                    repo = repo,
                    onOpenActivity = onOpenActivity,
                    onOpenPerson = onOpenPerson,
                    onSelfAssign = onSelfAssign,
                )
            } else {
                TeamBoardContent(
                    users = users,
                    meId = user?.id,
                    loading = boardLoading,
                    error = boardError,
                    onRefresh = { boardReload++ },
                    onOpenPerson = onOpenPerson,
                )
            }
        }
    }
}

@Composable
private fun VistaTabs(vista: String, onChange: (String) -> Unit) {
    Row(
        modifier = Modifier
            .padding(horizontal = 16.dp, vertical = 10.dp)
            .clip(RoundedCornerShape(14.dp))
            .background(Color.White)
            .border(1.dp, Color(0xFFE2E8F0), RoundedCornerShape(14.dp))
            .padding(4.dp),
        horizontalArrangement = Arrangement.spacedBy(6.dp),
    ) {
        listOf(VISTA_MIAS to "✅ Mis actividades", VISTA_EQUIPO to "👥 Mi equipo").forEach { (id, label) ->
            val on = vista == id
            Box(
                modifier = Modifier
                    .weight(1f)
                    .heightIn(min = 44.dp)
                    .clip(RoundedCornerShape(10.dp))
                    .background(if (on) NxColors.Teal else Color.Transparent)
                    .clickable { onChange(id) },
                contentAlignment = Alignment.Center,
            ) {
                Text(
                    label,
                    fontSize = 14.sp,
                    fontWeight = if (on) FontWeight.ExtraBold else FontWeight.SemiBold,
                    color = if (on) Color.White else NxColors.Slate,
                )
            }
        }
    }
}

// ── Pizarra del equipo ──────────────────────────────────────────────────────

@OptIn(ExperimentalMaterial3Api::class, ExperimentalLayoutApi::class)
@Composable
private fun TeamBoardContent(
    users: List<TeamBoardUserDto>,
    meId: Long?,
    loading: Boolean,
    error: String?,
    onRefresh: () -> Unit,
    onOpenPerson: (Long) -> Unit,
) {
    val counts = users.groupingBy { it.status ?: "sin_actividad" }.eachCount()
    PullToRefreshBox(
        isRefreshing = loading && users.isNotEmpty(),
        onRefresh = onRefresh,
        modifier = Modifier.fillMaxSize(),
    ) {
        LazyVerticalGrid(
            columns = GridCells.Adaptive(minSize = 156.dp),
            contentPadding = PaddingValues(16.dp),
            horizontalArrangement = Arrangement.spacedBy(12.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp),
            modifier = Modifier.fillMaxSize(),
        ) {
            item(span = { GridItemSpan(maxLineSpan) }) {
                Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
                    Text(
                        "Tú y tu equipo — toca a alguien para ver su día o asignarle trabajo",
                        fontSize = 13.sp,
                        color = NxColors.Muted,
                    )
                    FlowRow(
                        horizontalArrangement = Arrangement.spacedBy(8.dp),
                        verticalArrangement = Arrangement.spacedBy(6.dp),
                    ) {
                        CoreActivityRules.BOARD_STATUS_ORDER.forEach { status ->
                            val color = Color(CoreActivityRules.boardStatusColor(status))
                            Row(
                                verticalAlignment = Alignment.CenterVertically,
                                horizontalArrangement = Arrangement.spacedBy(7.dp),
                                modifier = Modifier
                                    .clip(RoundedCornerShape(999.dp))
                                    .background(Color.White)
                                    .border(1.dp, Color(0xFFE2E8F0), RoundedCornerShape(999.dp))
                                    .padding(horizontal = 10.dp, vertical = 5.dp),
                            ) {
                                Box(Modifier.size(8.dp).clip(CircleShape).background(color))
                                Text(
                                    "${CoreActivityRules.boardStatusLabel(status)} ${counts[status] ?: 0}",
                                    fontSize = 12.sp,
                                    fontWeight = FontWeight.SemiBold,
                                    color = NxColors.Slate,
                                )
                            }
                        }
                    }
                }
            }
            when {
                loading && users.isEmpty() -> item(span = { GridItemSpan(maxLineSpan) }) {
                    NxLoadingBlock("Cargando…")
                }
                error != null && users.isEmpty() -> item(span = { GridItemSpan(maxLineSpan) }) {
                    NxErrorBlock(error, onRefresh)
                }
                users.isEmpty() -> item(span = { GridItemSpan(maxLineSpan) }) {
                    Text("Nadie en tu equipo por ahora.", fontSize = 14.sp, color = NxColors.Muted)
                }
            }
            gridItems(users, key = { it.id }) { u ->
                PersonBoardCard(user = u, isSelf = u.id == meId, onClick = { onOpenPerson(u.id) })
            }
        }
    }
}

@Composable
private fun PersonBoardCard(user: TeamBoardUserDto, isSelf: Boolean, onClick: () -> Unit) {
    val statusColor = Color(CoreActivityRules.boardStatusColor(user.status))
    Card(
        onClick = onClick,
        shape = RoundedCornerShape(20.dp),
        colors = CardDefaults.cardColors(
            containerColor = if (isSelf) NxColors.TealSoft.copy(alpha = 0.35f) else Color.White,
        ),
        border = BorderStroke(
            if (isSelf) 2.dp else 1.dp,
            if (isSelf) NxColors.Teal.copy(alpha = 0.55f) else Color(0xFFE2E8F0),
        ),
        modifier = Modifier.fillMaxWidth(),
    ) {
        Column(
            modifier = Modifier.fillMaxWidth().padding(start = 12.dp, end = 12.dp, top = 18.dp, bottom = 14.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.spacedBy(8.dp),
        ) {
            Box {
                PersonAvatar(user.nombre, user.avatarUrl, 72.dp)
                Box(
                    Modifier
                        .align(Alignment.BottomEnd)
                        .size(18.dp)
                        .clip(CircleShape)
                        .background(Color.White)
                        .padding(3.dp)
                        .clip(CircleShape)
                        .background(statusColor),
                )
            }
            Text(
                user.nombre ?: "—",
                fontSize = 14.sp,
                fontWeight = FontWeight.ExtraBold,
                color = NxColors.Slate,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
                textAlign = TextAlign.Center,
            )
            if (isSelf) {
                Text("TÚ", fontSize = 11.sp, fontWeight = FontWeight.ExtraBold, color = NxColors.Teal, letterSpacing = 1.sp)
            }
            Text(
                CoreActivityRules.boardStatusLabel(user.status),
                fontSize = 12.sp,
                fontWeight = FontWeight.SemiBold,
                color = statusColor,
            )
            val open = user.openActivities.orEmpty()
            if (open.isNotEmpty()) {
                Column(Modifier.fillMaxWidth(), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                    open.take(3).forEach { a ->
                        val suffix = when (a.assignmentCharge?.lowercase()) {
                            "despacho" -> " · Despacho"
                            "ejecucion" -> " · Ejecución"
                            else -> ""
                        }
                        Text(
                            "${a.titulo.orEmpty()}$suffix",
                            fontSize = 10.5.sp,
                            fontWeight = FontWeight.SemiBold,
                            color = NxColors.Muted,
                            maxLines = 1,
                            overflow = TextOverflow.Ellipsis,
                        )
                        val pct = (a.progressPct ?: 0.0).coerceIn(0.0, 100.0)
                        LinearProgressIndicator(
                            progress = { (pct / 100.0).toFloat() },
                            modifier = Modifier.fillMaxWidth().height(6.dp).clip(RoundedCornerShape(999.dp)),
                            color = if (pct >= 100.0) Color(CoreActivityRules.VERDE) else NxColors.Teal,
                            trackColor = Color(0xFFE2E8F0),
                        )
                    }
                }
            } else {
                HorizontalDivider(color = Color(0xFFE2E8F0))
                Text(
                    user.currentActivity?.titulo ?: "Sin actividad abierta",
                    fontSize = 12.sp,
                    color = NxColors.Muted,
                    textAlign = TextAlign.Center,
                    maxLines = 2,
                    overflow = TextOverflow.Ellipsis,
                )
            }
        }
    }
}

// ── Mis actividades ─────────────────────────────────────────────────────────

/** Paridad con apps/web/components/pizarra/MisActividadesView.tsx. */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun MisActividadesContent(
    user: SessionUser?,
    repo: CoreActivitiesRepository,
    onOpenActivity: (Long, String?) -> Unit,
    onOpenPerson: (Long) -> Unit,
    onSelfAssign: (() -> Unit)?,
) {
    var data by remember { mutableStateOf<MyActivitiesResponseDto?>(null) }
    var loading by remember { mutableStateOf(true) }
    var refreshing by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf<String?>(null) }
    var reload by remember { mutableIntStateOf(0) }
    var showDone by remember { mutableStateOf(false) }
    var highlightId by remember { mutableStateOf<Long?>(null) }
    var pendingMove by remember { mutableStateOf<PendingMove?>(null) }

    LaunchedEffect(reload) {
        try {
            data = withContext(Dispatchers.IO) { repo.myActivities() }
            error = null
        } catch (e: Exception) {
            error = e.toUserMessage("No se pudieron cargar tus actividades")
        } finally {
            loading = false
            refreshing = false
        }
    }

    val open = data?.open.orEmpty()
    val done = data?.doneToday.orEmpty()
    val seguimiento = data?.seguimiento.orEmpty()
    val urgentes = open.count { CoreActivityRules.isUrgent(it.prioridad) }
    val canReorder = data?.canReorder == true && open.size > 1
    val canSelfAssign = data?.canSelfAssign == true && onSelfAssign != null
    val firstName = CoreActivityRules.firstName(user?.nombre)

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
            verticalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            item {
                Column(
                    modifier = Modifier
                        .fillMaxWidth()
                        .clip(RoundedCornerShape(20.dp))
                        .background(NxColors.TealSoft.copy(alpha = 0.35f))
                        .border(1.dp, Color(0xFFE2E8F0), RoundedCornerShape(20.dp))
                        .padding(18.dp),
                    verticalArrangement = Arrangement.spacedBy(4.dp),
                ) {
                    Text("MIS ACTIVIDADES", fontSize = 11.sp, fontWeight = FontWeight.ExtraBold, color = NxColors.Muted, letterSpacing = 1.sp)
                    Text(
                        if (firstName.isNotBlank()) "Hola, $firstName" else "Tu día",
                        fontSize = 24.sp,
                        fontWeight = FontWeight.ExtraBold,
                        color = NxColors.Slate,
                    )
                    Text(
                        when {
                            loading -> "Cargando tus actividades…"
                            open.isEmpty() -> "No tienes pendientes por ahora."
                            else -> "Tienes ${open.size} por hacer. Empieza por la #1."
                        },
                        fontSize = 14.sp,
                        color = NxColors.Muted,
                    )
                    Spacer(Modifier.height(8.dp))
                    Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        OutlinedButton(onClick = { reload++ }) { Text("↻ Actualizar") }
                        if (canSelfAssign) {
                            Button(
                                onClick = { onSelfAssign?.invoke() },
                                colors = ButtonDefaults.buttonColors(containerColor = NxColors.Teal),
                            ) { Text("＋ Auto-asignarme", fontWeight = FontWeight.Bold) }
                        }
                    }
                }
            }

            item {
                val stats = buildList {
                    add(Triple("Por hacer", open.size, null))
                    add(Triple("Urgentes", urgentes, if (urgentes > 0) CoreActivityRules.ROJO else null))
                    add(Triple("Hechas hoy", done.size, if (done.isNotEmpty()) CoreActivityRules.VERDE else null))
                    if (seguimiento.isNotEmpty()) add(Triple("En seguimiento", seguimiento.size, null))
                }
                Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
                    stats.chunked(2).forEach { row ->
                        Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                            row.forEach { (label, value, color) ->
                                StatBox(label = label, value = value, color = color, modifier = Modifier.weight(1f))
                            }
                            if (row.size == 1) Spacer(Modifier.weight(1f))
                        }
                    }
                }
            }

            error?.let { item { Text(it, fontSize = 13.sp, color = Color(0xFFDC2626)) } }

            if (canReorder) {
                item {
                    SoftNote(
                        title = "Tú decides el orden.",
                        text = "Usa «Subir» y «Bajar». Cada cambio te pide un motivo corto de por qué la harás en ese lugar.",
                        color = 0xFF0D9488L,
                    )
                }
            } else if (!loading && open.size > 1 && data?.canReorder != true) {
                item {
                    Text(
                        "El orden sale de la prioridad y la fecha. Si algo no cuadra, avísale a tu encargado.",
                        fontSize = 12.5.sp,
                        color = NxColors.Muted,
                    )
                }
            }

            if (loading && data == null) {
                item { NxLoadingBlock("Cargando tus actividades…") }
            }

            if (!loading && open.isEmpty() && error == null) {
                item {
                    Column(
                        modifier = Modifier
                            .fillMaxWidth()
                            .clip(RoundedCornerShape(20.dp))
                            .background(Color.White)
                            .border(1.dp, Color(0xFFCBD5E1), RoundedCornerShape(20.dp))
                            .padding(horizontal = 20.dp, vertical = 28.dp),
                        horizontalAlignment = Alignment.CenterHorizontally,
                        verticalArrangement = Arrangement.spacedBy(8.dp),
                    ) {
                        Text("🎉", fontSize = 34.sp)
                        Text("Todo al día", fontSize = 16.sp, fontWeight = FontWeight.ExtraBold, color = NxColors.Slate)
                        Text("Cuando te asignen algo aparecerá aquí.", fontSize = 13.sp, color = NxColors.Muted)
                        if (canSelfAssign) {
                            Button(
                                onClick = { onSelfAssign?.invoke() },
                                colors = ButtonDefaults.buttonColors(containerColor = NxColors.Teal),
                            ) { Text("＋ Auto-asignarme una actividad") }
                        }
                    }
                }
            }

            itemsIndexed(open, key = { _, a -> "open-${a.id}" }) { index, a ->
                OpenActivityCard(
                    a = a,
                    index = index,
                    total = open.size,
                    highlighted = highlightId == a.id,
                    canReorder = canReorder,
                    onOpen = { onOpenActivity(a.id, null) },
                    onRepartir = { user?.id?.let(onOpenPerson) },
                    onMove = { from, to -> if (to in open.indices && to != from) pendingMove = PendingMove(a, from, to) },
                )
            }

            if (seguimiento.isNotEmpty()) {
                item {
                    Column {
                        Text(
                            "👀 En seguimiento (${seguimiento.size})",
                            fontSize = 16.sp,
                            fontWeight = FontWeight.ExtraBold,
                            color = NxColors.Slate,
                        )
                        Text(
                            "Ya las repartiste: aquí ves a quién se las pasaste y cómo va quien las ejecuta.",
                            fontSize = 12.5.sp,
                            color = NxColors.Muted,
                        )
                    }
                }
                items(seguimiento, key = { "seg-${it.id}" }) { s ->
                    SeguimientoCard(
                        s = s,
                        onOpenHistory = { onOpenActivity(s.id, "historial") },
                        onReprogramado = { reload++ },
                    )
                }
            }

            if (done.isNotEmpty()) {
                item {
                    OutlinedButton(onClick = { showDone = !showDone }) {
                        Text("✅ Hechas hoy (${done.size}) ${if (showDone) "▲" else "▼"}")
                    }
                }
                if (showDone) {
                    items(done, key = { "done-${it.id}" }) { a ->
                        Row(
                            modifier = Modifier
                                .fillMaxWidth()
                                .clip(RoundedCornerShape(12.dp))
                                .background(Color.White)
                                .border(1.dp, Color(0xFFE2E8F0), RoundedCornerShape(12.dp))
                                .clickable { onOpenActivity(a.id, null) }
                                .padding(horizontal = 14.dp, vertical = 12.dp),
                            horizontalArrangement = Arrangement.spacedBy(10.dp),
                        ) {
                            Text(
                                "✔ ${a.titulo.orEmpty()}",
                                fontSize = 13.sp,
                                color = NxColors.Slate,
                                maxLines = 1,
                                overflow = TextOverflow.Ellipsis,
                                modifier = Modifier.weight(1f),
                            )
                            Text(
                                a.fechaFinalizacion?.let { CoreActivityRules.formatClock(it) } ?: a.estatus.orEmpty(),
                                fontSize = 13.sp,
                                color = NxColors.Muted,
                            )
                        }
                    }
                }
            }

            item { Spacer(Modifier.height(24.dp)) }
        }
    }

    pendingMove?.let { move ->
        ReorderDialog(
            move = move,
            onDismiss = { pendingMove = null },
            onSave = save@{ reason ->
                val ids = CoreActivityRules.reorderIds(open.map { it.id }, move.from, move.to) ?: return@save
                val next = withContext(Dispatchers.IO) { repo.reorder(ids, move.item.id, reason) }
                if (next.open != null) {
                    data = next
                } else {
                    // Quedó en la cola sin conexión: se vuelve a leer cuando haya red.
                    reload++
                }
                highlightId = move.item.id
                pendingMove = null
            },
        )
    }
}

@Composable
private fun StatBox(label: String, value: Int, color: Long?, modifier: Modifier = Modifier) {
    Column(
        modifier = modifier
            .clip(RoundedCornerShape(14.dp))
            .background(Color.White)
            .border(1.dp, Color(0xFFE2E8F0), RoundedCornerShape(14.dp))
            .padding(horizontal = 14.dp, vertical = 12.dp),
    ) {
        Text(
            "$value",
            fontSize = 24.sp,
            fontWeight = FontWeight.ExtraBold,
            color = color?.let { Color(it) } ?: NxColors.Slate,
        )
        Text(label, fontSize = 12.sp, color = NxColors.Muted)
    }
}

@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun OpenActivityCard(
    a: MyActivityItemDto,
    index: Int,
    total: Int,
    highlighted: Boolean,
    canReorder: Boolean,
    onOpen: () -> Unit,
    onRepartir: () -> Unit,
    onMove: (Int, Int) -> Unit,
) {
    val pr = CoreActivityRules.priorityUi(a.prioridad)
    val first = index == 0
    val prColor = Color(pr.color ?: CoreActivityRules.NARANJA)
    Card(
        shape = RoundedCornerShape(18.dp),
        colors = CardDefaults.cardColors(
            containerColor = if (first) NxColors.TealSoft.copy(alpha = 0.3f) else Color.White,
        ),
        border = BorderStroke(
            when {
                highlighted -> 2.dp
                first -> 1.5.dp
                else -> 1.dp
            },
            when {
                highlighted -> NxColors.Teal
                first -> NxColors.Teal.copy(alpha = 0.4f)
                else -> Color(0xFFE2E8F0)
            },
        ),
        modifier = Modifier.fillMaxWidth(),
    ) {
        Row(
            modifier = Modifier
                .drawBehind { drawRect(color = prColor, size = Size(5.dp.toPx(), size.height)) }
                .padding(start = 18.dp, end = 14.dp, top = 14.dp, bottom = 14.dp),
            horizontalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            Box(
                modifier = Modifier
                    .size(40.dp)
                    .clip(CircleShape)
                    .background(if (first) NxColors.Teal else NxColors.TealSoft),
                contentAlignment = Alignment.Center,
            ) {
                Text(
                    "${index + 1}",
                    fontSize = 16.sp,
                    fontWeight = FontWeight.ExtraBold,
                    color = if (first) Color.White else NxColors.Teal,
                )
            }
            Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                if (first) {
                    Text("EMPIEZA POR AQUÍ", fontSize = 11.sp, fontWeight = FontWeight.ExtraBold, color = NxColors.Teal, letterSpacing = 1.sp)
                }
                Column {
                    Text(a.titulo.orEmpty(), fontSize = 16.sp, fontWeight = FontWeight.ExtraBold, color = NxColors.Slate)
                    a.anNumber?.let { Text("Folio $it", fontSize = 12.sp, color = NxColors.Muted) }
                }
                Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                    if (a.porRepartir == true) {
                        Button(
                            onClick = onRepartir,
                            colors = ButtonDefaults.buttonColors(containerColor = NxColors.Teal),
                        ) { Text("Repartir →", fontWeight = FontWeight.Bold) }
                    }
                    OutlinedButton(onClick = onOpen) { Text("Abrir →") }
                }
                FlowRow(
                    horizontalArrangement = Arrangement.spacedBy(6.dp),
                    verticalArrangement = Arrangement.spacedBy(6.dp),
                ) {
                    if (a.porRepartir == true) ToneChip("📨 Te toca repartirla", CoreActivityRules.NARANJA)
                    ToneChip(CoreActivityRules.estatusUi(a.estatus))
                    ToneChip("● ${pr.label}", pr.color)
                    ToneChip(CoreActivityRules.kindLabel(a.coreKind, a.ticketTypeCustom))
                    ToneChip(
                        when {
                            a.autoAsignada == true -> "🙋 Auto-asignada"
                            a.asignadaPor?.nombre != null -> "De ${CoreActivityRules.shortName(a.asignadaPor.nombre)}"
                            else -> "Asignada"
                        },
                    )
                }
                val meta = buildList {
                    add("📅 ${CoreActivityRules.formatWhen(a.fechaInicio ?: a.fechaMaxima) ?: "Sin fecha"}")
                    a.tiempoEstimadoMin?.takeIf { it > 0 }?.let { est ->
                        val tope = a.tiempoMaximoMin?.takeIf { it > 0 }?.let { " · tope ${CoreActivityRules.formatMinutes(it)}" }.orEmpty()
                        add("⏱ ${CoreActivityRules.formatMinutes(est)}$tope")
                    }
                    (a.cliente ?: a.proyecto)?.takeIf { it.isNotBlank() }?.let { add("📍 $it") }
                }
                FlowRow(horizontalArrangement = Arrangement.spacedBy(14.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                    meta.forEach { Text(it, fontSize = 13.sp, color = NxColors.Muted) }
                }
                a.indicaciones?.takeIf { it.isNotBlank() }?.let { SoftNote(text = it) }
                a.ordenJustificacion?.takeIf { it.isNotBlank() }?.let {
                    Text("📝 Por qué va aquí: $it", fontSize = 12.5.sp, color = NxColors.Muted)
                }
                if (canReorder) {
                    FlowRow(horizontalArrangement = Arrangement.spacedBy(6.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                        OutlinedButton(onClick = { onMove(index, index - 1) }, enabled = index > 0) { Text("↑ Subir") }
                        OutlinedButton(onClick = { onMove(index, index + 1) }, enabled = index < total - 1) { Text("↓ Bajar") }
                        if (index > 1) {
                            OutlinedButton(onClick = { onMove(index, 0) }) { Text("⤒ Hacerla primero") }
                        }
                    }
                }
            }
        }
    }
}

@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun SeguimientoCard(
    s: MyActivityItemDto,
    onOpenHistory: () -> Unit,
    onReprogramado: () -> Unit,
) {
    val pasadaA = s.pasadaA.orEmpty()
    val ejecutor = pasadaA.reversed().firstOrNull { !it.rol.equals("LEAD", ignoreCase = true) }
    val primera = pasadaA.firstOrNull()
    Card(
        shape = RoundedCornerShape(16.dp),
        colors = CardDefaults.cardColors(containerColor = Color.White),
        border = BorderStroke(1.dp, Color(0xFFE2E8F0)),
        modifier = Modifier.fillMaxWidth(),
    ) {
        Column(Modifier.padding(14.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
            Row(verticalAlignment = Alignment.Top, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                Column(Modifier.weight(1f)) {
                    Text(s.titulo.orEmpty(), fontSize = 15.sp, fontWeight = FontWeight.ExtraBold, color = NxColors.Slate)
                    s.anNumber?.let { Text("Folio $it", fontSize = 12.sp, color = NxColors.Muted) }
                }
                TextButton(onClick = onOpenHistory) { Text("Ver registro →", color = NxColors.Teal, fontWeight = FontWeight.SemiBold) }
            }
            FlowRow(horizontalArrangement = Arrangement.spacedBy(6.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                ToneChip(CoreActivityRules.estatusUi(s.estatus))
                ToneChip(CoreActivityRules.kindLabel(s.coreKind, s.ticketTypeCustom))
                if (ejecutor != null) {
                    val avance = CoreActivityRules.avanceUi(ejecutor.evidenceStatus)
                    ToneChip("${CoreActivityRules.shortName(ejecutor.nombre)}: ${avance.label}", avance.color)
                } else {
                    ToneChip("Falta que la asignen", CoreActivityRules.NARANJA)
                }
            }
            if (pasadaA.isNotEmpty()) {
                Text(
                    "📨 Enviada a ${pasadaA.joinToString(" → ") { CoreActivityRules.shortName(it.nombre) }}" +
                        (primera?.at?.let { CoreActivityRules.formatWhen(it) }?.let { " · $it" } ?: ""),
                    fontSize = 13.sp,
                    color = NxColors.Muted,
                )
            }
            s.ultimaReprogramacion?.let { r ->
                Text(
                    "🕑 Reprogramada por ${CoreActivityRules.shortName(r.por).ifBlank { "alguien" }} · " +
                        CoreActivityRules.formatWhen(r.at).orEmpty(),
                    fontSize = 12.5.sp,
                    color = NxColors.Muted,
                )
            }
            ReprogramarDespachoInline(activityId = s.id, fechaActual = s.fechaInicio, onDone = onReprogramado)
        }
    }
}

@Composable
private fun ReorderDialog(
    move: PendingMove,
    onDismiss: () -> Unit,
    onSave: suspend (String) -> Unit,
) {
    val scope = rememberCoroutineScope()
    var reason by remember(move) { mutableStateOf("") }
    var saving by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf<String?>(null) }
    val min = CoreActivityRules.MIN_REORDER_REASON

    AlertDialog(
        onDismissRequest = { if (!saving) onDismiss() },
        title = {
            Column {
                Text("CAMBIAR ORDEN", fontSize = 11.sp, fontWeight = FontWeight.ExtraBold, color = NxColors.Muted)
                Text(
                    "«${move.item.titulo.orEmpty()}» pasa del lugar #${move.from + 1} al #${move.to + 1}",
                    fontSize = 17.sp,
                    fontWeight = FontWeight.Bold,
                )
            }
        },
        text = {
            Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
                OutlinedTextField(
                    value = reason,
                    onValueChange = { reason = it.take(500) },
                    label = { Text("¿Por qué la harás en ese lugar? *") },
                    placeholder = { Text("Ej. El cliente la necesita antes de las 12; la otra puede esperar a la tarde.") },
                    minLines = 3,
                    enabled = !saving,
                    modifier = Modifier.fillMaxWidth(),
                )
                Text(
                    "${minOf(reason.trim().length, min)}/$min caracteres mínimo · queda guardado junto a la actividad.",
                    fontSize = 11.5.sp,
                    color = NxColors.Muted,
                )
                error?.let { Text(it, fontSize = 13.sp, color = Color(0xFFDC2626)) }
            }
        },
        confirmButton = {
            Button(
                onClick = {
                    val text = reason.trim()
                    if (text.length < min) {
                        error = "Escribe al menos $min caracteres: por qué la harás en ese lugar."
                    } else {
                        scope.launch {
                            saving = true
                            error = null
                            try {
                                onSave(text)
                            } catch (e: Exception) {
                                error = e.toUserMessage("No se pudo guardar el orden")
                            } finally {
                                saving = false
                            }
                        }
                    }
                },
                enabled = !saving && reason.trim().length >= min,
                colors = ButtonDefaults.buttonColors(containerColor = NxColors.Teal),
            ) { Text(if (saving) "Guardando…" else "Guardar orden") }
        },
        dismissButton = {
            TextButton(onClick = onDismiss, enabled = !saving) { Text("Cancelar") }
        },
    )
}
