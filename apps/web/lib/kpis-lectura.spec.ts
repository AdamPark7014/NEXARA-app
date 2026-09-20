import { describe, expect, it } from "vitest";
import type { KpiPersonaFila, TotalesKpi } from "@/lib/kpis-equipo";
import {
  actividadesDelRango,
  avisosDePersona,
  bloquesDelDia,
  escalaDeDias,
  horasEnPalabras,
  minutoDelDia,
  ordenaRanking,
  porQueCuenta,
  resumenEnPalabras,
  tonoProductividad,
} from "@/lib/kpis-lectura";

const base: TotalesKpi = {
  diasConJornada: 5,
  diasSinChecada: 0,
  faltasJustificadas: 0,
  retardos: 0,
  minutosTarde: 0,
  uniforme: { revisadas: 5, ok: 5, noOk: 0, sinRevisar: 0, pct: 100 },
  minutosLaborados: 2400,
  minutosProductivos: 1750,
  minutosInactivos: 650,
  productividadPct: 73,
  minutosExtra: 0,
  jornadasAbiertas: 0,
  jornadasSinSalida: 0,
  cierresAutomaticos: 0,
  actividadesFueraDeJornada: 0,
};

describe("horas en palabras", () => {
  it("dice horas redondas sin minutos y minutos sueltos", () => {
    expect(horasEnPalabras(2400)).toBe("40 h");
    expect(horasEnPalabras(1750)).toBe("29 h 10 min");
    expect(horasEnPalabras(45)).toBe("45 min");
    expect(horasEnPalabras(null)).toBe("—");
  });
});

describe("resumen en palabras", () => {
  it("explica la productividad, los retardos y el uniforme en frases", () => {
    const t = { ...base, retardos: 2, minutosTarde: 35, uniforme: { revisadas: 5, ok: 4, noOk: 1, sinRevisar: 0, pct: 80 } };
    expect(resumenEnPalabras(t)).toBe(
      "De 40 h en jornada, 29 h 10 min estuvo en actividades (73 %). Llegó tarde 2 veces (35 min en total). Uniforme correcto 4 de 5 días.",
    );
  });

  it("dice lo que no cuenta y los días sin checar", () => {
    const t = { ...base, diasSinChecada: 1, actividadesFueraDeJornada: 1, uniforme: { revisadas: 0, ok: 0, noOk: 0, sinRevisar: 3, pct: null } };
    const texto = resumenEnPalabras(t);
    expect(texto).toContain("Llegó a tiempo todos los días.");
    expect(texto).toContain("Nadie ha revisado su uniforme (3 entradas).");
    expect(texto).toContain("1 día laborable sin checar.");
    expect(texto).toContain("1 actividad la hizo sin checar entrada: no cuenta como productiva.");
  });

  it("sin horario no habla de retardos", () => {
    expect(resumenEnPalabras(base, { conHorario: false })).not.toContain("tarde");
  });
});

describe("avisos de la fila", () => {
  it("solo lo que pide atención", () => {
    expect(avisosDePersona(base)).toEqual([]);
    const avisos = avisosDePersona({ ...base, retardos: 2, minutosTarde: 35, diasSinChecada: 1, uniforme: { revisadas: 5, ok: 3, noOk: 2, sinRevisar: 0, pct: 60 } });
    expect(avisos.map((a) => a.texto)).toEqual(["2 retardos · 35 min", "Uniforme 3/5", "1 día sin checar"]);
  });
});

describe("ranking", () => {
  const fila = (id: number, nombre: string, pct: number | null, retardos = 0): KpiPersonaFila => ({
    persona: { id, nombre, email: "", avatarUrl: null, puesto: null },
    horario: { clave: null, etiqueta: "", entrada: null, graciaMin: 15, jornadaOrdinariaMin: null },
    totales: { ...base, productividadPct: pct, retardos },
    semaforo: "verde",
    motivos: [],
  });
  const lista = [fila(1, "Beto", 54, 4), fila(2, "Ana", 88), fila(3, "Diego", null, 1), fila(4, "Carla", 79)];

  it("la mejor productividad arriba y sin dato al final", () => {
    expect(ordenaRanking(lista, "productividad").map((f) => f.persona.nombre)).toEqual(["Ana", "Carla", "Beto", "Diego"]);
  });

  it("por nombre y por retardos", () => {
    expect(ordenaRanking(lista, "nombre").map((f) => f.persona.nombre)).toEqual(["Ana", "Beto", "Carla", "Diego"]);
    expect(ordenaRanking(lista, "retardos")[0].persona.nombre).toBe("Beto");
  });

  it("tono con los cortes del semáforo", () => {
    expect([tonoProductividad(70), tonoProductividad(50), tonoProductividad(49), tonoProductividad(null)]).toEqual([
      "ok",
      "atencion",
      "critico",
      "sin_datos",
    ]);
  });
});

describe("línea de tiempo con escala común", () => {
  const dia = {
    fecha: "2026-09-16",
    tramos: {
      jornada: [{ inicio: "2026-09-16T15:05:00.000Z", fin: "2026-09-16T23:00:00.000Z" }],
      comida: [{ inicio: "2026-09-16T20:40:00.000Z", fin: "2026-09-16T21:55:00.000Z" }],
      productivo: [{ inicio: "2026-09-16T17:00:00.000Z", fin: "2026-09-16T18:00:00.000Z" }],
      inactivo: [],
    },
    actividades: [
      { activityId: 513, anNumber: "AN-513", titulo: "Reubicación de cámara", inicio: "2026-09-16T17:00:00.000Z", fin: "2026-09-16T18:00:00.000Z", enCurso: false, minutosEnJornada: 60 },
    ],
  };

  it("mide en hora de México y cruza la medianoche", () => {
    expect(minutoDelDia("2026-09-16T15:05:00.000Z", "2026-09-16")).toBe(9 * 60 + 5);
    expect(minutoDelDia("2026-09-17T06:30:00.000Z", "2026-09-16")).toBe(24 * 60 + 30);
  });

  it("la escala va de la hora en punto antes de entrar a la siguiente después de salir", () => {
    const escala = escalaDeDias([dia])!;
    expect(escala.desde).toBe(9 * 60);
    expect(escala.hasta).toBe(17 * 60);
    expect(escala.horas).toHaveLength(9);
  });

  it("el bloque productivo dice qué actividad lo cubre", () => {
    const escala = escalaDeDias([dia])!;
    const productivo = bloquesDelDia(dia, escala).find((b) => b.tipo === "productivo")!;
    expect(productivo.izquierdaPct).toBeCloseTo(25);
    expect(productivo.anchoPct).toBeCloseTo(12.5);
    expect(productivo.actividades).toEqual([{ anNumber: "AN-513", titulo: "Reubicación de cámara" }]);
  });

  it("las actividades del rango con su duración real y solo la nota de lo que no cuenta", () => {
    const [a] = actividadesDelRango([{ ...dia, actividades: [{ ...dia.actividades[0], minutosEnJornada: 40 }] }]);
    expect(a.minutosReales).toBe(60);
    expect(porQueCuenta(a)).toBe("20 min fuera de jornada");
    // Lo que cuenta completo no lleva nota: la tabla no repite lo obvio.
    expect(porQueCuenta({ minutosReales: 60, minutosEnJornada: 60, enCurso: false })).toBe("");
    expect(porQueCuenta({ minutosReales: 60, minutosEnJornada: 0, enCurso: false })).toBe("No cuenta: fuera de jornada");
  });
});
