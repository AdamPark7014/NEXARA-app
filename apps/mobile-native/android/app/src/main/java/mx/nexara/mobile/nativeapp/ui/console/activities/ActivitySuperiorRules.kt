package mx.nexara.mobile.nativeapp.ui.console.activities

import mx.nexara.mobile.nativeapp.data.api.ActivityAccionPersonaDto
import mx.nexara.mobile.nativeapp.data.api.ActivityAccionesDto
import mx.nexara.mobile.nativeapp.data.api.ActivityDto
import mx.nexara.mobile.nativeapp.data.api.TeamBoardUserDto

/**
 * «Cancelar actividad» y «Pasar a otro compañero» (superiores de quien la ejecuta).
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

    fun muestraAcciones(acciones: ActivityAccionesDto?): Boolean =
        acciones != null && acciones.cerrada != true &&
            (acciones.puedeCancelar == true || acciones.puedePasar == true)

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

    fun estaCancelada(a: ActivityDto): Boolean =
        a.estatus.trim().equals("Cancelada", ignoreCase = true) || !a.cancelledAt.isNullOrBlank()

    /** «Cancelada por Luis Pérez · El cliente pospuso el servicio». */
    fun avisoCancelada(a: ActivityDto): String? {
        if (!estaCancelada(a)) return null
        val quien = a.cancelledBy?.nombre?.trim().orEmpty()
        val motivo = a.cancelReason?.trim().orEmpty()
        return buildString {
            append(if (quien.isBlank()) "Cancelada" else "Cancelada por $quien")
            if (motivo.isNotBlank()) append(" · ").append(motivo)
        }
    }
}
