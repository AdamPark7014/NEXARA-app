package mx.nexara.mobile.nativeapp.ui.console.activities

import mx.nexara.mobile.nativeapp.data.api.TiemposTipicosDto
import mx.nexara.mobile.nativeapp.data.api.TipicoDto

/**
 * Complejidad al asignar y el tiempo típico del tipo de trabajo (API `ai/complejidad/tiempos` y `sugerir`).
 * Espejo de apps/web/lib/complejidad.ts y components/ops/ComplejidadCampo.tsx: la IA sugiere un
 * nivel; quien asigna decide y las dos quedan guardadas en la actividad (ComplejidadTest).
 */
object Complejidad {
    data class Nivel(val id: String, val label: String, val ayuda: String, val definicion: String)

    val NIVELES: List<Nivel> = listOf(
        Nivel("BASICA", "Básica", "Rutina corta", "Rutina corta y conocida, un solo punto o equipo"),
        Nivel("ESTANDAR", "Estándar", "Lo normal", "Lo normal de este tipo de trabajo"),
        Nivel(
            "COMPLEJA", "Compleja", "Más volumen",
            "Más volumen o más difícil: varios puntos, altura, falla sin causa clara o coordinar con otros",
        ),
        Nivel(
            "CRITICA", "Crítica", "Cliente detenido",
            "El cliente está detenido o hay riesgo: sistema caído, incidente o plazo de horas",
        ),
    )

    /** Espera tras la última tecla antes de pedir la sugerencia (una llamada por título, no por letra). */
    const val ESPERA_SUGERENCIA_MS = 900L

    /** Con menos letras en el título no se pregunta a la IA. */
    const val MIN_TITULO = 6

    /** Tope de 12 h por actividad, como la rueda de la web. */
    const val TOPE_MIN = 720

    fun nivel(id: String?): Nivel? = NIVELES.firstOrNull { it.id == id }

    fun esComplejidad(id: String?): Boolean = nivel(id) != null

    private val SERVICIO_LABEL = mapOf(
        "PREVENTIVO" to "Servicio preventivo",
        "CORRECTIVO" to "Servicio correctivo",
        "EMERGENCIA" to "Servicio de emergencia",
        "INSTALACION" to "Servicio de instalación",
    )

    /** Subtipo de tarea (etiqueta del chip) o tipo de servicio; null en los demás tipos. */
    fun tipoParaComplejidad(kind: String, form: CoreActivityKinds.FormState): String? = when (kind) {
        CoreActivityKinds.TAREA -> CoreActivityKinds.tareaTipo(form)
            .takeIf { it.isNotEmpty() && it != CoreActivityKinds.TAREA_OTRO }
            ?.let { form.ticketTypeCustom }
        CoreActivityKinds.SERVICIO -> form.ticketType
        else -> null
    }

    /** En tarea, después de elegir su tipo; en los demás tipos, siempre. */
    fun visible(kind: String, form: CoreActivityKinds.FormState): Boolean =
        kind.isNotEmpty() && (kind != CoreActivityKinds.TAREA || tipoParaComplejidad(kind, form) != null)

    /** «Instalación», «Servicio correctivo», «Obra»: el tipo de trabajo como se lee en la pista. */
    fun etiquetaTipoTrabajo(kind: String, tipo: String?): String = when {
        kind == CoreActivityKinds.TAREA && !tipo.isNullOrEmpty() -> tipo
        kind == CoreActivityKinds.SERVICIO -> SERVICIO_LABEL[tipo ?: "PREVENTIVO"] ?: "Servicio"
        kind.isNotEmpty() -> kind.replaceFirstChar { it.uppercaseChar() }
        else -> "este tipo"
    }

    /** «3 h 40 min» (`formatoMinutos` de la web). */
    fun formatoMinutos(min: Int): String {
        val total = min.coerceAtLeast(0)
        val h = total / 60
        val m = total % 60
        return when {
            h <= 0 -> "$m min"
            m == 0 -> "$h h"
            else -> "$h h $m min"
        }
    }

    data class Tipico(val minutos: Int, val muestras: Int, val delNivel: Boolean)

    private fun TiemposTipicosDto.delNivel(id: String): TipicoDto? = porComplejidad?.get(id)

    /** Minutos típicos de un nivel, o null si aún no junta 3 anteriores. */
    fun minutosDelNivel(t: TiemposTipicosDto?, id: String): Int? = t?.delNivel(id)?.medianaMin

    /**
     * Lo típico para la complejidad elegida; si ese nivel aún no junta 3 anteriores, el del tipo
     * completo (y se dice).
     */
    fun tipicoPara(t: TiemposTipicosDto?, elegida: String?): Tipico? {
        if (t == null) return null
        val nivel = elegida?.takeIf { esComplejidad(it) }?.let { t.delNivel(it) }
        val min = nivel?.medianaMin
        if (min != null) return Tipico(min, nivel.muestras ?: 0, delNivel = true)
        val total = t.total?.medianaMin ?: return null
        return Tipico(total, t.total.muestras ?: 0, delNivel = false)
    }

    /** «Lo típico en Instalación · Compleja: 3 h 40 min (9 anteriores).» */
    fun textoTipico(tipoLabel: String, elegida: String?, tipico: Tipico?): String? {
        if (tipico == null) return null
        val n = if (tipico.delNivel) nivel(elegida)?.let { " · ${it.label}" }.orEmpty() else ""
        val cuantas = "${tipico.muestras} anterior${if (tipico.muestras == 1) "" else "es"}"
        return "Lo típico en $tipoLabel$n: ${formatoMinutos(tipico.minutos)} ($cuantas)."
    }

    /** Lo que cambia en el formulario al llegar la sugerencia: el nivel solo si nadie eligió a mano. */
    fun aplicarSugerencia(
        form: CoreActivityKinds.FormState,
        sugerida: String,
        elegidaAMano: Boolean,
    ): CoreActivityKinds.FormState =
        if (elegidaAMano) form.copy(complejidadSugerida = sugerida) else form.copy(complejidad = sugerida, complejidadSugerida = sugerida)

    /** Texto de la sugerencia bajo los niveles. */
    fun textoSugerencia(sugerida: String, motivo: String?, elegida: String?): String {
        val label = nivel(sugerida)?.label ?: sugerida
        val porQue = motivo?.trim()?.trimEnd('.')?.takeIf { it.isNotEmpty() }?.let { "$it. " }.orEmpty()
        val cierre = if (!elegida.isNullOrEmpty() && elegida != sugerida) {
            "Elegiste otra: quedan las dos registradas."
        } else {
            "Tú decides; si la cambias, queda registrado."
        }
        return "Sugerencia: $label. $porQue$cierre"
    }

    /** Renglón del detalle: «Compleja» y, si la IA sugirió otra, «La IA sugirió crítica». */
    fun detalle(complejidad: String?, sugerida: String?): Pair<String, String?>? {
        val elegida = nivel(complejidad) ?: return null
        val ia = nivel(sugerida)?.takeIf { it.id != elegida.id }?.let { "La IA sugirió ${it.label.lowercase()}" }
        return elegida.label to ia
    }
}
