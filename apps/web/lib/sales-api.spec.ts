import { afterEach, describe, expect, it, vi } from "vitest";

import { listSalesClients } from "./sales-api";

/** Página HTML que devuelve un proxy cuando el origen no contesta (502/5xx). */
const HTML_5XX = "<!DOCTYPE html><html><head><title>502 Bad Gateway</title></head><body>502 Bad Gateway</body></html>";

const TEXTO_VIEJO =
  "Servicio temporalmente no disponible (502/5xx). Intenta de nuevo en unos minutos.";

const TEXTO =
  "Servicio temporalmente no disponible (502/5xx): intenta de nuevo en unos minutos.";

describe("aviso de ventas con HTML de 5xx", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("deja el aviso en una frase y cita el texto viejo", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(HTML_5XX, { status: 502, headers: { "Content-Type": "text/html" } })),
    );

    await expect(listSalesClients("jwt")).rejects.toThrow(TEXTO);

    const error = await listSalesClients("jwt").catch((e: unknown) => e);
    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).toBe(TEXTO);
    expect((error as Error).message).not.toBe(TEXTO_VIEJO);
  });
});
