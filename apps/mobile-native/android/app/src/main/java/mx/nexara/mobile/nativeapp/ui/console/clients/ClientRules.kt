package mx.nexara.mobile.nativeapp.ui.console.clients

/**
 * Reglas puras del padrón: estatus y textos de confirmación. Sin Android, para
 * probarlas solas. Espejo de `apps/api/src/ventas/client-permissions.ts` y de la
 * ficha web (`apps/web/app/(panels)/erp/clientes/[id]/page.tsx`).
 */
object ClientRules {
    const val STATUS_ACTIVO = "Activo"
    const val STATUS_INACTIVO = "Inactivo"

    /** «Inactivo» (o «inactive») sin importar mayúsculas ni espacios, como el servidor. */
    fun isInactive(status: String?): Boolean {
        val s = status?.trim()?.lowercase().orEmpty()
        return s == "inactivo" || s == "inactiva" || s == "inactive"
    }

    fun toggleActiveTitle(inactivo: Boolean): String =
        if (inactivo) "Reactivar cliente" else "Desactivar cliente"

    fun toggleActiveConfirmLabel(inactivo: Boolean): String =
        if (inactivo) "Reactivar" else "Desactivar"

    fun toggleActiveMessage(nombre: String?, inactivo: Boolean): String {
        val quien = displayName(nombre)
        return if (inactivo) {
            "«$quien» volverá a estar activo en el padrón."
        } else {
            "«$quien» quedará inactivo. Sus datos y su historial se conservan y podrás reactivarlo después."
        }
    }

    const val DELETE_TITLE = "Eliminar cliente"

    fun deleteMessage(nombre: String?): String =
        "¿Eliminar «${displayName(nombre)}» del padrón? Esta acción no se puede deshacer. " +
            "Si solo ya no trabajan con él, mejor desactívalo."

    // ── Proyectos del cliente (operational-projects) ────────────────────────
    // Mismos permisos que el cliente: `puedeDesactivar` / `puedeEliminar`.

    const val PROJECT_ACTIVE = "ACTIVE"

    /** Desactivar un proyecto lo deja en pausa (`ON_HOLD`); en la app se lee «Inactivo». */
    const val PROJECT_ON_HOLD = "ON_HOLD"

    fun isProjectInactive(status: String?): Boolean =
        status?.trim()?.uppercase() == PROJECT_ON_HOLD

    fun projectStatusLabel(status: String?): String = when (status?.trim()?.uppercase()) {
        PROJECT_ACTIVE -> STATUS_ACTIVO
        PROJECT_ON_HOLD -> STATUS_INACTIVO
        "COMPLETED" -> "Terminado"
        null, "" -> "Sin estatus"
        else -> status?.trim().orEmpty()
    }

    fun projectToggleTitle(inactivo: Boolean): String =
        if (inactivo) "Reactivar proyecto" else "Desactivar proyecto"

    fun projectToggleMessage(titulo: String?, inactivo: Boolean): String {
        val cual = projectName(titulo)
        return if (inactivo) {
            "«$cual» volverá a estar activo."
        } else {
            "«$cual» quedará inactivo. Sus actividades y su historial se conservan y podrás reactivarlo después."
        }
    }

    const val PROJECT_DELETE_TITLE = "Eliminar proyecto"

    fun projectDeleteMessage(titulo: String?): String =
        "¿Eliminar «${projectName(titulo)}»? Dejará de aparecer en las listas y esta acción no se puede " +
            "deshacer. Si solo está detenido, mejor desactívalo."

    private fun projectName(titulo: String?): String = titulo?.trim().orEmpty().ifBlank { "Proyecto sin nombre" }

    private fun displayName(nombre: String?): String = nombre?.trim().orEmpty().ifBlank { "Sin nombre" }
}
