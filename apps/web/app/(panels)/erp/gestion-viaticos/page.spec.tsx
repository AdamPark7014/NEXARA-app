import React from "react";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import GestionViaticosPage from "./page";

vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock("@/components/UserContext", () => ({
  useUser: () => ({ token: "tok", user: { id: 7, nombre: "Liz" } }),
}));

const fetchBandeja = vi.fn();
const fetchPorFacturar = vi.fn();
const revisarTicket = vi.fn();
vi.mock("@/lib/gestion-viaticos-api", () => ({
  fetchBandeja: (...a: unknown[]) => fetchBandeja(...a),
  fetchPorFacturar: (...a: unknown[]) => fetchPorFacturar(...a),
  revisarTicket: (...a: unknown[]) => revisarTicket(...a),
  facturarTicket: vi.fn(),
}));

vi.mock("@/lib/viatics-api", () => ({
  approveViatico: vi.fn(),
}));

describe("GestionViaticosPage", () => {
  beforeEach(() => {
    fetchBandeja.mockReset();
    fetchPorFacturar.mockReset();
    revisarTicket.mockReset();
  });

  it("muestra la bandeja ordenada y deja aprobar un ticket", async () => {
    fetchBandeja.mockResolvedValue({
      hoy: "2026-11-16",
      conteo: { total: 1, ticket_hoy: 0, comprobacion: 0, viatico: 0 },
      iaTicketsDisponible: false,
      items: [
        {
          clave: "ticket_pend:9",
          urgencia: "comprobacion",
          titulo: "Ticket por revisar · gasolina",
          resumen: "Técnico · $450.00",
          accion: "Aprobar o rechazar ticket",
          href: "/erp/gestion-viaticos?vista=tickets",
          entidadId: 9,
          createdAt: "2026-11-16T10:00:00Z",
        },
      ],
    });
    render(<GestionViaticosPage />);
    expect(await screen.findByRole("heading", { name: "Mesa de viáticos y vehículos" })).toBeTruthy();
    expect(await screen.findByText("Ticket por revisar · gasolina")).toBeTruthy();
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "Aprobar ticket" }));
    await waitFor(() => expect(revisarTicket).toHaveBeenCalledWith("tok", 9, { accion: "aprobar" }));
  });

  it("muestra vacío cuando no hay filas", async () => {
    fetchBandeja.mockResolvedValue({
      hoy: "2026-11-16",
      conteo: { total: 0 },
      iaTicketsDisponible: false,
      items: [],
    });
    render(<GestionViaticosPage />);
    expect(await screen.findByText("No hay nada pendiente en esta vista.")).toBeTruthy();
  });

  it("muestra el error de la API", async () => {
    fetchBandeja.mockRejectedValue(new Error("Sin permiso"));
    render(<GestionViaticosPage />);
    expect(await screen.findByRole("alert")).toBeTruthy();
    expect(screen.queryByText("No hay nada pendiente en esta vista.")).toBeNull();
    fetchBandeja.mockResolvedValue({ items: [], conteo: { total: 0 } });
    await userEvent.setup().click(screen.getByRole("button", { name: "Reintentar" }));
    expect(await screen.findByText("No hay nada pendiente en esta vista.")).toBeTruthy();
  });

  it("muestra carga mientras espera al servidor", () => {
    fetchBandeja.mockReturnValue(new Promise(() => {}));
    render(<GestionViaticosPage />);
    expect(screen.getByText("Cargando…")).toBeTruthy();
    expect(screen.queryByText("No hay nada pendiente en esta vista.")).toBeNull();
  });
});
