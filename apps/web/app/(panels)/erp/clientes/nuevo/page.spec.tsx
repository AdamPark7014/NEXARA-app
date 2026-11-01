import React from "react";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ClienteParecido } from "@/lib/sales-api";

const push = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push, replace: vi.fn(), back: vi.fn() }),
  usePathname: () => "/erp/clientes/nuevo",
  useSearchParams: () => new URLSearchParams(),
}));
// El mismo objeto en cada render, como el contexto real: el formulario depende de su identidad.
const SESION = vi.hoisted(() => ({ token: "jwt", user: { id: 15, email: "daniela.hernandez@nexara.com.mx", roleKey: "administrativo" } }));
vi.mock("@/components/UserContext", () => ({ useUser: () => SESION }));

const createSalesClient = vi.fn();
const buscarClientesParecidos = vi.fn();
vi.mock("@/lib/sales-api", async (original) => ({
  ...(await original<typeof import("@/lib/sales-api")>()),
  createSalesClient: (...a: unknown[]) => createSalesClient(...a),
  buscarClientesParecidos: (...a: unknown[]) => buscarClientesParecidos(...a),
  getClientPermissions: async () => ({ puedeAgregar: true, puedeEditar: true }),
}));

import NuevoClientePage from "./page";

const BUAP: ClienteParecido = {
  id: 17,
  nombre: "BUAP",
  razonSocial: null,
  tipos: ["COMERCIAL"],
  porque: "Son las siglas de ese nombre",
  confianza: "alta",
  origen: "codigo",
  puedeUsar: true,
  serviceClientId: 34,
};

const guardar = () => screen.getAllByRole("button", { name: /Crear cliente/ })[0];

beforeEach(() => {
  push.mockReset();
  createSalesClient.mockReset().mockResolvedValue({ id: 99, name: "x" });
  buscarClientesParecidos.mockReset().mockResolvedValue([]);
});

describe("Nuevo cliente: ¿ya existe?", () => {
  it("al salir del nombre avisa, sin gastar IA", async () => {
    buscarClientesParecidos.mockResolvedValue([BUAP]);
    render(<NuevoClientePage />);
    const usuario = userEvent.setup();
    await usuario.type(await screen.findByLabelText(/Nombre comercial/), "Benemérita Universidad Autónoma de Puebla");
    await usuario.tab();
    expect(await screen.findByText("¿Ya existe este cliente?")).toBeInTheDocument();
    expect(buscarClientesParecidos.mock.calls[0][1]).toMatchObject({ soloCodigo: true, nombre: "Benemérita Universidad Autónoma de Puebla" });
  });

  it("si se parece no lo crea; «Usar» lleva a su ficha", async () => {
    buscarClientesParecidos.mockResolvedValue([BUAP]);
    render(<NuevoClientePage />);
    const usuario = userEvent.setup();
    await usuario.type(await screen.findByLabelText(/Nombre comercial/), "Benemérita");
    await usuario.click(guardar());
    expect(await screen.findByRole("button", { name: "Usar BUAP" })).toBeInTheDocument();
    expect(createSalesClient).not.toHaveBeenCalled();
    await usuario.click(screen.getByRole("button", { name: "Usar BUAP" }));
    expect(push).toHaveBeenCalledWith("/erp/clientes/17");
  });

  it("«Crear otro de todos modos» lo crea con la confirmación", async () => {
    buscarClientesParecidos.mockResolvedValue([BUAP]);
    render(<NuevoClientePage />);
    const usuario = userEvent.setup();
    await usuario.type(await screen.findByLabelText(/Nombre comercial/), "BUAP Deportes");
    await usuario.click(guardar());
    await usuario.click(await screen.findByRole("button", { name: "Crear otro de todos modos" }));
    await waitFor(() => expect(createSalesClient).toHaveBeenCalledTimes(1));
    expect(createSalesClient.mock.calls[0][1]).toMatchObject({ name: "BUAP Deportes", confirmarNuevo: true });
  });

  it("sin parecidos se crea de una vez, y al guardar la revisión lleva IA", async () => {
    render(<NuevoClientePage />);
    const usuario = userEvent.setup();
    await usuario.type(await screen.findByLabelText(/Nombre comercial/), "Toks");
    await usuario.click(guardar());
    await waitFor(() => expect(createSalesClient).toHaveBeenCalledTimes(1));
    expect(createSalesClient.mock.calls[0][1].confirmarNuevo).toBeUndefined();
    expect(buscarClientesParecidos.mock.calls.at(-1)![1].soloCodigo).toBe(false);
    expect(push).toHaveBeenCalledWith("/erp/clientes/99");
  });
});
