package mx.nexara.mobile.nativeapp.util

import android.Manifest
import android.annotation.SuppressLint
import android.app.AlarmManager
import android.app.Notification
import android.app.PendingIntent
import android.app.Service
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.content.pm.PackageManager
import android.content.pm.ServiceInfo
import android.location.Location
import android.location.LocationManager
import android.os.Build
import android.os.IBinder
import android.os.PowerManager
import android.os.SystemClock
import android.provider.Settings
import android.util.Log
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import androidx.core.content.ContextCompat
import com.google.android.gms.location.CurrentLocationRequest
import com.google.android.gms.location.FusedLocationProviderClient
import com.google.android.gms.location.LocationCallback
import com.google.android.gms.location.LocationRequest
import com.google.android.gms.location.LocationResult
import com.google.android.gms.location.LocationServices
import com.google.android.gms.location.Priority
import com.google.android.gms.tasks.CancellationTokenSource
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.launch
import kotlinx.coroutines.suspendCancellableCoroutine
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import kotlinx.coroutines.withTimeoutOrNull
import mx.nexara.mobile.nativeapp.MainActivity
import mx.nexara.mobile.nativeapp.R
import mx.nexara.mobile.nativeapp.data.console.ConsoleRepository
import mx.nexara.mobile.nativeapp.push.NexaraNotifications
import java.time.Instant
import java.time.ZoneId
import java.time.format.DateTimeFormatter
import kotlin.coroutines.resume

/**
 * GPS de jornada — mando en un solo sitio.
 *
 * El rastreo se enciende al registrar **entrada** y se apaga en la **salida**; mientras corre, la
 * persona ve una notificación permanente «Jornada en curso» que dice cuándo se tomó su última
 * ubicación. No hay rastreo silencioso: si la notificación no está, el servicio no está.
 *
 * Un punto cada 30 min (Adam, 23-10-2026), con la app cerrada o en segundo plano y haya o no
 * actividad en curso. Tres cosas lo despiertan, y las tres pasan por [JornadaGpsReglas] para que
 * nunca salgan dos puntos en 20 min:
 *
 * 1. Una alarma de Android cada 30 min (`setAndAllowWhileIdle`: suena aunque el teléfono esté en
 *    reposo). Toma una lectura de GPS fino; sin señal, reintenta a los 5 min (tres veces).
 * 2. El propio GPS del sistema, pedido cada 30 min y sin mínimo de distancia (antes pedía 500 m y
 *    quien no se movía no mandaba nada).
 * 3. Un «latido» del servidor por FCM cuando lleva más de 35 min sin un punto (`gps-latido`).
 *
 * Si Android cerró el servicio (ahorro de batería del fabricante, actualización de la app,
 * reinicio), no se puede volver a abrir desde segundo plano sin el permiso «todo el tiempo»: la
 * alarma o el latido muestran «Toca para seguir registrando tu ubicación» y al abrir la app vuelve.
 *
 * Si el servidor contesta 401 (la sesión se cerró), el punto no se pierde: se guarda con su hora
 * y se manda cuando vuelve la sesión; mientras, una notificación pide volver a entrar.
 */
object JornadaGps {
    private const val ACTION_START = "mx.nexara.mobile.JORNADA_GPS_START"
    private const val ACTION_STOP = "mx.nexara.mobile.JORNADA_GPS_STOP"
    internal const val ACTION_ALARMA = "mx.nexara.mobile.JORNADA_GPS_ALARMA"

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

    /**
     * Enciende el GPS de jornada. Desde la app abierta siempre se puede; desde segundo plano
     * Android 12+ lo rechaza y queda la notificación para reanudar.
     */
    fun start(context: Context): Boolean {
        val app = context.applicationContext
        prefs(app).edit().putBoolean(KEY_JORNADA_ABIERTA, true).apply()
        if (!canTrack(app)) return false
        val intent = Intent(app, JornadaGpsService::class.java).setAction(ACTION_START)
        return try {
            ContextCompat.startForegroundService(app, intent)
            quitarAvisoReanudar(app)
            true
        } catch (e: Exception) {
            Log.w(TAG, "No se pudo iniciar el GPS de jornada: ${e.message}")
            false
        }
    }

    private const val PREFS = "nx_jornada_gps"
    private const val KEY_ACTIVIDAD = "actividad_id"
    private const val KEY_SOLO_ACTIVIDAD = "solo_actividad"
    private const val KEY_JORNADA_ABIERTA = "jornada_abierta"
    private const val KEY_ULTIMO_ENVIADO = "ultimo_enviado_ms"
    private const val KEY_PENDIENTES = "pendientes"
    private const val KEY_REINTENTOS = "reintentos"

    internal fun prefs(context: Context) =
        context.applicationContext.getSharedPreferences(PREFS, Context.MODE_PRIVATE)

    /** La jornada se abrió en este teléfono y no se ha cerrado (sobrevive a que Android mate el proceso). */
    fun jornadaAbierta(context: Context): Boolean = prefs(context).getBoolean(KEY_JORNADA_ABIERTA, false)

    internal fun ultimoEnviadoMs(context: Context): Long? =
        prefs(context).getLong(KEY_ULTIMO_ENVIADO, 0L).takeIf { it > 0L }

    /**
     * Un punto ya llegó al servidor a esta hora (también la checada con ubicación, que el servidor
     * guarda en el recorrido): el siguiente sale 30 min después y no a los segundos.
     */
    fun marcarPuntoEnviado(context: Context, enMs: Long = System.currentTimeMillis()) {
        prefs(context).edit().putLong(KEY_ULTIMO_ENVIADO, enMs).putInt(KEY_REINTENTOS, 0).apply()
    }

    internal fun reintentos(context: Context): Int = prefs(context).getInt(KEY_REINTENTOS, 0)

    internal fun guardarReintentos(context: Context, n: Int) {
        prefs(context).edit().putInt(KEY_REINTENTOS, n).apply()
    }

    internal fun pendientes(context: Context): List<JornadaGpsReglas.PuntoPendiente> =
        JornadaGpsReglas.deserializar(prefs(context).getString(KEY_PENDIENTES, null))

    internal fun guardarPendientes(context: Context, lista: List<JornadaGpsReglas.PuntoPendiente>) {
        prefs(context).edit().putString(KEY_PENDIENTES, JornadaGpsReglas.serializar(lista)).apply()
    }

    /**
     * Actividad iniciada (foto de entrada) mientras corre el rastreo: los puntos se envían con su
     * id y el servidor los mide contra la geocerca de 100 m. Sobrevive a que Android mate el proceso.
     */
    fun actividadActual(context: Context): Long? =
        prefs(context).getLong(KEY_ACTIVIDAD, -1L).takeIf { it > 0 }

    /**
     * Seguimiento de una actividad: los puntos llevan su id. Ya no cambia la frecuencia (sigue
     * cada 30 min) ni rearma el servicio: rearmarlo mandaba un punto a los segundos del anterior.
     */
    fun iniciarActividad(context: Context, activityId: Long) {
        if (!canTrack(context)) return
        prefs(context).edit()
            .putLong(KEY_ACTIVIDAD, activityId)
            .putBoolean(KEY_SOLO_ACTIVIDAD, !running && !jornadaAbierta(context))
            .apply()
        if (!running) startSoloServicio(context)
    }

    /** Al registrar la salida de la actividad: se deja de etiquetar; si el servicio solo corría por ella, se apaga. */
    fun terminarActividad(context: Context) {
        val p = prefs(context)
        val soloActividad = p.getBoolean(KEY_SOLO_ACTIVIDAD, false)
        p.edit().remove(KEY_ACTIVIDAD).remove(KEY_SOLO_ACTIVIDAD).apply()
        if (soloActividad && !jornadaAbierta(context)) detenerServicio(context)
    }

    /** Arranca el servicio sin marcar la jornada como abierta (actividad sin checada de entrada). */
    private fun startSoloServicio(context: Context) {
        val app = context.applicationContext
        try {
            ContextCompat.startForegroundService(app, Intent(app, JornadaGpsService::class.java).setAction(ACTION_START))
        } catch (e: Exception) {
            Log.w(TAG, "No se pudo iniciar el GPS de la actividad: ${e.message}")
        }
    }

    /** Salida registrada (o jornada cerrada en el servidor): todo se apaga y se olvida. */
    fun stop(context: Context) {
        val app = context.applicationContext
        prefs(app).edit()
            .putBoolean(KEY_JORNADA_ABIERTA, false)
            .remove(KEY_ULTIMO_ENVIADO)
            .remove(KEY_REINTENTOS)
            .apply()
        AlarmaJornada.cancelar(app)
        quitarAvisoReanudar(app)
        detenerServicio(app)
        // Termina la jornada: la siguiente empieza sin estado de ubicación enviado. Lo que quedó
        // pendiente se intenta mandar una última vez (la sesión pudo volver).
        envios.launch {
            estadoMutex.withLock { guardarEstadoEnviado(app, null) }
            enviarPendientes(app)
        }
    }

    private fun detenerServicio(app: Context) {
        val intent = Intent(app, JornadaGpsService::class.java).setAction(ACTION_STOP)
        try {
            app.startService(intent)
        } catch (_: Exception) {
            app.stopService(intent)
        }
        running = false
    }

    /**
     * Al abrir la app (`MainActivity.onStart`): si la jornada sigue abierta en este teléfono y
     * Android cerró el servicio, vuelve a encenderse. Con la app al frente Android lo permite.
     */
    fun reanudarSiHaceFalta(context: Context) {
        if (running || !jornadaAbierta(context) || !canTrack(context)) return
        start(context)
    }

    /**
     * Latido del servidor (FCM `gps-latido`): lleva más de 35 min sin un punto. Con el servicio
     * vivo se toma uno ya; sin él, se pide a la persona que toque para reanudarlo.
     */
    fun latido(context: Context) {
        val servicio = JornadaGpsService.instancia
        if (servicio != null) {
            servicio.tomarPuntoAhora("latido")
            return
        }
        if (!jornadaAbierta(context)) return
        if (!start(context)) avisarReanudar(context)
    }

    private const val KEY_ESTADO_UBICACION = "estado_ubicacion"

    /**
     * Los envíos de estado no viven en el servicio: cuando falta el permiso se manda
     * SIN_PERMISO y el servicio se detiene en el mismo instante, y su scope se cancela.
     */
    private val envios = CoroutineScope(SupervisorJob() + Dispatchers.IO)
    private val estadoMutex = Mutex()
    private val pendientesMutex = Mutex()

    /** Último estado que llegó al API en esta jornada; sobrevive a que Android mate el proceso. */
    private fun estadoEnviado(context: Context): String? =
        prefs(context).getString(KEY_ESTADO_UBICACION, null)

    private fun guardarEstadoEnviado(context: Context, estado: String?) {
        val editor = prefs(context).edit()
        if (estado == null) editor.remove(KEY_ESTADO_UBICACION) else editor.putString(KEY_ESTADO_UBICACION, estado)
        editor.apply()
    }

    /**
     * Manda a `attendance/estado-ubicacion` si la ubicación se apagó, se quedó sin
     * permiso o volvió ([EstadoUbicacion.debeEnviar]). Solo lo llama el servicio,
     * es decir, con la jornada abierta.
     *
     * Cada envío vuelve a leer el teléfono dentro del candado: si Android avisa tres
     * veces seguidas, o un apagado y un encendido llegan cruzados, el último que pasa
     * manda lo que de verdad hay ahora y no un estado viejo.
     */
    internal fun reportarEstadoUbicacion(context: Context) {
        val app = context.applicationContext
        envios.launch {
            estadoMutex.withLock {
                val actual = EstadoUbicacion.estadoDeUbicacion(
                    tienePermiso = canTrack(app),
                    ubicacionEncendida = DeviceLocation.ubicacionEncendida(app),
                )
                // Apagada a media jornada: además del aviso al servidor, se le pide a la persona.
                if (actual == EstadoUbicacion.APAGADA) avisarUbicacionApagada(app) else quitarAvisoApagada(app)
                if (!EstadoUbicacion.debeEnviar(estadoEnviado(app), actual)) return@withLock
                try {
                    ConsoleRepository(app).gpsEstado(actual)
                    // Sin red la cola contesta 202 y lo reenvía después: cuenta como enviado.
                    guardarEstadoEnviado(app, actual)
                } catch (e: Exception) {
                    // No se guarda: el siguiente aviso de Android (o arranque) lo vuelve a intentar.
                    Log.w(TAG, "No se pudo enviar el estado de ubicación ($actual): ${e.message}")
                }
            }
        }
    }

    /**
     * Manda un punto. Antes, lo que quedó pendiente (en orden). Un 401 lo guarda para después y
     * pide volver a entrar; cualquier otro fallo también lo guarda (la cola sin conexión ya cubre
     * la falta de red y contesta 202).
     *
     * @return `true` si el punto llegó al servidor.
     */
    internal suspend fun enviarPunto(context: Context, punto: JornadaGpsReglas.PuntoPendiente, speedKmh: Double?): Boolean {
        val app = context.applicationContext
        enviarPendientes(app)
        return try {
            ConsoleRepository(app).gpsPost(
                lat = punto.lat,
                lng = punto.lng,
                speedKmh = speedKmh,
                activityId = punto.actividadId,
                mockLocation = punto.mock,
                enMs = punto.enMs,
            ).close()
            quitarAvisoSesion(app)
            true
        } catch (e: CancellationException) {
            throw e
        } catch (e: Exception) {
            pendientesMutex.withLock {
                guardarPendientes(app, JornadaGpsReglas.agregarPendiente(pendientes(app), punto))
            }
            if ((e as? retrofit2.HttpException)?.code() == 401) avisarSesionCerrada(app)
            Log.w(TAG, "Punto guardado para reenviar: ${e.message}")
            false
        }
    }

    /** Reenvía lo pendiente, del más viejo al más nuevo; se detiene en el primer fallo. */
    internal suspend fun enviarPendientes(context: Context) {
        val app = context.applicationContext
        pendientesMutex.withLock {
            var lista = pendientes(app)
            if (lista.isEmpty()) return
            val repo = ConsoleRepository(app)
            while (lista.isNotEmpty()) {
                val p = lista.first()
                try {
                    repo.gpsPost(
                        lat = p.lat,
                        lng = p.lng,
                        speedKmh = null,
                        activityId = p.actividadId,
                        mockLocation = p.mock,
                        enMs = p.enMs,
                    ).close()
                } catch (e: CancellationException) {
                    throw e
                } catch (e: Exception) {
                    if ((e as? retrofit2.HttpException)?.code() == 401) avisarSesionCerrada(app)
                    break
                }
                lista = lista.drop(1)
                guardarPendientes(app, lista)
            }
            if (lista.isEmpty()) quitarAvisoSesion(app)
        }
    }

    // ── Avisos a la persona (canal «Alertas»: se tienen que ver) ─────────────────

    private const val AVISO_REANUDAR_ID = 4712
    private const val AVISO_SESION_ID = 4713
    private const val AVISO_APAGADA_ID = 4714

    private fun notificar(context: Context, id: Int, titulo: String, texto: String, intent: Intent) {
        val app = context.applicationContext
        if (Build.VERSION.SDK_INT >= 33 &&
            ContextCompat.checkSelfPermission(app, Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED
        ) {
            return
        }
        NexaraNotifications.ensureChannels(app)
        val pending = PendingIntent.getActivity(
            app,
            id,
            intent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
        )
        val n = NotificationCompat.Builder(app, NexaraNotifications.CHANNEL_ALERTS)
            .setSmallIcon(R.drawable.ic_stat_nexara)
            .setContentTitle(titulo)
            .setContentText(texto)
            .setStyle(NotificationCompat.BigTextStyle().bigText(texto))
            .setPriority(NotificationCompat.PRIORITY_HIGH)
            .setCategory(NotificationCompat.CATEGORY_REMINDER)
            .setOnlyAlertOnce(true)
            .setAutoCancel(true)
            .setContentIntent(pending)
            .build()
        runCatching { NotificationManagerCompat.from(app).notify(id, n) }
    }

    private fun abrirApp(context: Context) = Intent(context, MainActivity::class.java).apply {
        flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_SINGLE_TOP or Intent.FLAG_ACTIVITY_CLEAR_TOP
    }

    /** Android cerró el GPS de jornada y no se puede volver a abrir sin la app al frente. */
    fun avisarReanudar(context: Context) {
        notificar(
            context,
            AVISO_REANUDAR_ID,
            "Tu jornada sigue abierta",
            "Toca para seguir registrando tu ubicación cada 30 min hasta tu salida.",
            abrirApp(context),
        )
    }

    private fun quitarAvisoReanudar(context: Context) {
        runCatching { NotificationManagerCompat.from(context).cancel(AVISO_REANUDAR_ID) }
    }

    private fun avisarSesionCerrada(context: Context) {
        notificar(
            context,
            AVISO_SESION_ID,
            "Tu sesión de NEXARA se cerró",
            "Entra de nuevo para que tu ubicación de jornada llegue. Lo que se tomó mientras tanto se manda al entrar.",
            abrirApp(context),
        )
    }

    private fun quitarAvisoSesion(context: Context) {
        runCatching { NotificationManagerCompat.from(context).cancel(AVISO_SESION_ID) }
    }

    private fun avisarUbicacionApagada(context: Context) {
        notificar(
            context,
            AVISO_APAGADA_ID,
            "Tu ubicación está apagada",
            "Tu jornada sigue abierta y necesita tu ubicación. Toca para encenderla.",
            Intent(Settings.ACTION_LOCATION_SOURCE_SETTINGS).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK),
        )
    }

    private fun quitarAvisoApagada(context: Context) {
        runCatching { NotificationManagerCompat.from(context).cancel(AVISO_APAGADA_ID) }
    }

    internal const val TAG = "JornadaGps"
    internal const val NOTIFICATION_ID = 4711
}

/** La alarma de cada 30 min. Inexacta pero permitida en reposo: no pide permisos especiales. */
object AlarmaJornada {
    private const val REQUEST = 4715

    private fun pendingIntent(context: Context): PendingIntent =
        PendingIntent.getBroadcast(
            context.applicationContext,
            REQUEST,
            Intent(context.applicationContext, JornadaGpsAlarmReceiver::class.java).setAction(JornadaGps.ACTION_ALARMA),
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
        )

    fun programar(context: Context, enMs: Long) {
        val am = context.getSystemService(Context.ALARM_SERVICE) as? AlarmManager ?: return
        val cuando = SystemClock.elapsedRealtime() + enMs.coerceAtLeast(60_000L)
        try {
            am.setAndAllowWhileIdle(AlarmManager.ELAPSED_REALTIME_WAKEUP, cuando, pendingIntent(context))
        } catch (e: Exception) {
            Log.w(JornadaGps.TAG, "No se pudo programar la alarma del GPS: ${e.message}")
        }
    }

    fun cancelar(context: Context) {
        val am = context.getSystemService(Context.ALARM_SERVICE) as? AlarmManager ?: return
        runCatching { am.cancel(pendingIntent(context)) }
    }
}

/**
 * Suena la alarma: con el servicio vivo, toma el punto; sin él (Android lo cerró), intenta
 * reabrirlo y, si no puede, pide a la persona que toque para reanudar.
 */
class JornadaGpsAlarmReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        val servicio = JornadaGpsService.instancia
        if (servicio != null) {
            servicio.tomarPuntoAhora("alarma")
            return
        }
        if (!JornadaGps.jornadaAbierta(context)) return
        if (!JornadaGps.start(context)) JornadaGps.avisarReanudar(context)
        // Se vuelve a programar: en Android < 12 (o si cambian las condiciones) se recupera solo.
        AlarmaJornada.programar(context, JornadaGpsReglas.CADENCIA_MS)
    }
}

/**
 * Reinicio del teléfono o actualización de la app con la jornada abierta: Android no deja abrir
 * el GPS de jornada desde aquí; queda el aviso para reanudarlo con un toque.
 */
class JornadaGpsBootReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        when (intent.action) {
            Intent.ACTION_BOOT_COMPLETED, Intent.ACTION_MY_PACKAGE_REPLACED -> Unit
            else -> return
        }
        if (!JornadaGps.jornadaAbierta(context)) return
        JornadaGps.avisarReanudar(context)
        AlarmaJornada.programar(context, JornadaGpsReglas.CADENCIA_MS)
    }
}

class JornadaGpsService : Service() {

    companion object {
        /** El servicio vivo, para que la alarma y el latido le pidan un punto sin rearmarlo. */
        @Volatile
        var instancia: JornadaGpsService? = null
            private set

        private val HORA: DateTimeFormatter = DateTimeFormatter.ofPattern("HH:mm")
    }

    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)
    private val repo by lazy { ConsoleRepository(applicationContext) }
    private var client: FusedLocationProviderClient? = null
    private val tomando = Mutex()

    private val callback = object : LocationCallback() {
        override fun onLocationResult(result: LocationResult) {
            val location = result.lastLocation ?: return
            scope.launch { publicarSiToca(location, "gps") }
        }
    }

    /**
     * Interruptor de ubicación, solo mientras corre la jornada: Android avisa cada vez
     * que alguien lo apaga o lo enciende, y cada aviso se reporta ([JornadaGps.reportarEstadoUbicacion]).
     */
    private var receptorUbicacion: BroadcastReceiver? = null

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onCreate() {
        super.onCreate()
        instancia = this
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        if (!JornadaGps.isStart(intent)) {
            stopTracking()
            return START_NOT_STICKY
        }
        if (!JornadaGps.canTrack(this)) {
            // Se le quitó el permiso con la jornada abierta (Android mata el proceso y el
            // servicio vuelve solo): se avisa SIN_PERMISO antes de detenerse.
            JornadaGps.reportarEstadoUbicacion(this)
            stopTracking()
            return START_NOT_STICKY
        }
        if (!goForeground()) {
            // Android 14+ no deja reabrir un servicio de ubicación desde segundo plano (p. ej. al
            // reiniciarlo él mismo): se pide a la persona que toque para reanudar.
            if (JornadaGps.jornadaAbierta(this)) JornadaGps.avisarReanudar(this)
            stopTracking()
            return START_NOT_STICKY
        }
        startTracking()
        // START_STICKY: si el sistema mata el proceso con la jornada abierta, intenta volver solo.
        return START_STICKY
    }

    override fun onDestroy() {
        dejarDeEscucharUbicacion()
        client?.removeLocationUpdates(callback)
        client = null
        JornadaGps.markRunning(false)
        if (instancia === this) instancia = null
        scope.cancel()
        super.onDestroy()
    }

    private fun goForeground(): Boolean = try {
        val notification = buildNotification(JornadaGpsReglas.textoUltimo(horaUltimo()))
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
        if (client == null) {
            val fused = LocationServices.getFusedLocationProviderClient(this)
            // Cada 30 min y SIN mínimo de distancia: con «500 m» quien no se movía no mandaba nada.
            val request = LocationRequest.Builder(Priority.PRIORITY_BALANCED_POWER_ACCURACY, JornadaGpsReglas.CADENCIA_MS)
                .setMinUpdateIntervalMillis(JornadaGpsReglas.ESPACIADO_MINIMO_MS)
                .setMinUpdateDistanceMeters(0f)
                .setWaitForAccurateLocation(false)
                .build()
            try {
                fused.requestLocationUpdates(request, callback, mainLooper)
                client = fused
            } catch (e: Exception) {
                // Sin el pedido continuo quedan la alarma y el latido: no se apaga la jornada por esto.
                Log.w(JornadaGps.TAG, "requestLocationUpdates falló: ${e.message}")
            }
        }
        JornadaGps.markRunning(true)
        escucharUbicacion()
        // Al arrancar se manda el estado actual si no es ENCENDIDA (o si cambió desde
        // lo último que se mandó en esta jornada, si Android reinició el servicio).
        JornadaGps.reportarEstadoUbicacion(this)
        // Primer punto (si el último fue hace más de 20 min) y la alarma de los siguientes.
        tomarPuntoAhora("inicio")
    }

    /**
     * Toma un punto ya, si toca ([JornadaGpsReglas.debeTomarPunto]), y programa la siguiente alarma.
     * La lectura es de GPS fino (hasta 30 s) y, si no contesta, balanceada; sin nada, reintenta
     * a los 5 min. Mantiene el teléfono despierto lo que dura (máx. 1 min).
     */
    fun tomarPuntoAhora(motivo: String) {
        scope.launch {
            if (!tomando.tryLock()) return@launch
            val wake = (getSystemService(Context.POWER_SERVICE) as? PowerManager)
                ?.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "nexara:jornada-gps")
                ?.apply { setReferenceCounted(false); acquire(60_000L) }
            try {
                if (!JornadaGps.jornadaAbierta(this@JornadaGpsService) && JornadaGps.actividadActual(this@JornadaGpsService) == null) {
                    stopTracking()
                    return@launch
                }
                val ahora = System.currentTimeMillis()
                if (!JornadaGpsReglas.debeTomarPunto(JornadaGps.ultimoEnviadoMs(this@JornadaGpsService), ahora)) {
                    // Aun así se reintenta lo que quedó pendiente (la sesión pudo volver).
                    JornadaGps.enviarPendientes(this@JornadaGpsService)
                    programarSiguiente(reintentos = 0)
                    return@launch
                }
                if (!seguirAbierta()) return@launch
                val lectura = if (DeviceLocation.ubicacionEncendida(this@JornadaGpsService)) leerUbicacion() else null
                if (lectura == null) {
                    val n = JornadaGps.reintentos(this@JornadaGpsService) + 1
                    val reintentar = n <= JornadaGpsReglas.REINTENTOS_MAX
                    JornadaGps.guardarReintentos(this@JornadaGpsService, if (reintentar) n else 0)
                    Log.w(JornadaGps.TAG, "Sin lectura de ubicación ($motivo); reintento ${if (reintentar) n else "en 30 min"}")
                    programarSiguiente(reintentos = if (reintentar) n else 0)
                    return@launch
                }
                publicar(lectura)
                programarSiguiente(reintentos = 0)
            } finally {
                runCatching { if (wake?.isHeld == true) wake.release() }
                tomando.unlock()
            }
        }
    }

    /**
     * Con la jornada cerrada en el servidor (salida desde otro lado, cierre automático de las
     * 23:30), el teléfono deja de rastrear. Sin red o con error se sigue: no se sabe.
     */
    private suspend fun seguirAbierta(): Boolean {
        if (!JornadaGps.jornadaAbierta(this)) return true // solo actividad: la apaga su salida
        // Dos lecturas seguidas tienen que decir «cerrada»: una respuesta cortada no apaga la jornada.
        if (jornadaEnServidor() != false || jornadaEnServidor() != false) return true
        Log.i(JornadaGps.TAG, "La jornada ya se cerró en el servidor: se apaga el GPS")
        JornadaGps.stop(this)
        return false
    }

    /** `true`/`false` según el servidor; `null` si no se pudo saber (sin red, error). */
    private suspend fun jornadaEnServidor(): Boolean? = try {
        repo.attendanceCurrent().isOpen == true
    } catch (e: CancellationException) {
        throw e
    } catch (_: NullPointerException) {
        // `attendance/current` contesta null cuando no hay jornada abierta.
        false
    } catch (_: java.io.EOFException) {
        // …o un cuerpo vacío, según cómo lo mande el servidor.
        false
    } catch (_: Exception) {
        null
    }

    private fun programarSiguiente(reintentos: Int) {
        val en = JornadaGpsReglas.siguienteAlarmaEnMs(
            JornadaGps.ultimoEnviadoMs(this),
            System.currentTimeMillis(),
            reintentos,
        )
        AlarmaJornada.programar(this, en)
    }

    @SuppressLint("MissingPermission")
    private suspend fun leerUbicacion(): Location? {
        if (!JornadaGps.canTrack(this)) return null
        val fused = LocationServices.getFusedLocationProviderClient(this)
        val cts = CancellationTokenSource()
        try {
            val fina = CurrentLocationRequest.Builder()
                .setPriority(Priority.PRIORITY_HIGH_ACCURACY)
                .setDurationMillis(30_000L)
                .setMaxUpdateAgeMillis(2 * 60_000L)
                .build()
            withTimeoutOrNull(35_000L) { esperar { fused.getCurrentLocation(fina, cts.token) } }
                ?.takeIf { it.esReal() }?.let { return it }
            val balanceada = CurrentLocationRequest.Builder()
                .setPriority(Priority.PRIORITY_BALANCED_POWER_ACCURACY)
                .setDurationMillis(15_000L)
                .setMaxUpdateAgeMillis(5 * 60_000L)
                .build()
            withTimeoutOrNull(18_000L) { esperar { fused.getCurrentLocation(balanceada, cts.token) } }
                ?.takeIf { it.esReal() }?.let { return it }
            return null
        } finally {
            cts.cancel()
        }
    }

    private suspend fun <T> esperar(block: () -> com.google.android.gms.tasks.Task<T>): T? =
        suspendCancellableCoroutine { cont ->
            try {
                val task = block()
                task.addOnSuccessListener { if (cont.isActive) cont.resume(it) }
                task.addOnFailureListener { if (cont.isActive) cont.resume(null) }
                task.addOnCanceledListener { if (cont.isActive) cont.resume(null) }
            } catch (_: Exception) {
                if (cont.isActive) cont.resume(null)
            }
        }

    /** El (0,0) de un `Location` vacío no es un sitio donde haya estado nadie. */
    private fun Location.esReal(): Boolean {
        if (!latitude.isFinite() || !longitude.isFinite()) return false
        if (latitude == 0.0 && longitude == 0.0) return false
        return kotlin.math.abs(latitude) <= 90.0 && kotlin.math.abs(longitude) <= 180.0
    }

    /** Lo que entrega el GPS continuo: se manda solo si ya pasaron 20 min del último punto. */
    private suspend fun publicarSiToca(location: Location, motivo: String) {
        if (!location.esReal()) return
        if (!tomando.tryLock()) return
        try {
            if (!JornadaGpsReglas.debeTomarPunto(JornadaGps.ultimoEnviadoMs(this), System.currentTimeMillis())) return
            Log.d(JornadaGps.TAG, "Punto por $motivo")
            publicar(location)
            programarSiguiente(reintentos = 0)
        } finally {
            tomando.unlock()
        }
    }

    private suspend fun publicar(location: Location) {
        val speedKmh = if (location.hasSpeed()) (location.speed * 3.6).toDouble() else null
        // El punto viaja marcado si salió de una app de GPS falso. No se descarta aquí: un
        // hueco en el recorrido no se puede leer, un punto marcado sí.
        val punto = JornadaGpsReglas.PuntoPendiente(
            lat = location.latitude,
            lng = location.longitude,
            enMs = System.currentTimeMillis(),
            actividadId = JornadaGps.actividadActual(this),
            mock = location.vieneDeUbicacionSimulada(),
        )
        // Se marca como tomado aunque no llegue: queda pendiente con su hora y no se repite a los segundos.
        JornadaGps.marcarPuntoEnviado(this, punto.enMs)
        JornadaGps.enviarPunto(this, punto, speedKmh)
        actualizarNotificacion()
    }

    private fun horaUltimo(): String? = JornadaGps.ultimoEnviadoMs(this)?.let {
        Instant.ofEpochMilli(it).atZone(ZoneId.systemDefault()).toLocalTime().format(HORA)
    }

    private fun actualizarNotificacion() {
        if (Build.VERSION.SDK_INT >= 33 &&
            ContextCompat.checkSelfPermission(this, Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED
        ) {
            return
        }
        runCatching {
            NotificationManagerCompat.from(this)
                .notify(JornadaGps.NOTIFICATION_ID, buildNotification(JornadaGpsReglas.textoUltimo(horaUltimo())))
        }
    }

    private fun escucharUbicacion() {
        if (receptorUbicacion != null) return
        val receptor = object : BroadcastReceiver() {
            override fun onReceive(context: Context, intent: Intent) {
                // La salida pudo registrarse antes de que el servicio se detenga: sin jornada, nada.
                if (JornadaGps.isRunning()) JornadaGps.reportarEstadoUbicacion(context)
                // Se volvió a encender después de un intento sin señal: se mide ya.
                if (DeviceLocation.ubicacionEncendida(context) && JornadaGps.reintentos(context) > 0) {
                    tomarPuntoAhora("ubicacion-encendida")
                }
            }
        }
        try {
            // Exportado como pide Android para avisos del sistema; PROVIDERS_CHANGED es
            // protegido, así que ninguna otra app puede mandarlo.
            ContextCompat.registerReceiver(
                this,
                receptor,
                IntentFilter(LocationManager.PROVIDERS_CHANGED_ACTION),
                ContextCompat.RECEIVER_EXPORTED,
            )
            receptorUbicacion = receptor
        } catch (e: Exception) {
            Log.w(JornadaGps.TAG, "No se pudo escuchar el interruptor de ubicación: ${e.message}")
        }
    }

    private fun dejarDeEscucharUbicacion() {
        val receptor = receptorUbicacion ?: return
        receptorUbicacion = null
        runCatching { unregisterReceiver(receptor) }
    }

    private fun stopTracking() {
        dejarDeEscucharUbicacion()
        JornadaGps.markRunning(false)
        client?.removeLocationUpdates(callback)
        client = null
        stopForeground(STOP_FOREGROUND_REMOVE)
        stopSelf()
    }

    /** `Location.isMock` (API 31+) o `isFromMockProvider`; ver [MockLocation]. */
    @Suppress("DEPRECATION")
    private fun Location.vieneDeUbicacionSimulada(): Boolean = MockLocation.isSimulated(
        sdkInt = Build.VERSION.SDK_INT,
        isMock = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            runCatching { isMock }.getOrNull()
        } else {
            null
        },
        isFromMockProvider = runCatching { isFromMockProvider }.getOrNull(),
    )

    private fun buildNotification(texto: String): Notification {
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
            .setContentText(texto)
            // Una sola frase también al expandirla: «… cada 30 min hasta tu salida.» ya dice cuándo termina.
            .setStyle(NotificationCompat.BigTextStyle().bigText(texto))
            .setOngoing(true)
            .setSilent(true)
            .setOnlyAlertOnce(true)
            .setPriority(NotificationCompat.PRIORITY_LOW)
            .setCategory(NotificationCompat.CATEGORY_SERVICE)
            .setContentIntent(pending)
            .build()
    }
}
