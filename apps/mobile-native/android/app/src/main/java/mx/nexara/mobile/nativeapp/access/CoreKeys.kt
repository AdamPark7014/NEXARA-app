package mx.nexara.mobile.nativeapp.access

/**
 * Claves de módulo de NEXARA Core — espejo de `CORE_OLA1_MODULE_IDS`
 * (`apps/web/lib/core-surface.ts`). En el teléfono `mis-actividades` y `pizarra`
 * son una sola entrada, «Actividades».
 */
object CoreKeys {
    /** Actividades (`/erp/pizarra`) — la casa de Core. */
    const val ACTIVITIES = "activities"

    /** Vista ejecutiva (KPIs) — `/erp/executive`. */
    const val EXECUTIVE = "executive"

    /** Actividades en la vista «Mis actividades» (`/erp/mis-actividades`). */
    const val MY_ACTIVITIES = "my-activities"

    /** Asistencias (`/erp/asistencias`). */
    const val ATTENDANCE = "attendance"

    const val CHAT = "chat"

    /** Mi perfil (`/erp/my-profile`). */
    const val MY_PROFILE = "my-profile"

    /** Clientes (`/erp/clientes`) — `erp-clients` en access-matrix y en `me/navigation`. */
    const val CLIENTS = "erp-clients"

    // ── «Más»: el resto de Core. Mismas claves que `me/navigation` (`moduleKeys`). ──

    /** Cotizaciones (`/erp/cotizaciones`). */
    const val COTIZACIONES = "erp-cotizaciones"

    /** Proyectos (`/erp/proyectos`). */
    const val PROYECTOS = "erp-proyectos"

    /** KPIs del equipo (`/erp/asistencias/indicadores`). */
    const val KPIS_EQUIPO = "kpis-equipo"

    /** Almacén (`/erp/almacen`). */
    const val ALMACEN = "erp-almacen"

    /** Herramientas (`/erp/almacen/herramientas`). */
    const val HERRAMIENTAS = "erp-herramientas"

    /** Vehículos (`/erp/vehiculos`). */
    const val VEHICULOS = "erp-vehiculos"

    /** Gastos (`/erp/finance/expenses`). */
    const val GASTOS = "erp-gastos"

    /** Aprobaciones (`/erp/approvals`). */
    const val APROBACIONES = "erp-aprobaciones"

    /** Pagos a empleados (`/erp/finance/employee-payments`). */
    const val PAGOS_EMPLEADOS = "erp-pagos-empleados"

    /** Documentos (`/erp/documents`). */
    const val DOCUMENTOS = "erp-documentos"

    /** Organigrama (`/erp/organigrama`). */
    const val ORGANIGRAMA = "erp-organigrama"

    /**
     * Viáticos (`/erp/finance/viatics`).
     *
     * A diferencia de los otros módulos de «Más», la clave no es la del
     * `CORE_EXTRA_MODULES` del API —ahí no está—, sino la que `me/navigation`
     * ya emite para cualquier ruta que contenga `viatic`
     * (`navigation-module-map.ts`: `android: ['viatics', 'my-viatics']`).
     */
    const val VIATICOS = "viatics"

    /** La otra clave que manda `me/navigation` para lo mismo. */
    const val MIS_VIATICOS = "my-viatics"
}
