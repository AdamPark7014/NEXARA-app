package mx.nexara.mobile.nativeapp.ui.console.screens

import android.app.Application
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.ErrorOutline
import androidx.compose.material.icons.outlined.ExpandLess
import androidx.compose.material.icons.outlined.ExpandMore
import androidx.compose.material.icons.outlined.GpsFixed
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
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
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
import mx.nexara.mobile.nativeapp.ui.common.rememberCameraCapture
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
import mx.nexara.mobile.nativeapp.ui.enterprise.NxSkeletonList
import mx.nexara.mobile.nativeapp.ui.enterprise.NxStatusDot
import mx.nexara.mobile.nativeapp.ui.enterprise.NxUi
import mx.nexara.mobile.nativeapp.ui.enterprise.icon
import mx.nexara.mobile.nativeapp.ui.enterprise.nxEstadoPantalla
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
 * Tres pestañas sobre un mismo día: equipo, comidas y trayectoria.
 *
 * La pantalla sigue el contrato de `.ai/DISENO-FINANZAS.md`: una tira de cifras
 * en lugar de tarjetas KPI, el estado como punto y palabra, una sola barra de
 * filtros, un botón primario (checar) y ninguna caja dentro de otra. La lista
 * del equipo es densa —una fila por persona, separadas por una línea— y el
 * detalle de cada quien se abre al tocarla, para que quepan diez personas en
 * una pantalla en vez de dos.
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
private val HORA_CORTA_FMT: DateTimeFormatter = DateTimeFormatter.ofPattern("HH:mm")
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

/** `08:15` — la que va en la fila de la lista, donde los segundos solo estorban. */
private fun fmtHoraCorta(iso: String?): String =
    parseInstante(iso)?.atZone(ZoneId.systemDefault())?.toLocalTime()?.format(HORA_CORTA_FMT) ?: "—"

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
                        // De cuándo es la medición: el servidor no acepta una posición
                        // guardada de hace media hora como si fuera de ahora.
                        fixAgeMs = coords?.fixAgeMs,
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
                // Ubicación simulada, posición vieja, viaje imposible o intento desde fuera
                // de la app: son cuatro rechazos distintos, pero para quien está parado en
                // la puerta todos significan «no se registró». Van al mismo diálogo.
                val rechazada = AttendanceCheckIn.esRechazoDelServidor(code, mensaje)
                _state.update {
                    it.copy(
                        checkInLoading = false,
                        // Un rechazo del servidor se ve en un diálogo, no en una línea gris.
                        checkInMessage = if (rechazada) null else mensaje,
                        checkInError = !rechazada,
                        checkInBloqueo = if (rechazada) {
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
        // Las pestañas primero: son la navegación. El día es un filtro y vive con los filtros.
        TabRow(
            selectedTabIndex = indice,
            containerColor = NxColors.Surface,
            contentColor = NxColors.Brand,
        ) {
            pestanas.forEach { (key, label) ->
                Tab(
                    selected = tab == key,
                    onClick = { tab = key },
                    text = {
                        Text(
                            label,
                            fontSize = 13.5.sp,
                            fontWeight = if (tab == key) FontWeight.Bold else FontWeight.Medium,
                            maxLines = 1,
                        )
                    },
                    selectedContentColor = NxColors.Brand,
                    unselectedContentColor = NxUi.Fg2,
                )
            }
        }

        // El día vale para las tres pestañas, así que vive una sola vez y fuera
        // de la lista: si viviera dentro, al desplazarse se llevaría por delante
        // el calendario abierto.
        SelectorFecha(
            fecha = state.fecha,
            onFecha = vm::setFecha,
            modifier = Modifier.padding(horizontal = 16.dp, vertical = 8.dp),
        )

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
        ChecadaRechazadaDialog(mensaje = mensaje, onDismiss = vm::clearBloqueo)
    }
}

/**
 * 422 del servidor: la checada no se registró.
 *
 * Puede ser GPS falso, una posición guardada de hace rato, una distancia imposible desde
 * la checada anterior, o un intento desde fuera de la app. Se dice completo y en un
 * diálogo —es lo único que importa en ese momento— con lo que hay que hacer para checar,
 * que no es lo mismo en los cuatro casos.
 */
@Composable
private fun ChecadaRechazadaDialog(mensaje: String, onDismiss: () -> Unit) {
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
                Text(AttendanceCheckIn.ayudaDelRechazo(mensaje), fontSize = 13.sp, color = NxColors.Muted)
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

/**
 * El día que se está viendo. Es un control, no una cabecera: va en la misma fila
 * que los filtros, sin caja ni título repetido (la barra de arriba ya dice
 * «Asistencias»).
 */
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

    Row(
        modifier = modifier.fillMaxWidth(),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        OutlinedButton(
            onClick = { abierto = true },
            contentPadding = PaddingValues(horizontal = 12.dp, vertical = 6.dp),
            modifier = Modifier.heightIn(min = 40.dp),
        ) {
            Icon(NxIcons.Calendar, contentDescription = null, modifier = Modifier.size(17.dp))
            Spacer(Modifier.width(8.dp))
            Text(
                etiquetaDia(fecha, esHoy),
                fontSize = 13.sp,
                fontWeight = FontWeight.Medium,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
            )
        }
        if (!esHoy) {
            TextButton(onClick = { onFecha(hoy.format(ISO_FECHA)) }) {
                Text("Ir a hoy", fontSize = 13.sp, color = NxColors.Brand)
            }
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
    /** Fila abierta: el detalle se ve a petición, para que la lista siga siendo lista. */
    var expandida by rememberSaveable { mutableStateOf<Long?>(null) }
    val hayJornadaAbierta = AttendanceUx.hayJornadaAbierta(state.personas, state.current?.isOpen == true)
    LaunchedEffect(hayJornadaAbierta) {
        while (hayJornadaAbierta) {
            ahoraMs = System.currentTimeMillis()
            delay(1_000)
        }
    }
    val estadoEquipo = nxEstadoPantalla(
        cargando = state.isLoading,
        error = state.error,
        hayDatos = state.personas.isNotEmpty(),
    )

    LazyColumn(
        modifier = Modifier.fillMaxSize(),
        contentPadding = contentPadding,
        verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
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

        // Carga, error, vacío y contenido: cuatro caminos que no se cruzan.
        when (estadoEquipo) {
            NxEstadoPantalla.CARGANDO -> item { NxSkeletonList(itemCount = 5, itemHeight = 64.dp) }
            NxEstadoPantalla.ERROR -> item { NxErrorBlock(state.error.orEmpty()) { vm.refresh() } }
            NxEstadoPantalla.VACIO -> item {
                NxEmptyState(
                    title = "Sin registros",
                    subtitle = "Nadie en tu alcance para ${etiquetaDia(state.fecha, esHoy).replaceFirstChar { it.lowercase() }}.",
                    actionLabel = "Actualizar",
                    onAction = { vm.refresh() },
                )
            }
            NxEstadoPantalla.CONTENIDO -> {
                // Regla 7: la tira solo aparece cuando hay gente que contar.
                item {
                    NxMetricStrip(
                        items = AttendanceUx.metricas(state.personas),
                        seleccion = AttendanceUx.metricaDeEstado(state.filtro),
                        onSelect = { clave ->
                            val estado = AttendanceUx.estadoDeMetrica(clave)
                            vm.setFiltro(if (estado == null || state.filtro == estado) null else estado)
                        },
                    )
                }
                // Regla 8: una sola fila de filtros, sin caja y sin fondo.
                item {
                    NxFilterBar(contentPadding = PaddingValues(horizontal = 0.dp)) {
                        AttendanceUx.filtros(state.personas).forEach { f ->
                            NxFilterPill(
                                label = f.etiqueta,
                                count = f.conteo,
                                color = f.color,
                                selected = state.filtro == f.estado,
                                onClick = { vm.setFiltro(if (state.filtro == f.estado) null else f.estado) },
                            )
                        }
                    }
                }
                item {
                    NxDenseSectionHeader(
                        title = AttendanceUx.tituloLista(state.filtro, state.visibles.size),
                        hint = "Toca una fila para ver fotos, mapa y avisos.",
                    )
                }
                if (state.visibles.isEmpty()) {
                    item {
                        NxEmptyState(
                            title = "Nadie en este filtro",
                            subtitle = "Nadie de tu equipo está en «${state.filtro?.etiqueta.orEmpty()}».",
                            actionLabel = "Ver a todos",
                            onAction = { vm.setFiltro(null) },
                        )
                    }
                } else {
                    // Una superficie con filas separadas por una línea, no una tarjeta por persona.
                    item {
                        Column(
                            Modifier
                                .fillMaxWidth()
                                .clip(RoundedCornerShape(NxUi.RadiusLg))
                                .background(NxColors.Card)
                                .border(1.dp, NxUi.Border, RoundedCornerShape(NxUi.RadiusLg)),
                        ) {
                            state.visibles.forEachIndexed { i, persona ->
                                if (i > 0) HorizontalDivider(color = NxUi.BorderSubtle)
                                PersonaRow(
                                    persona = persona,
                                    ahoraMs = ahoraMs,
                                    expandida = expandida == persona.userId,
                                    onToggle = {
                                        expandida = if (expandida == persona.userId) null else persona.userId
                                    },
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
                        }
                    }
                }
            }
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
                    label = { Text("Motivo") },
                    placeholder = { Text("Ej. Incapacidad del IMSS por tres días.") },
                    minLines = 3,
                    enabled = !saving,
                    isError = error != null,
                    modifier = Modifier.fillMaxWidth(),
                )
                // La ayuda vive bajo el campo y el error la reemplaza mientras dure (regla 5).
                Text(
                    error ?: "Mínimo $min caracteres: queda en el expediente del día.",
                    fontSize = 11.5.sp,
                    color = if (error != null) NxColors.Danger else NxColors.Muted,
                )
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
            TextButton(onClick = onDismiss, enabled = !saving) { Text("Cancelar", color = NxUi.Fg2) }
        },
    )
}

/** «Falta justificada · motivo», con quién la justificó. Sin caja: una línea de color basta. */
@Composable
private fun FaltaJustificadaNota(j: AttendanceJustificacionDto, modifier: Modifier = Modifier) {
    val color = AttendanceEstado.JUSTIFICADA.color
    Row(
        modifier = modifier.fillMaxWidth().height(IntrinsicSize.Min),
        horizontalArrangement = Arrangement.spacedBy(10.dp),
    ) {
        Box(Modifier.width(2.dp).fillMaxHeight().background(color))
        Column(verticalArrangement = Arrangement.spacedBy(1.dp)) {
            Text(FaltasJustificadas.texto(j), fontSize = 13.sp, fontWeight = FontWeight.SemiBold, color = color)
            FaltasJustificadas.quien(j)?.let { Text(it, fontSize = 11.5.sp, color = NxColors.Muted) }
        }
    }
}

/**
 * Mi jornada, en una tarjeta que cabe en un pulgar.
 *
 * Antes era un bloque centrado de más de un tercio de pantalla: un círculo de
 * 72 dp, el rótulo «MI JORNADA», el estado, el cronómetro y el botón, todo
 * apilado. Ahora el estado y el cronómetro comparten un renglón —el cronómetro
 * en cifras de ancho fijo, a la derecha, donde se compara— y el botón de checar
 * es lo único grande, porque es lo único que se pulsa.
 */
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
    val miFalta = state.miJustificacion?.takeIf { !abierta && !hayEntrada }
    val shape = RoundedCornerShape(NxUi.RadiusLg)

    Column(
        modifier = Modifier
            .fillMaxWidth()
            .clip(shape)
            .background(NxColors.Card)
            .border(1.dp, if (abierta) AttendanceEstado.PRESENTE.color.copy(alpha = 0.45f) else NxUi.Border, shape)
            .padding(14.dp),
        verticalArrangement = Arrangement.spacedBy(10.dp),
    ) {
        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp)) {
            Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(2.dp)) {
                NxStatusDot(
                    text = when {
                        abierta -> "Jornada en curso"
                        haySalida && hayEntrada -> "Jornada completada"
                        miFalta != null -> FaltasJustificadas.ETIQUETA
                        else -> "Sin entrada registrada"
                    },
                    color = when {
                        abierta -> AttendanceUx.VERDE
                        haySalida && hayEntrada -> AttendanceUx.AZUL
                        miFalta != null -> AttendanceUx.MORADO
                        else -> null
                    },
                    fontSize = 15.sp,
                    fontWeight = FontWeight.Bold,
                )
                Text(
                    when {
                        abierta && inicioIso != null -> "Desde las ${fmtHora(inicioIso)}"
                        !esHoy -> "Solo se puede checar en el día de hoy."
                        else -> "Se toma una foto y tu ubicación."
                    },
                    fontSize = 12.sp,
                    color = NxColors.Muted,
                )
            }
            if (abierta && inicioIso != null) {
                // Cifras de ancho fijo: el reloj no baila mientras corre.
                Text(
                    fmtHms(transcurridoMs(inicioIso, null, ahoraMs)),
                    fontSize = 22.sp,
                    fontWeight = FontWeight.Bold,
                    fontFamily = FontFamily.Monospace,
                    color = AttendanceEstado.PRESENTE.color,
                )
            }
        }

        miFalta?.let { FaltaJustificadaNota(it) }

        // El único botón primario de la pantalla: lo que la persona vino a hacer.
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
                modifier = Modifier.fillMaxWidth().heightIn(min = 48.dp),
                colors = ButtonDefaults.buttonColors(containerColor = NxColors.Brand),
                shape = RoundedCornerShape(NxUi.Radius),
            ) {
                if (state.checkInLoading) {
                    CircularProgressIndicator(
                        modifier = Modifier.size(18.dp),
                        strokeWidth = 2.dp,
                        color = Color.White,
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
                        fontSize = 15.sp,
                    )
                }
            }
        } else if (esHoy && hayEntrada && !haySalida) {
            Text("Ya registraste tu entrada de hoy.", fontSize = 12.sp, color = NxColors.Muted)
        }

        state.checkInMessage?.takeIf { it.isNotBlank() }?.let { msg ->
            NxIconText(
                text = msg,
                icon = if (state.checkInError) Icons.Outlined.ErrorOutline else NxGlyph.APPROVED.icon,
                fontSize = 12.sp,
                color = if (state.checkInError) NxColors.Danger else AttendanceEstado.PRESENTE.color,
                iconSize = 15.dp,
            )
        }

        if (state.misChecadas.isNotEmpty()) {
            HorizontalDivider(color = NxUi.BorderSubtle)
            state.misChecadas.sortedBy { it.timestamp }.forEach { ev ->
                Column(verticalArrangement = Arrangement.spacedBy(3.dp)) {
                    Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                        NxIconText(
                            text = if (ev.type.equals("entrada", true)) "Entrada" else "Salida",
                            icon = if (ev.type.equals("entrada", true)) NxGlyph.ENTRY.icon else NxGlyph.EXIT.icon,
                            fontSize = 12.5.sp,
                            color = NxUi.Fg2,
                            iconSize = 15.dp,
                        )
                        Text(
                            fmtHora(ev.timestamp),
                            fontSize = 12.5.sp,
                            fontFamily = FontFamily.Monospace,
                            color = NxColors.Slate,
                        )
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
    val shape = RoundedCornerShape(NxUi.Radius)
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .clip(shape)
            .background(NxColors.InfoSoft)
            .padding(horizontal = 12.dp, vertical = 10.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(1.dp)) {
            NxIconText(
                text = "Compartiendo ubicación de jornada",
                icon = Icons.Outlined.GpsFixed,
                fontSize = 13.sp,
                fontWeight = FontWeight.SemiBold,
                color = NxColors.Slate,
                iconSize = 16.dp,
            )
            Text(
                "Se apaga sola al registrar tu salida.",
                fontSize = 11.5.sp,
                color = NxColors.Muted,
            )
        }
        TextButton(onClick = onDetener) { Text("Dejar de compartir", fontSize = 12.5.sp) }
    }
}

/**
 * Una persona en la lista del día: nombre, estado, horas y cronómetro en una
 * fila que se lee de un vistazo. Lo demás —fotos, mapas, avisos, correcciones y
 * el botón de justificar— se despliega al tocarla, porque son cosas que se
 * miran de una en una, no de diez en diez.
 */
@Composable
private fun PersonaRow(
    persona: AttendancePersona,
    ahoraMs: Long,
    expandida: Boolean,
    onToggle: () -> Unit,
    onAbrir: (String) -> Unit,
    /** «Justificar falta» (solo Christian, día sin entrada). */
    onJustificar: (() -> Unit)? = null,
) {
    val color = persona.estado.color
    Column(Modifier.fillMaxWidth()) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .clickable(onClick = onToggle)
                .padding(horizontal = 12.dp, vertical = 10.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(10.dp),
        ) {
            Box {
                Box(
                    modifier = Modifier.size(38.dp).clip(CircleShape).background(NxColors.BrandSoft),
                    contentAlignment = Alignment.Center,
                ) {
                    Text(
                        iniciales(persona.nombre),
                        fontSize = 12.5.sp,
                        fontWeight = FontWeight.Bold,
                        color = NxColors.Brand,
                    )
                }
                // El estado va pegado a la foto: un punto, no una pastilla más en la fila.
                Box(
                    Modifier
                        .align(Alignment.BottomEnd)
                        .size(13.dp)
                        .clip(CircleShape)
                        .background(NxColors.Card)
                        .padding(2.dp)
                        .clip(CircleShape)
                        .background(color),
                )
            }
            Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(1.dp)) {
                Text(
                    persona.nombre,
                    fontSize = 14.sp,
                    fontWeight = FontWeight.SemiBold,
                    color = NxColors.Slate,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                )
                Text(
                    "${persona.estado.etiqueta} · ${persona.subtitulo}",
                    fontSize = 11.5.sp,
                    color = NxColors.Muted,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                )
            }
            Column(horizontalAlignment = Alignment.End, verticalArrangement = Arrangement.spacedBy(1.dp)) {
                Text(
                    "${fmtHoraCorta(persona.entradaIso)} → ${fmtHoraCorta(persona.salidaIso)}",
                    fontSize = 11.5.sp,
                    fontFamily = FontFamily.Monospace,
                    color = NxColors.Muted,
                )
                Text(
                    if (persona.estado == AttendanceEstado.AUSENTE || persona.estado == AttendanceEstado.JUSTIFICADA) {
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
                    fontSize = 14.sp,
                    fontWeight = FontWeight.Bold,
                    fontFamily = FontFamily.Monospace,
                    color = color,
                )
            }
            Icon(
                if (expandida) Icons.Outlined.ExpandLess else Icons.Outlined.ExpandMore,
                contentDescription = if (expandida) "Ocultar detalle" else "Ver detalle",
                tint = NxColors.Muted,
                modifier = Modifier.size(20.dp),
            )
        }

        if (expandida) {
            Column(
                Modifier.fillMaxWidth().padding(start = 12.dp, end = 12.dp, bottom = 12.dp),
                verticalArrangement = Arrangement.spacedBy(10.dp),
            ) {
                val justificacion = persona.justificacion
                if (persona.estado == AttendanceEstado.JUSTIFICADA && justificacion != null) {
                    // Ni «sin checada» ni horas en cero: el día está justificado.
                    FaltaJustificadaNota(justificacion)
                } else {
                    Row(horizontalArrangement = Arrangement.spacedBy(24.dp)) {
                        HoraDetalle("Entrada", persona.entradaIso)
                        HoraDetalle("Salida", persona.salidaIso)
                    }
                }

                val avisos = (persona.avisosEntrada + persona.avisosSalida).distinctBy { it.texto }
                if (avisos.isNotEmpty()) AvisosChecada(avisos)
                persona.correcciones.forEach { c ->
                    Text(
                        AttendanceBadges.correccionTexto(c),
                        fontSize = 12.sp,
                        color = Color(AttendanceBadges.MORADO),
                    )
                }

                if (persona.fotoEntrada != null || persona.fotoSalida != null) {
                    Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                        persona.fotoEntrada?.let { FotoChecada("Entrada", it, NxGlyph.ENTRY.icon) }
                        persona.fotoSalida?.let { FotoChecada("Salida", it, NxGlyph.EXIT.icon) }
                    }
                }

                if (persona.mapaEntrada != null || persona.mapaSalida != null || onJustificar != null) {
                    Row(horizontalArrangement = Arrangement.spacedBy(4.dp), verticalAlignment = Alignment.CenterVertically) {
                        persona.mapaEntrada?.let { url ->
                            TextButton(onClick = { onAbrir(url) }) {
                                Text("Mapa entrada", fontSize = 12.5.sp, color = NxColors.Brand)
                            }
                        }
                        persona.mapaSalida?.let { url ->
                            TextButton(onClick = { onAbrir(url) }) {
                                Text("Mapa salida", fontSize = 12.5.sp, color = NxColors.Brand)
                            }
                        }
                        onJustificar?.let { justificar ->
                            TextButton(onClick = justificar) {
                                Text(
                                    "Justificar falta",
                                    fontSize = 12.5.sp,
                                    fontWeight = FontWeight.SemiBold,
                                    color = AttendanceEstado.JUSTIFICADA.color,
                                )
                            }
                        }
                    }
                }
            }
        }
    }
}

/** «ENTRADA · 08:15:03» dentro del detalle desplegado. */
@Composable
private fun HoraDetalle(etiqueta: String, iso: String?) {
    Column(verticalArrangement = Arrangement.spacedBy(1.dp)) {
        Text(etiqueta.uppercase(), fontSize = 10.sp, fontWeight = FontWeight.Medium, color = NxColors.Muted)
        Text(
            fmtHora(iso),
            fontSize = 15.sp,
            fontWeight = FontWeight.Bold,
            fontFamily = FontFamily.Monospace,
            color = NxColors.Slate,
        )
    }
}

/**
 * Insignias de lo que le pasó a la checada: por qué está para revisar, si se
 * capturó sin conexión, si se cerró sola o si alguien la corrigió. Van como
 * punto y palabra: son avisos, no un semáforo.
 */
@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun AvisosChecada(avisos: List<AttendanceBadge>, modifier: Modifier = Modifier) {
    FlowRow(
        modifier = modifier.fillMaxWidth(),
        horizontalArrangement = Arrangement.spacedBy(14.dp),
        verticalArrangement = Arrangement.spacedBy(4.dp),
    ) {
        avisos.forEach { aviso ->
            NxStatusDot(aviso.texto, color = aviso.color, fontSize = 11.5.sp, fontWeight = FontWeight.SemiBold)
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
        NxIconText(text = etiqueta, icon = icon, fontSize = 10.sp, color = NxColors.Muted, iconSize = 13.dp)
    }
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
            item { NxSkeletonList(itemCount = 4, itemHeight = 56.dp) }
            return@LazyColumn
        }

        item {
            NxDenseSectionHeader(
                title = "GPS del equipo",
                hint = "Unidades con jornada abierta.",
            )
        }

        if (state.equipoGps.isEmpty()) {
            item { NxEmptyState(title = "Sin ubicaciones", subtitle = "Nadie comparte GPS ahora.") }
        } else {
            item {
                Column(
                    Modifier
                        .fillMaxWidth()
                        .clip(RoundedCornerShape(NxUi.RadiusLg))
                        .background(NxColors.Card)
                        .border(1.dp, NxUi.Border, RoundedCornerShape(NxUi.RadiusLg)),
                ) {
                    state.equipoGps.forEachIndexed { i, punto ->
                        if (i > 0) HorizontalDivider(color = NxUi.BorderSubtle)
                        val lat = attendanceCoord(punto.latitud)
                        val lng = attendanceCoord(punto.longitud)
                        val url = mapaUrl(lat, lng)
                        Row(
                            modifier = Modifier
                                .fillMaxWidth()
                                .then(if (url != null) Modifier.clickable { onAbrir(url) } else Modifier)
                                .padding(horizontal = 14.dp, vertical = 11.dp),
                            verticalAlignment = Alignment.CenterVertically,
                            horizontalArrangement = Arrangement.spacedBy(10.dp),
                        ) {
                            Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(1.dp)) {
                                Text(
                                    punto.usuario?.nombre ?: "Usuario #${punto.usuarioId}",
                                    fontSize = 13.5.sp,
                                    fontWeight = FontWeight.SemiBold,
                                    color = NxColors.Slate,
                                    maxLines = 1,
                                    overflow = TextOverflow.Ellipsis,
                                )
                                Text(
                                    if (lat != null && lng != null) {
                                        "${"%.5f".format(lat)}, ${"%.5f".format(lng)}"
                                    } else {
                                        "Sin coordenadas"
                                    },
                                    fontSize = 11.5.sp,
                                    fontFamily = FontFamily.Monospace,
                                    color = NxColors.Muted,
                                )
                            }
                            if (url != null) {
                                Text("Ver en mapa", fontSize = 12.5.sp, color = NxColors.Brand)
                            }
                        }
                    }
                }
            }
        }

        item {
            NxDenseSectionHeader(
                title = "Mi trayecto · ${state.trayecto.size} puntos",
                hint = "Entrada, GPS y salida del día que estás viendo.",
                modifier = Modifier.padding(top = 6.dp),
            )
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
                    val muestra = if (ruta.size <= 18) {
                        ruta
                    } else {
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
