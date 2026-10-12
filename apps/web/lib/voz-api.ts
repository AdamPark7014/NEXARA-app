/**
 * Voz a texto con nuestro propio transcriptor (whisper en el servidor de NEXARA).
 *
 * - Dictar: se graba en el navegador, se sube el audio y vuelve el texto (`ai/voz/*`).
 * - Grabar una junta: se sube una parte cada pocos minutos y el servidor la transcribe en
 *   segundo plano (`grabaciones-reuniones/*`).
 *
 * El audio no pasa por Google ni por ningún proveedor.
 */
import { buildApiUrl } from "@/lib/api-base";

async function pedir<T>(token: string, path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(buildApiUrl(path), {
    ...init,
    credentials: "include",
    headers: { Authorization: `Bearer ${token}`, ...((init.headers as Record<string, string>) || {}) },
  });
  const text = await res.text();
  if (!res.ok) {
    let message = `HTTP ${res.status}`;
    try {
      const json = JSON.parse(text);
      if (json?.message) message = Array.isArray(json.message) ? json.message.join(", ") : String(json.message);
    } catch {
      if (text) message = text;
    }
    throw new Error(message);
  }
  return (text ? JSON.parse(text) : null) as T;
}

let cacheDisponible: { token: string; promesa: Promise<boolean> } | null = null;

/** ¿El servidor tiene transcriptor propio? Se pregunta una vez por sesión. */
export function vozPropiaDisponible(token: string): Promise<boolean> {
  if (cacheDisponible?.token !== token) {
    const promesa = pedir<{ disponible: boolean }>(token, "ai/voz/estado")
      .then((r) => Boolean(r?.disponible))
      .catch(() => false);
    cacheDisponible = { token, promesa };
    // Si falló o no hay transcriptor, se vuelve a preguntar en el próximo intento.
    promesa.then((ok) => {
      if (!ok && cacheDisponible?.promesa === promesa) cacheDisponible = null;
    });
  }
  return cacheDisponible.promesa;
}

function formulario(audio: Blob, extra: Record<string, string> = {}): FormData {
  const form = new FormData();
  for (const [k, v] of Object.entries(extra)) form.append(k, v);
  form.append("audio", audio, `audio.${extensionDe(audio.type)}`);
  return form;
}

/** Un dictado (segundos o un par de minutos) → texto. */
export async function transcribirDictado(token: string, audio: Blob): Promise<string> {
  const r = await pedir<{ texto: string }>(token, "ai/voz/transcribir", { method: "POST", body: formulario(audio) });
  return r?.texto ?? "";
}

export type EstadoGrabacion = {
  disponible: boolean;
  total: number;
  listas: number;
  pendientes: number;
  conError: number;
  terminada: boolean;
  partes: Array<{ parte: number; estado: "pendiente" | "lista" | "error"; error?: string }>;
  texto: string;
};

export const subirParteGrabacion = (token: string, meetingId: number, parte: number, audio: Blob) =>
  pedir<EstadoGrabacion>(token, `grabaciones-reuniones/${meetingId}/partes`, {
    method: "POST",
    body: formulario(audio, { parte: String(parte) }),
  });

export const estadoGrabacion = (token: string, meetingId: number) =>
  pedir<EstadoGrabacion>(token, `grabaciones-reuniones/${meetingId}`);

export const borrarGrabacion = (token: string, meetingId: number) =>
  pedir<{ ok: boolean }>(token, `grabaciones-reuniones/${meetingId}`, { method: "DELETE" });

/** Formatos en orden de preferencia: opus pesa poco y ffmpeg lo lee sin problema. */
const FORMATOS = ["audio/webm;codecs=opus", "audio/ogg;codecs=opus", "audio/webm", "audio/mp4"];

/** El primer formato que el navegador sabe grabar ("" = el que traiga por omisión). */
export function elegirFormatoAudio(soporta: (mime: string) => boolean): string {
  return FORMATOS.find((f) => {
    try {
      return soporta(f);
    } catch {
      return false;
    }
  }) ?? "";
}

export function extensionDe(mime: string): string {
  const base = mime.split(";")[0].trim().toLowerCase();
  if (base.endsWith("/ogg")) return "ogg";
  if (base.endsWith("/mp4")) return "m4a";
  return "webm";
}

/** 754000 → "12:34"; con horas, "1:02:03". */
export function duracionLegible(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const dos = (n: number) => String(n).padStart(2, "0");
  return h ? `${h}:${dos(m)}:${dos(s)}` : `${m}:${dos(s)}`;
}
