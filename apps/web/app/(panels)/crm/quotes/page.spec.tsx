import React from "react";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import QuotesPage from "./page";

/**
 * El listado de cotizaciones, contra el contrato de `.ai/DISENO-FINANZAS.md`:
 * sin un solo registro la tira de cifras no se pinta (regla 7), un periodo que
 * de verdad cerró en cero sí se enseña, hay un único botón primario a la vista
 * (regla 4) y un fallo al refrescar no borra lo que ya estaba.
 */

const listSalesQuotes = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: vi.fn(), push: vi.fn() }),
  usePathname: () => "/crm/quotes",
  useSearchParams: () => new URLSearchParams(""),
}));

vi.mock("@/components/UserContext", () => ({
  useUser: () => ({ user: { id: 1, nombre: "Christian", token: "jwt" } }),
}));

vi.mock("@/lib/section-views", () => ({
  getCrmSalesSectionConfig: () => ({ title: "Cotizaciones", canCreate: true, canEdit: true }),
}));

vi.mock("@/lib/sales-api", () => ({
  listSalesQuotes: (...args: unknown[]) => listSalesQuotes(...args),
}));

// Funciones a pelo, no `vi.fn()`: el runner corre con `restoreMocks`, que a un
// espía le borra la implementación entre pruebas y dejaba el módulo devolviendo
// `undefined` — un `.then` sobre nada que tumbaba la página de la 2.ª en adelante.
vi.mock("@/lib/smart-quote-api", () => ({
  smartQuoteCtStatus: () => Promise.resolve({ total: 0, lastSync: null }),
  smartQuoteSupplierStats: () => Promise.resolve({ suppliers: [], totals: {} }),
}));

const hoy = new Date();
const diaDeEsteMes = new Date(hoy.getFullYear(), hoy.getMonth(), 1).toISOString();

const QUOTE = {
  id: 7,
  quoteNumber: "NXR-2026-0007",
  clientCompany: "Plaza Norte",
  clientName: "Ana Ruiz",
  projectName: "CCTV perimetral",
  total: "89180.70",
  status: "SENT",
  issueDate: diaDeEsteMes,
  validUntil: null,
  items: [],
};

beforeEach(() => {
  listSalesQuotes.mockReset();
});

describe("listado de cotizaciones", () => {
  it("sin un solo registro no pinta la tira de ceros: pinta de dónde sale la primera", async () => {
    listSalesQuotes.mockResolvedValue([]);
    render(<QuotesPage />);

    expect(await screen.findByText("Aún no hay cotizaciones")).toBeInTheDocument();
    expect(screen.queryByLabelText("Resumen del periodo")).not.toBeInTheDocument();
    // El vacío trae el botón que crea la primera, y es el único primario.
    expect(screen.getAllByRole("button", { name: "Cotizar en minutos" })).toHaveLength(1);
    // Sin nada que filtrar, tampoco hay barra de filtros.
    expect(screen.queryByPlaceholderText(/Buscar por folio/)).not.toBeInTheDocument();
  });

  it("un periodo que de verdad cerró en cero sí enseña la tira", async () => {
    // La cotización existe, pero es de 2024: fuera del mes en curso.
    listSalesQuotes.mockResolvedValue([{ ...QUOTE, issueDate: "2024-03-04T00:00:00.000Z" }]);
    render(<QuotesPage />);

    const tira = await screen.findByLabelText("Resumen del periodo");
    expect(tira).toBeInTheDocument();
    expect(screen.queryByText("Aún no hay cotizaciones")).not.toBeInTheDocument();
    expect(screen.getByText("No se emitió ninguna cotización en el periodo elegido.")).toBeInTheDocument();
  });

  it("con datos deja un solo botón primario y la tira en lugar de las tarjetas", async () => {
    listSalesQuotes.mockResolvedValue([QUOTE]);
    render(<QuotesPage />);

    expect(await screen.findByLabelText("Resumen del periodo")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "NXR-2026-0007" })).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: "Cotizar en minutos" })).toHaveLength(1);
  });

  it("un fallo al refrescar no borra lo que ya se estaba viendo", async () => {
    listSalesQuotes.mockResolvedValueOnce([QUOTE]);
    render(<QuotesPage />);
    expect(await screen.findByRole("link", { name: "NXR-2026-0007" })).toBeInTheDocument();

    listSalesQuotes.mockRejectedValueOnce(new Error("La red se cayó"));
    await userEvent.click(screen.getByRole("button", { name: "Actualizar" }));

    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent(/La red se cayó/));
    // La fila sigue ahí: el error avisa, no vacía la pantalla.
    expect(screen.getByRole("link", { name: "NXR-2026-0007" })).toBeInTheDocument();
  });
});
