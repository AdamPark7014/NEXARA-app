package mx.nexara.mobile.nativeapp.ui.console.comidas

import java.time.Instant
import mx.nexara.mobile.nativeapp.data.api.ComidaFilaDto
import mx.nexara.mobile.nativeapp.data.api.ComidaMiDiaDto
import mx.nexara.mobile.nativeapp.data.api.ComidaRegistroDto
import mx.nexara.mobile.nativeapp.data.api.ComidaResumenDto
import mx.nexara.mobile.nativeapp.ui.console.activities.CoreActivityRules
import mx.nexara.mobile.nativeapp.ui.console.activities.CoreActivityRules.Tone

/**
 * Reglas de la hora de comida sin Android — espejo de
 * apps/web/components/asistencias/ComidasPanel.tsx (ComidasRulesTest).
 */
object ComidasRules {
    const val MIN_JUSTIFICACION = 5
    const val SALIDA = "salida"
    const val REGRESO = "regreso"

    enum class Filtro(val label: String) {
        TODOS("Todos"),
        PENDIENTES("Por aprobar"),
        DESTIEMPO("A destiempo"),
        COMIENDO("En comida"),
        SIN("Sin registrar"),
    }

    fun conteo(filtro: Filtro, resumen: ComidaResumenDto?): Int? {
        val r = resumen ?: return null
        return when (filtro) {
            Filtro.TODOS -> r.total
            Filtro.PENDIENTES -> r.pendientes
            Filtro.DESTIEMPO -> r.aDestiempo
            Filtro.COMIENDO -> r.enComida
            Filtro.SIN -> if (r.total != null && r.registraron != null) r.total - r.registraron else null
        }
    }

    fun filtrar(filas: List<ComidaFilaDto>, filtro: Filtro): List<ComidaFilaDto> = when (filtro) {
        Filtro.TODOS -> filas
        Filtro.PENDIENTES -> filas.filter { it.registro?.revisionEstado == "PENDIENTE" }
        Filtro.DESTIEMPO -> filas.filter { !it.registro?.revisionEstado.isNullOrBlank() }
        Filtro.COMIENDO -> filas.filter { it.registro != null && it.registro.checkoutTime.isNullOrBlank() }
        Filtro.SIN -> filas.filter { it.registro == null }
    }

    /** null cuando fue a tiempo (no requiere aprobación). */
    fun estadoRevision(estado: String?): Tone? = when {
        estado.isNullOrBlank() -> null
        estado == "APROBADA" -> Tone("✅ Justificación aprobada", CoreActivityRules.VERDE)
        estado == "RECHAZADA" -> Tone("❌ Justificación rechazada", CoreActivityRules.ROJO)
        else -> Tone("⏳ Por aprobar", CoreActivityRules.NARANJA)
    }

    fun estadoFila(registro: ComidaRegistroDto?): Tone = when {
        registro == null -> Tone("Sin registrar")
        registro.checkoutTime.isNullOrBlank() -> Tone("🍽️ En comida", CoreActivityRules.AZUL)
        else -> Tone("✓ Completa", CoreActivityRules.VERDE)
    }

    /** Color del borde izquierdo de una fila del equipo. */
    fun colorFila(registro: ComidaRegistroDto?): Long? = estadoRevision(registro?.revisionEstado)?.color
        ?: when {
            registro == null -> null
            registro.checkoutTime.isNullOrBlank() -> CoreActivityRules.AZUL
            else -> CoreActivityRules.VERDE
        }

    /** Desfase entre el reloj del servidor y el del teléfono. */
    fun offsetMs(ahoraServidor: String?, nowMs: Long): Long =
        CoreActivityRules.parseInstant(ahoraServidor)?.toEpochMilli()?.minus(nowMs) ?: 0L

    /** La ventana se evalúa con la hora del servidor; sin ventana, manda la bandera del API. */
    fun salidaADestiempo(mi: ComidaMiDiaDto, serverNowMs: Long): Boolean {
        val inicio = CoreActivityRules.parseInstant(mi.ventana?.inicio)?.toEpochMilli()
        val fin = CoreActivityRules.parseInstant(mi.ventana?.fin)?.toEpochMilli()
        if (inicio == null || fin == null) return mi.salidaADestiempo == true
        return serverNowMs < inicio || serverNowMs > fin
    }

    fun regresoADestiempo(mi: ComidaMiDiaDto, serverNowMs: Long): Boolean {
        val limite = CoreActivityRules.parseInstant(mi.ventana?.regresoLimite)?.toEpochMilli()
            ?: return mi.regresoADestiempo == true
        return serverNowMs > limite
    }

    fun minutosDesde(iso: String?, serverNowMs: Long): Long {
        val desde = CoreActivityRules.parseInstant(iso)?.toEpochMilli() ?: return 0
        return ((serverNowMs - desde) / 60_000.0).let { Math.round(it) }.coerceAtLeast(0)
    }

    fun justificacionValida(texto: String?): Boolean = (texto?.trim()?.length ?: 0) >= MIN_JUSTIFICACION

    /** El API decide con su hora: si contesta que ya es a destiempo, se pide el motivo. */
    fun pideMotivoPorError(mensaje: String?): Boolean =
        Regex("horario|hora de regreso|por qué", RegexOption.IGNORE_CASE).containsMatchIn(mensaje.orEmpty())

    fun mensajeRegistro(momento: String, conMotivo: Boolean): String = when {
        momento == SALIDA && conMotivo -> "Registraste tu salida a comer. Tu justificación quedó por aprobar."
        momento == SALIDA -> "Registraste tu salida a comer. ¡Buen provecho!"
        conMotivo -> "Registraste tu regreso. Tu justificación quedó por aprobar."
        else -> "Registraste tu regreso de comer."
    }

    /** «Juan Pérez la aprobó: «…»» para la tarjeta propia. */
    fun decisionPropia(registro: ComidaRegistroDto): String? {
        val estado = registro.revisionEstado
        if (estado != "APROBADA" && estado != "RECHAZADA") return null
        val quien = CoreActivityRules.shortName(registro.revisadoPor).ifBlank { "Tu jefe" }
        val verbo = if (estado == "APROBADA") "la aprobó" else "la rechazó"
        val notas = registro.revisionNotas?.takeIf { it.isNotBlank() }?.let { ": «$it»" } ?: "."
        return "$quien $verbo$notas"
    }

    /** «Juan Pérez aprobó: «…»» para la fila del equipo. */
    fun decisionEquipo(registro: ComidaRegistroDto): String? {
        val estado = registro.revisionEstado
        if (estado != "APROBADA" && estado != "RECHAZADA") return null
        val quien = CoreActivityRules.shortName(registro.revisadoPor).ifBlank { "—" }
        val verbo = if (estado == "APROBADA") "aprobó" else "rechazó"
        val notas = registro.revisionNotas?.takeIf { it.isNotBlank() }?.let { ": «$it»" }.orEmpty()
        return "$quien $verbo$notas"
    }

    fun ahoraIso(now: Instant = Instant.now()): String = now.toString()
}
