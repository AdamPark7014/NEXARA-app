import { describe, expect, it, vi } from "vitest";
import { sumarPendientes, type PasoEquipo } from "./asignar-equipo";

const pasos: PasoEquipo[] = [
  { userId: 1, rol: "LEAD", horasPlan: 2 },
  { userId: 2, rol: "TECNICO", horasPlan: 2 },
  { userId: 3, rol: "TECNICO", horasPlan: 2 },
];

describe("sumarPendientes", () => {
  it("sin fallos no deja pendientes", async () => {
    const sumar = vi.fn().mockResolvedValue(undefined);
    const r = await sumarPendientes(pasos, sumar);
    expect(r).toEqual({ pendientes: [], error: null });
    expect(sumar).toHaveBeenCalledTimes(3);
  });

  it("se detiene en el primer fallo y regresa desde el que falló", async () => {
    const boom = new Error('{"message":"Usuario inválido"}');
    const sumar = vi.fn(async (p: PasoEquipo) => {
      if (p.userId === 2) throw boom;
    });
    const r = await sumarPendientes(pasos, sumar);
    expect(r.error).toBe(boom);
    expect(r.pendientes.map((p) => p.userId)).toEqual([2, 3]);
    expect(sumar).toHaveBeenCalledTimes(2);
  });

  it("al reintentar solo vuelve a llamar a los que faltaban", async () => {
    let falla = true;
    const sumar = vi.fn(async (p: PasoEquipo) => {
      if (p.userId === 2 && falla) throw new Error("red");
    });
    const primero = await sumarPendientes(pasos, sumar);
    falla = false;
    sumar.mockClear();
    const segundo = await sumarPendientes(primero.pendientes, sumar);
    expect(segundo.pendientes).toEqual([]);
    expect(sumar.mock.calls.map(([p]) => p.userId)).toEqual([2, 3]);
  });
});
