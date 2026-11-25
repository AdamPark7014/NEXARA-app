/**
 * Pago semanal: lo sugerido (calculado por el servidor), lo ajustado y lo pagado.
 * Rutas bajo employee-payments/control-semanal.
 */
import { buildApiUrl } from "@/lib/api-base";
import { financeFetch } from "@/lib/finance-api";
import { withTenantHeaders } from "@/lib/tenant";

export const CONTROL_PAGO_BASE = "employee-payments/control-semanal";

export type FormaPagoNomina = "transferencia" | "efectivo" | "otro";
export const FORMAS_PAGO_NOMINA: readonly FormaPagoNomina[] = ["transferencia", "efectivo", "otro"];

export type EstadoPago = "sin_monto" | "por_pagar" | "parcial" | "pagado";

export type SaldoPagoSemanal = { sugerido: number; ajustes: number; final: number; pagado: number; saldo: number };

export type FilaPago = {
  userId: number;
  nombre: string;
  puesto: string | null;
  area: string | null;
  extraPendienteMin: number;
  saldo: SaldoPagoSemanal | null;
  estado: EstadoPago | null;
};

export type SemanaPago = {
  semana: { inicio: string; fin: string; estado: string };
  montosOcultos: boolean;
  puedeAjustar: boolean;
  puedeRegistrar: boolean;
  filas: FilaPago[];
  totales: (SaldoPagoSemanal & { porPagar: number; completas: number; parciales: number }) | null;
};

export type MovimientoPago = {
  id: string;
  registroId?: number;
  tipo: "ajuste" | "pago";
  monto: number;
  motivo?: string | null;
  forma?: string | null;
  fecha?: string;
  conComprobante?: boolean;
  autorNombre: string | null;
  at: string;
};

export type DetallePagoSemanal = {
  semana: string;
  fin: string;
  userId: number;
  nombre: string;
  estadoSemana: string;
  puedeAjustar: boolean;
  puedeRegistrar: boolean;
  saldo: SaldoPagoSemanal;
  estado: EstadoPago;
  extraPendienteMin: number;
  comoSeCalculo: Array<{ clave: string; titulo: string; monto: number; detalle: string }>;
  movimientos: MovimientoPago[];
};

/** `$1,234.50`; el negativo, con signo tipográfico. */
export function formatoMonedaMx(n: number): string {
  const v = Number(n) || 0;
  const t = new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN" }).format(Math.abs(v));
  return v < 0 ? `−${t}` : t;
}

/** Con signo: `+$150.00` · `−$120.00` · `—`. */
export function formatoAjuste(n: number): string {
  return n === 0 ? "—" : n > 0 ? `+${formatoMonedaMx(n)}` : formatoMonedaMx(n);
}

/** Lo que escribió la persona → número, o null si no es un monto. */
export function leerMonto(texto: string): number | null {
  const limpio = texto.replace(/[$,\s]/g, "").replace("−", "-");
  if (!/^-?\d+(\.\d{1,2})?$/.test(limpio)) return null;
  return Number(limpio);
}

export function etiquetaFormaPago(forma: string | null | undefined): string {
  switch (forma) {
    case "transferencia":
      return "Transferencia";
    case "efectivo":
      return "Efectivo";
    case "otro":
      return "Otro";
    default:
      return forma?.trim() || "—";
  }
}

export const ETIQUETA_ESTADO: Record<EstadoPago, { texto: string; tono: "neutral" | "warning" | "success" }> = {
  sin_monto: { texto: "Sin monto", tono: "neutral" },
  por_pagar: { texto: "Por pagar", tono: "neutral" },
  parcial: { texto: "Parcial", tono: "warning" },
  pagado: { texto: "Pagado", tono: "success" },
};

const json = (body: unknown) => JSON.stringify(body);

export function semanaPago(token: string, semana: string): Promise<SemanaPago> {
  return financeFetch(`${CONTROL_PAGO_BASE}/pago?${new URLSearchParams({ semana })}`, token);
}

export function detallePago(token: string, semana: string, userId: number): Promise<DetallePagoSemanal> {
  return financeFetch(`${CONTROL_PAGO_BASE}/como-se-calculo?${new URLSearchParams({ semana, userId: String(userId) })}`, token);
}

export function ajustarPago(token: string, b: { semana: string; userId: number; monto: number; motivo: string }) {
  return financeFetch(`${CONTROL_PAGO_BASE}/pago`, token, { method: "PATCH", body: json(b) });
}

export function registrarPago(
  token: string,
  b: { semana: string; userId: number; monto: number; fecha: string; forma: FormaPagoNomina },
  comprobante?: File | null,
) {
  const form = new FormData();
  for (const [k, v] of Object.entries(b)) form.append(k, String(v));
  if (comprobante) form.append("comprobante", comprobante);
  return financeFetch(`${CONTROL_PAGO_BASE}/registrar-pago`, token, { method: "POST", body: form });
}

/** El comprobante va con sesión: no tiene liga pública. */
export async function abrirComprobante(token: string, registroId: number): Promise<void> {
  const res = await fetch(buildApiUrl(`${CONTROL_PAGO_BASE}/comprobante/${registroId}`), {
    headers: withTenantHeaders({ Authorization: `Bearer ${token}` }) as Record<string, string>,
  });
  if (!res.ok) throw new Error("No se pudo abrir el comprobante.");
  const url = URL.createObjectURL(await res.blob());
  window.open(url, "_blank", "noopener");
  window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
}
