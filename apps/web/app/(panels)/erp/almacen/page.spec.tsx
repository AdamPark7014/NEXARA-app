import React from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import AlmacenPage from "./page";

/**
 * La portada de almacén: cinco pestañas propias en vez de reexportar entera la pantalla
 * vieja. Aquí se prueba el enrutado de pestañas; lo que pinta cada una tiene su propia
 * prueba (y la de stock es la pantalla de almacén de siempre).
 */

let searchParams = new URLSearchParams("");

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: vi.fn(), push: vi.fn() }),
  usePathname: () => "/erp/almacen",
  useSearchParams: () => searchParams,
}));

vi.mock("@/components/UserContext", () => ({
  useUser: () => ({
    user: { id: 1, nombre: "Ada Lovelace", token: "jwt", permissions: ["tools.manage"] },
  }),
}));

vi.mock("../warehouse/VistaAlmacen", () => ({
  VistaAlmacen: ({ embedded }: { embedded?: { views: readonly string[] } }) => (
    <div data-testid="almacen-stock">{(embedded?.views ?? []).join(",")}</div>
  ),
}));

vi.mock("@/components/almacen/ReabastecimientoPanel", () => ({
  default: () => <div data-testid="panel-reabastecimiento" />,
}));
vi.mock("@/components/almacen/RecoleccionAlmacenPanel", () => ({
  default: () => <div data-testid="panel-recoleccion" />,
}));
vi.mock("@/components/almacen/KitInspeccionesPanel", () => ({
  default: () => <div data-testid="panel-inspecciones" />,
}));
vi.mock("@/components/ToolRequestsTable", () => ({ default: () => <div data-testid="tool-requests" /> }));
vi.mock("@/components/ToolRequestForm", () => ({ default: () => <div data-testid="tool-form" /> }));
vi.mock("@/components/ToolUserKitPanel", () => ({ default: () => <div data-testid="kits-equipo" /> }));
vi.mock("@/components/ToolMyKitPanel", () => ({ default: () => <div data-testid="mi-kit" /> }));

describe("portada de almacén", () => {
  it("enseña las cinco pestañas del frente", () => {
    searchParams = new URLSearchParams("");
    render(<AlmacenPage />);
    const pestanas = screen.getAllByRole("tab").map((t) => t.textContent);
    expect(pestanas).toEqual([
      "Inventario",
      "Movimientos",
      "Reabastecimiento",
      "Herramientas",
      "Kits",
    ]);
  });

  it("abre en inventario y monta ahí las vistas de stock", () => {
    searchParams = new URLSearchParams("");
    render(<AlmacenPage />);
    expect(screen.getByTestId("almacen-stock").textContent).toBe(
      "inventario,dashboard,lotes,valuacion,conteos",
    );
  });

  it("movimientos monta la pantalla de almacén con una sola vista", async () => {
    searchParams = new URLSearchParams("");
    render(<AlmacenPage />);
    await userEvent.click(screen.getByRole("tab", { name: "Movimientos" }));
    expect(screen.getByTestId("almacen-stock").textContent).toBe("movimientos");
  });

  it("un aviso con ?tab=reabastecimiento cae en esa pestaña", () => {
    searchParams = new URLSearchParams("tab=reabastecimiento&productId=3");
    render(<AlmacenPage />);
    expect(screen.getByTestId("panel-reabastecimiento")).toBeInTheDocument();
  });

  it("herramientas enseña el mostrador y las solicitudes a quien administra", async () => {
    searchParams = new URLSearchParams("");
    render(<AlmacenPage />);
    await userEvent.click(screen.getByRole("tab", { name: "Herramientas" }));
    expect(screen.getByTestId("panel-recoleccion")).toBeInTheDocument();
    expect(screen.getByTestId("tool-requests")).toBeInTheDocument();
  });

  it("kits enseña las revisiones y los kits del equipo", async () => {
    searchParams = new URLSearchParams("");
    render(<AlmacenPage />);
    await userEvent.click(screen.getByRole("tab", { name: "Kits" }));
    expect(screen.getByTestId("panel-inspecciones")).toBeInTheDocument();
    expect(screen.getByTestId("kits-equipo")).toBeInTheDocument();
  });

  it("una pestaña que no existe no rompe la portada", () => {
    searchParams = new URLSearchParams("tab=inventado");
    render(<AlmacenPage />);
    expect(screen.getByTestId("almacen-stock")).toBeInTheDocument();
  });
});
