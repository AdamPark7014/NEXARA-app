package mx.nexara.mobile.nativeapp.ui.console.activities

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.GpsFixed
import androidx.compose.material.icons.outlined.LocationOff
import androidx.compose.material.icons.outlined.MyLocation
import androidx.compose.material.icons.outlined.PhotoCamera
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import mx.nexara.mobile.nativeapp.data.api.GeocercaAlertaDto
import mx.nexara.mobile.nativeapp.data.api.GeocercaDto
import mx.nexara.mobile.nativeapp.data.api.toUserMessage
import mx.nexara.mobile.nativeapp.data.console.CoreActivitiesRepository
import mx.nexara.mobile.nativeapp.ui.common.GeoPhoto
import mx.nexara.mobile.nativeapp.ui.common.LiveCameraCaptureDialog
import mx.nexara.mobile.nativeapp.ui.common.ProtectedImage
import mx.nexara.mobile.nativeapp.ui.enterprise.NxColors
import mx.nexara.mobile.nativeapp.ui.enterprise.NxIconText
import mx.nexara.mobile.nativeapp.ui.enterprise.NxStatusChip
import mx.nexara.mobile.nativeapp.ui.enterprise.NxTone
import java.time.Instant
import java.time.ZoneId
import java.time.format.DateTimeFormatter
import kotlin.math.asin
import kotlin.math.cos
import kotlin.math.min
import kotlin.math.roundToInt
import kotlin.math.sin
import kotlin.math.sqrt

/**
 * Geocerca de actividades — espejo de `apps/api/src/activities/geofence/geocerca.ts`:
 * quien inicia una actividad (foto de entrada con GPS) debe quedarse y registrar la salida
 * a menos de [RADIO_M] metros de ese punto.
 */
object ActivityGeofence {
    const val RADIO_M = 100

    private const val RADIO_TIERRA_M = 6_371_000.0

    fun distanciaM(lat1: Double, lng1: Double, lat2: Double, lng2: Double): Int {
        val dLat = Math.toRadians(lat2 - lat1)
        val dLng = Math.toRadians(lng2 - lng1)
        val h = sin(dLat / 2) * sin(dLat / 2) +
            cos(Math.toRadians(lat1)) * cos(Math.toRadians(lat2)) * sin(dLng / 2) * sin(dLng / 2)
        return (2 * RADIO_TIERRA_M * asin(min(1.0, sqrt(h)))).roundToInt()
    }

    fun mensajeSalida(distancia: Int, radio: Int = RADIO_M): String =
        "La salida se registra donde iniciaste la actividad: estás a $distancia m y el máximo es $radio m. " +
            "Regresa al punto de inicio para tomar la foto de salida."

    /** Distancia de un punto al inicio de la geocerca, o null si no hay contra qué medir. */
    fun distanciaAlInicio(geocerca: GeocercaDto?, lat: Double?, lng: Double?): Int? {
        val o = geocerca?.origen ?: return null
        val oLat = o.latitude ?: return null
        val oLng = o.longitude ?: return null
        if (lat == null || lng == null) return null
        return distanciaM(oLat, oLng, lat, lng)
    }

    private val hora: DateTimeFormatter = DateTimeFormatter.ofPattern("HH:mm")

    fun horaDe(iso: String?): String = runCatching {
        Instant.parse(iso).atZone(ZoneId.systemDefault()).format(hora)
    }.getOrDefault("—")
}

/**
 * «Ubicación de la actividad»: punto de inicio, seguimiento de ubicación cada pocos minutos,
 * si está dentro de los 100 m y las salidas de zona con su justificación.
 */
@Composable
fun GeocercaActividadCard(
    activityId: Long,
    refreshKey: Int,
    onEstado: (GeocercaDto?) -> Unit = {},
) {
    val context = LocalContext.current
    val repo = remember(context) { CoreActivitiesRepository(context) }
    var estado by remember(activityId) { mutableStateOf<GeocercaDto?>(null) }
    var error by remember(activityId) { mutableStateOf<String?>(null) }
    var recargar by remember { mutableIntStateOf(0) }
    var justificando by remember { mutableStateOf<GeocercaAlertaDto?>(null) }

    LaunchedEffect(activityId, refreshKey, recargar) {
        // Seguimiento paulatino: se refresca solo mientras la pantalla está abierta.
        while (true) {
            try {
                val nuevo = withContext(Dispatchers.IO) { repo.geocerca(activityId) }
                estado = nuevo
                error = null
                onEstado(nuevo)
            } catch (e: Exception) {
                error = e.toUserMessage("No se pudo cargar la ubicación de la actividad")
            }
            if (estado?.seguimientoActivo != true) break
            delay(120_000)
        }
    }

    val e = estado ?: run {
        error?.let { Text(it, fontSize = 12.sp, color = NxColors.Muted) }
        return
    }
    if (e.origen == null) return
    val radio = e.radioM ?: ActivityGeofence.RADIO_M
    val alertas = e.alertas.orEmpty()
    val abierta = alertas.firstOrNull { it.abierta == true && it.status != "JUSTIFICADA" }

    Column(
        modifier = Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(14.dp))
            .background(if (abierta != null) Color(0xFFFEF2F2) else NxColors.BrandTint)
            .padding(14.dp),
        verticalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            NxIconText(
                text = "Ubicación de la actividad",
                icon = Icons.Outlined.GpsFixed,
                fontSize = 14.sp,
                fontWeight = FontWeight.Bold,
                color = NxColors.Slate,
                modifier = Modifier.weight(1f),
            )
            when (e.dentro) {
                true -> NxStatusChip("Dentro de $radio m", NxTone.Success)
                false -> NxStatusChip("Fuera de zona", NxTone.Danger, icon = Icons.Outlined.LocationOff)
                null -> NxStatusChip("Esperando ubicación", NxTone.Neutral)
            }
        }
        Text(
            "Iniciaste a las ${ActivityGeofence.horaDe(e.origen.at)}. Mantente a menos de $radio m de ese punto: " +
                "la foto de salida solo se acepta ahí.",
            fontSize = 12.sp,
            color = NxColors.Muted,
        )
        e.ultimo?.let { u ->
            NxIconText(
                text = "Última ubicación ${ActivityGeofence.horaDe(u.at)} · a ${u.distanciaM ?: "—"} m del inicio",
                icon = Icons.Outlined.MyLocation,
                fontSize = 12.5.sp,
                fontWeight = FontWeight.SemiBold,
                color = NxColors.Slate,
            )
        }
        val puntos = e.puntos.orEmpty()
        if (puntos.isNotEmpty()) {
            Text(
                if (e.seguimientoActivo == true) "Seguimiento cada ~10 min" else "Recorrido registrado",
                fontSize = 11.sp,
                fontWeight = FontWeight.Bold,
                color = NxColors.Muted,
            )
            puntos.take(6).forEach { p ->
                val fuera = (p.distanciaM ?: 0) > radio
                Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                    Text(ActivityGeofence.horaDe(p.at), fontSize = 12.sp, color = NxColors.Slate)
                    Text(
                        "${p.distanciaM ?: "—"} m",
                        fontSize = 12.sp,
                        fontWeight = FontWeight.SemiBold,
                        color = if (fuera) Color(0xFFB91C1C) else Color(CoreActivityRules.VERDE),
                    )
                }
            }
        } else if (e.seguimientoActivo == true) {
            Text("Aún no llega tu primer punto de seguimiento.", fontSize = 12.sp, color = NxColors.Muted)
        }

        alertas.forEach { a -> AlertaZonaFila(a, onJustificar = if (a.status != "JUSTIFICADA") ({ justificando = a }) else null) }
    }

    justificando?.let { alerta ->
        JustificarZonaDialog(
            activityId = activityId,
            alerta = alerta,
            onDismiss = { justificando = null },
            onJustificada = {
                justificando = null
                recargar++
            },
        )
    }
}

@Composable
fun AlertaZonaFila(a: GeocercaAlertaDto, onJustificar: (() -> Unit)? = null) {
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(12.dp))
            .background(Color.White)
            .padding(10.dp),
        verticalArrangement = Arrangement.spacedBy(4.dp),
    ) {
        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(6.dp)) {
            NxIconText(
                text = "Salió de zona ${ActivityGeofence.horaDe(a.detectedAt)} · hasta ${a.maxDistanciaM ?: a.distanciaM ?: "—"} m",
                icon = Icons.Outlined.LocationOff,
                fontSize = 12.5.sp,
                fontWeight = FontWeight.SemiBold,
                color = Color(0xFFB91C1C),
                modifier = Modifier.weight(1f),
            )
            if (a.status == "JUSTIFICADA") {
                NxStatusChip("Justificada", NxTone.Info)
            } else {
                NxStatusChip("Sin justificar", NxTone.Warning)
            }
        }
        Text(
            if (a.returnedAt != null) "Regresó a las ${ActivityGeofence.horaDe(a.returnedAt)}" else "Sigue fuera de la zona",
            fontSize = 11.5.sp,
            color = NxColors.Muted,
        )
        a.justificacion?.takeIf { it.isNotBlank() }?.let {
            Text("Motivo: $it", fontSize = 12.sp, color = NxColors.Slate)
        }
        a.fotoUrl?.takeIf { it.isNotBlank() }?.let { url ->
            ProtectedImage(
                url = url,
                contentDescription = "Foto de la justificación",
                modifier = Modifier
                    .size(96.dp)
                    .clip(RoundedCornerShape(10.dp)),
            )
        }
        onJustificar?.let {
            Button(
                onClick = it,
                colors = ButtonDefaults.buttonColors(containerColor = NxColors.Brand),
            ) { Text("Justificar con motivo y foto", fontSize = 13.sp) }
        }
    }
}

@Composable
private fun JustificarZonaDialog(
    activityId: Long,
    alerta: GeocercaAlertaDto,
    onDismiss: () -> Unit,
    onJustificada: () -> Unit,
) {
    val context = LocalContext.current
    val repo = remember(context) { CoreActivitiesRepository(context) }
    val scope = rememberCoroutineScope()
    var motivo by remember { mutableStateOf("") }
    var foto by remember { mutableStateOf<GeoPhoto?>(null) }
    var camara by remember { mutableStateOf(false) }
    var enviando by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf<String?>(null) }

    AlertDialog(
        onDismissRequest = { if (!enviando) onDismiss() },
        title = { Text("¿Por qué saliste de la zona?") },
        text = {
            Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
                Text(
                    "Te alejaste ${alerta.maxDistanciaM ?: alerta.distanciaM ?: "—"} m del punto de inicio a las " +
                        "${ActivityGeofence.horaDe(alerta.detectedAt)}. Tu encargado y dirección verán tu explicación.",
                    fontSize = 13.sp,
                    color = NxColors.Muted,
                )
                OutlinedTextField(
                    value = motivo,
                    onValueChange = { motivo = it },
                    label = { Text("Motivo") },
                    placeholder = { Text("Ej. Fui por material a la ferretería de enfrente") },
                    modifier = Modifier
                        .fillMaxWidth()
                        .heightIn(min = 96.dp),
                )
                foto?.let {
                    androidx.compose.foundation.Image(
                        bitmap = it.preview.asImageBitmap(),
                        contentDescription = "Foto para comprobar",
                        modifier = Modifier
                            .size(120.dp)
                            .clip(RoundedCornerShape(10.dp)),
                    )
                }
                OutlinedButton(onClick = { camara = true }, enabled = !enviando) {
                    NxIconText(
                        text = if (foto == null) "Tomar foto para comprobarlo" else "Tomar otra foto",
                        icon = Icons.Outlined.PhotoCamera,
                        fontSize = 13.sp,
                    )
                }
                error?.let { Text(it, color = Color(0xFFB91C1C), fontSize = 12.sp) }
            }
        },
        confirmButton = {
            Button(
                enabled = !enviando && motivo.trim().length >= 5,
                onClick = {
                    enviando = true
                    error = null
                    scope.launch {
                        try {
                            withContext(Dispatchers.IO) {
                                repo.justificarZona(activityId, alerta.id, motivo.trim(), foto?.dataUrl)
                            }
                            onJustificada()
                        } catch (e: Exception) {
                            error = e.toUserMessage("No se pudo enviar la justificación")
                        } finally {
                            enviando = false
                        }
                    }
                },
            ) { Text(if (enviando) "Enviando…" else "Enviar") }
        },
        dismissButton = {
            TextButton(onClick = onDismiss, enabled = !enviando) { Text("Cancelar") }
        },
    )

    if (camara) {
        LiveCameraCaptureDialog(
            title = "Foto para comprobar",
            requireLocation = false,
            onCaptured = {
                foto = it
                camara = false
            },
            onDismiss = { camara = false },
        )
    }
}
