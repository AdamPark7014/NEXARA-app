/**
 * Cliente del control de nómina semanal (`.ai/CONTROL-NOMINA-SPEC.md`, «Contrato API»).
 *
 * `semana` es siempre el lunes en `YYYY-MM-DD`. Toda la aritmética de dinero vive en la
 * API; tras cada cambio la pantalla vuelve a pedir la semana completa en vez de
 * recalcular nada aquí.
 */
import { buildApiUrl } from "@/lib/api-base";
import { financeFetch } from "@/lib/finance-api";
import { withTenantHeaders } from "@/lib/tenant";
import { normalizarControl, type ControlSemanal, type ResultadoCierre } from "@/lib/control-nomina";

/** Base de las rutas del servidor (un solo lugar si cambia a `nomina/control-semanal`). */
export const CONTROL_SEMANAL_BASE = "employee-payments/control-semanal";

const json = (body: unknown): RequestInit["body"] => JSON.stringify(body);

export function rutaControlSemanal(semana: string): string {
  return `${CONTROL_SEMANAL_BASE}?${new URLSearchParams({ semana })}`;
}

export async function fetchControlSemanal(token: string, semana: string): Promise<ControlSemanal> {
  const raw = (await financeFetch(rutaControlSemanal(semana), token)) as Record<string, unknown> | null;
  // Algunos controladores del API envuelven en `{ data }`; se acepta ambas formas.
  const cuerpo = raw && !("semana" in raw) && raw.data && typeof raw.data === "object" ? raw.data : raw;
  return normalizarControl(cuerpo, semana);
}

/** Cambia el lugar de un día; `lugar: null` lo devuelve a automático. */
export function patchDiaControl(
  token: string,
  body: { semana: string; userId: number; fecha: string; lugar: string | null },
) {
  return financeFetch(`${CONTROL_SEMANAL_BASE}/dia`, token, { method: "PATCH", body: json(body) });
}

/** Nota de la fila y/o sueldo semanal (este último cambia el perfil y queda auditado). */
export function patchFilaControl(
  token: string,
  body: { semana: string; userId: number; notaFila?: string | null; sueldoSemanal?: number },
) {
  return financeFetch(`${CONTROL_SEMANAL_BASE}/fila`, token, { method: "PATCH", body: json(body) });
}

export function postDescuentoControl(
  token: string,
  body: { semana: string; userId: number; concepto: string; monto: number },
) {
  return financeFetch(`${CONTROL_SEMANAL_BASE}/descuentos`, token, { method: "POST", body: json(body) });
}

export function deleteDescuentoControl(token: string, id: number | string) {
  return financeFetch(`${CONTROL_SEMANAL_BASE}/descuentos/${encodeURIComponent(String(id))}`, token, { method: "DELETE" });
}

export function aceptarDescuentosSugeridos(token: string, body: { semana: string; userId: number }) {
  return financeFetch(`${CONTROL_SEMANAL_BASE}/descuentos/sugeridos/aceptar`, token, { method: "POST", body: json(body) });
}

/** Cierra la semana y genera los pagos en Borrador (sin duplicar los que ya existan). */
export async function cerrarSemanaControl(token: string, semana: string): Promise<ResultadoCierre | null> {
  const res = (await financeFetch(`${CONTROL_SEMANAL_BASE}/cerrar`, token, { method: "POST", body: json({ semana }) })) as
    | (ResultadoCierre & { data?: ResultadoCierre })
    | null;
  return res?.data && typeof res.data === "object" ? res.data : res;
}

export function reabrirSemanaControl(token: string, semana: string, motivo: string) {
  return financeFetch(`${CONTROL_SEMANAL_BASE}/reabrir`, token, { method: "POST", body: json({ semana, motivo }) });
}

async function mensajeDeError(res: Response): Promise<string> {
  const t = await res.text().catch(() => "");
  if (!t) return `HTTP ${res.status}`;
  try {
    const j = JSON.parse(t);
    return Array.isArray(j?.message) ? j.message.join(", ") : j?.message || t;
  } catch {
    return t;
  }
}

/**
 * Excel de dos hojas («Entradas y salidas» y «Nómina») más «Cómo se calcula».
 * Descarga autenticada: se pide con el token y el `X-Company-Id` de la empresa activa
 * (sin él, quien tiene dos empresas se bajaría la nómina de la otra).
 */
export async function descargarControlExcel(token: string, semana: string): Promise<void> {
  const res = await fetch(buildApiUrl(`${CONTROL_SEMANAL_BASE}/export.xlsx?${new URLSearchParams({ semana })}`), {
    credentials: "include",
    headers: withTenantHeaders({ Authorization: `Bearer ${token}` }),
  });
  if (!res.ok) throw new Error(await mensajeDeError(res));
  const blob = await res.blob();
  const { triggerBlobDownload } = await import("@/lib/file-download");
  await triggerBlobDownload(blob, `control-nomina-${semana}.xlsx`, {
    mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
}
