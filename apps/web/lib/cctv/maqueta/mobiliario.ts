/**
 * Ambientación de la maqueta: muebles, vehículos, plantas, personas y anaqueles con mercancía.
 * Todo se arma con código y con medidas reales. El origen de cada pieza es su centro en el piso y
 * su frente mira a +Z, salvo el anaquel, que se arma sobre su propio largo.
 *
 * Cada molde funde sus piezas por material: un escritorio son 5 llamadas a la GPU, no 40, y una
 * oficina llena sigue moviéndose con soltura en una laptop.
 */
import * as THREE from "three";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import type { TipoMueble } from "../plano";
import { azarFijo, marcarCompartido, materialFollaje } from "./texturas";

function caja(x: number, y: number, z: number, w: number, h: number, d: number, material: THREE.Material, radio = 0.02) {
  const m = new THREE.Mesh(new RoundedBoxGeometry(w, h, d, 2, Math.min(radio, w / 2.01, h / 2.01, d / 2.01)), material);
  m.position.set(x, y, z);
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
}

function cilindro(x: number, y: number, z: number, rArriba: number, rAbajo: number, h: number, material: THREE.Material, lados = 16) {
  const m = new THREE.Mesh(new THREE.CylinderGeometry(rArriba, rAbajo, h, lados), material);
  m.position.set(x, y, z);
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
}

const pbr = (color: number, roughness: number, metalness = 0, extra: THREE.MeshStandardMaterialParameters = {}) => new THREE.MeshStandardMaterial({ color, roughness, metalness, ...extra });

const M = {
  blanco: () => pbr(0xeeece6, 0.42),
  grafito: () => pbr(0x2b2e33, 0.46, 0.3),
  metal: () => pbr(0xa9adb2, 0.34, 0.85),
  pantalla: () => pbr(0x0b1016, 0.16, 0.2, { emissive: 0x294f6e, emissiveIntensity: 0.55 }),
  madera: () => pbr(0x9c7148, 0.42),
  maderaClara: () => pbr(0xb89268, 0.46),
  tela: () => pbr(0x3b4149, 0.92),
  sofa: () => pbr(0x56677c, 0.95),
  cojin: () => pbr(0xc9a26b, 0.96),
  barro: () => pbr(0xcfc9bd, 0.82),
  tierra: () => pbr(0x3a2d21, 1),
  alfombra: () => pbr(0x8d8f93, 1),
  papel: () => pbr(0xf4f3ee, 0.7),
};

/** Une las mallas de un grupo por material. Lo que no es Mesh se queda como está. */
function fundir(g: THREE.Group): THREE.Group {
  g.updateMatrixWorld(true);
  const porMaterial = new Map<THREE.Material, THREE.BufferGeometry[]>();
  const otros: THREE.Object3D[] = [];
  g.traverse((n) => {
    if (n === g) return;
    const m = n as THREE.Mesh;
    if (!m.isMesh || (m as unknown as THREE.InstancedMesh).isInstancedMesh) {
      if (n.parent === g) otros.push(n);
      return;
    }
    const geo = (m.geometry.index ? m.geometry.toNonIndexed() : m.geometry.clone()).applyMatrix4(m.matrixWorld);
    for (const nombre of Object.keys(geo.attributes)) {
      if (nombre !== "position" && nombre !== "normal" && nombre !== "uv") geo.deleteAttribute(nombre);
    }
    const material = m.material as THREE.Material;
    if (!porMaterial.has(material)) porMaterial.set(material, []);
    porMaterial.get(material)!.push(geo);
  });
  const salida = new THREE.Group();
  for (const [material, geos] of porMaterial) {
    const unida = mergeGeometries(geos, false);
    if (!unida) continue;
    const malla = new THREE.Mesh(unida, material);
    const conHojas = material === materialFollaje();
    malla.castShadow = true;
    malla.receiveShadow = !conHojas;
    salida.add(malla);
  }
  for (const o of otros) salida.add(o);
  return salida;
}

/* ── Oficina ───────────────────────────────────────────────────────────────── */

/** Silla de oficina: base de cinco patas con rodajas, pistón, asiento y respaldo. `atras` es hacia dónde queda el respaldo. */
function sillaOficina(g: THREE.Group, x: number, z: number, atras: 1 | -1, mats: { tela: THREE.Material; grafito: THREE.Material; metal: THREE.Material }) {
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2 + 0.3;
    const pata = caja(x + Math.cos(a) * 0.15, 0.085, z + Math.sin(a) * 0.15, 0.3, 0.026, 0.045, mats.grafito, 0.01);
    pata.rotation.y = -a;
    g.add(pata);
    const rodaja = new THREE.Mesh(new THREE.SphereGeometry(0.03, 10, 8), mats.grafito);
    rodaja.position.set(x + Math.cos(a) * 0.29, 0.03, z + Math.sin(a) * 0.29);
    rodaja.castShadow = true;
    g.add(rodaja);
  }
  g.add(cilindro(x, 0.26, z, 0.024, 0.03, 0.34, mats.metal, 12));
  g.add(caja(x, 0.47, z, 0.47, 0.075, 0.45, mats.tela, 0.035));
  const respaldo = caja(x, 0.8, z + atras * 0.235, 0.43, 0.5, 0.05, mats.tela, 0.024);
  respaldo.rotation.x = atras * -0.09;
  g.add(respaldo);
  g.add(caja(x, 0.58, z + atras * 0.22, 0.05, 0.2, 0.025, mats.grafito, 0.008));
  for (const l of [-1, 1]) {
    g.add(caja(x + l * 0.26, 0.64, z, 0.04, 0.02, 0.24, mats.grafito, 0.008));
    g.add(caja(x + l * 0.26, 0.56, z + atras * 0.05, 0.02, 0.16, 0.025, mats.grafito, 0.006));
  }
}

function monitor(g: THREE.Group, x: number, z: number, mats: { pantalla: THREE.Material; grafito: THREE.Material }, ancho = 0.61) {
  g.add(caja(x, 1.03, z, ancho, ancho * 0.58, 0.022, mats.grafito, 0.007));
  const luz = new THREE.Mesh(new THREE.PlaneGeometry(ancho - 0.018, ancho * 0.58 - 0.018), mats.pantalla);
  luz.position.set(x, 1.03, z + 0.0115);
  g.add(luz);
  g.add(caja(x, 0.84, z - 0.012, 0.045, 0.2, 0.024, mats.grafito, 0.008));
  g.add(caja(x, 0.76, z - 0.012, 0.2, 0.012, 0.14, mats.grafito, 0.005));
}

function escritorio() {
  const g = new THREE.Group();
  const blanco = M.blanco();
  const grafito = M.grafito();
  const metal = M.metal();
  const pantalla = M.pantalla();
  const tela = M.tela();
  const papel = M.papel();
  g.add(caja(0, 0.735, 0, 1.5, 0.03, 0.74, blanco, 0.006));
  // Patas en marco, travesaño y faldón: ya no parece una tabla sobre cuatro palos.
  for (const x of [-0.69, 0.69]) {
    g.add(caja(x, 0.36, 0, 0.05, 0.72, 0.05, grafito, 0.008));
    g.add(caja(x, 0.015, 0, 0.06, 0.03, 0.66, grafito, 0.008));
    g.add(caja(x, 0.705, 0, 0.05, 0.03, 0.62, grafito, 0.008));
  }
  g.add(caja(0, 0.68, -0.24, 1.36, 0.05, 0.03, grafito, 0.008));
  g.add(caja(0, 0.5, -0.33, 1.3, 0.34, 0.012, pbr(0x8e9299, 0.6), 0.003));
  monitor(g, 0, -0.2, { pantalla, grafito });
  g.add(caja(0, 0.757, 0.1, 0.36, 0.014, 0.12, grafito, 0.004));
  g.add(caja(0.27, 0.757, 0.1, 0.06, 0.02, 0.1, grafito, 0.01));
  // Lo que hay en un escritorio de verdad.
  g.add(caja(-0.48, 0.758, 0.06, 0.21, 0.016, 0.29, papel, 0.002));
  g.add(cilindro(0.56, 0.8, -0.16, 0.038, 0.033, 0.1, blanco, 14));
  sillaOficina(g, 0, 0.66, 1, { tela, grafito, metal });
  return g;
}

function mesaJuntas() {
  const g = new THREE.Group();
  const grafito = M.grafito();
  const metal = M.metal();
  const tela = M.tela();
  g.add(caja(0, 0.74, 0, 3.2, 0.05, 1.25, M.madera(), 0.016));
  for (const x of [-1.05, 1.05]) {
    g.add(caja(x, 0.36, 0, 0.1, 0.7, 0.9, grafito, 0.012));
    g.add(caja(x, 0.015, 0, 0.22, 0.03, 1.05, grafito, 0.01));
  }
  g.add(caja(0, 0.772, 0, 0.3, 0.012, 0.14, pbr(0x8f949a, 0.3, 0.8), 0.004));
  for (const x of [-1.2, -0.4, 0.4, 1.2]) {
    sillaOficina(g, x, -0.98, -1, { tela, grafito, metal });
    sillaOficina(g, x, 0.98, 1, { tela, grafito, metal });
  }
  return g;
}

function mostrador() {
  const g = new THREE.Group();
  const madera = M.maderaClara();
  const blanco = M.blanco();
  const grafito = M.grafito();
  // Frente de tablillas: la luz lo dibuja.
  g.add(caja(0, 0.56, 0.02, 3.2, 1.08, 0.62, blanco, 0.015));
  for (let i = 0; i < 33; i++) g.add(caja(-1.6 + (i + 0.5) * (3.2 / 33), 0.56, 0.345, 0.062, 1.08, 0.028, madera, 0.006));
  g.add(caja(0, 1.11, 0.03, 3.34, 0.04, 0.78, pbr(0xe7e4dd, 0.2), 0.012));
  g.add(caja(0, 0.74, -0.42, 3.1, 0.03, 0.42, blanco, 0.006));
  g.add(caja(0, 0.07, 0.02, 3.2, 0.14, 0.58, grafito, 0.008));
  monitor(g, -0.8, -0.46, { pantalla: M.pantalla(), grafito }, 0.52);
  sillaOficina(g, -0.8, -0.98, -1, { tela: M.tela(), grafito, metal: M.metal() });
  return g;
}

function sofa() {
  const g = new THREE.Group();
  const tela = M.sofa();
  const cojin = M.cojin();
  const grafito = M.grafito();
  g.add(caja(0, 0.21, 0, 2.5, 0.24, 0.88, tela, 0.06));
  for (const x of [-0.8, 0, 0.8]) {
    g.add(caja(x, 0.4, 0.05, 0.78, 0.16, 0.74, tela, 0.06));
    g.add(caja(x, 0.62, -0.31, 0.78, 0.4, 0.18, tela, 0.07));
  }
  for (const l of [-1, 1]) g.add(caja(l * 1.3, 0.38, 0, 0.18, 0.58, 0.88, tela, 0.07));
  g.add(caja(-0.85, 0.58, -0.13, 0.42, 0.34, 0.12, cojin, 0.05));
  g.add(caja(0.9, 0.58, -0.12, 0.42, 0.34, 0.12, cojin, 0.05));
  for (const [x, z] of [[-1.2, -0.36], [1.2, -0.36], [-1.2, 0.36], [1.2, 0.36]]) g.add(cilindro(x, 0.045, z, 0.02, 0.014, 0.09, grafito, 10));
  // Mesa de centro y tapete: lo que hace que parezca una sala y no un mueble suelto.
  g.add(caja(0, 0.36, 1.05, 1.1, 0.03, 0.6, M.maderaClara(), 0.01));
  for (const [x, z] of [[-0.48, 0.82], [0.48, 0.82], [-0.48, 1.28], [0.48, 1.28]]) g.add(cilindro(x, 0.175, z, 0.015, 0.015, 0.35, grafito, 10));
  const tapete = caja(0, 0.008, 0.72, 3, 0.012, 2.1, M.alfombra(), 0.004);
  tapete.castShadow = false;
  g.add(tapete);
  return g;
}

/** Manojo de hojas: tarjetas orientadas al azar dentro de un elipsoide. */
function copa(g: THREE.Group, n: number, cx: number, cy: number, cz: number, rx: number, ry: number, rz: number, tam: number, azar: () => number) {
  const material = materialFollaje();
  const o = new THREE.Object3D();
  for (let i = 0; i < n; i++) {
    // Más hojas hacia la superficie: la copa se ve llena sin rellenarla.
    const u = azar() * 2 - 1;
    const a = azar() * Math.PI * 2;
    const r = Math.cbrt(0.3 + azar() * 0.7);
    const s = Math.sqrt(1 - u * u);
    o.position.set(cx + s * Math.cos(a) * rx * r, cy + u * ry * r, cz + s * Math.sin(a) * rz * r);
    o.rotation.set(azar() * Math.PI, azar() * Math.PI, azar() * Math.PI);
    const t = tam * (0.75 + azar() * 0.5);
    const m = new THREE.Mesh(new THREE.PlaneGeometry(t, t), material);
    m.position.copy(o.position);
    m.rotation.copy(o.rotation);
    m.castShadow = true;
    g.add(m);
  }
}

function planta() {
  const g = new THREE.Group();
  const azar = azarFijo(31);
  g.add(cilindro(0, 0.2, 0, 0.19, 0.14, 0.4, M.barro(), 22));
  g.add(cilindro(0, 0.395, 0, 0.175, 0.175, 0.012, M.tierra(), 18));
  g.add(cilindro(0, 0.7, 0, 0.012, 0.018, 0.65, pbr(0x5b4a38, 0.9), 8));
  copa(g, 26, 0, 1.05, 0, 0.3, 0.42, 0.3, 0.36, azar);
  return g;
}

function arbol() {
  const g = new THREE.Group();
  const azar = azarFijo(37);
  const corteza = pbr(0x6e5a48, 0.96);
  g.add(cilindro(0, 1.05, 0, 0.09, 0.15, 2.1, corteza, 12));
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + 0.4;
    const rama = cilindro(Math.cos(a) * 0.4, 2.55, Math.sin(a) * 0.4, 0.03, 0.06, 1.2, corteza, 8);
    rama.rotation.set(Math.sin(a) * 0.72, 0, -Math.cos(a) * 0.72);
    g.add(rama);
  }
  copa(g, 110, 0, 3.6, 0, 1.75, 1.5, 1.75, 1.05, azar);
  return g;
}

/* ── Vehículos ─────────────────────────────────────────────────────────────── */

type P2 = readonly [number, number];

function extruir(puntos: readonly P2[], ancho: number, material: THREE.Material, bisel = 0.05) {
  const f = new THREE.Shape();
  puntos.forEach(([x, y], i) => (i ? f.lineTo(x, y) : f.moveTo(x, y)));
  f.closePath();
  const g = new THREE.ExtrudeGeometry(f, { depth: ancho - 2 * bisel, bevelEnabled: true, bevelSize: bisel, bevelThickness: bisel, bevelSegments: 3, curveSegments: 6 });
  g.translate(0, 0, -(ancho - 2 * bisel) / 2);
  const m = new THREE.Mesh(g, material);
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
}

/** Redondea las esquinas de un perfil con curvas de Bézier. */
function suavizar(p: readonly P2[], r = 0.1): P2[] {
  const out: P2[] = [];
  const n = p.length;
  for (let i = 0; i < n; i++) {
    const a = p[(i - 1 + n) % n];
    const b = p[i];
    const c = p[(i + 1) % n];
    const v1 = [a[0] - b[0], a[1] - b[1]];
    const v2 = [c[0] - b[0], c[1] - b[1]];
    const l1 = Math.hypot(v1[0], v1[1]);
    const l2 = Math.hypot(v2[0], v2[1]);
    const k = Math.min(r, l1 * 0.45, l2 * 0.45);
    const s = [b[0] + (v1[0] / l1) * k, b[1] + (v1[1] / l1) * k];
    const e = [b[0] + (v2[0] / l2) * k, b[1] + (v2[1] / l2) * k];
    for (let t = 0; t <= 4; t++) {
      const u = t / 4;
      out.push([(1 - u) ** 2 * s[0] + 2 * u * (1 - u) * b[0] + u * u * e[0], (1 - u) ** 2 * s[1] + 2 * u * (1 - u) * b[1] + u * u * e[1]]);
    }
  }
  return out;
}

function ruedas(g: THREE.Group, material: THREE.Material, r: number, ancho: number, ejes: readonly number[], x: number) {
  const rin = new THREE.MeshStandardMaterial({ color: 0xc4c8cc, metalness: 0.9, roughness: 0.3 });
  for (const z of ejes) {
    for (const l of [-x, x]) {
      const a = new THREE.Mesh(new THREE.CylinderGeometry(r, r, ancho, 32), material);
      a.rotation.z = Math.PI / 2;
      a.position.set(l, r, z);
      a.castShadow = true;
      g.add(a);
      const b = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.6, r * 0.6, ancho + 0.01, 24), rin);
      b.rotation.z = Math.PI / 2;
      b.position.set(l, r, z);
      g.add(b);
    }
  }
}

function camion() {
  const g = new THREE.Group();
  const blanco = new THREE.MeshPhysicalMaterial({ color: 0xf3f4f5, roughness: 0.36, clearcoat: 0.6 });
  const oscuro = new THREE.MeshStandardMaterial({ color: 0x1d2024, roughness: 0.62 });
  const vidrio = new THREE.MeshPhysicalMaterial({ color: 0x18242c, roughness: 0.05, metalness: 0.55, clearcoat: 1 });
  const verde = new THREE.MeshStandardMaterial({ color: 0x15927c, roughness: 0.5 });
  // Caja de carga con franja.
  g.add(caja(0, 2.0, -0.95, 2.5, 2.5, 5.1, blanco, 0.05));
  g.add(caja(1.255, 1.1, -0.95, 0.01, 0.16, 5.1, verde, 0.003));
  g.add(caja(-1.255, 1.1, -0.95, 0.01, 0.16, 5.1, verde, 0.003));
  // Cabina: perfil lateral extruido a lo ancho.
  const perfil = suavizar([[0, 0.72], [1.88, 0.72], [1.88, 1.42], [1.72, 1.5], [1.32, 2.42], [0.06, 2.5], [0, 2.5]], 0.12);
  const cabina = extruir(perfil, 2.36, blanco, 0.09);
  cabina.rotation.y = -Math.PI / 2;
  cabina.position.set(0, 0, 1.75);
  g.add(cabina);
  const parabrisas = new THREE.Mesh(new THREE.PlaneGeometry(2.02, 0.96), vidrio);
  parabrisas.position.set(0, 1.95, 3.22);
  parabrisas.rotation.x = -0.42;
  g.add(parabrisas);
  for (const l of [-1.19, 1.19]) {
    const lateral = new THREE.Mesh(new THREE.PlaneGeometry(1, 0.62), vidrio);
    lateral.position.set(l, 1.98, 2.5);
    lateral.rotation.y = ((l > 0 ? 1 : -1) * Math.PI) / 2;
    g.add(lateral);
  }
  g.add(caja(0, 0.6, 0, 2.2, 0.28, 7, oscuro, 0.03));
  for (const l of [-0.82, 0.82]) {
    g.add(caja(l, 1.04, 3.56, 0.36, 0.14, 0.03, new THREE.MeshStandardMaterial({ color: 0xfdfbe8, emissive: 0xf8f2c8, emissiveIntensity: 0.6 }), 0.02));
  }
  ruedas(g, oscuro, 0.46, 0.32, [-2.5, -1.45, 2.6], 1.1);
  return g;
}

function auto(color: number) {
  const g = new THREE.Group();
  const m = new THREE.MeshPhysicalMaterial({ color, roughness: 0.26, metalness: 0.55, clearcoat: 1, clearcoatRoughness: 0.08 });
  const vidrio = new THREE.MeshPhysicalMaterial({ color: 0x10181d, roughness: 0.05, metalness: 0.65, clearcoat: 1 });
  const goma = new THREE.MeshStandardMaterial({ color: 0x17191c, roughness: 0.85 });
  const cuerpo = suavizar([[-2.2, 0.32], [2.2, 0.32], [2.26, 0.62], [2.08, 0.82], [0.92, 0.94], [0.26, 1.36], [-1.04, 1.38], [-1.72, 0.98], [-2.22, 0.88]], 0.16);
  const c = extruir(cuerpo, 1.76, m, 0.09);
  c.rotation.y = -Math.PI / 2;
  g.add(c);
  const ventanas = suavizar([[0.86, 0.97], [0.24, 1.33], [-1.0, 1.35], [-1.6, 1.0]], 0.05);
  const v = extruir(ventanas, 1.78, vidrio, 0.005);
  v.rotation.y = -Math.PI / 2;
  g.add(v);
  ruedas(g, goma, 0.32, 0.22, [-1.36, 1.36], 0.82);
  return g;
}

const FABRICA: Readonly<Record<Exclude<TipoMueble, "auto">, () => THREE.Group>> = {
  escritorio,
  "mesa-juntas": mesaJuntas,
  mostrador,
  sofa,
  planta,
  arbol,
  camion,
};

const COLORES_AUTO = [0x20252c, 0xe2e5e8, 0x8a1f24, 0x5c6470] as const;

const moldes = new Map<string, THREE.Group>();

/** Lo que tiene pocas piezas o materiales propios se queda como está. */
const SIN_FUNDIR: ReadonlySet<string> = new Set(["camion"]);

/** `variante` elige el color de los autos: cada id da siempre el mismo. */
export function crearMueble(tipo: TipoMueble, variante = 0): THREE.Group {
  const clave = tipo === "auto" ? `auto-${variante % COLORES_AUTO.length}` : tipo;
  let molde = moldes.get(clave);
  if (!molde) {
    const armado = tipo === "auto" ? auto(COLORES_AUTO[variante % COLORES_AUTO.length]) : (FABRICA[tipo] ?? FABRICA.escritorio)();
    molde = marcarCompartido(tipo === "auto" || SIN_FUNDIR.has(tipo) ? armado : fundir(armado));
    moldes.set(clave, molde);
  }
  return molde.clone();
}

/* ── Personas ──────────────────────────────────────────────────────────────── */

const ROPA: ReadonlyArray<{ camisa: number; pantalon: number; piel: number; pelo: number }> = [
  { camisa: 0x2f4a6b, pantalon: 0x23262b, piel: 0xc99a78, pelo: 0x1f1712 },
  { camisa: 0xe8e6e0, pantalon: 0x3a4250, piel: 0xa97a5a, pelo: 0x2a1c14 },
  { camisa: 0x7a2f33, pantalon: 0x2c3036, piel: 0xd8ae8c, pelo: 0x4a3423 },
  { camisa: 0x3c6b5a, pantalon: 0x4a4238, piel: 0x8f6346, pelo: 0x14100c },
  { camisa: 0xcbb394, pantalon: 0x1f2e45, piel: 0xbf8f6c, pelo: 0x2b211a },
];

const moldesPersona = new Map<number, THREE.Group>();

/** Persona de pie de 1.73 m, con su ropa: da la escala del lugar. */
export function crearPersona(variante = 0): THREE.Group {
  const i = variante % ROPA.length;
  let molde = moldesPersona.get(i);
  if (!molde) {
    const r = ROPA[i];
    const g = new THREE.Group();
    const camisa = pbr(r.camisa, 0.86);
    const pantalon = pbr(r.pantalon, 0.8);
    const piel = pbr(r.piel, 0.62);
    const pelo = pbr(r.pelo, 0.72);
    const zapato = pbr(0x18191b, 0.45);
    const parte = (geo: THREE.BufferGeometry, material: THREE.Material, px: number, py: number, pz = 0, rz = 0, rx = 0) => {
      const o = new THREE.Mesh(geo, material);
      o.position.set(px, py, pz);
      o.rotation.set(rx, 0, rz);
      o.castShadow = true;
      g.add(o);
      return o;
    };
    parte(new THREE.SphereGeometry(0.096, 22, 16), piel, 0, 1.62).scale.set(0.9, 1.1, 0.98);
    parte(new THREE.SphereGeometry(0.1, 20, 14, 0, Math.PI * 2, 0, Math.PI * 0.55), pelo, 0, 1.635, -0.012).scale.set(0.92, 1.06, 1);
    parte(new THREE.CylinderGeometry(0.04, 0.046, 0.09, 12), piel, 0, 1.49);
    const perfil = ([[0.001, 1.46], [0.09, 1.45], [0.168, 1.39], [0.176, 1.28], [0.146, 1.12], [0.138, 1.0], [0.15, 0.9], [0.001, 0.88]] as const).map(([x, y]) => new THREE.Vector2(x, y)).reverse();
    const torso = new THREE.Mesh(new THREE.LatheGeometry(perfil, 24), camisa);
    torso.scale.z = 0.66;
    torso.castShadow = true;
    g.add(torso);
    parte(new THREE.CylinderGeometry(0.15, 0.135, 0.13, 20), pantalon, 0, 0.89).scale.z = 0.7;
    for (const l of [-1, 1]) {
      // Un paso apenas abierto: de pie, pero no de maniquí.
      const paso = l * 0.045;
      parte(new THREE.CylinderGeometry(0.07, 0.052, 0.45, 14), pantalon, l * 0.078, 0.62, paso, 0, l * -0.08);
      parte(new THREE.CylinderGeometry(0.05, 0.036, 0.42, 14), pantalon, l * 0.082, 0.22, paso * 2.1, 0, l * -0.08);
      parte(new THREE.CapsuleGeometry(0.038, 0.13, 5, 10), zapato, l * 0.084, 0.04, paso * 2.6 + 0.05, 0, Math.PI / 2);
      parte(new THREE.CylinderGeometry(0.044, 0.036, 0.32, 12), camisa, l * 0.205, 1.21, -paso, l * 0.09, l * 0.08);
      parte(new THREE.CylinderGeometry(0.033, 0.026, 0.3, 12), piel, l * 0.228, 0.91, -paso * 2.1, l * 0.04, l * 0.08);
    }
    molde = marcarCompartido(fundir(g));
    moldesPersona.set(i, molde);
  }
  return molde.clone();
}

/* ── Almacén ───────────────────────────────────────────────────────────────── */

/** Anaquel de carga: postes, largueros y cajas. Va a lo largo de X, con su esquina en el origen. */
export function crearAnaquel(largo: number, fondo: number, alto: number, semilla = 1): THREE.Group {
  const g = new THREE.Group();
  const azar = azarFijo(semilla * 97 + 41);
  const azul = new THREE.MeshStandardMaterial({ color: 0x2c4f8c, roughness: 0.5, metalness: 0.3 });
  const naranja = new THREE.MeshStandardMaterial({ color: 0xe0802b, roughness: 0.46, metalness: 0.2 });
  const claros = Math.max(1, Math.round(largo / 2.7));
  const paso = largo / claros;
  const niveles = Math.max(2, Math.round(alto / 0.85));
  const cubo = new THREE.BoxGeometry(1, 1, 1);
  const pos = new THREE.Object3D();
  const instancias = (material: THREE.Material, n: number) => {
    const m = new THREE.InstancedMesh(cubo, material, n);
    m.castShadow = true;
    m.receiveShadow = true;
    g.add(m);
    return m;
  };
  // Postes y largueros, como instancias: un anaquel largo no cuesta más cuadros.
  const postes = instancias(azul, (claros + 1) * 2);
  let k = 0;
  for (let i = 0; i <= claros; i++) {
    for (const dz of [0.04, fondo - 0.04]) {
      pos.position.set(i * paso, alto / 2, dz);
      pos.scale.set(0.08, alto, 0.08);
      pos.updateMatrix();
      postes.setMatrixAt(k++, pos.matrix);
    }
  }
  const largueros = instancias(naranja, niveles * 2);
  k = 0;
  const alturas = Array.from({ length: niveles }, (_, i) => 0.2 + (i * (alto - 0.4)) / Math.max(niveles - 1, 1));
  for (const y of alturas) {
    for (const dz of [0.04, fondo - 0.04]) {
      pos.position.set(largo / 2, y, dz);
      pos.scale.set(largo, 0.09, 0.05);
      pos.updateMatrix();
      largueros.setMatrixAt(k++, pos.matrix);
    }
  }
  // Cajas: una sola malla con color por instancia.
  const tonos = [0xc7a06f, 0xb98f5e, 0xd2b184, 0xbfc3c8, 0xe6e1d6, 0x8c9aa8].map((c) => new THREE.Color(c));
  const lugares: Array<[number, number, number, number, number]> = [];
  alturas.forEach((y, iy) => {
    // Sobre el último larguero se estiba lo que cabría en un nivel normal.
    const claro = iy < alturas.length - 1 ? alturas[iy + 1] - y - 0.12 : 0.6;
    if (claro < 0.2) return;
    for (let i = 0; i < claros; i++) {
      for (const off of [0.16, 0.5, 0.8]) {
        if (azar() < 0.16) continue;
        const h = Math.min(claro, 0.55 + azar() * 0.34);
        const w = Math.min(paso * 0.3, 0.72 + azar() * 0.1);
        lugares.push([i * paso + off * paso, y + 0.05 + h / 2, w, h, azar()]);
      }
    }
  });
  if (lugares.length) {
    const cajas = new THREE.InstancedMesh(cubo, new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.82 }), lugares.length);
    cajas.castShadow = true;
    cajas.receiveShadow = true;
    lugares.forEach(([x, y, w, h, tono], i) => {
      pos.position.set(x, y, fondo / 2);
      pos.scale.set(w, h, fondo * 0.78);
      pos.updateMatrix();
      cajas.setMatrixAt(i, pos.matrix);
      cajas.setColorAt(i, tonos[Math.floor(tono * tonos.length) % tonos.length]);
    });
    g.add(cajas);
  }
  return g;
}
