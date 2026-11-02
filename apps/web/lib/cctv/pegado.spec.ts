import { describe, expect, it } from "vitest";
import { MODELOS_EQUIPO } from "./catalogo";
import { agregarCamara, agregarEquipo, agregarMuro } from "./editor";
import { lugarParaCamara, moverCamaraPegada, moverEquipoPegado, pegarAMuros, rumboAlPegar } from "./pegado";
import { planoVacio, type Plano } from "./plano";

const K = 0.02;
const P = (x: number, y: number) => ({ x: x / K, y: y / K });
const enM = (p: { x: number; y: number }) => ({ x: p.x * K, y: p.y * K });

/** Cuarto de 10 × 8 m con muros de 3 m y 20 cm, dividido por un muro en x = 6. */
function cuarto(): Plano {
  let p: Plano = { ...planoVacio(), escala: { metrosPorPx: K, calibracion: null } };
  const muro = (x0: number, y0: number, x1: number, y1: number) => {
    p = agregarMuro(p, P(x0, y0), P(x1, y1), { alturaM: 3, grosorM: 0.2 }).plano;
  };
  muro(0, 0, 10, 0);
  muro(10, 0, 10, 8);
  muro(10, 8, 0, 8);
  muro(0, 8, 0, 0);
  muro(6, 0, 6, 8);
  return p;
}

describe("El imán de esquinas y muros", () => {
  it("cerca de una esquina se pega justo en ella, por dentro, y mira al centro del cuarto", () => {
    const r = pegarAMuros(cuarto(), P(0.5, 0.6))!;
    expect(r.tipo).toBe("esquina");
    const m = enM(r.pos);
    expect(m.x).toBeCloseTo(0.14, 2);
    expect(m.y).toBeCloseTo(0.14, 2);
    expect(r.rumboDeg).toBe(135);
  });

  it("cada esquina mira hacia adentro", () => {
    const p = cuarto();
    expect(pegarAMuros(p, P(5.5, 0.5))!.rumboDeg).toBe(225);
    expect(pegarAMuros(p, P(0.5, 7.5))!.rumboDeg).toBe(45);
    expect(pegarAMuros(p, P(5.5, 7.5))!.rumboDeg).toBe(315);
  });

  it("donde un muro llega a otro hay dos esquinas: se elige la del lado del puntero", () => {
    const p = cuarto();
    const izq = pegarAMuros(p, P(5.6, 0.5))!;
    const der = pegarAMuros(p, P(6.4, 0.5))!;
    expect(izq.tipo).toBe("esquina");
    expect(der.tipo).toBe("esquina");
    expect(enM(izq.pos).x).toBeLessThan(6);
    expect(enM(der.pos).x).toBeGreaterThan(6);
  });

  it("por fuera de una esquina no se queda en el aire: se pega a un muro", () => {
    const r = pegarAMuros(cuarto(), P(-0.3, -0.3))!;
    expect(r.tipo).toBe("muro");
    expect(Math.min(enM(r.pos).x, enM(r.pos).y)).toBeLessThan(0);
  });

  it("cerca de un muro se pega de frente, del lado del puntero", () => {
    const r = pegarAMuros(cuarto(), P(3, 0.4))!;
    expect(r.tipo).toBe("muro");
    expect(enM(r.pos).x).toBeCloseTo(3);
    expect(enM(r.pos).y).toBeCloseTo(0.14, 2);
    expect(r.rumboDeg).toBe(180);
    const afuera = pegarAMuros(cuarto(), P(3, -0.4))!;
    expect(enM(afuera.pos).y).toBeCloseTo(-0.14, 2);
    expect(afuera.rumboDeg).toBe(0);
  });

  it("lejos de todo no se pega, y una reja no sirve de muro", () => {
    expect(pegarAMuros(cuarto(), P(3, 4))).toBeNull();
    let p: Plano = { ...planoVacio(), escala: { metrosPorPx: K, calibracion: null } };
    p = agregarMuro(p, P(0, 0), P(10, 0), { tipo: "reja" }).plano;
    expect(pegarAMuros(p, P(5, 0.2))).toBeNull();
  });

  it("no se monta más alto que el muro", () => {
    let p = cuarto();
    p = agregarCamara(p, P(3, 4), undefined, { alturaM: 5, numero: 1 }).plano;
    const id = p.camaras[0].id;
    expect(moverCamaraPegada(p, id, P(0.4, 0.4)).plano.camaras[0].alturaM).toBe(2.9);
  });

  it("al moverla respeta hacia dónde miraba si sigue viendo el cuarto; si no, voltea", () => {
    expect(rumboAlPegar(100, { rumboDeg: 135, normales: [{ x: 1, y: 0 }, { x: 0, y: 1 }] })).toBe(100);
    expect(rumboAlPegar(300, { rumboDeg: 135, normales: [{ x: 1, y: 0 }, { x: 0, y: 1 }] })).toBe(135);
    let p = agregarCamara(cuarto(), P(3, 4), undefined, { numero: 1, rumboDeg: 110 }).plano;
    const id = p.camaras[0].id;
    p = moverCamaraPegada(p, id, P(0.3, 0.3)).plano;
    expect(p.camaras[0].rumboDeg).toBe(110);
    p = moverCamaraPegada(p, id, P(9.7, 0.3)).plano;
    expect(p.camaras[0].rumboDeg).toBe(225);
  });

  it("con Alt queda libre, y una en poste o techo no se pega", () => {
    let p = agregarCamara(cuarto(), P(3, 4), undefined, { numero: 1 }).plano;
    const id = p.camaras[0].id;
    const libre = moverCamaraPegada(p, id, P(0.3, 0.3), { libre: true });
    expect(libre.pegado).toBeNull();
    expect(libre.plano.camaras[0].pos).toEqual(P(0.3, 0.3));
    p = agregarCamara(cuarto(), P(3, 4), undefined, { numero: 1, montaje: "poste" }).plano;
    expect(moverCamaraPegada(p, p.camaras[0].id, P(0.3, 0.3)).pegado).toBeNull();
  });

  it("una cámara nueva nace pegada y viendo al cuarto", () => {
    const l = lugarParaCamara(cuarto(), P(0.4, 0.4));
    expect(l.pegado?.tipo).toBe("esquina");
    expect(l.extra.rumboDeg).toBe(135);
    expect(l.extra.alturaM).toBe(2.9);
    const suelta = lugarParaCamara(cuarto(), P(3, 4));
    expect(suelta.pegado).toBeNull();
    expect(suelta.extra).toEqual({});
    expect(lugarParaCamara(cuarto(), P(0.4, 0.4), { libre: true }).pos).toEqual(P(0.4, 0.4));
  });

  it("una terminal se queda en el muro; un gabinete se mueve libre y lo que lleva adentro lo sigue", () => {
    const terminal = MODELOS_EQUIPO.find((m) => m.tipo === "terminal")!;
    const gabinete = MODELOS_EQUIPO.find((m) => m.tipo === "gabinete")!;
    const nvr = MODELOS_EQUIPO.find((m) => m.tipo === "nvr")!;
    let p = agregarEquipo(cuarto(), P(3, 4), terminal, 1).plano;
    const t = moverEquipoPegado(p, p.equipos![0].id, P(3, 0.3));
    expect(t.pegado?.tipo).toBe("muro");
    expect(t.plano.equipos![0].rumboDeg).toBe(180);
    expect(enM(t.plano.equipos![0].pos).y).toBeCloseTo(0.1, 2);
    p = agregarEquipo(cuarto(), P(3, 4), gabinete, 1).plano;
    p = agregarEquipo(p, P(3, 4), nvr, 1).plano;
    const g = moverEquipoPegado(p, p.equipos![0].id, P(4, 4));
    expect(g.pegado).toBeNull();
    expect(g.plano.equipos!.every((e) => e.pos.x === P(4, 4).x)).toBe(true);
  });
});
