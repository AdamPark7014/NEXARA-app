import { enqueueOfflineFetch, type SerializedFormPart } from "./offline-queue";
import { idbPutItem } from "./offline-idb";
import { getNativeFetch } from "./native-fetch";

const QUEUED_STATUS = 202;
const MAX_FORM_SERIALIZED = 12 * 1024 * 1024;

function arrayBufferToB64(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

async function serializeFormDataBody(fd: FormData): Promise<SerializedFormPart[]> {
  const parts: SerializedFormPart[] = [];
  let acc = 0;
  for (const [name, value] of fd.entries()) {
    if (value instanceof File) {
      const buf = await value.arrayBuffer();
      const b64 = arrayBufferToB64(buf);
      acc += b64.length;
      if (acc > MAX_FORM_SERIALIZED) {
        throw new Error("Los adjuntos offline superan el límite (12 MB). Reduce el tamaño o espera conexión.");
      }
      parts.push({
        t: "f",
        name,
        fileName: value.name,
        mime: value.type || "application/octet-stream",
        b64,
      });
    } else {
      parts.push({ t: "s", name, value: String(value) });
    }
  }
  return parts;
}

/**
 * fetch con cola offline: JSON/texto y FormData (serializado en IndexedDB hasta 12 MB).
 * Respuestas `202` con `{ queued: true }` indican operación diferida.
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

  if (init.body instanceof URLSearchParams) {
    return http(url, { ...init, headers });
  }

  if (init.body instanceof FormData) {
    try {
      return await http(url, { ...init, headers });
    } catch {
      const offline = typeof navigator !== "undefined" && !navigator.onLine;
      if (!isMutation || !offline) {
        throw new Error("No se pudo completar la solicitud. Revisa tu conexión.");
      }
      const formParts = await serializeFormDataBody(init.body);
      const headerObj: Record<string, string> = {};
      headers.forEach((v, k) => {
        headerObj[k] = v;
      });
      const created = enqueueOfflineFetch({
        url,
        method,
        headers: headerObj,
        body: null,
        formParts,
      });
      void idbPutItem(created).catch(() => {});
      return new Response(
        JSON.stringify({
          queued: true,
          offline: true,
          message: "Formulario y archivos guardados; se enviarán al recuperar conexión.",
        }),
        { status: QUEUED_STATUS, headers: { "Content-Type": "application/json" } },
      );
    }
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

    return new Response(JSON.stringify({ queued: true, offline: true, message: "Operación guardada; se enviará al recuperar conexión." }), {
      status: QUEUED_STATUS,
      headers: { "Content-Type": "application/json" },
    });
  }
}

export function isQueuedResponse(res: Response): boolean {
  return res.status === QUEUED_STATUS;
}
