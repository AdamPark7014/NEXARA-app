import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { fetchWithOfflineQueue } from "./fetch-offline";
import { setNativeFetch } from "./native-fetch";

/** Texto viejo, dos frases. El aviso del teléfono ahora es una. */
const TEXTO_VIEJO = "No se pudo completar la solicitud. Revisa tu conexión.";
const TEXTO = "No se pudo completar la solicitud: revisa tu conexión.";

function redCaida(): typeof fetch {
  return async () => {
    throw new TypeError("Failed to fetch");
  };
}

describe("fetchWithOfflineQueue", () => {
  afterEach(() => {
    setNativeFetch(globalThis.fetch);
  });

  it("cuando el envío falla y no cabe en la cola, el error es una frase", async () => {
    setNativeFetch(redCaida());
    Object.defineProperty(navigator, "onLine", { configurable: true, value: true });

    const formulario = new FormData();
    formulario.append("nota", "hola");
    const fallos = [
      fetchWithOfflineQueue(
        "https://api.nexara.test/actividades",
        { method: "POST", body: "{}" },
        () => undefined,
      ),
      fetchWithOfflineQueue(
        "https://api.nexara.test/actividades",
        { method: "POST", body: formulario },
        () => undefined,
      ),
    ];
    for (const fallo of fallos) {
      await expect(fallo).rejects.toEqual(expect.objectContaining({ message: TEXTO }));
      await expect(fallo).rejects.not.toEqual(expect.objectContaining({ message: TEXTO_VIEJO }));
    }

    Object.defineProperty(navigator, "onLine", { configurable: true, value: false });
    const consulta = fetchWithOfflineQueue(
      "https://api.nexara.test/actividades",
      { method: "GET" },
      () => undefined,
    );
    await expect(consulta).rejects.toEqual(expect.objectContaining({ message: TEXTO }));

    const ruta = [resolve(process.cwd(), "lib/fetch-offline.ts"), resolve(process.cwd(), "apps/web/lib/fetch-offline.ts")].find(
      (p) => existsSync(p),
    );
    const src = readFileSync(ruta!, "utf8");
    expect(src).not.toContain(TEXTO_VIEJO);
    expect(src).toContain(TEXTO);
    expect(src).toContain("Los adjuntos offline superan el límite (12 MB). Reduce el tamaño o espera conexión.");
  });
});
