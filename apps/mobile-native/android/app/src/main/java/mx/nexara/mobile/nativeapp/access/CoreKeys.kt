package mx.nexara.mobile.nativeapp.access

/**
 * Claves de módulo de NEXARA Core — espejo de `CORE_OLA1_MODULE_IDS`
 * (`apps/web/lib/core-surface.ts`). En el teléfono `mis-actividades` y `pizarra`
 * son una sola entrada, «Actividades».
 */
object CoreKeys {
    /** Actividades (`/erp/pizarra`) — la casa de Core. */
    const val ACTIVITIES = "activities"

    /** Actividades en la vista «Mis actividades» (`/erp/mis-actividades`). */
    const val MY_ACTIVITIES = "my-activities"

    /** Asistencias (`/erp/asistencias`). */
    const val ATTENDANCE = "attendance"

    const val CHAT = "chat"

    /** Mi perfil (`/erp/my-profile`). */
    const val MY_PROFILE = "my-profile"

    /** Clientes (`/erp/clientes`) — `erp-clients` en access-matrix y en `me/navigation`. */
    const val CLIENTS = "erp-clients"
}
