package mx.nexara.mobile.nativeapp.push

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent

/**
 * Solo en builds debug: muestra un aviso como si hubiera llegado por FCM, para revisar diseño,
 * canales y apilado sin sesión ni Firebase. Cada extra de texto es una clave del payload:
 *
 *   adb shell am broadcast -a mx.nexara.DEBUG_PUSH -n mx.nexara.mobile.nativeapp/.push.DebugPushReceiver \
 *     --es kind chat --es title "Luis" --es body "¿Ya llegaste?" --es thread_id chat-7 --es sender_name "Luis Pérez"
 */
class DebugPushReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        val extras = intent.extras ?: return
        val data = extras.keySet().associateWith { key -> extras.get(key)?.toString().orEmpty() }
        NexaraPushRenderer.render(context, PushPayload.from(data, fallbackSentAt = System.currentTimeMillis()))
    }
}
