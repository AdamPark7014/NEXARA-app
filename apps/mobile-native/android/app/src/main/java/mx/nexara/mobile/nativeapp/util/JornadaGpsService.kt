package mx.nexara.mobile.nativeapp.util

import android.Manifest
import android.annotation.SuppressLint
import android.app.Notification
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.content.pm.ServiceInfo
import android.location.Location
import android.os.Build
import android.os.IBinder
import android.util.Log
import androidx.core.app.NotificationCompat
import androidx.core.content.ContextCompat
import com.google.android.gms.location.FusedLocationProviderClient
import com.google.android.gms.location.LocationCallback
import com.google.android.gms.location.LocationRequest
import com.google.android.gms.location.LocationResult
import com.google.android.gms.location.LocationServices
import com.google.android.gms.location.Priority
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.launch
import mx.nexara.mobile.nativeapp.MainActivity
import mx.nexara.mobile.nativeapp.R
import mx.nexara.mobile.nativeapp.data.console.ConsoleRepository
import mx.nexara.mobile.nativeapp.push.NexaraNotifications

/**
 * GPS de jornada — mando en un solo sitio.
 *
 * El rastreo se enciende al registrar **entrada** y se apaga en la **salida**;
 * mientras corre, la persona ve una notificación permanente que dice que está
 * compartiendo su ubicación. No hay rastreo silencioso: si la notificación no
 * está, el servicio no está.
 */
object JornadaGps {
    private const val ACTION_START = "mx.nexara.mobile.JORNADA_GPS_START"
    private const val ACTION_STOP = "mx.nexara.mobile.JORNADA_GPS_STOP"

    @Volatile
    private var running = false

    /** `true` mientras el servicio está en primer plano enviando ubicación. */
    fun isRunning(): Boolean = running

    internal fun markRunning(value: Boolean) {
        running = value
    }

    internal fun isStart(intent: Intent?): Boolean = intent?.action != ACTION_STOP

    /** Sin permiso de ubicación no se arranca: Android mataría el servicio al instante. */
    fun canTrack(context: Context): Boolean =
        ContextCompat.checkSelfPermission(context, Manifest.permission.ACCESS_FINE_LOCATION) ==
            PackageManager.PERMISSION_GRANTED ||
            ContextCompat.checkSelfPermission(context, Manifest.permission.ACCESS_COARSE_LOCATION) ==
            PackageManager.PERMISSION_GRANTED

    fun start(context: Context) {
        if (!canTrack(context)) return
        val app = context.applicationContext
        val intent = Intent(app, JornadaGpsService::class.java).setAction(ACTION_START)
        try {
            ContextCompat.startForegroundService(app, intent)
        } catch (e: Exception) {
            // Android 12+ puede rechazar el arranque en segundo plano; la jornada
            // sigue registrada aunque no se comparta el trayecto.
            Log.w(TAG, "No se pudo iniciar el GPS de jornada: ${e.message}")
        }
    }

    fun stop(context: Context) {
        val app = context.applicationContext
        val intent = Intent(app, JornadaGpsService::class.java).setAction(ACTION_STOP)
        try {
            app.startService(intent)
        } catch (_: Exception) {
            app.stopService(intent)
        }
        running = false
    }

    internal const val TAG = "JornadaGps"

    /** ~3 min o 100 m: suficiente para dibujar el trayecto sin vaciar la batería. */
    internal const val INTERVAL_MS = 3 * 60_000L
    internal const val FASTEST_MS = 90_000L
    internal const val MIN_DISTANCE_M = 100f
    internal const val NOTIFICATION_ID = 4711
}

class JornadaGpsService : Service() {

    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)
    private val repo by lazy { ConsoleRepository(applicationContext) }
    private var client: FusedLocationProviderClient? = null

    private val callback = object : LocationCallback() {
        override fun onLocationResult(result: LocationResult) {
            val location = result.lastLocation ?: return
            publish(location)
        }
    }

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        if (!JornadaGps.isStart(intent)) {
            stopTracking()
            return START_NOT_STICKY
        }
        if (!JornadaGps.canTrack(this)) {
            stopTracking()
            return START_NOT_STICKY
        }
        if (!goForeground()) {
            stopTracking()
            return START_NOT_STICKY
        }
        startTracking()
        // START_STICKY: si el sistema mata el proceso con la jornada abierta, el
        // rastreo vuelve solo.
        return START_STICKY
    }

    override fun onDestroy() {
        client?.removeLocationUpdates(callback)
        client = null
        JornadaGps.markRunning(false)
        scope.cancel()
        super.onDestroy()
    }

    private fun goForeground(): Boolean = try {
        val notification = buildNotification()
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            startForeground(
                JornadaGps.NOTIFICATION_ID,
                notification,
                ServiceInfo.FOREGROUND_SERVICE_TYPE_LOCATION,
            )
        } else {
            startForeground(JornadaGps.NOTIFICATION_ID, notification)
        }
        true
    } catch (e: Exception) {
        Log.w(JornadaGps.TAG, "startForeground rechazado: ${e.message}")
        false
    }

    @SuppressLint("MissingPermission")
    private fun startTracking() {
        if (client != null) return
        val fused = LocationServices.getFusedLocationProviderClient(this)
        val request = LocationRequest.Builder(
            Priority.PRIORITY_BALANCED_POWER_ACCURACY,
            JornadaGps.INTERVAL_MS,
        )
            .setMinUpdateIntervalMillis(JornadaGps.FASTEST_MS)
            .setMinUpdateDistanceMeters(JornadaGps.MIN_DISTANCE_M)
            .setWaitForAccurateLocation(false)
            .build()
        try {
            fused.requestLocationUpdates(request, callback, mainLooper)
            client = fused
            JornadaGps.markRunning(true)
        } catch (e: Exception) {
            Log.w(JornadaGps.TAG, "requestLocationUpdates falló: ${e.message}")
            stopTracking()
        }
    }

    private fun stopTracking() {
        JornadaGps.markRunning(false)
        client?.removeLocationUpdates(callback)
        client = null
        stopForeground(STOP_FOREGROUND_REMOVE)
        stopSelf()
    }

    /**
     * El (0,0) de un `Location` vacío no es un sitio donde haya estado nadie:
     * se descarta en vez de dibujar un punto en el golfo de Guinea.
     */
    private fun publish(location: Location) {
        val lat = location.latitude
        val lng = location.longitude
        if (!lat.isFinite() || !lng.isFinite()) return
        if (lat == 0.0 && lng == 0.0) return
        if (kotlin.math.abs(lat) > 90.0 || kotlin.math.abs(lng) > 180.0) return
        val speedKmh = if (location.hasSpeed()) (location.speed * 3.6).toDouble() else null
        scope.launch {
            try {
                repo.gpsPost(lat = lat, lng = lng, speedKmh = speedKmh)
            } catch (e: Exception) {
                // Sin red la cola offline lo reenvía; aquí solo se anota.
                Log.w(JornadaGps.TAG, "No se pudo enviar la ubicación: ${e.message}")
            }
        }
    }

    private fun buildNotification(): Notification {
        NexaraNotifications.ensureChannels(this)
        val intent = Intent(this, MainActivity::class.java).apply {
            flags = Intent.FLAG_ACTIVITY_SINGLE_TOP or Intent.FLAG_ACTIVITY_CLEAR_TOP
        }
        val pending = PendingIntent.getActivity(
            this,
            JornadaGps.NOTIFICATION_ID,
            intent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
        )
        return NotificationCompat.Builder(this, NexaraNotifications.CHANNEL_GPS)
            .setSmallIcon(R.mipmap.ic_launcher)
            .setContentTitle("Jornada en curso · compartiendo ubicación")
            .setContentText("Se comparte tu ubicación con NEXARA hasta que registres tu salida.")
            .setStyle(
                NotificationCompat.BigTextStyle().bigText(
                    "Se comparte tu ubicación con NEXARA hasta que registres tu salida. " +
                        "Registra la salida para dejar de compartirla.",
                ),
            )
            .setOngoing(true)
            .setSilent(true)
            .setPriority(NotificationCompat.PRIORITY_LOW)
            .setCategory(NotificationCompat.CATEGORY_SERVICE)
            .setContentIntent(pending)
            .build()
    }
}
