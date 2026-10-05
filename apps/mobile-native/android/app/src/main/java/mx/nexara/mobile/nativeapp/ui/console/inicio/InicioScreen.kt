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
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.LifecycleEventObserver
import androidx.lifecycle.compose.LocalLifecycleOwner
import androidx.lifecycle.viewmodel.compose.viewModel
import coil.compose.AsyncImage
import kotlinx.coroutines.delay
import mx.nexara.mobile.nativeapp.access.CoreKeys
import mx.nexara.mobile.nativeapp.data.AuthRepository
import mx.nexara.mobile.nativeapp.data.SessionRevision
import mx.nexara.mobile.nativeapp.data.SessionUser
import mx.nexara.mobile.nativeapp.data.api.MyActivityItemDto
import mx.nexara.mobile.nativeapp.data.api.toAbsoluteAssetUrl
import mx.nexara.mobile.nativeapp.ui.common.ImageDataUrl
import mx.nexara.mobile.nativeapp.ui.common.NotificationHealthBanner
import mx.nexara.mobile.nativeapp.ui.common.rememberProblemaDeAvisos
import mx.nexara.mobile.nativeapp.ui.common.rememberCameraCapture
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
import java.time.LocalDate

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
                    user = user,
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
                item(key = "equipo") {
                    SectionTitle("Tu equipo hoy")
                    Spacer(Modifier.height(8.dp))
                    EquipoCard(onVerEquipo = if (state.tieneActividades) onOpenActividades else null)
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
                        item(key = "ahora-titulo") { SectionTitle("Ahora") }
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
                                SectionTitle("Después, hoy", action = "Ver todas", onAction = onOpenActividades)
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
private fun InicioHeader(
    user: SessionUser?,
    fecha: String,
    unreadCount: Int,
    onOpenNotifications: () -> Unit,
) {
    val c = NxTheme.colors
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .statusBarsPadding()
            .padding(top = 12.dp, bottom = 2.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        Avatar(user = user, size = 48.dp)
        Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(1.dp)) {
            Text(fecha, fontSize = 13.sp, color = c.muted, maxLines = 1, overflow = TextOverflow.Ellipsis)
            Text(
                InicioRules.saludo(user?.nombre),
                fontSize = 22.sp,
                lineHeight = 26.sp,
                fontWeight = FontWeight.Bold,
                color = c.fg,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
                modifier = Modifier.semantics { heading() },
            )
        }
        Box(
            modifier = Modifier
                .size(44.dp)
                .clip(CircleShape)
                .background(c.card)
                .border(1.dp, c.border, CircleShape)
                .clickable(onClick = onOpenNotifications),
            contentAlignment = Alignment.Center,
        ) {
            BadgedBox(
                badge = {
                    if (unreadCount > 0) {
                        Badge(containerColor = c.danger, contentColor = Color.White) {
                            Text(if (unreadCount > 99) "99+" else unreadCount.toString())
                        }
                    }
                },
            ) {
                Icon(
                    Icons.Outlined.Notifications,
                    contentDescription = if (unreadCount > 0) "Notificaciones, $unreadCount sin leer" else "Notificaciones",
                    tint = c.fg2,
                    modifier = Modifier.size(22.dp),
                )
            }
        }
    }
}

@Composable
private fun Avatar(user: SessionUser?, size: androidx.compose.ui.unit.Dp) {
    val c = NxTheme.colors
    val avatarUrl = user?.avatarUrl
    if (!avatarUrl.isNullOrBlank()) {
        AsyncImage(
            model = toAbsoluteAssetUrl(avatarUrl),
            contentDescription = user.nombre,
            modifier = Modifier.size(size).clip(CircleShape).border(2.dp, c.brandSoft2, CircleShape),
            contentScale = ContentScale.Crop,
        )
    } else {
        Box(
            modifier = Modifier.size(size).clip(CircleShape).background(c.brandSoft),
            contentAlignment = Alignment.Center,
        ) {
            Text(
                CoreActivityRules.initials(user?.nombre).ifBlank { "?" },
                color = c.brandText,
                fontWeight = FontWeight.ExtraBold,
                fontSize = (size.value * 0.36f).sp,
            )
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
            fontSize = 17.sp,
            fontWeight = FontWeight.Bold,
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
        jornada == InicioRules.Jornada.EN_JORNADA && state.gpsActivo -> "Compartiendo tu ubicación de jornada"
        jornada == InicioRules.Jornada.EN_JORNADA -> "Tu ubicación de jornada está apagada"
        jornada == InicioRules.Jornada.COMPLETADA -> "Entrada y salida registradas hoy"
        else -> "Se toma una foto y tu ubicación al checar"
    }
    // El API contesta 400 a la segunda entrada del día: aquí se apaga antes.
    val siguiente = when {
        !hayEntrada && !abierta -> "entrada"
        abierta -> "salida"
        else -> null
    }
    val shape = RoundedCornerShape(NxDimens.SheetRadius)

    Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .clip(shape)
                .background(
                    Brush.linearGradient(
                        colors = listOf(Color(0xFF2BBD9D), Color(0xFF1A8A73), Color(0xFF0F5F4F)),
                        start = Offset(Float.POSITIVE_INFINITY, 0f),
                        end = Offset(0f, Float.POSITIVE_INFINITY),
                    ),
                )
                .drawBehind {
                    drawCircle(
                        color = Color.White.copy(alpha = 0.06f),
                        radius = 110.dp.toPx(),
                        center = Offset(size.width - 20.dp.toPx(), size.height + 30.dp.toPx()),
                        style = Stroke(width = 28.dp.toPx()),
                    )
                }
                .padding(18.dp),
            verticalArrangement = Arrangement.spacedBy(4.dp),
        ) {
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                Box(
                    Modifier
                        .size(8.dp)
                        .clip(CircleShape)
                        .background(if (abierta) Color(0xFF7DFFD8) else Color.White.copy(alpha = 0.55f)),
                )
                Text(estadoTexto, fontSize = 13.5.sp, fontWeight = FontWeight.Medium, color = Color.White.copy(alpha = 0.92f), maxLines = 1, overflow = TextOverflow.Ellipsis)
            }
            Row(verticalAlignment = Alignment.Bottom, horizontalArrangement = Arrangement.spacedBy(8.dp), modifier = Modifier.padding(top = 6.dp)) {
                Text(
                    InicioRules.horasMinutos(trabajadoMs),
                    fontSize = 40.sp,
                    lineHeight = 42.sp,
                    fontWeight = FontWeight.Bold,
                    color = Color.White,
                )
                Text("h trabajadas", fontSize = 16.sp, color = Color.White.copy(alpha = 0.78f), modifier = Modifier.padding(bottom = 6.dp))
            }
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                Icon(Icons.Outlined.Place, contentDescription = null, tint = Color.White.copy(alpha = 0.85f), modifier = Modifier.size(15.dp))
                Text(subTexto, fontSize = 13.sp, color = Color.White.copy(alpha = 0.85f), maxLines = 1, overflow = TextOverflow.Ellipsis)
            }
            Row(
                modifier = Modifier.fillMaxWidth().padding(top = 12.dp),
                horizontalArrangement = Arrangement.spacedBy(10.dp),
            ) {
                when (jornada) {
                    InicioRules.Jornada.EN_JORNADA -> {
                        HeroButton(text = "Comida", icon = Icons.Outlined.Restaurant, light = true, onClick = onComida, modifier = Modifier.weight(1f))
                        HeroButton(
                            text = "Checar salida",
                            icon = Icons.AutoMirrored.Outlined.Logout,
                            light = false,
                            loading = state.checkInLoading,
                            onClick = {
                                pendiente = "salida"
                                tomarFoto()
                            },
                            modifier = Modifier.weight(1f),
                        )
                    }
                    InicioRules.Jornada.SIN_ENTRADA -> {
                        HeroButton(
                            text = "Checar entrada",
                            icon = Icons.AutoMirrored.Outlined.Login,
                            light = false,
                            loading = state.checkInLoading,
                            enabled = siguiente == "entrada",
                            onClick = {
                                pendiente = "entrada"
                                tomarFoto()
                            },
                            modifier = Modifier.weight(1f),
                        )
                    }
                    InicioRules.Jornada.COMPLETADA -> {
                        HeroButton(text = "Ver mi jornada", icon = Icons.Outlined.Schedule, light = true, onClick = onVerJornada, modifier = Modifier.weight(1f))
                    }
                }
            }
        }
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

@Composable
private fun HeroButton(
    text: String,
    icon: ImageVector,
    light: Boolean,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
    loading: Boolean = false,
    enabled: Boolean = true,
) {
    Button(
        onClick = onClick,
        enabled = enabled && !loading,
        shape = RoundedCornerShape(16.dp),
        colors = if (light) {
            ButtonDefaults.buttonColors(
                containerColor = Color.White.copy(alpha = 0.16f),
                contentColor = Color.White,
                disabledContainerColor = Color.White.copy(alpha = 0.10f),
                disabledContentColor = Color.White.copy(alpha = 0.6f),
            )
        } else {
            ButtonDefaults.buttonColors(
                containerColor = Color.White,
                contentColor = Color(0xFF0F5F4F),
                disabledContainerColor = Color.White.copy(alpha = 0.6f),
                disabledContentColor = Color(0xFF0F5F4F).copy(alpha = 0.6f),
            )
        },
        border = if (light) androidx.compose.foundation.BorderStroke(1.dp, Color.White.copy(alpha = 0.22f)) else null,
        modifier = modifier.heightIn(min = NxDimens.PrimaryButtonHeight),
        contentPadding = PaddingValues(horizontal = 12.dp),
    ) {
        if (loading) {
            CircularProgressIndicator(modifier = Modifier.size(18.dp), strokeWidth = 2.dp, color = Color(0xFF0F5F4F))
        } else {
            Icon(icon, contentDescription = null, modifier = Modifier.size(20.dp))
        }
        Spacer(Modifier.width(8.dp))
        Text(if (loading) "Registrando…" else text, fontSize = 15.sp, fontWeight = FontWeight.Bold, maxLines = 1, overflow = TextOverflow.Ellipsis)
    }
}

// ── Aviso ───────────────────────────────────────────────────────────────────

@Composable
private fun AvisoCard(aviso: InicioRules.Aviso, onClick: () -> Unit) {
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
    val shape = RoundedCornerShape(NxDimens.PanelRadius)
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

@Composable
private fun ActualCard(
    a: MyActivityItemDto,
    accionEnCurso: Boolean,
    accionError: String?,
    onPrimary: (InicioRules.Accion) -> Unit,
    onDetalle: () -> Unit,
    onPausar: () -> Unit,
) {
    val c = NxTheme.colors
    val accion = InicioRules.accion(a)
    val estado = InicioRules.estado(a)
    val avance = InicioRules.avance(a)
    val lugar = InicioRules.lugar(a)
    val kindColor = categoryColor(a.coreKind, c)
    val pausable = a.despachador != true && SesionActividadRules.puedePausar(a.sesion(), a.estatus)
    val estadoColor = when (estado.tono) {
        InicioRules.Tono.INFO -> c.info
        InicioRules.Tono.WARNING -> c.warning
        InicioRules.Tono.DANGER -> c.danger
        InicioRules.Tono.SUCCESS -> c.success
        InicioRules.Tono.NEUTRAL -> c.fg2
    }
    val shape = RoundedCornerShape(NxDimens.SheetRadius)
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .clip(shape)
            .background(c.card)
            .border(1.dp, c.border, shape)
            .padding(16.dp),
        verticalArrangement = Arrangement.spacedBy(10.dp),
    ) {
        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            Box(
                modifier = Modifier.size(28.dp).background(kindColor.copy(alpha = 0.14f), RoundedCornerShape(8.dp)),
                contentAlignment = Alignment.Center,
            ) {
                Icon(CoreActivityRules.kindGlyph(a.coreKind).icon, contentDescription = null, tint = kindColor, modifier = Modifier.size(16.dp))
            }
            Text(
                listOfNotNull(
                    CoreActivityRules.kindLabel(a.coreKind, a.ticketTypeCustom),
                    a.anNumber?.takeIf { it.isNotBlank() },
                ).joinToString("  "),
                fontSize = 13.sp,
                fontWeight = FontWeight.SemiBold,
                color = c.muted,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
                modifier = Modifier.weight(1f),
            )
            NxChip(text = estado.label, color = estadoColor, dot = true)
        }
        Text(
            InicioRules.titulo(a),
            fontSize = 18.sp,
            lineHeight = 23.sp,
            fontWeight = FontWeight.Bold,
            color = c.fg,
            maxLines = 3,
            overflow = TextOverflow.Ellipsis,
        )
        if (lugar != null) {
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                Icon(Icons.Outlined.Place, contentDescription = null, tint = c.muted, modifier = Modifier.size(15.dp))
                Text(lugar, fontSize = 13.5.sp, color = c.muted, maxLines = 1, overflow = TextOverflow.Ellipsis)
            }
        }
        a.periodo?.etiqueta?.takeIf { it.isNotBlank() }?.let {
            Text(it, fontSize = 12.5.sp, color = c.muted, maxLines = 1, overflow = TextOverflow.Ellipsis)
        }
        if (avance != null) {
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp), modifier = Modifier.padding(top = 2.dp)) {
                LinearProgressIndicator(
                    progress = { if (avance.second == 0) 0f else avance.first.toFloat() / avance.second },
                    modifier = Modifier.weight(1f).height(8.dp).clip(RoundedCornerShape(999.dp)),
                    color = c.brand,
                    trackColor = c.sunken,
                    drawStopIndicator = {},
                )
                Text("${avance.first}/${avance.second}", fontSize = 13.sp, fontWeight = FontWeight.Bold, color = c.fg2)
            }
        }
        accionError?.let {
            Text(it, fontSize = 12.5.sp, color = c.danger)
        }
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalAlignment = Alignment.CenterVertically) {
            Button(
                onClick = { onPrimary(accion) },
                enabled = !accionEnCurso,
                colors = ButtonDefaults.buttonColors(containerColor = c.brand, contentColor = Color.White),
                shape = RoundedCornerShape(16.dp),
                modifier = Modifier.weight(1f).heightIn(min = NxDimens.PrimaryButtonHeight),
                contentPadding = PaddingValues(horizontal = 12.dp),
            ) {
                if (accionEnCurso) {
                    CircularProgressIndicator(modifier = Modifier.size(18.dp), strokeWidth = 2.dp, color = Color.White)
                } else {
                    Icon(
                        when (accion.kind) {
                            InicioRules.AccionKind.INICIAR, InicioRules.AccionKind.REANUDAR -> Icons.Outlined.PlayArrow
                            InicioRules.AccionKind.CONTINUAR, InicioRules.AccionKind.CORREGIR -> NxGlyph.PHOTO.icon
                            InicioRules.AccionKind.REPARTIR -> NxGlyph.DISPATCH.icon
                            else -> Icons.Outlined.Info
                        },
                        contentDescription = null,
                        modifier = Modifier.size(20.dp),
                    )
                }
                Spacer(Modifier.width(8.dp))
                Text(accion.label, fontSize = 15.sp, fontWeight = FontWeight.Bold, maxLines = 1, overflow = TextOverflow.Ellipsis)
            }
            if (pausable) {
                SquareButton(icon = Icons.Outlined.Pause, contentDescription = "Pausar actividad", onClick = onPausar)
            }
            SquareButton(icon = Icons.Outlined.Info, contentDescription = "Ver detalle", onClick = onDetalle)
        }
    }
}

@Composable
private fun SquareButton(icon: ImageVector, contentDescription: String, onClick: () -> Unit) {
    val c = NxTheme.colors
    val shape = RoundedCornerShape(16.dp)
    Box(
        modifier = Modifier
            .size(NxDimens.PrimaryButtonHeight)
            .clip(shape)
            .background(c.card)
            .border(1.dp, c.borderStrong, shape)
            .clickable(onClick = onClick),
        contentAlignment = Alignment.Center,
    ) {
        Icon(icon, contentDescription = contentDescription, tint = c.fg, modifier = Modifier.size(22.dp))
    }
}

// ── Después, hoy ─────────────────────────────────────────────────────────────

@Composable
private fun SiguientesCard(items: List<MyActivityItemDto>, onOpen: (MyActivityItemDto) -> Unit) {
    val c = NxTheme.colors
    val shape = RoundedCornerShape(NxDimens.SheetRadius)
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .clip(shape)
            .background(c.card)
            .border(1.dp, c.border, shape),
    ) {
        items.forEachIndexed { i, a ->
            if (i > 0) HorizontalDivider(color = c.borderSubtle)
            val kindColor = categoryColor(a.coreKind, c)
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .clickable { onOpen(a) }
                    .padding(horizontal = 14.dp, vertical = 12.dp),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(12.dp),
            ) {
                // 58: con 48 «Esta semana» y «Puede esperar» salían cortadas («Esta sem…»).
                Column(Modifier.width(58.dp), horizontalAlignment = Alignment.CenterHorizontally) {
                    Text(
                        InicioRules.horaDe(a.fechaInicio) ?: "—",
                        fontSize = 15.sp,
                        fontWeight = FontWeight.Bold,
                        color = c.fg,
                        maxLines = 1,
                    )
                    Text(
                        a.periodo?.dia?.let { "Día $it" } ?: CoreActivityRules.priorityUi(a.prioridad).label.take(12),
                        fontSize = 11.sp,
                        color = c.muted,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis,
                    )
                }
                Box(
                    modifier = Modifier.size(36.dp).background(kindColor.copy(alpha = 0.14f), RoundedCornerShape(10.dp)),
                    contentAlignment = Alignment.Center,
                ) {
                    Icon(CoreActivityRules.kindGlyph(a.coreKind).icon, contentDescription = null, tint = kindColor, modifier = Modifier.size(18.dp))
                }
                Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(1.dp)) {
                    Text(InicioRules.titulo(a), fontSize = 14.5.sp, fontWeight = FontWeight.SemiBold, color = c.fg, maxLines = 2, overflow = TextOverflow.Ellipsis)
                    Text(InicioRules.detalleSiguiente(a), fontSize = 12.5.sp, color = c.muted, maxLines = 1, overflow = TextOverflow.Ellipsis)
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
    val shape = RoundedCornerShape(NxDimens.SheetRadius)
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .clip(shape)
            .background(c.card)
            .border(1.dp, c.border, shape)
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
    val shape = RoundedCornerShape(NxDimens.SheetRadius)
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .clip(shape)
            .background(c.card)
            .border(1.dp, c.border, shape)
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
