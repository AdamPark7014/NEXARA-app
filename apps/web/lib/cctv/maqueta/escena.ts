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
import { azarFijo, materialBanqueta, materialFollaje, materialPiso, relieveDeMuro } from "./texturas";

export type { Limites };

/** Colores de los niveles DORI en la maqueta y el plano (mockup aprobado 01-11-2026). */
export const COLOR_NIVEL_HEX: Readonly<Record<NivelCobertura, number>> = {
  identificacion: 0x0aa870,
  reconocimiento: 0x0d8cd9,
  observacion: 0x3d5ce6,
  deteccion: 0x8c6bd9,
  general: 0x9aa3af,
};

const OPACIDAD: Readonly<Record<NivelCobertura, number>> = { identificacion: 0.44, reconocimiento: 0.36, observacion: 0.3, deteccion: 0.22, general: 0.12 };

/* ── Medidas del sitio ──────────────────────────────────────────────────────────── */

/**
 * Cuánto se agrandan los equipos en la vista general: una cámara real mide 12 cm. Apenas lo necesario:
 * de lejos los ubica su punto en pantalla, y uno gigante rompe la escala de todo lo demás.
 */
export function escalaVisualEquipos(lim: Limites): number {
  const diagonal = Math.hypot(lim.max.x - lim.min.x, lim.max.y - lim.min.y);
  return Math.min(Math.max(diagonal * 0.055, 1.25), 2.6);
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

/** Tono del pasto a gran escala: rompe la repetición de la textura y da manchas de terreno real. */
function tonoDeTerreno(x: number, z: number): number {
  const a = Math.sin(x * 0.061 + Math.sin(z * 0.043) * 1.7) * Math.cos(z * 0.052 + Math.sin(x * 0.037) * 1.3);
  const b = Math.sin(x * 0.17 + 2.1) * Math.sin(z * 0.14 + 0.7);
  return 0.86 + a * 0.13 + b * 0.05;
}

/** Hasta dónde llega el suelo: lo lejano lo funde la niebla con el cielo. */
const RADIO_SUELO_M = 900;

/** Terreno: pasto hasta el horizonte, banqueta, la calle del frente y árboles alrededor. Solo lo lleva el nivel de abajo. */
export function construirTerreno(plano: Plano, lim: Limites): THREE.Group {
  const g = new THREE.Group();
  const m = MARGEN_BASE_M;
  const x0 = lim.min.x - m;
  const y0 = lim.min.y - m;
  const x1 = lim.max.x + m;
  const y1 = lim.max.y + m;
  const cx = (x0 + x1) / 2;
  const cz = (y0 + y1) / 2;
  const R = RADIO_SUELO_M;

  const geo = new THREE.PlaneGeometry(2 * R, 2 * R, 120, 120).rotateX(-Math.PI / 2);
  const pos = geo.attributes.position;
  const uv = geo.attributes.uv;
  const colores = new Float32Array(pos.count * 3);
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i) + cx;
    const z = pos.getZ(i) + cz;
    uv.setXY(i, x, -z);
    const t = tonoDeTerreno(x, z);
    colores.set([t * 1.02, t, t * 0.96], i * 3);
  }
  geo.setAttribute("color", new THREE.BufferAttribute(colores, 3));
  const pasto = materialPiso("pasto").clone();
  pasto.vertexColors = true;
  const suelo = new THREE.Mesh(geo, pasto);
  suelo.position.set(cx, -0.04, cz);
  suelo.receiveShadow = true;
  g.add(suelo);

  const ed = limitesEdificio(plano);
  if (ed) {
    g.add(piso(rect(ed.min.x - 1.5, ed.min.y - 1.5, ed.max.x + 1.5, ed.max.y + 1.5), materialBanqueta(), -0.015));
    g.add(piso(rect(ed.min.x, ed.min.y, ed.max.x, ed.max.y), materialPiso("concreto"), -0.005));
  }
  // La calle: banqueta, guarnición, asfalto y línea central.
  const zBanqueta = y1 + 0.6;
  const zCalle = zBanqueta + 2.4;
  const ancho = 8.4;
  g.add(piso(rect(cx - R, zBanqueta, cx + R, zCalle), materialBanqueta(), -0.02));
  g.add(piso(rect(cx - R, zCalle, cx + R, zCalle + ancho), materialPiso("asfalto"), -0.03));
  const guarnicion = new THREE.MeshStandardMaterial({ color: 0xb9b6ae, roughness: 0.9 });
  for (const z of [zCalle, zCalle + ancho]) {
    const c = new THREE.Mesh(new THREE.BoxGeometry(2 * R, 0.14, 0.16), guarnicion);
    c.position.set(cx, 0.03, z);
    c.castShadow = true;
    c.receiveShadow = true;
    g.add(c);
  }
  const pintura = new THREE.MeshStandardMaterial({ color: 0xe8e4d6, roughness: 0.7 });
  const tramos = 60;
  const linea = new THREE.InstancedMesh(new THREE.PlaneGeometry(2.6, 0.13).rotateX(-Math.PI / 2), pintura, tramos);
  const d = new THREE.Object3D();
  for (let i = 0; i < tramos; i++) {
    d.position.set(cx + (i - tramos / 2) * 6.2, -0.022, zCalle + ancho / 2);
    d.updateMatrix();
    linea.setMatrixAt(i, d.matrix);
  }
  linea.receiveShadow = true;
  g.add(linea);
  g.add(construirArboleda(x0, y0, x1, zBanqueta));
  return g;
}

/** Árboles alrededor del terreno: dan escala y contexto. Son de ornato: ni se eligen ni estorban a la vista general. */
function construirArboleda(x0: number, y0: number, x1: number, y1: number): THREE.Group {
  const g = new THREE.Group();
  const azar = azarFijo(Math.abs(Math.round(x1 * 7 + y1 * 13)) + 3);
  const lugares: Array<{ x: number; z: number; alto: number }> = [];
  const poner = (x: number, z: number) => lugares.push({ x: x + (azar() - 0.5) * 2.4, z: z + (azar() - 0.5) * 2.4, alto: 4.2 + azar() * 2.6 });
  // Al fondo y a los lados, y en segunda fila más lejos; al frente queda la calle y la vista libre.
  const paso = 8.4;
  for (let x = x0 - 6; x <= x1 + 6; x += paso) {
    poner(x, y0 - 4.5);
    if (azar() > 0.25) poner(x + paso / 2, y0 - 12);
  }
  for (let z = y0; z <= y1 - 2; z += paso) {
    poner(x1 + 4.5, z);
    if (azar() > 0.25) poner(x1 + 12, z + paso / 2);
    if (azar() > 0.35) poner(x0 - 11, z);
  }
  // Del otro lado de la calle, ya lejos.
  for (let x = x0 - 18; x <= x1 + 18; x += paso * 1.5) if (azar() > 0.3) poner(x, y1 + 18 + azar() * 6);
  const porArbol = 58;
  const hojas = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1), materialFollaje(), lugares.length * porArbol);
  hojas.castShadow = true;
  hojas.userData.compartido = false;
  const tronco = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.1, 0.17, 1, 8), new THREE.MeshStandardMaterial({ color: 0x65523f, roughness: 0.96 }), lugares.length);
  tronco.castShadow = true;
  const o = new THREE.Object3D();
  const tono = new THREE.Color();
  let k = 0;
  lugares.forEach((a, i) => {
    const altoTronco = a.alto * 0.48;
    o.position.set(a.x, altoTronco / 2, a.z);
    o.rotation.set(0, 0, 0);
    o.scale.set(1, altoTronco, 1);
    o.updateMatrix();
    tronco.setMatrixAt(i, o.matrix);
    const radio = a.alto * 0.34;
    const claro = 0.82 + azar() * 0.34;
    const calido = azar() * 0.12;
    for (let j = 0; j < porArbol; j++) {
      const u = azar() * 2 - 1;
      const ang = azar() * Math.PI * 2;
      const r = Math.cbrt(0.35 + azar() * 0.65);
      const c = Math.sqrt(1 - u * u);
      o.position.set(a.x + c * Math.cos(ang) * radio * r, a.alto * 0.68 + u * radio * 0.92 * r, a.z + c * Math.sin(ang) * radio * r);
      o.rotation.set(azar() * Math.PI, azar() * Math.PI, azar() * Math.PI);
      const t = radio * (0.62 + azar() * 0.38);
      o.scale.set(t, t, t);
      o.updateMatrix();
      hojas.setMatrixAt(k, o.matrix);
      // Más oscuro abajo: la copa se tapa la luz a sí misma.
      const luz = claro * (0.74 + (u + 1) * 0.16);
      hojas.setColorAt(k, tono.setRGB(luz * (1 + calido), luz, luz * (1 - calido)));
      k += 1;
    }
  });
  g.add(tronco, hojas);
  return g;
}

/** Lo que ocupa cada mueble en el piso, para su sombra de contacto. */
const HUELLA_MUEBLE: Readonly<Partial<Record<string, readonly [number, number]>>> = {
  escritorio: [1.5, 0.74],
  "mesa-juntas": [3.2, 1.25],
  mostrador: [3.3, 0.8],
  sofa: [2.6, 0.9],
  planta: [0.36, 0.36],
  arbol: [0.34, 0.34],
  camion: [2.5, 7.2],
  auto: [1.8, 4.5],
};

/**
 * Sombra de contacto: donde un muro o un mueble toca el piso, el piso se oscurece suave. Es lo que hace
 * que las cosas se sienten en el suelo en vez de flotar, y se calcula una vez, no en cada cuadro.
 */
export function construirContacto(plano: Plano, lim: Limites): THREE.Group {
  const g = new THREE.Group();
  const margen = 3;
  const x0 = lim.min.x - margen;
  const y0 = lim.min.y - margen;
  const w = lim.max.x - lim.min.x + margen * 2;
  const h = lim.max.y - lim.min.y + margen * 2;
  if (w <= 0 || h <= 0) return g;
  const s = Math.min(2048 / Math.max(w, h), 30);
  const anchoPx = Math.ceil(w * s);
  const altoPx = Math.ceil(h * s);
  const forma = document.createElement("canvas");
  forma.width = anchoPx;
  forma.height = altoPx;
  const c = forma.getContext("2d");
  if (!c) return g;
  c.fillStyle = "#fff";
  c.fillRect(0, 0, anchoPx, altoPx);
  c.fillStyle = c.strokeStyle = "#000";
  const X = (m: number) => (m - x0) * s;
  const Y = (m: number) => (m - y0) * s;
  c.lineCap = "square";
  const k = plano.escala.metrosPorPx;
  for (const muro of plano.muros) {
    if (muro.tipo === "reja") continue;
    const a = aMetros(muro.a, plano.escala);
    const b = aMetros(muro.b, plano.escala);
    c.lineWidth = Math.max(muro.tipo === "vidrio" ? 0.05 : muro.grosorM, 0.05) * s;
    c.beginPath();
    c.moveTo(X(a.x), Y(a.y));
    c.lineTo(X(b.x), Y(b.y));
    c.stroke();
  }
  for (const o of plano.obstaculos) {
    if (o.puntos.length < 3) continue;
    c.beginPath();
    o.puntos.forEach((q, i) => (i ? c.lineTo(X(q.x * k), Y(q.y * k)) : c.moveTo(X(q.x * k), Y(q.y * k))));
    c.closePath();
    c.fill();
  }
  for (const mu of plano.muebles ?? []) {
    const huella = HUELLA_MUEBLE[mu.tipo];
    if (!huella) continue;
    c.save();
    c.translate(X(mu.pos.x * k), Y(mu.pos.y * k));
    c.rotate(-anguloDeRumbo(mu.rumboDeg));
    c.fillRect((-huella[0] / 2) * s, (-huella[1] / 2) * s, huella[0] * s, huella[1] * s);
    c.restore();
  }
  for (const h2 of plano.personas) {
    c.beginPath();
    c.arc(X(h2.pos.x * k), Y(h2.pos.y * k), 0.2 * s, 0, Math.PI * 2);
    c.fill();
  }
  const salida = document.createElement("canvas");
  salida.width = anchoPx;
  salida.height = altoPx;
  const o = salida.getContext("2d");
  if (!o) return g;
  o.fillStyle = "#fff";
  o.fillRect(0, 0, anchoPx, altoPx);
  o.globalCompositeOperation = "multiply";
  // Dos escalas: una sombra amplia y suave, y una fina justo en la junta.
  o.filter = `blur(${(0.5 * s).toFixed(1)}px)`;
  o.globalAlpha = 0.52;
  o.drawImage(forma, 0, 0);
  o.filter = `blur(${(0.13 * s).toFixed(1)}px)`;
  o.globalAlpha = 0.42;
  o.drawImage(forma, 0, 0);
  const t = new THREE.CanvasTexture(salida);
  t.colorSpace = THREE.NoColorSpace;
  const malla = new THREE.Mesh(
    new THREE.PlaneGeometry(anchoPx / s, altoPx / s),
    new THREE.MeshBasicMaterial({ map: t, blending: THREE.MultiplyBlending, premultipliedAlpha: true, transparent: true, depthWrite: false, toneMapped: false, fog: false }),
  );
  malla.rotation.x = -Math.PI / 2;
  malla.position.set(x0 + anchoPx / s / 2, 0.018, y0 + altoPx / s / 2);
  malla.renderOrder = 1;
  g.add(malla);
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
    muro: new THREE.MeshStandardMaterial({ color: 0xf0eee8, roughness: 0.9, vertexColors: true, normalMap: relieveDeMuro(), normalScale: new THREE.Vector2(0.5, 0.5) }),
    /** Muro de afuera que tapa el interior desde donde se ve. */
    muroTenue: new THREE.MeshStandardMaterial({ color: 0xf1f1ee, roughness: 0.86, transparent: true, opacity: 0.16, depthWrite: false }),
    muroSeleccion: new THREE.MeshStandardMaterial({ color: 0xbfe7df, roughness: 0.7, emissive: 0x0f7f6c, emissiveIntensity: 0.18 }),
    muroApagado: new THREE.MeshStandardMaterial({ color: 0xb3b9c1, roughness: 0.9, transparent: true, opacity: 0.32, depthWrite: false }),
    /** Lo alto del muro cortado: bloque y mezcla, como una obra vista desde arriba. */
    corte: new THREE.MeshStandardMaterial({ color: 0x8c8a85, roughness: 0.94 }),
    zoclo: new THREE.MeshStandardMaterial({ color: 0xcdcac2, roughness: 0.55 }),
    rodapie: new THREE.MeshStandardMaterial({ color: 0x8f8d88, roughness: 0.88 }),
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
export type MuroMaqueta = {
  id: string;
  mallas: THREE.Mesh[];
  exterior: boolean;
  normal: Punto;
  alturaM: number;
  /** El muro entero, con sus puertas y ventanas. */
  alto: THREE.Group;
  /** El mismo muro cortado a poca altura: el que tapa el interior se baja en vez de volverse transparente. */
  bajo: THREE.Group | null;
};

/** A esta altura se corta el muro de afuera que tapa la vista. */
export const ALTURA_CORTE_M = 0.85;

/**
 * Muro con su color al pie: junto al piso rebota menos luz y se oscurece. Las coordenadas de textura
 * van en metros, así el relieve mide lo mismo en un muro corto que en uno largo.
 */
function geoMuro(largo: number, y0: number, y1: number, grueso: number): THREE.BufferGeometry {
  const h = y1 - y0;
  const geo = new THREE.BoxGeometry(largo, 1, grueso, 1, 3, 1);
  const pos = geo.attributes.position;
  const nor = geo.attributes.normal;
  const uv = geo.attributes.uv;
  const colores = new Float32Array(pos.count * 3);
  const a = Math.min(0.42, h / 3);
  const b = Math.min(0.2, h / 3);
  for (let i = 0; i < pos.count; i++) {
    const t = pos.getY(i);
    // -0.5, -1/6, 1/6 y 0.5 pasan a pie, poco arriba del pie, poco abajo del tope y tope.
    const local = t < -0.4 ? 0 : t < 0 ? a : t < 0.4 ? h - b : h;
    const yAbs = y0 + local;
    pos.setY(i, local - h / 2);
    const tono = yAbs < 0.42 ? 0.7 + (yAbs / 0.42) * 0.3 : 1;
    colores.set([tono, tono, tono], i * 3);
    if (Math.abs(nor.getZ(i)) > 0.5) uv.setXY(i, pos.getX(i), yAbs);
    else if (Math.abs(nor.getX(i)) > 0.5) uv.setXY(i, pos.getZ(i), yAbs);
    else uv.setXY(i, pos.getX(i), pos.getZ(i));
  }
  geo.setAttribute("color", new THREE.BufferAttribute(colores, 3));
  return geo;
}

function muroRecto(a: Punto, b: Punto, y0: number, y1: number, grueso: number, material: THREE.Material): THREE.Mesh {
  const m = new THREE.Mesh(geoMuro(distancia(a, b), y0, y1, grueso), material);
  m.position.set((a.x + b.x) / 2, (y0 + y1) / 2, (a.y + b.y) / 2);
  m.rotation.y = Math.atan2(-(b.y - a.y), b.x - a.x);
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
}

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

    // Normal hacia afuera y si este muro está en la orilla del edificio: de ese lado ya no hay otro muro.
    const medio = en(L / 2);
    const centro = ed ? { x: (ed.min.x + ed.max.x) / 2, y: (ed.min.y + ed.max.y) / 2 } : medio;
    let normal = { x: -u.y, y: u.x };
    if ((medio.x - centro.x) * normal.x + (medio.y - centro.y) * normal.y < 0) normal = { x: -normal.x, y: -normal.y };
    const hayMuroHacia = (n: Punto) => plano.muros.some((o) => o.id !== muro.id && o.tipo === "muro" && rayoCruzaTramo(medio, n, aMetros(o.a, plano.escala), aMetros(o.b, plano.escala)));
    const fuera = !hayMuroHacia(normal);
    const adentro = !hayMuroHacia({ x: -normal.x, y: -normal.y });
    if (!fuera && adentro) normal = { x: -normal.x, y: -normal.y };
    const exterior = Boolean(ed) && (fuera || adentro);

    const material = opciones.apagado ? mats.muroApagado : mats.muro;
    const ext0 = extremoUnido(plano, muro, muro.a) ? muro.grosorM / 2 : 0;
    const ext1 = extremoUnido(plano, muro, muro.b) ? muro.grosorM / 2 : 0;
    const alto = new THREE.Group();
    const bajo = exterior && !opciones.apagado && muro.alturaM > ALTURA_CORTE_M + 0.2 ? new THREE.Group() : null;
    const pieza = (d0: number, d1: number, y0: number, y1: number, conCorte: boolean, destino: THREE.Group = alto) => {
      if (d1 - d0 <= 1e-3 || y1 - y0 <= 1e-3) return;
      const ini = d0 <= 1e-6 ? d0 - ext0 : d0;
      const fin = d1 >= L - 1e-6 ? d1 + ext1 : d1;
      const { a: pa, b: pb } = dato(ini, fin);
      const m = elegible(muroRecto(pa, pb, y0, y1, muro.grosorM, material), sel);
      if (opciones.apagado) m.castShadow = false;
      destino.add(m);
      mallas.push(m);
      if (conCorte && !opciones.apagado) {
        const tapa = cajaRecta(pa, pb, y1, y1 + 0.012, muro.grosorM + 0.002, mats.corte);
        tapa.castShadow = false;
        destino.add(tapa);
      }
      if (y0 <= 1e-6 && !opciones.apagado) {
        // Zoclo por los dos lados y, por fuera, el rodapié de la fachada.
        const zoclo = cajaRecta(pa, pb, 0, 0.1, muro.grosorM + 0.022, mats.zoclo);
        zoclo.castShadow = false;
        destino.add(zoclo);
        if (exterior && y1 > 0.3) {
          const fuera = muro.grosorM / 2 + 0.014;
          const rodapie = cajaRecta({ x: pa.x + normal.x * fuera, y: pa.y + normal.y * fuera }, { x: pb.x + normal.x * fuera, y: pb.y + normal.y * fuera }, 0, 0.32, 0.03, mats.rodapie);
          rodapie.castShadow = false;
          destino.add(rodapie);
        }
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
      if (!opciones.apagado) construirHueco(alto, h, en(desde), en(d1), muro, mats);
      if (bajo) {
        pieza(cursor, desde, 0, ALTURA_CORTE_M, true, bajo);
        pieza(desde, d1, 0, Math.min(h.baseM, ALTURA_CORTE_M), h.baseM > 0, bajo);
      }
      cursor = d1;
    }
    pieza(cursor, L, 0, muro.alturaM, true);
    if (bajo) pieza(cursor, L, 0, ALTURA_CORTE_M, true, bajo);
    grupo.add(alto);
    if (bajo) {
      bajo.visible = false;
      bajo.traverse((n) => {
        n.userData.tenue = true;
      });
      grupo.add(bajo);
    }
    muros.push({ id: muro.id, mallas, exterior, normal, alturaM: muro.alturaM, alto, bajo });
  }
  return { grupo, muros };
}

/**
 * Lo que va montado en un muro que se baja necesita de qué colgarse: se queda ese pedazo de muro, a su
 * altura completa. Sin esto, la cámara flotaría en el aire. Cada pedazo dice de qué muro es.
 */
export function construirSoportes(plano: Plano, mats: Materiales): THREE.Group {
  const g = new THREE.Group();
  const montados = [
    ...plano.camaras.filter((c) => (c.montaje ?? "muro") === "muro").map((c) => aMetros(c.pos, plano.escala)),
    ...(plano.equipos ?? []).filter((e) => e.alturaM > ALTURA_CORTE_M && !e.gabineteId).map((e) => aMetros(e.pos, plano.escala)),
  ];
  for (const muro of plano.muros) {
    if (muro.tipo !== "muro" || muro.alturaM <= ALTURA_CORTE_M + 0.2) continue;
    const a = aMetros(muro.a, plano.escala);
    const b = aMetros(muro.b, plano.escala);
    const L = distancia(a, b);
    if (L < 1e-3) continue;
    const u = { x: (b.x - a.x) / L, y: (b.y - a.y) / L };
    const en = (d: number): Punto => ({ x: a.x + u.x * d, y: a.y + u.y * d });
    for (const p of montados) {
      if (distanciaPuntoSegmento(p, a, b) > muro.grosorM / 2 + 0.7) continue;
      const d = (p.x - a.x) * u.x + (p.y - a.y) * u.y;
      const d0 = Math.max(d - 0.26, 0);
      const d1 = Math.min(d + 0.26, L);
      if (d1 - d0 < 0.05) continue;
      const pieza = new THREE.Group();
      pieza.add(muroRecto(en(d0), en(d1), ALTURA_CORTE_M, muro.alturaM, muro.grosorM, mats.muro));
      const tapa = cajaRecta(en(d0), en(d1), muro.alturaM, muro.alturaM + 0.012, muro.grosorM + 0.002, mats.corte);
      tapa.castShadow = false;
      pieza.add(tapa);
      pieza.userData.muroId = muro.id;
      pieza.visible = false;
      g.add(pieza);
    }
  }
  return g;
}

/** ¿La semirrecta desde `o` hacia `d` toca el tramo? */
function rayoCruzaTramo(o: Punto, d: Punto, a: Punto, b: Punto): boolean {
  const ex = b.x - a.x;
  const ey = b.y - a.y;
  const det = d.x * -ey - -ex * d.y;
  if (Math.abs(det) < 1e-9) return false;
  const ox = a.x - o.x;
  const oy = a.y - o.y;
  const t = (ox * -ey - -ex * oy) / det;
  const s = (d.x * oy - d.y * ox) / det;
  return t > 0.05 && s >= 0 && s <= 1;
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
  const anillo = new THREE.MeshBasicMaterial({ color: 0x2f6fde, transparent: true, opacity: 0.45, depthWrite: false });
  for (const h of plano.personas) {
    const x = h.pos.x * k;
    const z = h.pos.y * k;
    const g = crearPersona(variante(h.id));
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

/** Con `soloSeleccionada`, la cobertura está apagada: se ve solo el cono de la cámara que se está revisando. */
export function construirCoberturas(coberturas: ReadonlyMap<string, PoligonoCobertura[]>, seleccionada: string | null, soloSeleccionada = false): THREE.Group {
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
    if (soloSeleccionada && !propia) continue;
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
