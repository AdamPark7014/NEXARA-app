import React from "react";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
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
// La onda dibuja en un canvas, que jsdom no tiene.
vi.mock("@/app/(panels)/erp/reuniones/OndaVoz", () => ({ default: () => null }));
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
      // Del equipo de soporte: recibe tarea, proyecto y servicio.
      { id: 7, nombre: "Jorge Méndez", email: "alejandro.gonzalez@nexara.com.mx" },
    ]);
    api.interpretar.mockResolvedValue({
      propuestas: [servicio, compra],
      aclaracion: null,
      uso: { modelo: "claude-haiku-5-5", tokensEntrada: 4000, tokensSalida: 300, usdAprox: 0.0003 },
      opciones: {
        clientes: [
          { id: 1, nombre: "Grupo Tox" },
          { id: 2, nombre: "Banorte" },
        ],
        proyectos: [{ id: 30, nombre: "CCTV Nave 2", clientId: 1 }],
      },
    });
    let id = 100;
    api.crearActividad.mockImplementation(async () => ({ id: ++id, anNumber: `AN-0${id}` }));
    api.sumarAlEquipo.mockResolvedValue({});
  });

  it("muestra todos los campos, pide lo que falta y crea las listas de una vez con su tiempo estimado", async () => {
    const usuario = userEvent.setup();
    render(<AsistenteIA />);
    await usuario.type(await screen.findByLabelText("Instrucción para la IA"), "que Carolina revise el DVR y Jorge compre conectores");
    await usuario.click(screen.getByRole("button", { name: /Preparar actividades/ }));

    // Lo que leerá quien la hace y la agenda que se guardará, editables antes de crear.
    expect(await screen.findByDisplayValue("El DVR de la caja no graba desde ayer.")).toBeInTheDocument();
    expect(screen.getAllByLabelText(/^Día|^Del/)[0]).toHaveValue("2026-10-24");
    expect(screen.getAllByLabelText(/^Último día/)[1]).toHaveValue("2026-10-23");
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
    await usuario.click(screen.getByRole("button", { name: /Preparar actividades/ }));
    // Título e indicaciones están a la vista como campos, sin abrir nada.
    const titulo = await screen.findByLabelText(/^Título/);
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

  it("dice qué nombre corrigió («talks» → Grupo Tox) y deja corregir lugar y hora límite", async () => {
    const corregida: PropuestaActividad = {
      ...servicio,
      titulo: "Revisar NVR en Tox",
      textoCliente: "Talks",
      correcciones: [
        { campo: "cliente", de: "talks", a: "Grupo Tox", como: "parecido" },
        { campo: "responsable", de: "Caro", a: "Carolina Pérez", como: "apodo" },
      ],
      payload: { ...servicio.payload, titulo: "Revisar NVR en Tox", branchName: "Nave 2" },
    };
    api.interpretar.mockResolvedValue({
      propuestas: [corregida],
      aclaracion: null,
      uso: null,
      opciones: {
        clientes: [{ id: 1, nombre: "Grupo Tox" }],
        proyectos: [],
        sucursales: [{ id: 60, nombre: "CEDIS Puebla", clientId: 1, branchNumber: "7", city: "Puebla", state: "Puebla", address: null }],
      },
    });
    const usuario = userEvent.setup();
    render(<AsistenteIA />);
    await usuario.type(await screen.findByLabelText("Instrucción para la IA"), "que caro vaya a talks");
    await usuario.click(screen.getByRole("button", { name: /Preparar actividades/ }));

    expect(await screen.findByText("Corregido de «talks»")).toBeInTheDocument();
    expect(screen.getByText("Dijiste «Caro»")).toBeInTheDocument();
    expect(screen.getByText(/Nombres corregidos: «talks» → Grupo Tox · «Caro» es Carolina Pérez/)).toBeInTheDocument();

    // El lugar se escribe o se elige de las sucursales del cliente (con sus datos).
    const lugar = screen.getByLabelText(/^Lugar/);
    expect(lugar).toHaveValue("Nave 2");
    await usuario.clear(lugar);
    await usuario.type(lugar, "CEDIS Puebla");
    fireEvent.change(screen.getByLabelText(/^Entregar a más tardar/), { target: { value: "13:30" } });
    await usuario.click(screen.getByRole("button", { name: "Confirmar y asignar" }));

    await waitFor(() => expect(api.crearActividad).toHaveBeenCalledTimes(1));
    expect(api.crearActividad.mock.calls[0][1]).toMatchObject({
      clientId: 1,
      branchName: "CEDIS Puebla",
      branchNumber: "7",
      branchCity: "Puebla",
      fechaInicio: "2026-10-24T15:00:00.000Z",
      fechaMaxima: "2026-10-24T19:30:00.000Z",
      fechaEntregaEsperada: "2026-10-24T19:30:00.000Z",
    });
  });

  it("una hora límite antes del inicio no deja crear", async () => {
    api.interpretar.mockResolvedValue({ propuestas: [servicio], aclaracion: null, uso: null });
    const usuario = userEvent.setup();
    render(<AsistenteIA />);
    await usuario.type(await screen.findByLabelText("Instrucción para la IA"), "que Carolina revise el DVR");
    await usuario.click(screen.getByRole("button", { name: /Preparar actividades/ }));
    fireEvent.change(await screen.findByLabelText(/^Entregar a más tardar/), { target: { value: "08:00" } });
    expect(screen.getByText("Tiene que ser después de la hora de inicio.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Confirmar y asignar" })).toBeDisabled();
  });

  it("si la IA no contesta, avisa claro y deja el texto para reintentar", async () => {
    api.interpretar.mockRejectedValueOnce(new Error("La IA tardó demasiado en contestar."));
    const usuario = userEvent.setup();
    render(<AsistenteIA />);
    const caja = await screen.findByLabelText("Instrucción para la IA");
    await usuario.type(caja, "que Carolina revise el DVR");
    await usuario.click(screen.getByRole("button", { name: /Preparar actividades/ }));
    expect(await screen.findByRole("alert")).toHaveTextContent(/tardó demasiado.*Tu instrucción sigue aquí/);
    expect(caja).toHaveValue("que Carolina revise el DVR");
    expect(screen.getByRole("button", { name: /Preparar actividades/ })).toBeEnabled();
  });

  it("se puede cambiar el tipo: una compra pasa a servicio con su cliente y su tipo de servicio", async () => {
    const usuario = userEvent.setup();
    render(<AsistenteIA />);
    await usuario.type(await screen.findByLabelText("Instrucción para la IA"), "que Jorge compre conectores");
    await usuario.click(screen.getByRole("button", { name: /Preparar actividades/ }));
    expect(await screen.findByText(/Esto entendí · 2 actividades/)).toBeInTheDocument();

    const tipo = screen.getAllByLabelText(/^Tipo$|^Tipo \*/)[1];
    // Solo los tipos que esa persona recibe (las reglas de «Asignar»).
    expect([...(tipo as HTMLSelectElement).options].map((o) => o.value)).toEqual(["tarea", "servicio", "proyecto"]);
    await usuario.selectOptions(tipo, "servicio");
    await usuario.selectOptions(screen.getAllByLabelText(/^Tipo de servicio/)[1], "CORRECTIVO");
    // Un servicio pide cliente: se elige de la lista de la empresa.
    expect(screen.getByText(/Un servicio necesita un cliente registrado/)).toBeInTheDocument();
    await usuario.selectOptions(screen.getAllByLabelText(/^Cliente/)[1], "2");
    await usuario.selectOptions(screen.getAllByLabelText(/Cuánto tiempo toma/)[1], "60");
    await usuario.click(screen.getAllByRole("button", { name: "Confirmar y asignar" })[1]);

    await waitFor(() => expect(api.crearActividad).toHaveBeenCalledTimes(1));
    expect(api.crearActividad.mock.calls[0][1]).toMatchObject({
      coreKind: "servicio",
      activityType: "INTERNAL",
      ticketType: "CORRECTIVO",
      clientId: 2,
      tiempoEstimadoMin: 60,
    });
    expect(api.crearActividad.mock.calls[0][1].ticketTypeCustom).toBeUndefined();
  });

  it("al dictar, el texto sale en vivo y al terminar se prepara solo (una llamada)", async () => {
    class Falso {
      static ultimo: Falso | null = null;
      lang = "";
      continuous = false;
      interimResults = false;
      onresult: ((e: { resultIndex: number; results: unknown[] }) => void) | null = null;
      onerror: ((e: { error: string }) => void) | null = null;
      onend: (() => void) | null = null;
      start = vi.fn();
      stop = vi.fn(() => queueMicrotask(() => this.onend?.()));
      abort = vi.fn(() => queueMicrotask(() => this.onend?.()));
      constructor() {
        Falso.ultimo = this;
      }
    }
    (window as unknown as { webkitSpeechRecognition?: unknown }).webkitSpeechRecognition = Falso;
    try {
      const usuario = userEvent.setup();
      render(<AsistenteIA />);
      await usuario.click(await screen.findByRole("button", { name: "Dictar la instrucción" }));
      expect(screen.getByText(/Te escucho/)).toBeInTheDocument();
      act(() =>
        Falso.ultimo!.onresult?.({ resultIndex: 0, results: [{ isFinal: false, 0: { transcript: "que Carolina revise el DVR" } }] }),
      );
      expect(screen.getByLabelText("Instrucción para la IA")).toHaveValue("que Carolina revise el DVR");
      expect(api.interpretar).not.toHaveBeenCalled();
      await usuario.click(screen.getByRole("button", { name: "Terminar de dictar" }));
      await waitFor(() => expect(api.interpretar).toHaveBeenCalledTimes(1));
      expect(api.interpretar).toHaveBeenCalledWith("tok", "que Carolina revise el DVR");
      expect(await screen.findByText(/Esto entendí/)).toBeInTheDocument();
      expect(screen.getByText("El dictado usa el reconocimiento de voz de tu navegador.")).toBeInTheDocument();
    } finally {
      delete (window as unknown as { webkitSpeechRecognition?: unknown }).webkitSpeechRecognition;
    }
  });
});
