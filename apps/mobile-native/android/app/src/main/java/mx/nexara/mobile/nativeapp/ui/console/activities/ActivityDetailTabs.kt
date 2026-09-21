package mx.nexara.mobile.nativeapp.ui.console.activities

import android.util.Base64
import androidx.compose.foundation.background
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import mx.nexara.mobile.nativeapp.data.api.ActivityDto
import mx.nexara.mobile.nativeapp.data.api.ActivityEvidenceDetailDto
import mx.nexara.mobile.nativeapp.data.api.ActivityIncidentDto
import mx.nexara.mobile.nativeapp.data.api.ActivityRecommendationDto
import mx.nexara.mobile.nativeapp.data.api.toUserMessage
import mx.nexara.mobile.nativeapp.data.console.ConsoleRepository
import mx.nexara.mobile.nativeapp.ui.common.CapturedMedia
import mx.nexara.mobile.nativeapp.ui.common.MediaPickerBar
import mx.nexara.mobile.nativeapp.ui.enterprise.NxEmptyState
import mx.nexara.mobile.nativeapp.ui.enterprise.NxFormTextField
import mx.nexara.mobile.nativeapp.ui.enterprise.NxLoadingBlock
import mx.nexara.mobile.nativeapp.ui.enterprise.NxPanelShell
import mx.nexara.mobile.nativeapp.ui.enterprise.NxSectionHeader
@Composable
fun ActivityInfoTab(
    a: ActivityDto,
    statusColor: Color,
    canEdit: Boolean = false,
    editing: Boolean = false,
    saving: Boolean = false,
    saveError: String? = null,
    editEstatus: String = a.estatus,
    editPrioridad: String = "",
    editDescripcion: String = "",
    editIndicaciones: String = "",
    editFechaInicio: String = "",
    editFechaEntrega: String = "",
    editFechaFin: String = "",
    showManagerFields: Boolean = true,
    onStartEdit: () -> Unit = {},
    onCancelEdit: () -> Unit = {},
    onEstatusChange: (String) -> Unit = {},
    onPrioridadChange: (String) -> Unit = {},
    onDescripcionChange: (String) -> Unit = {},
    onIndicacionesChange: (String) -> Unit = {},
    onFechaInicioChange: (String) -> Unit = {},
    onFechaEntregaChange: (String) -> Unit = {},
    onFechaFinChange: (String) -> Unit = {},
    onSave: () -> Unit = {},
    /** Bloque extra al final del detalle (p. ej. resumen de evidencias del equipo). */
    extraContent: (@Composable () -> Unit)? = null,
    /** Bloque arriba de todo (comenzar la actividad, semáforo: contrato B). */
    topContent: (@Composable () -> Unit)? = null,
) {
    LazyColumn(contentPadding = PaddingValues(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
        if (topContent != null) {
            item { topContent() }
        }
        item {
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween, verticalAlignment = Alignment.CenterVertically) {
                Box(Modifier.clip(RoundedCornerShape(20.dp)).background(statusColor.copy(alpha = 0.13f)).padding(horizontal = 10.dp, vertical = 4.dp)) {
                    Text(a.estatus.ifBlank { "Sin estado" }, color = statusColor, fontWeight = FontWeight.Bold, fontSize = 12.sp)
                }
                if (canEdit && !editing) {
                    OutlinedButton(onClick = onStartEdit) { Text("Editar") }
                }
            }
        }
        if (editing) {
            item {
                NxPanelShell {
                    NxSectionHeader("Estado y prioridad")
                    Row(Modifier.horizontalScroll(rememberScrollState()), horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                        ACTIVITY_STATUSES.forEach { st ->
                            FilterChip(
                                selected = editEstatus == st,
                                onClick = { onEstatusChange(st) },
                                label = { Text(st.replace('_', ' '), style = MaterialTheme.typography.labelSmall) },
                            )
                        }
                    }
                    if (showManagerFields) {
                        Spacer(Modifier.height(8.dp))
                        Text("Prioridad", style = MaterialTheme.typography.labelMedium)
                        Row(Modifier.horizontalScroll(rememberScrollState()), horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                            ACTIVITY_PRIORITIES.forEach { p ->
                                FilterChip(
                                    selected = editPrioridad == p,
                                    onClick = { onPrioridadChange(p) },
                                    label = { Text(p, style = MaterialTheme.typography.labelSmall) },
                                )
                            }
                        }
                    }
                }
            }
            if (showManagerFields) {
                item {
                    NxPanelShell {
                        NxSectionHeader("Detalle")
                        DatePickerField(
                            label = "Entrega esperada",
                            value = editFechaEntrega,
                            onValueChange = onFechaEntregaChange,
                        )
                        Spacer(Modifier.height(8.dp))
                        NxFormTextField(
                            value = editDescripcion,
                            onValueChange = onDescripcionChange,
                            label = "Descripción",
                            singleLine = false,
                            minLines = 2,
                            imeAction = ImeAction.Next,
                        )
                        Spacer(Modifier.height(8.dp))
                        NxFormTextField(
                            value = editIndicaciones,
                            onValueChange = onIndicacionesChange,
                            label = "Indicaciones",
                            singleLine = false,
                            minLines = 2,
                            imeAction = ImeAction.Next,
                        )
                    }
                }
            }
            item {
                NxPanelShell {
                    NxSectionHeader("Programación")
                    DateTimePickerField(
                        label = "Inicio programado",
                        value = editFechaInicio,
                        onValueChange = onFechaInicioChange,
                    )
                    Spacer(Modifier.height(8.dp))
                    DateTimePickerField(
                        label = "Finalización",
                        value = editFechaFin,
                        onValueChange = onFechaFinChange,
                    )
                    if (!saveError.isNullOrBlank()) {
                        Spacer(Modifier.height(8.dp))
                        Text(saveError!!, color = MaterialTheme.colorScheme.error, fontSize = 13.sp)
                    }
                    Spacer(Modifier.height(10.dp))
                    Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        OutlinedButton(onClick = onCancelEdit, modifier = Modifier.weight(1f)) { Text("Cancelar") }
                        Button(
                            onClick = onSave,
                            enabled = !saving && editEstatus.isNotBlank(),
                            modifier = Modifier.weight(1f),
                        ) {
                            Text(if (saving) "Guardando…" else "Guardar")
                        }
                    }
                }
            }
        } else {
            item {
                Card(Modifier.fillMaxWidth(), shape = RoundedCornerShape(12.dp)) {
                    Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                        if (!a.anNumber.isNullOrBlank()) ADetailRow("AN / Folio", a.anNumber!!)
                        ADetailRow("Responsable", a.responsable?.nombre ?: "—")
                        ADetailRow("Creador", a.creador?.nombre ?: "—")
                        if (!a.client?.name.isNullOrBlank()) ADetailRow("Cliente", a.client!!.name!!)
                        val branch = listOfNotNull(a.branchName, a.branchCity, a.branchState).filter { it.isNotBlank() }.joinToString(" · ")
                        if (branch.isNotBlank()) ADetailRow("Sucursal", branch)
                        if (!a.branchAddress.isNullOrBlank()) ADetailRow("Dirección", a.branchAddress!!)
                        if (!a.prioridad.isNullOrBlank()) ADetailRow("Prioridad", a.prioridad!!)
                        if (!a.ticketType.isNullOrBlank()) ADetailRow("Tipo de servicio", a.ticketType!!)
                        ADetailRow("Asignación", a.fechaAsignacion?.take(16)?.replace('T', ' ') ?: "—")
                        ADetailRow("Inicio", a.fechaInicio?.take(16)?.replace('T', ' ') ?: "—")
                        ActivityPeriodo.cuandoTexto(a.periodo, null)?.let { ADetailRow("Periodo", it) }
                        ADetailRow("Entrega esperada", a.fechaEntregaEsperada?.take(10) ?: "—")
                        ADetailRow("Finalización", a.fechaFinalizacion?.take(16)?.replace('T', ' ') ?: "—")
                    }
                }
            }
            if (!a.descripcion.isNullOrBlank()) {
                item {
                    Card(Modifier.fillMaxWidth(), shape = RoundedCornerShape(12.dp)) {
                        Column(Modifier.padding(16.dp)) {
                            Text("Descripción", fontWeight = FontWeight.SemiBold, fontSize = 13.sp)
                            Spacer(Modifier.height(4.dp))
                            Text(a.descripcion!!, fontSize = 13.sp)
                        }
                    }
                }
            }
            if (!a.indicaciones.isNullOrBlank()) {
                item {
                    Card(Modifier.fillMaxWidth(), shape = RoundedCornerShape(12.dp)) {
                        Column(Modifier.padding(16.dp)) {
                            Text("Indicaciones", fontWeight = FontWeight.SemiBold, fontSize = 13.sp)
                            Spacer(Modifier.height(4.dp))
                            Text(a.indicaciones!!, fontSize = 13.sp)
                        }
                    }
                }
            }
            if (extraContent != null) {
                item { extraContent() }
            }
        }
    }
}
