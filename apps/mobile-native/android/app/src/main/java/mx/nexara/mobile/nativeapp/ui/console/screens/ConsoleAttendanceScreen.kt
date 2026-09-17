package mx.nexara.mobile.nativeapp.ui.console.screens

import android.Manifest
import android.app.Application
import android.content.Context
import android.content.pm.PackageManager
import android.os.Build
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.ErrorOutline
import androidx.compose.material.icons.outlined.GpsFixed
import androidx.compose.material.icons.outlined.Schedule
import androidx.compose.material3.*
import androidx.compose.material3.pulltorefresh.PullToRefreshBox
import androidx.compose.runtime.*
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
import mx.nexara.mobile.nativeapp.data.api.AttendanceCurrentDto
import mx.nexara.mobile.nativeapp.data.api.AttendanceEventDto
import mx.nexara.mobile.nativeapp.data.api.AttendanceRangeUserDto
import mx.nexara.mobile.nativeapp.data.api.GpsLocationDto
import mx.nexara.mobile.nativeapp.data.api.attendanceCoord
import mx.nexara.mobile.nativeapp.data.api.toUserMessage
import mx.nexara.mobile.nativeapp.data.console.ConsoleRepository
import mx.nexara.mobile.nativeapp.ui.common.ImageDataUrl
import mx.nexara.mobile.nativeapp.ui.common.LocationPermissionBanner
import mx.nexara.mobile.nativeapp.ui.common.MediaPickerBar
import mx.nexara.mobile.nativeapp.ui.common.ProtectedImage
import mx.nexara.mobile.nativeapp.ui.enterprise.NxColors
import mx.nexara.mobile.nativeapp.ui.enterprise.NxGlyph
import mx.nexara.mobile.nativeapp.ui.enterprise.NxIconText
import mx.nexara.mobile.nativeapp.ui.enterprise.icon
import mx.nexara.mobile.nativeapp.ui.enterprise.NxEmptyState
import mx.nexara.mobile.nativeapp.ui.enterprise.NxLoadingBlock
import mx.nexara.mobile.nativeapp.ui.util.openExternalUrl
import mx.nexara.mobile.nativeapp.util.DeviceLocation
import mx.nexara.mobile.nativeapp.util.JornadaGps
import java.time.Instant
import java.time.LocalDate
import java.time.ZoneId
import java.time.format.DateTimeFormatter

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
)

data class AttendanceUiState(
    val isLoading: Boolean = true,
    val isRefreshing: Boolean = false,
    val error: String? = null,
    val checkInLoading: Boolean = false,
    val checkInMessage: String? = null,
    val checkInError: Boolean = false,
    val fecha: String = hoyIso(),
    val filtro: AttendanceEstado? = null,
    val current: AttendanceCurrentDto? = null,
    val misChecadas: List<AttendanceEventDto> = emptyList(),
    val personas: List<AttendancePersona> = emptyList(),
    val gpsActivo: Boolean = false,
    val equipoGps: List<GpsLocationDto> = emptyList(),
    val trayecto: List<GpsLocationDto> = emptyList(),
    val trayectoCargando: Boolean = false,
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
        val estado = when {
            dia?.isOpen == true -> AttendanceEstado.PRESENTE
            entrada != null && salida != null -> AttendanceEstado.COMPLETO
            entrada != null -> AttendanceEstado.PRESENTE
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
                )
            }
        }
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
                        photoBase64 = photoBase64,
                    )
                }
                val gpsNota = if (type == "entrada") encenderGps() else apagarGps()
                val base = res.message
                    ?: if (type == "entrada") "Entrada registrada" else "Salida registrada"
                val geo = when {
                    coords == null -> " (sin GPS — activa ubicación)"
                    coords.accuracyM != null && coords.accuracyM > 100f ->
                        " · GPS ±${coords.accuracyM.toInt()}m (baja precisión)"
                    coords.accuracyM != null -> " · GPS ±${coords.accuracyM.toInt()}m"
                    else -> " · GPS ok"
                }
                _state.update {
                    it.copy(
                        checkInLoading = false,
                        checkInMessage = base + geo + gpsNota,
                        checkInError = false,
                        gpsActivo = JornadaGps.isRunning(),
                    )
                }
                refresh(initial = false)
            } catch (e: CancellationException) {
                throw e
            } catch (e: Exception) {
                _state.update {
                    it.copy(
                        checkInLoading = false,
                        checkInMessage = e.toUserMessage("Error al registrar"),
                        checkInError = true,
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
        add(TAB_EQUIPO to "Equipo del día")
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
}

// ── Selector de día ──────────────────────────────────────────────────────────

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
        modifier = modifier,
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(10.dp),
    ) {
        Column(Modifier.weight(1f)) {
            Text(
                "Asistencias",
                fontSize = 18.sp,
                fontWeight = FontWeight.ExtraBold,
                color = NxColors.Slate,
            )
            Text(
                "Tu checada (foto + GPS) · equipo · comidas",
                fontSize = 12.sp,
                color = NxColors.Muted,
            )
        }
        OutlinedButton(onClick = { abierto = true }) {
            Text(if (esHoy) "Hoy · $fecha" else fecha, fontSize = 13.sp)
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

        item {
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp), modifier = Modifier.fillMaxWidth()) {
                KpiAsistencia(Modifier.weight(1f), "Equipo", state.personas.size.toString(), NxColors.InfoSoft, NxColors.Info) {
                    vm.setFiltro(null)
                }
                KpiAsistencia(Modifier.weight(1f), "En jornada", state.presentes.toString(), NxColors.SuccessSoft, AttendanceEstado.PRESENTE.color) {
                    vm.setFiltro(AttendanceEstado.PRESENTE)
                }
                KpiAsistencia(Modifier.weight(1f), "Completó", state.completos.toString(), NxColors.InfoSoft, AttendanceEstado.COMPLETO.color) {
                    vm.setFiltro(AttendanceEstado.COMPLETO)
                }
                KpiAsistencia(Modifier.weight(1f), "Sin checada", state.ausentes.toString(), Color(0xFFF1F5F9), AttendanceEstado.AUSENTE.color) {
                    vm.setFiltro(AttendanceEstado.AUSENTE)
                }
            }
        }

        item {
            Row(
                modifier = Modifier.fillMaxWidth().horizontalScroll(rememberScrollState()),
                horizontalArrangement = Arrangement.spacedBy(6.dp),
            ) {
                ChipEstado("Todos", state.personas.size, null, state.filtro == null) { vm.setFiltro(null) }
                AttendanceEstado.entries.forEach { estado ->
                    val n = state.personas.count { it.estado == estado }
                    ChipEstado(estado.etiqueta, n, estado.color, state.filtro == estado) {
                        vm.setFiltro(estado)
                    }
                }
            }
        }

        if (state.visibles.isEmpty()) {
            item {
                NxEmptyState(
                    title = if (state.personas.isEmpty()) "Sin registros" else "Nadie en este filtro",
                    subtitle = if (state.personas.isEmpty()) {
                        "Nadie en tu alcance para el ${state.fecha}."
                    } else {
                        "Prueba otro chip o el KPI de arriba."
                    },
                )
            }
        }

        items(state.visibles, key = { "asis-${it.userId}" }) { persona ->
            PersonaCard(persona = persona, ahoraMs = ahoraMs, onAbrir = onAbrir)
        }

        item { Spacer(Modifier.height(24.dp)) }
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
    var pendiente by remember { mutableStateOf<String?>(null) }

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
            Text(
                when {
                    abierta -> "Jornada en curso"
                    haySalida && hayEntrada -> "Jornada completada"
                    else -> "Sin entrada registrada"
                },
                fontSize = 16.sp,
                fontWeight = FontWeight.SemiBold,
                color = if (abierta) AttendanceEstado.PRESENTE.color else NxColors.Slate,
            )
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

            val tipoPendiente = pendiente
            if (tipoPendiente != null) {
                Text(
                    if (tipoPendiente == "entrada") "Toma una foto para registrar entrada"
                    else "Toma una foto para registrar salida",
                    fontSize = 12.sp,
                    color = NxColors.Muted,
                )
                MediaPickerBar(
                    onPicked = { picked ->
                        val first = picked.firstOrNull() ?: return@MediaPickerBar
                        val dataUrl = ImageDataUrl.fromCaptured(context, first)
                        if (dataUrl.isNullOrBlank()) {
                            vm.clearMessage()
                            return@MediaPickerBar
                        }
                        pendiente = null
                        vm.checkIn(tipoPendiente, dataUrl)
                    },
                    allowCamera = true,
                    allowGallery = false,
                    allowDocuments = false,
                )
                TextButton(onClick = { pendiente = null }) { Text("Cancelar") }
            } else {
                Row(
                    horizontalArrangement = Arrangement.spacedBy(12.dp),
                    modifier = Modifier.fillMaxWidth(),
                ) {
                    Button(
                        onClick = { pendiente = "entrada" },
                        enabled = puedeEntrada && !state.checkInLoading,
                        modifier = Modifier.weight(1f).height(50.dp),
                        colors = ButtonDefaults.buttonColors(containerColor = AttendanceEstado.PRESENTE.color),
                        shape = RoundedCornerShape(12.dp),
                    ) {
                        if (!state.checkInLoading) {
                            Icon(NxGlyph.ENTRY.icon, contentDescription = null, modifier = Modifier.size(18.dp))
                            Spacer(Modifier.width(6.dp))
                        }
                        Text(
                            if (state.checkInLoading) "Registrando…" else "Entrada",
                            fontWeight = FontWeight.Bold,
                        )
                    }
                    Button(
                        onClick = { pendiente = "salida" },
                        enabled = puedeSalida && !state.checkInLoading,
                        modifier = Modifier.weight(1f).height(50.dp),
                        colors = ButtonDefaults.buttonColors(containerColor = NxColors.Danger),
                        shape = RoundedCornerShape(12.dp),
                    ) {
                        if (!state.checkInLoading) {
                            Icon(NxGlyph.EXIT.icon, contentDescription = null, modifier = Modifier.size(18.dp))
                            Spacer(Modifier.width(6.dp))
                        }
                        Text(
                            if (state.checkInLoading) "Registrando…" else "Salida",
                            fontWeight = FontWeight.Bold,
                        )
                    }
                }
                if (esHoy && !puedeEntrada && !puedeSalida) {
                    Text(
                        if (hayEntrada) "Ya registraste tu entrada de hoy." else "Primero registra tu entrada.",
                        fontSize = 12.sp,
                        color = NxColors.Muted,
                    )
                }
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
                }
            }
        }
    }
}

/**
 * Rastreo activo: se dice en pantalla, no solo en la notificación. Android 10+
 * además exige pedir el permiso «todo el tiempo» aparte del de primer plano.
 */
@Composable
private fun GpsJornadaAviso(onDetener: () -> Unit) {
    val context = LocalContext.current
    var fondoConcedido by remember { mutableStateOf(tieneUbicacionEnSegundoPlano(context)) }
    val launcher = rememberLauncherForActivityResult(
        ActivityResultContracts.RequestPermission(),
    ) { fondoConcedido = tieneUbicacionEnSegundoPlano(context) }

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
            if (!fondoConcedido && Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                Text(
                    "Con la pantalla apagada el trayecto se corta: permite la ubicación «todo el tiempo».",
                    fontSize = 12.sp,
                    color = NxColors.Muted,
                )
                OutlinedButton(
                    onClick = { launcher.launch(Manifest.permission.ACCESS_BACKGROUND_LOCATION) },
                ) { Text("Permitir todo el tiempo", fontSize = 13.sp) }
            }
            TextButton(onClick = onDetener) { Text("Dejar de compartir", fontSize = 13.sp) }
        }
    }
}

private fun tieneUbicacionEnSegundoPlano(context: Context): Boolean {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.Q) return true
    return ContextCompat.checkSelfPermission(
        context,
        Manifest.permission.ACCESS_BACKGROUND_LOCATION,
    ) == PackageManager.PERMISSION_GRANTED
}

@Composable
private fun PersonaCard(
    persona: AttendancePersona,
    ahoraMs: Long,
    onAbrir: (String) -> Unit,
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

            if (persona.fotoEntrada != null || persona.fotoSalida != null) {
                Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                    persona.fotoEntrada?.let { FotoChecada("Entrada", it, NxGlyph.ENTRY.icon) }
                    persona.fotoSalida?.let { FotoChecada("Salida", it, NxGlyph.EXIT.icon) }
                }
            }

            if (persona.mapaEntrada != null || persona.mapaSalida != null) {
                Row(horizontalArrangement = Arrangement.spacedBy(14.dp)) {
                    persona.mapaEntrada?.let { url ->
                        Text(
                            "Mapa entrada",
                            fontSize = 12.sp,
                            fontWeight = FontWeight.SemiBold,
                            color = NxColors.Brand,
                            modifier = Modifier.clickable { onAbrir(url) },
                        )
                    }
                    persona.mapaSalida?.let { url ->
                        Text(
                            "Mapa salida",
                            fontSize = 12.sp,
                            fontWeight = FontWeight.SemiBold,
                            color = NxColors.Brand,
                            modifier = Modifier.clickable { onAbrir(url) },
                        )
                    }
                }
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

@Composable
private fun KpiAsistencia(
    modifier: Modifier,
    label: String,
    value: String,
    bg: Color,
    accent: Color,
    onClick: () -> Unit,
) {
    Card(
        modifier = modifier.clickable { onClick() },
        shape = RoundedCornerShape(14.dp),
        colors = CardDefaults.cardColors(containerColor = bg),
        elevation = CardDefaults.cardElevation(0.dp),
    ) {
        Column(
            modifier = Modifier.padding(vertical = 12.dp, horizontal = 6.dp).fillMaxWidth(),
            horizontalAlignment = Alignment.CenterHorizontally,
        ) {
            Text(value, fontSize = 20.sp, fontWeight = FontWeight.ExtraBold, color = accent)
            Text(label, fontSize = 10.5.sp, color = NxColors.Muted, textAlign = TextAlign.Center)
        }
    }
}

@Composable
private fun ChipEstado(
    label: String,
    count: Int,
    color: Color?,
    activo: Boolean,
    onClick: () -> Unit,
) {
    val tinte = color ?: NxColors.Brand
    val shape = RoundedCornerShape(999.dp)
    Box(
        modifier = Modifier
            .heightIn(min = 34.dp)
            .clip(shape)
            .background(if (activo) tinte.copy(alpha = 0.12f) else Color.White)
            .border(1.dp, if (activo) tinte else Color(0xFFE2E8F0), shape)
            .clickable { onClick() }
            .padding(horizontal = 12.dp, vertical = 7.dp),
        contentAlignment = Alignment.Center,
    ) {
        Text(
            "$label $count",
            fontSize = 12.5.sp,
            fontWeight = if (activo) FontWeight.Bold else FontWeight.SemiBold,
            color = if (activo) tinte else NxColors.Slate,
        )
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
                        Text(
                            "Ver en mapa",
                            fontSize = 12.sp,
                            fontWeight = FontWeight.SemiBold,
                            color = NxColors.Brand,
                            modifier = Modifier.clickable { onAbrir(url) },
                        )
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
