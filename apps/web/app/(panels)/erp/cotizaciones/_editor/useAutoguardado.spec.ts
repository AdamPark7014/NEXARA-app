import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useAutoguardado } from "./useAutoguardado";

type P = { objetivo: string; items: number[] };

/** Autoguardado: espera a que se deje de escribir, manda solo lo que cambió y nunca dos a la vez. */
describe("useAutoguardado", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  const base: P = { objetivo: "", items: [1] };

  it("abrir una cotización no la guarda", () => {
    const guardar = vi.fn(async () => undefined);
    const { result } = renderHook(() => useAutoguardado<P>({ payload: base, base, habilitado: true, guardar }));
    act(() => {
      vi.advanceTimersByTime(5000);
    });
    expect(guardar).not.toHaveBeenCalled();
    expect(result.current.estado).toBe("sinCambios");
  });

  it("guarda un momento después de dejar de escribir, solo lo que cambió", async () => {
    const guardar = vi.fn(async () => undefined);
    const { result, rerender } = renderHook(
      ({ payload }) => useAutoguardado<P>({ payload, base, habilitado: true, guardar, espera: 1000 }),
      { initialProps: { payload: base } },
    );
    rerender({ payload: { ...base, objetivo: "Hol" } });
    act(() => {
      vi.advanceTimersByTime(600);
    });
    rerender({ payload: { ...base, objetivo: "Hola" } });
    expect(result.current.estado).toBe("pendiente");
    act(() => {
      vi.advanceTimersByTime(600);
    });
    expect(guardar).not.toHaveBeenCalled();
    await act(async () => {
      vi.advanceTimersByTime(500);
    });
    expect(guardar).toHaveBeenCalledTimes(1);
    expect(guardar).toHaveBeenCalledWith({ objetivo: "Hola" }, { objetivo: "Hola", items: [1] });
    expect(result.current.estado).toBe("guardado");
  });

  it("en pausa no guarda, y al habilitarse guarda lo pendiente", async () => {
    const guardar = vi.fn(async () => undefined);
    const { result, rerender } = renderHook(
      ({ habilitado }) =>
        useAutoguardado<P>({ payload: { ...base, objetivo: "x" }, base: null, habilitado, guardar, espera: 100 }),
      { initialProps: { habilitado: false } },
    );
    await act(async () => {
      vi.advanceTimersByTime(1000);
    });
    expect(guardar).not.toHaveBeenCalled();
    expect(result.current.estado).toBe("pendiente");
    rerender({ habilitado: true });
    await act(async () => {
      vi.advanceTimersByTime(200);
    });
    // Nada guardado todavía (cotización nueva): viaja todo.
    expect(guardar).toHaveBeenCalledWith({ objetivo: "x", items: [1] }, { objetivo: "x", items: [1] });
  });

  it("si falla lo dice y «guardar ahora» reintenta", async () => {
    const guardar = vi
      .fn<(c: Partial<P>, p: P) => Promise<void>>()
      .mockRejectedValueOnce(new Error("SMTP caído"))
      .mockResolvedValue(undefined);
    const { result } = renderHook(() =>
      useAutoguardado<P>({ payload: { ...base, objetivo: "y" }, base, habilitado: true, guardar, espera: 100 }),
    );
    await act(async () => {
      vi.advanceTimersByTime(200);
    });
    expect(result.current.estado).toBe("error");
    expect(result.current.error).toBe("SMTP caído");
    let ok = false;
    await act(async () => {
      ok = await result.current.guardarAhora();
    });
    expect(ok).toBe(true);
    expect(result.current.estado).toBe("guardado");
  });

  it("lo que se escribe mientras guarda sale en la siguiente vuelta, nunca en paralelo", async () => {
    let terminar: () => void = () => undefined;
    const guardar = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          terminar = resolve;
        }),
    );
    const { rerender } = renderHook(
      ({ payload }) => useAutoguardado<P>({ payload, base, habilitado: true, guardar, espera: 100 }),
      { initialProps: { payload: { ...base, objetivo: "a" } } },
    );
    await act(async () => {
      vi.advanceTimersByTime(150);
    });
    expect(guardar).toHaveBeenCalledTimes(1);
    rerender({ payload: { ...base, objetivo: "ab" } });
    await act(async () => {
      vi.advanceTimersByTime(150);
    });
    // Sigue en camino el primero: no sale otro.
    expect(guardar).toHaveBeenCalledTimes(1);
    await act(async () => {
      terminar();
    });
    await act(async () => {
      vi.advanceTimersByTime(150);
    });
    await act(async () => {
      terminar();
    });
    expect(guardar).toHaveBeenCalledTimes(2);
    expect(guardar).toHaveBeenLastCalledWith({ objetivo: "ab" }, { objetivo: "ab", items: [1] });
  });
});
