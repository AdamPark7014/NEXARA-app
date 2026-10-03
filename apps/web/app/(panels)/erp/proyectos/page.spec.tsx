import React from "react";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import ProyectosPage from "./page";

/** La lista: qué toca en cada proyecto, y filtros que respondan a «¿qué va mal?». */

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: vi.fn(), push: vi.fn() }),
  usePathname: () => "/erp/proyectos",
  useSearchParams: () => new URLSearchParams(""),
}));

vi.mock("@/components/UserContext", () => ({
  useUser: () => ({ user: { id: 1, nombre: "Ada Lovelace" }, token: "jwt" }),
}));

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

function fila(id: number, title: string, cambios: Record<string, unknown> = {}) {
  return {
    id,
    title,
    status: "ACTIVE",
    projectType: "CONTROL_ACCESO",
    vendorId: 1,
    responsableId: 1,
    clientId: 10 + id,
    startDate: "2026-09-01T00:00:00.000Z",
    endDate: "2026-12-01T00:00:00.000Z",
    client: { id: 10 + id, name: `Cliente ${id}` },
    responsable: { id: 1, nombre: "Ada Lovelace" },
    documentosCount: 2,
    equipoCount: 3,
    hitosCount: 4,
    proximoHito: { id: 90 + id, name: "Instalación", plannedDate: "2027-01-15T00:00:00.000Z", status: "PENDIENTE" },
    resumen: {
      salud: "EN_TIEMPO",
      etiqueta: "En tiempo",
      enRiesgo: false,
      diasDeRetraso: 0,
      diasRestantes: 20,
      hitosVencidos: 0,
      motivo: "Quedan 20 días para el fin planeado.",
      avance: { total: 10, cerradas: 4, finalizadas: 4, abiertas: 6, porcentaje: 40, origen: "actividades" },
      requerimientos: { total: 0, cumplidos: 0, pendientes: 0, porcentaje: null },
      estadoEtiqueta: "En curso",
    },
    ...cambios,
  };
}

const FILAS = [
  fila(1, "Acceso corporativo Torre A"),
  fila(2, "CCTV bodega Cuautlancingo", {
    resumen: {
      ...fila(0, "").resumen,
      salud: "RETRASADO",
      etiqueta: "Retrasado",
      enRiesgo: true,
      diasDeRetraso: 5,
      diasRestantes: null,
    },
  }),
  fila(3, "Red de sucursales Sur", { status: "CANCELLED", resumen: { ...fila(0, "").resumen, salud: "CANCELADO", etiqueta: "Cancelado" } }),
];

describe("lista de proyectos", () => {
  it("pide todo una vez y esconde los cancelados en «Vigentes»", async () => {
    const fetchMock = vi.fn(async () => json(FILAS));
    vi.stubGlobal("fetch", fetchMock);
    render(<ProyectosPage />);

    expect(await screen.findByText("Acceso corporativo Torre A")).toBeInTheDocument();
    expect(String(fetchMock.mock.calls[0][0])).toContain("proyectos?incluirCancelados=1");
    expect(screen.getByText("CCTV bodega Cuautlancingo")).toBeInTheDocument();
    expect(screen.queryByText("Red de sucursales Sur")).not.toBeInTheDocument();
    // La fila dice qué sigue y cuánto va.
    const tarjeta = screen.getByText("Acceso corporativo Torre A").closest("tr")!;
    expect(within(tarjeta).getByRole("link", { name: "Acceso corporativo Torre A" })).toHaveAttribute("href", "/erp/proyectos/1");
    expect(within(tarjeta).getByText(/Sigue: Instalación/)).toBeInTheDocument();
    expect(within(tarjeta).getByText("40 %")).toBeInTheDocument();
    expect(within(tarjeta).getByText("según actividades")).toBeInTheDocument();
    expect(within(tarjeta).getByRole("progressbar", { name: "Avance" })).toHaveAttribute("aria-valuenow", "40");
  });

  it("«En riesgo» deja solo los que la API marcó en riesgo", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => json(FILAS)));
    const user = userEvent.setup();
    render(<ProyectosPage />);
    await screen.findByText("Acceso corporativo Torre A");

    // Los chips llevan su conteo: «En riesgo 1».
    await user.click(within(screen.getByRole("group", { name: "Filtrar por semáforo" })).getByRole("button", { name: /^En riesgo/ }));
    expect(screen.queryByText("Acceso corporativo Torre A")).not.toBeInTheDocument();
    expect(screen.getByText("CCTV bodega Cuautlancingo")).toBeInTheDocument();
    expect(screen.getByText("5 días de retraso")).toBeInTheDocument();
  });

  it("los cancelados aparecen al filtrar por ese estado", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => json(FILAS)));
    const user = userEvent.setup();
    render(<ProyectosPage />);
    await screen.findByText("Acceso corporativo Torre A");

    await user.click(within(screen.getByRole("group", { name: "Filtrar por estado" })).getByRole("button", { name: /^Cancelado/ }));
    expect(screen.getByText("Red de sucursales Sur")).toBeInTheDocument();
    expect(screen.queryByText("Acceso corporativo Torre A")).not.toBeInTheDocument();
  });

  it("si la API falla lo dice y deja reintentar", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => json({ message: "Tu rol (vendedor) no puede acceder a GET /api/proyectos" }, 403)));
    render(<ProyectosPage />);
    expect(await screen.findByRole("alert")).toHaveTextContent("Tu puesto no tiene permiso para hacer esto en proyectos.");
    expect(screen.getByRole("button", { name: "Reintentar" })).toBeInTheDocument();
  });
});

/** Servidor que distingue proyectos de clientes: la pestaña «Clientes de proyecto» pide el padrón. */
function servidor(proyectos: unknown[], clientes: unknown[]) {
  const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.includes("ventas/clientes")) return json(clientes);
    return json(proyectos);
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

const CLIENTES = [
  { id: 20, name: "Cliente 1", legalName: "Cliente Uno SA de CV", taxId: "CUN010101AB1", status: "Activo", serviceClientId: 11 },
  // Alta rápida desde una actividad: solo el nombre, sin datos fiscales y sin proyectos aún.
  { id: 21, name: "Hotel Centro", legalName: null, taxId: null, status: "Activo", serviceClientId: 14 },
];

describe("clientes de proyecto", () => {
  it("pide el padrón de proyecto y lo enseña en su pestaña, con lo que cada cliente tiene abierto", async () => {
    const fetchMock = servidor(FILAS, CLIENTES);
    const user = userEvent.setup();
    render(<ProyectosPage />);
    await screen.findByText("Acceso corporativo Torre A");

    expect(fetchMock.mock.calls.map((c) => String(c[0]))).toEqual(
      expect.arrayContaining([expect.stringContaining("ventas/clientes?sector=PROYECTO")]),
    );
    await user.click(screen.getByRole("tab", { name: /Clientes de proyecto/ }));

    const lista = screen.getByRole("list", { name: "Clientes de proyecto" });
    const uno = within(lista).getByText("Cliente 1").closest("li")!;
    expect(within(uno).getByText("1 vigente")).toBeInTheDocument();
    expect(within(uno).getByRole("link", { name: "Acceso corporativo Torre A" })).toHaveAttribute("href", "/erp/proyectos/1");
    expect(within(uno).getByRole("link", { name: "Nuevo proyecto" })).toHaveAttribute("href", "/erp/proyectos/nuevo?clienteId=20");

    const hotel = within(lista).getByText("Hotel Centro").closest("li")!;
    expect(within(hotel).getByText("Sin proyectos todavía")).toBeInTheDocument();
    expect(within(hotel).getByText("Alta rápida: faltan sus datos fiscales")).toBeInTheDocument();
    expect(within(hotel).getByRole("link", { name: "Nuevo proyecto" })).toHaveAttribute("href", "/erp/proyectos/nuevo?clienteId=21");
  });

  it("«Ver proyectos» de un cliente deja la lista filtrada por él", async () => {
    servidor(FILAS, CLIENTES);
    const user = userEvent.setup();
    render(<ProyectosPage />);
    await screen.findByText("Acceso corporativo Torre A");

    await user.click(screen.getByRole("tab", { name: /Clientes de proyecto/ }));
    const uno = screen.getByText("Cliente 1").closest("li")!;
    await user.click(within(uno).getByRole("button", { name: "Ver proyectos" }));

    expect(await screen.findByText("Acceso corporativo Torre A")).toBeInTheDocument();
    expect(screen.queryByText("CCTV bodega Cuautlancingo")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Quitar filtros" })).toBeInTheDocument();
  });

  it("sin proyectos pero con clientes de proyecto, el vacío lleva a ellos", async () => {
    servidor([], CLIENTES);
    const user = userEvent.setup();
    render(<ProyectosPage />);

    expect(await screen.findByText("Todavía no hay proyectos")).toBeInTheDocument();
    expect(screen.getByText(/Ya hay 2 clientes de proyecto en el padrón/)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Ver clientes de proyecto" }));
    expect(screen.getByRole("list", { name: "Clientes de proyecto" })).toBeInTheDocument();
    expect(screen.getAllByRole("link", { name: "Nuevo proyecto" })).toHaveLength(2);
  });

  it("si el padrón no se puede listar, la pantalla es la lista de siempre", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) =>
        String(input).includes("ventas/clientes") ? json({ message: "sin acceso" }, 403) : json(FILAS),
      ),
    );
    render(<ProyectosPage />);
    await screen.findByText("Acceso corporativo Torre A");
    expect(screen.queryByRole("tab", { name: /Clientes de proyecto/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });
});
