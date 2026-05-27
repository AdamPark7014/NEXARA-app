/**
 * Utilidades puras del Dashboard.
 *  - Formatos (currency, fechas, horas).
 *  - Cálculos de rango semanal.
 *  - Reconstrucción de minutos a partir de eventos de asistencia.
 *
 * Todas son funciones puras sin estado para facilitar testing y memoización.
 */

import type { AttendanceRangeUser, WeekRange } from './types';

export const toLocalDateInput = (date: Date): string => date.toLocaleDateString('sv-SE');

export const getWeekRange = (anchor: Date): WeekRange => {
  const dayOfWeek = (anchor.getDay() + 6) % 7;
  const start = new Date(anchor);
  start.setDate(anchor.getDate() - dayOfWeek);
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setDate(start.getDate() + 6);
  end.setHours(23, 59, 59, 999);
  return {
    start,
    end,
    from: toLocalDateInput(start),
    to: toLocalDateInput(end),
  };
};

export const formatCurrency = (value: number): string =>
  new Intl.NumberFormat('es-MX', {
    style: 'currency',
    currency: 'MXN',
    maximumFractionDigits: 0,
  }).format(value);

export const formatDate = (value?: string | null): string => {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '-';
  return date.toLocaleDateString('es-MX', { day: '2-digit', month: 'short' });
};

export const formatHours = (minutes: number): number =>
  Math.round((minutes / 60) * 10) / 10;

const toLocalDateKey = (value: string): string => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleDateString('sv-SE');
};

/**
 * Calcula minutos trabajados desde eventos crudos (entrada/salida) cuando el
 * backend no precalcula `days`/`totalMinutes`. Mantiene comportamiento
 * idéntico al monolito anterior (cierra entradas abiertas al final del rango).
 */
export const buildMinutesFromAttendances = (
  attendances: { type: string; timestamp: string }[],
  rangeStart: Date,
  rangeEnd: Date,
) => {
  const events = attendances
    .map((item) => ({ type: item.type, timestamp: new Date(item.timestamp) }))
    .filter((item) => !Number.isNaN(item.timestamp.getTime()))
    .filter((item) => item.timestamp >= rangeStart && item.timestamp <= rangeEnd)
    .sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());

  let totalMinutes = 0;
  let openEntryTime: Date | null = null;
  let openEntryDate: string | null = null;
  const dailyMap = new Map<string, number>();

  events.forEach((event) => {
    if (event.type === 'entrada') {
      openEntryTime = event.timestamp;
      openEntryDate = toLocalDateKey(event.timestamp.toISOString());
      return;
    }
    if (event.type === 'salida' && openEntryTime) {
      const minutes = Math.max(
        0,
        Math.floor((event.timestamp.getTime() - openEntryTime.getTime()) / 60000),
      );
      totalMinutes += minutes;
      const dayKey = openEntryDate || toLocalDateKey(event.timestamp.toISOString());
      if (dayKey) {
        dailyMap.set(dayKey, (dailyMap.get(dayKey) || 0) + minutes);
      }
      openEntryTime = null;
      openEntryDate = null;
    }
  });

  if (openEntryTime !== null) {
    const entryTime = openEntryTime as Date;
    const minutes = Math.max(
      0,
      Math.floor((rangeEnd.getTime() - entryTime.getTime()) / 60000),
    );
    totalMinutes += minutes;
    const dayKey = openEntryDate || toLocalDateKey(rangeEnd.toISOString());
    if (dayKey) {
      dailyMap.set(dayKey, (dailyMap.get(dayKey) || 0) + minutes);
    }
  }

  return { totalMinutes, dailyMap };
};

export const getUserMinutesAndDaily = (
  item: AttendanceRangeUser,
  weekStart: Date,
  weekEnd: Date,
): { totalMinutes: number; dailyMap: Map<string, number> } => {
  const dailyMap = new Map<string, number>();
  const minutesFromDays = (item.days || []).reduce((sum, day) => {
    const dayKey = day.date;
    if (dayKey) {
      dailyMap.set(dayKey, (dailyMap.get(dayKey) || 0) + (day.totalMinutes || 0));
    }
    return sum + (day.totalMinutes || 0);
  }, 0);

  if (minutesFromDays > 0) return { totalMinutes: minutesFromDays, dailyMap };
  if ((item.totalMinutes || 0) > 0) {
    return { totalMinutes: item.totalMinutes || 0, dailyMap };
  }
  if (item.attendances && item.attendances.length) {
    return buildMinutesFromAttendances(item.attendances, weekStart, weekEnd);
  }
  return { totalMinutes: 0, dailyMap };
};
