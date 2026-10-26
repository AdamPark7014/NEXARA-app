import { afterEach, describe, expect, it, vi } from "vitest";
import { setNativeFetch } from "./native-fetch";
import {
  enqueueOfflineFetch,
  flushOfflineQueue,
  getOfflineQueueLength,
  portalSessionBearer,
} from "./offline-queue";

afterEach(() => {
  setNativeFetch(globalThis.fetch.bind(globalThis));
});

function encolar(url: string) {
  enqueueOfflineFetch({ url, method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
}

describe("cola sin conexión", () => {
  it("dos envíos que coinciden mandan cada operación una sola vez", async () => {
    encolar("https://api.test/a");
    encolar("https://api.test/b");
    let soltar: () => void = () => undefined;
    const enCamino = new Promise<void>((resolve) => {
      soltar = resolve;
    });
    const http = vi.fn(async (_url: RequestInfo | URL, _init?: RequestInit) => {
      await enCamino;
      return new Response("{}", { status: 200 });
    });
    setNativeFetch(http as unknown as typeof fetch);

    const primero = flushOfflineQueue(() => "Bearer uno");
    // El reintento a mano llega mientras el primero sigue enviando.
    const segundo = flushOfflineQueue(() => "Bearer uno");
    expect(segundo).toBe(primero);

    soltar();
    await Promise.all([primero, segundo]);

    expect(http.mock.calls.map(([url]) => String(url))).toEqual(["https://api.test/a", "https://api.test/b"]);
    expect(getOfflineQueueLength()).toBe(0);
  });

  it("terminado un envío, el siguiente vuelve a leer la cola", async () => {
    const http = vi.fn(async (_url: RequestInfo | URL, _init?: RequestInit) => new Response("{}", { status: 500 }));
    setNativeFetch(http as unknown as typeof fetch);
    encolar("https://api.test/c");

    await flushOfflineQueue(() => "Bearer uno");
    expect(getOfflineQueueLength()).toBe(1);
    await flushOfflineQueue(() => "Bearer uno");
    expect(http).toHaveBeenCalledTimes(2);
  });

  it("sin token no envía nada", async () => {
    const http = vi.fn();
    setNativeFetch(http as unknown as typeof fetch);
    encolar("https://api.test/d");
    await flushOfflineQueue(() => undefined);
    expect(http).not.toHaveBeenCalled();
    expect(getOfflineQueueLength()).toBe(1);
  });

  it("el token del portal sale de la sesión de cliente o de sucursal", () => {
    expect(portalSessionBearer()).toBeUndefined();
    sessionStorage.setItem("branchSession", JSON.stringify({ token: "suc-1" }));
    expect(portalSessionBearer()).toBe("Bearer suc-1");
    sessionStorage.setItem("clientSession", JSON.stringify({ token: "cli-1" }));
    expect(portalSessionBearer()).toBe("Bearer cli-1");
  });
});
