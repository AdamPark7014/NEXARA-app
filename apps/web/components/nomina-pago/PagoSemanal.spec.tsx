import React from "react";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import * as api from "@/lib/nomina-pago-api";
import PagoSemanal from "./PagoSemanal";

vi.mock("@/lib/nomina-pago-api", async () => {
  const real = await vi.importActual<typeof api>("@/lib/nomina-pago-api");
  return { ...real, semanaPago: vi.fn(), detallePago: vi.fn(), ajustarPago: vi.fn(), registrarPago: vi.fn() };
});

const m = vi.mocked(api);
const saldo = { sugerido: 2640, ajustes: 150, final: 2790, pagado: 1500, saldo: 1290 };
const semana = (extra: Partial<api.SemanaPago> = {}): api.SemanaPago => ({
  semana: { inicio: "2026-11-16", fin: "2026-11-22", estado: "BORRADOR" },
  montosOcultos: false,
  puedeAjustar: true,
  puedeRegistrar: true,
  filas: [{ userId: 5, nombre: "Efraín", puesto: null, area: "Instalación", extraPendienteMin: 45, saldo, estado: "parcial" }],
  totales: { ...saldo, porPagar: 1, completas: 0, parciales: 1 },
  ...extra,
});
const detalle = (extra: Partial<api.DetallePagoSemanal> = {}): api.DetallePagoSemanal => ({
  semana: "2026-11-16",
  fin: "2026-11-22",
  userId: 5,
  nombre: "Efraín",
  estadoSemana: "BORRADOR",
  puedeAjustar: true,
  puedeRegistrar: true,
  saldo,
  estado: "parcial",
  extraPendienteMin: 45,
  comoSeCalculo: [{ clave: "sueldo", titulo: "Sueldo de la semana", monto: 2640, detalle: "Semana completa" }],
  movimientos: [{ id: "a1", tipo: "ajuste", monto: 150, motivo: "Cubrió guardia", autorNombre: "Paulina", at: "2026-11-23T16:00:00Z" }],
  ...extra,
});

beforeEach(() => {
  vi.clearAllMocks();
  m.semanaPago.mockResolvedValue(semana());
  m.detallePago.mockResolvedValue(detalle());
  m.registrarPago.mockResolvedValue({ ok: true, id: 1, pagoId: null, aviso: null });
  m.ajustarPago.mockResolvedValue({ ok: true });
});

const abrir = async (u: ReturnType<typeof userEvent.setup>) => {
  render(<PagoSemanal token="t" semana="2026-11-16" />);
  await u.click(await screen.findByRole("button", { name: "Ver el cálculo de Efraín" }));
  const panel = await screen.findByRole("dialog");
  await within(panel).findByText("Saldo por pagar");
  return panel;
};

describe("PagoSemanal", () => {
  it("explica el cálculo con sus ajustes y la extra sin autorizar", async () => {
    const panel = await abrir(userEvent.setup());
    expect(within(panel).getByText("Sueldo de la semana")).toBeInTheDocument();
    expect(within(panel).getByText(/Cubrió guardia\. Lo puso Paulina, lunes 23/)).toBeInTheDocument();
    expect(within(panel).getByText(/Quedan 45 min extra sin autorizar/)).toBeInTheDocument();
  });

  it("registra con el saldo propuesto y no manda más de lo que falta", async () => {
    const u = userEvent.setup();
    const panel = await abrir(u);
    await u.click(within(panel).getByRole("button", { name: "Registrar pago" }));
    const monto = within(panel).getByLabelText(/^Monto/);
    expect(monto).toHaveValue("1290.00");
    fireEvent.change(monto, { target: { value: "1,290.01" } });
    await u.click(within(panel).getByRole("button", { name: /^Registrar \$/ }));
    expect(await within(panel).findByText(/Solo faltan \$1,290\.00/)).toBeInTheDocument();
    expect(m.registrarPago).not.toHaveBeenCalled();
    fireEvent.change(monto, { target: { value: "1,290.00" } });
    await u.dblClick(within(panel).getByRole("button", { name: "Registrar $1,290.00" }));
    await waitFor(() => expect(m.registrarPago).toHaveBeenCalledTimes(1));
    expect(m.registrarPago.mock.calls[0][1]).toMatchObject({ semana: "2026-11-16", userId: 5, monto: 1290, forma: "transferencia" });
  });

  it("si el pago falla, conserva lo escrito y vuelve a leer el saldo", async () => {
    const u = userEvent.setup();
    const panel = await abrir(u);
    await u.click(within(panel).getByRole("button", { name: "Registrar pago" }));
    m.registrarPago.mockRejectedValueOnce(new Error("Solo faltan $500.00 por pagar"));
    await u.click(within(panel).getByRole("button", { name: "Registrar $1,290.00" }));
    expect(await within(panel).findByText(/Solo faltan \$500\.00/)).toBeInTheDocument();
    expect(within(panel).getByLabelText(/^Monto/)).toHaveValue("1290.00");
    expect(m.detallePago).toHaveBeenCalledTimes(2);
  });

  it("el ajuste pide monto y motivo", async () => {
    const u = userEvent.setup();
    const panel = await abrir(u);
    await u.click(within(panel).getByRole("button", { name: "Ajustar" }));
    await u.click(within(panel).getByRole("button", { name: "Guardar ajuste" }));
    expect(await within(panel).findByText(/Escribe cuánto/)).toBeInTheDocument();
    fireEvent.change(within(panel).getByLabelText(/Cuánto sumar/), { target: { value: "-120" } });
    fireEvent.change(within(panel).getByLabelText("Motivo"), { target: { value: "Herramienta perdida" } });
    await u.click(within(panel).getByRole("button", { name: "Guardar ajuste" }));
    await waitFor(() => expect(m.ajustarPago).toHaveBeenCalledWith("t", { semana: "2026-11-16", userId: 5, monto: -120, motivo: "Herramienta perdida" }));
  });

  it("sin permiso solo se ve el cálculo; con montos ocultos no hay cifras", async () => {
    m.semanaPago.mockResolvedValue(semana({ puedeRegistrar: false, puedeAjustar: false }));
    m.detallePago.mockResolvedValue(detalle({ puedeRegistrar: false, puedeAjustar: false }));
    const panel = await abrir(userEvent.setup());
    expect(within(panel).queryByRole("button", { name: "Registrar pago" })).toBeNull();
    expect(within(panel).queryByRole("button", { name: "Ajustar" })).toBeNull();
  });

  it("montos ocultos y error de carga no se confunden con vacío", async () => {
    m.semanaPago.mockResolvedValueOnce(semana({ montosOcultos: true, totales: null, filas: [] }));
    const { unmount } = render(<PagoSemanal token="t" semana="2026-11-16" />);
    expect(await screen.findByText("Montos ocultos")).toBeInTheDocument();
    unmount();
    m.semanaPago.mockRejectedValueOnce(new Error("HTTP 500"));
    render(<PagoSemanal token="t" semana="2026-11-16" />);
    expect(await screen.findByText("No se pudieron cargar los pagos")).toBeInTheDocument();
  });

  it("leerMonto acepta formatos de pesos y rechaza lo demás", () => {
    expect(api.leerMonto("$1,234.50")).toBe(1234.5);
    expect(api.leerMonto("−120")).toBe(-120);
    for (const t of ["", "abc", "1.234", "1e5"]) expect(api.leerMonto(t)).toBeNull();
  });
});
