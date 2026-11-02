/**
 * Modelos 3D propios de lo que no es cámara: grabador, switch, servidor, UPS, gabinete, terminal de
 * acceso, sirena, alerta sísmica, panel de alarma, barrera y una caja genérica. Se arman con código a
 * partir de las medidas de la ficha, en milímetros: nada viene de un fabricante, y por eso cualquier
 * marca sirve. La marca y la clave se rotulan con letra normal, nunca con un logotipo.
 *
 * El frente mira a +Z y la base queda en Y = 0; los equipos de muro tienen la espalda en Z = 0. Lo que se
 * repite (puertos, ventilas, luces) va instanciado para que un gabinete lleno siga girando fluido.
 */
import { marcaCorta } from "../marca";
import * as THREE from "three";
import type { TipoEquipo } from "../catalogo";
import { caja, cilindro, lenteConAro, malla, materiales, type Mats } from "./modelos";
import { marcarCompartido } from "./texturas";

const MM = 0.001;
/** Ancho total de 19″, con orejas. */
const ANCHO_19 = 482;
const ALTO_U_MM = 44.45;

/** Medidas de la ficha. Lo que falte usa la proporción típica del tipo. */
export type ParamsEquipo = {
  marca?: string;
  /** Clave del modelo, para rotularla en el frente. */
  modelo?: string;
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

type P3 = readonly [number, number, number];

/** Muchas piezas iguales en una sola malla. */
function instancias(geo: THREE.BufferGeometry, mat: THREE.Material, pos: readonly P3[], rotX = 0): THREE.InstancedMesh {
  const m = new THREE.InstancedMesh(geo, mat, pos.length);
  const d = new THREE.Object3D();
  pos.forEach(([x, y, z], i) => {
    d.position.set(x, y, z);
    d.rotation.x = rotX;
    d.updateMatrix();
    m.setMatrixAt(i, d.matrix);
  });
  m.castShadow = false;
  m.receiveShadow = false;
  return m;
}

/** `n` por `f` posiciones en el plano XY, centradas en (cx, cy). */
function rejillaXY(cx: number, cy: number, z: number, n: number, f: number, dx: number, dy: number): P3[] {
  const salida: P3[] = [];
  for (let j = 0; j < f; j++) for (let i = 0; i < n; i++) salida.push([cx + (i - (n - 1) / 2) * dx, cy + (j - (f - 1) / 2) * dy, z]);
  return salida;
}

/** Texto serigrafiado: sale con su ancho real y, sin lienzo 2D (pruebas), no se pone. */
function rotulo(texto: string | undefined, x: number, y: number, z: number, altoMm: number, o: { color?: string; peso?: string; alinea?: "izq" | "centro" | "der"; ry?: number; rx?: number; maxAncho?: number } = {}) {
  if (!texto) return null;
  const lienzo = document.createElement("canvas");
  const c = lienzo.getContext("2d");
  if (!c) return null;
  const px = 72;
  const fuente = `${o.peso ?? "600"} ${px}px Inter, "Segoe UI", Arial, sans-serif`;
  c.font = fuente;
  const anchoPx = Math.ceil(c.measureText(texto).width) + 8;
  lienzo.width = anchoPx;
  lienzo.height = Math.ceil(px * 1.3);
  c.font = fuente;
  c.fillStyle = o.color ?? "#d8dbe0";
  c.textBaseline = "middle";
  c.fillText(texto, 4, lienzo.height / 2 + 2);
  const t = new THREE.CanvasTexture(lienzo);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  // Un nombre largo se achica para no pisar lo que tiene al lado.
  const ajuste = o.maxAncho ? Math.min(o.maxAncho / ((altoMm * 1.3 * anchoPx) / lienzo.height), 1) : 1;
  const h = altoMm * 1.3 * ajuste;
  const w = (h * anchoPx) / lienzo.height;
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ map: t, transparent: true, depthWrite: false }));
  const dx = o.alinea === "izq" ? w / 2 : o.alinea === "der" ? -w / 2 : 0;
  m.position.set(x + dx, y, z);
  if (o.ry) m.rotation.y = o.ry;
  if (o.rx) m.rotation.x = o.rx;
  m.renderOrder = 2;
  return m;
}

function poner(g: THREE.Group, ...piezas: Array<THREE.Object3D | null>) {
  for (const p of piezas) if (p) g.add(p);
}

/** Pintura electrostática: el granito fino que le quita lo plano a la lámina. */
let granito: THREE.CanvasTexture | null | undefined;
function texturaGranito() {
  if (granito !== undefined) return granito;
  const el = document.createElement("canvas");
  el.width = 256;
  el.height = 256;
  const c = el.getContext("2d");
  if (!c) return (granito = null);
  const d = c.createImageData(256, 256);
  let semilla = 7;
  for (let i = 0; i < d.data.length; i += 4) {
    semilla = (semilla * 16807) % 2147483647;
    const v = 118 + (semilla % 20);
    d.data[i] = v;
    d.data[i + 1] = v;
    d.data[i + 2] = v;
    d.data[i + 3] = 255;
  }
  c.putImageData(d, 0, 0);
  const t = new THREE.CanvasTexture(el);
  t.wrapS = THREE.RepeatWrapping;
  t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(5, 5);
  t.userData.compartido = true;
  return (granito = t);
}

function lamina(color: number, rugosidad = 0.62, metal = 0.25) {
  const t = texturaGranito();
  return new THREE.MeshStandardMaterial({ color, roughness: rugosidad, metalness: metal, bumpMap: t ?? null, bumpScale: t ? 0.35 : 0 });
}

const geoPuertoMarco = () => new THREE.BoxGeometry(12.8, 10.6, 1.4);
const geoPuertoHueco = () => new THREE.BoxGeometry(10.6, 8.2, 0.5);
const geoPestana = () => new THREE.BoxGeometry(4.2, 1.5, 0.4);

/** Tomas RJ45: marco metálico, hueco oscuro y la muesca de la pestaña. Tantas como posiciones. */
function puertosRJ45(pos: readonly P3[], m: Mats, invertidos = false) {
  const g = new THREE.Group();
  g.add(instancias(geoPuertoMarco(), m.metal, pos));
  g.add(instancias(geoPuertoHueco(), m.ranura, pos.map(([x, y, z]) => [x, y, z + 0.6] as const)));
  g.add(instancias(geoPestana(), m.goma, pos.map(([x, y, z]) => [x, y + (invertidos ? -4.2 : 4.2), z + 0.75] as const)));
  return g;
}

const geoLed = () => new THREE.CylinderGeometry(1.1, 1.1, 0.5, 12);

function luces(pos: readonly P3[], mat: THREE.Material) {
  return instancias(geoLed(), mat, pos, Math.PI / 2);
}

/**
 * Chasis de lámina: cuerpo, tapa con su junta, tornillos de la tapa y ventilas a los lados y arriba.
 * `y0` deja lugar a las patas; `orejas` agrega las de 19″.
 */
function chasis(w: number, h: number, d: number, m: Mats, o: { color?: number; tapa?: number; y0?: number; orejas?: boolean; ventilas?: boolean } = {}) {
  const g = new THREE.Group();
  const y0 = o.y0 ?? 0;
  const alto = h - y0;
  const cuerpoMat = lamina(o.color ?? 0x26292e);
  const tapaMat = lamina(o.tapa ?? o.color ?? 0x2b2e34);
  const cuerpo = caja(w - 0.8, alto - 4, d - 1, cuerpoMat, 0.8);
  cuerpo.position.set(0, y0 + (alto - 4) / 2, 0);
  const tapa = caja(w, 5, d, tapaMat, 1);
  tapa.position.set(0, h - 2.5, 0);
  g.add(cuerpo, tapa);
  // Tornillos de la tapa.
  const cabeza = new THREE.CylinderGeometry(2.2, 2.2, 0.8, 16);
  g.add(
    instancias(
      cabeza,
      m.metal,
      [
        [-w / 2 + 12, h + 0.2, -d / 2 + 12],
        [w / 2 - 12, h + 0.2, -d / 2 + 12],
        [0, h + 0.2, -d / 2 + 12],
      ],
    ),
  );
  if (o.ventilas !== false) {
    const ranura = new THREE.BoxGeometry(2.4, 0.5, Math.min(d * 0.1, 26));
    const filas = 3;
    const pos: P3[] = [];
    for (let f = 0; f < filas; f++) for (let i = 0; i < 36; i++) pos.push([(i - 17.5) * (w * 0.022), h + 0.02, -d * 0.12 - f * Math.min(d * 0.12, 30)]);
    g.add(instancias(ranura, m.ranura, pos));
    const lado = new THREE.BoxGeometry(0.5, Math.min(alto * 0.34, 16), 3);
    const lados: P3[] = [];
    for (const x of [-w / 2 + 0.3, w / 2 - 0.3]) for (let i = 0; i < 14; i++) lados.push([x, y0 + alto * 0.48, -d * 0.08 - i * 7]);
    g.add(instancias(lado, m.ranura, lados));
  }
  if (o.orejas) {
    const oreja = lamina(o.color ?? 0x26292e);
    for (const s of [-1, 1]) {
      const placa = caja(ANCHO_19 / 2 - w / 2 + 1, alto, 2.2, oreja, 0.6);
      placa.position.set((s * (ANCHO_19 / 2 + w / 2)) / 2, y0 + alto / 2, d / 2 - 1);
      g.add(placa);
      const n = alto > 70 ? 2 : 1;
      for (let i = 0; i < n; i++) {
        const y = y0 + alto * (n === 1 ? 0.5 : i === 0 ? 0.25 : 0.75);
        const ojal = caja(9, 5.6, 0.5, m.ranura, 0.6);
        ojal.position.set(s * (w / 2 + (ANCHO_19 / 2 - w / 2) / 2 + 1), y, d / 2 + 0.2);
        g.add(ojal);
      }
    }
  }
  return g;
}

function patas(w: number, d: number, m: Mats, alto: number) {
  const geo = new THREE.CylinderGeometry(9, 10, alto, 20);
  return instancias(geo, m.goma, [
    [-w / 2 + 30, alto / 2, d / 2 - 30],
    [w / 2 - 30, alto / 2, d / 2 - 30],
    [-w / 2 + 30, alto / 2, -d / 2 + 30],
    [w / 2 - 30, alto / 2, -d / 2 + 30],
  ]);
}

/** Toma de corriente IEC, con su marco y sus tres contactos. */
function tomaIEC(x: number, y: number, z: number, m: Mats, atras = true) {
  const g = new THREE.Group();
  const marco = caja(27, 20, 2, m.negro, 1.5);
  const hueco = caja(22, 15, 1, m.goma, 1);
  hueco.position.z = atras ? -1 : 1;
  g.add(marco, hueco);
  g.position.set(x, y, z);
  return g;
}

/** Ventilador trasero: aro y aspas fijas a la vista. */
function ventilador(x: number, y: number, z: number, r: number, m: Mats) {
  const g = new THREE.Group();
  const aro = malla(new THREE.TorusGeometry(r, r * 0.09, 10, 36), m.metalOscuro);
  const fondo = cilindro(r * 0.96, 0.5, m.ranura, 28);
  fondo.rotation.x = Math.PI / 2;
  const centro = cilindro(r * 0.28, 1, m.goma, 18);
  centro.rotation.x = Math.PI / 2;
  g.add(aro, fondo, centro);
  for (let i = 0; i < 7; i++) {
    const aspa = new THREE.Mesh(new THREE.BoxGeometry(r * 0.62, r * 0.17, 0.4), m.goma);
    const a = (i / 7) * Math.PI * 2;
    aspa.position.set(Math.cos(a) * r * 0.54, Math.sin(a) * r * 0.54, 0.4);
    aspa.rotation.z = a + 0.4;
    g.add(aspa);
  }
  g.position.set(x, y, z);
  return g;
}

/* ── Grabador ───────────────────────────────────────────────────────────────────── */

function grabador(p: ParamsEquipo, m: Mats) {
  const w = p.anchoMm ?? 385;
  const d = p.fondoMm ?? 315;
  const h = p.altoMm ?? 52;
  const y0 = 3;
  const g = new THREE.Group();
  g.add(patas(w, d, m, y0), chasis(w, h, d, m, { y0, color: 0x1e2024, tapa: 0x24262b }));
  const zf = d / 2;
  const alto = h - y0;
  const yc = y0 + alto / 2;
  // Frente: placa negra brillante con una franja metálica.
  const frente = caja(w, alto, 4, m.espejo, 1.4);
  frente.position.set(0, yc, zf + 1);
  const franja = caja(w * 0.96, Math.max(alto * 0.05, 1), 0.5, m.metal, 0.2);
  franja.position.set(0, y0 + alto * 0.22, zf + 3.1);
  g.add(frente, franja);
  const zt = zf + 3.2;
  // Botón de encendido con su aro de luz.
  const xBoton = -w * 0.17;
  const aro = malla(new THREE.TorusGeometry(alto * 0.15, 0.7, 10, 40), m.verde);
  aro.position.set(xBoton, y0 + alto * 0.6, zt);
  const boton = cilindro(alto * 0.13, 1, m.metalOscuro, 28);
  boton.rotation.x = Math.PI / 2;
  boton.position.set(xBoton, y0 + alto * 0.6, zt);
  g.add(aro, boton);
  // Luces de estado con su nombre.
  const nombres = ["PWR", "HDD", "NET", "ALM"];
  nombres.forEach((n, i) => {
    const x = w * 0.03 + i * w * 0.055;
    g.add(luces([[x, y0 + alto * 0.68, zt]], i < 3 ? m.verde : m.goma));
    poner(g, rotulo(n, x, y0 + alto * 0.45, zt, 3, { color: "#8d939b", peso: "500" }));
  });
  // USB.
  const usb = caja(14, 6.2, 0.6, m.metal, 0.5);
  usb.position.set(w * 0.33, y0 + alto * 0.62, zt);
  const lengua = caja(11, 2, 0.5, m.azul, 0.2);
  lengua.position.set(w * 0.33, y0 + alto * 0.62, zt + 0.2);
  g.add(usb, lengua);
  poner(g, rotulo(p.marca, -w / 2 + 14, y0 + alto * 0.62, zt, Math.min(alto * 0.2, 9), { alinea: "izq", peso: "700", maxAncho: xBoton - alto * 0.15 - 6 + w / 2 - 14 }));
  poner(g, rotulo(p.modelo, w / 2 - 12, y0 + alto * 0.11, zt, 3.2, { alinea: "der", color: "#9aa0a8", peso: "500" }));
  // Espalda: tomas, video y red.
  const zb = -d / 2 - 0.2;
  const atras = new THREE.Group();
  const placa = caja(w - 4, alto - 2, 0.5, lamina(0x2e3137), 0.3);
  placa.position.set(0, yc, zb);
  atras.add(placa);
  const poe = puertosRJ45(rejillaXY(-w * 0.25, yc, 0, 8, 1, 15, 0), m);
  poe.position.z = zb - 1;
  poe.rotation.y = Math.PI;
  atras.add(poe);
  atras.add(tomaIEC(w * 0.38, yc, zb - 0.5, m));
  const video = caja(16, 7, 0.8, m.metalOscuro, 0.6);
  video.position.set(w * 0.16, yc, zb - 0.5);
  atras.add(video);
  g.add(atras);
  return g;
}

/* ── Switch ─────────────────────────────────────────────────────────────────────── */

function switchPoe(p: ParamsEquipo, m: Mats) {
  const w = p.anchoMm ?? 440;
  const d = p.fondoMm ?? 280;
  const h = p.altoMm ?? 44;
  const g = new THREE.Group();
  g.add(chasis(w, h, d, m, { color: 0x24272c, orejas: true }));
  const frente = caja(w, h - 1, 2, lamina(0x1b1d21, 0.5), 0.8);
  frente.position.set(0, h / 2, d / 2);
  g.add(frente);
  const zt = d / 2 + 1.1;
  const puertos = Math.min(Math.max(Math.round(p.puertos ?? 24), 2), 48);
  const porFila = Math.ceil(puertos / 2);
  const paso = 14.6;
  const bloque = w * 0.56;
  const x0 = -bloque / 2 + w * 0.055;
  const arriba: P3[] = [];
  const abajo: P3[] = [];
  const ledsVerde: P3[] = [];
  const ledsAmbar: P3[] = [];
  for (let i = 0; i < porFila; i++) {
    // Se agrupan de 8 en 8, como en el equipo de verdad.
    const x = x0 + i * paso + Math.floor(i / 8) * 7;
    arriba.push([x, h * 0.67, zt]);
    if (arriba.length + abajo.length < puertos) abajo.push([x, h * 0.33, zt]);
    ledsVerde.push([x - 3.4, h * 0.93, zt]);
    ledsAmbar.push([x + 3.4, h * 0.93, zt]);
  }
  g.add(puertosRJ45(arriba, m), puertosRJ45(abajo, m, true), luces(ledsVerde, m.verde), luces(ledsAmbar, m.ambar));
  // Números de los puertos, chicos, entre las filas.
  for (let i = 0; i < porFila; i += 4) {
    const x = x0 + i * paso + Math.floor(i / 8) * 7;
    poner(g, rotulo(String(i * 2 + 1), x, h * 0.5, zt + 0.5, 2.2, { color: "#8d939b", peso: "500" }));
  }
  // A la derecha, las de subida: dos RJ45 y dos jaulas SFP.
  const xSub = x0 + porFila * paso + Math.floor(porFila / 8) * 7 + 14;
  g.add(puertosRJ45([[xSub, h * 0.67, zt]], m), puertosRJ45([[xSub, h * 0.33, zt]], m, true));
  const jaula = new THREE.BoxGeometry(14, 11, 1.2);
  const hueco = new THREE.BoxGeometry(11.5, 8.6, 0.4);
  const sfp: P3[] = [
    [xSub + 17, h * 0.67, zt],
    [xSub + 17, h * 0.33, zt],
  ];
  g.add(instancias(jaula, m.metal, sfp), instancias(hueco, m.ranura, sfp.map(([x, y, z]) => [x, y, z + 0.5] as const)));
  poner(g, rotulo("SFP", xSub + 17, h * 0.93, zt + 0.3, 2.2, { color: "#8d939b", peso: "500" }));
  // A la izquierda, marca y luces generales.
  const xIzq = -w / 2 + 12;
  poner(g, rotulo(p.marca, xIzq, h * 0.68, zt, Math.min(h * 0.17, 7), { alinea: "izq", peso: "700" }));
  poner(g, rotulo(p.modelo, xIzq, h * 0.46, zt, 2.5, { alinea: "izq", color: "#9aa0a8", peso: "500" }));
  g.add(luces([[xIzq + 3, h * 0.24, zt]], m.verde), luces([[xIzq + 18, h * 0.24, zt]], m.ambar));
  poner(g, rotulo("PWR", xIzq + 3, h * 0.11, zt, 2, { color: "#8d939b", peso: "500" }), rotulo("PoE", xIzq + 18, h * 0.11, zt, 2, { color: "#8d939b", peso: "500" }));
  // Espalda.
  const zb = -d / 2 - 0.4;
  g.add(tomaIEC(-w * 0.34, h * 0.48, zb, m), ventilador(w * 0.12, h * 0.48, zb, h * 0.36, m), ventilador(w * 0.34, h * 0.48, zb, h * 0.36, m));
  return g;
}

/* ── Servidor ───────────────────────────────────────────────────────────────────── */

function servidor(p: ParamsEquipo, m: Mats) {
  const w = p.anchoMm ?? 445;
  const d = p.fondoMm ?? 700;
  const h = p.altoMm ?? 87;
  const g = new THREE.Group();
  g.add(chasis(w, h, d, m, { color: 0x2a2d32, tapa: 0x8d9299, orejas: true }));
  const zf = d / 2;
  const frente = caja(w, h - 1, 3, lamina(0x15171a, 0.55), 1);
  frente.position.set(0, h / 2, zf);
  g.add(frente);
  const zt = zf + 1.6;
  // Bahías con su charola: marco, palanca, rejilla y dos luces.
  const bahias = Math.min(Math.max(Math.round(p.bahias ?? 8), 2), 12);
  const anchoBahia = (w * 0.74) / bahias;
  const altoBahia = h * 0.78;
  const x0 = -w * 0.11 - ((bahias - 1) * anchoBahia) / 2 + w * 0.05;
  const centros: P3[] = [];
  for (let i = 0; i < bahias; i++) centros.push([x0 + i * anchoBahia, h / 2, zt]);
  g.add(instancias(new THREE.BoxGeometry(anchoBahia - 1.6, altoBahia, 1.4), m.metalOscuro, centros));
  g.add(instancias(new THREE.BoxGeometry(anchoBahia - 6, altoBahia * 0.6, 0.5), m.ranura, centros.map(([x, y, z]) => [x, y - altoBahia * 0.08, z + 0.9] as const)));
  g.add(instancias(new THREE.BoxGeometry(anchoBahia - 5, 3.4, 1.8), m.metal, centros.map(([x, y, z]) => [x, y + altoBahia * 0.36, z + 1] as const)));
  g.add(luces(centros.map(([x, y, z]) => [x - anchoBahia * 0.28, y - altoBahia * 0.43, z + 1] as const), m.verde));
  g.add(luces(centros.map(([x, y, z]) => [x + anchoBahia * 0.28, y - altoBahia * 0.43, z + 1] as const), m.azul));
  // Control: encendido, luces y puertos.
  const xPanel = w * 0.43;
  const encendido = cilindro(4, 1.2, m.verde, 20);
  encendido.rotation.x = Math.PI / 2;
  encendido.position.set(xPanel, h * 0.74, zt + 0.4);
  g.add(encendido, luces([[xPanel - 6, h * 0.54, zt + 0.2], [xPanel, h * 0.54, zt + 0.2], [xPanel + 6, h * 0.54, zt + 0.2]], m.ambar));
  const usb = caja(14, 5.6, 0.6, m.metal, 0.5);
  usb.position.set(xPanel, h * 0.34, zt);
  g.add(usb);
  poner(g, rotulo(p.modelo, xPanel, h * 0.14, zt + 0.2, 2.6, { color: "#9aa0a8", peso: "500" }));
  poner(g, rotulo(p.marca, -w / 2 + 8, h * 0.5, zt + 0.2, 5, { alinea: "izq", peso: "700", rx: 0 }));
  // Espalda: dos fuentes con ventilador, red y video.
  const zb = -d / 2 - 0.4;
  for (const s of [-1, 1]) {
    const fuente = caja(70, h * 0.42, 1.5, lamina(0x1c1e22), 0.8);
    fuente.position.set(w * 0.32 + s * 0, h * (s > 0 ? 0.74 : 0.27), zb);
    g.add(fuente, ventilador(w * 0.28, h * (s > 0 ? 0.74 : 0.27), zb - 0.8, h * 0.15, m), tomaIEC(w * 0.38, h * (s > 0 ? 0.74 : 0.27), zb - 0.8, m));
  }
  const red = puertosRJ45(rejillaXY(0, 0, 0, 4, 1, 15, 0), m);
  red.rotation.y = Math.PI;
  red.position.set(-w * 0.2, h * 0.3, zb - 0.6);
  g.add(red);
  return g;
}

/* ── UPS ────────────────────────────────────────────────────────────────────────── */

/** La pantalla del UPS con lo que dice normalmente. */
function pantallaUps(w: number, h: number): THREE.Material {
  const el = document.createElement("canvas");
  el.width = 360;
  el.height = Math.round((360 * h) / w);
  const c = el.getContext("2d");
  if (!c) return new THREE.MeshBasicMaterial({ color: 0x123044 });
  const a = el.height;
  c.fillStyle = "#0e2a3c";
  c.fillRect(0, 0, 360, a);
  c.fillStyle = "#bfe8ff";
  c.font = '600 38px Inter, "Segoe UI", Arial, sans-serif';
  c.fillText("120 V", 16, a * 0.36);
  c.font = '500 22px Inter, "Segoe UI", Arial, sans-serif';
  c.fillText("EN LÍNEA", 230, a * 0.34);
  c.fillText("CARGA", 16, a * 0.78);
  c.strokeStyle = "#bfe8ff";
  c.lineWidth = 2;
  c.strokeRect(110, a * 0.62, 230, a * 0.22);
  for (let i = 0; i < 6; i++) c.fillRect(116 + i * 28, a * 0.65, 22, a * 0.16);
  const t = new THREE.CanvasTexture(el);
  t.colorSpace = THREE.SRGBColorSpace;
  return new THREE.MeshBasicMaterial({ map: t });
}

function ups(p: ParamsEquipo, m: Mats) {
  const w = p.anchoMm ?? 440;
  const d = p.fondoMm ?? 500;
  const h = p.altoMm ?? 87;
  const g = new THREE.Group();
  g.add(chasis(w, h, d, m, { color: 0x202226, orejas: true }));
  const frente = caja(w, h - 1, 3, lamina(0x15171a, 0.6), 1);
  frente.position.set(0, h / 2, d / 2);
  g.add(frente);
  const zt = d / 2 + 1.7;
  // Rejilla de ventilación en panal, a la izquierda.
  const celdas = rejillaXY(-w * 0.18, h / 2, zt, 44, 7, 5.4, 8.6).map(([x, y, z], i) => [x + (Math.floor(i / 44) % 2) * 2.7, y, z] as const);
  g.add(instancias(new THREE.CylinderGeometry(1.9, 1.9, 0.5, 6), m.ranura, celdas, Math.PI / 2));
  // Pantalla y sus botones.
  const anchoP = 66;
  const altoP = h * 0.42;
  const marco = caja(anchoP + 5, altoP + 5, 0.8, m.negro, 1);
  marco.position.set(w * 0.3, h * 0.6, zt);
  const pantalla = new THREE.Mesh(new THREE.PlaneGeometry(anchoP, altoP), pantallaUps(anchoP, altoP));
  pantalla.position.set(w * 0.3, h * 0.6, zt + 0.5);
  g.add(marco, pantalla);
  g.add(instancias(new THREE.CylinderGeometry(3, 3, 1.1, 18), m.metalOscuro, rejillaXY(w * 0.3, h * 0.2, zt, 4, 1, 15, 0), Math.PI / 2));
  poner(g, rotulo(p.marca, w * 0.3 + anchoP / 2 + 6, h * 0.76, zt, 5, { alinea: "izq", peso: "700" }), rotulo(p.modelo, w * 0.3 + anchoP / 2 + 6, h * 0.58, zt, 2.5, { alinea: "izq", color: "#9aa0a8", peso: "500" }));
  // Espalda: contactos, entrada y ventilador.
  const zb = -d / 2 - 0.5;
  for (let i = 0; i < 6; i++) g.add(tomaIEC(-w * 0.34 + i * 34, h * 0.5, zb, m));
  g.add(ventilador(w * 0.34, h * 0.5, zb, h * 0.3, m));
  return g;
}

/* ── Gabinete ───────────────────────────────────────────────────────────────────── */

/** Tira de números de unidad, para el poste. */
function tiraUnidades(u: number, altoMm: number): THREE.Mesh | null {
  const el = document.createElement("canvas");
  el.width = 32;
  el.height = Math.min(4096, u * 48);
  const c = el.getContext("2d");
  if (!c) return null;
  c.fillStyle = "#c7cbd1";
  c.font = '600 22px Inter, Arial, sans-serif';
  c.textAlign = "center";
  c.textBaseline = "middle";
  const paso = el.height / u;
  for (let i = 0; i < u; i++) c.fillText(String(u - i), 16, paso * (i + 0.5));
  const t = new THREE.CanvasTexture(el);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return new THREE.Mesh(new THREE.PlaneGeometry(9, altoMm), new THREE.MeshBasicMaterial({ map: t, transparent: true, depthWrite: false }));
}

/**
 * Gabinete de 19″: marco de lámina, puerta de vidrio con cerradura, postes perforados con sus números,
 * ventilas, charola de ventiladores y patas niveladoras. `userData` guarda dónde va cada unidad, para
 * montarle los equipos con `montarEnGabinete`.
 */
function gabinete(p: ParamsEquipo, m: Mats) {
  const u = Math.max(4, Math.round(p.unidades ?? 24));
  const w = p.anchoMm ?? 600;
  const d = p.fondoMm ?? 800;
  const base = 90;
  const h = p.altoMm ?? u * ALTO_U_MM + base + 70;
  const g = new THREE.Group();
  const panel = lamina(0x1d1f23, 0.55, 0.3);
  const grueso = 20;
  const yBase = base;
  // Patas niveladoras y zoclo.
  g.add(instancias(new THREE.CylinderGeometry(16, 20, base - 40, 24), m.goma, [
    [-w / 2 + 50, (base - 40) / 2, d / 2 - 50],
    [w / 2 - 50, (base - 40) / 2, d / 2 - 50],
    [-w / 2 + 50, (base - 40) / 2, -d / 2 + 50],
    [w / 2 - 50, (base - 40) / 2, -d / 2 + 50],
  ]));
  const zoclo = caja(w, 44, d, panel, 2);
  zoclo.position.y = base - 22;
  const techo = caja(w, grueso * 2, d, panel, 3);
  techo.position.y = h - grueso;
  const fondo = caja(w - 8, h - base - grueso * 2, 6, panel, 1);
  fondo.position.set(0, base + (h - base - grueso * 2) / 2, -d / 2 + 3);
  const izq = caja(8, h - base - grueso * 2, d, panel, 1);
  izq.position.set(-w / 2 + 4, base + (h - base - grueso * 2) / 2, 0);
  const der = izq.clone();
  der.position.x = w / 2 - 4;
  g.add(zoclo, techo, fondo, izq, der);
  // Ventilas de los costados, arriba y abajo.
  const louver = new THREE.BoxGeometry(0.8, 4, Math.min(d * 0.55, 400));
  const posLouver: P3[] = [];
  for (const x of [-w / 2 - 0.1, w / 2 + 0.1]) {
    for (let i = 0; i < 8; i++) {
      posLouver.push([x, base + 60 + i * 12, 0]);
      posLouver.push([x, h - grueso * 2 - 60 - i * 12, 0]);
    }
  }
  g.add(instancias(louver, m.ranura, posLouver));
  // Salidas de ventiladores en el techo.
  for (const x of [-w * 0.2, w * 0.2]) {
    const aro = malla(new THREE.TorusGeometry(46, 2.4, 10, 40), m.metalOscuro);
    aro.rotation.x = Math.PI / 2;
    aro.position.set(x, h + 0.5, -d * 0.1);
    const rejilla = cilindro(45, 0.6, m.ranura, 36);
    rejilla.position.set(x, h + 0.2, -d * 0.1);
    g.add(aro, rejilla);
  }
  // Postes de 19″ con sus perforaciones cuadradas y la numeración.
  const zPostes = d / 2 - 70;
  const altoPostes = u * ALTO_U_MM;
  const yPostes = yBase + 8 + altoPostes / 2;
  const hoyos: P3[] = [];
  for (const x of [-232, 232]) {
    const poste = caja(16, altoPostes + 16, 22, m.metal, 1);
    poste.position.set(x, yPostes, zPostes);
    g.add(poste);
    for (let i = 0; i < u; i++) for (const k of [-15.875, 0, 15.875]) hoyos.push([x, yBase + 8 + (i + 0.5) * ALTO_U_MM + k, zPostes + 11.2]);
  }
  g.add(instancias(new THREE.BoxGeometry(9.5, 9.5, 0.5), m.ranura, hoyos));
  const numeros = tiraUnidades(u, altoPostes);
  if (numeros) {
    numeros.position.set(-247, yPostes, zPostes + 11.5);
    g.add(numeros);
  }
  // Puerta: marco, vidrio, bisagras, jaladera con cerradura.
  const zPuerta = d / 2 + 3;
  const altoPuerta = h - base - grueso * 2 + 8;
  const yPuerta = base + altoPuerta / 2 - 4;
  const anchoM = 34;
  const lados: ReadonlyArray<readonly [number, number, number, number]> = [
    [w, anchoM, 0, yPuerta + altoPuerta / 2 - anchoM / 2],
    [w, anchoM, 0, yPuerta - altoPuerta / 2 + anchoM / 2],
    [anchoM, altoPuerta, -w / 2 + anchoM / 2, yPuerta],
    [anchoM, altoPuerta, w / 2 - anchoM / 2, yPuerta],
  ];
  for (const [a, b, x, y] of lados) {
    const pieza = caja(a, b, 6, panel, 1.5);
    pieza.position.set(x, y, zPuerta);
    g.add(pieza);
  }
  const vidrio = new THREE.Mesh(
    new THREE.PlaneGeometry(w - anchoM * 2 + 4, altoPuerta - anchoM * 2 + 4),
    new THREE.MeshPhysicalMaterial({ color: 0xcfe2ea, transparent: true, opacity: 0.13, roughness: 0.05, metalness: 0, clearcoat: 1, clearcoatRoughness: 0.05, depthWrite: false, envMapIntensity: 1.8 }),
  );
  vidrio.position.set(0, yPuerta, zPuerta + 0.5);
  vidrio.renderOrder = 3;
  g.add(vidrio);
  const jaladera = caja(20, 130, 14, m.metal, 3);
  jaladera.position.set(w / 2 - anchoM / 2, yPuerta, zPuerta + 9);
  const cerradura = cilindro(5, 2, m.metalOscuro, 18);
  cerradura.rotation.x = Math.PI / 2;
  cerradura.position.set(w / 2 - anchoM / 2, yPuerta + 44, zPuerta + 16.5);
  g.add(jaladera, cerradura);
  for (const y of [yPuerta + altoPuerta / 2 - 80, yPuerta - altoPuerta / 2 + 80]) {
    const bisagra = caja(10, 40, 8, m.metalOscuro, 1.5);
    bisagra.position.set(-w / 2 - 1, y, zPuerta);
    g.add(bisagra);
  }
  poner(g, rotulo(p.marca, 0, yPuerta + altoPuerta / 2 - anchoM / 2, zPuerta + 3.2, 11, { peso: "700", color: "#c7cbd1" }));
  g.userData.baseU = yBase + 8;
  g.userData.zFrente = zPostes + 8;
  return g;
}

/* ── Terminal de acceso ─────────────────────────────────────────────────────────── */

function pantallaAcceso(w: number, h: number): THREE.Material {
  const el = document.createElement("canvas");
  el.width = 360;
  el.height = Math.round((360 * h) / w);
  const c = el.getContext("2d");
  if (!c) return new THREE.MeshBasicMaterial({ color: 0x0d2b33 });
  const a = el.height;
  const gr = c.createLinearGradient(0, 0, 0, a);
  gr.addColorStop(0, "#102f3a");
  gr.addColorStop(1, "#061216");
  c.fillStyle = gr;
  c.fillRect(0, 0, 360, a);
  c.fillStyle = "#ffffff";
  c.textAlign = "center";
  c.font = '300 58px Inter, "Segoe UI", Arial, sans-serif';
  c.fillText("09:41", 180, a * 0.12);
  c.font = '400 20px Inter, "Segoe UI", Arial, sans-serif';
  c.fillStyle = "rgba(255,255,255,.7)";
  c.fillText("Coloca tu rostro en el marco", 180, a * 0.18);
  const cx = 180;
  const cy = a * 0.5;
  const r = 118;
  c.strokeStyle = "#35d48a";
  c.lineWidth = 7;
  c.lineCap = "round";
  for (const [sx, sy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
    c.beginPath();
    c.moveTo(cx + sx * r, cy + sy * (r - 40));
    c.lineTo(cx + sx * r, cy + sy * r);
    c.lineTo(cx + sx * (r - 40), cy + sy * r);
    c.stroke();
  }
  c.strokeStyle = "rgba(255,255,255,.72)";
  c.lineWidth = 5;
  c.beginPath();
  c.arc(cx, cy - 24, 42, 0, Math.PI * 2);
  c.stroke();
  c.beginPath();
  c.arc(cx, cy + 80, 72, Math.PI * 1.15, Math.PI * 1.85);
  c.stroke();
  c.fillStyle = "#35d48a";
  c.beginPath();
  c.roundRect(60, a * 0.8, 240, 58, 29);
  c.fill();
  c.fillStyle = "#06221a";
  c.font = '600 24px Inter, "Segoe UI", Arial, sans-serif';
  c.fillText("Acceso concedido", 180, a * 0.8 + 37);
  const t = new THREE.CanvasTexture(el);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return new THREE.MeshBasicMaterial({ map: t });
}

/** Terminal de acceso: marco de aluminio, frente de vidrio, doble cámara, luces y lector. */
function terminal(p: ParamsEquipo, m: Mats) {
  const w = p.anchoMm ?? 92;
  const h = p.altoMm ?? 180;
  const d = p.fondoMm ?? 26;
  const g = new THREE.Group();
  const placa = caja(w * 0.7, h * 0.7, 2.5, lamina(0x2a2d32), 1);
  placa.position.set(0, h / 2, 1.2);
  const cuerpo = caja(w, h, d - 2.5, m.metalOscuro, 6);
  cuerpo.position.set(0, h / 2, 2.5 + (d - 2.5) / 2);
  const cristal = caja(w - 1.4, h - 1.4, 0.8, m.espejo, 5.4);
  cristal.position.set(0, h / 2, d + 0.2);
  g.add(placa, cuerpo, cristal);
  const anchoP = w - 11;
  const altoP = h * 0.62;
  const pantalla = new THREE.Mesh(new THREE.PlaneGeometry(anchoP, altoP), pantallaAcceso(anchoP, altoP));
  pantalla.position.set(0, h * 0.44, d + 0.7);
  g.add(pantalla);
  // Isla de cámaras: dos lentes y luces IR y blanca.
  const isla = caja(w * 0.62, h * 0.075, 0.5, m.aro, 3);
  isla.position.set(0, h * 0.875, d + 0.72);
  g.add(isla);
  for (const x of [-0.13, 0.13]) {
    const l = lenteConAro(w * 0.035, 0.7, m);
    l.position.set(x * w, h * 0.875, d + 0.9);
    g.add(l);
  }
  g.add(instancias(new THREE.SphereGeometry(w * 0.024, 14, 10), m.ledBlanco, [[-0.29 * w, h * 0.875, d + 0.95], [0.29 * w, h * 0.875, d + 0.95]]));
  // Bocina y zona del lector de tarjeta.
  const hoyos = rejillaXY(0, h * 0.945, d + 0.72, 9, 1, 2.6, 0);
  g.add(instancias(new THREE.CylinderGeometry(0.55, 0.55, 0.3, 8), m.ranura, hoyos, Math.PI / 2));
  const lector = malla(new THREE.TorusGeometry(w * 0.075, w * 0.008, 8, 40), m.verde);
  lector.position.set(0, h * 0.07, d + 0.72);
  g.add(lector);
  poner(g, rotulo(p.marca, 0, h * 0.135, d + 0.72, 2.6, { color: "#9aa0a8", peso: "600" }));
  return g;
}

/* ── Sirena y alerta ────────────────────────────────────────────────────────────── */

/** Sirena o receptor de alerta sísmica: carcasa de muro, estrobo con estrías y bocina. */
function sirena(p: ParamsEquipo, m: Mats, sismica = false) {
  const w = p.anchoMm ?? 200;
  const h = p.altoMm ?? 280;
  const d = p.fondoMm ?? 80;
  const g = new THREE.Group();
  const plastico = new THREE.MeshPhysicalMaterial({ color: sismica ? 0xf1f2f0 : 0xeceef0, roughness: 0.46, clearcoat: 0.35, clearcoatRoughness: 0.5 });
  const base = caja(w, h, d * 0.42, lamina(0xcfd2d6, 0.7, 0), 12);
  base.position.set(0, h / 2, d * 0.21);
  const tapa = caja(w * 0.97, h * 0.97, d * 0.4, plastico, 16);
  tapa.position.set(0, h / 2, d * 0.5);
  g.add(base, tapa);
  // Estrobo con estrías de lente.
  const zFrente = d * 0.7;
  const anchoE = w * 0.82;
  const altoE = h * 0.2;
  const color = sismica ? m.rojo : m.azul;
  const estrobo = caja(anchoE, altoE, d * 0.3, color, 8);
  estrobo.position.set(0, h * 0.16, d * 0.62);
  g.add(estrobo);
  const estria = new THREE.BoxGeometry(2.2, altoE * 0.86, 1.4);
  g.add(instancias(estria, color, rejillaXY(0, h * 0.16, d * 0.62 + d * 0.15, 28, 1, anchoE / 30, 0)));
  // Bocina en panal.
  const nx = 13;
  const ny = 8;
  const celdas = rejillaXY(0, h * 0.5, zFrente, nx, ny, w * 0.055, w * 0.05).map(([x, y, z], i) => [x + (Math.floor(i / nx) % 2) * w * 0.027, y, z] as const);
  g.add(instancias(new THREE.CylinderGeometry(w * 0.015, w * 0.015, 1, 8), m.negro, celdas, Math.PI / 2));
  // Tornillos, luz de encendido y rótulo.
  g.add(instancias(new THREE.CylinderGeometry(4, 4, 1.2, 14), m.metal, [[-w * 0.4, h * 0.93, zFrente], [w * 0.4, h * 0.93, zFrente]], Math.PI / 2));
  g.add(luces([[0, h * 0.82, zFrente + 0.2]], m.verde));
  if (sismica) poner(g, rotulo("ALERTA SÍSMICA", 0, h * 0.74, zFrente + 0.4, w * 0.055, { color: "#b4242c", peso: "800" }));
  poner(g, rotulo(p.marca, 0, h * 0.9, zFrente + 0.4, w * 0.04, { color: "#5a5f66", peso: "700" }));
  return g;
}

/* ── Panel de alarma ────────────────────────────────────────────────────────────── */

function panelAlarma(p: ParamsEquipo, m: Mats) {
  const w = p.anchoMm ?? 170;
  const h = p.altoMm ?? 170;
  const d = p.fondoMm ?? 38.6;
  const g = new THREE.Group();
  const base = caja(w, h, d * 0.3, lamina(0xd2d5d9, 0.7, 0), 6);
  base.position.set(0, h / 2, d * 0.15);
  const frente = caja(w - 2, h - 2, d * 0.72, new THREE.MeshPhysicalMaterial({ color: 0xf2f3f4, roughness: 0.2, clearcoat: 0.9, clearcoatRoughness: 0.15 }), 9);
  frente.position.set(0, h / 2, d * 0.62);
  g.add(base, frente);
  const z = d * 0.98;
  // Luces de estado con su nombre.
  ["RED", "ARM", "ALM", "PWR"].forEach((n, i) => {
    const x = -w * 0.24 + i * w * 0.16;
    g.add(luces([[x, h * 0.84, z]], i === 3 ? m.verde : i === 2 ? m.goma : m.ambar));
    poner(g, rotulo(n, x, h * 0.77, z + 0.2, w * 0.018, { color: "#8d939b", peso: "600" }));
  });
  // Zona del lector.
  const aro = malla(new THREE.RingGeometry(w * 0.15, w * 0.165, 72), m.goma);
  aro.position.set(0, h * 0.46, z + 0.1);
  g.add(aro);
  poner(g, rotulo(")))", 0, h * 0.46, z + 0.2, w * 0.05, { color: "#7a8089", peso: "700" }));
  // Bocina abajo.
  g.add(instancias(new THREE.CylinderGeometry(0.9, 0.9, 0.3, 8), m.ranura, rejillaXY(0, h * 0.2, z + 0.05, 14, 2, 4, 4), Math.PI / 2));
  poner(g, rotulo(p.marca, 0, h * 0.09, z + 0.2, w * 0.03, { color: "#5a5f66", peso: "700" }));
  return g;
}

/* ── Barrera ────────────────────────────────────────────────────────────────────── */

/** Barrera vehicular: gabinete con puerta y ventilas, luz en la tapa y pluma con sus franjas. El origen es el pie; la pluma corre hacia +X. */
function barrera(p: ParamsEquipo, m: Mats) {
  const largo = p.largoMm ?? 4000;
  const anchoG = p.anchoMm && p.anchoMm < 800 ? p.anchoMm : 340;
  const fondoG = p.fondoMm && p.fondoMm < 800 ? p.fondoMm : 300;
  const altoG = p.altoMm && p.altoMm > 500 ? p.altoMm : 1000;
  const g = new THREE.Group();
  const pintura = new THREE.MeshPhysicalMaterial({ color: 0xe9b325, roughness: 0.38, clearcoat: 0.5, clearcoatRoughness: 0.4 });
  const base = caja(anchoG + 70, 12, fondoG + 70, m.metalOscuro, 2);
  base.position.y = 6;
  g.add(base);
  g.add(instancias(new THREE.CylinderGeometry(9, 9, 12, 8), m.metal, [
    [-(anchoG + 40) / 2, 16, (fondoG + 40) / 2],
    [(anchoG + 40) / 2, 16, (fondoG + 40) / 2],
    [-(anchoG + 40) / 2, 16, -(fondoG + 40) / 2],
    [(anchoG + 40) / 2, 16, -(fondoG + 40) / 2],
  ]));
  const gab = caja(anchoG, altoG - 12, fondoG, pintura, 14);
  gab.position.y = 12 + (altoG - 12) / 2;
  g.add(gab);
  // Puerta de servicio: junta, cerradura y ventilas.
  const zf = fondoG / 2 + 0.3;
  const junta = caja(anchoG * 0.78, altoG * 0.56, 0.6, new THREE.MeshStandardMaterial({ color: 0xc4951d, roughness: 0.5 }), 6);
  junta.position.set(0, altoG * 0.38, zf);
  const cerradura = cilindro(11, 3, m.metal, 20);
  cerradura.rotation.x = Math.PI / 2;
  cerradura.position.set(anchoG * 0.27, altoG * 0.46, zf + 1);
  g.add(junta, cerradura);
  g.add(instancias(new THREE.BoxGeometry(anchoG * 0.56, 5, 1), m.negro, rejillaXY(0, altoG * 0.2, zf + 0.4, 1, 9, 0, 11)));
  poner(g, rotulo(p.marca, 0, altoG * 0.56, zf + 0.5, 22, { color: "#3a3f46", peso: "800" }));
  // Tapa con su tira de luz.
  const tapa = caja(anchoG + 18, 26, fondoG + 18, m.metalOscuro, 8);
  tapa.position.y = altoG + 13;
  const luz = caja(anchoG + 20, 6, fondoG + 20, m.verde, 3);
  luz.position.y = altoG - 3;
  g.add(tapa, luz);
  // Eje y pluma, de aluminio con franjas reflejantes y su hule abajo.
  const yPluma = altoG * 0.82;
  const eje = cilindro(58, 22, m.metalOscuro, 36);
  eje.rotation.x = Math.PI / 2;
  eje.position.set(anchoG / 2 - 30, yPluma, zf + 11);
  const tornilloEje = cilindro(18, 6, m.metal, 20);
  tornilloEje.rotation.x = Math.PI / 2;
  tornilloEje.position.set(anchoG / 2 - 30, yPluma, zf + 25);
  g.add(eje, tornilloEje);
  const xIni = anchoG / 2 - 30;
  const pluma = caja(largo, 72, 34, new THREE.MeshPhysicalMaterial({ color: 0xf6f7f8, roughness: 0.32, clearcoat: 0.6 }), 12);
  pluma.position.set(xIni + largo / 2, yPluma, zf + 38);
  const hule = caja(largo * 0.97, 22, 26, m.goma, 6);
  hule.position.set(xIni + largo * 0.5, yPluma - 46, zf + 38);
  g.add(pluma, hule);
  const roja = new THREE.MeshPhysicalMaterial({ color: 0xc8212c, roughness: 0.32, clearcoat: 0.6 });
  const franjas = Math.max(3, Math.round(largo / 700));
  const anchoF = 220;
  const posF: P3[] = [];
  for (let i = 0; i < franjas; i++) {
    const x = xIni + 240 + (i * (largo - 480)) / Math.max(franjas - 1, 1);
    posF.push([x, yPluma, zf + 55.3], [x, yPluma, zf + 20.7]);
  }
  g.add(instancias(new THREE.BoxGeometry(anchoF, 73, 0.8), roja, posF));
  return g;
}

/* ── Genérico ───────────────────────────────────────────────────────────────────── */

/** Equipo sin modelo propio: caja de instalación con sus medidas, para que todo lo que se venda se pueda colocar. */
function generico(p: ParamsEquipo, m: Mats) {
  const w = p.anchoMm ?? 220;
  const h = p.altoMm ?? 160;
  const d = p.fondoMm ?? 90;
  const g = new THREE.Group();
  const cuerpo = caja(w, h, d * 0.8, lamina(0xe3e5e8, 0.55, 0), Math.min(w, h) * 0.04);
  cuerpo.position.set(0, h / 2, d * 0.4);
  const tapa = caja(w * 0.96, h * 0.96, d * 0.22, new THREE.MeshPhysicalMaterial({ color: 0xf0f1f3, roughness: 0.35, clearcoat: 0.6 }), Math.min(w, h) * 0.04);
  tapa.position.set(0, h / 2, d * 0.86);
  g.add(cuerpo, tapa);
  const z = d * 0.975;
  const t = Math.min(w, h) * 0.03;
  g.add(instancias(new THREE.CylinderGeometry(t, t, 1, 14), m.metal, [
    [-w * 0.42, h * 0.9, z],
    [w * 0.42, h * 0.9, z],
    [-w * 0.42, h * 0.1, z],
    [w * 0.42, h * 0.1, z],
  ], Math.PI / 2));
  g.add(luces([[w * 0.3, h * 0.2, z]], m.verde));
  poner(g, rotulo(p.marca, 0, h * 0.58, z, Math.min(h * 0.075, 12), { color: "#3a3f46", peso: "700" }), rotulo(p.modelo, 0, h * 0.46, z, Math.min(h * 0.04, 6), { color: "#7a8089", peso: "500" }));
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
export function crearModeloEquipo(tipo: TipoEquipo, original: ParamsEquipo = {}): THREE.Group {
  const p = { ...original, marca: marcaCorta(original.marca) || undefined };
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

/** Lo angosto (un grabador de escritorio) no llega a los postes: va sobre una charola de 1U. */
const ANCHO_SIN_CHAROLA = 430;

/** Mete un equipo al gabinete en su unidad (la 1 es la de abajo). `gabinete` lo da `crearModeloEquipo`. */
export function montarEnGabinete(gabinete: THREE.Group, tipo: TipoEquipo, p: ParamsEquipo, unidad: number) {
  const interno = gabinete.children[0];
  const baseU = Number(interno?.userData.baseU ?? 98);
  const zFrente = Number(interno?.userData.zFrente ?? 338);
  const equipo = crearModeloEquipo(tipo, p).children[0];
  equipo.scale.setScalar(1);
  const tam = new THREE.Box3().setFromObject(equipo).getSize(new THREE.Vector3());
  const y = baseU + (unidad - 1) * ALTO_U_MM;
  equipo.position.set(0, y, zFrente - tam.z / 2 + 8);
  interno.add(equipo);
  if (tam.x < ANCHO_SIN_CHAROLA) {
    const m = lamina(0x1b1d21);
    const charola = caja(ANCHO_19, 2.4, Math.max(tam.z + 30, 300), m, 0.6);
    charola.position.set(0, y - 1.2, zFrente - Math.max(tam.z + 30, 300) / 2 + 12);
    const frente = caja(ANCHO_19, ALTO_U_MM - 1, 2, m, 0.6);
    frente.position.set(0, y + (ALTO_U_MM - 1) / 2 - 2, zFrente + 13);
    charola.userData.compartido = false;
    interno.add(charola);
    // Solo las orejas de la charola tapan el frente: el equipo se sigue viendo.
    for (const s of [-1, 1]) {
      const oreja = caja((ANCHO_19 - tam.x) / 2 - 2, ALTO_U_MM - 1, 2, m, 0.6);
      oreja.position.set(s * (ANCHO_19 / 2 - ((ANCHO_19 - tam.x) / 2 - 2) / 2), y + (ALTO_U_MM - 1) / 2 - 2, zFrente + 10);
      interno.add(oreja);
    }
  }
}
