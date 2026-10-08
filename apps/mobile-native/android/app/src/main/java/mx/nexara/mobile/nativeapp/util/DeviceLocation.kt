package mx.nexara.mobile.nativeapp.util

import android.Manifest
import android.annotation.SuppressLint
import android.content.Context
import android.content.pm.PackageManager
import android.location.Location
import android.location.LocationManager
import android.os.Build
import android.os.SystemClock
import androidx.core.content.ContextCompat
import androidx.core.location.LocationManagerCompat
import com.google.android.gms.location.CurrentLocationRequest
import com.google.android.gms.location.LocationServices
import com.google.android.gms.location.Priority
import com.google.android.gms.tasks.CancellationTokenSource
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.suspendCancellableCoroutine
import kotlinx.coroutines.withTimeoutOrNull
import kotlin.coroutines.resume

/**
 * @param mock la lectura viene de una app de ubicación simulada (ver [MockLocation]).
 * Se manda al servidor tal cual: él decide (asistencia: 422 y aviso a sus jefes).
 * @param fixAgeMs de cuándo es la medición, en milisegundos (ver [FixAge]). `null` si el
 * teléfono no lo dice. El servidor rechaza una posición de hace más de media hora.
 */
data class DeviceCoords(
    val lat: Double,
    val lng: Double,
    val accuracyM: Float? = null,
    val mock: Boolean = false,
    val fixAgeMs: Long? = null,
) {
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

/**
 * Lectura de la checada: las coordenadas o, si no las hay, por qué
 * ([UbicacionFalla]). Exactamente uno de los dos va con valor.
 */
data class LecturaUbicacion(
    val coords: DeviceCoords?,
    val falla: String?,
)

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

    /**
     * @param highAccuracy GPS fino (fotos de evidencia de entrada/salida); el
     * modo balanceado basta para asistencia y rastreo.
     */
    @SuppressLint("MissingPermission")
    suspend fun current(context: Context, highAccuracy: Boolean = false): DeviceCoords? {
        if (!hasPermission(context)) return null
        val fused = LocationServices.getFusedLocationProviderClient(context)
        val cts = CancellationTokenSource()
        val priority = if (highAccuracy) {
            Priority.PRIORITY_HIGH_ACCURACY
        } else {
            Priority.PRIORITY_BALANCED_POWER_ACCURACY
        }
        val fresh = awaitTask {
            fused.getCurrentLocation(priority, cts.token)
        }
        // Si la lectura fresca no sirve (o es un (0,0) vacío) se prueba la
        // última conocida antes de rendirse.
        fresh?.toCoords()?.let { return it }
        return awaitTask { fused.lastLocation }?.toCoords()
    }

    /** Tope de la segunda lectura (GPS fino) de la checada. */
    private const val FINO_MAX_MS = 12_000L

    /**
     * Ubicación para la checada, con el motivo si no se consiguió.
     *
     * La lectura balanceada usa Wi-Fi y celda, no GPS: adentro o con datos malos
     * regresa null aunque haya permiso (así llegaron sin coordenadas checadas de
     * gente cuyo GPS de jornada mandó puntos minutos después). Por eso, si sale
     * vacía, se intenta una vez con GPS fino (máx. [FINO_MAX_MS]) antes de caer a
     * la última conocida. [current] no cambia: las evidencias la llaman con sus
     * propios tiempos y no deben esperar 12 s más.
     */
    @SuppressLint("MissingPermission")
    suspend fun lecturaParaChecada(context: Context): LecturaUbicacion {
        if (!hasPermission(context)) return LecturaUbicacion(null, UbicacionFalla.PERMISO_NEGADO)
        val cts = CancellationTokenSource()
        return try {
            val fused = LocationServices.getFusedLocationProviderClient(context)
            val balanceada = awaitTask {
                fused.getCurrentLocation(Priority.PRIORITY_BALANCED_POWER_ACCURACY, cts.token)
            }
            balanceada?.toCoords()?.let { return LecturaUbicacion(it, null) }

            val encendida = ubicacionEncendida(context)
            // Con la ubicación apagada el GPS no va a contestar: no se hace esperar a nadie.
            if (encendida) {
                val fina = CurrentLocationRequest.Builder()
                    .setPriority(Priority.PRIORITY_HIGH_ACCURACY)
                    .setDurationMillis(FINO_MAX_MS)
                    .build()
                // Red de seguridad por si el teléfono no respeta la duración.
                val lectura = withTimeoutOrNull(FINO_MAX_MS + 3_000L) {
                    awaitTask { fused.getCurrentLocation(fina, cts.token) }
                }
                lectura?.toCoords()?.let { return LecturaUbicacion(it, null) }
            }

            awaitTask { fused.lastLocation }?.toCoords()?.let { return LecturaUbicacion(it, null) }

            // Se vuelve a leer el permiso: pudo quitarse mientras se esperaba al GPS.
            LecturaUbicacion(
                null,
                UbicacionFalla.fallaDeUbicacion(
                    tienePermiso = hasPermission(context),
                    ubicacionEncendida = encendida,
                ),
            )
        } catch (e: CancellationException) {
            throw e
        } catch (_: Exception) {
            LecturaUbicacion(null, UbicacionFalla.ERROR)
        } finally {
            // Si la pantalla se cerró a media lectura, el GPS deja de buscar.
            cts.cancel()
        }
    }

    /**
     * Interruptor de ubicación del teléfono; si no se puede leer, se da por encendido.
     * También lo usa el GPS de jornada para avisar cuando lo apagan ([EstadoUbicacion]).
     */
    fun ubicacionEncendida(context: Context): Boolean {
        val manager = context.getSystemService(Context.LOCATION_SERVICE) as? LocationManager ?: return true
        return LocationManagerCompat.isLocationEnabled(manager)
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
        return DeviceCoords(
            lat = latitude,
            lng = longitude,
            accuracyM = if (hasAccuracy()) accuracy else null,
            mock = isSimulated(),
            fixAgeMs = FixAge.millis(SystemClock.elapsedRealtimeNanos(), elapsedRealtimeNanos),
        )
    }

    /** `Location.isMock` (API 31+) o `isFromMockProvider`; ver [MockLocation]. */
    @Suppress("DEPRECATION")
    private fun Location.isSimulated(): Boolean = MockLocation.isSimulated(
        sdkInt = Build.VERSION.SDK_INT,
        isMock = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            runCatching { isMock }.getOrNull()
        } else {
            null
        },
        isFromMockProvider = runCatching { isFromMockProvider }.getOrNull(),
    )

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
