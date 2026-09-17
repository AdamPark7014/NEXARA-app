package mx.nexara.mobile.nativeapp.ui.console.activities

/**
 * «Vas a empezar esta, pero tienes otra de más prioridad sin terminar»
 * (contrato B).
 *
 * No bloquea nada: el API tampoco. Solo sirve para preguntar, antes de la foto
 * de entrada, si quiere decir por qué la hace primero (`justificacionOrden`).
 *
 * Sin Android: se prueba en la JVM (`ActivityPriorityJumpTest`).
 */
object ActivityPriorityJump {

    /** Una actividad abierta del día, vista desde esta regla. */
    data class Pendiente(
        val id: Long,
        val prioridad: String?,
        /** Ya tiene foto de entrada / `inicioRealAt`. */
        val iniciada: Boolean = false,
        val terminada: Boolean = false,
    )

    /** ALTA = 0 · MEDIA = 1 · BAJA = 2. Acepta los textos viejos («urgente», «Alta»). */
    fun rango(prioridad: String?): Int = when (prioridad?.trim()?.lowercase()) {
        "alta", "urgente" -> 0
        "baja" -> 2
        else -> 1
    }

    /**
     * La de más prioridad que sigue pendiente, o `null` si no hay ninguna por
     * encima de la que se va a empezar. Entre iguales no hay salto: solo cuenta
     * la que está **estrictamente** más arriba.
     */
    fun mayorPendiente(
        actualId: Long,
        actualPrioridad: String?,
        otras: List<Pendiente>,
    ): Pendiente? {
        val actual = rango(actualPrioridad)
        return otras
            .filter { it.id != actualId && !it.iniciada && !it.terminada && rango(it.prioridad) < actual }
            .minByOrNull { rango(it.prioridad) }
    }

    /** «“Cambio de disco” es de prioridad alta y sigue sin empezar.» */
    fun aviso(titulo: String?, prioridad: String?): String {
        val nombre = titulo?.trim()?.takeIf { it.isNotEmpty() }?.let { "«$it»" } ?: "Otra actividad"
        val etiqueta = when (rango(prioridad)) {
            0 -> "prioridad alta"
            2 -> "prioridad baja"
            else -> "prioridad media"
        }
        return "$nombre es de $etiqueta y sigue sin empezar."
    }
}
