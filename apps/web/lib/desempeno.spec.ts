import { describe, expect, it } from "vitest";
import type { ParteCumplimiento, TotalesKpi } from "@/lib/kpis-equipo";
import { confianzaDe, multiplicadoresDe, pilaresDe, resumenDesempeno } from "./desempeno";

const parte = (clave: string, pct: number, peso: number): ParteCumplimiento => ({ clave, etiqueta: clave, pct, peso, detalle: "" });

describe("pilares", () => {
  it("promedia cada pilar con los pesos de sus partes", () => {
    const p = pilaresDe([
      parte("entregas", 90, 20),
      parte("tiempo", 60, 15),
      parte("forma", 80, 10),
      parte("ritmo", 100, 20),
      parte("asistencia", 100, 15),
      parte("uniforme", 50, 5),
      parte("carga", 70, 0),
    ]);
    expect(p.map((x) => [x.id, x.pct])).toEqual([
      ["confiabilidad", 77],
      ["calidad", 80],
      ["rendimiento", 100],
      ["disciplina", 88],
    ]);
  });

  it("sin partes, todos sin dato", () => {
    expect(pilaresDe(undefined).every((x) => x.pct === null)).toBe(true);
  });

  it("los multiplicadores solo salen si restan", () => {
    expect(multiplicadoresDe([parte("carga", 70, 0), parte("dias", 100, 0), parte("forma", 50, 10)]).map((x) => x.clave)).toEqual(["carga"]);
  });
});

describe("lectura", () => {
  const base = { minutosLaborados: 600, minutosProductivos: 420 } as TotalesKpi;

  it("confianza por entregas medidas", () => {
    expect(confianzaDe({ entregas: { medidas: 20 } as TotalesKpi["entregas"] })).toBe("alta");
    expect(confianzaDe({ entregas: { medidas: 6 } as TotalesKpi["entregas"] })).toBe("media");
    expect(confianzaDe({})).toBe("baja");
  });

  it("resume entregas y horas", () => {
    const t = { ...base, entregas: { medidas: 10, aTiempo: 8, sinEntregar: 1 } as TotalesKpi["entregas"] };
    expect(resumenDesempeno(t)).toBe("Entregó 8 de 10 a tiempo y 1 quedó sin entregar. Tuvo una actividad corriendo 7 h de 10 h en jornada.");
    expect(resumenDesempeno(base)).toBe("No tuvo entregas que medir en estas fechas. Tuvo una actividad corriendo 7 h de 10 h en jornada.");
  });
});
