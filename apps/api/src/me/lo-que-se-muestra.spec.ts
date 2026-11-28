import { esNoCumplida } from '../activities/incumplimiento';
import { workDayStart } from '../common/time/workday';
import { PALABRAS_DE_CERRADA, esCerradaParaLaCola, loQueSeMuestra } from './lo-que-se-muestra';

type Fila = {
  estatus: string;
  fechaFinalizacion: Date | null;
  fechaInicio: Date | null;
  fechaAsignacion: Date;
};

/** Evaluador mínimo de un `where` de Prisma: solo lo que usa el filtro (contains, gte, null, NOT, OR, AND). */
function cumple(fila: Record<string, unknown>, where: Record<string, unknown>): boolean {
  return Object.entries(where).every(([clave, cond]) => {
    if (clave === 'OR') return (cond as Record<string, unknown>[]).some((w) => cumple(fila, w));
    if (clave === 'AND') return (cond as Record<string, unknown>[]).every((w) => cumple(fila, w));
    if (clave === 'NOT') return !cumple(fila, cond as Record<string, unknown>);
    const valor = fila[clave];
    if (cond === null) return valor == null;
    const c = cond as { contains?: string; gte?: Date };
    if (c.contains !== undefined) {
      return typeof valor === 'string' && valor.toLowerCase().includes(c.contains.toLowerCase());
    }
    if (c.gte !== undefined) return valor instanceof Date && valor.getTime() >= c.gte.getTime();
    throw new Error(`condición no soportada en ${clave}`);
  });
}

// Sábado 28-11-2026, 11:00 de México.
const AHORA = new Date('2026-11-28T17:00:00.000Z');
const DAY_START = workDayStart(AHORA);
const HACE_7 = new Date(AHORA.getTime() - 7 * 24 * 60 * 60 * 1000);
const WHERE = loQueSeMuestra(DAY_START, HACE_7) as Record<string, unknown>;

/** Lo que el servicio enseña, tal como lo filtra en memoria (my-activities.service.ts, `list`). */
function seMuestraEnPantalla(f: Fila): boolean {
  const cerrada = esCerradaParaLaCola(f.estatus);
  const abierta = !cerrada;
  const cerradaHoy = cerrada && f.fechaFinalizacion != null && f.fechaFinalizacion.getTime() >= DAY_START.getTime();
  const noCumplidaReciente =
    esNoCumplida(f.estatus) && (f.fechaInicio ?? f.fechaAsignacion).getTime() >= HACE_7.getTime();
  return abierta || cerradaHoy || noCumplidaReciente;
}

const ESTATUS = [
  'Pendiente',
  'En Proceso',
  'Por Validar',
  'Pausada',
  'Finalizada',
  'finalizada',
  'FINALIZADA',
  'Completada',
  'Cancelada',
  'Aprobada',
  'No cumplida',
  'NO CUMPLIDA',
  'No cumplido',
  'Incumplida',
  'incumplido',
  '',
];
const FINALIZACIONES = [
  null,
  new Date('2026-11-28T16:00:00.000Z'), // hoy 10:00 de México
  new Date('2026-11-28T06:10:00.000Z'), // hoy 00:10 de México
  new Date('2026-11-28T05:30:00.000Z'), // ayer 23:30 de México
  new Date('2026-11-20T18:00:00.000Z'),
];
const INICIOS = [
  null,
  new Date('2026-11-28T15:00:00.000Z'),
  new Date('2026-11-22T18:00:00.000Z'), // hace 6 días
  new Date('2026-11-20T15:00:00.000Z'), // hace 8 días
];
const ASIGNACIONES = [new Date('2026-11-27T15:00:00.000Z'), new Date('2026-11-10T15:00:00.000Z')];

function todas(): Fila[] {
  const filas: Fila[] = [];
  for (const estatus of ESTATUS)
    for (const fechaFinalizacion of FINALIZACIONES)
      for (const fechaInicio of INICIOS)
        for (const fechaAsignacion of ASIGNACIONES)
          filas.push({ estatus, fechaFinalizacion, fechaInicio, fechaAsignacion });
  return filas;
}

describe('lo que se muestra en «Mis actividades»', () => {
  it('«cerrada» es exactamente la regla de antes', () => {
    const antes = (estatus: string) =>
      /finalizada|completada|cancelada|aprobada|no cumplida|incumplida/.test((estatus || '').toLowerCase());
    for (const estatus of ESTATUS) {
      expect(esCerradaParaLaCola(estatus)).toBe(antes(estatus));
    }
    expect(esCerradaParaLaCola(null)).toBe(false);
    expect(esCerradaParaLaCola(undefined)).toBe(false);
    expect(PALABRAS_DE_CERRADA).toHaveLength(6);
  });

  it('el filtro tiene tres ramas: abiertas, cerradas hoy y no cumplidas recientes', () => {
    expect((WHERE.OR as unknown[]).length).toBe(3);
  });

  it('nunca deja fuera algo que la pantalla enseña (sin falsos negativos)', () => {
    const filas = todas();
    expect(filas.length).toBe(ESTATUS.length * FINALIZACIONES.length * INICIOS.length * ASIGNACIONES.length);
    const perdidas = filas.filter((f) => seMuestraEnPantalla(f) && !cumple(f, WHERE));
    expect(perdidas).toEqual([]);
  });

  it('deja fuera lo cerrado de días anteriores, que es casi todo', () => {
    const vieja: Fila = {
      estatus: 'Finalizada',
      fechaFinalizacion: new Date('2026-11-20T18:00:00.000Z'),
      fechaInicio: new Date('2026-11-20T15:00:00.000Z'),
      fechaAsignacion: new Date('2026-11-10T15:00:00.000Z'),
    };
    expect(cumple(vieja, WHERE)).toBe(false);
    expect(cumple({ ...vieja, estatus: 'Cancelada' }, WHERE)).toBe(false);
    expect(cumple({ ...vieja, estatus: 'No cumplida' }, WHERE)).toBe(false); // de hace 8 días
  });

  it('el corte del día es el de México: 23:30 de ayer no entra y 00:10 de hoy sí', () => {
    const base = { estatus: 'Finalizada', fechaInicio: null, fechaAsignacion: new Date('2026-11-10T15:00:00.000Z') };
    expect(cumple({ ...base, fechaFinalizacion: new Date('2026-11-28T05:30:00.000Z') }, WHERE)).toBe(false);
    expect(cumple({ ...base, fechaFinalizacion: new Date('2026-11-28T06:10:00.000Z') }, WHERE)).toBe(true);
  });

  it('una no cumplida sin fecha de inicio se mide por su fecha de asignación', () => {
    const base = { estatus: 'No cumplida', fechaFinalizacion: null, fechaInicio: null };
    expect(cumple({ ...base, fechaAsignacion: new Date('2026-11-27T15:00:00.000Z') }, WHERE)).toBe(true);
    expect(cumple({ ...base, fechaAsignacion: new Date('2026-11-10T15:00:00.000Z') }, WHERE)).toBe(false);
  });

  it('lo que sobra es poco: en la matriz, casi todo lo que pasa el filtro se muestra', () => {
    const filas = todas();
    const pasan = filas.filter((f) => cumple(f, WHERE));
    const deMas = pasan.filter((f) => !seMuestraEnPantalla(f));
    // De más solo pueden venir filas con fecha de cierre de hoy cuyo estatus no es de cerrada: no existen en la matriz
    // porque toda fila abierta ya se muestra. El filtro no trae ruido.
    expect(deMas).toEqual([]);
  });
});
