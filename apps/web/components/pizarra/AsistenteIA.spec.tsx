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
  altaRapidaCliente: vi.fn(),
}));

vi.mock("@/components/UserContext", () => ({
  useUser: () => ({ token: "tok", user: { id: 1, email: "gerencia@nexara.com.mx", isSuperAdmin: true } }),
}));
// El micrófono se prueba aparte; aquí solo estorba.
vi.mock("@/components/DictadoBoton", () => ({ default: () => null }));
// La onda dibuja en un canvas, que jsdom no tiene.
vi.mock("@/app/(panels)/erp/reuniones/OndaVoz", () => ({ default: () => null }));
const buscarClientesParecidos = vi.hoisted(() => vi.fn());
vi.mock("@/lib/sales-api", async (original) => ({
  ...(await original<typeof import("@/lib/sales-api")>()),
  buscarClientesParecidos,
}));
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

/** Abre con el lápiz el renglón `etiqueta` de la tarjeta `n`. */
async function abrir(usuario: ReturnType<typeof userEvent.setup>, etiqueta: string, n = 0) {
  await usuario.click(screen.getAllByRole("button", { name: `Editar ${etiqueta}` })[n]);
}

describe("AsistenteIA", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    buscarClientesParecidos.mockResolvedValue([]);
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

  it("muestra todo en renglones, abre solo lo que falta y crea las listas de una vez con su tiempo estimado", async () => {
    const usuario = userEvent.setup();
    render(<AsistenteIA />);
    await usuario.type(await screen.findByLabelText("Instrucción para la IA"), "que Carolina revise el DVR y Jorge compre conectores");
    await usuario.click(screen.getByRole("button", { name: /Preparar actividades/ }));

    // Lo que leerá quien la hace y la agenda que se guardará se leen de un vistazo.
    expect(await screen.findByText("El DVR de la caja no graba desde ayer.")).toBeInTheDocument();
    expect(screen.getByText(/24 oct, 9:00 a\. m\./)).toBeInTheDocument();
    expect(screen.getByText("2 h", { selector: "div" })).toBeInTheDocument();
    expect(screen.getByText("Servicio · Preventivo")).toBeInTheDocument();
    expect(screen.getByText("Tarea · Otro")).toBeInTheDocument();
    // Y se abren con el lápiz para cambiarlas.
    await abrir(usuario, "Cuándo", 1);
    expect(screen.getByLabelText(/^Último día/)).toHaveValue("2026-10-23");
    // A la compra le falta la duración: su renglón queda abierto y no se puede crear hasta elegirla.
    expect(screen.getByText("Indica cuánto tiempo toma.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Confirmar la que está lista" })).toBeEnabled();

    await usuario.selectOptions(screen.getByLabelText("Tiempo"), "30");
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
    await screen.findByText("Revisar DVR que no graba en CEDIS");
    await abrir(usuario, "Título");
    const titulo = screen.getByLabelText("Título");
    await usuario.clear(titulo);
    await usuario.type(titulo, "Cambiar DVR del CEDIS");
    await abrir(usuario, "Indicaciones");
    await usuario.clear(screen.getByLabelText("Indicaciones"));
    // Los campos de fecha no se teclean letra por letra en jsdom.
    await abrir(usuario, "Cuándo");
    fireEvent.change(screen.getByLabelText(/^Día/), { target: { value: "2026-10-27" } });
    await abrir(usuario, "Prioridad");
    await usuario.selectOptions(screen.getByLabelText("Prioridad"), "Alta");
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

    // El lugar se escribe o se elige de las sucursales del cliente (con sus datos).
    await abrir(usuario, "Cliente");
    const lugar = screen.getByLabelText(/^Lugar/);
    expect(lugar).toHaveValue("Nave 2");
    await usuario.clear(lugar);
    await usuario.type(lugar, "CEDIS Puebla");
    await abrir(usuario, "Cuándo");
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

  it("sin cliente registrado ofrece «+ Agregar cliente» con el nombre entendido y lo liga a las propuestas", async () => {
    const enToks: PropuestaActividad = {
      ...servicio,
      titulo: "Revisar cámaras en Toks",
      textoCliente: "Toks",
      cliente: null,
      payload: { ...servicio.payload, titulo: "Revisar cámaras en Toks", clientId: undefined, branchName: "Toks" },
    };
    const otraEnToks: PropuestaActividad = { ...enToks, titulo: "Llevar DVR a Toks", payload: { ...enToks.payload, titulo: "Llevar DVR a Toks" } };
    // Encontrado por la IA (aunque sea por parecido): no se ofrece el alta, no se duplica.
    const conCliente: PropuestaActividad = { ...servicio, textoCliente: "Talks" };
    api.interpretar.mockResolvedValue({
      propuestas: [enToks, otraEnToks, conCliente],
      aclaracion: null,
      uso: null,
      opciones: { clientes: [{ id: 1, nombre: "Grupo Tox" }], proyectos: [], sucursales: [] },
    });
    api.altaRapidaCliente.mockResolvedValue({ id: 77, nombre: "Toks" });
    const usuario = userEvent.setup();
    render(<AsistenteIA />);
    await usuario.type(await screen.findByLabelText("Instrucción para la IA"), "que Carolina revise las cámaras en talks");
    await usuario.click(screen.getByRole("button", { name: /Preparar actividades/ }));

    expect(await screen.findAllByRole("option", { name: "+ Agregar cliente «Toks»" })).toHaveLength(2);
    expect(screen.getAllByText(/Un servicio necesita un cliente registrado/)).toHaveLength(2);
    await usuario.selectOptions(screen.getAllByLabelText(/^Cliente/)[0], "+ Agregar cliente «Toks»");

    // Queda elegido en las dos tarjetas que dijeron «Toks», pero nada se crea hasta confirmar.
    await waitFor(() => expect(screen.getAllByText("Nuevo: alta al confirmar")).toHaveLength(2));
    expect(api.altaRapidaCliente).not.toHaveBeenCalled();
    await abrir(usuario, "Cliente");
    expect(screen.queryByRole("option", { name: "+ Agregar cliente «Toks»" })).not.toBeInTheDocument();
    expect(screen.getByRole("option", { name: "Toks (cliente nuevo)" })).toBeInTheDocument();
    expect(screen.getByLabelText(/^Lugar/)).toHaveValue("");

    await usuario.click(screen.getAllByRole("button", { name: "Confirmar y asignar" })[0]);
    await waitFor(() => expect(api.crearActividad).toHaveBeenCalledTimes(1));
    expect(api.altaRapidaCliente).toHaveBeenCalledWith("tok", "Toks", { tipo: "servicio", confirmarNuevo: false });
    const cuerpo = api.crearActividad.mock.calls[0][1];
    expect(cuerpo).toMatchObject({ clientId: 77, titulo: "Revisar cámaras en Toks" });
    expect(cuerpo.branchName).toBeUndefined();

    // La otra tarjeta usa el mismo cliente: no se da de alta dos veces.
    await waitFor(() => expect(screen.getAllByRole("button", { name: "Confirmar y asignar" }).length).toBe(2));
    await usuario.click(screen.getAllByRole("button", { name: "Confirmar y asignar" })[0]);
    await waitFor(() => expect(api.crearActividad).toHaveBeenCalledTimes(2));
    expect(api.altaRapidaCliente).toHaveBeenCalledTimes(1);
    expect(api.crearActividad.mock.calls[1][1]).toMatchObject({ clientId: 77, titulo: "Llevar DVR a Toks" });
  });

  it("el caso de la captura: todo propuesto, se confirma sin tocar nada y sigue siendo editable", async () => {
    const comandera: PropuestaActividad = {
      ...servicio,
      resumen: "Servicio para José Antonio Ramírez en Toks hoy 09:30 · a más tardar 17:00",
      titulo: "Reparar comandera en Toks",
      indicaciones: null,
      textoResponsable: "Antonio",
      responsable: { id: 39, nombre: "José Antonio Ramírez" },
      responsableOrigen: "probable",
      responsableCandidatos: [
        { id: 39, nombre: "José Antonio Ramírez" },
        { id: 61, nombre: "Antonio Hernández" },
      ],
      textoCliente: "Toks",
      cliente: null,
      clienteNuevo: "Toks",
      agenda: { dia: "2026-10-24", hora: "09:30", hasta: null, horaDicha: false, diaDicho: true, compromiso: "17:00" },
      duracionMin: 180,
      duracionOrigen: "estimada",
      duracionDetalle: "Servicio correctivo 120 min + Ida 30 min + Vuelta 30 min",
      avisos: ["«Antonio» puede ser José Antonio Ramírez o Antonio Hernández: propongo a José Antonio Ramírez porque puede recibir servicios. Cámbialo si era otra persona."],
      notaResponsable: "«Antonio» puede ser José Antonio Ramírez o Antonio Hernández: propongo a José Antonio Ramírez porque puede recibir servicios. Cámbialo si era otra persona.",
      payload: {
        titulo: "Reparar comandera en Toks",
        coreKind: "servicio",
        ticketType: "CORRECTIVO",
        creadoPorId: 1,
        responsableId: 39,
        prioridad: "Media",
        tiempoEstimadoMin: 180,
        fechaInicio: "2026-10-24T15:30:00.000Z",
        fechaEntregaEsperada: "2026-10-24T23:00:00.000Z",
        fechaMaxima: "2026-10-24T23:00:00.000Z",
        assignmentCharge: "ejecucion",
      },
    };
    api.personasAsignables.mockResolvedValue([
      { id: 39, nombre: "José Antonio Ramírez", email: "jose.ramirez@nexara.com.mx" },
      { id: 61, nombre: "Antonio Hernández", email: "antonio.hernandez@nexara.com.mx", horaEntrada: "08:00" },
    ]);
    api.interpretar.mockResolvedValue({ propuestas: [comandera], aclaracion: null, uso: null, opciones: { clientes: [{ id: 41, nombre: "IPADE" }], proyectos: [], sucursales: [] } });
    api.altaRapidaCliente.mockResolvedValue({ id: 77, nombre: "Toks" });
    const usuario = userEvent.setup();
    render(<AsistenteIA />);
    await usuario.type(await screen.findByLabelText("Instrucción para la IA"), "que antonio vaya a toks a arreglar una comandera");
    await usuario.click(screen.getByRole("button", { name: /Preparar actividades/ }));

    // Todo lleno de un vistazo: persona, cliente nuevo y tiempo estimado, cada uno diciendo de dónde salió.
    expect(await screen.findByText("José Antonio Ramírez")).toBeInTheDocument();
    expect(screen.getByText("También puede ser Antonio Hernández")).toBeInTheDocument();
    expect(screen.getByText("Nuevo: alta al confirmar")).toBeInTheDocument();
    expect(screen.getByText("3 h")).toBeInTheDocument();
    expect(screen.getByText("Estimado")).toBeInTheDocument();
    expect(screen.getByText(/a más tardar 5:00 p\. m\./)).toBeInTheDocument();
    expect(screen.getByText("La reparte a su equipo")).toBeInTheDocument();
    // Lo que dice su renglón no se repite abajo; al abrirlo se lee el porqué.
    expect(screen.queryByText(/propongo a José Antonio Ramírez/)).not.toBeInTheDocument();
    const confirmar = screen.getByRole("button", { name: "Confirmar y asignar" });
    expect(confirmar).toBeEnabled();

    // Editable: el otro Antonio solo recibe tareas, así que el trabajo pasa a la tarea equivalente.
    await abrir(usuario, "Responsable");
    expect(screen.getByText(/propongo a José Antonio Ramírez porque puede recibir servicios/)).toBeInTheDocument();
    const responsable = screen.getByLabelText("Responsable");
    expect(responsable).toHaveValue("39");
    await usuario.selectOptions(responsable, "61");
    expect(screen.getByText("Tarea · Correctivo y diagnóstico")).toBeInTheDocument();
    expect(confirmar).toBeEnabled();
    await usuario.selectOptions(responsable, "39");
    await abrir(usuario, "Tipo");
    await usuario.selectOptions(screen.getAllByLabelText(/^Tipo/)[0], "servicio");

    await usuario.click(confirmar);
    await waitFor(() => expect(api.crearActividad).toHaveBeenCalledTimes(1));
    expect(api.altaRapidaCliente).toHaveBeenCalledWith("tok", "Toks", { tipo: "servicio", confirmarNuevo: false });
    expect(api.crearActividad.mock.calls[0][1]).toMatchObject({ responsableId: 39, clientId: 77, coreKind: "servicio", tiempoEstimadoMin: 180, assignmentCharge: "despacho" });
  });

  it("elegir otro cliente cancela el alta; sin ninguno, un servicio vuelve a pedirlo", async () => {
    const enToks: PropuestaActividad = {
      ...servicio,
      textoCliente: "Toks",
      cliente: null,
      clienteNuevo: "Toks",
      payload: { ...servicio.payload, clientId: undefined },
    };
    api.interpretar.mockResolvedValue({ propuestas: [enToks], aclaracion: null, uso: null, opciones: { clientes: [{ id: 41, nombre: "IPADE" }], proyectos: [], sucursales: [] } });
    const usuario = userEvent.setup();
    render(<AsistenteIA />);
    await usuario.type(await screen.findByLabelText("Instrucción para la IA"), "que Carolina vaya a toks");
    await usuario.click(screen.getByRole("button", { name: /Preparar actividades/ }));
    await screen.findByText("Nuevo: alta al confirmar");
    expect(screen.getByRole("button", { name: "Confirmar y asignar" })).toBeEnabled();
    await abrir(usuario, "Cliente");

    await usuario.selectOptions(screen.getByLabelText(/^Cliente/), "");
    expect(screen.getByText(/Un servicio necesita un cliente registrado/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Confirmar y asignar" })).toBeDisabled();

    await usuario.selectOptions(screen.getByLabelText(/^Cliente/), "IPADE");
    await usuario.click(screen.getByRole("button", { name: "Confirmar y asignar" }));
    await waitFor(() => expect(api.crearActividad).toHaveBeenCalledTimes(1));
    expect(api.altaRapidaCliente).not.toHaveBeenCalled();
    expect(api.crearActividad.mock.calls[0][1]).toMatchObject({ clientId: 41 });
  });

  describe("cliente de último momento", () => {
    const enBenemerita: PropuestaActividad = {
      ...servicio,
      textoCliente: "Benemérita Universidad Autónoma de Puebla",
      clienteNuevo: "Benemérita Universidad Autónoma de Puebla",
      cliente: null,
      payload: { ...servicio.payload, clientId: undefined },
    };
    const BUAP = {
      id: 17,
      nombre: "BUAP",
      razonSocial: null,
      tipos: ["COMERCIAL"],
      porque: "Son las siglas de ese nombre",
      confianza: "alta",
      origen: "codigo",
      puedeUsar: true,
      serviceClientId: 34,
    };
    const preparar = async (propuesta: PropuestaActividad) => {
      api.interpretar.mockResolvedValue({ propuestas: [propuesta], aclaracion: null, uso: null, opciones: { clientes: [{ id: 1, nombre: "Grupo Tox" }], proyectos: [], sucursales: [] } });
      const usuario = userEvent.setup();
      render(<AsistenteIA />);
      await usuario.type(await screen.findByLabelText("Instrucción para la IA"), "algo");
      await usuario.click(screen.getByRole("button", { name: /Preparar actividades/ }));
      return usuario;
    };

    it("si el cliente propuesto se parece a otro, avisa y no deja confirmar hasta decidir", async () => {
      buscarClientesParecidos.mockResolvedValue([BUAP]);
      await preparar(enBenemerita);
      expect(await screen.findByText("¿Ya existe este cliente?")).toBeInTheDocument();
      expect(screen.getByText("«Benemérita Universidad Autónoma de Puebla» se parece a:")).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Confirmar y asignar" })).toBeDisabled();
      expect(api.altaRapidaCliente).not.toHaveBeenCalled();
    });

    it("«Usar BUAP» pone ese cliente en la tarjeta y no crea otro", async () => {
      buscarClientesParecidos.mockResolvedValue([BUAP]);
      api.altaRapidaCliente.mockResolvedValue({ id: 34, nombre: "BUAP" });
      const usuario = await preparar(enBenemerita);
      await usuario.click(await screen.findByRole("button", { name: "Usar BUAP" }));
      await waitFor(() => expect(api.altaRapidaCliente).toHaveBeenCalledWith("tok", "BUAP", { tipo: "servicio", reutilizarId: 17 }));
      const confirmar = await screen.findByRole("button", { name: "Confirmar y asignar" });
      await waitFor(() => expect(confirmar).toBeEnabled());
      await usuario.click(confirmar);
      await waitFor(() => expect(api.crearActividad).toHaveBeenCalledTimes(1));
      expect(api.crearActividad.mock.calls[0][1]).toMatchObject({ clientId: 34 });
      expect(api.altaRapidaCliente).toHaveBeenCalledTimes(1);
    });

    it("«Crear otro de todos modos» lo da de alta al confirmar", async () => {
      buscarClientesParecidos.mockResolvedValue([BUAP]);
      api.altaRapidaCliente.mockResolvedValue({ id: 90, nombre: "Benemérita Universidad Autónoma de Puebla" });
      const usuario = await preparar(enBenemerita);
      await usuario.click(await screen.findByRole("button", { name: "Crear otro de todos modos" }));
      const confirmar = await screen.findByRole("button", { name: "Confirmar y asignar" });
      await waitFor(() => expect(confirmar).toBeEnabled());
      await usuario.click(confirmar);
      await waitFor(() => expect(api.crearActividad).toHaveBeenCalledTimes(1));
      expect(api.altaRapidaCliente).toHaveBeenCalledWith("tok", "Benemérita Universidad Autónoma de Puebla", { tipo: "servicio", confirmarNuevo: true });
    });

    it("un cliente que la frase no dijo se puede escribir", async () => {
      api.altaRapidaCliente.mockResolvedValue({ id: 91, nombre: "Toks" });
      const usuario = await preparar({ ...servicio, cliente: null, textoCliente: null, payload: { ...servicio.payload, clientId: undefined } });
      await usuario.selectOptions(await screen.findByLabelText(/^Cliente/), "+ Escribir otro cliente…");
      await usuario.type(await screen.findByPlaceholderText("Nombre del cliente"), "Toks");
      await usuario.click(screen.getByRole("button", { name: "Usar" }));
      expect(await screen.findByText("Nuevo: alta al confirmar")).toBeInTheDocument();
      await waitFor(() => expect(buscarClientesParecidos).toHaveBeenCalledWith("tok", { nombre: "Toks" }));
      expect(api.altaRapidaCliente).not.toHaveBeenCalled();
      await usuario.click(screen.getByRole("button", { name: "Confirmar y asignar" }));
      await waitFor(() => expect(api.crearActividad).toHaveBeenCalledTimes(1));
      expect(api.altaRapidaCliente).toHaveBeenCalledWith("tok", "Toks", { tipo: "servicio", confirmarNuevo: false });
    });
  });

  it("si el alta del cliente falla al confirmar, lo dice, no crea la actividad y deja reintentar", async () => {
    const enToks: PropuestaActividad = {
      ...servicio,
      textoCliente: "Toks",
      cliente: null,
      payload: { ...servicio.payload, clientId: undefined, branchName: "Toks" },
    };
    api.interpretar.mockResolvedValue({ propuestas: [enToks], aclaracion: null, uso: null, opciones: { clientes: [], proyectos: [] } });
    api.altaRapidaCliente.mockRejectedValue(new Error("No tienes permiso para dar de alta clientes."));
    const usuario = userEvent.setup();
    render(<AsistenteIA />);
    await usuario.type(await screen.findByLabelText("Instrucción para la IA"), "que Carolina vaya a toks");
    await usuario.click(screen.getByRole("button", { name: /Preparar actividades/ }));
    await usuario.selectOptions(await screen.findByLabelText(/^Cliente/), "+ Agregar cliente «Toks»");
    expect(api.altaRapidaCliente).not.toHaveBeenCalled();
    await usuario.click(screen.getByRole("button", { name: "Confirmar y asignar" }));
    expect(await screen.findByText(/No se pudo dar de alta «Toks»: No tienes permiso para dar de alta clientes/)).toBeInTheDocument();
    expect(api.crearActividad).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Confirmar y asignar" })).toBeEnabled();
  });

  it("una hora límite antes del inicio no deja crear", async () => {
    api.interpretar.mockResolvedValue({ propuestas: [servicio], aclaracion: null, uso: null });
    const usuario = userEvent.setup();
    render(<AsistenteIA />);
    await usuario.type(await screen.findByLabelText("Instrucción para la IA"), "que Carolina revise el DVR");
    await usuario.click(screen.getByRole("button", { name: /Preparar actividades/ }));
    await screen.findByText("Revisar DVR que no graba en CEDIS");
    await abrir(usuario, "Cuándo");
    fireEvent.change(screen.getByLabelText(/^Entregar a más tardar/), { target: { value: "08:00" } });
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

    await abrir(usuario, "Tipo", 1);
    const tipo = screen.getByLabelText(/^Tipo$|^Tipo \*/);
    // Solo los tipos que esa persona recibe (las reglas de «Asignar»).
    expect([...(tipo as HTMLSelectElement).options].map((o) => o.value)).toEqual(["tarea", "servicio", "proyecto"]);
    await usuario.selectOptions(tipo, "servicio");
    await usuario.selectOptions(screen.getByLabelText(/^Tipo de servicio/), "CORRECTIVO");
    // Un servicio pide cliente: su renglón se abre solo y se elige de la lista de la empresa.
    expect(screen.getByText(/Un servicio necesita un cliente registrado/)).toBeInTheDocument();
    await usuario.selectOptions(screen.getByLabelText(/^Cliente/), "2");
    await usuario.selectOptions(screen.getByLabelText("Tiempo"), "60");
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
