import { describe, expect, it } from "vitest";
import { aFechaLocal, formatoFechaLocal } from "./fecha-calendario";

// El runner corre en America/Mexico_City (UTC-6): justo la zona donde se veía el error.
describe("fechas sin hora de la API", () => {
  it("medianoche UTC es ese mismo día, no el anterior", () => {
    const d = aFechaLocal("2026-09-18T00:00:00.000Z");
    expect([d?.getFullYear(), d?.getMonth(), d?.getDate(), d?.getHours()]).toEqual([2026, 8, 18, 0]);
    expect(formatoFechaLocal("2026-01-01T00:00:00.000Z", { day: "2-digit", month: "short", year: "numeric" })).toBe(
      new Date(2026, 0, 1).toLocaleDateString("es-MX", { day: "2-digit", month: "short", year: "numeric" }),
    );
  });

  it("acepta la fecha sola y sin milisegundos", () => {
    expect(aFechaLocal("2026-09-18")?.getDate()).toBe(18);
    expect(aFechaLocal("2026-09-18T00:00:00Z")?.getDate()).toBe(18);
  });

  it("un instante con hora se queda como está", () => {
    // Las 05:00 UTC del 18 todavía son las 23:00 del 17 en México.
    const d = aFechaLocal("2026-09-18T05:00:00.000Z");
    expect([d?.getDate(), d?.getHours()]).toEqual([17, 23]);
  });

  it("una factura que vence hoy no cuenta como vencida", () => {
    const hoy = new Date(2026, 10, 2);
    const vence = aFechaLocal("2026-11-02T00:00:00.000Z");
    expect(Math.floor(((vence?.getTime() ?? 0) - hoy.getTime()) / 86_400_000)).toBe(0);
  });

  it("sin valor o con basura no inventa una fecha", () => {
    expect(aFechaLocal(null)).toBeNull();
    expect(aFechaLocal("")).toBeNull();
    expect(aFechaLocal("no es fecha")).toBeNull();
    expect(formatoFechaLocal(undefined)).toBe("—");
    expect(formatoFechaLocal("no es fecha", undefined, "sin fecha")).toBe("sin fecha");
  });
});
