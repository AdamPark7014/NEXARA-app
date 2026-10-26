import React from "react";
import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import HybridAttendancePanel from "./HybridAttendancePanel";

/**
 * Contraste híbrido checador ↔ puertas: si el API falla se ve su causa (no un texto fijo que la
 * tape), y con datos se conserva el recuadro de fuentes y de cómo ligar el número de empleado.
 */

vi.mock("@/lib/export-excel", () => ({ exportToExcel: vi.fn() }));

const RESPUESTA = {
  date: "2026-10-20",
  sources: { erp: "Checador de la app (nómina)", acs: "Terminales de puerta de Integra" },
  howToLink: "Liga a cada persona con su número de empleado en RH para cruzar ambos registros.",
  summary: { linked: 1, erpOnly: 0, acsOnly: 0, withFlags: 0 },
  items: [
    {
      linkStatus: "linked",
      matchKey: "15",
      flags: [],
      user: {
        id: 7,
        nombre: "Persona de prueba",
        email: "persona@example.com",
        employeeNumber: "15",
        companyEmployeeNumber: null,
        department: "Soporte",
      },
      erp: { checkIn: "2026-10-20T16:00:00.000Z", checkOut: null, totalMinutes: 125, isOpen: true, estado: "PRESENTE" },
      acs: null,
    },
  ],
};

function responder(status: number, body: unknown) {
  const fetchMock = vi.fn(
    async (_url: RequestInfo | URL, _init?: RequestInit) =>
      new Response(typeof body === "string" ? body : JSON.stringify(body), { status }),
  );
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("HybridAttendancePanel", () => {
  it("muestra la causa que manda el servidor, completa, con Reintentar", async () => {
    responder(403, { message: "Tu rol no puede ver el contraste de Integra Servicios S.A. de C.V." });

    render(<HybridAttendancePanel token="jwt" date="2026-10-20" />);

    expect(
      await screen.findByText("Tu rol no puede ver el contraste de Integra Servicios S.A. de C.V."),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Reintentar" })).toBeInTheDocument();
  });

  it("si el servidor no dice nada, usa el texto de respaldo", async () => {
    responder(502, "");

    render(<HybridAttendancePanel token="jwt" date="2026-10-20" />);

    expect(await screen.findByText("No se pudo cargar el contraste.")).toBeInTheDocument();
  });

  it("conserva el recuadro de fuentes y de cómo ligar el número de empleado", async () => {
    const fetchMock = responder(200, RESPUESTA);

    render(<HybridAttendancePanel token="jwt" date="2026-10-20" />);

    expect(await screen.findByText(RESPUESTA.howToLink)).toBeInTheDocument();
    expect(screen.getByText(RESPUESTA.sources.erp)).toBeInTheDocument();
    expect(screen.getByText(RESPUESTA.sources.acs)).toBeInTheDocument();
    expect(String(fetchMock.mock.calls[0]?.[0])).toContain("attendance/hybrid?date=2026-10-20");
  });
});
