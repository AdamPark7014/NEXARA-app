package mx.nexara.mobile.nativeapp.ui.console.activities

/**
 * Semáforo, plan contra real y aceptación de una actividad (contrato B).
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

    /** El motivo del rechazo lo pide el API con 10 caracteres mínimo. */
    const val MIN_MOTIVO_RECHAZO = 10

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

    fun estaPendienteDeAceptar(aceptacion: String?): Boolean =
        aceptacion?.trim()?.uppercase() == PENDIENTE

    fun fueRechazada(aceptacion: String?): Boolean =
        aceptacion?.trim()?.uppercase() == RECHAZADA

    /** «Rechazada: no tengo la llave del site» (sin motivo, solo «Rechazada»). */
    fun rechazadaTexto(motivo: String?): String {
        val m = motivo?.trim().orEmpty()
        return if (m.isEmpty()) "Rechazada" else "Rechazada: $m"
    }

    /** «Asignada por Luis»; `null` si nadie la asignó (auto-asignada). */
    fun asignadaPorTexto(nombre: String?): String? =
        nombre?.trim()?.takeIf { it.isNotEmpty() }?.let { "Asignada por ${CoreActivityRules.shortName(it)}" }

    fun motivoRechazoOk(motivo: String?): Boolean =
        motivoLimpio(motivo).length >= MIN_MOTIVO_RECHAZO

    fun motivoLimpio(motivo: String?): String = motivo?.trim().orEmpty()
}
