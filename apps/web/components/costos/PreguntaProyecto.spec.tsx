import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/components/UserContext", () => ({ useUser: () => ({ token: "jwt" }) }));

const getAcceso = vi.fn();
const getSugerenciaDeLiga = vi.fn();
const ligarActividad = vi.fn();
vi.mock("@/lib/costos", async (original) => ({
  ...(await original<typeof import("@/lib/costos")>()),
  getAcceso: (...a: unknown[]) => getAcceso(...a),
  getSugerenciaDeLiga: (...a: unknown[]) => getSugerenciaDeLiga(...a),
  ligarActividad: (...a: unknown[]) => ligarActividad(...a),
}));

import PreguntaProyecto from "./PreguntaProyecto";

const PROYECTOS = [
  { id: 5, nombre: "Videovigilancia Plaza Norte" },
  { id: 6, nombre: "Redes Hotel Centro" },
];
const CON_SUGERENCIA = {
  pendiente: true,
  sugerencia: { tipo: "PROYECTO", id: 5, nombre: "Videovigilancia Plaza Norte", motivo: "Mismo cliente", fuente: "REGLA" },
  proyectos: PROYECTOS,
};

beforeEach(() => {
  vi.clearAllMocks();
  getAcceso.mockResolvedValue({ veTodo: false, puedeLigar: true });
  ligarActividad.mockResolvedValue({ ok: true });
});

describe("la actividad pregunta de qué proyecto es", () => {
  it("con sugerencia: un toque la liga y ya no vuelve a preguntar", async () => {
    getSugerenciaDeLiga.mockResolvedValue(CON_SUGERENCIA);
    render(<PreguntaProyecto activityId={12} />);
    fireEvent.click(await screen.findByRole("button", { name: "Sí, ligarla" }));
    await waitFor(() => expect(ligarActividad).toHaveBeenCalledWith("jwt", 12, "PROYECTO", 5));
    expect(await screen.findByRole("status")).toHaveTextContent("Ligada a Videovigilancia Plaza Norte");
    expect(screen.queryByRole("button", { name: "Es interna" })).not.toBeInTheDocument();
  });

  it("otro proyecto: se elige de la lista", async () => {
    getSugerenciaDeLiga.mockResolvedValue(CON_SUGERENCIA);
    render(<PreguntaProyecto activityId={12} />);
    fireEvent.click(await screen.findByRole("button", { name: "Otro proyecto" }));
    const ligar = screen.getByRole("button", { name: "Ligarla" });
    expect(ligar).toBeDisabled();
    fireEvent.change(screen.getByLabelText("Elegir proyecto"), { target: { value: "6" } });
    fireEvent.click(ligar);
    await waitFor(() => expect(ligarActividad).toHaveBeenCalledWith("jwt", 12, "PROYECTO", 6));
  });

  it("es interna: se guarda sin proyecto", async () => {
    getSugerenciaDeLiga.mockResolvedValue(CON_SUGERENCIA);
    render(<PreguntaProyecto activityId={12} />);
    fireEvent.click(await screen.findByRole("button", { name: "Es interna" }));
    await waitFor(() => expect(ligarActividad).toHaveBeenCalledWith("jwt", 12, "INTERNA", null));
    expect(await screen.findByRole("status")).toHaveTextContent("trabajo interno");
  });

  it("sin sugerencia, pregunta y enseña la lista desde el principio", async () => {
    getSugerenciaDeLiga.mockResolvedValue({ pendiente: true, sugerencia: null, proyectos: PROYECTOS });
    render(<PreguntaProyecto activityId={12} />);
    expect(await screen.findByText("¿De qué proyecto es esta actividad?")).toBeInTheDocument();
    expect(screen.getByLabelText("Elegir proyecto")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Sí, ligarla" })).not.toBeInTheDocument();
  });

  it("si ya tiene liga, no pregunta", async () => {
    getSugerenciaDeLiga.mockResolvedValue({ pendiente: false, sugerencia: null, proyectos: [] });
    const { container } = render(<PreguntaProyecto activityId={12} />);
    await waitFor(() => expect(getSugerenciaDeLiga).toHaveBeenCalled());
    expect(container.firstChild).toBeNull();
  });

  it("a quien no puede ligar no se le pregunta", async () => {
    getAcceso.mockResolvedValue({ veTodo: false, puedeLigar: false });
    const { container } = render(<PreguntaProyecto activityId={12} />);
    await waitFor(() => expect(getAcceso).toHaveBeenCalled());
    expect(getSugerenciaDeLiga).not.toHaveBeenCalled();
    expect(container.firstChild).toBeNull();
  });

  it("si guardar falla, lo dice y deja reintentar", async () => {
    getSugerenciaDeLiga.mockResolvedValue(CON_SUGERENCIA);
    ligarActividad.mockRejectedValue(new Error("Sin conexión"));
    render(<PreguntaProyecto activityId={12} />);
    fireEvent.click(await screen.findByRole("button", { name: "Sí, ligarla" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Sin conexión");
    expect(screen.getByRole("button", { name: "Sí, ligarla" })).toBeEnabled();
  });
});
