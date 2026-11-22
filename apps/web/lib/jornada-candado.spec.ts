import { afterEach, describe, expect, it, beforeEach, vi } from "vitest";
import { CODIGO_JORNADA_NO_ABIERTA, errorDeJornada, manejarErrorJornada, barreraJornadaActiva, cerrarBarreraJornada, abrirBarreraJornada, vigilarRespuestasDeJornada, sincronizarBarreraJornada } from "./jornada-candado";

beforeEach(() => cerrarBarreraJornada());

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("errorDeJornada", () => {
  it("detecta 409 con codigo", () => {
    const e = new Error(JSON.stringify({ statusCode: 409, code: CODIGO_JORNADA_NO_ABIERTA, message: "Registra tu entrada para empezar a trabajar" }));
    expect(errorDeJornada(e)?.code).toBe(CODIGO_JORNADA_NO_ABIERTA);
  });
  it("ignora otros errores", () => {
    expect(errorDeJornada(new Error(JSON.stringify({ code: "OTRO" })))).toBeNull();
    expect(errorDeJornada(new Error("fallo"))).toBeNull();
  });
});

describe("manejarErrorJornada", () => {
  it("abre la barrera", () => {
    expect(barreraJornadaActiva()).toBe(false);
    const ok = manejarErrorJornada(new Error(JSON.stringify({ code: CODIGO_JORNADA_NO_ABIERTA, message: "x" })));
    expect(ok).toBe(true);
    expect(barreraJornadaActiva()).toBe(true);
    abrirBarreraJornada(); // idempotente
    expect(barreraJornadaActiva()).toBe(true);
  });
});

describe("vigilarRespuestasDeJornada", () => {
  let quitar: () => void = () => undefined;
  afterEach(() => {
    quitar();
    vi.unstubAllGlobals();
  });

  const cuerpoCandado = JSON.stringify({ statusCode: 409, errorCode: CODIGO_JORNADA_NO_ABIERTA, code: CODIGO_JORNADA_NO_ABIERTA, message: "Registra tu entrada para empezar a trabajar" });

  it("abre la barrera con un fetch directo (sin erpFetch) y deja la respuesta intacta", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(cuerpoCandado, { status: 409 })));
    quitar = vigilarRespuestasDeJornada();
    const res = await fetch("/api/tool-requests", { method: "POST" });
    // Quien llamó todavía puede leer el cuerpo para enseñar su mensaje.
    expect((await res.json()).message).toBe("Registra tu entrada para empezar a trabajar");
    await vi.waitFor(() => expect(barreraJornadaActiva()).toBe(true));
  });

  it("otro 409 (un duplicado) y las respuestas buenas no la abren", async () => {
    const simulada = vi
      .fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ statusCode: 409, errorCode: "DUPLICATE", message: "Ya existe" }), { status: 409 }))
      .mockResolvedValueOnce(new Response("{}", { status: 200 }));
    vi.stubGlobal("fetch", simulada);
    quitar = vigilarRespuestasDeJornada();
    await fetch("/api/x", { method: "POST" });
    await fetch("/api/y");
    await new Promise((r) => setTimeout(r, 10));
    expect(barreraJornadaActiva()).toBe(false);
  });

  it("se instala una sola vez y se puede quitar", async () => {
    const simulada = vi.fn().mockResolvedValue(new Response("{}", { status: 200 }));
    vi.stubGlobal("fetch", simulada);
    quitar = vigilarRespuestasDeJornada();
    const vigilado = window.fetch;
    vigilarRespuestasDeJornada()();
    expect(window.fetch).toBe(vigilado);
    quitar();
    expect(window.fetch).toBe(simulada);
  });
});

describe("sincronizarBarreraJornada", () => {
  it("abre si pideBarrera y cierra si ya hay jornada", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          debeChecar: true,
          jornadaAbierta: false,
          pideBarrera: true,
          webCheckinAbierta: false,
          webCheckinHasta: null,
          mensaje: "Registra tu entrada para empezar a trabajar",
        }),
      }),
    );
    await sincronizarBarreraJornada("tok");
    expect(barreraJornadaActiva()).toBe(true);

    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          debeChecar: true,
          jornadaAbierta: true,
          pideBarrera: false,
          webCheckinAbierta: false,
          webCheckinHasta: null,
          mensaje: null,
        }),
      }),
    );
    await sincronizarBarreraJornada("tok");
    expect(barreraJornadaActiva()).toBe(false);
  });

  it("sin token no hace nada", async () => {
    expect(await sincronizarBarreraJornada(null)).toBeNull();
    expect(barreraJornadaActiva()).toBe(false);
  });
});