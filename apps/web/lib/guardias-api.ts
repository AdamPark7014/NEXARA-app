import { erpFetch } from "@/lib/erp-api";

/**
 * Guardias de fin de semana: quién trabaja cada sábado y domingo.
 *
 * Solo quien tiene guardia puede checar ese día, y su entrada se registra sola al iniciar
 * su primer servicio o tarea. Dirección programa a cualquiera; un encargado, a su gente.
 */

export type PersonaGuardia = { id: number; nombre: string; puesto: string | null; avatarUrl: string | null };

export type Guardia = {
  id: number;
  userId: number;
  /** AAAA-MM-DD */
  fecha: string;
  nota: string | null;
  persona: PersonaGuardia | null;
  creadoPor: { id: number; nombre: string } | null;
  createdAt: string;
  puedeQuitar: boolean;
};

export type GuardiasRango = {
  desde: string;
  hasta: string;
  hoy: string;
  puedeProgramar: boolean;
  personas: PersonaGuardia[];
  items: Guardia[];
};

export const NOTA_GUARDIA_MAX = 300;

export function fetchGuardias(token: string, rango: { desde?: string; hasta?: string } = {}) {
  const qs = new URLSearchParams();
  if (rango.desde) qs.set("desde", rango.desde);
  if (rango.hasta) qs.set("hasta", rango.hasta);
  const q = qs.toString();
  return erpFetch<GuardiasRango>(`guardias${q ? `?${q}` : ""}`, token);
}

export function programarGuardia(token: string, body: { userId: number; fecha: string; nota?: string }) {
  return erpFetch<Guardia>("guardias", token, { method: "POST", body: JSON.stringify(body) });
}

export function quitarGuardia(token: string, id: number) {
  return erpFetch<{ removed: boolean; id: number }>(`guardias/${id}`, token, { method: "DELETE" });
}

/** ¿Quiénes de estas personas tienen guardia ese día? */
export function fetchCoberturaGuardias(token: string, fecha: string, userIds: number[]) {
  const qs = new URLSearchParams({ fecha, userIds: userIds.join(",") });
  return erpFetch<{ fecha: string; finDeSemana: boolean; conGuardia: number[] }>(`guardias/cobertura?${qs}`, token);
}

const FECHA_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

function aUtc(fecha: string): Date | null {
  const m = FECHA_RE.exec(fecha);
  if (!m) return null;
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  return d.toISOString().slice(0, 10) === fecha ? d : null;
}

/** ¿`AAAA-MM-DD` cae en sábado o domingo? */
export function esFinDeSemanaISO(fecha: string): boolean {
  const d = aUtc(fecha);
  return d != null && (d.getUTCDay() === 0 || d.getUTCDay() === 6);
}

/** Sábados y domingos entre dos fechas (incluidas), agrupados por fin de semana. */
export function finesDeSemana(desde: string, hasta: string): Array<{ sabado: string | null; domingo: string | null }> {
  const inicio = aUtc(desde);
  const fin = aUtc(hasta);
  if (!inicio || !fin || fin < inicio) return [];
  const out: Array<{ sabado: string | null; domingo: string | null }> = [];
  const d = new Date(inicio);
  while (d <= fin && out.length < 20) {
    const dia = d.getUTCDay();
    const clave = d.toISOString().slice(0, 10);
    if (dia === 6) out.push({ sabado: clave, domingo: null });
    if (dia === 0) {
      const ultimo = out[out.length - 1];
      if (ultimo && ultimo.domingo == null && ultimo.sabado) ultimo.domingo = clave;
      else out.push({ sabado: null, domingo: clave });
    }
    d.setUTCDate(d.getUTCDate() + 1);
  }
  return out;
}

/** «sáb 3 oct» */
export function diaCorto(fecha: string): string {
  const d = aUtc(fecha);
  if (!d) return fecha;
  const partes = new Intl.DateTimeFormat("es-MX", {
    timeZone: "UTC",
    weekday: "short",
    day: "numeric",
    month: "short",
  }).formatToParts(d);
  const v = (t: string) => (partes.find((p) => p.type === t)?.value ?? "").replace(/\.$/, "");
  return `${v("weekday")} ${v("day")} ${v("month")}`;
}
