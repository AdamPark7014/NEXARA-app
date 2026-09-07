package mx.nexara.mobile.nativeapp.ui.integra.common

import androidx.activity.compose.BackHandler
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FilterChip
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.window.DialogProperties
import mx.nexara.mobile.nativeapp.data.integra.IntegraSiteScope
import mx.nexara.mobile.nativeapp.ui.enterprise.NxColors
import mx.nexara.mobile.nativeapp.ui.enterprise.NxStatusChip
import mx.nexara.mobile.nativeapp.ui.enterprise.NxTone

/** Etiqueta + valor. No pinta nada si el valor viene vacío. */
@Composable
fun IntegraDetailLine(label: String, value: String) {
    if (value.isBlank() || value == IntegraFormat.EMPTY) return
    Column(Modifier.fillMaxWidth().padding(vertical = 2.dp)) {
        Text(label, style = MaterialTheme.typography.labelMedium, color = NxColors.Muted)
        Text(value, style = MaterialTheme.typography.bodyLarge, color = NxColors.Slate)
    }
}

/** Aviso en línea, para las notas que manda el propio servidor. */
@Composable
fun IntegraNotice(text: String, tone: NxTone = NxTone.Neutral) {
    if (text.isBlank()) return
    Card(
        modifier = Modifier.fillMaxWidth(),
        colors = CardDefaults.cardColors(containerColor = NxColors.Card),
    ) {
        Row(Modifier.padding(12.dp), verticalAlignment = Alignment.Top) {
            NxStatusChip("Nota", tone)
            Spacer(Modifier.fillMaxWidth(0.02f))
            Text(
                text,
                style = MaterialTheme.typography.bodySmall,
                color = NxColors.Muted,
                modifier = Modifier.padding(start = 8.dp),
            )
        }
    }
}

/** Mensaje de resultado de una operación: verde si fue bien, rojo si no. */
@Composable
fun IntegraOpMessage(message: String?, isError: Boolean) {
    if (message.isNullOrBlank()) return
    Text(
        message,
        style = MaterialTheme.typography.bodySmall,
        color = if (isError) NxColors.Danger else NxColors.Success,
        modifier = Modifier.fillMaxWidth().padding(vertical = 4.dp),
    )
}

/**
 * Selector del sitio INTEGRA activo.
 *
 * Con un solo sitio se pinta como texto: un desplegable de una opción es ruido.
 * Con ninguno se dice qué pasa, en vez de callar y usar en silencio el
 * predeterminado del servidor.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun IntegraSiteBar(
    sites: List<Map<String, Any?>>,
    loading: Boolean,
    onSelect: (Int?) -> Unit,
) {
    val selected by IntegraSiteScope.selected.collectAsState()
    var open by remember { mutableStateOf(false) }

    val current = sites.firstOrNull { int(it, "id") == selected }
        ?: sites.firstOrNull { bool(it, "isDefault") == true }
        ?: sites.firstOrNull()
    val nombre = current?.let { str(it, "label", "name") }.orEmpty()

    Row(
        Modifier.fillMaxWidth().padding(bottom = 4.dp),
        horizontalArrangement = Arrangement.SpaceBetween,
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Column(Modifier.weight(1f)) {
            Text("Sitio", style = MaterialTheme.typography.labelSmall, color = NxColors.Muted)
            Text(
                when {
                    loading && sites.isEmpty() -> "Cargando sitios…"
                    sites.isEmpty() -> "Sin sitios configurados"
                    else -> nombre.ifBlank { "Sitio ${current?.let { int(it, "id") } ?: ""}" }
                },
                style = MaterialTheme.typography.titleSmall.copy(fontWeight = FontWeight.SemiBold),
                color = NxColors.Slate,
            )
            current?.let {
                Text(
                    "${providerLabel(str(it, "provider"))} · ${str(it, "host")}",
                    style = MaterialTheme.typography.labelSmall,
                    color = NxColors.Muted,
                )
            }
        }
        if (sites.size > 1) {
            Box {
                OutlinedButton(onClick = { open = true }) { Text("Cambiar") }
                DropdownMenu(expanded = open, onDismissRequest = { open = false }) {
                    sites.forEach { s ->
                        val id = int(s, "id")
                        val c = subMap(s, "_count")
                        val extra = c?.let {
                            " · ${str(it, "cameras")}c/${str(it, "doors")}p"
                        }.orEmpty()
                        DropdownMenuItem(
                            text = { Text(str(s, "label", "name") + extra) },
                            onClick = {
                                open = false
                                onSelect(id)
                            },
                        )
                    }
                }
            }
        }
    }
}

/**
 * Confirmación de una orden de puerta.
 *
 * Abrir una puerta es una acción física en el mundo real, así que:
 *
 *  - Se lee **a dónde** va la orden antes que los controles. Abrir la puerta
 *    equivocada es un incidente de seguridad, no una molestia.
 *  - Las dos órdenes que franquean el paso van marcadas en rojo.
 *  - El motivo es obligatorio (mínimo tres caracteres) y queda en la auditoría.
 *  - **Mientras la orden está en vuelo el diálogo no se puede cerrar**: ni
 *    tocando fuera, ni con el botón atrás. En la web, `Esc` cerraba el diálogo
 *    con la orden ya enviada y el operador se quedaba sin saber qué había
 *    pasado. Aquí el botón atrás se traga mientras `sending` esté activo.
 *  - Confirmar queda deshabilitado en cuanto se pulsa, así que un doble toque
 *    no manda dos órdenes.
 */
@OptIn(ExperimentalLayoutApi::class)
@Composable
fun DoorControlDialog(
    doorName: String,
    doorId: String,
    doorLocation: String,
    doorStateLabel: String,
    siteName: String,
    control: DoorControl,
    reason: String,
    sending: Boolean,
    error: String?,
    onControlChange: (DoorControl) -> Unit,
    onReasonChange: (String) -> Unit,
    onConfirm: () -> Unit,
    onDismiss: () -> Unit,
) {
    // El botón atrás no cancela una orden que ya salió.
    BackHandler(enabled = sending) { /* deliberadamente vacío */ }

    val puedeConfirmar = motivoValido(reason) && !sending

    AlertDialog(
        onDismissRequest = { if (!sending) onDismiss() },
        properties = DialogProperties(
            dismissOnBackPress = !sending,
            dismissOnClickOutside = !sending,
        ),
        title = { Text("Vas a accionar una puerta") },
        text = {
            Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                Text(
                    doorName.ifBlank { doorId },
                    style = MaterialTheme.typography.titleMedium.copy(fontWeight = FontWeight.Bold),
                    color = NxColors.Slate,
                )
                val destino = listOf(doorLocation, siteName)
                    .filter { it.isNotBlank() }
                    .joinToString(" · ")
                if (destino.isNotBlank()) {
                    Text(destino, style = MaterialTheme.typography.bodySmall, color = NxColors.Muted)
                }
                Text(
                    "Ahora: $doorStateLabel · ID $doorId",
                    style = MaterialTheme.typography.labelSmall,
                    color = NxColors.Muted,
                )

                Text("Acción", style = MaterialTheme.typography.labelMedium, color = NxColors.Muted)
                FlowRow(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                    DoorControl.ordenUi.forEach { opt ->
                        FilterChip(
                            selected = opt == control,
                            onClick = { if (!sending) onControlChange(opt) },
                            enabled = !sending,
                            label = { Text(opt.label) },
                        )
                    }
                }
                if (control.franqueaPaso) {
                    Text(
                        "Esta acción franquea el paso físico.",
                        style = MaterialTheme.typography.labelSmall,
                        color = NxColors.Danger,
                    )
                }

                OutlinedTextField(
                    value = reason,
                    onValueChange = onReasonChange,
                    modifier = Modifier.fillMaxWidth(),
                    label = { Text("Motivo") },
                    placeholder = { Text("Ej. visita autorizada, mantenimiento, emergencia…") },
                    minLines = 2,
                    enabled = !sending,
                    isError = reason.isNotEmpty() && !motivoValido(reason),
                )
                Text(
                    "Mínimo $MOTIVO_MINIMO caracteres. Queda en la auditoría junto a tu usuario.",
                    style = MaterialTheme.typography.labelSmall,
                    color = NxColors.Muted,
                )
                if (!error.isNullOrBlank()) {
                    Text(error, style = MaterialTheme.typography.bodySmall, color = NxColors.Danger)
                }
                if (sending) {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        CircularProgressIndicator(Modifier.height(16.dp))
                        Text(
                            "  Orden enviada. No cierres esta ventana.",
                            style = MaterialTheme.typography.labelSmall,
                            color = NxColors.Muted,
                        )
                    }
                }
            }
        },
        confirmButton = {
            Button(
                onClick = onConfirm,
                enabled = puedeConfirmar,
                colors = if (control.franqueaPaso) {
                    ButtonDefaults.buttonColors(containerColor = NxColors.Danger)
                } else {
                    ButtonDefaults.buttonColors()
                },
            ) {
                Text(if (sending) "Enviando…" else "Confirmar · ${control.label}")
            }
        },
        dismissButton = {
            TextButton(onClick = onDismiss, enabled = !sending) { Text("Cancelar") }
        },
    )
}

/**
 * Confirmación genérica para acciones que no se pueden deshacer.
 *
 * Mismo contrato que la de puertas en lo que importa: mientras la acción está en
 * vuelo no se cierra sola y el botón no admite un segundo toque.
 */
@Composable
fun IntegraConfirmDialog(
    title: String,
    message: String,
    confirmLabel: String,
    sending: Boolean,
    danger: Boolean = true,
    onConfirm: () -> Unit,
    onDismiss: () -> Unit,
) {
    BackHandler(enabled = sending) { /* deliberadamente vacío */ }
    AlertDialog(
        onDismissRequest = { if (!sending) onDismiss() },
        properties = DialogProperties(
            dismissOnBackPress = !sending,
            dismissOnClickOutside = !sending,
        ),
        title = { Text(title) },
        text = { Text(message, style = MaterialTheme.typography.bodyMedium) },
        confirmButton = {
            Button(
                onClick = onConfirm,
                enabled = !sending,
                colors = if (danger) {
                    ButtonDefaults.buttonColors(containerColor = NxColors.Danger)
                } else {
                    ButtonDefaults.buttonColors()
                },
            ) {
                Text(if (sending) "Enviando…" else confirmLabel)
            }
        },
        dismissButton = {
            TextButton(onClick = onDismiss, enabled = !sending) { Text("Cancelar") }
        },
    )
}

/**
 * Selector de una opción entre muchas.
 *
 * Con dos regiones o cuatro tipos, una fila de chips va bien; con ciento veinte
 * puertas, no cabe. Esto es el equivalente móvil del `<select>` de la web: dice
 * qué hay elegido sin desplegar nada, y sólo abre la lista al tocarlo.
 */
@Composable
fun IntegraPicker(
    label: String,
    options: List<Pair<String, String>>,
    selected: String,
    emptyLabel: String,
    onSelect: (String) -> Unit,
    enabled: Boolean = true,
) {
    var open by remember { mutableStateOf(false) }
    val actual = options.firstOrNull { it.first == selected }?.second ?: emptyLabel
    Column(Modifier.fillMaxWidth()) {
        Text(label, style = MaterialTheme.typography.labelSmall, color = NxColors.Muted)
        Box {
            OutlinedButton(
                onClick = { open = true },
                enabled = enabled && options.isNotEmpty(),
                modifier = Modifier.fillMaxWidth(),
            ) {
                Text(if (options.isEmpty()) "Sin opciones" else actual)
            }
            DropdownMenu(expanded = open, onDismissRequest = { open = false }) {
                DropdownMenuItem(
                    text = { Text(emptyLabel) },
                    onClick = { open = false; onSelect("") },
                )
                options.forEach { (valor, etiqueta) ->
                    DropdownMenuItem(
                        text = { Text(etiqueta) },
                        onClick = { open = false; onSelect(valor) },
                    )
                }
            }
        }
    }
}

/**
 * Pie de lista: cuántas se ven de cuántas hay y cómo pedir más.
 *
 * Cortar una lista en silencio es mentir sobre el inventario. Si hay más, se
 * dice y se ofrece traerlas.
 */
@Composable
fun IntegraShowingCount(
    shown: Int,
    matching: Int,
    total: Int,
    noun: String,
    loading: Boolean = false,
    onMore: (() -> Unit)? = null,
) {
    Column(Modifier.fillMaxWidth().padding(vertical = 8.dp)) {
        Text(
            buildString {
                append("Mostrando $shown de $matching $noun")
                if (matching != total && total > 0) append(" · $total cargadas sin filtro")
            },
            style = MaterialTheme.typography.labelSmall,
            color = NxColors.Muted,
        )
        if (onMore != null && shown < matching) {
            OutlinedButton(
                onClick = onMore,
                enabled = !loading,
                modifier = Modifier.fillMaxWidth().padding(top = 6.dp),
            ) {
                Text(if (loading) "Cargando…" else "Ver más")
            }
        }
    }
}
