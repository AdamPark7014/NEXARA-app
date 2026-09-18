import { describe, expect, it } from "vitest";
import {
  diasDelRango,
  fechaCorta,
  periodoPorOmision,
  rangosSeEmpalman,
  reencadenar,
  resumenDelRango,
} from "./actividad-periodo";

describe("rango de días", () => {
  it("cuenta los dos extremos y lo resume en español", () => {
    expect(diasDelRango({ inicio: "2026-09-16", fin: "2026-09-25" })).toBe(10);
    expect(diasDelRango({ inicio: "2026-09-25", fin: "2026-09-16" })).toBeNull();
    expect(fechaCorta("2026-09-25")).toBe("vie 25 sep");
    expect(resumenDelRango({ inicio: "2026-09-16", fin: "2026-09-25" })).toBe("10 días · del mié 16 sep al vie 25 sep");
    expect(resumenDelRango({ inicio: "2026-09-16", fin: "2026-09-16" })).toBe("Un solo día · mié 16 sep");
    expect(resumenDelRango({ inicio: "2026-09-16", fin: "2026-09-10" })).toMatch(/anterior/);
    expect(resumenDelRango({ inicio: "2026-09-16" })).toBeNull();
  });

  it("empalmes: comparten un día o no", () => {
    const a = { inicio: "2026-09-16", fin: "2026-09-25" };
    expect(rangosSeEmpalman(a, { inicio: "2026-09-25", fin: "2026-09-30" })).toBe(true);
    expect(rangosSeEmpalman(a, { inicio: "2026-09-26", fin: "2026-09-30" })).toBe(false);
  });
});

describe("reencadenar etapas al editar", () => {
  const etapas = [
    { hitoId: 1, inicio: "2026-09-21", fin: "2026-09-25", incluir: true },
    { hitoId: 2, inicio: "2026-09-26", fin: "2026-10-09", incluir: true },
    { hitoId: 3, inicio: "2026-10-10", fin: "2026-10-30", incluir: true },
  ];

  it("si la primera se alarga, las siguientes se recorren conservando su duración", () => {
    const movida = etapas.map((e, i) => (i === 0 ? { ...e, fin: "2026-09-28" } : e));
    const r = reencadenar(movida, 0);
    expect(r.map((e) => [e.inicio, e.fin])).toEqual([
      ["2026-09-21", "2026-09-28"],
      ["2026-09-29", "2026-10-12"],
      ["2026-10-13", "2026-11-02"],
    ]);
    // No muta la entrada.
    expect(movida[1].inicio).toBe("2026-09-26");
  });

  it("las anteriores a la que se movió no se tocan", () => {
    const movida = etapas.map((e, i) => (i === 1 ? { ...e, inicio: "2026-09-24", fin: "2026-10-01" } : e));
    const r = reencadenar(movida, 1);
    expect(r[0]).toMatchObject({ inicio: "2026-09-21", fin: "2026-09-25" });
    // La que se movió a mano se respeta aunque se empalme; la siguiente arranca tras ella.
    expect(r[1]).toMatchObject({ inicio: "2026-09-24", fin: "2026-10-01" });
    expect(r[2]).toMatchObject({ inicio: "2026-10-02", fin: "2026-10-22" });
  });

  it("una etapa que no se incluye no empuja a las demás", () => {
    const sinLaSegunda = etapas.map((e, i) => (i === 1 ? { ...e, incluir: false } : e));
    const r = reencadenar(
      sinLaSegunda.map((e, i) => (i === 0 ? { ...e, fin: "2026-09-27" } : e)),
      0,
    );
    expect(r[1]).toMatchObject({ inicio: "2026-09-26", fin: "2026-10-09" });
    expect(r[2]).toMatchObject({ inicio: "2026-09-28", fin: "2026-10-18" });
  });
});

describe("periodo por omisión al asignar dentro de un proyecto", () => {
  const etapas = [
    { hitoId: 1, inicio: "2026-09-10", fin: "2026-09-15" },
    { hitoId: 2, inicio: "2026-09-16", fin: "2026-09-25" },
    { hitoId: 3, inicio: "2026-09-26", fin: "2026-10-10" },
  ];

  it("la etapa que corre hoy, desde hoy", () => {
    expect(periodoPorOmision(etapas, {}, "2026-09-18")).toEqual({ inicio: "2026-09-18", fin: "2026-09-25", hitoId: 2 });
  });

  it("antes de empezar, la primera etapa completa", () => {
    expect(periodoPorOmision(etapas, {}, "2026-09-01")).toEqual({ inicio: "2026-09-10", fin: "2026-09-15", hitoId: 1 });
  });

  it("sin etapas, la ventana del proyecto desde hoy", () => {
    expect(
      periodoPorOmision([], { inicio: "2026-09-01T00:00:00.000Z", fin: "2026-10-30T00:00:00.000Z" }, "2026-09-18"),
    ).toEqual({ inicio: "2026-09-18", fin: "2026-10-30", hitoId: null });
    expect(periodoPorOmision([], {}, "2026-09-18")).toBeNull();
  });

  it("proyecto ya vencido: solo hoy", () => {
    expect(periodoPorOmision([], { inicio: "2026-08-01", fin: "2026-08-30" }, "2026-09-18")).toEqual({
      inicio: "2026-09-18",
      fin: "2026-09-18",
      hitoId: null,
    });
  });
});
