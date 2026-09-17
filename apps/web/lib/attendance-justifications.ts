import { erpFetch } from "@/lib/erp-api";

/** Día sin checada que Christian justificó. No es checada ni suma horas. */
export type FaltaJustificada = {
  id: number;
  userId: number;
  /** AAAA-MM-DD */
  fecha: string;
  motivo: string;
  estado: "FALTA_JUSTIFICADA";
  etiqueta: string;
  justificadaPor: { id: number; nombre: string } | null;
  justificadaAt: string;
};

export const MOTIVO_FALTA_MINIMO = 10;

export function justificarFalta(token: string, body: { userId: number; fecha: string; motivo: string }) {
  return erpFetch<FaltaJustificada>("attendance/justificaciones", token, {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export function quitarFaltaJustificada(token: string, id: number) {
  return erpFetch<{ removed: boolean }>(`attendance/justificaciones/${id}`, token, { method: "DELETE" });
}

export function faltaDelDia(list: FaltaJustificada[] | undefined, fecha: string): FaltaJustificada | null {
  return (list ?? []).find((j) => j.fecha === fecha) ?? null;
}
