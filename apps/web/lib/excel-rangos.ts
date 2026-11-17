export type ExcelFechaPreset =
  | 'hoy'
  | 'ayer'
  | 'esta_semana'
  | 'semana_pasada'
  | 'este_mes'
  | 'mes_pasado'
  | 'este_trimestre'
  | 'este_anio'
  | 'personalizado';

export type RangoExcel = { desde: string; hasta: string };

export const EXCEL_FECHA_PRESETS: { id: ExcelFechaPreset; label: string }[] = [
  { id: 'hoy', label: 'Hoy' },
  { id: 'ayer', label: 'Ayer' },
  { id: 'esta_semana', label: 'Esta semana' },
  { id: 'semana_pasada', label: 'Semana pasada' },
  { id: 'este_mes', label: 'Este mes' },
  { id: 'mes_pasado', label: 'Mes pasado' },
  { id: 'este_trimestre', label: 'Este trimestre' },
  { id: 'este_anio', label: 'Año en curso' },
  { id: 'personalizado', label: 'Personalizado' },
];

/** Día civil en hora de México (`AAAA-MM-DD`). */
export function fechaMx(d: Date = new Date()): string {
  return d.toLocaleDateString('en-CA', { timeZone: 'America/Mexico_City' });
}

function suma(dia: string, dias: number): string {
  const [y, m, d] = dia.split('-').map(Number);
  const t = new Date(Date.UTC(y, (m ?? 1) - 1, d ?? 1));
  t.setUTCDate(t.getUTCDate() + dias);
  return t.toISOString().slice(0, 10);
}

function lunesDe(dia: string): string {
  const [y, m, d] = dia.split('-').map(Number);
  const t = new Date(Date.UTC(y, (m ?? 1) - 1, d ?? 1));
  const dow = (t.getUTCDay() + 6) % 7; // lun=0 … dom=6
  return suma(dia, -dow);
}

function inicioTrimestre(dia: string): string {
  const mes = Number(dia.slice(5, 7));
  const inicioMes = Math.floor((mes - 1) / 3) * 3 + 1;
  return `${dia.slice(0, 4)}-${String(inicioMes).padStart(2, '0')}-01`;
}

export function rangoDePresetExcel(
  preset: ExcelFechaPreset,
  hoy: string = fechaMx(),
): RangoExcel {
  if (preset === 'hoy') return { desde: hoy, hasta: hoy };
  if (preset === 'ayer') {
    const a = suma(hoy, -1);
    return { desde: a, hasta: a };
  }
  if (preset === 'esta_semana') return { desde: lunesDe(hoy), hasta: hoy };
  if (preset === 'semana_pasada') {
    const lunes = lunesDe(hoy);
    return { desde: suma(lunes, -7), hasta: suma(lunes, -1) };
  }
  if (preset === 'este_mes') return { desde: `${hoy.slice(0, 7)}-01`, hasta: hoy };
  if (preset === 'mes_pasado') {
    const fin = suma(`${hoy.slice(0, 7)}-01`, -1);
    return { desde: `${fin.slice(0, 7)}-01`, hasta: fin };
  }
  if (preset === 'este_trimestre') return { desde: inicioTrimestre(hoy), hasta: hoy };
  if (preset === 'este_anio') return { desde: `${hoy.slice(0, 4)}-01-01`, hasta: hoy };
  return { desde: hoy, hasta: hoy };
}

export function filtrarPorRangoFecha<T>(
  rows: T[],
  getFecha: (row: T) => string | null | undefined,
  rango: RangoExcel,
): T[] {
  const desde = rango.desde.slice(0, 10);
  const hasta = rango.hasta.slice(0, 10);
  return rows.filter((row) => {
    const raw = getFecha(row);
    if (!raw) return false;
    const f = String(raw).slice(0, 10);
    return f >= desde && f <= hasta;
  });
}

export type ExcelColumnaElegible = { key: string; label: string; defaultOn?: boolean };

export function leerColumnasPreferidas(
  storageKey: string,
  cols: ExcelColumnaElegible[],
): string[] {
  const fallback = cols.filter((c) => c.defaultOn !== false).map((c) => c.key);
  try {
    if (typeof window === 'undefined') return fallback;
    const raw = window.localStorage.getItem(storageKey);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return fallback;
    const allowed = new Set(cols.map((c) => c.key));
    const keys = parsed.map(String).filter((k) => allowed.has(k));
    return keys.length ? keys : fallback;
  } catch {
    return fallback;
  }
}

export function guardarColumnasPreferidas(storageKey: string, keys: string[]): void {
  try {
    if (typeof window === 'undefined') return;
    window.localStorage.setItem(storageKey, JSON.stringify(keys));
  } catch {
    /* sin almacenamiento */
  }
}
