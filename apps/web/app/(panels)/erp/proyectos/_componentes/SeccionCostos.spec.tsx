import React from "react";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { getCostosProyecto, type CostosProyecto } from "@/lib/costos";
import SeccionCostos from "./SeccionCostos";

vi.mock("@/lib/costos", async (original) => ({ ...await original<typeof import("@/lib/costos")>(), getCostosProyecto: vi.fn() }));

const proyecto = { id: 12 } as React.ComponentProps<typeof SeccionCostos>["proyecto"];
function datos(cambios: Partial<CostosProyecto> = {}): CostosProyecto {
  return {
    proyecto: { id: 12, titulo: "Acceso Torre", cotizacion: "AN-0012", cotizacionId: 3 },
    venta: 10000, costoReal: 4000, avance: 50, costoAlTerminar: 8000,
    rubros: [{ rubro: "MATERIAL", etiqueta: "Material", cotizado: 3000, real: 1000, diferencia: -2000, consumidoPct: 33.3,
      movimientos: [{ origen: "stock:8", fecha: "2026-11-17", actividadId: 44, cantidad: 2, unidad: "pieza", importe: 1000, nota: "Cable de salida" }] }],
    directo: { cotizado: 6000, real: 4000 }, indirecto: { pct: null, cotizado: null, real: null },
    margen: { cotizado: { importe: 4000, pct: 40 }, hoy: { importe: 6000, pct: 60 } },
    manoDeObra: { horas: 8, categorias: null }, acceso: { detalle: false },
    avisos: { sinCotizacion: false, sinVenta: false, partidasSinCosto: 0, partidas: 1, indirectoSinCapturar: false, sesionesSinSueldo: 0, sesionesRecortadas: 0, salidasSinCosto: 0, psSinValidar: false },
    ...cambios,
  };
}
beforeEach(() => vi.clearAllMocks());
describe("costeo de proyecto de solo lectura", () => {
  it("muestra estimación del servidor, diferencias y origen de cada rubro", async () => {
    vi.mocked(getCostosProyecto).mockResolvedValue(datos());
    render(<SeccionCostos proyecto={proyecto} token="jwt" />);
    const etiqueta = await screen.findByText("Costo al terminar");
    expect(etiqueta.parentElement).toHaveTextContent("$8,000");
    expect(screen.getByText("Costo real a la fecha").parentElement).toHaveTextContent("$4,000");
    const tabla = screen.getByRole("region", { name: "Cotizado contra real" });
    expect(within(tabla).getByText("Diferencia")).toBeInTheDocument();
    expect(within(tabla).getByText("33.3 %")).toBeInTheDocument();
    await userEvent.click(screen.getByText("Ver de dónde sale · Material"));
    expect(screen.getByText(/Cable de salida/)).toBeVisible();
    expect(screen.getByText(/Actividad #44/)).toBeVisible();
    expect(screen.queryByRole("button", { name: /guardar|recalcular/i })).not.toBeInTheDocument();
  });
  it("sin avance calculable no inventa costo al terminar", async () => {
    vi.mocked(getCostosProyecto).mockResolvedValue(datos({ costoAlTerminar: null, avance: null }));
    render(<SeccionCostos proyecto={proyecto} token="jwt" />);
    expect(await screen.findByText(/No se proyecta el costo al terminar/)).toBeInTheDocument();
    expect(screen.getByText("Costo al terminar").parentElement).toHaveTextContent("—");
  });
  it("permite reintentar una lectura fallida", async () => {
    vi.mocked(getCostosProyecto).mockRejectedValueOnce(new Error("Sin conexión")).mockResolvedValueOnce(datos());
    render(<SeccionCostos proyecto={proyecto} token="jwt" />);
    await userEvent.click(await screen.findByRole("button", { name: "Reintentar" }));
    expect(await screen.findByText("Costo real a la fecha")).toBeInTheDocument();
    expect(getCostosProyecto).toHaveBeenCalledTimes(2);
  });
  it("explica que el detalle de mano de obra está restringido sin decir que no hay costos", async () => {
    vi.mocked(getCostosProyecto).mockResolvedValue(datos({ rubros: [{ rubro: "MANO_OBRA", etiqueta: "Mano de obra", cotizado: 4000, real: 3000, movimientos: [] }] }));
    render(<SeccionCostos proyecto={proyecto} token="jwt" />);
    await userEvent.click(await screen.findByText("Ver de dónde sale · Mano de obra"));
    expect(screen.getByText("El detalle de mano de obra está disponible para dirección y contabilidad.")).toBeVisible();
    expect(screen.queryByText("Todavía no hay movimientos en este rubro.")).not.toBeInTheDocument();
  });
});
