import { describe, expect, it } from "vitest";
import { etiquetaSemana } from "./AnalisisNomina";

describe("etiquetaSemana", () => {
  it("dentro del mismo mes y cruzando de mes", () => {
    expect(etiquetaSemana("2026-11-02")).toBe("2–8 nov");
    expect(etiquetaSemana("2026-10-26")).toBe("26 oct–1 nov");
  });
});
