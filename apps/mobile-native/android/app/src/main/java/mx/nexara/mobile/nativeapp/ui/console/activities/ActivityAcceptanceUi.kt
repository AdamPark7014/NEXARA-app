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
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.launch
import mx.nexara.mobile.nativeapp.data.api.toUserMessage
import mx.nexara.mobile.nativeapp.ui.enterprise.NxColors

/**
 * Comenzar lo que te asignaron (contrato B).
 *
 * Quien la recibe no decide si la acepta: la comienza. Por eso la acción
 * principal dice «Comenzar actividad». La salida es «No puedo tomarla», que
 * sigue llamando al endpoint de rechazo con su motivo.
 *
 * Mientras esté `aceptacion = PENDIENTE` la actividad se puede trabajar igual:
 * esto no bloquea nada, solo deja constancia de que la persona la vio y la
 * comenzó — o de por qué no pudo.
 */
@Composable
fun AceptacionBanner(
    onAceptar: () -> Unit,
    onRechazar: () -> Unit,
    guardando: Boolean,
    modifier: Modifier = Modifier,
    error: String? = null,
) {
    Column(
        modifier = modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(14.dp))
            .background(Color(CoreActivityRules.AZUL).copy(alpha = 0.07f))
            .border(1.dp, Color(CoreActivityRules.AZUL).copy(alpha = 0.3f), RoundedCornerShape(14.dp))
            .padding(12.dp),
        verticalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        Text(
            "Te asignaron esta actividad",
            fontSize = 13.5.sp,
            fontWeight = FontWeight.ExtraBold,
            color = NxColors.Slate,
        )
        Text(
            "Comiénzala para que quien te la asignó sepa que vas. Si de plano no puedes tomarla, dilo con el motivo.",
            fontSize = 12.5.sp,
            color = NxColors.Muted,
        )
        error?.let { Text(it, fontSize = 12.5.sp, color = Color(CoreActivityRules.ROJO)) }
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            Button(
                onClick = onAceptar,
                enabled = !guardando,
                colors = ButtonDefaults.buttonColors(containerColor = Color(CoreActivityRules.VERDE)),
                modifier = Modifier.heightIn(min = 48.dp),
            ) {
                Text(
                    if (guardando) "Guardando…" else ActivitySemaforo.ACCION_COMENZAR,
                    fontWeight = FontWeight.Bold,
                )
            }
            OutlinedButton(
                onClick = onRechazar,
                enabled = !guardando,
                colors = ButtonDefaults.outlinedButtonColors(contentColor = Color(CoreActivityRules.ROJO)),
                modifier = Modifier.heightIn(min = 48.dp),
            ) { Text(ActivitySemaforo.ACCION_NO_PUEDO, fontWeight = FontWeight.SemiBold) }
        }
    }
}

/**
 * «No puedo tomarla»: el motivo es obligatorio (10 caracteres mínimo, como el
 * API) y avisa a los jefes. Por dentro sigue siendo el rechazo de contrato B.
 */
@Composable
fun RechazarActividadDialog(
    titulo: String?,
    onDismiss: () -> Unit,
    onConfirm: suspend (String) -> Unit,
) {
    val scope = rememberCoroutineScope()
    var motivo by remember { mutableStateOf("") }
    var saving by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf<String?>(null) }
    val min = ActivitySemaforo.MIN_MOTIVO_RECHAZO
    val ok = ActivitySemaforo.motivoRechazoOk(motivo)

    AlertDialog(
        onDismissRequest = { if (!saving) onDismiss() },
        title = {
            Column {
                Text(
                    ActivitySemaforo.ACCION_NO_PUEDO.uppercase(),
                    fontSize = 11.sp,
                    fontWeight = FontWeight.ExtraBold,
                    color = NxColors.Muted,
                )
                Text(
                    titulo?.takeIf { it.isNotBlank() } ?: "Esta actividad",
                    fontSize = 17.sp,
                    fontWeight = FontWeight.Bold,
                )
            }
        },
        text = {
            Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
                Text(
                    "Se avisa a quien te la asignó y a tus jefes. La actividad sigue siendo tuya " +
                        "hasta que alguien la pase o la cancele.",
                    fontSize = 12.5.sp,
                    color = NxColors.Muted,
                )
                Text(
                    "¿Sí puedes? Cierra esto y toca «${ActivitySemaforo.ACCION_COMENZAR}».",
                    fontSize = 12.5.sp,
                    color = NxColors.Muted,
                )
                OutlinedTextField(
                    value = motivo,
                    onValueChange = { motivo = it.take(500) },
                    label = { Text("¿Por qué no puedes hacerla? *") },
                    placeholder = { Text("Ej. Estoy en otra sucursal hasta mañana.") },
                    minLines = 3,
                    enabled = !saving,
                    modifier = Modifier.fillMaxWidth(),
                )
                Text(
                    "${ActivitySemaforo.motivoLimpio(motivo).length}/$min caracteres mínimo",
                    fontSize = 11.5.sp,
                    color = if (ok) NxColors.Muted else Color(CoreActivityRules.ROJO),
                )
                error?.let { Text(it, fontSize = 13.sp, color = Color(CoreActivityRules.ROJO)) }
            }
        },
        confirmButton = {
            Button(
                onClick = {
                    scope.launch {
                        saving = true
                        error = null
                        try {
                            onConfirm(ActivitySemaforo.motivoLimpio(motivo))
                        } catch (e: CancellationException) {
                            throw e
                        } catch (e: Exception) {
                            error = e.toUserMessage("No se pudo enviar tu motivo")
                        } finally {
                            saving = false
                        }
                    }
                },
                enabled = ok && !saving,
                colors = ButtonDefaults.buttonColors(containerColor = Color(CoreActivityRules.ROJO)),
            ) { Text(if (saving) "Enviando…" else "Enviar motivo") }
        },
        dismissButton = {
            TextButton(onClick = onDismiss, enabled = !saving) { Text("Cancelar") }
        },
    )
}
