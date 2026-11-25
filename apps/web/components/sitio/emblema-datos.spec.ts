import { describe, expect, it } from "vitest";
import { DEGRADADOS, EMBLEMA_ALTO, EMBLEMA_ANCHO, FRAGMENTOS, LETRAS, PALABRA_ALTO, PALABRA_ANCHO, PIEZAS } from "./emblema-datos";
import * as silueta from "./emblema-silueta";

/** Los números de un trazo, de dos en dos: [x, y]. */
const puntos = (d: string) => {
  const n = d.match(/-?\d+(\.\d+)?/g)!.map(Number);
  const sal: [number, number][] = [];
  for (let i = 0; i < n.length; i += 2) sal.push([n[i], n[i + 1]]);
  return sal;
};

describe("Logotipo en vectores (archivo generado)", () => {
  it("trae las 13 piezas del emblema y los 57 fragmentos que vuelan en la entrada", () => {
    expect(PIEZAS).toHaveLength(13);
    expect(FRAGMENTOS).toHaveLength(57);
    expect(LETRAS).toHaveLength(6);
  });

  it("cada trazo usa solo rectas (M, L, Z) y cierra su figura", () => {
    for (const p of [...PIEZAS, ...FRAGMENTOS]) {
      expect(p.d).toMatch(/^[MLZ\d.\s-]+$/);
      expect(p.d.trim().endsWith("Z")).toBe(true);
    }
  });

  it("ningún punto del emblema se sale de su lienzo", () => {
    for (const p of [...PIEZAS, ...FRAGMENTOS]) {
      for (const [x, y] of puntos(p.d)) {
        expect(x).toBeGreaterThanOrEqual(-0.5);
        expect(x).toBeLessThanOrEqual(EMBLEMA_ANCHO + 0.5);
        expect(y).toBeGreaterThanOrEqual(-0.5);
        expect(y).toBeLessThanOrEqual(EMBLEMA_ALTO + 0.5);
      }
    }
  });

  it("las letras de NEXARA caben en el lienzo de la palabra", () => {
    for (const d of LETRAS) {
      for (const [x, y] of puntos(d)) {
        expect(x).toBeGreaterThanOrEqual(-0.5);
        expect(x).toBeLessThanOrEqual(PALABRA_ANCHO + 0.5);
        expect(y).toBeGreaterThanOrEqual(-0.5);
        expect(y).toBeLessThanOrEqual(PALABRA_ALTO + 0.5);
      }
    }
  });

  it("el centro de cada fragmento cae dentro del emblema: de ahí sale la dirección de su vuelo", () => {
    for (const f of FRAGMENTOS) {
      expect(f.cx).toBeGreaterThan(0);
      expect(f.cx).toBeLessThan(EMBLEMA_ANCHO);
      expect(f.cy).toBeGreaterThan(0);
      expect(f.cy).toBeLessThan(EMBLEMA_ALTO);
      const xs = puntos(f.d).map((p) => p[0]);
      const ys = puntos(f.d).map((p) => p[1]);
      expect(f.cx).toBeGreaterThanOrEqual(Math.min(...xs));
      expect(f.cx).toBeLessThanOrEqual(Math.max(...xs));
      expect(f.cy).toBeGreaterThanOrEqual(Math.min(...ys));
      expect(f.cy).toBeLessThanOrEqual(Math.max(...ys));
    }
  });

  it("todo degradado que una pieza pide existe, y cada uno trae sus tres colores", () => {
    const ids = new Set(DEGRADADOS.map((g) => g.id));
    expect(ids.size).toBe(DEGRADADOS.length);
    for (const p of [...PIEZAS, ...FRAGMENTOS]) {
      if (p.grad) expect(ids.has(p.grad), `falta el degradado ${p.grad}`).toBe(true);
      expect(p.color).toMatch(/^#[0-9a-f]{6}$/);
    }
    for (const g of DEGRADADOS) {
      expect(g.c).toHaveLength(3);
      for (const c of g.c) expect(c).toMatch(/^#[0-9a-f]{6}$/);
    }
  });

  it("los fragmentos son solo de las piezas de color: el núcleo oscuro no vuela", () => {
    const clases = new Set(FRAGMENTOS.map((f) => f.clase));
    expect(clases.has("oscuro")).toBe(false);
    const deColor = new Set(PIEZAS.filter((p) => p.clase !== "oscuro").map((p) => p.clase));
    expect(clases).toEqual(deColor);
  });

  it("la silueta que usa el navegador mide lo mismo que el emblema y es un contorno cerrado dentro del lienzo", () => {
    expect(silueta.EMBLEMA_ANCHO).toBe(EMBLEMA_ANCHO);
    expect(silueta.EMBLEMA_ALTO).toBe(EMBLEMA_ALTO);
    expect(silueta.SILUETA.length).toBeGreaterThan(20);
    for (const [x, y] of silueta.SILUETA) {
      expect(x).toBeGreaterThanOrEqual(0);
      expect(x).toBeLessThanOrEqual(EMBLEMA_ANCHO);
      expect(y).toBeGreaterThanOrEqual(0);
      expect(y).toBeLessThanOrEqual(EMBLEMA_ALTO);
    }
    // Toca (casi) las cuatro orillas: es el contorno de afuera, no un pedazo.
    const xs = silueta.SILUETA.map((p) => p[0]);
    const ys = silueta.SILUETA.map((p) => p[1]);
    expect(Math.min(...xs)).toBeLessThan(2);
    expect(Math.max(...xs)).toBeGreaterThan(EMBLEMA_ANCHO - 2);
    expect(Math.min(...ys)).toBeLessThan(2);
    expect(Math.max(...ys)).toBeGreaterThan(EMBLEMA_ALTO - 2);
  });
});
