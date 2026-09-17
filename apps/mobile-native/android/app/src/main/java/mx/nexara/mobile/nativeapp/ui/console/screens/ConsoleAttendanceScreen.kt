package mx.nexara.mobile.nativeapp.ui.console.screens

import android.Manifest
import android.app.Application
import android.content.Context
import android.content.pm.PackageManager
import android.os.Build
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.background
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.ErrorOutline
import androidx.compose.material.icons.outlined.GpsFixed
import androidx.compose.material.icons.outlined.Schedule
import androidx.compose.material3.*
import androidx.compose.material3.pulltorefresh.PullToRefreshBox
import androidx.compose.runtime.*
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalLifecycleOwner
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.core.content.ContextCompat
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.LifecycleEventObserver
import androidx.lifecycle.viewModelScope
import androidx.lifecycle.viewmodel.compose.viewModel
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import mx.nexara.mobile.nativeapp.data.AuthRepository
import mx.nexara.mobile.nativeapp.data.SessionUser
import mx.nexara.mobile.nativeapp.data.api.AttendanceCorreccionDto
import mx.nexara.mobile.nativeapp.data.api.AttendanceCurrentDto
import mx.nexara.mobile.nativeapp.data.api.AttendanceEventDto
import mx.nexara.mobile.nativeapp.data.api.AttendanceJustificacionDto
import mx.nexara.mobile.nativeapp.data.api.AttendanceRangeUserDto
import mx.nexara.mobile.nativeapp.data.api.GpsLocationDto
import mx.nexara.mobile.nativeapp.data.api.attendanceCoord
import mx.nexara.mobile.nativeapp.data.api.toUserMessage
import mx.nexara.mobile.nativeapp.data.console.ConsoleRepository
import mx.nexara.mobile.nativeapp.ui.common.ImageDataUrl
import mx.nexara.mobile.nativeapp.ui.common.LocationPermissionBanner
import mx.nexara.mobile.nativeapp.ui.common.ProtectedImage
import mx.nexara.mobile.nativeapp.ui.enterprise.NxColors
import mx.nexara.mobile.nativeapp.ui.enterprise.NxGlyph
import mx.nexara.mobile.nativeapp.ui.enterprise.NxIconText
import mx.nexara.mobile.nativeapp.ui.enterprise.NxIcons
import mx.nexara.mobile.nativeapp.ui.enterprise.icon
import mx.nexara.mobile.nativeapp.ui.common.rememberCameraCapture
import mx.nexara.mobile.nativeapp.ui.enterprise.NxEmptyState
import mx.nexara.mobile.nativeapp.ui.enterprise.NxLoadingBlock
import mx.nexara.mobile.nativeapp.ui.util.openExternalUrl
import mx.nexara.mobile.nativeapp.util.DeviceLocation
import mx.nexara.mobile.nativeapp.util.JornadaGps
import java.time.Instant
import java.time.LocalDate
import java.time.ZoneId
import java.time.format.DateTimeFormatter
import java.util.Locale

/*
 * Asistencias — espejo de apps/web/app/(panels)/erp/asistencias/page.tsx.
 *
 * Tres pestañas sobre un mismo día: equipo, comidas y trayectoria. Antes esta
 * pantalla era otra cosa: rangos de semana/mes, ranking de horas y export CSV
 * que la web no tiene, el equipo decidido por `console.admin` en vez del rol, y
 * la consulta sin `scope`, así que cualquiera con `attendance.manage` veía a la
 * empresa entera.
 */

// ── Estado ───────────────────────────────────────────────────────────────────

enum class AttendanceEstado(val etiqueta: String, val color: Color) {
    PRESENTE("En jornada", Color(0xFF16A34A)),
    COMPLETO("Completó", Color(0xFF2563EB)),
    /** Sin checada, pero Christian la justificó: ni ausente ni asistió. */
    JUSTIFICADA(FaltasJustificadas.ETIQUETA, Color(0xFF7C3AED)),
    AUSENTE("Sin checada", Color(0xFF94A3B8)),
}

data class AttendancePersona(
    val userId: Long,
    val nombre: String,
    val subtitulo: String,
    val estado: AttendanceEstado,
    val entradaIso: String?,
    val salidaIso: String?,
    val fotoEntrada: String?,
    val fotoSalida: String?,
    val mapaEntrada: String?,
    val mapaSalida: String?,
    /** Justificación de ese día («Falta justificada · motivo»). */
    val justificacion: AttendanceJustificacionDto? = null,
    /** Contrato A: «Sin conexión», «Revisar: motivo», «Fuera de sitio · N m», «Cierre automático», «Corregida». */
    val avisosEntrada: List<AttendanceBadge> = emptyList(),
    val avisosSalida: List<AttendanceBadge> = emptyList(),
    /** Correcciones de sus checadas del día (antes → después, con motivo). */
    val correcciones: List<AttendanceCorreccionDto> = emptyList(),
)

data class AttendanceUiState(
    val isLoading: Boolean = true,
    val isRefreshing: Boolean = false,
    val error: String? = null,
    val checkInLoading: Boolean = false,
    val checkInMessage: String? = null,
    val checkInError: Boolean = false,
    /** 422 «ubicación simulada»: se muestra en un diálogo, no como una línea más. */
    val checkInBloqueo: String? = null,
    val fecha: String = hoyIso(),
    val filtro: AttendanceEstado? = null,
    val current: AttendanceCurrentDto? = null,
    val misChecadas: List<AttendanceEventDto> = emptyList(),
    val personas: List<AttendancePersona> = emptyList(),
    val gpsActivo: Boolean = false,
    val equipoGps: List<GpsLocationDto> = emptyList(),
    val trayecto: List<GpsLocationDto> = emptyList(),
    val trayectoCargando: Boolean = false,
    /** Mi falta justificada del día que se ve (si no checé entrada). */
    val miJustificacion: AttendanceJustificacionDto? = null,
) {
    val presentes: Int get() = personas.count { it.estado == AttendanceEstado.PRESENTE }
    val completos: Int get() = personas.count { it.estado == AttendanceEstado.COMPLETO }
    val ausentes: Int get() = personas.count { it.estado == AttendanceEstado.AUSENTE }
    val visibles: List<AttendancePersona>
        get() = filtro?.let { f -> personas.filter { it.estado == f } } ?: personas
}

// ── Fechas y formato ─────────────────────────────────────────────────────────

private val HORA_FMT: DateTimeFormatter = DateTimeFormatter.ofPattern("HH:mm:ss")
private val ISO_FECHA: DateTimeFormatter = DateTimeFormatter.ISO_LOCAL_DATE

fun hoyIso(): String = LocalDate.now().format(ISO_FECHA)

/** Tolera `...Z`, con offset y sin él: el API mezcla las tres formas. */
internal fun parseInstante(iso: String?): Instant? {
    val value = iso?.trim().orEmpty()
    if (value.isEmpty()) return null
    return runCatching { Instant.parse(value) }
        .recoverCatching { java.time.OffsetDateTime.parse(value).toInstant() }
        .recoverCatching {
            java.time.LocalDateTime.parse(value).atZone(ZoneId.systemDefault()).toInstant()
        }
        .getOrNull()
}

private fun fmtHora(iso: String?): String =
    parseInstante(iso)?.atZone(ZoneId.systemDefault())?.toLocalTime()?.format(HORA_FMT) ?: "—"

private fun pad2(n: Long): String = n.coerceAtLeast(0).toString().padStart(2, '0')

/** `0:00:00` · `1:05:09` — igual que `fmtHms` de la web. */
internal fun fmtHms(totalMs: Long): String {
    if (totalMs <= 0) return "0:00:00"
    val s = totalMs / 1000
    return "${s / 3600}:${pad2((s % 3600) / 60)}:${pad2(s % 60)}"
}

private fun transcurridoMs(inicioIso: String?, finIso: String?, ahoraMs: Long): Long {
    val inicio = parseInstante(inicioIso)?.toEpochMilli() ?: return 0
    val fin = parseInstante(finIso)?.toEpochMilli() ?: ahoraMs
    return (fin - inicio).coerceAtLeast(0)
}

private fun iniciales(nombre: String): String =
    nombre.split(" ").filter { it.isNotBlank() }.take(2)
        .mapNotNull { it.firstOrNull()?.uppercase() }.joinToString("")

private fun mapaUrl(lat: Double?, lng: Double?): String? {
    if (lat == null || lng == null) return null
    return "https://www.google.com/maps?q=${"%.6f".format(lat)},${"%.6f".format(lng)}"
}

private fun ultimaPorTipo(
    eventos: List<AttendanceEventDto>?,
    tipo: String,
): AttendanceEventDto? =
    eventos?.filter { it.type.equals(tipo, ignoreCase = true) }?.maxByOrNull { it.timestamp }

// ── Mapeo (espejo de `mapped` en la web) ─────────────────────────────────────

internal fun mapPersonas(
    usuarios: List<AttendanceRangeUserDto>,
    fecha: String,
    yoId: Long?,
): List<AttendancePersona> = usuarios
    .map { raw ->
        val entrada = ultimaPorTipo(raw.attendances, "entrada")
        val salida = ultimaPorTipo(raw.attendances, "salida")
        val dia = raw.days?.firstOrNull { it.date == fecha || it.date.startsWith(fecha) }
        val justificacion = FaltasJustificadas.delDia(raw.justificaciones, fecha)
        val estado = when {
            dia?.isOpen == true -> AttendanceEstado.PRESENTE
            entrada != null && salida != null -> AttendanceEstado.COMPLETO
            entrada != null -> AttendanceEstado.PRESENTE
            justificacion != null -> AttendanceEstado.JUSTIFICADA
            else -> AttendanceEstado.AUSENTE
        }
        val fotoEntrada = raw.attendances
            ?.lastOrNull { it.type.equals("entrada", true) && !it.photoUrl.isNullOrBlank() }?.photoUrl
        val fotoSalida = raw.attendances
            ?.lastOrNull { it.type.equals("salida", true) && !it.photoUrl.isNullOrBlank() }?.photoUrl
        AttendancePersona(
            userId = raw.userId,
            nombre = raw.userName?.trim()?.takeIf { it.isNotEmpty() }
                ?: raw.email?.takeIf { it.isNotBlank() }
                ?: "Usuario #${raw.userId}",
            subtitulo = listOfNotNull(
                raw.roleName?.takeIf { it.isNotBlank() },
                raw.department?.takeIf { it.isNotBlank() },
            ).joinToString(" · ").ifBlank { "—" },
            estado = estado,
            entradaIso = entrada?.timestamp,
            salidaIso = salida?.timestamp,
            fotoEntrada = fotoEntrada,
            fotoSalida = fotoSalida,
            mapaEntrada = mapaUrl(
                attendanceCoord(entrada?.entryLatitude),
                attendanceCoord(entrada?.entryLongitude),
            ),
            mapaSalida = mapaUrl(
                attendanceCoord(salida?.exitLatitude),
                attendanceCoord(salida?.exitLongitude),
            ),
            justificacion = justificacion.takeIf { estado == AttendanceEstado.JUSTIFICADA },
            avisosEntrada = AttendanceBadges.de(entrada),
            avisosSalida = AttendanceBadges.de(salida),
            correcciones = raw.attendances.orEmpty().flatMap { it.correcciones.orEmpty() },
        )
    }
    .sortedWith(
        compareBy<AttendancePersona> { if (yoId != null && it.userId == yoId) 0 else 1 }
            .thenBy { it.estado.ordinal }
            .thenBy { it.nombre.lowercase() },
    )

// ── ViewModel ────────────────────────────────────────────────────────────────

class ConsoleAttendanceViewModel(app: Application) : AndroidViewModel(app) {
    private val repo = ConsoleRepository(app.applicationContext)
    private val sesion: SessionUser? = AuthRepository(app.applicationContext).loadSession()

    val viewMode: AttendanceViewMode = attendanceViewMode(sesion)
    val puedeVerTrayectoria: Boolean = attendanceCanSeeTrajectory(sesion)
    /** «Justificar falta»: solo Christian. */
    val puedeJustificar: Boolean = FaltasJustificadas.puedeJustificar(sesion?.email)
    private val scope: String? = attendanceScopeParam(sesion)

    private val _state = MutableStateFlow(AttendanceUiState())
    val state: StateFlow<AttendanceUiState> = _state

    init {
        refresh(initial = true)
        reanudarGpsSiJornadaAbierta()
    }

    fun setFecha(fecha: String) {
        if (fecha == _state.value.fecha) return
        _state.update { it.copy(fecha = fecha) }
        refresh(initial = true)
    }

    fun setFiltro(estado: AttendanceEstado?) = _state.update { it.copy(filtro = estado) }

    fun clearMessage() = _state.update { it.copy(checkInMessage = null) }

    fun clearBloqueo() = _state.update { it.copy(checkInBloqueo = null) }

    fun refresh(initial: Boolean = true) {
        val fecha = _state.value.fecha
        _state.update {
            it.copy(
                isLoading = initial && it.personas.isEmpty() && it.current == null,
                isRefreshing = !initial,
                error = if (initial) null else it.error,
            )
        }
        viewModelScope.launch {
            var fallo: String? = null
            val current = runCatching { withContext(Dispatchers.IO) { repo.attendanceCurrent() } }.getOrNull()
            val historial = runCatching {
                withContext(Dispatchers.IO) { repo.attendanceHistory(fecha) }
            }.getOrDefault(emptyList())
            // Sin entrada ese día puede haber una falta justificada: solo entonces se pregunta.
            val miJustificacion = if (
                viewMode.canRegisterSelf && historial.none { it.type.equals("entrada", true) }
            ) {
                runCatching {
                    withContext(Dispatchers.IO) { repo.myAttendanceJustifications(from = fecha, to = fecha) }
                }.onFailure { if (it is CancellationException) throw it }
                    .getOrNull()
                    ?.let { FaltasJustificadas.delDia(it, fecha) }
            } else {
                null
            }

            val personas = if (viewMode.canManageTeam) {
                try {
                    val rango = withContext(Dispatchers.IO) {
                        repo.attendanceRange(from = fecha, to = fecha, scope = scope)
                    }
                    mapPersonas(rango.users.orEmpty(), fecha, sesion?.id)
                } catch (e: CancellationException) {
                    throw e
                } catch (e: Exception) {
                    fallo = e.toUserMessage("No se pudo cargar el equipo")
                    emptyList()
                }
            } else {
                emptyList()
            }

            _state.update {
                it.copy(
                    isLoading = false,
                    isRefreshing = false,
                    current = current,
                    misChecadas = historial,
                    personas = personas,
                    error = fallo,
                    gpsActivo = JornadaGps.isRunning(),
                    miJustificacion = miJustificacion,
                )
            }
        }
    }

    /**
     * Solo Christian: marca el día (el que se está viendo) como «Falta justificada».
     * Lanza el error del servidor para que el diálogo lo muestre; al guardar, recarga.
     */
    suspend fun justificarFalta(userId: Long, motivo: String) {
        val fecha = _state.value.fecha
        withContext(Dispatchers.IO) {
            repo.justificarFalta(userId = userId, fecha = fecha, motivo = FaltasJustificadas.motivoLimpio(motivo))
        }
        refresh(initial = false)
    }

    fun cargarTrayectoria() {
        if (!puedeVerTrayectoria) return
        val fecha = _state.value.fecha
        _state.update { it.copy(trayectoCargando = true, error = null) }
        viewModelScope.launch {
            var fallo: String? = null
            val equipo = runCatching { withContext(Dispatchers.IO) { repo.gpsTeam() } }
                .onFailure { if (it is CancellationException) throw it }
                .getOrDefault(emptyList())
            val puntos = try {
                withContext(Dispatchers.IO) { repo.gpsTrajectory(date = fecha) }
            } catch (e: CancellationException) {
                throw e
            } catch (e: Exception) {
                fallo = e.toUserMessage("No se pudo cargar trayectoria")
                emptyList()
            }
            _state.update {
                it.copy(trayectoCargando = false, equipoGps = equipo, trayecto = puntos, error = fallo)
            }
        }
    }

    /**
     * Registra la checada y, en la entrada, enciende el GPS de jornada: consent
     * en el API + servicio en primer plano. En la salida se apagan los dos.
     */
    fun checkIn(type: String, photoBase64: String) {
        _state.update { it.copy(checkInLoading = true, checkInMessage = null) }
        viewModelScope.launch {
            try {
                val coords = withContext(Dispatchers.IO) {
                    DeviceLocation.current(getApplication())
                }
                val res = withContext(Dispatchers.IO) {
                    repo.attendanceCheckIn(
                        type,
                        lat = coords?.lat,
                        lng = coords?.lng,
                        accuracyM = coords?.accuracyM,
                        // Se manda aunque sea true: el servidor la rechaza y avisa a sus jefes.
                        mockLocation = coords?.mock == true,
                        photoBase64 = photoBase64,
                    )
                }
                val gpsNota = if (type == "entrada") encenderGps() else apagarGps()
                val base = res.message
                    ?: if (type == "entrada") "Entrada registrada" else "Salida registrada"
                val geo = AttendanceCheckIn.notaGps(
                    hayCoords = coords != null,
                    accuracyM = coords?.accuracyM,
                    mock = coords?.mock == true,
                )
                val aviso = AttendanceBadges.deRegistro(res)
                    .takeIf { it.isNotEmpty() }
                    ?.joinToString(" · ") { it.texto }
                    ?.let { " · $it" }
                    .orEmpty()
                _state.update {
                    it.copy(
                        checkInLoading = false,
                        checkInMessage = base + geo + gpsNota + aviso,
                        checkInError = false,
                        checkInBloqueo = null,
                        gpsActivo = JornadaGps.isRunning(),
                    )
                }
                refresh(initial = false)
            } catch (e: CancellationException) {
                throw e
            } catch (e: Exception) {
                val mensaje = e.toUserMessage("Error al registrar")
                val code = (e as? retrofit2.HttpException)?.code()
                val mock = AttendanceCheckIn.esUbicacionSimulada(code, mensaje)
                _state.update {
                    it.copy(
                        checkInLoading = false,
                        // El 422 de ubicación simulada se ve en un diálogo, no en una línea gris.
                        checkInMessage = if (mock) null else mensaje,
                        checkInError = !mock,
                        checkInBloqueo = if (mock) {
                            mensaje.takeIf { m -> m.isNotBlank() } ?: AttendanceCheckIn.MOCK_MENSAJE
                        } else {
                            null
                        },
                    )
                }
            }
        }
    }

    private suspend fun encenderGps(): String {
        val app = getApplication<Application>()
        if (!JornadaGps.canTrack(app)) return " · sin permiso de ubicación: no se comparte el trayecto"
        runCatching { withContext(Dispatchers.IO) { repo.gpsUpdateConsent(true) } }
        JornadaGps.start(app)
        return " · compartiendo ubicación de jornada"
    }

    private suspend fun apagarGps(): String {
        val app = getApplication<Application>()
        JornadaGps.stop(app)
        runCatching { withContext(Dispatchers.IO) { repo.gpsUpdateConsent(false) } }
        return " · se dejó de compartir tu ubicación"
    }

    /** Si el día quedó abierto y el consentimiento sigue puesto, el rastreo vuelve solo. */
    private fun reanudarGpsSiJornadaAbierta() {
        val app = getApplication<Application>()
        if (!JornadaGps.canTrack(app) || JornadaGps.isRunning()) return
        viewModelScope.launch {
            val abierta = runCatching {
                withContext(Dispatchers.IO) { repo.attendanceCurrent() }
            }.getOrNull()?.isOpen == true
            if (!abierta) return@launch
            val consiente = runCatching {
                withContext(Dispatchers.IO) { repo.gpsMe() }
            }.getOrNull()?.consent == true
            if (!consiente) return@launch
            JornadaGps.start(app)
            _state.update { it.copy(gpsActivo = true) }
        }
    }

    fun detenerGpsManual() {
        val app = getApplication<Application>()
        viewModelScope.launch {
            apagarGps()
            _state.update { it.copy(gpsActivo = false) }
        }
        JornadaGps.stop(app)
    }
}

// ── Pantalla ─────────────────────────────────────────────────────────────────

private const val TAB_EQUIPO = "equipo"
private const val TAB_COMIDAS = "comidas"
private const val TAB_TRAYECTORIA = "trayectoria"

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ConsoleAttendanceScreen(
    contentPadding: PaddingValues = PaddingValues(16.dp),
    /** `comidas` abre la pestaña de hora de comida (/erp/asistencias?tab=comidas). */
    initialTab: String? = null,
) {
    val context = LocalContext.current
    val vm: ConsoleAttendanceViewModel = viewModel()
    val state by vm.state.collectAsState()

    var tab by remember { mutableStateOf(if (initialTab == TAB_COMIDAS) TAB_COMIDAS else TAB_EQUIPO) }
    LaunchedEffect(initialTab) {
        if (initialTab == TAB_COMIDAS) tab = TAB_COMIDAS
    }

    val pestanas = buildList {
        // Quien no ve equipo solo tiene su jornada en esta pestaña: se llama como lo que muestra.
        add(TAB_EQUIPO to if (vm.viewMode.canManageTeam) "Equipo del día" else "Mi jornada")
        add(TAB_COMIDAS to "Comidas")
        if (vm.puedeVerTrayectoria) add(TAB_TRAYECTORIA to "Trayectoria")
    }
    val indice = pestanas.indexOfFirst { it.first == tab }.coerceAtLeast(0)

    // Refresco en vivo: cada 15 s mientras la pestaña está a la vista.
    LaunchedEffect(tab, state.fecha) {
        if (tab != TAB_EQUIPO) return@LaunchedEffect
        while (true) {
            delay(15_000)
            vm.refresh(initial = false)
        }
    }
    // …y al volver a la app, sin esperar al siguiente tic.
    val lifecycleOwner = LocalLifecycleOwner.current
    DisposableEffect(lifecycleOwner, tab) {
        val observer = LifecycleEventObserver { _, event ->
            if (event == Lifecycle.Event.ON_RESUME && tab == TAB_EQUIPO) vm.refresh(initial = false)
        }
        lifecycleOwner.lifecycle.addObserver(observer)
        onDispose { lifecycleOwner.lifecycle.removeObserver(observer) }
    }
    LaunchedEffect(tab, state.fecha) {
        if (tab == TAB_TRAYECTORIA) vm.cargarTrayectoria()
    }

    Column(Modifier.fillMaxSize().background(NxColors.Surface)) {
        SelectorFecha(
            fecha = state.fecha,
            onFecha = vm::setFecha,
            modifier = Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 10.dp),
        )

        TabRow(selectedTabIndex = indice) {
            pestanas.forEach { (key, label) ->
                Tab(
                    selected = tab == key,
                    onClick = { tab = key },
                    text = { Text(label) },
                )
            }
        }

        when (tab) {
            TAB_COMIDAS -> mx.nexara.mobile.nativeapp.ui.console.comidas.ComidasPanel(
                modifier = Modifier.weight(1f).fillMaxWidth(),
                fecha = state.fecha,
            )

            TAB_TRAYECTORIA -> TrayectoriaTab(
                state = state,
                modifier = Modifier.weight(1f).fillMaxWidth(),
                contentPadding = contentPadding,
                onAbrir = { url -> openExternalUrl(context, url) },
            )

            else -> PullToRefreshBox(
                isRefreshing = state.isRefreshing,
                onRefresh = { vm.refresh(initial = false) },
                modifier = Modifier.weight(1f).fillMaxWidth(),
            ) {
                EquipoTab(
                    vm = vm,
                    state = state,
                    contentPadding = contentPadding,
                    onAbrir = { url -> openExternalUrl(context, url) },
                )
            }
        }
    }

    state.checkInBloqueo?.let { mensaje ->
        UbicacionSimuladaDialog(mensaje = mensaje, onDismiss = vm::clearBloqueo)
    }
}

/**
 * 422 del servidor: la checada no se registró porque el teléfono traía GPS
 * falso. Se dice completo y en un diálogo — es lo único que importa en ese
 * momento — con lo que hay que hacer para poder checar.
 */
@Composable
private fun UbicacionSimuladaDialog(mensaje: String, onDismiss: () -> Unit) {
    AlertDialog(
        onDismissRequest = onDismiss,
        icon = {
            Icon(
                Icons.Outlined.ErrorOutline,
                contentDescription = null,
                tint = NxColors.Danger,
                modifier = Modifier.size(28.dp),
            )
        },
        title = { Text("No se pudo checar", fontWeight = FontWeight.Bold) },
        text = {
            Column(
                Modifier.verticalScroll(rememberScrollState()),
                verticalArrangement = Arrangement.spacedBy(8.dp),
            ) {
                Text(mensaje, fontSize = 14.sp, color = NxColors.Slate, fontWeight = FontWeight.SemiBold)
                Text(AttendanceCheckIn.MOCK_AYUDA, fontSize = 13.sp, color = NxColors.Muted)
            }
        },
        confirmButton = {
            Button(
                onClick = onDismiss,
                colors = ButtonDefaults.buttonColors(containerColor = NxColors.Brand),
            ) { Text("Entendido") }
        },
    )
}

// ── Selector de día ──────────────────────────────────────────────────────────

private val DIA_FMT: DateTimeFormatter = DateTimeFormatter.ofPattern("EEEE d 'de' MMMM", Locale.forLanguageTag("es-MX"))

/** «Hoy, jueves 17 de septiembre» · «Lunes 14 de septiembre». */
internal fun etiquetaDia(fecha: String, esHoy: Boolean): String {
    val dia = runCatching { LocalDate.parse(fecha, ISO_FECHA).format(DIA_FMT) }.getOrDefault(fecha)
    return if (esHoy) "Hoy, $dia" else dia.replaceFirstChar { it.uppercase() }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun SelectorFecha(
    fecha: String,
    onFecha: (String) -> Unit,
    modifier: Modifier = Modifier,
) {
    var abierto by remember { mutableStateOf(false) }
    val hoy = remember { LocalDate.now() }
    val esHoy = fecha == hoy.format(ISO_FECHA)

    // Sin título repetido: la barra ya dice «Asistencias». Solo el día que se está viendo.
    Row(
        modifier = modifier,
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        OutlinedButton(
            onClick = { abierto = true },
            modifier = Modifier.heightIn(min = 48.dp),
        ) {
            Icon(NxIcons.Calendar, contentDescription = null, modifier = Modifier.size(18.dp))
            Spacer(Modifier.width(8.dp))
            Text(etiquetaDia(fecha, esHoy), fontSize = 14.sp, fontWeight = FontWeight.SemiBold)
        }
        Spacer(Modifier.weight(1f))
        if (!esHoy) {
            TextButton(
                onClick = { onFecha(hoy.format(ISO_FECHA)) },
                modifier = Modifier.heightIn(min = 48.dp),
            ) { Text("Ir a hoy") }
        }
    }

    if (abierto) {
        val hoyUtc = hoy.toEpochDay() * 86_400_000L
        val inicial = runCatching { LocalDate.parse(fecha, ISO_FECHA) }.getOrDefault(hoy)
        val estado = rememberDatePickerState(
            initialSelectedDateMillis = inicial.toEpochDay() * 86_400_000L,
            selectableDates = object : SelectableDates {
                // No hay asistencia del futuro: el máximo es hoy, como en la web.
                override fun isSelectableDate(utcTimeMillis: Long) = utcTimeMillis <= hoyUtc
                override fun isSelectableYear(year: Int) = year <= hoy.year
            },
        )
        DatePickerDialog(
            onDismissRequest = { abierto = false },
            confirmButton = {
                TextButton(onClick = {
                    estado.selectedDateMillis?.let { millis ->
                        onFecha(LocalDate.ofEpochDay(millis / 86_400_000L).format(ISO_FECHA))
                    }
                    abierto = false
                }) { Text("Aceptar") }
            },
            dismissButton = {
                TextButton(onClick = { abierto = false }) { Text("Cancelar") }
            },
        ) {
            DatePicker(state = estado)
        }
    }
}

// ── Pestaña «Equipo del día» ─────────────────────────────────────────────────

@Composable
private fun EquipoTab(
    vm: ConsoleAttendanceViewModel,
    state: AttendanceUiState,
    contentPadding: PaddingValues,
    onAbrir: (String) -> Unit,
) {
    val esHoy = state.fecha == hoyIso()
    var ahoraMs by remember { mutableLongStateOf(System.currentTimeMillis()) }
    /** Persona a la que Christian le está justificando la falta. */
    var justificando by remember { mutableStateOf<AttendancePersona?>(null) }
    val hayJornadaAbierta = state.presentes > 0 || state.current?.isOpen == true
    LaunchedEffect(hayJornadaAbierta) {
        while (hayJornadaAbierta) {
            ahoraMs = System.currentTimeMillis()
            delay(1_000)
        }
    }

    LazyColumn(
        modifier = Modifier.fillMaxSize(),
        contentPadding = contentPadding,
        verticalArrangement = Arrangement.spacedBy(14.dp),
    ) {
        state.error?.let { msg ->
            item {
                Row(
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(8.dp),
                ) {
                    Text(msg, fontSize = 13.sp, color = NxColors.Danger, modifier = Modifier.weight(1f))
                    OutlinedButton(onClick = { vm.refresh() }) { Text("Reintentar") }
                }
            }
        }

        if (vm.viewMode.canRegisterSelf) {
            item {
                LocationPermissionBanner(
                    message = "La asistencia registra tu GPS al marcar entrada o salida.",
                    requestOnAppear = true,
                )
            }
            item { MiJornadaCard(vm = vm, state = state, esHoy = esHoy, ahoraMs = ahoraMs) }
            if (state.gpsActivo) {
                item { GpsJornadaAviso(onDetener = vm::detenerGpsManual) }
            }
        }

        if (!vm.viewMode.canManageTeam) {
            if (!vm.viewMode.canRegisterSelf) {
                item {
                    NxEmptyState(
                        title = "Vista de equipo",
                        subtitle = "Disponible para dirección, RRHH y coordinadores.",
                    )
                }
            }
            item { Spacer(Modifier.height(24.dp)) }
            return@LazyColumn
        }

        if (state.isLoading) {
            item { NxLoadingBlock("Cargando asistencia…") }
            return@LazyColumn
        }

        // Una sola fila de filtros con conteo (antes: tarjetas KPI y chips que hacían lo mismo).
        item {
            Row(
                modifier = Modifier.fillMaxWidth().horizontalScroll(rememberScrollState()),
                horizontalArrangement = Arrangement.spacedBy(8.dp),
            ) {
                ChipEstado("Todos", state.personas.size, null, state.filtro == null) { vm.setFiltro(null) }
                AttendanceEstado.entries.forEach { estado ->
                    val n = state.personas.count { it.estado == estado }
                    ChipEstado(estado.etiqueta, n, estado.color, state.filtro == estado) {
                        // Tocar el filtro activo vuelve a «Todos».
                        vm.setFiltro(if (state.filtro == estado) null else estado)
                    }
                }
            }
        }

        if (state.visibles.isEmpty()) {
            item {
                if (state.personas.isEmpty()) {
                    NxEmptyState(
                        title = "Sin registros",
                        subtitle = "Nadie en tu alcance para ${etiquetaDia(state.fecha, esHoy).replaceFirstChar { it.lowercase() }}.",
                    )
                } else {
                    NxEmptyState(
                        title = "Nadie en este filtro",
                        subtitle = "Nadie de tu equipo está en «${state.filtro?.etiqueta.orEmpty()}».",
                        actionLabel = "Ver a todos",
                        onAction = { vm.setFiltro(null) },
                    )
                }
            }
        }

        items(state.visibles, key = { "asis-${it.userId}" }) { persona ->
            PersonaCard(
                persona = persona,
                ahoraMs = ahoraMs,
                onAbrir = onAbrir,
                // Solo Christian, en un día sin entrada que no sea futuro.
                onJustificar = if (
                    FaltasJustificadas.ofrecerJustificar(
                        puede = vm.puedeJustificar,
                        hayEntrada = persona.entradaIso != null,
                        yaJustificada = persona.justificacion != null,
                        fecha = state.fecha,
                        hoy = hoyIso(),
                    ) && persona.estado == AttendanceEstado.AUSENTE
                ) {
                    { justificando = persona }
                } else {
                    null
                },
            )
        }

        item { Spacer(Modifier.height(24.dp)) }
    }

    justificando?.let { persona ->
        JustificarFaltaDialog(
            nombre = persona.nombre,
            dia = etiquetaDia(state.fecha, esHoy),
            onDismiss = { justificando = null },
            onConfirm = { motivo ->
                vm.justificarFalta(persona.userId, motivo)
                justificando = null
            },
        )
    }
}

@Composable
private fun JustificarFaltaDialog(
    nombre: String,
    dia: String,
    onDismiss: () -> Unit,
    onConfirm: suspend (String) -> Unit,
) {
    val scope = rememberCoroutineScope()
    var motivo by remember { mutableStateOf("") }
    var saving by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf<String?>(null) }
    val ok = FaltasJustificadas.motivoOk(motivo)
    val min = FaltasJustificadas.MOTIVO_MINIMO

    AlertDialog(
        onDismissRequest = { if (!saving) onDismiss() },
        title = { Text("Justificar falta", fontWeight = FontWeight.Bold) },
        text = {
            Column(
                Modifier.verticalScroll(rememberScrollState()),
                verticalArrangement = Arrangement.spacedBy(8.dp),
            ) {
                Text(
                    "$nombre · ${dia.replaceFirstChar { it.lowercase() }}. El día quedará como «Falta justificada» " +
                        "con tu motivo; no se crea ninguna checada.",
                    fontSize = 13.sp,
                    color = NxColors.Muted,
                )
                OutlinedTextField(
                    value = motivo,
                    onValueChange = { motivo = it.take(1000) },
                    label = { Text("Motivo *") },
                    placeholder = { Text("Ej. Incapacidad del IMSS por tres días.") },
                    minLines = 3,
                    enabled = !saving,
                    modifier = Modifier.fillMaxWidth(),
                )
                Text(
                    "${FaltasJustificadas.motivoLimpio(motivo).length}/$min caracteres mínimo",
                    fontSize = 11.5.sp,
                    color = if (ok) NxColors.Muted else NxColors.Danger,
                )
                error?.let { Text(it, fontSize = 13.sp, color = NxColors.Danger) }
            }
        },
        confirmButton = {
            Button(
                onClick = {
                    scope.launch {
                        saving = true
                        error = null
                        try {
                            onConfirm(motivo)
                        } catch (e: CancellationException) {
                            throw e
                        } catch (e: Exception) {
                            error = e.toUserMessage("No se pudo justificar la falta")
                        } finally {
                            saving = false
                        }
                    }
                },
                enabled = ok && !saving,
                colors = ButtonDefaults.buttonColors(containerColor = AttendanceEstado.JUSTIFICADA.color),
            ) { Text(if (saving) "Guardando…" else "Justificar falta") }
        },
        dismissButton = {
            TextButton(onClick = onDismiss, enabled = !saving) { Text("Cancelar") }
        },
    )
}

/** «Falta justificada · motivo», con quién la justificó. */
@Composable
private fun FaltaJustificadaNota(j: AttendanceJustificacionDto, modifier: Modifier = Modifier) {
    val color = AttendanceEstado.JUSTIFICADA.color
    Column(
        modifier = modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(12.dp))
            .background(color.copy(alpha = 0.08f))
            .padding(horizontal = 12.dp, vertical = 10.dp),
        verticalArrangement = Arrangement.spacedBy(2.dp),
    ) {
        Text(FaltasJustificadas.texto(j), fontSize = 13.5.sp, fontWeight = FontWeight.SemiBold, color = color)
        FaltasJustificadas.quien(j)?.let { Text(it, fontSize = 11.5.sp, color = NxColors.Muted) }
    }
}

@Composable
private fun MiJornadaCard(
    vm: ConsoleAttendanceViewModel,
    state: AttendanceUiState,
    esHoy: Boolean,
    ahoraMs: Long,
) {
    val context = LocalContext.current
    // Sobrevive a que Android recree la actividad mientras la cámara está abierta.
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
    val hayEntrada = state.misChecadas.any { it.type.equals("entrada", true) }
    val haySalida = state.misChecadas.any { it.type.equals("salida", true) }
    // El API contesta 400 a la segunda entrada del día: aquí se apaga antes.
    val puedeEntrada = esHoy && !hayEntrada && !abierta
    val puedeSalida = esHoy && abierta
    val inicioIso = state.current?.lastEntryAt
        ?: state.misChecadas.filter { it.type.equals("entrada", true) }.maxByOrNull { it.timestamp }?.timestamp

    Card(
        modifier = Modifier.fillMaxWidth(),
        shape = RoundedCornerShape(20.dp),
        colors = CardDefaults.cardColors(
            containerColor = if (abierta) NxColors.SuccessSoft else Color(0xFFF8FAFC),
        ),
        elevation = CardDefaults.cardElevation(2.dp),
    ) {
        Column(
            modifier = Modifier.padding(20.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.spacedBy(8.dp),
        ) {
            Text(
                "MI JORNADA",
                fontSize = 11.sp,
                fontWeight = FontWeight.Bold,
                color = NxColors.Muted,
            )
            Box(
                modifier = Modifier.size(72.dp).clip(CircleShape)
                    .background(if (abierta) AttendanceEstado.PRESENTE.color else Color(0xFFE2E8F0)),
                contentAlignment = Alignment.Center,
            ) {
                Icon(
                    imageVector = if (abierta) NxGlyph.APPROVED.icon else Icons.Outlined.Schedule,
                    contentDescription = null,
                    tint = if (abierta) Color.White else NxColors.Muted,
                    modifier = Modifier.size(32.dp),
                )
            }
            // Sin entrada pero justificada: no es «sin entrada registrada».
            val miFalta = state.miJustificacion?.takeIf { !abierta && !hayEntrada }
            Text(
                when {
                    abierta -> "Jornada en curso"
                    haySalida && hayEntrada -> "Jornada completada"
                    miFalta != null -> FaltasJustificadas.ETIQUETA
                    else -> "Sin entrada registrada"
                },
                fontSize = 16.sp,
                fontWeight = FontWeight.SemiBold,
                color = when {
                    abierta -> AttendanceEstado.PRESENTE.color
                    miFalta != null -> AttendanceEstado.JUSTIFICADA.color
                    else -> NxColors.Slate
                },
            )
            miFalta?.let { FaltaJustificadaNota(it) }
            if (abierta && inicioIso != null) {
                Text(
                    fmtHms(transcurridoMs(inicioIso, null, ahoraMs)),
                    fontSize = 26.sp,
                    fontWeight = FontWeight.ExtraBold,
                    color = AttendanceEstado.PRESENTE.color,
                )
                Text("Desde las ${fmtHora(inicioIso)}", fontSize = 12.sp, color = NxColors.Muted)
            }

            if (!esHoy) {
                Text(
                    "Estás viendo el ${state.fecha}: solo se puede checar en el día de hoy.",
                    fontSize = 12.sp,
                    color = NxColors.Muted,
                    textAlign = TextAlign.Center,
                )
            }

            // Un solo botón con el siguiente paso; la cámara se abre directo (sin botonera intermedia).
            val siguiente = when {
                puedeEntrada -> "entrada"
                puedeSalida -> "salida"
                else -> null
            }
            if (siguiente != null || state.checkInLoading) {
                Button(
                    onClick = {
                        pendiente = siguiente
                        tomarFoto()
                    },
                    enabled = siguiente != null && !state.checkInLoading,
                    modifier = Modifier.fillMaxWidth().heightIn(min = 52.dp),
                    colors = ButtonDefaults.buttonColors(containerColor = NxColors.Brand),
                    shape = RoundedCornerShape(12.dp),
                ) {
                    if (state.checkInLoading) {
                        CircularProgressIndicator(
                            modifier = Modifier.size(18.dp),
                            strokeWidth = 2.dp,
                            color = NxColors.Brand,
                        )
                        Spacer(Modifier.width(8.dp))
                        Text("Registrando…", fontWeight = FontWeight.Bold)
                    } else {
                        Icon(
                            if (siguiente == "salida") NxGlyph.EXIT.icon else NxGlyph.ENTRY.icon,
                            contentDescription = null,
                            modifier = Modifier.size(20.dp),
                        )
                        Spacer(Modifier.width(8.dp))
                        Text(
                            if (siguiente == "salida") "Registrar salida" else "Registrar entrada",
                            fontWeight = FontWeight.Bold,
                            fontSize = 16.sp,
                        )
                    }
                }
                if (!state.checkInLoading) {
                    Text(
                        "Se toma una foto y tu ubicación.",
                        fontSize = 12.sp,
                        color = NxColors.Muted,
                    )
                }
            } else if (esHoy && hayEntrada && !haySalida) {
                Text("Ya registraste tu entrada de hoy.", fontSize = 12.sp, color = NxColors.Muted)
            }

            state.checkInMessage?.takeIf { it.isNotBlank() }?.let { msg ->
                Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.Center) {
                    NxIconText(
                        text = msg,
                        icon = if (state.checkInError) Icons.Outlined.ErrorOutline else NxGlyph.APPROVED.icon,
                        fontSize = 12.sp,
                        color = if (state.checkInError) NxColors.Danger else AttendanceEstado.PRESENTE.color,
                    )
                }
            }

            if (state.misChecadas.isNotEmpty()) {
                HorizontalDivider()
                Text(
                    "Checadas del ${state.fecha}",
                    fontSize = 12.sp,
                    fontWeight = FontWeight.SemiBold,
                    color = NxColors.Slate,
                )
                state.misChecadas.sortedBy { it.timestamp }.forEach { ev ->
                    Row(
                        Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.SpaceBetween,
                    ) {
                        NxIconText(
                            text = if (ev.type.equals("entrada", true)) "Entrada" else "Salida",
                            icon = if (ev.type.equals("entrada", true)) NxGlyph.ENTRY.icon else NxGlyph.EXIT.icon,
                            fontSize = 12.5.sp,
                            color = NxColors.Slate,
                        )
                        Text(fmtHora(ev.timestamp), fontSize = 12.5.sp, color = NxColors.Muted)
                    }
                    val avisos = AttendanceBadges.de(ev)
                    if (avisos.isNotEmpty()) AvisosChecada(avisos)
                    ev.correcciones.orEmpty().forEach { c ->
                        Text(
                            AttendanceBadges.correccionTexto(c),
                            fontSize = 11.5.sp,
                            color = Color(AttendanceBadges.MORADO),
                        )
                    }
                }
            }
        }
    }
}

/**
 * Rastreo activo: se dice en pantalla, no solo en la notificación. El servicio en
 * primer plano sigue enviando la ubicación con la pantalla apagada, sin pedir «todo el tiempo».
 */
@Composable
private fun GpsJornadaAviso(onDetener: () -> Unit) {
    Card(
        modifier = Modifier.fillMaxWidth(),
        colors = CardDefaults.cardColors(containerColor = NxColors.InfoSoft),
        shape = RoundedCornerShape(14.dp),
    ) {
        Column(Modifier.padding(14.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
            NxIconText(
                text = "Jornada en curso · compartiendo ubicación",
                icon = Icons.Outlined.GpsFixed,
                fontSize = 13.5.sp,
                fontWeight = FontWeight.SemiBold,
                color = NxColors.Slate,
            )
            Text(
                "Tu ubicación se envía cada pocos minutos para dibujar el trayecto del día. " +
                    "Se apaga sola al registrar tu salida.",
                fontSize = 12.sp,
                color = NxColors.Muted,
            )
            TextButton(onClick = onDetener) { Text("Dejar de compartir", fontSize = 13.sp) }
        }
    }
}

@Composable
private fun PersonaCard(
    persona: AttendancePersona,
    ahoraMs: Long,
    onAbrir: (String) -> Unit,
    /** «Justificar falta» (solo Christian, día sin entrada). */
    onJustificar: (() -> Unit)? = null,
) {
    Card(
        modifier = Modifier.fillMaxWidth(),
        shape = RoundedCornerShape(16.dp),
        colors = CardDefaults.cardColors(containerColor = NxColors.Card),
        elevation = CardDefaults.cardElevation(2.dp),
    ) {
        Column(Modifier.padding(14.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                Box(
                    modifier = Modifier.size(44.dp).clip(CircleShape).background(NxColors.BrandSoft),
                    contentAlignment = Alignment.Center,
                ) {
                    Text(
                        iniciales(persona.nombre),
                        fontSize = 13.sp,
                        fontWeight = FontWeight.Bold,
                        color = NxColors.Brand,
                    )
                }
                Column(Modifier.weight(1f)) {
                    Text(
                        persona.nombre,
                        fontSize = 14.sp,
                        fontWeight = FontWeight.Bold,
                        color = NxColors.Slate,
                        maxLines = 1,
                    )
                    Text(persona.subtitulo, fontSize = 11.5.sp, color = NxColors.Muted, maxLines = 1)
                }
                Box(
                    modifier = Modifier
                        .clip(RoundedCornerShape(999.dp))
                        .background(persona.estado.color.copy(alpha = 0.12f))
                        .padding(horizontal = 9.dp, vertical = 4.dp),
                ) {
                    Text(
                        persona.estado.etiqueta,
                        fontSize = 11.sp,
                        fontWeight = FontWeight.Bold,
                        color = persona.estado.color,
                    )
                }
            }

            val justificacion = persona.justificacion
            if (persona.estado == AttendanceEstado.JUSTIFICADA && justificacion != null) {
                // Ni «sin checada» ni horas en cero: el día está justificado.
                FaltaJustificadaNota(justificacion)
            } else {
                Row(
                    modifier = Modifier.fillMaxWidth()
                        .clip(RoundedCornerShape(12.dp))
                        .background(Color(0xFFF8FAFC))
                        .padding(horizontal = 12.dp, vertical = 10.dp),
                    horizontalArrangement = Arrangement.spacedBy(10.dp),
                ) {
                    Column(Modifier.weight(1f)) {
                        Text("ENTRADA", fontSize = 10.sp, fontWeight = FontWeight.SemiBold, color = NxColors.Muted)
                        Text(fmtHora(persona.entradaIso), fontSize = 15.sp, fontWeight = FontWeight.Bold, color = NxColors.Slate)
                    }
                    Column(Modifier.weight(1f)) {
                        Text("SALIDA", fontSize = 10.sp, fontWeight = FontWeight.SemiBold, color = NxColors.Muted)
                        Text(fmtHora(persona.salidaIso), fontSize = 15.sp, fontWeight = FontWeight.Bold, color = NxColors.Slate)
                    }
                    Column(horizontalAlignment = Alignment.End) {
                        Text(
                            if (persona.estado == AttendanceEstado.PRESENTE) "EN VIVO" else "JORNADA",
                            fontSize = 10.sp,
                            fontWeight = FontWeight.SemiBold,
                            color = NxColors.Muted,
                        )
                        Text(
                            if (persona.estado == AttendanceEstado.AUSENTE) {
                                "—"
                            } else {
                                fmtHms(
                                    transcurridoMs(
                                        persona.entradaIso,
                                        if (persona.estado == AttendanceEstado.PRESENTE) null else persona.salidaIso,
                                        ahoraMs,
                                    ),
                                )
                            },
                            fontSize = 15.sp,
                            fontWeight = FontWeight.ExtraBold,
                            color = persona.estado.color,
                        )
                    }
                }
            }

            val avisos = (persona.avisosEntrada + persona.avisosSalida).distinctBy { it.texto }
            if (avisos.isNotEmpty()) {
                AvisosChecada(avisos)
            }
            persona.correcciones.forEach { c ->
                Text(
                    AttendanceBadges.correccionTexto(c),
                    fontSize = 12.sp,
                    color = Color(AttendanceBadges.MORADO),
                )
            }

            onJustificar?.let { justificar ->
                OutlinedButton(
                    onClick = justificar,
                    colors = ButtonDefaults.outlinedButtonColors(contentColor = AttendanceEstado.JUSTIFICADA.color),
                ) { Text("Justificar falta", fontSize = 13.sp, fontWeight = FontWeight.SemiBold) }
            }

            if (persona.fotoEntrada != null || persona.fotoSalida != null) {
                Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                    persona.fotoEntrada?.let { FotoChecada("Entrada", it, NxGlyph.ENTRY.icon) }
                    persona.fotoSalida?.let { FotoChecada("Salida", it, NxGlyph.EXIT.icon) }
                }
            }

            if (persona.mapaEntrada != null || persona.mapaSalida != null) {
                Row(horizontalArrangement = Arrangement.spacedBy(4.dp)) {
                    persona.mapaEntrada?.let { url ->
                        TextButton(onClick = { onAbrir(url) }) {
                            Text("Mapa entrada", fontSize = 13.sp, fontWeight = FontWeight.SemiBold, color = NxColors.Brand)
                        }
                    }
                    persona.mapaSalida?.let { url ->
                        TextButton(onClick = { onAbrir(url) }) {
                            Text("Mapa salida", fontSize = 13.sp, fontWeight = FontWeight.SemiBold, color = NxColors.Brand)
                        }
                    }
                }
            }
        }
    }
}

/**
 * Insignias de lo que le pasó a la checada: por qué está para revisar, si se
 * capturó sin conexión, si se cerró sola o si alguien la corrigió.
 */
@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun AvisosChecada(avisos: List<AttendanceBadge>, modifier: Modifier = Modifier) {
    FlowRow(
        modifier = modifier.fillMaxWidth(),
        horizontalArrangement = Arrangement.spacedBy(6.dp),
        verticalArrangement = Arrangement.spacedBy(6.dp),
    ) {
        avisos.forEach { aviso ->
            val color = Color(aviso.color)
            Box(
                modifier = Modifier
                    .clip(RoundedCornerShape(999.dp))
                    .background(color.copy(alpha = 0.12f))
                    .padding(horizontal = 9.dp, vertical = 4.dp),
            ) {
                Text(aviso.texto, fontSize = 11.sp, fontWeight = FontWeight.SemiBold, color = color)
            }
        }
    }
}

@Composable
private fun FotoChecada(etiqueta: String, url: String, icon: ImageVector) {
    Column(horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(3.dp)) {
        ProtectedImage(
            url = url,
            contentDescription = etiqueta,
            modifier = Modifier.size(62.dp).clip(RoundedCornerShape(10.dp)),
        )
        NxIconText(text = etiqueta, icon = icon, fontSize = 10.sp, color = NxColors.Muted)
    }
}

/** Chip de filtro Material (48 dp de área táctil) con el punto de color del estado. */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun ChipEstado(
    label: String,
    count: Int,
    color: Color?,
    activo: Boolean,
    onClick: () -> Unit,
) {
    FilterChip(
        selected = activo,
        onClick = onClick,
        label = { Text("$label $count", maxLines = 1) },
        leadingIcon = color?.let { c ->
            { Box(Modifier.size(8.dp).clip(CircleShape).background(c)) }
        },
        colors = FilterChipDefaults.filterChipColors(
            containerColor = Color.White,
            selectedContainerColor = NxColors.BrandSoft,
            selectedLabelColor = NxColors.BrandDark,
            labelColor = NxColors.Slate,
        ),
    )
}

// ── Pestaña «Trayectoria» ────────────────────────────────────────────────────

@Composable
private fun TrayectoriaTab(
    state: AttendanceUiState,
    modifier: Modifier,
    contentPadding: PaddingValues,
    onAbrir: (String) -> Unit,
) {
    LazyColumn(
        modifier = modifier.fillMaxSize(),
        contentPadding = contentPadding,
        verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        if (state.trayectoCargando) {
            item { NxLoadingBlock("Cargando trayectoria…") }
            return@LazyColumn
        }

        item {
            Text(
                "GPS del equipo",
                fontSize = 16.sp,
                fontWeight = FontWeight.ExtraBold,
                color = NxColors.Slate,
            )
            Text("Unidades con jornada abierta.", fontSize = 12.sp, color = NxColors.Muted)
        }

        if (state.equipoGps.isEmpty()) {
            item { NxEmptyState(title = "Sin ubicaciones", subtitle = "Nadie comparte GPS ahora.") }
        }

        items(state.equipoGps, key = { "gps-${it.id}" }) { punto ->
            val lat = attendanceCoord(punto.latitud)
            val lng = attendanceCoord(punto.longitud)
            Card(
                modifier = Modifier.fillMaxWidth(),
                shape = RoundedCornerShape(14.dp),
                colors = CardDefaults.cardColors(containerColor = NxColors.Card),
                elevation = CardDefaults.cardElevation(1.dp),
            ) {
                Column(Modifier.padding(14.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                    Text(
                        punto.usuario?.nombre ?: "Usuario #${punto.usuarioId}",
                        fontSize = 13.5.sp,
                        fontWeight = FontWeight.Bold,
                        color = NxColors.Slate,
                    )
                    Text(
                        if (lat != null && lng != null) {
                            "${"%.5f".format(lat)}, ${"%.5f".format(lng)}"
                        } else {
                            "Sin coordenadas"
                        },
                        fontSize = 12.sp,
                        color = NxColors.Muted,
                    )
                    mapaUrl(lat, lng)?.let { url ->
                        TextButton(onClick = { onAbrir(url) }) {
                            Text("Ver en mapa", fontSize = 13.sp, fontWeight = FontWeight.SemiBold, color = NxColors.Brand)
                        }
                    }
                }
            }
        }

        item {
            Text(
                "Mi trayecto · ${state.trayecto.size} puntos",
                fontSize = 16.sp,
                fontWeight = FontWeight.ExtraBold,
                color = NxColors.Slate,
            )
            Text("Entrada, GPS y salida del ${state.fecha}.", fontSize = 12.sp, color = NxColors.Muted)
        }

        if (state.trayecto.isEmpty()) {
            item {
                NxEmptyState(
                    title = "Sin puntos",
                    subtitle = "No hay recorrido registrado para este día.",
                )
            }
        } else {
            item {
                val ruta = state.trayecto.mapNotNull { p ->
                    val lat = attendanceCoord(p.latitud)
                    val lng = attendanceCoord(p.longitud)
                    if (lat != null && lng != null) "${"%.6f".format(lat)},${"%.6f".format(lng)}" else null
                }
                if (ruta.isNotEmpty()) {
                    val muestra = if (ruta.size <= 18) ruta else {
                        val paso = (ruta.size - 1).toDouble() / 17
                        (0..17).map { ruta[Math.round(it * paso).toInt()] }
                    }
                    OutlinedButton(
                        onClick = { onAbrir("https://www.google.com/maps/dir/${muestra.joinToString("/")}") },
                    ) { Text("Ver recorrido en Maps", fontSize = 13.sp) }
                }
            }
        }

        item { Spacer(Modifier.height(24.dp)) }
    }
}
