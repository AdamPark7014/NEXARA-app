package mx.nexara.mobile.nativeapp.ui.console.activities

import androidx.compose.foundation.layout.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import mx.nexara.mobile.nativeapp.data.AuthRepository
import mx.nexara.mobile.nativeapp.data.api.ActivityDto
import mx.nexara.mobile.nativeapp.data.api.ActivityEvidenceDetailDto
import mx.nexara.mobile.nativeapp.data.console.ConsoleRepository
import mx.nexara.mobile.nativeapp.ui.enterprise.NxLoadingBlock
import mx.nexara.mobile.nativeapp.ui.enterprise.NxSnackbarHost
import mx.nexara.mobile.nativeapp.ui.enterprise.rememberNxSnackbarHostState

@Composable
fun ActivityDetailScreen(
    activity: ActivityDto,
    onBack: () -> Unit,
    onCaptureEvidence: ((Long) -> Unit)? = null,
    initialTab: Int = 0,
    onOpenGps: (() -> Unit)? = null,
) {
    val context = LocalContext.current
    val authRepo = remember(context) { AuthRepository(context) }
    val user = remember { authRepo.loadSession() }
    val repo = remember(context) { ConsoleRepository(context) }
    var selectedTab by remember { mutableIntStateOf(initialTab.coerceIn(0, 8)) }
    val tabs = listOf("Info", "Operación", "Evidencias", "Viáticos", "Equipo", "Materiales", "Historial", "Incidencias", "Aprobaciones")
    var detail by remember(activity.id) { mutableStateOf(activity) }
    var loadingDetail by remember(activity.id) { mutableStateOf(true) }
    var evidence by remember { mutableStateOf<ActivityEvidenceDetailDto?>(null) }
    var loadingEv by remember { mutableStateOf(true) }
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
                detail = updated
                editing = false
                snackbarHostState.showSnackbar("Actividad actualizada")
            } catch (e: Exception) {
                saveError = e.message?.takeIf { m -> m.isNotBlank() } ?: "No se pudo guardar"
            } finally {
                saving = false
            }
        }
    }

    LaunchedEffect(activity.id) {
        loadingDetail = true
        detail = runCatching {
            withContext(Dispatchers.IO) { repo.activityById(activity.id) }
        }.getOrElse { activity }
        editEstatus = detail.estatus
        editPrioridad = detail.prioridad ?: ""
        editDescripcion = detail.descripcion ?: ""
        editIndicaciones = detail.indicaciones ?: ""
        editFechaInicio = detail.fechaInicio?.take(16) ?: ""
        editFechaEntrega = detail.fechaEntregaEsperada?.take(10) ?: ""
        editFechaFin = detail.fechaFinalizacion?.take(16) ?: ""
        loadingDetail = false
    }

    LaunchedEffect(activity.id) {
        loadingEv = true
        evidence = runCatching {
            withContext(Dispatchers.IO) { repo.evidenceByActivity(activity.id) }
        }.getOrNull()
        loadingEv = false
    }

    Scaffold(
        snackbarHost = { NxSnackbarHost(snackbarHostState) },
        modifier = Modifier.fillMaxSize(),
    ) { padding ->
    Column(Modifier.fillMaxSize().padding(padding)) {
        Row(
            Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 8.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(8.dp),
        ) {
            TextButton(onClick = onBack) { Text("← Volver") }
            Text(
                detail.titulo?.takeIf { it.isNotBlank() }
                    ?: detail.anNumber?.takeIf { it.isNotBlank() }
                    ?: "Actividad #${detail.id}",
                style = MaterialTheme.typography.titleMedium.copy(fontWeight = FontWeight.Bold),
                modifier = Modifier.weight(1f),
                maxLines = 2,
            )
        }

        if (onCaptureEvidence != null) {
            Button(
                onClick = { onCaptureEvidence(detail.id) },
                modifier = Modifier.fillMaxWidth().padding(horizontal = 16.dp),
            ) { Text("Capturar / continuar evidencias") }
        }

        TabRow(selectedTabIndex = selectedTab) {
            tabs.forEachIndexed { i, label ->
                Tab(selected = selectedTab == i, onClick = { selectedTab = i }, text = { Text(label, fontSize = 12.sp) })
            }
        }

        when (selectedTab) {
            0 -> {
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
                    )
                }
            }
            1 -> ActivityOperacionTab(
                activity = detail,
                evidence = evidence,
                onOpenGps = onOpenGps,
            )
            2 -> ActivityEvidenceTab(evidence, loadingEv, onCapture = {
                onCaptureEvidence?.invoke(detail.id)
            })
            3 -> ActivityViaticsTab(
                activityId = detail.id,
                defaultAssigneeId = detail.responsableId ?: detail.responsable?.id,
                canAssign = isSuperAdmin || perms.any {
                    it.contains("viatics.manage") || it.contains("console.admin")
                },
                canCreate = !isSuperAdmin && (canExecute || perms.any { it.contains("viatics.create") }),
            )
            4 -> ActivityTeamTab(activityId = detail.id)
            5 -> ActivityMaterialsTab(activityId = detail.id)
            6 -> ActivityTimelineTab(activityId = detail.id)
            7 -> ActivityIssuesTab(activityId = detail.id, canManage = canManage)
            else -> ActivityApprovalsTab(evidence, loadingEv)
        }
    }
    }
}
