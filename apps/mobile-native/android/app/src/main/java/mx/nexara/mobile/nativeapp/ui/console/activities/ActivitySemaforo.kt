package mx.nexara.mobile.nativeapp.ui.console.activities

/**
 * Semáforo, plan contra real e inicio de una actividad (contrato B).
 *
 * El semáforo lo calcula el servidor (`semaforo: rojo | amarillo | verde`):
 * aquí solo se le pone nombre y color. Lo que no venga se ignora — la app
 * contra la API de hoy se ve igual que antes.
 *
 * Sin Android: se prueba en la JVM (`ActivitySemaforoTest`).
 */
object ActivitySemaforo {

    const val ROJO = "rojo"
    const val AMARILLO = "amarillo"
    const val VERDE = "verde"

    const val PENDIENTE = "PENDIENTE"
    const val ACEPTADA = "ACEPTADA"
    const val RECHAZADA = "RECHAZADA"

    /**
     * Regla del dueño (18-09): «El asignado de realizar una tarea/actividad no
     * tiene opción de aceptar o rechazar las actividades asignadas, únicamente
     * iniciarlas». Esta es la única acción; marca la hora real de inicio.
     */
    const val ACCION_INICIAR = "Iniciar actividad"

    /** Chip mientras no la ha iniciado. */
    const val CHIP_SIN_INICIAR = "Sin iniciar"

    data class Luz(val clave: String, val etiqueta: String, val color: Long)

    /** `null` cuando el API no manda semáforo (app vieja contra API vieja). */
    fun luz(semaforo: String?): Luz? = when (semaforo?.trim()?.lowercase()) {
        ROJO -> Luz(ROJO, "Urge", CoreActivityRules.ROJO)
        AMARILLO -> Luz(AMARILLO, "Atención", CoreActivityRules.NARANJA)
        VERDE -> Luz(VERDE, "En tiempo", CoreActivityRules.VERDE)
        else -> null
    }

    /**
     * «Plan 2 h · real 2 h 30 min». `null` cuando no hay plan ni tiempo real
     * que enseñar; con plan y sin empezar dice solo el plan.
     */
    fun planRealTexto(minutosPlan: Double?, minutosReales: Double?): String? {
        val plan = minutosPlan?.takeIf { it > 0 }
        val real = minutosReales?.takeIf { it > 0 }
        return when {
            plan != null && real != null ->
                "Plan ${CoreActivityRules.formatMinutes(plan)} · real ${CoreActivityRules.formatMinutes(real)}"
            plan != null -> "Plan ${CoreActivityRules.formatMinutes(plan)}"
            real != null -> "Real ${CoreActivityRules.formatMinutes(real)}"
            else -> null
        }
    }

    /** Rojo cuando ya pasó del plan; si no, el gris de siempre. */
    fun planRealColor(excedida: Boolean?): Long =
        if (excedida == true) CoreActivityRules.ROJO else CoreActivityRules.GRIS

    /**
     * ¿Se ofrece «Iniciar actividad»? Mientras no tenga hora real de inicio, aunque
     * la hubiera aceptado o rechazado antes de la regla. No a quien solo reparte un
     * despacho ni a lo ya cerrado. `aceptacion == null` = API anterior al contrato:
     * no se sabe, y la foto de entrada sigue marcando el inicio como siempre.
     */
    fun puedeIniciar(
        aceptacion: String?,
        inicioRealAt: String?,
        despachador: Boolean?,
        estatus: String?,
    ): Boolean {
        if (aceptacion.isNullOrBlank()) return false
        if (despachador == true) return false
        if (CERRADA.containsMatchIn(estatus.orEmpty())) return false
        return inicioRealAt.isNullOrBlank()
    }

    /** Para quien asignó: todavía no la inicia (misma regla, sin despacho). */
    fun sinIniciar(aceptacion: String?, inicioRealAt: String?, estatus: String?): Boolean =
        puedeIniciar(aceptacion, inicioRealAt, despachador = false, estatus = estatus)

    /** Histórico: rechazos de antes de la regla del 18-09 (ya no se puede rechazar). */
    fun fueRechazada(aceptacion: String?): Boolean =
        aceptacion?.trim()?.uppercase() == RECHAZADA

    /** Lo lee quien asignó: «Rechazada: no tengo la llave del site». */
    fun rechazadaTexto(motivo: String?): String {
        val m = motivo?.trim().orEmpty()
        return if (m.isEmpty()) "Rechazada" else "Rechazada: $m"
    }

    private val CERRADA = Regex("finalizada|completada|cancelada|aprobada", RegexOption.IGNORE_CASE)

    /** «Asignada por Luis»; `null` si nadie la asignó (auto-asignada). */
    fun asignadaPorTexto(nombre: String?): String? =
        nombre?.trim()?.takeIf { it.isNotEmpty() }?.let { "Asignada por ${CoreActivityRules.shortName(it)}" }
}
