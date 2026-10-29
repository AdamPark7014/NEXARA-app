/**
 * Asistente de NEXARA en #general (API `chat/asistente`).
 *
 * Se le habla con `@asistente` en #general. La respuesta es solo para quien pregunta: nada se publica
 * en el canal. Casi todo lo contesta el código con la base (pendientes, jornada, folios, cómo hago…);
 * solo lo demás va a la IA. «Asígnale a…» (CEO) trae propuestas que se crean solo al confirmar,
 * con `POST /activities` y los permisos de siempre.
 */
import { buildApiUrl } from "@/lib/api-base";

/** Pastilla `[@Asistente](user:0)` o `@asistente` escrito a mano (mismo patrón que el API). */
export const MENCION_ASISTENTE = /\[@?asistente[^\]]*\]\(user:0\)|(^|\s)@asistente\b/i;

/** Id de la «persona» Asistente en el autocompletado de `@` (no es un usuario real: el API no avisa a nadie). */
export const ID_ASISTENTE = 0;

export type PropuestaChat = {
  resumen: string;
  titulo: string;
  responsable: string | null;
  cuando: string | null;
  faltantes: string[];
  avisos: string[];
  payload: Record<string, unknown>;
};

export type RespuestaAsistenteChat = {
  intencion: string;
  fuente: "codigo" | "ia";
  texto: string;
  sugerencias: string[];
  accion: { tipo: "crear-actividades"; propuestas: PropuestaChat[] } | null;
};

/** Lo que la web espera como mucho: el API corta la IA a los ~16 s (8 s × 2 intentos). */
export const ESPERA_ASISTENTE_MS = 25_000;

async function pedir<T>(token: string, path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(buildApiUrl(path), {
    ...init,
    credentials: "include",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", ...(init?.headers || {}) },
  });
  if (!res.ok) {
    const texto = await res.text().catch(() => "");
    let mensaje = texto;
    try {
      const j = JSON.parse(texto) as { message?: string | string[] };
      mensaje = Array.isArray(j.message) ? j.message.join(" ") : j.message || texto;
    } catch {
      /* el cuerpo no era JSON */
    }
    throw new Error(mensaje || `HTTP ${res.status}`);
  }
  return (await res.json()) as T;
}

export async function preguntarAsistente(token: string, texto: string, channelId: number) {
  const senal =
    typeof AbortSignal !== "undefined" && "timeout" in AbortSignal ? AbortSignal.timeout(ESPERA_ASISTENTE_MS) : undefined;
  try {
    return await pedir<RespuestaAsistenteChat>(token, "chat/asistente", {
      method: "POST",
      body: JSON.stringify({ texto, channelId }),
      signal: senal,
    });
  } catch (e) {
    if (e instanceof Error && (e.name === "TimeoutError" || e.name === "AbortError")) {
      throw new Error("El asistente tardó demasiado en contestar: intenta de nuevo.");
    }
    throw e;
  }
}

export function crearActividadPropuesta(token: string, payload: Record<string, unknown>) {
  return pedir<{ id: number; anNumber?: string }>(token, "activities", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

/** La pregunta como se ve en el panel: sin la mención al asistente. */
export function preguntaVisible(markup: string): string {
  return String(markup ?? "")
    .replace(/\[@?asistente[^\]]*\]\(user:0\)/gi, " ")
    .replace(/(^|\s)@asistente\b[,:]?/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}
