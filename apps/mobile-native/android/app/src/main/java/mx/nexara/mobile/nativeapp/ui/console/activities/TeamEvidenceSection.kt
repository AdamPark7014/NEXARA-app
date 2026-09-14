package mx.nexara.mobile.nativeapp.ui.console.activities

import androidx.compose.foundation.BorderStroke
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
import androidx.compose.foundation.pager.HorizontalPager
import androidx.compose.foundation.pager.rememberPagerState
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.Checkbox
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.RadioButton
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.rememberModalBottomSheetState
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
import androidx.compose.ui.draw.drawBehind
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.window.Dialog
import androidx.compose.ui.window.DialogProperties
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import mx.nexara.mobile.nativeapp.data.api.RevisarEvidenciaRequest
import mx.nexara.mobile.nativeapp.data.api.TeamEvidenceDto
import mx.nexara.mobile.nativeapp.data.api.TeamEvidenceMemberDto
import mx.nexara.mobile.nativeapp.data.api.TeamEvidenceResponseDto
import mx.nexara.mobile.nativeapp.data.api.TeamEvidenceReviewDto
import mx.nexara.mobile.nativeapp.data.api.toUserMessage
import mx.nexara.mobile.nativeapp.data.console.CoreActivitiesRepository
import mx.nexara.mobile.nativeapp.ui.common.ProtectedImage
import mx.nexara.mobile.nativeapp.ui.common.ProtectedPdfButton
import mx.nexara.mobile.nativeapp.ui.common.openMapsAt
import mx.nexara.mobile.nativeapp.ui.console.activities.CoreActivityRules.EvidencePhoto
import mx.nexara.mobile.nativeapp.ui.console.activities.CoreActivityRules.NARANJA
import mx.nexara.mobile.nativeapp.ui.console.activities.CoreActivityRules.ROJO
import mx.nexara.mobile.nativeapp.ui.console.activities.CoreActivityRules.STEP_COMPLETED
import mx.nexara.mobile.nativeapp.ui.console.activities.CoreActivityRules.STEP_DATA
import mx.nexara.mobile.nativeapp.ui.console.activities.CoreActivityRules.STEP_ENTRY
import mx.nexara.mobile.nativeapp.ui.console.activities.CoreActivityRules.STEP_EXIT
import mx.nexara.mobile.nativeapp.ui.console.activities.CoreActivityRules.STEP_PDF
import mx.nexara.mobile.nativeapp.ui.console.activities.CoreActivityRules.STEP_PHOTOS
import mx.nexara.mobile.nativeapp.ui.console.activities.CoreActivityRules.VERDE
import mx.nexara.mobile.nativeapp.ui.enterprise.NxColors

/** Con qué se abre la hoja de revisión (desde «Aprobar», «Devolver» o «Devolver este paso»). */
private data class RevisionInicial(val aprobar: Boolean, val pasos: List<String> = emptyList())

/**
 * Evidencias del equipo por persona y en orden de la cadena — paridad con
 * apps/web/components/ops/EquipoEvidencias.tsx. La API decide qué ve cada
 * quien (`alcance`) y a quién puede aprobar o devolver (`puedoRevisar`).
 *
 * @param compact resumen para la pestaña Detalle, con enlace a la vista completa.
 */
@OptIn(ExperimentalLayoutApi::class)
@Composable
fun TeamEvidenceSection(
    activityId: Long,
    refreshKey: Int = 0,
    compact: Boolean = false,
    onOpenFull: (() -> Unit)? = null,
) {
    val context = LocalContext.current
    val repo = remember(context) { CoreActivitiesRepository(context) }
    var data by remember(activityId) { mutableStateOf<TeamEvidenceResponseDto?>(null) }
    var loading by remember(activityId) { mutableStateOf(true) }
    var error by remember(activityId) { mutableStateOf<String?>(null) }
    var reload by remember { mutableIntStateOf(0) }
    var visor by remember { mutableStateOf<Pair<List<EvidencePhoto>, Int>?>(null) }
    var revisando by remember { mutableStateOf<Pair<TeamEvidenceMemberDto, RevisionInicial>?>(null) }
    var aviso by remember { mutableStateOf<String?>(null) }

    LaunchedEffect(activityId, refreshKey, reload) {
        loading = true
        try {
            data = withContext(Dispatchers.IO) { repo.teamEvidence(activityId) }
            error = null
        } catch (e: Exception) {
            error = e.toUserMessage("No se pudieron cargar las evidencias del equipo")
        } finally {
            loading = false
        }
    }

    LaunchedEffect(aviso) {
        if (aviso != null) {
            delay(6_000)
            aviso = null
        }
    }

    val current = data
    if (current == null) {
        if (loading) {
            Text("Cargando evidencias del equipo…", fontSize = 13.sp, color = NxColors.Muted)
        } else if (error != null) {
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                Text(error!!, fontSize = 13.sp, color = NxColors.Muted, modifier = Modifier.weight(1f))
                OutlinedButton(onClick = { reload++ }) { Text("Reintentar") }
            }
        }
        return
    }

    val members = current.members.orEmpty()
    val ejecutores = current.resumen?.ejecutores ?: 0
    val terminaron = current.resumen?.terminaron ?: 0
    val aprobadas = current.resumen?.aprobadas ?: 0
    val porRevisarMias = current.resumen?.porRevisarMias ?: 0
    val coreKind = current.activity?.coreKind
    val cadena = CoreActivityRules.cadena(members.firstOrNull()?.asignadoPor, members.map { it.nombre })
    val estado = CoreActivityRules.teamActivityState(ejecutores, terminaron, aprobadas)

    if (compact) {
        Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
            FlowRow(
                horizontalArrangement = Arrangement.spacedBy(6.dp),
                verticalArrangement = Arrangement.spacedBy(6.dp),
            ) {
                ToneChip(estado)
                if (ejecutores > 0) ToneChip("Aprobadas $aprobadas de $ejecutores")
                if (porRevisarMias > 0) ToneChip("🔎 $porRevisarMias por revisar", NARANJA)
            }
            if (cadena.size > 1) {
                Text("🔗 ${cadena.joinToString(" → ")}", fontSize = 12.5.sp, color = NxColors.Muted)
            }
            if (members.isEmpty()) {
                Text("Nadie en el equipo todavía.", fontSize = 13.sp, color = NxColors.Muted)
            }
            members.forEach { m -> key(m.userId) { CompactMemberRow(m) } }
            if (onOpenFull != null) {
                OutlinedButton(onClick = onOpenFull) {
                    Text(if (porRevisarMias > 0) "Revisar evidencias →" else "Ver fotos, PDF y formularios →")
                }
            }
        }
        return
    }

    Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
        Row(verticalAlignment = Alignment.Top, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                Text("Evidencias del equipo", fontSize = 18.sp, fontWeight = FontWeight.ExtraBold, color = NxColors.Slate)
                val alcanceTexto = when (current.alcance) {
                    "todo" -> "Ves a toda la cadena."
                    "equipo" -> "Ves lo que hizo tu equipo a partir de ti."
                    else -> "Estas son tus evidencias."
                }
                val soloLectura = if (current.soloLectura == true && current.alcance != "propio") {
                    " Solo lectura: puedes ver todo, no revisar."
                } else {
                    ""
                }
                Text(
                    (if (cadena.size > 1) "🔗 ${cadena.joinToString(" → ")} · " else "") + alcanceTexto + soloLectura,
                    fontSize = 13.sp,
                    color = NxColors.Muted,
                )
                FlowRow(
                    horizontalArrangement = Arrangement.spacedBy(6.dp),
                    verticalArrangement = Arrangement.spacedBy(6.dp),
                ) {
                    ToneChip(estado)
                    if (ejecutores > 0) {
                        ToneChip("Enviaron $terminaron de $ejecutores")
                        ToneChip("Aprobadas $aprobadas de $ejecutores")
                    }
                    val cerrada = current.activity?.fechaFinalizacion
                    if (cerrada != null && CoreActivityRules.isTeamFinalizada(ejecutores, aprobadas)) {
                        CoreActivityRules.formatWhen(cerrada)?.let { ToneChip("Cerrada $it") }
                    }
                }
            }
            OutlinedButton(onClick = { reload++ }, enabled = !loading) {
                Text(if (loading) "Actualizando…" else "↻ Actualizar", fontSize = 13.sp)
            }
        }

        if (porRevisarMias > 0) {
            SoftNote(
                text = "🔎 Tienes $porRevisarMias evidencia${if (porRevisarMias == 1) "" else "s"} por revisar. " +
                    "La actividad queda finalizada cuando se aprueba la de todos.",
                color = NARANJA,
            )
        }
        aviso?.let { SoftNote(text = it, color = VERDE) }
        error?.let { Text(it, fontSize = 13.sp, color = Color(0xFFB91C1C)) }

        if (members.isEmpty()) {
            Text("Nadie en el equipo todavía.", fontSize = 13.sp, color = NxColors.Muted)
        }
        members.forEach { m ->
            key(m.userId) {
                TeamMemberCard(
                    m = m,
                    coreKind = coreKind,
                    onOpenVisor = { fotos, index -> if (index in fotos.indices) visor = fotos to index },
                    onRevisar = { member, inicial -> revisando = member to inicial },
                )
            }
        }
    }

    visor?.let { (fotos, index) ->
        EvidencePhotoViewer(fotos = fotos, startIndex = index, onClose = { visor = null })
    }

    revisando?.let { (member, inicial) ->
        ReviewSheet(
            activityId = activityId,
            m = member,
            coreKind = coreKind,
            inicial = inicial,
            onDismiss = { revisando = null },
            onDone = { nuevo, texto ->
                data = nuevo
                revisando = null
                aviso = texto
            },
        )
    }
}

@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun CompactMemberRow(m: TeamEvidenceMemberDto) {
    val ev = m.evidence
    val reparte = m.reparte == true
    val fotos = if (ev == null) 0 else {
        (if (ev.entryPhotoUrl.isNullOrBlank()) 0 else 1) + ev.evidencePhotos.orEmpty().size +
            (if (ev.exitPhotoUrl.isNullOrBlank()) 0 else 1)
    }
    val subtitle = if (reparte) {
        val pasoA = m.pasoA.orEmpty()
        if (pasoA.isNotEmpty()) {
            "📨 La pasó a ${pasoA.joinToString(", ") { CoreActivityRules.shortName(it.nombre) }}"
        } else {
            "📨 La reparte"
        }
    } else {
        listOfNotNull(
            if (fotos > 0) "📷 $fotos foto${if (fotos == 1) "" else "s"}" else "Sin fotos aún",
            if (!ev?.serviceSheetPdfUrl.isNullOrBlank()) "📄 PDF" else null,
            if (!ev?.serviceSheetCompletedAt.isNullOrBlank()) "📝 Formulario" else null,
        ).joinToString(" · ")
    }
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(14.dp))
            .border(1.dp, Color(0xFFE2E8F0), RoundedCornerShape(14.dp))
            .background(Color.White)
            .padding(10.dp),
        verticalArrangement = Arrangement.spacedBy(6.dp),
    ) {
        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp)) {
            PersonAvatar(m.nombre, m.avatarUrl, 34.dp)
            Column(Modifier.weight(1f)) {
                Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                    Text(
                        CoreActivityRules.shortName(m.nombre),
                        fontSize = 14.sp,
                        fontWeight = FontWeight.Bold,
                        color = NxColors.Slate,
                    )
                    m.eficienciaScore?.takeIf { it > 0 }?.let { StarsText(it, 12.sp) }
                }
                Text(subtitle, fontSize = 12.sp, color = NxColors.Muted)
            }
            if (!reparte && ev != null) {
                ToneChip(CoreActivityRules.memberEstadoUi(ev.status, ev.reviewStatus))
            }
        }
        if (!reparte) ProgressWithPct(m.progressPct)
    }
}

@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun TeamMemberCard(
    m: TeamEvidenceMemberDto,
    coreKind: String?,
    onOpenVisor: (List<EvidencePhoto>, Int) -> Unit,
    onRevisar: (TeamEvidenceMemberDto, RevisionInicial) -> Unit,
) {
    val ev = m.evidence
    val reparte = m.reparte == true
    val puedoRevisar = m.puedoRevisar == true
    val estado = if (reparte || ev == null) null else CoreActivityRules.memberEstadoUi(ev.status, ev.reviewStatus)
    val porRevisar = puedoRevisar && ev?.status == STEP_COMPLETED &&
        ev.reviewStatus != "APPROVED" && ev.reviewStatus != "REJECTED"
    var abierta by remember(m.userId) { mutableStateOf(!reparte) }
    val corrigiendo = if (ev?.reviewStatus == "REJECTED") m.rejectedSteps.orEmpty() else emptyList()
    val nombre = m.nombre ?: "—"

    Card(
        modifier = Modifier.fillMaxWidth(),
        shape = RoundedCornerShape(18.dp),
        colors = CardDefaults.cardColors(containerColor = Color.White),
        elevation = CardDefaults.cardElevation(1.dp),
        border = BorderStroke(
            1.dp,
            if (porRevisar) Color(NARANJA).copy(alpha = 0.45f) else Color(0xFFE2E8F0),
        ),
    ) {
        Column(
            modifier = Modifier.padding(14.dp).then(if (m.retiradoAt != null) Modifier else Modifier),
            verticalArrangement = Arrangement.spacedBy(10.dp),
        ) {
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                PersonAvatar(m.nombre, m.avatarUrl, 44.dp)
                Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                    Text(nombre, fontSize = 15.sp, fontWeight = FontWeight.ExtraBold, color = NxColors.Slate)
                    FlowRow(
                        horizontalArrangement = Arrangement.spacedBy(6.dp),
                        verticalArrangement = Arrangement.spacedBy(4.dp),
                    ) {
                        ToneChip(CoreActivityRules.memberRolUi(reparte, m.rol))
                        estado?.let { ToneChip(it) }
                        m.eficienciaScore?.takeIf { it > 0 }?.let { StarsText(it) }
                        if (m.retiradoAt != null) ToneChip("Salió del equipo")
                    }
                }
            }

            if (!reparte) ProgressWithPct(m.progressPct)

            val meta = buildList {
                val recibio = CoreActivityRules.formatWhen(m.asignadoAt).orEmpty()
                val de = m.asignadoPor?.takeIf { it.isNotBlank() && it != m.nombre }
                    ?.let { " de ${CoreActivityRules.shortName(it)}" }
                    .orEmpty()
                add("📥 Recibió $recibio$de".trim())
                m.pasoA.orEmpty().forEach { p ->
                    add("📨 La pasó a ${CoreActivityRules.shortName(p.nombre)} · ${CoreActivityRules.formatWhen(p.at).orEmpty()}")
                }
                if (ev?.status == STEP_COMPLETED && !ev.completedAt.isNullOrBlank()) {
                    add("📦 Envió ${CoreActivityRules.formatWhen(ev.completedAt).orEmpty()}")
                }
            }
            Column(verticalArrangement = Arrangement.spacedBy(2.dp)) {
                meta.forEach { Text(it, fontSize = 12.5.sp, color = NxColors.Muted) }
            }

            if (porRevisar) {
                Column(
                    modifier = Modifier
                        .fillMaxWidth()
                        .clip(RoundedCornerShape(14.dp))
                        .background(Color(NARANJA).copy(alpha = 0.08f))
                        .border(1.dp, Color(NARANJA).copy(alpha = 0.35f), RoundedCornerShape(14.dp))
                        .padding(12.dp),
                    verticalArrangement = Arrangement.spacedBy(8.dp),
                ) {
                    Text(
                        "🔎 Ya envió su evidencia. Revísala, califícala y apruébala o devuélvela.",
                        fontSize = 13.5.sp,
                        fontWeight = FontWeight.SemiBold,
                        color = NxColors.Slate,
                    )
                    Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        Button(
                            onClick = { onRevisar(m, RevisionInicial(aprobar = true)) },
                            colors = ButtonDefaults.buttonColors(containerColor = Color(VERDE)),
                            modifier = Modifier.weight(1f).heightIn(min = 48.dp),
                        ) { Text("✅ Aprobar", fontWeight = FontWeight.Bold) }
                        Button(
                            onClick = { onRevisar(m, RevisionInicial(aprobar = false)) },
                            colors = ButtonDefaults.buttonColors(containerColor = Color(NARANJA)),
                            modifier = Modifier.weight(1f).heightIn(min = 48.dp),
                        ) { Text("↩️ Devolver", fontWeight = FontWeight.Bold) }
                    }
                }
            }

            if (puedoRevisar && ev?.reviewStatus == "APPROVED") {
                Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    val por = ev.reviewedBy?.let { " por ${CoreActivityRules.shortName(it)}" }.orEmpty()
                    val cuando = CoreActivityRules.formatWhen(ev.reviewedAt)?.let { " · $it" }.orEmpty()
                    Text(
                        "✅ Aprobada$por$cuando. ¿Encontraste algo mal?",
                        fontSize = 13.sp,
                        color = NxColors.Muted,
                        modifier = Modifier.weight(1f),
                    )
                    OutlinedButton(onClick = { onRevisar(m, RevisionInicial(aprobar = false)) }) {
                        Text("↩️ Devolver")
                    }
                }
            }

            if (corrigiendo.isNotEmpty()) {
                val notas = ev?.reviewNotes?.takeIf { it.isNotBlank() }?.let { " · «$it»" }.orEmpty()
                SoftNote(
                    text = "↩️ Está corrigiendo: ${corrigiendo.joinToString(", ") { CoreActivityRules.stepLabel(it) }}$notas",
                    color = NARANJA,
                )
            }

            TextButton(onClick = { abierta = !abierta }) {
                Text(if (abierta) "Ocultar" else "Ver detalle", color = NxColors.Teal, fontWeight = FontWeight.SemiBold)
            }

            if (abierta) {
                m.indicaciones?.takeIf { it.isNotBlank() }?.let { SoftNote(text = "💬 $it") }
                when {
                    reparte -> Text(
                        "Su parte fue repartirla" +
                            (if (m.pasoA.isNullOrEmpty()) " (todavía no la pasa a nadie)" else "") +
                            "; no sube evidencias.",
                        fontSize = 13.sp,
                        color = NxColors.Muted,
                    )
                    ev == null -> Text("Aún no empieza a subir evidencias.", fontSize = 13.sp, color = NxColors.Muted)
                    else -> EvidenceContent(
                        ev = ev,
                        coreKind = coreKind,
                        nombre = m.nombre,
                        porCorregir = corrigiendo,
                        onOpenVisor = onOpenVisor,
                        onDevolverPaso = if (puedoRevisar && ev.status == STEP_COMPLETED) {
                            { step -> onRevisar(m, RevisionInicial(aprobar = false, pasos = listOf(step))) }
                        } else {
                            null
                        },
                    )
                }
                ReviewHistory(
                    revisiones = m.revisiones.orEmpty(),
                    coreKind = coreKind,
                    nombre = m.nombre,
                    onOpenVisor = onOpenVisor,
                )
            }
        }
    }
}

/** Pasos, fotos, PDF y formulario de una evidencia (la actual o la copia de una devolución). */
@Composable
private fun EvidenceContent(
    ev: TeamEvidenceDto,
    coreKind: String?,
    nombre: String?,
    etiqueta: String = "",
    porCorregir: List<String> = emptyList(),
    onOpenVisor: (List<EvidencePhoto>, Int) -> Unit,
    onDevolverPaso: ((String) -> Unit)?,
) {
    val set = remember(ev, nombre, etiqueta) { CoreActivityRules.fotosDe(ev, nombre, etiqueta) }
    val pasos = CoreActivityRules.evidenceStepsForKind(coreKind)

    Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
        pasos.chunked(2).forEach { row ->
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                row.forEach { step ->
                    val hora = CoreActivityRules.horaPaso(ev, step)
                    val hecho = hora != null
                    val corregir = step in porCorregir
                    val color = when {
                        corregir -> Color(NARANJA)
                        hecho -> Color(VERDE)
                        else -> null
                    }
                    Column(
                        modifier = Modifier
                            .weight(1f)
                            .clip(RoundedCornerShape(12.dp))
                            .background(color?.copy(alpha = 0.08f) ?: Color.White)
                            .border(1.dp, color?.copy(alpha = 0.35f) ?: Color(0xFFE2E8F0), RoundedCornerShape(12.dp))
                            .padding(horizontal = 10.dp, vertical = 8.dp),
                    ) {
                        Text(
                            "${if (corregir) "↩️" else if (hecho) "✓" else "○"} ${CoreActivityRules.stepLabel(step)}",
                            fontSize = 12.5.sp,
                            fontWeight = FontWeight.Bold,
                            color = NxColors.Slate,
                        )
                        Text(
                            when {
                                corregir -> "Por corregir"
                                hecho -> CoreActivityRules.formatWhen(hora) ?: "Hecho"
                                else -> "Pendiente"
                            },
                            fontSize = 11.5.sp,
                            color = if (corregir) Color(NARANJA) else NxColors.Muted,
                        )
                    }
                }
                if (row.size == 1) Spacer(Modifier.weight(1f))
            }
        }

        val entrada = set.entrada
        val salida = set.salida
        if (entrada != null || salida != null) {
            Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                if (entrada != null) {
                    Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                        SectionTitle("Entrada", ev.entryPhotoUploadedAt, STEP_ENTRY, onDevolverPaso)
                        PhotoThumb(set.fotos[entrada], 160.dp) { onOpenVisor(set.fotos, entrada) }
                    }
                }
                if (salida != null) {
                    Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                        SectionTitle("Salida", ev.exitPhotoUploadedAt, STEP_EXIT, onDevolverPaso)
                        PhotoThumb(set.fotos[salida], 160.dp) { onOpenVisor(set.fotos, salida) }
                    }
                }
                if (entrada == null || salida == null) Spacer(Modifier.weight(1f))
            }
        }

        if (set.sitio.isNotEmpty()) {
            Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
                SectionTitle("Fotos en sitio (${set.sitio.size})", ev.evidencePhotosUploadedAt, STEP_PHOTOS, onDevolverPaso)
                set.sitio.chunked(3).forEach { row ->
                    Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        row.forEach { idx ->
                            Box(Modifier.weight(1f)) {
                                PhotoThumb(set.fotos[idx], 110.dp) { onOpenVisor(set.fotos, idx) }
                            }
                        }
                        repeat(3 - row.size) { Spacer(Modifier.weight(1f)) }
                    }
                }
            }
        }

        ev.serviceSheetPdfUrl?.takeIf { it.isNotBlank() }?.let { url ->
            Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
                SectionTitle("Hoja de servicio", ev.serviceSheetUploadedAt, STEP_PDF, onDevolverPaso)
                ProtectedPdfButton(url = url)
            }
        }

        if (ev.serviceSheetData != null) {
            Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
                SectionTitle("Formulario", ev.serviceSheetCompletedAt, STEP_DATA, onDevolverPaso)
                val entries = CoreActivityRules.formEntries(ev.serviceSheetData, coreKind)
                if (entries.isEmpty()) {
                    Text("Sin datos capturados.", fontSize = 13.sp, color = NxColors.Muted)
                }
                entries.forEach { (label, value) ->
                    Column(
                        modifier = Modifier
                            .fillMaxWidth()
                            .clip(RoundedCornerShape(12.dp))
                            .background(Color(0xFFF1F5F9))
                            .padding(horizontal = 12.dp, vertical = 10.dp),
                        verticalArrangement = Arrangement.spacedBy(3.dp),
                    ) {
                        Text(label, fontSize = 12.sp, fontWeight = FontWeight.Bold, color = NxColors.Muted)
                        Text(value, fontSize = 14.sp, color = NxColors.Slate, lineHeight = 20.sp)
                    }
                }
            }
        }
    }
}

@Composable
private fun SectionTitle(
    titulo: String,
    hora: String?,
    step: String,
    onDevolverPaso: ((String) -> Unit)?,
) {
    Column {
        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(6.dp)) {
            Text(titulo, fontSize = 13.sp, fontWeight = FontWeight.ExtraBold, color = NxColors.Slate)
            CoreActivityRules.formatWhen(hora)?.let { Text(it, fontSize = 11.5.sp, color = NxColors.Muted) }
        }
        if (onDevolverPaso != null) {
            Text(
                "↩️ Devolver este paso",
                fontSize = 12.5.sp,
                fontWeight = FontWeight.SemiBold,
                color = NxColors.Teal,
                modifier = Modifier
                    .clickable { onDevolverPaso(step) }
                    .padding(vertical = 4.dp),
            )
        }
    }
}

@Composable
private fun PhotoThumb(foto: EvidencePhoto, height: Dp, onOpen: () -> Unit) {
    val context = LocalContext.current
    Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
        Box(
            modifier = Modifier
                .fillMaxWidth()
                .height(height)
                .clip(RoundedCornerShape(12.dp))
                .background(Color(0xFF0F172A))
                .clickable(onClick = onOpen),
        ) {
            ProtectedImage(url = foto.url, contentDescription = foto.titulo, modifier = Modifier.fillMaxSize())
        }
        val lat = foto.lat
        val lng = foto.lng
        if (lat != null && lng != null) {
            Text(
                "📍 Ver en mapa",
                fontSize = 11.5.sp,
                fontWeight = FontWeight.SemiBold,
                color = NxColors.Teal,
                modifier = Modifier.clickable { openMapsAt(context, lat, lng) },
            )
        }
    }
}

@Composable
private fun ReviewHistory(
    revisiones: List<TeamEvidenceReviewDto>,
    coreKind: String?,
    nombre: String?,
    onOpenVisor: (List<EvidencePhoto>, Int) -> Unit,
) {
    if (revisiones.isEmpty()) return
    var abierta by remember { mutableStateOf<Long?>(null) }
    Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
        Text("Revisiones (${revisiones.size})", fontSize = 13.sp, fontWeight = FontWeight.ExtraBold, color = NxColors.Slate)
        revisiones.forEach { r ->
            val tone = CoreActivityRules.reviewDecisionUi(r.decision)
            val color = Color(tone.color ?: NARANJA)
            Column(
                modifier = Modifier
                    .fillMaxWidth()
                    .clip(RoundedCornerShape(10.dp))
                    .background(color.copy(alpha = 0.06f))
                    .drawBehind { drawRect(color = color, size = Size(3.dp.toPx(), size.height)) }
                    .padding(start = 14.dp, end = 12.dp, top = 10.dp, bottom = 10.dp),
                verticalArrangement = Arrangement.spacedBy(4.dp),
            ) {
                Text(tone.label, fontSize = 13.5.sp, fontWeight = FontWeight.Bold, color = NxColors.Slate)
                Text(
                    "${CoreActivityRules.shortName(r.revisor).ifBlank { "—" }} · ${CoreActivityRules.formatWhen(r.at).orEmpty()}",
                    fontSize = 12.sp,
                    color = NxColors.Muted,
                )
                r.calificacion?.takeIf { it > 0 }?.let { StarsText(it) }
                if (r.decision == "DEVUELTA_PASOS" && !r.pasos.isNullOrEmpty()) {
                    Text(
                        "Corregir: ${r.pasos.joinToString(", ") { CoreActivityRules.stepLabel(it) }}",
                        fontSize = 12.5.sp,
                        color = NxColors.Muted,
                    )
                }
                r.observaciones?.takeIf { it.isNotBlank() }?.let {
                    Text(it, fontSize = 13.5.sp, color = NxColors.Slate, lineHeight = 19.sp)
                }
                val snapshot = r.snapshot
                if (snapshot != null) {
                    Text(
                        if (abierta == r.id) "Ocultar lo que se devolvió" else "Ver lo que se devolvió",
                        fontSize = 12.5.sp,
                        fontWeight = FontWeight.SemiBold,
                        color = NxColors.Teal,
                        modifier = Modifier
                            .clickable { abierta = if (abierta == r.id) null else r.id }
                            .padding(vertical = 4.dp),
                    )
                    if (abierta == r.id) {
                        EvidenceContent(
                            ev = snapshot,
                            coreKind = coreKind,
                            nombre = nombre,
                            etiqueta = " (devuelta)",
                            onOpenVisor = onOpenVisor,
                            onDevolverPaso = null,
                        )
                    }
                }
            }
        }
    }
}

/** Visor grande: se desliza entre fotos y abre la ubicación en el mapa. */
@Composable
fun EvidencePhotoViewer(fotos: List<EvidencePhoto>, startIndex: Int, onClose: () -> Unit) {
    if (fotos.isEmpty()) return
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    val pagerState = rememberPagerState(initialPage = startIndex.coerceIn(0, fotos.lastIndex)) { fotos.size }
    Dialog(onDismissRequest = onClose, properties = DialogProperties(usePlatformDefaultWidth = false)) {
        Surface(modifier = Modifier.fillMaxSize(), color = Color(0xF2020617)) {
            Column(Modifier.fillMaxSize().padding(16.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
                val page = pagerState.currentPage
                val foto = fotos.getOrNull(page)
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Column(Modifier.weight(1f)) {
                        Text(foto?.titulo.orEmpty(), color = Color.White, fontWeight = FontWeight.ExtraBold, fontSize = 15.sp)
                        Text(
                            listOfNotNull(CoreActivityRules.formatWhen(foto?.at), "${page + 1} de ${fotos.size}")
                                .joinToString(" · "),
                            color = Color.White.copy(alpha = 0.8f),
                            fontSize = 12.5.sp,
                        )
                    }
                    TextButton(onClick = onClose) { Text("✕", color = Color.White, fontSize = 20.sp) }
                }
                HorizontalPager(state = pagerState, modifier = Modifier.fillMaxWidth().weight(1f)) { p ->
                    ProtectedImage(
                        url = fotos[p].url,
                        contentDescription = fotos[p].titulo,
                        modifier = Modifier.fillMaxSize(),
                        contentScale = ContentScale.Fit,
                    )
                }
                Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                    OutlinedButton(
                        onClick = { scope.launch { pagerState.animateScrollToPage(page - 1) } },
                        enabled = page > 0,
                    ) { Text("←", color = Color.White) }
                    Box(Modifier.weight(1f), contentAlignment = Alignment.Center) {
                        val lat = foto?.lat
                        val lng = foto?.lng
                        if (lat != null && lng != null) {
                            TextButton(onClick = { openMapsAt(context, lat, lng) }) {
                                Text("📍 Ver en mapa", color = Color.White, fontWeight = FontWeight.SemiBold)
                            }
                        } else {
                            Text("Sin ubicación registrada", color = Color.White.copy(alpha = 0.6f), fontSize = 12.5.sp)
                        }
                    }
                    OutlinedButton(
                        onClick = { scope.launch { pagerState.animateScrollToPage(page + 1) } },
                        enabled = page < fotos.lastIndex,
                    ) { Text("→", color = Color.White) }
                }
            }
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun ReviewSheet(
    activityId: Long,
    m: TeamEvidenceMemberDto,
    coreKind: String?,
    inicial: RevisionInicial,
    onDismiss: () -> Unit,
    onDone: (TeamEvidenceResponseDto, String) -> Unit,
) {
    val context = LocalContext.current
    val repo = remember(context) { CoreActivitiesRepository(context) }
    val scope = rememberCoroutineScope()
    val sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true)
    val pasos = CoreActivityRules.evidenceStepsForKind(coreKind)
    var aprobar by remember { mutableStateOf(inicial.aprobar) }
    var todo by remember { mutableStateOf(false) }
    var marcados by remember { mutableStateOf(inicial.pasos.toSet()) }
    var calificacion by remember { mutableIntStateOf(0) }
    var observaciones by remember { mutableStateOf("") }
    var saving by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf<String?>(null) }
    val nombre = CoreActivityRules.shortName(m.nombre)

    val enviar: () -> Unit = enviar@{
        val faltan = CoreActivityRules.revisionFaltantes(aprobar, todo, marcados.size, calificacion, observaciones)
        if (faltan.isNotEmpty()) {
            error = "Falta: ${faltan.joinToString(", ")}."
            return@enviar
        }
        scope.launch {
            saving = true
            error = null
            try {
                val pasosElegidos = pasos.filter { it in marcados }
                val nuevo = withContext(Dispatchers.IO) {
                    repo.reviewTeamEvidence(
                        activityId,
                        m.userId,
                        RevisarEvidenciaRequest(
                            decision = if (aprobar) "aprobar" else "devolver",
                            pasos = if (!aprobar && !todo) pasosElegidos else null,
                            todo = if (!aprobar) todo else null,
                            observaciones = observaciones.trim(),
                            calificacion = calificacion,
                        ),
                    )
                }
                val texto = when {
                    aprobar -> "Aprobaste la evidencia de $nombre."
                    todo -> "Devolviste toda la evidencia a $nombre: la rehace desde cero."
                    else -> "Devolviste ${pasosElegidos.size} paso${if (pasosElegidos.size == 1) "" else "s"} a $nombre."
                }
                onDone(nuevo, texto)
            } catch (e: Exception) {
                error = e.toUserMessage("No se pudo guardar la revisión")
            } finally {
                saving = false
            }
        }
    }

    ModalBottomSheet(
        onDismissRequest = { if (!saving) onDismiss() },
        sheetState = sheetState,
        containerColor = Color.White,
    ) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .verticalScroll(rememberScrollState())
                .padding(horizontal = 20.dp)
                .padding(bottom = 28.dp),
            verticalArrangement = Arrangement.spacedBy(16.dp),
        ) {
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                PersonAvatar(m.nombre, m.avatarUrl, 40.dp)
                Column(Modifier.weight(1f)) {
                    Text("Revisar a $nombre", fontSize = 18.sp, fontWeight = FontWeight.ExtraBold, color = NxColors.Slate)
                    Text(
                        "Tu decisión, la calificación y tus observaciones le llegan y quedan en el historial.",
                        fontSize = 12.5.sp,
                        color = NxColors.Muted,
                    )
                }
            }

            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                DecisionToggle("✅ Aprobar", aprobar, VERDE, Modifier.weight(1f)) { aprobar = true }
                DecisionToggle("↩️ Devolver", !aprobar, NARANJA, Modifier.weight(1f)) { aprobar = false }
            }

            if (!aprobar) {
                Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    Text("¿Qué debe rehacer?", fontSize = 13.sp, fontWeight = FontWeight.ExtraBold, color = NxColors.Slate)
                    ScopeOption(
                        selected = !todo,
                        color = NARANJA,
                        title = "Solo algunos pasos",
                        subtitle = "Corrige únicamente lo que marques; lo demás se queda.",
                    ) { todo = false }
                    if (!todo) {
                        Column(Modifier.padding(start = 12.dp)) {
                            pasos.forEach { step ->
                                val checked = step in marcados
                                Row(
                                    verticalAlignment = Alignment.CenterVertically,
                                    modifier = Modifier
                                        .fillMaxWidth()
                                        .heightIn(min = 44.dp)
                                        .clickable { marcados = if (checked) marcados - step else marcados + step },
                                ) {
                                    Checkbox(
                                        checked = checked,
                                        onCheckedChange = { on -> marcados = if (on) marcados + step else marcados - step },
                                    )
                                    Text(CoreActivityRules.stepLabel(step), fontSize = 14.sp, color = NxColors.Slate)
                                }
                            }
                        }
                    }
                    ScopeOption(
                        selected = todo,
                        color = ROJO,
                        title = "Toda la actividad",
                        subtitle = "Sus evidencias se vacían y las vuelve a subir desde cero. " +
                            "Lo que había queda guardado en el historial.",
                    ) { todo = true }
                }
            }

            Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
                Text("Eficiencia de $nombre", fontSize = 13.sp, fontWeight = FontWeight.ExtraBold, color = NxColors.Slate)
                Row(verticalAlignment = Alignment.CenterVertically) {
                    (1..5).forEach { n ->
                        Box(
                            modifier = Modifier.size(44.dp).clickable { calificacion = n },
                            contentAlignment = Alignment.Center,
                        ) {
                            Text(
                                "★",
                                fontSize = 30.sp,
                                color = if (n <= calificacion) Color(0xFFF59E0B) else Color(0xFFCBD5E1),
                            )
                        }
                    }
                    Spacer(Modifier.size(6.dp))
                    Text(
                        if (calificacion > 0) CoreActivityRules.califLabel(calificacion) else "Toca una estrella",
                        fontSize = 13.5.sp,
                        fontWeight = FontWeight.Bold,
                        color = if (calificacion > 0) NxColors.Slate else NxColors.Muted,
                    )
                }
            }

            OutlinedTextField(
                value = observaciones,
                onValueChange = { observaciones = it.take(2000) },
                label = { Text(if (aprobar) "¿Por qué la apruebas?" else "¿Qué debe corregir y por qué?") },
                placeholder = {
                    Text(
                        if (aprobar) {
                            "Ej. Fotos claras, hoja firmada por el gerente y dejó el sitio limpio."
                        } else {
                            "Ej. La foto de salida no muestra el equipo instalado; tómala de frente."
                        },
                    )
                },
                minLines = 4,
                enabled = !saving,
                modifier = Modifier.fillMaxWidth(),
            )

            error?.let { Text(it, fontSize = 13.5.sp, color = Color(0xFFB91C1C)) }

            val n = marcados.size
            val confirmar = when {
                aprobar -> "✅ Aprobar"
                todo -> "↩️ Devolver todo"
                else -> "↩️ Devolver${if (n > 0) " $n" else ""} paso${if (n == 1) "" else "s"}"
            }
            val colorConfirmar = when {
                aprobar -> VERDE
                todo -> ROJO
                else -> NARANJA
            }
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp), modifier = Modifier.fillMaxWidth()) {
                OutlinedButton(
                    onClick = onDismiss,
                    enabled = !saving,
                    modifier = Modifier.weight(1f).heightIn(min = 48.dp),
                ) { Text("Cancelar") }
                Button(
                    onClick = enviar,
                    enabled = !saving,
                    colors = ButtonDefaults.buttonColors(containerColor = Color(colorConfirmar)),
                    modifier = Modifier.weight(1f).heightIn(min = 48.dp),
                ) { Text(if (saving) "Guardando…" else confirmar, fontWeight = FontWeight.Bold) }
            }
        }
    }
}

@Composable
private fun DecisionToggle(
    label: String,
    selected: Boolean,
    color: Long,
    modifier: Modifier = Modifier,
    onClick: () -> Unit,
) {
    val c = Color(color)
    Box(
        modifier = modifier
            .heightIn(min = 50.dp)
            .clip(RoundedCornerShape(12.dp))
            .background(if (selected) c.copy(alpha = 0.12f) else Color.White)
            .border(2.dp, if (selected) c else Color(0xFFE2E8F0), RoundedCornerShape(12.dp))
            .clickable(onClick = onClick),
        contentAlignment = Alignment.Center,
    ) {
        Text(label, fontSize = 15.sp, fontWeight = FontWeight.Bold, color = if (selected) c else NxColors.Slate)
    }
}

@Composable
private fun ScopeOption(
    selected: Boolean,
    color: Long,
    title: String,
    subtitle: String,
    onClick: () -> Unit,
) {
    val c = Color(color)
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(12.dp))
            .background(if (selected) c.copy(alpha = 0.08f) else Color.White)
            .border(1.5.dp, if (selected) c else Color(0xFFE2E8F0), RoundedCornerShape(12.dp))
            .clickable(onClick = onClick)
            .padding(horizontal = 8.dp, vertical = 8.dp),
        verticalAlignment = Alignment.Top,
    ) {
        RadioButton(selected = selected, onClick = onClick)
        Column(Modifier.weight(1f).padding(top = 10.dp)) {
            Text(title, fontSize = 14.sp, fontWeight = FontWeight.Bold, color = NxColors.Slate)
            Text(subtitle, fontSize = 12.5.sp, color = NxColors.Muted)
        }
    }
}
