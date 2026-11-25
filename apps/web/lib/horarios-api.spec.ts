import { describe, expect, it } from "vitest";
import {
  avisosEnPalabras,
  diaLargo,
  formatearRangoHorario,
  lunesDe,
  minutosAHorasTexto,
  tituloSemana,
} from "./horarios-api";

describe("horarios-api helpers", () => {
  it("formatearRangoHorario une entrada y salida", () => {
    expect(formatearRangoHorario("10:00", "18:00")).toBe("10:00–18:00");
    expect(formatearRangoHorario("22:00:00", "06:00:00")).toBe("22:00–06:00");
    expect(formatearRangoHorario("", "18:00")).toBe("");
  });

  it("minutosAHorasTexto cubre cero, minutos, horas y mixto", () => {
    expect(minutosAHorasTexto(0)).toBe("0 min");
    expect(minutosAHorasTexto(20)).toBe("20 min");
    expect(minutosAHorasTexto(180)).toBe("3 h");
    expect(minutosAHorasTexto(460)).toBe("7 h 40");
  });

  it("semanas y días en español, también al cruzar de mes", () => {
    expect(tituloSemana("2026-11-23", "2026-11-29")).toBe("23 al 29 de noviembre");
    expect(tituloSemana("2026-11-30", "2026-12-06")).toBe("30 de noviembre al 6 de diciembre");
    expect(lunesDe("2026-11-29")).toBe("2026-11-23");
    expect(diaLargo("2026-11-25")).toBe("miércoles 25");
  });

  it("avisosEnPalabras dice quién y por qué", () => {
    expect(avisosEnPalabras(null)).toEqual([]);
    const r = avisosEnPalabras({
      solapes: [],
      descansoCorto: [{ userId: 5, nombre: "Rubén", fechaA: "2026-11-26", fechaB: "2026-11-27", horasDescanso: 1.5 }],
      masDe6Seguidos: [],
      extraSobreTope: [{ userId: 5, nombre: "Rubén", semana: "2026-11-23", minutosExtraEst: 840, tope: 540 }],
    });
    expect(r.map((x) => x.titulo)).toEqual(["Rubén descansa solo 1 h 30", "Rubén pasa el tope de 9 h extra"]);
  });
});
