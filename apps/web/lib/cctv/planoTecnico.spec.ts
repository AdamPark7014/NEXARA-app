import { describe, expect, it } from "vitest";
import { MODELOS_CAMARA, modeloPorId } from "./catalogo";
import { agregarCamara, agregarMuro, resumenDelPlano } from "./editor";
import { GRABACION_POR_OMISION } from "./infraestructura";
import { agregarNivel, planoDeNivel, reemplazarNivel } from "./niveles";
import { planoVacio, type Plano } from "./plano";
import { cedulaDeEquipos, ejesDelPlano, escalaNormalizada, pasoBarraEscala, revisionDelSistema } from "./planoTecnico";

const K = 0.02;
const px = (m: number) => m / K;

function bodega(): Plano {
  let p: Plano = { ...planoVacio(), escala: { metrosPorPx: K, calibracion: { a: { x: 0, y: 0 }, b: { x: px(32), y: 0 }, metros: 32 } } };
  for (const [a, b] of [
    [[0, 0], [32, 0]],
    [[32, 0], [32, 18]],
    [[32, 18], [0, 18]],
    [[0, 18], [0, 0]],
    [[10, 0], [10, 18]],
    [[10.1, 5], [10.1, 7]],
  ] as const) {
    p = agregarMuro(p, { x: px(a[0]), y: px(a[1]) }, { x: px(b[0]), y: px(b[1]) }).plano;
  }
  return p;
}

describe("ejes del plano técnico", () => {
  it("pone un eje por línea de muros, con letras en las columnas y números en las filas", () => {
    const { x, y } = ejesDelPlano(bodega());
    expect(x.map((e) => e.nombre)).toEqual(["A", "B", "C"]);
    expect(x[0].m).toBeCloseTo(0);
    expect(x[2].m).toBeCloseTo(32);
    // 10.0 y 10.1 son el mismo eje.
    expect(x[1].m).toBeCloseTo(10.03, 1);
    expect(y.map((e) => e.nombre)).toEqual(["1", "2"]);
    expect(y[1].m).toBeCloseTo(18);
  });

  it("los muros en diagonal no generan ejes", () => {
    let p = planoVacio();
    p = agregarMuro(p, { x: 0, y: 0 }, { x: px(5), y: px(5) }).plano;
    expect(ejesDelPlano(p)).toEqual({ x: [], y: [] });
  });

  it("con demasiadas líneas se queda con las más separadas, sin perder las orillas", () => {
    let p = planoVacio();
    for (let i = 0; i <= 30; i++) p = agregarMuro(p, { x: px(i), y: 0 }, { x: px(i), y: px(8) }).plano;
    const { x } = ejesDelPlano(p);
    expect(x.length).toBeLessThanOrEqual(12);
    expect(x[0].m).toBeCloseTo(0);
    expect(x[x.length - 1].m).toBeCloseTo(30);
  });
});

describe("escala del plano técnico", () => {
  it("elige la escala normalizada más grande que cabe en el papel", () => {
    expect(escalaNormalizada(46, 38, 280, 230)).toBe(200);
    expect(escalaNormalizada(10, 8, 280, 230)).toBe(50);
    expect(escalaNormalizada(5000, 5000, 280, 230)).toBe(2000);
  });

  it("la barra de escala usa tramos redondos", () => {
    expect(pasoBarraEscala(100)).toBe(2);
    expect(pasoBarraEscala(200)).toBe(5);
    expect(pasoBarraEscala(500)).toBe(10);
  });
});

describe("cédula y revisión del sistema", () => {
  const [domo, , , turret] = MODELOS_CAMARA;

  it("cuenta por modelo en todo el edificio y suma el consumo de la ficha", () => {
    let raiz = bodega();
    raiz = agregarCamara(raiz, { x: px(1), y: px(1) }, domo).plano;
    raiz = agregarCamara(raiz, { x: px(2), y: px(1) }, domo).plano;
    const { raiz: conPiso, id } = agregarNivel(raiz);
    const arriba = agregarCamara(planoDeNivel(conPiso, id), { x: px(1), y: px(1) }, turret, { numero: 3 }).plano;
    const c = cedulaDeEquipos(reemplazarNivel(conPiso, id, arriba));
    expect(c.total).toBe(3);
    expect(c.filas.find((f) => f.modelo === domo.modelo)?.cantidad).toBe(2);
    const fila = c.filas.find((f) => f.modelo === turret.modelo);
    expect(fila?.tipo).toBe("Turret");
    expect(fila?.watts).toBeCloseTo(modeloPorId(turret.id)?.wattsPoe ?? 0);
  });

  it("avisa si falta calibrar y dice qué grabador alcanza", () => {
    let raiz: Plano = { ...bodega(), escala: { metrosPorPx: K, calibracion: null } };
    for (let i = 0; i < 9; i++) raiz = agregarCamara(raiz, { x: px(1 + i), y: px(1) }, domo).plano;
    const r = revisionDelSistema(raiz, resumenDelPlano(raiz), GRABACION_POR_OMISION);
    expect(r.find((x) => x.titulo === "Escala")?.ok).toBe(false);
    expect(r.find((x) => x.titulo === "Canales del grabador")?.detalle).toContain("grabador de 16 canales");
    expect(r.find((x) => x.titulo === "Grabación")?.detalle).toContain("30 días");
  });

  it("sin cámaras no inventa consumo ni grabación", () => {
    const r = revisionDelSistema(bodega(), null, GRABACION_POR_OMISION);
    expect(r.map((x) => x.titulo)).toEqual(["Escala"]);
    expect(r[0].ok).toBe(true);
  });
});
