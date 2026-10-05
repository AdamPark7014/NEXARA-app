package mx.nexara.mobile.nativeapp.push

import android.app.ActivityManager
import android.app.NotificationManager
import android.app.usage.UsageStatsManager
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.provider.Settings
import androidx.core.app.NotificationManagerCompat

/**
 * Lo que en el propio teléfono impide que un aviso suene o llegue a tiempo. El servidor
 * manda cada push en el momento; si llega tarde o mudo es casi siempre esto: avisos
 * apagados, un tipo de aviso silenciado (varias marcas crean los canales nuevos sin
 * sonido ni globo) o la app restringida por el ahorro de batería.
 */
object NotificationHealth {
    enum class Problema { AVISOS_APAGADOS, CANAL_SILENCIADO, BATERIA_RESTRINGIDA }

    private val CANALES_CON_SONIDO = listOf(
        NexaraNotifications.CHANNEL_CHAT,
        NexaraNotifications.CHANNEL_OPS,
        NexaraNotifications.CHANNEL_APPROVALS,
        NexaraNotifications.CHANNEL_ATTENDANCE,
        NexaraNotifications.CHANNEL_ALERTS,
    )

    fun problema(context: Context): Problema? {
        val app = context.applicationContext
        return when {
            !NotificationManagerCompat.from(app).areNotificationsEnabled() -> Problema.AVISOS_APAGADOS
            canalSilenciado(app) != null -> Problema.CANAL_SILENCIADO
            bateriaRestringida(app) -> Problema.BATERIA_RESTRINGIDA
            else -> null
        }
    }

    /** Primer canal de avisos que ya no suena ni sale como globo (importancia menor que alta). */
    fun canalSilenciado(context: Context): String? {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return null
        NexaraNotifications.ensureChannels(context)
        val nm = context.getSystemService(NotificationManager::class.java) ?: return null
        return CANALES_CON_SONIDO.firstOrNull { id ->
            val canal = nm.getNotificationChannel(id)
            canal != null && canal.importance < NotificationManager.IMPORTANCE_HIGH
        }
    }

    /**
     * «Restringida» en Batería, o en el grupo de espera restringido. La optimización normal
     * («Optimizada») no retrasa los push de prioridad alta, así que no cuenta.
     */
    fun bateriaRestringida(context: Context): Boolean {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.P) return false
        val am = context.getSystemService(ActivityManager::class.java)
        if (am?.isBackgroundRestricted == true) return true
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
            val usm = context.getSystemService(UsageStatsManager::class.java)
            val bucket = runCatching { usm?.appStandbyBucket }.getOrNull() ?: return false
            return bucket >= UsageStatsManager.STANDBY_BUCKET_RESTRICTED
        }
        return false
    }

    /** Pantalla de Ajustes donde se arregla [problema]. */
    fun ajustes(context: Context, problema: Problema): Intent {
        val pkg = context.packageName
        val canal = if (problema == Problema.CANAL_SILENCIADO) canalSilenciado(context) else null
        val intent = when {
            problema == Problema.BATERIA_RESTRINGIDA || Build.VERSION.SDK_INT < Build.VERSION_CODES.O ->
                Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, Uri.parse("package:$pkg"))
            canal != null ->
                Intent(Settings.ACTION_CHANNEL_NOTIFICATION_SETTINGS)
                    .putExtra(Settings.EXTRA_APP_PACKAGE, pkg)
                    .putExtra(Settings.EXTRA_CHANNEL_ID, canal)
            else ->
                Intent(Settings.ACTION_APP_NOTIFICATION_SETTINGS).putExtra(Settings.EXTRA_APP_PACKAGE, pkg)
        }
        return intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
    }
}
