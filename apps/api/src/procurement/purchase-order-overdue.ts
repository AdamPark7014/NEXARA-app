/**
 * Órdenes de compra atrasadas: a quién avisar y con qué texto.
 *
 * El recordatorio que ya existe (`CronService.handlePOReminders`) avisa por correo de las
 * órdenes que **están por llegar**; cuando la fecha pasa y la mercancía no aparece, nadie se
 * entera. El tablero de compras sólo cuenta cuántas van atrasadas
 * (`ProcurementService.getProcurementDashboard`).
 *
 * Archivo puro a propósito: sin Prisma ni Nest. La regla «quién se entera de qué» tiene que
 * poder probarse sin base de datos; la tarea programada sólo trae los datos y entrega los avisos.
 *
 * Reglas:
 *  - Atrasada = la fecha esperada ya pasó (día de calendario en la zona de la empresa, no en
 *    UTC) y la orden sigue por recibir con partidas pendientes.
 *  - Un solo resumen por persona y por empresa: quien compró, y sus jefes por organigrama.
 *  - Nada se mezcla entre empresas: cada aviso lleva sólo órdenes de su propio `companyId`.
 */
import { appUrls } from '../common/app-urls.js';
import { workDateKey } from '../common/time/workday.js';
import { nombreCorto } from '../notifications/notification-push-meta.js';

/** Estados en los que la mercancía todavía se espera. `DRAFT` no cuenta: aún no se pidió. */
export const ESTADOS_OC_POR_RECIBIR = ['SENT', 'CONFIRMED', 'PARTIALLY_RECEIVED'] as const;

/** Días de atraso desde los cuales el aviso sube a prioridad alta. */
export const DIAS_ATRASO_URGENTE = 7;

export type PartidaOc = {
  quantity: number | string;
  receivedQty: number | string;
};

export type OrdenParaAtraso = {
  id: number;
  poNumber: string;
  companyId: number;
  status: string;
  /** Columna `@db.Date`: llega como medianoche UTC del día prometido. */
  expectedDate: Date | string | null;
  createdById: number | null;
  approvedById?: number | null;
  /** Nombre de quien la creó (o, si no hay, de quien la aprobó). */
  responsableNombre?: string | null;
  proveedor?: string | null;
  partidas: PartidaOc[];
};

export type EntradaAtrasos = {
  ordenes: OrdenParaAtraso[];
  /** Instante actual; el «hoy» se mide en la zona horaria de la empresa. */
  hoy: Date;
  /** Jefes de una persona **dentro de esa empresa** (ya sin ella misma y sin gente de otras empresas). */
  jefesDe: (companyId: number, userId: number) => readonly number[];
  /** Claves `claveAvisoOc(...)` a las que ya se les avisó hoy. */
  yaAvisados?: ReadonlySet<string>;
};

export type AvisoOcAtrasada = {
  companyId: number;
  userId: number;
  /** Órdenes que resume, de la más atrasada a la menos. */
  ordenIds: number[];
  titulo: string;
  mensaje: string;
  url: string;
  prioridad: 'high' | 'normal';
};

export type PlanAtrasos = {
  avisos: AvisoOcAtrasada[];
  /** Órdenes atrasadas encontradas (antes de repartirlas). */
  atrasadas: number;
  /** Atrasadas sin creador ni aprobador: no hay a quién avisar. */
  sinResponsable: number[];
  /** Resúmenes que se omitieron porque hoy ya se enviaron. */
  omitidosPorYaAvisados: number;
};

type Atrasada = {
  id: number;
  poNumber: string;
  companyId: number;
  responsableId: number;
  responsableNombre: string;
  proveedor: string | null;
  fechaEsperada: string;
  dias: number;
};

/** Clave para saber si una persona ya recibió hoy su resumen de una empresa. */
export function claveAvisoOc(companyId: number, userId: number): string {
  return `${companyId}:${userId}`;
}

function claveDia(valor: Date | string): string {
  return typeof valor === 'string' ? valor.slice(0, 10) : valor.toISOString().slice(0, 10);
}

/** Días de calendario entre dos claves `AAAA-MM-DD` (positivo si `hasta` es posterior). */
function diasEntre(desde: string, hasta: string): number {
  const [y1, m1, d1] = desde.split('-').map(Number);
  const [y2, m2, d2] = hasta.split('-').map(Number);
  return Math.round((Date.UTC(y2, m2 - 1, d2) - Date.UTC(y1, m1 - 1, d1)) / 86_400_000);
}

const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

/** «24 sep» a partir de `2026-09-24`. Sin Intl: el texto no depende de la versión de ICU. */
function fechaCorta(clave: string): string {
  const [, mes, dia] = clave.split('-').map(Number);
  return `${dia} ${MESES[mes - 1] ?? ''}`.trim();
}

function diasTexto(n: number): string {
  return `${n} ${n === 1 ? 'día' : 'días'}`;
}

/** «a», «a y b», «a, b y c», «a, b, c y 2 más». */
function enLista(partes: string[], max = 3): string {
  if (partes.length <= max) {
    if (partes.length <= 1) return partes[0] ?? '';
    return `${partes.slice(0, -1).join(', ')} y ${partes[partes.length - 1]}`;
  }
  return `${partes.slice(0, max).join(', ')} y ${partes.length - max} más`;
}

/** La orden está completa cuando cada partida ya recibió al menos lo pedido. */
export function estaCompletamenteRecibida(partidas: PartidaOc[]): boolean {
  if (!partidas.length) return false;
  return partidas.every((p) => Number(p.receivedQty) >= Number(p.quantity) - 1e-6);
}

/**
 * Órdenes atrasadas al día de hoy, con sus días de atraso.
 * Expuesta para que la tarea programada pueda contar y registrar lo que encontró.
 */
export function seleccionarAtrasadas(
  ordenes: OrdenParaAtraso[],
  hoy: Date,
): { atrasadas: Atrasada[]; sinResponsable: number[] } {
  const hoyClave = workDateKey(hoy);
  const atrasadas: Atrasada[] = [];
  const sinResponsable: number[] = [];

  for (const o of ordenes) {
    if (!(ESTADOS_OC_POR_RECIBIR as readonly string[]).includes(o.status)) continue;
    if (!o.expectedDate) continue;
    const fechaEsperada = claveDia(o.expectedDate);
    const dias = diasEntre(fechaEsperada, hoyClave);
    if (dias < 1) continue; // el día prometido todavía no termina
    if (estaCompletamenteRecibida(o.partidas)) continue;

    const responsableId = o.createdById ?? o.approvedById ?? null;
    if (responsableId == null) {
      sinResponsable.push(o.id);
      continue;
    }
    atrasadas.push({
      id: o.id,
      poNumber: o.poNumber,
      companyId: o.companyId,
      responsableId,
      responsableNombre: nombreCorto(o.responsableNombre) || 'un compañero de compras',
      proveedor: o.proveedor?.trim() || null,
      fechaEsperada,
      dias,
    });
  }

  atrasadas.sort((a, b) => b.dias - a.dias || a.poNumber.localeCompare(b.poNumber));
  return { atrasadas, sinResponsable };
}

function etiquetaOc(a: Atrasada): string {
  return `${a.poNumber} (${diasTexto(a.dias)})`;
}

/** «Ana López (2), Luis Pérez (1)»: por persona, la que más órdenes tiene primero. */
function porPersona(equipo: Map<number, Atrasada[]>): string {
  const filas = [...equipo.values()]
    .map((lista) => ({ nombre: lista[0].responsableNombre, n: lista.length, max: lista[0].dias }))
    .sort((a, b) => b.n - a.n || b.max - a.max || a.nombre.localeCompare(b.nombre));
  return enLista(filas.map((f) => `${f.nombre} (${f.n})`));
}

function armarAviso(
  companyId: number,
  userId: number,
  propias: Atrasada[],
  equipo: Map<number, Atrasada[]>,
): AvisoOcAtrasada {
  const delEquipo = [...equipo.values()].flat();
  const todas = [...propias, ...delEquipo].sort(
    (a, b) => b.dias - a.dias || a.poNumber.localeCompare(b.poNumber),
  );
  const total = todas.length;
  const masAtrasada = todas[0];

  let titulo: string;
  let mensaje: string;

  if (total === 1) {
    const oc = masAtrasada;
    const de = oc.proveedor ? ` de ${oc.proveedor}` : '';
    const cuando = `debía llegar el ${fechaCorta(oc.fechaEsperada)} y sigue sin recibirse (${diasTexto(oc.dias)} de atraso)`;
    if (propias.length) {
      titulo = 'Orden de compra atrasada';
      mensaje = `${oc.poNumber}${de} ${cuando}. Confirma con el proveedor cuándo llega.`;
    } else {
      titulo = 'Orden de compra atrasada en tu equipo';
      mensaje = `${oc.poNumber}${de}, a cargo de ${oc.responsableNombre}, ${cuando}.`;
    }
  } else if (propias.length && !delEquipo.length) {
    titulo = `${total} órdenes de compra atrasadas`;
    mensaje =
      `Debían llegar y siguen sin recibirse: ${enLista(propias.map(etiquetaOc))}. ` +
      'Confirma con el proveedor cuándo llegan.';
  } else if (!propias.length) {
    titulo = `${total} órdenes de compra atrasadas en tu equipo`;
    mensaje =
      `Siguen sin recibirse: ${porPersona(equipo)}. ` +
      `La más atrasada: ${masAtrasada.poNumber} (${diasTexto(masAtrasada.dias)}).`;
  } else {
    titulo = `${total} órdenes de compra atrasadas`;
    mensaje =
      `Tuyas: ${enLista(propias.map(etiquetaOc))}. ` +
      `De tu equipo: ${porPersona(equipo)}.`;
  }

  return {
    companyId,
    userId,
    ordenIds: todas.map((a) => a.id),
    titulo,
    mensaje,
    url: appUrls.erpProcurement('orders', total === 1 ? masAtrasada.id : undefined),
    prioridad: masAtrasada.dias >= DIAS_ATRASO_URGENTE ? 'high' : 'normal',
  };
}

/**
 * Reparte las órdenes atrasadas: un resumen por persona y por empresa.
 *
 * - Quien compró recibe las suyas.
 * - Sus jefes (`jefesDe`) reciben un resumen de lo que está atrasado en su equipo.
 * - Quien es a la vez comprador y jefe recibe **un solo** aviso con las dos partes.
 * - A quien ya se le avisó hoy (`yaAvisados`) no se le repite.
 */
export function planificarAvisosOcAtrasadas(entrada: EntradaAtrasos): PlanAtrasos {
  const { atrasadas, sinResponsable } = seleccionarAtrasadas(entrada.ordenes, entrada.hoy);
  const yaAvisados = entrada.yaAvisados ?? new Set<string>();

  type Buzon = { propias: Atrasada[]; equipo: Map<number, Atrasada[]> };
  // empresa → persona → lo que le toca. Empresas separadas: nada se cruza.
  const porEmpresa = new Map<number, Map<number, Buzon>>();

  const buzon = (companyId: number, userId: number): Buzon => {
    let personas = porEmpresa.get(companyId);
    if (!personas) {
      personas = new Map();
      porEmpresa.set(companyId, personas);
    }
    let b = personas.get(userId);
    if (!b) {
      b = { propias: [], equipo: new Map() };
      personas.set(userId, b);
    }
    return b;
  };

  for (const a of atrasadas) {
    buzon(a.companyId, a.responsableId).propias.push(a);
    const jefes = new Set(entrada.jefesDe(a.companyId, a.responsableId));
    jefes.delete(a.responsableId);
    for (const jefeId of jefes) {
      const equipo = buzon(a.companyId, jefeId).equipo;
      const lista = equipo.get(a.responsableId) ?? [];
      lista.push(a);
      equipo.set(a.responsableId, lista);
    }
  }

  const avisos: AvisoOcAtrasada[] = [];
  let omitidosPorYaAvisados = 0;
  for (const [companyId, personas] of porEmpresa) {
    for (const [userId, b] of personas) {
      if (yaAvisados.has(claveAvisoOc(companyId, userId))) {
        omitidosPorYaAvisados += 1;
        continue;
      }
      avisos.push(armarAviso(companyId, userId, b.propias, b.equipo));
    }
  }

  return { avisos, atrasadas: atrasadas.length, sinResponsable, omitidosPorYaAvisados };
}
