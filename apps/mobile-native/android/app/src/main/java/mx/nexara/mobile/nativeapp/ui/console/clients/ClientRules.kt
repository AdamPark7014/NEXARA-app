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

    private fun displayName(nombre: String?): String = nombre?.trim().orEmpty().ifBlank { "Sin nombre" }
}
