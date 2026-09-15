package mx.nexara.mobile.nativeapp.ui.console.activities

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.ArrowDropDown
import androidx.compose.material.icons.filled.DateRange
import androidx.compose.material.icons.filled.Schedule
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.DatePicker
import androidx.compose.material3.DatePickerDialog
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TimePicker
import androidx.compose.material3.rememberDatePickerState
import androidx.compose.material3.rememberTimePickerState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.key
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
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import mx.nexara.mobile.nativeapp.access.OrgEmails
import mx.nexara.mobile.nativeapp.access.RoleKeys
import mx.nexara.mobile.nativeapp.data.AuthRepository
import mx.nexara.mobile.nativeapp.data.SessionUser
import mx.nexara.mobile.nativeapp.data.api.CreateActivityRequest
import mx.nexara.mobile.nativeapp.data.api.OperationalProjectDto
import mx.nexara.mobile.nativeapp.data.api.TeamBoardUserDto
import mx.nexara.mobile.nativeapp.data.api.toUserMessage
import mx.nexara.mobile.nativeapp.data.console.CoreActivitiesRepository
import mx.nexara.mobile.nativeapp.ui.console.CoreMenu
import mx.nexara.mobile.nativeapp.ui.console.activities.CoreActivityKinds.FormState
import mx.nexara.mobile.nativeapp.ui.enterprise.NxColors
import mx.nexara.mobile.nativeapp.ui.enterprise.NxLoadingBlock
import mx.nexara.mobile.nativeapp.ui.enterprise.NxPanelShell
import mx.nexara.mobile.nativeapp.ui.enterprise.NxSectionHeader

private val BorderGray = Color(0xFFE2E8F0)
private val WarningText = Color(0xFFD97706)

private data class SectorClient(val serviceClientId: Long, val name: String, val salesClientId: Long)

/**
 * Alta de actividad Core, igual que la web:
 * - [selfAssign] = /erp/mis-actividades/nueva → `POST me/activities` (ejecución directa, a tu nombre).
 * - [targetUserId] = /erp/pizarra/:userId/asignar → `POST activities` y luego `POST activities/:id/team`.
 *
 * [onCreated] recibe el id creado (null si quedó en la cola sin conexión).
 */
@Composable
fun CoreActivityFormScreen(
    selfAssign: Boolean,
    targetUserId: Long?,
    onCancel: () -> Unit,
    onCreated: (Long?) -> Unit,
    onAssignOther: (Long) -> Unit,
) {
    val context = LocalContext.current
    val user = remember(context) { AuthRepository(context).loadSession() }
    val repo = remember(context) { CoreActivitiesRepository(context) }

    Column(
        modifier = Modifier
            .fillMaxSize()
            .background(NxColors.Surface)
            .verticalScroll(rememberScrollState())
            .padding(16.dp),
        verticalArrangement = Arrangement.spacedBy(14.dp),
    ) {
        when {
            user == null -> NxLoadingBlock("Cargando…")
            selfAssign && !CoreActivityKinds.isAreaManagerEmail(user.email) -> NxPanelShell {
                Text("Auto-asignarse", fontSize = 20.sp, fontWeight = FontWeight.ExtraBold, color = NxColors.Slate)
                Spacer(Modifier.height(6.dp))
                Text(
                    "Solo los encargados de área pueden auto-asignarse actividades. Tu encargado te las asigna.",
                    fontSize = 14.sp,
                    color = NxColors.Muted,
                )
                TextButton(onClick = onCancel) {
                    Text("← Volver a Mis actividades", color = NxColors.Teal, fontWeight = FontWeight.Bold)
                }
            }
            !selfAssign && (targetUserId == null || targetUserId <= 0L) ->
                Text("Persona no válida.", color = NxColors.Danger, fontSize = 14.sp)
            else -> AssignFlow(
                user = user,
                repo = repo,
                selfAssign = selfAssign,
                targetUserId = if (selfAssign) user.id else targetUserId!!,
                onCancel = onCancel,
                onCreated = onCreated,
                onAssignOther = onAssignOther,
            )
        }
    }
}

@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun AssignFlow(
    user: SessionUser,
    repo: CoreActivitiesRepository,
    selfAssign: Boolean,
    targetUserId: Long,
    onCancel: () -> Unit,
    onCreated: (Long?) -> Unit,
    onAssignOther: (Long) -> Unit,
) {
    val k = CoreActivityKinds
    val roleKey = remember(user) { CoreMenu.canonicalRole(user) }

    var person by remember(targetUserId) { mutableStateOf<TeamBoardUserDto?>(null) }
    var boardUsers by remember(targetUserId) { mutableStateOf<List<TeamBoardUserDto>>(emptyList()) }
    var loadingPerson by remember(targetUserId) { mutableStateOf(!selfAssign) }
    var loadError by remember(targetUserId) { mutableStateOf<String?>(null) }

    LaunchedEffect(targetUserId, selfAssign) {
        if (selfAssign) return@LaunchedEffect
        try {
            val (p, board) = withContext(Dispatchers.IO) {
                repo.boardUser(targetUserId) to runCatching { repo.board() }.getOrNull()
            }
            person = p
            boardUsers = board?.users.orEmpty()
            loadError = null
        } catch (e: Exception) {
            loadError = e.toUserMessage("No se pudo cargar a la persona")
        } finally {
            loadingPerson = false
        }
    }

    val targetEmail = if (selfAssign) user.email else person?.email
    val displayName = if (selfAssign) {
        user.nombre
    } else {
        person?.nombre?.takeIf { it.isNotBlank() } ?: "Persona #$targetUserId"
    }
    val short = k.firstTwoWords(displayName)

    val allowedKinds = remember(user.email, targetEmail, roleKey, user.isSuperAdmin) {
        k.kindsForAssignment(user.email, targetEmail, roleKey, user.isSuperAdmin)
    }

    var kind by remember(targetUserId) { mutableStateOf<String?>(null) }
    var charge by remember(targetUserId) { mutableStateOf<String?>(null) }
    var headcount by remember(targetUserId) { mutableIntStateOf(1) }
    var extraIds by remember(targetUserId) { mutableStateOf<List<Long>>(emptyList()) }
    var extraNotes by remember(targetUserId) { mutableStateOf<Map<Long, String>>(emptyMap()) }
    var leadNotes by remember(targetUserId) { mutableStateOf("") }
    var teamError by remember(targetUserId) { mutableStateOf<String?>(null) }
    var exitReady by remember(targetUserId) { mutableStateOf(false) }
    var exitId by remember(targetUserId) { mutableStateOf<Long?>(null) }

    fun changeKind(next: String?) {
        if (next == kind) return
        kind = next
        charge = null
        headcount = 1
        extraIds = emptyList()
    }

    LaunchedEffect(allowedKinds) {
        if (allowedKinds.size == 1) {
            changeKind(allowedKinds[0])
        } else if (kind != null && kind !in allowedKinds) {
            changeKind(null)
        }
    }

    // Solo Luis: servicio → despacho + cupo; tarea/proyecto/comercial → ejecución directa.
    val despachoOnly = !selfAssign && k.forcesDespachoOnly(targetEmail, kind)
    val ejecucionOnly = !selfAssign && k.forcesEjecucionOnly(targetEmail, kind)
    val offerCharge = !selfAssign && k.canOfferAssignmentCharge(targetEmail) && !despachoOnly && !ejecucionOnly
    val chargeReady = selfAssign || despachoOnly || ejecucionOnly ||
        !k.canOfferAssignmentCharge(targetEmail) || charge != null
    val effectiveCharge: String? = when {
        selfAssign -> k.EJECUCION
        despachoOnly -> k.DESPACHO
        ejecucionOnly -> k.EJECUCION
        offerCharge -> charge
        else -> null
    }
    val bridgeNeeded = !selfAssign && kind == k.SERVICIO && k.servicioShouldGoToBridge(
        creatorEmail = user.email,
        targetEmail = targetEmail,
        isSuperAdmin = user.isSuperAdmin,
        isCeo = roleKey == RoleKeys.CEO,
    )
    val antonioOnBoard = boardUsers.firstOrNull { OrgEmails.norm(it.email) == OrgEmails.ANTONIO }

    val roster = boardUsers.filter { it.id != targetUserId }
    val teamForExtras = if (kind == k.SERVICIO && k.isServicioBridgeEmail(targetEmail)) {
        val allow = k.servicioDelegateEmails().toSet()
        roster.filter { OrgEmails.norm(it.email) in allow }
    } else {
        val pool = k.teamPoolEmailsForAssignment(targetEmail, kind, effectiveCharge).toSet()
        if (pool.isNotEmpty()) roster.filter { OrgEmails.norm(it.email) in pool } else roster
    }
    val selectedExtras = extraIds.filter { id -> teamForExtras.any { it.id == id } }
    val autoPeers = k.peerCoordinatorEmails(
        primaryEmail = targetEmail,
        memberEmails = selectedExtras.mapNotNull { id ->
            (teamForExtras.firstOrNull { it.id == id } ?: boardUsers.firstOrNull { it.id == id })
                ?.email?.let(OrgEmails::norm)?.takeIf { it.isNotEmpty() }
        },
    ).mapNotNull { email -> boardUsers.firstOrNull { OrgEmails.norm(it.email) == email } }

    // ── Encabezado ──────────────────────────────────────────────────────────
    TextButton(onClick = onCancel) {
        Text(
            if (selfAssign) "← Volver a Mis actividades" else "← Volver al perfil",
            color = NxColors.Muted,
            fontWeight = FontWeight.SemiBold,
            fontSize = 13.sp,
        )
    }
    if (selfAssign) {
        NxPanelShell {
            Text("🙋 Auto-asignarme una actividad", fontSize = 20.sp, fontWeight = FontWeight.ExtraBold, color = NxColors.Slate)
            Spacer(Modifier.height(6.dp))
            Text(
                "Queda solo a tu nombre, como ejecución directa. Ponle día, hora y cuánto te va a tomar; " +
                    "después la acomodas en tu cola.",
                fontSize = 13.sp,
                color = NxColors.Muted,
                lineHeight = 18.sp,
            )
        }
    } else {
        NxPanelShell {
            Row(verticalAlignment = Alignment.CenterVertically) {
                PersonAvatar(displayName, person?.avatarUrl, 64.dp)
                Spacer(Modifier.width(14.dp))
                Column {
                    Text("RESPONSABLE", fontSize = 11.sp, fontWeight = FontWeight.Bold, color = NxColors.Muted)
                    Text(displayName, fontSize = 20.sp, fontWeight = FontWeight.ExtraBold, color = NxColors.Slate)
                    Text(
                        person?.puesto?.takeIf { it.isNotBlank() }
                            ?: person?.email?.takeIf { it.isNotBlank() }
                            ?: "Elige el tipo y completa los datos",
                        fontSize = 13.sp,
                        color = NxColors.Muted,
                    )
                }
            }
        }
    }
    loadError?.let { Text(it, color = NxColors.Danger, fontSize = 13.sp) }
    teamError?.let { Text(it, color = WarningText, fontSize = 13.sp) }
    if (exitReady) {
        TextButton(onClick = { onCreated(exitId) }) {
            Text("Volver al perfil →", color = NxColors.Teal, fontWeight = FontWeight.Bold)
        }
    }

    if (loadingPerson) {
        NxLoadingBlock("Cargando…")
        return
    }

    // ── 1 · Tipo ────────────────────────────────────────────────────────────
    StepLabel(if (selfAssign) "1 · ¿Qué tipo de actividad es?" else "1 · Tipo de actividad")
    KindGrid(kinds = allowedKinds, selected = kind, onPick = { changeKind(it) })
    if (!selfAssign) {
        Text(
            "Solo se muestran tipos válidos para $displayName. Campo David: tarea/proyecto/obra · Soporte " +
                "Antonio: tarea/proyecto/servicio · Josué (obra): todo menos servicio · Daniela/Mónica: " +
                "tarea/comercial · Encargados: + comercial.",
            fontSize = 12.sp,
            color = NxColors.Muted,
            lineHeight = 16.sp,
        )
    }

    // ── 2 · Encargo ─────────────────────────────────────────────────────────
    if (kind != null && despachoOnly && !bridgeNeeded) {
        NxPanelShell {
            StepLabel("2 · Encargo a $short")
            Spacer(Modifier.height(6.dp))
            Text("Despacho a equipo", fontSize = 14.sp, fontWeight = FontWeight.ExtraBold, color = NxColors.Slate)
            Text(
                "Solo en servicios: le dejas la actividad y cuántas personas ocupas; él manda a Antonio y " +
                    "Antonio elige al soporte.",
                fontSize = 12.sp,
                color = NxColors.Muted,
            )
            Spacer(Modifier.height(10.dp))
            Text("Personas que se ocupan *", fontSize = 12.sp, fontWeight = FontWeight.SemiBold, color = NxColors.Muted)
            Stepper(
                value = headcount,
                onMinus = { headcount = k.clampHeadcount(headcount - 1) },
                onPlus = { headcount = k.clampHeadcount(headcount + 1) },
            )
            OutlinedTextField(
                value = leadNotes,
                onValueChange = { leadNotes = it },
                label = { Text("Indicaciones para $short (opcional)") },
                placeholder = { Text("Qué debe coordinar / contexto…") },
                minLines = 2,
                modifier = Modifier.fillMaxWidth(),
            )
        }
    }
    if (kind != null && ejecucionOnly && !bridgeNeeded) {
        NxPanelShell {
            StepLabel("2 · Encargo a $short")
            Spacer(Modifier.height(6.dp))
            Text("Ejecución directa", fontSize = 14.sp, fontWeight = FontWeight.ExtraBold, color = NxColors.Slate)
            Text("Actividad personal suya: la hace él, sin despacho a equipo.", fontSize = 12.sp, color = NxColors.Muted)
            Spacer(Modifier.height(8.dp))
            OutlinedTextField(
                value = leadNotes,
                onValueChange = { leadNotes = it },
                label = { Text("Indicaciones (opcional)") },
                placeholder = { Text("Qué debe hacer…") },
                minLines = 2,
                modifier = Modifier.fillMaxWidth(),
            )
        }
    }
    if (kind != null && offerCharge && !bridgeNeeded) {
        StepLabel("2 · Encargo a $short")
        k.CHARGES.forEach { c ->
            ChoiceCard(
                title = c.title,
                help = c.help,
                selected = charge == c.id,
                onClick = { charge = c.id },
                modifier = Modifier.fillMaxWidth(),
            )
        }
    }
    if (bridgeNeeded) {
        SoftNote(
            title = "Servicios van primero a Antonio",
            text = "(puente de sistemas). Él agenda día/hora a Carolina o Alejandro.",
            color = CoreActivityRules.NARANJA,
        )
        if (antonioOnBoard != null) {
            Button(
                onClick = { onAssignOther(antonioOnBoard.id) },
                colors = ButtonDefaults.buttonColors(containerColor = NxColors.Teal),
                modifier = Modifier.heightIn(min = 48.dp),
            ) { Text("Ir a asignar a ${k.firstTwoWords(antonioOnBoard.nombre)} →", fontWeight = FontWeight.Bold) }
        } else {
            Text("No aparece Antonio en el tablero; revisa el seed / jerarquía.", fontSize = 12.sp, color = NxColors.Muted)
        }
    }

    val meta = k.meta(kind)
    if (meta != null && !bridgeNeeded && chargeReady) {
        // ── 3 · Equipo extra ────────────────────────────────────────────────
        if (!selfAssign && !despachoOnly && !ejecucionOnly) {
            NxPanelShell {
                StepLabel(
                    "${if (offerCharge) "3" else "2"} · Equipo " +
                        if (effectiveCharge == k.DESPACHO) "(ejecutor / apoyo)" else "extra (opcional)",
                )
                Spacer(Modifier.height(6.dp))
                Text(
                    k.extrasHelp(kind, effectiveCharge, targetEmail, displayName),
                    fontSize = 12.sp,
                    color = NxColors.Muted,
                    lineHeight = 16.sp,
                )
                Spacer(Modifier.height(10.dp))
                if (autoPeers.isNotEmpty()) {
                    SoftNote(
                        title = "Coordinadores automáticos",
                        text = "Además del responsable, se asignará como LEAD a " +
                            autoPeers.joinToString(", ") { k.firstTwoWords(it.nombre) } +
                            " (por el equipo cruzado instaladores / soporte).",
                        color = CoreActivityRules.VERDE,
                    )
                    Spacer(Modifier.height(10.dp))
                }
                if (teamForExtras.isEmpty()) {
                    Text("No hay más personas en el tablero para sumar ahora.", fontSize = 12.sp, color = NxColors.Muted)
                } else {
                    FlowRow(
                        horizontalArrangement = Arrangement.spacedBy(8.dp),
                        verticalArrangement = Arrangement.spacedBy(8.dp),
                    ) {
                        teamForExtras.forEach { u ->
                            PersonPill(
                                person = u,
                                selected = u.id in selectedExtras,
                                onClick = {
                                    extraIds = if (u.id in extraIds) extraIds - u.id else extraIds + u.id
                                },
                            )
                        }
                    }
                    if (selectedExtras.isNotEmpty()) {
                        Spacer(Modifier.height(12.dp))
                        OutlinedTextField(
                            value = leadNotes,
                            onValueChange = { leadNotes = it },
                            label = { Text("Indicaciones para $short (responsable, opcional)") },
                            placeholder = { Text("Qué debe hacer $short…") },
                            minLines = 2,
                            modifier = Modifier.fillMaxWidth(),
                        )
                        selectedExtras.forEach { id ->
                            val u = teamForExtras.firstOrNull { it.id == id } ?: return@forEach
                            Spacer(Modifier.height(8.dp))
                            OutlinedTextField(
                                value = extraNotes[id].orEmpty(),
                                onValueChange = { extraNotes = extraNotes + (id to it) },
                                label = { Text("Indicaciones para ${k.firstTwoWords(u.nombre)} (opcional)") },
                                placeholder = { Text("Qué debe hacer esta persona…") },
                                minLines = 2,
                                modifier = Modifier.fillMaxWidth(),
                            )
                        }
                    }
                }
            }
        }

        // ── Datos de la actividad ───────────────────────────────────────────
        val step = when {
            selfAssign -> "2"
            despachoOnly || ejecucionOnly -> "3"
            offerCharge -> "4"
            else -> "3"
        }
        val title = buildString {
            append("$step · ${meta.emoji} ${meta.title}")
            if (selfAssign) {
                append(" · para ti")
            } else {
                k.chargeMeta(effectiveCharge)?.let { append(" · ${it.badge}") }
                if (despachoOnly) append(" · $headcount persona${if (headcount == 1) "" else "s"}")
            }
        }
        val submit: suspend (CreateActivityRequest) -> Unit = { body ->
            val id = withContext(Dispatchers.IO) {
                if (selfAssign) repo.selfAssign(body) else repo.createActivity(body)
            }
            if (selfAssign) {
                onCreated(id)
            } else {
                teamError = null
                val plan = k.teamPlan(
                    targetUserId = targetUserId,
                    despachoOnly = despachoOnly,
                    ejecucionOnly = ejecucionOnly,
                    effectiveCharge = effectiveCharge,
                    headcount = headcount,
                    leadNotes = leadNotes,
                    extraIds = selectedExtras,
                    extraNotes = extraNotes,
                    peerCoordinatorIds = autoPeers.map { it.id },
                )
                if (id == null) {
                    if (plan.isEmpty()) {
                        onCreated(null)
                    } else {
                        teamError = "La actividad quedó en la cola sin conexión; suma al equipo cuando se envíe."
                        exitReady = true
                    }
                } else {
                    val failure = try {
                        withContext(Dispatchers.IO) {
                            plan.forEach { repo.addTeamMember(id, it.userId, it.rol, it.indicaciones) }
                        }
                        null
                    } catch (e: Exception) {
                        e.toUserMessage("Actividad creada, pero falló al sumar el equipo")
                    }
                    if (failure == null) {
                        onCreated(id)
                    } else {
                        teamError = failure
                        exitId = id
                        exitReady = true
                    }
                }
            }
        }
        key(kind, effectiveCharge) {
            ActivityFormPanel(
                stepTitle = title,
                meta = meta,
                initial = k.initialForm(meta.id, targetUserId, effectiveCharge),
                creatorEmail = user.email,
                creadoPorId = user.id,
                repo = repo,
                onCancel = onCancel,
                onSubmit = submit,
            )
        }
    } else if (meta != null && !bridgeNeeded && offerCharge && charge == null) {
        Text(
            "Elige el encargo (ejecución directa o despacho a equipo) para continuar.",
            fontSize = 13.sp,
            color = NxColors.Muted,
        )
    } else if (!bridgeNeeded) {
        Text("Elige un tipo para continuar.", fontSize = 13.sp, color = NxColors.Muted)
    }
    Spacer(Modifier.height(24.dp))
}

/** OpsActivityForm (tone core): título, proyecto/cliente, subtipo, prioridad, agenda, tiempos, fotos. */
@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun ActivityFormPanel(
    stepTitle: String,
    meta: CoreActivityKinds.KindMeta,
    initial: FormState,
    creatorEmail: String?,
    creadoPorId: Long,
    repo: CoreActivitiesRepository,
    onCancel: () -> Unit,
    onSubmit: suspend (CreateActivityRequest) -> Unit,
) {
    val k = CoreActivityKinds
    val scope = rememberCoroutineScope()
    var form by remember { mutableStateOf(initial) }
    var tareaOtroOpen by remember { mutableStateOf(false) }
    var projects by remember { mutableStateOf<List<OperationalProjectDto>>(emptyList()) }
    var sectorClients by remember { mutableStateOf<List<SectorClient>>(emptyList()) }
    var nextAn by remember { mutableStateOf("") }
    var nextAnLoaded by remember { mutableStateOf(false) }
    var saving by remember { mutableStateOf(false) }
    var done by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf<String?>(null) }
    var success by remember { mutableStateOf<String?>(null) }
    var showOtroDialog by remember { mutableStateOf(false) }
    var otroInput by remember { mutableStateOf("") }

    LaunchedEffect(meta.id) {
        val (projs, an) = withContext(Dispatchers.IO) {
            val p = runCatching { repo.operationalProjects() }.getOrDefault(emptyList())
            val n = runCatching { repo.nextAnNumber() }.getOrDefault("")
            p to n
        }
        projects = projs
        nextAn = an
        nextAnLoaded = true
        val sectors = k.clientSectorsForActivityKind(meta.id, creatorEmail)
        sectorClients = if (sectors.isEmpty()) {
            emptyList()
        } else {
            withContext(Dispatchers.IO) {
                val bySalesId = LinkedHashMap<Long, SectorClient>()
                for (sector in sectors) {
                    val rows = runCatching { repo.salesClients(sector.name) }.getOrDefault(emptyList())
                    for (row in rows) {
                        val serviceId = row.serviceClientId ?: continue
                        bySalesId[row.id] = SectorClient(
                            serviceClientId = serviceId,
                            name = row.legalName?.takeIf { it.isNotBlank() } ?: row.name.orEmpty(),
                            salesClientId = row.id,
                        )
                    }
                }
                bySalesId.values.toList()
            }
        }
    }

    val isTarea = meta.id == k.TAREA
    val needsClientPicker = meta.id == k.SERVICIO || meta.id == k.COMERCIAL
    val filtersProjectsBySector = meta.id == k.PROYECTO || meta.id == k.OBRA
    val tareaTipo = k.tareaTipo(form, tareaOtroOpen)
    val activeProjects = projects.filter { it.status == "ACTIVE" }.let { active ->
        if (!filtersProjectsBySector || sectorClients.isEmpty()) {
            active
        } else {
            val ok = sectorClients.map { it.serviceClientId }.toSet()
            active.filter { it.client?.id in ok }
        }
    }
    val selectedProject = activeProjects.firstOrNull { it.id == form.projectId }

    fun submit() {
        error = null
        success = null
        val current = form
        k.validationError(current, tareaOtroOpen, meta.requiresSchedule)?.let {
            error = it
            return
        }
        val project = activeProjects.firstOrNull { it.id == current.projectId }
        val body = k.buildRequest(current, project?.client?.id, creadoPorId)
        saving = true
        scope.launch {
            try {
                onSubmit(body)
                success = "Actividad asignada"
                done = true
            } catch (e: Exception) {
                error = e.toUserMessage("Error al guardar")
            } finally {
                saving = false
            }
        }
    }

    NxPanelShell {
        StepLabel(stepTitle)
        Spacer(Modifier.height(8.dp))
        NxSectionHeader(
            title = "Datos de la actividad",
            subtitle = if (form.projectMode == k.WITH_PROJECT) {
                "Elige proyecto, prioridad y agenda. El cliente sale del proyecto."
            } else {
                "Título, prioridad semáforo y lo esencial — sin jerga técnica."
            },
        )
        Text(
            "AN sugerido: ${nextAn.ifBlank { if (nextAnLoaded) "No disponible" else "Calculando…" }}",
            fontSize = 12.sp,
            color = NxColors.Muted,
        )
        Spacer(Modifier.height(10.dp))

        OutlinedTextField(
            value = form.titulo,
            onValueChange = { form = form.copy(titulo = it) },
            label = { Text("Título de la actividad") },
            modifier = Modifier.fillMaxWidth(),
        )
        Gap()

        if (form.projectMode == k.WITH_PROJECT) {
            PickerField(
                label = "Proyecto",
                value = selectedProject?.title,
                placeholder = "Seleccionar proyecto…",
                options = activeProjects.filter { form.clientId == null || it.client?.id == form.clientId },
                optionText = { it.title },
                onPick = { p -> form = form.copy(projectId = p?.id, clientId = p?.client?.id) },
            )
            Gap()
            OutlinedTextField(
                value = selectedProject?.client?.let { it.name ?: it.nombre ?: it.razonSocial }.orEmpty(),
                onValueChange = {},
                enabled = false,
                label = { Text("Cliente (automático)") },
                modifier = Modifier.fillMaxWidth(),
            )
        } else {
            Text(
                if (needsClientPicker) "Elige el cliente de este padrón." else "Trabajo del día sin proyecto.",
                fontSize = 12.sp,
                color = NxColors.Muted,
            )
            if (isTarea) {
                Spacer(Modifier.height(8.dp))
                Text("Tipo de tarea *", fontSize = 13.sp, fontWeight = FontWeight.SemiBold, color = NxColors.Slate)
                Spacer(Modifier.height(6.dp))
                FlowRow(
                    horizontalArrangement = Arrangement.spacedBy(8.dp),
                    verticalArrangement = Arrangement.spacedBy(8.dp),
                ) {
                    k.TAREA_TIPOS.forEach { t ->
                        Pill(
                            text = "${t.emoji} ${t.label}",
                            selected = tareaTipo == t.id,
                            onClick = {
                                form = k.pickTareaTipo(form, tareaTipo, t.id)
                                tareaOtroOpen = t.id == k.TAREA_OTRO
                            },
                        )
                    }
                }
                if (tareaTipo == k.TAREA_OTRO) {
                    Gap()
                    OutlinedTextField(
                        value = form.ticketTypeCustom,
                        onValueChange = { form = form.copy(ticketType = "OTRO", ticketTypeCustom = it.take(120)) },
                        label = { Text("Especifica el tipo (ej. Visita a proveedor)") },
                        singleLine = true,
                        modifier = Modifier.fillMaxWidth(),
                    )
                }
            }
            if (needsClientPicker) {
                Gap()
                PickerField(
                    label = "Cliente",
                    value = sectorClients.firstOrNull { it.serviceClientId == form.clientId }?.name,
                    placeholder = "Seleccionar cliente…",
                    options = sectorClients,
                    optionText = { it.name },
                    onPick = { c -> form = form.copy(clientId = c?.serviceClientId) },
                )
            }
        }

        if (meta.ticketType == null) {
            Gap()
            val typeLabel = k.TICKET_TYPES.firstOrNull { it.first == form.ticketType }?.second ?: "Tipo"
            PickerField(
                label = "Tipo",
                value = if (form.ticketType == "OTRO" && form.ticketTypeCustom.isNotBlank()) {
                    "$typeLabel · ${form.ticketTypeCustom}"
                } else {
                    typeLabel
                },
                placeholder = "Tipo",
                options = k.TICKET_TYPES,
                optionText = { it.second },
                allowClear = false,
                onPick = { opt ->
                    opt?.let {
                        form = k.pickTicketType(form, it.first)
                        if (it.first == "OTRO") {
                            otroInput = form.ticketTypeCustom
                            showOtroDialog = true
                        }
                    }
                },
            )
        }

        Gap()
        Text("Prioridad", fontSize = 12.sp, fontWeight = FontWeight.SemiBold, color = NxColors.Muted)
        Spacer(Modifier.height(6.dp))
        FlowRow(
            horizontalArrangement = Arrangement.spacedBy(8.dp),
            verticalArrangement = Arrangement.spacedBy(8.dp),
        ) {
            k.PRIORIDADES.forEach { p ->
                Pill(
                    text = p.label,
                    hint = p.hint,
                    dotColor = Color(p.color),
                    selected = form.prioridad == p.value,
                    onClick = { form = form.copy(prioridad = p.value) },
                )
            }
        }

        Gap()
        Row(horizontalArrangement = Arrangement.spacedBy(10.dp), modifier = Modifier.fillMaxWidth()) {
            DayField(
                label = if (meta.requiresSchedule) "Día *" else "Día",
                value = form.fecha,
                onChange = { form = form.copy(fecha = it) },
                modifier = Modifier.weight(1f),
            )
            HourField(
                label = if (meta.requiresSchedule) "Hora *" else "Hora",
                value = form.hora,
                onChange = { form = form.copy(hora = it) },
                modifier = Modifier.weight(1f),
            )
        }
        Gap()
        OutlinedTextField(
            value = form.tiempoEstimadoMin,
            onValueChange = { v -> form = form.copy(tiempoEstimadoMin = v.filter { it.isDigit() }.take(5)) },
            label = { Text("¿Cuántos minutos esperas que tome?") },
            keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
            singleLine = true,
            modifier = Modifier.fillMaxWidth(),
        )
        Gap()
        OutlinedTextField(
            value = form.tiempoMaximoMin,
            onValueChange = { v -> form = form.copy(tiempoMaximoMin = v.filter { it.isDigit() }.take(5)) },
            label = { Text("Tope máximo (min)") },
            keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
            singleLine = true,
            modifier = Modifier.fillMaxWidth(),
        )
        Gap()
        OutlinedTextField(
            value = form.indicaciones,
            onValueChange = { form = form.copy(indicaciones = it) },
            label = { Text("Indicaciones generales (para todo el equipo)") },
            minLines = 2,
            modifier = Modifier.fillMaxWidth(),
        )
        Gap()
        Row(verticalAlignment = Alignment.CenterVertically, modifier = Modifier.fillMaxWidth()) {
            Text(
                "Fotos de evidencia por persona (2–8)",
                fontSize = 13.sp,
                fontWeight = FontWeight.SemiBold,
                color = NxColors.Muted,
                modifier = Modifier.weight(1f),
            )
            Stepper(
                value = form.evidencePhotoRequired,
                onMinus = { form = form.copy(evidencePhotoRequired = k.clampEvidencePhotos(form.evidencePhotoRequired - 1)) },
                onPlus = { form = form.copy(evidencePhotoRequired = k.clampEvidencePhotos(form.evidencePhotoRequired + 1)) },
            )
        }

        Spacer(Modifier.height(12.dp))
        error?.let { Text(it, color = NxColors.Danger, fontSize = 13.sp) }
        success?.let { Text(it, color = NxColors.Success, fontSize = 13.sp) }
        Spacer(Modifier.height(6.dp))
        Row(horizontalArrangement = Arrangement.spacedBy(10.dp), modifier = Modifier.fillMaxWidth()) {
            OutlinedButton(onClick = onCancel, modifier = Modifier.weight(1f).heightIn(min = 48.dp)) {
                Text("Cancelar")
            }
            Button(
                onClick = { submit() },
                enabled = !saving && !done,
                colors = ButtonDefaults.buttonColors(containerColor = NxColors.Teal),
                modifier = Modifier.weight(1f).heightIn(min = 48.dp),
            ) {
                Text(if (saving) "Guardando…" else "Asignar actividad", fontWeight = FontWeight.Bold)
            }
        }
    }

    if (showOtroDialog) {
        AlertDialog(
            onDismissRequest = { showOtroDialog = false },
            title = { Text("Tipo personalizado") },
            text = {
                OutlinedTextField(
                    value = otroInput,
                    onValueChange = { otroInput = it },
                    placeholder = { Text("Ej: Auditoría de red…") },
                    singleLine = true,
                )
            },
            confirmButton = {
                TextButton(
                    enabled = otroInput.isNotBlank(),
                    onClick = {
                        form = form.copy(ticketTypeCustom = otroInput.trim())
                        showOtroDialog = false
                    },
                ) { Text("Confirmar") }
            },
            dismissButton = {
                TextButton(onClick = { showOtroDialog = false }) { Text("Cancelar") }
            },
        )
    }
}

// ── Piezas ──────────────────────────────────────────────────────────────────

@Composable
private fun Gap() {
    Spacer(Modifier.height(10.dp))
}

@Composable
private fun StepLabel(text: String) {
    Text(text, fontSize = 13.sp, fontWeight = FontWeight.Bold, color = NxColors.Muted)
}

@Composable
private fun KindGrid(kinds: List<String>, selected: String?, onPick: (String) -> Unit) {
    Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
        kinds.chunked(2).forEach { row ->
            Row(horizontalArrangement = Arrangement.spacedBy(10.dp), modifier = Modifier.fillMaxWidth()) {
                row.forEach { id ->
                    val m = CoreActivityKinds.meta(id)
                    if (m != null) {
                        ChoiceCard(
                            emoji = m.emoji,
                            title = m.title,
                            help = m.help,
                            selected = selected == id,
                            onClick = { onPick(id) },
                            modifier = Modifier.weight(1f),
                        )
                    }
                }
                if (row.size == 1) Spacer(Modifier.weight(1f))
            }
        }
    }
}

@Composable
private fun ChoiceCard(
    title: String,
    help: String,
    selected: Boolean,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
    emoji: String? = null,
) {
    val shape = RoundedCornerShape(16.dp)
    Column(
        modifier = modifier
            .clip(shape)
            .border(if (selected) 2.dp else 1.dp, if (selected) NxColors.Teal else BorderGray, shape)
            .background(if (selected) NxColors.Teal.copy(alpha = 0.10f) else NxColors.Card)
            .clickable(onClick = onClick)
            .heightIn(min = 88.dp)
            .padding(12.dp),
    ) {
        if (emoji != null) {
            Text(emoji, fontSize = 22.sp)
            Spacer(Modifier.height(6.dp))
        }
        Text(title, fontWeight = FontWeight.ExtraBold, fontSize = 14.sp, color = NxColors.Slate)
        Spacer(Modifier.height(4.dp))
        Text(help, fontSize = 12.sp, color = NxColors.Muted, lineHeight = 16.sp)
    }
}

@Composable
private fun Pill(
    text: String,
    selected: Boolean,
    onClick: () -> Unit,
    dotColor: Color? = null,
    hint: String? = null,
) {
    val shape = RoundedCornerShape(999.dp)
    val accent = dotColor ?: NxColors.Teal
    Row(
        modifier = Modifier
            .clip(shape)
            .border(if (selected) 2.dp else 1.dp, if (selected) accent else BorderGray, shape)
            .background(if (selected) accent.copy(alpha = 0.12f) else NxColors.Card)
            .clickable(onClick = onClick)
            .heightIn(min = 40.dp)
            .padding(horizontal = 12.dp, vertical = 8.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(6.dp),
    ) {
        if (dotColor != null) {
            Box(Modifier.size(10.dp).clip(CircleShape).background(dotColor))
        }
        Text(
            text,
            fontSize = 13.sp,
            fontWeight = if (selected) FontWeight.Bold else FontWeight.SemiBold,
            color = NxColors.Slate,
        )
        if (hint != null) {
            Text(hint, fontSize = 11.sp, color = NxColors.Muted)
        }
    }
}

@Composable
private fun PersonPill(person: TeamBoardUserDto, selected: Boolean, onClick: () -> Unit) {
    val shape = RoundedCornerShape(999.dp)
    Row(
        modifier = Modifier
            .clip(shape)
            .border(if (selected) 2.dp else 1.dp, if (selected) NxColors.Teal else BorderGray, shape)
            .background(if (selected) NxColors.Teal.copy(alpha = 0.12f) else NxColors.Card)
            .clickable(onClick = onClick)
            .heightIn(min = 40.dp)
            .padding(start = 4.dp, end = 12.dp, top = 4.dp, bottom = 4.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        PersonAvatar(person.nombre, person.avatarUrl, 28.dp)
        Text(
            CoreActivityKinds.firstTwoWords(person.nombre),
            fontSize = 12.sp,
            fontWeight = FontWeight.SemiBold,
            color = NxColors.Slate,
            maxLines = 1,
        )
    }
}

@Composable
private fun Stepper(value: Int, onMinus: () -> Unit, onPlus: () -> Unit) {
    Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
        OutlinedButton(onClick = onMinus, modifier = Modifier.heightIn(min = 44.dp)) { Text("−") }
        Text("$value", fontSize = 16.sp, fontWeight = FontWeight.ExtraBold, color = NxColors.Slate)
        OutlinedButton(onClick = onPlus, modifier = Modifier.heightIn(min = 44.dp)) { Text("+") }
    }
}

@Composable
private fun <T> PickerField(
    label: String,
    value: String?,
    placeholder: String,
    options: List<T>,
    optionText: (T) -> String,
    onPick: (T?) -> Unit,
    allowClear: Boolean = true,
) {
    var expanded by remember { mutableStateOf(false) }
    Box(Modifier.fillMaxWidth()) {
        OutlinedTextField(
            value = value.orEmpty(),
            onValueChange = {},
            readOnly = true,
            label = { Text(label) },
            placeholder = { Text(placeholder) },
            trailingIcon = { Icon(Icons.Default.ArrowDropDown, contentDescription = null) },
            singleLine = true,
            modifier = Modifier.fillMaxWidth(),
        )
        // El campo de solo lectura se come el toque: una capa encima abre el menú.
        Box(Modifier.matchParentSize().clickable { expanded = true })
        DropdownMenu(expanded = expanded, onDismissRequest = { expanded = false }) {
            if (allowClear) {
                DropdownMenuItem(
                    text = { Text(placeholder, color = NxColors.Muted) },
                    onClick = {
                        onPick(null)
                        expanded = false
                    },
                )
            }
            if (options.isEmpty()) {
                DropdownMenuItem(
                    text = { Text("Sin opciones disponibles", color = NxColors.Muted) },
                    onClick = { expanded = false },
                    enabled = false,
                )
            }
            options.forEach { opt ->
                DropdownMenuItem(
                    text = { Text(optionText(opt)) },
                    onClick = {
                        onPick(opt)
                        expanded = false
                    },
                )
            }
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun DayField(label: String, value: String, onChange: (String) -> Unit, modifier: Modifier = Modifier) {
    var open by remember { mutableStateOf(false) }
    Box(modifier) {
        OutlinedTextField(
            value = value,
            onValueChange = {},
            readOnly = true,
            label = { Text(label) },
            placeholder = { Text("Elegir día") },
            trailingIcon = { Icon(Icons.Default.DateRange, contentDescription = null) },
            singleLine = true,
            modifier = Modifier.fillMaxWidth(),
        )
        Box(Modifier.matchParentSize().clickable { open = true })
    }
    if (open) {
        val state = rememberDatePickerState(
            initialSelectedDateMillis = CoreActivityKinds.dateToPickerMillis(
                value.ifBlank { CoreActivityKinds.todayInMexico() },
            ),
        )
        DatePickerDialog(
            onDismissRequest = { open = false },
            confirmButton = {
                TextButton(
                    onClick = {
                        state.selectedDateMillis?.let { onChange(CoreActivityKinds.pickerMillisToDate(it)) }
                        open = false
                    },
                ) { Text("Aceptar") }
            },
            dismissButton = {
                Row {
                    if (value.isNotBlank()) {
                        TextButton(
                            onClick = {
                                onChange("")
                                open = false
                            },
                        ) { Text("Quitar") }
                    }
                    TextButton(onClick = { open = false }) { Text("Cancelar") }
                }
            },
        ) {
            DatePicker(state = state)
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun HourField(label: String, value: String, onChange: (String) -> Unit, modifier: Modifier = Modifier) {
    var open by remember { mutableStateOf(false) }
    Box(modifier) {
        OutlinedTextField(
            value = value,
            onValueChange = {},
            readOnly = true,
            label = { Text(label) },
            trailingIcon = { Icon(Icons.Default.Schedule, contentDescription = null) },
            singleLine = true,
            modifier = Modifier.fillMaxWidth(),
        )
        Box(Modifier.matchParentSize().clickable { open = true })
    }
    if (open) {
        val (h, m) = CoreActivityKinds.parseHora(value)
        val state = rememberTimePickerState(initialHour = h, initialMinute = m, is24Hour = true)
        AlertDialog(
            onDismissRequest = { open = false },
            title = { Text("Hora") },
            text = { TimePicker(state = state) },
            confirmButton = {
                TextButton(
                    onClick = {
                        onChange(CoreActivityKinds.formatHora(state.hour, state.minute))
                        open = false
                    },
                ) { Text("Aceptar") }
            },
            dismissButton = {
                TextButton(onClick = { open = false }) { Text("Cancelar") }
            },
        )
    }
}
