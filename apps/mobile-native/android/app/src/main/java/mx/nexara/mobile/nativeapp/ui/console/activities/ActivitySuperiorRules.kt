package mx.nexara.mobile.nativeapp.ui.console.activities

import mx.nexara.mobile.nativeapp.data.api.ActivityAccionPersonaDto
import mx.nexara.mobile.nativeapp.data.api.ActivityAccionesDto
import mx.nexara.mobile.nativeapp.data.api.ActivityDto
import mx.nexara.mobile.nativeapp.data.api.AvanceAnteriorDto
import mx.nexara.mobile.nativeapp.data.api.CausaIncumplimientoDto
import mx.nexara.mobile.nativeapp.data.api.TeamBoardUserDto
import java.time.Instant
import java.time.ZoneId
import kotlin.math.roundToInt

/**
 * «Cancelar actividad», «Pasar a otro compañero», «Registrar incumplimiento» y
 * «Reprogramar» (superiores de quien la ejecuta).
 * Puro, sin Android. Espejo de `apps/web/components/ops/ActivitySuperiorActions.tsx`;
 * la API vuelve a validar todo al guardar.
 */
object ActivitySuperiorRules {
    /** Lo que exige la API si `motivoMinimo` no llega. */
    const val MOTIVO_MINIMO = 10

    fun motivoMinimo(acciones: ActivityAccionesDto?): Int =
        acciones?.motivoMinimo?.takeIf { it > 0 } ?: MOTIVO_MINIMO

    /** Mismo conteo que el servidor: sin espacios de sobra. */
    fun motivoLimpio(motivo: String): String = motivo.trim().replace(Regex("\\s+"), " ")

    fun motivoOk(motivo: String, minimo: Int): Boolean = motivoLimpio(motivo).length >= minimo

    /** Tope de observaciones y motivos (el mismo que corta el campo). */
    const val TEXTO_MAXIMO = 400

    enum class Accion { PASAR, NO_CUMPLIDA, REPROGRAMAR, CANCELAR }

    /**
     * Botones en el orden en que se pintan. Cerrada solo deja «Reprogramar»: es lo que
     * reabre una «No cumplida» (la API solo lo manda en ese caso).
     */
    fun botones(acciones: ActivityAccionesDto?): List<Accion> {
        if (acciones == null) return emptyList()
        val abierta = acciones.cerrada != true
        return buildList {
            if (abierta && acciones.puedePasar == true) add(Accion.PASAR)
            if (abierta && acciones.puedeRegistrarIncumplimiento == true) add(Accion.NO_CUMPLIDA)
            if (acciones.puedeReprogramar == true) add(Accion.REPROGRAMAR)
            if (abierta && acciones.puedeCancelar == true) add(Accion.CANCELAR)
        }
    }

    fun muestraAcciones(acciones: ActivityAccionesDto?): Boolean = botones(acciones).isNotEmpty()

    /** Respaldo si la API no manda el catálogo; la primera es la del cierre de jornada. */
    val CAUSAS_INCUMPLIMIENTO: List<CausaIncumplimientoDto> = listOf(
        CausaIncumplimientoDto("SIN_ENTREGA", "Sin entrega al cierre de la jornada"),
        CausaIncumplimientoDto("MATERIAL", "Falta de material, herramienta o equipo"),
        CausaIncumplimientoDto("ACCESO", "Sin acceso al sitio o cliente no disponible"),
        CausaIncumplimientoDto("PERSONAL", "Personal asignado no disponible"),
        CausaIncumplimientoDto("PLANEACION", "Alcance o tiempo mal planeado"),
        CausaIncumplimientoDto("CALIDAD", "La entrega no cumple lo solicitado"),
        CausaIncumplimientoDto("OTRA", "Otra causa"),
    )

    /** Catálogo de la API (sin claves vacías) o el de respaldo. */
    fun causas(acciones: ActivityAccionesDto?): List<CausaIncumplimientoDto> {
        val api = acciones?.causasIncumplimiento.orEmpty()
            .filter { !it.clave.isNullOrBlank() }
            .map { it.copy(etiqueta = it.etiqueta?.trim()?.takeIf { e -> e.isNotEmpty() } ?: etiquetaCausa(it.clave)) }
            .distinctBy { it.clave }
        return api.ifEmpty { CAUSAS_INCUMPLIMIENTO }
    }

    fun etiquetaCausa(clave: String?): String =
        CAUSAS_INCUMPLIMIENTO.firstOrNull { it.clave.equals(clave?.trim(), ignoreCase = true) }?.etiqueta
            ?: "Otra causa"

    /** Lo que pide el registro: causa elegida y observaciones con el mínimo. */
    fun incumplimientoListo(causa: String?, observaciones: String, minimo: Int): Boolean =
        !causa.isNullOrBlank() && motivoOk(observaciones, minimo)

    /** La nueva fecha tiene que ser posterior a ahora; false si no se entiende. */
    fun fechaReprogramadaOk(iso: String?, ahora: Instant = Instant.now()): Boolean {
        val nueva = CoreActivityRules.parseInstant(iso) ?: return false
        return nueva.isAfter(ahora)
    }

    /**
     * Quién la deja: las personas que ejecutan. Si ninguna viene marcada (API vieja o
     * despacho sin repartir), todas las que se pueden reemplazar.
     */
    fun quienesSalen(acciones: ActivityAccionesDto?): List<ActivityAccionPersonaDto> {
        val personas = acciones?.personas.orEmpty()
        val ejecutan = personas.filter { it.ejecuta == true }
        return ejecutan.ifEmpty { personas }
    }

    /** Quién la continúa: gente del tablero que no está ya en la actividad, por nombre. */
    fun quienesEntran(
        equipo: List<TeamBoardUserDto>,
        acciones: ActivityAccionesDto?,
    ): List<TeamBoardUserDto> {
        val enActividad = acciones?.personas.orEmpty().map { it.userId }.toSet()
        return equipo
            .filter { it.id !in enActividad }
            .distinctBy { it.id }
            .sortedBy { it.nombre.orEmpty().lowercase() }
    }

    fun etiquetaPersona(p: ActivityAccionPersonaDto): String {
        val nombre = p.nombre?.trim().orEmpty().ifBlank { "Sin nombre" }
        return when {
            p.responsable == true -> "$nombre · responsable"
            p.rol.equals("APOYO", ignoreCase = true) -> "$nombre · apoyo"
            else -> nombre
        }
    }

    fun tituloAvanceAnterior(av: AvanceAnteriorDto): String =
        av.titulo?.trim()?.takeIf { it.isNotBlank() }
            ?: "Avance anterior de ${CoreActivityRules.shortName(av.nombre).ifBlank { "tu compañero" }}"

    /** «Solo lectura · 40% avanzado · Luis Pérez te la pasó · Motivo: se enfermó.» */
    fun detalleAvanceAnterior(av: AvanceAnteriorDto): String = buildString {
        append("Solo lectura · ")
        append((av.progressPct ?: 0.0).roundToInt().coerceIn(0, 100)).append("% avanzado")
        av.movidaPor?.trim()?.takeIf { it.isNotBlank() }?.let { append(" · ").append(it).append(" te la pasó") }
        av.motivo?.trim()?.takeIf { it.isNotBlank() }?.let { append(" · Motivo: ").append(it.trimEnd('.')) }
        append(". Continúa desde aquí con tu propia foto de entrada y de salida.")
    }

    fun estaCancelada(a: ActivityDto): Boolean =
        a.estatus.trim().equals("Cancelada", ignoreCase = true) || !a.cancelledAt.isNullOrBlank()

    /**
     * Quién la canceló y, si hay motivo, el motivo en el renglón de abajo.
     * Antes iban juntos: «Cancelada por Luis Pérez · El cliente pospuso el servicio».
     */
    fun avisoCancelada(a: ActivityDto): String? {
        if (!estaCancelada(a)) return null
        val quien = a.cancelledBy?.nombre?.trim().orEmpty()
        val motivo = a.cancelReason?.trim().orEmpty()
        val linea = if (quien.isBlank()) "Cancelada" else "Cancelada por $quien"
        return if (motivo.isBlank()) linea else "$linea\n$motivo"
    }

    /** Aviso rojo del detalle de una «No cumplida». La fecha la pone la pantalla. */
    data class AvisoNoCumplida(
        val titulo: String,
        val origen: String,
        val registradoAt: String?,
        val observaciones: String?,
        val pendientes: String?,
    )

    /**
     * Solo mientras siga «No cumplida»: reprogramada, el registro es historial
     * ([notaReprogramada]). Sin registro (API vieja) queda el título solo.
     */
    fun avisoNoCumplida(a: ActivityDto): AvisoNoCumplida? {
        if (!CoreActivityRules.esNoCumplida(a.estatus)) return null
        val inc = a.incumplimiento
        val causa = inc?.causaEtiqueta?.trim()?.takeIf { it.isNotEmpty() }
            ?: inc?.causa?.takeIf { it.isNotBlank() }?.let { etiquetaCausa(it) }
        val quien = inc?.registradoPor?.nombre?.trim().orEmpty()
        val automatica = inc != null && (inc.origen.equals("CIERRE_JORNADA", ignoreCase = true) || inc.registradoPor == null)
        val pendientes = inc?.pendientes.orEmpty()
            .mapNotNull { it.nombre?.trim()?.takeIf { n -> n.isNotEmpty() } }
            .distinct()
        return AvisoNoCumplida(
            titulo = if (causa == null) "No cumplida" else "No cumplida · $causa",
            origen = when {
                inc == null -> "Se cerró sin entregarse"
                automatica -> "Cierre automático de la jornada"
                quien.isNotEmpty() -> "Registrada por $quien"
                else -> "Registrada por un superior"
            },
            registradoAt = inc?.registradoAt?.takeIf { it.isNotBlank() },
            observaciones = inc?.observaciones?.trim()?.takeIf { it.isNotEmpty() },
            pendientes = pendientes.takeIf { it.isNotEmpty() }?.joinToString(", ", prefix = "Pendientes de entrega: "),
        )
    }

    /**
     * Historial de una que ya se reabrió: «Reprogramada por Luis Pérez para lun 26 oct · 09:00 ·
     * no se cumplió: Falta de material, herramienta o equipo». Null si sigue «No cumplida».
     */
    fun notaReprogramada(a: ActivityDto, zone: ZoneId = ZoneId.systemDefault()): String? {
        if (CoreActivityRules.esNoCumplida(a.estatus)) return null
        val inc = a.incumplimiento ?: return null
        if (inc.reprogramadaAt.isNullOrBlank()) return null
        val quien = inc.reprogramadaPor?.nombre?.trim().orEmpty()
        val causa = inc.causaEtiqueta?.trim()?.takeIf { it.isNotEmpty() } ?: etiquetaCausa(inc.causa)
        return buildString {
            append(if (quien.isEmpty()) "Reprogramada" else "Reprogramada por $quien")
            CoreActivityRules.formatWhen(inc.reprogramadaPara, zone)?.let { append(" para ").append(it) }
            append(" · no se cumplió: ").append(causa)
        }
    }
}
