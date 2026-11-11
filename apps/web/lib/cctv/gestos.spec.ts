import { describe, expect, it } from "vitest";
import { clasificarRueda, factorDeRueda, gestoDeBoton } from "./gestos";

const rueda = (over: Partial<{ ctrlKey: boolean; deltaMode: number; deltaX: number; deltaY: number; wheelDeltaY: number }> = {}) => ({ ctrlKey: false, deltaMode: 0, deltaX: 0, deltaY: 100, wheelDeltaY: -120, ...over });

describe("clasificarRueda", () => {
  it("un salto de 120 es la rueda de un mouse", () => {
    expect(clasificarRueda(rueda(), { dosDedosHasta: 0 }, 1000)).toBe("rueda");
  });

  it("con el navegador en otro zoom, el salto sigue siendo de 120 aunque deltaY cambie", () => {
    expect(clasificarRueda(rueda({ deltaY: 125 }), { dosDedosHasta: 0 }, 1000)).toBe("rueda");
  });

  it("pasos chicos son dos dedos", () => {
    expect(clasificarRueda(rueda({ deltaY: 3.33, wheelDeltaY: -4 }), { dosDedosHasta: 0 }, 1000)).toBe("dos-dedos");
  });

  it("moverse de lado solo se puede con dos dedos", () => {
    expect(clasificarRueda(rueda({ deltaX: 2 }), { dosDedosHasta: 0 }, 1000)).toBe("dos-dedos");
  });

  it("el pellizco llega con Ctrl y gana sobre todo lo demás", () => {
    expect(clasificarRueda(rueda({ ctrlKey: true, deltaY: 1.5, wheelDeltaY: -4 }), { dosDedosHasta: 0 }, 1000)).toBe("pellizco");
  });

  it("un paso de 120 a media pasada de dos dedos no se vuelve rueda", () => {
    const e = { dosDedosHasta: 0 };
    expect(clasificarRueda(rueda({ deltaY: 4, wheelDeltaY: -5 }), e, 1000)).toBe("dos-dedos");
    expect(clasificarRueda(rueda(), e, 1100)).toBe("dos-dedos");
    // Pasado el lapso, otra vez es la rueda.
    expect(clasificarRueda(rueda(), e, 2000)).toBe("rueda");
  });

  it("una rueda por líneas es rueda", () => {
    expect(clasificarRueda({ ctrlKey: false, deltaMode: 1, deltaX: 0, deltaY: 3 }, { dosDedosHasta: 0 }, 1000)).toBe("rueda");
  });

  it("sin wheelDeltaY se decide por el tamaño del paso", () => {
    expect(clasificarRueda({ ctrlKey: false, deltaMode: 0, deltaX: 0, deltaY: 100 }, { dosDedosHasta: 0 }, 1000)).toBe("rueda");
    expect(clasificarRueda({ ctrlKey: false, deltaMode: 0, deltaX: 0, deltaY: 7.5 }, { dosDedosHasta: 0 }, 1000)).toBe("dos-dedos");
  });
});

describe("gestoDeBoton", () => {
  it("como un mapa: arrastrar mueve por el sitio y el clic derecho o la rueda apretada giran (11-11)", () => {
    expect(gestoDeBoton(0, {}, false)).toBe("deslizar");
    expect(gestoDeBoton(2, {}, false)).toBe("girar");
    expect(gestoDeBoton(1, {}, false)).toBe("girar");
  });

  it("desde arriba igual: arrastrar desliza y el clic derecho gira", () => {
    expect(gestoDeBoton(0, {}, true)).toBe("deslizar");
    expect(gestoDeBoton(2, {}, true)).toBe("girar");
  });

  it("Mayús o Alt giran con el botón principal", () => {
    expect(gestoDeBoton(0, { mayus: true }, false)).toBe("girar");
    expect(gestoDeBoton(0, { alt: true }, true)).toBe("girar");
  });

  it("con la barra espaciadora siempre desliza", () => {
    expect(gestoDeBoton(0, { espacio: true }, false)).toBe("deslizar");
    expect(gestoDeBoton(2, { espacio: true }, true)).toBe("deslizar");
  });
});

describe("factorDeRueda", () => {
  it("hacia arriba acerca y hacia abajo aleja", () => {
    expect(factorDeRueda("rueda", -100)).toBeLessThan(1);
    expect(factorDeRueda("rueda", 100)).toBeGreaterThan(1);
  });

  it("un salto de rueda mueve alrededor de 15 %", () => {
    expect(factorDeRueda("rueda", -100)).toBeCloseTo(0.852, 2);
  });

  it("no da saltos enormes con una rueda rápida", () => {
    expect(factorDeRueda("rueda", 5000)).toBe(factorDeRueda("rueda", 120));
  });
});
