import { erpFetch } from "@/lib/erp-api";
import { apiErrorMessage } from "@/lib/ops-activities-api";

/** Lo que dura «Deshacer» en pantalla. El servidor acepta un poco más (`deshacer-reglas.ts` de la API). */
export const PLAZO_DESHACER_MS = 5_000;

export type TipoDeshacer = "actividad" | "viatico";

export type ResultadoDeshacer = { ok: true; tipo: TipoDeshacer; ids: number[]; como: "a_tiempo" | "superior" };

/** `POST /deshacer`: quien lo hizo en los primeros segundos, o un superior suyo cuando sea. */
export function deshacerAlta(token: string, tipo: TipoDeshacer, ids: number | number[]): Promise<ResultadoDeshacer> {
  return erpFetch<ResultadoDeshacer>("deshacer", token, {
    method: "POST",
    body: JSON.stringify({ tipo, ids: Array.isArray(ids) ? ids : [ids] }),
  });
}

/** El mensaje del servidor (410 plazo, 409 ya avanzó, 403 no es suyo) o uno genérico. */
export function motivoNoSeDeshizo(e: unknown): string {
  return apiErrorMessage(e, "No se pudo deshacer. Revisa tu conexión e inténtalo otra vez.");
}
