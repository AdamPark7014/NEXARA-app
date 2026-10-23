import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { PropuestaActividad } from "@/lib/asistente-ia-api";

const api = vi.hoisted(() => ({
  estadoAsistente: vi.fn(),
  personasAsignables: vi.fn(),
  interpretar: vi.fn(),
  crearActividad: vi.fn(),
  sumarAlEquipo: vi.fn(),
}));

vi.mock("@/components/UserContext", () => ({
  useUser: () => ({ token: "tok", user: { id: 1, email: "gerencia@nexara.com.mx", isSuperAdmin: true } }),
}));
// El micrófono se prueba aparte; aquí solo estorba.
vi.mock("@/components/DictadoBoton", () => ({ default: () => null }));
vi.mock("@/lib/asistente-ia-api", async (original) => ({ ...(await original<typeof import("@/lib/asistente-ia-api")>()), ...api }));

import AsistenteIA from "./AsistenteIA";

const servicio: PropuestaActividad = {
  tipo: "servicio",
  tipoEtiqueta: "Servicio",
  razonTipo: "Falla en sitio del cliente",
  resumen: "Servicio para Carolina Pérez en Grupo Tox mañana 09:00",
  titulo: "Revisar DVR que no graba en CEDIS",
  textoResponsable: "Carolina",
  responsable: { id: 8, nombre: "Carolina Pérez" },
  responsableCandidatos: [],
  textoCliente: "Tox",
  cliente: { id: 1, nombre: "Grupo Tox" },
  clienteCandidatos: [],
  sucursal: null,
  proyecto: null,
  proyectoCandidatos: [],
  fechaInicio: "2026-10-24T15:00:00.000Z",
  agenda: { dia: "2026-10-24", hora: "09:00", hasta: null, horaDicha: true },
  duracionMin: 120,
  prioridad: "Media",
  encargo: null,
  indicaciones: "El DVR de la caja no graba desde ayer.",
  faltantes: [],
  avisos: [],
  payload: {
    titulo: "Revisar DVR que no graba en CEDIS",
    indicaciones: "El DVR de la caja no graba desde ayer.",
    coreKind: "servicio",
    creadoPorId: 1,
    responsableId: 8,
    clientId: 1,
    prioridad: "Media",
    tiempoEstimadoMin: 120,
    fechaInicio: "2026-10-24T15:00:00.000Z",
    fechaEntregaEsperada: "2026-10-24T15:00:00.000Z",
    fechaMaxima: "2026-10-24T15:00:00.000Z",
  },
};

/** «Jorge, para el viernes compra 20 conectores»: plazo, sin duración. */
const compra: PropuestaActividad = {
  ...servicio,
  tipo: "tarea",
  tipoEtiqueta: "Tarea",
  razonTipo: "Compra de material",
  resumen: "Tarea · Compra de material para Jorge Méndez hoy 10:35 · vence vie 23 oct",
  titulo: "Comprar 20 conectores RJ45",
  textoResponsable: "Jorge",
  responsable: { id: 7, nombre: "Jorge Méndez" },
  cliente: null,
  textoCliente: null,
  agenda: { dia: "2026-10-21", hora: "10:35", hasta: "2026-10-23", horaDicha: false },
  duracionMin: null,
  indicaciones: null,
  faltantes: ["duración"],
  payload: {
    titulo: "Comprar 20 conectores RJ45",
    coreKind: "tarea",
    creadoPorId: 1,
    responsableId: 7,
    prioridad: "Media",
    fechaInicio: "2026-10-21T16:35:00.000Z",
    fechaEntregaEsperada: "2026-10-21T16:35:00.000Z",
    fechaMaxima: "2026-10-21T16:35:00.000Z",
    periodoInicio: "2026-10-21",
    periodoFin: "2026-10-23",
  },
};

describe("AsistenteIA", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    api.estadoAsistente.mockResolvedValue({ disponible: true, modelo: "claude-haiku-5-5" });
    api.personasAsignables.mockResolvedValue([
      { id: 8, nombre: "Carolina Pérez", email: "soporte@nexara.com.mx" },
      { id: 7, nombre: "Jorge Méndez", email: "compras@ejemplo.mx" },
    ]);
    api.interpretar.mockResolvedValue({
      propuestas: [servicio, compra],
      aclaracion: null,
      uso: { modelo: "claude-haiku-5-5", tokensEntrada: 4000, tokensSalida: 300, usdAprox: 0.0003 },
    });
    let id = 100;
    api.crearActividad.mockImplementation(async () => ({ id: ++id, anNumber: `AN-0${id}` }));
    api.sumarAlEquipo.mockResolvedValue({});
  });

  it("muestra todos los campos, pide lo que falta y crea las listas de una vez con su tiempo estimado", async () => {
    const usuario = userEvent.setup();
    render(<AsistenteIA />);
    await usuario.type(await screen.findByLabelText("Instrucción para la IA"), "que Carolina revise el DVR y Jorge compre conectores");
    await usuario.click(screen.getByRole("button", { name: "Interpretar" }));

    // Lo que leerá quien la hace y la agenda que se guardará, editables antes de crear.
    expect(await screen.findByText("El DVR de la caja no graba desde ayer.")).toBeInTheDocument();
    expect(screen.getAllByLabelText(/^Día|^Del/)[0]).toHaveValue("2026-10-24");
    expect(screen.getAllByLabelText(/Al \(último día/)[1]).toHaveValue("2026-10-23");
    // A la compra le falta la duración: no se puede crear hasta elegirla.
    expect(screen.getByText(/No lo dijiste: elige cuánto tarda/)).toBeInTheDocument();
    expect(screen.getByText("Indica cuánto tiempo toma.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Confirmar la que está lista" })).toBeEnabled();

    await usuario.selectOptions(screen.getAllByLabelText(/Cuánto tiempo toma/)[1], "30");
    await usuario.click(screen.getByRole("button", { name: "Confirmar las 2 que están listas" }));

    await waitFor(() => expect(api.crearActividad).toHaveBeenCalledTimes(2));
    expect(api.crearActividad.mock.calls[0][1]).toMatchObject({ responsableId: 8, clientId: 1, tiempoEstimadoMin: 120 });
    expect(api.crearActividad.mock.calls[1][1]).toMatchObject({ responsableId: 7, tiempoEstimadoMin: 30, periodoFin: "2026-10-23" });
    // Como «Asignar»: el responsable queda en el equipo con su tiempo estimado.
    expect(api.sumarAlEquipo).toHaveBeenCalledWith("tok", 101, { userId: 8, rol: "LEAD", horasPlan: 2 });
    expect(api.sumarAlEquipo).toHaveBeenCalledWith("tok", 102, { userId: 7, rol: "LEAD", horasPlan: 0.5 });
    expect(await screen.findByText("Listo. Todo quedó asignado.")).toBeInTheDocument();
  });

  it("deja corregir título, indicaciones, día y prioridad antes de crear", async () => {
    api.interpretar.mockResolvedValue({ propuestas: [servicio], aclaracion: null, uso: null });
    const usuario = userEvent.setup();
    render(<AsistenteIA />);
    await usuario.type(await screen.findByLabelText("Instrucción para la IA"), "que Carolina revise el DVR");
    await usuario.click(screen.getByRole("button", { name: "Interpretar" }));
    await usuario.click(await screen.findByRole("button", { name: "Editar texto" }));
    const titulo = screen.getByLabelText(/^Título/);
    await usuario.clear(titulo);
    await usuario.type(titulo, "Cambiar DVR del CEDIS");
    await usuario.clear(screen.getByLabelText(/^Indicaciones/));
    // Los campos de fecha no se teclean letra por letra en jsdom.
    fireEvent.change(screen.getByLabelText(/^Día/), { target: { value: "2026-10-27" } });
    await usuario.selectOptions(screen.getByLabelText(/^Prioridad/), "Alta");
    await usuario.click(screen.getByRole("button", { name: "Confirmar y asignar" }));

    await waitFor(() => expect(api.crearActividad).toHaveBeenCalledTimes(1));
    const cuerpo = api.crearActividad.mock.calls[0][1];
    expect(cuerpo).toMatchObject({ titulo: "Cambiar DVR del CEDIS", prioridad: "Alta", fechaInicio: "2026-10-27T15:00:00.000Z" });
    expect(cuerpo.indicaciones).toBeUndefined();
  });

  it("si la IA no contesta, avisa claro y deja el texto para reintentar", async () => {
    api.interpretar.mockRejectedValueOnce(new Error("La IA tardó demasiado en contestar."));
    const usuario = userEvent.setup();
    render(<AsistenteIA />);
    const caja = await screen.findByLabelText("Instrucción para la IA");
    await usuario.type(caja, "que Carolina revise el DVR");
    await usuario.click(screen.getByRole("button", { name: "Interpretar" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(/tardó demasiado.*Tu instrucción sigue aquí/);
    expect(caja).toHaveValue("que Carolina revise el DVR");
    expect(screen.getByRole("button", { name: "Interpretar" })).toBeEnabled();
  });
});
