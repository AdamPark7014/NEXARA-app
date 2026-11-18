import { erpFetch } from '@/lib/erp-api';

export type EstadoPlan = 'ENVIADO' | 'PROGRAMADO' | 'DEVUELTO';
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

export type PlanDiario = {
  id: number;
  fecha: string;
  texto: string;
  estado: EstadoPlan;
  notaSupervisor?: string | null;
  renglones?: PlanRenglon[];
  autor?: { id: number; nombre: string; email?: string };
  supervisor?: { id: number; nombre: string; email?: string };
};

export type IndicadoresPlan = {
  planesRecibidos: number;
  personasAsignadas: number;
  personasSinAsignacion: number;
  actividadesProgramadas: number;
  conflictosHorario: Array<{ personaId: number; personaNombre: string; horario: string; count: number }>;
};

export type PlanesResponse = {
  rol: 'supervisor' | 'autor';
  puedeEnviar?: boolean;
  puedeCerrar?: boolean;
  fecha: string;
  planes: PlanDiario[];
  faltantes: Array<{ id: number; nombre: string; email: string }>;
  indicadores?: IndicadoresPlan | null;
  propios?: PlanDiario[];
};

export type PersonaCierre = {
  userId: number;
  nombre: string;
  programadas: number;
  terminadas: number;
  en_revision: number;
  no_cumplidas: number;
  sin_empezar: number;
  en_curso: number;
  checo: boolean;
  retardo: boolean;
  minutosTarde: number;
  falta: boolean;
  actividades?: Array<{ id: number; titulo: string; estatus: string; bucket: string }>;
};

export type PlanVsReal = {
  planificados: number;
  conActividad: number;
  cumplidos: number;
  sinProgramar: number;
  detalle: Array<{
    planId: number;
    renglonId: string;
    personaNombre: string;
    actividad: string;
    actividadCreadaId: number | null;
    bucket: string | null;
  }>;
};

export type CierreResponse =
  | {
      rol: 'supervisor';
      fecha: string;
      personas: PersonaCierre[];
      totales: Record<string, number>;
      planVsReal?: PlanVsReal;
      cierre: { id: number; comentario?: string | null; createdAt?: string } | null;
      puedeEntregar: boolean;
    }
  | {
      rol: 'direccion';
      fecha: string;
      cierres: Array<{
        id: number;
        comentario?: string | null;
        supervisor?: { id: number; nombre: string };
        resumenJson?: { personas: PersonaCierre[]; totales: Record<string, number> } | null;
      }>;
    };

export function fetchPlanes(token: string, fecha?: string) {
  const q = fecha ? `?fecha=${encodeURIComponent(fecha)}` : '';
  return erpFetch<PlanesResponse>(`supervision/planes${q}`, token);
}

export function enviarPlan(
  token: string,
  body: { fecha: string; texto?: string; renglones?: PlanRenglon[]; pegarTexto?: string },
) {
  return erpFetch<PlanDiario>('supervision/plan', token, { method: 'POST', body: JSON.stringify(body) });
}

export function marcarProgramado(token: string, id: number) {
  return erpFetch(`supervision/plan/${id}/programado`, token, { method: 'POST', body: '{}' });
}

export function devolverPlan(token: string, id: number, nota?: string) {
  return erpFetch(`supervision/plan/${id}/devolver`, token, {
    method: 'POST',
    body: JSON.stringify({ nota }),
  });
}

export function programarRenglon(token: string, planId: number, renglonId: string) {
  return erpFetch<{ actividadId: number }>(`supervision/plan/${planId}/programar-renglon`, token, {
    method: 'POST',
    body: JSON.stringify({ renglonId }),
  });
}

export function programarTodo(token: string, planId: number) {
  return erpFetch<{ resultados: Array<{ renglonId: string; actividadId?: number; error?: string }> }>(`supervision/plan/${planId}/programar-todo`, token, { method: 'POST', body: '{}' });
}

export function fetchEquipoSupervision(token: string) {
  return erpFetch<{ equipo: Array<{ id: number; nombre: string; email: string; puesto?: string | null }> }>(
    'supervision/equipo',
    token,
  );
}

export function fetchCierre(token: string, fecha?: string) {
  const q = fecha ? `?fecha=${encodeURIComponent(fecha)}` : '';
  return erpFetch<CierreResponse>(`supervision/cierre${q}`, token);
}

export function entregarCierre(token: string, body: { fecha: string; comentario?: string }) {
  return erpFetch('supervision/cierre', token, { method: 'POST', body: JSON.stringify(body) });
}

export function hoyLocal(): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Mexico_City',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
}

export function mananaLocal(): string {
  const d = new Date(hoyLocal() + 'T12:00:00Z');
  do {
    d.setUTCDate(d.getUTCDate() + 1);
  } while ([0, 6].includes(d.getUTCDay()));
  return d.toISOString().slice(0, 10);
}

export function nuevoRenglonLocal(parcial?: Partial<PlanRenglon>): PlanRenglon {
  return {
    id: `local-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
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
    ...parcial,
  };
}

/** Heurística espejo del API: una línea → un renglón. */
export function renglonesDesdeTextoLibreLocal(texto: string): PlanRenglon[] {
  return String(texto ?? '')
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean)
    .map((linea) => {
      const m = linea.match(/^(.{2,80}?)\s*[:\-–—]\s*(.+)$/);
      if (m) return nuevoRenglonLocal({ personaNombre: m[1], actividad: m[2] });
      return nuevoRenglonLocal({ actividad: linea });
    });
}
