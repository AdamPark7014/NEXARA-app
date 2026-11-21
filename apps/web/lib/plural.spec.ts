import { describe, expect, it } from "vitest";
import { contar, palabra } from "./plural";

describe("contar", () => {
  it("uno en singular, lo demás en plural (también el cero)", () => {
    expect(contar(1, "pieza")).toBe("1 pieza");
    expect(contar(3, "pieza")).toBe("3 piezas");
    expect(contar(0, "día")).toBe("0 días");
  });

  it("acepta el plural cuando no basta la «s»", () => {
    expect(contar(1, "actividad abierta", "actividades abiertas")).toBe("1 actividad abierta");
    expect(contar(2, "actividad abierta", "actividades abiertas")).toBe("2 actividades abiertas");
  });

  it("una cantidad ya con formato se respeta («1» y «1.5»)", () => {
    expect(contar("1", "pieza")).toBe("1 pieza");
    expect(contar("1.5", "metro")).toBe("1.5 metros");
  });

  it("la palabra sola", () => {
    expect(palabra(1, "día")).toBe("día");
    expect(palabra(4, "aprobación", "aprobaciones")).toBe("aprobaciones");
  });
});
