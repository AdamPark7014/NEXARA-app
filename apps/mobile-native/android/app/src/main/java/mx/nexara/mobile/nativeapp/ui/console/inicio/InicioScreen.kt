package mx.nexara.mobile.nativeapp.ui.console.inicio

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
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
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.outlined.KeyboardArrowRight
import androidx.compose.material.icons.automirrored.outlined.Login
import androidx.compose.material.icons.automirrored.outlined.Logout
import androidx.compose.material.icons.outlined.ErrorOutline
import androidx.compose.material.icons.outlined.Groups
import androidx.compose.material.icons.outlined.Info
import androidx.compose.material.icons.outlined.Notifications
import androidx.compose.material.icons.outlined.Pause
import androidx.compose.material.icons.outlined.Place
import androidx.compose.material.icons.outlined.PlayArrow
import androidx.compose.material.icons.outlined.Restaurant
import androidx.compose.material.icons.outlined.Schedule
import androidx.compose.material.icons.outlined.TaskAlt
import androidx.compose.material.icons.outlined.WarningAmber
import androidx.compose.material3.Badge
import androidx.compose.material3.BadgedBox
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.Text
import androidx.compose.material3.pulltorefresh.PullToRefreshBox
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableLongStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.drawBehind
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.LifecycleEventObserver
import androidx.lifecycle.compose.LocalLifecycleOwner
import androidx.lifecycle.viewmodel.compose.viewModel
import coil.compose.AsyncImage
import java.time.LocalDate
import kotlinx.coroutines.delay
import mx.nexara.mobile.nativeapp.access.CoreKeys
import mx.nexara.mobile.nativeapp.data.AuthRepository
import mx.nexara.mobile.nativeapp.data.SessionRevision
import mx.nexara.mobile.nativeapp.data.SessionUser
import mx.nexara.mobile.nativeapp.data.api.MyActivityItemDto
import mx.nexara.mobile.nativeapp.data.api.toAbsoluteAssetUrl
import mx.nexara.mobile.nativeapp.ui.common.ImageDataUrl
import mx.nexara.mobile.nativeapp.ui.common.NotificationHealthBanner
import mx.nexara.mobile.nativeapp.ui.common.rememberCameraCapture
import mx.nexara.mobile.nativeapp.ui.common.rememberProblemaDeAvisos
import mx.nexara.mobile.nativeapp.ui.console.CoreMenu
import mx.nexara.mobile.nativeapp.ui.console.activities.CoreActivityRules
import mx.nexara.mobile.nativeapp.ui.console.activities.NxChip
import mx.nexara.mobile.nativeapp.ui.console.activities.PausarPropiaDialog
import mx.nexara.mobile.nativeapp.ui.console.activities.SesionActividadRules
import mx.nexara.mobile.nativeapp.ui.console.activities.categoryColor
import mx.nexara.mobile.nativeapp.ui.console.screens.AttendanceUiState
import mx.nexara.mobile.nativeapp.ui.console.screens.ChecadaRechazadaDialog
import mx.nexara.mobile.nativeapp.ui.console.screens.ConsoleAttendanceViewModel
import mx.nexara.mobile.nativeapp.ui.console.screens.fmtHoraCorta
import mx.nexara.mobile.nativeapp.ui.console.screens.transcurridoMs
import mx.nexara.mobile.nativeapp.ui.enterprise.NxDimens
import mx.nexara.mobile.nativeapp.ui.enterprise.NxGlyph
import mx.nexara.mobile.nativeapp.ui.enterprise.NxPalette
import mx.nexara.mobile.nativeapp.ui.enterprise.NxRefreshErrorBanner
import mx.nexara.mobile.nativeapp.ui.enterprise.NxSkeletonList
import mx.nexara.mobile.nativeapp.ui.enterprise.NxTheme
import mx.nexara.mobile.nativeapp.ui.enterprise.icon
import mx.nexara.mobile.nativeapp.ui.enterprise.nxFlotante
import mx.nexara.mobile.nativeapp.ui.theme.InterTight

/**
 * Inicio (rediseño v2, `.ai/ui-maquetas/movil-inicio.html`): la primera pestaña.
 *
 * De arriba abajo: saludo con la fecha y la campana; la tarjeta de jornada con
 * el botón grande de checar; el único aviso que importa hoy; la actividad de
 * «ahora» con su acción principal; y las siguientes del día. Todo sale de lo
 * que la app ya consulta: `me/activities`, `attendance/current` e
 * `attendance/history`. Lee el tema ([NxTheme]) para que el modo oscuro funcione.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun InicioScreen(
    vm: InicioViewModel,
    unreadCount: Int,
    onOpenNotifications: () -> Unit,
    onOpenActivity: (Long, String?) -> Unit,
    onOpenActividades: () -> Unit,
    onOpenAsistencia: () -> Unit,
    onOpenComidas: () -> Unit,
    /** Dirección general: a dónde lleva cada renglón de su tablero (null = el rol no lo abre). */
    onOpenAprobaciones: (() -> Unit)? = null,
    onOpenPagos: (() -> Unit)? = null,
    onOpenDesempeno: (() -> Unit)? = null,
    onOpenPersona: (Long) -> Unit = {},
) {
    val context = LocalContext.current
    val c = NxTheme.colors
    val revision by SessionRevision.valor.collectAsState()
    val user = remember(revision) { AuthRepository(context).loadSession() }
    val state by vm.state.collectAsState()
    val tieneAsistencia = remember(user) { CoreMenu.canOpen(user, CoreKeys.ATTENDANCE) }
    val attendanceVm: ConsoleAttendanceViewModel? = if (tieneAsistencia) viewModel() else null
    val attendance = attendanceVm?.state?.collectAsState()?.value
    var pausandoId by remember { mutableStateOf<Long?>(null) }
    val hoy = remember { LocalDate.now() }
    val problemaAvisos = rememberProblemaDeAvisos()

    // Al volver a la app se relee todo, sin esperar al siguiente tic.
    val lifecycleOwner = LocalLifecycleOwner.current
    DisposableEffect(lifecycleOwner, attendanceVm) {
        val observer = LifecycleEventObserver { _, event ->
            if (event == Lifecycle.Event.ON_RESUME) {
                vm.load(initial = false)
                attendanceVm?.refresh(initial = false)
            }
        }
        lifecycleOwner.lifecycle.addObserver(observer)
        onDispose { lifecycleOwner.lifecycle.removeObserver(observer) }
    }

    val actual = state.actual
    val siguientes = state.siguientes
    val aviso = remember(state.open, user?.id) { InicioRules.aviso(state.open, user?.id) }

    PullToRefreshBox(
        isRefreshing = state.isRefreshing || attendance?.isRefreshing == true,
        onRefresh = {
            vm.load(initial = false)
            attendanceVm?.refresh(initial = false)
        },
        modifier = Modifier.fillMaxSize().background(c.surface),
    ) {
        LazyColumn(
            modifier = Modifier.fillMaxSize(),
            contentPadding = PaddingValues(start = 16.dp, end = 16.dp, bottom = 24.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            item(key = "header") {
                InicioHeader(
                    titulo = if (state.esDireccion) "Tu equipo hoy" else "Mi día",
                    fecha = InicioRules.fechaLarga(hoy),
                    unreadCount = unreadCount,
                    onOpenNotifications = onOpenNotifications,
                )
            }

            problemaAvisos.actual?.let { p ->
                item(key = "avisos-telefono") {
                    NotificationHealthBanner(problema = p, onOcultar = problemaAvisos::ocultar)
                }
            }

            if (attendanceVm != null && attendance != null && attendanceVm.viewMode.canRegisterSelf) {
                item(key = "jornada") {
                    JornadaHero(
                        vm = attendanceVm,
                        state = attendance,
                        onComida = onOpenComidas,
                        onVerJornada = onOpenAsistencia,
                    )
                }
            }

            aviso?.let { a ->
                item(key = "aviso") {
                    AvisoCard(aviso = a, onClick = { a.activityId?.let { onOpenActivity(it, null) } })
                }
            }

            if (state.esDireccion) {
                val ceo = state.ceo
                when {
                    ceo == null && state.isLoading -> item(key = "ceo-cargando") {
                        NxSkeletonList(itemCount = 3, itemHeight = 120.dp)
                    }
                    ceo == null || state.error != null -> item(key = "equipo") {
                        state.error?.let { NxRefreshErrorBanner(message = it, onRetry = { vm.load(initial = false) }) }
                        Spacer(Modifier.height(8.dp))
                        EquipoCard(onVerEquipo = if (state.tieneActividades) onOpenActividades else null)
                    }
                    else -> item(key = "ceo") {
                        // Canvas «App · Inicio CEO» (29-10): lo que ve en la web, con los mismos endpoints.
                        InicioCeoContenido(
                            ceo = ceo,
                            onPizarra = onOpenActividades,
                            onPendiente = { clave ->
                                when (clave) {
                                    InicioCeoRules.CLAVE_APROBACIONES -> (onOpenAprobaciones ?: onOpenActividades)()
                                    InicioCeoRules.CLAVE_PAGOS -> (onOpenPagos ?: onOpenActividades)()
                                    else -> onOpenActividades()
                                }
                            },
                            onDesempeno = onOpenDesempeno,
                            onPersona = onOpenPersona,
                        )
                    }
                }
            } else if (state.tieneActividades) {
                when {
                    state.isLoading -> item(key = "cargando") {
                        NxSkeletonList(itemCount = 2, itemHeight = 132.dp)
                    }
                    state.error != null && state.open.isEmpty() -> item(key = "error") {
                        NxRefreshErrorBanner(message = state.error, onRetry = { vm.load(initial = false) })
                    }
                    actual == null -> item(key = "vacio") {
                        SectionTitle("Ahora")
                        Spacer(Modifier.height(8.dp))
                        TodoAlDiaCard(hechasHoy = state.hechasHoy, onVerTodas = onOpenActividades)
                    }
                    else -> {
                        item(key = "ahora-${actual.id}") {
                            ActualCard(
                                a = actual,
                                accionEnCurso = state.accionEnCurso == actual.id,
                                accionError = state.accionError,
                                onPrimary = { accion ->
                                    when (accion.kind) {
                                        InicioRules.AccionKind.REANUDAR -> vm.reanudar(actual.id) {}
                                        InicioRules.AccionKind.INICIAR ->
                                            if (accion.marcaInicio) {
                                                vm.iniciar(actual.id) { onOpenActivity(actual.id, accion.tab) }
                                            } else {
                                                onOpenActivity(actual.id, accion.tab)
                                            }
                                        else -> onOpenActivity(actual.id, accion.tab)
                                    }
                                },
                                onDetalle = { onOpenActivity(actual.id, null) },
                                onPausar = { pausandoId = actual.id },
                            )
                        }
                        if (state.error != null) {
                            item(key = "error-suave") {
                                NxRefreshErrorBanner(message = state.error, onRetry = { vm.load(initial = false) })
                            }
                        }
                        if (siguientes.isNotEmpty()) {
                            item(key = "despues-titulo") {
                                SectionTitle("Lo que sigue hoy", action = "Ver todas", onAction = onOpenActividades)
                            }
                            item(key = "despues") {
                                SiguientesCard(items = siguientes, onOpen = { onOpenActivity(it.id, null) })
                            }
                        } else if (state.open.size <= 1) {
                            item(key = "ver-todas") {
                                VerTodasRow(onClick = onOpenActividades)
                            }
                        }
                    }
                }
            } else if (attendanceVm == null) {
                item(key = "sin-modulos") {
                    TodoAlDiaCard(hechasHoy = 0, onVerTodas = null)
                }
            }
        }
    }

    pausandoId?.let { id ->
        PausarPropiaDialog(
            activityId = id,
            onDismiss = { pausandoId = null },
            onDone = {
                pausandoId = null
                vm.load(initial = false)
            },
        )
    }
    attendance?.checkInBloqueo?.let { mensaje ->
        ChecadaRechazadaDialog(mensaje = mensaje, onDismiss = { attendanceVm?.clearBloqueo() })
    }
}

// ── Cabecera ────────────────────────────────────────────────────────────────

@Composable
internal fun InicioHeader(
    fecha: String,
    titulo: String = "Mi día",
    unreadCount: Int,
    onOpenNotifications: () -> Unit,
) {
    val c = NxTheme.colors
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .statusBarsPadding()
            .padding(top = 16.dp, bottom = 4.dp, start = 4.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(2.dp)) {
            Text(fecha, fontSize = 13.sp, color = c.muted, maxLines = 1, overflow = TextOverflow.Ellipsis)
            Text(
                titulo,
                fontFamily = InterTight,
                fontSize = 28.sp,
                lineHeight = 32.sp,
                fontWeight = FontWeight.Bold,
                letterSpacing = (-0.5).sp,
                color = c.fg,
                maxLines = 1,
                modifier = Modifier.semantics { heading() },
            )
        }
        // Campana blanca que flota, con un punto de marca cuando hay avisos sin leer.
        Box(
            modifier = Modifier
                .size(44.dp)
                .nxFlotante(CircleShape, 8.dp)
                .clip(CircleShape)
                .background(c.card)
                .clickable(onClick = onOpenNotifications),
            contentAlignment = Alignment.Center,
        ) {
            Icon(
                Icons.Outlined.Notifications,
                contentDescription = if (unreadCount > 0) "Avisos, $unreadCount sin leer" else "Avisos",
                tint = c.fg,
                modifier = Modifier.size(21.dp),
            )
            if (unreadCount > 0) {
                Box(
                    Modifier
                        .align(Alignment.TopEnd)
                        .padding(top = 9.dp, end = 10.dp)
                        .size(8.dp)
                        .clip(CircleShape)
                        .background(c.brand),
                )
            }
        }
    }
}

@Composable
private fun SectionTitle(title: String, action: String? = null, onAction: (() -> Unit)? = null) {
    val c = NxTheme.colors
    Row(
        modifier = Modifier.fillMaxWidth().padding(top = 6.dp, start = 2.dp, end = 2.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Text(
            title,
            fontSize = 15.sp,
            fontWeight = FontWeight.SemiBold,
            color = c.fg,
            modifier = Modifier.weight(1f).semantics { heading() },
        )
        if (action != null && onAction != null) {
            Text(
                action,
                fontSize = 13.5.sp,
                fontWeight = FontWeight.SemiBold,
                color = c.brandText,
                modifier = Modifier
                    .clip(RoundedCornerShape(8.dp))
                    .clickable(onClick = onAction)
                    .padding(horizontal = 6.dp, vertical = 6.dp),
            )
        }
    }
}

// ── Jornada ─────────────────────────────────────────────────────────────────

/**
 * La misma checada que Asistencias (foto + GPS + diálogo de rechazo), a través
 * de `ConsoleAttendanceViewModel`; aquí solo cambia la presentación: tarjeta
 * teal con la cifra grande y el botón de checar al alcance del pulgar.
 */
@Composable
private fun JornadaHero(
    vm: ConsoleAttendanceViewModel,
    state: AttendanceUiState,
    onComida: () -> Unit,
    onVerJornada: () -> Unit,
) {
    val context = LocalContext.current
    val c = NxTheme.colors
    var pendiente by rememberSaveable { mutableStateOf<String?>(null) }
    val tomarFoto = rememberCameraCapture { foto ->
        val tipo = pendiente ?: return@rememberCameraCapture
        pendiente = null
        val dataUrl = ImageDataUrl.fromCaptured(context, foto)
        if (dataUrl.isNullOrBlank()) {
            vm.clearMessage()
            return@rememberCameraCapture
        }
        vm.checkIn(tipo, dataUrl)
    }

    val abierta = state.current?.isOpen == true
    val entradas = state.misChecadas.filter { it.type.equals("entrada", true) }
    val salidas = state.misChecadas.filter { it.type.equals("salida", true) }
    val hayEntrada = entradas.isNotEmpty()
    val haySalida = salidas.isNotEmpty()
    val jornada = InicioRules.jornada(abierta, hayEntrada, haySalida)
    val inicioIso = state.current?.lastEntryAt ?: entradas.maxByOrNull { it.timestamp }?.timestamp
    val salidaIso = salidas.maxByOrNull { it.timestamp }?.timestamp

    var ahoraMs by remember { mutableLongStateOf(System.currentTimeMillis()) }
    LaunchedEffect(abierta) {
        while (abierta) {
            delay(30_000)
            ahoraMs = System.currentTimeMillis()
        }
    }
    val trabajadoMs = when (jornada) {
        InicioRules.Jornada.EN_JORNADA -> transcurridoMs(inicioIso, null, ahoraMs)
        InicioRules.Jornada.COMPLETADA -> transcurridoMs(inicioIso, salidaIso, ahoraMs)
        InicioRules.Jornada.SIN_ENTRADA -> 0L
    }
    val estadoTexto = when (jornada) {
        InicioRules.Jornada.EN_JORNADA -> "En jornada · entrada ${fmtHoraCorta(inicioIso)}"
        InicioRules.Jornada.COMPLETADA -> "Jornada completada · ${fmtHoraCorta(inicioIso)} – ${fmtHoraCorta(salidaIso)}"
        InicioRules.Jornada.SIN_ENTRADA -> "Sin entrada registrada"
    }
    val subTexto = when {
        jornada == InicioRules.Jornada.EN_JORNADA && state.gpsActivo -> "GPS activo"
        jornada == InicioRules.Jornada.EN_JORNADA -> "GPS apagado"
        jornada == InicioRules.Jornada.COMPLETADA -> "Entrada y salida registradas hoy"
        else -> "Se toma una foto y tu ubicación al checar"
    }
    // El API contesta 400 a la segunda entrada del día: aquí se apaga antes.
    val siguiente = when {
        !hayEntrada && !abierta -> "entrada"
        abierta -> "salida"
        else -> null
    }
    val titulo = when (jornada) {
        InicioRules.Jornada.EN_JORNADA -> "Entraste a las ${fmtHoraCorta(inicioIso)}"
        InicioRules.Jornada.COMPLETADA -> "Jornada completada · ${fmtHoraCorta(inicioIso)} – ${fmtHoraCorta(salidaIso)}"
        InicioRules.Jornada.SIN_ENTRADA -> estadoTexto
    }
    val detalle = when (jornada) {
        InicioRules.Jornada.SIN_ENTRADA -> subTexto
        else -> "${InicioRules.horasMinutos(trabajadoMs)} h trabajadas · $subTexto"
    }

    Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
        JornadaTarjeta(
            jornada = jornada,
            titulo = titulo,
            detalle = detalle,
            loading = state.checkInLoading,
            entradaHabilitada = siguiente == "entrada",
            onEntrada = {
                pendiente = "entrada"
                tomarFoto()
            },
            onSalida = {
                pendiente = "salida"
                tomarFoto()
            },
            onComida = onComida,
            onVerJornada = onVerJornada,
        )
        state.checkInMessage?.takeIf { it.isNotBlank() }?.let { msg ->
            Row(
                modifier = Modifier.fillMaxWidth().padding(horizontal = 4.dp),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(6.dp),
            ) {
                Icon(
                    if (state.checkInError) Icons.Outlined.ErrorOutline else Icons.Outlined.TaskAlt,
                    contentDescription = null,
                    tint = if (state.checkInError) c.danger else c.success,
                    modifier = Modifier.size(16.dp),
                )
                Text(msg, fontSize = 12.5.sp, color = if (state.checkInError) c.danger else c.fg2, modifier = Modifier.weight(1f))
            }
        }
    }
}

/**
 * Tarjeta blanca compacta de la jornada (canvas «Mi día»): el estado y su único botón, y la
 * fila de comida mientras la jornada está abierta. Sin estado propio, para la pantalla y para
 * las capturas en la JVM (`CapturasMiDiaTest`).
 */
@Composable
internal fun JornadaTarjeta(
    jornada: InicioRules.Jornada,
    titulo: String,
    detalle: String,
    loading: Boolean,
    entradaHabilitada: Boolean,
    onEntrada: () -> Unit,
    onSalida: () -> Unit,
    onComida: () -> Unit,
    onVerJornada: () -> Unit,
) {
    val c = NxTheme.colors
    val shape = RoundedCornerShape(NxDimens.PanelRadius)
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .nxFlotante(shape)
            .clip(shape)
            .background(c.card),
    ) {
        Row(
            modifier = Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 14.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            Box(
                modifier = Modifier
                    .size(36.dp)
                    .clip(CircleShape)
                    .background(if (jornada == InicioRules.Jornada.SIN_ENTRADA) c.sunken else c.successSoft),
                contentAlignment = Alignment.Center,
            ) {
                Icon(
                    if (jornada == InicioRules.Jornada.SIN_ENTRADA) Icons.Outlined.Schedule else Icons.Outlined.TaskAlt,
                    contentDescription = null,
                    tint = if (jornada == InicioRules.Jornada.SIN_ENTRADA) c.fg2 else c.success,
                    modifier = Modifier.size(19.dp),
                )
            }
            Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(1.dp)) {
                Text(titulo, fontSize = 15.sp, fontWeight = FontWeight.SemiBold, color = c.fg, maxLines = 2, overflow = TextOverflow.Ellipsis)
                Text(detalle, fontSize = 13.sp, color = c.muted, maxLines = 2, overflow = TextOverflow.Ellipsis)
            }
            when (jornada) {
                InicioRules.Jornada.SIN_ENTRADA -> JornadaBoton(
                    text = "Entrada",
                    icon = Icons.AutoMirrored.Outlined.Login,
                    primario = true,
                    loading = loading,
                    enabled = entradaHabilitada,
                    onClick = onEntrada,
                )
                InicioRules.Jornada.EN_JORNADA -> JornadaBoton(
                    text = "Salida",
                    icon = Icons.AutoMirrored.Outlined.Logout,
                    primario = false,
                    loading = loading,
                    onClick = onSalida,
                )
                InicioRules.Jornada.COMPLETADA -> JornadaBoton(
                    text = "Ver",
                    icon = Icons.Outlined.Schedule,
                    primario = false,
                    onClick = onVerJornada,
                )
            }
        }
        if (jornada == InicioRules.Jornada.EN_JORNADA) {
            HorizontalDivider(color = c.borderSubtle)
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .clickable(onClick = onComida)
                    .heightIn(min = 48.dp)
                    .padding(horizontal = 16.dp),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(12.dp),
            ) {
                Icon(Icons.Outlined.Restaurant, contentDescription = null, tint = c.fg2, modifier = Modifier.size(18.dp))
                Text("Comida", fontSize = 14.sp, fontWeight = FontWeight.SemiBold, color = c.fg, modifier = Modifier.weight(1f))
                Icon(Icons.AutoMirrored.Outlined.KeyboardArrowRight, contentDescription = null, tint = c.fg4)
            }
        }
    }
}

@Composable
private fun JornadaBoton(
    text: String,
    icon: ImageVector,
    primario: Boolean,
    onClick: () -> Unit,
    loading: Boolean = false,
    enabled: Boolean = true,
) {
    val c = NxTheme.colors
    Button(
        onClick = onClick,
        enabled = enabled && !loading,
        shape = RoundedCornerShape(12.dp),
        colors = if (primario) {
            ButtonDefaults.buttonColors(containerColor = c.brand, contentColor = Color.White)
        } else {
            ButtonDefaults.buttonColors(containerColor = c.card, contentColor = c.fg)
        },
        border = if (primario) null else androidx.compose.foundation.BorderStroke(1.dp, c.border),
        modifier = Modifier.heightIn(min = 44.dp),
        contentPadding = PaddingValues(horizontal = 14.dp),
    ) {
        if (loading) {
            CircularProgressIndicator(
                modifier = Modifier.size(16.dp),
                strokeWidth = 2.dp,
                color = if (primario) Color.White else c.brand,
            )
        } else {
            Icon(icon, contentDescription = null, modifier = Modifier.size(18.dp))
        }
        Spacer(Modifier.width(6.dp))
        Text(if (loading) "…" else text, fontSize = 14.sp, fontWeight = FontWeight.SemiBold, maxLines = 1)
    }
}

// ── Aviso ───────────────────────────────────────────────────────────────────

@Composable
internal fun AvisoCard(aviso: InicioRules.Aviso, onClick: () -> Unit) {
    val c = NxTheme.colors
    val tinta = when (aviso.tono) {
        InicioRules.Tono.DANGER -> c.danger
        InicioRules.Tono.WARNING -> c.warning
        InicioRules.Tono.SUCCESS -> c.success
        InicioRules.Tono.INFO -> c.info
        InicioRules.Tono.NEUTRAL -> c.fg2
    }
    val fondo = when (aviso.tono) {
        InicioRules.Tono.DANGER -> c.dangerSoft
        InicioRules.Tono.WARNING -> c.warningSoft
        InicioRules.Tono.SUCCESS -> c.successSoft
        InicioRules.Tono.INFO -> c.infoSoft
        InicioRules.Tono.NEUTRAL -> c.sunken
    }
    val texto = when (aviso.tono) {
        InicioRules.Tono.DANGER -> c.dangerText
        InicioRules.Tono.WARNING -> c.warningText
        else -> c.fg
    }
    val shape = RoundedCornerShape(16.dp)
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .clip(shape)
            .background(fondo)
            .clickable(enabled = aviso.activityId != null, onClick = onClick)
            .padding(horizontal = 14.dp, vertical = 12.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        Box(
            modifier = Modifier.size(36.dp).background(c.card.copy(alpha = 0.7f), RoundedCornerShape(11.dp)),
            contentAlignment = Alignment.Center,
        ) {
            Icon(
                if (aviso.tono == InicioRules.Tono.WARNING) Icons.Outlined.Pause else Icons.Outlined.WarningAmber,
                contentDescription = null,
                tint = tinta,
                modifier = Modifier.size(20.dp),
            )
        }
        Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(1.dp)) {
            Text(aviso.titulo, fontSize = 14.sp, fontWeight = FontWeight.Bold, color = texto, maxLines = 2, overflow = TextOverflow.Ellipsis)
            Text(aviso.detalle, fontSize = 12.5.sp, color = texto.copy(alpha = 0.85f), maxLines = 2, overflow = TextOverflow.Ellipsis)
        }
        if (aviso.activityId != null) {
            Icon(Icons.AutoMirrored.Outlined.KeyboardArrowRight, contentDescription = null, tint = texto.copy(alpha = 0.7f))
        }
    }
}

// ── Ahora ───────────────────────────────────────────────────────────────────

/**
 * La actividad de ahora en la banda oscura con resplandor (canvas «App · Mi día»): estado y
 * folio, título, el reloj grande, plan y hora compromiso, el avance contra el plan, y dos
 * botones: pausar (o ver el detalle) y la acción principal.
 */
@Composable
internal fun ActualCard(
    a: MyActivityItemDto,
    accionEnCurso: Boolean,
    accionError: String?,
    onPrimary: (InicioRules.Accion) -> Unit,
    onDetalle: () -> Unit,
    onPausar: () -> Unit,
) {
    val accion = InicioRules.accion(a)
    val lugar = InicioRules.lugar(a)
    val pausable = a.despachador != true && SesionActividadRules.puedePausar(a.sesion(), a.estatus)
    // `minutosReales` viene calculado al consultar; desde ahí el reloj corre en el teléfono.
    val cargadoMs = remember(a) { System.currentTimeMillis() }
    var ahoraMs by remember(a) { mutableLongStateOf(System.currentTimeMillis()) }
    LaunchedEffect(a, a.enCurso) {
        while (a.enCurso == true) {
            delay(1_000)
            ahoraMs = System.currentTimeMillis()
        }
    }
    val segundos = InicioRules.segundosTrabajados(a, cargadoMs, ahoraMs)
    val avancePlan = InicioRules.avancePlan(a, segundos)
    val pie = InicioRules.pieBanda(a)
    val shape = RoundedCornerShape(26.dp)
    val tenue = Color(0xFFC9CED8)

    Column(
        modifier = Modifier
            .fillMaxWidth()
            .nxFlotante(shape, 14.dp)
            .clip(shape)
            .background(BandaFondo)
            .drawBehind { dibujarResplandor() }
            .padding(20.dp),
        verticalArrangement = Arrangement.spacedBy(14.dp),
    ) {
        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            Text(
                InicioRules.etiquetaBanda(a).uppercase(),
                fontSize = 12.sp,
                fontWeight = FontWeight.SemiBold,
                letterSpacing = 0.5.sp,
                color = Color(0xFFB9BFCC),
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
                modifier = Modifier.weight(1f),
            )
            // El estado ya va en la etiqueta: la pastilla dice cómo va contra el límite.
            InicioRules.pastillaBanda(a)?.let { pastilla ->
                Text(
                    pastilla,
                    fontSize = 12.sp,
                    fontWeight = FontWeight.SemiBold,
                    color = Color.White,
                    maxLines = 1,
                    modifier = Modifier
                        .clip(RoundedCornerShape(999.dp))
                        .background(Color.White.copy(alpha = 0.12f))
                        .padding(horizontal = 9.dp, vertical = 3.dp),
                )
            }
        }
        Column(
            modifier = Modifier.clickable(onClick = onDetalle),
            verticalArrangement = Arrangement.spacedBy(4.dp),
        ) {
            Text(
                InicioRules.titulo(a),
                fontFamily = InterTight,
                fontSize = 21.sp,
                lineHeight = 25.sp,
                fontWeight = FontWeight.Bold,
                color = Color.White,
                maxLines = 3,
                overflow = TextOverflow.Ellipsis,
            )
            listOfNotNull(lugar, a.periodo?.etiqueta?.takeIf { it.isNotBlank() }).joinToString(" · ").takeIf { it.isNotEmpty() }?.let {
                Text(it, fontSize = 14.sp, color = tenue, maxLines = 2, overflow = TextOverflow.Ellipsis)
            }
        }
        Column(verticalArrangement = Arrangement.spacedBy(2.dp)) {
            Text(
                segundos?.let { InicioRules.reloj(it) } ?: (InicioRules.horaDe(a.fechaInicio) ?: "—"),
                fontFamily = InterTight,
                fontSize = 40.sp,
                lineHeight = 44.sp,
                fontWeight = FontWeight.Bold,
                letterSpacing = (-0.8).sp,
                color = Color.White,
                style = TextStyle(fontFeatureSettings = "tnum"),
                modifier = Modifier.semantics {
                    contentDescription = segundos?.let { "Tiempo trabajado ${InicioRules.reloj(it)}" } ?: "Programada"
                },
            )
            (pie ?: if (segundos == null) "Programada para hoy" else null)?.let {
                Text(it, fontSize = 13.sp, color = tenue, maxLines = 2, overflow = TextOverflow.Ellipsis)
            }
        }
        if (avancePlan != null) {
            Box(
                Modifier
                    .fillMaxWidth()
                    .height(6.dp)
                    .clip(RoundedCornerShape(3.dp))
                    .background(Color.White.copy(alpha = 0.14f)),
            ) {
                Box(
                    Modifier
                        .fillMaxWidth(avancePlan)
                        .height(6.dp)
                        .clip(RoundedCornerShape(3.dp))
                        .background(
                            Brush.horizontalGradient(
                                if (a.excedida == true) listOf(Color(0xFFF5B14C), Color(0xFFF08A1E)) else listOf(Color(0xFF6EC5D8), Color(0xFF10A183)),
                            ),
                        ),
                )
            }
        }
        accionError?.let {
            Text(it, fontSize = 12.5.sp, color = Color(0xFFFFB4B4))
        }
        Row(horizontalArrangement = Arrangement.spacedBy(10.dp), modifier = Modifier.fillMaxWidth()) {
            BandaBoton(
                text = if (pausable) "Pausar" else "Detalle",
                icon = if (pausable) Icons.Outlined.Pause else Icons.Outlined.Info,
                claro = false,
                onClick = if (pausable) onPausar else onDetalle,
                modifier = Modifier.weight(1f),
            )
            BandaBoton(
                text = InicioRules.etiquetaCorta(accion),
                icon = when (accion.kind) {
                    InicioRules.AccionKind.INICIAR, InicioRules.AccionKind.REANUDAR -> Icons.Outlined.PlayArrow
                    InicioRules.AccionKind.CONTINUAR, InicioRules.AccionKind.CORREGIR -> NxGlyph.PHOTO.icon
                    InicioRules.AccionKind.REPARTIR -> NxGlyph.DISPATCH.icon
                    else -> Icons.Outlined.Info
                },
                claro = true,
                loading = accionEnCurso,
                onClick = { onPrimary(accion) },
                modifier = Modifier.weight(1f),
            )
        }
    }
}

/** Fondo casi negro de la banda; el resplandor se dibuja encima. */
private val BandaFondo = Color(0xFF0D0F12)

/** Aurora de la banda: verde arriba a la derecha, azul abajo a la izquierda, magenta abajo. */
private fun androidx.compose.ui.graphics.drawscope.DrawScope.dibujarResplandor() {
    val w = size.width
    val h = size.height
    drawRect(
        Brush.radialGradient(
            listOf(Color(0xFF10A183).copy(alpha = 0.55f), Color.Transparent),
            center = Offset(w, 0f),
            radius = w * 0.85f,
        ),
    )
    drawRect(
        Brush.radialGradient(
            listOf(Color(0xFF0060F0).copy(alpha = 0.45f), Color.Transparent),
            center = Offset(0f, h * 1.2f),
            radius = w * 0.75f,
        ),
    )
    drawRect(
        Brush.radialGradient(
            listOf(Color(0xFFA85299).copy(alpha = 0.32f), Color.Transparent),
            center = Offset(w * 0.6f, h * 1.3f),
            radius = w * 0.55f,
        ),
    )
}

@Composable
private fun BandaBoton(
    text: String,
    icon: ImageVector,
    claro: Boolean,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
    loading: Boolean = false,
) {
    Button(
        onClick = onClick,
        enabled = !loading,
        shape = RoundedCornerShape(14.dp),
        colors = if (claro) {
            ButtonDefaults.buttonColors(
                containerColor = Color.White,
                contentColor = Color(0xFF14171F),
                disabledContainerColor = Color.White.copy(alpha = 0.7f),
                disabledContentColor = Color(0xFF14171F).copy(alpha = 0.6f),
            )
        } else {
            ButtonDefaults.buttonColors(containerColor = Color.Transparent, contentColor = Color.White)
        },
        border = if (claro) null else androidx.compose.foundation.BorderStroke(1.dp, Color.White.copy(alpha = 0.28f)),
        modifier = modifier.heightIn(min = 48.dp),
        contentPadding = PaddingValues(horizontal = 12.dp),
    ) {
        if (loading) {
            CircularProgressIndicator(modifier = Modifier.size(18.dp), strokeWidth = 2.dp, color = Color(0xFF14171F))
        } else {
            Icon(icon, contentDescription = null, modifier = Modifier.size(19.dp))
        }
        Spacer(Modifier.width(8.dp))
        Text(text, fontSize = 15.sp, fontWeight = FontWeight.SemiBold, maxLines = 1, overflow = TextOverflow.Ellipsis)
    }
}

// ── Después, hoy ─────────────────────────────────────────────────────────────

@Composable
internal fun SiguientesCard(items: List<MyActivityItemDto>, onOpen: (MyActivityItemDto) -> Unit) {
    val c = NxTheme.colors
    val shape = RoundedCornerShape(22.dp)
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .nxFlotante(shape)
            .clip(shape)
            .background(c.card),
    ) {
        items.forEachIndexed { i, a ->
            if (i > 0) HorizontalDivider(color = c.borderSubtle)
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .clickable { onOpen(a) }
                    .padding(horizontal = 16.dp, vertical = 14.dp),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(12.dp),
            ) {
                Text(
                    InicioRules.horaDe(a.fechaInicio) ?: a.periodo?.dia?.let { "Día $it" } ?: "—",
                    fontSize = 13.sp,
                    fontWeight = FontWeight.SemiBold,
                    color = c.muted,
                    maxLines = 1,
                    style = TextStyle(fontFeatureSettings = "tnum"),
                    modifier = Modifier.width(48.dp),
                )
                Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(2.dp)) {
                    Text(InicioRules.titulo(a), fontSize = 15.sp, fontWeight = FontWeight.SemiBold, color = c.fg, maxLines = 2, overflow = TextOverflow.Ellipsis)
                    Text(
                        InicioRules.detalleSiguiente(a).replace("\n", " · "),
                        fontSize = 13.sp,
                        color = c.muted,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis,
                    )
                }
                Icon(Icons.AutoMirrored.Outlined.KeyboardArrowRight, contentDescription = null, tint = c.fg4)
            }
        }
    }
}

@Composable
private fun VerTodasRow(onClick: () -> Unit) {
    val c = NxTheme.colors
    Text(
        "Ver todas mis actividades",
        fontSize = 13.5.sp,
        fontWeight = FontWeight.SemiBold,
        color = c.brandText,
        modifier = Modifier
            .clip(RoundedCornerShape(8.dp))
            .clickable(onClick = onClick)
            .padding(horizontal = 6.dp, vertical = 8.dp),
    )
}

/** Inicio de dirección general: no tiene cola propia; su día es el del equipo. */
@Composable
private fun EquipoCard(onVerEquipo: (() -> Unit)?) {
    val c = NxTheme.colors
    val shape = RoundedCornerShape(22.dp)
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .nxFlotante(shape)
            .clip(shape)
            .background(c.card)
            .padding(16.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp)) {
            Box(
                modifier = Modifier.size(44.dp).background(c.brandSoft, CircleShape),
                contentAlignment = Alignment.Center,
            ) {
                Icon(Icons.Outlined.Groups, contentDescription = null, tint = c.brandText, modifier = Modifier.size(24.dp))
            }
            Column(verticalArrangement = Arrangement.spacedBy(2.dp)) {
                Text("Pizarra del equipo", fontSize = 16.sp, fontWeight = FontWeight.Bold, color = c.fg)
                Text(
                    "Quién está en campo, qué lleva cada persona y qué va atrasado.",
                    fontSize = 13.sp,
                    color = c.muted,
                )
            }
        }
        if (onVerEquipo != null) {
            Button(
                onClick = onVerEquipo,
                modifier = Modifier.fillMaxWidth().height(NxDimens.PrimaryButtonHeight),
                shape = RoundedCornerShape(NxDimens.ControlRadius),
            ) {
                Text("Ver la pizarra del equipo", fontWeight = FontWeight.SemiBold)
            }
        }
    }
}

@Composable
private fun TodoAlDiaCard(hechasHoy: Int, onVerTodas: (() -> Unit)?) {
    val c = NxTheme.colors
    val shape = RoundedCornerShape(22.dp)
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .nxFlotante(shape)
            .clip(shape)
            .background(c.card)
            .padding(20.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(6.dp),
    ) {
        Box(
            modifier = Modifier.size(52.dp).background(c.successSoft, CircleShape),
            contentAlignment = Alignment.Center,
        ) {
            Icon(Icons.Outlined.TaskAlt, contentDescription = null, tint = c.success, modifier = Modifier.size(26.dp))
        }
        Text("Todo al día", fontSize = 16.sp, fontWeight = FontWeight.Bold, color = c.fg)
        Text(
            when {
                hechasHoy == 1 -> "Terminaste 1 actividad hoy. Cuando te asignen algo aparecerá aquí."
                hechasHoy > 1 -> "Terminaste $hechasHoy actividades hoy. Cuando te asignen algo aparecerá aquí."
                else -> "Cuando te asignen algo aparecerá aquí."
            },
            fontSize = 13.sp,
            color = c.muted,
            textAlign = androidx.compose.ui.text.style.TextAlign.Center,
        )
        if (onVerTodas != null) {
            Spacer(Modifier.height(2.dp))
            VerTodasRow(onClick = onVerTodas)
        }
    }
}

/** Colores de la pizarra que Inicio comparte con el detalle (para que ambos lean igual). */
@Suppress("unused")
private fun NxPalette.tonoDe(tono: InicioRules.Tono): Color = when (tono) {
    InicioRules.Tono.INFO -> info
    InicioRules.Tono.WARNING -> warning
    InicioRules.Tono.DANGER -> danger
    InicioRules.Tono.SUCCESS -> success
    InicioRules.Tono.NEUTRAL -> fg2
}
