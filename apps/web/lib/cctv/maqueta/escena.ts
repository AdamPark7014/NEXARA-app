/**
 * Arma la maqueta 3D a partir del `Plano` del diseño: terreno y pisos, muros cortados como en una
 * maqueta de arquitecto, huecos, obstáculos, ambientación, cámaras a su altura y cobertura DORI.
 *
 * Ejes: el plano (x, y) en metros pasa a (x, z) y la altura es Y. Cada pieza que se puede elegir
 * lleva `userData.sel` con su tipo e id; las que son complicadas llevan una malla invisible para
 * tocarlas (`esProxy`), así elegir no recorre miles de triángulos.
 */
import * as THREE from "three";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import { FAMILIA_DE_TIPO, equipoPorId, modeloPorId, type TipoEquipo } from "../catalogo";
import { cajaDe, claveCamara, claveEquipo, limitesEdificio, type Limites } from "../medidas";
import type { Seleccion } from "../editor";
import { aRad, type NivelCobertura } from "../optica";
import { aMetros, dirRumbo, distancia, hojasPuerta, type Abertura, type CamaraPlano, type EquipoPlano, type Muro, type Obstaculo, type Plano, type Punto } from "../plano";
import { COLOR_CABLE, type ClaseCable, type Conexion } from "../sistema";
import { camaraEnMetros, distanciaPuntoSegmento, type PoligonoCobertura } from "../visibilidad";
import { crearAnaquel, crearMueble, crearPersona } from "./mobiliario";
import { crearModelo, inclinarModelo, poste, type TipoModelo } from "./modelos";
import { crearModeloEquipo, montarEnGabinete, type ParamsEquipo } from "./modelosEquipos";
import { materialPiso } from "./texturas";

export type { Limites };

/** Colores de los niveles DORI en la maqueta y el plano (mockup aprobado 01-11-2026). */
export const COLOR_NIVEL_HEX: Readonly<Record<NivelCobertura, number>> = {
  identificacion: 0x0aa870,
  reconocimiento: 0x0d8cd9,
  observacion: 0x3d5ce6,
  deteccion: 0x8c6bd9,
  general: 0x9aa3af,
};

const OPACIDAD: Readonly<Record<NivelCobertura, number>> = { identificacion: 0.56, reconocimiento: 0.46, observacion: 0.38, deteccion: 0.26, general: 0.14 };

/* ── Medidas del sitio ──────────────────────────────────────────────────────────── */

/** Cuánto se agrandan los equipos en la vista general: una cámara real mide 12 cm. */
export function escalaVisualEquipos(lim: Limites): number {
  const diagonal = Math.hypot(lim.max.x - lim.min.x, lim.max.y - lim.min.y);
  return Math.min(Math.max(diagonal * 0.12, 1.6), 6);
}

/** Sombras y selección: marca una malla como elegible. */
function elegible<T extends THREE.Object3D>(o: T, sel: Seleccion): T {
  o.userData.sel = sel;
  return o;
}

/** Malla invisible del tamaño de `caja`, para tocar piezas complicadas. */
function proxy(caja: THREE.Box3, sel: Seleccion): THREE.Mesh {
  const tam = caja.getSize(new THREE.Vector3());
  const m = new THREE.Mesh(new THREE.BoxGeometry(Math.max(tam.x, 0.3), Math.max(tam.y, 0.3), Math.max(tam.z, 0.3)));
  caja.getCenter(m.position);
  m.visible = false;
  m.userData.esProxy = true;
  return elegible(m, sel);
}

function piso(puntos: readonly Punto[], material: THREE.Material, y = 0): THREE.Mesh {
  const s = new THREE.Shape();
  puntos.forEach((p, i) => (i ? s.lineTo(p.x, -p.y) : s.moveTo(p.x, -p.y)));
  const m = new THREE.Mesh(new THREE.ShapeGeometry(s), material);
  m.rotation.x = -Math.PI / 2;
  m.position.y = y;
  m.receiveShadow = true;
  return m;
}

const rect = (x0: number, y0: number, x1: number, y1: number): Punto[] => [
  { x: x0, y: y0 },
  { x: x1, y: y0 },
  { x: x1, y: y1 },
  { x: x0, y: y1 },
];

/* ── Terreno y pisos ────────────────────────────────────────────────────────────── */

export const MARGEN_BASE_M = 3;

/** Base de la maqueta, pasto, banqueta y losa del edificio. Solo la lleva el nivel de abajo. */
export function construirTerreno(plano: Plano, lim: Limites): THREE.Group {
  const g = new THREE.Group();
  const m = MARGEN_BASE_M;
  const x0 = lim.min.x - m;
  const y0 = lim.min.y - m;
  const x1 = lim.max.x + m;
  const y1 = lim.max.y + m;
  const mesa = new THREE.Mesh(new THREE.PlaneGeometry(1200, 1200), new THREE.MeshStandardMaterial({ color: 0xd9dcdf, roughness: 0.9 }));
  mesa.rotation.x = -Math.PI / 2;
  mesa.position.set((x0 + x1) / 2, -1.04, (y0 + y1) / 2);
  mesa.receiveShadow = true;
  mesa.userData.esMesa = true;
  g.add(mesa);
  const base = new THREE.Mesh(new RoundedBoxGeometry(x1 - x0 + 0.8, 1, y1 - y0 + 0.8, 3, 0.12), new THREE.MeshStandardMaterial({ color: 0xf4f4f2, roughness: 0.66 }));
  base.position.set((x0 + x1) / 2, -0.56, (y0 + y1) / 2);
  base.receiveShadow = true;
  base.castShadow = true;
  g.add(base);
  g.add(piso(rect(x0, y0, x1, y1), materialPiso("pasto"), -0.04));
  const ed = limitesEdificio(plano);
  if (ed) {
    g.add(piso(rect(ed.min.x - 1.5, ed.min.y - 1.5, ed.max.x + 1.5, ed.max.y + 1.5), new THREE.MeshStandardMaterial({ color: 0xd9d9d4, roughness: 0.88 }), -0.015));
    g.add(piso(rect(ed.min.x, ed.min.y, ed.max.x, ed.max.y), materialPiso("concreto"), -0.005));
  }
  return g;
}

/** Losa de un piso de arriba: tapa poco para que se adivine lo de abajo. */
export function construirLosa(plano: Plano, lim: Limites): THREE.Group {
  const g = new THREE.Group();
  const ed = limitesEdificio(plano) ?? lim;
  const losa = new THREE.Mesh(
    new THREE.BoxGeometry(ed.max.x - ed.min.x + 0.2, 0.14, ed.max.y - ed.min.y + 0.2),
    new THREE.MeshStandardMaterial({ color: 0xc9ccd0, roughness: 0.7, transparent: true, opacity: 0.86 }),
  );
  losa.position.set((ed.min.x + ed.max.x) / 2, -0.08, (ed.min.y + ed.max.y) / 2);
  losa.receiveShadow = true;
  g.add(losa);
  return g;
}

/** Áreas con su piso. Van encima de la losa y debajo de la cobertura. */
export function construirAreas(plano: Plano): THREE.Group {
  const g = new THREE.Group();
  (plano.areas ?? []).forEach((a, i) => {
    if (a.puntos.length < 3) return;
    const puntos = a.puntos.map((p) => aMetros(p, plano.escala));
    // Asfalto y pasto son de afuera: quedan al ras del terreno.
    const y = (a.piso === "asfalto" || a.piso === "pasto" ? -0.012 : 0.006) + i * 0.0006;
    g.add(elegible(piso(puntos, materialPiso(a.piso), y), { tipo: "area", id: a.id }));
  });
  return g;
}

/* ── Muros y huecos ─────────────────────────────────────────────────────────────── */

type Materiales = ReturnType<typeof materialesArquitectura>;

export function materialesArquitectura() {
  const mats = {
    muro: new THREE.MeshStandardMaterial({ color: 0xf1f1ee, roughness: 0.86 }),
    /** Muro de afuera que tapa el interior desde donde se ve. */
    muroTenue: new THREE.MeshStandardMaterial({ color: 0xf1f1ee, roughness: 0.86, transparent: true, opacity: 0.16, depthWrite: false }),
    muroSeleccion: new THREE.MeshStandardMaterial({ color: 0xbfe7df, roughness: 0.7, emissive: 0x0f7f6c, emissiveIntensity: 0.18 }),
    muroApagado: new THREE.MeshStandardMaterial({ color: 0xb3b9c1, roughness: 0.9, transparent: true, opacity: 0.32, depthWrite: false }),
    corte: new THREE.MeshStandardMaterial({ color: 0x23272e, roughness: 0.7 }),
    marco: new THREE.MeshStandardMaterial({ color: 0x2b2f35, metalness: 0.8, roughness: 0.36 }),
    vidrio: new THREE.MeshPhysicalMaterial({ color: 0xcfe6ee, transparent: true, opacity: 0.22, roughness: 0.04, clearcoat: 1, depthWrite: false, side: THREE.DoubleSide }),
    opaco: new THREE.MeshStandardMaterial({ color: 0xa8b4bc, roughness: 0.3 }),
    hoja: new THREE.MeshStandardMaterial({ color: 0xb98d5e, roughness: 0.55 }),
    porton: new THREE.MeshStandardMaterial({ color: 0xdfe2e5, metalness: 0.45, roughness: 0.42 }),
    reja: new THREE.MeshStandardMaterial({ color: 0x3a3f46, metalness: 0.7, roughness: 0.44 }),
    bloque: new THREE.MeshStandardMaterial({ color: 0xc4c9cf, roughness: 0.74 }),
  };
  for (const m of Object.values(mats)) m.userData.compartido = true;
  return mats;
}

/** Muro armado: sus mallas y hacia dónde queda «afuera» (para volverlo tenue si tapa). */
export type MuroMaqueta = { id: string; mallas: THREE.Mesh[]; exterior: boolean; normal: Punto; alturaM: number };

function cajaRecta(a: Punto, b: Punto, y0: number, y1: number, grueso: number, material: THREE.Material): THREE.Mesh {
  const l = distancia(a, b);
  const m = new THREE.Mesh(new THREE.BoxGeometry(l, y1 - y0, grueso), material);
  m.position.set((a.x + b.x) / 2, (y0 + y1) / 2, (a.y + b.y) / 2);
  m.rotation.y = Math.atan2(-(b.y - a.y), b.x - a.x);
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
}

/** ¿Este extremo toca otro muro? Entonces se alarga medio grosor para cerrar la esquina. */
function extremoUnido(plano: Plano, muro: Muro, p: Punto): boolean {
  const tol = 0.04 / plano.escala.metrosPorPx;
  return plano.muros.some((o) => o.id !== muro.id && o.tipo === "muro" && (distancia(o.a, p) < tol || distancia(o.b, p) < tol || distanciaPuntoSegmento(p, o.a, o.b) < tol));
}

export function construirArquitectura(plano: Plano, mats: Materiales, opciones: { apagado?: boolean } = {}): { grupo: THREE.Group; muros: MuroMaqueta[] } {
  const grupo = new THREE.Group();
  const muros: MuroMaqueta[] = [];
  const ed = limitesEdificio(plano);
  for (const muro of plano.muros) {
    const a = aMetros(muro.a, plano.escala);
    const b = aMetros(muro.b, plano.escala);
    const L = distancia(a, b);
    if (L < 1e-3) continue;
    const u = { x: (b.x - a.x) / L, y: (b.y - a.y) / L };
    const en = (d: number): Punto => ({ x: a.x + u.x * d, y: a.y + u.y * d });
    const sel: Seleccion = { tipo: "muro", id: muro.id };
    const dato = (d0: number, d1: number) => ({ a: en(d0), b: en(d1) });
    const mallas: THREE.Mesh[] = [];

    if (muro.tipo === "vidrio") {
      const vidrio = elegible(cajaRecta(a, b, 0, muro.alturaM, 0.02, mats.vidrio), sel);
      vidrio.castShadow = false;
      grupo.add(vidrio);
      for (let d = 0; d <= L + 1e-6; d += Math.max(L / Math.max(Math.round(L / 1.2), 1), 0.4)) {
        const f = cajaRecta(en(Math.max(d - 0.02, 0)), en(Math.min(d + 0.02, L)), 0, muro.alturaM, 0.05, mats.marco);
        grupo.add(f);
      }
      grupo.add(cajaRecta(a, b, muro.alturaM - 0.03, muro.alturaM, 0.05, mats.marco));
      grupo.add(cajaRecta(a, b, 0, 0.05, 0.05, mats.marco));
      continue;
    }
    if (muro.tipo === "reja") {
      const n = Math.max(2, Math.round(L / 0.16));
      const barras = new THREE.InstancedMesh(new THREE.BoxGeometry(0.018, muro.alturaM, 0.018), mats.reja, n);
      const d = new THREE.Object3D();
      for (let i = 0; i < n; i++) {
        const p = en((i / (n - 1)) * L);
        d.position.set(p.x, muro.alturaM / 2, p.y);
        d.updateMatrix();
        barras.setMatrixAt(i, d.matrix);
      }
      barras.castShadow = true;
      grupo.add(barras);
      grupo.add(cajaRecta(a, b, 0.18, 0.22, 0.03, mats.reja));
      grupo.add(cajaRecta(a, b, muro.alturaM - 0.1, muro.alturaM - 0.06, 0.03, mats.reja));
      const toque = cajaRecta(a, b, 0, muro.alturaM, 0.25, mats.reja);
      toque.visible = false;
      toque.userData.esProxy = true;
      grupo.add(elegible(toque, sel));
      continue;
    }

    const material = opciones.apagado ? mats.muroApagado : mats.muro;
    const ext0 = extremoUnido(plano, muro, muro.a) ? muro.grosorM / 2 : 0;
    const ext1 = extremoUnido(plano, muro, muro.b) ? muro.grosorM / 2 : 0;
    const pieza = (d0: number, d1: number, y0: number, y1: number, conCorte: boolean) => {
      if (d1 - d0 <= 1e-3 || y1 - y0 <= 1e-3) return;
      const ini = d0 <= 1e-6 ? d0 - ext0 : d0;
      const fin = d1 >= L - 1e-6 ? d1 + ext1 : d1;
      const { a: pa, b: pb } = dato(ini, fin);
      const m = elegible(cajaRecta(pa, pb, y0, y1, muro.grosorM, material), sel);
      if (opciones.apagado) m.castShadow = false;
      grupo.add(m);
      mallas.push(m);
      if (conCorte && !opciones.apagado) {
        const tapa = cajaRecta(pa, pb, y1, y1 + 0.012, muro.grosorM + 0.002, mats.corte);
        tapa.castShadow = false;
        grupo.add(tapa);
      }
    };
    const huecos = plano.aberturas
      .filter((h) => h.muroId === muro.id)
      .map((h) => ({ h, d0: Math.max(0, Math.min(h.desde, h.hasta)) * L, d1: Math.min(1, Math.max(h.desde, h.hasta)) * L }))
      .sort((x, y) => x.d0 - y.d0);
    let cursor = 0;
    for (const { h, d0, d1 } of huecos) {
      const desde = Math.max(d0, cursor);
      if (d1 <= desde) continue;
      pieza(cursor, desde, 0, muro.alturaM, true);
      pieza(desde, d1, 0, Math.min(h.baseM, muro.alturaM), h.baseM > 0);
      pieza(desde, d1, Math.min(h.baseM + h.alturaM, muro.alturaM), muro.alturaM, true);
      if (!opciones.apagado) construirHueco(grupo, h, en(desde), en(d1), muro, mats);
      cursor = d1;
    }
    pieza(cursor, L, 0, muro.alturaM, true);

    // Normal hacia afuera y si este muro está en la orilla del edificio.
    const medio = en(L / 2);
    const centro = ed ? { x: (ed.min.x + ed.max.x) / 2, y: (ed.min.y + ed.max.y) / 2 } : medio;
    let normal = { x: -u.y, y: u.x };
    if ((medio.x - centro.x) * normal.x + (medio.y - centro.y) * normal.y < 0) normal = { x: -normal.x, y: -normal.y };
    const paso = muro.grosorM / 2 + 0.3;
    const asoma = { x: medio.x + normal.x * paso, y: medio.y + normal.y * paso };
    const exterior = Boolean(ed && (asoma.x < ed.min.x || asoma.x > ed.max.x || asoma.y < ed.min.y || asoma.y > ed.max.y));
    muros.push({ id: muro.id, mallas, exterior, normal, alturaM: muro.alturaM });
  }
  return { grupo, muros };
}

function construirHueco(grupo: THREE.Group, h: Abertura, a: Punto, b: Punto, muro: Muro, mats: Materiales) {
  const sel: Seleccion = { tipo: "abertura", id: h.id };
  const y0 = h.baseM;
  const y1 = Math.min(h.baseM + h.alturaM, muro.alturaM);
  const ancho = distancia(a, b);
  if (ancho < 1e-3 || y1 <= y0) return;
  const u = { x: (b.x - a.x) / ancho, y: (b.y - a.y) / ancho };
  const en = (d: number): Punto => ({ x: a.x + u.x * d, y: a.y + u.y * d });
  if (h.tipo === "ventana") {
    const panel = elegible(cajaRecta(a, b, y0, y1, 0.02, h.transparente ? mats.vidrio : mats.opaco), sel);
    panel.castShadow = !h.transparente;
    grupo.add(panel);
    const k = 0.05;
    grupo.add(cajaRecta(a, b, y0, y0 + k, 0.07, mats.marco), cajaRecta(a, b, y1 - k, y1, 0.07, mats.marco));
    const parteluces = Math.max(1, Math.round(ancho / 1.2) - 1);
    for (let i = 0; i <= parteluces + 1; i++) {
      const d = (i * ancho) / (parteluces + 1);
      grupo.add(cajaRecta(en(Math.max(d - 0.018, 0)), en(Math.min(d + 0.018, ancho)), y0, y1, 0.06, mats.marco));
    }
  } else if (h.tipo === "puerta") {
    for (const hoja of hojasPuerta(h, a, b)) {
      grupo.add(elegible(cajaRecta(hoja.a, hoja.b, y0, y1, 0.045, mats.hoja), sel));
    }
    grupo.add(cajaRecta(a, en(0.05), y0, y1, muro.grosorM + 0.01, mats.marco), cajaRecta(en(ancho - 0.05), b, y0, y1, muro.grosorM + 0.01, mats.marco));
    grupo.add(cajaRecta(a, b, y1 - 0.05, y1, muro.grosorM + 0.01, mats.marco));
  } else {
    // Cortina abierta: se ve el cajón arriba, las guías y el hueco libre.
    grupo.add(elegible(cajaRecta(a, b, y1 - 0.32, y1, 0.34, mats.porton), sel));
    grupo.add(cajaRecta(a, en(0.09), y0, y1, 0.12, mats.marco), cajaRecta(en(ancho - 0.09), b, y0, y1, 0.12, mats.marco));
  }
}

/* ── Obstáculos ─────────────────────────────────────────────────────────────────── */

export type ClaseObstaculo = "anaquel" | "columna" | "bloque";

/** Lo que se dibuja sale del nombre que le puso quien diseña. */
export function claseObstaculo(o: Pick<Obstaculo, "nombre">): ClaseObstaculo {
  const n = (o.nombre ?? "").toLowerCase();
  if (/anaquel|estant|tarima|rack/.test(n)) return "anaquel";
  if (/columna|pilar/.test(n)) return "columna";
  return "bloque";
}

export function construirObstaculos(plano: Plano, mats: Materiales, opciones: { apagado?: boolean } = {}): THREE.Group {
  const grupo = new THREE.Group();
  plano.obstaculos.forEach((o, i) => {
    const pts = o.puntos.map((p) => aMetros(p, plano.escala));
    if (pts.length < 3) return;
    const sel: Seleccion = { tipo: "obstaculo", id: o.id };
    const clase = claseObstaculo(o);
    if (!opciones.apagado && clase === "anaquel" && pts.length === 4) {
      const [p0, p1, , p3] = pts;
      // El lado largo manda la dirección del anaquel.
      const largoEsP01 = distancia(p0, p1) >= distancia(p0, p3);
      const inicio = p0;
      const fin = largoEsP01 ? p1 : p3;
      const lado = largoEsP01 ? p3 : p1;
      const largo = distancia(inicio, fin);
      const fondo = distancia(inicio, lado);
      if (largo > 0.2 && fondo > 0.2) {
        const u = { x: (fin.x - inicio.x) / largo, y: (fin.y - inicio.y) / largo };
        const zLocal = { x: -u.y, y: u.x };
        const haciaLado = (lado.x - inicio.x) * zLocal.x + (lado.y - inicio.y) * zLocal.y;
        const origen = haciaLado >= 0 ? inicio : lado;
        const g = crearAnaquel(largo, fondo, o.alturaM, i + 1);
        g.position.set(origen.x, 0, origen.y);
        g.rotation.y = -Math.atan2(u.y, u.x);
        grupo.add(g);
        const toque = new THREE.Mesh(new THREE.BoxGeometry(largo, o.alturaM, fondo));
        toque.position.set(largo / 2, o.alturaM / 2, fondo / 2);
        toque.visible = false;
        toque.userData.esProxy = true;
        g.add(elegible(toque, sel));
        return;
      }
    }
    const s = new THREE.Shape();
    pts.forEach((p, j) => (j ? s.lineTo(p.x, -p.y) : s.moveTo(p.x, -p.y)));
    const geo = new THREE.ExtrudeGeometry(s, { depth: o.alturaM, bevelEnabled: false });
    const m = new THREE.Mesh(geo, opciones.apagado ? mats.muroApagado : mats.bloque);
    m.rotation.x = -Math.PI / 2;
    m.castShadow = !opciones.apagado;
    m.receiveShadow = true;
    grupo.add(elegible(m, sel));
    if (!opciones.apagado) {
      const tapa = new THREE.Mesh(new THREE.ShapeGeometry(s), mats.corte);
      tapa.rotation.x = -Math.PI / 2;
      tapa.position.y = o.alturaM + 0.006;
      grupo.add(tapa);
    }
  });
  return grupo;
}

/* ── Ambientación y personas ────────────────────────────────────────────────────── */

const anguloDeRumbo = (rumboDeg: number) => Math.PI - aRad(rumboDeg);

/** Número fijo por pieza: da variedad (el color de cada auto) sin guardar nada más. */
function variante(id: string): number {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return h;
}

export function construirMuebles(plano: Plano): THREE.Group {
  const grupo = new THREE.Group();
  const k = plano.escala.metrosPorPx;
  for (const m of plano.muebles ?? []) {
    const g = crearMueble(m.tipo, variante(m.id));
    g.position.set(m.pos.x * k, 0, m.pos.y * k);
    g.rotation.y = anguloDeRumbo(m.rumboDeg);
    grupo.add(g);
    g.updateMatrixWorld(true);
    grupo.add(proxy(new THREE.Box3().setFromObject(g), { tipo: "mueble", id: m.id }));
  }
  return grupo;
}

export function construirPersonas(plano: Plano): THREE.Group {
  const grupo = new THREE.Group();
  const k = plano.escala.metrosPorPx;
  const anillo = new THREE.MeshBasicMaterial({ color: 0x2f6fde, transparent: true, opacity: 0.8, depthWrite: false });
  for (const h of plano.personas) {
    const x = h.pos.x * k;
    const z = h.pos.y * k;
    const g = crearPersona();
    g.position.set(x, 0, z);
    g.rotation.y = anguloDeRumbo(h.rumboDeg);
    grupo.add(g);
    const aro = new THREE.Mesh(new THREE.RingGeometry(0.4, 0.45, 40), anillo);
    aro.rotation.x = -Math.PI / 2;
    aro.position.set(x, 0.06, z);
    grupo.add(aro);
    const toque = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.4, 1.8, 8));
    toque.position.set(x, 0.9, z);
    toque.visible = false;
    toque.userData.esProxy = true;
    grupo.add(elegible(toque, { tipo: "persona", id: h.id }));
  }
  return grupo;
}

/* ── Cámaras ────────────────────────────────────────────────────────────────────── */

export function tipoModeloDe(c: Pick<CamaraPlano, "productoId" | "esPtz">): TipoModelo {
  const t = modeloPorId(c.productoId)?.tipo;
  if (c.esPtz || t === "ptz") return "ptz";
  return t === "bala" || t === "turret" ? t : "domo";
}

export type EtiquetaEquipo = {
  id: string;
  clave: string;
  nombre: string;
  pos: THREE.Vector3;
  rumboDeg: number;
  /** Qué se elige al tocar la clave. */
  tipoSel: "camara" | "equipo";
  /** Color del punto: el de su familia. */
  punto: string;
};

export const COLOR_PUNTO_CAMARA = "#15b89a";

export function colorPuntoEquipo(tipo: TipoEquipo): string {
  const f = FAMILIA_DE_TIPO[tipo];
  return f === "acceso" ? "#f2b23d" : f === "alarmas" ? "#e25555" : "#7aa2ff";
}

const matAccesorio = new THREE.MeshStandardMaterial({ color: 0xd8dbdf, roughness: 0.5, metalness: 0.5 });
matAccesorio.userData.compartido = true;

export function construirCamaras(plano: Plano, opciones: { escala: number; ocultar?: string | null }): { grupo: THREE.Group; etiquetas: EtiquetaEquipo[] } {
  const grupo = new THREE.Group();
  const etiquetas: EtiquetaEquipo[] = [];
  const esc = opciones.escala;
  const muros = plano.muros.map((m) => ({ m, a: aMetros(m.a, plano.escala), b: aMetros(m.b, plano.escala) }));
  for (const c of plano.camaras) {
    const sel: Seleccion = { tipo: "camara", id: c.id };
    const pos = aMetros(c.pos, plano.escala);
    const tipo = tipoModeloDe(c);
    const ficha = modeloPorId(c.productoId);
    const modelo = crearModelo(tipo, {
      marca: ficha?.marca || undefined,
      ...ficha?.medidas,
      color: ficha?.apariencia?.color,
      cajaTrasera: ficha?.apariencia?.cajaTrasera,
      ledsVisibles: ficha?.apariencia?.luces ?? undefined,
    });
    inclinarModelo(modelo, c.inclinacionDeg);
    const dir = dirRumbo(c.rumboDeg);
    // Las medidas se toman antes de agrandarlo.
    const cajaModelo = new THREE.Box3().setFromObject(modelo);
    const contenedor = new THREE.Group();
    contenedor.add(modelo);
    contenedor.scale.setScalar(esc);
    contenedor.rotation.y = anguloDeRumbo(c.rumboDeg);
    const alto = (cajaModelo.max.y - cajaModelo.min.y) * esc;
    const radio = (Math.max(cajaModelo.max.x - cajaModelo.min.x, cajaModelo.max.z - cajaModelo.min.z) / 2) * esc;
    const esBala = tipo === "bala";
    const montaje = c.montaje ?? "muro";
    let x = pos.x;
    let z = pos.y;
    const accesorios = new THREE.Group();
    if (montaje === "poste") {
      const brazo = Math.max(0.8, radio + 0.3);
      const p = poste(c.alturaM, brazo);
      p.position.set(pos.x, 0, pos.y);
      p.rotation.y = anguloDeRumbo(c.rumboDeg);
      accesorios.add(p);
      x = pos.x + dir.x * brazo;
      z = pos.y + dir.y * brazo;
    } else if (montaje === "muro") {
      // Se separa de los muros que tiene al lado lo que mide el equipo, con su ménsula. En una esquina son dos.
      const cercanos: Array<{ n: Punto; d: number; g: number; u: Punto }> = [];
      for (const { m, a, b } of muros) {
        if (m.tipo !== "muro") continue;
        const d = distanciaPuntoSegmento(pos, a, b);
        if (d > 1) continue;
        const L = distancia(a, b);
        if (L < 1e-3) continue;
        const u = { x: (b.x - a.x) / L, y: (b.y - a.y) / L };
        let n = { x: -u.y, y: u.x };
        // El lado lo da dónde está; solo si está sobre el muro se usa hacia dónde mira.
        const lado = (pos.x - a.x) * n.x + (pos.y - a.y) * n.y;
        if (Math.abs(lado) > 0.02 ? lado < 0 : n.x * dir.x + n.y * dir.y < 0) n = { x: -n.x, y: -n.y };
        cercanos.push({ n, d, g: m.grosorM, u });
      }
      cercanos.sort((p1, p2) => p1.d - p2.d);
      const primero = cercanos[0];
      const segundo = primero ? cercanos.find((o) => o.d <= 0.6 && Math.abs(o.u.x * primero.u.y - o.u.y * primero.u.x) > 0.3) : undefined;
      if (primero && segundo) {
        // De espaldas a la esquina el equipo es más ancho que hondo: que no se meta en ninguno de los dos muros.
        const anchoMitad = ((cajaModelo.max.x - cajaModelo.min.x) / 2) * esc;
        const hueco = Math.max(esBala ? anchoMitad * 0.75 + 0.02 : radio * 0.8 + 0.04, 0.06);
        let esquinaX = x;
        let esquinaZ = z;
        for (const o of [primero, segundo]) {
          const falta = o.g / 2 + hueco - o.d;
          if (falta > 0) {
            x += o.n.x * falta;
            z += o.n.y * falta;
          }
          esquinaX -= o.n.x * Math.max(o.d - o.g / 2, 0);
          esquinaZ -= o.n.y * Math.max(o.d - o.g / 2, 0);
        }
        const dx = x - esquinaX;
        const dz = z - esquinaZ;
        const brazoL = Math.max(Math.hypot(dx, dz), 0.06);
        const giro = Math.atan2(dx, dz);
        const brazo = new THREE.Mesh(new THREE.BoxGeometry(0.05 * esc, 0.03 * esc, brazoL), matAccesorio);
        brazo.position.set(esquinaX + dx / 2, c.alturaM + 0.01, esquinaZ + dz / 2);
        brazo.rotation.y = giro;
        brazo.castShadow = true;
        // La placa que abraza la esquina.
        const placa = new THREE.Mesh(new THREE.BoxGeometry(Math.min(brazoL * 1.5, 0.2 * esc), 0.12 * esc, 0.012), matAccesorio);
        placa.position.set(esquinaX + (dx / brazoL) * 0.03, c.alturaM + 0.01, esquinaZ + (dz / brazoL) * 0.03);
        placa.rotation.y = giro;
        placa.castShadow = true;
        accesorios.add(brazo, placa);
      } else if (primero) {
        const salida = primero.g / 2 + (esBala ? 0.02 : radio + 0.04) - primero.d;
        if (salida > 0) {
          x = pos.x + primero.n.x * salida;
          z = pos.y + primero.n.y * salida;
        }
        if (!esBala) {
          const brazoL = Math.max(radio + 0.05, 0.12);
          const m = new THREE.Mesh(new THREE.BoxGeometry(0.05 * esc, 0.03 * esc, brazoL), matAccesorio);
          m.position.set(x - (primero.n.x * brazoL) / 2, c.alturaM + 0.01, z - (primero.n.y * brazoL) / 2);
          m.rotation.y = Math.atan2(primero.n.x, primero.n.y);
          m.castShadow = true;
          accesorios.add(m);
        }
      }
    } else {
      // Techo: placa y tubo; la maqueta va sin losa de techo.
      const placa = new THREE.Mesh(new THREE.CylinderGeometry(radio * 0.7, radio * 0.7, 0.03, 32), matAccesorio);
      placa.position.set(x, c.alturaM + 0.2, z);
      const tubo = new THREE.Mesh(new THREE.CylinderGeometry(0.02 * esc, 0.02 * esc, 0.2, 16), matAccesorio);
      tubo.position.set(x, c.alturaM + 0.1, z);
      tubo.castShadow = true;
      accesorios.add(placa, tubo);
    }
    contenedor.position.set(x, c.alturaM - (esBala ? alto / 2 : alto), z);
    if (c.id === opciones.ocultar) {
      contenedor.visible = false;
      accesorios.visible = false;
    }
    grupo.add(accesorios, contenedor);
    const toque = new THREE.Mesh(new THREE.SphereGeometry(Math.max(radio * 1.4, 0.32), 12, 8));
    toque.position.set(x, c.alturaM - alto / 2, z);
    toque.visible = false;
    toque.userData.esProxy = true;
    grupo.add(elegible(toque, sel));
    etiquetas.push({ id: c.id, clave: claveCamara(c.numero), nombre: c.nombre, pos: new THREE.Vector3(x, c.alturaM + Math.max(alto * 0.25, 0.35), z), rumboDeg: c.rumboDeg, tipoSel: "camara", punto: COLOR_PUNTO_CAMARA });
  }
  return { grupo, etiquetas };
}

/* ── Lo demás: grabador, gabinete, acceso, alarmas… ─────────────────────────────── */

function paramsDe(e: EquipoPlano): ParamsEquipo {
  const m = equipoPorId(e.productoId);
  return {
    marca: m?.marca || undefined,
    modelo: m?.modelo || undefined,
    anchoMm: m?.medidas?.anchoMm,
    altoMm: m?.medidas?.altoMm,
    fondoMm: m?.medidas?.fondoMm,
    puertos: e.datos.puertos ?? undefined,
    unidades: e.tipo === "gabinete" ? (e.datos.unidades ?? undefined) : undefined,
    largoMm: e.datos.plumaM ? e.datos.plumaM * 1000 : undefined,
  };
}

/** Tan grandes que se ven solos: van a tamaño real. */
const A_TAMANO_REAL: ReadonlySet<TipoEquipo> = new Set<TipoEquipo>(["gabinete", "barrera"]);

/** Soporte de lo que se coloca lejos de un muro: un equipo no flota. */
function pedestal(x: number, z: number, altura: number): THREE.Mesh {
  const m = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, altura, 16), matAccesorio);
  m.position.set(x, altura / 2, z);
  m.castShadow = true;
  return m;
}

export function construirEquipos(plano: Plano, opciones: { escala: number }): { grupo: THREE.Group; etiquetas: EtiquetaEquipo[] } {
  const grupo = new THREE.Group();
  const etiquetas: EtiquetaEquipo[] = [];
  const muros = plano.muros.filter((m) => m.tipo === "muro").map((m) => ({ a: aMetros(m.a, plano.escala), b: aMetros(m.b, plano.escala), g: m.grosorM }));
  const equipos = plano.equipos ?? [];
  for (const e of equipos) {
    if (e.gabineteId && equipos.some((g) => g.id === e.gabineteId)) continue;
    const pos = aMetros(e.pos, plano.escala);
    const modelo = crearModeloEquipo(e.tipo, paramsDe(e));
    if (e.tipo === "gabinete") {
      for (const dentro of equipos) {
        if (dentro.gabineteId === e.id && dentro.unidad != null) montarEnGabinete(modelo, dentro.tipo, paramsDe(dentro), dentro.unidad);
      }
    }
    const caja = new THREE.Box3().setFromObject(modelo);
    const esc = A_TAMANO_REAL.has(e.tipo) ? 1 : opciones.escala;
    const alto = (caja.max.y - caja.min.y) * esc;
    const contenedor = new THREE.Group();
    contenedor.add(modelo);
    contenedor.scale.setScalar(esc);
    // La pluma de la barrera corre hacia el rumbo; lo demás tiene el frente hacia allá.
    contenedor.rotation.y = anguloDeRumbo(e.rumboDeg) - (e.tipo === "barrera" ? Math.PI / 2 : 0);
    const enMuro = e.alturaM > 0;
    const y = enMuro ? Math.max(e.alturaM - alto / 2, 0) : 0;
    contenedor.position.set(pos.x, y, pos.y);
    grupo.add(contenedor);
    if (enMuro && y > 0.05 && !muros.some((m) => distanciaPuntoSegmento(pos, m.a, m.b) < m.g / 2 + 0.25)) grupo.add(pedestal(pos.x, pos.y, y));
    contenedor.updateMatrixWorld(true);
    grupo.add(proxy(new THREE.Box3().setFromObject(contenedor), { tipo: "equipo", id: e.id }));
    etiquetas.push({ id: e.id, clave: claveEquipo(e), nombre: e.nombre, pos: new THREE.Vector3(pos.x, y + alto + 0.12, pos.y), rumboDeg: e.rumboDeg, tipoSel: "equipo", punto: colorPuntoEquipo(e.tipo) });
  }
  return { grupo, etiquetas };
}

/** Hasta dónde se escucha cada sirena o alerta: un anillo en el piso. Es un estimado. */
export function construirAlcances(plano: Plano, seleccionado: string | null): THREE.Group {
  const grupo = new THREE.Group();
  for (const e of plano.equipos ?? []) {
    const r = e.datos.alcanceM ?? 0;
    if (!r || (e.tipo !== "sirena" && e.tipo !== "sismica")) continue;
    const pos = aMetros(e.pos, plano.escala);
    const sel = e.id === seleccionado;
    const color = 0xd13f3f;
    const disco = new THREE.Mesh(new THREE.CircleGeometry(r, 72), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: sel ? 0.14 : 0.06, depthWrite: false }));
    disco.rotation.x = -Math.PI / 2;
    disco.position.set(pos.x, 0.05, pos.y);
    disco.renderOrder = 2;
    const aro = new THREE.Mesh(new THREE.RingGeometry(Math.max(r - 0.08, 0.01), r, 120), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: sel ? 0.8 : 0.42, depthWrite: false }));
    aro.rotation.x = -Math.PI / 2;
    aro.position.set(pos.x, 0.055, pos.y);
    aro.renderOrder = 2;
    grupo.add(disco, aro);
  }
  return grupo;
}

const ARRIBA = new THREE.Vector3(0, 1, 0);
/** A esta altura entra el cable al gabinete, por arriba. */
const ENTRADA_GABINETE_M = 1.3;

/** El cableado de un nivel: sube a la charola, corre pegado a los muros y baja al gabinete. */
export function construirCables(conexiones: readonly Conexion[], nivelId: string, escala = 1): THREE.Group {
  const grupo = new THREE.Group();
  const radio = 0.018 * Math.max(escala, 1.2);
  const dummy = new THREE.Object3D();
  for (const clase of ["video", "acceso", "alarmas", "red"] as const satisfies readonly ClaseCable[]) {
    const tramos: Array<[THREE.Vector3, THREE.Vector3]> = [];
    for (const c of conexiones) {
      if (c.nivelId !== nivelId || c.clase !== clase || c.ruta.length < 2) continue;
      const ini = c.ruta[0];
      const fin = c.ruta[c.ruta.length - 1];
      const puntos = [new THREE.Vector3(ini.x, c.alturaEquipoM, ini.y), ...c.ruta.map((p) => new THREE.Vector3(p.x, c.alturaCharolaM + radio, p.y)), new THREE.Vector3(fin.x, ENTRADA_GABINETE_M, fin.y)];
      for (let i = 1; i < puntos.length; i++) tramos.push([puntos[i - 1], puntos[i]]);
    }
    if (!tramos.length) continue;
    const color = new THREE.Color(COLOR_CABLE[clase]);
    const malla = new THREE.InstancedMesh(new THREE.CylinderGeometry(radio, radio, 1, 8), new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 0.3, roughness: 0.55 }), tramos.length);
    tramos.forEach(([a, b], i) => {
      const d = b.clone().sub(a);
      const largo = d.length();
      dummy.position.copy(a).addScaledVector(d, 0.5);
      dummy.scale.set(1, Math.max(largo, 1e-3), 1);
      dummy.quaternion.setFromUnitVectors(ARRIBA, largo > 1e-6 ? d.normalize() : ARRIBA);
      dummy.updateMatrix();
      malla.setMatrixAt(i, dummy.matrix);
    });
    grupo.add(malla);
  }
  return grupo;
}

/** Lo que ve la cámara elegida: rayos de la lente al pie de la zona ciega y al final del cono. */
export function construirRayos(plano: Plano, id: string): THREE.LineSegments | null {
  const c = plano.camaras.find((x) => x.id === id);
  const cm = c ? camaraEnMetros(c, plano.escala) : null;
  if (!cm) return null;
  const bajo = cm.inclinacionDeg + cm.vfovDeg / 2;
  const ciega = bajo < 89.5 ? Math.min(cm.alturaM / Math.tan(aRad(bajo)), cm.distanciaM) : 0;
  const punto = (dist: number, lado: number) => {
    const d = dirRumbo(cm.rumboDeg + (lado * Math.min(cm.hfovDeg, 179)) / 2);
    return new THREE.Vector3(cm.pos.x + d.x * dist, 0.06, cm.pos.y + d.y * dist);
  };
  const lente = new THREE.Vector3(cm.pos.x, cm.alturaM, cm.pos.y);
  const pares = [lente, punto(cm.distanciaM, -1), lente, punto(cm.distanciaM, 1), lente, punto(ciega, -1), lente, punto(ciega, 1), punto(ciega, -1), punto(ciega, 1)];
  const geo = new THREE.BufferGeometry().setFromPoints(pares);
  const linea = new THREE.LineSegments(geo, new THREE.LineDashedMaterial({ color: 0x0f7f6c, dashSize: 0.35, gapSize: 0.2, transparent: true, opacity: 0.95, depthTest: false }));
  linea.computeLineDistances();
  linea.renderOrder = 5;
  return linea;
}

/* ── Cobertura ──────────────────────────────────────────────────────────────────── */

export function construirCoberturas(coberturas: ReadonlyMap<string, PoligonoCobertura[]>, seleccionada: string | null): THREE.Group {
  const grupo = new THREE.Group();
  const material = (nivel: NivelCobertura, propia: boolean) =>
    new THREE.MeshBasicMaterial({
      color: COLOR_NIVEL_HEX[nivel],
      transparent: true,
      opacity: Math.min(OPACIDAD[nivel] + (propia ? 0.18 : 0), 0.8),
      depthWrite: false,
      side: THREE.DoubleSide,
      toneMapped: false,
    });
  const cache = new Map<string, THREE.Material>();
  const orilla = new Map<NivelCobertura, THREE.LineBasicMaterial>();
  let orden = 0;
  for (const [id, pols] of coberturas) {
    const propia = id === seleccionada;
    for (const pol of pols) {
      if (pol.puntos.length < 3) continue;
      const clave = `${pol.nivel}|${propia}`;
      if (!cache.has(clave)) cache.set(clave, material(pol.nivel, propia));
      const s = new THREE.Shape();
      pol.puntos.forEach((p, i) => (i ? s.lineTo(p.x, -p.y) : s.moveTo(p.x, -p.y)));
      const m = new THREE.Mesh(new THREE.ShapeGeometry(s), cache.get(clave)!);
      m.rotation.x = -Math.PI / 2;
      m.position.y = 0.05 + (propia ? 0.004 : 0);
      m.renderOrder = propia ? 3 : 2;
      grupo.add(m);
      orden += 1;
      // Orilla fina: da la lectura técnica de cada nivel sin ensuciar.
      if (!orilla.has(pol.nivel)) orilla.set(pol.nivel, new THREE.LineBasicMaterial({ color: COLOR_NIVEL_HEX[pol.nivel], transparent: true, opacity: 0.55, depthWrite: false, toneMapped: false }));
      const borde = new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints(pol.puntos.map((p) => new THREE.Vector3(p.x, 0.054, p.y))), orilla.get(pol.nivel)!);
      borde.renderOrder = propia ? 4 : 2;
      grupo.add(borde);
    }
  }
  grupo.userData.poligonos = orden;
  return grupo;
}

/* ── Luces de noche ─────────────────────────────────────────────────────────────── */

export type Lampara = { x: number; z: number; color: number; intensidad: number; alcance: number };

/** Lámparas de la vista de noche: una por área interior o una retícula sobre el edificio. */
export function lamparasDeNoche(plano: Plano): Lampara[] {
  const ed = limitesEdificio(plano);
  const interiores = (plano.areas ?? []).filter((a) => a.piso !== "pasto" && a.piso !== "asfalto" && a.puntos.length >= 3);
  const salida: Lampara[] = [];
  if (interiores.length) {
    for (const a of interiores) {
      const c = cajaDe(a.puntos.map((p) => aMetros(p, plano.escala)));
      const w = c.max.x - c.min.x;
      const h = c.max.y - c.min.y;
      const n = Math.max(1, Math.round(Math.max(w, h) / 10));
      for (let i = 0; i < n; i++) {
        const t = (i + 0.5) / n;
        salida.push({ x: w >= h ? c.min.x + w * t : (c.min.x + c.max.x) / 2, z: w >= h ? (c.min.y + c.max.y) / 2 : c.min.y + h * t, color: 0xffe2b4, intensidad: 12 + Math.sqrt(w * h) * 1.6, alcance: Math.max(w, h) * 1.3 + 6 });
      }
    }
  } else if (ed) {
    const w = ed.max.x - ed.min.x;
    const h = ed.max.y - ed.min.y;
    const paso = Math.max(7, Math.sqrt((w * h) / 12));
    const nx = Math.max(1, Math.round(w / paso));
    const ny = Math.max(1, Math.round(h / paso));
    for (let i = 0; i < nx; i++) {
      for (let j = 0; j < ny; j++) {
        salida.push({ x: ed.min.x + (w * (i + 0.5)) / nx, z: ed.min.y + (h * (j + 0.5)) / ny, color: 0xffe2b4, intensidad: 26, alcance: paso * 2.2 });
      }
    }
  }
  return salida.slice(0, 16);
}
