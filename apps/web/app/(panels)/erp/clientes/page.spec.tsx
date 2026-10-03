import React from "react";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import ClientesHubPage from "./page";

/** El padrón: se lee de un vistazo, se filtra por texto y estado, y un fallo al refrescar no borra la lista. */

const replace = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace, push: vi.fn() }),
  usePathname: () => "/erp/clientes",
}));

vi.mock("@/components/UserContext", () => ({
  useUser: () => ({ user: { id: 1, email: "ventas@nexara.test" }, token: "jwt" }),
}));

vi.mock("@/lib/platform-accounts", () => ({ isCeoEquivalentEmail: () => false }));

vi.mock("@/lib/client-sectors", async (importOriginal) => {
  const real = await importOriginal<typeof import("@/lib/client-sectors")>();
  return {
    ...real,
    clientSectorsForEmail: () => ["PROYECTO", "COMERCIAL"],
    clientSectorsForUser: () => ["PROYECTO", "COMERCIAL"],
    canSeeClientesModule: () => true,
    canAccessClientPadron: () => true,
  };
});

const listSalesClients = vi.fn();
vi.mock("@/lib/sales-api", async (importOriginal) => {
  const real = await importOriginal<typeof import("@/lib/sales-api")>();
  return {
    ...real,
    listSalesClients: (...args: unknown[]) => listSalesClients(...args),
    getClientPermissions: async () => ({ puedeAgregar: true, puedeEditar: true, puedeDesactivar: false, puedeEliminar: false }),
  };
});

const FILAS = [
  {
    id: 1,
    name: "Plaza Norte",
    legalName: "Plaza Norte SA de CV",
    taxId: "PNO010101AB1",
    status: "Activo",
    sectors: [{ id: 11, sector: "PROYECTO" }],
  },
  {
    id: 2,
    name: "Hotel Centro",
    legalName: null,
    taxId: null,
    status: "Inactivo",
    sectors: [
      { id: 21, sector: "PROYECTO" },
      { id: 22, sector: "COMERCIAL" },
    ],
  },
];

beforeEach(() => {
  listSalesClients.mockReset();
  replace.mockReset();
});

describe("lista de clientes", () => {
  it("cada fila lleva a la ficha y dice su estado en palabras", async () => {
    listSalesClients.mockResolvedValue(FILAS);
    render(<ClientesHubPage />);

    const fila = (await screen.findByText("Plaza Norte")).closest("tr")!;
    expect(listSalesClients).toHaveBeenCalledWith("jwt", { sector: "PROYECTO" });
    expect(within(fila).getByRole("link", { name: "Plaza Norte" })).toHaveAttribute("href", "/erp/clientes/1");
    expect(within(fila).getByText("PNO010101AB1")).toBeInTheDocument();
    expect(within(fila).getByText("Activo")).toBeInTheDocument();

    const otra = screen.getByText("Hotel Centro").closest("tr")!;
    expect(within(otra).getByText("Sin RFC")).toBeInTheDocument();
    expect(within(otra).getByText("Inactivo")).toBeInTheDocument();
    expect(within(otra).getByText("Comercial")).toBeInTheDocument();
  });

  it("busca por RFC y filtra por estado, con conteos", async () => {
    listSalesClients.mockResolvedValue(FILAS);
    const user = userEvent.setup();
    render(<ClientesHubPage />);
    await screen.findByText("Plaza Norte");

    await user.click(within(screen.getByRole("group", { name: "Filtrar por estado" })).getByRole("button", { name: /Inactivos/ }));
    expect(screen.queryByText("Plaza Norte")).not.toBeInTheDocument();
    expect(screen.getByText("Hotel Centro")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Quitar filtros" }));
    await user.type(screen.getByLabelText("Buscar clientes"), "pno0101");
    expect(await screen.findByText("Plaza Norte")).toBeInTheDocument();
    expect(screen.queryByText("Hotel Centro")).not.toBeInTheDocument();
  });

  it("cambiar de sector pide ese sector y actualiza la dirección", async () => {
    listSalesClients.mockResolvedValue(FILAS);
    const user = userEvent.setup();
    render(<ClientesHubPage />);
    await screen.findByText("Plaza Norte");

    listSalesClients.mockResolvedValue([]);
    await user.click(screen.getByRole("tab", { name: /Comercial/ }));
    expect(replace).toHaveBeenCalledWith("/erp/clientes?sector=comercial", { scroll: false });
    expect(await screen.findByText("Aún no hay clientes comerciales")).toBeInTheDocument();
    expect(listSalesClients).toHaveBeenLastCalledWith("jwt", { sector: "COMERCIAL" });
  });

  it("si falla al cargar lo dice y deja reintentar", async () => {
    listSalesClients.mockRejectedValue(new Error(JSON.stringify({ message: "Servicio no disponible" })));
    render(<ClientesHubPage />);
    expect(await screen.findByRole("alert")).toHaveTextContent("Servicio no disponible");
    expect(screen.getByRole("button", { name: "Reintentar" })).toBeInTheDocument();
  });
});
