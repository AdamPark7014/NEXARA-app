package mx.nexara.mobile.nativeapp.ui.console.more

import mx.nexara.mobile.nativeapp.data.api.ProyectoAlcanceDto
import mx.nexara.mobile.nativeapp.data.api.ProyectoDetalleDto
import mx.nexara.mobile.nativeapp.data.api.ProyectoEtapaDto

/**
 * El detalle de un proyecto en el teléfono. Adam (04-11-2026): «en proyectos aparece pero no deja
 * apretar nada ni ver nada». Mismas etiquetas que la web (`lib/proyectos-api.ts`).
 *
 * Sin Android: se prueba en la JVM (`ProyectoDetalleRulesTest`). Espejo: `ProyectoDetalleRules.swift`.
 */
object ProyectoDetalleRules {
    enum class Seccion(val etiqueta: String) {
        RESUMEN("Resumen"),
        CRONOGRAMA("Cronograma"),
        ALCANCE("Alcance"),
        EQUIPO("Equipo"),
        DOCUMENTOS("Documentos"),
        ACTIVIDADES("Actividades"),
    }

    /** Las secciones sin nada no salen: una pestaña vacía es un toque perdido. */
    fun secciones(p: ProyectoDetalleDto): List<Seccion> = Seccion.entries.filter { s ->
        when (s) {
            Seccion.RESUMEN -> true
            Seccion.CRONOGRAMA -> !p.milestones.isNullOrEmpty()
            Seccion.ALCANCE -> !p.scopeItems.isNullOrEmpty() || !p.requirements.isNullOrEmpty()
            Seccion.EQUIPO -> !p.members.isNullOrEmpty()
            Seccion.DOCUMENTOS -> !p.documents.isNullOrEmpty()
            Seccion.ACTIVIDADES -> !p.activities.isNullOrEmpty()
        }
    }

    fun etiquetaEstado(status: String?): String = when (status) {
        "PLANNED" -> "Planeado"
        "ACTIVE" -> "En curso"
        "ON_HOLD" -> "En pausa"
        "COMPLETED" -> "Terminado"
        "CANCELLED" -> "Cancelado"
        else -> "Sin estado"
    }

    fun etiquetaEtapa(status: String?): String = when (status) {
        "PENDIENTE" -> "Pendiente"
        "EN_CURSO" -> "En curso"
        "CUMPLIDO" -> "Cumplida"
        "CANCELADO" -> "Cancelada"
        else -> "Sin estado"
    }

    fun etiquetaRequerimiento(status: String?): String = when (status) {
        "PENDIENTE" -> "Pendiente"
        "EN_PROCESO" -> "En proceso"
        "CUMPLIDO" -> "Listo"
        "NO_APLICA" -> "No aplica"
        else -> "Sin estado"
    }

    fun etiquetaRol(rolEtiqueta: String?, role: String?): String =
        rolEtiqueta?.trim()?.takeIf { it.isNotEmpty() } ?: when (role) {
            "RESPONSABLE" -> "Responsable"
            "COORDINADOR" -> "Coordinador"
            "INGENIERO" -> "Ingeniero"
            "INSTALADOR" -> "Instalador"
            "ADMINISTRATIVO" -> "Administrativo"
            "APOYO" -> "Apoyo"
            else -> "Equipo"
        }

    private val ORDEN_ALCANCE = listOf("ENTREGABLE", "EXCLUSION", "SUPUESTO")

    fun tituloAlcance(kind: String?): String = when (kind) {
        "ENTREGABLE" -> "Qué entregamos"
        "EXCLUSION" -> "Qué no incluye"
        "SUPUESTO" -> "De qué partimos"
        else -> "Alcance"
    }

    fun alcancePorTipo(items: List<ProyectoAlcanceDto>?): List<Pair<String, List<ProyectoAlcanceDto>>> =
        items.orEmpty()
            .groupBy { it.kind.orEmpty() }
            .toList()
            .sortedBy { (k, _) -> ORDEN_ALCANCE.indexOf(k).let { i -> if (i < 0) ORDEN_ALCANCE.size else i } }
            .map { (k, v) -> tituloAlcance(k) to v.sortedBy { it.orden ?: 0 } }

    fun etapasEnOrden(etapas: List<ProyectoEtapaDto>?): List<ProyectoEtapaDto> =
        etapas.orEmpty().sortedBy { it.orden ?: Int.MAX_VALUE }

    /** La misma lista que en la web, sin el estado actual. */
    fun estadosPosibles(actual: String?): List<String> =
        listOf("PLANNED", "ACTIVE", "ON_HOLD", "COMPLETED", "CANCELLED").filter { it != actual }

    fun pideMotivo(estado: String): Boolean = estado == "CANCELLED"

    fun motivoValido(estado: String, motivo: String): Boolean = !pideMotivo(estado) || motivo.trim().length >= 3
}
