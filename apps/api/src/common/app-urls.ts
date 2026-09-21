/**
 * Rutas canónicas del panel web (apps/web/app/(panels)).
 * Usar en relatedUrl de notificaciones, calendario y alertas.
 *
 * Core-only: los paneles `/ops`, `/crm`, `/studio`, `/lab` e `/integra` ya no existen.
 * Una ruta fuera de `/erp` la rebota el middleware a `/erp/pizarra` **perdiendo el
 * `highlight`/id**, así que el aviso deja de llevar al registro. El mapa canónico vive
 * en `apps/web/lib/core-surface.ts`.
 *
 * Los constructores `ops*` / `crm*` quedan como alias de su equivalente en Core para no
 * romper a quien ya los llama. Los que siguen apuntando fuera de `/erp` son los que
 * todavía **no tienen pantalla en Core**: están listados en {@link APP_URLS_SIN_CORE} y
 * `app-urls-core-surface.spec.ts` falla si aparece uno nuevo fuera de esa lista.
 */

export const appUrls = {
  // ---- Core: actividades y evidencias ----
  erpActividad: (id: number) => `/erp/actividades/${id}`,
  erpActividadEvidencias: (id: number) => `/erp/actividades/${id}/evidencias`,
  erpActividades: () => `/erp/actividades`,
  erpMisActividades: () => `/erp/mis-actividades`,

  // ---- Core: clientes, cotizaciones y proyectos ----
  erpClientes: (id?: number) => (id ? `/erp/clientes/${id}` : `/erp/clientes`),
  erpProyectos: (id?: number) => (id ? `/erp/proyectos/${id}` : `/erp/proyectos`),
  /** Cotizaciones en Core. `/crm/quotes` quedaba fuera de la superficie y rebotaba a la pizarra. */
  erpCotizaciones: (id?: number) => (id ? `/erp/cotizaciones/${id}` : `/erp/cotizaciones`),

  /**
   * Oportunidades, leads y licitaciones: sin pantalla en Core todavía. Se dejan tal cual
   * (ver {@link APP_URLS_SIN_CORE}) en vez de inventar un destino que no existe.
   */
  crmOpportunity: (id: number) => `/crm/opportunities/${id}`,
  crmLead: (id: number) => `/crm/leads?highlight=${id}`,
  crmTender: (id: number) => `/crm/tenders?highlight=${id}`,

  /** @deprecated Usa `erpClientes`. */
  crmClient: (id: number): string => appUrls.erpClientes(id),
  /** @deprecated Usa `erpCotizaciones`. */
  crmQuote: (id: number): string => appUrls.erpCotizaciones(id),
  /** @deprecated Usa `erpProyectos`. */
  crmProject: (id: number): string => appUrls.erpProyectos(id),

  /** @deprecated Usa `erpActividad`. */
  opsActivity: (id: number): string => appUrls.erpActividad(id),
  /** @deprecated Usa `erpActividadEvidencias`. */
  opsActivityEvidences: (id: number): string => appUrls.erpActividadEvidencias(id),
  /**
   * Evidencias propias: en Core se abren dentro de la actividad. Sin actividad concreta el
   * aviso lleva a «Mis actividades» (antes `/ops/my-evidences`, que ya no existe).
   * @deprecated Usa `erpActividadEvidencias` / `erpMisActividades`.
   */
  opsMyEvidences: (activityId?: number): string =>
    activityId ? appUrls.erpActividadEvidencias(activityId) : appUrls.erpMisActividades(),
  /** @deprecated Usa `erpActividadEvidencias`. */
  opsEvidencesReview: (activityId: number): string => appUrls.erpActividadEvidencias(activityId),
  /** @deprecated Usa `erpActividades`. */
  opsActivities: (): string => appUrls.erpActividades(),
  /** @deprecated Usa `erpProyectos`. */
  opsProject: (id: number): string => appUrls.erpProyectos(id),

  /**
   * Viáticos que alguien revisa o autoriza: viven en `/erp/finance/viatics`.
   * @deprecated Usa `erpFinanceViatics`.
   */
  opsViatic: (id: number): string => appUrls.erpFinanceViatics(id),
  /**
   * Viáticos propios del ingeniero. **Core no tiene todavía esta pantalla**:
   * `/erp/finance/viatics` es la vista de administración (módulo `viatics-admin`) y el
   * ingeniero no la abre. Se deja la ruta vieja a propósito (ver {@link APP_URLS_SIN_CORE})
   * hasta que exista «Mis viáticos» en Core; mandarlo a la vista de administración sería
   * cambiar un rebote a la pizarra por un 403.
   */
  opsMyViatics: (id?: number) => (id ? `/ops/my-viatics?highlight=${id}` : `/ops/my-viatics`),

  /**
   * Herramientas, vehículos, almacén y organigrama viven en Core (`/erp`): las rutas de OPS
   * rebotaban a la pizarra y el aviso no llevaba a ningún lado. Los nombres `ops*` y
   * `erpWarehouse` de abajo quedan como alias para no romper a quien ya los llama.
   */
  erpMisVehiculos: (id?: number) =>
    id ? `/erp/vehiculos/mis-vehiculos?highlight=${id}` : `/erp/vehiculos/mis-vehiculos`,
  erpVehiculos: (id?: number, tab?: "requests" | "inventory") => {
    const params = new URLSearchParams();
    if (tab) params.set("tab", tab);
    if (id != null) params.set("highlight", String(id));
    const qs = params.toString();
    return qs ? `/erp/vehiculos?${qs}` : `/erp/vehiculos`;
  },
  erpHerramientas: (id?: number, tab?: "requests" | "renewals" | "inventory" | "kits") => {
    const params = new URLSearchParams();
    if (tab) params.set("tab", tab);
    if (id != null) params.set("highlight", String(id));
    const qs = params.toString();
    return qs ? `/erp/almacen/herramientas?${qs}` : `/erp/almacen/herramientas`;
  },
  erpAlmacen: (params?: {
    productId?: number;
    movementId?: number;
    /** Pestaña del almacén a la que apunta el aviso. */
    tab?: "inventario" | "movimientos" | "reabastecimiento" | "herramientas" | "kits";
  }) => {
    const qs = new URLSearchParams();
    if (params?.tab) qs.set("tab", params.tab);
    if (params?.productId != null) qs.set("productId", String(params.productId));
    if (params?.movementId != null) qs.set("movementId", String(params.movementId));
    const s = qs.toString();
    return s ? `/erp/almacen?${s}` : `/erp/almacen`;
  },
  erpOrganigrama: () => `/erp/organigrama`,
  /** @deprecated Usa `erpMisVehiculos`. */
  opsMyVehicles: (id?: number): string => appUrls.erpMisVehiculos(id),
  /** @deprecated Usa `erpHerramientas`. */
  opsTools: (id?: number, tab?: "requests" | "renewals" | "inventory" | "kits"): string =>
    appUrls.erpHerramientas(id, tab),
  /** @deprecated Usa `erpVehiculos`. */
  opsVehicles: (id?: number, tab?: "requests" | "inventory"): string => appUrls.erpVehiculos(id, tab),

  /** Mantenimiento y soporte: sin pantalla en Core todavía (ver {@link APP_URLS_SIN_CORE}). */
  opsMaintenance: (woId?: number) => (woId ? `/ops/maintenance?woId=${woId}` : `/ops/maintenance`),
  opsMaintenanceContracts: (highlightId?: number) =>
    highlightId
      ? `/ops/maintenance/contracts?highlight=${highlightId}`
      : `/ops/maintenance/contracts`,
  opsSupport: (id?: number) => (id ? `/ops/support/${id}` : `/ops/support`),
  opsSupportNew: (params?: Record<string, string>) => {
    const qs = params ? new URLSearchParams(params).toString() : "";
    return qs ? `/ops/support/new?${qs}` : `/ops/support/new`;
  },

  erpFines: (fineId?: number) =>
    fineId ? `/erp/hr/fines?highlight=${fineId}` : `/erp/hr/fines`,

  erpAttendance: (tab?: string, highlightId?: number) => {
    if (tab === "lunch") return `/erp/hr/lunch-breaks`;
    const params = new URLSearchParams();
    if (tab) params.set("tab", tab);
    if (highlightId != null) params.set("highlight", String(highlightId));
    const qs = params.toString();
    return qs ? `/erp/hr/attendance?${qs}` : `/erp/hr/attendance`;
  },
  erpExpenses: (highlightId?: number) =>
    highlightId ? `/erp/finance/expenses?highlight=${highlightId}` : `/erp/finance/expenses`,
  /** Portal cliente (subdominio /tickets), fuera de los paneles. */
  portalTicket: (id: number) => `/tickets/${id}`,
  erpUsers: (id?: number) => (id ? `/erp/users?highlight=${id}` : `/erp/users`),
  erpProcurement: (tab: string, id?: number) =>
    id ? `/erp/procurement?tab=${tab}&id=${id}` : `/erp/procurement?tab=${tab}`,
  erpProcurementReceipt: (poId: number) => `/erp/procurement?tab=receipts&poId=${poId}`,
  /** @deprecated Usa `erpAlmacen`. */
  erpWarehouse: (productId?: number): string => appUrls.erpAlmacen(productId ? { productId } : undefined),
  erpAccounting: (entryId?: number) =>
    entryId ? `/erp/accounting?highlight=${entryId}` : `/erp/accounting`,
  erpInvoicing: (invoiceId?: number, invoiceRef?: string) => {
    if (invoiceId) return `/erp/invoicing?highlight=${invoiceId}`;
    if (invoiceRef) return `/erp/invoicing?invoiceRef=${encodeURIComponent(invoiceRef)}`;
    return `/erp/invoicing`;
  },
  erpApprovals: (instanceId: number) => `/erp/approvals?highlight=${instanceId}`,
  erpFinanceViatics: (id?: number) =>
    id ? `/erp/finance/viatics?highlight=${id}` : `/erp/finance/viatics`,
  erpLunchBreaks: (_highlightId?: number) => `/erp/asistencias?tab=comidas`,
};

/**
 * Constructores que todavía devuelven una ruta fuera de `/erp` porque **Core no tiene esa
 * pantalla**. No es una lista de pendientes tolerados: cada uno manda hoy al usuario a
 * `/erp/pizarra`. Mientras el destino no exista, inventar uno no mejora nada. Cuando se
 * cree la pantalla se corrige el constructor y se borra de aquí.
 */
export const APP_URLS_SIN_CORE = [
  "crmOpportunity",
  "crmLead",
  "crmTender",
  "opsMyViatics",
  "opsMaintenance",
  "opsMaintenanceContracts",
  "opsSupport",
  "opsSupportNew",
] as const;

/** Rutas que no pertenecen a ningún panel (portal público de clientes). */
export const APP_URLS_FUERA_DE_PANEL = ["portalTicket"] as const;
