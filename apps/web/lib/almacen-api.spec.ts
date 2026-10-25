import { afterEach, describe, expect, it, vi } from "vitest";
import { consultarUpcInternacional } from "./almacen-api";

afterEach(() => vi.unstubAllGlobals());

describe("consultarUpcInternacional", () => {
  it("si el catálogo no contesta, el aviso cabe en una frase", async () => {
    const viejo = "No se pudo consultar el catálogo internacional. Captura los datos a mano.";
    const codigo = "036000291452";
    const f = vi.fn(async () => {
      throw new Error("sin red");
    });
    vi.stubGlobal("fetch", f);

    const r = await consultarUpcInternacional("tok", codigo);

    expect(r).toEqual({
      encontrado: false,
      codigo,
      motivo: "SIN_SERVICIO",
      mensaje: "No se pudo consultar el catálogo internacional: captura los datos a mano.",
    });
    if (r.encontrado) throw new Error("el fallo no debe traer producto");
    expect(r.mensaje).not.toBe(viejo);
    expect(r.mensaje).toMatch(/captura los datos a mano/);
    expect(r.mensaje.split(".").filter((parte) => parte.trim()).length).toBe(1);
    expect(f).toHaveBeenCalledTimes(1);
    const [url, init] = f.mock.calls[0] as unknown as [string, RequestInit];
    expect(String(url)).toContain(`stock/upc-lookup/${codigo}`);
    expect(init.method).toBeUndefined();
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer tok");

    const okFetch = vi.fn(async () => ({
      ok: true,
      status: 200,
      text: async () =>
        JSON.stringify({
          encontrado: true,
          codigo,
          fuente: "upcitemdb",
          producto: {
            codigo,
            nombre: "Cable UTP",
            marca: null,
            modelo: null,
            descripcion: null,
            imagenUrl: null,
            categoria: null,
          },
        }),
    }));
    vi.stubGlobal("fetch", okFetch);
    const ok = await consultarUpcInternacional("tok", codigo);
    expect(String(okFetch.mock.calls[0][0])).toContain(`stock/upc-lookup/${codigo}`);
    expect(ok.encontrado).toBe(true);
    if (ok.encontrado) expect(ok.producto.nombre).toBe("Cable UTP");
  });
});
