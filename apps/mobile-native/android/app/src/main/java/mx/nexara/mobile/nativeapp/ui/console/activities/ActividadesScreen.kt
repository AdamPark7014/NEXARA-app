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
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.grid.GridCells
import androidx.compose.foundation.lazy.grid.GridItemSpan
import androidx.compose.foundation.lazy.grid.LazyVerticalGrid
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.Groups
import androidx.compose.material.icons.outlined.LocationOn
import androidx.compose.material.icons.outlined.Schedule
import androidx.compose.material.icons.outlined.Visibility
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FilterChip
import androidx.compose.material3.FilterChipDefaults
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
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
import mx.nexara.mobile.nativeapp.data.api.BoardAsignadaPorMiDto
import mx.nexara.mobile.nativeapp.data.api.MyActivitiesResponseDto
import mx.nexara.mobile.nativeapp.data.api.MyActivityItemDto
import mx.nexara.mobile.nativeapp.data.api.TeamBoardResponseDto
import mx.nexara.mobile.nativeapp.data.api.TeamBoardUserDto
import mx.nexara.mobile.nativeapp.data.api.toUserMessage
import mx.nexara.mobile.nativeapp.data.console.CoreActivitiesRepository
import mx.nexara.mobile.nativeapp.ui.enterprise.NxColors
import mx.nexara.mobile.nativeapp.ui.enterprise.NxEmptyState
import mx.nexara.mobile.nativeapp.ui.enterprise.NxErrorBlock
import mx.nexara.mobile.nativeapp.ui.enterprise.NxGlyph
import mx.nexara.mobile.nativeapp.ui.enterprise.NxIconBadge
import mx.nexara.mobile.nativeapp.ui.enterprise.NxIconText
import mx.nexara.mobile.nativeapp.ui.enterprise.NxIcons
import mx.nexara.mobile.nativeapp.ui.enterprise.NxLoadingBlock
import mx.nexara.mobile.nativeapp.ui.enterprise.icon
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
    /** Actividad recién auto-asignada: se resalta en «Mis actividades» (`?nueva=` en la web). */
    highlightActivityId: Long? = null,
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
    /** Contrato C: Hoy · Semana · Mes para la pizarra y para «Asignadas por mí». */
    var rango by rememberSaveable { mutableStateOf(BoardRange.HOY) }
    var asignadasPorMi by remember { mutableStateOf<List<BoardAsignadaPorMiDto>>(emptyList()) }

    LaunchedEffect(boardReload, rango) {
        boardLoading = true
        val (desde, hasta) = BoardRange.fechas(rango)
        try {
            board = withContext(Dispatchers.IO) { repo.board(desde = desde, hasta = hasta) }
            boardError = null
        } catch (e: Exception) {
            boardError = e.toUserMessage("No se pudo cargar Actividades")
        } finally {
            boardLoading = false
        }
        // El endpoint puede no existir todavía: sin lista, la sección no aparece.
        asignadasPorMi = runCatching {
            withContext(Dispatchers.IO) { repo.boardAsignadasPorMi(desde = desde, hasta = hasta) }
        }.getOrDefault(emptyList())
    }

    val users = board?.users.orEmpty().let { list ->
        val me = user?.id
        if (me == null) list else list.sortedBy { if (it.id == me) 0 else 1 }
    }
    val otros = users.count { it.id != user?.id }
    val tieneEquipo = otros > 0
    val cargandoEquipo = !isCeo && board == null && boardError == null
    val conPestanas = !isCeo && tieneEquipo
    val viendoEquipo = isCeo || (conPestanas && vista == VISTA_EQUIPO)
    // Quien no tiene equipo (o mientras se sabe) ve directo lo suyo: no espera a la pizarra.
    val verMias = !isCeo && (!conPestanas || vista == VISTA_MIAS)

    // La pizarra se actualiza sola cada 30 s mientras se está viendo, en el rango elegido.
    LaunchedEffect(viendoEquipo, rango) {
        if (!viendoEquipo) return@LaunchedEffect
        val (desde, hasta) = BoardRange.fechas(rango)
        while (true) {
            delay(30_000)
            try {
                board = withContext(Dispatchers.IO) { repo.board(desde = desde, hasta = hasta) }
            } catch (_: Exception) {
                // Sin red: se queda la última pizarra.
            }
        }
    }

    fun cambiarVista(v: String) {
        vista = v
        runCatching { prefs.edit().putString(VISTA_KEY, v).apply() }
    }

    Column(Modifier.fillMaxSize().background(NxColors.Surface)) {
        // Cumpleaños y aniversarios de hoy; sin nada que celebrar no ocupa lugar.
        CelebracionesBanner(
            repo = repo,
            modifier = Modifier.padding(start = 16.dp, end = 16.dp, top = 10.dp),
        )
        if (conPestanas) {
            VistaTabs(vista = vista, onChange = ::cambiarVista)
        }
        when {
            // Solo quien volvió a la pestaña «Mi equipo» espera a la pizarra.
            cargandoEquipo && vista == VISTA_EQUIPO -> NxLoadingBlock("Cargando actividades…")
            verMias -> MisActividadesContent(
                user = user,
                repo = repo,
                onOpenActivity = onOpenActivity,
                onOpenPerson = onOpenPerson,
                onSelfAssign = onSelfAssign,
                highlightActivityId = highlightActivityId,
            )
            else -> TeamBoardContent(
                users = users,
                meId = user?.id,
                loading = boardLoading,
                error = boardError,
                onRefresh = { boardReload++ },
                onOpenPerson = onOpenPerson,
                rango = rango,
                onRango = { rango = it },
                asignadasPorMi = asignadasPorMi,
                onOpenActivity = onOpenActivity,
            )
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
        listOf(
            Triple(VISTA_MIAS, "Mis actividades", NxGlyph.APPROVED.icon),
            Triple(VISTA_EQUIPO, "Mi equipo", Icons.Outlined.Groups),
        ).forEach { (id, label, icon) ->
            val on = vista == id
            Box(
                modifier = Modifier
                    .weight(1f)
                    .heightIn(min = 48.dp)
                    .clip(RoundedCornerShape(10.dp))
                    .background(if (on) NxColors.Brand else Color.Transparent)
                    .clickable { onChange(id) },
                contentAlignment = Alignment.Center,
            ) {
                NxIconText(
                    text = label,
                    icon = icon,
                    fontSize = 14.sp,
                    fontWeight = if (on) FontWeight.ExtraBold else FontWeight.SemiBold,
                    color = if (on) Color.White else NxColors.Slate,
                )
            }
        }
    }
}

// ── Pizarra del equipo ──────────────────────────────────────────────────────

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun TeamBoardContent(
    users: List<TeamBoardUserDto>,
    meId: Long?,
    loading: Boolean,
    error: String?,
    onRefresh: () -> Unit,
    onOpenPerson: (Long) -> Unit,
    rango: BoardRange = BoardRange.HOY,
    onRango: (BoardRange) -> Unit = {},
    asignadasPorMi: List<BoardAsignadaPorMiDto> = emptyList(),
    onOpenActivity: (Long, String?) -> Unit = { _, _ -> },
) {
    val counts = ActividadesUx.boardCounts(users)
    /** Estado elegido en los chips; null = todos. */
    var filtro by rememberSaveable { mutableStateOf<String?>(null) }
    val visibles = ActividadesUx.filterBoard(users, filtro)
    Column(Modifier.fillMaxSize()) {
        BoardRangeSelector(
            rango = rango,
            onRango = onRango,
            modifier = Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 6.dp),
        )
        if (users.isNotEmpty()) {
            BoardFilterRow(
                total = users.size,
                counts = counts,
                selected = filtro,
                onSelect = { filtro = it },
            )
        }
        PullToRefreshBox(
            isRefreshing = loading && users.isNotEmpty(),
            onRefresh = onRefresh,
            modifier = Modifier.fillMaxSize(),
        ) {
            LazyVerticalGrid(
                columns = GridCells.Adaptive(minSize = 156.dp),
                contentPadding = PaddingValues(start = 16.dp, end = 16.dp, top = 4.dp, bottom = 16.dp),
                horizontalArrangement = Arrangement.spacedBy(12.dp),
                verticalArrangement = Arrangement.spacedBy(12.dp),
                modifier = Modifier.fillMaxSize(),
            ) {
                when {
                    loading && users.isEmpty() -> item(span = { GridItemSpan(maxLineSpan) }) {
                        NxLoadingBlock("Cargando…")
                    }
                    error != null && users.isEmpty() -> item(span = { GridItemSpan(maxLineSpan) }) {
                        NxErrorBlock(error, onRefresh)
                    }
                    users.isEmpty() -> item(span = { GridItemSpan(maxLineSpan) }) {
                        NxEmptyState(
                            title = "Nadie en tu equipo por ahora",
                            subtitle = "Cuando alguien quede a tu cargo aparecerá aquí.",
                            actionLabel = "Actualizar",
                            onAction = onRefresh,
                        )
                    }
                    visibles.isEmpty() -> item(span = { GridItemSpan(maxLineSpan) }) {
                        NxEmptyState(
                            title = "Nadie en «${CoreActivityRules.boardStatusLabel(filtro)}»",
                            subtitle = "Nadie de tu equipo está en ese estado ahora.",
                            actionLabel = "Ver a todos",
                            onAction = { filtro = null },
                        )
                    }
                }
                gridItems(visibles, key = { it.id }) { u ->
                    PersonBoardCard(user = u, isSelf = u.id == meId, onClick = { onOpenPerson(u.id) })
                }

                // Contrato C: lo que yo asigné en el rango, con persona, estado y semáforo.
                if (asignadasPorMi.isNotEmpty()) {
                    item(span = { GridItemSpan(maxLineSpan) }) {
                        Column(verticalArrangement = Arrangement.spacedBy(2.dp)) {
                            Spacer(Modifier.height(6.dp))
                            Text(
                                "ASIGNADAS POR MÍ (${asignadasPorMi.size})",
                                fontSize = 12.sp,
                                fontWeight = FontWeight.ExtraBold,
                                color = NxColors.Muted,
                            )
                            Text(
                                "Lo que repartiste ${BoardRange.descripcion(rango).replaceFirstChar { it.lowercase() }}.",
                                fontSize = 12.sp,
                                color = NxColors.Muted,
                            )
                        }
                    }
                    asignadasPorMi.forEach { a ->
                        item(span = { GridItemSpan(maxLineSpan) }, key = "apm-${a.id}") {
                            AsignadaPorMiCard(a = a, onClick = { onOpenActivity(a.id, null) })
                        }
                    }
                }
            }
        }
    }
}

/** Una sola fila deslizable de filtros: Todos · Activo · Atrasado · Terminó · Sin actividad. */
@Composable
private fun BoardFilterRow(
    total: Int,
    counts: Map<String, Int>,
    selected: String?,
    onSelect: (String?) -> Unit,
) {
    LazyRow(
        contentPadding = PaddingValues(horizontal = 16.dp),
        horizontalArrangement = Arrangement.spacedBy(8.dp),
        modifier = Modifier.fillMaxWidth().padding(vertical = 4.dp),
    ) {
        item(key = "todos") {
            FilterChip(
                selected = selected == null,
                onClick = { onSelect(null) },
                label = { Text("Todos $total", maxLines = 1) },
                colors = boardChipColors(),
            )
        }
        items(ActividadesUx.boardFilterOptions(counts, selected), key = { it }) { status ->
            val color = Color(CoreActivityRules.boardStatusColor(status))
            FilterChip(
                selected = selected == status,
                // Tocar el chip activo vuelve a «Todos».
                onClick = { onSelect(if (selected == status) null else status) },
                label = { Text("${CoreActivityRules.boardStatusLabel(status)} ${counts[status] ?: 0}", maxLines = 1) },
                leadingIcon = { Box(Modifier.size(8.dp).clip(CircleShape).background(color)) },
                colors = boardChipColors(),
            )
        }
    }
}

@Composable
private fun boardChipColors() = FilterChipDefaults.filterChipColors(
    containerColor = Color.White,
    selectedContainerColor = NxColors.BrandSoft,
    selectedLabelColor = NxColors.BrandDark,
    labelColor = NxColors.Slate,
)

/** Una actividad que yo repartí: a quién, cómo va y su semáforo. */
@OptIn(ExperimentalLayoutApi::class, ExperimentalMaterial3Api::class)
@Composable
private fun AsignadaPorMiCard(a: BoardAsignadaPorMiDto, onClick: () -> Unit) {
    Card(
        onClick = onClick,
        shape = RoundedCornerShape(14.dp),
        colors = CardDefaults.cardColors(containerColor = Color.White),
        border = BorderStroke(1.dp, Color(0xFFE2E8F0)),
        modifier = Modifier.fillMaxWidth(),
    ) {
        Column(Modifier.padding(12.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
            Text(
                listOfNotNull(a.anNumber, a.titulo).joinToString(" · ").ifBlank { "Actividad #${a.id}" },
                fontSize = 14.sp,
                fontWeight = FontWeight.ExtraBold,
                color = NxColors.Slate,
                maxLines = 2,
                overflow = TextOverflow.Ellipsis,
            )
            a.quien?.nombre?.takeIf { it.isNotBlank() }?.let {
                NxIconText(
                    text = CoreActivityRules.shortName(it),
                    icon = NxGlyph.PERSON.icon,
                    fontSize = 12.5.sp,
                    color = NxColors.Muted,
                )
            }
            FlowRow(
                horizontalArrangement = Arrangement.spacedBy(6.dp),
                verticalArrangement = Arrangement.spacedBy(6.dp),
            ) {
                ActivitySemaforo.luz(a.semaforo)?.let { luz -> ToneChip("● ${luz.etiqueta}", luz.color) }
                ToneChip(CoreActivityRules.estatusUi(a.estatus))
                if (ActivitySemaforo.estaPendienteDeAceptar(a.aceptacion)) {
                    ToneChip(ActivitySemaforo.CHIP_SIN_COMENZAR, CoreActivityRules.NARANJA)
                }
                ActivitySemaforo.planRealTexto(a.minutosPlan, a.minutosReales)?.let { texto ->
                    ToneChip(texto, ActivitySemaforo.planRealColor(a.excedida))
                }
            }
            if (ActivitySemaforo.fueRechazada(a.aceptacion)) {
                Text(
                    ActivitySemaforo.rechazadaTexto(a.motivoRechazo),
                    fontSize = 12.5.sp,
                    color = Color(CoreActivityRules.ROJO),
                )
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
            containerColor = if (isSelf) NxColors.BrandSoft.copy(alpha = 0.35f) else Color.White,
        ),
        border = BorderStroke(
            if (isSelf) 2.dp else 1.dp,
            if (isSelf) NxColors.Brand.copy(alpha = 0.55f) else Color(0xFFE2E8F0),
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
                Text("TÚ", fontSize = 11.sp, fontWeight = FontWeight.ExtraBold, color = NxColors.Brand, letterSpacing = 1.sp)
            }
            Text(
                CoreActivityRules.boardEstadoTexto(user.status, user.currentLateMinutes, user.idleSinceAt),
                fontSize = 12.sp,
                fontWeight = FontWeight.SemiBold,
                color = statusColor,
                textAlign = TextAlign.Center,
            )
            BoardStatusExtras(user = user, centered = true)
            val open = user.openActivities.orEmpty()
            if (open.isNotEmpty()) {
                Column(Modifier.fillMaxWidth(), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                    open.take(3).forEach { a ->
                        val suffix = when (a.assignmentCharge?.lowercase()) {
                            "despacho" -> " · Despacho"
                            "ejecucion" -> " · Ejecución"
                            else -> ""
                        }
                        // Semáforo por actividad (contrato C): el punto de color delante del título.
                        val luz = ActivitySemaforo.luz(a.semaforo)
                        Row(
                            verticalAlignment = Alignment.CenterVertically,
                            horizontalArrangement = Arrangement.spacedBy(5.dp),
                            modifier = Modifier.fillMaxWidth(),
                        ) {
                            if (luz != null) {
                                Box(Modifier.size(7.dp).clip(CircleShape).background(Color(luz.color)))
                            }
                            Text(
                                "${a.titulo.orEmpty()}$suffix",
                                fontSize = 10.5.sp,
                                fontWeight = FontWeight.SemiBold,
                                color = if (a.excedida == true) Color(CoreActivityRules.ROJO) else NxColors.Muted,
                                maxLines = 1,
                                overflow = TextOverflow.Ellipsis,
                            )
                        }
                        ActivitySemaforo.planRealTexto(a.minutosPlan, a.minutosReales)?.let { texto ->
                            Text(
                                texto,
                                fontSize = 10.sp,
                                color = Color(ActivitySemaforo.planRealColor(a.excedida)),
                                maxLines = 1,
                                overflow = TextOverflow.Ellipsis,
                            )
                        }
                        val pct = (a.progressPct ?: 0.0).coerceIn(0.0, 100.0)
                        LinearProgressIndicator(
                            progress = { (pct / 100.0).toFloat() },
                            modifier = Modifier.fillMaxWidth().height(6.dp).clip(RoundedCornerShape(999.dp)),
                            color = if (pct >= 100.0) Color(CoreActivityRules.VERDE) else NxColors.Brand,
                            trackColor = Color(0xFFE2E8F0),
                        )
                    }
                }
            } else {
                HorizontalDivider(color = Color(0xFFE2E8F0))
                Text(
                    user.currentActivity?.titulo
                        ?: user.lastFinished?.titulo?.let { "Última: $it" }
                        ?: "Sin actividades hoy",
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
    highlightActivityId: Long? = null,
) {
    var data by remember { mutableStateOf<MyActivitiesResponseDto?>(null) }
    var loading by remember { mutableStateOf(true) }
    var refreshing by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf<String?>(null) }
    var reload by remember { mutableIntStateOf(0) }
    var showDone by remember { mutableStateOf(false) }
    var highlightId by remember(highlightActivityId) { mutableStateOf(highlightActivityId) }
    var pendingMove by remember { mutableStateOf<PendingMove?>(null) }
    // Contrato B: comenzar lo que te asignaron (o decir que no puedes tomarla).
    val scope = rememberCoroutineScope()
    var aceptandoId by remember { mutableStateOf<Long?>(null) }
    var aceptacionError by remember { mutableStateOf<String?>(null) }
    var aceptacionErrorId by remember { mutableStateOf<Long?>(null) }
    var rechazando by remember { mutableStateOf<MyActivityItemDto?>(null) }

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
            // Encabezado corto: saludo y resumen en una línea; lo primero que se ve es la actividad.
            item {
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(12.dp),
                ) {
                    Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(2.dp)) {
                        Text(
                            if (firstName.isNotBlank()) "Hola, $firstName" else "Tu día",
                            fontSize = 20.sp,
                            fontWeight = FontWeight.ExtraBold,
                            color = NxColors.Slate,
                        )
                        Text(
                            if (loading && data == null) {
                                "Cargando tus actividades…"
                            } else {
                                ActividadesUx.resumenDia(open.size, urgentes, done.size, seguimiento.size)
                            },
                            fontSize = 13.sp,
                            color = if (urgentes > 0) Color(CoreActivityRules.ROJO) else NxColors.Muted,
                        )
                    }
                    // Con la lista vacía, el botón vive en el estado vacío (una sola acción).
                    if (canSelfAssign && open.isNotEmpty()) {
                        OutlinedButton(
                            onClick = { onSelfAssign?.invoke() },
                            modifier = Modifier.heightIn(min = 48.dp),
                        ) { Text("Auto-asignarme", fontWeight = FontWeight.SemiBold) }
                    }
                }
            }

            error?.let {
                item { NxErrorBlock(it) { reload++ } }
            }

            if (canReorder) {
                item {
                    SoftNote(
                        title = "Tú decides el orden.",
                        text = "Usa «Subir» y «Bajar». Cada cambio te pide un motivo corto de por qué la harás en ese lugar.",
                        color = 0xFF2563EBL,
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
                        NxIconBadge(icon = NxGlyph.APPROVED.icon, size = 56.dp)
                        Text("Todo al día", fontSize = 16.sp, fontWeight = FontWeight.ExtraBold, color = NxColors.Slate)
                        Text("Cuando te asignen algo aparecerá aquí.", fontSize = 13.sp, color = NxColors.Muted)
                        if (canSelfAssign) {
                            Button(
                                onClick = { onSelfAssign?.invoke() },
                                colors = ButtonDefaults.buttonColors(containerColor = NxColors.Brand),
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
                    aceptando = aceptandoId == a.id,
                    aceptacionError = aceptacionError?.takeIf { aceptacionErrorId == a.id },
                    onAceptar = {
                        scope.launch {
                            aceptandoId = a.id
                            aceptacionError = null
                            try {
                                withContext(Dispatchers.IO) { repo.aceptarActividad(a.id) }
                                reload++
                            } catch (e: Exception) {
                                aceptacionErrorId = a.id
                                aceptacionError = e.toUserMessage("No se pudo comenzar la actividad")
                            } finally {
                                aceptandoId = null
                            }
                        }
                    },
                    onRechazar = { rechazando = a },
                    onOpen = { tab -> onOpenActivity(a.id, tab) },
                    onRepartir = { user?.id?.let(onOpenPerson) },
                    onMove = { from, to -> if (to in open.indices && to != from) pendingMove = PendingMove(a, from, to) },
                )
            }

            if (seguimiento.isNotEmpty()) {
                item {
                    Column {
                        NxIconText(
                            text = "En seguimiento (${seguimiento.size})",
                            icon = Icons.Outlined.Visibility,
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
                        Icon(NxGlyph.DONE.icon, contentDescription = null, modifier = Modifier.size(18.dp))
                        Spacer(Modifier.size(6.dp))
                        Text("Hechas hoy (${done.size}) ${if (showDone) "▲" else "▼"}")
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
                            verticalAlignment = Alignment.CenterVertically,
                        ) {
                            NxIconText(
                                text = a.titulo.orEmpty(),
                                icon = NxGlyph.DONE.icon,
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

    rechazando?.let { actividad ->
        RechazarActividadDialog(
            titulo = actividad.titulo,
            onDismiss = { rechazando = null },
            onConfirm = { motivo ->
                withContext(Dispatchers.IO) { repo.rechazarActividad(actividad.id, motivo) }
                rechazando = null
                reload++
            },
        )
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

@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun OpenActivityCard(
    a: MyActivityItemDto,
    index: Int,
    total: Int,
    highlighted: Boolean,
    canReorder: Boolean,
    /** Abre el detalle en la pestaña indicada (null = Detalle). */
    onOpen: (String?) -> Unit,
    onRepartir: () -> Unit,
    onMove: (Int, Int) -> Unit,
    aceptando: Boolean = false,
    aceptacionError: String? = null,
    onAceptar: () -> Unit = {},
    onRechazar: () -> Unit = {},
) {
    val pr = CoreActivityRules.priorityUi(a.prioridad)
    val first = index == 0
    val prColor = Color(pr.color ?: CoreActivityRules.NARANJA)
    Card(
        shape = RoundedCornerShape(18.dp),
        colors = CardDefaults.cardColors(
            containerColor = if (first) NxColors.BrandSoft.copy(alpha = 0.3f) else Color.White,
        ),
        border = BorderStroke(
            when {
                highlighted -> 2.dp
                first -> 1.5.dp
                else -> 1.dp
            },
            when {
                highlighted -> NxColors.Brand
                first -> NxColors.Brand.copy(alpha = 0.4f)
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
                    .background(if (first) NxColors.Brand else NxColors.BrandSoft),
                contentAlignment = Alignment.Center,
            ) {
                Text(
                    "${index + 1}",
                    fontSize = 16.sp,
                    fontWeight = FontWeight.ExtraBold,
                    color = if (first) Color.White else NxColors.Brand,
                )
            }
            Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                if (first) {
                    Text("EMPIEZA POR AQUÍ", fontSize = 11.sp, fontWeight = FontWeight.ExtraBold, color = NxColors.Brand, letterSpacing = 1.sp)
                }
                Column {
                    Text(a.titulo.orEmpty(), fontSize = 16.sp, fontWeight = FontWeight.ExtraBold, color = NxColors.Slate)
                    a.anNumber?.let { Text("Folio $it", fontSize = 12.sp, color = NxColors.Muted) }
                }
                // Contrato B: sin aceptar todavía. No bloquea trabajarla.
                if (ActivitySemaforo.estaPendienteDeAceptar(a.aceptacion)) {
                    AceptacionBanner(
                        onAceptar = onAceptar,
                        onRechazar = onRechazar,
                        guardando = aceptando,
                        error = aceptacionError,
                    )
                }
                if (ActivitySemaforo.fueRechazada(a.aceptacion)) {
                    SoftNote(
                        text = ActivitySemaforo.rechazadaTexto(a.motivoRechazo),
                        color = CoreActivityRules.ROJO,
                    )
                }
                // Una acción principal que dice el siguiente paso; el detalle queda como secundaria.
                val accion = ActividadesUx.primaryAction(a)
                Row(
                    horizontalArrangement = Arrangement.spacedBy(8.dp),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    when (accion.kind) {
                        ActividadesUx.PrimaryKind.ABRIR -> OutlinedButton(
                            onClick = { onOpen(null) },
                            modifier = Modifier.heightIn(min = 48.dp),
                        ) { Text("Abrir") }
                        ActividadesUx.PrimaryKind.VER -> {
                            OutlinedButton(
                                onClick = { onOpen(accion.tab) },
                                modifier = Modifier.heightIn(min = 48.dp),
                            ) { Text(accion.label) }
                            TextButton(onClick = { onOpen(null) }, modifier = Modifier.heightIn(min = 48.dp)) {
                                Text("Detalle", color = NxColors.Brand)
                            }
                        }
                        else -> {
                            Button(
                                onClick = {
                                    if (accion.kind == ActividadesUx.PrimaryKind.REPARTIR) onRepartir() else onOpen(accion.tab)
                                },
                                colors = ButtonDefaults.buttonColors(containerColor = NxColors.Brand),
                                modifier = Modifier.heightIn(min = 48.dp),
                            ) { Text(accion.label, fontWeight = FontWeight.Bold) }
                            TextButton(onClick = { onOpen(null) }, modifier = Modifier.heightIn(min = 48.dp)) {
                                Text("Detalle", color = NxColors.Brand)
                            }
                        }
                    }
                }
                FlowRow(
                    horizontalArrangement = Arrangement.spacedBy(6.dp),
                    verticalArrangement = Arrangement.spacedBy(6.dp),
                ) {
                    if (a.porRepartir == true) {
                        ToneChip("Te toca repartirla", CoreActivityRules.NARANJA, icon = NxGlyph.DISPATCH.icon)
                    }
                    // Semáforo del servidor: primero, porque es el «cómo vas».
                    ActivitySemaforo.luz(a.semaforo)?.let { luz ->
                        ToneChip("● ${luz.etiqueta}", luz.color)
                    }
                    ToneChip(CoreActivityRules.estatusUi(a.estatus))
                    ToneChip("● ${pr.label}", pr.color)
                    ToneChip(CoreActivityRules.kindLabel(a.coreKind, a.ticketTypeCustom))
                    ToneChip(
                        text = when {
                            a.autoAsignada == true -> "Auto-asignada"
                            a.quienAsigno?.nombre != null ->
                                ActivitySemaforo.asignadaPorTexto(a.quienAsigno?.nombre).orEmpty()
                            else -> "Asignada"
                        },
                        icon = if (a.autoAsignada == true) NxGlyph.PERSON.icon else null,
                    )
                    // «Plan 2 h · real 2 h 30 min», en rojo cuando ya se pasó.
                    ActivitySemaforo.planRealTexto(a.minutosPlan, a.minutosReales)?.let { texto ->
                        ToneChip(texto, ActivitySemaforo.planRealColor(a.excedida))
                    }
                }
                val meta = buildList {
                    // Varios días: «Día 3 de 10 · termina vie 25 sep» en vez de la hora del primer día.
                    add(
                        (
                            ActivityPeriodo.cuandoTexto(a.periodo, CoreActivityRules.formatWhen(a.fechaInicio ?: a.fechaMaxima))
                                ?: "Sin fecha"
                            ) to NxIcons.Calendar,
                    )
                    a.tiempoEstimadoMin?.takeIf { it > 0 }?.let { est ->
                        val tope = a.tiempoMaximoMin?.takeIf { it > 0 }?.let { " · tope ${CoreActivityRules.formatMinutes(it)}" }.orEmpty()
                        add("${CoreActivityRules.formatMinutes(est)}$tope" to Icons.Outlined.Schedule)
                    }
                    (a.cliente ?: a.proyecto)?.takeIf { it.isNotBlank() }?.let { add(it to Icons.Outlined.LocationOn) }
                }
                FlowRow(horizontalArrangement = Arrangement.spacedBy(14.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                    meta.forEach { (text, icon) -> NxIconText(text = text, icon = icon, fontSize = 13.sp, color = NxColors.Muted) }
                }
                a.indicaciones?.takeIf { it.isNotBlank() }?.let { SoftNote(text = it) }
                a.ordenJustificacion?.takeIf { it.isNotBlank() }?.let {
                    NxIconText(
                        text = "Por qué va aquí: $it",
                        icon = NxGlyph.DOCUMENTATION.icon,
                        fontSize = 12.5.sp,
                        color = NxColors.Muted,
                    )
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
                TextButton(onClick = onOpenHistory) { Text("Ver registro →", color = NxColors.Brand, fontWeight = FontWeight.SemiBold) }
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
                NxIconText(
                    text = "Enviada a ${pasadaA.joinToString(" → ") { CoreActivityRules.shortName(it.nombre) }}" +
                        (primera?.at?.let { CoreActivityRules.formatWhen(it) }?.let { " · $it" } ?: ""),
                    icon = NxGlyph.DISPATCH.icon,
                    fontSize = 13.sp,
                    color = NxColors.Muted,
                )
            }
            s.ultimaReprogramacion?.let { r ->
                NxIconText(
                    text = "Reprogramada por ${CoreActivityRules.shortName(r.por).ifBlank { "alguien" }} · " +
                        CoreActivityRules.formatWhen(r.at).orEmpty(),
                    icon = Icons.Outlined.Schedule,
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
                colors = ButtonDefaults.buttonColors(containerColor = NxColors.Brand),
            ) { Text(if (saving) "Guardando…" else "Guardar orden") }
        },
        dismissButton = {
            TextButton(onClick = onDismiss, enabled = !saving) { Text("Cancelar") }
        },
    )
}
