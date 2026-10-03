package mx.nexara.mobile.nativeapp.ui.console.activities

import mx.nexara.mobile.nativeapp.data.api.MyActivityRefDto

/**
 * Sesión de trabajo de una actividad: «En pausa», «Reanudar» y «Pausar».
 * Espejo de `apps/web/lib/sesion-actividad.ts`.
 *
 * El reloj ya no corre de corrido desde que se inicia: corre por sesiones. Se
 * detiene con una pausa (propia o del jefe), al checar salida, a las 12 horas o al
 * terminar el día. «En pausa» no es un estatus (la actividad sigue «En Proceso»):
 * lo dicen estos campos, que una API anterior no manda.
 */
data class SesionActividad(
    val enCurso: Boolean? = null,
    val enPausa: Boolean? = null,
    /** FIN | PAUSA | SALIDA | TOPE_12H | CORTE_DIA */
    val pausaTipo: String? = null,
    val pausadaAt: String? = null,
    val pausadaPor: MyActivityRefDto? = null,
    val motivoPausa: String? = null,
    val sesionAbiertaDesde: String? = null,
)

object SesionActividadRules {
    const val MOTIVO_PAUSA_MIN = 10
    const val MOTIVO_PAUSA_MAX = 500

    const val TITULO_PAUSA_PROPIA = "Pausar actividad"
    const val TEXTO_PAUSA_PROPIA =
        "Tu reloj se detiene en esta actividad; sigue «En Proceso» y la reanudas cuando vuelvas a ella."
    const val AYUDA_REANUDAR =
        "Tu reloj vuelve a correr. Se detiene al pausar, al checar salida, a las 12 h o al terminar el día."
    const val PLACEHOLDER_MOTIVO_JEFE = "Ej. Salió una falla urgente en el cliente; que la atienda primero."

    private val CERRADA = Regex("finalizada|completada|cancelada|aprobada", RegexOption.IGNORE_CASE)

    fun cerrada(estatus: String?): Boolean = CERRADA.containsMatchIn(estatus.orEmpty())

    /** Nombre y primer apellido (o segundo nombre): «La pausó Juan Pérez». */
    fun primerNombre(nombre: String?): String =
        nombre.orEmpty().trim().split(Regex("\\s+")).filter { it.isNotEmpty() }.take(2).joinToString(" ")

    /**
     * Una línea que explica la pausa: quién y por qué, o qué la detuvo. Null si no está en pausa.
     * [propia] cambia la persona del verbo: «tu salida» para quien la ejecuta, «su salida» para su jefe.
     */
    fun textoPausa(s: SesionActividad, miId: Long? = null, propia: Boolean = true): String? {
        if (s.enPausa != true) return null
        val motivo = s.motivoPausa?.trim().orEmpty()
        return when (s.pausaTipo) {
            "SALIDA" -> if (propia) "Se detuvo al marcar tu salida." else "Se detuvo al marcar su salida."
            "TOPE_12H" -> "Se detuvo sola al cumplir 12 horas."
            "CORTE_DIA" -> "Se detuvo sola al terminar el día."
            else -> {
                val quien = s.pausadaPor
                val yo = quien?.id != null && miId != null && quien.id == miId
                val sujeto = when {
                    yo -> "La pausaste"
                    quien != null -> "La pausó ${primerNombre(quien.nombre)}".trimEnd()
                    else -> "Está en pausa"
                }
                if (motivo.isNotEmpty()) "$sujeto: $motivo" else "$sujeto."
            }
        }
    }

    /** ¿Se pinta «Reanudar»? Solo a quien la ejecuta, con el reloj detenido y la actividad abierta. */
    fun puedeReanudar(s: SesionActividad, despachador: Boolean, estatus: String?): Boolean {
        if (s.enPausa != true || despachador) return false
        return !cerrada(estatus)
    }

    /** ¿Se pinta «Pausar»? Solo hay algo que pausar mientras el reloj corre. */
    fun puedePausar(s: SesionActividad, estatus: String?): Boolean =
        s.enCurso == true && !cerrada(estatus)

    /** Error del motivo que escribe el jefe, o null si alcanza. */
    fun errorMotivoPausa(texto: String): String? {
        val n = texto.trim().length
        if (n < MOTIVO_PAUSA_MIN) return "Escribe por qué la pausas (mínimo $MOTIVO_PAUSA_MIN caracteres)."
        if (n > MOTIVO_PAUSA_MAX) return "El motivo no puede pasar de $MOTIVO_PAUSA_MAX caracteres."
        return null
    }

    /** El motivo propio es opcional, pero tampoco pasa del tope. */
    fun errorMotivoPropio(texto: String): String? =
        if (texto.trim().length > MOTIVO_PAUSA_MAX) "El motivo no puede pasar de $MOTIVO_PAUSA_MAX caracteres." else null

    /** «Reloj corriendo desde las 09:30.»; sin hora legible, solo «Reloj corriendo.». */
    fun textoCorriendo(horaLocal: String?): String =
        if (horaLocal.isNullOrBlank()) "Reloj corriendo." else "Reloj corriendo desde las $horaLocal."

    /** Aviso tras pausar a alguien de su equipo. */
    fun avisoPausaDeEquipo(nombre: String?): String {
        val quien = primerNombre(nombre)
        return if (quien.isEmpty()) "Pausada. Ya recibió el aviso." else "Pausada. $quien ya recibió el aviso."
    }
}
