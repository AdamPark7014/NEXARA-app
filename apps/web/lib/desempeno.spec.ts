import { describe, expect, it } from "vitest";
import type { ParteCumplimiento, TotalesKpi } from "@/lib/kpis-equipo";
import { confianzaDe, diagnosticoDe, disciplinaTexto, estandarGanado, pilaresDe, resumenDesempeno } from "./desempeno";

const parte = (clave: string, pct: number, peso: number): ParteCumplimiento => ({ clave, etiqueta: clave, pct, peso, detalle: "" });

describe("pilares (índice v2)", () => {
  it("cada pilar sale de sus partes con peso; el diagnóstico no entra", () => {
    const p = pilaresDe([
      parte("entregas", 90, 30),
      parte("forma", 80, 25),
      parte("estandar", 64, 30),
      parte("asistencia", 100, 12),
      parte("uniforme", 50, 3),
      parte("tiempo", 10, 0),
      parte("ritmo", 10, 0),
      parte("carga", 70, 0),
    ]);
    expect(p.map((x) => [x.id, x.pct])).toEqual([
      ["confiabilidad", 90],
      ["calidad", 80],
      ["rendimiento", 64],
      ["disciplina", 90],
    ]);
  });

  it("sin partes, todos sin dato", () => {
    expect(pilaresDe(undefined).every((x) => x.pct === null)).toBe(true);
  });

  it("el diagnóstico que se lee es el que va bajo su referencia", () => {
    expect(diagnosticoDe([parte("carga", 70, 0), parte("dias", 100, 0), parte("forma", 50, 25)]).map((x) => x.clave)).toEqual(["carga"]);
  });
});

describe("lectura", () => {
  const base = { minutosLaborados: 600, minutosProductivos: 420 } as TotalesKpi;

  it("confianza: alta con 20 entregas medidas, media de 10 a 19, baja con menos", () => {
    expect(confianzaDe({ entregas: { medidas: 20 } as TotalesKpi["entregas"] })).toBe("alta");
    expect(confianzaDe({ entregas: { medidas: 10 } as TotalesKpi["entregas"] })).toBe("media");
    expect(confianzaDe({ entregas: { medidas: 9 } as TotalesKpi["entregas"] })).toBe("baja");
    expect(confianzaDe({})).toBe("baja");
  });

  it("resume entregas y horas", () => {
    const t = { ...base, entregas: { medidas: 10, aTiempo: 8, sinEntregar: 1 } as TotalesKpi["entregas"] };
    expect(resumenDesempeno(t)).toBe("Entregó 8 de 10 a tiempo y 1 quedó sin entregar. Tuvo una actividad corriendo 7 h de 10 h en jornada.");
    expect(resumenDesempeno(base)).toBe("No tuvo entregas que medir en estas fechas. Tuvo una actividad corriendo 7 h de 10 h en jornada.");
  });

  it("disciplina en una línea, con la falta por retardos que no se descuenta sola", () => {
    const disciplina = { esperados: 5, puntos: 1.3, retardos: 3, faltasPorRetardos: 1, jornadasRevisables: 4, registroCompleto: 4, pct: 26 };
    expect(disciplinaTexto({ disciplina })).toBe(
      "1.3 de 5 días en puntos · 3 retardos = 1 falta (no se descuenta sola) · registro completo 4 de 4",
    );
    expect(disciplinaTexto({})).toBeNull();
  });
});

describe("horas estándar ganadas (pilar Rendimiento)", () => {
  it("lo que vale lo entregado contra su jornada, con la eficiencia", () => {
    const t = {
      minutosLaborados: 960,
      entregas: { conEstandar: 3, minutosEstandarGanados: 480, pctEficienciaEstandar: 87 } as TotalesKpi["entregas"],
    };
    expect(estandarGanado(t)).toEqual({ valor: "8 h · 50 % de su jornada", detalle: "3 entregas con estándar · eficiencia 87 %" });
  });

  it("sin entregas con estándar no dice nada", () => {
    expect(estandarGanado({ minutosLaborados: 600, entregas: { conEstandar: 0 } as TotalesKpi["entregas"] })).toBeNull();
    expect(estandarGanado({ minutosLaborados: 600 } as TotalesKpi)).toBeNull();
  });

  it("sin horas en jornada da solo las horas ganadas", () => {
    const t = { minutosLaborados: 0, entregas: { conEstandar: 1, minutosEstandarGanados: 60, pctEficienciaEstandar: null } as TotalesKpi["entregas"] };
    expect(estandarGanado(t)).toEqual({ valor: "1 h", detalle: "1 entrega con estándar" });
  });
});
