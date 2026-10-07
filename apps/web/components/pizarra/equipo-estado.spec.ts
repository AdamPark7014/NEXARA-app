import { describe, expect, it } from "vitest";
import {
  ARO_DE_ESTADO,
  CENTRO_OPERATIVO_EMAILS_EXCLUIDOS,
  actividadesDeTarjeta,
  atencionEquipo,
  contextoActividad,
  cuandoMx,
  desgloseRetraso,
  filtrarCentroOperativo,
  hayFlujo,
  iniciales,
  motivoSinActividad,
  queHace,
  resumenEquipo,
  ultimaActividad,
  ultimaActividadCorta,
} from "./equipo-estado";
import type { TeamBoardUser, WorkflowPipeline } from "@/lib/team-board-api";

function persona(parcial: Partial<TeamBoardUser> & Pick<TeamBoardUser, "id">): TeamBoardUser {
  return {
    nombre: "Ana Ruiz",
    email: `persona${parcial.id}@nexara.com.mx`,
    avatarUrl: null,
    puesto: "Técnico",
    status: "activo",
    currentActivity: null,
    clockInAt: null,
    workedMinutes: null,
    activityStartedAt: null,
    activityElapsedMinutes: null,
    ...parcial,
  };
}

/** Miércoles 07-10-2026, 12:20 en México (UTC−6). */
const AHORA = Date.parse("2026-10-07T18:20:00.000Z");
/** Hoy 10:05 en México. */
const ENTRADA_1005 = "2026-10-07T16:05:00.000Z";
/** Ayer (mar 6 oct) 18:11 en México. */
const AYER_1811 = "2026-10-07T00:11:00.000Z";
/** Lun 5 oct 18:11 en México. */
const LUNES_1811 = "2026-10-06T00:11:00.000Z";
/** Dom 4 oct 17:00 en México: hace 3 días. */
const DOMINGO_1700 = "2026-10-04T23:00:00.000Z";

const flujoVacio: WorkflowPipeline = {
  assigned: 0,
  started: 0,
  evidence: 0,
  closed: 0,
  peerRejected: 0,
  slaOnTime: 0,
  slaLate: 0,
  slaPct: null,
};

describe("resumenEquipo", () => {
  it("reduce los cinco estados a los tres aros y las cuentas suman el total", () => {
    const r = resumenEquipo([
      persona({ id: 1, status: "activo" }),
      persona({ id: 2, status: "atrasado" }),
      persona({ id: 3, status: "sin_actividad" }),
      persona({ id: 4, status: "libre" }),
      persona({ id: 5, status: "inactivo" }),
    ]);
    expect(r).toMatchObject({ trabajando: 1, retraso: 3, libres: 1, total: 5 });
    expect(r.trabajando + r.retraso + r.libres).toBe(r.total);
    expect(r.atrasados).toBe(1);
    expect(r.sinActividad).toBe(2);
  });

  it("sin nadie, todas las cifras son cero (la fila no se pinta, eso lo decide el componente)", () => {
    expect(resumenEquipo([])).toMatchObject({ trabajando: 0, retraso: 0, libres: 0, total: 0 });
  });

  it("el aro de cada estado: verde trabajando, ámbar retraso o sin nada, azul libre", () => {
    expect(ARO_DE_ESTADO.activo).toBe("trabajando");
    expect(ARO_DE_ESTADO.atrasado).toBe("retraso");
    expect(ARO_DE_ESTADO.sin_actividad).toBe("retraso");
    expect(ARO_DE_ESTADO.inactivo).toBe("retraso");
    expect(ARO_DE_ESTADO.libre).toBe("libre");
  });

  it("separa a quien no tiene nada: en jornada, sin entrada o ya salió (suman sinActividad)", () => {
    const r = resumenEquipo([
      persona({ id: 1, status: "atrasado" }),
      persona({ id: 2, status: "sin_actividad", entradaHoyAt: ENTRADA_1005, salidaHoyAt: null }),
      persona({ id: 3, status: "sin_actividad", entradaHoyAt: ENTRADA_1005, salidaHoyAt: null }),
      persona({ id: 4, status: "sin_actividad", entradaHoyAt: null, salidaHoyAt: null }),
      persona({ id: 5, status: "sin_actividad", entradaHoyAt: ENTRADA_1005, salidaHoyAt: "2026-10-07T18:02:00.000Z" }),
      persona({ id: 6, status: "libre", entradaHoyAt: ENTRADA_1005, salidaHoyAt: null }),
    ]);
    expect(r).toMatchObject({ atrasados: 1, sinNada: 2, sinEntrada: 1, yaSalieron: 1, sinActividad: 4, retraso: 5 });
    expect(r.sinNada + r.sinEntrada + r.yaSalieron).toBe(r.sinActividad);
  });

  it("API vieja (sin entradaHoyAt): todo el que no tiene nada cuenta como «sin nada», igual que antes", () => {
    const viejos = [persona({ id: 1, status: "sin_actividad" }), persona({ id: 2, status: "inactivo" })];
    expect(viejos.map(motivoSinActividad)).toEqual(["sinNada", "sinNada"]);
    expect(resumenEquipo(viejos)).toMatchObject({ sinNada: 2, sinEntrada: 0, yaSalieron: 0, sinActividad: 2 });
  });
});

describe("desgloseRetraso", () => {
  const base = resumenEquipo([]);

  it("dice cada grupo y omite los ceros", () => {
    expect(desgloseRetraso({ ...base, atrasados: 2, sinNada: 9, sinEntrada: 3 })).toBe(
      "2 atrasados · 9 sin nada asignado · 3 sin entrada",
    );
    expect(desgloseRetraso({ ...base, sinNada: 12 })).toBe("12 sin nada asignado");
    expect(desgloseRetraso({ ...base, atrasados: 1, yaSalieron: 1 })).toBe("1 atrasado · 1 ya salió");
  });

  it("todo en cero no dice «0 atrasados»", () => {
    expect(desgloseRetraso(base)).toBe("nadie atrasado ni sin nada asignado");
  });
});

describe("filtrarCentroOperativo", () => {
  it("deja fuera a Christian y a Claudia por correo, no por puesto ni por rol", () => {
    const equipo = [
      persona({ id: 1, nombre: "Luis Mora" }),
      persona({ id: 2, nombre: "Christian", email: "gerencia@nexara.com.mx", puesto: "Técnico de campo" }),
      persona({ id: 3, nombre: "Claudia Bernal", email: "claudia.bernal@nexara.com.mx", puesto: "Técnico de campo" }),
    ];
    expect(filtrarCentroOperativo(equipo).map((u) => u.id)).toEqual([1]);
  });

  it("los dos correos excluidos están declarados y son los que se filtran", () => {
    expect([...CENTRO_OPERATIVO_EMAILS_EXCLUIDOS]).toEqual([
      "gerencia@nexara.com.mx",
      "claudia.bernal@nexara.com.mx",
    ]);
  });

  it("no le importan las mayúsculas ni los espacios del correo", () => {
    const equipo = [persona({ id: 9, email: "  Gerencia@Nexara.com.MX " })];
    expect(filtrarCentroOperativo(equipo)).toEqual([]);
  });

  it("sin correo, la persona se queda: solo se excluye a quien se nombra", () => {
    expect(filtrarCentroOperativo([persona({ id: 4, email: "" })]).map((u) => u.id)).toEqual([4]);
  });
});

describe("queHace y contextoActividad", () => {
  const abierta = {
    id: 5,
    anNumber: "AN-1042",
    titulo: "Preparación de equipo: 6 cámaras para la sucursal norte",
    estatus: "En Proceso",
    evidenceStatus: "PENDIENTE",
    progressPct: 0,
    coreKind: "servicio",
    fechaFinalizacion: null,
  };

  it("el título de la actividad abierta va completo, sin cortar", () => {
    const u = persona({ id: 1, openActivities: [abierta] });
    expect(queHace(u)).toBe("Preparación de equipo: 6 cámaras para la sucursal norte");
  });

  it("sin nada abierto lo dice con todas sus letras", () => {
    const u = persona({ id: 1, status: "sin_actividad" });
    expect(queHace(u)).toBe("Sin actividad asignada");
    expect(actividadesDeTarjeta(u)).toEqual([]);
  });

  it("lista cada actividad con su estado, folio y título, y no dice que no hay", () => {
    const u = persona({
      id: 7,
      nombre: "Luis Joel Aguilar Castillo",
      status: "atrasado",
      openActivities: [
        {
          ...abierta,
          id: 1,
          anNumber: "AN-0001",
          titulo: "Actualizar archivo SLA",
          estatus: "Pendiente",
          atrasada: true,
          inicioRealAt: null,
        },
        {
          ...abierta,
          id: 2,
          anNumber: "AN-0002",
          titulo: "Visita de otro departamento",
          estatus: "En Proceso",
          atrasada: false,
          inicioRealAt: "2026-09-28T15:00:00.000Z",
        },
      ],
    });
    expect(actividadesDeTarjeta(u)).toEqual([
      { id: 1, estado: "Atrasada", folio: "AN-0001", titulo: "Actualizar archivo SLA" },
      { id: 2, estado: "En curso", folio: "AN-0002", titulo: "Visita de otro departamento" },
    ]);
    expect(queHace(u)).not.toBe("Sin actividad asignada");
  });

  it("si solo viene la actividad actual, el folio igual aparece", () => {
    const u = persona({
      id: 7,
      status: "atrasado",
      currentActivity: {
        id: 1,
        anNumber: "AN-0001",
        titulo: "Actualizar archivo SLA",
        estatus: "Pendiente",
        fechaMaxima: null,
        bucket: "daily",
      },
    });
    expect(actividadesDeTarjeta(u)).toEqual([
      { id: 1, estado: "Atrasada", folio: "AN-0001", titulo: "Actualizar archivo SLA" },
    ]);
  });

  it("el segundo renglón lleva folio, encargo y el atraso", () => {
    const u = persona({
      id: 1,
      status: "atrasado",
      currentLateMinutes: 135,
      openActivities: [{ ...abierta, assignmentCharge: "Despacho a equipo" }],
    });
    expect(contextoActividad(u)).toBe("AN-1042 · Despacho a equipo · Atrasada · 2 h 15 min");
  });

  it("sin nada abierto pero con algo terminado: «Última: <título>»", () => {
    const u = persona({
      id: 1,
      status: "sin_actividad",
      lastFinished: { id: 9, anNumber: "AN-0091", titulo: "Depurar base de clientes", finishedAt: AYER_1811, lateMinutes: 0 },
    });
    expect(queHace(u)).toBe("Última: Depurar base de clientes");
  });

  it("sin nada asignado: cuándo entró y desde hace cuánto no tiene nada", () => {
    const u = persona({
      id: 1,
      status: "sin_actividad",
      entradaHoyAt: ENTRADA_1005,
      salidaHoyAt: null,
      idleSinceAt: ENTRADA_1005,
    });
    expect(contextoActividad(u, AHORA)).toBe("Entró 10:05 · sin nada hace 2 h 15 min");
  });

  it("sin nada asignado: sin entrada hoy o ya salió", () => {
    expect(contextoActividad(persona({ id: 1, status: "sin_actividad", entradaHoyAt: null }), AHORA)).toBe(
      "Sin entrada hoy",
    );
    const salio = persona({
      id: 2,
      status: "sin_actividad",
      entradaHoyAt: ENTRADA_1005,
      salidaHoyAt: "2026-10-07T18:02:00.000Z",
      idleSinceAt: null,
    });
    expect(contextoActividad(salio, AHORA)).toBe("Salió 12:02");
  });

  it("API vieja (sin entradaHoyAt): el contexto se queda con el rótulo del estado", () => {
    expect(contextoActividad(persona({ id: 1, status: "sin_actividad" }), AHORA)).toBe("Sin nada asignado");
  });
});

describe("cuandoMx", () => {
  it("hoy, ayer o el día con nombre, en hora de México y 24 h", () => {
    expect(cuandoMx("2026-10-07T19:39:00.000Z", AHORA)).toBe("hoy 13:39");
    expect(cuandoMx(AYER_1811, AHORA)).toBe("ayer 18:11");
    expect(cuandoMx(LUNES_1811, AHORA)).toBe("lun 5 oct 18:11");
  });

  it("de otro año lleva el año; sin fecha, nada", () => {
    expect(cuandoMx("2025-10-06T00:11:00.000Z", AHORA)).toMatch(/^\S+ 5 oct 2025 18:11$/);
    expect(cuandoMx(null, AHORA)).toBe("");
    expect(cuandoMx("no es fecha", AHORA)).toBe("");
  });
});

describe("ultimaActividad", () => {
  it("folio, título recortado, cuándo y si fue a tiempo o con cuánto atraso", () => {
    const aTiempo = persona({
      id: 1,
      lastFinished: {
        id: 9,
        anNumber: "AN-0091",
        titulo: "Depurar base de clientes del portal de facturación",
        finishedAt: AYER_1811,
        lateMinutes: 0,
      },
    });
    expect(ultimaActividad(aTiempo, AHORA)).toBe(
      "Última: AN-0091 · Depurar base de clientes del portal de… · terminó ayer 18:11, a tiempo",
    );
    const tarde = persona({
      id: 2,
      lastFinished: { id: 9, anNumber: "AN-0091", titulo: "Depurar base", finishedAt: AYER_1811, lateMinutes: 40 },
    });
    expect(ultimaActividad(tarde, AHORA)).toBe("Última: AN-0091 · Depurar base · terminó ayer 18:11, con 40 min de atraso");
  });

  it("sin nada terminado lo dice; la versión corta es null", () => {
    expect(ultimaActividad(persona({ id: 1 }), AHORA)).toBe("Sin actividades terminadas");
    expect(ultimaActividadCorta(persona({ id: 1 }), AHORA)).toBeNull();
  });

  it("versión corta para la tarjeta: folio y cuándo", () => {
    const u = persona({
      id: 1,
      lastFinished: { id: 9, anNumber: "AN-0091", titulo: "Depurar base", finishedAt: AYER_1811, lateMinutes: null },
    });
    expect(ultimaActividadCorta(u, AHORA)).toBe("Última: AN-0091 · ayer 18:11");
  });
});

describe("atencionEquipo", () => {
  const actividad = (id: number, anNumber: string, titulo: string) => ({
    id,
    anNumber,
    titulo,
    estatus: "Pendiente",
    fechaMaxima: null,
    bucket: "daily" as const,
  });

  it("atrasados: más atraso primero, con folio, título, minutos y el motivo en palabras", () => {
    const a = atencionEquipo(
      [
        persona({
          id: 1,
          nombre: "Luis Mora",
          status: "atrasado",
          currentActivity: actividad(11, "AN-0011", "Instalar cámaras"),
          currentLateMinutes: 40,
          currentLateReason: "tope",
        }),
        persona({
          id: 2,
          nombre: "Daniela Paz",
          status: "atrasado",
          currentActivity: actividad(12, "AN-0012", "Levantamiento sucursal"),
          currentLateMinutes: 135,
          currentLateReason: "inicio",
        }),
        persona({
          id: 3,
          nombre: "Ana Ruiz",
          status: "atrasado",
          currentActivity: actividad(13, "AN-0013", "Reporte semanal"),
          currentLateMinutes: 20,
          currentLateReason: "plan",
        }),
        persona({ id: 4, status: "activo" }),
      ],
      AHORA,
    );
    expect(a.atrasados.map((x) => x.persona.id)).toEqual([2, 1, 3]);
    expect(a.atrasados[0]).toMatchObject({
      folio: "AN-0012",
      titulo: "Levantamiento sucursal",
      minutosAtraso: 135,
      motivo: "no la ha iniciado",
      detalle: "Atrasada · 2 h 15 min · no la ha iniciado",
    });
    expect(a.atrasados[1].motivo).toBe("pasó su hora límite");
    expect(a.atrasados[2].motivo).toBe("pasó su tiempo planeado");
  });

  it("atrasado sin motivo (API vieja): la más atrasada de sus abiertas, sin inventar el porqué", () => {
    const abierta = {
      estatus: "Pendiente",
      evidenceStatus: "PENDIENTE",
      progressPct: 0,
      coreKind: null,
      fechaFinalizacion: null,
    };
    const a = atencionEquipo(
      [
        persona({
          id: 1,
          status: "atrasado",
          openActivities: [
            { ...abierta, id: 1, anNumber: "AN-0001", titulo: "A tiempo", atrasada: false },
            { ...abierta, id: 2, anNumber: "AN-0002", titulo: "Poco tarde", atrasada: true, minutosAtraso: 10 },
            { ...abierta, id: 3, anNumber: "AN-0003", titulo: "Muy tarde", atrasada: true, minutosAtraso: 90 },
          ],
        }),
      ],
      AHORA,
    );
    expect(a.atrasados[0]).toMatchObject({
      folio: "AN-0003",
      titulo: "Muy tarde",
      minutosAtraso: 90,
      motivo: null,
      detalle: "Atrasada · 1 h 30 min",
    });
  });

  it("sin nada asignado: más tiempo sin nada primero, «desde que entró» y su última actividad", () => {
    const a = atencionEquipo(
      [
        persona({
          id: 1,
          nombre: "Luis Mora",
          status: "sin_actividad",
          entradaHoyAt: ENTRADA_1005,
          salidaHoyAt: null,
          idleSinceAt: "2026-10-07T17:40:00.000Z",
          lastFinished: { id: 5, anNumber: "AN-0050", titulo: "Revisión", finishedAt: "2026-10-07T17:40:00.000Z", lateMinutes: 0 },
        }),
        persona({
          id: 2,
          nombre: "Daniela Paz",
          status: "sin_actividad",
          entradaHoyAt: ENTRADA_1005,
          salidaHoyAt: null,
          idleSinceAt: ENTRADA_1005,
          lastFinished: { id: 9, anNumber: "AN-0091", titulo: "Depurar base", finishedAt: AYER_1811, lateMinutes: 40 },
        }),
        persona({
          id: 3,
          nombre: "Ana Ruiz",
          status: "sin_actividad",
          entradaHoyAt: ENTRADA_1005,
          salidaHoyAt: null,
          idleSinceAt: ENTRADA_1005,
          lastFinished: null,
        }),
      ],
      AHORA,
    );
    expect(a.sinNada.map((x) => x.persona.id)).toEqual([3, 2, 1]);
    expect(a.sinNada[1]).toMatchObject({
      minutosSinNada: 135,
      desdeQueEntro: true,
      entrada: "Entró 10:05",
      sinNadaDesde: "sin nada desde que entró (hace 2 h 15 min)",
      ultima: "Última: AN-0091 · Depurar base · terminó ayer 18:11, con 40 min de atraso",
    });
    expect(a.sinNada[0].ultima).toBe("Sin actividades terminadas");
    expect(a.sinNada[2]).toMatchObject({
      minutosSinNada: 40,
      desdeQueEntro: false,
      sinNadaDesde: "sin nada desde hace 40 min",
      ultima: "Última: AN-0050 · Revisión · terminó hoy 11:40, a tiempo",
    });
  });

  it("sin entrada hoy: su última actividad y hace cuánto, lo más viejo primero", () => {
    const a = atencionEquipo(
      [
        persona({
          id: 1,
          nombre: "Luis Mora",
          status: "sin_actividad",
          entradaHoyAt: null,
          lastFinished: { id: 9, anNumber: "AN-0091", titulo: "Depurar base", finishedAt: AYER_1811, lateMinutes: 0 },
        }),
        persona({
          id: 2,
          nombre: "Daniela Paz",
          status: "sin_actividad",
          entradaHoyAt: null,
          lastFinished: { id: 8, anNumber: "AN-0080", titulo: "Inventario", finishedAt: DOMINGO_1700, lateMinutes: 0 },
        }),
        persona({ id: 3, nombre: "Ana Ruiz", status: "inactivo", entradaHoyAt: null, lastFinished: null }),
      ],
      AHORA,
    );
    expect(a.sinEntrada.map((x) => x.persona.id)).toEqual([2, 1, 3]);
    expect(a.sinEntrada[0]).toMatchObject({
      haceCuanto: "hace 3 días",
      ultima: "Última: AN-0080 · Inventario · terminó dom 4 oct 17:00, a tiempo",
    });
    expect(a.sinEntrada[1].haceCuanto).toBe("hace 1 día");
    expect(a.sinEntrada[2]).toMatchObject({ haceCuanto: null, ultima: "Sin actividades terminadas" });
  });

  it("quien ya salió, los libres y quien trabaja no piden atención", () => {
    const a = atencionEquipo(
      [
        persona({ id: 1, status: "sin_actividad", entradaHoyAt: ENTRADA_1005, salidaHoyAt: "2026-10-07T18:00:00.000Z" }),
        persona({ id: 2, status: "libre", entradaHoyAt: ENTRADA_1005, idleSinceAt: ENTRADA_1005 }),
        persona({ id: 3, status: "activo" }),
      ],
      AHORA,
    );
    expect(a).toEqual({ atrasados: [], sinNada: [], sinEntrada: [] });
  });

  it("API vieja (sin entradaHoyAt): van a «sin nada» sin inventar horas", () => {
    const a = atencionEquipo([persona({ id: 1, status: "sin_actividad" }), persona({ id: 2, status: "inactivo" })], AHORA);
    expect(a.sinEntrada).toEqual([]);
    expect(a.sinNada).toHaveLength(2);
    expect(a.sinNada[0]).toMatchObject({
      minutosSinNada: null,
      desdeQueEntro: false,
      entrada: null,
      sinNadaDesde: null,
      ultima: "Sin actividades terminadas",
    });
  });
});

describe("hayFlujo", () => {
  it("todo en cero no se pinta", () => {
    expect(hayFlujo(flujoVacio)).toBe(false);
    expect(hayFlujo(undefined)).toBe(false);
    expect(hayFlujo(null)).toBe(false);
  });

  it("un solo movimiento ya es información", () => {
    expect(hayFlujo({ ...flujoVacio, closed: 1 })).toBe(true);
    expect(hayFlujo({ ...flujoVacio, slaLate: 2 })).toBe(true);
  });
});

describe("iniciales", () => {
  it("nombre y apellido", () => {
    expect(iniciales("Ana Ruiz")).toBe("AR");
    expect(iniciales("Luis")).toBe("LU");
    expect(iniciales("   ")).toBe("?");
  });
});
