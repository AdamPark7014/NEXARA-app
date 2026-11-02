import { describe, expect, it } from "vitest";
import { claveMarca, marcaCorta } from "./marca";

describe("La marca sin su razón social", () => {
  it("quita lo que sobra", () => {
    expect(marcaCorta("Dahua Technology")).toBe("Dahua");
    expect(marcaCorta("Hangzhou Hikvision Digital Technology Co., Ltd.")).toBe("Hangzhou Hikvision Digital");
    expect(marcaCorta("Axis Communications Inc.")).toBe("Axis Communications");
    expect(marcaCorta("  Provision-ISR  ")).toBe("Provision-ISR");
  });

  it("no toca lo que ya está bien, ni deja un nombre vacío", () => {
    expect(marcaCorta("TP-Link")).toBe("TP-Link");
    expect(marcaCorta("ZKTeco")).toBe("ZKTeco");
    expect(marcaCorta("Technology")).toBe("Technology");
    expect(marcaCorta(null)).toBe("");
  });

  it("para filtrar, mayúsculas y razón social no separan", () => {
    expect(claveMarca("HIKVISION")).toBe(claveMarca("Hikvision"));
    expect(claveMarca("Dahua Technology")).toBe(claveMarca("Dahua"));
  });
});
