import { erpFetch } from '@/lib/erp-api';

export type EstadoPlan = 'ENVIADO' | 'PROGRAMADO' | 'DEVUELTO';

export type PlanDiario = {
  id: number;
  fecha: string;
  texto: string;
  estado: EstadoPlan;
  notaSupervisor?: string | null;
  autor?: { id: number; nombre: string; email?: string };
  supervisor?: { id: number; nombre: string; email?: string };
};

export type PlanesResponse = {
  rol: 'supervisor' | 'autor';
  puedeEnviar?: boolean;
  puedeCerrar?: boolean;
  fecha: string;
  planes: PlanDiario[];
  faltantes: Array<{ id: number; nombre: string; email: string }>;
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
};

export type CierreResponse =
  | {
      rol: 'supervisor';
      fecha: string;
      personas: PersonaCierre[];
      totales: Record<string, number>;
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

export function enviarPlan(token: string, body: { fecha: string; texto: string }) {
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

export function fetchCierre(token: string, fecha?: string) {
  const q = fecha ? `?fecha=${encodeURIComponent(fecha)}` : '';
  return erpFetch<CierreResponse>(`supervision/cierre${q}`, token);
}

export function entregarCierre(token: string, body: { fecha: string; comentario?: string }) {
  return erpFetch('supervision/cierre', token, { method: 'POST', body: JSON.stringify(body) });
}

/** Fechas civiles en la zona de la jornada, independientes del navegador. */
export function hoyLocal(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Mexico_City', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
}

export function mananaLocal(): string {
  const d = new Date(hoyLocal() + 'T12:00:00Z');
  do { d.setUTCDate(d.getUTCDate() + 1); } while ([0, 6].includes(d.getUTCDay()));
  return d.toISOString().slice(0, 10);
}
