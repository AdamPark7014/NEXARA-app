export type ContabilidadFechaPreset =
  | 'hoy'
  | 'ayer'
  | 'esta_semana'
  | 'semana_pasada'
  | 'este_mes'
  | 'mes_pasado'
  | 'este_trimestre'
  | 'trimestre_pasado'
  | 'este_anio'
  | 'anio_pasado'
  | 'personalizado';

export type RangoContabilidad = { desde: string; hasta: string };

export const CONTABILIDAD_FECHA_PRESETS: { id: ContabilidadFechaPreset; label: string }[] = [
  { id: 'hoy', label: 'Hoy' },
  { id: 'ayer', label: 'Ayer' },
  { id: 'esta_semana', label: 'Esta semana' },
  { id: 'semana_pasada', label: 'Semana pasada' },
  { id: 'este_mes', label: 'Este mes' },
  { id: 'mes_pasado', label: 'Mes pasado' },
  { id: 'este_trimestre', label: 'Este trimestre' },
  { id: 'trimestre_pasado', label: 'Trimestre pasado' },
  { id: 'este_anio', label: 'Este año' },
  { id: 'anio_pasado', label: 'Año pasado' },
  { id: 'personalizado', label: 'Personalizado' },
];

/** Día de hoy en hora de México (`AAAA-MM-DD`). */
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

export function rangoDePresetContabilidad(
  preset: ContabilidadFechaPreset,
  hoy: string = fechaMx(),
): RangoContabilidad {
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
  if (preset === 'trimestre_pasado') {
    const inicioActual = inicioTrimestre(hoy);
    const fin = suma(inicioActual, -1);
    return { desde: inicioTrimestre(fin), hasta: fin };
  }
  if (preset === 'este_anio') return { desde: `${hoy.slice(0, 4)}-01-01`, hasta: hoy };
  if (preset === 'anio_pasado') {
    const y = Number(hoy.slice(0, 4)) - 1;
    return { desde: `${y}-01-01`, hasta: `${y}-12-31` };
  }
  return { desde: hoy, hasta: hoy };
}

export function claveStorageRango(pantalla: string): string {
  return `contabilidad:rango:${pantalla}`;
}

export function leerRangoGuardado(
  pantalla: string,
): { preset: ContabilidadFechaPreset; desde?: string; hasta?: string } | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(claveStorageRango(pantalla));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { preset?: string; desde?: string; hasta?: string };
    const ids = CONTABILIDAD_FECHA_PRESETS.map((p) => p.id);
    if (!parsed.preset || !ids.includes(parsed.preset as ContabilidadFechaPreset)) return null;
    return {
      preset: parsed.preset as ContabilidadFechaPreset,
      desde: parsed.desde,
      hasta: parsed.hasta,
    };
  } catch {
    return null;
  }
}

export function guardarRango(
  pantalla: string,
  preset: ContabilidadFechaPreset,
  rango: RangoContabilidad,
): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(
      claveStorageRango(pantalla),
      JSON.stringify({ preset, desde: rango.desde, hasta: rango.hasta }),
    );
  } catch {
    /* ignore quota / private mode */
  }
}
