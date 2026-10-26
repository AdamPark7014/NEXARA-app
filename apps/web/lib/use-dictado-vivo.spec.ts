import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MENSAJES_DICTADO, SILENCIO_MS, SIN_VOZ_MS, textoDeResultados, useDictadoVivo } from "./use-dictado-vivo";

type Resultado = { isFinal: boolean; 0: { transcript: string } };

/** Reconocedor de voz de mentira: la prueba decide qué «oye» y cuándo termina. */
class ReconocedorFalso {
  static ultimo: ReconocedorFalso | null = null;
  lang = "";
  continuous = false;
  interimResults = false;
  onresult: ((e: { resultIndex: number; results: Resultado[] }) => void) | null = null;
  onerror: ((e: { error: string }) => void) | null = null;
  onend: (() => void) | null = null;
  start = vi.fn();
  // Como Chrome: al detener entrega lo último y luego avisa que terminó.
  stop = vi.fn(() => queueMicrotask(() => this.onend?.()));
  abort = vi.fn(() => queueMicrotask(() => this.onend?.()));
  resultados: Resultado[] = [];
  constructor() {
    ReconocedorFalso.ultimo = this;
  }
  oir(texto: string, final: boolean) {
    const r: Resultado = { isFinal: final, 0: { transcript: texto } };
    // El intermedio se reemplaza; lo final se queda.
    this.resultados = [...this.resultados.filter((x) => x.isFinal), r];
    this.onresult?.({ resultIndex: 0, results: this.resultados });
  }
}

describe("dictado en vivo", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    (window as unknown as { webkitSpeechRecognition: unknown }).webkitSpeechRecognition = ReconocedorFalso;
  });
  afterEach(() => {
    vi.useRealTimers();
    delete (window as unknown as { webkitSpeechRecognition?: unknown }).webkitSpeechRecognition;
    ReconocedorFalso.ultimo = null;
  });

  it("junta lo final y lo que se está oyendo", () => {
    expect(
      textoDeResultados([
        { isFinal: true, 0: { transcript: "que Carolina " } },
        { isFinal: false, 0: { transcript: " revise el DVR" } },
      ]),
    ).toEqual({ finales: "que Carolina", parcial: "revise el DVR" });
  });

  it("muestra el texto mientras se habla y al callar lo entrega una sola vez", async () => {
    const alTerminar = vi.fn();
    const { result } = renderHook(() => useDictadoVivo({ alTerminar }));
    expect(result.current.soportado).toBe(true);
    act(() => result.current.iniciar());
    const r = ReconocedorFalso.ultimo!;
    expect(r).toMatchObject({ lang: "es-MX", continuous: true, interimResults: true });
    expect(result.current.estado).toBe("escuchando");

    act(() => r.oir("que Carolina", false));
    expect(result.current.texto).toBe("que Carolina");
    act(() => r.oir("que Carolina revise el DVR", true));
    act(() => r.oir("mañana", false));
    expect(result.current.texto).toBe("que Carolina revise el DVR mañana");
    // Mientras sigue hablando no se entrega nada (nunca con texto intermedio).
    act(() => vi.advanceTimersByTime(SILENCIO_MS - 100));
    expect(alTerminar).not.toHaveBeenCalled();
    act(() => r.oir("mañana a las 9", false));
    act(() => vi.advanceTimersByTime(SILENCIO_MS - 100));
    expect(r.stop).not.toHaveBeenCalled();

    // Silencio: se detiene sola y entrega lo dicho (lo intermedio también cuenta).
    await act(async () => {
      vi.advanceTimersByTime(200);
      await Promise.resolve();
    });
    expect(r.stop).toHaveBeenCalledTimes(1);
    expect(alTerminar).toHaveBeenCalledTimes(1);
    expect(alTerminar).toHaveBeenCalledWith("que Carolina revise el DVR mañana a las 9");
    expect(result.current.estado).toBe("inactivo");
  });

  it("con un toque termina al momento", async () => {
    const alTerminar = vi.fn();
    const { result } = renderHook(() => useDictadoVivo({ alTerminar }));
    act(() => result.current.iniciar());
    act(() => ReconocedorFalso.ultimo!.oir("compra 20 conectores", true));
    await act(async () => {
      result.current.detener();
      await Promise.resolve();
    });
    expect(alTerminar).toHaveBeenCalledWith("compra 20 conectores");
  });

  it("si no se oye nada, avisa y no interpreta", async () => {
    const alTerminar = vi.fn();
    const { result } = renderHook(() => useDictadoVivo({ alTerminar }));
    act(() => result.current.iniciar());
    await act(async () => {
      vi.advanceTimersByTime(SIN_VOZ_MS + 10);
      await Promise.resolve();
    });
    expect(alTerminar).not.toHaveBeenCalled();
    expect(result.current.error).toBe(MENSAJES_DICTADO["sin-voz"]);
    expect(result.current.estado).toBe("inactivo");
  });

  it("cancelar no entrega lo que se iba diciendo", async () => {
    const alTerminar = vi.fn();
    const { result } = renderHook(() => useDictadoVivo({ alTerminar }));
    act(() => result.current.iniciar());
    act(() => ReconocedorFalso.ultimo!.oir("que Jorge", false));
    await act(async () => {
      result.current.cancelar();
      await Promise.resolve();
    });
    expect(alTerminar).not.toHaveBeenCalled();
  });

  it("sin permiso del micrófono lo dice claro", async () => {
    const { result } = renderHook(() => useDictadoVivo({ alTerminar: vi.fn() }));
    act(() => result.current.iniciar());
    await act(async () => {
      ReconocedorFalso.ultimo!.onerror?.({ error: "not-allowed" });
      ReconocedorFalso.ultimo!.onend?.();
      await Promise.resolve();
    });
    expect(result.current.error).toMatch(/permiso para usar el micrófono/);
    expect(result.current.estado).toBe("inactivo");
  });
});
