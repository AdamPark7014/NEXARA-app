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
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import mx.nexara.mobile.nativeapp.data.AuthRepository
import mx.nexara.mobile.nativeapp.data.api.ActivityDto
import mx.nexara.mobile.nativeapp.data.api.toUserMessage
import mx.nexara.mobile.nativeapp.data.console.ConsoleRepository
import mx.nexara.mobile.nativeapp.data.console.CoreActivitiesRepository
import mx.nexara.mobile.nativeapp.ui.enterprise.NxColors
import mx.nexara.mobile.nativeapp.ui.enterprise.NxLoadingBlock
import mx.nexara.mobile.nativeapp.ui.enterprise.NxPanelShell
import mx.nexara.mobile.nativeapp.ui.enterprise.NxSnackbarHost
import mx.nexara.mobile.nativeapp.ui.enterprise.rememberNxSnackbarHostState

/** Pestañas del detalle en Core (/erp/actividades/:id). */
const val ACTIVITY_TAB_DETALLE = 0
const val ACTIVITY_TAB_EVIDENCIAS = 1
const val ACTIVITY_TAB_HISTORIAL = 2

private val ACTIVITY_TABS = listOf("Detalle", "Evidencias", "Historial")

/**
 * Detalle de actividad de Core: Detalle · Evidencias · Historial, igual que
 * ActivityDetailShell en la web con `core`. Operación, viáticos, equipo,
 * materiales, incidencias y aprobaciones ya no son pestañas de Core.
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
    // Aquí cae el push de «actividad nueva», así que el botón también vive en el detalle.
    val coreRepo = remember(context) { CoreActivitiesRepository(context) }
    var iniciando by remember(activity.id) { mutableStateOf(false) }
    var iniciarError by remember(activity.id) { mutableStateOf<String?>(null) }
    val miFila = detail.assignees?.firstOrNull { it.user?.id == user?.id && it.retiradoAt.isNullOrBlank() }
    val puedeIniciar = miFila != null && ActivitySemaforo.puedeIniciar(
        aceptacion = miFila.aceptacion,
        inicioRealAt = miFila.inicioRealAt,
        // El LEAD de un despacho solo reparte: no la ejecuta.
        despachador = detail.assignmentCharge == "despacho" && miFila.rol == "LEAD",
        estatus = detail.estatus,
    )

    LaunchedEffect(activity.id, recarga) {
        loadingDetail = true
        detail = runCatching {
            withContext(Dispatchers.IO) { repo.activityById(activity.id) }
        }.getOrElse { detail }
        editEstatus = detail.estatus
        editPrioridad = detail.prioridad ?: ""
        editDescripcion = detail.descripcion ?: ""
        editIndicaciones = detail.indicaciones ?: ""
        editFechaInicio = detail.fechaInicio?.take(16) ?: ""
        editFechaEntrega = detail.fechaEntregaEsperada?.take(10) ?: ""
        editFechaFin = detail.fechaFinalizacion?.take(16) ?: ""
        loadingDetail = false
    }

    Scaffold(
        snackbarHost = { NxSnackbarHost(snackbarHostState) },
        modifier = Modifier.fillMaxSize(),
    ) { padding ->
        Column(Modifier.fillMaxSize().padding(padding)) {
            // Sin «← Volver» propio: la barra superior de Core ya trae la flecha.
            Row(
                Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 8.dp),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(8.dp),
            ) {
                Column(Modifier.weight(1f)) {
                    Text(
                        detail.titulo?.takeIf { it.isNotBlank() }
                            ?: detail.anNumber?.takeIf { it.isNotBlank() }
                            ?: "Actividad #${detail.id}",
                        style = MaterialTheme.typography.titleMedium.copy(fontWeight = FontWeight.Bold),
                        maxLines = 2,
                    )
                    val meta = listOfNotNull(
                        detail.anNumber?.takeIf { it.isNotBlank() }?.let { "Folio $it" },
                        detail.coreKind?.let { CoreActivityRules.kindLabel(it, detail.ticketTypeCustom) },
                    ).joinToString(" · ")
                    if (meta.isNotBlank()) {
                        Text(meta, fontSize = 12.sp, color = NxColors.Muted, maxLines = 1)
                    }
                }
            }

            // Cancelada por un superior: quién y por qué, visible en las tres pestañas.
            ActivitySuperiorRules.avisoCancelada(detail)?.let { aviso ->
                Row(
                    Modifier
                        .fillMaxWidth()
                        .padding(horizontal = 16.dp, vertical = 4.dp)
                        .clip(RoundedCornerShape(10.dp))
                        .background(NxColors.DangerSoft)
                        .padding(horizontal = 12.dp, vertical = 8.dp),
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(8.dp),
                ) {
                    Icon(Icons.Outlined.Block, contentDescription = null, tint = NxColors.Danger, modifier = Modifier.size(18.dp))
                    Column(Modifier.weight(1f)) {
                        Text(aviso, fontSize = 13.sp, fontWeight = FontWeight.SemiBold, color = Color(0xFF991B1B))
                        CoreActivityRules.formatWhen(detail.cancelledAt)?.let {
                            Text(it, fontSize = 11.5.sp, color = NxColors.Muted)
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

            TabRow(selectedTabIndex = selectedTab) {
                ACTIVITY_TABS.forEachIndexed { i, label ->
                    Tab(
                        selected = selectedTab == i,
                        onClick = { selectedTab = i },
                        text = { Text(label, fontSize = 13.sp) },
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
                                // «Iniciar actividad»: la única acción de quien la recibe (aquí cae el push).
                                Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                                    if (puedeIniciar) {
                                        IniciarActividadBanner(
                                            onIniciar = {
                                                scope.launch {
                                                    iniciando = true
                                                    iniciarError = null
                                                    try {
                                                        withContext(Dispatchers.IO) {
                                                            coreRepo.iniciarActividad(detail.id)
                                                        }
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
                                            },
                                            guardando = iniciando,
                                            error = iniciarError,
                                        )
                                    }
                                    val luz = ActivitySemaforo.luz(detail.semaforo)
                                    val planReal = ActivitySemaforo.planRealTexto(
                                        detail.minutosPlan,
                                        detail.minutosReales,
                                    )
                                    val asignadaPor = ActivitySemaforo.asignadaPorTexto(detail.asignadoPor?.nombre)
                                    if (luz != null || planReal != null || asignadaPor != null) {
                                        Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                                            luz?.let { ToneChip("● ${it.etiqueta}", it.color) }
                                            planReal?.let {
                                                ToneChip(it, ActivitySemaforo.planRealColor(detail.excedida))
                                            }
                                            asignadaPor?.let { ToneChip(it) }
                                        }
                                    }
                                }
                            },
                            extraContent = {
                                NxPanelShell {
                                    Text(
                                        "Evidencias del equipo",
                                        style = MaterialTheme.typography.titleSmall.copy(fontWeight = FontWeight.Bold),
                                        color = NxColors.Slate,
                                    )
                                    TeamEvidenceSection(
                                        activityId = detail.id,
                                        compact = true,
                                        onOpenFull = { selectedTab = ACTIVITY_TAB_EVIDENCIAS },
                                    )
                                }
                            },
                        )
                    }
                }
                ACTIVITY_TAB_EVIDENCIAS -> {
                    if (loadingDetail) {
                        NxLoadingBlock("Cargando evidencias…")
                    } else {
                        ActivityEvidenciasTab(activity = detail)
                    }
                }
                else -> ActivityHistorialTab(activity = detail)
            }
        }
    }
}
