/**
 * Ligas del chat: un solo mecanismo para todo lo que se puede ligar en un mensaje.
 *
 * Lo que se guarda es el mismo token que ya usan las actividades —`[etiqueta](/erp/…)`—, con la
 * ruta de la pantalla donde vive el registro. De la ruta se sabe el tipo y el id; la tarjeta la arma
 * el API para cada quien que la ve ({@link TarjetaLiga}), con sus permisos: sin acceso queda solo el
 * título genérico (tipo y folio) y el enlace.
 *
 *   actividad    /erp/actividades/20
 *   evidencia    /erp/actividades/20/evidencias            (?evidencia=7 si es una en concreto)
 *   cotización   /erp/cotizaciones/12
 *   cliente      /erp/clientes/5
 *   proyecto     /erp/proyectos/3
 *   asistencia   /erp/asistencias/indicadores/7?desde=2026-10-29&hasta=2026-10-29   (persona y día)
 *   viático      /erp/finance/viatics?highlight=44
 *   factura      /erp/invoicing/9
 *
 * Además se resuelven los folios escritos sueltos (`AN-0031`, `NEX-…`) con `folio:<FOLIO>`.
 * La web (`apps/web/lib/ligas.ts`) lleva la misma tabla de rutas: si cambia una, cambian las dos.
 */

export const TIPOS_LIGA = [
  'actividad',
  'evidencia',
  'cotizacion',
  'cliente',
  'proyecto',
  'asistencia',
  'viatico',
  'factura',
] as const;

export type TipoLiga = (typeof TIPOS_LIGA)[number];

/** Clave del selector del chat (`GET chat/mentions?kind=`), heredada de las tres primeras. */
export const KIND_DE_TIPO: Record<TipoLiga, string> = {
  actividad: 'ACTIVITY',
  evidencia: 'EVIDENCE',
  cotizacion: 'QUOTE',
  cliente: 'CLIENT',
  proyecto: 'PROJECT',
  asistencia: 'ATTENDANCE',
  viatico: 'VIATIC',
  factura: 'INVOICE',
};

export const TIPO_DE_KIND: Record<string, TipoLiga> = Object.fromEntries(
  Object.entries(KIND_DE_TIPO).map(([tipo, kind]) => [kind, tipo as TipoLiga]),
);

export const ETIQUETA_TIPO: Record<TipoLiga, string> = {
  actividad: 'Actividad',
  evidencia: 'Evidencia',
  cotizacion: 'Cotización',
  cliente: 'Cliente',
  proyecto: 'Proyecto',
  asistencia: 'Asistencia',
  viatico: 'Viático',
  factura: 'Factura',
};

export type LigaParseada = {
  tipo: TipoLiga;
  id: number;
  /** Asistencia: día AAAA-MM-DD. */
  fecha?: string;
  /** Evidencia concreta dentro de la actividad. */
  evidenciaId?: number;
};

const FECHA = /^\d{4}-\d{2}-\d{2}$/;

export const rutaDeLiga = {
  actividad: (id: number) => `/erp/actividades/${id}`,
  evidencia: (actividadId: number, evidenciaId?: number) =>
    `/erp/actividades/${actividadId}/evidencias${evidenciaId ? `?evidencia=${evidenciaId}` : ''}`,
  cotizacion: (id: number) => `/erp/cotizaciones/${id}`,
  cliente: (id: number) => `/erp/clientes/${id}`,
  proyecto: (id: number) => `/erp/proyectos/${id}`,
  asistencia: (userId: number, fecha: string) =>
    `/erp/asistencias/indicadores/${userId}?desde=${fecha}&hasta=${fecha}`,
  viatico: (id: number) => `/erp/finance/viatics?highlight=${id}`,
  factura: (id: number) => `/erp/invoicing/${id}`,
};

function entero(v: string | null | undefined): number | null {
  const n = Number(v);
  return Number.isInteger(n) && n > 0 ? n : null;
}

/** Ruta guardada en el token → tipo e id. `null` si no es una liga conocida. */
export function parsearLiga(href: string): LigaParseada | null {
  const limpio = String(href ?? '').trim();
  if (!limpio.startsWith('/erp/')) return null;
  const [ruta, query = ''] = limpio.split('?', 2) as [string, string?];
  const params = new URLSearchParams(query);
  const p = ruta.replace(/\/+$/, '');
  let m: RegExpMatchArray | null;

  if ((m = p.match(/^\/erp\/actividades\/(\d+)\/evidencias$/))) {
    const id = entero(m[1]);
    if (!id) return null;
    const evidenciaId = entero(params.get('evidencia'));
    return evidenciaId ? { tipo: 'evidencia', id, evidenciaId } : { tipo: 'evidencia', id };
  }
  if ((m = p.match(/^\/erp\/actividades\/(\d+)$/))) {
    const id = entero(m[1]);
    return id ? { tipo: 'actividad', id } : null;
  }
  if ((m = p.match(/^\/erp\/cotizaciones\/(\d+)$/))) {
    const id = entero(m[1]);
    return id ? { tipo: 'cotizacion', id } : null;
  }
  if ((m = p.match(/^\/erp\/clientes\/(\d+)$/))) {
    const id = entero(m[1]);
    return id ? { tipo: 'cliente', id } : null;
  }
  if ((m = p.match(/^\/erp\/proyectos\/(\d+)$/))) {
    const id = entero(m[1]);
    return id ? { tipo: 'proyecto', id } : null;
  }
  if ((m = p.match(/^\/erp\/asistencias\/indicadores\/(\d+)$/))) {
    const id = entero(m[1]);
    const fecha = params.get('desde') ?? '';
    return id && FECHA.test(fecha) ? { tipo: 'asistencia', id, fecha } : null;
  }
  if (p === '/erp/finance/viatics') {
    const id = entero(params.get('highlight'));
    return id ? { tipo: 'viatico', id } : null;
  }
  if ((m = p.match(/^\/erp\/invoicing\/(\d+)$/))) {
    const id = entero(m[1]);
    return id ? { tipo: 'factura', id } : null;
  }
  return null;
}

/** Folio suelto que se puede resolver: actividad (`AN-0031`) o cotización (`NEX-…`, `NXR-…`). */
export function tipoDeFolio(folio: string): 'actividad' | 'cotizacion' | null {
  const f = String(folio ?? '').trim().toUpperCase();
  if (/^AN-\d{3,}$/.test(f)) return 'actividad';
  if (/^(NEX-[A-Z]{2}\d{8}-\d{4,}(-[A-Z]{2}(\.[A-Z]{2})*)?(-R\d+)?|NXR-\d{4}-\d{3,})$/.test(f)) return 'cotizacion';
  return null;
}

/**
 * Tarjeta de una liga, ya filtrada por los permisos de quien la ve. La web la pinta igual para todos
 * los tipos: tipo + folio, chip de estado, título, renglones de detalle, monto y «Abrir».
 */
export type TarjetaLiga = {
  ref: string;
  tipo: TipoLiga;
  /** `false`: no tiene permiso o no existe; solo se muestra el título genérico. */
  acceso: boolean;
  folio: string | null;
  titulo: string;
  estado: string | null;
  /** Renglones cortos: responsable, fecha, cliente… (ya en español). */
  detalle: string[];
  monto: { total: number; moneda: string } | null;
  href: string;
  /** Por qué la tarjeta va compacta («Sin acceso», «No se encontró»). */
  motivo?: string;
};

export const SIN_ACCESO = 'Sin acceso';
export const NO_ENCONTRADA = 'No se encontró';

/** Tarjeta genérica: lo único que ve quien no tiene acceso (o si el registro ya no existe). */
export function tarjetaGenerica(
  ref: string,
  tipo: TipoLiga,
  href: string,
  motivo: string,
  folio: string | null = null,
): TarjetaLiga {
  return {
    ref,
    tipo,
    acceso: false,
    folio,
    titulo: folio ? `${ETIQUETA_TIPO[tipo]} ${folio}` : ETIQUETA_TIPO[tipo],
    estado: null,
    detalle: [],
    monto: null,
    href,
    motivo,
  };
}

export const ESTADO_COTIZACION: Record<string, string> = {
  DRAFT: 'Borrador',
  SENT: 'Enviada',
  APPROVED: 'Aprobada',
  REJECTED: 'Rechazada',
  EXPIRED: 'Vencida',
};

export const ESTADO_PROYECTO: Record<string, string> = {
  ACTIVE: 'Activo',
  ON_HOLD: 'En pausa',
  COMPLETED: 'Terminado',
  PLANNED: 'Planeado',
  CANCELLED: 'Cancelado',
};

export const ESTADO_FACTURA: Record<string, string> = {
  DRAFT: 'Borrador',
  STAMPING: 'Timbrando',
  SENT: 'Emitida',
  PARTIALLY_PAID: 'Pago parcial',
  PAID: 'Pagada',
  OVERDUE: 'Vencida',
  CANCELLED: 'Cancelada',
  CREDITED: 'Con nota de crédito',
};

/** Fecha corta en hora de México: «29 oct» o «29 oct, 18:00». */
export function fechaCorta(d: Date | string | null | undefined, conHora = false): string | null {
  if (!d) return null;
  const fecha = typeof d === 'string' ? new Date(d) : d;
  if (!Number.isFinite(fecha.getTime())) return null;
  return fecha.toLocaleString('es-MX', {
    timeZone: 'America/Mexico_City',
    day: 'numeric',
    month: 'short',
    ...(conHora ? { hour: '2-digit', minute: '2-digit', hour12: false } : {}),
  });
}

/** Día de una columna `@db.Date` (medianoche UTC) sin correrlo de zona: «29 oct». */
export function diaCorto(iso: string): string {
  const [a, m, d] = iso.split('-').map(Number);
  const meses = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
  return `${d} ${meses[(m ?? 1) - 1] ?? ''}${a && a !== new Date().getFullYear() ? ` ${a}` : ''}`.trim();
}

/** «8 h 05 min» a partir de minutos. */
export function duracion(minutos: number): string {
  const m = Math.max(0, Math.round(minutos));
  const h = Math.floor(m / 60);
  const r = m % 60;
  if (!h) return `${r} min`;
  return r ? `${h} h ${String(r).padStart(2, '0')} min` : `${h} h`;
}

export function numero(v: unknown): number | null {
  if (v == null) return null;
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  if (typeof v === 'object' && 'toNumber' in (v as object)) {
    const n = (v as { toNumber: () => number }).toNumber();
    return Number.isFinite(n) ? n : null;
  }
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}
