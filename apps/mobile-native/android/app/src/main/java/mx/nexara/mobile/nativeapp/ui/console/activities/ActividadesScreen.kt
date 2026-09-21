package mx.nexara.mobile.nativeapp.ui.console.activities

import android.content.Context
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.IntrinsicSize
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
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
import kotlinx.coroutines.CancellationException
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
import mx.nexara.mobile.nativeapp.ui.enterprise.NxDenseSectionHeader
import mx.nexara.mobile.nativeapp.ui.enterprise.NxEmptyState
import mx.nexara.mobile.nativeapp.ui.enterprise.NxErrorBlock
import mx.nexara.mobile.nativeapp.ui.enterprise.NxEstadoPantalla
import mx.nexara.mobile.nativeapp.ui.enterprise.NxFilterBar
import mx.nexara.mobile.nativeapp.ui.enterprise.NxFilterPill
import mx.nexara.mobile.nativeapp.ui.enterprise.NxGlyph
import mx.nexara.mobile.nativeapp.ui.enterprise.NxIconText
import mx.nexara.mobile.nativeapp.ui.enterprise.NxIcons
import mx.nexara.mobile.nativeapp.ui.enterprise.NxMetricStrip
import mx.nexara.mobile.nativeapp.ui.enterprise.NxSegmented
import mx.nexara.mobile.nativeapp.ui.enterprise.NxSkeletonList
import mx.nexara.mobile.nativeapp.ui.enterprise.NxStatusDot
import mx.nexara.mobile.nativeapp.ui.enterprise.NxUi
import mx.nexara.mobile.nativeapp.ui.enterprise.icon
import mx.nexara.mobile.nativeapp.ui.enterprise.nxEstadoPantalla
import androidx.compose.foundation.lazy.grid.items as gridItems
import java.io.IOException

private const val ACTIVIDADES_PREFS = "nexara_actividades"
private const val VISTA_KEY = "vista"
private const val VISTA_MIAS = "mias"
private const val VISTA_EQUIPO = "equipo"

private data class PendingMove(val item: MyActivityItemDto, val from: Int, val to: Int)

/**
 * «Actividades» de Core — paridad con apps/web/app/(panels)/erp/pizarra/page.tsx.
 *
 * - El CEO solo ve la pizarra del equipo (asigna y revisa, no ejecuta).
 * - Quien tiene gente en su pizarra elige «Mis actividades» o «Mi equipo»
 *   (se recuerda la última).
 * - Todos los demás ven directo su lista.
 *
 * La pantalla sigue el contrato de diseño de `.ai/DISENO-FINANZAS.md`: una tira
 * de cifras en vez de tarjetas con resplandor, el estado como punto y palabra,
 * una sola barra de filtros, un único botón primario y ninguna caja dentro de
 * otra caja.
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

    // Un deep link que llega con la pantalla YA abierta no la vuelve a crear:
    // la clave de `rememberSaveable` cambia, pero el valor guardado se restaura
    // y la pestaña se queda donde estaba. Así, un aviso de «revisa la pizarra»
    // recibido mientras mirabas tus actividades no movía nada y parecía que el
    // enlace estaba roto. Aquí se aplica aunque la pantalla siga viva.
    LaunchedEffect(initialVista) {
        CoreActivityRules.normalizeVista(initialVista)?.let { pedida ->
            if (pedida != vista) vista = pedida
        }
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
            cargandoEquipo && vista == VISTA_EQUIPO -> NxSkeletonList(
                itemCount = 4,
                itemHeight = 96.dp,
                modifier = Modifier.padding(16.dp),
            )
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

/**
 * Pestañas subrayadas, como en la web. Antes era una píldora blanca con borde
 * dentro del área de contenido: una caja dentro de otra caja que se comía
 * 68 dp de alto para decir dos palabras.
 */
@Composable
private fun VistaTabs(vista: String, onChange: (String) -> Unit) {
    val opciones = listOf(
        Triple(VISTA_MIAS, "Mis actividades", NxGlyph.APPROVED.icon),
        Triple(VISTA_EQUIPO, "Mi equipo", Icons.Outlined.Groups),
    )
    Column(Modifier.fillMaxWidth()) {
        Row(Modifier.fillMaxWidth().padding(horizontal = 16.dp)) {
            opciones.forEach { (id, label, icon) ->
                val on = vista == id
                Column(
                    modifier = Modifier
                        .weight(1f)
                        .clickable { onChange(id) }
                        .padding(top = 12.dp),
                    horizontalAlignment = Alignment.CenterHorizontally,
                ) {
                    NxIconText(
                        text = label,
                        icon = icon,
                        fontSize = 13.5.sp,
                        fontWeight = if (on) FontWeight.Bold else FontWeight.Medium,
                        color = if (on) NxColors.Brand else NxUi.Fg2,
                        iconSize = 17.dp,
                        maxLines = 1,
                    )
                    Spacer(Modifier.height(8.dp))
                    // El subrayado es el único adorno: marca dónde estás sin dibujar una caja.
                    Box(
                        Modifier
                            .fillMaxWidth()
                            .height(2.dp)
                            .background(if (on) NxColors.Brand else Color.Transparent),
                    )
                }
            }
        }
        HorizontalDivider(color = NxUi.Border)
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
    /** Aro elegido en la barra; null = todos. */
    var filtro by rememberSaveable { mutableStateOf<EquipoAro?>(null) }
    val visibles = EquipoEstado.filtrar(users, filtro)
    val metricas = EquipoEstado.metricas(users)
    val estado = nxEstadoPantalla(cargando = loading, error = error, hayDatos = users.isNotEmpty())

    Column(Modifier.fillMaxSize()) {
        // Regla 8: el rango y el estado viven en la MISMA fila; ni cajas ni dos renglones.
        NxFilterBar(modifier = Modifier.padding(vertical = 10.dp)) {
            NxSegmented(
                options = BoardRange.entries.map { it.etiqueta },
                selectedIndex = BoardRange.entries.indexOf(rango),
                onSelect = { onRango(BoardRange.entries[it]) },
            )
            EquipoEstado.filtros(users).forEach { f ->
                NxFilterPill(
                    label = f.etiqueta,
                    count = f.conteo,
                    color = f.color,
                    selected = filtro == f.aro,
                    // Tocar el filtro activo vuelve a «Todos».
                    onClick = { filtro = if (filtro == f.aro) null else f.aro },
                )
            }
        }
        PullToRefreshBox(
            isRefreshing = loading && users.isNotEmpty(),
            onRefresh = onRefresh,
            modifier = Modifier.fillMaxSize(),
        ) {
            LazyVerticalGrid(
                columns = GridCells.Adaptive(minSize = 150.dp),
                contentPadding = PaddingValues(start = 16.dp, end = 16.dp, top = 4.dp, bottom = 16.dp),
                horizontalArrangement = Arrangement.spacedBy(10.dp),
                verticalArrangement = Arrangement.spacedBy(10.dp),
                modifier = Modifier.fillMaxSize(),
            ) {
                // Los cuatro estados de pantalla son excluyentes: nunca se pintan dos a la vez.
                when (estado) {
                    NxEstadoPantalla.CARGANDO -> item(span = { GridItemSpan(maxLineSpan) }) {
                        NxSkeletonList(itemCount = 4, itemHeight = 96.dp)
                    }
                    NxEstadoPantalla.ERROR -> item(span = { GridItemSpan(maxLineSpan) }) {
                        NxErrorBlock(error.orEmpty(), onRefresh)
                    }
                    NxEstadoPantalla.VACIO -> item(span = { GridItemSpan(maxLineSpan) }) {
                        NxEmptyState(
                            title = "Nadie en tu equipo por ahora",
                            subtitle = "Cuando alguien quede a tu cargo aparecerá aquí.",
                            actionLabel = "Actualizar",
                            onAction = onRefresh,
                        )
                    }
                    NxEstadoPantalla.CONTENIDO -> {
                        // Regla 7: la tira solo se pinta cuando hay equipo que contar.
                        item(span = { GridItemSpan(maxLineSpan) }) {
                            NxMetricStrip(
                                items = metricas,
                                seleccion = filtro?.clave,
                                onSelect = { clave ->
                                    val aro = EquipoAro.entries.firstOrNull { it.clave == clave }
                                    filtro = if (filtro == aro) null else aro
                                },
                            )
                        }
                        if (visibles.isEmpty()) {
                            item(span = { GridItemSpan(maxLineSpan) }) {
                                NxEmptyState(
                                    title = "Nadie en «${filtro?.etiqueta.orEmpty()}»",
                                    subtitle = "Nadie de tu equipo está en ese estado ahora.",
                                    actionLabel = "Ver a todos",
                                    onAction = { filtro = null },
                                )
                            }
                        }
                        gridItems(visibles, key = { it.id }) { u ->
                            PersonBoardCard(user = u, meId = meId, onClick = { onOpenPerson(u.id) })
                        }
                    }
                }

                // Contrato C: lo que yo asigné en el rango, con persona, estado y semáforo.
                if (asignadasPorMi.isNotEmpty()) {
                    item(span = { GridItemSpan(maxLineSpan) }) {
                        NxDenseSectionHeader(
                            title = "Asignadas por mí (${asignadasPorMi.size})",
                            hint = "Lo que repartiste ${BoardRange.descripcion(rango).replaceFirstChar { it.lowercase() }}.",
                            modifier = Modifier.padding(top = 6.dp),
                        )
                    }
                    // Una sola superficie con filas separadas por una línea: no doce tarjetas.
                    item(span = { GridItemSpan(maxLineSpan) }) {
                        Column(
                            Modifier
                                .fillMaxWidth()
                                .clip(RoundedCornerShape(NxUi.RadiusLg))
                                .background(NxColors.Card)
                                .border(1.dp, NxUi.Border, RoundedCornerShape(NxUi.RadiusLg)),
                        ) {
                            asignadasPorMi.forEachIndexed { i, a ->
                                if (i > 0) HorizontalDivider(color = NxUi.BorderSubtle)
                                AsignadaPorMiRow(a = a, onClick = { onOpenActivity(a.id, null) })
                            }
                        }
                    }
                }
            }
        }
    }
}

/** Una actividad que yo repartí: a quién, cómo va y su semáforo. */
@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun AsignadaPorMiRow(a: BoardAsignadaPorMiDto, onClick: () -> Unit) {
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .clickable(onClick = onClick)
            .padding(horizontal = 14.dp, vertical = 12.dp),
        verticalArrangement = Arrangement.spacedBy(5.dp),
    ) {
        Text(
            listOfNotNull(a.anNumber, a.titulo).joinToString(" · ").ifBlank { "Actividad #${a.id}" },
            fontSize = 14.sp,
            fontWeight = FontWeight.Bold,
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
            horizontalArrangement = Arrangement.spacedBy(14.dp),
            verticalArrangement = Arrangement.spacedBy(4.dp),
        ) {
            ActivitySemaforo.luz(a.semaforo)?.let { luz ->
                NxStatusDot(luz.etiqueta, color = ActividadesUx.colorSemaforo(a.semaforo))
            }
            NxStatusDot(
                CoreActivityRules.estatusUi(a.estatus).label,
                color = ActividadesUx.colorEstatus(a.estatus),
            )
            if (ActivitySemaforo.sinIniciar(a.aceptacion, a.inicioRealAt, a.estatus)) {
                NxStatusDot(ActivitySemaforo.CHIP_SIN_INICIAR, color = CoreActivityRules.NARANJA)
            }
            ActivitySemaforo.planRealTexto(a.minutosPlan, a.minutosReales)?.let { texto ->
                Text(
                    texto,
                    fontSize = 12.5.sp,
                    color = if (a.excedida == true) Color(CoreActivityRules.ROJO) else NxColors.Muted,
                    maxLines = 1,
                )
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

/**
 * Una persona en la pizarra: el aro de color dice el estado, y debajo se lee en
 * dos renglones qué está haciendo y en qué situación está.
 *
 * Antes la tarjeta apilaba hasta tres actividades con su barra de avance y su
 * texto de plan contra real: en un teléfono eso son ocho renglones de 10 sp por
 * persona, y con seis personas ya no se ve a nadie. Lo detallado vive donde
 * corresponde, que es la pizarra de esa persona, a un toque de aquí.
 */
@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun PersonBoardCard(user: TeamBoardUserDto, meId: Long?, onClick: () -> Unit) {
    val aro = EquipoEstado.aro(user.status)
    val aroColor = Color(aro.color)
    val esYo = meId != null && user.id == meId
    val shape = RoundedCornerShape(NxUi.RadiusLg)
    val abierta = user.openActivities.orEmpty().firstOrNull()
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .clip(shape)
            .background(NxColors.Card)
            .border(1.dp, if (esYo) NxColors.Brand.copy(alpha = 0.55f) else NxUi.Border, shape)
            .clickable(onClick = onClick)
            .padding(horizontal = 10.dp, vertical = 14.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(6.dp),
    ) {
        // El aro ES el estado: no hace falta además un punto, una pastilla y una leyenda.
        Box(
            modifier = Modifier
                .clip(CircleShape)
                .border(3.dp, aroColor, CircleShape)
                .padding(4.dp),
        ) {
            PersonAvatar(user.nombre, user.avatarUrl, 58.dp)
        }
        Text(
            user.nombre ?: "—",
            fontSize = 14.sp,
            fontWeight = FontWeight.Bold,
            color = NxColors.Slate,
            maxLines = 1,
            overflow = TextOverflow.Ellipsis,
            textAlign = TextAlign.Center,
        )
        user.puesto?.takeIf { it.isNotBlank() }?.let {
            Text(
                it,
                fontSize = 11.sp,
                color = NxColors.Muted,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
                textAlign = TextAlign.Center,
            )
        }
        Text(
            EquipoEstado.queHace(user),
            fontSize = 12.sp,
            fontWeight = FontWeight.Medium,
            color = NxColors.Slate,
            maxLines = 2,
            overflow = TextOverflow.Ellipsis,
            textAlign = TextAlign.Center,
        )
        Text(
            EquipoEstado.contexto(user),
            fontSize = 11.sp,
            color = if (aro == EquipoAro.RETRASO) aroColor else NxColors.Muted,
            maxLines = 2,
            overflow = TextOverflow.Ellipsis,
            textAlign = TextAlign.Center,
        )
        // El avance de lo que trae entre manos: es dato, no adorno.
        abierta?.progressPct?.let { pct ->
            val v = pct.coerceIn(0.0, 100.0)
            LinearProgressIndicator(
                progress = { (v / 100.0).toFloat() },
                modifier = Modifier.fillMaxWidth().height(4.dp).clip(RoundedCornerShape(999.dp)),
                color = if (v >= 100.0) Color(CoreActivityRules.VERDE) else NxColors.Brand,
                trackColor = NxUi.BorderSubtle,
            )
        }
        val marcas = EquipoEstado.marcas(user, meId)
        if (marcas.isNotEmpty()) {
            FlowRow(
                horizontalArrangement = Arrangement.spacedBy(8.dp, Alignment.CenterHorizontally),
                verticalArrangement = Arrangement.spacedBy(2.dp),
                modifier = Modifier.fillMaxWidth(),
            ) {
                marcas.forEach { m -> NxStatusDot(m.texto, color = m.color, fontSize = 11.sp) }
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
    // Regla del 18-09: lo que te asignan no se acepta ni se rechaza, únicamente se inicia.
    val scope = rememberCoroutineScope()
    var iniciandoId by remember { mutableStateOf<Long?>(null) }
    var iniciarError by remember { mutableStateOf<String?>(null) }
    var iniciarErrorId by remember { mutableStateOf<Long?>(null) }

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
    val hayAlgo = open.isNotEmpty() || done.isNotEmpty() || seguimiento.isNotEmpty()
    val estado = nxEstadoPantalla(cargando = loading && data == null, error = error, hayDatos = hayAlgo)

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
            verticalArrangement = Arrangement.spacedBy(10.dp),
        ) {
            // Encabezado de dos renglones: saludo y qué hacer ahora. Nada más:
            // lo primero que se tiene que ver es la actividad, no la bienvenida.
            item {
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(12.dp),
                ) {
                    Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(1.dp)) {
                        Text(
                            if (firstName.isNotBlank()) "Hola, $firstName" else "Tu día",
                            fontSize = 20.sp,
                            fontWeight = FontWeight.Bold,
                            color = NxColors.Slate,
                        )
                        Text(
                            ActividadesUx.instruccionDia(open.size, loading && data == null),
                            fontSize = 13.sp,
                            color = NxUi.Fg2,
                        )
                    }
                    // Secundario y en gris: el primario de la pantalla es empezar la #1 (regla 4).
                    if (canSelfAssign && open.isNotEmpty()) {
                        TextButton(
                            onClick = { onSelfAssign?.invoke() },
                            modifier = Modifier.heightIn(min = NxUi.TouchH),
                        ) { Text("Auto-asignarme", fontSize = 13.sp, fontWeight = FontWeight.Medium, color = NxUi.Fg2) }
                    }
                }
            }

            // Regla 7: sin nada que contar, la tira no se pinta.
            val metricas = ActividadesUx.metricas(open.size, urgentes, done.size, seguimiento.size)
            if (metricas.isNotEmpty()) {
                item { NxMetricStrip(items = metricas) }
            }

            when (estado) {
                NxEstadoPantalla.CARGANDO -> item { NxSkeletonList(itemCount = 3, itemHeight = 128.dp) }
                NxEstadoPantalla.ERROR -> item { NxErrorBlock(error.orEmpty()) { reload++ } }
                NxEstadoPantalla.VACIO -> item {
                    NxEmptyState(
                        title = "Todo al día",
                        subtitle = "Cuando te asignen algo aparecerá aquí.",
                        actionLabel = if (canSelfAssign) "Auto-asignarme una actividad" else null,
                        onAction = if (canSelfAssign) ({ onSelfAssign?.invoke() }) else null,
                    )
                }
                NxEstadoPantalla.CONTENIDO -> {
                    if (canReorder) {
                        item {
                            Text(
                                "Tú decides el orden: usa «Subir» y «Bajar». Cada cambio pide un motivo corto.",
                                fontSize = 12.5.sp,
                                color = NxColors.Muted,
                            )
                        }
                    } else if (open.size > 1) {
                        item {
                            Text(
                                "El orden sale de la prioridad y la fecha. Si algo no cuadra, avísale a tu encargado.",
                                fontSize = 12.5.sp,
                                color = NxColors.Muted,
                            )
                        }
                    }

                    itemsIndexed(open, key = { _, a -> "open-${a.id}" }) { index, a ->
                        OpenActivityCard(
                            a = a,
                            index = index,
                            total = open.size,
                            highlighted = highlightId == a.id,
                            canReorder = canReorder,
                            iniciando = iniciandoId == a.id,
                            iniciarError = iniciarError?.takeIf { iniciarErrorId == a.id },
                            onIniciar = { tab ->
                                scope.launch {
                                    iniciandoId = a.id
                                    iniciarError = null
                                    try {
                                        withContext(Dispatchers.IO) { repo.iniciarActividad(a.id) }
                                        reload++
                                        onOpenActivity(a.id, tab)
                                    } catch (e: CancellationException) {
                                        throw e
                                    } catch (e: IOException) {
                                        // Sin señal no se inventa la hora: la foto de entrada marca el inicio al subirse.
                                        onOpenActivity(a.id, tab)
                                    } catch (e: Exception) {
                                        iniciarErrorId = a.id
                                        iniciarError = e.toUserMessage("No se pudo iniciar la actividad")
                                    } finally {
                                        iniciandoId = null
                                    }
                                }
                            },
                            onOpen = { tab -> onOpenActivity(a.id, tab) },
                            onRepartir = { user?.id?.let(onOpenPerson) },
                            onMove = { from, to -> if (to in open.indices && to != from) pendingMove = PendingMove(a, from, to) },
                        )
                    }

                    if (seguimiento.isNotEmpty()) {
                        item {
                            NxDenseSectionHeader(
                                title = "En seguimiento (${seguimiento.size})",
                                hint = "Ya las repartiste: aquí ves a quién y cómo va quien las ejecuta.",
                                modifier = Modifier.padding(top = 6.dp),
                            )
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
                            NxDenseSectionHeader(
                                title = "Hechas hoy (${done.size})",
                                modifier = Modifier.padding(top = 6.dp),
                                trailing = {
                                    TextButton(onClick = { showDone = !showDone }) {
                                        Text(
                                            if (showDone) "Ocultar" else "Ver",
                                            fontSize = 13.sp,
                                            color = NxColors.Brand,
                                            fontWeight = FontWeight.Medium,
                                        )
                                    }
                                },
                            )
                        }
                        if (showDone) {
                            item {
                                Column(
                                    Modifier
                                        .fillMaxWidth()
                                        .clip(RoundedCornerShape(NxUi.RadiusLg))
                                        .background(NxColors.Card)
                                        .border(1.dp, NxUi.Border, RoundedCornerShape(NxUi.RadiusLg)),
                                ) {
                                    done.forEachIndexed { i, a ->
                                        if (i > 0) HorizontalDivider(color = NxUi.BorderSubtle)
                                        Row(
                                            modifier = Modifier
                                                .fillMaxWidth()
                                                .clickable { onOpenActivity(a.id, null) }
                                                .padding(horizontal = 14.dp, vertical = 11.dp),
                                            horizontalArrangement = Arrangement.spacedBy(10.dp),
                                            verticalAlignment = Alignment.CenterVertically,
                                        ) {
                                            NxIconText(
                                                text = a.titulo.orEmpty(),
                                                icon = NxGlyph.DONE.icon,
                                                fontSize = 13.sp,
                                                color = NxColors.Slate,
                                                iconTint = Color(CoreActivityRules.VERDE),
                                                maxLines = 1,
                                                overflow = TextOverflow.Ellipsis,
                                                modifier = Modifier.weight(1f),
                                            )
                                            Text(
                                                a.fechaFinalizacion?.let { CoreActivityRules.formatClock(it) }
                                                    ?: a.estatus.orEmpty(),
                                                fontSize = 13.sp,
                                                color = NxColors.Muted,
                                            )
                                        }
                                    }
                                }
                            }
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

/**
 * Una actividad de la cola.
 *
 * El orden de lectura es el del técnico: número y título arriba y grandes,
 * enseguida el botón que dice el siguiente paso, y solo después el estado y los
 * datos. Los estados van como punto y palabra, y el color aparece únicamente
 * cuando algo pide acción: con seis pastillas rellenas por tarjeta nada
 * destacaba.
 */
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
    iniciando: Boolean = false,
    iniciarError: String? = null,
    /** «Iniciar actividad»: guarda la hora real y abre la pestaña indicada. */
    onIniciar: (String?) -> Unit = {},
) {
    val pr = CoreActivityRules.priorityUi(a.prioridad)
    val first = index == 0
    val prColor = ActividadesUx.colorPrioridad(a.prioridad)?.let { Color(it) } ?: NxUi.BorderStrong
    val shape = RoundedCornerShape(14.dp)
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .clip(shape)
            .background(NxColors.Card)
            .border(
                if (highlighted || first) 1.5.dp else 1.dp,
                when {
                    highlighted -> NxColors.Brand
                    first -> NxColors.Brand.copy(alpha = 0.45f)
                    else -> NxUi.Border
                },
                shape,
            )
            // La barra de prioridad del borde izquierdo, igual que en la web.
            .drawBehind { drawRect(color = prColor, size = Size(4.dp.toPx(), size.height)) }
            .padding(start = 16.dp, end = 12.dp, top = 12.dp, bottom = 12.dp),
        verticalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        Row(horizontalArrangement = Arrangement.spacedBy(10.dp), verticalAlignment = Alignment.Top) {
            Box(
                modifier = Modifier
                    .size(28.dp)
                    .clip(CircleShape)
                    .background(if (first) NxColors.Brand else NxColors.BrandSoft),
                contentAlignment = Alignment.Center,
            ) {
                Text(
                    "${index + 1}",
                    fontSize = 14.sp,
                    fontWeight = FontWeight.Bold,
                    color = if (first) Color.White else NxColors.Brand,
                )
            }
            Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(1.dp)) {
                if (first) {
                    Text(
                        "EMPIEZA POR AQUÍ",
                        fontSize = 10.5.sp,
                        fontWeight = FontWeight.Bold,
                        color = NxColors.Brand,
                        letterSpacing = 1.sp,
                    )
                }
                Text(
                    a.titulo.orEmpty(),
                    fontSize = 16.sp,
                    fontWeight = FontWeight.Bold,
                    color = NxColors.Slate,
                    lineHeight = 20.sp,
                )
                // El tipo, con su ícono: es lo que distingue una obra de un trámite de un vistazo.
                NxIconText(
                    text = listOfNotNull(
                        CoreActivityRules.kindLabel(a.coreKind, a.ticketTypeCustom),
                        a.anNumber?.takeIf { it.isNotBlank() }?.let { "Folio $it" },
                    ).joinToString(" · "),
                    icon = CoreActivityRules.kindGlyph(a.coreKind).icon,
                    fontSize = 12.sp,
                    color = NxColors.Muted,
                    iconSize = 15.dp,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                )
            }
        }

        // Una acción principal que dice el siguiente paso; el detalle queda como secundaria.
        // Sin inicio real es «Iniciar actividad»: no hay aceptar ni rechazar (regla del 18-09).
        // Regla 4: solo la #1 lleva el botón lleno — el resto espera su turno.
        val accion = ActividadesUx.primaryAction(a)
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalAlignment = Alignment.CenterVertically) {
            val etiqueta = if (iniciando) "Iniciando…" else accion.label
            val alPulsar: () -> Unit = {
                when {
                    accion.kind == ActividadesUx.PrimaryKind.REPARTIR -> onRepartir()
                    accion.kind == ActividadesUx.PrimaryKind.ABRIR -> onOpen(null)
                    accion.marcaInicio -> onIniciar(accion.tab)
                    else -> onOpen(accion.tab)
                }
            }
            if (first) {
                Button(
                    onClick = alPulsar,
                    enabled = !iniciando,
                    colors = ButtonDefaults.buttonColors(containerColor = NxColors.Brand),
                    modifier = Modifier.heightIn(min = NxUi.TouchH),
                ) { Text(etiqueta, fontWeight = FontWeight.Bold, fontSize = 14.sp) }
            } else {
                OutlinedButton(
                    onClick = alPulsar,
                    enabled = !iniciando,
                    modifier = Modifier.heightIn(min = NxUi.TouchH),
                ) { Text(etiqueta, fontWeight = FontWeight.Medium, fontSize = 14.sp) }
            }
            if (accion.kind != ActividadesUx.PrimaryKind.ABRIR) {
                TextButton(onClick = { onOpen(null) }, modifier = Modifier.heightIn(min = NxUi.TouchH)) {
                    Text("Detalle", color = NxUi.Fg2, fontSize = 13.sp)
                }
            }
        }
        iniciarError?.let { Text(it, fontSize = 12.5.sp, color = Color(CoreActivityRules.ROJO)) }

        // Estado: punto y palabra. Gris para el flujo normal, color solo si pide acción.
        FlowRow(
            horizontalArrangement = Arrangement.spacedBy(14.dp),
            verticalArrangement = Arrangement.spacedBy(4.dp),
        ) {
            if (a.porRepartir == true) {
                NxStatusDot("Te toca repartirla", color = CoreActivityRules.NARANJA, fontWeight = FontWeight.Bold)
            }
            ActivitySemaforo.luz(a.semaforo)?.let { luz ->
                NxStatusDot(luz.etiqueta, color = ActividadesUx.colorSemaforo(a.semaforo))
            }
            NxStatusDot(
                CoreActivityRules.estatusUi(a.estatus).label,
                color = ActividadesUx.colorEstatus(a.estatus),
            )
            NxStatusDot(pr.label, color = ActividadesUx.colorPrioridad(a.prioridad))
        }

        // Cuándo, cuánto y dónde: tres datos con su ícono, en una sola línea si caben.
        val meta = buildList {
            // Varios días: «Día 3 de 10 · termina vie 25 sep» en vez de la hora del primer día.
            add(
                (
                    ActivityPeriodo.cuandoTexto(a.periodo, CoreActivityRules.formatWhen(a.fechaInicio ?: a.fechaMaxima))
                        ?: "Sin fecha"
                    ) to NxIcons.Calendar,
            )
            val tiempo = ActivitySemaforo.planRealTexto(a.minutosPlan, a.minutosReales)
                ?: a.tiempoEstimadoMin?.takeIf { it > 0 }?.let { est ->
                    val tope = a.tiempoMaximoMin?.takeIf { it > 0 }
                        ?.let { " · tope ${CoreActivityRules.formatMinutes(it)}" }.orEmpty()
                    "${CoreActivityRules.formatMinutes(est)}$tope"
                }
            tiempo?.let { add(it to Icons.Outlined.Schedule) }
            (a.cliente ?: a.proyecto)?.takeIf { it.isNotBlank() }?.let { add(it to Icons.Outlined.LocationOn) }
        }
        FlowRow(horizontalArrangement = Arrangement.spacedBy(14.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
            meta.forEach { (text, icon) ->
                NxIconText(
                    text = text,
                    icon = icon,
                    fontSize = 12.5.sp,
                    color = if (text.startsWith("Plan") && a.excedida == true) {
                        Color(CoreActivityRules.ROJO)
                    } else {
                        NxColors.Muted
                    },
                    iconSize = 15.dp,
                )
            }
        }

        // Quién la mandó: dato de contexto, no otro chip de colores.
        val quien = when {
            a.autoAsignada == true -> "Auto-asignada"
            else -> ActivitySemaforo.asignadaPorTexto(a.quienAsigno?.nombre)
        }
        quien?.let {
            NxIconText(text = it, icon = NxGlyph.PERSON.icon, fontSize = 12.5.sp, color = NxColors.Muted, iconSize = 15.dp)
        }

        // Nota con una línea de margen en vez de un recuadro relleno: el borde
        // que se quitó no aportaba nada que no diga ya la sangría (regla 9).
        a.indicaciones?.takeIf { it.isNotBlank() }?.let { NotaConMargen(it) }
        a.ordenJustificacion?.takeIf { it.isNotBlank() }?.let {
            NxIconText(
                text = "Por qué va aquí: $it",
                icon = NxGlyph.DOCUMENTATION.icon,
                fontSize = 12.5.sp,
                color = NxColors.Muted,
                iconSize = 15.dp,
            )
        }
        if (canReorder) {
            Row(horizontalArrangement = Arrangement.spacedBy(4.dp)) {
                TextButton(onClick = { onMove(index, index - 1) }, enabled = index > 0) {
                    Text("↑ Subir", fontSize = 13.sp, color = NxUi.Fg2)
                }
                TextButton(onClick = { onMove(index, index + 1) }, enabled = index < total - 1) {
                    Text("↓ Bajar", fontSize = 13.sp, color = NxUi.Fg2)
                }
                if (index > 1) {
                    TextButton(onClick = { onMove(index, 0) }) {
                        Text("Hacerla primero", fontSize = 13.sp, color = NxUi.Fg2)
                    }
                }
            }
        }
    }
}

/** Texto con una línea vertical a la izquierda: agrupa sin dibujar otra caja. */
@Composable
private fun NotaConMargen(text: String, modifier: Modifier = Modifier) {
    Row(
        modifier = modifier.fillMaxWidth().height(IntrinsicSize.Min),
        horizontalArrangement = Arrangement.spacedBy(10.dp),
    ) {
        Box(Modifier.width(2.dp).fillMaxHeight().background(NxUi.BorderStrong))
        Text(text, fontSize = 13.sp, color = NxUi.Fg2, lineHeight = 18.sp)
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
    val shape = RoundedCornerShape(NxUi.RadiusLg)
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .clip(shape)
            .background(NxColors.Card)
            .border(1.dp, NxUi.Border, shape)
            .padding(14.dp),
        verticalArrangement = Arrangement.spacedBy(7.dp),
    ) {
        Row(verticalAlignment = Alignment.Top, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            Column(Modifier.weight(1f)) {
                Text(s.titulo.orEmpty(), fontSize = 15.sp, fontWeight = FontWeight.Bold, color = NxColors.Slate)
                NxIconText(
                    text = listOfNotNull(
                        CoreActivityRules.kindLabel(s.coreKind, s.ticketTypeCustom),
                        s.anNumber?.takeIf { it.isNotBlank() }?.let { "Folio $it" },
                    ).joinToString(" · "),
                    icon = CoreActivityRules.kindGlyph(s.coreKind).icon,
                    fontSize = 12.sp,
                    color = NxColors.Muted,
                    iconSize = 15.dp,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                )
            }
            TextButton(onClick = onOpenHistory) {
                Text("Ver registro", color = NxColors.Brand, fontSize = 13.sp, fontWeight = FontWeight.Medium)
            }
        }
        FlowRow(horizontalArrangement = Arrangement.spacedBy(14.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
            NxStatusDot(
                CoreActivityRules.estatusUi(s.estatus).label,
                color = ActividadesUx.colorEstatus(s.estatus),
            )
            if (ejecutor != null) {
                val avance = CoreActivityRules.avanceUi(ejecutor.evidenceStatus)
                NxStatusDot(
                    "${CoreActivityRules.shortName(ejecutor.nombre)}: ${avance.label}",
                    color = avance.color.takeIf { it == CoreActivityRules.VERDE },
                )
            } else {
                NxStatusDot("Falta que la asignen", color = CoreActivityRules.NARANJA)
            }
        }
        if (pasadaA.isNotEmpty()) {
            NxIconText(
                text = "Enviada a ${pasadaA.joinToString(" → ") { CoreActivityRules.shortName(it.nombre) }}" +
                    (primera?.at?.let { CoreActivityRules.formatWhen(it) }?.let { " · $it" } ?: ""),
                icon = NxGlyph.DISPATCH.icon,
                fontSize = 12.5.sp,
                color = NxColors.Muted,
                iconSize = 15.dp,
            )
        }
        s.ultimaReprogramacion?.let { r ->
            NxIconText(
                text = "Reprogramada por ${CoreActivityRules.shortName(r.por).ifBlank { "alguien" }} · " +
                    CoreActivityRules.formatWhen(r.at).orEmpty(),
                icon = Icons.Outlined.Schedule,
                fontSize = 12.5.sp,
                color = NxColors.Muted,
                iconSize = 15.dp,
            )
        }
        ReprogramarDespachoInline(activityId = s.id, fechaActual = s.fechaInicio, onDone = onReprogramado)
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
                Text("CAMBIAR ORDEN", fontSize = 11.sp, fontWeight = FontWeight.Bold, color = NxColors.Muted)
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
                    label = { Text("¿Por qué la harás en ese lugar?") },
                    placeholder = { Text("Ej. El cliente la necesita antes de las 12; la otra puede esperar a la tarde.") },
                    minLines = 3,
                    enabled = !saving,
                    isError = error != null,
                    modifier = Modifier.fillMaxWidth(),
                )
                // La duda se resuelve bajo el control, al capturar, no después del error (regla 5).
                Text(
                    error ?: "Mínimo $min caracteres · queda guardado junto a la actividad.",
                    fontSize = 11.5.sp,
                    color = if (error != null) Color(CoreActivityRules.ROJO) else NxColors.Muted,
                )
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
            TextButton(onClick = onDismiss, enabled = !saving) { Text("Cancelar", color = NxUi.Fg2) }
        },
    )
}
