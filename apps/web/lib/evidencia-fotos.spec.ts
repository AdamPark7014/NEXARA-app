import { afterEach, describe, expect, it, vi } from "vitest";
import { esErrorDeRed, geoDeFotosGuardadas, mensajeFotoNoGuardada } from "./evidencia-fotos";

describe("geoDeFotosGuardadas", () => {
  it("alinea con el número de fotos y descarta ubicaciones inválidas", () => {
    const raw = [
      { latitude: 19.4, longitude: -99.1, capturedAt: "2026-09-30T10:00:00Z" },
      null,
      { latitude: 0, longitude: 0 },
      { latitude: "x", longitude: 1 },
    ];
    expect(geoDeFotosGuardadas(raw, 5)).toEqual([
      { latitude: 19.4, longitude: -99.1, capturedAt: "2026-09-30T10:00:00Z" },
      null,
      null,
      null,
      null,
    ]);
  });

  it("sin ubicaciones guardadas regresa puros null", () => {
    expect(geoDeFotosGuardadas(null, 2)).toEqual([null, null]);
    expect(geoDeFotosGuardadas(undefined, 0)).toEqual([]);
  });

  it("capturedAt faltante queda en null", () => {
    expect(geoDeFotosGuardadas([{ latitude: 1, longitude: 2 }], 1)).toEqual([
      { latitude: 1, longitude: 2, capturedAt: null },
    ]);
  });
});

describe("mensajeFotoNoGuardada", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("un TypeError de fetch es falta de red y lo dice claro", () => {
    expect(esErrorDeRed(new TypeError("Failed to fetch"))).toBe(true);
    expect(mensajeFotoNoGuardada(new TypeError("Failed to fetch"), "x")).toMatch(/Sin conexión.*NO se guardó/);
    expect(mensajeFotoNoGuardada(new TypeError("Failed to fetch"), "x", "quitar")).toMatch(/NO se quitó/);
  });

  it("navegador sin red aunque el error sea otro", () => {
    vi.stubGlobal("navigator", { onLine: false });
    expect(esErrorDeRed(new Error("algo"))).toBe(true);
  });

  it("un error del servidor usa su mensaje", () => {
    vi.stubGlobal("navigator", { onLine: true });
    expect(mensajeFotoNoGuardada(new Error('{"message":"No estás en el paso correcto"}'), "x")).toBe(
      "No estás en el paso correcto",
    );
  });
});
