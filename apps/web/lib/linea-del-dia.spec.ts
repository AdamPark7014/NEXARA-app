import { describe, expect, it } from "vitest";
import type { TeamBoardUser } from "@/lib/team-board-api";
import { armaFila, cargaDelDia, diaMx, hhmmMx, horaMx, posicion, ventanaDelDia, type LineaDelDiaPersona } from "./linea-del-dia";

const FECHA = "2026-10-28";
/** Hora de México (UTC−6). */
const M = (hhmm: string) => new Date(`${FECHA}T${hhmm}:00-06:00`).toISOString();
const ahora = Date.parse(M("13:40"));

function board(over: Partial<TeamBoardUser> = {}): TeamBoardUser {
  return {
    id: 20,
    nombre: "Raúl Méndez",
    email: "raul@nexara.com.mx",
    avatarUrl: null,
    puesto: "Instalador",
    status: "activo",
    currentActivity: null,
    openActivities: [],
    clockInAt: M("07:56"),
    workedMinutes: null,
    activityStartedAt: null,
    activityElapsedMinutes: null,
    entradaHoyAt: M("07:56"),
    salidaHoyAt: null,
    idleSinceAt: null,
    ...over,
  };
}

function linea(over: Partial<NonNullable<LineaDelDiaPersona["dia"]>> = {}): LineaDelDiaPersona {
  return {
    persona: { id: 20, nombre: "Raúl Méndez", email: "raul@nexara.com.mx", avatarUrl: null, puesto: "Instalador" },
    horario: { entrada: "08:00", salida: "17:00", etiqueta: "Horario propio · entra 08:00" },
    dia: {
      entrada: M("07:56"),
      salida: null,
      abierta: true,
      retardo: false,
      minutosTarde: 0,
      sinChecada: false,
      faltaJustificada: false,
      minutosLaborados: 344,
      minutosOcupados: 300,
      entregasDelDia: 0,
      jornada: [{ inicio: M("07:56"), fin: M("13:40") }],
      comida: [{ inicio: M("13:10"), fin: M("13:35") }],
      actividades: [
        { activityId: 418, anNumber: "AN-0418", titulo: "Cableado de nodos", inicio: M("08:22"), fin: M("13:10"), enCurso: false, minutosEnJornada: 288 },
        { activityId: 418, anNumber: "AN-0418", titulo: "Cableado de nodos", inicio: M("13:35"), fin: M("13:40"), enCurso: true, minutosEnJornada: 5 },
      ],
      ...over,
    },
  };
}

describe("hora de México", () => {
  it("convierte en los dos sentidos", () => {
    expect(hhmmMx(Date.parse(M("07:56")))).toBe("07:56");
    expect(diaMx(Date.parse(M("23:30")))).toBe(FECHA);
    expect(hhmmMx(horaMx(FECHA, 8, 30))).toBe("08:30");
  });
});

describe("armaFila", () => {
  it("dibuja la comida y cada tramo de reloj; el que corre va «en curso»", () => {
    const f = armaFila(linea(), board(), ahora, FECHA);
    expect(f.estado).toBe("en_jornada");
    expect(f.nota).toBe("Entró 07:56");
    expect(f.bloques.map((b) => b.tipo)).toEqual(["trabajada", "comida", "en_curso"]);
    expect(f.jornada?.inicio).toBe(Date.parse(M("07:56")));
  });

  it("lo programado de hoy sin arrancar: en tiempo si aún no es su hora, atrasado si ya pasó", () => {
    const f = armaFila(
      linea({ actividades: [] }),
      board({
        openActivities: [
          { id: 1, anNumber: "AN-1", titulo: "Etiquetado", estatus: "Pendiente", evidenceStatus: "", progressPct: 0, coreKind: "obra", fechaFinalizacion: null, fechaInicio: M("16:00"), minutosPlan: 45 },
          { id: 2, anNumber: "AN-2", titulo: "Acceso clínica", estatus: "Pendiente", evidenceStatus: "", progressPct: 0, coreKind: "servicio", fechaFinalizacion: null, fechaInicio: M("09:00"), minutosPlan: null },
          { id: 3, anNumber: "AN-3", titulo: "Mañana", estatus: "Pendiente", evidenceStatus: "", progressPct: 0, coreKind: "tarea", fechaFinalizacion: null, fechaInicio: "2026-10-29T15:00:00Z", minutosPlan: 60 },
        ],
      }),
      ahora,
      FECHA,
    );
    const prog = f.bloques.filter((b) => b.tipo === "programada" || b.tipo === "atrasada");
    expect(prog.map((b) => [b.activityId, b.tipo])).toEqual([
      [2, "atrasada"],
      [1, "programada"],
    ]);
    const atrasada = prog[0];
    expect(atrasada.fin - atrasada.inicio).toBe(60 * 60_000);
    expect(atrasada.detalle).toContain("era a las 09:00");
  });

  it("libre desde que terminó lo último, solo en jornada y sin nada corriendo", () => {
    const f = armaFila(
      linea({ actividades: [] }),
      board({ status: "libre", idleSinceAt: M("12:10") }),
      ahora,
      FECHA,
    );
    const libre = f.bloques.find((b) => b.tipo === "libre");
    expect(libre?.inicio).toBe(Date.parse(M("12:10")));
    expect(libre?.fin).toBe(ahora);

    const salio = armaFila(
      linea({ actividades: [] }),
      board({ status: "libre", idleSinceAt: M("12:10"), salidaHoyAt: M("13:00") }),
      ahora,
      FECHA,
    );
    expect(salio.bloques.some((b) => b.tipo === "libre")).toBe(false);
    expect(salio.estado).toBe("salio");
  });

  it("sin checar después de su hora de entrada", () => {
    const f = armaFila(
      { ...linea(), dia: null },
      board({ entradaHoyAt: null, clockInAt: null }),
      ahora,
      FECHA,
    );
    expect(f.estado).toBe("sin_checar");
    expect(f.nota).toBe("Sin checar · entra 08:00");
    expect(f.jornada).toBeNull();
  });
});

describe("cargaDelDia", () => {
  it("libre desde que terminó lo último", () => {
    expect(cargaDelDia(board({ status: "libre", idleSinceAt: M("12:10") }), ahora)).toEqual({ texto: "Libre desde 12:10", tono: "libre" });
  });

  it("cuenta lo abierto de hoy con sus horas planeadas y si está trabajando", () => {
    const u = board({
      openActivities: [
        { id: 1, anNumber: "AN-1", titulo: "A", estatus: "En Proceso", evidenceStatus: "", progressPct: 0, coreKind: "obra", fechaFinalizacion: null, fechaInicio: M("08:00"), minutosPlan: 120, enCurso: true },
        { id: 2, anNumber: "AN-2", titulo: "B", estatus: "Pendiente", evidenceStatus: "", progressPct: 0, coreKind: "tarea", fechaFinalizacion: null, fechaInicio: M("16:00"), minutosPlan: 60 },
        { id: 3, anNumber: "AN-3", titulo: "Mañana", estatus: "Pendiente", evidenceStatus: "", progressPct: 0, coreKind: "tarea", fechaFinalizacion: null, fechaInicio: "2026-10-29T15:00:00Z", minutosPlan: 60 },
      ],
    });
    expect(cargaDelDia(u, ahora)).toEqual({ texto: "2 abiertas · 3 h planeadas · trabajando", tono: "ocupado" });
  });

  it("sin checar o ya salió", () => {
    expect(cargaDelDia(board({ entradaHoyAt: null }), ahora).texto).toBe("Sin checar hoy");
    expect(cargaDelDia(board({ salidaHoyAt: M("13:00") }), ahora).texto).toBe("Ya salió");
  });
});

describe("ventanaDelDia y posicion", () => {
  it("de 07 a 20 por omisión y se abre si alguien entra antes", () => {
    const v = ventanaDelDia([armaFila(linea(), board(), ahora, FECHA)], FECHA);
    expect(v.horas[0]).toBe(7);
    expect(v.horas[v.horas.length - 1]).toBe(20);
    const temprano = armaFila(linea({ jornada: [{ inicio: M("06:20"), fin: M("13:40") }] }), board(), ahora, FECHA);
    expect(ventanaDelDia([temprano], FECHA).horas[0]).toBe(6);
  });

  it("calcula el % y recorta lo que sale de la ventana", () => {
    const v = ventanaDelDia([], FECHA);
    const p = posicion(horaMx(FECHA, 7), horaMx(FECHA, 13, 30), v)!;
    expect(p.left).toBe(0);
    expect(p.width).toBe(50);
    expect(posicion(horaMx(FECHA, 21), horaMx(FECHA, 22), v)).toBeNull();
  });
});
