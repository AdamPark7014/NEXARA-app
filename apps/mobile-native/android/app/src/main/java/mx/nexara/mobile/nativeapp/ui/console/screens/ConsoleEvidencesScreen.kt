package mx.nexara.mobile.nativeapp.ui.console.screens

import android.app.Application
import android.util.Base64
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import androidx.lifecycle.viewmodel.compose.viewModel
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import mx.nexara.mobile.nativeapp.data.AuthRepository
import mx.nexara.mobile.nativeapp.data.api.ActivityEvidenceDetailDto
import mx.nexara.mobile.nativeapp.data.api.ActivityEvidenceRowDto
import mx.nexara.mobile.nativeapp.data.console.ConsoleRepository
import mx.nexara.mobile.nativeapp.data.realtime.refreshOnModels
import mx.nexara.mobile.nativeapp.ui.common.CapturedMedia
import mx.nexara.mobile.nativeapp.ui.common.MediaPickerBar
import mx.nexara.mobile.nativeapp.ui.util.openExternalUrl
import mx.nexara.mobile.nativeapp.ui.util.savePdfToCache
import mx.nexara.mobile.nativeapp.ui.util.openPdfFile

// ── State & VM ───────────────────────────────────────────────────────────────

data class EvidencesUiState(
    val isLoading: Boolean = true,
    val error: String? = null,
    val query: String = "",
    val statusFilter: String = "Todos",
    val teamRows: List<ActivityEvidenceRowDto> = emptyList(),
    val myRows: List<ActivityEvidenceRowDto> = emptyList(),
    val myAssignedActivities: List<mx.nexara.mobile.nativeapp.data.api.ActivityDto> = emptyList(),
    val selectedActivityId: Long? = null,
    val selectedEvidence: ActivityEvidenceDetailDto? = null,
    val uploadingStep: String? = null,
    val uploadMessage: String? = null,
    val downloadingReport: Boolean = false,
)

class ConsoleEvidencesViewModel(app: Application) : AndroidViewModel(app) {
    private val repo = ConsoleRepository(app.applicationContext)
    private val _state = MutableStateFlow(EvidencesUiState())
    val state: StateFlow<EvidencesUiState> = _state

    init {
        refreshOnModels(
            models = setOf("ActivityEvidence", "ServiceSheet", "Activity"),
            refresh = { loadAll() },
        )
    }

    fun setQuery(v: String) = _state.update { it.copy(query = v) }
    fun setStatusFilter(v: String) = _state.update { it.copy(statusFilter = v) }
    fun setSelectedActivityId(v: Long?) {
        _state.update { it.copy(selectedActivityId = v, selectedEvidence = null, uploadMessage = null) }
        if (v != null) loadActivityEvidence(v)
    }

    private fun setUploading(step: String?) {
        _state.update { it.copy(uploadingStep = step) }
    }

    private fun setUploadMessage(message: String?) {
        _state.update { it.copy(uploadMessage = message) }
    }

    fun clearUploadMessage() = setUploadMessage(null)

    fun loadActivityEvidence(activityId: Long) {
        viewModelScope.launch {
            val evidence = withContext(Dispatchers.IO) {
                runCatching { repo.evidenceByActivity(activityId) }.getOrNull()
            }
            _state.update { it.copy(selectedEvidence = evidence) }
        }
    }

    fun submitEntryPhoto(activityId: Long, photoDataUrl: String, lat: Double = 0.0, lng: Double = 0.0) {
        setUploading("entry")
        setUploadMessage(null)
        viewModelScope.launch {
            try {
                val updated = withContext(Dispatchers.IO) {
                    repo.evidenceEntryPhoto(activityId = activityId, photoUrl = photoDataUrl, lat = lat, lng = lng)
                }
                _state.update { it.copy(selectedEvidence = updated) }
                setUploadMessage("Entrada guardada. Sigue con fotos de evidencia.")
            } catch (e: Exception) {
                setUploadMessage(e.message?.takeIf { it.isNotBlank() } ?: "No se pudo guardar la foto de entrada")
            } finally {
                setUploading(null)
            }
        }
    }

    fun submitEvidencePhotos(activityId: Long, photoDataUrls: List<String>) {
        setUploading("evidencePhotos")
        setUploadMessage(null)
        viewModelScope.launch {
            try {
                val updated = withContext(Dispatchers.IO) {
                    repo.evidencePhotos(activityId = activityId, photoUrls = photoDataUrls)
                }
                _state.update { it.copy(selectedEvidence = updated) }
                setUploadMessage("Evidencias guardadas. Sube la hoja PDF.")
            } catch (e: Exception) {
                setUploadMessage(e.message?.takeIf { it.isNotBlank() } ?: "No se pudieron guardar las evidencias")
            } finally {
                setUploading(null)
            }
        }
    }

    fun submitServiceSheetPdf(activityId: Long, pdfDataUrl: String) {
        setUploading("pdf")
        setUploadMessage(null)
        viewModelScope.launch {
            try {
                val updated = withContext(Dispatchers.IO) {
                    repo.evidenceServiceSheetPdf(activityId = activityId, pdfUrl = pdfDataUrl)
                }
                _state.update { it.copy(selectedEvidence = updated) }
                setUploadMessage("PDF guardado. Completa la plantilla interna.")
            } catch (e: Exception) {
                setUploadMessage(e.message?.takeIf { it.isNotBlank() } ?: "No se pudo guardar el PDF")
            } finally {
                setUploading(null)
            }
        }
    }

    fun completeServiceSheetData(activityId: Long) {
        setUploading("serviceData")
        setUploadMessage(null)
        viewModelScope.launch {
            try {
                val updated = withContext(Dispatchers.IO) {
                    repo.evidenceServiceSheetData(
                        activityId = activityId,
                        data = mapOf(
                            "source" to "mobile-native",
                            "completedAt" to java.time.Instant.now().toString(),
                            "notes" to "Plantilla completada desde app nativa"
                        )
                    )
                }
                _state.update { it.copy(selectedEvidence = updated) }
                setUploadMessage("Plantilla completada. Sube foto de salida.")
            } catch (e: Exception) {
                setUploadMessage(e.message?.takeIf { it.isNotBlank() } ?: "No se pudo completar la plantilla")
            } finally {
                setUploading(null)
            }
        }
    }

    fun submitExitPhoto(activityId: Long, photoDataUrl: String, lat: Double = 0.0, lng: Double = 0.0) {
        setUploading("exit")
        setUploadMessage(null)
        viewModelScope.launch {
            try {
                val updated = withContext(Dispatchers.IO) {
                    repo.evidenceExitPhoto(activityId = activityId, photoUrl = photoDataUrl, lat = lat, lng = lng)
                }
                _state.update { it.copy(selectedEvidence = updated) }
                setUploadMessage("Flujo completado. Evidencia enviada para revisión.")
            } catch (e: Exception) {
                setUploadMessage(e.message?.takeIf { it.isNotBlank() } ?: "No se pudo guardar la foto de salida")
            } finally {
                setUploading(null)
            }
        }
    }

    fun downloadEvidenceReport(activityId: Long, onBytes: (ByteArray) -> Unit, onError: (String) -> Unit) {
        _state.update { it.copy(downloadingReport = true) }
        viewModelScope.launch {
            try {
                val bytes = withContext(Dispatchers.IO) { repo.myTicketReportPdf(activityId).bytes() }
                _state.update { it.copy(downloadingReport = false) }
                onBytes(bytes)
            } catch (e: Exception) {
                _state.update { it.copy(downloadingReport = false) }
                onError(e.message ?: "Error al descargar")
            }
        }
    }

    fun loadAll(isAdmin: Boolean = false, isSuperAdmin: Boolean = false, currentUserId: Long? = null) {
        _state.update { it.copy(isLoading = true, error = null) }
        viewModelScope.launch {
            try {
                val team = if (isAdmin || isSuperAdmin) {
                    withContext(Dispatchers.IO) { repo.evidencesReviewHistory() }
                } else emptyList()
                val mine = if (!isSuperAdmin) {
                    withContext(Dispatchers.IO) { repo.evidencesMyHistory() }
                } else emptyList()

                val assignedMine = if (!isSuperAdmin) {
                    withContext(Dispatchers.IO) {
                        val scopedMine = runCatching { repo.activitiesFetch(scope = "mine") }.getOrDefault(emptyList())
                        if (scopedMine.isNotEmpty() || currentUserId == null) {
                            scopedMine
                        } else {
                            repo.activitiesFetch(scope = null).filter { a ->
                                a.responsableId == currentUserId || a.responsable?.id == currentUserId
                            }
                        }
                    }
                } else emptyList()

                _state.update {
                    it.copy(
                        isLoading = false,
                        teamRows = team,
                        myRows = mine,
                        myAssignedActivities = assignedMine.distinctBy { a -> a.id },
                        error = null,
                    )
                }
                _state.value.selectedActivityId?.let { loadActivityEvidence(it) }
            } catch (e: Exception) {
                _state.update {
                    it.copy(isLoading = false, error = e.message?.takeIf { m -> m.isNotBlank() } ?: "No se pudieron cargar evidencias")
                }
            }
        }
    }
}

// ── Colors ───────────────────────────────────────────────────────────────────

private val EvSlate = Color(0xFF0F172A)
private val EvSub = Color(0xFF64748B)
private val EvTeal = Color(0xFF0D9488)
private val EvTealLight = Color(0xFFCCFBF1)
private val EvGreen = Color(0xFF10B981)
private val EvAmber = Color(0xFFF59E0B)
private val EvRed = Color(0xFFEF4444)
private val EvBlue = Color(0xFF3B82F6)

private fun evidenceStatusColor(status: String?): Color {
    val s = (status ?: "").lowercase()
    return when {
        s.contains("aprobad") || s.contains("completad") -> EvGreen
        s.contains("revisión") || s.contains("revision") || s.contains("pendiente") -> EvAmber
        s.contains("rechazad") || s.contains("observacion") -> EvRed
        s.contains("enviada") || s.contains("entregada") -> EvBlue
        else -> EvSub
    }
}

private val EV_STATUS_FILTERS = listOf("Todos", "Pendiente", "Aprobada", "Rechazada")

// ── Main composable ──────────────────────────────────────────────────────────

@Composable
@OptIn(ExperimentalMaterial3Api::class)
fun ConsoleEvidencesScreen(
    mode: String = "combined", // "admin" | "user" | "combined"
    contentPadding: PaddingValues = PaddingValues(16.dp),
) {
    val context = LocalContext.current
    val authRepo = remember(context) { AuthRepository(context) }
    val user = remember { authRepo.loadSession() }
    val isSuperAdmin = user?.isSuperAdmin == true
    val isAdmin = !isSuperAdmin && (user?.permissions ?: emptyList()).contains("console.admin")

    // Effective flags based on mode param & role
    val showTeam = mode == "admin" || mode == "combined" || (isAdmin || isSuperAdmin)
    val showMine = mode == "user" || mode == "combined" || !isSuperAdmin

    val vm: ConsoleEvidencesViewModel = viewModel()
    val state by vm.state.collectAsState()

    if (state.isLoading && state.error == null && state.teamRows.isEmpty() && state.myRows.isEmpty()) {
        vm.loadAll(isAdmin = isAdmin || showTeam, isSuperAdmin = isSuperAdmin, currentUserId = user?.id)
    }

    val q = state.query.trim().lowercase()
    fun filterList(list: List<ActivityEvidenceRowDto>) = list
        .filter { r ->
            if (state.statusFilter == "Todos") true
            else (r.estatus ?: "").lowercase() == state.statusFilter.lowercase()
        }
        .filter { r ->
            if (q.isBlank()) true else buildString {
                append(r.estatus ?: ""); append(" "); append(r.tipoEvidencia ?: "")
                append(" "); append(r.actividad?.anNumber ?: ""); append(" ")
                append(r.actividad?.titulo ?: ""); append(" "); append(r.user?.nombre ?: "")
                append(" "); append(r.actividad?.branchName ?: "")
            }.lowercase().contains(q)
        }

    val teamFiltered = filterList(state.teamRows)
    val myFiltered = filterList(state.myRows)
    val myEvidenceActivityIds = remember(state.myRows) {
        state.myRows.mapNotNull { it.actividad?.id }.toSet()
    }
    val myPendingEvidenceActivities = remember(state.myAssignedActivities, myEvidenceActivityIds) {
        state.myAssignedActivities.filter { a -> !myEvidenceActivityIds.contains(a.id) }
    }
    val selectedActivity = remember(state.selectedActivityId, state.myAssignedActivities) {
        state.myAssignedActivities.firstOrNull { it.id == state.selectedActivityId }
    }
    var pickEntryPhoto by remember { mutableStateOf(false) }
    var pickEvidencePhotos by remember { mutableStateOf(false) }
    var pickPdf by remember { mutableStateOf(false) }
    var pickExitPhoto by remember { mutableStateOf(false) }

    fun mediaToDataUrl(media: CapturedMedia): String? {
        val bytes = runCatching { context.contentResolver.openInputStream(media.uri)?.use { it.readBytes() } }.getOrNull()
            ?: return null
        val mime = media.mimeType.takeIf { it.isNotBlank() } ?: "application/octet-stream"
        val encoded = Base64.encodeToString(bytes, Base64.NO_WRAP)
        return "data:$mime;base64,$encoded"
    }

    LazyColumn(
        modifier = Modifier.fillMaxSize().padding(contentPadding),
        verticalArrangement = Arrangement.spacedBy(0.dp),
    ) {
        // Header: only counts (title in TopAppBar)
        item {
            Column {
                Text(
                    buildString {
                        if (showTeam && (isAdmin || isSuperAdmin)) {
                            append("${state.teamRows.size} del equipo")
                        }
                        if (showMine && !isSuperAdmin) {
                            if (isNotEmpty()) append("  ·  ")
                            append("${state.myRows.size} historial")
                            append("  ·  ${state.myAssignedActivities.size} asignadas")
                        }
                    },
                    style = MaterialTheme.typography.bodySmall,
                    color = EvSub,
                )
                Spacer(Modifier.height(12.dp))
            }
        }

        if (state.isLoading) {
            item { Text("Cargando evidencias...", color = EvSub) }
            return@LazyColumn
        }

        if (!state.error.isNullOrBlank()) {
            item {
                Text(state.error!!, color = MaterialTheme.colorScheme.error)
                Spacer(Modifier.height(8.dp))
                Button(onClick = { vm.loadAll(isAdmin || showTeam, isSuperAdmin, currentUserId = user?.id) }) { Text("Reintentar") }
            }
            return@LazyColumn
        }

        // Activity selector for evidence workflow parity (web has this in ActivityEvidenceFlow)
        if (!isSuperAdmin && showMine) {
            item {
                Card(
                    modifier = Modifier.fillMaxWidth(),
                    shape = RoundedCornerShape(14.dp),
                    colors = CardDefaults.cardColors(containerColor = Color(0xFFF8FAFC)),
                    elevation = CardDefaults.cardElevation(0.dp),
                ) {
                    Column(modifier = Modifier.padding(14.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                        Text(
                            "Selecciona una actividad",
                            style = MaterialTheme.typography.titleMedium.copy(fontWeight = FontWeight.Bold),
                            color = EvTeal,
                        )
                        Text(
                            "Asignadas: ${state.myAssignedActivities.size} · Sin evidencia iniciada: ${myPendingEvidenceActivities.size}",
                            style = MaterialTheme.typography.bodySmall,
                            color = EvSub,
                        )

                        var expanded by remember { mutableStateOf(false) }
                        val activityOptions = state.myAssignedActivities
                        ExposedDropdownMenuBox(
                            expanded = expanded,
                            onExpandedChange = { expanded = !expanded },
                        ) {
                            OutlinedTextField(
                                value = selectedActivity?.let { a ->
                                    listOfNotNull(a.titulo, a.estatus).joinToString(" · ").ifBlank { "Actividad #${a.id}" }
                                } ?: "-- Selecciona una actividad --",
                                onValueChange = {},
                                readOnly = true,
                                trailingIcon = { ExposedDropdownMenuDefaults.TrailingIcon(expanded = expanded) },
                                modifier = Modifier.fillMaxWidth().menuAnchor(MenuAnchorType.PrimaryNotEditable, enabled = true),
                                shape = RoundedCornerShape(12.dp),
                            )
                            ExposedDropdownMenu(expanded = expanded, onDismissRequest = { expanded = false }) {
                                activityOptions.forEach { a ->
                                    DropdownMenuItem(
                                        text = {
                                            Text(
                                                listOfNotNull(a.titulo, a.estatus).joinToString(" · ").ifBlank { "Actividad #${a.id}" },
                                                maxLines = 1,
                                            )
                                        },
                                        onClick = {
                                            vm.setSelectedActivityId(a.id)
                                            expanded = false
                                        },
                                    )
                                }
                            }
                        }

                        if (selectedActivity != null) {
                            val evidence = state.selectedEvidence
                            val currentStep = evidence?.status ?: "ENTRY_PHOTO"

                            Text(
                                "AN: ${selectedActivity.titulo ?: "Actividad #${selectedActivity.id}"} · Estatus: ${selectedActivity.estatus}",
                                style = MaterialTheme.typography.bodySmall,
                                color = Color(0xFF0F172A),
                            )
                            Spacer(Modifier.height(6.dp))
                            Text(
                                "Paso actual: $currentStep",
                                style = MaterialTheme.typography.labelMedium.copy(fontWeight = FontWeight.SemiBold),
                                color = EvTeal,
                            )

                            state.uploadMessage?.let { msg ->
                                Spacer(Modifier.height(4.dp))
                                Text(
                                    msg,
                                    style = MaterialTheme.typography.bodySmall,
                                    color = if (msg.contains("No se pudo") || msg.contains("error", true)) EvRed else EvGreen,
                                )
                            }

                            Spacer(Modifier.height(10.dp))

                            OutlinedButton(
                                onClick = {
                                    vm.clearUploadMessage()
                                    pickEntryPhoto = true
                                    pickEvidencePhotos = false
                                    pickPdf = false
                                    pickExitPhoto = false
                                },
                                enabled = state.uploadingStep == null && currentStep == "ENTRY_PHOTO",
                                modifier = Modifier.fillMaxWidth(),
                            ) {
                                Text("1) Subir foto de entrada")
                            }
                            if (pickEntryPhoto && currentStep == "ENTRY_PHOTO") {
                                MediaPickerBar(
                                    onPicked = { picked ->
                                        val first = picked.firstOrNull() ?: return@MediaPickerBar
                                        val dataUrl = mediaToDataUrl(first)
                                        if (dataUrl == null) {
                                            vm.clearUploadMessage()
                                            return@MediaPickerBar
                                        }
                                        vm.submitEntryPhoto(selectedActivity.id, dataUrl)
                                        pickEntryPhoto = false
                                    },
                                    allowCamera = true,
                                    allowGallery = false,
                                    allowDocuments = false,
                                )
                            }

                            OutlinedButton(
                                onClick = {
                                    vm.clearUploadMessage()
                                    pickEvidencePhotos = true
                                    pickEntryPhoto = false
                                    pickPdf = false
                                    pickExitPhoto = false
                                },
                                enabled = state.uploadingStep == null && currentStep == "EVIDENCE_PHOTOS",
                                modifier = Modifier.fillMaxWidth(),
                            ) {
                                Text("2) Subir fotos de evidencia (4+)")
                            }
                            if (pickEvidencePhotos && currentStep == "EVIDENCE_PHOTOS") {
                                MediaPickerBar(
                                    onPicked = { picked ->
                                        val dataUrls = picked.mapNotNull { mediaToDataUrl(it) }
                                        if (dataUrls.isEmpty()) return@MediaPickerBar
                                        vm.submitEvidencePhotos(selectedActivity.id, dataUrls)
                                        pickEvidencePhotos = false
                                    },
                                    allowCamera = true,
                                    allowGallery = false,
                                    allowDocuments = false,
                                )
                            }

                            OutlinedButton(
                                onClick = {
                                    vm.clearUploadMessage()
                                    pickPdf = true
                                    pickEntryPhoto = false
                                    pickEvidencePhotos = false
                                    pickExitPhoto = false
                                },
                                enabled = state.uploadingStep == null && currentStep == "SERVICE_SHEET_PDF",
                                modifier = Modifier.fillMaxWidth(),
                            ) {
                                Text("3) Subir hoja de servicio PDF")
                            }
                            if (pickPdf && currentStep == "SERVICE_SHEET_PDF") {
                                MediaPickerBar(
                                    onPicked = { picked ->
                                        val first = picked.firstOrNull() ?: return@MediaPickerBar
                                        if (!first.mimeType.contains("pdf", ignoreCase = true)) return@MediaPickerBar
                                        val dataUrl = mediaToDataUrl(first) ?: return@MediaPickerBar
                                        vm.submitServiceSheetPdf(selectedActivity.id, dataUrl)
                                        pickPdf = false
                                    },
                                    allowCamera = false,
                                    allowGallery = false,
                                    allowDocuments = true,
                                )
                            }

                            OutlinedButton(
                                onClick = { vm.completeServiceSheetData(selectedActivity.id) },
                                enabled = state.uploadingStep == null && currentStep == "SERVICE_SHEET_DATA",
                                modifier = Modifier.fillMaxWidth(),
                            ) {
                                Text("4) Completar plantilla interna")
                            }

                            OutlinedButton(
                                onClick = {
                                    vm.clearUploadMessage()
                                    pickExitPhoto = true
                                    pickEntryPhoto = false
                                    pickEvidencePhotos = false
                                    pickPdf = false
                                },
                                enabled = state.uploadingStep == null && currentStep == "EXIT_PHOTO",
                                modifier = Modifier.fillMaxWidth(),
                            ) {
                                Text("5) Subir foto de salida")
                            }
                            if (pickExitPhoto && currentStep == "EXIT_PHOTO") {
                                MediaPickerBar(
                                    onPicked = { picked ->
                                        val first = picked.firstOrNull() ?: return@MediaPickerBar
                                        val dataUrl = mediaToDataUrl(first) ?: return@MediaPickerBar
                                        vm.submitExitPhoto(selectedActivity.id, dataUrl)
                                        pickExitPhoto = false
                                    },
                                    allowCamera = true,
                                    allowGallery = false,
                                    allowDocuments = false,
                                )
                            }
                        }

                        OutlinedButton(
                            onClick = {
                                openExternalUrl(
                                    context = context,
                                    url = "https://consola.nexara.com.mx/my-evidences",
                                )
                            },
                        ) {
                            Text("Abrir flujo completo en web")
                        }

                        // Download evidence PDF report if evidence is completed
                        val evidenceStatus = state.selectedEvidence?.status?.uppercase() ?: ""
                        if (evidenceStatus == "COMPLETED" || evidenceStatus == "APPROVED" || evidenceStatus.contains("APROBAD")) {
                            OutlinedButton(
                                onClick = {
                                    val actId = selectedActivity?.id ?: return@OutlinedButton
                                    vm.downloadEvidenceReport(
                                        activityId = actId,
                                        onBytes = { bytes ->
                                            val file = savePdfToCache(context, "reporte-evidencia-$actId.pdf", bytes)
                                            openPdfFile(context, file)
                                        },
                                        onError = { /* silently ignore */ },
                                    )
                                },
                                enabled = !state.downloadingReport,
                            ) {
                                Text(if (state.downloadingReport) "Descargando…" else "📄 Descargar reporte PDF")
                            }
                        }
                    }
                }
                Spacer(Modifier.height(12.dp))
            }
        }

        // Search
        item {
            OutlinedTextField(
                value = state.query,
                onValueChange = vm::setQuery,
                label = { Text("Buscar (AN, usuario, estatus)") },
                singleLine = true,
                modifier = Modifier.fillMaxWidth(),
                shape = RoundedCornerShape(12.dp),
            )
            Spacer(Modifier.height(10.dp))
        }

        // Status filter chips
        item {
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .horizontalScroll(rememberScrollState()),
                horizontalArrangement = Arrangement.spacedBy(8.dp),
            ) {
                EV_STATUS_FILTERS.forEach { opt ->
                    val sel = state.statusFilter == opt
                    Box(
                        modifier = Modifier
                            .clip(RoundedCornerShape(20.dp))
                            .background(if (sel) EvTeal else Color(0xFFF1F5F9))
                            .clickable { vm.setStatusFilter(opt) }
                            .padding(horizontal = 14.dp, vertical = 7.dp),
                    ) {
                        Text(
                            opt,
                            style = MaterialTheme.typography.labelMedium.copy(fontWeight = FontWeight.SemiBold),
                            color = if (sel) Color.White else Color(0xFF475569),
                        )
                    }
                }
            }
            Spacer(Modifier.height(16.dp))
        }

        // ── Team section (admin review) ──────────────────────────────────────
        if (showTeam && (isAdmin || isSuperAdmin)) {
            item {
                EvidenceSectionHeader(
                    label = if (isSuperAdmin) "Todas las evidencias — Revisión" else "Evidencias del equipo — Revisión",
                    count = teamFiltered.size,
                    icon = "🔍",
                )
                Spacer(Modifier.height(8.dp))
            }
            if (teamFiltered.isEmpty()) {
                item {
                    Text("Sin evidencias con este filtro", color = Color(0xFF94A3B8), modifier = Modifier.padding(vertical = 8.dp))
                    Spacer(Modifier.height(8.dp))
                }
            } else {
                items(teamFiltered.take(100)) { r ->
                    EvidenceCard(r, context)
                    Spacer(Modifier.height(8.dp))
                }
            }
        }

        // Divider between sections
        if ((isAdmin || isSuperAdmin) && !isSuperAdmin && showMine) {
            item {
                HorizontalDivider(color = Color(0xFFE2E8F0), modifier = Modifier.padding(vertical = 8.dp))
            }
        }

        // ── Personal evidences (not superadmin) ──────────────────────────────
        if (showMine && !isSuperAdmin) {
            item {
                Column {
                    Text(
                        "MI ESPACIO DE TRABAJO",
                        style = MaterialTheme.typography.labelSmall.copy(fontWeight = FontWeight.Bold, letterSpacing = 1.sp),
                        color = EvSub,
                    )
                    Spacer(Modifier.height(2.dp))
                }
                EvidenceSectionHeader(label = "Mis evidencias", count = myFiltered.size, icon = "📸")
                Spacer(Modifier.height(8.dp))
            }

            // Upload hint card
            item {
                Card(
                    modifier = Modifier.fillMaxWidth(),
                    shape = RoundedCornerShape(14.dp),
                    colors = CardDefaults.cardColors(containerColor = EvTealLight),
                    elevation = CardDefaults.cardElevation(0.dp),
                ) {
                    Row(
                        modifier = Modifier.padding(14.dp),
                        horizontalArrangement = Arrangement.spacedBy(10.dp),
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        Text("ℹ️", fontSize = 22.sp)
                        Column {
                            Text(
                                "Sigue los 5 pasos del flujo de evidencias",
                                style = MaterialTheme.typography.bodyMedium.copy(fontWeight = FontWeight.SemiBold),
                                color = EvTeal,
                            )
                            Text(
                                "Registra, captura fotos y completa tu actividad desde la web o sube archivos directamente.",
                                style = MaterialTheme.typography.bodySmall,
                                color = Color(0xFF0F766E),
                            )
                        }
                    }
                }
                Spacer(Modifier.height(8.dp))
            }

            if (myFiltered.isEmpty()) {
                item {
                    Text("Sin evidencias propias con este filtro", color = Color(0xFF94A3B8), modifier = Modifier.padding(vertical = 8.dp))
                }
            } else {
                items(myFiltered.take(100)) { r ->
                    EvidenceCard(r, context, showOwner = false)
                    Spacer(Modifier.height(8.dp))
                }
            }
        }

        item { Spacer(Modifier.height(24.dp)) }
    }
}

// ── Sub-composables ──────────────────────────────────────────────────────────

@Composable
private fun EvidenceSectionHeader(label: String, count: Int, icon: String) {
    Row(
        modifier = Modifier.fillMaxWidth(),
        horizontalArrangement = Arrangement.SpaceBetween,
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(6.dp)) {
            Text(icon, fontSize = 18.sp)
            Text(
                label,
                style = MaterialTheme.typography.titleMedium.copy(fontWeight = FontWeight.Bold),
                color = EvSlate,
            )
        }
        Box(
            modifier = Modifier
                .clip(RoundedCornerShape(12.dp))
                .background(Color(0xFFE2E8F0))
                .padding(horizontal = 10.dp, vertical = 3.dp),
        ) {
            Text(count.toString(), style = MaterialTheme.typography.labelMedium.copy(fontWeight = FontWeight.Bold), color = Color(0xFF475569))
        }
    }
}

@Composable
private fun EvidenceCard(r: ActivityEvidenceRowDto, context: android.content.Context, showOwner: Boolean = true) {
    val statusColor = evidenceStatusColor(r.estatus)
    Card(
        modifier = Modifier.fillMaxWidth(),
        shape = RoundedCornerShape(14.dp),
        colors = CardDefaults.cardColors(containerColor = Color.White),
        elevation = CardDefaults.cardElevation(2.dp),
    ) {
        Column(modifier = Modifier.padding(14.dp)) {
            Row(
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically,
                modifier = Modifier.fillMaxWidth(),
            ) {
                Column(modifier = Modifier.weight(1f)) {
                    Text(
                        r.actividad?.anNumber ?: "Evidencia #${r.id}",
                        style = MaterialTheme.typography.labelMedium.copy(fontWeight = FontWeight.Bold),
                        color = EvTeal,
                    )
                    val title = r.actividad?.titulo
                    if (!title.isNullOrBlank()) {
                        Text(
                            title,
                            style = MaterialTheme.typography.bodyMedium.copy(fontWeight = FontWeight.SemiBold),
                            color = EvSlate,
                        )
                    }
                }
                Box(
                    modifier = Modifier
                        .clip(RoundedCornerShape(8.dp))
                        .background(statusColor.copy(alpha = 0.13f))
                        .padding(horizontal = 10.dp, vertical = 4.dp),
                ) {
                    Text(
                        r.estatus ?: "–",
                        style = MaterialTheme.typography.labelSmall.copy(fontWeight = FontWeight.SemiBold),
                        color = statusColor,
                    )
                }
            }

            Spacer(Modifier.height(6.dp))

            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                val tipo = r.tipoEvidencia
                if (!tipo.isNullOrBlank()) {
                    Text(tipo, style = MaterialTheme.typography.bodySmall, color = EvSub)
                }
                if (showOwner) {
                    val owner = r.user?.nombre ?: r.actividad?.responsable?.nombre
                    if (!owner.isNullOrBlank()) {
                        Text("· $owner", style = MaterialTheme.typography.bodySmall, color = EvSub)
                    }
                }
                val branch = r.actividad?.branchName
                if (!branch.isNullOrBlank()) {
                    Text("· $branch", style = MaterialTheme.typography.bodySmall, color = EvSub)
                }
            }

            val pdfUrl = r.serviceSheetPdfUrl ?: r.archivoUrl
            if (!pdfUrl.isNullOrBlank()) {
                Spacer(Modifier.height(8.dp))
                OutlinedButton(
                    onClick = { openExternalUrl(context, pdfUrl) },
                    shape = RoundedCornerShape(8.dp),
                    contentPadding = PaddingValues(horizontal = 12.dp, vertical = 6.dp),
                ) {
                    Text("📄 Abrir archivo", style = MaterialTheme.typography.labelMedium)
                }
            }
        }
    }
}

