import { describe, expect, it } from "vitest";
import { RADIO_ANILLO, trazar } from "./trazado";

const G = 12;

/** Cada pista del trazo como lista de puntos [x, y]. */
function pistasDe(d: string): [number, number][][] {
  return d
    .split("M")
    .filter(Boolean)
    .map((tramo) =>
      tramo.split("L").map((par) => {
        const [x, y] = par.trim().split(/\s+/).map(Number);
        return [x, y] as [number, number];
      }),
    );
}

/** Centros de las almohadillas de un trazo de anillos. */
function centrosDe(d: string): [number, number][] {
  return [...d.matchAll(/M(-?[\d.]+) (-?[\d.]+)a/g)].map((m) => [Number(m[1]) + RADIO_ANILLO, Number(m[2])] as [number, number]);
}

/** Las celdas de la rejilla que pisa una pista, paso a paso (la pista sale una celda fuera de la orilla). */
function celdasDe(pts: [number, number][]): { celdas: string[]; diagonales: { clave: string; tipo: number }[] } {
  const celdas: string[] = [];
  const diagonales: { clave: string; tipo: number }[] = [];
  let [x, y] = pts[0];
  for (let k = 1; k < pts.length; k++) {
    const [nx, ny] = pts[k];
    // El último tramo llega a la orilla del anillo: se completa hasta su centro para contar celdas enteras.
    const pasos = Math.round((nx - x + (k === pts.length - 1 ? RADIO_ANILLO : 0)) / G);
    const dy = Math.sign(Math.round((ny - y) * 10));
    for (let s = 0; s < pasos; s++) {
      const i = Math.round(x / G) + s;
      const j = Math.round(y / G) + s * dy;
      if (dy !== 0 && i >= 0) diagonales.push({ clave: `${i},${Math.min(j, j + dy)}`, tipo: dy });
      if (i + 1 >= 0) celdas.push(`${i + 1},${j + dy}`);
    }
    x += pasos * G;
    y += pasos * G * dy;
  }
  return { celdas, diagonales };
}

describe("Pistas de circuito de los escenarios", () => {
  const t = trazar(11, 40, 34);
  const pistas = pistasDe(t.pistas);

  it("la misma semilla pinta siempre lo mismo y otra semilla, otro dibujo", () => {
    expect(trazar(11, 40, 34)).toEqual(t);
    expect(trazar(12, 40, 34).pistas).not.toEqual(t.pistas);
  });

  it("mide lo que dice la rejilla", () => {
    expect(t.ancho).toBe(40 * G);
    expect(t.alto).toBe(34 * G);
    const chico = trazar(3, 20, 10, 8);
    expect(chico.ancho).toBe(160);
    expect(chico.alto).toBe(80);
  });

  it("dibuja un conjunto con cuerpo: varias pistas y alguna señal de color", () => {
    expect(pistas.length).toBeGreaterThanOrEqual(8);
    expect(t.senales.length).toBeGreaterThanOrEqual(1);
  });

  it("cada pista entra por la orilla izquierda y nunca retrocede", () => {
    for (const p of pistas) {
      expect(p[0][0]).toBe(-G);
      for (let k = 1; k < p.length; k++) expect(p[k][0]).toBeGreaterThan(p[k - 1][0]);
    }
  });

  it("solo hay tramos horizontales o a 45°", () => {
    for (const p of pistas) {
      for (let k = 1; k < p.length; k++) {
        const dx = Math.abs(p[k][0] - p[k - 1][0]);
        const dy = Math.abs(p[k][1] - p[k - 1][1]);
        // Las coordenadas van redondeadas a décimas.
        expect(dy < 0.11 || Math.abs(dx - dy) < 0.21).toBe(true);
      }
    }
  });

  it("nada se sale del lienzo", () => {
    for (const p of pistas) {
      for (const [x, y] of p) {
        expect(x).toBeGreaterThanOrEqual(-G);
        expect(x).toBeLessThanOrEqual(t.ancho);
        expect(y).toBeGreaterThanOrEqual(0);
        expect(y).toBeLessThanOrEqual(t.alto);
      }
    }
  });

  it("ninguna pista es un muñón: recorre al menos cuatro celdas", () => {
    for (const p of pistas) {
      const fin = p[p.length - 1][0];
      expect(fin).toBeGreaterThanOrEqual(4 * G - RADIO_ANILLO - 0.1);
    }
  });

  it("dos pistas nunca pisan la misma celda ni se cruzan en diagonal", () => {
    for (const semilla of [11, 5, 23, 99]) {
      const dibujo = trazar(semilla, 40, 34);
      const vistas = new Set<string>();
      const diagonal = new Map<string, number>();
      for (const p of pistasDe(dibujo.pistas)) {
        const { celdas, diagonales } = celdasDe(p);
        for (const c of celdas) {
          expect(vistas.has(c), `celda ${c} repetida con la semilla ${semilla}`).toBe(false);
          vistas.add(c);
        }
        for (const d of diagonales) {
          const antes = diagonal.get(d.clave);
          expect(antes === undefined || antes === d.tipo, `cruce en ${d.clave} con la semilla ${semilla}`).toBe(true);
          diagonal.set(d.clave, d.tipo);
        }
      }
    }
  });

  it("cada pista termina en una almohadilla: gris, o de color si es una señal", () => {
    const grises = centrosDe(t.anillos);
    const color = t.senales.map((s) => centrosDe(s.anillo)[0]);
    expect(grises.length + color.length).toBe(pistas.length);
    const centros = [...grises, ...color];
    for (const p of pistas) {
      const [fx, fy] = p[p.length - 1];
      const cerca = centros.some(([cx, cy]) => Math.abs(Math.hypot(cx - fx, cy - fy) - RADIO_ANILLO) < 0.2);
      expect(cerca).toBe(true);
    }
  });

  it("las señales usan los cinco colores del logotipo, por índice, sin repetir dos seguidas", () => {
    const largo = trazar(4, 60, 60);
    expect(largo.senales.length).toBeGreaterThan(2);
    largo.senales.forEach((s, k) => {
      expect(Number.isInteger(s.color)).toBe(true);
      expect(s.color).toBeGreaterThanOrEqual(0);
      expect(s.color).toBeLessThanOrEqual(4);
      if (k) expect(s.color).not.toBe(largo.senales[k - 1].color);
      // El tramo encendido es una sola recta que llega a su almohadilla.
      expect(s.d).toMatch(/^M-?[\d.]+ -?[\d.]+L-?[\d.]+ -?[\d.]+$/);
    });
  });

  it("las pistas del centro llegan más lejos que las de las orillas", () => {
    const alcances = { centro: [] as number[], orilla: [] as number[] };
    for (const semilla of [1, 2, 3, 4, 5, 6, 7, 8]) {
      const dibujo = trazar(semilla, 40, 34);
      for (const p of pistasDe(dibujo.pistas)) {
        const fila = p[0][1] / G;
        const fin = p[p.length - 1][0];
        if (fila >= 12 && fila <= 21) alcances.centro.push(fin);
        if (fila <= 4 || fila >= 29) alcances.orilla.push(fin);
      }
    }
    const media = (v: number[]) => v.reduce((a, b) => a + b, 0) / v.length;
    expect(alcances.centro.length).toBeGreaterThan(5);
    expect(alcances.orilla.length).toBeGreaterThan(5);
    expect(media(alcances.centro)).toBeGreaterThan(media(alcances.orilla) * 1.3);
  });

  it("una rejilla diminuta no truena: devuelve un lienzo vacío o casi", () => {
    const nada = trazar(1, 3, 3);
    expect(nada.ancho).toBe(36);
    expect(nada.pistas).toBe("");
    expect(nada.senales).toEqual([]);
  });
});
