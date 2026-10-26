import { beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("./capacitor-env", () => ({
  isCapacitorNative: () => true,
}));

vi.mock("./offline-api-cache", async () => {
  const actual = await vi.importActual<typeof import("./offline-api-cache")>("./offline-api-cache");
  return {
    ...actual,
    readApiGetCache: async () => null,
  };
});

import { installOfflineFetchGlobal } from "./install-offline-fetch";

/**
 * En la app del teléfono, un GET de sección sin copia local y con el servidor
 * mudo lanza este aviso. El texto viejo eran dos frases.
 */
const TEXTO_VIEJO =
  "No se pudo contactar la API. Comprueba que nexara-api esté activo o recarga con Ctrl+F5.";

const TEXTO =
  "No se pudo contactar la API: comprueba que nexara-api esté activo o recarga con Ctrl+F5.";

describe("consulta en el teléfono sin copia local", () => {
  beforeAll(() => {
    Object.defineProperty(navigator, "onLine", { configurable: true, get: () => true });
    window.fetch = vi.fn(async () => {
      throw new TypeError("Failed to fetch");
    });
    installOfflineFetchGlobal();
  });

  it("si el servidor no contesta, el aviso cabe en una frase", async () => {
    let aviso: unknown;
    try {
      await window.fetch("http://localhost:3000/api/proyectos");
    } catch (error) {
      aviso = error;
    }

    expect(aviso).toBeInstanceOf(Error);
    const mensaje = (aviso as Error).message;
    expect(mensaje).toBe(TEXTO);
    expect(mensaje).not.toBe(TEXTO_VIEJO);
    expect(mensaje).toContain("nexara-api");
    expect(mensaje).toContain("Ctrl+F5");
    expect(TEXTO_VIEJO.split(/(?<=\.)\s+(?=[A-ZÁÉÍÓÚ])/)).toEqual([
      "No se pudo contactar la API.",
      "Comprueba que nexara-api esté activo o recarga con Ctrl+F5.",
    ]);
    expect(mensaje.split(/(?<=\.)\s+(?=[A-ZÁÉÍÓÚ])/)).toEqual([TEXTO]);
  });
});
