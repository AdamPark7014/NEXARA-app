import { describe, expect, it } from "vitest";
import { diasHasta, fechaCorta } from "./recursos-ui";

/**
 * Compras y almacén guardan sus fechas como día de calendario: la API las manda a medianoche UTC.
 * Leídas con la hora de México caían en la tarde del día anterior: la entrega estimada para hoy
 * salía «Atrasada 1 día» y la tabla pintaba el día de antes.
 */
describe("fechas de solo día en compras y almacén", () => {
  const hoy = new Date(2026, 10, 22, 10, 0);

  it("una entrega estimada para hoy no cuenta como atrasada", () => {
    expect(diasHasta("2026-11-22T00:00:00.000Z", hoy)).toBe(0);
    expect(diasHasta("2026-11-23T00:00:00.000Z", hoy)).toBe(1);
    expect(diasHasta("2026-11-21T00:00:00.000Z", hoy)).toBe(-1);
    expect(diasHasta("2026-11-22", hoy)).toBe(0);
  });

  it("pinta el día que se capturó", () => {
    expect(fechaCorta("2026-11-22T00:00:00.000Z")).toBe("22 nov 2026");
    expect(fechaCorta("2026-12-01")).toBe("1 dic 2026");
  });

  it("un instante con hora se queda en la hora local", () => {
    // 03:30 UTC del 22 son las 21:30 del 21 en México.
    expect(fechaCorta("2026-11-22T03:30:00.000Z")).toBe("21 nov 2026");
    expect(diasHasta("2026-11-22T03:30:00.000Z", hoy)).toBe(-1);
    expect(fechaCorta(new Date(2026, 10, 22, 9, 0))).toBe("22 nov 2026");
  });

  it("sin fecha, o ilegible, no inventa una", () => {
    expect(diasHasta(null, hoy)).toBeNull();
    expect(diasHasta("no es fecha", hoy)).toBeNull();
  });
});
