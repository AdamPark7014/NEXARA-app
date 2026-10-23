import { describe, expect, it } from "vitest";
import {
  UMBRAL_SILENCIO,
  alturaBarra,
  colaDeTexto,
  cubiertoHasta,
  frasesPendientes,
  juntarTextos,
  rms,
  suavizar,
  ultimaContigua,
  type TextoParte,
} from "./transcripcion-vivo";

const parte = (n: number, texto = `texto ${n}`): TextoParte => ({ parte: n, inicioMs: (n - 1) * 20_000, duracionMs: 20_000, texto });

describe("transcripción en vivo", () => {
  it("junta partes nuevas sin repetir y en orden", () => {
    const r = juntarTextos([parte(1), parte(3)], [parte(2), parte(3, "corregido")]);
    expect(r.map((t) => t.parte)).toEqual([1, 2, 3]);
    expect(r[2].texto).toBe("corregido");
  });

  it("pide desde la última parte sin huecos (una que llegó antes no se salta la anterior)", () => {
    expect(ultimaContigua([parte(1), parte(2), parte(4)])).toBe(2);
    expect(ultimaContigua([parte(13), parte(14)], 12)).toBe(14);
    expect(ultimaContigua([])).toBe(0);
  });

  it("lo que whisper ya cubrió sustituye a la vista previa", () => {
    const textos = [parte(1), parte(2), parte(4)];
    expect(cubiertoHasta(textos)).toBe(40_000);
    const frases = [
      { ms: 15_000, texto: "ya cubierta" },
      { ms: 41_000, texto: "todavía no" },
      { ms: 65_000, texto: "tampoco" },
    ];
    expect(frasesPendientes(frases, cubiertoHasta(textos)).map((f) => f.texto)).toEqual(["todavía no", "tampoco"]);
    expect(cubiertoHasta([])).toBe(0);
  });

  it("muestra la cola del texto cortada en palabra", () => {
    const largo = Array.from({ length: 400 }, (_, i) => parte(i + 1, "palabra más"));
    const r = colaDeTexto(largo, 100);
    expect(r.recortado).toBe(true);
    expect(r.texto.length).toBeLessThanOrEqual(100);
    expect(r.texto.startsWith("palabra") || r.texto.startsWith("más")).toBe(true);
    expect(colaDeTexto([parte(1, " hola ")])).toEqual({ texto: "hola", recortado: false });
  });
});

describe("onda tipo nota de voz", () => {
  it("silencio = puntito; voz = barra proporcional con mínimo y tope", () => {
    expect(alturaBarra(0, 32)).toBe(0);
    expect(alturaBarra(UMBRAL_SILENCIO / 2, 32)).toBe(0);
    expect(alturaBarra(Number.NaN, 32)).toBe(0);
    expect(alturaBarra(UMBRAL_SILENCIO, 32)).toBeGreaterThanOrEqual(4);
    expect(alturaBarra(0.03, 32)).toBeLessThan(alturaBarra(0.1, 32));
    expect(alturaBarra(1, 32)).toBe(32);
  });

  it("RMS y suavizado", () => {
    expect(rms([])).toBe(0);
    expect(rms([0.5, -0.5, 0.5, -0.5])).toBeCloseTo(0.5);
    expect(suavizar(0, 1)).toBeCloseTo(0.7); // sube rápido
    expect(suavizar(1, 0)).toBeCloseTo(0.65); // baja más lento
  });
});
