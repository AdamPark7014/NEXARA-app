/**
 * Las etiquetas en español que ya muestra la interfaz, para que el Excel diga lo mismo.
 *
 * Los volcados anteriores escribían la clave cruda (`erp_only`, `INSTALACION`,
 * `Aprobado_Coordinador`) y quien abría el archivo tenía que adivinar. Aquí se copia,
 * literal, el texto que la pantalla enseña; cuando el valor guardado ya está en español
 * (los estatus de actividad, por ejemplo) solo se recogen las grafías históricas para que
 * no salgan dos filas distintas para el mismo estado.
 */

/** `HybridAttendancePanel.tsx` · vínculo checador ERP ↔ accesos ACS. */
export const ETIQUETA_VINCULO: Record<string, string> = {
  linked: 'Vinculado',
  erp_only: 'Solo ERP',
  acs_only: 'Solo ACS',
};

/** `HybridAttendancePanel.tsx` · alertas del contraste. `retardo` no tenía etiqueta en la UI. */
export const ETIQUETA_ALERTA: Record<string, string> = {
  sin_numero_empleado: 'Sin nº empleado',
  acs_sin_checador: 'ACS sin checador',
  checador_sin_acs: 'Checador sin ACS',
  acs_sin_salida: 'ACS sin salida',
  erp_sin_salida: 'ERP sin salida',
  desfase_entrada: 'Desfase entrada',
  desfase_salida: 'Desfase salida',
  retardo: 'Retardo',
};

/** Estado de la jornada según el checador. */
export const ETIQUETA_ESTADO_ERP: Record<string, string> = {
  PRESENTE: 'Presente',
  COMPLETO: 'Completo',
  AUSENTE: 'Ausente',
};

/**
 * `activity-status.ts` guarda el estatus ya en español. Se listan también las grafías
 * históricas que siguen vivas en filas viejas para que el filtro del Excel no las separe.
 */
export const ETIQUETA_ESTATUS_ACTIVIDAD: Record<string, string> = {
  Pendiente: 'Pendiente',
  Asignada: 'Asignada',
  Asignado: 'Asignada',
  'En Proceso': 'En proceso',
  'En Progreso': 'En proceso',
  EN_PROGRESO: 'En proceso',
  EN_PROCESO: 'En proceso',
  'Por Validar': 'Por validar',
  'En Validacion': 'Por validar',
  'Pendiente Validacion': 'Por validar',
  POR_VALIDAR: 'Por validar',
  Finalizada: 'Finalizada',
  Finalizado: 'Finalizada',
  Completada: 'Finalizada',
  Completado: 'Finalizada',
  FINALIZADA: 'Finalizada',
  Rechazada: 'Rechazada',
  Rechazado: 'Rechazada',
  RECHAZADA: 'Rechazada',
  Cancelada: 'Cancelada',
  Cancelado: 'Cancelada',
  CANCELADA: 'Cancelada',
};

export const ETIQUETA_PRIORIDAD: Record<string, string> = {
  ALTA: 'Alta',
  MEDIA: 'Media',
  BAJA: 'Baja',
  Alta: 'Alta',
  Media: 'Media',
  Baja: 'Baja',
};

/** Enum `TicketType`. */
export const ETIQUETA_TIPO_TICKET: Record<string, string> = {
  PREVENTIVO: 'Preventivo',
  CORRECTIVO: 'Correctivo',
  EMERGENCIA: 'Emergencia',
  INSTALACION: 'Instalación',
  OTRO: 'Otro',
};

/** `activity-kinds.ts` · `ACTIVITY_KINDS[kind].title`. */
export const ETIQUETA_CLASE_ACTIVIDAD: Record<string, string> = {
  tarea: 'Tarea',
  proyecto: 'Proyecto',
  obra: 'Obra',
  servicio: 'Servicio',
  comercial: 'Comercial',
};

/** `activity-kinds.ts` · `ASSIGNMENT_CHARGES[...].badge`. */
export const ETIQUETA_ENCARGO: Record<string, string> = {
  ejecucion: 'Ejecución',
  despacho: 'Despacho',
};

/** Estatus de viático. `Aprobado_Coordinador` no tenía texto legible en ninguna pantalla. */
export const ETIQUETA_ESTATUS_VIATICO: Record<string, string> = {
  Pendiente: 'Pendiente',
  Aprobado_Coordinador: 'Aprobado por coordinador',
  Aprobado: 'Aprobado',
  Aprobada: 'Aprobado',
  Rechazado: 'Rechazado',
  Rechazada: 'Rechazado',
  Pagado: 'Pagado',
  Pagada: 'Pagado',
  Cancelado: 'Cancelado',
  Cancelada: 'Cancelado',
};

/** Categoría del viático (comentario del esquema). */
export const ETIQUETA_CATEGORIA_VIATICO: Record<string, string> = {
  COMBUSTIBLE: 'Combustible',
  CASETA: 'Caseta',
  HOSPEDAJE: 'Hospedaje',
  ALIMENTACION: 'Alimentación',
  TRANSPORTE: 'Transporte',
  OTROS: 'Otros',
};

export const ETIQUETA_ORIGEN_VIATICO: Record<string, string> = {
  SOLICITUD: 'Solicitud',
  ASIGNACION: 'Asignación',
};

/** `operational-status.ts` · aprobaciones, con las grafías femeninas históricas. */
export const ETIQUETA_APROBACION: Record<string, string> = {
  Pendiente: 'Pendiente',
  Aprobado: 'Aprobado',
  Aprobada: 'Aprobado',
  Rechazado: 'Rechazado',
  Rechazada: 'Rechazado',
};

/** `operational-status.ts` · estados de pago. */
export const ETIQUETA_PAGO: Record<string, string> = {
  Pendiente: 'Pendiente',
  Aprobado: 'Aprobado',
  Aprobada: 'Aprobado',
  Pagado: 'Pagado',
  Pagada: 'Pagado',
  Rechazado: 'Rechazado',
  Rechazada: 'Rechazado',
  Cancelado: 'Cancelado',
  Cancelada: 'Cancelado',
};

/** `estado-cotizacion.ts` · `ETIQUETA_ESTADO`, con el enum en inglés de la base. */
export const ETIQUETA_ESTADO_COTIZACION: Record<string, string> = {
  DRAFT: 'Borrador',
  SENT: 'Enviada',
  APPROVED: 'Aprobada',
  REJECTED: 'Rechazada',
  EXPIRED: 'Vencida',
  BORRADOR: 'Borrador',
  ENVIADA: 'Enviada',
  APROBADA: 'Aprobada',
  RECHAZADA: 'Rechazada',
  VENCIDA: 'Vencida',
};

export const ETIQUETA_SEGMENTO_COTIZACION: Record<string, string> = {
  COMERCIAL: 'Comercial',
  OBRA: 'Obra',
  LICITACION: 'Licitación',
  SERVICIO: 'Servicio',
};

/** Semáforo de KPI. */
export const ETIQUETA_SEMAFORO: Record<string, string> = {
  verde: 'Verde',
  amarillo: 'Amarillo',
  rojo: 'Rojo',
  sin_datos: 'Sin datos',
};

// ─────────────────────────────────── CRM y contabilidad (packs de «Exportar»)

/** `sales-api.ts` · `LEAD_STATUS_LABELS`. */
export const ETIQUETA_ESTATUS_LEAD: Record<string, string> = {
  NEW: 'Nuevo',
  QUALIFIED: 'Calificado',
  NURTURING: 'En seguimiento',
  LOST: 'Descartado',
  CONVERTED: 'Convertido',
};

/** `sales-api.ts` · `PIPELINE_STAGES` + `ALL_OPPORTUNITY_STAGES`. */
export const ETIQUETA_ETAPA_OPORTUNIDAD: Record<string, string> = {
  DISCOVERY: 'Descubrimiento',
  QUALIFICATION: 'Calificado',
  PROPOSAL: 'Cotización',
  NEGOTIATION: 'Negociación',
  CLOSING: 'Cierre',
  WON: 'Ganada',
  LOST: 'Perdida',
};

/** `erp/invoicing/page.tsx` · `STATUS_LABELS`. */
export const ETIQUETA_ESTATUS_FACTURA: Record<string, string> = {
  DRAFT: 'Borrador',
  STAMPING: 'Timbrando',
  SENT: 'Enviada',
  PARTIALLY_PAID: 'Pago parcial',
  PAID: 'Pagada',
  OVERDUE: 'Vencida',
  CANCELLED: 'Cancelada',
  CREDITED: 'Con nota de crédito',
};

export const ETIQUETA_TIPO_FACTURA: Record<string, string> = {
  ACCOUNTS_RECEIVABLE: 'Por cobrar',
  ACCOUNTS_PAYABLE: 'Por pagar',
};

/** `tenders-api.ts` · `TENDER_TYPE_LABEL` y `TENDER_STATUS_LABEL`. */
export const ETIQUETA_TIPO_LICITACION: Record<string, string> = {
  PUBLIC_GOV: 'Gobierno',
  PRIVATE: 'Privada',
  INVITATION: 'Invitación',
  CONSOLIDATED: 'Consolidada',
};

export const ETIQUETA_ESTATUS_LICITACION: Record<string, string> = {
  PROSPECT: 'Prospecto',
  IN_REVIEW: 'En revisión',
  PREPARING_BID: 'Preparando propuesta',
  SUBMITTED: 'Presentada',
  AWARDED: 'Adjudicada',
  LOST: 'No adjudicada',
  CANCELLED: 'Cancelada',
  DISQUALIFIED: 'Descalificada',
};

/** `service-project-types.ts` · `SERVICE_PROJECT_TYPE_OPTIONS[].label`. */
export const ETIQUETA_TIPO_PROYECTO: Record<string, string> = {
  PROYECTO_INTEGRAL: 'Proyecto integral',
  INSTALACION_CCTV: 'Instalación CCTV',
  CABLEADO_ESTRUCTURADO: 'Cableado estructurado',
  CONTROL_ACCESO: 'Control de acceso',
  REDES_WIFI: 'Redes y WiFi',
  COMPUTO: 'Cómputo y endpoints',
  AUDITORIA_NODOS: 'Auditoría de nodos / sucursales',
  MANTENIMIENTO: 'Mantenimiento',
  SUSTITUCION_EQUIPOS: 'Sustitución de equipos',
  OTRO: 'Otro',
};

/** `proyectos-api.ts` · `ESTADO_PROYECTO_LABEL`. */
export const ETIQUETA_ESTATUS_PROYECTO: Record<string, string> = {
  PLANNED: 'Planeado',
  ACTIVE: 'En curso',
  ON_HOLD: 'En pausa',
  COMPLETED: 'Terminado',
  CANCELLED: 'Cancelado',
};

/** `crm-activities-api.ts` · `ACTIVITY_TYPE_LABEL`, sin los emojis de la UI. */
export const ETIQUETA_TIPO_ACTIVIDAD_CRM: Record<string, string> = {
  CALL: 'Llamada',
  EMAIL: 'Correo',
  MEETING: 'Reunión',
  TASK: 'Tarea',
  WHATSAPP: 'WhatsApp',
  VISIT: 'Visita',
  NOTE: 'Nota',
};

export const ETIQUETA_ESTATUS_ACTIVIDAD_CRM: Record<string, string> = {
  PENDING: 'Pendiente',
  COMPLETED: 'Completada',
  CANCELLED: 'Cancelada',
  OVERDUE: 'Vencida',
};

export const ETIQUETA_VISIBILIDAD_KB: Record<string, string> = {
  PUBLIC: 'Pública',
  CLIENT_ONLY: 'Solo clientes',
  INTERNAL: 'Interna',
};

export const ETIQUETA_ESTATUS_KB: Record<string, string> = {
  DRAFT: 'Borrador',
  PUBLISHED: 'Publicado',
  ARCHIVED: 'Archivado',
};

/** Traduce una lista de claves (p. ej. las alertas del contraste) a texto separado por «; ». */
export function listaEtiquetada(valores: unknown, mapa: Record<string, string>): string {
  if (!Array.isArray(valores)) return '';
  return valores.map((v) => mapa[String(v)] ?? String(v)).join('; ');
}
