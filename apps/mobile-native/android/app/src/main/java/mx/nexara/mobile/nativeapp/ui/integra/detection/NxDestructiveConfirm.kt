package mx.nexara.mobile.nativeapp.ui.integra.detection

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.window.Dialog
import mx.nexara.mobile.nativeapp.data.integra.detection.DestructiveImpact
import mx.nexara.mobile.nativeapp.ui.enterprise.NxColors
import mx.nexara.mobile.nativeapp.ui.enterprise.NxDimens

/**
 * Confirmación de una acción con consecuencias, dicha con todas las letras.
 *
 * No es el diálogo genérico del sistema y no lo puede ser: el genérico enseña
 * un «¿Estás seguro?» sin nombre, sin cifras y con los dos botones iguales, y
 * en este proyecto ya hubo un precedente caro —en la web, pulsar un pin del
 * plano lo borraba sin preguntar, y el `window.confirm` de Ajustes no decía ni
 * qué sitio era—. Aquí:
 *
 * - El título nombra la acción; el cuerpo dice **qué se pierde**, con cifras.
 * - El botón destructivo va en rojo y **no** es el que queda bajo el pulgar por
 *   defecto; «Cancelar» va primero.
 * - Cuando [DestructiveImpact.requiresTyping] trae texto, hay que teclearlo
 *   para habilitar el botón. Un borrado de sitio no se hace con un roce.
 *
 * Se cierra tocando fuera o «Cancelar», nunca al confirmar a medias.
 */
@Composable
fun NxDestructiveConfirm(
    impact: DestructiveImpact,
    busy: Boolean = false,
    danger: Boolean = true,
    onDismiss: () -> Unit,
    onConfirm: () -> Unit,
) {
    var typed by remember(impact.title, impact.requiresTyping) { mutableStateOf("") }
    val needsTyping = impact.requiresTyping?.takeIf { it.isNotBlank() }
    val canConfirm = !busy && (needsTyping == null || typed.trim().equals(needsTyping, ignoreCase = true))
    val accent = if (danger) NxColors.Danger else NxColors.Teal

    Dialog(onDismissRequest = { if (!busy) onDismiss() }) {
        Card(
            modifier = Modifier.fillMaxWidth(),
            shape = RoundedCornerShape(NxDimens.PanelRadius),
            colors = CardDefaults.cardColors(containerColor = NxColors.Card),
        ) {
            Column(
                Modifier.padding(18.dp),
                verticalArrangement = Arrangement.spacedBy(12.dp),
            ) {
                Text(
                    impact.title,
                    style = MaterialTheme.typography.titleMedium.copy(fontWeight = FontWeight.Bold),
                    color = accent,
                )
                Text(
                    impact.message,
                    style = MaterialTheme.typography.bodyMedium,
                    color = NxColors.Slate,
                )
                if (needsTyping != null) {
                    Text(
                        "Escribe «$needsTyping» para confirmar.",
                        style = MaterialTheme.typography.labelMedium,
                        color = NxColors.Muted,
                    )
                    OutlinedTextField(
                        value = typed,
                        onValueChange = { typed = it },
                        modifier = Modifier.fillMaxWidth(),
                        singleLine = true,
                        enabled = !busy,
                        label = { Text("Nombre del sitio") },
                    )
                }
                Row(
                    Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.spacedBy(8.dp, Alignment.End),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    TextButton(onClick = onDismiss, enabled = !busy) {
                        Text("Cancelar", color = NxColors.Muted)
                    }
                    Button(
                        onClick = onConfirm,
                        enabled = canConfirm,
                        colors = ButtonDefaults.buttonColors(containerColor = accent),
                    ) {
                        Text(if (busy) "Ejecutando…" else impact.confirmLabel)
                    }
                }
            }
        }
    }
}
