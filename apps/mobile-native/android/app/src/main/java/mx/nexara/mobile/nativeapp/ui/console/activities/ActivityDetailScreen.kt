package mx.nexara.mobile.nativeapp.ui.console.activities

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.Block
import androidx.compose.material.icons.outlined.Pause
import androidx.compose.material.icons.outlined.PlayArrow
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Tab
import androidx.compose.material3.TabRow
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import mx.nexara.mobile.nativeapp.data.AuthRepository
import mx.nexara.mobile.nativeapp.data.api.ActivityDto
import mx.nexara.mobile.nativeapp.data.api.EvidenceFlowDto
import mx.nexara.mobile.nativeapp.data.api.toUserMessage
import mx.nexara.mobile.nativeapp.data.console.ConsoleRepository
import mx.nexara.mobile.nativeapp.data.console.CoreActivitiesRepository
import mx.nexara.mobile.nativeapp.ui.enterprise.NxDimens
import mx.nexara.mobile.nativeapp.ui.enterprise.NxGlyph
import mx.nexara.mobile.nativeapp.ui.enterprise.NxLoadingBlock
import mx.nexara.mobile.nativeapp.ui.enterprise.NxPanelShell
import mx.nexara.mobile.nativeapp.ui.enterprise.NxSnackbarHost
import mx.nexara.mobile.nativeapp.ui.enterprise.NxTheme
import mx.nexara.mobile.nativeapp.ui.enterprise.icon
import mx.nexara.mobile.nativeapp.ui.enterprise.rememberNxSnackbarHostState
import mx.nexara.mobile.nativeapp.ui.util.openExternalUrl

/** Pestañas del detalle en Core (/erp/actividades/:id). */
const val ACTIVITY_TAB_DETALLE = 0
const val ACTIVITY_TAB_EVIDENCIAS = 1
const val ACTIVITY_TAB_HISTORIAL = 2

private val ACTIVITY_TABS = listOf("Detalle", "Evidencias", "Historial")

/**
 * Detalle de actividad de Core: Detalle · Evidencias · Historial, igual que
 * ActivityDetailShell en la web con `core`. Operación, viáticos, equipo,
 * materiales, incidencias y aprobaciones ya no son pestañas de Core.
 *
 * Rediseño v2 (`.ai/ui-maquetas/movil-actividad.html`): cabecera con tipo,
 * estado y folio; tarjeta del sitio y tira de datos; lista de pasos de evidencia
 * (hecho · actual · pendiente) y un dock inferior fijo con la acción principal
 * grande al alcance del pulgar. Toda la lógica de captura sigue en
 * `EvidenceCaptureFlow`; el dock solo lleva ahí o repite su botón.
 */
@Composable
fun ActivityDetailScreen(
    activity: ActivityDto,
    @Suppress("UNUSED_PARAMETER") onBack: () -> Unit,
    @Suppress("UNUSED_PARAMETER") onCaptureEvidence: ((Long) -> Unit)? = null,
    initialTab: Int = ACTIVITY_TAB_DETALLE,
    @Suppress("UNUSED_PARAMETER") onOpenGps: (() -> Unit)? = null,
) {
    val context = LocalContext.current
    val c = NxTheme.colors
    val authRepo = remember(context) { AuthRepository(context) }
    val user = remember { authRepo.loadSession() }
    val repo = remember(context) { ConsoleRepository(context) }
    var selectedTab by remember(activity.id) {
        mutableIntStateOf(initialTab.coerceIn(ACTIVITY_TAB_DETALLE, ACTIVITY_TAB_HISTORIAL))
    }
    var detail by remember(activity.id) { mutableStateOf(activity) }
    var loadingDetail by remember(activity.id) { mutableStateOf(true) }
    var editing by remember { mutableStateOf(false) }
    var saving by remember { mutableStateOf(false) }
    var saveError by remember { mutableStateOf<String?>(null) }
    var editEstatus by remember { mutableStateOf(activity.estatus) }
    var editPrioridad by remember { mutableStateOf(activity.prioridad ?: "") }
    var editDescripcion by remember { mutableStateOf(activity.descripcion ?: "") }
    var editIndicaciones by remember { mutableStateOf(activity.indicaciones ?: "") }
    var editFechaInicio by remember { mutableStateOf(activity.fechaInicio?.take(16) ?: "") }
    var editFechaEntrega by remember { mutableStateOf(activity.fechaEntregaEsperada?.take(10) ?: "") }
    var editFechaFin by remember { mutableStateOf(activity.fechaFinalizacion?.take(16) ?: "") }

    val isSuperAdmin = user?.isSuperAdmin == true
    val perms = user?.permissions ?: emptyList()
    val canManage = isSuperAdmin || perms.contains("activities.manage") || perms.contains("console.admin")
    val isAssigned = user?.id != null &&
        (detail.responsableId == user.id || detail.responsable?.id == user.id)
    val canExecute = isAssigned && !canManage
    val statusColor = activStatusColor(detail.estatus)
    val scope = rememberCoroutineScope()
    val snackbarHostState = rememberNxSnackbarHostState()

    fun saveActivityEdits() {
        scope.launch {
            saving = true
            saveError = null
            try {
                val isoInicio = editFechaInicio.takeIf { it.isNotBlank() }?.let { toIsoDateTime(it) }
                val isoEntrega = editFechaEntrega.takeIf { it.isNotBlank() }?.let { "${it}T12:00:00.000Z" }
                val isoFin = editFechaFin.takeIf { it.isNotBlank() }?.let { toIsoDateTime(it) }
                val updated = withContext(Dispatchers.IO) {
                    if (canManage) {
                        repo.updateActivity(
                            id = detail.id,
                            estatus = editEstatus,
                            prioridad = editPrioridad.takeIf { it.isNotBlank() },
                            descripcion = editDescripcion.takeIf { it.isNotBlank() },
                            indicaciones = editIndicaciones.takeIf { it.isNotBlank() },
                            fechaInicio = isoInicio,
                            fechaEntregaEsperada = isoEntrega,
                            fechaFinalizacion = isoFin,
                        )
                    } else {
                        repo.executeActivity(
                            id = detail.id,
                            estatus = editEstatus,
                            fechaInicio = isoInicio,
                            fechaFinalizacion = isoFin,
                        )
                    }
                }
                // PATCH no siempre trae el equipo: se conserva el que ya estaba.
                detail = updated.copy(
                    assignees = updated.assignees ?: detail.assignees,
                    coreKind = updated.coreKind ?: detail.coreKind,
                    assignmentCharge = updated.assignmentCharge ?: detail.assignmentCharge,
                    evidencePhotoRequired = updated.evidencePhotoRequired ?: detail.evidencePhotoRequired,
                )
                editing = false
                snackbarHostState.showSnackbar("Actividad actualizada")
            } catch (e: Exception) {
                saveError = e.toUserMessage("No se pudo guardar")
            } finally {
                saving = false
            }
        }
    }

    /** Sube tras cancelar o pasar la actividad: se vuelve a pedir el detalle y las acciones. */
    var recarga by remember(activity.id) { mutableIntStateOf(0) }

    // Regla del 18-09: quien la recibe no la acepta ni la rechaza, únicamente la inicia.
    // Aquí cae el push de «actividad nueva», así que el botón también vive en el detalle (en el dock).
    val coreRepo = remember(context) { CoreActivitiesRepository(context) }
    var iniciando by remember(activity.id) { mutableStateOf(false) }
    var iniciarError by remember(activity.id) { mutableStateOf<String?>(null) }
    var reanudando by remember(activity.id) { mutableStateOf(false) }
    var pausando by remember(activity.id) { mutableStateOf(false) }
    val miFila = detail.assignees?.firstOrNull { it.user?.id == user?.id && it.retiradoAt.isNullOrBlank() }
    val despachador = detail.assignmentCharge == "despacho" && miFila?.rol == "LEAD"
    val puedeIniciar = miFila != null && ActivitySemaforo.puedeIniciar(
        aceptacion = miFila.aceptacion,
        inicioRealAt = miFila.inicioRealAt,
        // El LEAD de un despacho solo reparte: no la ejecuta.
        despachador = despachador,
        estatus = detail.estatus,
    )
    val sesion = miFila?.sesion()
    val role = CoreActivityRules.captureRole(
        viewerId = user?.id,
        viewerEmail = user?.email,
        assignmentCharge = detail.assignmentCharge,
        responsableId = detail.responsable?.id ?: detail.responsableId,
        myActiveRol = miFila?.rol,
        hasActiveRow = miFila != null,
    )
    val captura = role == CoreActivityRules.CaptureRole.CAPTURA
    val photoRequired = (detail.evidencePhotoRequired ?: 4).coerceAtLeast(1)

    LaunchedEffect(activity.id, recarga) {
        loadingDetail = true
        val recargado = runCatching {
            withContext(Dispatchers.IO) { repo.activityById(activity.id) }
        }
        if (recargado.isFailure) {
            // No hay un estado de error propio en esta pantalla: sin avisar, se queda
            // viendo el resumen de la lista (o lo de antes de la acción) sin saber por qué.
            snackbarHostState.showSnackbar(
                if (recarga == 0) "No se pudo cargar el detalle completo — mostrando lo que ya tenías"
                else "No se pudo actualizar la actividad — sigue viendo lo anterior",
            )
        }
        detail = recargado.getOrElse { detail }
        editEstatus = detail.estatus
        editPrioridad = detail.prioridad ?: ""
        editDescripcion = detail.descripcion ?: ""
        editIndicaciones = detail.indicaciones ?: ""
        editFechaInicio = detail.fechaInicio?.take(16) ?: ""
        editFechaEntrega = detail.fechaEntregaEsperada?.take(10) ?: ""
        editFechaFin = detail.fechaFinalizacion?.take(16) ?: ""
        loadingDetail = false
    }

    // Pasos de evidencia para la lista del detalle y el dock: solo de quien captura.
    // El 404 del API es «todavía no hay foto de entrada» (null), no un error.
    var flow by remember(activity.id) { mutableStateOf<EvidenceFlowDto?>(null) }
    var flowTick by remember(activity.id) { mutableIntStateOf(0) }
    LaunchedEffect(activity.id, recarga, flowTick, captura, selectedTab) {
        if (!captura) return@LaunchedEffect
        flow = runCatching { withContext(Dispatchers.IO) { coreRepo.evidenceFlowOrNull(activity.id) } }
            .getOrElse { flow }
    }

    /** Lo que publica el flujo de captura mientras la pestaña Evidencias está en pantalla. */
    var dockEvidencias by remember(activity.id) { mutableStateOf<EvidenceDockAction?>(null) }
    val dockHost: (EvidenceDockAction?) -> Unit = remember(activity.id) {
        { accion -> if (accion == null || !accion.sameLook(dockEvidencias)) dockEvidencias = accion }
    }

    fun iniciar() {
        scope.launch {
            iniciando = true
            iniciarError = null
            try {
                withContext(Dispatchers.IO) { coreRepo.iniciarActividad(detail.id) }
                recarga++
                // Lo siguiente es la foto de entrada.
                selectedTab = ACTIVITY_TAB_EVIDENCIAS
                snackbarHostState.showSnackbar("Actividad iniciada")
            } catch (e: Exception) {
                iniciarError = e.toUserMessage("No se pudo iniciar la actividad")
            } finally {
                iniciando = false
            }
        }
    }

    fun reanudar() {
        scope.launch {
            reanudando = true
            iniciarError = null
            try {
                withContext(Dispatchers.IO) { coreRepo.reanudarActividad(detail.id) }
                recarga++
                snackbarHostState.showSnackbar("Tu reloj volvió a correr")
            } catch (e: Exception) {
                iniciarError = e.toUserMessage("No se pudo reanudar la actividad")
            } finally {
                reanudando = false
            }
        }
    }

    val dockDetalle = ActivityDockRules.principal(
        puedeIniciar = puedeIniciar,
        sesion = sesion,
        despachador = despachador,
        estatus = detail.estatus,
        captura = captura,
        flow = flow,
        coreKind = detail.coreKind,
        fotosRequeridas = photoRequired,
    )
    val pausable = sesion != null && !despachador && SesionActividadRules.puedePausar(sesion, detail.estatus)
    val pausar = DockSecondary(label = "Pausar", icon = Icons.Outlined.Pause, onClick = { pausando = true })

    Scaffold(
        snackbarHost = { NxSnackbarHost(snackbarHostState) },
        containerColor = c.surface,
        bottomBar = {
            // «Iniciar» y «Reanudar» mandan también en Evidencias: sin ellos el reloj
            // no corre. La captura del paso queda a mano como secundaria.
            val dockSesion = dockDetalle?.takeIf {
                it.kind == ActivityDockRules.Kind.INICIAR || it.kind == ActivityDockRules.Kind.REANUDAR
            }
            if (selectedTab == ACTIVITY_TAB_EVIDENCIAS && dockSesion == null) {
                dockEvidencias?.let { d ->
                    ActivityDock(
                        label = d.label,
                        enabled = d.enabled,
                        icon = d.icon,
                        hint = d.hint,
                        onPrimary = d.onPrimary,
                        secondary = buildList {
                            val sec = d.onSecondary
                            if (d.secondaryLabel != null && sec != null) {
                                add(DockSecondary(label = d.secondaryLabel, icon = d.secondaryIcon, onClick = sec))
                            }
                            if (pausable) add(pausar)
                        },
                    )
                }
            } else {
                dockDetalle?.let { d ->
                    ActivityDock(
                        label = d.label,
                        loading = iniciando || reanudando,
                        hint = d.hint,
                        error = iniciarError,
                        icon = when (d.kind) {
                            ActivityDockRules.Kind.INICIAR -> Icons.Outlined.PlayArrow
                            ActivityDockRules.Kind.REANUDAR -> Icons.Outlined.PlayArrow
                            ActivityDockRules.Kind.EVIDENCIAS -> NxGlyph.PHOTO.icon
                            ActivityDockRules.Kind.VER -> null
                        },
                        onPrimary = {
                            when (d.kind) {
                                ActivityDockRules.Kind.INICIAR -> iniciar()
                                ActivityDockRules.Kind.REANUDAR -> reanudar()
                                ActivityDockRules.Kind.EVIDENCIAS, ActivityDockRules.Kind.VER -> selectedTab = ACTIVITY_TAB_EVIDENCIAS
                            }
                        },
                        secondary = buildList {
                            if (d.pausable) add(pausar)
                            val captura = dockEvidencias
                            if (selectedTab == ACTIVITY_TAB_EVIDENCIAS && captura != null && captura.enabled) {
                                add(DockSecondary(label = captura.label, icon = captura.icon, onClick = captura.onPrimary))
                            }
                        },
                    )
                } ?: run {
                    // Con el reloj corriendo pero sin captura propia (p. ej. dirección con fila
                    // activa): el panel viejo ofrecía «Pausar»; el dock lo conserva.
                    if (pausable) {
                        ActivityDock(
                            label = "Pausar actividad",
                            icon = Icons.Outlined.Pause,
                            hint = SesionActividadRules.textoCorriendo(
                                sesion?.sesionAbiertaDesde?.let { CoreActivityRules.formatClock(it) }?.takeIf { it != "—" },
                            ),
                            onPrimary = { pausando = true },
                        )
                    }
                }
            }
        },
        modifier = Modifier.fillMaxSize(),
    ) { padding ->
        Column(Modifier.fillMaxSize().padding(padding)) {
            // Sin «← Volver» propio: la barra superior de Core ya trae la flecha.
            ActivityHeaderV2(
                detail = detail,
                sesion = sesion,
                modifier = Modifier.padding(horizontal = 16.dp, vertical = 10.dp),
            )

            // Cancelada por un superior: quién y por qué, visible en las tres pestañas.
            ActivitySuperiorRules.avisoCancelada(detail)?.let { aviso ->
                Row(
                    Modifier
                        .fillMaxWidth()
                        .padding(horizontal = 16.dp, vertical = 4.dp)
                        .clip(RoundedCornerShape(NxDimens.ControlRadius))
                        .background(c.dangerSoft)
                        .padding(horizontal = 12.dp, vertical = 8.dp),
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(8.dp),
                ) {
                    Icon(Icons.Outlined.Block, contentDescription = null, tint = c.danger, modifier = Modifier.size(18.dp))
                    Column(Modifier.weight(1f)) {
                        Text(aviso, fontSize = 13.sp, fontWeight = FontWeight.SemiBold, color = c.dangerText)
                        CoreActivityRules.formatWhen(detail.cancelledAt)?.let {
                            Text(it, fontSize = 11.5.sp, color = c.muted)
                        }
                    }
                }
            }

            ActivitySuperiorActions(
                activityId = detail.id,
                refreshKey = recarga,
                onDone = { mensaje ->
                    recarga++
                    scope.launch { snackbarHostState.showSnackbar(mensaje) }
                },
                modifier = Modifier.padding(horizontal = 16.dp, vertical = 4.dp),
            )

            TabRow(
                selectedTabIndex = selectedTab,
                containerColor = c.surface,
                contentColor = c.brand,
            ) {
                ACTIVITY_TABS.forEachIndexed { i, label ->
                    Tab(
                        selected = selectedTab == i,
                        onClick = { selectedTab = i },
                        text = {
                            Text(
                                label,
                                fontSize = 13.5.sp,
                                fontWeight = if (selectedTab == i) FontWeight.Bold else FontWeight.Medium,
                            )
                        },
                        selectedContentColor = c.brand,
                        unselectedContentColor = c.fg2,
                    )
                }
            }

            when (selectedTab) {
                ACTIVITY_TAB_DETALLE -> {
                    if (loadingDetail) {
                        NxLoadingBlock("Cargando detalle…")
                    } else {
                        ActivityInfoTab(
                            a = detail,
                            statusColor = statusColor,
                            canEdit = canManage || canExecute,
                            editing = editing,
                            saving = saving,
                            saveError = saveError,
                            editEstatus = editEstatus,
                            editPrioridad = editPrioridad,
                            editDescripcion = editDescripcion,
                            editIndicaciones = editIndicaciones,
                            editFechaInicio = editFechaInicio,
                            editFechaEntrega = editFechaEntrega,
                            editFechaFin = editFechaFin,
                            showManagerFields = canManage,
                            showStatusChip = false,
                            onStartEdit = {
                                editEstatus = detail.estatus
                                editPrioridad = detail.prioridad ?: ""
                                editDescripcion = detail.descripcion ?: ""
                                editIndicaciones = detail.indicaciones ?: ""
                                editFechaInicio = detail.fechaInicio?.take(16) ?: ""
                                editFechaEntrega = detail.fechaEntregaEsperada?.take(10) ?: ""
                                editFechaFin = detail.fechaFinalizacion?.take(16) ?: ""
                                saveError = null
                                editing = true
                            },
                            onCancelEdit = { editing = false; saveError = null },
                            onEstatusChange = { editEstatus = it },
                            onPrioridadChange = { editPrioridad = it },
                            onDescripcionChange = { editDescripcion = it },
                            onIndicacionesChange = { editIndicaciones = it },
                            onFechaInicioChange = { editFechaInicio = it },
                            onFechaEntregaChange = { editFechaEntrega = it },
                            onFechaFinChange = { editFechaFin = it },
                            onSave = { saveActivityEdits() },
                            topContent = {
                                Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
                                    ActivityPlaceCard(detail = detail, onOpenMap = { url -> openExternalUrl(context, url) })
                                    ActivityFactsStrip(detail = detail, sesion = sesion)
                                    // «Iniciar actividad» vive en el dock; aquí solo se explica (regla del 18-09).
                                    if (puedeIniciar) {
                                        SoftNote(
                                            title = "Te asignaron esta actividad",
                                            text = "Iníciala cuando empieces: queda registrada tu hora real de inicio. " +
                                                "Si no puedes hacerla, habla con tu jefe para que la reasigne.",
                                            color = CoreActivityRules.AZUL,
                                        )
                                    }
                                    // El checklist va antes del trabajo: sin palomearlo, `iniciar` da 400.
                                    HerramientasChecklistSection(
                                        activityId = detail.id,
                                        refreshKey = recarga,
                                    )
                                    if (captura) {
                                        ActivityStepsCard(
                                            pasos = ActivityDockRules.pasos(flow, detail.coreKind, photoRequired),
                                            onOpen = { selectedTab = ACTIVITY_TAB_EVIDENCIAS },
                                        )
                                    }
                                }
                            },
                            extraContent = {
                                Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
                                    // Comercial: la propuesta, la minuta y lo que manda el cliente (Adam, 07-10).
                                    if (ActividadAdjuntosRules.aplica(detail.coreKind)) {
                                        ActividadAdjuntosSection(
                                            activityId = detail.id,
                                            refreshKey = recarga,
                                            onAviso = { mensaje -> scope.launch { snackbarHostState.showSnackbar(mensaje) } },
                                        )
                                    }
                                    NxPanelShell {
                                        Text(
                                            "Evidencias del equipo",
                                            style = MaterialTheme.typography.titleSmall.copy(fontWeight = FontWeight.Bold),
                                            color = c.fg,
                                        )
                                        TeamEvidenceSection(
                                            activityId = detail.id,
                                            compact = true,
                                            onOpenFull = { selectedTab = ACTIVITY_TAB_EVIDENCIAS },
                                        )
                                    }
                                }
                            },
                        )
                    }
                }
                ACTIVITY_TAB_EVIDENCIAS -> {
                    if (loadingDetail) {
                        NxLoadingBlock("Cargando evidencias…")
                    } else {
                        ActivityEvidenciasTab(activity = detail, dockHost = dockHost)
                        // Al volver a Detalle, la lista de pasos refleja lo capturado aquí.
                        LaunchedEffect(dockEvidencias?.label) { flowTick++ }
                    }
                }
                else -> ActivityHistorialTab(activity = detail)
            }
        }
    }

    if (pausando) {
        PausarPropiaDialog(
            activityId = detail.id,
            onDismiss = { pausando = false },
            onDone = { mensaje ->
                pausando = false
                recarga++
                scope.launch { snackbarHostState.showSnackbar(mensaje) }
            },
        )
    }
}
