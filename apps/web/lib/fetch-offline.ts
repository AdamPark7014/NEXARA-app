import { enqueueOfflineFetch } from "./offline-queue";
import { idbPutItem } from "./offline-idb";
import { getNativeFetch } from "./native-fetch";

const QUEUED_STATUS = 202;

/**
 * fetch con reintento en cola cuando no hay red (solo JSON / texto; no FormData).
 * Respuestas sintéticas `202` con `{ queued: true }` indican que quedó en cola.
 */
export async function fetchWithOfflineQueue(
  url: string,
  init: RequestInit,
  getToken: () => string | undefined,
): Promise<Response> {
  const method = (init.method || "GET").toUpperCase();
  const isMutation = ["POST", "PUT", "PATCH", "DELETE"].includes(method);

  const headers = new Headers(init.headers as HeadersInit | undefined);
  const token = getToken();
  if (token && !headers.has("Authorization")) {
    headers.set("Authorization", `Bearer ${token}`);
  }

  const http = getNativeFetch();

  if (init.body instanceof FormData || init.body instanceof URLSearchParams) {
    return http(url, { ...init, headers });
  }

  try {
    return await http(url, { ...init, headers });
  } catch {
    const offline = typeof navigator !== "undefined" && !navigator.onLine;
    if (!isMutation || !offline) {
      throw new Error("No se pudo completar la solicitud. Revisa tu conexión.");
    }
    if (init.body instanceof Blob || init.body instanceof ArrayBuffer) {
      throw new Error("Sin conexión: este tipo de envío requiere internet.");
    }

    const body =
      typeof init.body === "string"
        ? init.body
        : init.body == null
          ? null
          : JSON.stringify(init.body);

    const headerObj: Record<string, string> = {};
    headers.forEach((v, k) => {
      headerObj[k] = v;
    });

    const created = enqueueOfflineFetch({
      url,
      method,
      headers: headerObj,
      body,
    });
    void idbPutItem(created).catch(() => {});

    return new Response(
      JSON.stringify({
        queued: true,
        offline: true,
        message: "Operación guardada; se enviará al recuperar conexión.",
      }),
      {
        status: QUEUED_STATUS,
        headers: { "Content-Type": "application/json" },
      },
    );
  }
}

export function isQueuedResponse(res: Response): boolean {
  return res.status === QUEUED_STATUS;
}
