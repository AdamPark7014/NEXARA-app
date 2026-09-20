import React from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import MisVehiculosPage from "./page";

/** Mis vehículos: la asignación viva y el botón que abre el checklist. */

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  usePathname: () => "/erp/vehiculos/mis-vehiculos",
  useSearchParams: () => new URLSearchParams(""),
}));

vi.mock("@/components/UserContext", () => ({
  useUser: () => ({
    user: { id: 7, nombre: "Ada", email: "ada@nexara.com.mx", token: "jwt" },
    token: "jwt",
  }),
}));

const RESPUESTA = {
  activa: {
    id: 11,
    origen: "solicitud",
    vehiculo: { id: 3, nombre: "Ranger 2021", placas: "ABC-123" },
    inicio: "2026-09-18T15:00:00.000Z",
    fin: "2026-09-20T23:00:00.000Z",
    odometroInicio: 120000,
    combustibleInicioPct: 75,
    requiereSalida: false,
    requiereDevolucion: true,
  },
  solicitudes: [
    {
      id: 11,
      nombreVehiculo: "Ranger 2021",
      placasVehiculo: "ABC-123",
      estatusAprobacion: "Aprobado",
      entregaEstatus: "En uso",
      fechaInicioSolicitada: "2026-09-18T15:00:00.000Z",
      fechaFinSolicitada: "2026-09-20T23:00:00.000Z",
    },
  ],
  disponibles: [],
};

describe("mis vehículos", () => {
  it("con una asignación viva ofrece registrar el regreso y abre el checklist", async () => {
    const fetchMock = vi.fn(
      async () =>
        new Response(JSON.stringify(RESPUESTA), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
    );
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();
    render(<MisVehiculosPage />);

    // Sale dos veces: en la tarjeta de uso y en la solicitud aprobada.
    expect((await screen.findAllByText("Ranger 2021")).length).toBe(2);
    expect(String(fetchMock.mock.calls[0][0])).toContain("vehicles/mis-vehiculos");
    expect(screen.getByText("120,000 km")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Registrar salida" })).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Registrar regreso" }));
    const dialogo = await screen.findByRole("dialog");
    expect(dialogo).toHaveTextContent("Devolución · Ranger 2021");
    // Arranca en el paso de fotos y recuerda con cuántos km salió.
    expect(dialogo).toHaveTextContent("Fotos del momento, tomadas con la cámara");
  });
});
