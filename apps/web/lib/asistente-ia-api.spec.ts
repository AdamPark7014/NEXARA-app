import { describe, expect, it } from "vitest";
import { agendaFinal, bloqueos, pasoEquipo, payloadFinal, reglaEncargo, subtipoEfectivo, type PropuestaActividad } from "./asistente-ia-api";

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
    expect(agendaFinal(base, { dia: "2026-10-24" })).toEqual({ dia: "2026-10-24", hora: "09:00", hasta: null, horaDicha: false });
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
});
