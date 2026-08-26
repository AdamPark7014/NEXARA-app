package mx.nexara.mobile.nativeapp.ui.console.activities

import android.util.Base64
import androidx.compose.foundation.background
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
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import mx.nexara.mobile.nativeapp.data.api.ActivityDto
import mx.nexara.mobile.nativeapp.data.api.ActivityEvidenceDetailDto
import mx.nexara.mobile.nativeapp.data.api.ActivityIncidentDto
import mx.nexara.mobile.nativeapp.data.api.ActivityRecommendationDto
import mx.nexara.mobile.nativeapp.data.api.ViaticDto
import mx.nexara.mobile.nativeapp.data.console.ConsoleRepository
import mx.nexara.mobile.nativeapp.ui.common.CapturedMedia
import mx.nexara.mobile.nativeapp.ui.common.MediaPickerBar
import mx.nexara.mobile.nativeapp.ui.enterprise.NxEmptyState
import mx.nexara.mobile.nativeapp.ui.enterprise.NxFormTextField
import mx.nexara.mobile.nativeapp.ui.enterprise.NxLoadingBlock
import mx.nexara.mobile.nativeapp.ui.enterprise.NxPanelShell
import mx.nexara.mobile.nativeapp.ui.enterprise.NxSectionHeader
@Composable
fun ActivityInfoTab(
    a: ActivityDto,
    statusColor: Color,
    canEdit: Boolean = false,
    editing: Boolean = false,
    saving: Boolean = false,
    saveError: String? = null,
    editEstatus: String = a.estatus,
    editPrioridad: String = "",
    editDescripcion: String = "",
    editIndicaciones: String = "",
    editFechaInicio: String = "",
    editFechaEntrega: String = "",
    editFechaFin: String = "",
    showManagerFields: Boolean = true,
    onStartEdit: () -> Unit = {},
    onCancelEdit: () -> Unit = {},
    onEstatusChange: (String) -> Unit = {},
    onPrioridadChange: (String) -> Unit = {},
    onDescripcionChange: (String) -> Unit = {},
    onIndicacionesChange: (String) -> Unit = {},
    onFechaInicioChange: (String) -> Unit = {},
    onFechaEntregaChange: (String) -> Unit = {},
    onFechaFinChange: (String) -> Unit = {},
    onSave: () -> Unit = {},
) {
    LazyColumn(contentPadding = PaddingValues(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
        item {
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween, verticalAlignment = Alignment.CenterVertically) {
                Box(Modifier.clip(RoundedCornerShape(20.dp)).background(statusColor.copy(alpha = 0.13f)).padding(horizontal = 10.dp, vertical = 4.dp)) {
                    Text(a.estatus.ifBlank { "Sin estado" }, color = statusColor, fontWeight = FontWeight.Bold, fontSize = 12.sp)
                }
                if (canEdit && !editing) {
                    OutlinedButton(onClick = onStartEdit) { Text("Editar") }
                }
            }
        }
        if (editing) {
            item {
                NxPanelShell {
                    NxSectionHeader("Estado y prioridad")
                    Row(Modifier.horizontalScroll(rememberScrollState()), horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                        ACTIVITY_STATUSES.forEach { st ->
                            FilterChip(
                                selected = editEstatus == st,
                                onClick = { onEstatusChange(st) },
                                label = { Text(st.replace('_', ' '), style = MaterialTheme.typography.labelSmall) },
                            )
                        }
                    }
                    if (showManagerFields) {
                        Spacer(Modifier.height(8.dp))
                        Text("Prioridad", style = MaterialTheme.typography.labelMedium)
                        Row(Modifier.horizontalScroll(rememberScrollState()), horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                            ACTIVITY_PRIORITIES.forEach { p ->
                                FilterChip(
                                    selected = editPrioridad == p,
                                    onClick = { onPrioridadChange(p) },
                                    label = { Text(p, style = MaterialTheme.typography.labelSmall) },
                                )
                            }
                        }
                    }
                }
            }
            if (showManagerFields) {
                item {
                    NxPanelShell {
                        NxSectionHeader("Detalle")
                        DatePickerField(
                            label = "Entrega esperada",
                            value = editFechaEntrega,
                            onValueChange = onFechaEntregaChange,
                        )
                        Spacer(Modifier.height(8.dp))
                        NxFormTextField(
                            value = editDescripcion,
                            onValueChange = onDescripcionChange,
                            label = "Descripción",
                            singleLine = false,
                            minLines = 2,
                            imeAction = ImeAction.Next,
                        )
                        Spacer(Modifier.height(8.dp))
                        NxFormTextField(
                            value = editIndicaciones,
                            onValueChange = onIndicacionesChange,
                            label = "Indicaciones",
                            singleLine = false,
                            minLines = 2,
                            imeAction = ImeAction.Next,
                        )
                    }
                }
            }
            item {
                NxPanelShell {
                    NxSectionHeader("Programación")
                    DateTimePickerField(
                        label = "Inicio programado",
                        value = editFechaInicio,
                        onValueChange = onFechaInicioChange,
                    )
                    Spacer(Modifier.height(8.dp))
                    DateTimePickerField(
                        label = "Finalización",
                        value = editFechaFin,
                        onValueChange = onFechaFinChange,
                    )
                    if (!saveError.isNullOrBlank()) {
                        Spacer(Modifier.height(8.dp))
                        Text(saveError!!, color = MaterialTheme.colorScheme.error, fontSize = 13.sp)
                    }
                    Spacer(Modifier.height(10.dp))
                    Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        OutlinedButton(onClick = onCancelEdit, modifier = Modifier.weight(1f)) { Text("Cancelar") }
                        Button(
                            onClick = onSave,
                            enabled = !saving && editEstatus.isNotBlank(),
                            modifier = Modifier.weight(1f),
                        ) {
                            Text(if (saving) "Guardando…" else "Guardar")
                        }
                    }
                }
            }
        } else {
            item {
                Card(Modifier.fillMaxWidth(), shape = RoundedCornerShape(12.dp)) {
                    Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                        if (!a.anNumber.isNullOrBlank()) ADetailRow("AN / Folio", a.anNumber!!)
                        ADetailRow("Responsable", a.responsable?.nombre ?: "—")
                        ADetailRow("Creador", a.creador?.nombre ?: "—")
                        if (!a.client?.name.isNullOrBlank()) ADetailRow("Cliente", a.client!!.name!!)
                        val branch = listOfNotNull(a.branchName, a.branchCity, a.branchState).filter { it.isNotBlank() }.joinToString(" · ")
                        if (branch.isNotBlank()) ADetailRow("Sucursal", branch)
                        if (!a.branchAddress.isNullOrBlank()) ADetailRow("Dirección", a.branchAddress!!)
                        if (!a.prioridad.isNullOrBlank()) ADetailRow("Prioridad", a.prioridad!!)
                        if (!a.ticketType.isNullOrBlank()) ADetailRow("Tipo ticket", a.ticketType!!)
                        ADetailRow("Asignación", a.fechaAsignacion?.take(16)?.replace('T', ' ') ?: "—")
                        ADetailRow("Inicio", a.fechaInicio?.take(16)?.replace('T', ' ') ?: "—")
                        ADetailRow("Entrega esperada", a.fechaEntregaEsperada?.take(10) ?: "—")
                        ADetailRow("Finalización", a.fechaFinalizacion?.take(16)?.replace('T', ' ') ?: "—")
                    }
                }
            }
            if (!a.descripcion.isNullOrBlank()) {
                item {
                    Card(Modifier.fillMaxWidth(), shape = RoundedCornerShape(12.dp)) {
                        Column(Modifier.padding(16.dp)) {
                            Text("Descripción", fontWeight = FontWeight.SemiBold, fontSize = 13.sp)
                            Spacer(Modifier.height(4.dp))
                            Text(a.descripcion!!, fontSize = 13.sp)
                        }
                    }
                }
            }
            if (!a.indicaciones.isNullOrBlank()) {
                item {
                    Card(Modifier.fillMaxWidth(), shape = RoundedCornerShape(12.dp)) {
                        Column(Modifier.padding(16.dp)) {
                            Text("Indicaciones", fontWeight = FontWeight.SemiBold, fontSize = 13.sp)
                            Spacer(Modifier.height(4.dp))
                            Text(a.indicaciones!!, fontSize = 13.sp)
                        }
                    }
                }
            }
        }
    }
}

@Composable
fun ActivityEvidenceTab(
    ev: ActivityEvidenceDetailDto?,
    loading: Boolean,
    onCapture: (() -> Unit)? = null,
) {
    if (loading) {
        NxLoadingBlock("Cargando evidencias…")
        return
    }
    val photos = ev?.evidencePhotos.orEmpty()
    val entryPhoto = ev?.entryPhotoUrl
    val exitPhoto = ev?.exitPhotoUrl
    val pdf = ev?.serviceSheetPdfUrl
    LazyColumn(contentPadding = PaddingValues(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
        if (onCapture != null) {
            item {
                OutlinedButton(onClick = onCapture, modifier = Modifier.fillMaxWidth()) {
                    Text("Ir al flujo de evidencias")
                }
            }
        }
        if (ev != null) {
            item {
                Text("Estado: ${ev.status}", fontWeight = FontWeight.SemiBold, fontSize = 13.sp)
            }
            if (!ev.reviewStatus.isNullOrBlank()) {
                item {
                    Text("Revisión: ${ev.reviewStatus}", fontSize = 13.sp, color = MaterialTheme.colorScheme.onSurfaceVariant)
                }
            }
        }
        if (!entryPhoto.isNullOrBlank()) item {
            Text("Foto de entrada: ${entryPhoto.take(80)}", fontSize = 13.sp)
        }
        if (!exitPhoto.isNullOrBlank()) item {
            Text("Foto de salida: ${exitPhoto.take(80)}", fontSize = 13.sp)
        }
        if (!pdf.isNullOrBlank()) item {
            Text("PDF hoja de servicio: ${pdf.take(80)}", fontSize = 13.sp)
        }
        if (photos.isEmpty() && entryPhoto.isNullOrBlank() && exitPhoto.isNullOrBlank() && pdf.isNullOrBlank()) {
            item {
                NxEmptyState(
                    title = "Sin evidencias",
                    subtitle = "Aún no hay capturas para esta actividad.",
                    actionLabel = if (onCapture != null) "Capturar" else null,
                    onAction = onCapture,
                )
            }
        } else {
            items(photos.size) { i ->
                Text("Foto ${i + 1}: ${photos[i].take(80)}", fontSize = 12.sp, color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ActivityViaticsTab(
    activityId: Long,
    defaultAssigneeId: Long? = null,
    canAssign: Boolean = false,
    canCreate: Boolean = true,
) {
    val context = LocalContext.current
    val repo = remember(context) { ConsoleRepository(context) }
    var viatics by remember { mutableStateOf<List<ViaticDto>>(emptyList()) }
    var loading by remember { mutableStateOf(true) }
    var formMode by remember { mutableStateOf<String?>(null) } // "request" | "assign"
    var creating by remember { mutableStateOf(false) }
    var createError by remember { mutableStateOf<String?>(null) }
    var amountText by remember { mutableStateOf("") }
    var motivo by remember { mutableStateOf("") }
    var categoria by remember { mutableStateOf(VIATIC_CATEGORIES.first()) }
    var ticketDataUrl by remember { mutableStateOf<String?>(null) }
    var users by remember { mutableStateOf<List<mx.nexara.mobile.nativeapp.data.api.VisibleUserDto>>(emptyList()) }
    var assigneeId by remember { mutableStateOf<Long?>(defaultAssigneeId) }
    val scope = rememberCoroutineScope()

    fun mediaToDataUrl(media: CapturedMedia): String? {
        val bytes = runCatching { context.contentResolver.openInputStream(media.uri)?.use { it.readBytes() } }.getOrNull()
            ?: return null
        val mime = media.mimeType.takeIf { it.isNotBlank() } ?: "image/jpeg"
        return "data:$mime;base64,${Base64.encodeToString(bytes, Base64.NO_WRAP)}"
    }

    suspend fun reloadViatics() {
        viatics = runCatching {
            withContext(Dispatchers.IO) { repo.viaticsFetch() }
        }.getOrDefault(emptyList()).filter { it.linkedActivityId() == activityId }
    }

    LaunchedEffect(activityId, canAssign) {
        loading = true
        reloadViatics()
        if (canAssign) {
            users = runCatching {
                withContext(Dispatchers.IO) { repo.usersFetch() }
            }.getOrDefault(emptyList())
        }
        loading = false
    }

    if (loading) {
        NxLoadingBlock("Cargando viáticos…")
        return
    }

    if (formMode != null) {
        val isAssign = formMode == "assign"
        LazyColumn(
            contentPadding = PaddingValues(16.dp),
            verticalArrangement = Arrangement.spacedBy(10.dp),
        ) {
            item {
                Row(Modifier.fillMaxWidth(), Arrangement.SpaceBetween, Alignment.CenterVertically) {
                    OutlinedButton(onClick = { formMode = null; createError = null }) { Text("← Cancelar") }
                    Text(
                        if (isAssign) "Asignar viático" else "Solicitar viático",
                        fontWeight = FontWeight.Bold,
                    )
                }
            }
            item {
                Text(
                    if (isAssign) {
                        "Presupuesto anticipado para actividad #$activityId (sin comprobante)."
                    } else {
                        "El viático se registrará con actividadId=$activityId."
                    },
                    style = MaterialTheme.typography.bodySmall,
                    color = Color(0xFF64748B),
                )
            }
            if (isAssign) {
                item {
                    Text("Asignar a", style = MaterialTheme.typography.labelMedium)
                    var userMenu by remember { mutableStateOf(false) }
                    Box {
                        OutlinedButton(onClick = { userMenu = true }, modifier = Modifier.fillMaxWidth()) {
                            Text(users.firstOrNull { it.id == assigneeId }?.nombre ?: "— Seleccionar usuario —")
                        }
                        DropdownMenu(expanded = userMenu, onDismissRequest = { userMenu = false }) {
                            users.forEach { u ->
                                DropdownMenuItem(
                                    text = { Text(u.nombre) },
                                    onClick = {
                                        assigneeId = u.id
                                        userMenu = false
                                    },
                                )
                            }
                        }
                    }
                }
            }
            item {
                OutlinedTextField(
                    value = amountText,
                    onValueChange = { amountText = it.filter { c -> c.isDigit() || c == '.' } },
                    label = { Text("Monto (MXN)") },
                    singleLine = true,
                    modifier = Modifier.fillMaxWidth(),
                )
            }
            item {
                OutlinedTextField(
                    value = motivo,
                    onValueChange = { motivo = it },
                    label = { Text("Motivo / concepto") },
                    minLines = 2,
                    modifier = Modifier.fillMaxWidth(),
                )
            }
            item {
                Text("Categoría", style = MaterialTheme.typography.labelMedium)
                Row(Modifier.horizontalScroll(rememberScrollState()), horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                    VIATIC_CATEGORIES.forEach { cat ->
                        FilterChip(
                            selected = categoria == cat,
                            onClick = { categoria = cat },
                            label = { Text(cat, style = MaterialTheme.typography.labelSmall) },
                        )
                    }
                }
            }
            if (!isAssign) {
                item {
                    Text("Comprobante", fontWeight = FontWeight.SemiBold)
                    MediaPickerBar(
                        onPicked = { picked -> ticketDataUrl = picked.firstOrNull()?.let { mediaToDataUrl(it) } },
                        allowCamera = true,
                        allowGallery = true,
                        allowDocuments = true,
                    )
                    if (ticketDataUrl != null) {
                        Text("✓ Comprobante listo", color = Color(0xFF10B981), style = MaterialTheme.typography.bodySmall)
                    }
                }
            }
            if (!createError.isNullOrBlank()) {
                item { Text(createError!!, color = MaterialTheme.colorScheme.error) }
            }
            item {
                Button(
                    onClick = {
                        val amount = amountText.toDoubleOrNull() ?: return@Button
                        if (amount <= 0 || motivo.isBlank()) return@Button
                        if (isAssign && assigneeId == null) {
                            createError = "Selecciona el usuario beneficiario"
                            return@Button
                        }
                        if (!isAssign && ticketDataUrl == null) return@Button
                        creating = true
                        createError = null
                        scope.launch {
                            try {
                                withContext(Dispatchers.IO) {
                                    if (isAssign) {
                                        repo.assignViatic(
                                            usuarioId = assigneeId!!,
                                            amount = amount,
                                            motivo = motivo.trim(),
                                            categoria = categoria,
                                            activityId = activityId,
                                        )
                                    } else {
                                        repo.createViatic(
                                            amount = amount,
                                            motivo = motivo.trim(),
                                            categoria = categoria,
                                            activityId = activityId,
                                            ticketEvidenciaUrl = ticketDataUrl!!,
                                        )
                                    }
                                }
                                amountText = ""
                                motivo = ""
                                ticketDataUrl = null
                                formMode = null
                                reloadViatics()
                            } catch (e: Exception) {
                                createError = e.message ?: "No se pudo guardar"
                            } finally {
                                creating = false
                            }
                        }
                    },
                    enabled = !creating &&
                        amountText.toDoubleOrNull()?.let { it > 0 } == true &&
                        motivo.isNotBlank() &&
                        (isAssign && assigneeId != null || !isAssign && ticketDataUrl != null),
                    modifier = Modifier.fillMaxWidth(),
                ) {
                    Text(
                        when {
                            creating -> "Guardando…"
                            isAssign -> "Asignar"
                            else -> "Enviar a aprobación"
                        },
                    )
                }
            }
        }
        return
    }

    LazyColumn(
        contentPadding = PaddingValues(16.dp),
        verticalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        item {
            Row(
                Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(8.dp),
            ) {
                if (canAssign) {
                    OutlinedButton(
                        onClick = {
                            formMode = "assign"
                            createError = null
                            assigneeId = defaultAssigneeId
                        },
                        modifier = Modifier.weight(1f),
                    ) { Text("Asignar viático") }
                }
                if (canCreate) {
                    Button(
                        onClick = { formMode = "request"; createError = null },
                        modifier = Modifier.weight(1f),
                    ) { Text("Solicitar viático") }
                }
            }
        }
        if (viatics.isEmpty()) {
            item {
                NxEmptyState(
                    title = "Sin viáticos vinculados",
                    subtitle = when {
                        canAssign -> "Asigna un viático al responsable o solicita uno para esta actividad."
                        canCreate -> "Solicita un viático para esta actividad."
                        else -> "No hay solicitudes asociadas."
                    },
                    actionLabel = when {
                        canAssign -> "Asignar viático"
                        canCreate -> "Solicitar viático"
                        else -> null
                    },
                    onAction = when {
                        canAssign -> { { formMode = "assign"; assigneeId = defaultAssigneeId } }
                        canCreate -> { { formMode = "request" } }
                        else -> null
                    },
                )
            }
        } else {
            items(viatics, key = { it.id }) { v ->
                Card(Modifier.fillMaxWidth(), shape = RoundedCornerShape(12.dp)) {
                    Column(Modifier.padding(12.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                            Text(v.displayStatus(), fontWeight = FontWeight.Bold)
                            Text(
                                v.montoSolicitado?.let { "$%,.2f".format(it) } ?: "—",
                                fontWeight = FontWeight.SemiBold,
                                color = Color(0xFF0D9488),
                            )
                        }
                        if (!v.usuario?.nombre.isNullOrBlank()) {
                            Text(v.usuario!!.nombre, style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                        }
                        val concepto = v.razonGasto?.takeIf { it.isNotBlank() } ?: v.motivo
                        if (!concepto.isNullOrBlank()) {
                            Text(concepto, style = MaterialTheme.typography.bodySmall)
                        }
                        if (!v.categoria.isNullOrBlank()) {
                            Text(v.categoria!!, style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                        }
                    }
                }
            }
        }
    }
}

@Composable
fun ActivityIssuesTab(activityId: Long, canManage: Boolean) {
    val context = LocalContext.current
    val repo = remember(context) { ConsoleRepository(context) }
    var incidents by remember { mutableStateOf<List<ActivityIncidentDto>>(emptyList()) }
    var recommendations by remember { mutableStateOf<List<ActivityRecommendationDto>>(emptyList()) }
    var loading by remember { mutableStateOf(true) }
    var actionError by remember { mutableStateOf<String?>(null) }
    var showIncidentForm by remember { mutableStateOf(false) }
    var showRecForm by remember { mutableStateOf(false) }
    var savingIncident by remember { mutableStateOf(false) }
    var savingRec by remember { mutableStateOf(false) }
    var incidentTipo by remember { mutableStateOf(INCIDENT_TYPES[1]) }
    var incidentSeveridad by remember { mutableStateOf("MEDIA") }
    var incidentDescripcion by remember { mutableStateOf("") }
    var incidentAccion by remember { mutableStateOf("") }
    var incidentHoras by remember { mutableStateOf("") }
    var recTipo by remember { mutableStateOf("MEJORA") }
    var recPrioridad by remember { mutableStateOf("MEDIA") }
    var recDescripcion by remember { mutableStateOf("") }
    var recCosto by remember { mutableStateOf("") }
    val scope = rememberCoroutineScope()

    suspend fun reload() {
        val (i, r) = withContext(Dispatchers.IO) {
            val inc = runCatching { repo.activityIncidents(activityId) }.getOrDefault(emptyList())
            val rec = runCatching { repo.activityRecommendations(activityId) }.getOrDefault(emptyList())
            inc to rec
        }
        incidents = i
        recommendations = r
    }

    LaunchedEffect(activityId) {
        loading = true
        actionError = null
        reload()
        loading = false
    }

    if (loading) {
        NxLoadingBlock("Cargando incidencias…")
        return
    }

    LazyColumn(
        contentPadding = PaddingValues(16.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        item {
            Row(Modifier.fillMaxWidth(), Arrangement.SpaceBetween, Alignment.CenterVertically) {
                Text("Incidencias (${incidents.size})", fontWeight = FontWeight.Bold, fontSize = 14.sp)
                if (canManage) {
                    OutlinedButton(onClick = { showIncidentForm = !showIncidentForm; showRecForm = false }) {
                        Text(if (showIncidentForm) "Cancelar" else "Registrar", fontSize = 12.sp)
                    }
                }
            }
            Text(
                "Lo que impidió o retrasó el trabajo en sitio.",
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }

        if (showIncidentForm) {
            item {
                Card(Modifier.fillMaxWidth(), shape = RoundedCornerShape(12.dp)) {
                    Column(Modifier.padding(12.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                        Text("Tipo", style = MaterialTheme.typography.labelMedium)
                        Row(Modifier.horizontalScroll(rememberScrollState()), horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                            INCIDENT_TYPES.forEach { t ->
                                FilterChip(
                                    selected = incidentTipo == t,
                                    onClick = { incidentTipo = t },
                                    label = { Text(INCIDENT_TYPE_LABEL[t] ?: t, style = MaterialTheme.typography.labelSmall) },
                                )
                            }
                        }
                        Text("Severidad", style = MaterialTheme.typography.labelMedium)
                        Row(Modifier.horizontalScroll(rememberScrollState()), horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                            INCIDENT_SEVERITIES.forEach { s ->
                                FilterChip(
                                    selected = incidentSeveridad == s,
                                    onClick = { incidentSeveridad = s },
                                    label = { Text(SEVERITY_LABEL[s] ?: s, style = MaterialTheme.typography.labelSmall) },
                                )
                            }
                        }
                        OutlinedTextField(
                            value = incidentHoras,
                            onValueChange = { incidentHoras = it.filter { c -> c.isDigit() || c == '.' } },
                            label = { Text("Horas perdidas (opcional)") },
                            singleLine = true,
                            modifier = Modifier.fillMaxWidth(),
                        )
                        OutlinedTextField(
                            value = incidentDescripcion,
                            onValueChange = { incidentDescripcion = it },
                            label = { Text("Qué pasó") },
                            minLines = 2,
                            modifier = Modifier.fillMaxWidth(),
                        )
                        OutlinedTextField(
                            value = incidentAccion,
                            onValueChange = { incidentAccion = it },
                            label = { Text("Acción tomada (opcional)") },
                            singleLine = true,
                            modifier = Modifier.fillMaxWidth(),
                        )
                        Button(
                            onClick = {
                                if (incidentDescripcion.isBlank()) return@Button
                                savingIncident = true
                                actionError = null
                                scope.launch {
                                    try {
                                        withContext(Dispatchers.IO) {
                                            repo.addActivityIncident(
                                                activityId = activityId,
                                                tipo = incidentTipo,
                                                severidad = incidentSeveridad,
                                                descripcion = incidentDescripcion.trim(),
                                                accionTomada = incidentAccion.takeIf { it.isNotBlank() },
                                                horasPerdidas = incidentHoras.toDoubleOrNull(),
                                            )
                                        }
                                        incidentDescripcion = ""
                                        incidentAccion = ""
                                        incidentHoras = ""
                                        showIncidentForm = false
                                        reload()
                                    } catch (e: Exception) {
                                        actionError = e.message ?: "No se pudo registrar"
                                    } finally {
                                        savingIncident = false
                                    }
                                }
                            },
                            enabled = !savingIncident && incidentDescripcion.isNotBlank(),
                            modifier = Modifier.fillMaxWidth(),
                        ) { Text(if (savingIncident) "Guardando…" else "Registrar incidencia") }
                    }
                }
            }
        }

        if (incidents.isEmpty()) {
            item {
                Text(
                    "Sin incidencias registradas en este servicio.",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
        } else {
            items(incidents, key = { it.id }) { inc ->
                val resolved = !inc.resueltoAt.isNullOrBlank()
                val borderColor = if (resolved) Color(0xFFE2E8F0) else (SEVERITY_COLOR[inc.severidad] ?: Color(0xFF64748B))
                Card(
                    Modifier.fillMaxWidth(),
                    shape = RoundedCornerShape(12.dp),
                    colors = CardDefaults.cardColors(
                        containerColor = if (resolved) Color(0xFFF8FAFC) else Color.White,
                    ),
                ) {
                    Row(Modifier.fillMaxWidth()) {
                        Box(
                            Modifier
                                .width(4.dp)
                                .heightIn(min = 72.dp)
                                .background(borderColor),
                        )
                        Column(
                            Modifier
                                .weight(1f)
                                .padding(12.dp),
                            verticalArrangement = Arrangement.spacedBy(4.dp),
                        ) {
                            Row(verticalAlignment = Alignment.CenterVertically) {
                                Text(
                                    INCIDENT_TYPE_LABEL[inc.tipo] ?: inc.tipo,
                                    fontWeight = FontWeight.SemiBold,
                                    fontSize = 13.sp,
                                )
                                Spacer(Modifier.width(8.dp))
                                Text(
                                    SEVERITY_LABEL[inc.severidad] ?: inc.severidad,
                                    fontSize = 11.sp,
                                    fontWeight = FontWeight.SemiBold,
                                    color = SEVERITY_COLOR[inc.severidad] ?: Color(0xFF64748B),
                                )
                            }
                            Text(inc.descripcion, fontSize = 13.sp)
                            if (!inc.accionTomada.isNullOrBlank()) {
                                Text("Acción: ${inc.accionTomada}", fontSize = 12.sp, color = MaterialTheme.colorScheme.onSurfaceVariant)
                            }
                            val meta = buildString {
                                inc.reportadoPor?.nombre?.let { append("Reportó $it") }
                                (inc.horasPerdidas ?: 0.0).takeIf { it > 0 }?.let {
                                    if (isNotEmpty()) append(" · ")
                                    append("${it} h perdidas")
                                }
                                if (resolved) {
                                    if (isNotEmpty()) append(" · ")
                                    append("resuelta")
                                    inc.resueltoPor?.nombre?.let { append(" por $it") }
                                }
                            }
                            if (meta.isNotBlank()) {
                                Text(meta, fontSize = 11.sp, color = MaterialTheme.colorScheme.onSurfaceVariant)
                            }
                        }
                        if (canManage) {
                            TextButton(
                                onClick = {
                                    scope.launch {
                                        actionError = null
                                        try {
                                            withContext(Dispatchers.IO) {
                                                if (resolved) {
                                                    repo.reopenActivityIncident(activityId, inc.id)
                                                } else {
                                                    repo.resolveActivityIncident(activityId, inc.id)
                                                }
                                            }
                                            reload()
                                        } catch (e: Exception) {
                                            actionError = e.message ?: "No se pudo actualizar"
                                        }
                                    }
                                },
                                modifier = Modifier.align(Alignment.CenterVertically),
                            ) { Text(if (resolved) "Reabrir" else "Resolver", fontSize = 12.sp) }
                        }
                    }
                }
            }
        }

        item { HorizontalDivider(color = Color(0xFFE2E8F0)) }

        item {
            Row(Modifier.fillMaxWidth(), Arrangement.SpaceBetween, Alignment.CenterVertically) {
                Text("Recomendaciones (${recommendations.size})", fontWeight = FontWeight.Bold, fontSize = 14.sp)
                if (canManage) {
                    OutlinedButton(onClick = { showRecForm = !showRecForm; showIncidentForm = false }) {
                        Text(if (showRecForm) "Cancelar" else "Registrar", fontSize = 12.sp)
                    }
                }
            }
            Text(
                "Lo que el técnico recomienda al cliente; puede enlazarse a una cotización.",
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }

        if (showRecForm) {
            item {
                Card(Modifier.fillMaxWidth(), shape = RoundedCornerShape(12.dp)) {
                    Column(Modifier.padding(12.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                        Text("Tipo", style = MaterialTheme.typography.labelMedium)
                        Row(Modifier.horizontalScroll(rememberScrollState()), horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                            RECOMMENDATION_TYPES.forEach { t ->
                                FilterChip(
                                    selected = recTipo == t,
                                    onClick = { recTipo = t },
                                    label = { Text(RECOMMENDATION_TYPE_LABEL[t] ?: t, style = MaterialTheme.typography.labelSmall) },
                                )
                            }
                        }
                        Text("Prioridad", style = MaterialTheme.typography.labelMedium)
                        Row(Modifier.horizontalScroll(rememberScrollState()), horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                            RECOMMENDATION_PRIORITIES.forEach { p ->
                                FilterChip(
                                    selected = recPrioridad == p,
                                    onClick = { recPrioridad = p },
                                    label = { Text(PRIORITY_LABEL[p] ?: p, style = MaterialTheme.typography.labelSmall) },
                                )
                            }
                        }
                        OutlinedTextField(
                            value = recCosto,
                            onValueChange = { recCosto = it.filter { c -> c.isDigit() || c == '.' } },
                            label = { Text("Costo estimado (opcional)") },
                            singleLine = true,
                            modifier = Modifier.fillMaxWidth(),
                        )
                        OutlinedTextField(
                            value = recDescripcion,
                            onValueChange = { recDescripcion = it },
                            label = { Text("Qué se recomienda y por qué") },
                            minLines = 2,
                            modifier = Modifier.fillMaxWidth(),
                        )
                        Button(
                            onClick = {
                                if (recDescripcion.isBlank()) return@Button
                                savingRec = true
                                actionError = null
                                scope.launch {
                                    try {
                                        withContext(Dispatchers.IO) {
                                            repo.addActivityRecommendation(
                                                activityId = activityId,
                                                tipo = recTipo,
                                                prioridad = recPrioridad,
                                                descripcion = recDescripcion.trim(),
                                                costoEstimado = recCosto.toDoubleOrNull(),
                                            )
                                        }
                                        recDescripcion = ""
                                        recCosto = ""
                                        showRecForm = false
                                        reload()
                                    } catch (e: Exception) {
                                        actionError = e.message ?: "No se pudo registrar"
                                    } finally {
                                        savingRec = false
                                    }
                                }
                            },
                            enabled = !savingRec && recDescripcion.isNotBlank(),
                            modifier = Modifier.fillMaxWidth(),
                        ) { Text(if (savingRec) "Guardando…" else "Registrar recomendación") }
                    }
                }
            }
        }

        if (recommendations.isEmpty()) {
            item {
                Text(
                    "Sin recomendaciones registradas en este servicio.",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
        } else {
            items(recommendations, key = { it.id }) { rec ->
                Card(Modifier.fillMaxWidth(), shape = RoundedCornerShape(12.dp)) {
                    Column(Modifier.padding(12.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                        Row(Modifier.fillMaxWidth(), Arrangement.SpaceBetween, Alignment.Top) {
                            Column(Modifier.weight(1f)) {
                                Text(
                                    RECOMMENDATION_TYPE_LABEL[rec.tipo] ?: rec.tipo,
                                    fontWeight = FontWeight.SemiBold,
                                    fontSize = 13.sp,
                                )
                                Text(
                                    "${PRIORITY_LABEL[rec.prioridad] ?: rec.prioridad} · ${RECOMMENDATION_STATUS_LABEL[rec.estado] ?: rec.estado}",
                                    fontSize = 11.sp,
                                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                                )
                            }
                            if (canManage && rec.estado == "ABIERTA") {
                                TextButton(
                                    onClick = {
                                        scope.launch {
                                            actionError = null
                                            try {
                                                withContext(Dispatchers.IO) {
                                                    repo.updateActivityRecommendation(
                                                        activityId = activityId,
                                                        recommendationId = rec.id,
                                                        estado = "DESCARTADA",
                                                    )
                                                }
                                                reload()
                                            } catch (e: Exception) {
                                                actionError = e.message ?: "No se pudo actualizar"
                                            }
                                        }
                                    },
                                ) { Text("Descartar", fontSize = 12.sp) }
                            }
                        }
                        Text(rec.descripcion, fontSize = 13.sp)
                        val meta = buildString {
                            rec.creadoPor?.nombre?.let { append("Propuso $it") }
                            (rec.costoEstimado ?: 0.0).takeIf { it > 0 }?.let {
                                if (isNotEmpty()) append(" · ")
                                append("estimado $%,.2f".format(it))
                            }
                            rec.cotizacion?.quoteNumber?.let {
                                if (isNotEmpty()) append(" · ")
                                append("cotización $it")
                            }
                        }
                        if (meta.isNotBlank()) {
                            Text(meta, fontSize = 11.sp, color = MaterialTheme.colorScheme.onSurfaceVariant)
                        }
                    }
                }
            }
        }

        if (!actionError.isNullOrBlank()) {
            item {
                Text(actionError!!, color = MaterialTheme.colorScheme.error, fontSize = 13.sp)
            }
        }
    }
}

@Composable
fun ActivityTeamTab(activityId: Long) {
    val context = LocalContext.current
    val repo = remember(context) { ConsoleRepository(context) }
    var team by remember { mutableStateOf<List<Map<String, Any?>>>(emptyList()) }
    var reassignments by remember { mutableStateOf<List<Map<String, Any?>>>(emptyList()) }
    var loading by remember { mutableStateOf(true) }

    LaunchedEffect(activityId) {
        loading = true
        withContext(Dispatchers.IO) {
            team = runCatching { repo.activityTeam(activityId) }.getOrDefault(emptyList())
            reassignments = runCatching { repo.activityReassignments(activityId) }.getOrDefault(emptyList())
        }
        loading = false
    }

    if (loading) {
        NxLoadingBlock("Cargando equipo…")
        return
    }

    LazyColumn(contentPadding = PaddingValues(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
        item { Text("Equipo asignado", fontWeight = FontWeight.Bold) }
        if (team.isEmpty()) {
            item { Text("Sin asignaciones de equipo.", color = MaterialTheme.colorScheme.onSurfaceVariant) }
        }
        items(team, key = { "tm-${activityMapStr(it, "id", "userId")}" }) { member ->
            val user = member["user"] as? Map<*, *>
            val name = activityMapStr(member, "nombre", "userName")
                .ifBlank { activityMapStr(user as? Map<String, Any?>, "nombre") }
            val rol = activityMapStr(member, "rol", "role")
            NxPanelShell {
                Text(name.ifBlank { "Técnico" }, fontWeight = FontWeight.SemiBold)
                if (rol.isNotBlank()) Text(rol, style = MaterialTheme.typography.bodySmall)
            }
        }
        item { Text("Reasignaciones", fontWeight = FontWeight.Bold, modifier = Modifier.padding(top = 8.dp)) }
        if (reassignments.isEmpty()) {
            item { Text("Sin reasignaciones.", color = MaterialTheme.colorScheme.onSurfaceVariant) }
        }
        items(reassignments, key = { "rs-${activityMapStr(it, "id")}" }) { row ->
            val toUser = row["aUsuario"] as? Map<*, *>
            val to = activityMapStr(toUser as? Map<String, Any?>, "nombre")
            val motivo = activityMapStr(row, "motivo")
            Text("${to.ifBlank { "Técnico" }} · ${motivo.take(100)}", fontSize = 13.sp)
        }
    }
}

@Composable
fun ActivityMaterialsTab(activityId: Long) {
    val context = LocalContext.current
    val repo = remember(context) { ConsoleRepository(context) }
    var items by remember { mutableStateOf<List<Map<String, Any?>>>(emptyList()) }
    var loading by remember { mutableStateOf(true) }

    LaunchedEffect(activityId) {
        loading = true
        items = withContext(Dispatchers.IO) {
            runCatching { repo.activityMaterials(activityId) }.getOrDefault(emptyList())
        }
        loading = false
    }

    if (loading) {
        NxLoadingBlock("Cargando materiales…")
        return
    }

    LazyColumn(contentPadding = PaddingValues(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
        if (items.isEmpty()) {
            item { Text("Sin movimientos de material.", color = MaterialTheme.colorScheme.onSurfaceVariant) }
        }
        items(items, key = { "mat-${activityMapStr(it, "id")}" }) { row ->
            val product = row["product"] as? Map<*, *>
            val name = activityMapStr(product as? Map<String, Any?>, "name", "nombre")
                .ifBlank { activityMapStr(row, "descripcion") }
            val qty = activityMapStr(row, "quantity", "cantidad")
            val type = activityMapStr(row, "type", "tipo")
            NxPanelShell {
                Text(name.ifBlank { "Material" }, fontWeight = FontWeight.SemiBold)
                Text("$type · Cant: $qty", style = MaterialTheme.typography.bodySmall)
            }
        }
    }
}

@Composable
fun ActivityTimelineTab(activityId: Long) {
    val context = LocalContext.current
    val repo = remember(context) { ConsoleRepository(context) }
    var events by remember { mutableStateOf<List<Map<String, Any?>>>(emptyList()) }
    var loading by remember { mutableStateOf(true) }

    LaunchedEffect(activityId) {
        loading = true
        events = withContext(Dispatchers.IO) {
            runCatching { repo.activityTimelineEvents(activityId) }.getOrDefault(emptyList())
        }
        loading = false
    }

    if (loading) {
        NxLoadingBlock("Cargando historial…")
        return
    }

    LazyColumn(contentPadding = PaddingValues(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
        if (events.isEmpty()) {
            item { Text("Sin eventos en el historial.", color = MaterialTheme.colorScheme.onSurfaceVariant) }
        }
        items(events, key = { "ev-${activityMapStr(it, "id")}" }) { ev ->
            val icon = activityMapStr(ev, "icon").ifBlank { "•" }
            val title = activityMapStr(ev, "title")
            val subtitle = activityMapStr(ev, "subtitle")
            val at = activityMapStr(ev, "at").take(16).replace("T", " ")
            NxPanelShell {
                Text("$icon $title", fontWeight = FontWeight.SemiBold, fontSize = 14.sp)
                if (subtitle.isNotBlank()) Text(subtitle, style = MaterialTheme.typography.bodySmall)
                if (at.isNotBlank()) Text(at, style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
        }
    }
}

@Composable
fun ActivityApprovalsTab(evidence: ActivityEvidenceDetailDto?, loading: Boolean) {
    if (loading) {
        NxLoadingBlock("Cargando aprobaciones…")
        return
    }
    LazyColumn(
        contentPadding = PaddingValues(16.dp),
        verticalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        if (evidence == null) {
            item {
                NxEmptyState(
                    title = "Sin flujo de aprobación",
                    subtitle = "Las aprobaciones de evidencias aparecen cuando hay capturas en revisión.",
                )
            }
        } else {
            item {
                Card(Modifier.fillMaxWidth(), shape = RoundedCornerShape(12.dp)) {
                    Column(Modifier.padding(12.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                        Text("Evidencias", fontWeight = FontWeight.Bold)
                        ADetailRow("Estatus", evidence.status)
                        ADetailRow("Revisión", evidence.reviewStatus ?: "—")
                        ADetailRow("Paso rechazado", evidence.rejectedStep ?: "—")
                        if (!evidence.reviewNotes.isNullOrBlank()) {
                            ADetailRow("Notas", evidence.reviewNotes!!)
                        }
                    }
                }
            }
        }
    }
}
