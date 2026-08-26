package mx.nexara.mobile.nativeapp.ui.ventas



import androidx.compose.foundation.layout.*

import androidx.compose.foundation.rememberScrollState

import androidx.compose.foundation.verticalScroll

import androidx.compose.material3.*

import androidx.compose.runtime.*

import androidx.compose.ui.Modifier

import androidx.compose.ui.graphics.Color

import androidx.compose.ui.text.font.FontWeight

import androidx.compose.ui.text.input.ImeAction

import androidx.compose.ui.text.input.KeyboardType

import androidx.compose.ui.unit.dp

import mx.nexara.mobile.nativeapp.ui.enterprise.NxFormTextField

import mx.nexara.mobile.nativeapp.ui.enterprise.NxPanelShell

import mx.nexara.mobile.nativeapp.ui.enterprise.NxSectionHeader

import mx.nexara.mobile.nativeapp.ui.enterprise.dateFieldError

import mx.nexara.mobile.nativeapp.ui.enterprise.intRangeFieldError

import mx.nexara.mobile.nativeapp.ui.enterprise.numericFieldError

import mx.nexara.mobile.nativeapp.ui.enterprise.requiredFieldError



val OPPORTUNITY_STAGES = listOf(

    "DISCOVERY" to "Discovery",

    "QUALIFICATION" to "Calificado",

    "PROPOSAL" to "Cotización",

    "NEGOTIATION" to "Negociación",

    "CLOSING" to "Cierre",

    "WON" to "Ganada",

    "LOST" to "Perdida",

)



/** Stage colors aligned with web `PIPELINE_STAGES` in sales-api.ts */

private val PIPELINE_STAGE_COLORS = mapOf(

    "DISCOVERY" to Color(0xFF94A3B8),

    "QUALIFICATION" to Color(0xFF0EA5E9),

    "PROPOSAL" to Color(0xFF6366F1),

    "NEGOTIATION" to Color(0xFFF59E0B),

    "CLOSING" to Color(0xFF10B981),

    "WON" to Color(0xFF22C55E),

    "LOST" to Color(0xFFEF4444),

)



fun pipelineStageColor(stageKey: String): Color {

    val normalized = stageKey.trim().uppercase()

    PIPELINE_STAGE_COLORS[normalized]?.let { return it }

    val byLabel = OPPORTUNITY_STAGES.firstOrNull { it.second.equals(stageKey, ignoreCase = true) }?.first

    return PIPELINE_STAGE_COLORS[byLabel] ?: Color(0xFF10B981)

}



fun pipelineStageLabel(stageKey: String): String {

    val normalized = stageKey.trim().uppercase()

    OPPORTUNITY_STAGES.firstOrNull { it.first == normalized }?.second?.let { return it }

    OPPORTUNITY_STAGES.firstOrNull { it.second.equals(stageKey, ignoreCase = true) }?.second?.let { return it }

    return stageKey.ifBlank { "—" }

}



data class OpportunityFormState(

    val title: String = "",

    val description: String = "",

    val value: String = "",

    val probability: String = "20",

    val stage: String = "DISCOVERY",

    val expectedCloseDate: String = "",

)



fun OpportunityFormState.validate(): Map<String, String> = buildMap {

    requiredFieldError(title, "Título")?.let { put("title", it) }

    numericFieldError(value, "Valor")?.let { put("value", it) }

    intRangeFieldError(probability, 0, 100, "Probabilidad")?.let { put("probability", it) }

    dateFieldError(expectedCloseDate)?.let { put("expectedCloseDate", it) }

}



fun OpportunityFormState.isValid(): Boolean = validate().isEmpty()



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

    val fieldErrors = remember(state) { state.validate() }

    val canSave = state.isValid() && !saving



    ModalBottomSheet(onDismissRequest = onDismiss) {

        Column(

            Modifier.fillMaxWidth().verticalScroll(rememberScrollState())

                .padding(horizontal = 20.dp, vertical = 8.dp),

            verticalArrangement = Arrangement.spacedBy(12.dp),

        ) {

            Text(title, style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold)



            NxPanelShell {

                NxSectionHeader("Información general")

                NxFormTextField(

                    value = state.title,

                    onValueChange = { onChange(state.copy(title = it)) },

                    label = "Título *",

                    error = fieldErrors["title"],

                    imeAction = ImeAction.Next,

                )

                Spacer(Modifier.height(8.dp))

                NxFormTextField(

                    value = state.description,

                    onValueChange = { onChange(state.copy(description = it)) },

                    label = "Descripción",

                    singleLine = false,

                    minLines = 2,

                    imeAction = ImeAction.Next,

                )

            }



            NxPanelShell {

                NxSectionHeader("Valores comerciales")

                NxFormTextField(

                    value = state.value,

                    onValueChange = { onChange(state.copy(value = it)) },

                    label = "Valor (MXN)",

                    error = fieldErrors["value"],

                    keyboardType = KeyboardType.Decimal,

                    imeAction = ImeAction.Next,

                )

                Spacer(Modifier.height(8.dp))

                NxFormTextField(

                    value = state.probability,

                    onValueChange = { onChange(state.copy(probability = it.filter { c -> c.isDigit() })) },

                    label = "Probabilidad %",

                    error = fieldErrors["probability"],

                    keyboardType = KeyboardType.Number,

                    imeAction = ImeAction.Next,

                )

                Spacer(Modifier.height(8.dp))

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

            }



            NxPanelShell {

                NxSectionHeader("Fechas")

                NxFormTextField(

                    value = state.expectedCloseDate,

                    onValueChange = { onChange(state.copy(expectedCloseDate = it)) },

                    label = "Cierre estimado (YYYY-MM-DD)",

                    error = fieldErrors["expectedCloseDate"],

                    keyboardType = KeyboardType.Number,

                    imeAction = ImeAction.Done,

                )

            }



            if (!error.isNullOrBlank()) {

                Text(error, color = MaterialTheme.colorScheme.error, style = MaterialTheme.typography.bodySmall)

            }

            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp)) {

                OutlinedButton(onClick = onDismiss, modifier = Modifier.weight(1f)) { Text("Cancelar") }

                Button(onClick = onSave, enabled = canSave, modifier = Modifier.weight(1f)) {

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

