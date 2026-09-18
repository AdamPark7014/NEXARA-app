package mx.nexara.mobile.nativeapp.ui.console.activities

import android.content.Context
import android.graphics.Bitmap
import android.net.Uri
import android.util.Base64
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.Close
import androidx.compose.material.icons.outlined.CloudOff
import androidx.compose.material.icons.outlined.ErrorOutline
import androidx.compose.material.icons.outlined.Lightbulb
import androidx.compose.material.icons.outlined.WarningAmber
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
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
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import mx.nexara.mobile.nativeapp.data.api.ActivityDto
import mx.nexara.mobile.nativeapp.data.api.ActivityEvidencePdfStepRequest
import mx.nexara.mobile.nativeapp.data.api.ActivityEvidencePhotoStepRequest
import mx.nexara.mobile.nativeapp.data.api.EvidenceCampoDto
import mx.nexara.mobile.nativeapp.data.api.EvidenceFlowDto
import mx.nexara.mobile.nativeapp.data.api.GeocercaDto
import mx.nexara.mobile.nativeapp.util.JornadaGps
import mx.nexara.mobile.nativeapp.data.api.EvidenceFormDataWrapper
import mx.nexara.mobile.nativeapp.data.api.EvidencePhotoGeoRequest
import mx.nexara.mobile.nativeapp.data.api.EvidencePhotosWithGeoRequest
import mx.nexara.mobile.nativeapp.data.api.toUserMessage
import mx.nexara.mobile.nativeapp.data.console.CoreActivitiesRepository
import mx.nexara.mobile.nativeapp.ui.common.GPS_REQUIRED_MESSAGE
import mx.nexara.mobile.nativeapp.ui.common.GeoPhoto
import mx.nexara.mobile.nativeapp.ui.common.GeoPhotoPreviewDialog
import mx.nexara.mobile.nativeapp.ui.common.LiveCameraCaptureDialog
import mx.nexara.mobile.nativeapp.ui.common.ProtectedImage
import mx.nexara.mobile.nativeapp.ui.common.ProtectedPdfButton
import mx.nexara.mobile.nativeapp.ui.console.activities.CoreActivityRules.STEP_COMPLETED
import mx.nexara.mobile.nativeapp.ui.console.activities.CoreActivityRules.STEP_DATA
import mx.nexara.mobile.nativeapp.ui.console.activities.CoreActivityRules.STEP_ENTRY
import mx.nexara.mobile.nativeapp.ui.console.activities.CoreActivityRules.STEP_EXIT
import mx.nexara.mobile.nativeapp.ui.console.activities.CoreActivityRules.STEP_PDF
import mx.nexara.mobile.nativeapp.ui.console.activities.CoreActivityRules.STEP_PHOTOS
import mx.nexara.mobile.nativeapp.ui.enterprise.NxColors
import mx.nexara.mobile.nativeapp.ui.enterprise.NxGlyph
import mx.nexara.mobile.nativeapp.ui.enterprise.NxIconText
import mx.nexara.mobile.nativeapp.ui.enterprise.NxLoadingBlock
import mx.nexara.mobile.nativeapp.ui.enterprise.NxPanelShell
import mx.nexara.mobile.nativeapp.ui.enterprise.icon

private const val KIND_ENTRY = "entry"
private const val KIND_EVIDENCE = "evidence"
private const val KIND_EXIT = "exit"

/** Foto de un campo en un momento (evidencia por campos). */
private const val KIND_CAMPO = "campo"

/** Clave del hueco de un campo: sirve para la miniatura recién tomada. */
private fun campoSlotKey(campoId: Long?, momento: String): String = "${campoId ?: 0L}:$momento"

/** Hoja PDF: el API guarda base64; más de esto no pasa en una red de campo. */
private const val MAX_PDF_BYTES = 15 * 1024 * 1024

private const val MAX_EVIDENCE_PHOTOS = 12

/** Foto de evidencia en borrador: URL del servidor (corrección) o data URL recién tomada. */
private class DraftPhoto(
    val url: String,
    val geo: EvidencePhotoGeoRequest?,
    val thumb: Bitmap?,
)

/**
 * Captura de evidencias de quien ejecuta — paridad con
 * apps/web/components/ActivityEvidenceFlow.tsx:
 * entrada → fotos en sitio → hoja PDF (solo servicio) → formulario → salida.
 *
 * En corrección (`reviewStatus = REJECTED`) cada paso se manda a
 * `activity-evidence/:id/resubmit` con el mismo payload del paso original y el
 * API avanza al siguiente paso devuelto.
 *
 * **Evidencia por campos.** Si la actividad trae `campos`, las fotos en sitio
 * dejan de ser libres: cada campo («Cámara 1», «Rack») pide foto en los
 * momentos que marque el API — antes, en progreso, después — y la foto de
 * salida no se habilita hasta que no falte ninguna. La actividad sin campos se
 * captura exactamente igual que antes.
 */
@Composable
fun EvidenceCaptureFlow(
    activity: ActivityDto,
    onFlowChanged: () -> Unit = {},
) {
    val context = LocalContext.current
    val repo = remember(context) { CoreActivitiesRepository(context) }
    val scope = rememberCoroutineScope()

    var flow by remember(activity.id) { mutableStateOf<EvidenceFlowDto?>(null) }
    var loading by remember(activity.id) { mutableStateOf(true) }
    var loadError by remember(activity.id) { mutableStateOf<String?>(null) }
    var reloadKey by remember { mutableIntStateOf(0) }
    var busy by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf<String?>(null) }
    var success by remember { mutableStateOf<String?>(null) }
    var successIcon by remember { mutableStateOf<ImageVector>(NxGlyph.DONE.icon) }

    LaunchedEffect(activity.id, reloadKey) {
        loading = true
        loadError = null
        try {
            flow = withContext(Dispatchers.IO) { repo.evidenceFlowOrNull(activity.id) }
        } catch (e: Exception) {
            loadError = e.toUserMessage("No se pudieron cargar tus evidencias")
        } finally {
            loading = false
        }
    }

    val coreKind = flow?.activity?.coreKind ?: activity.coreKind
    val photoRequired = (flow?.activity?.evidencePhotoRequired ?: activity.evidencePhotoRequired ?: 4)
        .coerceAtLeast(1)
    val step = flow?.status ?: STEP_ENTRY
    val reviewStatus = flow?.reviewStatus
    val isCorrection = reviewStatus == "REJECTED"
    val locked = CoreActivityRules.isEvidenceLocked(step, reviewStatus)
    val rejected = CoreActivityRules.rejectedStepsList(flow?.rejectedSteps, flow?.rejectedStep)
    val steps = CoreActivityRules.evidenceStepsForKind(coreKind)
    val needsPdf = CoreActivityRules.requiresServiceSheetPdf(coreKind)

    // Evidencia por campos: vacío contra la API de hoy (el flujo no cambia).
    val campos = CoreActivityRules.camposOrdenados(flow?.campos)
    val porCampos = campos.isNotEmpty()
    /** Miniatura local del hueco recién tomado, mientras no se recarga el GET. */
    var camposThumbs by remember(activity.id) { mutableStateOf<Map<String, Bitmap>>(emptyMap()) }
    /** Campo y momento que se está fotografiando (`campoId to momento`). */
    var campoPendiente by remember(activity.id) { mutableStateOf<Pair<Long, String>?>(null) }

    var drafts by remember(activity.id) { mutableStateOf<List<DraftPhoto>>(emptyList()) }
    LaunchedEffect(flow?.id, flow?.status, flow?.evidencePhotos) {
        if (step == STEP_PHOTOS) {
            val current = flow
            drafts = current?.evidencePhotos.orEmpty().mapIndexed { i, url ->
                val geo = CoreActivityRules.geoAt(current?.evidencePhotosGeo, i)
                DraftPhoto(url = url, geo = geo?.toRequest(), thumb = null)
            }
        }
    }

    var formValues by remember(activity.id) { mutableStateOf<Map<String, String>>(emptyMap()) }
    LaunchedEffect(flow?.id, step, coreKind) {
        if (step == STEP_DATA) {
            formValues = CoreActivityRules.initialFormValues(coreKind, flow?.serviceSheetData)
        }
    }

    // Geocerca (100 m del punto de inicio): la tarjeta la carga y aquí se usa para la foto de salida.
    var geocerca by remember(activity.id) { mutableStateOf<GeocercaDto?>(null) }
    LaunchedEffect(activity.id, flow?.status) {
        val enCurso = !flow?.entryPhotoUrl.isNullOrBlank() && step != STEP_COMPLETED && !locked
        // Si la app se reinició con la actividad a medias, el seguimiento vuelve solo.
        if (enCurso && JornadaGps.actividadActual(context) != activity.id) {
            JornadaGps.iniciarActividad(context, activity.id)
        }
    }

    /**
     * Contrato B: empezar esta teniendo otra de más prioridad sin terminar no
     * bloquea; solo se le pregunta (una vez) si quiere decir por qué.
     */
    var avisoOrden by remember(activity.id) { mutableStateOf<String?>(null) }
    var preguntaOrden by remember(activity.id) { mutableStateOf(false) }
    var ordenResuelto by remember(activity.id) { mutableStateOf(false) }
    LaunchedEffect(activity.id, step, isCorrection) {
        if (step != STEP_ENTRY || isCorrection) {
            avisoOrden = null
            return@LaunchedEffect
        }
        val data = runCatching { withContext(Dispatchers.IO) { repo.myActivities() } }.getOrNull()
            ?: return@LaunchedEffect
        val abiertas = data.open.orEmpty()
        val pendientes = abiertas
            .filter { ActivityPriorityJump.esDelDiaOAntes(it.fechaInicio ?: it.fechaMaxima) }
            .map {
                ActivityPriorityJump.Pendiente(
                    id = it.id,
                    prioridad = it.prioridad,
                    iniciada = it.inicioRealAt != null || !it.evidenceStatus.isNullOrBlank(),
                    terminada = it.finRealAt != null || it.fechaFinalizacion != null,
                )
            }
        val mia = abiertas.firstOrNull { it.id == activity.id }
        val mayor = ActivityPriorityJump.mayorPendiente(
            actualId = activity.id,
            actualPrioridad = mia?.prioridad ?: activity.prioridad,
            otras = pendientes,
        )
        avisoOrden = mayor?.let { m ->
            ActivityPriorityJump.aviso(abiertas.firstOrNull { it.id == m.id }?.titulo, m.prioridad)
        }
    }

    /** Visor de las fotos del avance anterior. */
    var visor by remember { mutableStateOf<Pair<List<CoreActivityRules.EvidencePhoto>, Int>?>(null) }
    var cameraKind by remember { mutableStateOf<String?>(null) }
    var pending by remember { mutableStateOf<GeoPhoto?>(null) }
    var pendingKind by remember { mutableStateOf<String?>(null) }
    var pendingError by remember { mutableStateOf<String?>(null) }

    fun correctionMessage(saved: EvidenceFlowDto): String = when {
        saved.status == STEP_COMPLETED -> "¡Corrección enviada! Tu evidencia será revisada nuevamente."
        !saved.status.isNullOrBlank() -> "Paso corregido. Siguiente: ${CoreActivityRules.stepLabel(saved.status)}"
        else -> "Corrección enviada."
    }

    fun applySaved(saved: EvidenceFlowDto, message: String) {
        if (saved.status == null) {
            // El interceptor offline respondió «en cola»: no hay fila nueva que pintar.
            successIcon = Icons.Outlined.CloudOff
            success = "Sin conexión: se enviará solo en cuanto vuelva la red."
            return
        }
        flow = saved.copy(
            activity = saved.activity ?: flow?.activity,
            assigneeIndicaciones = saved.assigneeIndicaciones ?: flow?.assigneeIndicaciones,
            // Los POST no traen el avance anterior ni los campos: se conserva lo del GET.
            avancesAnteriores = saved.avancesAnteriores ?: flow?.avancesAnteriores,
            campos = saved.campos ?: flow?.campos,
        )
        error = null
        successIcon = if (saved.status == STEP_COMPLETED) NxGlyph.APPROVED.icon else NxGlyph.DONE.icon
        success = message
        onFlowChanged()
    }

    suspend fun sendEntryOrExit(kind: String, photo: GeoPhoto, justificacionOrden: String? = null): Boolean {
        val lat = photo.latitude
        val lng = photo.longitude
        if (lat == null || lng == null) {
            pendingError = GPS_REQUIRED_MESSAGE
            return false
        }
        if (kind == KIND_EXIT) {
            val cerca = geocerca ?: runCatching { withContext(Dispatchers.IO) { repo.geocerca(activity.id) } }
                .getOrNull()
                ?.also { geocerca = it }
            val distancia = ActivityGeofence.distanciaAlInicio(cerca, lat, lng)
            if (distancia != null && distancia > (cerca?.radioM ?: ActivityGeofence.RADIO_M)) {
                pendingError = ActivityGeofence.mensajeSalida(distancia, cerca?.radioM ?: ActivityGeofence.RADIO_M)
                return false
            }
        }
        busy = true
        pendingError = null
        return try {
            val stepKey = if (kind == KIND_ENTRY) STEP_ENTRY else STEP_EXIT
            val saved = withContext(Dispatchers.IO) {
                when {
                    isCorrection -> repo.resubmit(
                        activity.id,
                        stepKey,
                        ActivityEvidencePhotoStepRequest(photo.dataUrl, lat, lng),
                    )
                    kind == KIND_ENTRY -> repo.entryPhoto(
                        activityId = activity.id,
                        photoUrl = photo.dataUrl,
                        lat = lat,
                        lng = lng,
                        justificacionOrden = justificacionOrden,
                    )
                    else -> repo.exitPhoto(activity.id, photo.dataUrl, lat, lng)
                }
            }
            val message = when {
                isCorrection -> correctionMessage(saved)
                kind == KIND_ENTRY -> "Foto de entrada guardada. Siguiente: toma $photoRequired fotos de evidencia."
                saved.status == STEP_COMPLETED -> "¡Listo! Tus evidencias quedaron enviadas a revisión."
                else -> "Foto de salida guardada."
            }
            applySaved(saved, message)
            if (saved.status != null) {
                // Seguimiento de ubicación mientras dura la actividad (se ve en la notificación permanente).
                if (kind == KIND_ENTRY) {
                    JornadaGps.iniciarActividad(context, activity.id)
                } else {
                    JornadaGps.terminarActividad(context)
                }
            }
            true
        } catch (e: Exception) {
            pendingError = e.toUserMessage("No se pudo guardar la foto")
            false
        } finally {
            busy = false
        }
    }

    /**
     * Evidencia por campos: una foto del campo en un momento. El API responde
     * con la lista completa de campos y esa reemplaza la local (el resto del
     * flujo no cambia). Sin conexión (`null`) el hueco se marca igual para que
     * la persona no vuelva a tomar la misma foto.
     */
    suspend fun sendCampoFoto(campoId: Long, momento: String, photo: GeoPhoto): Boolean {
        busy = true
        pendingError = null
        return try {
            val guardado = withContext(Dispatchers.IO) {
                repo.campoFoto(
                    activityId = activity.id,
                    campoId = campoId,
                    momento = momento,
                    photoUrl = photo.dataUrl,
                    lat = photo.latitude,
                    lng = photo.longitude,
                    capturedAt = photo.capturedAt,
                )
            }
            val actualizados = CoreActivityRules.camposTrasFoto(
                previos = flow?.campos,
                respuesta = guardado,
                campoId = campoId,
                momento = momento,
                urlLocal = photo.dataUrl,
            )
            flow = flow?.copy(campos = actualizados)
            thumbnailOf(photo.preview)?.let { thumb ->
                camposThumbs = camposThumbs + (campoSlotKey(campoId, momento) to thumb)
            }
            error = null
            if (guardado == null) {
                successIcon = Icons.Outlined.CloudOff
                success = "Sin conexión: la foto se enviará sola en cuanto vuelva la red."
            } else {
                successIcon = NxGlyph.PHOTO.icon
                success = "Foto guardada · " + CoreActivityRules.momentoLabel(momento)
            }
            onFlowChanged()
            // Al completarse los campos el API puede haber avanzado el paso solo.
            if (CoreActivityRules.camposListos(actualizados)) reloadKey++
            true
        } catch (e: Exception) {
            pendingError = e.toUserMessage("No se pudo guardar la foto del campo")
            false
        } finally {
            busy = false
        }
    }

    fun savePhotos() {
        // Con campos las fotos ya viajaron una por una: aquí solo se avanza el
        // paso mandando lo que quedó guardado por campo.
        if (!porCampos && drafts.size < photoRequired) {
            error = "Se requieren al menos $photoRequired fotos (tienes ${drafts.size})"
            return
        }
        scope.launch {
            busy = true
            error = null
            try {
                val urls = if (porCampos) CoreActivityRules.camposFotoUrls(campos) else drafts.map { it.url }
                val geo: List<EvidencePhotoGeoRequest?> =
                    if (porCampos) List(urls.size) { null } else drafts.map { it.geo }
                val saved = withContext(Dispatchers.IO) {
                    if (isCorrection) {
                        repo.resubmit(activity.id, STEP_PHOTOS, EvidencePhotosWithGeoRequest(urls, geo))
                    } else {
                        repo.evidencePhotos(activity.id, urls, geo)
                    }
                }
                applySaved(
                    saved,
                    when {
                        isCorrection -> correctionMessage(saved)
                        needsPdf -> "Evidencias guardadas. Siguiente: carga la hoja de servicio (PDF)."
                        else -> "Evidencias guardadas. Siguiente: completa el formulario."
                    },
                )
            } catch (e: Exception) {
                error = e.toUserMessage("No se pudieron guardar las evidencias")
            } finally {
                busy = false
            }
        }
    }

    fun saveForm() {
        val fields = CoreActivityRules.digitalFormLabels(coreKind)
        val missing = fields.filter { formValues[it.key].isNullOrBlank() }
        if (missing.isNotEmpty()) {
            error = "Completa: ${missing.joinToString(", ") { it.label }}"
            return
        }
        val payload = fields.associate { it.key to formValues[it.key].orEmpty().trim() }
        scope.launch {
            busy = true
            error = null
            try {
                val saved = withContext(Dispatchers.IO) {
                    if (isCorrection) {
                        repo.resubmit(activity.id, STEP_DATA, EvidenceFormDataWrapper(payload))
                    } else {
                        repo.serviceSheetData(activity.id, payload)
                    }
                }
                applySaved(
                    saved,
                    if (isCorrection) correctionMessage(saved)
                    else "Formulario guardado. Siguiente: toma la foto de salida.",
                )
            } catch (e: Exception) {
                error = e.toUserMessage("No se pudo guardar el formulario")
            } finally {
                busy = false
            }
        }
    }

    val pdfPicker = rememberLauncherForActivityResult(ActivityResultContracts.OpenDocument()) { uri ->
        if (uri == null) return@rememberLauncherForActivityResult
        scope.launch {
            busy = true
            error = null
            try {
                val dataUrl = withContext(Dispatchers.IO) { readPdfAsDataUrl(context, uri) }
                val saved = withContext(Dispatchers.IO) {
                    if (isCorrection) {
                        repo.resubmit(activity.id, STEP_PDF, ActivityEvidencePdfStepRequest(dataUrl))
                    } else {
                        repo.serviceSheetPdf(activity.id, dataUrl)
                    }
                }
                applySaved(
                    saved,
                    if (isCorrection) correctionMessage(saved)
                    else "PDF guardado. Siguiente: completa el formulario.",
                )
            } catch (e: Exception) {
                error = e.toUserMessage("No se pudo cargar el PDF")
            } finally {
                busy = false
            }
        }
    }

    NxPanelShell {
        NxIconText(
            text = "Captura de evidencias",
            icon = NxGlyph.PHOTO.icon,
            style = MaterialTheme.typography.titleMedium.copy(fontWeight = FontWeight.Bold),
            color = NxColors.Slate,
        )
        Text(
            if (needsPdf) {
                "Foto de entrada, fotos en sitio, hoja de servicio, formulario y foto de salida."
            } else {
                "Foto de entrada, fotos en sitio, formulario y foto de salida."
            },
            fontSize = 13.sp,
            color = NxColors.Muted,
        )
        Spacer(Modifier.heightIn(min = 10.dp))

        if (loading && flow == null) {
            NxLoadingBlock("Cargando tus evidencias…")
            return@NxPanelShell
        }
        if (loadError != null && flow == null) {
            Text(loadError!!, color = MaterialTheme.colorScheme.error, fontSize = 13.sp)
            OutlinedButton(onClick = { reloadKey++ }) { Text("Reintentar") }
            return@NxPanelShell
        }

        Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
            val general = flow?.activity?.indicaciones ?: activity.indicaciones
            if (!general.isNullOrBlank()) SoftNote(title = "Indicaciones generales", text = general)
            val paraTi = flow?.assigneeIndicaciones
            if (!paraTi.isNullOrBlank()) SoftNote(title = "Indicaciones para ti", text = paraTi)

            // Te la pasaron: lo que dejó quien la tenía, solo lectura, antes de tus pasos.
            flow?.avancesAnteriores.orEmpty().forEach { av ->
                AvanceAnteriorCard(
                    av = av,
                    coreKind = coreKind,
                    onOpenVisor = { fotos, index -> if (index in fotos.indices) visor = fotos to index },
                )
            }

            if (isCorrection && (rejected.isNotEmpty() || !flow?.reviewNotes.isNullOrBlank())) {
                CorrectionBanner(rejected = rejected, steps = steps, notes = flow?.reviewNotes)
            }

            StepProgress(steps = steps, flow = flow, current = step)

            // El avance lo calcula el API; aquí solo se pinta.
            flow?.progressPct?.let { pct -> ProgressWithPct(pct) }

            if (porCampos) {
                CamposEvidenciaCard(
                    campos = campos,
                    thumbs = camposThumbs,
                    enabled = !busy && !locked && step != STEP_COMPLETED,
                    onTomar = { campoId, momento ->
                        success = null
                        error = null
                        campoPendiente = campoId to momento
                        cameraKind = KIND_CAMPO
                    },
                )
            }

            if (!flow?.entryPhotoUrl.isNullOrBlank()) {
                GeocercaActividadCard(
                    activityId = activity.id,
                    refreshKey = reloadKey + (flow?.status?.hashCode() ?: 0),
                    onEstado = { geocerca = it },
                )
            }

            success?.let {
                NxIconText(
                    text = it,
                    icon = successIcon,
                    fontSize = 13.sp,
                    color = Color(CoreActivityRules.VERDE),
                    fontWeight = FontWeight.SemiBold,
                )
            }
            error?.let {
                NxIconText(text = it, icon = Icons.Outlined.ErrorOutline, fontSize = 13.sp, color = Color(0xFFB91C1C))
            }

            val stepNumber = steps.indexOf(step) + 1
            val stepPrefix = if (stepNumber > 0) "Paso $stepNumber de ${steps.size}" else "Paso"

            when {
                step == STEP_COMPLETED || locked -> CompletedCard(locked = locked, reviewStatus = reviewStatus)

                step == STEP_ENTRY -> StepCard(
                    title = "$stepPrefix: Foto de entrada",
                    description = "Tómala al llegar al sitio. Se guarda con tu ubicación GPS (obligatoria).",
                    icon = NxGlyph.ENTRY.icon,
                ) {
                    PrimaryAction("Tomar foto de entrada", icon = NxGlyph.PHOTO.icon, enabled = !busy) {
                        success = null
                        error = null
                        cameraKind = KIND_ENTRY
                    }
                }

                // Con campos las fotos en sitio ya no son libres: van arriba, por campo.
                step == STEP_PHOTOS && porCampos -> StepCard(
                    title = "$stepPrefix: Fotos por campo",
                    description = "Toma las fotos de cada campo en la lista de arriba " +
                        "(${CoreActivityRules.camposResumen(campos)}). Las de «Después» " +
                        "puedes dejarlas para cuando termines.",
                    icon = NxGlyph.PHOTO.icon,
                ) {
                    PrimaryAction(if (busy) "Guardando…" else "Siguiente paso →", enabled = !busy) {
                        savePhotos()
                    }
                }

                step == STEP_PHOTOS -> StepCard(
                    title = "$stepPrefix: Fotos en sitio (${drafts.size}/$photoRequired)",
                    description = "Toma al menos $photoRequired fotos del trabajo. Cada una guarda dónde se tomó.",
                    icon = NxGlyph.PHOTO.icon,
                ) {
                    DraftGrid(
                        drafts = drafts,
                        enabled = !busy,
                        onRemove = { index -> drafts = drafts.filterIndexed { i, _ -> i != index } },
                    )
                    Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        OutlinedButton(
                            onClick = {
                                success = null
                                error = null
                                cameraKind = KIND_EVIDENCE
                            },
                            enabled = !busy && drafts.size < MAX_EVIDENCE_PHOTOS,
                            modifier = Modifier.weight(1f).heightIn(min = 48.dp),
                        ) {
                            Icon(NxGlyph.PHOTO.icon, contentDescription = null, modifier = Modifier.size(18.dp))
                            Spacer(Modifier.width(6.dp))
                            Text("Agregar foto")
                        }
                        Button(
                            onClick = { savePhotos() },
                            enabled = !busy && drafts.size >= photoRequired,
                            colors = ButtonDefaults.buttonColors(containerColor = NxColors.Brand),
                            modifier = Modifier.weight(1f).heightIn(min = 48.dp),
                        ) {
                            if (busy) {
                                Text("Guardando…")
                            } else {
                                Text("Siguiente paso →")
                            }
                        }
                    }
                    if (drafts.size < photoRequired) {
                        Text(
                            "Faltan ${photoRequired - drafts.size} foto(s).",
                            fontSize = 12.5.sp,
                            color = NxColors.Muted,
                        )
                    }
                }

                step == STEP_PDF -> StepCard(
                    title = "$stepPrefix: Hoja de servicio (PDF)",
                    description = "Carga el PDF de la hoja de servicio firmada. Solo PDF.",
                    icon = NxGlyph.PROCEDURE.icon,
                ) {
                    PrimaryAction(
                        if (busy) "Subiendo…" else "Seleccionar PDF",
                        icon = if (busy) null else NxGlyph.PROCEDURE.icon,
                        enabled = !busy,
                    ) {
                        success = null
                        error = null
                        pdfPicker.launch(arrayOf("application/pdf"))
                    }
                    flow?.serviceSheetPdfUrl?.takeIf { it.isNotBlank() }?.let { url ->
                        ProtectedPdfButton(url = url, label = "Ver PDF cargado")
                    }
                }

                step == STEP_DATA -> StepCard(
                    title = "$stepPrefix: Formulario",
                    description = "Completa los datos de esta actividad.",
                    icon = NxGlyph.DOCUMENTATION.icon,
                ) {
                    CoreActivityRules.digitalFormLabels(coreKind).forEach { field ->
                        OutlinedTextField(
                            value = formValues[field.key].orEmpty(),
                            onValueChange = { value -> formValues = formValues + (field.key to value) },
                            label = { Text(field.label) },
                            singleLine = !field.multiline,
                            minLines = if (field.multiline) 3 else 1,
                            enabled = !busy,
                            modifier = Modifier.fillMaxWidth(),
                        )
                    }
                    PrimaryAction(if (busy) "Guardando…" else "Siguiente paso →", enabled = !busy) {
                        saveForm()
                    }
                }

                step == STEP_EXIT -> StepCard(
                    title = "$stepPrefix: Foto de salida",
                    description = "Tómala en el sitio al terminar. Tu ubicación GPS es obligatoria para cerrar.",
                    icon = NxGlyph.EXIT.icon,
                ) {
                    // Con campos no se cierra hasta que no falte ninguna foto obligatoria.
                    val bloqueoCampos = CoreActivityRules.camposBloqueoSalida(campos)
                    PrimaryAction(
                        "Tomar foto de salida",
                        icon = NxGlyph.PHOTO.icon,
                        enabled = !busy && bloqueoCampos == null,
                    ) {
                        success = null
                        error = null
                        cameraKind = KIND_EXIT
                    }
                    bloqueoCampos?.let {
                        SoftNote(
                            text = it,
                            color = CoreActivityRules.NARANJA,
                            icon = Icons.Outlined.WarningAmber,
                        )
                    }
                }
            }
        }
    }

    visor?.let { (fotos, index) ->
        EvidencePhotoViewer(fotos = fotos, startIndex = index, onClose = { visor = null })
    }

    /** «Cámara 1 · Antes» — lo que se está fotografiando ahora mismo. */
    val campoTitulo = campoPendiente?.let { (campoId, momento) ->
        val campo = campos.firstOrNull { it.id == campoId }
        val nombre = campo?.let { CoreActivityRules.campoNombre(it) } ?: "Campo"
        "$nombre · ${CoreActivityRules.momentoLabel(momento)}"
    }

    cameraKind?.let { kind ->
        LiveCameraCaptureDialog(
            title = when (kind) {
                KIND_ENTRY -> "Foto de entrada"
                KIND_EXIT -> "Foto de salida"
                KIND_CAMPO -> campoTitulo ?: "Foto del campo"
                else -> "Foto de evidencia ${drafts.size + 1} de $photoRequired"
            },
            // El campo se fotografía donde esté; la ubicación viaja si la hay.
            requireLocation = kind == KIND_ENTRY || kind == KIND_EXIT,
            onCaptured = { photo ->
                cameraKind = null
                pending = photo
                pendingKind = kind
                pendingError = null
            },
            onDismiss = {
                cameraKind = null
                if (kind == KIND_CAMPO) campoPendiente = null
            },
        )
    }

    val photo = pending
    val kind = pendingKind
    if (photo != null && kind != null) {
        GeoPhotoPreviewDialog(
            title = when (kind) {
                KIND_ENTRY -> "Tu foto de entrada"
                KIND_EXIT -> "Tu foto de salida"
                KIND_CAMPO -> campoTitulo ?: "Tu foto del campo"
                else -> "Tu foto de evidencia ${drafts.size + 1} de $photoRequired"
            },
            photo = photo,
            confirmLabel = if (kind == KIND_EVIDENCE) "Usar esta foto" else "Enviar esta foto",
            sending = busy,
            error = pendingError,
            onConfirm = {
                if (kind == KIND_CAMPO) {
                    val destino = campoPendiente
                    if (destino == null) {
                        pending = null
                        pendingKind = null
                    } else {
                        scope.launch {
                            if (sendCampoFoto(destino.first, destino.second, photo)) {
                                pending = null
                                pendingKind = null
                                campoPendiente = null
                            }
                        }
                    }
                } else if (kind == KIND_EVIDENCE) {
                    val geo = if (photo.latitude != null && photo.longitude != null) {
                        EvidencePhotoGeoRequest(photo.latitude, photo.longitude, photo.capturedAt)
                    } else {
                        null
                    }
                    drafts = drafts + DraftPhoto(photo.dataUrl, geo, thumbnailOf(photo.preview))
                    successIcon = NxGlyph.PHOTO.icon
                    success = "Foto agregada (${drafts.size} de $photoRequired)"
                    pending = null
                    pendingKind = null
                } else if (kind == KIND_ENTRY && avisoOrden != null && !ordenResuelto) {
                    // Hay otra de más prioridad sin empezar: se pregunta antes de mandar la foto.
                    preguntaOrden = true
                } else {
                    scope.launch {
                        if (sendEntryOrExit(kind, photo)) {
                            pending = null
                            pendingKind = null
                        }
                    }
                }
            },
            onRetake = {
                pending = null
                pendingError = null
                cameraKind = kind
            },
            onCancel = {
                pending = null
                pendingKind = null
                pendingError = null
                campoPendiente = null
            },
        )
    }

    if (preguntaOrden) {
        JustificarOrdenDialog(
            aviso = avisoOrden.orEmpty(),
            // «Mejor no»: se queda en la foto, por si prefiere ir a la otra actividad.
            onDismiss = { preguntaOrden = false },
            onContinuar = { justificacion ->
                preguntaOrden = false
                ordenResuelto = true
                val foto = pending
                val tipo = pendingKind
                if (foto != null && tipo != null) {
                    scope.launch {
                        if (sendEntryOrExit(tipo, foto, justificacion)) {
                            pending = null
                            pendingKind = null
                        }
                    }
                }
            },
        )
    }
}

private fun CoreActivityRules.Geo.toRequest(): EvidencePhotoGeoRequest? {
    val la = lat ?: return null
    val lo = lng ?: return null
    return EvidencePhotoGeoRequest(la, lo, capturedAt ?: "")
}

private fun thumbnailOf(src: Bitmap, maxEdge: Int = 320): Bitmap? = runCatching {
    val edge = maxOf(src.width, src.height).coerceAtLeast(1)
    if (edge <= maxEdge) return@runCatching src
    val scale = maxEdge.toFloat() / edge
    Bitmap.createScaledBitmap(
        src,
        (src.width * scale).toInt().coerceAtLeast(1),
        (src.height * scale).toInt().coerceAtLeast(1),
        true,
    )
}.getOrNull()

/** Lee el PDF elegido y lo devuelve como `data:application/pdf;base64,…`. */
private fun readPdfAsDataUrl(context: Context, uri: Uri): String {
    val resolver = context.contentResolver
    val mime = resolver.getType(uri).orEmpty()
    val bytes = resolver.openInputStream(uri)?.use { it.readBytes() }
        ?: throw IllegalStateException("No se pudo leer el archivo")
    val looksPdf = bytes.size > 4 &&
        bytes[0] == '%'.code.toByte() && bytes[1] == 'P'.code.toByte() &&
        bytes[2] == 'D'.code.toByte() && bytes[3] == 'F'.code.toByte()
    if (!mime.contains("pdf", ignoreCase = true) && !looksPdf) {
        throw IllegalArgumentException("Solo se permite PDF")
    }
    if (bytes.size > MAX_PDF_BYTES) {
        throw IllegalArgumentException("El PDF pesa más de 15 MB; reduce su tamaño e intenta de nuevo")
    }
    return "data:application/pdf;base64," + Base64.encodeToString(bytes, Base64.NO_WRAP)
}

@Composable
private fun StepCard(
    title: String,
    description: String,
    icon: ImageVector? = null,
    content: @Composable () -> Unit,
) {
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(14.dp))
            .background(Color(0xFFF8FAFC))
            .border(1.dp, Color(0xFFE2E8F0), RoundedCornerShape(14.dp))
            .padding(14.dp),
        verticalArrangement = Arrangement.spacedBy(10.dp),
    ) {
        NxIconText(text = title, icon = icon, fontSize = 15.sp, fontWeight = FontWeight.ExtraBold, color = NxColors.Slate)
        Text(description, fontSize = 13.sp, color = NxColors.Muted)
        content()
    }
}

@Composable
private fun PrimaryAction(label: String, enabled: Boolean, icon: ImageVector? = null, onClick: () -> Unit) {
    Button(
        onClick = onClick,
        enabled = enabled,
        colors = ButtonDefaults.buttonColors(containerColor = NxColors.Brand),
        modifier = Modifier.fillMaxWidth().heightIn(min = 52.dp),
    ) {
        if (icon != null) {
            Icon(icon, contentDescription = null, modifier = Modifier.size(18.dp))
            Spacer(Modifier.width(6.dp))
        }
        Text(label, fontWeight = FontWeight.Bold, fontSize = 15.sp)
    }
}

@Composable
private fun StepProgress(steps: List<String>, flow: EvidenceFlowDto?, current: String) {
    Row(
        modifier = Modifier.fillMaxWidth().horizontalScroll(rememberScrollState()),
        horizontalArrangement = Arrangement.spacedBy(8.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        steps.forEachIndexed { index, s ->
            val done = when (s) {
                STEP_ENTRY -> !flow?.entryPhotoUrl.isNullOrBlank()
                STEP_PHOTOS -> !flow?.evidencePhotos.isNullOrEmpty()
                STEP_PDF -> !flow?.serviceSheetPdfUrl.isNullOrBlank()
                STEP_DATA -> flow?.serviceSheetData != null
                else -> !flow?.exitPhotoUrl.isNullOrBlank()
            }
            val active = s == current
            Row(
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(6.dp),
            ) {
                Box(
                    modifier = Modifier
                        .size(26.dp)
                        .clip(CircleShape)
                        .background(
                            when {
                                done -> Color(CoreActivityRules.VERDE)
                                active -> NxColors.Brand
                                else -> Color(0xFFE2E8F0)
                            },
                        ),
                    contentAlignment = Alignment.Center,
                ) {
                    if (done) {
                        Icon(
                            NxGlyph.DONE.icon,
                            contentDescription = null,
                            tint = Color.White,
                            modifier = Modifier.size(14.dp),
                        )
                    } else {
                        Text(
                            "${index + 1}",
                            color = if (active) Color.White else NxColors.Muted,
                            fontSize = 12.sp,
                            fontWeight = FontWeight.Bold,
                        )
                    }
                }
                Text(
                    CoreActivityRules.stepLabel(s),
                    fontSize = 12.sp,
                    fontWeight = if (active) FontWeight.Bold else FontWeight.Normal,
                    color = if (active) NxColors.Slate else NxColors.Muted,
                )
            }
            if (index < steps.lastIndex) {
                Box(Modifier.width(14.dp).heightIn(min = 1.dp).background(Color(0xFFCBD5E1)))
            }
        }
    }
}

@Composable
private fun DraftGrid(
    drafts: List<DraftPhoto>,
    enabled: Boolean,
    onRemove: (Int) -> Unit,
) {
    if (drafts.isEmpty()) return
    Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
        drafts.withIndex().chunked(3).forEach { row ->
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                row.forEach { (index, draft) ->
                    Box(
                        modifier = Modifier
                            .weight(1f)
                            .aspectRatio(1f)
                            .clip(RoundedCornerShape(10.dp))
                            .background(Color(0xFF0F172A)),
                    ) {
                        val thumb = draft.thumb
                        if (thumb != null) {
                            Image(
                                bitmap = thumb.asImageBitmap(),
                                contentDescription = "Evidencia ${index + 1}",
                                contentScale = ContentScale.Crop,
                                modifier = Modifier.fillMaxSize(),
                            )
                        } else {
                            ProtectedImage(
                                url = draft.url,
                                contentDescription = "Evidencia ${index + 1}",
                                modifier = Modifier.fillMaxSize(),
                            )
                        }
                        Box(
                            modifier = Modifier
                                .align(Alignment.TopEnd)
                                .padding(4.dp)
                                .size(30.dp)
                                .clip(CircleShape)
                                .background(Color(0x99000000))
                                .clickable(enabled = enabled) { onRemove(index) },
                            contentAlignment = Alignment.Center,
                        ) {
                            Icon(Icons.Outlined.Close, contentDescription = "Quitar", tint = Color.White, modifier = Modifier.size(16.dp))
                        }
                        Text(
                            CoreActivityRules.fotoEvidenciaLabel(index + 1),
                            color = Color.White,
                            fontSize = 11.sp,
                            modifier = Modifier
                                .align(Alignment.BottomStart)
                                .padding(4.dp)
                                .clip(RoundedCornerShape(6.dp))
                                .background(Color(0x99000000))
                                .padding(horizontal = 5.dp, vertical = 1.dp),
                        )
                    }
                }
                repeat(3 - row.size) { Spacer(Modifier.weight(1f)) }
            }
        }
    }
}

/**
 * Evidencia por campos: cada campo con los huecos que pide («Antes», «En
 * progreso», «Después»). Un hueco vacío abre la cámara; uno lleno enseña la
 * miniatura y se puede volver a tomar.
 */
@Composable
private fun CamposEvidenciaCard(
    campos: List<EvidenceCampoDto>,
    thumbs: Map<String, Bitmap>,
    enabled: Boolean,
    onTomar: (campoId: Long, momento: String) -> Unit,
) {
    val faltan = CoreActivityRules.camposFaltantes(campos)
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(14.dp))
            .background(Color(0xFFF8FAFC))
            .border(1.dp, Color(0xFFE2E8F0), RoundedCornerShape(14.dp))
            .padding(14.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        Column(verticalArrangement = Arrangement.spacedBy(3.dp)) {
            NxIconText(
                text = "Fotos por campo",
                icon = NxGlyph.PHOTO.icon,
                fontSize = 15.sp,
                fontWeight = FontWeight.ExtraBold,
                color = NxColors.Slate,
            )
            Text(
                CoreActivityRules.camposResumen(campos) +
                    if (faltan == 0) " · completo" else "",
                fontSize = 12.5.sp,
                color = if (faltan == 0) Color(CoreActivityRules.VERDE) else NxColors.Muted,
                fontWeight = FontWeight.SemiBold,
            )
        }

        campos.forEach { campo ->
            val momentos = CoreActivityRules.momentosDeCampo(campo)
            if (momentos.isEmpty()) return@forEach
            val listo = CoreActivityRules.campoListo(campo)
            Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.spacedBy(8.dp),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Text(
                        CoreActivityRules.campoNombre(campo),
                        fontSize = 14.sp,
                        fontWeight = FontWeight.Bold,
                        color = NxColors.Slate,
                        modifier = Modifier.weight(1f),
                    )
                    ToneChip(
                        if (listo) "Listo" else "Faltan ${CoreActivityRules.momentosPendientes(campo).size}",
                        if (listo) CoreActivityRules.VERDE else CoreActivityRules.NARANJA,
                    )
                }
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    momentos.forEach { momento ->
                        CampoSlot(
                            momento = momento,
                            url = CoreActivityRules.fotoDeCampo(campo, momento),
                            thumb = thumbs[campoSlotKey(campo.id, momento)],
                            enabled = enabled && campo.id != null,
                            onClick = { campo.id?.let { onTomar(it, momento) } },
                            modifier = Modifier.weight(1f),
                        )
                    }
                    // Los campos con menos de tres momentos no estiran los huecos.
                    repeat(CoreActivityRules.MOMENTOS.size - momentos.size) {
                        Spacer(Modifier.weight(1f))
                    }
                }
            }
        }
    }
}

/** Un hueco: «Antes» vacío (toca para la cámara) o con su miniatura. */
@Composable
private fun CampoSlot(
    momento: String,
    url: String?,
    thumb: Bitmap?,
    enabled: Boolean,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val tomada = thumb != null || url != null
    Column(modifier = modifier, verticalArrangement = Arrangement.spacedBy(3.dp)) {
        Box(
            modifier = Modifier
                .fillMaxWidth()
                .aspectRatio(1f)
                .clip(RoundedCornerShape(10.dp))
                .background(if (tomada) Color(0xFF0F172A) else Color(0xFFE2E8F0))
                .border(
                    1.dp,
                    if (tomada) Color(CoreActivityRules.VERDE) else Color(0xFFCBD5E1),
                    RoundedCornerShape(10.dp),
                )
                .clickable(enabled = enabled, onClick = onClick),
            contentAlignment = Alignment.Center,
        ) {
            when {
                thumb != null -> Image(
                    bitmap = thumb.asImageBitmap(),
                    contentDescription = CoreActivityRules.momentoLabel(momento),
                    contentScale = ContentScale.Crop,
                    modifier = Modifier.fillMaxSize(),
                )
                url != null -> ProtectedImage(
                    url = url,
                    contentDescription = CoreActivityRules.momentoLabel(momento),
                    modifier = Modifier.fillMaxSize(),
                )
                else -> Icon(
                    NxGlyph.PHOTO.icon,
                    contentDescription = null,
                    tint = NxColors.Muted,
                    modifier = Modifier.size(22.dp),
                )
            }
            if (tomada) {
                Icon(
                    NxGlyph.DONE.icon,
                    contentDescription = null,
                    tint = Color.White,
                    modifier = Modifier
                        .align(Alignment.TopEnd)
                        .padding(4.dp)
                        .size(24.dp)
                        .clip(CircleShape)
                        .background(Color(CoreActivityRules.VERDE))
                        .padding(4.dp),
                )
            }
        }
        Text(
            CoreActivityRules.momentoLabel(momento),
            fontSize = 11.5.sp,
            fontWeight = FontWeight.SemiBold,
            color = if (tomada) NxColors.Slate else NxColors.Muted,
        )
    }
}

@Composable
private fun CorrectionBanner(rejected: List<String>, steps: List<String>, notes: String?) {
    val todo = rejected.isNotEmpty() && steps.all { it in rejected }
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(14.dp))
            .background(Color(0xFFFFF7ED))
            .border(1.dp, Color(0xFFFDBA74), RoundedCornerShape(14.dp))
            .padding(14.dp),
        verticalArrangement = Arrangement.spacedBy(6.dp),
    ) {
        NxIconText(
            text = if (todo) "Te devolvieron toda la evidencia" else "Te devolvieron tu evidencia",
            icon = Icons.Outlined.WarningAmber,
            fontSize = 15.sp,
            fontWeight = FontWeight.ExtraBold,
            color = Color(0xFF9A3412),
        )
        if (rejected.isNotEmpty()) {
            Text(
                (if (rejected.size > 1) "Pasos a corregir: " else "Paso a corregir: ") +
                    rejected.joinToString(" · ") { CoreActivityRules.stepLabel(it) },
                fontSize = 13.sp,
                fontWeight = FontWeight.SemiBold,
                color = NxColors.Slate,
            )
        }
        Text("Observaciones de quien revisó:", fontSize = 12.5.sp, fontWeight = FontWeight.Bold, color = NxColors.Slate)
        Text(
            notes?.trim()?.takeIf { it.isNotEmpty() } ?: "Sin observaciones registradas.",
            fontSize = 13.sp,
            color = NxColors.Slate,
        )
        NxIconText(
            text = "Corrige el paso actual. " + if (rejected.size > 1) {
                "Luego sigues con los demás pasos indicados."
            } else {
                "Al terminar, se envía de nuevo a revisión."
            },
            icon = Icons.Outlined.Lightbulb,
            fontSize = 12.5.sp,
            color = NxColors.Muted,
        )
    }
}

@Composable
private fun CompletedCard(locked: Boolean, reviewStatus: String?) {
    val (title, text, icon) = when {
        reviewStatus == "APPROVED" ->
            Triple("Evidencia aprobada", "Tu superior ya la revisó y la aprobó.", NxGlyph.APPROVED.icon)
        locked -> Triple(
            "Evidencias enviadas a revisión",
            "Tus pasos están guardados. Tu superior la aprueba o te la devuelve con observaciones.",
            NxGlyph.IN_PROGRESS.icon,
        )
        else -> Triple("¡Listo!", "Todos los pasos quedaron guardados.", NxGlyph.APPROVED.icon)
    }
    SoftNote(title = title, text = text, color = CoreActivityRules.VERDE, icon = icon)
}
