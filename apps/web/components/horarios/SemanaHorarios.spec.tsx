import React from "react";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import * as api from "@/lib/horarios-api";
import SemanaHorarios from "./SemanaHorarios";
import MiHorario from "./MiHorario";

vi.mock("@/lib/horarios-api", async () => {
  const real = await vi.importActual<typeof api>("@/lib/horarios-api");
  return {
    ...real,
    hoyMx: () => "2026-11-25",
    semanaHorarios: vi.fn(),
    miHorario: vi.fn(),
    plantillasTurno: vi.fn(async () => []),
    revisarProgramacion: vi.fn(),
    programarHorarios: vi.fn(),
    quitarHorario: vi.fn(),
  };
});

const m = vi.mocked(api);
const SIN: api.AvisosProgramacion = { solapes: [], descansoCorto: [], masDe6Seguidos: [], extraSobreTope: [] };
const CON: api.AvisosProgramacion = {
  ...SIN,
  descansoCorto: [{ userId: 5, nombre: "Rubén", fechaA: "2026-11-26", fechaB: "2026-11-27", horasDescanso: 1 }],
};

const dia = (fecha: string, extra: Partial<api.DiaHorario> = {}): api.DiaHorario => ({
  fecha,
  horario: { horaEntrada: "10:00", horaSalida: "18:00" },
  programado: false,
  trabaja: true,
  esDescansoHabitual: false,
  extraMin: 0,
  ...extra,
});
const fechas = Array.from({ length: 7 }, (_, i) => `2026-11-${23 + i}`);
const persona = (id: number, nombre: string, puede: boolean, cambios: Record<string, Partial<api.DiaHorario>> = {}): api.PersonaSemana => ({
  id,
  nombre,
  puesto: "Obra",
  puedeProgramar: puede,
  entradaHoyAt: null,
  jornadaAbierta: false,
  extraMin: id === 5 ? 900 : 0,
  dias: fechas.map((f) => dia(f, cambios[f])),
});

beforeEach(() => {
  vi.clearAllMocks();
  m.semanaHorarios.mockResolvedValue({
    from: "2026-11-23",
    to: "2026-11-29",
    hoy: "2026-11-25",
    topeExtraSemanaMin: 540,
    personas: [
      persona(1, "Luis", false),
      persona(5, "Rubén", true, {
        "2026-11-27": { programado: true, horario: { horaEntrada: "07:00", horaSalida: "15:00", motivo: "Obra" } },
        "2026-11-29": { trabaja: false },
      }),
    ],
  });
  m.revisarProgramacion.mockResolvedValue({ ok: true, creados: 0, avisos: SIN });
  m.programarHorarios.mockResolvedValue({ ok: true, creados: 1, avisos: SIN });
});

describe("SemanaHorarios", () => {
  it("solo deja tocar a su gente y los días de hoy en adelante; marca quien pasa el tope", async () => {
    render(<SemanaHorarios token="t" />);
    const tabla = await screen.findByRole("table");
    expect(within(tabla).getByRole("button", { name: /Rubén, viernes 27: 07:00–15:00, Obra/ })).toBeEnabled();
    expect(within(tabla).queryByRole("button", { name: /Rubén, lunes 23/ })).toBeNull();
    expect(within(tabla).queryByRole("button", { name: /Luis/ })).toBeNull();
    expect(within(tabla).getByText("arriba del tope")).toBeInTheDocument();
    expect(within(tabla).getByRole("button", { name: /domingo 29: Descansa/ })).toBeInTheDocument();
  });

  it("enseña los avisos antes de guardar y manda que se vieron", async () => {
    const u = userEvent.setup();
    m.revisarProgramacion.mockResolvedValue({ ok: true, creados: 0, avisos: CON });
    render(<SemanaHorarios token="t" />);
    await u.click(within(await screen.findByRole("table")).getByRole("button", { name: /Rubén, jueves 26/ }));
    expect(await screen.findByText("Rubén descansa solo 1 h")).toBeInTheDocument();
    await u.click(screen.getByRole("button", { name: "Guardar horario" }));
    await waitFor(() => expect(m.programarHorarios).toHaveBeenCalledTimes(1));
    expect(m.programarHorarios.mock.calls[0][1]).toMatchObject({ userIds: [5], fechas: ["2026-11-26"], horaEntrada: "10:00" });
    expect(m.programarHorarios.mock.calls[0][2]).toBe(true);
  });

  it("si el servidor encuentra avisos nuevos, no guarda y los enseña", async () => {
    const u = userEvent.setup();
    m.programarHorarios.mockResolvedValueOnce({ ok: false, requiereConfirmacion: true, creados: 0, avisos: CON });
    render(<SemanaHorarios token="t" />);
    await u.click(within(await screen.findByRole("table")).getByRole("button", { name: /Rubén, jueves 26/ }));
    await u.click(screen.getByRole("button", { name: "Guardar horario" }));
    expect(await screen.findByText(/Revisa estos avisos/)).toBeInTheDocument();
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });

  it("si falla, conserva lo escrito; horas iguales no se mandan", async () => {
    const u = userEvent.setup();
    m.programarHorarios.mockRejectedValueOnce(new Error("sin conexión"));
    render(<SemanaHorarios token="t" />);
    await u.click(within(await screen.findByRole("table")).getByRole("button", { name: /Rubén, jueves 26/ }));
    await u.type(screen.getByLabelText(/Motivo/), "Guardia");
    await u.click(screen.getByRole("button", { name: "Guardar horario" }));
    expect(await screen.findByRole("alert")).toBeInTheDocument();
    expect(screen.getByLabelText(/Motivo/)).toHaveValue("Guardia");
    fireEvent.change(screen.getByLabelText("Sale"), { target: { value: "10:00" } });
    await u.click(screen.getByRole("button", { name: "Guardar horario" }));
    expect(await screen.findByText(/no pueden ser iguales/)).toBeInTheDocument();
    expect(m.programarHorarios).toHaveBeenCalledTimes(1);
  });

  it("un día programado se puede regresar al de siempre", async () => {
    const u = userEvent.setup();
    m.quitarHorario.mockResolvedValue({ ok: true, quitados: 1 });
    render(<SemanaHorarios token="t" />);
    await u.click(within(await screen.findByRole("table")).getByRole("button", { name: /Rubén, viernes 27/ }));
    await u.click(screen.getByRole("button", { name: "Volver al de siempre" }));
    await waitFor(() => expect(m.quitarHorario).toHaveBeenCalledWith("t", { userId: 5, fecha: "2026-11-27" }));
  });

  it("un error de carga se ve y se reintenta; no parece equipo vacío", async () => {
    const u = userEvent.setup();
    m.semanaHorarios.mockRejectedValueOnce(new Error("HTTP 500"));
    render(<SemanaHorarios token="t" />);
    expect(await screen.findByText("No se pudieron cargar los horarios")).toBeInTheDocument();
    expect(screen.queryByText(/No tienes personas/)).toBeNull();
    await u.click(screen.getByRole("button", { name: "Reintentar" }));
    expect(await screen.findByRole("table")).toBeInTheDocument();
  });
});

describe("MiHorario", () => {
  it("dice quién lo cambió, la extra prevista y los descansos", async () => {
    m.miHorario.mockResolvedValue({
      hoy: "2026-11-25",
      entradaHoyAt: "2026-11-25T15:56:00.000Z",
      jornadaAbierta: true,
      dias: [
        { ...dia("2026-11-25", { programado: true, extraMin: 120, horario: { horaEntrada: "10:00", horaSalida: "20:00", motivo: "Cerrar rack" } }), loPuso: "Luis", ajuste: "extender" },
        { ...dia("2026-11-28", { trabaja: false }), loPuso: null, ajuste: null },
      ],
    });
    render(<MiHorario token="t" />);
    expect(await screen.findByText("10:00 a 20:00")).toBeInTheDocument();
    expect(screen.getByText("Extendido por Luis: Cerrar rack")).toBeInTheDocument();
    expect(screen.getByText(/Entraste 09:56\. Extra prevista: 2 h, por autorizar/)).toBeInTheDocument();
    expect(screen.getByText("Descansas")).toBeInTheDocument();
  });
});
