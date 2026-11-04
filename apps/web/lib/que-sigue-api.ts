/** «¿Qué sigue?» y Mis pendientes (Velocidad Core, Ola 6). Las reglas son de la API (`apps/api/src/me/que-sigue.ts`). */
import { erpFetch } from "@/lib/erp-api";

/**
 * Adam la ve primero en la pantalla real, con `?muestra=1` en Mis actividades y en Asistencias.
 * Con `false`, nadie ve «¿Qué sigue?», Mis pendientes ni la foto del escritorio.
 */
export const QUE_SIGUE_VISIBLE = false;

export type Sugerencia = {
  clave: string;
  tipo: "abierta" | "pendiente" | "cotizacion" | "contacto" | "revisar" | "obra" | "banco" | "seguir" | "fija";
  titulo: string;
  detalle: string | null;
  accion: "abrir" | "empezar";
  href: string | null;
};

export type QueSigue = {
  aplica: boolean;
  area: string | null;
  sugerencias: Sugerencia[];
  resumen: string | null;
};

export type Pendiente = { id: number; texto: string; createdAt: string };

export type Arrancada = { activityId: number; iniciada: boolean };

export const fetchQueSigue = (token: string) => erpFetch<QueSigue>("me/que-sigue", token);

export const empezarSugerencia = (token: string, clave: string) =>
  erpFetch<Arrancada>("me/que-sigue/empezar", token, { method: "POST", body: JSON.stringify({ clave }) });

export const fetchPendientes = (token: string) => erpFetch<{ pendientes: Pendiente[] }>("me/pendientes", token);

export const agregarPendiente = (token: string, texto: string) =>
  erpFetch<Pendiente>("me/pendientes", token, { method: "POST", body: JSON.stringify({ texto }) });

export const palomearPendiente = (token: string, id: number) => erpFetch(`me/pendientes/${id}/hecho`, token, { method: "POST" });

export const empezarPendiente = (token: string, id: number) => erpFetch<Arrancada>(`me/pendientes/${id}/empezar`, token, { method: "POST" });

export const borrarPendiente = (token: string, id: number) => erpFetch(`me/pendientes/${id}`, token, { method: "DELETE" });

/** Motivos de un toque para quien no está en oficina al salir a comer. */
export const MOTIVOS_FUERA = ["En obra", "Con un cliente", "En ruta", "Trabajando en casa"];

/** Lo que pide la API para una foto personal. */
export const MIN_MOTIVO_FUERA = 3;
