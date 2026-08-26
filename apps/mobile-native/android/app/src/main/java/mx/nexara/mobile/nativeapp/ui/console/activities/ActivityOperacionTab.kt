package mx.nexara.mobile.nativeapp.ui.console.activities

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import mx.nexara.mobile.nativeapp.data.api.ActivityDto
import mx.nexara.mobile.nativeapp.data.api.ActivityEvidenceDetailDto
import mx.nexara.mobile.nativeapp.ui.enterprise.NxSectionHeader
import mx.nexara.mobile.nativeapp.ui.enterprise.NxStatusChip
import mx.nexara.mobile.nativeapp.ui.enterprise.NxTone
import mx.nexara.mobile.nativeapp.ui.util.openExternalUrl
import java.time.Instant
import java.time.ZoneId
import java.time.format.DateTimeFormatter

private fun mapsUrl(lat: Double?, lng: Double?): String? {
    if (lat == null || lng == null || !lat.isFinite() || !lng.isFinite()) return null
    return "https://www.google.com/maps?q=$lat,$lng"
}

private fun isActivityClosed(estatus: String): Boolean {
    val s = estatus.lowercase()
    return s.contains("finaliz") || s.contains("complet") || s.contains("cancel")
}

@OptIn(ExperimentalLayoutApi::class)
@Composable
fun ActivityOperacionTab(
    activity: ActivityDto,
    evidence: ActivityEvidenceDetailDto?,
    onOpenGps: (() -> Unit)? = null,
    modifier: Modifier = Modifier,
) {
    val context = LocalContext.current
    val dueRaw = activity.fechaEntregaEsperada ?: activity.fechaMaxima
    val dueInstant = dueRaw?.let { runCatching { Instant.parse(it) }.getOrNull() }
    val overdue = dueInstant != null &&
        dueInstant.toEpochMilli() < System.currentTimeMillis() &&
        !isActivityClosed(activity.estatus)

    val maxMin = activity.tiempoMaximoMin ?: activity.tiempoEstimadoMin
    val evSummary = activity.activityEvidence
    val reviewStatus = evidence?.reviewStatus ?: evSummary?.reviewStatus ?: "Pendiente"
    val branchMaps = mapsUrl(activity.branchLatitude, activity.branchLongitude)
    val entryLat = evidence?.entryLatitude ?: evSummary?.entryLatitude
    val entryLng = evidence?.entryLongitude ?: evSummary?.entryLongitude
    val exitLat = evidence?.exitLatitude ?: evSummary?.exitLatitude
    val exitLng = evidence?.exitLongitude ?: evSummary?.exitLongitude
    val entryMaps = mapsUrl(entryLat, entryLng)
    val exitMaps = mapsUrl(exitLat, exitLng)

    val addressParts = listOfNotNull(
        activity.branchName?.takeIf { it.isNotBlank() },
        activity.branchAddress?.takeIf { it.isNotBlank() },
        activity.branchCity?.takeIf { it.isNotBlank() },
        activity.branchState?.takeIf { it.isNotBlank() },
    )

  Column(
        modifier = modifier
            .verticalScroll(rememberScrollState())
            .padding(PaddingValues(16.dp)),
        verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        FlowRow(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.spacedBy(8.dp),
            verticalArrangement = Arrangement.spacedBy(8.dp),
        ) {
            OperacionKpiCard(
                label = "SLA",
                value = when {
                    overdue -> "Vencida"
                    dueInstant != null -> DateTimeFormatter.ofPattern("dd/MM/yyyy")
                        .withZone(ZoneId.systemDefault())
                        .format(dueInstant)
                    else -> "Sin fecha"
                },
                tone = when {
                    overdue -> NxTone.Danger
                    dueInstant != null -> NxTone.Warning
                    else -> NxTone.Neutral
                },
            )
            OperacionKpiCard(
                label = "Prioridad",
                value = activity.prioridad?.takeIf { it.isNotBlank() } ?: "—",
                tone = NxTone.Neutral,
            )
            OperacionKpiCard(
                label = "Tiempo máx.",
                value = maxMin?.let { "$it min" } ?: "—",
                tone = NxTone.Neutral,
            )
            OperacionKpiCard(
                label = "Evidencia",
                value = reviewStatus,
                tone = if (reviewStatus.equals("APPROVED", ignoreCase = true)) NxTone.Success else NxTone.Neutral,
            )
        }

        NxSectionHeader("Ubicación y campo")
        Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
            if (addressParts.isNotEmpty()) {
                Text(
                    "Sitio: ${addressParts.joinToString(" · ")}",
                    style = MaterialTheme.typography.bodyMedium,
                )
            }
            activity.client?.name?.takeIf { it.isNotBlank() }?.let { clientName ->
                Text(
                    "Cliente OPS: $clientName",
                    style = MaterialTheme.typography.bodyMedium,
                )
            }
            FlowRow(
                horizontalArrangement = Arrangement.spacedBy(8.dp),
                verticalArrangement = Arrangement.spacedBy(8.dp),
            ) {
                branchMaps?.let { url ->
                    OutlinedButton(onClick = { openExternalUrl(context, url) }) {
                        Text("Mapa sucursal")
                    }
                }
                entryMaps?.let { url ->
                    OutlinedButton(onClick = { openExternalUrl(context, url) }) {
                        Text("GPS llegada")
                    }
                }
                exitMaps?.let { url ->
                    OutlinedButton(onClick = { openExternalUrl(context, url) }) {
                        Text("GPS salida")
                    }
                }
                if (onOpenGps != null) {
                    OutlinedButton(onClick = onOpenGps) {
                        Text("Mapa operacional OPS")
                    }
                }
            }
        }

        activity.slaAlertedAt?.takeIf { it.isNotBlank() }?.let { alertedAt ->
            Column(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(top = 4.dp),
                verticalArrangement = Arrangement.spacedBy(6.dp),
            ) {
                NxStatusChip("SLA alertado", tone = NxTone.Warning)
                Text(
                    runCatching {
                        DateTimeFormatter.ofPattern("dd/MM/yyyy HH:mm")
                            .withZone(ZoneId.systemDefault())
                            .format(Instant.parse(alertedAt))
                    }.getOrDefault(alertedAt),
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
        }
    }
}

@Composable
private fun OperacionKpiCard(label: String, value: String, tone: NxTone) {
    Column(
        modifier = Modifier.padding(4.dp),
        verticalArrangement = Arrangement.spacedBy(4.dp),
    ) {
        Text(label, style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
        Text(
            value,
            style = MaterialTheme.typography.bodyMedium.copy(fontWeight = FontWeight.SemiBold),
            color = when (tone) {
                NxTone.Danger -> MaterialTheme.colorScheme.error
                NxTone.Warning -> Color(0xFFF59E0B)
                NxTone.Success -> Color(0xFF10B981)
                else -> MaterialTheme.colorScheme.onSurface
            },
        )
    }
}
