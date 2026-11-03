/** Una sola cotización abierta a quien no tiene el módulo (Velocidad Core, Ola 5). */
import { erpFetch } from "@/lib/erp-api";

export type PartidaAbierta = { id?: number; name: string; unit: string | null; qty: number; unitPrice: number };

export type CotizacionAbierta = {
  estado: "abierto" | "revocado" | "terminada";
  cotizacionId: number;
  folio: string;
  titulo: string | null;
  cliente: string | null;
  para: string;
  otorgadoPor: string;
  otorgadoAt: string;
  cambios: number;
  ultimoCambioAt: string | null;
  revocadoAt: string | null;
  soyQuienLaTrabaja: boolean;
  puedeCerrar: boolean;
  puedeEditar: boolean;
  version: string | null;
  partidas: PartidaAbierta[] | null;
};

export const leerCotizacionAbierta = (token: string, activityId: number) =>
  erpFetch<CotizacionAbierta | null>(`activities/${activityId}/cotizacion-abierta`, token);

export const guardarCotizacionAbierta = (token: string, activityId: number, version: string, partidas: PartidaAbierta[]) =>
  erpFetch<CotizacionAbierta>(`activities/${activityId}/cotizacion-abierta`, token, {
    method: "PUT",
    body: JSON.stringify({ version, partidas }),
  });

export const cerrarCotizacionAbierta = (token: string, activityId: number) =>
  erpFetch<CotizacionAbierta>(`activities/${activityId}/cotizacion-abierta/cerrar`, token, { method: "POST" });

export const pedirApoyoEnCotizacion = (token: string, cotizacionId: number, userId: number, nota: string) =>
  erpFetch<{ activityId: number }>(`cotizaciones/${cotizacionId}/pedir-apoyo`, token, {
    method: "POST",
    body: JSON.stringify({ userId, nota }),
  });

/** Suma de partidas, sin IVA ni margen: el total real depende de lo que esta persona no ve. */
export const sumaDePartidas = (partidas: PartidaAbierta[]) => partidas.reduce((s, p) => s + (Number(p.qty) || 0) * (Number(p.unitPrice) || 0), 0);
