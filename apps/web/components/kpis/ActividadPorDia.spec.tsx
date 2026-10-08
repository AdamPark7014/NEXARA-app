import { describe, expect, it } from "vitest";
import type { ActividadDelDiaFila, KpiPersonaFila } from "@/lib/kpis-equipo";
import { celdaDeDia, ordenarPorActividad, resumenUltimoDia } from "./ActividadPorDia";

function persona(nombre: string, dias: ActividadDelDiaFila[], sinActividad = 0, conUna = 0, promedio: number | null = 2) {
  return {
    persona: { id: nombre, nombre, avatarUrl: null },
    totales: { actividadDiaria: { esperados: dias.length, sinActividad, conUna, promedio } },
    actividadPorDia: dias,
  } as unknown as KpiPersonaFila;
}

const dia = (fecha: string, actividades: number, estado: ActividadDelDiaFila["estado"] = "trabajado"): ActividadDelDiaFila => ({
  fecha,
  estado,
  actividades,
  entregas: 0,
});

describe("Actividad por día", () => {
  it("pinta rojo el día sin nada, ámbar el de una y verde desde dos", () => {
    expect(celdaDeDia(dia("2026-10-07", 0, "sin_trabajo")).tono).toBe("rojo");
    expect(celdaDeDia(dia("2026-10-07", 0, "sin_checar"))).toMatchObject({ texto: "F", tono: "rojo" });
    expect(celdaDeDia(dia("2026-10-07", 1)).tono).toBe("ambar");
    expect(celdaDeDia(dia("2026-10-07", 3)).tono).toBe("verde");
    expect(celdaDeDia(dia("2026-10-07", 0, "justificado")).texto).toBe("J");
    expect(celdaDeDia(undefined).texto).toBe("");
  });

  it("pone arriba a quien tuvo más días sin nada, luego con solo una", () => {
    const orden = ordenarPorActividad([
      persona("Luis", [], 0, 0, 4),
      persona("David", [], 2, 1, 1),
      persona("Daniela", [], 0, 3, 2),
    ]).map((p) => p.persona.nombre);
    expect(orden).toEqual(["David", "Daniela", "Luis"]);
  });

  it("resume el último día terminado: quién no tocó nada y quién solo una", () => {
    const r = resumenUltimoDia(
      [
        persona("José Antonio Pérez López", [dia("2026-10-06", 2), dia("2026-10-07", 0, "sin_trabajo")]),
        persona("David Ruiz", [dia("2026-10-07", 0, "sin_checar")]),
        persona("Daniela Soto", [dia("2026-10-07", 1)]),
        persona("Iván Mora", [dia("2026-10-07", 0, "justificado")]),
        persona("Luis Gómez", [dia("2026-10-07", 4), dia("2026-10-08", 0, "pendiente")]),
      ],
      "2026-10-08",
    );
    expect(r).toEqual({ fecha: "2026-10-07", ninguna: ["José Antonio", "David Ruiz (no checó)"], una: ["Daniela Soto"] });
  });
});
