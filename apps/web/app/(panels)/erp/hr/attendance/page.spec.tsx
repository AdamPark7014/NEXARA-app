import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import AttendancePage from "./page";

/**
 * Asistencia de RH: el aviso de error no recorta el mensaje del servidor y, si falla el cambio
 * de fecha, dice de qué día es la lista que se sigue viendo. «Registrar jornada» explica qué
 * hacer cuando alguien no puede usar su teléfono.
 */

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: vi.fn(), push: vi.fn(), back: vi.fn() }),
  usePathname: () => "/erp/hr/attendance",
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock("@/components/UserContext", () => ({
  useUser: () => ({ user: { id: 1, nombre: "Jefa de prueba", token: "jwt" } }),
}));

vi.mock("@/lib/user-access", () => ({
  canAccessHrManagement: () => true,
  getAttendanceSectionConfig: () => ({
    title: "Asistencia",
    subtitle: "Jornada del equipo",
    viewMode: "manage_register",
    canManageTeam: true,
    canRegisterSelf: true,
    visibilityHint: "",
  }),
}));

vi.mock("@/components/HybridAttendancePanel", () => ({ default: () => <div data-testid="hibrido" /> }));
vi.mock("@/components/AttendanceGpsDayPanel", () => ({ default: () => <div data-testid="gps-dia" /> }));
vi.mock("@/components/presence/EnSitioStrip", () => ({ EnSitioStrip: () => <div data-testid="en-sitio" /> }));
vi.mock("@/components/ops/OpsAttendanceRail", () => ({ default: () => <div data-testid="rail" /> }));
vi.mock("@/components/FilterToolbar", () => ({ default: () => <div data-testid="filtros" /> }));
vi.mock("@/lib/export-excel", () => ({ exportToExcel: vi.fn() }));

const ERROR_SERVIDOR = "Falló el reporte de Integra Servicios S.A. de C.V. por mantenimiento";

function hoy(): string {
  return new Date().toLocaleDateString("sv-SE");
}

function ayer(): string {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  return d.toLocaleDateString("sv-SE");
}

function diaLargo(iso: string): string {
  return new Date(`${iso}T12:00:00`).toLocaleDateString("es-MX", { weekday: "long", day: "numeric", month: "long" });
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status });
}

/** El equipo de hoy carga; cualquier otro día el servidor responde con un error en texto. */
function servidor() {
  const fetchMock = vi.fn(async (input: RequestInfo | URL, _init?: RequestInit) => {
    const url = String(input);
    if (url.includes("gps/me")) return json({ consent: false });
    if (url.includes("attendance/current")) return json({});
    if (url.includes("attendance/hierarchy/range")) {
      if (url.includes(`from=${hoy()}`)) {
        return json({ users: [{ userId: 7, userName: "Persona de prueba", email: "persona@example.com", attendances: [], days: [] }] });
      }
      return new Response(ERROR_SERVIDOR, { status: 500 });
    }
    return json({});
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("AttendancePage", () => {
  it("si falla el cambio de fecha, avisa la causa completa y de qué día es la lista", async () => {
    servidor();
    render(<AttendancePage />);

    expect(await screen.findByText("Persona de prueba")).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("Fecha"), { target: { value: ayer() } });

    expect(
      await screen.findByText(`${ERROR_SERVIDOR}. Mostramos la asistencia del ${diaLargo(hoy())}.`),
    ).toBeInTheDocument();
    expect(screen.getByText("Persona de prueba")).toBeInTheDocument();
  });

  it("Registrar jornada dice qué hacer si alguien no puede usar su teléfono", async () => {
    servidor();
    render(<AttendancePage />);

    expect(await screen.findByRole("heading", { name: "Registrar jornada" })).toBeInTheDocument();
    expect(screen.getByText(/no puede usar su teléfono, su jefe registra la checada desde/)).toBeInTheDocument();
  });
});
