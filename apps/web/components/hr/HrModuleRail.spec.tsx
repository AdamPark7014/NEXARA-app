import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import HrModuleRail from "./HrModuleRail";

const { sesion } = vi.hoisted(() => ({
  sesion: { user: { id: 2, roleKey: "rh", nombre: "Persona Demo" } as Record<string, unknown> | null },
}));
vi.mock("@/components/UserContext", () => ({ useUser: () => sesion }));
vi.mock("next/navigation", () => ({ usePathname: () => "/erp/hr" }));

/**
 * Las pestañas de Recursos Humanos enseñaban las seis secciones a todos. Coordinación
 * Administrativa veía «Bitácora de incidencias» y «Prenómina», entraba y la página le negaba el
 * paso. Una pestaña solo aparece si la guarda de ruta deja abrirla (la misma función decide).
 */
describe("pestañas de Recursos Humanos", () => {
  const pestañas = () => screen.queryAllByRole("link").map((a) => a.textContent);

  beforeEach(() => {
    sesion.user = { id: 2, roleKey: "rh", nombre: "Persona Demo" };
  });

  it("Recursos Humanos ve las seis", () => {
    render(<HrModuleRail />);

    expect(pestañas()).toEqual([
      "Plantilla",
      "Organigrama",
      "Indicadores",
      "Multas y sanciones",
      "Bitácora de incidencias",
      "Prenómina",
    ]);
  });

  it("Coordinación Administrativa no ve las dos secciones que no puede abrir", () => {
    sesion.user = { id: 3, roleKey: "coord_admin", nombre: "Persona Demo" };

    render(<HrModuleRail />);

    expect(pestañas()).toEqual(["Plantilla", "Organigrama", "Indicadores", "Multas y sanciones"]);
  });

  it("marca la sección en la que se está", () => {
    render(<HrModuleRail />);

    expect(screen.getByRole("link", { name: "Plantilla" })).toHaveAttribute("aria-current", "page");
  });

  it("quien solo puede abrir una sección no ve una fila con una sola pestaña", () => {
    // Coordinación de Operaciones llega al organigrama; el resto de RH no es suyo.
    sesion.user = { id: 4, roleKey: "coord_operaciones", nombre: "Persona Demo" };

    render(<HrModuleRail />);

    expect(screen.queryByRole("navigation")).toBeNull();
  });

  it("sin sesión cargada no pinta pestañas", () => {
    sesion.user = null;

    render(<HrModuleRail />);

    expect(screen.queryByRole("navigation")).toBeNull();
  });
});
