import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";

vi.mock("@/components/portal/PortalShell", () => ({ usePortalSession: () => ({ token: "t" }) }));
vi.mock("@/components/Toast", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock("@/lib/api-base", () => ({ buildApiUrl: (ruta: string) => `/api/${ruta}` }));

import MisServiciosPage from "./page";

/**
 * El cliente veía su factura con vencimiento un día antes: emisión, vencimiento, vigencia y visitas
 * son días de calendario que la API manda a medianoche UTC, y la pantalla los leía con hora local.
 */
const RESUMEN = {
  summary: {
    activeProjects: 1, activeContracts: 1, upcomingVisits: 1, openTickets: 0,
    ticketsLast30Days: 0, completionRate: 100, branches: 1, pendingFeedbacks: 0,
  },
  projects: [{ id: 1, title: "Proyecto Demo", status: "ACTIVE", projectType: "CCTV", startDate: "2026-12-01T00:00:00.000Z", endDate: "2026-12-15T00:00:00.000Z" }],
  contracts: [{ id: 1, contractNumber: "MC-1", title: "Póliza Demo", frequency: "MONTHLY", slaResponseHours: 4, slaResolutionHours: 24, nextVisitDate: "2026-12-10T00:00:00.000Z", monthlyFee: 1000, currency: "MXN", branch: null }],
  upcomingVisits: [{ id: 1, scheduledDate: "2026-12-10T00:00:00.000Z", status: "SCHEDULED", contract: { id: 1, contractNumber: "MC-1", title: "Póliza Demo", branch: null } }],
  recentTickets: [{ id: 1, anNumber: "AN-1", titulo: "Ticket Demo", estatus: "Pendiente", fechaAsignacion: "2026-12-02T03:30:00.000Z" }],
};
const FACTURAS = [{ id: 1, invoiceNumber: "F-1", status: "SENT", issueDate: "2026-12-01T00:00:00.000Z", dueDate: "2026-12-31T00:00:00.000Z", totalAmount: 100, paidAmount: 0, currency: "MXN" }];
const COTIZACIONES = [{ id: 1, quoteNumber: "COT-1", status: "SENT", issueDate: "2026-12-03T00:00:00.000Z", validUntil: "2026-12-18T00:00:00.000Z", currency: "MXN", total: 100 }];

describe("portal del cliente: fechas de calendario", () => {
  beforeEach(() => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        const cuerpo = url.endsWith("services-summary") ? RESUMEN : url.endsWith("invoices") ? FACTURAS : COTIZACIONES;
        return { ok: true, json: async () => cuerpo, text: async () => "" } as unknown as Response;
      }),
    );
  });
  afterEach(() => vi.unstubAllGlobals());

  it("factura, cotización, proyecto y visitas salen con su día, no con el anterior", async () => {
    render(<MisServiciosPage />);

    // Factura: emisión 1 dic, vencimiento 31 dic.
    expect(await screen.findByText("31/12/2026")).toBeInTheDocument();
    // Cotización: emisión 3 dic, vigencia 18 dic.
    expect(await screen.findByText("18/12/2026")).toBeInTheDocument();
    expect(screen.getByText("3/12/2026")).toBeInTheDocument();
    // Proyecto: del 1 al 15 de diciembre.
    expect(screen.getByText(/1\/12\/2026 → 15\/12\/2026/)).toBeInTheDocument();
    // Próxima visita del contrato y la visita programada: 10 dic.
    expect(screen.getAllByText("10/12/2026")).toHaveLength(2);

    // Nada se corrió al día anterior.
    for (const corrido of ["30/11/2026", "30/12/2026", "2/12/2026", "17/12/2026", "14/12/2026", "9/12/2026"]) {
      expect(screen.queryByText(new RegExp(corrido.replace(/\//g, "\\/")))).not.toBeInTheDocument();
    }
  });

  it("la fecha de un ticket es un momento y se queda en hora local", async () => {
    render(<MisServiciosPage />);
    // 03:30 UTC del 2 de diciembre son las 21:30 del 1 en México.
    expect(await screen.findByText("Ticket Demo")).toBeInTheDocument();
    const fila = screen.getByText("Ticket Demo").closest("tr");
    expect(fila?.textContent).toContain("1/12/2026");
  });
});
