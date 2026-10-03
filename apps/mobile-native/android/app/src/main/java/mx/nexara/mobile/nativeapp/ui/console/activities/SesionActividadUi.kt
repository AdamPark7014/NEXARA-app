package mx.nexara.mobile.nativeapp.ui.console.activities

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
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
import mx.nexara.mobile.nativeapp.data.api.ActivityAssigneeRefDto
import mx.nexara.mobile.nativeapp.data.api.TeamBoardOpenActivityDto
import mx.nexara.mobile.nativeapp.data.api.toUserMessage
import mx.nexara.mobile.nativeapp.data.console.CoreActivitiesRepository
import mx.nexara.mobile.nativeapp.ui.enterprise.NxColors
import mx.nexara.mobile.nativeapp.ui.enterprise.NxUi

fun ActivityAssigneeRefDto.sesion(): SesionActividad = SesionActividad(
    enCurso = enCurso,
    enPausa = enPausa,
    pausaTipo = pausaTipo,
    pausadaAt = pausadaAt,
    pausadaPor = pausadaPor,
    motivoPausa = motivoPausa,
    sesionAbiertaDesde = sesionAbiertaDesde,
)

fun TeamBoardOpenActivityDto.sesion(): SesionActividad = SesionActividad(
    enCurso = enCurso,
    enPausa = enPausa,
    pausaTipo = pausaTipo,
    pausadaAt = pausadaAt,
    pausadaPor = pausadaPor,
    motivoPausa = motivoPausa,
    sesionAbiertaDesde = sesionAbiertaDesde,
)

private fun horaLocal(iso: String?): String? =
    iso?.let { CoreActivityRules.formatClock(it) }?.takeIf { it != "—" }

/**
 * Reloj propio en el detalle de mi actividad: «En pausa» + «Reanudar actividad», o
 * «Reloj corriendo» + «Pausar». Sin datos de sesión (API vieja) no pinta nada.
 * Subir cualquier evidencia también lo reanuda: eso lo hace el servidor.
 */
@Composable
fun SesionPropiaPanel(
    activityId: Long,
    sesion: SesionActividad,
    miId: Long?,
    despachador: Boolean,
    estatus: String?,
    onDone: (String) -> Unit,
    modifier: Modifier = Modifier,
) {
    val reanudable = SesionActividadRules.puedeReanudar(sesion, despachador, estatus)
    val pausable = !despachador && SesionActividadRules.puedePausar(sesion, estatus)
    if (!reanudable && !pausable) return

    val context = LocalContext.current
    val repo = remember(context) { CoreActivitiesRepository(context) }
    val scope = rememberCoroutineScope()
    var guardando by remember(activityId) { mutableStateOf(false) }
    var error by remember(activityId) { mutableStateOf<String?>(null) }
    var pidiendoMotivo by remember(activityId) { mutableStateOf(false) }
    var motivo by remember(activityId) { mutableStateOf("") }

    val tono = if (reanudable) Color(CoreActivityRules.NARANJA) else Color(CoreActivityRules.VERDE)
    Column(
        modifier = modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(14.dp))
            .background(tono.copy(alpha = 0.07f))
            .border(1.dp, tono.copy(alpha = 0.3f), RoundedCornerShape(14.dp))
            .padding(12.dp),
        verticalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        if (reanudable) {
            Text("En pausa", fontSize = 13.5.sp, fontWeight = FontWeight.ExtraBold, color = NxColors.Slate)
            SesionActividadRules.textoPausa(sesion, miId = miId, propia = true)?.let {
                Text(it, fontSize = 12.5.sp, color = NxColors.Muted)
            }
            error?.let { Text(it, fontSize = 12.5.sp, color = Color(CoreActivityRules.ROJO)) }
            Button(
                onClick = {
                    scope.launch {
                        guardando = true
                        error = null
                        try {
                            withContext(Dispatchers.IO) { repo.reanudarActividad(activityId) }
                            onDone("Tu reloj volvió a correr")
                        } catch (e: Exception) {
                            error = e.toUserMessage("No se pudo reanudar la actividad")
                        } finally {
                            guardando = false
                        }
                    }
                },
                enabled = !guardando,
                colors = ButtonDefaults.buttonColors(containerColor = Color(CoreActivityRules.VERDE)),
                modifier = Modifier.heightIn(min = 48.dp),
            ) {
                Text(if (guardando) "Reanudando…" else "Reanudar actividad", fontWeight = FontWeight.Bold)
            }
            Text(SesionActividadRules.AYUDA_REANUDAR, fontSize = 11.5.sp, color = NxColors.Muted)
        } else {
            Text(
                SesionActividadRules.textoCorriendo(horaLocal(sesion.sesionAbiertaDesde)),
                fontSize = 13.5.sp,
                fontWeight = FontWeight.Bold,
                color = NxColors.Slate,
            )
            error?.let { Text(it, fontSize = 12.5.sp, color = Color(CoreActivityRules.ROJO)) }
            OutlinedButton(
                onClick = { error = null; motivo = ""; pidiendoMotivo = true },
                enabled = !guardando,
                modifier = Modifier.heightIn(min = 48.dp),
            ) {
                Text(if (guardando) "Pausando…" else "Pausar", fontWeight = FontWeight.Bold)
            }
        }
    }

    if (pidiendoMotivo) {
        val errorMotivo = SesionActividadRules.errorMotivoPropio(motivo)
        AlertDialog(
            onDismissRequest = { if (!guardando) pidiendoMotivo = false },
            title = { Text(SesionActividadRules.TITULO_PAUSA_PROPIA) },
            text = {
                Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    Text(SesionActividadRules.TEXTO_PAUSA_PROPIA, fontSize = 13.sp)
                    OutlinedTextField(
                        value = motivo,
                        onValueChange = { motivo = it.take(SesionActividadRules.MOTIVO_PAUSA_MAX + 20) },
                        label = { Text("Motivo (opcional)") },
                        isError = errorMotivo != null,
                        supportingText = errorMotivo?.let { { Text(it) } },
                        minLines = 2,
                        modifier = Modifier.fillMaxWidth(),
                    )
                    error?.let { Text(it, fontSize = 12.5.sp, color = Color(CoreActivityRules.ROJO)) }
                }
            },
            confirmButton = {
                TextButton(
                    enabled = !guardando && errorMotivo == null,
                    onClick = {
                        scope.launch {
                            guardando = true
                            error = null
                            try {
                                withContext(Dispatchers.IO) { repo.pausarActividad(activityId, motivo) }
                                pidiendoMotivo = false
                                onDone("Actividad en pausa")
                            } catch (e: Exception) {
                                error = e.toUserMessage("No se pudo pausar la actividad")
                            } finally {
                                guardando = false
                            }
                        }
                    },
                ) { Text(if (guardando) "Pausando…" else "Pausar") }
            },
            dismissButton = {
                TextButton(enabled = !guardando, onClick = { pidiendoMotivo = false }) { Text("Cancelar") }
            },
        )
    }
}

/**
 * En el día de una persona: su jefe (o el CEO) le pausa una actividad con el reloj
 * corriendo, siempre con motivo. Las que ya están en pausa solo se muestran.
 * Quién lo ve lo decide `puedePausar` de `me/board/:userId`; el API vuelve a validar.
 */
@Composable
fun PausarDeEquipoPanel(
    userId: Long,
    nombre: String?,
    actividades: List<TeamBoardOpenActivityDto>,
    onDone: (String) -> Unit,
    modifier: Modifier = Modifier,
) {
    val conReloj = actividades.filter { it.enCurso == true || it.enPausa == true }
    if (conReloj.isEmpty()) return

    val context = LocalContext.current
    val repo = remember(context) { CoreActivitiesRepository(context) }
    val scope = rememberCoroutineScope()
    var objetivo by remember(userId) { mutableStateOf<TeamBoardOpenActivityDto?>(null) }
    var motivo by remember(userId) { mutableStateOf("") }
    var intento by remember(userId) { mutableStateOf(false) }
    var guardando by remember(userId) { mutableStateOf(false) }
    var error by remember(userId) { mutableStateOf<String?>(null) }

    Column(modifier = modifier.fillMaxWidth(), verticalArrangement = Arrangement.spacedBy(8.dp)) {
        conReloj.forEach { a ->
            val s = a.sesion()
            Column(
                Modifier
                    .fillMaxWidth()
                    .clip(RoundedCornerShape(12.dp))
                    .background(NxColors.Surface)
                    .border(1.dp, NxUi.Border, RoundedCornerShape(12.dp))
                    .padding(10.dp),
                verticalArrangement = Arrangement.spacedBy(6.dp),
            ) {
                Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                    Text(
                        listOfNotNull(a.anNumber?.takeIf { it.isNotBlank() }, a.titulo?.takeIf { it.isNotBlank() })
                            .joinToString(" · ")
                            .ifBlank { "Actividad #${a.id}" },
                        fontSize = 13.sp,
                        fontWeight = FontWeight.SemiBold,
                        color = NxColors.Slate,
                        modifier = Modifier.weight(1f),
                        maxLines = 2,
                    )
                    if (a.enPausa == true) {
                        ToneChip("En pausa", CoreActivityRules.NARANJA)
                    } else {
                        ToneChip("Reloj corriendo", CoreActivityRules.VERDE)
                    }
                }
                SesionActividadRules.textoPausa(s, propia = false)?.let {
                    Text(it, fontSize = 12.sp, color = NxColors.Muted)
                }
                if (SesionActividadRules.puedePausar(s, a.estatus)) {
                    OutlinedButton(
                        onClick = { objetivo = a; motivo = ""; intento = false; error = null },
                        modifier = Modifier.heightIn(min = 44.dp),
                    ) { Text("Pausar", fontWeight = FontWeight.Bold) }
                }
            }
        }
    }

    objetivo?.let { a ->
        val errorMotivo = SesionActividadRules.errorMotivoPausa(motivo)
        AlertDialog(
            onDismissRequest = { if (!guardando) objetivo = null },
            title = { Text("Pausar actividad") },
            text = {
                Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    Text(
                        "Se detiene el reloj de ${SesionActividadRules.primerNombre(nombre).ifBlank { "esta persona" }} " +
                            "en «${a.titulo?.takeIf { it.isNotBlank() } ?: "la actividad"}». Le llega un aviso con tu motivo.",
                        fontSize = 13.sp,
                    )
                    OutlinedTextField(
                        value = motivo,
                        onValueChange = { motivo = it.take(SesionActividadRules.MOTIVO_PAUSA_MAX + 20) },
                        label = { Text("¿Por qué la pausas? *") },
                        placeholder = { Text(SesionActividadRules.PLACEHOLDER_MOTIVO_JEFE) },
                        isError = intento && errorMotivo != null,
                        supportingText = if (intento && errorMotivo != null) {
                            { Text(errorMotivo) }
                        } else {
                            null
                        },
                        minLines = 3,
                        modifier = Modifier.fillMaxWidth(),
                    )
                    error?.let { Text(it, fontSize = 12.5.sp, color = Color(CoreActivityRules.ROJO)) }
                }
            },
            confirmButton = {
                TextButton(
                    enabled = !guardando,
                    onClick = {
                        intento = true
                        if (errorMotivo != null) return@TextButton
                        scope.launch {
                            guardando = true
                            error = null
                            try {
                                withContext(Dispatchers.IO) {
                                    repo.pausarActividadDeEquipo(userId, a.id, motivo)
                                }
                                objetivo = null
                                onDone(SesionActividadRules.avisoPausaDeEquipo(nombre))
                            } catch (e: Exception) {
                                error = e.toUserMessage("No se pudo pausar la actividad")
                            } finally {
                                guardando = false
                            }
                        }
                    },
                ) { Text(if (guardando) "Pausando…" else "Pausar") }
            },
            dismissButton = {
                TextButton(enabled = !guardando, onClick = { objetivo = null }) { Text("Cancelar") }
            },
        )
    }
}
