import { describe, expect, it } from "vitest";
import {
  ARO_DE_ESTADO,
  CENTRO_OPERATIVO_EMAILS_EXCLUIDOS,
  contextoActividad,
  filtrarCentroOperativo,
  hayFlujo,
  iniciales,
  queHace,
  resumenEquipo,
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
    expect(queHace(persona({ id: 1, status: "sin_actividad" }))).toBe("Sin actividad asignada");
  });

  it("el segundo renglón lleva folio, encargo y el atraso", () => {
    const u = persona({
      id: 1,
      status: "atrasado",
      currentLateMinutes: 135,
      openActivities: [{ ...abierta, assignmentCharge: "Despacho a equipo" }],
    });
    expect(contextoActividad(u)).toBe("AN-1042 · Despacho a equipo · Atrasado 2 h 15 min");
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
