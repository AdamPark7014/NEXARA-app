package mx.nexara.mobile.nativeapp.ui.ventas

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp

val OPPORTUNITY_STAGES = listOf(
    "DISCOVERY" to "Discovery",
    "QUALIFICATION" to "Calificado",
    "PROPOSAL" to "Cotización",
    "NEGOTIATION" to "Negociación",
    "CLOSING" to "Cierre",
    "WON" to "Ganada",
    "LOST" to "Perdida",
)

data class OpportunityFormState(
    val title: String = "",
    val description: String = "",
    val value: String = "",
    val probability: String = "20",
    val stage: String = "DISCOVERY",
    val expectedCloseDate: String = "",
)

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun OpportunityFormSheet(
    title: String,
    state: OpportunityFormState,
    onChange: (OpportunityFormState) -> Unit,
    saving: Boolean,
    error: String?,
    onDismiss: () -> Unit,
    onSave: () -> Unit,
) {
    ModalBottomSheet(onDismissRequest = onDismiss) {
        Column(
            Modifier.fillMaxWidth().verticalScroll(rememberScrollState())
                .padding(horizontal = 20.dp, vertical = 8.dp),
            verticalArrangement = Arrangement.spacedBy(10.dp),
        ) {
            Text(title, style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold)
            OutlinedTextField(
                state.title,
                { onChange(state.copy(title = it)) },
                label = { Text("Título *") },
                modifier = Modifier.fillMaxWidth(),
                singleLine = true,
            )
            OutlinedTextField(
                state.description,
                { onChange(state.copy(description = it)) },
                label = { Text("Descripción") },
                modifier = Modifier.fillMaxWidth(),
                minLines = 2,
            )
            OutlinedTextField(
                state.value,
                { onChange(state.copy(value = it)) },
                label = { Text("Valor (MXN)") },
                modifier = Modifier.fillMaxWidth(),
                singleLine = true,
            )
            OutlinedTextField(
                state.probability,
                { onChange(state.copy(probability = it)) },
                label = { Text("Probabilidad %") },
                modifier = Modifier.fillMaxWidth(),
                singleLine = true,
            )
            var stageExpanded by remember { mutableStateOf(false) }
            ExposedDropdownMenuBox(expanded = stageExpanded, onExpandedChange = { stageExpanded = it }) {
                OutlinedTextField(
                    OPPORTUNITY_STAGES.firstOrNull { it.first == state.stage }?.second ?: state.stage,
                    {},
                    readOnly = true,
                    label = { Text("Etapa") },
                    modifier = Modifier.menuAnchor().fillMaxWidth(),
                    trailingIcon = { ExposedDropdownMenuDefaults.TrailingIcon(stageExpanded) },
                )
                ExposedDropdownMenu(expanded = stageExpanded, onDismissRequest = { stageExpanded = false }) {
                    OPPORTUNITY_STAGES.forEach { (id, label) ->
                        DropdownMenuItem(
                            text = { Text(label) },
                            onClick = { onChange(state.copy(stage = id)); stageExpanded = false },
                        )
                    }
                }
            }
            OutlinedTextField(
                state.expectedCloseDate,
                { onChange(state.copy(expectedCloseDate = it)) },
                label = { Text("Cierre estimado (YYYY-MM-DD)") },
                modifier = Modifier.fillMaxWidth(),
                singleLine = true,
            )
            if (!error.isNullOrBlank()) {
                Text(error, color = MaterialTheme.colorScheme.error, style = MaterialTheme.typography.bodySmall)
            }
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                OutlinedButton(onClick = onDismiss, modifier = Modifier.weight(1f)) { Text("Cancelar") }
                Button(onClick = onSave, enabled = !saving, modifier = Modifier.weight(1f)) {
                    if (saving) CircularProgressIndicator(Modifier.size(18.dp), strokeWidth = 2.dp)
                    else Text("Guardar")
                }
            }
            Spacer(Modifier.height(24.dp))
        }
    }
}

fun OpportunityFormState.toPayload(): Map<String, Any?> = buildMap {
    put("title", title.trim())
    if (description.isNotBlank()) put("description", description.trim())
    value.toDoubleOrNull()?.let { put("value", it) }
    probability.toIntOrNull()?.let { put("probability", it) }
    put("stage", stage)
    if (expectedCloseDate.isNotBlank()) put("expectedCloseDate", expectedCloseDate.trim())
}

fun Map<String, Any?>.toOpportunityFormState(): OpportunityFormState = OpportunityFormState(
    title = this["title"]?.toString()?.takeIf { it != "null" } ?: "",
    description = this["description"]?.toString()?.takeIf { it != "null" } ?: "",
    value = (this["value"] as? Number)?.toString() ?: "",
    probability = (this["probability"] as? Number)?.toString() ?: "20",
    stage = this["stage"]?.toString()?.takeIf { it != "null" } ?: "DISCOVERY",
    expectedCloseDate = this["expectedCloseDate"]?.toString()?.takeIf { it != "null" } ?: "",
)
