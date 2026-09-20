import { describe, expect, it } from "vitest";
import {
  buildLedgerQuery,
  currentMonthRange,
  describeOrigen,
  emptyFilters,
  emptyTotals,
  formatLedgerDate,
  formatMetodo,
  hasActiveFilters,
} from "./_ledger";

describe("libro de movimientos · query a la API", () => {
  it("omite los filtros vacíos en vez de mandarlos en blanco", () => {
    const qs = buildLedgerQuery({ from: "2026-09-01", to: "2026-09-30", tipo: "", q: "  " });
    expect(qs).toBe("from=2026-09-01&to=2026-09-30");
  });

  it("recorta el texto libre antes de mandarlo", () => {
    const qs = buildLedgerQuery({ q: "  banorte  " });
    expect(new URLSearchParams(qs).get("q")).toBe("banorte");
  });

  it("no manda page=1: es el valor por defecto de la API", () => {
    expect(buildLedgerQuery({}, { page: 1 })).toBe("");
    expect(new URLSearchParams(buildLedgerQuery({}, { page: 3 })).get("page")).toBe("3");
  });

  it("lleva todos los filtros de la barra cuando están puestos", () => {
    const qs = new URLSearchParams(
      buildLedgerQuery(
        {
          from: "2026-01-01",
          to: "2026-01-31",
          tipo: "EGRESO",
          categoria: "Nómina",
          cuentaId: "4",
          estado: "Pagado",
          metodoPago: "SPEI",
          q: "acme",
        },
        { page: 2, pageSize: 100 },
      ),
    );
    expect(Object.fromEntries(qs)).toEqual({
      from: "2026-01-01",
      to: "2026-01-31",
      tipo: "EGRESO",
      categoria: "Nómina",
      cuentaId: "4",
      estado: "Pagado",
      metodoPago: "SPEI",
      q: "acme",
      page: "2",
      pageSize: "100",
    });
  });
});

describe("libro de movimientos · rango por defecto", () => {
  it("toma el mes en curso completo", () => {
    expect(currentMonthRange(new Date(2026, 8, 20))).toEqual({
      from: "2026-09-01",
      to: "2026-09-30",
    });
  });

  it("respeta los meses de 31 y los febreros bisiestos", () => {
    expect(currentMonthRange(new Date(2026, 0, 15)).to).toBe("2026-01-31");
    expect(currentMonthRange(new Date(2024, 1, 10)).to).toBe("2024-02-29");
  });

  it("los filtros iniciales sólo traen el rango: nada más aplicado", () => {
    const f = emptyFilters(new Date(2026, 8, 20));
    expect(hasActiveFilters(f)).toBe(false);
    expect(hasActiveFilters({ ...f, q: "banorte" })).toBe(true);
    expect(hasActiveFilters({ ...f, tipo: "EGRESO" })).toBe(true);
  });
});

describe("libro de movimientos · formato", () => {
  it("no corre la fecha un día por la zona horaria", () => {
    // `new Date("2026-09-01")` se lee como UTC y en México daba 31 de agosto.
    expect(formatLedgerDate("2026-09-01")).toBe("01 sep 2026");
    expect(formatLedgerDate("2026-01-31")).toBe("31 ene 2026");
  });

  it("aguanta vacíos y basura sin romper la tabla", () => {
    expect(formatLedgerDate("")).toBe("—");
    expect(formatLedgerDate(null)).toBe("—");
    expect(formatLedgerDate("ayer")).toBe("—");
  });

  it("traduce el método de pago y deja pasar el que no conoce", () => {
    expect(formatMetodo("SPEI")).toBe("SPEI");
    expect(formatMetodo("CARD_DEBIT")).toBe("Tarjeta de débito");
    expect(formatMetodo("ALGO_NUEVO")).toBe("ALGO_NUEVO");
    expect(formatMetodo(null)).toBe("—");
  });

  it("nombra el documento origen en español", () => {
    expect(describeOrigen({ origen: { tabla: "invoices", id: 12, href: null } })).toBe("Factura #12");
    expect(describeOrigen({ origen: { tabla: "bank_transactions", id: 8, href: null } })).toBe(
      "Línea bancaria #8",
    );
  });
});

describe("libro de movimientos · totales vacíos", () => {
  it("arrancan en cero para que la barra no parpadee con NaN", () => {
    const t = emptyTotals();
    expect(t.ingresos).toBe(0);
    expect(t.neto).toBe(0);
    expect(t.efectivo.conteo).toBe(0);
    expect(t.transferencias).toEqual({ monto: 0, conteo: 0 });
    // Cada bloque es su propio objeto: mutar uno no debe tocar al otro.
    t.efectivo.ingresos = 10;
    expect(t.devengado.ingresos).toBe(0);
  });
});
