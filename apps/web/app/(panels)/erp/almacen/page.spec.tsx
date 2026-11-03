import React from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import AlmacenPage from "./page";

/**
 * La portada de almacén: pestañas propias (incluye Escáner) en vez de reexportar
 * entera la pantalla vieja. Aquí se prueba el enrutado de pestañas; lo que pinta
 * cada una tiene su propia prueba (y la de stock es la pantalla de almacén de siempre).
 */

/** La portada lee `?tab=` de `window.location` al montar. */
function ponerUrl(query: string) {
  window.history.replaceState(null, "", `/erp/almacen${query ? `?${query}` : ""}`);
}

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: vi.fn(), push: vi.fn() }),
  usePathname: () => "/erp/almacen",
}));

vi.mock("@/components/UserContext", () => ({
  useUser: () => ({
    user: { id: 1, nombre: "Ada Lovelace", token: "jwt", permissions: ["tools.manage"] },
  }),
}));

vi.mock("../warehouse/VistaAlmacen", () => ({
  VistaAlmacen: ({ embedded }: { embedded?: { views: readonly string[]; vista?: string; busqueda?: string } }) => (
    <div data-testid="almacen-stock" data-vista={embedded?.vista} data-busqueda={embedded?.busqueda}>
      {(embedded?.views ?? []).join(",")}
    </div>
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
vi.mock("@/components/almacen/ScannerAlmacenPanel", () => ({
  default: () => <div data-testid="panel-scanner" />,
}));
vi.mock("@/components/almacen/HerramientasPorEtiquetaPanel", () => ({
  default: () => <div data-testid="panel-etiquetas" />,
}));
vi.mock("@/components/ToolInventoryPanel", () => ({
  default: () => <div data-testid="tool-inventory" />,
}));
vi.mock("@/components/ToolRequestsTable", () => ({ default: () => <div data-testid="tool-requests" /> }));
vi.mock("@/components/ToolRequestForm", () => ({ default: () => <div data-testid="tool-form" /> }));
vi.mock("@/components/ToolUserKitPanel", () => ({ default: () => <div data-testid="kits-equipo" /> }));
vi.mock("@/components/ToolMyKitPanel", () => ({ default: () => <div data-testid="mi-kit" /> }));
vi.mock("@/components/almacen/BusquedaRapidaInventario", () => ({
  default: ({
    tipoInicial,
    autoFocus,
    tablaDebajo,
    onTexto,
  }: {
    tipoInicial?: string;
    autoFocus?: boolean;
    tablaDebajo?: boolean;
    onTexto?: (texto: string) => void;
  }) => (
    <div
      data-testid="busqueda-rapida"
      data-tipo={tipoInicial}
      data-foco={autoFocus ? "si" : "no"}
      data-tabla={tablaDebajo ? "si" : "no"}
    >
      <input aria-label="Caja de búsqueda" onChange={(e) => onTexto?.(e.target.value)} />
    </div>
  ),
}));

describe("portada de almacén", () => {
  it("enseña una sola fila con todas las pestañas (incluye Escáner)", () => {
    ponerUrl("");
    render(<AlmacenPage />);
    const pestanas = screen.getAllByRole("tab").map((t) => t.textContent);
    expect(pestanas).toEqual([
      "Inventario",
      "Resumen",
      "Movimientos",
      "Lotes y caducidad",
      "Valuación",
      "Conteos y reservas",
      "Escáner",
      "Reabastecimiento",
      "Herramientas",
      "Kits",
    ]);
  });

  it("abre en inventario y monta ahí las vistas de stock", () => {
    ponerUrl("");
    render(<AlmacenPage />);
    const vista = screen.getByTestId("almacen-stock");
    expect(vista.textContent).toBe("inventario,dashboard,movimientos,lotes,valuacion,conteos");
    expect(vista).toHaveAttribute("data-vista", "inventario");
  });

  it("cada pestaña de stock manda en la misma vista de almacén", async () => {
    ponerUrl("");
    render(<AlmacenPage />);
    await userEvent.click(screen.getByRole("tab", { name: "Movimientos" }));
    expect(screen.getByTestId("almacen-stock")).toHaveAttribute("data-vista", "movimientos");
    await userEvent.click(screen.getByRole("tab", { name: "Lotes y caducidad" }));
    expect(screen.getByTestId("almacen-stock")).toHaveAttribute("data-vista", "lotes");
  });

  it("un enlace con ?tab=valuacion cae en esa pestaña", () => {
    ponerUrl("tab=valuacion");
    render(<AlmacenPage />);
    expect(screen.getByTestId("almacen-stock")).toHaveAttribute("data-vista", "valuacion");
  });

  it("lo que se escribe en el buscador de arriba llega a la tabla de inventario", async () => {
    ponerUrl("");
    render(<AlmacenPage />);
    await userEvent.type(screen.getByRole("textbox", { name: "Caja de búsqueda" }), "cincho");
    expect(screen.getByTestId("almacen-stock")).toHaveAttribute("data-busqueda", "cincho");
  });

  it("fuera de las pestañas de stock no monta la vista de almacén", async () => {
    ponerUrl("");
    render(<AlmacenPage />);
    await userEvent.click(screen.getByRole("tab", { name: "Herramientas" }));
    expect(screen.queryByTestId("almacen-stock")).not.toBeInTheDocument();
  });

  it("escáner monta el panel HID", async () => {
    ponerUrl("");
    render(<AlmacenPage />);
    await userEvent.click(screen.getByRole("tab", { name: "Escáner" }));
    expect(screen.getByTestId("panel-scanner")).toBeInTheDocument();
  });

  it("un aviso con ?tab=reabastecimiento cae en esa pestaña", () => {
    ponerUrl("tab=reabastecimiento&productId=3");
    render(<AlmacenPage />);
    expect(screen.getByTestId("panel-reabastecimiento")).toBeInTheDocument();
  });

  it("herramientas enseña el mostrador y las solicitudes a quien administra", async () => {
    ponerUrl("");
    render(<AlmacenPage />);
    await userEvent.click(screen.getByRole("tab", { name: "Herramientas" }));
    expect(screen.getByTestId("panel-recoleccion")).toBeInTheDocument();
    expect(screen.getByTestId("tool-requests")).toBeInTheDocument();
  });

  it("kits enseña las revisiones y los kits del equipo", async () => {
    ponerUrl("");
    render(<AlmacenPage />);
    await userEvent.click(screen.getByRole("tab", { name: "Kits" }));
    expect(screen.getByTestId("panel-inspecciones")).toBeInTheDocument();
    expect(screen.getByTestId("kits-equipo")).toBeInTheDocument();
  });

  it("una pestaña que no existe no rompe la portada", () => {
    ponerUrl("tab=inventado");
    render(<AlmacenPage />);
    expect(screen.getByTestId("almacen-stock")).toBeInTheDocument();
  });

  it("la búsqueda rápida va arriba con todos los tipos, y en Escáner no estorba al lector", async () => {
    ponerUrl("");
    render(<AlmacenPage />);
    const busqueda = screen.getByTestId("busqueda-rapida");
    expect(busqueda).toHaveAttribute("data-tipo", "TODOS");
    expect(busqueda).toHaveAttribute("data-foco", "si");

    await userEvent.click(screen.getByRole("tab", { name: "Herramientas" }));
    expect(screen.getByTestId("busqueda-rapida")).toHaveAttribute("data-foco", "no");

    await userEvent.click(screen.getByRole("tab", { name: "Escáner" }));
    expect(screen.queryByTestId("busqueda-rapida")).not.toBeInTheDocument();
  });
});
