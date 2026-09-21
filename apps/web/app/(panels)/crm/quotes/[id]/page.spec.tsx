import React from "react";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import QuoteDetailPage from "./page";

/**
 * El detalle de una cotización, contra `.ai/DISENO-FINANZAS.md`: sin partidas
 * no se pinta la tira de ceros y el vacío dice de dónde salen (regla 7), y un
 * fallo al bajar el PDF se ve — antes se guardaba en un estado que nadie
 * renderizaba, así que el botón simplemente no hacía nada.
 */

vi.mock("next/navigation", () => ({
  useParams: () => ({ id: "7" }),
  useRouter: () => ({ back: vi.fn(), push: vi.fn(), replace: vi.fn() }),
  usePathname: () => "/crm/quotes/7",
  useSearchParams: () => new URLSearchParams(""),
}));

vi.mock("@/components/UserContext", () => ({
  useUser: () => ({ user: { id: 1, nombre: "Christian", token: "jwt" } }),
}));

vi.mock("@/lib/section-views", () => ({
  getCrmSalesSectionConfig: () => ({ title: "Cotizaciones", canCreate: true, canEdit: true }),
}));

// El panel de pedido a CT hace sus propias llamadas; aquí estorba.
vi.mock("../components/CtOrderPanel", () => ({ default: () => null }));

const BASE = {
  id: 7,
  quoteNumber: "NXR-2026-0007",
  status: "DRAFT" as const,
  issueDate: "2026-09-01T00:00:00.000Z",
  validUntil: null,
  clientCompany: "Plaza Norte",
  clientName: "Ana Ruiz",
  clientEmail: "ana@plazanorte.mx",
  projectName: "CCTV perimetral",
  currency: "MXN",
  depositPercent: 50,
  subtotal: "1000",
  discountTotal: "0",
  taxTotal: "160",
  iepsTotal: "0",
  retentionTotal: "0",
  total: "1160",
  items: [] as Array<Record<string, unknown>>,
};

const CON_PARTIDA = {
  ...BASE,
  items: [
    {
      id: 1,
      name: "Cámara bullet 4MP",
      qty: 2,
      unitPrice: "500",
      unitCost: "300",
      marginPercent: 40,
      discount: 0,
      tax: 16,
      ieps: 0,
      retention: 0,
      lineTotal: "1160",
      sku: "HK-B140",
    },
  ],
};

function jsonResponse(body: unknown) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

function montarCon(detalle: unknown, pdfOk = true) {
  const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.includes("/pdf")) {
      return pdfOk
        ? new Response(new Blob(["%PDF"]), { status: 200 })
        : new Response("", { status: 500 });
    }
    return jsonResponse(detalle);
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

beforeEach(() => {
  vi.unstubAllGlobals();
});

describe("detalle de cotización", () => {
  it("sin partidas no pinta la tira de ceros: pinta de dónde salen", async () => {
    montarCon(BASE);
    render(<QuoteDetailPage />);

    expect(await screen.findByText("Sin partidas")).toBeInTheDocument();
    expect(screen.queryByLabelText("Cifras de la cotización")).not.toBeInTheDocument();
    expect(screen.getByText(/se agregan desde el editor del borrador/i)).toBeInTheDocument();
  });

  it("con partidas enseña la tira con el total y el margen calculado", async () => {
    montarCon(CON_PARTIDA);
    render(<QuoteDetailPage />);

    const tira = await screen.findByLabelText("Cifras de la cotización");
    expect(tira).toHaveTextContent("margen bruto");
    // Venta neta 2 × 500 = 1 000; costo 2 × 300 = 600; margen 400 = 40 %.
    expect(tira).toHaveTextContent("40%");
    expect(screen.getByText("1 partida · MXN")).toBeInTheDocument();
  });

  it("un fallo al bajar el PDF se dice en pantalla", async () => {
    montarCon(CON_PARTIDA, false);
    render(<QuoteDetailPage />);
    await screen.findByLabelText("Cifras de la cotización");

    await userEvent.click(screen.getByRole("button", { name: "PDF del cliente" }));

    await waitFor(() =>
      expect(screen.getByRole("alert")).toHaveTextContent(/No se pudo descargar el PDF/),
    );
  });
});
