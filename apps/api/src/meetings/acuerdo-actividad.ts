/**
 * Un acuerdo de reunión convertido en actividad del responsable (Adam, 12-10): «Tarea · Junta»
 * interna, con el día de la reunión como inicio y la fecha compromiso como fin del periodo.
 */

/** `AAAA-MM-DD` de una columna `@db.Date` (llega como medianoche UTC). */
const dia = (d: Date | null | undefined): string | null =>
  d instanceof Date && !Number.isNaN(d.getTime()) ? d.toISOString().slice(0, 10) : null;

const recortar = (texto: string, max: number) => (texto.length > max ? `${texto.slice(0, max - 1).trimEnd()}…` : texto);

export function actividadDeAcuerdo(
  acuerdo: { descripcion: string; responsableId: number | null; fechaCompromiso: Date | null },
  reunion: { titulo: string; fecha: Date },
  creadoPorId: number,
): Record<string, unknown> {
  const descripcion = acuerdo.descripcion.trim();
  const diaReunion = dia(reunion.fecha);
  const fin = dia(acuerdo.fechaCompromiso);
  // Un compromiso anterior a la reunión (dato raro, pero posible) queda como periodo de un día.
  const inicio = fin && diaReunion && diaReunion <= fin ? diaReunion : fin;

  const dto: Record<string, unknown> = {
    titulo: recortar(descripcion, 200),
    indicaciones: recortar(
      `Acuerdo de la reunión «${reunion.titulo}»${diaReunion ? ` del ${diaReunion}` : ''}.` +
        (descripcion.length > 200 ? `\n\n${descripcion}` : ''),
      4000,
    ),
    responsableId: acuerdo.responsableId,
    creadoPorId,
    estatus: 'Pendiente',
    prioridad: 'Media',
    coreKind: 'tarea',
    activityType: 'INTERNAL',
    ticketType: 'OTRO',
    ticketTypeCustom: 'Junta',
    workType: 'ISSUE',
    evidencePhotoRequired: 2,
  };
  if (fin && inicio) {
    dto.periodoInicio = inicio;
    dto.periodoFin = fin;
  }
  return dto;
}
