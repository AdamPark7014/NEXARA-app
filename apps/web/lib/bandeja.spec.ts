import { describe, expect, it } from "vitest";
import { armarBandeja } from "./bandeja";

describe("bandeja única de Aprobaciones (15-11)", () => {
  it("junta lo que espera la firma y calla lo que no hay", () => {
    const g = armarBandeja({
      revisiones: { pendientes: [{ titulo: "Instalar NVR", paraTi: true, persona: { nombre: "Israel" } }, { titulo: "De otro jefe", paraTi: false }] },
      viaticos: [{ estatus: "Pendiente", montoSolicitado: 220 }, { estatus: "Pagado", montoSolicitado: 500 }],
      semana: { lunes: "2026-11-02", totales: { extrasMinutosPendientes: 3373, descuentosSugeridosTotal: 2571.43, faltasInjustificadas: 7 } },
      solicitudes: { received: [{ status: "ACCEPTED" }] },
      firmas: [],
    });
    expect(g.map((x) => [x.clave, x.cantidad])).toEqual([
      ["evidencias", 1],
      ["viaticos", 1],
      ["extras", 56],
      ["descuentos", 7],
    ]);
    expect(g[0].ejemplos[0]).toEqual({ titulo: "Instalar NVR", detalle: "Israel" });
  });

  it("sin nada pendiente no hay grupos", () => {
    expect(armarBandeja({})).toEqual([]);
  });
});
