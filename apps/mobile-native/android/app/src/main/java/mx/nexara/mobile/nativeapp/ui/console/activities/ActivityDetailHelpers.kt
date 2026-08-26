package mx.nexara.mobile.nativeapp.ui.console.activities

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Clear
import androidx.compose.material.icons.filled.DateRange
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import mx.nexara.mobile.nativeapp.ui.enterprise.NxTone
import java.time.Instant
import java.time.LocalDate
import java.time.LocalTime
import java.time.ZoneId
import java.time.format.DateTimeFormatter

internal val ActivStatusColors = mapOf(
    "pendiente" to Color(0xFFF59E0B),
    "en proceso" to Color(0xFF3B82F6),
    "proceso" to Color(0xFF3B82F6),
    "asignada" to Color(0xFF8B5CF6),
    "asignado" to Color(0xFF8B5CF6),
    "finalizada" to Color(0xFF10B981),
    "finalizado" to Color(0xFF10B981),
    "completada" to Color(0xFF10B981),
    "cancelada" to Color(0xFFEF4444),
    "cancelado" to Color(0xFFEF4444),
    "rechazado" to Color(0xFFEF4444),
)

fun activStatusColor(estatus: String): Color {
    val s = estatus.lowercase()
    return ActivStatusColors.entries.firstOrNull { s.contains(it.key) }?.value ?: Color(0xFF64748B)
}

fun activStatusTone(estatus: String): NxTone {
    val s = estatus.lowercase()
    return when {
        s.contains("finaliz") || s.contains("complet") -> NxTone.Success
        s.contains("cancel") || s.contains("rechaz") -> NxTone.Danger
        s.contains("pendiente") -> NxTone.Warning
        s.contains("proceso") || s.contains("curso") -> NxTone.Info
        s.contains("asign") -> NxTone.Brand
        else -> NxTone.Neutral
    }
}

val STATUS_FILTER_OPTIONS = listOf("Todos", "Pendiente", "En proceso", "Asignada", "Finalizada", "Cancelada")

val ACTIVITY_STATUSES = listOf("PROGRAMADA", "EN_CURSO", "COMPLETADA", "REPROGRAMAR", "CANCELADA")
val ACTIVITY_PRIORITIES = listOf("BAJA", "MEDIA", "ALTA", "URGENTE")
val VIATIC_CATEGORIES = listOf(
    "COMBUSTIBLE", "CASETA", "HOSPEDAJE", "ALIMENTACION", "TRANSPORTE", "OTROS",
)

val INCIDENT_TYPES = listOf(
    "ACCESO_DENEGADO", "FALTA_MATERIAL", "FALLA_EQUIPO", "CONDICION_INSEGURA", "CLIMA",
    "ALCANCE_ADICIONAL", "RETRASO_CLIENTE", "DANO_INSTALACION", "OTRO",
)
val INCIDENT_SEVERITIES = listOf("BAJA", "MEDIA", "ALTA", "CRITICA")
val RECOMMENDATION_TYPES = listOf(
    "CORRECTIVO", "PREVENTIVO", "MEJORA", "ACTUALIZACION", "CAPACITACION", "AMPLIACION",
)
val RECOMMENDATION_PRIORITIES = listOf("BAJA", "MEDIA", "ALTA", "URGENTE")

val INCIDENT_TYPE_LABEL = mapOf(
    "ACCESO_DENEGADO" to "No dieron acceso",
    "FALTA_MATERIAL" to "Faltó material",
    "FALLA_EQUIPO" to "Falló el equipo",
    "CONDICION_INSEGURA" to "Condición insegura",
    "CLIMA" to "Clima",
    "ALCANCE_ADICIONAL" to "Alcance adicional",
    "RETRASO_CLIENTE" to "Retraso del cliente",
    "DANO_INSTALACION" to "Daño en la instalación",
    "OTRO" to "Otro",
)
val SEVERITY_LABEL = mapOf("BAJA" to "Baja", "MEDIA" to "Media", "ALTA" to "Alta", "CRITICA" to "Crítica")
val RECOMMENDATION_TYPE_LABEL = mapOf(
    "CORRECTIVO" to "Correctivo",
    "PREVENTIVO" to "Preventivo",
    "MEJORA" to "Mejora",
    "ACTUALIZACION" to "Actualización",
    "CAPACITACION" to "Capacitación",
    "AMPLIACION" to "Ampliación",
)
val PRIORITY_LABEL = mapOf("BAJA" to "Baja", "MEDIA" to "Media", "ALTA" to "Alta", "URGENTE" to "Urgente")
val RECOMMENDATION_STATUS_LABEL = mapOf(
    "ABIERTA" to "Abierta",
    "COTIZADA" to "Cotizada",
    "ACEPTADA" to "Aceptada",
    "RECHAZADA" to "Rechazada",
    "DESCARTADA" to "Descartada",
)
val SEVERITY_COLOR = mapOf(
    "BAJA" to Color(0xFF64748B),
    "MEDIA" to Color(0xFFCA8A04),
    "ALTA" to Color(0xFFEA580C),
    "CRITICA" to Color(0xFFDC2626),
)

fun matchesFilter(estatus: String, filter: String): Boolean {
    if (filter == "Todos") return true
    return estatus.lowercase().contains(filter.lowercase())
}

fun toIsoDateTime(local: String): String {
    if (local.endsWith("Z")) return local
    return if (local.contains("T")) "${local}Z" else "${local}T12:00:00.000Z"
}

internal val ISO_DATE_FMT: DateTimeFormatter = DateTimeFormatter.ISO_LOCAL_DATE
internal val ISO_DATE_TIME_FMT: DateTimeFormatter = DateTimeFormatter.ofPattern("yyyy-MM-dd'T'HH:mm")
internal val DISPLAY_DATE_TIME_FMT: DateTimeFormatter = DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm")

internal fun parseIsoLocalDate(value: String): LocalDate? = runCatching {
    if (value.isBlank()) null else LocalDate.parse(value.take(10), ISO_DATE_FMT)
}.getOrNull()

internal fun parseIsoLocalDateTime(value: String): Pair<LocalDate, LocalTime>? = runCatching {
    if (value.isBlank()) return null
    if (value.contains("T") && value.length >= 16) {
        val date = LocalDate.parse(value.take(10), ISO_DATE_FMT)
        val time = LocalTime.parse(value.substring(11, 16))
        date to time
    } else if (value.length >= 10) {
        LocalDate.parse(value.take(10), ISO_DATE_FMT) to LocalTime.of(12, 0)
    } else {
        null
    }
}.getOrNull()

internal fun LocalDate.toPickerMillis(): Long =
    atStartOfDay(ZoneId.systemDefault()).toInstant().toEpochMilli()

internal fun millisToLocalDate(millis: Long): LocalDate =
    Instant.ofEpochMilli(millis).atZone(ZoneId.systemDefault()).toLocalDate()

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun DatePickerField(
    label: String,
    value: String,
    onValueChange: (String) -> Unit,
    modifier: Modifier = Modifier,
) {
    var showPicker by remember { mutableStateOf(false) }
    val display = value.takeIf { it.isNotBlank() }?.take(10) ?: ""

    OutlinedTextField(
        value = display,
        onValueChange = {},
        readOnly = true,
        label = { Text(label) },
        placeholder = { Text("Seleccionar fecha") },
        modifier = modifier
            .fillMaxWidth()
            .clickable { showPicker = true },
        trailingIcon = {
            Row {
                if (value.isNotBlank()) {
                    IconButton(onClick = { onValueChange("") }) {
                        Icon(Icons.Default.Clear, contentDescription = "Limpiar")
                    }
                }
                Icon(Icons.Default.DateRange, contentDescription = "Seleccionar fecha")
            }
        },
    )

    if (showPicker) {
        val datePickerState = rememberDatePickerState(
            initialSelectedDateMillis = (parseIsoLocalDate(value) ?: LocalDate.now()).toPickerMillis(),
        )
        DatePickerDialog(
            onDismissRequest = { showPicker = false },
            confirmButton = {
                TextButton(
                    onClick = {
                        datePickerState.selectedDateMillis?.let { millis ->
                            onValueChange(millisToLocalDate(millis).format(ISO_DATE_FMT))
                        }
                        showPicker = false
                    },
                ) { Text("Aceptar") }
            },
            dismissButton = {
                TextButton(onClick = { showPicker = false }) { Text("Cancelar") }
            },
        ) {
            DatePicker(state = datePickerState)
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun DateTimePickerField(
    label: String,
    value: String,
    onValueChange: (String) -> Unit,
    modifier: Modifier = Modifier,
) {
    var showDatePicker by remember { mutableStateOf(false) }
    var showTimePicker by remember { mutableStateOf(false) }
    var pendingDate by remember { mutableStateOf<LocalDate?>(null) }

    val parsed = parseIsoLocalDateTime(value)
    val display = parsed?.let { (d, t) -> DISPLAY_DATE_TIME_FMT.format(d.atTime(t)) } ?: ""

    OutlinedTextField(
        value = display,
        onValueChange = {},
        readOnly = true,
        label = { Text(label) },
        placeholder = { Text("Seleccionar fecha y hora") },
        modifier = modifier
            .fillMaxWidth()
            .clickable { showDatePicker = true },
        trailingIcon = {
            Row {
                if (value.isNotBlank()) {
                    IconButton(onClick = { onValueChange("") }) {
                        Icon(Icons.Default.Clear, contentDescription = "Limpiar")
                    }
                }
                Icon(Icons.Default.DateRange, contentDescription = "Seleccionar fecha")
            }
        },
    )

    if (showDatePicker) {
        val initial = parsed?.first ?: LocalDate.now()
        val datePickerState = rememberDatePickerState(initialSelectedDateMillis = initial.toPickerMillis())
        DatePickerDialog(
            onDismissRequest = { showDatePicker = false },
            confirmButton = {
                TextButton(
                    onClick = {
                        datePickerState.selectedDateMillis?.let { millis ->
                            pendingDate = millisToLocalDate(millis)
                            showDatePicker = false
                            showTimePicker = true
                        }
                    },
                ) { Text("Siguiente") }
            },
            dismissButton = {
                TextButton(onClick = { showDatePicker = false }) { Text("Cancelar") }
            },
        ) {
            DatePicker(state = datePickerState)
        }
    }

    if (showTimePicker) {
        val initialTime = parsed?.second ?: LocalTime.of(9, 0)
        val timePickerState = rememberTimePickerState(
            initialHour = initialTime.hour,
            initialMinute = initialTime.minute,
            is24Hour = true,
        )
        AlertDialog(
            onDismissRequest = { showTimePicker = false },
            title = { Text("Hora") },
            text = {
                TimePicker(state = timePickerState)
            },
            confirmButton = {
                TextButton(
                    onClick = {
                        val date = pendingDate ?: parsed?.first ?: LocalDate.now()
                        val time = LocalTime.of(timePickerState.hour, timePickerState.minute)
                        onValueChange(ISO_DATE_TIME_FMT.format(date.atTime(time)))
                        showTimePicker = false
                        pendingDate = null
                    },
                ) { Text("Aceptar") }
            },
            dismissButton = {
                TextButton(onClick = { showTimePicker = false; pendingDate = null }) { Text("Cancelar") }
            },
        )
    }
}

fun activityMapStr(m: Map<String, Any?>?, vararg keys: String): String {
    if (m == null) return ""
    for (key in keys) {
        val v = m[key]
        if (v != null) {
            val s = v.toString().trim()
            if (s.isNotBlank() && s != "null") return s
        }
    }
    return ""
}

@Composable
fun ActivityPlaceholderTab(message: String) {
    Box(Modifier.fillMaxSize(), Alignment.Center) {
        Text(message, color = MaterialTheme.colorScheme.onSurfaceVariant)
    }
}

@Composable
fun ADetailRow(label: String, value: String) {
    if (value == "—" || value.isBlank()) return
    Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
        Text(label, fontSize = 13.sp, color = MaterialTheme.colorScheme.onSurfaceVariant)
        Text(value, fontSize = 13.sp, fontWeight = FontWeight.Medium)
    }
}
