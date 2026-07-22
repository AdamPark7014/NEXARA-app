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
        if (fresh != null) return fresh.toCoords()
        return awaitTask { fused.lastLocation }?.toCoords()
    }

    private fun Location.toCoords() =
        DeviceCoords(latitude, longitude, if (hasAccuracy()) accuracy else null)

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
