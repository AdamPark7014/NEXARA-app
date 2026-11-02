import * as THREE from "three";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { MODELOS_CAMARA } from "../catalogo";
import { agregarAbertura, agregarArea, agregarCamara, agregarMueble, agregarMuro, agregarObstaculo, type Seleccion } from "../editor";
import { limitesEdificio, limitesSitio } from "../medidas";
import { planoVacio, tapasDelPlano, type Plano } from "../plano";
import { camaraEnMetros, coberturaCamara, type PoligonoCobertura } from "../visibilidad";
import {
  claseObstaculo,
  construirArquitectura,
  construirAreas,
  construirCamaras,
  construirCoberturas,
  construirMuebles,
  construirObstaculos,
  construirRayos,
  escalaVisualEquipos,
  lamparasDeNoche,
  materialesArquitectura,
  tipoModeloDe,
} from "./escena";
import { crearModelo, inclinarModelo } from "./modelos";

const K = 0.02;
const px = (m: number) => m / K;

beforeEach(() => {
  // jsdom no pinta en lienzos: las texturas y letreros se omiten.
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(null);
});

function cuarto(): Plano {
  let p: Plano = { ...planoVacio(), escala: { metrosPorPx: K, calibracion: null } };
  for (const [a, b] of [
    [[0, 0], [20, 0]],
    [[20, 0], [20, 10]],
    [[20, 10], [0, 10]],
    [[0, 10], [0, 0]],
  ] as const) {
    p = agregarMuro(p, { x: px(a[0]), y: px(a[1]) }, { x: px(b[0]), y: px(b[1]) }, { alturaM: 3 }).plano;
  }
  return p;
}

const elegibles = (g: THREE.Object3D) => {
  const salida: Seleccion[] = [];
  g.traverse((n) => {
    if (n.userData.sel) salida.push(n.userData.sel as Seleccion);
  });
  return salida;
};

describe("modelos de cámaras", () => {
  const medidas = (m: THREE.Object3D) => new THREE.Box3().setFromObject(m).getSize(new THREE.Vector3());

  it("el domo mide lo que dice la ficha", () => {
    const t = medidas(crearModelo("domo", { diametroMm: 121.4, altoMm: 97.7 }));
    expect(t.x * 1000).toBeCloseTo(121.4, 0);
    expect(t.y * 1000).toBeCloseTo(97.7, 0);
  });

  it("otras medidas de ficha cambian el modelo", () => {
    const chico = medidas(crearModelo("ptz", { diametroMm: 120, altoMm: 110 }));
    const grande = medidas(crearModelo("ptz", { diametroMm: 240, altoMm: 220 }));
    expect(grande.x / chico.x).toBeCloseTo(2, 1);
  });

  it("la inclinación del plano mueve el ojo y no el molde de las demás", () => {
    const a = crearModelo("domo");
    const b = crearModelo("domo");
    inclinarModelo(a, 30);
    inclinarModelo(b, 60);
    const giros = (m: THREE.Object3D) => {
      const r: number[] = [];
      m.traverse((n) => {
        if (n.userData.ojoMaxDeg != null) r.push(n.rotation.x);
      });
      return r;
    };
    expect(giros(a)[0]).toBeCloseTo(THREE.MathUtils.degToRad(30));
    expect(giros(b)[0]).toBeCloseTo(THREE.MathUtils.degToRad(60));
  });

  it("escoge el tipo por el catálogo; una PTZ marcada manda", () => {
    expect(tipoModeloDe({ productoId: "hik-ds-2cd1143g2-liuf" })).toBe("domo");
    expect(tipoModeloDe({ productoId: "hik-ds-2cfw06-p" })).toBe("bala");
    expect(tipoModeloDe({ productoId: "hik-ds-2cd2347g2-lu" })).toBe("turret");
    expect(tipoModeloDe({ productoId: "desconocida", esPtz: true })).toBe("ptz");
    expect(tipoModeloDe({ productoId: null })).toBe("domo");
  });
});

describe("arquitectura de la maqueta", () => {
  const mats = materialesArquitectura();

  it("un hueco parte el muro: quedan los tramos, el antepecho y el dintel", () => {
    const p0 = cuarto();
    const r = agregarAbertura(p0, p0.muros[0].id, 0.5, "ventana");
    const { muros } = construirArquitectura(r.plano, mats);
    const conVentana = muros.find((m) => m.id === p0.muros[0].id)!;
    // Izquierda, derecha, abajo y arriba de la ventana.
    expect(conVentana.mallas).toHaveLength(4);
    const sinHueco = muros.find((m) => m.id === p0.muros[1].id)!;
    expect(sinHueco.mallas).toHaveLength(1);
  });

  it("los muros de la orilla saben hacia dónde queda afuera; los de adentro no se vuelven tenues", () => {
    let p = cuarto();
    const interior = agregarMuro(p, { x: px(10), y: 0 }, { x: px(10), y: px(10) });
    p = interior.plano;
    const { muros } = construirArquitectura(p, mats);
    const norte = muros.find((m) => m.id === p.muros[0].id)!;
    expect(norte.exterior).toBe(true);
    expect(norte.normal.y).toBeLessThan(0);
    expect(muros.find((m) => m.id === interior.muro!.id)?.exterior).toBe(false);
  });

  it("todo lo que se dibuja se puede elegir", () => {
    let p = cuarto();
    p = agregarArea(p, { x: 0, y: 0 }, { x: px(5), y: px(5) }, "madera").plano;
    p = agregarMueble(p, { x: px(4), y: px(4) }, "escritorio").plano;
    p = agregarObstaculo(p, { x: px(8), y: px(4) }, { x: px(15), y: px(5) }).plano;
    expect(elegibles(construirAreas(p))[0]).toEqual({ tipo: "area", id: p.areas![0].id });
    expect(elegibles(construirMuebles(p))[0]).toEqual({ tipo: "mueble", id: p.muebles![0].id });
    expect(elegibles(construirObstaculos(p, mats))[0]).toEqual({ tipo: "obstaculo", id: p.obstaculos[0].id });
    expect(elegibles(construirArquitectura(p, mats).grupo).filter((s) => s.tipo === "muro").length).toBe(4);
  });

  it("el nombre del obstáculo decide cómo se ve", () => {
    expect(claseObstaculo({ nombre: "Anaquel 3" })).toBe("anaquel");
    expect(claseObstaculo({ nombre: "RACK de tarimas" })).toBe("anaquel");
    expect(claseObstaculo({ nombre: "Columna" })).toBe("columna");
    expect(claseObstaculo({})).toBe("bloque");
  });

  it("un anaquel lleva estructura y cajas, en su lugar", () => {
    let p = cuarto();
    p = agregarObstaculo(p, { x: px(2), y: px(2) }, { x: px(12), y: px(3) }).plano;
    p = { ...p, obstaculos: p.obstaculos.map((o) => ({ ...o, nombre: "Anaquel" })) };
    const g = construirObstaculos(p, mats);
    g.updateMatrixWorld(true);
    let instancias = 0;
    g.traverse((n) => {
      if ((n as THREE.InstancedMesh).isInstancedMesh) instancias += (n as THREE.InstancedMesh).count;
    });
    expect(instancias).toBeGreaterThan(20);
    const toque = new THREE.Box3();
    g.traverse((n) => {
      if (n.userData.esProxy) toque.setFromObject(n);
    });
    expect(toque.min.x).toBeCloseTo(2, 1);
    expect(toque.max.x).toBeCloseTo(12, 1);
    expect(toque.min.z).toBeCloseTo(2, 1);
    expect(toque.max.z).toBeCloseTo(3, 1);
  });
});

describe("cámaras en la maqueta", () => {
  const conCamara = (extra = {}) => agregarCamara(cuarto(), { x: px(10), y: 0 }, MODELOS_CAMARA[0], { numero: 7, rumboDeg: 180, alturaM: 3, ...extra }).plano;

  it("la clave lleva el número y queda arriba del equipo", () => {
    const { etiquetas } = construirCamaras(conCamara(), { escala: 1 });
    expect(etiquetas[0].clave).toBe("CAM-07");
    expect(etiquetas[0].pos.y).toBeGreaterThan(3);
  });

  it("en muro se separa hacia donde mira y no queda encajada en él", () => {
    const { etiquetas } = construirCamaras(conCamara(), { escala: 1 });
    expect(etiquetas[0].pos.z).toBeGreaterThan(0.05);
    expect(etiquetas[0].pos.x).toBeCloseTo(10);
  });

  it("en poste se aleja de su base por el brazo, en la dirección del rumbo", () => {
    const { etiquetas } = construirCamaras(conCamara({ montaje: "poste" }), { escala: 1 });
    expect(etiquetas[0].pos.z).toBeCloseTo(0.8);
  });

  it("agrandada sigue colgando de su altura de montaje", () => {
    const p = conCamara();
    const altura = (esc: number) => {
      const { grupo } = construirCamaras(p, { escala: esc });
      grupo.updateMatrixWorld(true);
      let top = -Infinity;
      grupo.traverse((n) => {
        if ((n as THREE.Mesh).isMesh && !n.userData.esProxy && n.parent?.parent?.parent?.parent) {
          const b = new THREE.Box3().setFromObject(n);
          top = Math.max(top, b.max.y);
        }
      });
      return top;
    };
    expect(altura(1)).toBeCloseTo(3, 0);
    expect(altura(5)).toBeCloseTo(3, 0);
  });

  it("al ver desde una cámara, esa no estorba", () => {
    const p = conCamara();
    const { grupo } = construirCamaras(p, { escala: 1, ocultar: p.camaras[0].id });
    const ocultos = grupo.children.filter((c) => !c.visible && !c.userData.esProxy);
    expect(ocultos.length).toBeGreaterThan(0);
  });

  it("la elegida enseña su campo de visión desde la lente", () => {
    const p = conCamara();
    const r = construirRayos(p, p.camaras[0].id)!;
    const pos = r.geometry.getAttribute("position");
    expect(pos.getY(0)).toBeCloseTo(3);
    expect(pos.getY(1)).toBeLessThan(0.1);
    expect(construirRayos(p, "no-existe")).toBeNull();
  });

  it("los equipos se agrandan según el tamaño del sitio, con tope", () => {
    expect(escalaVisualEquipos({ min: { x: 0, y: 0 }, max: { x: 3, y: 3 } })).toBeCloseTo(1.6);
    expect(escalaVisualEquipos({ min: { x: 0, y: 0 }, max: { x: 32, y: 18 } })).toBeCloseTo(4.4, 1);
    expect(escalaVisualEquipos({ min: { x: 0, y: 0 }, max: { x: 300, y: 300 } })).toBe(6);
  });
});

describe("cobertura en la maqueta", () => {
  it("cada polígono real se vuelve una capa en el piso con su color", () => {
    const p = agregarCamara(cuarto(), { x: px(1), y: px(1) }, MODELOS_CAMARA[0], { rumboDeg: 135, alturaM: 3, distanciaM: 15 }).plano;
    const cm = camaraEnMetros(p.camaras[0], p.escala)!;
    const pols = coberturaCamara(cm, tapasDelPlano(p));
    const g = construirCoberturas(new Map([[p.camaras[0].id, pols]]), p.camaras[0].id);
    expect(g.userData.poligonos).toBe(pols.length);
    expect(pols.length).toBeGreaterThan(0);
  });

  it("no truena con polígonos degenerados", () => {
    const malos: PoligonoCobertura[] = [{ nivel: "general", puntos: [{ x: 0, y: 0 }] }];
    expect(construirCoberturas(new Map([["a", malos]]), null).userData.poligonos).toBe(0);
  });
});

describe("medidas y noche", () => {
  it("la base incluye los conos, con tope de 40 m más allá del edificio", () => {
    const p = cuarto();
    const lejos: PoligonoCobertura = { nivel: "general", puntos: [{ x: 100, y: 5 }, { x: 110, y: 5 }, { x: 110, y: 9 }] };
    const lim = limitesSitio(p, new Map([["a", [lejos]]]));
    expect(lim.max.x).toBeCloseTo(60);
    expect(limitesEdificio(p)?.max.x).toBeCloseTo(20);
  });

  it("sin nada dibujado la base tiene un tamaño razonable", () => {
    expect(limitesSitio(planoVacio())).toEqual({ min: { x: 0, y: 0 }, max: { x: 20, y: 12 } });
  });

  it("de noche prende lámparas por área o, sin áreas, en retícula, y no se pasa de 16", () => {
    const sin = lamparasDeNoche(cuarto());
    expect(sin.length).toBeGreaterThan(0);
    expect(sin.length).toBeLessThanOrEqual(16);
    const conArea = agregarArea(cuarto(), { x: 0, y: 0 }, { x: px(8), y: px(8) }, "madera").plano;
    const una = lamparasDeNoche(conArea);
    expect(una).toHaveLength(1);
    expect(una[0].x).toBeCloseTo(4);
    // El patio no lleva lámpara de interior.
    const patio = agregarArea(cuarto(), { x: 0, y: 0 }, { x: px(8), y: px(8) }, "asfalto").plano;
    expect(lamparasDeNoche(patio).every((l) => l.alcance > 0)).toBe(true);
  });
});
