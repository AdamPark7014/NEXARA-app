import React from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import VehiculosPage from "./page";

/** La flotilla: qué hay, quién lo trae y a dónde lleva cada renglón. */

const push = vi.hoisted(() => vi.fn());
const usuario = vi.hoisted(() => ({
  actual: { id: 7, nombre: "Ada Lovelace", email: "ada@nexara.com.mx", token: "jwt" },
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
  const fetchMock = vi.fn(
    async () =>
      new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } }),
  );
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

afterEach(() => {
  usuario.actual = { id: 7, nombre: "Ada Lovelace", email: "ada@nexara.com.mx", token: "jwt" };
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

    usuario.actual = { id: 1, nombre: "Christian", email: "gerencia@nexara.com.mx", token: "jwt" };
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
});
