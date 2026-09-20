import React from "react";
import { render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import VehiculoDetallePage from "./page";

/** La ficha: el viaje con sus números y la evidencia de salida y devolución. */

vi.mock("next/navigation", () => ({
  useParams: () => ({ id: "3" }),
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  usePathname: () => "/erp/vehiculos/3",
  useSearchParams: () => new URLSearchParams(""),
}));

vi.mock("@/components/UserContext", () => ({
  useUser: () => ({
    user: { id: 7, nombre: "Ada", email: "ada@nexara.com.mx", token: "jwt" },
    token: "jwt",
  }),
}));

const foto = (slot: string) => ({
  slot,
  url: `/uploads/vehiculos/${slot}.jpg`,
  capturedAt: "2026-09-18T15:04:00.000Z",
  lat: 19.0414,
  lng: -98.2063,
});

const RESPUESTA = {
  vehiculo: {
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
  historial: [
    {
      id: 11,
      origen: "solicitud",
      conductor: { id: 9, nombre: "Beto Ruiz" },
      actividad: "AN-2026-014",
      inicio: "2026-09-18T15:00:00.000Z",
      fin: null,
      odometroInicio: 120000,
      odometroFin: null,
      kmRecorridos: null,
      combustibleInicioPct: 75,
      combustibleFinPct: null,
      fotosSalida: [foto("frontal"), foto("tablero")],
      fotosDevolucion: [],
      estatus: "En uso",
    },
  ],
};

describe("ficha del vehículo", () => {
  it("muestra el estado, el viaje y las fotos de salida con el tablero al frente", async () => {
    const fetchMock = vi.fn(
      async () =>
        new Response(JSON.stringify(RESPUESTA), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
    );
    vi.stubGlobal("fetch", fetchMock);
    render(<VehiculoDetallePage />);

    expect(await screen.findByText("Historial · 1 viajes")).toBeInTheDocument();
    expect(String(fetchMock.mock.calls[0][0])).toContain("vehicles/flotilla/3");
    expect(screen.getByText("120,345 km")).toBeInTheDocument();
    expect(screen.getByText(/AN-2026-014/)).toBeInTheDocument();

    const salida = screen.getByText("Salida").parentElement!;
    const botones = within(salida).getAllByRole("button");
    // El tablero va primero: es la foto que prueba kilometraje y gasolina.
    expect(botones[0]).toHaveTextContent("Tablero");
    expect(within(salida).getByAltText("Frente")).toBeInTheDocument();
    expect(screen.getByText("Devolución").parentElement).toHaveTextContent("Sin fotos");
  });
});
