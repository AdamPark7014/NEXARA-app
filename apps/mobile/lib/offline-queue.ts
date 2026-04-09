import { getNativeFetch } from "./native-fetch";

export const OFFLINE_QUEUE_STORAGE_KEY = "nexara-offline-queue-v1";

export type QueuedFetch = {
  id: string;
  url: string;
  method: string;
  headers: Record<string, string>;
  body: string | null;
  createdAt: number;
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
  localStorage.setItem(OFFLINE_QUEUE_STORAGE_KEY, JSON.stringify(items.slice(-120)));
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
      const res = await http(item.url, {
        method: item.method,
        headers,
        body: item.body || undefined,
      });
      if (!res.ok) remaining.push(item);
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
