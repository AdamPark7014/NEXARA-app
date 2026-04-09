/**
 * Caché de respuestas GET del API en IndexedDB para lectura offline y fallback si falla la red.
 * Al volver online, `revalidateHotApiCache` refresca las entradas más usadas recientemente.
 */

import { getApiBase } from "./api-base";
import { isNeverQueuePath } from "@nexara/offline-shared";

const DB_NAME = "nexara-api-get-cache-v1";
const STORE = "entries";
const DB_VERSION = 1;
const MAX_ENTRIES = 450;
const MAX_BODY_CHARS = 1_800_000;

export type CachedApiEntry = {
  key: string;
  url: string;
  status: number;
  statusText: string;
  headersJson: string;
  body: string;
  storedAt: number;
  lastAccessAt: number;
};

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        const os = db.createObjectStore(STORE, { keyPath: "key" });
        os.createIndex("lastAccessAt", "lastAccessAt", { unique: false });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function normalizeGetUrl(href: string): string {
  try {
    const u = new URL(href);
    u.hash = "";
    const keys = [...u.searchParams.keys()].sort();
    const next = new URL(u.origin + u.pathname);
    for (const k of keys) {
      for (const v of u.searchParams.getAll(k)) next.searchParams.append(k, v);
    }
    return next.href;
  } catch {
    return href;
  }
}

export function authCacheTag(token: string | undefined): string {
  if (!token) return "anon";
  let h = 2166136261;
  for (let i = 0; i < token.length; i++) {
    h ^= token.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return `u${(h >>> 0).toString(16)}`;
}

export function shouldCacheApiGet(absUrl: string): boolean {
  try {
    const req = new URL(absUrl);
    if (isNeverQueuePath(req.pathname)) return false;
    const baseStr = getApiBase().replace(/\/+$/, "");
    const base = new URL(baseStr);
    if (req.origin !== base.origin) return false;
    const basePath = base.pathname.replace(/\/$/, "") || "/";
    if (!(req.pathname === basePath || req.pathname.startsWith(`${basePath}/`))) return false;
    return true;
  } catch {
    return false;
  }
}

async function trimToMaxEntries(db: IDBDatabase): Promise<void> {
  const count = await new Promise<number>((resolve, reject) => {
    const tx = db.transaction(STORE, "readonly");
    const req = tx.objectStore(STORE).count();
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  if (count <= MAX_ENTRIES) return;
  const toDelete = count - MAX_ENTRIES + 16;
  let deleted = 0;
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    const idx = tx.objectStore(STORE).index("lastAccessAt");
    const cur = idx.openCursor();
    cur.onsuccess = () => {
      const r = cur.result;
      if (!r || deleted >= toDelete) {
        resolve();
        return;
      }
      r.delete();
      deleted++;
      r.continue();
    };
    cur.onerror = () => reject(cur.error);
    tx.onerror = () => reject(tx.error);
  });
}

export async function storeApiGetCache(url: string, authTag: string, response: Response): Promise<void> {
  if (!response.ok) return;
  const ct = (response.headers.get("content-type") || "").toLowerCase();
  if (!ct.includes("application/json") && !ct.includes("text/")) return;

  let body: string;
  try {
    body = await response.clone().text();
  } catch {
    return;
  }
  if (body.length > MAX_BODY_CHARS) return;

  const norm = normalizeGetUrl(url);
  const key = `${authTag}::${norm}`;
  const headersObj: Record<string, string> = {};
  response.headers.forEach((v, k) => {
    if (k.toLowerCase() === "set-cookie") return;
    headersObj[k] = v;
  });

  const entry: CachedApiEntry = {
    key,
    url: norm,
    status: response.status,
    statusText: response.statusText,
    headersJson: JSON.stringify(headersObj),
    body,
    storedAt: Date.now(),
    lastAccessAt: Date.now(),
  };

  const db = await openDb();
  await trimToMaxEntries(db);
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).put(entry);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  db.close();
}

async function touchCacheEntry(key: string): Promise<void> {
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    const os = tx.objectStore(STORE);
    const req = os.get(key);
    req.onsuccess = () => {
      const v = req.result as CachedApiEntry | undefined;
      if (v) os.put({ ...v, lastAccessAt: Date.now() });
    };
    req.onerror = () => reject(req.error);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  db.close();
}

export async function readApiGetCache(url: string, authTag: string): Promise<CachedApiEntry | null> {
  const norm = normalizeGetUrl(url);
  const key = `${authTag}::${norm}`;
  const db = await openDb();
  const row = await new Promise<CachedApiEntry | null>((resolve, reject) => {
    const tx = db.transaction(STORE, "readonly");
    const req = tx.objectStore(STORE).get(key);
    req.onsuccess = () => resolve((req.result as CachedApiEntry) || null);
    req.onerror = () => reject(req.error);
  });
  db.close();
  if (row) void touchCacheEntry(key).catch(() => {});
  return row;
}

export function responseFromApiCache(entry: CachedApiEntry, stale: boolean): Response {
  let headersObj: Record<string, string> = {};
  try {
    headersObj = JSON.parse(entry.headersJson) as Record<string, string>;
  } catch {
    /* ignore */
  }
  const h = new Headers();
  Object.entries(headersObj).forEach(([k, v]) => h.set(k, v));
  h.set("X-Nexara-Offline-Cache", stale ? "stale" : "hit");
  h.set("Content-Type", h.get("Content-Type") || "application/json; charset=utf-8");
  return new Response(entry.body, { status: entry.status, statusText: entry.statusText, headers: h });
}

/** Tras recuperar red: refresca hasta `limit` entradas más recientes en segundo plano. */
export async function revalidateHotApiCache(
  http: typeof fetch,
  getAuthHeader: () => string | undefined,
  limit = 72,
): Promise<void> {
  if (typeof navigator !== "undefined" && !navigator.onLine) return;

  const db = await openDb();
  const rows = await new Promise<CachedApiEntry[]>((resolve, reject) => {
    const tx = db.transaction(STORE, "readonly");
    const idx = tx.objectStore(STORE).index("lastAccessAt");
    const out: CachedApiEntry[] = [];
    const cur = idx.openCursor(null, "prev");
    cur.onsuccess = () => {
      const r = cur.result;
      if (!r || out.length >= limit) {
        resolve(out);
        return;
      }
      out.push(r.value as CachedApiEntry);
      r.continue();
    };
    cur.onerror = () => reject(cur.error);
  });
  db.close();

  const auth = getAuthHeader();
  if (!auth) return;

  for (const row of rows) {
    try {
      const sep = row.key.indexOf("::");
      const tag = sep >= 0 ? row.key.slice(0, sep) : "anon";
      const headers: Record<string, string> = { Accept: "application/json", Authorization: auth };
      const res = await http(row.url, { method: "GET", headers, cache: "no-store" });
      if (res.ok) await storeApiGetCache(row.url, tag, res);
    } catch {
      /* siguiente */
    }
  }
}
