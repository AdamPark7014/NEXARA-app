/**
 * ¿Hay que avisar al supervisor (Luis) de una actividad recién creada?
 * Autoasignada o programada/ejecutada el mismo día civil en México.
 */

export type MotivoAvisoLuis = 'autoasignada' | 'mismo_dia';

function diaMexico(valor: Date | string | null | undefined, tz = 'America/Mexico_City'): string | null {
  if (valor == null || valor === '') return null;
  const d = valor instanceof Date ? valor : new Date(valor);
  if (Number.isNaN(d.getTime())) return null;
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: tz,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(d);
}

export function esActividadNoProgramada(opts: {
  creadoPorId?: number | null;
  responsableId?: number | null;
  fechaInicio?: Date | string | null;
  periodoInicio?: Date | string | null;
  createdAt?: Date | string | null;
  ahora?: Date;
  tz?: string;
}): { avisar: boolean; motivo: MotivoAvisoLuis | null } {
  const creado = Number(opts.creadoPorId);
  const responsable = Number(opts.responsableId);
  const auto =
    Number.isInteger(creado) &&
    creado > 0 &&
    Number.isInteger(responsable) &&
    responsable > 0 &&
    creado === responsable;

  const tz = opts.tz || 'America/Mexico_City';
  const hoy = diaMexico(opts.ahora ?? new Date(), tz);
  const diaActividad =
    diaMexico(opts.fechaInicio, tz) ||
    diaMexico(opts.periodoInicio, tz) ||
    diaMexico(opts.createdAt, tz);
  const mismoDia = Boolean(hoy && diaActividad && hoy === diaActividad);

  if (auto) return { avisar: true, motivo: 'autoasignada' };
  if (mismoDia) return { avisar: true, motivo: 'mismo_dia' };
  return { avisar: false, motivo: null };
}
