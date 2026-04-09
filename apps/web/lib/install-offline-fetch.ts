import { getApiBase } from "./api-base";
import { fetchWithOfflineQueue } from "./fetch-offline";
import { setNativeFetch } from "./native-fetch";
import { isNeverQueuePath } from "@nexara/offline-shared";

const INSTALLED_KEY = "__nexaraOfflineFetchInstalled";

function shouldQueueApiMutation(absUrl: string): boolean {
  try {
    const req = new URL(absUrl);
    if (isNeverQueuePath(req.pathname)) return false;
    const baseStr = getApiBase().replace(/\/+$/, "");
    const base = new URL(baseStr);
    if (req.origin !== base.origin) return false;
    const basePath = base.pathname.replace(/\/$/, "") || "/";
    return req.pathname === basePath || req.pathname.startsWith(`${basePath}/`);
  } catch {
    return false;
  }
}

function mergeHeaders(reqHeaders: Headers, initHeaders?: HeadersInit): Headers {
  const h = new Headers(initHeaders);
  reqHeaders.forEach((value, key) => {
    if (!h.has(key)) h.set(key, value);
  });
  return h;
}

async function maybeQueueMutation(
  abs: string,
  method: string,
  init: RequestInit | undefined,
  getToken: () => string | undefined,
): Promise<Response | null> {
  const m = (method || "GET").toUpperCase();
  if (!["POST", "PUT", "PATCH", "DELETE"].includes(m)) return null;

  const body = init?.body;
  if (
    body instanceof FormData ||
    body instanceof URLSearchParams ||
    body instanceof Blob ||
    body instanceof ArrayBuffer ||
    (typeof ReadableStream !== "undefined" && body instanceof ReadableStream)
  ) {
    return null;
  }

  if (!shouldQueueApiMutation(abs)) return null;

  const merged: RequestInit = { ...init, method: init?.method ?? m };
  return fetchWithOfflineQueue(abs, merged, getToken);
}

function getPanelAuthToken(): string | undefined {
  if (typeof window === "undefined") return undefined;
  try {
    const session = window.sessionStorage.getItem("nexara_user");
    if (session) {
      const p = JSON.parse(session) as { token?: string };
      if (typeof p?.token === "string") return p.token;
    }
  } catch {
    /* ignore */
  }
  try {
    const local = window.localStorage.getItem("nexara_user");
    if (local) {
      const p = JSON.parse(local) as { token?: string };
      if (typeof p?.token === "string") return p.token;
    }
  } catch {
    /* ignore */
  }
  try {
    const portal =
      window.sessionStorage.getItem("clientSession") || window.sessionStorage.getItem("branchSession");
    if (portal) {
      const p = JSON.parse(portal) as { token?: string };
      if (typeof p?.token === "string") return p.token;
    }
  } catch {
    /* ignore */
  }
  return undefined;
}

/**
 * Parchea `window.fetch` para que las mutaciones JSON hacia el API de Nexara
 * usen la cola offline. Idempotente.
 */
export function installOfflineFetchGlobal(): void {
  if (typeof window === "undefined") return;
  const w = window as unknown as Record<string, unknown>;
  if (w[INSTALLED_KEY]) return;

  const native = window.fetch.bind(window);
  setNativeFetch(native);
  w[INSTALLED_KEY] = true;

  window.fetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    if (typeof Request !== "undefined" && input instanceof Request) {
      const req = input;
      let abs: string;
      try {
        abs = new URL(req.url).href;
      } catch {
        return native(input, init);
      }
      const method = (init?.method ?? req.method ?? "GET").toUpperCase();

      if (init?.body !== undefined) {
        const merged: RequestInit = {
          ...init,
          method: init?.method ?? req.method,
          headers: mergeHeaders(req.headers, init?.headers),
        };
        const queued = await maybeQueueMutation(abs, method, merged, getPanelAuthToken);
        if (queued) return queued;
        return native(input, init);
      }

      const ct = req.headers.get("content-type") || "";
      if (
        ["POST", "PUT", "PATCH", "DELETE"].includes(method) &&
        ct.includes("application/json") &&
        !req.bodyUsed
      ) {
        try {
          const text = await req.clone().text();
          const merged: RequestInit = {
            method: req.method,
            headers: mergeHeaders(req.headers, init?.headers),
            body: text,
          };
          const queued = await maybeQueueMutation(abs, method, merged, getPanelAuthToken);
          if (queued) return queued;
        } catch {
          /* fall through */
        }
      }
      return native(input, init);
    }

    const urlStr = typeof input === "string" ? input : input instanceof URL ? input.href : "";
    if (!urlStr) {
      return native(input, init);
    }

    let abs: string;
    try {
      abs = new URL(urlStr, window.location.origin).href;
    } catch {
      return native(input, init);
    }

    const method = (init?.method || "GET").toUpperCase();
    const merged: RequestInit = { ...init, method: init?.method ?? method };
    const queued = await maybeQueueMutation(abs, method, merged, getPanelAuthToken);
    if (queued) return queued;

    return native(input, init);
  };
}
