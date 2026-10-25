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
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.ArrowDropDown
import androidx.compose.material.icons.outlined.Block
import androidx.compose.material.icons.outlined.CalendarMonth
import androidx.compose.material.icons.outlined.EventBusy
import androidx.compose.material.icons.outlined.SwapHoriz
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.Icon
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.RadioButton
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
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
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import mx.nexara.mobile.nativeapp.data.api.ActivityAccionesDto
import mx.nexara.mobile.nativeapp.data.api.CausaIncumplimientoDto
import mx.nexara.mobile.nativeapp.data.api.TeamBoardUserDto
import mx.nexara.mobile.nativeapp.data.api.toUserMessage
import mx.nexara.mobile.nativeapp.data.console.ConsoleRepository
import mx.nexara.mobile.nativeapp.data.console.CoreActivitiesRepository
import mx.nexara.mobile.nativeapp.ui.enterprise.NxColors

/**
 * «Cancelar actividad», «Pasar a otro compañero», «Registrar incumplimiento» y
 * «Reprogramar». Solo aparecen si la API dice que quien consulta puede
 * (`GET activities/:id/acciones`); al guardar lo vuelve a validar.
 * [onDone] recibe el mensaje de éxito y recarga el detalle.
 */
@OptIn(ExperimentalLayoutApi::class)
@Composable
internal fun ActivitySuperiorActions(
    activityId: Long,
    refreshKey: Int,
    onDone: (String) -> Unit,
    modifier: Modifier = Modifier,
) {
    val context = LocalContext.current
    val repo = remember(context) { ConsoleRepository(context) }
    val coreRepo = remember(context) { CoreActivitiesRepository(context) }
    var acciones by remember(activityId) { mutableStateOf<ActivityAccionesDto?>(null) }
    var dialogo by remember { mutableStateOf<ActivitySuperiorRules.Accion?>(null) }

    LaunchedEffect(activityId, refreshKey) {
        // Opcional: sin respuesta (403, sin red) no se muestra nada.
        acciones = withContext(Dispatchers.IO) { runCatching { repo.activityActions(activityId) }.getOrNull() }
    }

    val a = acciones ?: return
    if (!ActivitySuperiorRules.muestraAcciones(a)) return
    val minimo = ActivitySuperiorRules.motivoMinimo(a)

    FlowRow(
        modifier,
        horizontalArrangement = Arrangement.spacedBy(8.dp),
        verticalArrangement = Arrangement.spacedBy(4.dp),
    ) {
        ActivitySuperiorRules.botones(a).forEach { accion ->
            val peligro = accion == ActivitySuperiorRules.Accion.CANCELAR ||
                accion == ActivitySuperiorRules.Accion.NO_CUMPLIDA
            OutlinedButton(
                onClick = { dialogo = accion },
                colors = if (peligro) {
                    ButtonDefaults.outlinedButtonColors(contentColor = NxColors.Danger)
                } else {
                    ButtonDefaults.outlinedButtonColors()
                },
            ) {
                Icon(
                    when (accion) {
                        ActivitySuperiorRules.Accion.PASAR -> Icons.Outlined.SwapHoriz
                        ActivitySuperiorRules.Accion.NO_CUMPLIDA -> Icons.Outlined.EventBusy
                        ActivitySuperiorRules.Accion.REPROGRAMAR -> Icons.Outlined.CalendarMonth
                        ActivitySuperiorRules.Accion.CANCELAR -> Icons.Outlined.Block
                    },
                    contentDescription = null,
                    modifier = Modifier.size(18.dp),
                )
                Text(
                    when (accion) {
                        ActivitySuperiorRules.Accion.PASAR -> "Pasar a otro compañero"
                        ActivitySuperiorRules.Accion.NO_CUMPLIDA -> "Registrar incumplimiento"
                        ActivitySuperiorRules.Accion.REPROGRAMAR -> "Reprogramar"
                        ActivitySuperiorRules.Accion.CANCELAR -> "Cancelar actividad"
                    },
                    fontSize = 13.sp,
                    modifier = Modifier.padding(start = 6.dp),
                )
            }
        }
    }

    when (dialogo) {
        ActivitySuperiorRules.Accion.CANCELAR -> CancelarActividadDialog(
            minimo = minimo,
            onDismiss = { dialogo = null },
            onConfirm = { motivo ->
                withContext(Dispatchers.IO) { repo.cancelActivity(activityId, motivo) }
                dialogo = null
                onDone("La actividad quedó cancelada.")
            },
        )
        ActivitySuperiorRules.Accion.PASAR -> PasarActividadDialog(
            acciones = a,
            minimo = minimo,
            cargarEquipo = { withContext(Dispatchers.IO) { coreRepo.board() }.users.orEmpty() },
            onDismiss = { dialogo = null },
            onConfirm = { de, para, motivo ->
                withContext(Dispatchers.IO) { repo.reassignActivity(activityId, de, para.id, motivo) }
                dialogo = null
                val quien = CoreActivityRules.shortName(para.nombre).ifBlank { "tu compañero" }
                onDone("La actividad pasó a $quien. Continuará donde se quedó con sus propias fotos de entrada y salida.")
            },
        )
        ActivitySuperiorRules.Accion.NO_CUMPLIDA -> NoCumplidaDialog(
            causas = ActivitySuperiorRules.causas(a),
            minimo = minimo,
            onDismiss = { dialogo = null },
            onConfirm = { causa, observaciones ->
                withContext(Dispatchers.IO) { repo.registrarNoCumplida(activityId, causa, observaciones) }
                dialogo = null
                onDone("La actividad quedó como no cumplida.")
            },
        )
        ActivitySuperiorRules.Accion.REPROGRAMAR -> ReprogramarDialog(
            minimo = minimo,
            onDismiss = { dialogo = null },
            onConfirm = { fechaIso, motivo ->
                withContext(Dispatchers.IO) { repo.reprogramarNoCumplida(activityId, fechaIso, motivo) }
                dialogo = null
                val cuando = CoreActivityRules.formatWhen(fechaIso)?.let { " para $it" }.orEmpty()
                onDone("Actividad reprogramada$cuando.")
            },
        )
        null -> Unit
    }
}

@Composable
private fun MotivoField(
    motivo: String,
    onChange: (String) -> Unit,
    minimo: Int,
    placeholder: String,
    enabled: Boolean,
    label: String = "Motivo *",
) {
    val ok = ActivitySuperiorRules.motivoOk(motivo, minimo)
    OutlinedTextField(
        value = motivo,
        onValueChange = { onChange(it.take(ActivitySuperiorRules.TEXTO_MAXIMO)) },
        label = { Text(label) },
        placeholder = { Text(placeholder) },
        minLines = 3,
        enabled = enabled,
        modifier = Modifier.fillMaxWidth(),
    )
    Text(
        "${ActivitySuperiorRules.motivoLimpio(motivo).length}/$minimo caracteres mínimo",
        fontSize = 11.5.sp,
        color = if (ok) NxColors.Muted else NxColors.Danger,
    )
}

@Composable
private fun CancelarActividadDialog(
    minimo: Int,
    onDismiss: () -> Unit,
    onConfirm: suspend (String) -> Unit,
) {
    val scope = rememberCoroutineScope()
    var motivo by remember { mutableStateOf("") }
    var saving by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf<String?>(null) }
    val ok = ActivitySuperiorRules.motivoOk(motivo, minimo)

    AlertDialog(
        onDismissRequest = { if (!saving) onDismiss() },
        title = { Text("Cancelar actividad", fontWeight = FontWeight.Bold) },
        text = {
            Column(
                Modifier.verticalScroll(rememberScrollState()),
                verticalArrangement = Arrangement.spacedBy(8.dp),
            ) {
                Text(
                    "La actividad quedará como «Cancelada» con tu motivo en el historial.",
                    fontSize = 13.sp,
                    color = NxColors.Muted,
                )
                MotivoField(
                    motivo = motivo,
                    onChange = { motivo = it },
                    minimo = minimo,
                    placeholder = "Ej. El cliente pospuso el servicio hasta nuevo aviso.",
                    enabled = !saving,
                )
                error?.let { Text(it, fontSize = 13.sp, color = NxColors.Danger) }
            }
        },
        confirmButton = {
            Button(
                onClick = {
                    scope.launch {
                        saving = true
                        error = null
                        try {
                            onConfirm(ActivitySuperiorRules.motivoLimpio(motivo))
                        } catch (e: Exception) {
                            error = e.toUserMessage("No se pudo cancelar la actividad")
                        } finally {
                            saving = false
                        }
                    }
                },
                enabled = ok && !saving,
                colors = ButtonDefaults.buttonColors(containerColor = NxColors.Danger, contentColor = Color.White),
            ) { Text(if (saving) "Cancelando…" else "Cancelar actividad") }
        },
        dismissButton = {
            TextButton(onClick = onDismiss, enabled = !saving) { Text("Volver") }
        },
    )
}

@Composable
private fun PasarActividadDialog(
    acciones: ActivityAccionesDto,
    minimo: Int,
    cargarEquipo: suspend () -> List<TeamBoardUserDto>,
    onDismiss: () -> Unit,
    onConfirm: suspend (deUsuarioId: Long, para: TeamBoardUserDto, motivo: String) -> Unit,
) {
    val scope = rememberCoroutineScope()
    val salen = remember(acciones) { ActivitySuperiorRules.quienesSalen(acciones) }
    var deId by remember { mutableStateOf(salen.singleOrNull()?.userId) }
    var para by remember { mutableStateOf<TeamBoardUserDto?>(null) }
    var equipo by remember { mutableStateOf<List<TeamBoardUserDto>?>(null) }
    var equipoError by remember { mutableStateOf<String?>(null) }
    var motivo by remember { mutableStateOf("") }
    var saving by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf<String?>(null) }

    LaunchedEffect(Unit) {
        try {
            equipo = cargarEquipo()
        } catch (e: Exception) {
            equipo = emptyList()
            equipoError = e.toUserMessage("No se pudo cargar tu equipo")
        }
    }

    val entran = ActivitySuperiorRules.quienesEntran(equipo.orEmpty(), acciones)
    val listo = deId != null && para != null && ActivitySuperiorRules.motivoOk(motivo, minimo)

    AlertDialog(
        onDismissRequest = { if (!saving) onDismiss() },
        title = { Text("Pasar a otro compañero", fontWeight = FontWeight.Bold) },
        text = {
            Column(
                Modifier.verticalScroll(rememberScrollState()),
                verticalArrangement = Arrangement.spacedBy(8.dp),
            ) {
                Text(
                    "Quien la recibe continúa donde se quedó: ve el avance anterior y toma sus propias fotos " +
                        "de entrada y salida. El avance de quien sale queda guardado.",
                    fontSize = 13.sp,
                    color = NxColors.Muted,
                )
                Text("Quién la deja *", fontSize = 12.sp, fontWeight = FontWeight.SemiBold, color = NxColors.Muted)
                salen.forEach { p ->
                    val on = deId == p.userId
                    Row(
                        verticalAlignment = Alignment.CenterVertically,
                        modifier = Modifier
                            .fillMaxWidth()
                            .heightIn(min = 44.dp)
                            .clip(RoundedCornerShape(10.dp))
                            .background(if (on) NxColors.BrandSoft.copy(alpha = 0.5f) else Color.White)
                            .border(1.dp, if (on) NxColors.Brand else Color(0xFFE2E8F0), RoundedCornerShape(10.dp))
                            .clickable(enabled = !saving) { deId = p.userId },
                    ) {
                        RadioButton(selected = on, onClick = { deId = p.userId }, enabled = !saving)
                        Text(ActivitySuperiorRules.etiquetaPersona(p), fontSize = 13.sp, color = NxColors.Slate)
                    }
                }

                Text(
                    "Compañero que la continúa *",
                    fontSize = 12.sp,
                    fontWeight = FontWeight.SemiBold,
                    color = NxColors.Muted,
                )
                CompaneroPicker(
                    opciones = entran,
                    elegido = para,
                    cargando = equipo == null,
                    enabled = !saving,
                    onElegir = { para = it },
                )
                equipoError?.let { Text(it, fontSize = 12.sp, color = NxColors.Danger) }
                if (equipo != null && equipoError == null && entran.isEmpty()) {
                    Text("No encontramos compañeros disponibles para ti.", fontSize = 12.sp, color = NxColors.Muted)
                }

                MotivoField(
                    motivo = motivo,
                    onChange = { motivo = it },
                    minimo = minimo,
                    placeholder = "Ej. Se enfermó y no puede terminar hoy.",
                    enabled = !saving,
                )
                error?.let { Text(it, fontSize = 13.sp, color = NxColors.Danger) }
            }
        },
        confirmButton = {
            Button(
                onClick = {
                    val de = deId ?: return@Button
                    val destino = para ?: return@Button
                    scope.launch {
                        saving = true
                        error = null
                        try {
                            onConfirm(de, destino, ActivitySuperiorRules.motivoLimpio(motivo))
                        } catch (e: Exception) {
                            error = e.toUserMessage("No se pudo pasar la actividad")
                        } finally {
                            saving = false
                        }
                    }
                },
                enabled = listo && !saving,
                colors = ButtonDefaults.buttonColors(containerColor = NxColors.Brand),
            ) { Text(if (saving) "Pasando…" else "Pasar actividad") }
        },
        dismissButton = {
            TextButton(onClick = onDismiss, enabled = !saving) { Text("Volver") }
        },
    )
}

/** «Registrar incumplimiento»: causa del catálogo y observaciones con el mismo mínimo que cancelar. */
@Composable
private fun NoCumplidaDialog(
    causas: List<CausaIncumplimientoDto>,
    minimo: Int,
    onDismiss: () -> Unit,
    onConfirm: suspend (causa: String, observaciones: String) -> Unit,
) {
    val scope = rememberCoroutineScope()
    var causa by remember { mutableStateOf<String?>(null) }
    var observaciones by remember { mutableStateOf("") }
    var saving by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf<String?>(null) }
    val listo = ActivitySuperiorRules.incumplimientoListo(causa, observaciones, minimo)

    AlertDialog(
        onDismissRequest = { if (!saving) onDismiss() },
        title = { Text("Registrar incumplimiento", fontWeight = FontWeight.Bold) },
        text = {
            Column(
                Modifier.verticalScroll(rememberScrollState()),
                verticalArrangement = Arrangement.spacedBy(8.dp),
            ) {
                Text(
                    "La actividad se cierra como «No cumplida»: ya no admite evidencia ni se puede iniciar.",
                    fontSize = 13.sp,
                    color = NxColors.Muted,
                )
                Text("Causa *", fontSize = 12.sp, fontWeight = FontWeight.SemiBold, color = NxColors.Muted)
                causas.forEach { opcion ->
                    val clave = opcion.clave.orEmpty()
                    val on = causa == clave
                    Row(
                        verticalAlignment = Alignment.CenterVertically,
                        modifier = Modifier
                            .fillMaxWidth()
                            .heightIn(min = 44.dp)
                            .clip(RoundedCornerShape(10.dp))
                            .background(if (on) NxColors.DangerSoft else Color.White)
                            .border(1.dp, if (on) NxColors.Danger else Color(0xFFE2E8F0), RoundedCornerShape(10.dp))
                            .clickable(enabled = !saving) { causa = clave },
                    ) {
                        RadioButton(selected = on, onClick = { causa = clave }, enabled = !saving)
                        Text(
                            opcion.etiqueta.orEmpty().ifBlank { ActivitySuperiorRules.etiquetaCausa(clave) },
                            fontSize = 13.sp,
                            color = NxColors.Slate,
                            modifier = Modifier.padding(end = 10.dp),
                        )
                    }
                }
                MotivoField(
                    motivo = observaciones,
                    onChange = { observaciones = it },
                    minimo = minimo,
                    placeholder = "Ej. El cliente no dio acceso al sitio y no hubo forma de reagendar hoy.",
                    enabled = !saving,
                    label = "Observaciones *",
                )
                error?.let { Text(it, fontSize = 13.sp, color = NxColors.Danger) }
            }
        },
        confirmButton = {
            Button(
                onClick = {
                    val elegida = causa ?: return@Button
                    scope.launch {
                        saving = true
                        error = null
                        try {
                            onConfirm(elegida, ActivitySuperiorRules.motivoLimpio(observaciones))
                        } catch (e: Exception) {
                            error = e.toUserMessage("No se pudo registrar el incumplimiento")
                        } finally {
                            saving = false
                        }
                    }
                },
                enabled = listo && !saving,
                colors = ButtonDefaults.buttonColors(containerColor = NxColors.Danger, contentColor = Color.White),
            ) { Text(if (saving) "Registrando…" else "Registrar") }
        },
        dismissButton = {
            TextButton(onClick = onDismiss, enabled = !saving) { Text("Volver") }
        },
    )
}

/** «Reprogramar» una no cumplida: nuevo día y hora de inicio, y por qué. */
@Composable
private fun ReprogramarDialog(
    minimo: Int,
    onDismiss: () -> Unit,
    onConfirm: suspend (fechaIso: String, motivo: String) -> Unit,
) {
    val scope = rememberCoroutineScope()
    var fecha by remember { mutableStateOf("") }
    var motivo by remember { mutableStateOf("") }
    var saving by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf<String?>(null) }
    val iso = CoreActivityRules.localInputToIso(fecha)
    val fechaOk = ActivitySuperiorRules.fechaReprogramadaOk(iso)
    val listo = fechaOk && ActivitySuperiorRules.motivoOk(motivo, minimo)

    AlertDialog(
        onDismissRequest = { if (!saving) onDismiss() },
        title = { Text("Reprogramar", fontWeight = FontWeight.Bold) },
        text = {
            Column(
                Modifier.verticalScroll(rememberScrollState()),
                verticalArrangement = Arrangement.spacedBy(8.dp),
            ) {
                Text(
                    "La actividad se reabre con la nueva fecha.",
                    fontSize = 13.sp,
                    color = NxColors.Muted,
                )
                DateTimePickerField(
                    label = "Nuevo inicio *",
                    value = fecha,
                    onValueChange = { fecha = it },
                )
                if (fecha.isNotBlank() && !fechaOk) {
                    Text(
                        "Elige un día y una hora posteriores a este momento.",
                        fontSize = 11.5.sp,
                        color = NxColors.Danger,
                    )
                }
                MotivoField(
                    motivo = motivo,
                    onChange = { motivo = it },
                    minimo = minimo,
                    placeholder = "Ej. El cliente confirmó acceso para el lunes temprano.",
                    enabled = !saving,
                )
                error?.let { Text(it, fontSize = 13.sp, color = NxColors.Danger) }
            }
        },
        confirmButton = {
            Button(
                onClick = {
                    val nueva = iso ?: return@Button
                    scope.launch {
                        saving = true
                        error = null
                        try {
                            onConfirm(nueva, ActivitySuperiorRules.motivoLimpio(motivo))
                        } catch (e: Exception) {
                            error = e.toUserMessage("No se pudo reprogramar la actividad")
                        } finally {
                            saving = false
                        }
                    }
                },
                enabled = listo && !saving,
                colors = ButtonDefaults.buttonColors(containerColor = NxColors.Brand),
            ) { Text(if (saving) "Reprogramando…" else "Reprogramar") }
        },
        dismissButton = {
            TextButton(onClick = onDismiss, enabled = !saving) { Text("Volver") }
        },
    )
}

@Composable
private fun CompaneroPicker(
    opciones: List<TeamBoardUserDto>,
    elegido: TeamBoardUserDto?,
    cargando: Boolean,
    enabled: Boolean,
    onElegir: (TeamBoardUserDto) -> Unit,
) {
    var open by remember { mutableStateOf(false) }
    Box(Modifier.fillMaxWidth()) {
        OutlinedButton(
            onClick = { open = true },
            enabled = enabled && !cargando && opciones.isNotEmpty(),
            modifier = Modifier.fillMaxWidth(),
        ) {
            Text(
                when {
                    cargando -> "Cargando compañeros…"
                    elegido != null -> elegido.nombre.orEmpty().ifBlank { "Sin nombre" }
                    else -> "Elige al compañero"
                },
                modifier = Modifier.weight(1f),
                fontSize = 13.sp,
                color = if (elegido != null) NxColors.Slate else NxColors.Muted,
            )
            Icon(Icons.Default.ArrowDropDown, contentDescription = null)
        }
        DropdownMenu(expanded = open, onDismissRequest = { open = false }) {
            opciones.forEach { u ->
                DropdownMenuItem(
                    text = {
                        Column {
                            Text(u.nombre.orEmpty().ifBlank { "Sin nombre" }, fontSize = 14.sp)
                            u.puesto?.takeIf { it.isNotBlank() }?.let {
                                Text(it, fontSize = 11.5.sp, color = NxColors.Muted)
                            }
                        }
                    },
                    onClick = {
                        open = false
                        onElegir(u)
                    },
                )
            }
        }
    }
}
