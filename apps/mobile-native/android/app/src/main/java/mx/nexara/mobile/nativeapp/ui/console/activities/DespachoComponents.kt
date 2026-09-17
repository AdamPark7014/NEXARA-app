package mx.nexara.mobile.nativeapp.ui.console.activities

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.CalendarMonth
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Checkbox
import androidx.compose.material3.Icon
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.SpanStyle
import androidx.compose.ui.text.buildAnnotatedString
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.withStyle
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import mx.nexara.mobile.nativeapp.data.api.TeamBoardOpenActivityDto
import mx.nexara.mobile.nativeapp.data.api.TeamBoardUserDto
import mx.nexara.mobile.nativeapp.data.api.toUserMessage
import mx.nexara.mobile.nativeapp.data.console.CoreActivitiesRepository
import mx.nexara.mobile.nativeapp.ui.enterprise.NxColors
import mx.nexara.mobile.nativeapp.ui.enterprise.NxGlyph
import mx.nexara.mobile.nativeapp.ui.enterprise.NxIconText
import mx.nexara.mobile.nativeapp.ui.enterprise.icon

/**
 * Quien reparte un despacho cambia su día y hora; queda en el Historial de la
 * actividad («Reprogramada por …»). Espejo de ReprogramarDespacho.tsx.
 */
@Composable
internal fun ReprogramarDespachoInline(
    activityId: Long,
    fechaActual: String?,
    onDone: () -> Unit,
) {
    val context = LocalContext.current
    val repo = remember(context) { CoreActivitiesRepository(context) }
    val scope = rememberCoroutineScope()
    var open by remember(activityId) { mutableStateOf(false) }
    var fecha by remember(activityId) { mutableStateOf("") }
    var motivo by remember(activityId) { mutableStateOf("") }
    var saving by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf<String?>(null) }
    var ok by remember { mutableStateOf<String?>(null) }

    Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(4.dp), modifier = Modifier.weight(1f)) {
                Icon(Icons.Outlined.CalendarMonth, contentDescription = null, tint = NxColors.Muted, modifier = Modifier.size(16.dp))
                Text(
                    buildAnnotatedString {
                        append("Programada: ")
                        withStyle(SpanStyle(fontWeight = FontWeight.Bold, color = NxColors.Slate)) {
                            append(CoreActivityRules.formatWhen(fechaActual) ?: "Sin fecha")
                        }
                    },
                    fontSize = 13.sp,
                    color = NxColors.Muted,
                )
            }
            if (!open) {
                OutlinedButton(
                    onClick = {
                        fecha = CoreActivityRules.isoToLocalInput(fechaActual)
                        motivo = ""
                        error = null
                        ok = null
                        open = true
                    },
                ) { Text("Cambiar fecha y hora", fontSize = 13.sp) }
            }
        }
        if (!open) {
            ok?.let { NxIconText(text = it, icon = NxGlyph.DONE.icon, fontSize = 12.5.sp, color = Color(CoreActivityRules.VERDE)) }
        }
        if (open) {
            Column(
                modifier = Modifier
                    .fillMaxWidth()
                    .clip(RoundedCornerShape(12.dp))
                    .background(Color.White)
                    .border(1.dp, Color(0xFFE2E8F0), RoundedCornerShape(12.dp))
                    .padding(12.dp),
                verticalArrangement = Arrangement.spacedBy(10.dp),
            ) {
                DateTimePickerField(label = "Día y hora", value = fecha, onValueChange = { fecha = it })
                OutlinedTextField(
                    value = motivo,
                    onValueChange = { motivo = it.take(500) },
                    label = { Text("Motivo (opcional)") },
                    placeholder = { Text("Ej. El cliente pidió cambiar la visita") },
                    minLines = 2,
                    enabled = !saving,
                    modifier = Modifier.fillMaxWidth(),
                )
                error?.let { Text(it, fontSize = 12.5.sp, color = Color(0xFFB91C1C)) }
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    Button(
                        onClick = {
                            val iso = CoreActivityRules.localInputToIso(fecha)
                            if (iso == null) {
                                error = "Elige el día y la hora"
                            } else {
                                scope.launch {
                                    saving = true
                                    error = null
                                    try {
                                        withContext(Dispatchers.IO) { repo.reprogramar(activityId, iso, motivo) }
                                        ok = "Reprogramada para ${CoreActivityRules.formatWhen(iso).orEmpty()}"
                                        open = false
                                        onDone()
                                    } catch (e: Exception) {
                                        error = e.toUserMessage("No se pudo reprogramar")
                                    } finally {
                                        saving = false
                                    }
                                }
                            }
                        },
                        enabled = !saving,
                        colors = ButtonDefaults.buttonColors(containerColor = NxColors.Brand),
                    ) { Text(if (saving) "Guardando…" else "Guardar nueva fecha") }
                    OutlinedButton(onClick = { open = false }, enabled = !saving) { Text("Cancelar") }
                }
            }
        }
    }
}

/**
 * Despachos que el encargado aún no reparte, con su gente para elegir.
 * Espejo de DespachoPendingPanel.tsx: la API valida el grupo y decide el rol
 * (Luis → Antonio como LEAD; Antonio/David → técnicos).
 */
@Composable
internal fun DespachoPendingPanel(
    managerEmail: String?,
    managerUserId: Long,
    pending: List<TeamBoardOpenActivityDto>,
    onDone: () -> Unit,
) {
    val despachos = remember(pending, managerEmail) { CoreActivityRules.despachosPendientes(managerEmail, pending) }
    if (despachos.isEmpty()) return

    val context = LocalContext.current
    val repo = remember(context) { CoreActivitiesRepository(context) }
    val scope = rememberCoroutineScope()
    var roster by remember { mutableStateOf<List<TeamBoardUserDto>>(emptyList()) }
    var loadError by remember { mutableStateOf<String?>(null) }
    var activeId by remember { mutableStateOf<Long?>(null) }
    var selected by remember { mutableStateOf<Set<Long>>(emptySet()) }
    var saving by remember { mutableStateOf(false) }
    var msg by remember { mutableStateOf<Pair<String, Boolean>?>(null) }
    /** «Tiempo estimado» del contrato B: viaja como `horasPlan`. */
    var horasPlan by remember { mutableStateOf("") }

    LaunchedEffect(despachos.size) {
        try {
            roster = withContext(Dispatchers.IO) { repo.board() }.users.orEmpty()
            loadError = null
        } catch (e: Exception) {
            loadError = e.toUserMessage("No se pudo cargar el equipo")
        }
    }

    val candidates = CoreActivityRules.despachoCandidates(managerEmail, managerUserId, roster)
    val isLuis = CoreActivityRules.norm(managerEmail) == CoreActivityRules.LUIS_EMAIL

    Column(
        modifier = Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(18.dp))
            .background(Color(CoreActivityRules.NARANJA).copy(alpha = 0.08f))
            .border(1.dp, Color(CoreActivityRules.NARANJA).copy(alpha = 0.35f), RoundedCornerShape(18.dp))
            .padding(16.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        Column {
            Text("PENDIENTE DE DESPACHO", fontSize = 12.sp, fontWeight = FontWeight.ExtraBold, color = NxColors.Muted)
            Text(
                if (isLuis) "Mándala a Antonio; él elige a quién del soporte." else "Elige a quién de tu equipo ejecuta.",
                fontSize = 13.sp,
                color = NxColors.Muted,
            )
        }
        loadError?.let { Text(it, fontSize = 13.sp, color = Color(0xFFB91C1C)) }

        despachos.forEach { a ->
            Column(
                modifier = Modifier
                    .fillMaxWidth()
                    .clip(RoundedCornerShape(14.dp))
                    .background(Color.White)
                    .border(1.dp, Color(0xFFE2E8F0), RoundedCornerShape(14.dp))
                    .padding(12.dp),
                verticalArrangement = Arrangement.spacedBy(10.dp),
            ) {
                Text(
                    listOfNotNull(a.anNumber, a.titulo).joinToString(" · "),
                    fontSize = 14.sp,
                    fontWeight = FontWeight.ExtraBold,
                    color = NxColors.Slate,
                )
                val cupo = CoreActivityRules.parseDispatchHeadcount(a.indicaciones)
                Text(
                    "Despacho" + (cupo?.let { " · se ocupan $it persona${if (it == 1) "" else "s"}" } ?: ""),
                    fontSize = 12.sp,
                    color = NxColors.Muted,
                )
                ReprogramarDespachoInline(activityId = a.id, fechaActual = a.fechaInicio, onDone = onDone)
                a.indicaciones?.takeIf { it.isNotBlank() }?.let {
                    Text(it, fontSize = 12.sp, color = NxColors.Muted)
                }

                if (activeId == a.id) {
                    if (candidates.isEmpty()) {
                        Text(
                            "No hay gente de tu equipo en el tablero. Actualiza o revisa la jerarquía.",
                            fontSize = 13.sp,
                            color = NxColors.Muted,
                        )
                    } else {
                        Text(
                            if (isLuis) "Elige a Antonio" else "Elige a quién asignas",
                            fontSize = 12.sp,
                            fontWeight = FontWeight.SemiBold,
                            color = NxColors.Muted,
                        )
                        candidates.forEach { u ->
                            val checked = u.id in selected
                            Row(
                                verticalAlignment = Alignment.CenterVertically,
                                modifier = Modifier
                                    .fillMaxWidth()
                                    .heightIn(min = 48.dp)
                                    .clip(RoundedCornerShape(10.dp))
                                    .background(if (checked) NxColors.BrandSoft.copy(alpha = 0.5f) else Color.White)
                                    .border(
                                        1.dp,
                                        if (checked) NxColors.Brand else Color(0xFFE2E8F0),
                                        RoundedCornerShape(10.dp),
                                    )
                                    .clickable(enabled = !saving) {
                                        selected = if (checked) selected - u.id else selected + u.id
                                    },
                            ) {
                                Checkbox(
                                    checked = checked,
                                    onCheckedChange = { on -> selected = if (on) selected + u.id else selected - u.id },
                                    enabled = !saving,
                                )
                                Text(u.nombre ?: "—", fontSize = 13.sp, fontWeight = FontWeight.SemiBold, color = NxColors.Slate)
                            }
                        }
                    }
                    OutlinedTextField(
                        value = horasPlan,
                        onValueChange = { horasPlan = ActivityPlanTime.filtrarEntrada(it) },
                        label = { Text("Tiempo estimado en horas (opcional)") },
                        placeholder = { Text("Ej. 1.5") },
                        singleLine = true,
                        enabled = !saving,
                        supportingText = {
                            Text(
                                "Con esto la actividad avisa cuando se pasa del tiempo.",
                                fontSize = 11.5.sp,
                                color = NxColors.Muted,
                            )
                        },
                        modifier = Modifier.fillMaxWidth(),
                    )
                    Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        Button(
                            onClick = {
                                if (selected.isEmpty()) {
                                    msg = "Elige al menos a una persona de tu equipo" to false
                                } else {
                                    scope.launch {
                                        saving = true
                                        msg = null
                                        try {
                                            val ids = selected.toList()
                                            withContext(Dispatchers.IO) {
                                                repo.dispatch(
                                                    activityId = a.id,
                                                    userIds = ids,
                                                    indicaciones = a.indicaciones,
                                                    horasPlan = ActivityPlanTime.horas(horasPlan),
                                                )
                                            }
                                            msg = "Asignado a ${ids.size} persona(s)" to true
                                            activeId = null
                                            selected = emptySet()
                                            horasPlan = ""
                                            onDone()
                                        } catch (e: Exception) {
                                            msg = e.toUserMessage("No se pudo asignar") to false
                                        } finally {
                                            saving = false
                                        }
                                    }
                                }
                            },
                            enabled = !saving && candidates.isNotEmpty(),
                            colors = ButtonDefaults.buttonColors(containerColor = NxColors.Brand),
                        ) { Text(if (saving) "Asignando…" else "Asignar al equipo") }
                        OutlinedButton(
                            onClick = {
                                activeId = null
                                selected = emptySet()
                                msg = null
                            },
                            enabled = !saving,
                        ) { Text("Cancelar") }
                    }
                } else {
                    Button(
                        onClick = {
                            activeId = a.id
                            selected = emptySet()
                            msg = null
                        },
                        colors = ButtonDefaults.buttonColors(containerColor = NxColors.Brand),
                    ) { Text("Despachar al equipo") }
                }
            }
        }

        msg?.let { (text, success) ->
            Text(
                text,
                fontSize = 13.sp,
                color = if (success) Color(0xFF15803D) else Color(0xFFB91C1C),
            )
        }
    }
}
