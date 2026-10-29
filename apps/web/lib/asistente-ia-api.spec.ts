import { describe, expect, it, vi } from "vitest";

const ventas = vi.hoisted(() => ({ createSalesClient: vi.fn(), provisionSalesServiceClient: vi.fn() }));
vi.mock("@/lib/sales-api", () => ventas);
import {
  agendaFinal,
  altaRapidaCliente,
  bloqueos,
  correccionDe,
  lugarEfectivo,
  nombreParaAlta,
  pasoEquipo,
  payloadFinal,
  reglaEncargo,
  subtipoEfectivo,
  textoCorreccion,
  type PropuestaActividad,
  type SucursalOpcion,
} from "./asistente-ia-api";

const base: PropuestaActividad = {
  tipo: "servicio",
  tipoEtiqueta: "Servicio",
  razonTipo: "Revisión técnica",
  resumen: "Servicio para (sin responsable) en Tox hoy 15:00",
  titulo: "Revisar cámaras",
  textoResponsable: "Juan",
  responsable: null,
  responsableCandidatos: [
    { id: 9, nombre: "Juan González" },
    { id: 10, nombre: "Juan Sánchez" },
  ],
  textoCliente: "Tox",
  cliente: null,
  clienteCandidatos: [{ id: 1, nombre: "TOX Logística" }],
  sucursal: null,
  proyecto: null,
  proyectoCandidatos: [],
  fechaInicio: null,
  agenda: { dia: null, hora: null, hasta: null, horaDicha: false },
  duracionMin: null,
  prioridad: "Media",
  encargo: null,
  indicaciones: null,
  faltantes: ["responsable", "cliente", "fecha", "duración"],
  avisos: [],
  payload: { titulo: "Revisar cámaras", coreKind: "servicio", creadoPorId: 1 },
};

/** Una propuesta completa: «que Carolina revise mañana a las 9 las cámaras de Tox, 2 horas». */
const lista: PropuestaActividad = {
  ...base,
  responsable: { id: 8, nombre: "Carolina Pérez" },
  responsableCandidatos: [],
  cliente: { id: 1, nombre: "TOX Logística" },
  clienteCandidatos: [],
  agenda: { dia: "2026-10-24", hora: "09:00", hasta: null, horaDicha: true },
  duracionMin: 120,
  faltantes: [],
  payload: {
    titulo: "Revisar cámaras",
    coreKind: "servicio",
    creadoPorId: 1,
    responsableId: 8,
    clientId: 1,
    tiempoEstimadoMin: 120,
    fechaInicio: "2026-10-24T15:00:00.000Z",
    fechaEntregaEsperada: "2026-10-24T15:00:00.000Z",
    fechaMaxima: "2026-10-24T15:00:00.000Z",
  },
};

describe("asistente IA en la pizarra", () => {
  it("aplica lo que se eligió en la tarjeta", () => {
    expect(payloadFinal(base, { responsableId: 9, clientId: 1 })).toMatchObject({ responsableId: 9, clientId: 1 });
    expect(payloadFinal({ ...base, payload: { ...base.payload, clientId: 4 } }, { clientId: null }).clientId).toBeUndefined();
    const texto = payloadFinal(lista, { titulo: "  Revisar DVR  ", indicaciones: " ", prioridad: "Alta", duracionMin: 90 });
    expect(texto).toMatchObject({ titulo: "Revisar DVR", prioridad: "Alta", tiempoEstimadoMin: 90 });
    expect(texto.indicaciones).toBeUndefined();
  });

  it("sin cambiar la agenda se manda la de la IA tal cual", () => {
    const p = payloadFinal(lista, {});
    expect(p.fechaInicio).toBe("2026-10-24T15:00:00.000Z");
    expect(p.periodoFin).toBeUndefined();
  });

  it("día, hora y último día se guardan como el formulario «Asignar» (hora de CDMX)", () => {
    const varios = payloadFinal(lista, { hora: "10:30", hasta: "2026-10-28" });
    expect(varios).toMatchObject({
      fechaInicio: "2026-10-24T16:30:00.000Z",
      fechaEntregaEsperada: "2026-10-24T16:30:00.000Z",
      fechaMaxima: "2026-10-24T16:30:00.000Z",
      periodoInicio: "2026-10-24",
      periodoFin: "2026-10-28",
    });
    // Quitar el día deja la actividad sin fechas.
    const sinDia = payloadFinal(lista, { dia: "" });
    expect(sinDia.fechaInicio).toBeUndefined();
    expect(sinDia.fechaMaxima).toBeUndefined();
    // Un último día antes del primero no se manda (y la tarjeta lo bloquea).
    expect(payloadFinal(lista, { hasta: "2026-10-20" }).periodoFin).toBeUndefined();
    expect(agendaFinal(base, { dia: "2026-10-24" })).toEqual({ dia: "2026-10-24", hora: "09:00", hasta: null, horaDicha: false, compromiso: null });
  });

  it("no deja crear sin responsable, cliente, día del servicio ni tiempo estimado", () => {
    expect(bloqueos(base, base.payload, {})).toEqual([
      "Elige a quién se le asigna.",
      "Un servicio necesita un cliente registrado.",
      "Indica el día del servicio.",
      "Indica cuánto tiempo toma.",
    ]);
    expect(bloqueos(lista, payloadFinal(lista, {}), {})).toEqual([]);
    const alReves = { hasta: "2026-10-20" };
    expect(bloqueos(lista, payloadFinal(lista, alReves), { agenda: agendaFinal(lista, alReves) })).toEqual([
      "El último día no puede ser antes del primero.",
    ]);
  });

  it("respeta los tipos que recibe cada persona", () => {
    const payload = payloadFinal(lista, { responsableId: 9 });
    // Juan (campo de David) recibe tarea/proyecto/obra, no servicio.
    expect(
      bloqueos(lista, payload, { creadorEmail: "gerencia@nexara.com.mx", destinoEmail: "juan.gonzalez@nexara.com.mx" }),
    ).toEqual(["A esta persona no se le puede asignar servicio."]);
    expect(bloqueos(lista, payload, { creadorEmail: "gerencia@nexara.com.mx", destinoEmail: "soporte@nexara.com.mx" })).toEqual([]);
  });

  it("encargo con las reglas de «Asignar»", () => {
    // Luis + servicio: siempre despacho, aunque la IA dijera ejecución.
    const luis = "direccion.operaciones@nexara.com.mx";
    expect(payloadFinal({ ...lista, encargo: "ejecucion" }, {}, { destinoEmail: luis }).assignmentCharge).toBe("despacho");
    expect(reglaEncargo("tarea", luis, null)).toEqual({ valor: "ejecucion", fijo: true, ofrecer: false });
    // David elige: sin elegir, no se crea.
    const david = "operaciones@nexara.com.mx";
    const obra = { ...lista, tipo: "obra" as const, tipoEtiqueta: "Obra", payload: { ...lista.payload, coreKind: "obra", projectId: 3 } };
    expect(bloqueos(obra, payloadFinal(obra, {}, { destinoEmail: david }), { destinoEmail: david, creadorEmail: "gerencia@nexara.com.mx" })).toContain(
      "Elige si la hace en persona o la reparte a su equipo.",
    );
    expect(payloadFinal(obra, { encargo: "despacho" }, { destinoEmail: david }).assignmentCharge).toBe("despacho");
    // A quien no reparte no se le pone encargo.
    expect(payloadFinal({ ...lista, encargo: "despacho" }, {}, { destinoEmail: "soporte@nexara.com.mx" }).assignmentCharge).toBeUndefined();
  });

  it("después de crear, el responsable queda con su tiempo estimado (y el cupo en el despacho)", () => {
    expect(pasoEquipo(lista, payloadFinal(lista, {}), "soporte@nexara.com.mx")).toEqual({ userId: 8, rol: "LEAD", horasPlan: 2 });
    expect(pasoEquipo(lista, payloadFinal(lista, { duracionMin: 90 }), "jose.ramirez@nexara.com.mx")).toEqual({
      userId: 8,
      rol: "LEAD",
      horasPlan: 1.5,
      indicaciones: "Cupo: 1 persona.",
    });
    expect(pasoEquipo(base, base.payload)).toBeNull();
  });

  it("cambiar el tipo rehace los campos como el API (coreKind, activityType, ticketType, ticketTypeCustom)", () => {
    const proyectos = [{ id: 30, nombre: "CCTV Nave 2", clientId: 5 }];
    // Servicio → tarea Junta.
    const tarea = payloadFinal(lista, { tipo: "tarea", subtipo: "Junta" });
    expect(tarea).toMatchObject({ coreKind: "tarea", activityType: "INTERNAL", ticketType: "OTRO", ticketTypeCustom: "Junta" });
    // Servicio → obra: proyecto (y su cliente) y la etapa propuesta.
    const obra = payloadFinal(lista, { tipo: "obra", projectId: 30, etapaId: 7 }, { proyectos });
    expect(obra).toMatchObject({ coreKind: "obra", activityType: "CLIENT", ticketType: "INSTALACION", projectId: 30, clientId: 5, projectMilestoneId: 7 });
    expect(obra.ticketTypeCustom).toBeUndefined();
    // Sin proyecto, una obra no se crea.
    expect(bloqueos(lista, payloadFinal(lista, { tipo: "obra" }), {})).toContain("Elige el proyecto.");
    // Comercial y de vuelta a servicio: el subtipo por omisión de cada uno.
    expect(payloadFinal(lista, { tipo: "comercial" })).toMatchObject({ ticketType: "OTRO", ticketTypeCustom: "COMERCIAL" });
    expect(subtipoEfectivo({ ...lista, tipo: "tarea", payload: { ...lista.payload, ticketTypeCustom: "Entrega" } }, { tipo: "servicio" })).toBe("PREVENTIVO");
    expect(subtipoEfectivo(lista, { tipo: "tarea" })).toBe("Otro");
  });

  it("«Entregar a más tardar» deja la fecha máxima y la entrega a esa hora (sin periodo)", () => {
    const p = payloadFinal(lista, { compromiso: "13:30" });
    expect(p).toMatchObject({
      fechaInicio: "2026-10-24T15:00:00.000Z",
      fechaMaxima: "2026-10-24T19:30:00.000Z",
      fechaEntregaEsperada: "2026-10-24T19:30:00.000Z",
    });
    // La que propuso la IA se respeta; borrarla vuelve al fin del día.
    const conIA = { ...lista, agenda: { ...lista.agenda!, compromiso: "18:00" } };
    expect(payloadFinal(conIA, { compromiso: "" }).fechaMaxima).toBe("2026-10-24T15:00:00.000Z");
    // Con varios días no aplica: vence el último.
    expect(agendaFinal(conIA, { hasta: "2026-10-26" }).compromiso).toBeNull();
    // Antes de la hora de inicio, no se crea.
    const mal = { ...lista.agenda!, compromiso: "08:00" };
    expect(bloqueos(lista, payloadFinal(lista, { compromiso: "08:00" }), { agenda: mal })).toContain(
      "«Entregar a más tardar» tiene que ser después de la hora de inicio.",
    );
  });

  it("el lugar se escribe libre o se toma de una sucursal del cliente con sus datos", () => {
    const sucursales: SucursalOpcion[] = [
      { id: 60, nombre: "CEDIS Puebla", clientId: 1, branchNumber: "7", city: "Puebla", state: "Puebla", address: "Av. 1" },
      { id: 61, nombre: "CEDIS Puebla", clientId: 2, branchNumber: "9", city: "Cholula", state: "Puebla", address: null },
    ];
    expect(payloadFinal(lista, { lugar: "cedis puebla" }, { sucursales })).toMatchObject({
      branchName: "CEDIS Puebla",
      branchNumber: "7",
      branchCity: "Puebla",
      branchAddress: "Av. 1",
    });
    const libre = payloadFinal(lista, { lugar: " Tienda Maja " }, { sucursales });
    expect(libre.branchName).toBe("Tienda Maja");
    expect(libre.branchNumber).toBeUndefined();
    expect(payloadFinal({ ...lista, payload: { ...lista.payload, branchName: "Talks" } }, { lugar: "" }).branchName).toBeUndefined();
    expect(lugarEfectivo({ ...lista, payload: { ...lista.payload, branchName: "Nave 2" } }, {})).toBe("Nave 2");
  });

  it("si se cambia el cliente, la sucursal de la IA (de otro cliente) no se arrastra", () => {
    const conSucursal: PropuestaActividad = {
      ...lista,
      sucursal: { id: 60, nombre: "CEDIS Puebla" },
      payload: { ...lista.payload, branchName: "CEDIS Puebla", branchNumber: "7", branchCity: "Puebla" },
    };
    const otro = payloadFinal(conSucursal, { clientId: 2 });
    expect(otro.clientId).toBe(2);
    expect(otro.branchName).toBeUndefined();
    expect(otro.branchNumber).toBeUndefined();
    expect(payloadFinal(conSucursal, {}).branchNumber).toBe("7");
  });

  it("un título vacío no se crea (no vuelve en silencio al de la IA)", () => {
    const p = payloadFinal(lista, { titulo: "   " });
    expect(p.titulo).toBe("");
    expect(bloqueos(lista, p, {})).toContain("Escribe el título.");
  });

  it("las correcciones de nombres se dicen en su campo", () => {
    const p: PropuestaActividad = {
      ...lista,
      correcciones: [
        { campo: "cliente", de: "talks", a: "TOX Logística", como: "parecido" },
        { campo: "responsable", de: "Caro", a: "Carolina Pérez", como: "apodo" },
      ],
    };
    expect(textoCorreccion(correccionDe(p, "cliente"))).toBe("Corregido de «talks»");
    expect(textoCorreccion(correccionDe(p, "responsable"))).toBe("Dijiste «Caro»");
    expect(correccionDe(p, "lugar")).toBeNull();
    // Un API anterior no manda correcciones.
    expect(correccionDe(lista, "cliente")).toBeNull();
  });

  it("alta rápida de cliente: con el nombre entendido y nunca si ya hay uno igual o la IA lo encontró", () => {
    const sinCliente: PropuestaActividad = { ...base, textoCliente: "Talk", payload: { ...base.payload, branchName: "Toks" } };
    // El lugar ya corregido manda sobre lo que escribió la IA; lo escrito en la tarjeta, sobre ambos.
    expect(nombreParaAlta(sinCliente, {}, [])).toBe("Toks");
    expect(nombreParaAlta(sinCliente, { lugar: "Toks Angelópolis" }, [])).toBe("Toks Angelópolis");
    expect(nombreParaAlta({ ...sinCliente, payload: base.payload }, {}, [])).toBe("Talk");
    // Igual a uno de la lista (sin acentos ni mayúsculas): no se duplica.
    expect(nombreParaAlta(sinCliente, {}, [{ id: 3, nombre: "TOKS." }])).toBeNull();
    // La IA lo encontró (aunque sea por parecido): tampoco.
    expect(nombreParaAlta(lista, {}, [])).toBeNull();
    expect(nombreParaAlta({ ...base, textoCliente: null }, {}, [])).toBeNull();
  });

  it("el alta rápida es la del formulario: corporativo solo con el nombre y activado para operación", async () => {
    ventas.createSalesClient.mockResolvedValueOnce({ id: 40, name: "Toks", serviceClientId: null });
    ventas.provisionSalesServiceClient.mockResolvedValueOnce({ serviceClient: { id: 77 } });
    await expect(altaRapidaCliente("tok", " Toks ")).resolves.toEqual({ id: 77, nombre: "Toks" });
    expect(ventas.createSalesClient).toHaveBeenCalledWith("tok", { name: "Toks", status: "Activo", tipo: "CORPORATIVO", altaRapida: true });
    // Si el padrón ya lo tenía activado, no se vuelve a activar.
    ventas.createSalesClient.mockResolvedValueOnce({ id: 41, name: "Sephora", serviceClientId: 12 });
    await expect(altaRapidaCliente("tok", "Sephora")).resolves.toEqual({ id: 12, nombre: "Sephora" });
    expect(ventas.provisionSalesServiceClient).toHaveBeenCalledTimes(1);
  });
});
