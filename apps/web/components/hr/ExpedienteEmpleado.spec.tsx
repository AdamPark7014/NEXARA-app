import { describe, it, expect, vi, beforeEach } from "vitest";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import ExpedienteEmpleado from "./ExpedienteEmpleado";

vi.mock("@/lib/hr-expediente-api", () => ({
  obtenerExpediente: vi.fn(),
  solicitarCambioRh: vi.fn(),
}));

import { obtenerExpediente } from "@/lib/hr-expediente-api";

describe("ExpedienteEmpleado", () => {
  beforeEach(() => {
    vi.mocked(obtenerExpediente).mockReset();
  });

  it("muestra vacío de documentos y oculta sensibles al jefe", async () => {
    vi.mocked(obtenerExpediente).mockResolvedValue({
      laborales: {
        employeeNumber: "NEX-001",
        puesto: "Técnico",
        area: "Campo",
        manager: { nombre: "Luis" },
        tipoContrato: "Planta",
        estadoRRHH: "Activo",
      },
      sensibles: null,
      documentos: [],
      incidencias: [],
      permisos: [],
      timeline: [],
      permisosVista: { sensibles: false, puedeEditar: false, puedeSubirDocs: false, esJefe: true, esPropio: false },
    });
    render(<ExpedienteEmpleado token="t" userId={50} />);
    await waitFor(() => expect(screen.getByText("Datos laborales")).toBeInTheDocument());
    expect(screen.getByText(/datos personales sensibles solo los ven RH/i)).toBeInTheDocument();
    expect(screen.getByText("Sin documentos")).toBeInTheDocument();
  });

  it("muestra error y permite reintentar", async () => {
    vi.mocked(obtenerExpediente).mockRejectedValue(new Error("Sin permiso"));
    render(<ExpedienteEmpleado token="t" userId={50} />);
    await waitFor(() => expect(screen.getByText(/No se pudo cargar el expediente/i)).toBeInTheDocument());
    expect(screen.getByRole("button", { name: /Reintentar/i })).toBeInTheDocument();
    vi.mocked(obtenerExpediente).mockResolvedValue(null);
    fireEvent.click(screen.getByRole("button", { name: /Reintentar/i }));
    await waitFor(() => expect(screen.getByText("Sin expediente")).toBeInTheDocument());
  });

  it("sin sesión no queda cargando ni consulta la API", () => {
    render(<ExpedienteEmpleado token="" userId={50} />);
    expect(screen.getByRole("heading", { name: "Inicia sesión" })).toBeInTheDocument();
    expect(obtenerExpediente).not.toHaveBeenCalled();
  });

  it("ignora la respuesta anterior al cambiar de persona", async () => {
    let primera!: (value: unknown) => void;
    vi.mocked(obtenerExpediente).mockImplementationOnce(() => new Promise((resolve) => { primera = resolve; }));
    vi.mocked(obtenerExpediente).mockResolvedValueOnce({
      laborales: { puesto: "Puesto actual" }, sensibles: null,
      documentos: [], incidencias: [], permisos: [], timeline: [], permisosVista: {},
    });
    const view = render(<ExpedienteEmpleado token="t" userId={50} />);
    expect(screen.getByRole("status", { name: "Cargando expediente" })).toBeInTheDocument();
    view.rerender(<ExpedienteEmpleado token="t" userId={51} />);
    await waitFor(() => expect(screen.getByText("Puesto actual")).toBeInTheDocument());
    await act(async () => primera({ laborales: { puesto: "Puesto de otra persona" } }));
    expect(screen.queryByText("Puesto de otra persona")).not.toBeInTheDocument();
    expect(screen.getByText("Puesto actual")).toBeInTheDocument();
  });

  it("traduce permisos y eventos a español", async () => {
    vi.mocked(obtenerExpediente).mockResolvedValue({
      laborales: {}, sensibles: null, documentos: [], incidencias: [], permisosVista: {},
      permisos: [{ id: 1, type: "VACATION", status: "PENDING", startDate: "2026-11-17", endDate: "2026-11-18" }],
      timeline: [{ id: 1, tipo: "CAMBIO_JEFE", createdAt: "2026-11-16T12:00:00Z" }],
    });
    render(<ExpedienteEmpleado token="t" userId={50} />);
    await waitFor(() => expect(screen.getByText(/Vacaciones · Pendiente/)).toBeInTheDocument());
    expect(screen.getByText(/Cambio de jefe/)).toBeInTheDocument();
  });
});
