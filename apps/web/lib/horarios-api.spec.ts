import { describe, expect, it } from "vitest";
import {
  contarAvisosProgramacion,
  etiqFuenteHorario,
  formatearRangoHorario,
  minutosAHorasTexto,
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

  it("etiqFuenteHorario traduce las fuentes conocidas", () => {
    expect(etiqFuenteHorario("horario_dia")).toBe("Del día");
    expect(etiqFuenteHorario("work_schedule")).toBe("Plantilla fija");
    expect(etiqFuenteHorario("plantilla_turno")).toBe("Turno");
    expect(etiqFuenteHorario("default")).toBe("10:00–18:00");
    expect(etiqFuenteHorario(null)).toBe("—");
  });

  it("contarAvisosProgramacion suma arreglos", () => {
    expect(contarAvisosProgramacion(undefined)).toBe(0);
    expect(
      contarAvisosProgramacion({
        solapes: [1],
        descansoCorto: [1, 2],
        diasSeguidos: [],
        extraSemana: [1],
      }),
    ).toBe(4);
  });
});
