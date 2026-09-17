package mx.nexara.mobile.nativeapp.ui.console.activities

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.sp
import androidx.compose.ui.unit.dp
import mx.nexara.mobile.nativeapp.ui.enterprise.NxColors

/**
 * «Vas a empezar esta y tienes otra de más prioridad» (contrato B).
 *
 * Es un aviso suave: el botón principal continúa **siempre**, con o sin
 * texto. Lo que se escriba viaja como `justificacionOrden` con la foto de
 * entrada; el servidor marca `saltoPrioridad` y avisa a los jefes, pero no
 * bloquea a nadie — quien está en campo sabrá por qué lo hace.
 */
@Composable
fun JustificarOrdenDialog(
    aviso: String,
    onDismiss: () -> Unit,
    onContinuar: (String?) -> Unit,
) {
    var justificacion by remember { mutableStateOf("") }

    AlertDialog(
        onDismissRequest = onDismiss,
        title = {
            Column {
                Text("ORDEN DE TUS ACTIVIDADES", fontSize = 11.sp, fontWeight = FontWeight.ExtraBold, color = NxColors.Muted)
                Text("¿Empiezas esta?", fontSize = 17.sp, fontWeight = FontWeight.Bold)
            }
        },
        text = {
            Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                Text(aviso, fontSize = 13.5.sp, color = NxColors.Slate)
                Text(
                    "Puedes seguir sin escribir nada. Si dices por qué, queda guardado junto a la " +
                        "actividad y tus jefes lo ven.",
                    fontSize = 12.5.sp,
                    color = NxColors.Muted,
                )
                OutlinedTextField(
                    value = justificacion,
                    onValueChange = { justificacion = it.take(500) },
                    label = { Text("¿Por qué esta primero? (opcional)") },
                    placeholder = { Text("Ej. Ya estoy en el sitio y la otra es hasta la tarde.") },
                    minLines = 2,
                    modifier = Modifier.fillMaxWidth(),
                )
            }
        },
        confirmButton = {
            Button(
                onClick = { onContinuar(justificacion.trim().takeIf { it.isNotEmpty() }) },
                colors = ButtonDefaults.buttonColors(containerColor = NxColors.Brand),
            ) { Text("Continuar", fontWeight = FontWeight.Bold) }
        },
        dismissButton = {
            TextButton(onClick = onDismiss) { Text("Mejor no") }
        },
    )
}
