/**
 * Cliente del pago semanal editable y del registro de pago (Parte D).
 * Rutas bajo employee-payments/control-semanal: pago, registrar-pago, como-se-calculo.
 */
import { financeFetch } from "@/lib/finance-api";

export const CONTROL_PAGO_BASE = "employee-payments/control-semanal";

export type FormaPagoNomina = "transferencia" | "efectivo" | "otro";

export const FORMAS_PAGO_NOMINA: readonly FormaPagoNomina[] = ["transferencia", "efectivo", "otro"];

export type RenglonComoSeCalculo = {
  clave: string;
  titulo: string;
  monto: number;
  detalle: string;
};

export type SaldoPagoSemanal = {
  sugerido: number;
  ajustes: number;
  pagado: number;
  final: number;
  saldo: number;
};

export type MovimientoPago = {
  tipo?: "sugerido" | "ajuste" | "pago" | string;
  monto: number;
  motivo?: string | null;
  autorId?: number | null;
  autorNombre?: string | null;
  at?: string | null;
  forma?: FormaPagoNomina | string | null;
};

export type ComoSeCalculoResponse = {
  semana: string;
  userId: number;
  estadoSemana: string;
  saldo: SaldoPagoSemanal;
  comoSeCalculo: RenglonComoSeCalculo[];
  movimientos?: MovimientoPago[];
  parametrosSnapshot?: unknown;
};

const json = (body: unknown): RequestInit["body"] => JSON.stringify(body);

/** `$1,234.50` en es-MX. */
export function formatoMonedaMx(n: number): string {
  return new Intl.NumberFormat("es-MX", {
    style: "currency",
    currency: "MXN",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Number(n) || 0);
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

export function esFormaPagoNomina(v: unknown): v is FormaPagoNomina {
  return typeof v === "string" && (FORMAS_PAGO_NOMINA as readonly string[]).includes(v);
}

export async function fetchComoSeCalculo(
  token: string,
  q: { semana: string; userId: number },
): Promise<ComoSeCalculoResponse> {
  const params = new URLSearchParams({
    semana: q.semana.slice(0, 10),
    userId: String(q.userId),
  });
  const raw = (await financeFetch(`${CONTROL_PAGO_BASE}/como-se-calculo?${params}`, token)) as
    | (ComoSeCalculoResponse & { data?: ComoSeCalculoResponse })
    | null;
  const envuelto = raw?.data;
  const cuerpo: ComoSeCalculoResponse | null = envuelto && raw?.saldo === undefined ? envuelto : raw;
  if (!cuerpo || typeof cuerpo !== "object") {
    throw new Error("No se pudo leer cómo se calculó el pago");
  }
  return cuerpo as ComoSeCalculoResponse;
}

export function ajustarPagoSemanal(
  token: string,
  body: { semana: string; userId: number; monto: number; motivo: string; pagoSugerido?: number },
) {
  return financeFetch(`${CONTROL_PAGO_BASE}/pago`, token, {
    method: "PATCH",
    body: json({
      semana: body.semana.slice(0, 10),
      userId: body.userId,
      monto: body.monto,
      motivo: body.motivo,
      ...(body.pagoSugerido != null ? { pagoSugerido: body.pagoSugerido } : {}),
    }),
  });
}

export function registrarPagoSemanal(
  token: string,
  body: {
    semana: string;
    userId: number;
    monto: number;
    fecha?: string;
    forma: FormaPagoNomina | string;
    comprobanteUrl?: string | null;
  },
) {
  return financeFetch(`${CONTROL_PAGO_BASE}/registrar-pago`, token, {
    method: "POST",
    body: json({
      semana: body.semana.slice(0, 10),
      userId: body.userId,
      monto: body.monto,
      forma: body.forma,
      ...(body.fecha ? { fecha: body.fecha.slice(0, 10) } : {}),
      ...(body.comprobanteUrl != null ? { comprobanteUrl: body.comprobanteUrl } : {}),
    }),
  });
}
