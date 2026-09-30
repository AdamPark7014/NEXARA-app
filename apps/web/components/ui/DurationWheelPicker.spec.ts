import { describe, expect, it } from "vitest";
import {
  formatDuration,
  joinMinutes,
  splitMinutes,
} from "@/components/ui/DurationWheelPicker";

describe("DurationWheelPicker helpers", () => {
  it("parte minutos en horas y minutos", () => {
    expect(splitMinutes(90)).toEqual({ horas: 1, minutos: 30 });
    expect(splitMinutes(0)).toEqual({ horas: 0, minutos: 0 });
    expect(splitMinutes(59)).toEqual({ horas: 0, minutos: 59 });
  });

  it("junta horas y minutos a minutos totales", () => {
    expect(joinMinutes(1, 30)).toBe(90);
    expect(joinMinutes(0, 45)).toBe(45);
    expect(joinMinutes(2, 0)).toBe(120);
  });

  it("formatea en español corto", () => {
    expect(formatDuration(0, 0)).toBe("Sin tiempo");
    expect(formatDuration(0, 20)).toBe("20 min");
    expect(formatDuration(1, 0)).toBe("1 h");
    expect(formatDuration(2, 15)).toBe("2 h 15 min");
  });
});
