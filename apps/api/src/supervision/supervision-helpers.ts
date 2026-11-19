import { BadRequestException } from '@nestjs/common';
import { workDateKey } from '../common/time/workday.js';
import { estatusCerrado, estatusNoCumplida } from '../me/pizarra-kpi.js';
import { PLATFORM_DEVELOPER_EMAIL, STORE_REVIEWER_EMAIL, TESTER_CEO_EMAIL } from '../common/platform-accounts.js';

export type EstadoPlanDiario = 'ENVIADO' | 'PROGRAMADO' | 'DEVUELTO';

const FECHA_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

export function parseFechaIso(fecha: string): Date {
  const m = FECHA_RE.exec(String(fecha ?? '').trim());
  if (!m) throw new BadRequestException('Fecha inválida. Usa AAAA-MM-DD.');
  const fechaDate = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  if (fechaDate.toISOString().slice(0, 10) !== fecha.trim()) throw new BadRequestException("La fecha no existe.");
  return fechaDate;
}

export function mananaIso(desdeIso?: string): string {
  const base = desdeIso?.trim() ? parseFechaIso(desdeIso) : parseFechaIso(workDateKey(new Date()));
  let next = new Date(base.getTime() + 24 * 60 * 60 * 1000);
  while ([0, 6].includes(next.getUTCDay())) next = new Date(next.getTime() + 86400000);
  const y = next.getUTCFullYear();
  const mo = String(next.getUTCMonth() + 1).padStart(2, '0');
  const d = String(next.getUTCDate()).padStart(2, '0');
  return y + '-' + mo + '-' + d;
}

export function esCuentaRealParaAviso(u: { email?: string | null; puesto?: string | null }): boolean {
  const email = String(u?.email ?? '').trim().toLowerCase();
  if (!email) return false;
  if (email.endsWith('.invalid')) return false;
  if (email.startsWith('play.review@')) return false;
  if ([PLATFORM_DEVELOPER_EMAIL, STORE_REVIEWER_EMAIL, TESTER_CEO_EMAIL].includes(email)) return false;
  const puesto = String(u?.puesto ?? '').toLowerCase();
  if (puesto.includes('tester') || puesto.includes('demostracion') || puesto.includes('demostración')) return false;
  return true;
}

export function clasificarEstatusActividad(estatus?: string | null, evidencia?: { status: string; reviewStatus: string } | null, inicioRealAt?: Date | null): 'terminada' | 'en_revision' | 'no_cumplida' | 'sin_empezar' | 'en_curso' {
  if (estatusNoCumplida(estatus)) return 'no_cumplida';
  if (evidencia?.reviewStatus === 'APPROVED') return 'terminada';
  if (evidencia?.status === 'COMPLETED' || /por validar/i.test(estatus ?? '')) return 'en_revision';
  if (estatusCerrado(estatus)) return 'terminada';
  if (inicioRealAt) return 'en_curso';
  if (!estatus || /pendiente/i.test(estatus)) return 'sin_empezar';
  return 'en_curso';
}

function dayKey(v: Date | string | null | undefined, civil = false): string | null {
  if (v == null || v === '') return null;
  if (typeof v === 'string') {
    const s = v.trim();
    if (civil && FECHA_RE.test(s.slice(0, 10))) return s.slice(0, 10);
    const d = new Date(s);
    return Number.isNaN(d.getTime()) ? null : workDateKey(d);
  }
  return civil ? v.toISOString().slice(0, 10) : workDateKey(v);
}

export function actividadCubreFecha(
  a: {
    periodoInicio?: Date | string | null;
    periodoFin?: Date | string | null;
    fechaInicio?: Date | string | null;
    fechaMaxima?: Date | string | null;
    fechaAsignacion?: Date | string | null;
  },
  fechaIso: string,
): boolean {
  const ini = dayKey(a.periodoInicio, true);
  const fin = dayKey(a.periodoFin, true);
  if (ini || fin) {
    const from = ini ?? fin!;
    const to = fin ?? ini!;
    return fechaIso >= from && fechaIso <= to;
  }
  for (const raw of [a.fechaInicio, a.fechaMaxima, a.fechaAsignacion]) {
    const k = dayKey(raw);
    if (k === fechaIso) return true;
  }
  return false;
}
