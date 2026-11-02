/**
 * Modelos 3D propios de lo que no es cámara: grabador, switch, servidor, UPS, gabinete, terminal de
 * acceso, sirena, alerta sísmica, panel de alarma, barrera y una caja genérica. Como las cámaras, se
 * arman con código a partir de las medidas de la ficha, en milímetros.
 *
 * El frente mira a +Z y la base queda en Y = 0; los equipos de muro tienen la espalda en Z = 0.
 */
import * as THREE from "three";
import type { TipoEquipo } from "../catalogo";
import { caja, cilindro, lenteConAro, malla, materiales, type Mats } from "./modelos";
import { marcarCompartido } from "./texturas";

const MM = 0.001;

/** Medidas de la ficha. Lo que falte usa la proporción típica del tipo. */
export type ParamsEquipo = {
  marca?: string;
  anchoMm?: number;
  altoMm?: number;
  fondoMm?: number;
  /** Switch: puertos del frente. */
  puertos?: number;
  /** Servidor: bahías del frente. */
  bahias?: number;
  /** Gabinete: unidades de rack. */
  unidades?: number;
  /** Barrera: largo de la pluma. */
  largoMm?: number;
};

function letreroPlano(texto: string, anchoMm: number, altoMm: number, color: string, peso = "700") {
  const lienzo = document.createElement("canvas");
  lienzo.width = 512;
  lienzo.height = Math.max(8, Math.round((512 * altoMm) / anchoMm));
  const c = lienzo.getContext("2d");
  if (!c) return null;
  c.fillStyle = color;
  c.font = `${peso} ${Math.round(lienzo.height * 0.72)}px Arial, Helvetica, sans-serif`;
  c.textAlign = "center";
  c.textBaseline = "middle";
  c.fillText(texto, 256, lienzo.height / 2 + 2);
  const t = new THREE.CanvasTexture(lienzo);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return new THREE.Mesh(new THREE.PlaneGeometry(anchoMm, altoMm), new THREE.MeshBasicMaterial({ map: t, transparent: true, depthWrite: false }));
}

function ponerLetrero(g: THREE.Group, texto: string | undefined, anchoMm: number, altoMm: number, color: string, x: number, y: number, z: number) {
  if (!texto) return;
  const l = letreroPlano(texto, anchoMm, altoMm, color);
  if (!l) return;
  l.position.set(x, y, z);
  g.add(l);
}

function grabador(p: ParamsEquipo, mats: Mats) {
  const w = p.anchoMm ?? 385;
  const d = p.fondoMm ?? 315;
  const h = p.altoMm ?? 52;
  const g = new THREE.Group();
  const cuerpo = caja(w, h, d, mats.metalOscuro, 2);
  cuerpo.position.y = h / 2;
  g.add(cuerpo);
  const frente = caja(w - 4, h - 4, 3, mats.negro, 1.4);
  frente.position.set(0, h / 2, d / 2);
  g.add(frente);
  const franja = caja(w * 0.62, 2.2, 1, mats.metal, 0.6);
  franja.position.set(-w * 0.1, h * 0.28, d / 2 + 2);
  g.add(franja);
  const boton = malla(new THREE.TorusGeometry(h * 0.16, h * 0.022, 10, 36), mats.metal);
  boton.position.set(-w * 0.17, h * 0.56, d / 2 + 1.8);
  g.add(boton);
  for (let i = 0; i < 6; i++) {
    const l = caja(4, 2, 1, i < 2 ? mats.verde : mats.goma, 0.3);
    l.position.set(w * 0.06 + i * 11, h * 0.62, d / 2 + 1.8);
    g.add(l);
  }
  const usb = caja(12, 5, 1, mats.goma, 0.4);
  usb.position.set(w * 0.3, h * 0.62, d / 2 + 1.8);
  g.add(usb);
  // Rejilla de ventilación arriba.
  const rendijas = new THREE.InstancedMesh(new THREE.BoxGeometry(2.4, 0.6, 26), mats.goma, 40);
  const dummy = new THREE.Object3D();
  for (let i = 0; i < 40; i++) {
    dummy.position.set(w * 0.08 + i * 3.8, h + 0.05, d * 0.04);
    dummy.updateMatrix();
    rendijas.setMatrixAt(i, dummy.matrix);
  }
  g.add(rendijas);
  ponerLetrero(g, p.marca, 62, 12, "#e8eaed", -w * 0.38, h * 0.62, d / 2 + 1.7);
  return g;
}

function switchPoe(p: ParamsEquipo, mats: Mats) {
  const w = p.anchoMm ?? 440;
  const d = p.fondoMm ?? 280;
  const h = p.altoMm ?? 44;
  const g = new THREE.Group();
  const cuerpo = caja(w, h, d, mats.metalOscuro, 1.5);
  cuerpo.position.y = h / 2;
  g.add(cuerpo);
  const frente = caja(w - 2, h - 2, 2, mats.negro, 0.8);
  frente.position.set(0, h / 2, d / 2);
  g.add(frente);
  const puertos = Math.min(Math.max(p.puertos ?? 24, 2), 52);
  const porFila = Math.ceil(puertos / 2);
  const hueco = new THREE.InstancedMesh(new THREE.BoxGeometry(11, 8.6, 1), mats.ranura, puertos);
  const luz = new THREE.InstancedMesh(new THREE.BoxGeometry(2.4, 1.4, 0.6), mats.verde, puertos);
  const dummy = new THREE.Object3D();
  let k = 0;
  for (let i = 0; i < porFila; i++) {
    for (let f = 0; f < 2 && k < puertos; f++) {
      const x = -w * 0.34 + i * 14.2;
      const y = h / 2 + (f === 0 ? 5.6 : -6.6);
      dummy.position.set(x, y, d / 2 + 1.2);
      dummy.updateMatrix();
      hueco.setMatrixAt(k, dummy.matrix);
      dummy.position.set(x - 3.2, y + 6.2 * (f === 0 ? 1 : -1) * 0.92, d / 2 + 1.2);
      dummy.updateMatrix();
      luz.setMatrixAt(k, dummy.matrix);
      k++;
    }
  }
  g.add(hueco, luz);
  ponerLetrero(g, p.marca, 58, 10, "#d9dce0", w * 0.33, h * 0.62, d / 2 + 1.4);
  return g;
}

function servidor(p: ParamsEquipo, mats: Mats) {
  const w = p.anchoMm ?? 445;
  const d = p.fondoMm ?? 700;
  const h = p.altoMm ?? 87;
  const g = new THREE.Group();
  const cuerpo = caja(w, h, d, mats.metalOscuro, 1.5);
  cuerpo.position.y = h / 2;
  g.add(cuerpo);
  const frente = caja(w - 2, h - 2, 3, mats.negro, 0.8);
  frente.position.set(0, h / 2, d / 2);
  g.add(frente);
  const bahias = p.bahias ?? 8;
  for (let i = 0; i < bahias; i++) {
    const x = -w * 0.3 + i * 39.5;
    const bah = caja(36, h * 0.72, 2, mats.metalOscuro, 0.8);
    bah.position.set(x, h / 2, d / 2 + 1.8);
    g.add(bah);
    const led = caja(2.4, 2, 0.6, i % 3 === 2 ? mats.ambar : mats.verde, 0.2);
    led.position.set(x + 12, h * 0.8, d / 2 + 3);
    g.add(led);
    const ranura = caja(26, h * 0.34, 0.6, mats.goma, 0.3);
    ranura.position.set(x, h * 0.4, d / 2 + 3);
    g.add(ranura);
  }
  const panel = caja(46, h * 0.72, 2, mats.negro, 0.8);
  panel.position.set(w * 0.42, h / 2, d / 2 + 1.8);
  g.add(panel);
  const encendido = cilindro(3, 1, mats.verde, 16);
  encendido.rotation.x = Math.PI / 2;
  encendido.position.set(w * 0.42, h * 0.68, d / 2 + 3);
  g.add(encendido);
  ponerLetrero(g, p.marca, 40, 8, "#d9dce0", w * 0.42, h * 0.36, d / 2 + 2.9);
  return g;
}

/** UPS: chasis de rack con ventilación al frente y su pantalla. */
function ups(p: ParamsEquipo, mats: Mats) {
  const w = p.anchoMm ?? 440;
  const d = p.fondoMm ?? 500;
  const h = p.altoMm ?? 87;
  const g = new THREE.Group();
  const cuerpo = caja(w, h, d, mats.metalOscuro, 1.5);
  cuerpo.position.y = h / 2;
  g.add(cuerpo);
  const frente = caja(w - 2, h - 2, 3, mats.negro, 0.8);
  frente.position.set(0, h / 2, d / 2);
  g.add(frente);
  const pantalla = caja(62, h * 0.42, 1, mats.pantalla, 0.6);
  pantalla.position.set(w * 0.3, h * 0.56, d / 2 + 2);
  g.add(pantalla);
  const rejilla = new THREE.InstancedMesh(new THREE.BoxGeometry(2.6, h * 0.56, 0.6), mats.goma, 40);
  const dummy = new THREE.Object3D();
  for (let i = 0; i < 40; i++) {
    dummy.position.set(-w * 0.42 + i * 6, h / 2, d / 2 + 1.8);
    dummy.updateMatrix();
    rejilla.setMatrixAt(i, dummy.matrix);
  }
  g.add(rejilla);
  ponerLetrero(g, p.marca ?? "UPS", 40, 9, "#d9dce0", w * 0.3, h * 0.22, d / 2 + 2);
  return g;
}

const ALTO_U_MM = 44.45;

/**
 * Gabinete de 19″: marco, puerta de vidrio y rieles. `userData` guarda dónde va cada unidad, para
 * montarle los equipos con `montarEnGabinete`.
 */
function gabinete(p: ParamsEquipo, mats: Mats) {
  const u = p.unidades ?? 24;
  const w = p.anchoMm ?? 600;
  const d = p.fondoMm ?? 800;
  const h = p.altoMm ?? u * ALTO_U_MM + 150;
  const g = new THREE.Group();
  const panel = mats.metalOscuro.clone();
  panel.color = new THREE.Color(0x202328);
  panel.roughness = 0.55;
  panel.metalness = 0.7;
  const grueso = 18;
  const techo = caja(w, grueso, d, panel, 2);
  techo.position.y = h - grueso / 2;
  const piso = caja(w, grueso * 3, d, panel, 2);
  piso.position.y = grueso * 1.5;
  const fondo = caja(w, h, 6, panel, 1);
  fondo.position.set(0, h / 2, -d / 2 + 3);
  const izq = caja(6, h, d, panel, 1);
  izq.position.set(-w / 2 + 3, h / 2, 0);
  const der = caja(6, h, d, panel, 1);
  der.position.set(w / 2 - 3, h / 2, 0);
  g.add(techo, piso, fondo, izq, der);
  for (const x of [-222, 222]) {
    const riel = caja(16, h - grueso * 4, 12, mats.metal, 1);
    riel.position.set(x, h / 2, d / 2 - 70);
    g.add(riel);
  }
  // Puerta de vidrio con marco.
  const zPuerta = d / 2 + 3;
  const lados: ReadonlyArray<readonly [number, number, number, number]> = [
    [w, 30, 0, h - 15],
    [w, 30, 0, 15 + grueso * 3],
    [30, h, -w / 2 + 15, h / 2],
    [30, h, w / 2 - 15, h / 2],
  ];
  for (const [a, b, x, y] of lados) {
    const m = caja(a, b, 6, panel, 1);
    m.position.set(x, y, zPuerta);
    g.add(m);
  }
  const vidrio = new THREE.Mesh(new THREE.PlaneGeometry(w - 40, h - 60 - grueso * 3), new THREE.MeshPhysicalMaterial({ color: 0xbfd8e2, transparent: true, opacity: 0.16, roughness: 0.06, clearcoat: 1, depthWrite: false }));
  vidrio.position.set(0, h / 2 + grueso, zPuerta + 1);
  g.add(vidrio);
  const manija = caja(14, 110, 16, mats.metal, 2);
  manija.position.set(w / 2 - 15, h / 2, zPuerta + 9);
  g.add(manija);
  g.userData.baseU = grueso * 3 + 24;
  g.userData.zFrente = d / 2 - 80;
  return g;
}

function pantallaAcceso(w: number, h: number): THREE.Material {
  const lienzo = document.createElement("canvas");
  lienzo.width = 256;
  lienzo.height = Math.round((256 * h) / w);
  const c = lienzo.getContext("2d");
  if (!c) return new THREE.MeshBasicMaterial({ color: 0x0d2b33 });
  const a = lienzo.height;
  const gr = c.createLinearGradient(0, 0, 0, a);
  gr.addColorStop(0, "#0d2b33");
  gr.addColorStop(1, "#071418");
  c.fillStyle = gr;
  c.fillRect(0, 0, 256, a);
  c.strokeStyle = "#35d48a";
  c.lineWidth = 5;
  const cx = 128;
  const cy = a * 0.42;
  const r = 66;
  for (const [sx, sy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
    c.beginPath();
    c.moveTo(cx + sx * r, cy + sy * (r - 22));
    c.lineTo(cx + sx * r, cy + sy * r);
    c.lineTo(cx + sx * (r - 22), cy + sy * r);
    c.stroke();
  }
  c.beginPath();
  c.arc(cx, cy - 12, 26, 0, Math.PI * 2);
  c.strokeStyle = "rgba(255,255,255,.75)";
  c.lineWidth = 4;
  c.stroke();
  c.beginPath();
  c.arc(cx, cy + 50, 42, Math.PI * 1.15, Math.PI * 1.85);
  c.stroke();
  c.fillStyle = "#fff";
  c.font = "600 22px Arial";
  c.textAlign = "center";
  c.fillText("Acceso concedido", cx, a * 0.84);
  const t = new THREE.CanvasTexture(lienzo);
  t.colorSpace = THREE.SRGBColorSpace;
  return new THREE.MeshBasicMaterial({ map: t });
}

/** Terminal de acceso: pantalla vertical, doble cámara arriba y luces. */
function terminal(p: ParamsEquipo, mats: Mats) {
  const w = p.anchoMm ?? 92;
  const h = p.altoMm ?? 180;
  const d = p.fondoMm ?? 26;
  const g = new THREE.Group();
  const cuerpo = caja(w, h, d, mats.negro, 7);
  cuerpo.position.set(0, h / 2, d / 2);
  g.add(cuerpo);
  const frente = caja(w - 2.4, h - 2.4, 1.2, mats.espejo, 6);
  frente.position.set(0, h / 2, d + 0.2);
  g.add(frente);
  const pantalla = new THREE.Mesh(new THREE.PlaneGeometry(w - 12, h * 0.56), pantallaAcceso(w - 12, h * 0.56));
  pantalla.position.set(0, h * 0.46, d + 0.9);
  g.add(pantalla);
  const isla = caja(w * 0.52, h * 0.085, 0.8, mats.aro, 3);
  isla.position.set(0, h * 0.87, d + 0.9);
  g.add(isla);
  for (const x of [-0.14, 0.14]) {
    const l = lenteConAro(w * 0.038, 0.8, mats);
    l.position.set(x * w, h * 0.87, d + 1);
    g.add(l);
  }
  for (const x of [-0.34, 0.34]) {
    const led = malla(new THREE.SphereGeometry(w * 0.03, 14, 10), mats.ledBlanco);
    led.scale.z = 0.3;
    led.position.set(x * w, h * 0.87, d + 1);
    g.add(led);
  }
  const lector = malla(new THREE.TorusGeometry(w * 0.11, w * 0.012, 8, 40), mats.verde);
  lector.position.set(0, h * 0.09, d + 0.95);
  g.add(lector);
  return g;
}

/** Sirena o receptor de alerta sísmica: caja de muro con estrobo y bocina. */
function sirena(p: ParamsEquipo, mats: Mats, sismica = false) {
  const w = p.anchoMm ?? 200;
  const h = p.altoMm ?? 280;
  const d = p.fondoMm ?? 80;
  const g = new THREE.Group();
  const cuerpo = caja(w, h, d * 0.72, mats.cuerpo, 14);
  cuerpo.position.set(0, h / 2, d * 0.36);
  g.add(cuerpo);
  const estrobo = caja(w - 8, h * 0.26, d * 0.82, sismica ? mats.rojo : mats.azul, 12);
  estrobo.position.set(0, h * 0.17, d * 0.41);
  g.add(estrobo);
  if (sismica) {
    ponerLetrero(g, "ALERTA SÍSMICA", w * 0.72, 18, "#3a3f46", 0, h * 0.72, d * 0.725);
    const led = cilindro(4, 2, mats.verde, 16);
    led.rotation.x = Math.PI / 2;
    led.position.set(0, h * 0.86, d * 0.72);
    g.add(led);
  }
  const nx = 11;
  const ny = 6;
  const rejilla = new THREE.InstancedMesh(new THREE.CylinderGeometry(2, 2, 1, 10), mats.negro, nx * ny);
  const dummy = new THREE.Object3D();
  let k = 0;
  for (let i = 0; i < ny; i++) {
    for (let j = 0; j < nx; j++) {
      dummy.position.set((j - (nx - 1) / 2) * 11 + (i % 2) * 2, h * 0.44 + i * 8.5, d * 0.72);
      dummy.rotation.x = Math.PI / 2;
      dummy.updateMatrix();
      rejilla.setMatrixAt(k++, dummy.matrix);
    }
  }
  g.add(rejilla);
  return g;
}

/** Panel de alarma: caja cuadrada con luces y lector. */
function panelAlarma(p: ParamsEquipo, mats: Mats) {
  const w = p.anchoMm ?? 170;
  const h = p.altoMm ?? 170;
  const d = p.fondoMm ?? 38.6;
  const g = new THREE.Group();
  const cuerpo = caja(w, h, d, mats.cuerpo, 8);
  cuerpo.position.set(0, h / 2, d / 2);
  g.add(cuerpo);
  const franja = caja(w * 0.8, h * 0.024, 1, mats.negro, 0.4);
  franja.position.set(0, h * 0.84, d + 0.2);
  g.add(franja);
  for (let i = 0; i < 4; i++) {
    const l = cilindro(2.2, 1, i === 0 ? mats.verde : mats.goma, 14);
    l.rotation.x = Math.PI / 2;
    l.position.set(-w * 0.2 + i * w * 0.13, h * 0.91, d + 0.2);
    g.add(l);
  }
  const lector = malla(new THREE.RingGeometry(w * 0.13, w * 0.15, 56), mats.goma);
  lector.position.set(0, h * 0.5, d + 0.3);
  g.add(lector);
  ponerLetrero(g, p.marca, 62, 9, "#5a5f66", 0, h * 0.12, d + 0.3);
  return g;
}

/** Barrera vehicular: gabinete con pluma. El origen es el pie del gabinete; la pluma corre hacia +X. */
function barrera(p: ParamsEquipo, mats: Mats) {
  const largo = p.largoMm ?? 4000;
  const g = new THREE.Group();
  const amarillo = new THREE.MeshPhysicalMaterial({ color: 0xf0b429, roughness: 0.42, clearcoat: 0.3 });
  const gab = caja(320, 1000, 280, amarillo, 18);
  gab.position.y = 500;
  g.add(gab);
  const tapa = caja(340, 40, 300, mats.metalOscuro, 10);
  tapa.position.y = 1020;
  g.add(tapa);
  const pluma = caja(largo, 60, 34, new THREE.MeshPhysicalMaterial({ color: 0xf6f7f8, roughness: 0.4, clearcoat: 0.4 }), 12);
  pluma.position.set(largo / 2 + 100, 880, 0);
  g.add(pluma);
  const roja = new THREE.MeshPhysicalMaterial({ color: 0xc8212c, roughness: 0.4, clearcoat: 0.4 });
  for (let i = 0; i < 6; i++) {
    const r = caja(260, 62, 36, roja, 2);
    r.position.set(420 + i * (largo / 6.2), 880, 0);
    g.add(r);
  }
  return g;
}

/** Equipo sin modelo propio: caja con sus medidas, para que todo lo que se venda se pueda colocar. */
function generico(p: ParamsEquipo, mats: Mats) {
  const w = p.anchoMm ?? 220;
  const h = p.altoMm ?? 160;
  const d = p.fondoMm ?? 90;
  const g = new THREE.Group();
  const cuerpo = caja(w, h, d, mats.cuerpo, 6);
  cuerpo.position.set(0, h / 2, d / 2);
  g.add(cuerpo);
  const franja = caja(w * 0.7, h * 0.05, 1, mats.negro, 0.4);
  franja.position.set(0, h * 0.82, d + 0.2);
  g.add(franja);
  const led = cilindro(Math.min(w, h) * 0.02, 1, mats.verde, 14);
  led.rotation.x = Math.PI / 2;
  led.position.set(w * 0.3, h * 0.18, d + 0.2);
  g.add(led);
  ponerLetrero(g, p.marca, Math.min(w * 0.6, 80), 10, "#5a5f66", 0, h * 0.5, d + 0.3);
  return g;
}

const FABRICA: Readonly<Record<TipoEquipo, (p: ParamsEquipo, m: Mats) => THREE.Group>> = {
  nvr: grabador,
  switch: switchPoe,
  servidor,
  ups,
  gabinete,
  terminal,
  sirena: (p, m) => sirena(p, m, false),
  sismica: (p, m) => sirena(p, m, true),
  panel: panelAlarma,
  barrera,
  generico,
};

const moldes = new Map<string, THREE.Group>();

/** Arma un equipo. `p` son las medidas de la ficha. */
export function crearModeloEquipo(tipo: TipoEquipo, p: ParamsEquipo = {}): THREE.Group {
  const clave = JSON.stringify([tipo, p]);
  let molde = moldes.get(clave);
  if (!molde) {
    const interno = (FABRICA[tipo] ?? FABRICA.generico)(p, materiales("blanco"));
    interno.scale.setScalar(MM);
    molde = new THREE.Group();
    molde.add(interno);
    molde.userData.tipo = tipo;
    marcarCompartido(molde);
    moldes.set(clave, molde);
  }
  return molde.clone();
}

/** Mete un equipo al gabinete en su unidad (la 1 es la de abajo). `gabinete` lo da `crearModeloEquipo`. */
export function montarEnGabinete(gabinete: THREE.Group, tipo: TipoEquipo, p: ParamsEquipo, unidad: number) {
  const interno = gabinete.children[0];
  const baseU = Number(interno?.userData.baseU ?? 78);
  const zFrente = Number(interno?.userData.zFrente ?? 320);
  const equipo = crearModeloEquipo(tipo, p).children[0];
  equipo.scale.setScalar(1);
  const fondo = new THREE.Box3().setFromObject(equipo).getSize(new THREE.Vector3()).z;
  equipo.position.set(0, baseU + (unidad - 1) * ALTO_U_MM, zFrente - fondo / 2 + 8);
  interno.add(equipo);
}
