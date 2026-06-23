import { getNativeFetch } from "./native-fetch";

export const OFFLINE_QUEUE_STORAGE_KEY = "nexara-offline-queue-v1";

/** Partes serializadas de FormData para reenvío al volver online. */
export type SerializedFormPart =
  | { t: "s"; name: string; value: string }
  | { t: "f"; name: string; fileName: string; mime: string; b64: string };

export type QueuedFetch = {
  id: string;
  url: string;
  method: string;
  headers: Record<string, string>;
  body: string | null;
  createdAt: number;
  /** Si está definido, se reconstruye FormData en lugar de enviar `body` como texto. */
  formParts?: SerializedFormPart[];
};

function readQueue(): QueuedFetch[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(OFFLINE_QUEUE_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as QueuedFetch[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

/** Items in localStorage queue (IndexedDB may hold extras until next flush). */
export function getOfflineQueueLength(): number {
  return readQueue().length;
}

function writeQueue(items: QueuedFetch[]) {
  if (typeof window === "undefined") return;
  const trimmed = items.slice(-120);
  try {
    const ser = JSON.stringify(trimmed);
    if (ser.length < 2_400_000) {
      localStorage.setItem(OFFLINE_QUEUE_STORAGE_KEY, ser);
    }
  } catch {
    /* cola muy grande (p. ej. adjuntos): solo IDB vía idbPutItem */
  }
  window.dispatchEvent(new Event("nexara-offline-queue"));
}

/** Queue a failed request to retry when the device is back online (call from fetch wrappers). */
export function enqueueOfflineFetch(input: Omit<QueuedFetch, "id" | "createdAt">): QueuedFetch {
  const item: QueuedFetch = {
    ...input,
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`,
    createdAt: Date.now(),
  };
  const next = [...readQueue(), item];
  writeQueue(next);
  return item;
}

export async function flushOfflineQueue(getAuthHeader: () => string | undefined): Promise<void> {
  if (typeof window === "undefined" || !navigator.onLine) return;
  const auth = getAuthHeader();
  if (!auth) return;

  let pending = readQueue();
  try {
    const { idbGetAll, idbClear } = await import("./offline-idb");
    const fromIdb = await idbGetAll();
    const byId = new Map<string, QueuedFetch>();
    for (const row of pending) byId.set(row.id, row);
    for (const row of fromIdb) if (!byId.has(row.id)) byId.set(row.id, row);
    pending = Array.from(byId.values());
    await idbClear();
  } catch {
    /* IDB opcional */
  }

  if (!pending.length) return;

  const remaining: QueuedFetch[] = [];

  const http = getNativeFetch();

  for (const item of pending) {
    try {
      const headers = { ...item.headers, Authorization: auth };
      const h = new Headers(headers);
      h.delete("Content-Type");

      if (item.formParts?.length) {
        const fd = new FormData();
        for (const p of item.formParts) {
          if (p.t === "s") {
            fd.append(p.name, p.value);
          } else {
            const bin = atob(p.b64);
            const bytes = new Uint8Array(bin.length);
            for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
            fd.append(p.name, new Blob([bytes], { type: p.mime || "application/octet-stream" }), p.fileName);
          }
        }
        const res = await http(item.url, { method: item.method, headers: h, body: fd });
        if (!res.ok) remaining.push(item);
      } else {
        const res = await http(item.url, {
          method: item.method,
          headers,
          body: item.body || undefined,
        });
        if (!res.ok) remaining.push(item);
      }
    } catch {
      remaining.push(item);
    }
  }

  writeQueue(remaining);
  try {
    const { idbClear, idbPutItem } = await import("./offline-idb");
    await idbClear();
    for (const item of remaining) {
      await idbPutItem(item);
    }
  } catch {
    /* ignore */
  }
}
