import { describe, expect, it, vi } from "vitest";
import { datosABlob } from "./planoImagen";

describe("datosABlob", () => {
  it("convierte sin pedir nada: la política de Core no deja hacer fetch a data:", async () => {
    const pedir = vi.spyOn(globalThis, "fetch");
    const b = datosABlob(`data:image/jpeg;base64,${btoa("hola")}`);
    expect(b.type).toBe("image/jpeg");
    expect(b.size).toBe(4);
    expect(pedir).not.toHaveBeenCalled();
    pedir.mockRestore();
  });
});
