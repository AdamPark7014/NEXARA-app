import { describe, expect, it } from "vitest";
import { agregarAbertura, agregarArea, agregarCamara, agregarMuro, agregarObstaculo } from "./editor";
import { inclinacionHacia } from "./optica";
import { planoVacio, tapasDelPlano, type Plano } from "./plano";
import { areaEn, camarasQueTeVen, dentroDe, inicioDelRecorrido, moverConChoques, paradasDelSitio, tramosDelPlano } from "./recorrido";

const K = 0.02;
const P = (x: number, y: number) => ({ x: x / K, y: y / K });

/** Dos cuartos de 10 × 10 m, con una puerta a la mitad del muro que los divide. */
function dosCuartos(): Plano {
  let p: Plano = { ...planoVacio(), escala: { metrosPorPx: K, calibracion: null } };
  const muro = (x0: number, y0: number, x1: number, y1: number) => {
    const r = agregarMuro(p, P(x0, y0), P(x1, y1), { alturaM: 3, grosorM: 0.15 });
    p = r.plano;
    return r.muro!;
  };
  muro(0, 0, 20, 0);
  muro(20, 0, 20, 10);
  muro(20, 10, 0, 10);
  muro(0, 10, 0, 0);
  const division = muro(10, 0, 10, 10);
  p = agregarAbertura(p, division.id, 0.5, "puerta").plano;
  return p;
}

describe("Caminar por el sitio", () => {
  it("un muro no se cruza, aunque el paso sea largo", () => {
    const t = tramosDelPlano(dosCuartos());
    const fin = moverConChoques(t, { x: 8, y: 2 }, { x: 13, y: 2 });
    expect(fin.x).toBeLessThan(10);
  });

  it("al chocar se resbala a lo largo del muro en vez de detenerse", () => {
    const t = tramosDelPlano(dosCuartos());
    const fin = moverConChoques(t, { x: 9.6, y: 2 }, { x: 10.6, y: 3 });
    expect(fin.x).toBeLessThan(10);
    expect(fin.y).toBeCloseTo(3, 0);
  });

  it("por la puerta sí se pasa", () => {
    const t = tramosDelPlano(dosCuartos());
    const fin = moverConChoques(t, { x: 8, y: 5 }, { x: 12, y: 5 });
    expect(fin.x).toBeCloseTo(12);
  });

  it("no deja atravesar una ventana", () => {
    let p = dosCuartos();
    const norte = p.muros[0];
    p = agregarAbertura(p, norte.id, 0.25, "ventana").plano;
    const fin = moverConChoques(tramosDelPlano(p), { x: 5, y: 1 }, { x: 5, y: -2 });
    expect(fin.y).toBeGreaterThan(0);
  });

  it("un anaquel estorba como un muro", () => {
    const p = agregarObstaculo(dosCuartos(), P(2, 4), P(8, 5)).plano;
    const fin = moverConChoques(tramosDelPlano(p), { x: 5, y: 2 }, { x: 5, y: 7 });
    expect(fin.y).toBeLessThan(4);
  });

  it("sabe en qué área estás", () => {
    let p = dosCuartos();
    const r = agregarArea(p, P(0, 0), P(10, 10), "concreto");
    p = { ...r.plano, areas: (r.plano.areas ?? []).map((a) => ({ ...a, nombre: "Bodega" })) };
    expect(areaEn(p, { x: 5, y: 5 })).toBe("Bodega");
    expect(areaEn(p, { x: 15, y: 5 })).toBeNull();
    expect(dentroDe({ x: 1, y: 1 }, [{ x: 0, y: 0 }, { x: 2, y: 0 }, { x: 2, y: 2 }, { x: 0, y: 2 }])).toBe(true);
  });

  it("dice qué cámaras te ven, de la mejor a la peor, y el muro te esconde", () => {
    let p = dosCuartos();
    const poner = (x: number, y: number, rumboDeg: number, numero: number) => {
      p = agregarCamara(p, P(x, y), undefined, { numero, rumboDeg, alturaM: 3, distanciaM: 15, inclinacionDeg: Math.round(inclinacionHacia(3, 6)) }).plano;
    };
    poner(1, 5, 90, 1);
    poner(9, 2, 225, 2);
    const tapas = tapasDelPlano(p);
    const aqui = camarasQueTeVen(p, tapas, { x: 6, y: 5 });
    expect(aqui.map((c) => c.clave).sort()).toEqual(["CAM-01", "CAM-02"]);
    expect(aqui[0].ppm).toBeGreaterThanOrEqual(aqui[1].ppm);
    expect(aqui[0].etiqueta).toBeTruthy();
    // Al otro lado del muro, lejos de la puerta, ninguna llega.
    expect(camarasQueTeVen(p, tapas, { x: 15, y: 1 })).toEqual([]);
  });

  it("una área por parada, de la más grande a la más chica y sin caer sobre un muro", () => {
    let p = dosCuartos();
    for (const [nombre, a, b] of [["Chica", P(10, 0), P(14, 4)], ["Grande", P(0, 0), P(10, 10)]] as const) {
      const r = agregarArea(p, a, b, "concreto");
      p = { ...r.plano, areas: (r.plano.areas ?? []).map((x) => (x.id === r.area?.id ? { ...x, nombre } : x)) };
    }
    const paradas = paradasDelSitio(p);
    expect(paradas.map((x) => x.nombre)).toEqual(["Grande", "Chica"]);
    expect(inicioDelRecorrido(p).pos).toEqual(paradas[0].pos);
  });

  it("en una bodega arranca en el pasillo, mirando a lo largo, no con la cara en un anaquel", () => {
    let p = dosCuartos();
    p = agregarObstaculo(p, P(1, 3), P(9, 4)).plano;
    p = agregarObstaculo(p, P(1, 6.5), P(9, 7.5)).plano;
    const r = agregarArea(p, P(0, 0), P(10, 10), "concreto");
    p = { ...r.plano, areas: (r.plano.areas ?? []).map((a) => ({ ...a, nombre: "Bodega" })) };
    const { pos, rumboDeg } = inicioDelRecorrido(p);
    // Sin chocar con los anaqueles y con el muro lejos en esa dirección.
    const tramos = tramosDelPlano(p);
    expect(moverConChoques(tramos, pos, pos)).toEqual(pos);
    expect(pos.y < 2.6 || (pos.y > 4.4 && pos.y < 6.1) || pos.y > 7.9).toBe(true);
    expect([90, 270]).toContain(rumboDeg);
  });

  it("sin áreas ni muros arranca de todos modos", () => {
    expect(inicioDelRecorrido(planoVacio()).pos).toEqual({ x: 0, y: 0 });
    expect(inicioDelRecorrido(dosCuartos()).pos.x).toBeGreaterThan(0);
  });
});
