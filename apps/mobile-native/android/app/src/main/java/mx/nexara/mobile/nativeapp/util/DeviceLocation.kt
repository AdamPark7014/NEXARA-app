package mx.nexara.mobile.nativeapp.util

import android.Manifest
import android.annotation.SuppressLint
import android.content.Context
import android.content.pm.PackageManager
import android.location.Location
import androidx.core.content.ContextCompat
import com.google.android.gms.location.LocationServices
import com.google.android.gms.location.Priority
import com.google.android.gms.tasks.CancellationTokenSource
import kotlinx.coroutines.suspendCancellableCoroutine
import kotlin.coroutines.resume

data class DeviceCoords(val lat: Double, val lng: Double, val accuracyM: Float? = null) {
    /** Sufijo para mensajes de UI: " · GPS ±12m" / " (sin GPS)". */
    fun messageSuffix(): String =
        if (accuracyM != null) " · GPS ±${accuracyM.toInt()}m" else " · GPS ok"

    /** Línea para persistir en notas de campo. */
    fun noteLine(): String {
        val acc = accuracyM?.let { " ±${it.toInt()}m" } ?: ""
        return "[GPS: ${"%.5f".format(lat)},${"%.5f".format(lng)}$acc]"
    }
}

fun DeviceCoords?.messageSuffixOrNone(): String = this?.messageSuffix() ?: " (sin GPS)"

fun DeviceCoords?.mergeIntoNotes(notes: String?): String {
    val line = this?.noteLine()
    return listOfNotNull(notes?.trim()?.takeIf { it.isNotEmpty() }, line).joinToString("\n")
}

/**
 * Ubicación actual para compliance de campo (asistencia, evidencias, GPS).
 * Devuelve null si no hay permiso o señal.
 */
object DeviceLocation {
    fun hasPermission(context: Context): Boolean {
        val fine = ContextCompat.checkSelfPermission(context, Manifest.permission.ACCESS_FINE_LOCATION)
        val coarse = ContextCompat.checkSelfPermission(context, Manifest.permission.ACCESS_COARSE_LOCATION)
        return fine == PackageManager.PERMISSION_GRANTED || coarse == PackageManager.PERMISSION_GRANTED
    }

    @SuppressLint("MissingPermission")
    suspend fun current(context: Context): DeviceCoords? {
        if (!hasPermission(context)) return null
        val fused = LocationServices.getFusedLocationProviderClient(context)
        val cts = CancellationTokenSource()
        val fresh = awaitTask {
            fused.getCurrentLocation(Priority.PRIORITY_BALANCED_POWER_ACCURACY, cts.token)
        }
        // Si la lectura fresca no sirve (o es un (0,0) vacío) se prueba la
        // última conocida antes de rendirse.
        fresh?.toCoords()?.let { return it }
        return awaitTask { fused.lastLocation }?.toCoords()
    }

    /**
     * `null` cuando la lectura no es una ubicación real.
     *
     * "Sin GPS" tiene que poder decirse. El (0,0) exacto no es un sitio donde
     * haya estado nadie de la empresa: es el valor por defecto de un `Location`
     * vacío, y son coordenadas en el golfo de Guinea. Devolver null aquí es lo
     * que permite que el cuerpo de la petición lleve `latitude: null` en vez de
     * inventarse un punto a 9.000 km de Puebla.
     */
    private fun Location.toCoords(): DeviceCoords? {
        if (!latitude.isFinite() || !longitude.isFinite()) return null
        if (latitude == 0.0 && longitude == 0.0) return null
        if (kotlin.math.abs(latitude) > 90.0 || kotlin.math.abs(longitude) > 180.0) return null
        return DeviceCoords(latitude, longitude, if (hasAccuracy()) accuracy else null)
    }

    private suspend fun <T> awaitTask(block: () -> com.google.android.gms.tasks.Task<T>): T? =
        suspendCancellableCoroutine { cont ->
            try {
                val task = block()
                task.addOnSuccessListener { value -> if (cont.isActive) cont.resume(value) }
                task.addOnFailureListener { if (cont.isActive) cont.resume(null) }
                task.addOnCanceledListener { if (cont.isActive) cont.resume(null) }
            } catch (_: Exception) {
                if (cont.isActive) cont.resume(null)
            }
        }
}
