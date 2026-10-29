import { describe, expect, it } from "vitest";
import { hfovDeg, vfovDeg, type Optica } from "./optica";
import type { CamaraPlano, Punto, Tapa } from "./plano";
import {
  areaPoligono,
  camaraEnMetros,
  coberturaCamara,
  enCuadro,
  leerPersona,
  mejorNivelEn,
  personaDeCamara,
  proyectar,
  repartoDeArea,
  tapado,
  type CamaraM,
} from "./visibilidad";

const domo28: Optica = { pxHoriz: 2560, pxVert: 1440, focalMm: 2.8, sensorAnchoMm: 4.8 };

/** Cámara en el origen viendo hacia la derecha (+x). */
const camara = (extra: Partial<CamaraM> = {}): CamaraM => ({
  pos: { x: 0, y: 0 },
  alturaM: 5,
  rumboDeg: 90,
  inclinacionDeg: 39,
  distanciaM: 13.757,
  hfovDeg: hfovDeg(domo28)!,
  vfovDeg: vfovDeg(domo28)!,
  pxHoriz: 2560,
  pxVert: 1440,
  ...extra,
});

const tapa = (a: Punto, b: Punto, topeM: number, baseM = 0): Tapa => ({ a, b, baseM, topeM, origen: "t" });

describe("cuadro de la lente", () => {
  it("ve al frente dentro del ángulo y no lo que queda atrás o fuera", () => {
    const cam = camara();
    expect(enCuadro(cam, { x: 8, y: 0 }, 1.5)).toBe(true);
    expect(enCuadro(cam, { x: -3, y: 0 }, 1.5)).toBe(false);
    expect(enCuadro(cam, { x: 5, y: 8 }, 1.5)).toBe(false); // ~58° fuera del eje, el medio ángulo es 40.6°
    expect(enCuadro(cam, { x: 1, y: 0 }, 0)).toBe(false); // el pie, en la zona ciega
  });

  it("proyecta el eje al centro de la imagen", () => {
    const cam = camara({ inclinacionDeg: 0, alturaM: 1.5 });
    const p = proyectar(cam, { x: 10, y: 0 }, 1.5)!;
    expect(p.x).toBeCloseTo(0, 9);
    expect(p.y).toBeCloseTo(0, 9);
    expect(proyectar(cam, { x: 10, y: 2 }, 1.5)!.x).toBeGreaterThan(0); // y crece hacia abajo = a la derecha del rumbo 90°
    expect(proyectar(cam, { x: -1, y: 0 }, 1.5)).toBeNull();
  });

  it("pasa a metros la cámara del plano con su lente", () => {
    const c: CamaraPlano = {
      id: "c1",
      numero: 1,
      nombre: "Domo",
      modelo: "DS-2CD1143G2-LIUF",
      pos: { x: 100, y: 40 },
      rumboDeg: 10,
      distanciaM: 12,
      alturaM: 3,
      inclinacionDeg: 20,
      lentes: [{ optica: domo28, desfaseRumboDeg: 5 }],
    };
    const m = camaraEnMetros(c, { metrosPorPx: 0.05 })!;
    expect(m.pos).toEqual({ x: 5, y: 2 });
    expect(m.rumboDeg).toBe(15);
    expect(camaraEnMetros({ ...c, lentes: [] }, { metrosPorPx: 1 })).toBeNull();
  });
});

describe("muros que tapan", () => {
  it("un muro alto entre la cámara y la persona la tapa; uno bajo, no", () => {
    const desde = { x: 0, y: 0 };
    const hasta = { x: 10, y: 0 };
    expect(tapado([tapa({ x: 5, y: -2 }, { x: 5, y: 2 }, 5)], desde, 5, hasta, 1.5)).toBe(true);
    // a medio camino la visual va a 3.25 m: un muro de 1 m no estorba
    expect(tapado([tapa({ x: 5, y: -2 }, { x: 5, y: 2 }, 1)], desde, 5, hasta, 1.5)).toBe(false);
    // cerca del objetivo la visual ya bajó a 1.85 m: una divisoria de 2.8 m sí tapa
    expect(tapado([tapa({ x: 9, y: -2 }, { x: 9, y: 2 }, 2.8)], desde, 5, hasta, 1.5)).toBe(true);
    // un dintel: tapa solo de 2.1 m para arriba
    expect(tapado([tapa({ x: 9, y: -2 }, { x: 9, y: 2 }, 3, 2.1)], desde, 5, hasta, 1.5)).toBe(false);
  });

  it("el muro donde está atornillada la cámara no cuenta", () => {
    expect(tapado([tapa({ x: 0, y: -5 }, { x: 0, y: 5 }, 5)], { x: 0.05, y: 0 }, 5, { x: 10, y: 0 }, 1.5)).toBe(false);
  });
});

describe("cobertura en el plano", () => {
  it("en campo abierto es un abanico del tamaño esperado", () => {
    const poligonos = coberturaCamara(camara(), []);
    expect(poligonos.length).toBeGreaterThan(0);
    const area = poligonos.reduce((s, p) => s + areaPoligono(p.puntos), 0);
    // abanico de 81° de ~1.7 m a 13.8 m: unos 130 m² (las orillas del cuadro lo recortan un poco)
    expect(area).toBeGreaterThan(100);
    expect(area).toBeLessThan(140);
    const niveles = new Set(poligonos.map((p) => p.nivel));
    expect(niveles).toEqual(new Set(["identificacion", "reconocimiento", "observacion"]));
  });

  it("un muro a 6 m corta todo lo que hay detrás", () => {
    const muro = tapa({ x: 6, y: -20 }, { x: 6, y: 20 }, 5);
    const poligonos = coberturaCamara(camara(), [muro]);
    const lejos = Math.max(...poligonos.flatMap((p) => p.puntos.map((q) => Math.hypot(q.x, q.y))));
    // el punto más lejano queda en la diagonal del muro (x ≤ 6)
    expect(Math.max(...poligonos.flatMap((p) => p.puntos.map((q) => q.x)))).toBeLessThanOrEqual(6.05);
    expect(lejos).toBeLessThan(8.5);
    expect(poligonos.every((p) => p.nivel !== "observacion")).toBe(true);
  });
});

describe("humanoides", () => {
  it("lee estado y densidad como el recuadro «134 PPM · Reconocimiento · persona a 10 m»", () => {
    const l = leerPersona(camara(), [], { x: 10.3, y: 0 });
    expect(l.estado).toBe("visible");
    expect(Math.round(l.ppm)).toBe(134);
    expect(l.nivel).toBe("reconocimiento");
    expect(Math.round(l.distanciaPisoM)).toBe(10);
  });

  it("parcial tras una barda baja, oculta tras un muro y fuera de cuadro atrás", () => {
    const cam = camara({ alturaM: 3, inclinacionDeg: 10 });
    const barda = tapa({ x: 9.5, y: -2 }, { x: 9.5, y: 2 }, 1);
    expect(leerPersona(cam, [barda], { x: 10, y: 0 }).estado).toBe("parcial");
    const muro = tapa({ x: 9.5, y: -2 }, { x: 9.5, y: 2 }, 4);
    expect(leerPersona(cam, [muro], { x: 10, y: 0 }).estado).toBe("oculta");
    expect(leerPersona(cam, [], { x: -10, y: 0 }).estado).toBe("fuera");
  });

  it("a cada cámara le toca la persona más cercana dentro de su ángulo", () => {
    const personas = [
      { id: "lejos", pos: { x: 12, y: 0 } },
      { id: "cerca", pos: { x: 6, y: 1 } },
      { id: "atras", pos: { x: -2, y: 0 } },
    ];
    expect(personaDeCamara(camara(), personas)?.id).toBe("cerca");
    expect(personaDeCamara(camara(), [personas[2]])).toBeNull();
  });
});

describe("mapa de calor", () => {
  it("se queda con el mejor nivel y cuenta el área sin cobertura", () => {
    const a = camara();
    const b = camara({ pos: { x: 20, y: 0 }, rumboDeg: 270 });
    expect(mejorNivelEn([a, b], [], { x: 17, y: 0 })).toBe("identificacion"); // a 3 m de b
    expect(mejorNivelEn([a], [], { x: -5, y: 0 })).toBeNull();
    const r = repartoDeArea({ camaras: [a], tapas: [], min: { x: -5, y: -5 }, max: { x: 5, y: 5 }, celdaM: 1 });
    expect(r.celdas).toBe(100);
    expect(r.sinCobertura).toBeGreaterThan(50);
    expect(Object.values(r.porNivel).reduce((s, n) => s + n, 0) + r.sinCobertura).toBe(100);
  });
});
