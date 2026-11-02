import React from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import VehiculosPage from "./page";

/** La flotilla: qué hay, quién lo trae y a dónde lleva cada renglón. */

const push = vi.hoisted(() => vi.fn());
const usuario = vi.hoisted(() => ({
  actual: {
    id: 7,
    nombre: "Ada Lovelace",
    email: "ada@nexara.com.mx",
    token: "jwt",
    permissions: [] as string[],
    isSuperAdmin: false,
  },
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push, replace: vi.fn() }),
  usePathname: () => "/erp/vehiculos",
  useSearchParams: () => new URLSearchParams(""),
}));

vi.mock("@/components/UserContext", () => ({
  useUser: () => ({ user: usuario.actual, token: usuario.actual.token }),
}));

const FLOTILLA = [
  {
    id: 3,
    nombre: "Ranger 2021",
    placas: "ABC-123",
    estatus: "En uso",
    activo: true,
    disponible: false,
    conductor: { id: 9, nombre: "Beto Ruiz" },
    desde: "2026-09-18T15:00:00.000Z",
    proximaDevolucion: "2026-09-20T23:00:00.000Z",
    odometroUltimo: 120345,
    combustibleUltimoPct: 75,
    gpsProveedor: "Demo",
    tieneRastreador: true,
  },
  {
    id: 4,
    nombre: "NP300 blanca",
    placas: null,
    estatus: "Disponible",
    activo: true,
    disponible: true,
    conductor: null,
    desde: null,
    proximaDevolucion: null,
    odometroUltimo: 58000,
    combustibleUltimoPct: null,
    gpsProveedor: null,
    tieneRastreador: false,
  },
];

function stubFetch(body: unknown = { vehiculos: FLOTILLA }, status = 200) {
  const fetchMock = vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
    const href = String(url);
    if (href.includes("vehicles/inventory") && init?.method === "POST") {
      const payload = JSON.parse(String(init.body ?? "{}")) as { nombre?: string; placas?: string | null };
      return new Response(
        JSON.stringify({ id: 88, nombre: payload.nombre, placas: payload.placas ?? null }),
        { status: 201, headers: { "Content-Type": "application/json" } },
      );
    }
    return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

afterEach(() => {
  usuario.actual = {
    id: 7,
    nombre: "Ada Lovelace",
    email: "ada@nexara.com.mx",
    token: "jwt",
    permissions: [],
    isSuperAdmin: false,
  };
});

describe("flotilla en Core", () => {
  it("cuenta disponibles y en uso, y dice quién trae cada unidad", async () => {
    const fetchMock = stubFetch();
    render(<VehiculosPage />);

    expect(await screen.findByText("Ranger 2021")).toBeInTheDocument();
    expect(String(fetchMock.mock.calls[0][0])).toContain("vehicles/flotilla");
    expect(screen.getByText("ABC-123")).toBeInTheDocument();
    expect(screen.getByText("sin placas")).toBeInTheDocument();
    expect(screen.getByText("Beto Ruiz")).toBeInTheDocument();
    expect(screen.getByText("120,345 km")).toBeInTheDocument();

    // «En uso» sale dos veces: como KPI y como píldora del renglón.
    const kpi = (etiqueta: string) =>
      screen
        .getAllByText(etiqueta)
        .map((el) => el.closest("article"))
        .find(Boolean)!;
    expect(kpi("Vehículos")).toHaveTextContent("2");
    expect(kpi("Disponibles")).toHaveTextContent("1");
    expect(kpi("En uso")).toHaveTextContent("1");
  });

  it("el renglón lleva a la ficha del vehículo", async () => {
    stubFetch();
    const user = userEvent.setup();
    render(<VehiculosPage />);

    await user.click(await screen.findByText("Ranger 2021"));
    expect(push).toHaveBeenCalledWith("/erp/vehiculos/3");
  });

  it("el GPS solo aparece para Dirección General", async () => {
    stubFetch();
    const { unmount } = render(<VehiculosPage />);
    expect(await screen.findByText("Ranger 2021")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "GPS" })).not.toBeInTheDocument();
    unmount();

    usuario.actual = {
      id: 1,
      nombre: "Christian",
      email: "gerencia@nexara.com.mx",
      token: "jwt",
      permissions: [],
      isSuperAdmin: false,
    };
    stubFetch();
    render(<VehiculosPage />);
    expect(await screen.findByRole("button", { name: "GPS" })).toBeInTheDocument();
  });

  it("si la API falla lo dice y deja reintentar", async () => {
    stubFetch({ message: "Tu rol no puede ver la flotilla" }, 403);
    render(<VehiculosPage />);

    expect(await screen.findByRole("button", { name: "Reintentar" })).toBeInTheDocument();
    expect(screen.getAllByText(/no puede ver la flotilla/).length).toBeGreaterThan(0);
  });

  it("con permiso de inventario, Agregar lleva al alta con el manual", async () => {
    usuario.actual = {
      id: 1,
      nombre: "Christian",
      email: "gerencia@nexara.com.mx",
      token: "jwt",
      permissions: ["vehicles.inventory"],
      isSuperAdmin: false,
    };
    stubFetch();
    render(<VehiculosPage />);

    const agregar = await screen.findByRole("link", { name: "Agregar vehículo" });
    expect(agregar).toHaveAttribute("href", "/erp/vehiculos/nuevo");
  });

  it("sin permiso de inventario no aparece Agregar", async () => {
    stubFetch();
    render(<VehiculosPage />);
    expect(await screen.findByText("Ranger 2021")).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Agregar vehículo" })).not.toBeInTheDocument();
  });

  it("quien ve costos ve el mes: costo por km, reparto y avisos", async () => {
    const MES = {
      mes: "2026-10",
      vehiculos: [
        {
          id: 3,
          kmDelMes: 1240,
          porKm: 7.43,
          rendimientoReal: 8.6,
          rendimientoOficial: 11.9,
          tieneFicha: true,
          proximoServicio: { km: 20020, faltanKm: -320, fecha: null, conceptos: ["Aceite"], estado: "VENCIDO" },
        },
      ],
      reparto: {
        proyectos: { km: 1510, importe: 11310 },
        cotizaciones: { km: 380, importe: 2840 },
        oficina: { km: 240, importe: 1790 },
        sinLigar: { km: 280, importe: 2104 },
        parado: 3960,
      },
      resumen: { km: 2410, costoMes: 22004, porKm: 7.49, aIndirectos: 5750 },
      avisos: [{ tono: "danger", titulo: "Ranger 2021: servicio vencido", texto: "Pasó por 320 km: Aceite.", vehicleId: 3 }],
      acceso: { veCostos: true },
    };
    const fetchMock = vi.fn(async (url: RequestInfo | URL) => {
      const cuerpo = String(url).includes("vehicles/ficha/flotilla") ? MES : { vehiculos: FLOTILLA };
      return new Response(JSON.stringify(cuerpo), { status: 200, headers: { "Content-Type": "application/json" } });
    });
    vi.stubGlobal("fetch", fetchMock);
    render(<VehiculosPage />);

    expect(await screen.findByText("Costo de la flotilla en el mes")).toBeInTheDocument();
    expect(screen.getByText("$22,004")).toBeInTheDocument();
    expect(screen.getByText("$7.43")).toBeInTheDocument();
    expect(screen.getByText("8.6 km/L")).toBeInTheDocument();
    expect(screen.getByText("Vencido por 320 km")).toBeInTheDocument();
    expect(screen.getByText("A proyectos")).toBeInTheDocument();
    expect(screen.getByText("$11,310")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /servicio vencido/ })).toHaveAttribute("href", "/erp/vehiculos/3");
  });

  it("quien no ve costos no recibe columna de dinero ni reparto", async () => {
    const MES = {
      mes: "2026-10",
      vehiculos: [{ id: 3, kmDelMes: 1240, porKm: null, rendimientoReal: 8.6, rendimientoOficial: 11.9, tieneFicha: true, proximoServicio: null }],
      reparto: { proyectos: { km: 10, importe: null }, cotizaciones: { km: 0, importe: null }, oficina: { km: 0, importe: null }, sinLigar: { km: 0, importe: null }, parado: null },
      resumen: { km: 1240, costoMes: null, porKm: null, aIndirectos: null },
      avisos: [],
      acceso: { veCostos: false },
    };
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: RequestInfo | URL) => {
        const cuerpo = String(url).includes("vehicles/ficha/flotilla") ? MES : { vehiculos: FLOTILLA };
        return new Response(JSON.stringify(cuerpo), { status: 200, headers: { "Content-Type": "application/json" } });
      }),
    );
    render(<VehiculosPage />);

    expect(await screen.findByText("8.6 km/L")).toBeInTheDocument();
    expect(screen.queryByText("Costo por km")).not.toBeInTheDocument();
    expect(screen.queryByText("A proyectos")).not.toBeInTheDocument();
  });
});
