package mx.nexara.mobile.nativeapp.ui.console.viaticos

/** Lo que decide «Asignar viático». Sin Android: `AsignarViaticoRulesTest`. Espejo: `AsignarViaticoRules.swift`. */
object AsignarViaticoRules {
    fun completo(personaId: Long?, actividadId: Long?, centavos: Long, motivo: String): Boolean =
        personaId != null && actividadId != null && centavos > 0L && motivo.isNotBlank()

    /** El servidor exige actividad o proyecto: sin actividades abiertas no hay a qué ligarlo. */
    fun avisoSinActividades(nombre: String?): String =
        "${nombre?.trim()?.ifEmpty { null } ?: "Esta persona"} no tiene actividades abiertas. Asígnale una primero."

    fun filtrarPersonas(personas: List<Pair<Long, String>>, consulta: String): List<Pair<Long, String>> {
        val q = consulta.trim().lowercase()
        return if (q.isEmpty()) personas else personas.filter { (_, nombre) -> nombre.lowercase().contains(q) }
    }
}
