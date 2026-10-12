import { describe, expect, it } from "vitest";
import { unirDictado } from "./use-dictado";

describe("dictado por voz", () => {
  it("agrega cada frase con un espacio y sin duplicar espacios", () => {
    expect(unirDictado("", " que Antonio vaya a Tox ")).toBe("que Antonio vaya a Tox");
    expect(unirDictado("que Antonio vaya", "a las tres")).toBe("que Antonio vaya a las tres");
    expect(unirDictado("hola ", "mundo")).toBe("hola mundo");
    expect(unirDictado("hola", "   ")).toBe("hola");
  });
});
