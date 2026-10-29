import { describe, expect, it } from "vitest";
import {
  calibrar,
  difRumbo,
  dirRumbo,
  planoVacio,
  problemasDelPlano,
  rumboEntre,
  siguienteNumero,
  tapasDelPlano,
  type Abertura,
  type Muro,
  type Plano,
} from "./plano";

const muro = (id: string, ax: number, ay: number, bx: number, by: number, extra: Partial<Muro> = {}): Muro => ({
  id,
  a: { x: ax, y: ay },
  b: { x: bx, y: by },
  alturaM: 3,
  grosorM: 0.15,
  tipo: "muro",
  ...extra,
});

const puerta = (extra: Partial<Abertura> = {}): Abertura => ({
  id: "pu1",
  muroId: "m1",
  tipo: "puerta",
  desde: 0.4,
  hasta: 0.6,
  baseM: 0,
  alturaM: 2.1,
  abierta: true,
  transparente: false,
  hojas: 1,
  bisagra: "inicio",
  sentido: 1,
  ...extra,
});

// Escala 1:1 (1 px = 1 m) para leer las cuentas sin convertir.
const plano = (p: Partial<Plano>): Plano => ({ ...planoVacio(), escala: { metrosPorPx: 1 }, ...p });

describe("escala", () => {
  it("calibra con una cota y rechaza puntos encimados", () => {
    expect(calibrar({ x: 0, y: 0 }, { x: 200, y: 0 }, 10)?.metrosPorPx).toBeCloseTo(0.05, 9);
    expect(calibrar({ x: 3, y: 3 }, { x: 3, y: 4 }, 10)).toBeNull();
    expect(calibrar({ x: 0, y: 0 }, { x: 200, y: 0 }, 0)).toBeNull();
  });
});

describe("rumbo", () => {
  it("0° es arriba del dibujo y crece con el reloj", () => {
    expect(dirRumbo(0).y).toBeCloseTo(-1, 9);
    expect(dirRumbo(90).x).toBeCloseTo(1, 9);
    expect(rumboEntre({ x: 0, y: 0 }, { x: 1, y: 0 })).toBeCloseTo(90, 9);
    expect(rumboEntre({ x: 0, y: 0 }, { x: 0, y: 1 })).toBeCloseTo(180, 9);
    expect(difRumbo(350, 10)).toBe(-20);
    expect(difRumbo(10, 350)).toBe(20);
  });
});

describe("lo que tapa la vista", () => {
  it("un muro con puerta abierta: dos tramos, el dintel y la hoja girada", () => {
    const t = tapasDelPlano(plano({ muros: [muro("m1", 0, 0, 10, 0)], aberturas: [puerta()] }));
    const llenos = t.filter((x) => x.origen === "m1" && x.baseM === 0 && x.topeM === 3);
    expect(llenos.map((x) => [x.a.x, x.b.x])).toEqual([
      [0, 4],
      [6, 10],
    ]);
    const dintel = t.find((x) => x.origen === "m1" && x.baseM === 2.1)!;
    expect([dintel.a.x, dintel.b.x, dintel.topeM]).toEqual([4, 6, 3]);
    const hoja = t.find((x) => x.origen === "pu1")!;
    // gira 90° sobre la bisagra (x = 4) y queda perpendicular al muro
    expect(hoja.a).toEqual({ x: 4, y: 0 });
    expect(hoja.b.x).toBeCloseTo(4, 9);
    expect(Math.abs(hoja.b.y)).toBeCloseTo(2, 9);
    expect(hoja.topeM).toBe(2.1);
  });

  it("cerrada, la hoja tapa el hueco; doble, dos hojas al centro", () => {
    const cerrada = tapasDelPlano(plano({ muros: [muro("m1", 0, 0, 10, 0)], aberturas: [puerta({ abierta: false })] }));
    const hoja = cerrada.find((x) => x.origen === "pu1")!;
    expect([hoja.a.x, hoja.b.x, hoja.b.y]).toEqual([4, 6, 0]);
    const doble = tapasDelPlano(plano({ muros: [muro("m1", 0, 0, 10, 0)], aberturas: [puerta({ hojas: 2 })] }));
    expect(doble.filter((x) => x.origen === "pu1")).toHaveLength(2);
  });

  it("la ventana transparente deja ver; el antepecho y el muro de vidrio no tapan de más", () => {
    const ventana = puerta({ id: "v1", tipo: "ventana", baseM: 1, alturaM: 1.2, transparente: true });
    const t = tapasDelPlano(plano({ muros: [muro("m1", 0, 0, 10, 0)], aberturas: [ventana] }));
    expect(t.some((x) => x.origen === "v1")).toBe(false);
    expect(t.find((x) => x.origen === "m1" && x.a.x === 4 && x.baseM === 0)?.topeM).toBe(1);
    const opaca = tapasDelPlano(plano({ muros: [muro("m1", 0, 0, 10, 0)], aberturas: [{ ...ventana, transparente: false }] }));
    expect(opaca.find((x) => x.origen === "v1")).toMatchObject({ baseM: 1, topeM: 2.2 });
    expect(tapasDelPlano(plano({ muros: [muro("m2", 0, 0, 5, 0, { tipo: "vidrio" })] }))).toEqual([]);
  });

  it("los obstáculos tapan con sus cuatro costados y la escala pasa a metros", () => {
    const t = tapasDelPlano({
      ...plano({}),
      escala: { metrosPorPx: 0.5 },
      obstaculos: [{ id: "rack", puntos: [{ x: 0, y: 0 }, { x: 2, y: 0 }, { x: 2, y: 2 }, { x: 0, y: 2 }], alturaM: 2 }],
    });
    expect(t).toHaveLength(4);
    expect(t[1].b).toEqual({ x: 1, y: 1 });
  });
});

describe("validación", () => {
  it("avisa aberturas encimadas, fuera de muro y cámaras repetidas", () => {
    const p = plano({
      muros: [muro("m1", 0, 0, 10, 0)],
      aberturas: [puerta(), puerta({ id: "pu2", desde: 0.5, hasta: 0.7 }), puerta({ id: "pu3", muroId: "nada" })],
      camaras: [
        { id: "c1", numero: 1, nombre: "A", modelo: "X", pos: { x: 1, y: 1 }, rumboDeg: 0, distanciaM: 10, alturaM: 3, inclinacionDeg: 20, lentes: [] },
        { id: "c2", numero: 1, nombre: "B", modelo: "X", pos: { x: 2, y: 1 }, rumboDeg: 0, distanciaM: 10, alturaM: 3, inclinacionDeg: 20, lentes: [] },
      ],
    });
    const problemas = problemasDelPlano(p);
    expect(problemas.some((x) => x.includes("se encima"))).toBe(true);
    expect(problemas.some((x) => x.includes("no está en ningún muro"))).toBe(true);
    expect(problemas.some((x) => x.includes("dos cámaras con el número 1"))).toBe(true);
    expect(problemas.some((x) => x.includes("no tiene lente"))).toBe(true);
    expect(siguienteNumero(p.camaras)).toBe(2);
    expect(problemasDelPlano(plano({ muros: [muro("m1", 0, 0, 10, 0)] }))).toEqual([]);
  });
});
