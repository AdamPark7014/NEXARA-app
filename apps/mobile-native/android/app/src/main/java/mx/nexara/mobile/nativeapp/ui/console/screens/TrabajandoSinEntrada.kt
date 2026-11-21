package mx.nexara.mobile.nativeapp.ui.console.screens

/**
 * Sin checada pero con actividad en curso (espejo de `apps/web/lib/trabajando-sin-entrada.ts`).
 * La vista de Asistencias del jefe marca en rojo «Trabajando sin entrada».
 */
object TrabajandoSinEntrada {
    const val ETIQUETA = "Trabajando sin entrada"

    data class BoardHint(
        val id: Long,
        val entradaHoyAt: String? = null,
        val currentActivity: Any? = null,
        val openActivities: List<Any>? = null,
        val status: String? = null,
    )

    fun ids(boardUsers: List<BoardHint>): Set<Long> {
        val out = linkedSetOf<Long>()
        for (u in boardUsers) {
            val sinEntrada = u.entradaHoyAt.isNullOrBlank()
            val conActividad =
                u.currentActivity != null ||
                    !u.openActivities.isNullOrEmpty() ||
                    u.status == "activo" ||
                    u.status == "atrasado"
            if (sinEntrada && conActividad) out += u.id
        }
        return out
    }

    fun etiqueta(userId: Long, estadoAusente: Boolean, ids: Set<Long>): String? {
        if (!estadoAusente) return null
        return if (ids.contains(userId)) ETIQUETA else null
    }
}
