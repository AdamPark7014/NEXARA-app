import React from "react";
import { render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import VehiculosGpsPage from "./page";

/**
 * El GPS de la flotilla es solo de Dirección General. Quien no lo es no debe
 * ver el mapa — y tampoco debe provocar una sola llamada al proveedor, que se
 * cobra por consulta.
 */

const usuario = vi.hoisted(() => ({
  actual: { id: 7, nombre: "Ada Lovelace", email: "ada@nexara.com.mx", token: "jwt" } as {
    id: number;
    nombre: string;
    email: string;
    token: string;
  },
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: vi.fn(), push: vi.fn() }),
  usePathname: () => "/erp/vehiculos/gps",
  useSearchParams: () => new URLSearchParams(""),
}));

vi.mock("@/components/UserContext", () => ({
  useUser: () => ({ user: usuario.actual, token: usuario.actual.token }),
}));

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

const RESPUESTAS: Record<string, unknown> = {
  "vehicle-gps/estado": {
    proveedor: "Demo",
    configurado: true,
    demo: true,
    vehiculosConRastreador: 2,
  },
  "vehicle-gps/posiciones": {
    demo: true,
    proveedor: "Demo",
    posiciones: [
      {
        vehicleAssetId: 3,
        nombre: "Ranger 2021",
        placas: "ABC-123",
        lat: 19.0414,
        lng: -98.2063,
        velocidadKmh: 42,
        rumbo: 90,
        at: "2026-09-19T16:00:00.000Z",
        conductor: { id: 9, nombre: "Beto Ruiz" },
      },
    ],
  },
};

function stubFetch() {
  const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    const clave = Object.keys(RESPUESTAS).find((k) => url.includes(k));
    return json(clave ? RESPUESTAS[clave] : {});
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

afterEach(() => {
  usuario.actual = { id: 7, nombre: "Ada Lovelace", email: "ada@nexara.com.mx", token: "jwt" };
});

describe("GPS de la flotilla", () => {
  it("sin Dirección General: candado y ni una llamada al servidor", async () => {
    const fetchMock = stubFetch();
    render(<VehiculosGpsPage />);

    expect(screen.getByText("Solo Dirección General")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Volver a Vehículos" })).toBeInTheDocument();
    // Ni mapa ni lista lateral.
    expect(screen.queryByLabelText("Día del recorrido")).not.toBeInTheDocument();

    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("Dirección General ve el mapa y el aviso de datos de demostración", async () => {
    usuario.actual = {
      id: 1,
      nombre: "Christian",
      email: "gerencia@nexara.com.mx",
      token: "jwt",
    };
    const fetchMock = stubFetch();
    render(<VehiculosGpsPage />);

    expect(screen.queryByText("Solo Dirección General")).not.toBeInTheDocument();
    expect(await screen.findByText("Datos de demostración")).toBeInTheDocument();
    expect(await screen.findByText("Ranger 2021")).toBeInTheDocument();
    expect(screen.getByText(/Beto Ruiz/)).toBeInTheDocument();
    expect(screen.getByText(/42 km\/h/)).toBeInTheDocument();
    expect(screen.getByLabelText("Día del recorrido")).toBeInTheDocument();

    await waitFor(() => {
      const rutas = fetchMock.mock.calls.map((c) => String(c[0]));
      expect(rutas.some((r) => r.includes("vehicle-gps/posiciones"))).toBe(true);
      expect(rutas.some((r) => r.includes("vehicle-gps/estado"))).toBe(true);
      // El recorrido solo se pide al elegir un vehículo.
      expect(rutas.some((r) => r.includes("/recorrido"))).toBe(false);
    });
  });
});
