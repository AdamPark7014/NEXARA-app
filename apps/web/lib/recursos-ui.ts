"use client";

import { useEffect, useState } from "react";
import { formatApiError } from "@/lib/erp-api";

/**
 * Piezas chicas compartidas por las pantallas de Recursos (almacén, vehículos,
 * compras y organigrama): formato de fechas y dinero en es-MX y la consulta de
 * pantalla chica para cambiar tabla por tarjetas.
 */

const FALTA = "—";

/**
 * `true` en pantallas angostas (teléfono). Arranca en `false` para que el primer
 * pintado del servidor y del cliente coincidan; sin `matchMedia` (pruebas) se
 * queda en `false` y se pinta la tabla.
 */
export function usePantallaChica(maxWidth = 640): boolean {
  const [chica, setChica] = useState(false);
  useEffect(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") return;
    const mq = window.matchMedia(`(max-width: ${maxWidth}px)`);
    const actualizar = () => setChica(mq.matches);
    actualizar();
    mq.addEventListener?.("change", actualizar);
    return () => mq.removeEventListener?.("change", actualizar);
  }, [maxWidth]);
  return chica;
}

function aFecha(valor: string | Date | null | undefined): Date | null {
  if (!valor) return null;
  const fecha = valor instanceof Date ? valor : new Date(valor);
  return Number.isNaN(fecha.getTime()) ? null : fecha;
}

/** «12 sep 2026». */
export function fechaCorta(valor: string | Date | null | undefined): string {
  const fecha = aFecha(valor);
  if (!fecha) return FALTA;
  return fecha.toLocaleDateString("es-MX", { day: "numeric", month: "short", year: "numeric" });
}

/** «12 sep, 14:05». */
export function fechaHoraCorta(valor: string | Date | null | undefined): string {
  const fecha = aFecha(valor);
  if (!fecha) return FALTA;
  return fecha.toLocaleString("es-MX", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
}

/** Días enteros de hoy a la fecha (negativo = ya pasó). `null` sin fecha. */
export function diasHasta(valor: string | Date | null | undefined, hoy: Date = new Date()): number | null {
  const fecha = aFecha(valor);
  if (!fecha) return null;
  const inicioHoy = new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate()).getTime();
  const inicioFecha = new Date(fecha.getFullYear(), fecha.getMonth(), fecha.getDate()).getTime();
  return Math.round((inicioFecha - inicioHoy) / 86400000);
}

/** «hoy», «mañana», «en 5 días», «hace 2 días». */
export function plazoLegible(dias: number | null): string {
  if (dias == null) return FALTA;
  if (dias === 0) return "hoy";
  if (dias === 1) return "mañana";
  if (dias === -1) return "ayer";
  return dias > 0 ? `en ${dias} días` : `hace ${Math.abs(dias)} días`;
}

const PESOS = new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN", maximumFractionDigits: 2 });
const PESOS_ENTEROS = new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN", maximumFractionDigits: 0 });

/** «$12,345.50» (MXN). */
export function pesos(valor: number | string | null | undefined, { enteros = false } = {}): string {
  const n = Number(valor ?? 0);
  if (!Number.isFinite(n)) return FALTA;
  return (enteros ? PESOS_ENTEROS : PESOS).format(n);
}

const NUMERO = new Intl.NumberFormat("es-MX", { maximumFractionDigits: 2 });

/** Cantidad con separador de miles. */
export function cantidad(valor: number | string | null | undefined): string {
  const n = Number(valor ?? 0);
  return Number.isFinite(n) ? NUMERO.format(n) : FALTA;
}

/**
 * Mensaje para la persona: el `message` (o `error`) del cuerpo si lo hay; nunca
 * JSON ni HTML crudos.
 */
export function errorLegible(err: unknown, fallback: string): string {
  if (err instanceof Error) {
    try {
      const cuerpo = JSON.parse(err.message) as { error?: unknown };
      if (typeof cuerpo.error === "string" && cuerpo.error.trim()) return cuerpo.error;
    } catch {
      /* texto plano */
    }
  }
  const texto = formatApiError(err, fallback);
  return /^\s*[{[<]/.test(texto) ? fallback : texto;
}
