import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import SolicitudesRhPendientes from "./SolicitudesRhPendientes";
import { decidirSolicitudRh, listarMisSolicitudesRh } from "@/lib/hr-expediente-api";

vi.mock("@/lib/hr-expediente-api", () => ({ decidirSolicitudRh: vi.fn(), listarMisSolicitudesRh: vi.fn() }));
const solicitud = { id: 41, tipo: "CAMBIO_PUESTO", user: { nombre: "Persona ficticia" }, payload: { puestoNuevo: "Coordinación" } };

describe("Solicitudes de personal", () => {
  beforeEach(() => {
    vi.mocked(listarMisSolicitudesRh).mockReset();
    vi.mocked(decidirSolicitudRh).mockReset();
  });

  it("muestra carga y luego vacío", async () => {
    let resolver!: (value: unknown) => void;
    vi.mocked(listarMisSolicitudesRh).mockImplementation(() => new Promise((resolve) => { resolver = resolve; }));
    render(<SolicitudesRhPendientes token="sesion" />);
    expect(screen.getByRole("status", { name: "Cargando solicitudes de personal" })).toBeInTheDocument();
    await act(async () => resolver([]));
    expect(screen.getByText("Sin solicitudes de personal")).toBeInTheDocument();
  });

  it("muestra error y reintenta la consulta", async () => {
    vi.mocked(listarMisSolicitudesRh).mockRejectedValueOnce(new Error("No disponible")).mockResolvedValueOnce([]);
    render(<SolicitudesRhPendientes token="sesion" />);
    await waitFor(() => expect(screen.getByRole("button", { name: "Reintentar" })).toBeInTheDocument());
    fireEvent.click(screen.getByRole("button", { name: "Reintentar" }));
    await waitFor(() => expect(screen.getByText("Sin solicitudes de personal")).toBeInTheDocument());
    expect(listarMisSolicitudesRh).toHaveBeenCalledTimes(2);
  });

  it("aprueba una sola vez durante la petición y vuelve a consultar", async () => {
    let resolver!: (value: unknown) => void;
    vi.mocked(listarMisSolicitudesRh).mockResolvedValueOnce([solicitud]).mockResolvedValueOnce([]);
    vi.mocked(decidirSolicitudRh).mockImplementation(() => new Promise((resolve) => { resolver = resolve; }));
    render(<SolicitudesRhPendientes token="sesion" />);
    const aprobar = await screen.findByRole("button", { name: "Aprobar" });
    fireEvent.click(aprobar);
    fireEvent.click(aprobar);
    expect(decidirSolicitudRh).toHaveBeenCalledTimes(1);
    expect(decidirSolicitudRh).toHaveBeenCalledWith("sesion", 41, true, undefined);
    expect(aprobar).toBeDisabled();
    await act(async () => resolver({ id: 41, estado: "APROBADA" }));
    await waitFor(() => expect(screen.getByText("Sin solicitudes de personal")).toBeInTheDocument());
    expect(listarMisSolicitudesRh).toHaveBeenCalledTimes(2);
  });

  it("exige motivo antes de rechazar y envía el texto sin espacios sobrantes", async () => {
    vi.mocked(listarMisSolicitudesRh).mockResolvedValueOnce([solicitud]).mockResolvedValueOnce([]);
    vi.mocked(decidirSolicitudRh).mockResolvedValue({});
    render(<SolicitudesRhPendientes token="sesion" />);
    fireEvent.click(await screen.findByRole("button", { name: "Rechazar" }));
    const confirmar = screen.getByRole("button", { name: "Confirmar rechazo" });
    expect(confirmar).toBeDisabled();
    fireEvent.change(screen.getByRole("textbox", { name: "Motivo del rechazo" }), { target: { value: " a " } });
    expect(confirmar).toBeDisabled();
    expect(decidirSolicitudRh).not.toHaveBeenCalled();
    fireEvent.change(screen.getByRole("textbox", { name: "Motivo del rechazo" }), { target: { value: "  Falta justificar el cambio  " } });
    fireEvent.click(confirmar);
    await waitFor(() => expect(decidirSolicitudRh).toHaveBeenCalledWith("sesion", 41, false, "Falta justificar el cambio"));
    await screen.findByText("Sin solicitudes de personal");
  });

  it("conserva la solicitud y permite reintentar si falla la decisión", async () => {
    vi.mocked(listarMisSolicitudesRh).mockResolvedValue([solicitud]);
    vi.mocked(decidirSolicitudRh).mockRejectedValue(new Error("Sin permiso"));
    render(<SolicitudesRhPendientes token="sesion" />);
    fireEvent.click(await screen.findByRole("button", { name: "Aprobar" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "Reintentar" })).toBeInTheDocument());
    expect(screen.getByText(/Puesto propuesto: Coordinación/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Aprobar" })).toBeEnabled();
  });
});
