import { BadRequestException } from '@nestjs/common';

export type PrioridadRenglon = 'alta' | 'media' | 'baja';

export type PlanRenglon = {
  id: string;
  personaId: number | null;
  personaNombre: string;
  actividad: string;
  como: string;
  porque: string;
  clienteId: number | null;
  clienteNombre: string;
  proyectoId: number | null;
  proyectoNombre: string;
  actividadId: number | null;
  horarioEstimado: string;
  prioridad: PrioridadRenglon;
  actividadCreadaId: number | null;
};

const PRIORIDADES: PrioridadRenglon[] = ['alta', 'media', 'baja'];

export function nuevoIdRenglon(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `r-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function asIntOrNull(v: unknown): number | null {
  if (v == null || v === '') return null;
  const n = Number(v);
  if (!Number.isSafeInteger(n) || n <= 0) throw new BadRequestException('Las referencias del renglón deben ser números enteros positivos.');
  return n;
}

function asStr(v: unknown, max = 500): string {
  return String(v ?? '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max);
}

export function renglonVacio(parcial?: Partial<PlanRenglon>): PlanRenglon {
  const base: PlanRenglon = {
    id: nuevoIdRenglon(),
    personaId: null,
    personaNombre: '',
    actividad: '',
    como: '',
    porque: '',
    clienteId: null,
    clienteNombre: '',
    proyectoId: null,
    proyectoNombre: '',
    actividadId: null,
    horarioEstimado: '',
    prioridad: 'media',
    actividadCreadaId: null,
  };
  if (!parcial) return base;
  return {
    id: asStr(parcial.id, 80) || base.id,
    personaId: asIntOrNull(parcial.personaId),
    personaNombre: asStr(parcial.personaNombre, 160),
    actividad: asStr(parcial.actividad, 500),
    como: asStr(parcial.como, 800),
    porque: asStr(parcial.porque, 800),
    clienteId: asIntOrNull(parcial.clienteId),
    clienteNombre: asStr(parcial.clienteNombre, 200),
    proyectoId: asIntOrNull(parcial.proyectoId),
    proyectoNombre: asStr(parcial.proyectoNombre, 200),
    actividadId: asIntOrNull(parcial.actividadId),
    horarioEstimado: asStr(parcial.horarioEstimado, 40),
    prioridad: PRIORIDADES.includes(parcial.prioridad as PrioridadRenglon)
      ? (parcial.prioridad as PrioridadRenglon)
      : 'media',
    actividadCreadaId: asIntOrNull(parcial.actividadCreadaId),
  };
}

/** Normaliza renglones; `undefined`/`null` → []. Si llega valor no lista, 400. */
export function normalizarRenglones(raw: unknown): PlanRenglon[] {
  if (raw == null) return [];
  let lista: unknown = raw;
  if (typeof raw === 'string') {
    try {
      lista = JSON.parse(raw);
    } catch {
      throw new BadRequestException('Los renglones del plan no son JSON válido.');
    }
  }
  if (!Array.isArray(lista)) {
    throw new BadRequestException('Los renglones del plan deben ser una lista.');
  }
  if (lista.length > 200) throw new BadRequestException('El plan admite hasta 200 renglones.');
  const out: PlanRenglon[] = [];
  for (const item of lista) {
    if (!item || typeof item !== 'object' || Array.isArray(item)) throw new BadRequestException('Cada renglón debe ser un objeto.');
    const r = renglonVacio(item as Partial<PlanRenglon>);
    if (!r.actividad && !r.personaNombre) continue;
    out.push(r);
  }
  if (new Set(out.map(r => r.id)).size !== out.length) throw new BadRequestException('Los renglones deben tener identificadores distintos.');
  return out;
}

/** Heurística por líneas: «Nombre: qué» o «Nombre - qué»; sin IA. */
export function renglonesDesdeTextoLibre(texto: string): PlanRenglon[] {
  const lineas = String(texto ?? '')
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  return lineas.map((linea) => {
    const m = linea.match(/^(.{2,80}?)\s*[:\-–—]\s*(.+)$/);
    if (m) {
      return renglonVacio({ personaNombre: m[1], actividad: m[2] });
    }
    return renglonVacio({ actividad: linea });
  });
}

export function textoResumenDeRenglones(rows: PlanRenglon[]): string {
  return rows
    .map((r) =>
      [r.personaNombre, r.actividad, r.clienteNombre || r.proyectoNombre, r.horarioEstimado]
        .filter(Boolean)
        .join(' | '),
    )
    .join('\n');
}

export function indicadoresDeRenglones(
  planes: Array<{ renglones: PlanRenglon[]; autorId: number; autorNombre?: string }>,
  equipoIds: number[],
): {
  planesRecibidos: number;
  personasAsignadas: number;
  personasSinAsignacion: number;
  actividadesProgramadas: number;
  conflictosHorario: Array<{ personaId: number; personaNombre: string; horario: string; count: number }>;
} {
  const todos = planes.flatMap((p) => p.renglones);
  const asignadas = new Set<number>();
  for (const r of todos) {
    if (r.personaId != null) asignadas.add(r.personaId);
  }
  const equipo = new Set(equipoIds);
  let sinAsignacion = 0;
  for (const id of equipo) {
    if (!asignadas.has(id)) sinAsignacion += 1;
  }

  const mapa = new Map<string, { personaId: number; personaNombre: string; horario: string; count: number }>();
  for (const r of todos) {
    if (r.personaId == null || !r.horarioEstimado) continue;
    const key = `${r.personaId}|${r.horarioEstimado}`;
    const prev = mapa.get(key);
    if (prev) prev.count += 1;
    else {
      mapa.set(key, {
        personaId: r.personaId,
        personaNombre: r.personaNombre || `Usuario ${r.personaId}`,
        horario: r.horarioEstimado,
        count: 1,
      });
    }
  }

  return {
    planesRecibidos: planes.length,
    personasAsignadas: [...asignadas].filter((id) => equipo.has(id)).length,
    personasSinAsignacion: sinAsignacion,
    actividadesProgramadas: todos.filter((r) => r.actividadCreadaId != null || Boolean(r.actividad)).length,
    conflictosHorario: [...mapa.values()].filter((c) => c.count > 1),
  };
}
