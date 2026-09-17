package mx.nexara.mobile.nativeapp.push

import androidx.annotation.DrawableRes
import mx.nexara.mobile.nativeapp.R

/**
 * Glifo y color de insignia por tipo de evento (`icon` del payload FCM), para la
 * insignia circular de [NotificationAvatars] — espejo de los íconos que usa la
 * app en pantalla (ver `ui/enterprise/NxIcons.kt`), pero como vector blanco fijo
 * para rasterizar en la notificación (`res/drawable/ic_nx_*`).
 */
internal object NotificationEventIcons {
    val BLUE: Int = 0xFF2563EB.toInt()
    val AMBER: Int = 0xFFD97706.toInt()
    val GREEN: Int = 0xFF16A34A.toInt()
    val RED: Int = 0xFFDC2626.toInt()

    private val GLYPHS: Map<String, Int> = mapOf(
        "entrada" to R.drawable.ic_nx_login,
        "entrada_tarde" to R.drawable.ic_nx_login,
        "salida" to R.drawable.ic_nx_logout,
        "comida_sale" to R.drawable.ic_nx_restaurant,
        "comida_regresa" to R.drawable.ic_nx_restaurant,
        "comida_tarde" to R.drawable.ic_nx_restaurant,
        "comida_aprobada" to R.drawable.ic_nx_task_alt,
        "comida_rechazada" to R.drawable.ic_nx_undo,
        "actividad_nueva" to R.drawable.ic_nx_assignment,
        "actividad_inicio" to R.drawable.ic_nx_play_circle,
        "fotos" to R.drawable.ic_nx_photo_camera,
        "documento" to R.drawable.ic_nx_description,
        "formulario" to R.drawable.ic_nx_fact_check,
        "reasignada" to R.drawable.ic_nx_swap_horiz,
        "reprogramada" to R.drawable.ic_nx_event_repeat,
        "despacho" to R.drawable.ic_nx_send,
        "por_revisar" to R.drawable.ic_nx_rate_review,
        "correccion" to R.drawable.ic_nx_replay,
        "aprobada" to R.drawable.ic_nx_task_alt,
        "devuelta" to R.drawable.ic_nx_undo,
        "finalizada" to R.drawable.ic_nx_task_alt,
        "atraso" to R.drawable.ic_nx_hourglass_top,
        "vencida" to R.drawable.ic_nx_error_outline,
        "chat" to R.drawable.ic_nx_chat,
        "mencion" to R.drawable.ic_nx_alternate_email,
        "seguridad" to R.drawable.ic_nx_shield,
        "aviso" to R.drawable.ic_nx_notifications,
    )

    private val AMBER_KEYS = setOf("entrada_tarde", "atraso", "comida_tarde")
    private val GREEN_KEYS = setOf("aprobada", "finalizada", "comida_aprobada")
    private val RED_KEYS = setOf("devuelta", "vencida", "comida_rechazada", "seguridad")

    @DrawableRes
    fun glyphRes(icon: String): Int = GLYPHS[icon] ?: R.drawable.ic_nx_notifications

    fun color(icon: String): Int = when (icon) {
        in AMBER_KEYS -> AMBER
        in GREEN_KEYS -> GREEN
        in RED_KEYS -> RED
        else -> BLUE
    }
}
