/**
 * Formatos de actividades (Adam, 01-11-2026): «tengamos nuestros paquetes de formatos y con eso
 * generamos actividades en friega». Un formato es una receta: qué actividades lleva, cuánto tarda cada
 * una según la cantidad, qué se fotografía y qué herramienta se lleva. No guarda cliente, personas ni
 * fechas, para que el de una crepería sirva para la siguiente.
 *
 * Módulo puro (sin Nest ni Prisma).
 */
import { BadRequestException } from '@nestjs/common';
import { workDateKey, workDayAtClock, workClock, WORKDAY_TIMEZONE } from '../common/time/workday.js';
import { entregaCalculada, type JornadaEntrega } from '../activities/tiempo-entrega.js';
import { MOMENTOS, normalizarCampos } from '../activities/evidence/evidence-fields.helpers.js';

/** Proyecto y obra salen de la programación del proyecto (`proyecto-programacion.service.ts`). */
export const TIPOS_RENGLON = ['tarea', 'servicio', 'comercial'] as const;
export type TipoRenglon = (typeof TIPOS_RENGLON)[number];

export const MAX_RENGLONES = 30;
export const MAX_CANTIDAD = 200;
/** Ninguna actividad dura más de 12 horas (regla del dueño): lo demás se reanuda cada día. */
export const TOPE_MIN_POR_ACTIVIDAD = 720;
/** Lo que cabe en un día de trabajo al repartir una actividad larga. */
const MIN_POR_DIA = 480;

export type PuntoFormato = { nombre: string; momentos: string[] };
export type HerramientaFormato = { descripcion: string; cantidad: number };

export type RenglonFormato = {
  titulo: string;
  coreKind: TipoRenglon;
  /** Subtipo de tarea (`TAREA_TIPOS`). */
  tipo: string | null;
  /** Minutos fijos, más los que suma cada unidad (cámara, equipo…). */
  minutosBase: number;
  minutosPorUnidad: number;
  /** Fotos de evidencia por persona: de 2 a 8. */
  fotos: number;
  indicaciones: string | null;
  /** Lo que hay que fotografiar por nombre. */
  puntos: PuntoFormato[];
  herramientas: HerramientaFormato[];
};

export type RecetaFormato = {
  /** Cómo se llama lo que se cuenta: «Cámaras», «Equipos». Sin unidad, no se pide cantidad. */
  unidad: string | null;
  cantidadPorOmision: number;
  renglones: RenglonFormato[];
};

const texto = (v: unknown, max: number): string => (typeof v === 'string' ? v.trim().slice(0, max) : '');
const entero = (v: unknown, min: number, max: number, porOmision: number): number => {
  const n = Math.round(Number(v));
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : porOmision;
};

function normalizarHerramientas(v: unknown): HerramientaFormato[] {
  if (!Array.isArray(v)) return [];
  const vistas = new Set<string>();
  const salida: HerramientaFormato[] = [];
  for (const crudo of v) {
    const descripcion = texto((crudo as { descripcion?: unknown })?.descripcion, 160);
    const clave = descripcion.toLowerCase();
    if (!descripcion || vistas.has(clave)) continue;
    vistas.add(clave);
    salida.push({ descripcion, cantidad: entero((crudo as { cantidad?: unknown }).cantidad, 1, 999, 1) });
  }
  return salida;
}

export function normalizarRenglon(crudo: unknown): RenglonFormato | null {
  if (!crudo || typeof crudo !== 'object') return null;
  const r = crudo as Record<string, unknown>;
  const titulo = texto(r.titulo, 200);
  if (!titulo) return null;
  const coreKind = (TIPOS_RENGLON as readonly string[]).includes(String(r.coreKind)) ? (r.coreKind as TipoRenglon) : 'tarea';
  return {
    titulo,
    coreKind,
    tipo: coreKind === 'tarea' ? texto(r.tipo, 120) || null : null,
    minutosBase: entero(r.minutosBase, 0, TOPE_MIN_POR_ACTIVIDAD * 10, 60),
    minutosPorUnidad: entero(r.minutosPorUnidad, 0, TOPE_MIN_POR_ACTIVIDAD, 0),
    fotos: entero(r.fotos, 2, 8, 4),
    indicaciones: texto(r.indicaciones, 2000) || null,
    puntos: normalizarCampos(r.puntos).map((c) => ({ nombre: c.nombre, momentos: [...c.momentos] })),
    herramientas: normalizarHerramientas(r.herramientas),
  };
}

/** La receta tal como se guarda. Lo que no sirve se quita; sin renglones no hay formato. */
export function normalizarReceta(crudo: unknown): RecetaFormato {
  const r = (crudo ?? {}) as Record<string, unknown>;
  const renglones = (Array.isArray(r.renglones) ? r.renglones : [])
    .map(normalizarRenglon)
    .filter((x): x is RenglonFormato => x != null);
  if (!renglones.length) throw new BadRequestException('Un formato lleva al menos una actividad');
  if (renglones.length > MAX_RENGLONES) {
    throw new BadRequestException(`Un formato lleva a lo más ${MAX_RENGLONES} actividades`);
  }
  const unidad = texto(r.unidad, 40) || null;
  return { unidad, cantidadPorOmision: entero(r.cantidadPorOmision, 1, MAX_CANTIDAD, 1), renglones };
}

export function minutosDeRenglon(r: Pick<RenglonFormato, 'minutosBase' | 'minutosPorUnidad'>, cantidad: number): number {
  return Math.max(5, r.minutosBase + r.minutosPorUnidad * Math.max(0, cantidad));
}

const hm = (valor: string, respaldo: string): [number, number] => {
  const m = /^([01]\d|2[0-3]):([0-5]\d)$/.exec((valor ?? '').trim()) ?? /^([01]\d|2[0-3]):([0-5]\d)$/.exec(respaldo);
  return m ? [Number(m[1]), Number(m[2])] : [10, 0];
};

/** El mismo día de México a esa hora. */
function aLaHora(dia: Date, valor: string, respaldo: string): Date {
  const [h, m] = hm(valor, respaldo);
  return workDayAtClock(dia, h, m);
}

/** Siguiente día de lunes a viernes, a la hora de entrada. */
function siguienteLaborable(dia: Date, jornada: JornadaEntrega): Date {
  let d = new Date(dia.getTime() + 24 * 60 * 60 * 1000);
  while ([0, 6].includes(workClock(d).weekday)) d = new Date(d.getTime() + 24 * 60 * 60 * 1000);
  return aLaHora(d, jornada.entrada, '10:00');
}

/** Minutos de trabajo entre dos momentos del mismo día, sin la comida. */
function minutosUtiles(desde: Date, hasta: Date, jornada: JornadaEntrega): number {
  const comidaDesde = aLaHora(desde, jornada.comidaDesde, '15:00');
  const comidaHasta = aLaHora(desde, jornada.comidaHasta, '16:00');
  const total = hasta.getTime() - desde.getTime();
  const cruce = Math.min(hasta.getTime(), comidaHasta.getTime()) - Math.max(desde.getTime(), comidaDesde.getTime());
  return Math.max(0, Math.round((total - Math.max(0, cruce)) / 60_000));
}

export type RenglonPlaneado = {
  fechaInicio: Date;
  fechaEntrega: Date;
  /** Si no cabe en un día: del primero al último, ambos incluidos (`AAAA-MM-DD`). */
  periodo: { inicio: string; fin: string } | null;
};

/**
 * Una detrás de otra, respetando comida y salida: un paquete de 7 horas cabe en un día; uno de 20 se
 * reparte. Sin esto, las cinco actividades quedarían a la misma hora y todas «atrasadas» desde el inicio.
 */
export function planearRenglones(minutos: number[], inicio: Date, jornada: JornadaEntrega): RenglonPlaneado[] {
  let cursor = inicio;
  return minutos.map((total) => {
    const salidaHoy = aLaHora(cursor, jornada.salida, '18:00');
    // A menos de 15 minutos de la salida ya no empieza nada: mañana.
    if (salidaHoy.getTime() - cursor.getTime() < 15 * 60_000) cursor = siguienteLaborable(cursor, jornada);
    const fechaInicio = cursor;
    let faltan = Math.max(5, total);
    let dia = cursor;
    let fin = entregaCalculada(dia, faltan, jornada);
    let hechos = minutosUtiles(dia, fin, jornada);
    while (faltan - hechos > 0 && hechos >= 0) {
      faltan -= hechos;
      dia = siguienteLaborable(dia, jornada);
      fin = entregaCalculada(dia, faltan, jornada);
      hechos = Math.max(1, minutosUtiles(dia, fin, jornada));
    }
    cursor = fin;
    const primero = workDateKey(fechaInicio, WORKDAY_TIMEZONE);
    const ultimo = workDateKey(fin, WORKDAY_TIMEZONE);
    return { fechaInicio, fechaEntrega: fin, periodo: primero === ultimo ? null : { inicio: primero, fin: ultimo } };
  });
}

/** Lo que ya se hizo se vuelve receta: sin cliente, sin personas y sin fechas. */
export function recetaDesdeActividad(a: {
  titulo: string;
  coreKind: string | null;
  ticketTypeCustom: string | null;
  tiempoEstimadoMin: number | null;
  evidencePhotoRequired: number | null;
  indicaciones: string | null;
  evidenceFields?: Array<{ nombre: string; momentos: unknown }>;
  toolRequirements?: Array<{ descripcion: string; cantidad: number | null }>;
}): RecetaFormato {
  const renglon = normalizarRenglon({
    titulo: a.titulo,
    coreKind: a.coreKind ?? 'tarea',
    tipo: a.ticketTypeCustom,
    minutosBase: a.tiempoEstimadoMin ?? 60,
    minutosPorUnidad: 0,
    fotos: a.evidencePhotoRequired ?? 4,
    indicaciones: a.indicaciones,
    puntos: (a.evidenceFields ?? []).map((f) => ({ nombre: f.nombre, momentos: f.momentos })),
    herramientas: a.toolRequirements ?? [],
  });
  if (!renglon) throw new BadRequestException('Esa actividad no tiene título');
  return { unidad: null, cantidadPorOmision: 1, renglones: [renglon] };
}

const ANTES_Y_DESPUES = [MOMENTOS[0], MOMENTOS[2]];

const renglon = (r: Partial<RenglonFormato> & Pick<RenglonFormato, 'titulo'>): RenglonFormato => ({
  coreKind: 'tarea',
  tipo: null,
  minutosBase: 60,
  minutosPorUnidad: 0,
  fotos: 4,
  indicaciones: null,
  puntos: [],
  herramientas: [],
  ...r,
});

/**
 * Los tres con los que arranca una empresa. Los minutos salen de la tabla de estándares aprobada
 * (`ai/estandar/tabla-estandar.ts`): instalación 30 + 45 por dispositivo, cableado 45 por nodo,
 * preventivo 20 + 15 por equipo. Se editan como cualquier otro.
 */
export function formatosIniciales(): Array<{ nombre: string; descripcion: string; receta: RecetaFormato }> {
  return [
    {
      nombre: 'Instalación CCTV',
      descripcion: 'De levantamiento a entrega, por cantidad de cámaras.',
      receta: {
        unidad: 'Cámaras',
        cantidadPorOmision: 4,
        renglones: [
          renglon({ titulo: 'Levantamiento y marcado de puntos', tipo: 'Levantamiento', minutosBase: 60 }),
          renglon({
            titulo: 'Canalización y cableado',
            tipo: 'Cableado y canalización',
            minutosBase: 0,
            minutosPorUnidad: 45,
            puntos: [{ nombre: 'Canalización', momentos: ANTES_Y_DESPUES }],
          }),
          renglon({
            titulo: 'Montaje de cámaras',
            tipo: 'Instalación',
            minutosBase: 30,
            minutosPorUnidad: 45,
            puntos: [{ nombre: 'Cámaras montadas', momentos: [MOMENTOS[2]] }],
          }),
          renglon({
            titulo: 'Configurar NVR y app',
            tipo: 'Configuración y soporte remoto',
            minutosBase: 45,
            minutosPorUnidad: 5,
            puntos: [{ nombre: 'Rack', momentos: [MOMENTOS[2]] }],
          }),
          renglon({
            titulo: 'Pruebas y entrega al cliente',
            coreKind: 'servicio',
            minutosBase: 30,
            fotos: 2,
            puntos: [{ nombre: 'Hoja de servicio', momentos: [MOMENTOS[2]] }],
          }),
        ],
      },
    },
    {
      nombre: 'Sucursal de restaurante',
      descripcion: 'El paquete de una sucursal: el mismo para la siguiente.',
      receta: {
        unidad: 'Cámaras',
        cantidadPorOmision: 8,
        renglones: [
          renglon({ titulo: 'Levantamiento con el gerente', tipo: 'Levantamiento', minutosBase: 45 }),
          renglon({
            titulo: 'Canalización y cableado',
            tipo: 'Cableado y canalización',
            minutosBase: 0,
            minutosPorUnidad: 45,
            puntos: [{ nombre: 'Canalización', momentos: ANTES_Y_DESPUES }],
          }),
          renglon({
            titulo: 'Montaje de cámaras',
            tipo: 'Instalación',
            minutosBase: 30,
            minutosPorUnidad: 45,
            puntos: [{ nombre: 'Cámaras montadas', momentos: [MOMENTOS[2]] }],
          }),
          renglon({
            titulo: 'Rack, red y NVR',
            tipo: 'Configuración y soporte remoto',
            minutosBase: 120,
            puntos: [{ nombre: 'Rack', momentos: [MOMENTOS[2]] }],
          }),
          renglon({
            titulo: 'Capacitación y entrega',
            coreKind: 'servicio',
            minutosBase: 40,
            fotos: 2,
            puntos: [{ nombre: 'Hoja de servicio', momentos: [MOMENTOS[2]] }],
          }),
        ],
      },
    },
    {
      nombre: 'Mantenimiento preventivo',
      descripcion: 'Visita de mantenimiento, por cantidad de equipos.',
      receta: {
        unidad: 'Equipos',
        cantidadPorOmision: 6,
        renglones: [
          renglon({
            titulo: 'Limpieza y revisión de equipos',
            tipo: 'Mantenimiento preventivo',
            minutosBase: 20,
            minutosPorUnidad: 15,
            puntos: [{ nombre: 'Equipos', momentos: ANTES_Y_DESPUES }],
          }),
          renglon({ titulo: 'Respaldo de configuración', tipo: 'Configuración y soporte remoto', minutosBase: 30, fotos: 2 }),
          renglon({
            titulo: 'Reporte al cliente',
            coreKind: 'servicio',
            minutosBase: 20,
            fotos: 2,
            puntos: [{ nombre: 'Hoja de servicio', momentos: [MOMENTOS[2]] }],
          }),
        ],
      },
    },
  ];
}
