import { describe, expect, it } from "vitest";
import { MODELOS_CAMARA } from "./catalogo";
import { agregarCamara, agregarMuro, agregarPersona } from "./editor";
import { VISTA_ISOMETRICA, VISTA_SUPERIOR, encuadrar, escena3D, proyector, type Vista3D } from "./escena3d";
import { planoVacio, tapasDelPlano, type Plano } from "./plano";

const base: Vista3D = { azimutDeg: 0, elevacionDeg: 90, pxPorMetro: 10, centro: { x: 0, y: 0 }, ancho: 400, alto: 300 };

describe("proyección axonométrica", () => {
  it("la vista superior es el plano a escala y lo alto queda encima", () => {
    const pr = proyector(base);
    expect(pr.pantalla({ x: 5, y: 2, z: 0 })).toEqual({ x: 250, y: 170 });
    expect(pr.pantalla({ x: 5, y: 2, z: 3 }).y).toBeCloseTo(170, 6); // desde arriba la altura no se ve
    expect(pr.profundidad({ x: 0, y: 0, z: 3 })).toBeGreaterThan(pr.profundidad({ x: 0, y: 0, z: 0 }));
  });

  it("en isométrica lo alto sube en pantalla y lo de enfrente queda más cerca", () => {
    const pr = proyector({ ...base, ...VISTA_ISOMETRICA });
    expect(pr.pantalla({ x: 0, y: 0, z: 5 }).y).toBeLessThan(pr.pantalla({ x: 0, y: 0, z: 0 }).y);
    expect(pr.profundidad({ x: 0, y: 10, z: 0 })).toBeGreaterThan(pr.profundidad({ x: 0, y: -10, z: 0 }));
    // la cara de un muro que mira al sur (+y) se ve; la del norte, no
    expect(pr.miraAlFrente({ x: 0, y: 1 })).toBe(true);
    expect(pr.miraAlFrente({ x: 0, y: -1 })).toBe(false);
  });

  it("la matriz del piso coincide con la proyección de un punto del croquis", () => {
    const v = { ...base, ...VISTA_ISOMETRICA, centro: { x: 3, y: 4 } };
    const pr = proyector(v);
    const [a, b, c, d, e, f] = pr.matrizPiso(0.05);
    const px = { x: 120, y: 40 };
    const esperado = pr.pantalla({ x: px.x * 0.05, y: px.y * 0.05, z: 0 });
    expect(a * px.x + c * px.y + e).toBeCloseTo(esperado.x, 6);
    expect(b * px.x + d * px.y + f).toBeCloseTo(esperado.y, 6);
  });
});

describe("escena", () => {
  const sitio = (): Plano => {
    let p: Plano = { ...planoVacio(), escala: { metrosPorPx: 0.1, calibracion: null } };
    p = agregarMuro(p, { x: 0, y: 0 }, { x: 100, y: 0 }, { alturaM: 5 }).plano;
    p = agregarMuro(p, { x: 0, y: 50 }, { x: 100, y: 50 }, { alturaM: 5 }).plano;
    p = agregarCamara(p, { x: 10, y: 10 }, MODELOS_CAMARA[0]).plano;
    return agregarPersona(p, { x: 50, y: 25 });
  };

  it("trae piso, muros extruidos, persona y cámara, del fondo al frente", () => {
    const plano = sitio();
    const figuras = escena3D({
      plano,
      tapas: tapasDelPlano(plano),
      coberturas: new Map(),
      vista: { ...base, ...VISTA_ISOMETRICA, centro: { x: 5, y: 2.5 } },
      limites: { min: { x: 0, y: 0 }, max: { x: 10, y: 5 } },
    });
    expect(figuras[0].tipo).toBe("piso");
    const caras = figuras.filter((f) => f.tipo === "cara");
    // 2 muros de 10 m en tramos de 1 m: cara de frente + tapa por tramo
    expect(caras).toHaveLength(40);
    expect(figuras.some((f) => f.tipo === "persona")).toBe(true);
    expect(figuras.some((f) => f.tipo === "camara")).toBe(true);
    const ds = figuras.filter((f): f is Extract<typeof f, { d: number }> => "d" in f).map((f) => f.d);
    expect([...ds].sort((a, b) => a - b)).toEqual(ds);
    // Corte «casa de muñecas»: el muro de enfrente enseña su cara de afuera (tapa el interior); el del fondo, la de adentro.
    const [atras, enfrente] = plano.muros;
    const verticales = (id: string) => caras.filter((f) => f.tipo === "cara" && f.origen === id && !f.superior);
    expect(verticales(enfrente.id).every((f) => f.tipo === "cara" && f.exterior)).toBe(true);
    expect(verticales(atras.id).some((f) => f.tipo === "cara" && f.exterior)).toBe(false);
  });

  it("desde arriba solo se pintan las tapas de los muros", () => {
    const plano = sitio();
    const figuras = escena3D({ plano, tapas: tapasDelPlano(plano), coberturas: new Map(), vista: { ...base, ...VISTA_SUPERIOR }, limites: null });
    expect(figuras.filter((f) => f.tipo === "cara").every((f) => f.tipo === "cara" && f.superior)).toBe(true);
  });

  it("encuadra el sitio dentro de la pantalla", () => {
    const r = encuadrar({ min: { x: 0, y: 0 }, max: { x: 58, y: 20 } }, { ...VISTA_ISOMETRICA, ancho: 900, alto: 560 });
    expect(r.centro).toEqual({ x: 29, y: 10 });
    expect(r.pxPorMetro).toBeGreaterThan(8);
    expect(r.pxPorMetro).toBeLessThan(20);
  });

  it("con pisos encima encuadra el edificio completo, centrado en pantalla", () => {
    const vista = { ...VISTA_ISOMETRICA, ancho: 900, alto: 560 };
    const lim = { min: { x: 0, y: 0 }, max: { x: 30, y: 20 } };
    const r = encuadrar(lim, vista, 7);
    const pr = proyector({ ...vista, ...r });
    const ys: number[] = [];
    for (const x of [0, 30]) for (const y of [0, 20]) for (const z of [0, 12]) ys.push(pr.pantalla({ x, y, z }).y);
    expect(Math.min(...ys)).toBeGreaterThanOrEqual(0);
    expect(Math.max(...ys)).toBeLessThanOrEqual(560);
    // el centro de lo que se ve queda a media pantalla (±5 %)
    expect(Math.abs((Math.min(...ys) + Math.max(...ys)) / 2 - 280)).toBeLessThan(28);
  });
});
