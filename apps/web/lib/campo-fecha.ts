/**
 * Valores para los campos de fecha de un formulario a partir de los instantes del API.
 *
 * Un `<input type="datetime-local">` trabaja en la hora de quien lo llena y `new Date(valor)` lo
 * vuelve a leer en esa misma hora. Recortar el instante del API (`…toISOString().slice(0, 16)`)
 * mete la hora universal en el campo: las 9:00 aparecían como 15:00 y, al guardar sin tocar nada,
 * la fecha se recorría seis horas cada vez.
 */

const dos = (n: number) => String(n).padStart(2, "0");

function instante(iso?: string | null): Date | null {
  if (!iso) return null;
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** Instante del API → `AAAA-MM-DD` del día de quien mira, para un campo de fecha. */
export function aCampoDia(iso?: string | null): string {
  const d = instante(iso);
  return d ? `${d.getFullYear()}-${dos(d.getMonth() + 1)}-${dos(d.getDate())}` : "";
}

/** Instante del API → `AAAA-MM-DDTHH:mm` en la hora de quien mira, para `datetime-local`. */
export function aCampoFechaHora(iso?: string | null): string {
  const d = instante(iso);
  return d ? `${aCampoDia(iso)}T${dos(d.getHours())}:${dos(d.getMinutes())}` : "";
}

/** Lo capturado en un `datetime-local` → instante para el API; `null` si está vacío o no es fecha. */
export function deCampoFechaHora(valor: string): string | null {
  return instante(valor)?.toISOString() ?? null;
}

export type FechasDeFicha = {
  fechaInicio: string;
  fechaEntregaEsperada: string;
  fechaFinalizacion: string;
};

type FechasGuardadas = {
  fechaInicio?: string | null;
  fechaEntregaEsperada?: string | null;
  fechaFinalizacion?: string | null;
};

/** Las fechas de una actividad como se muestran al abrir «Editar» en su ficha. */
export function fechasParaEditar(actividad: FechasGuardadas): FechasDeFicha {
  return {
    fechaInicio: aCampoFechaHora(actividad.fechaInicio),
    fechaEntregaEsperada: aCampoDia(actividad.fechaEntregaEsperada),
    fechaFinalizacion: aCampoFechaHora(actividad.fechaFinalizacion),
  };
}

/**
 * Solo las fechas que la persona cambió, ya como instantes. Reenviar una fecha que nadie tocó la
 * daba por cambiada: el servidor la volvía a validar y rechazaba editar la descripción de una
 * actividad de días atrás.
 *
 * La entrega se captura por día: conserva la hora que ya tenía y, si no tenía, queda al final
 * de ese día.
 */
export function fechasCambiadas(form: FechasDeFicha, actividad: FechasGuardadas): Partial<FechasDeFicha> {
  const antes = fechasParaEditar(actividad);
  const cambios: Partial<FechasDeFicha> = {};

  const inicio = form.fechaInicio !== antes.fechaInicio ? deCampoFechaHora(form.fechaInicio) : null;
  if (inicio) cambios.fechaInicio = inicio;

  const fin = form.fechaFinalizacion !== antes.fechaFinalizacion ? deCampoFechaHora(form.fechaFinalizacion) : null;
  if (fin) cambios.fechaFinalizacion = fin;

  if (form.fechaEntregaEsperada && form.fechaEntregaEsperada !== antes.fechaEntregaEsperada) {
    const hora = aCampoFechaHora(actividad.fechaEntregaEsperada).slice(11) || "23:59";
    const entrega = deCampoFechaHora(`${form.fechaEntregaEsperada}T${hora}`);
    if (entrega) cambios.fechaEntregaEsperada = entrega;
  }
  return cambios;
}
