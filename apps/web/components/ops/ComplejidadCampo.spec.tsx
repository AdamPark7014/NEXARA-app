import React from "react";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { TiemposTipicos } from "@/lib/complejidad";
import { textoTipico, tipicoPara } from "@/lib/complejidad";

const tiempos: TiemposTipicos = {
  clave: "tarea:Instalación",
  total: { muestras: 10, medianaMin: 240 },
  porComplejidad: {
    BASICA: { muestras: 3, medianaMin: 65 },
    ESTANDAR: { muestras: 2, medianaMin: null },
    COMPLEJA: { muestras: 4, medianaMin: 220 },
    CRITICA: { muestras: 0, medianaMin: null },
  },
};

const sugerir = vi.fn();
vi.mock("@/lib/complejidad", async (importOriginal) => {
  const real = await importOriginal<typeof import("@/lib/complejidad")>();
  return {
    ...real,
    fetchTiemposTipicos: vi.fn(() => Promise.resolve(tiempos)),
    sugerirComplejidad: (...a: unknown[]) => sugerir(...a),
  };
});

import ComplejidadCampo from "./ComplejidadCampo";

describe("tiempo típico", () => {
  it("usa el del nivel si junta 3 anteriores; si no, el del tipo", () => {
    expect(tipicoPara(tiempos, "BASICA")).toEqual({ minutos: 65, muestras: 3, delNivel: true });
    expect(tipicoPara(tiempos, "ESTANDAR")).toEqual({ minutos: 240, muestras: 10, delNivel: false });
    expect(tipicoPara(tiempos, "")).toEqual({ minutos: 240, muestras: 10, delNivel: false });
    expect(tipicoPara(null, "BASICA")).toBeNull();
  });

  it("lo dice en una frase", () => {
    expect(textoTipico("Instalación", "COMPLEJA", tipicoPara(tiempos, "COMPLEJA"))).toBe(
      "Lo típico en Instalación · Compleja: 3 h 40 min (4 anteriores).",
    );
    expect(textoTipico("Instalación", "", tipicoPara(tiempos, ""))).toBe("Lo típico en Instalación: 4 h (10 anteriores).");
  });
});

describe("ComplejidadCampo", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    sugerir.mockReset();
  });
  afterEach(() => vi.useRealTimers());

  function montar(over: Partial<React.ComponentProps<typeof ComplejidadCampo>> = {}) {
    const onChange = vi.fn();
    const onUsarTiempo = vi.fn();
    const props: React.ComponentProps<typeof ComplejidadCampo> = {
      token: "t",
      coreKind: "tarea",
      tipo: "Instalación",
      tipoLabel: "Instalación",
      titulo: "Instalar 8 cámaras con tubería",
      indicaciones: "",
      value: "",
      pedirSugerencia: true,
      tiempoActualMin: 0,
      onChange,
      onUsarTiempo,
      ...over,
    };
    const r = render(<ComplejidadCampo {...props} />);
    return { ...r, onChange, onUsarTiempo, props };
  }

  it("pide la sugerencia al dejar de escribir y la toma si nadie eligió", async () => {
    sugerir.mockResolvedValue({ sugerencia: { complejidad: "COMPLEJA", motivo: "Ocho cámaras con tubería." } });
    const { onChange } = montar();
    expect(sugerir).not.toHaveBeenCalled();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(950);
    });
    expect(sugerir).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith({ complejidad: "COMPLEJA", sugerida: "COMPLEJA" });
    expect(screen.getByText("Sugerencia: Compleja.")).toBeTruthy();
  });

  it("si ya eligió a mano, solo guarda la sugerida", async () => {
    sugerir.mockResolvedValue({ sugerencia: { complejidad: "CRITICA", motivo: "x" } });
    const { onChange } = montar();
    fireEvent.click(screen.getByRole("button", { name: /Básica/ }));
    expect(onChange).toHaveBeenLastCalledWith({ complejidad: "BASICA" });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(950);
    });
    expect(onChange).toHaveBeenLastCalledWith({ sugerida: "CRITICA" });
  });

  it("enseña el tiempo de cada nivel y deja usarlo", async () => {
    sugerir.mockResolvedValue({ sugerencia: null });
    const { onUsarTiempo } = montar({ value: "BASICA", pedirSugerencia: false });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(10);
    });
    expect(screen.getByRole("button", { name: /Básica\s*1 h 5 min/ }).getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByText("Lo típico en Instalación · Básica: 1 h 5 min (3 anteriores).")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Usar 1 h 5 min como tiempo estimado" }));
    expect(onUsarTiempo).toHaveBeenCalledWith(65);
    expect(sugerir).not.toHaveBeenCalled();
  });
});
