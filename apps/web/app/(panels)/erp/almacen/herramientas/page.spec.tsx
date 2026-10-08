import React from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import ToolsPage from "./page";

/**
 * Herramientas en Core: la búsqueda rápida va arriba (tipo Herramienta) y un resultado
 * abre el inventario ya filtrado a esa herramienta. Lo que pinta cada panel tiene su prueba.
 */

function ponerUrl(query: string) {
  window.history.replaceState(null, "", `/erp/almacen/herramientas${query ? `?${query}` : ""}`);
}

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: vi.fn(), push: vi.fn() }),
  usePathname: () => "/erp/almacen/herramientas",
}));

vi.mock("@/components/UserContext", () => ({
  useUser: () => ({ user: { id: 1, nombre: "Christian", token: "jwt", permissions: ["tools.manage"] } }),
}));

vi.mock("@/lib/section-views", () => ({
  getOpsTeamSectionConfig: () => ({
    title: "Herramientas",
    subtitle: "Préstamos e inventario",
    viewMode: "manage",
    canApprove: true,
    canCreate: false,
  }),
}));

vi.mock("@/components/ToolInventoryPanel", () => ({
  default: ({ busquedaInicial, abrirAlta }: { busquedaInicial?: string; abrirAlta?: boolean }) => (
    <div data-testid="tool-inventory" data-busqueda={busquedaInicial ?? ""} data-alta={abrirAlta ? "si" : "no"} />
  ),
}));
vi.mock("@/components/ToolRequestsTable", () => ({ default: () => <div data-testid="tool-requests" /> }));
vi.mock("@/components/ToolRenewalsTable", () => ({ default: () => <div data-testid="tool-renewals" /> }));
vi.mock("@/components/ToolRequestForm", () => ({ default: () => <div data-testid="tool-form" /> }));
vi.mock("@/components/ToolUserKitPanel", () => ({ default: () => <div data-testid="kits-equipo" /> }));
vi.mock("@/components/ToolMyKitPanel", () => ({ default: () => <div data-testid="mi-kit" /> }));
vi.mock("@/components/almacen/HerramientasPorEtiquetaPanel", () => ({ default: () => <div data-testid="panel-etiquetas" /> }));

const TALADRO = { origen: "herramienta", id: 7, nombre: "Taladro DeWalt", href: "/erp/almacen/herramientas?herramienta=7" };

vi.mock("@/components/almacen/BusquedaRapidaInventario", () => ({
  default: ({
    tipoInicial,
    autoFocus,
    onAbrir,
  }: {
    tipoInicial?: string;
    autoFocus?: boolean;
    onAbrir?: (r: unknown, href: string) => boolean | void;
  }) => (
    <div data-testid="busqueda-rapida" data-tipo={tipoInicial} data-foco={autoFocus ? "si" : "no"}>
      <button type="button" onClick={() => onAbrir?.(TALADRO, `${TALADRO.href}&q=Taladro+DeWalt`)}>
        Abrir taladro
      </button>
    </div>
  ),
}));

describe("herramientas en Core", () => {
  it("la búsqueda rápida va arriba, con Herramientas por omisión", () => {
    ponerUrl("");
    render(<ToolsPage />);
    expect(screen.getByTestId("busqueda-rapida")).toHaveAttribute("data-tipo", "HERRAMIENTA");
  });

  it("en préstamos no toma el foco (ahí el lector de etiquetas escucha toda la pantalla)", async () => {
    ponerUrl("");
    render(<ToolsPage />);
    await userEvent.click(screen.getByRole("tab", { name: "Préstamos" }));
    expect(screen.getByTestId("busqueda-rapida")).toHaveAttribute("data-foco", "no");
  });

  it("un resultado abre el inventario filtrado a esa herramienta", async () => {
    ponerUrl("");
    render(<ToolsPage />);
    await userEvent.click(screen.getByRole("tab", { name: "Renovaciones" }));
    await userEvent.click(screen.getByRole("button", { name: "Abrir taladro" }));
    expect(screen.getByTestId("tool-inventory")).toHaveAttribute("data-busqueda", "Taladro DeWalt");
    expect(window.location.search).toContain("herramienta=7");
  });

  it("desde otra pantalla, ?herramienta=&q= cae en el inventario con la búsqueda puesta", () => {
    ponerUrl("herramienta=7&q=Taladro+DeWalt");
    render(<ToolsPage />);
    expect(screen.getByTestId("tool-inventory")).toHaveAttribute("data-busqueda", "Taladro DeWalt");
  });

  it("?nueva=1 abre el inventario con el alta desplegada", () => {
    ponerUrl("nueva=1");
    render(<ToolsPage />);
    expect(screen.getByTestId("tool-inventory")).toHaveAttribute("data-alta", "si");
  });
});
