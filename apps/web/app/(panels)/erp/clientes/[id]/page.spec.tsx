import React from "react";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import ClienteDetallePage from "./page";

/**
 * La ficha del cliente es donde se lleva el control de sus proyectos y de sus tipos:
 * un cliente puede ser comercial, de proyecto y corporativo a la vez, y desde aquí se le
 * abre un proyecto aunque todavía no sea «de proyecto».
 */

// Un solo router y unos solos params: la página los tiene como dependencias de su carga.
vi.mock("next/navigation", () => {
  const router = { replace: vi.fn(), push: vi.fn() };
  const params = { id: "5" };
  return {
    useRouter: () => router,
    useParams: () => params,
    usePathname: () => "/erp/clientes/5",
  };
});

// David: coordinador de operaciones, con Proyecto y Comercial en su área. El mismo objeto en
// cada render: la página recarga cuando cambia `user`, y uno nuevo por render la pondría en bucle.
vi.mock("@/components/UserContext", () => {
  const sesion = {
    user: { id: 10, nombre: "David Morales", email: "operaciones@nexara.com.mx", roleKey: "coord_operaciones" },
    token: "jwt",
  };
  return { useUser: () => sesion };
});

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

type Llamada = { url: string; method: string; body: any };

const RESUMEN = {
  salud: "EN_TIEMPO",
  etiqueta: "En tiempo",
  enRiesgo: false,
  diasDeRetraso: 0,
  diasRestantes: 20,
  hitosVencidos: 0,
  motivo: "",
  avance: { total: 10, cerradas: 4, finalizadas: 4, abiertas: 6, porcentaje: 40, origen: "actividades" },
  requerimientos: { total: 0, cumplidos: 0, pendientes: 0, porcentaje: null },
  estadoEtiqueta: "En curso",
};

const PROYECTOS = [
  {
    id: 7,
    title: "CCTV Plaza Dorada",
    status: "ACTIVE",
    clientId: 80,
    vendorId: 10,
    startDate: "2026-09-01T00:00:00.000Z",
    endDate: "2026-11-30T00:00:00.000Z",
    responsable: { id: 10, nombre: "David Morales" },
    resumen: RESUMEN,
  },
  {
    id: 8,
    title: "Control de acceso oficinas",
    status: "COMPLETED",
    clientId: 80,
    vendorId: 10,
    startDate: "2026-05-01T00:00:00.000Z",
    endDate: null,
    resumen: { ...RESUMEN, avance: { ...RESUMEN.avance, porcentaje: null } },
  },
];

function cliente(cambios: Record<string, unknown> = {}) {
  return {
    id: 5,
    name: "Plaza Dorada",
    legalName: "Plaza Dorada SA de CV",
    taxId: "PDO010101AB1",
    status: "Activo",
    serviceClientId: 80,
    tipo: "PROYECTO",
    sectors: [
      { id: 1, sector: "PROYECTO" },
      { id: 2, sector: "COMERCIAL" },
    ],
    ...cambios,
  };
}

function servidor(opts: { cliente?: Record<string, unknown>; proyectos?: unknown[] } = {}) {
  const llamadas: Llamada[] = [];
  let actual = cliente(opts.cliente);
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const l: Llamada = {
        url: String(input),
        method: (init?.method ?? "GET").toUpperCase(),
        body: typeof init?.body === "string" ? JSON.parse(init.body) : null,
      };
      llamadas.push(l);
      if (l.url.includes("ventas/clientes/permisos")) {
        return json({ puedeAgregar: true, puedeEditar: true, puedeDesactivar: false, puedeEliminar: false });
      }
      if (l.method === "DELETE" && l.url.includes("ventas/clientes/5/sectors/COMERCIAL")) {
        actual = { ...actual, sectors: [{ id: 1, sector: "PROYECTO" }] };
        return json(actual);
      }
      if (l.method === "POST" && l.url.includes("operational-projects/alta-rapida")) {
        return json({ id: 9, title: l.body.title, status: "ACTIVE", client: { id: 80, name: "Plaza Dorada" } });
      }
      if (/\/proyectos\?/.test(l.url)) return json(opts.proyectos ?? PROYECTOS);
      if (l.url.includes("ventas/clientes/5")) return json(actual);
      return json({ message: `no esperado: ${l.method} ${l.url}` }, 500);
    }),
  );
  return llamadas;
}

beforeEach(() => {
  vi.unstubAllGlobals();
});

describe("ficha del cliente · proyectos", () => {
  it("lista sus proyectos con estado y fechas, y cada uno abre el proyecto", async () => {
    const llamadas = servidor();
    render(<ClienteDetallePage />);

    const enlace = await screen.findByRole("link", { name: "CCTV Plaza Dorada" });
    expect(enlace).toHaveAttribute("href", "/erp/proyectos/7");
    // Los proyectos se piden al servidor ya filtrados por el cliente de operación.
    const pedido = llamadas.find((l) => /\/proyectos\?/.test(l.url))!;
    expect(pedido.url).toContain("clientId=80");
    expect(pedido.url).toContain("incluirCancelados=1");

    const fila = enlace.closest("li")!;
    expect(within(fila).getByText("En curso")).toBeInTheDocument();
    expect(within(fila).getByText(/1 sept? 2026 → 30 nov 2026/)).toBeInTheDocument();
    expect(within(fila).getByText("40 % de avance")).toBeInTheDocument();

    const terminado = screen.getByRole("link", { name: "Control de acceso oficinas" }).closest("li")!;
    expect(within(terminado).getByText("Terminado")).toBeInTheDocument();
    expect(within(terminado).getByText(/^Inicio 1 may 2026$/)).toBeInTheDocument();

    expect(screen.getByRole("heading", { name: "Proyectos · 2" })).toBeInTheDocument();
    expect(screen.getByText(/^1 vigente\./)).toBeInTheDocument();
    // El alta con plan completo arranca con este cliente ya elegido.
    expect(screen.getByRole("link", { name: /Nuevo proyecto con plan/ })).toHaveAttribute(
      "href",
      "/erp/proyectos/nuevo?clienteId=5",
    );
  });

  it("arranca un proyecto desde la ficha con el cliente del padrón, no con el de operación", async () => {
    const llamadas = servidor({ proyectos: [] });
    const user = userEvent.setup();
    render(<ClienteDetallePage />);

    await screen.findByText("Sin proyectos todavía");
    await user.type(screen.getByLabelText("Nuevo proyecto"), "Red de sucursales");
    await user.click(screen.getByRole("button", { name: /Crear proyecto/ }));

    await waitFor(() => expect(llamadas.some((l) => l.url.includes("alta-rapida"))).toBe(true));
    const alta = llamadas.find((l) => l.url.includes("alta-rapida"))!;
    expect(alta.method).toBe("POST");
    expect(alta.body).toMatchObject({ title: "Red de sucursales", salesClientId: 5 });
    expect(alta.body.startDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    // Ya no se usa el POST que exige gestión de actividades ni el id del cliente de operación.
    expect(llamadas.some((l) => l.method === "POST" && /operational-projects$/.test(l.url))).toBe(false);
  });

  it("un cliente solo comercial también puede recibir su primer proyecto", async () => {
    servidor({
      cliente: { tipo: "COMERCIAL", sectors: [{ id: 2, sector: "COMERCIAL" }], serviceClientId: null },
      proyectos: [],
    });
    render(<ClienteDetallePage />);

    expect(await screen.findByRole("heading", { name: "Proyectos" })).toBeInTheDocument();
    expect(screen.getByText("Sin proyectos todavía")).toBeInTheDocument();
    expect(screen.getByLabelText("Nuevo proyecto")).toBeInTheDocument();
    // Antes la sección ni aparecía, o avisaba que no se le podían crear proyectos.
    expect(screen.queryByText(/no está enlazado con operaciones/)).not.toBeInTheDocument();
  });
});

describe("ficha del cliente · varios tipos", () => {
  it("muestra todos sus sectores y deja quitar uno mientras conserve otro", async () => {
    const llamadas = servidor();
    const user = userEvent.setup();
    render(<ClienteDetallePage />);
    await screen.findByRole("link", { name: "CCTV Plaza Dorada" });

    expect(screen.getByRole("button", { name: "Quitar de Proyecto" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Quitar de Comercial" }));

    await waitFor(() => expect(llamadas.some((l) => l.method === "DELETE")).toBe(true));
    expect(llamadas.find((l) => l.method === "DELETE")!.url).toContain("ventas/clientes/5/sectors/COMERCIAL");
    // Con un solo tipo ya no hay nada que quitar: el cliente conserva al menos uno.
    await waitFor(() => expect(screen.queryByRole("button", { name: /^Quitar de/ })).not.toBeInTheDocument());
    // Y se ofrece volver a sumarlo.
    expect(screen.getByRole("button", { name: "Comercial" })).toBeInTheDocument();
  });
});
