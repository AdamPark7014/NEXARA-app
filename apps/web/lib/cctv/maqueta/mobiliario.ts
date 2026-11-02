/**
 * Ambientación de la maqueta: muebles, vehículos, plantas, personas y anaqueles con mercancía.
 * Todo se arma con código y con medidas reales. El origen de cada pieza es su centro en el piso y
 * su frente mira a +Z, salvo el anaquel, que se arma sobre su propio largo.
 */
import * as THREE from "three";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import type { TipoMueble } from "../plano";
import { azarFijo, marcarCompartido } from "./texturas";

function caja(x: number, y: number, z: number, w: number, h: number, d: number, material: THREE.Material, radio = 0.02) {
  const m = new THREE.Mesh(new RoundedBoxGeometry(w, h, d, 2, Math.min(radio, w / 2.01, h / 2.01, d / 2.01)), material);
  m.position.set(x, y, z);
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
}

const M = {
  blanco: () => new THREE.MeshStandardMaterial({ color: 0xf4f4f2, roughness: 0.55 }),
  oscuro: () => new THREE.MeshStandardMaterial({ color: 0x2c3036, roughness: 0.5 }),
  pantalla: () => new THREE.MeshStandardMaterial({ color: 0x0c1218, emissive: 0x123a44, emissiveIntensity: 0.5, roughness: 0.2 }),
  madera: () => new THREE.MeshStandardMaterial({ color: 0xa97e52, roughness: 0.46 }),
  silla: () => new THREE.MeshStandardMaterial({ color: 0x3f4650, roughness: 0.72 }),
  verde: () => new THREE.MeshStandardMaterial({ color: 0x5f8f62, roughness: 0.9 }),
  barro: () => new THREE.MeshStandardMaterial({ color: 0xd8d5ce, roughness: 0.85 }),
  sofa: () => new THREE.MeshStandardMaterial({ color: 0x51637a, roughness: 0.85 }),
};

function silla(g: THREE.Group, x: number, z: number, atras: 1 | -1, mats: { silla: THREE.Material; oscuro: THREE.Material }) {
  g.add(caja(x, 0.46, z, 0.46, 0.07, 0.44, mats.silla, 0.03));
  g.add(caja(x, 0.72, z + atras * 0.22, 0.44, 0.48, 0.06, mats.silla, 0.03));
  g.add(caja(x, 0.24, z, 0.05, 0.4, 0.05, mats.oscuro, 0.01));
}

function escritorio() {
  const g = new THREE.Group();
  const blanco = M.blanco();
  const oscuro = M.oscuro();
  g.add(caja(0, 0.73, 0, 1.5, 0.035, 0.72, blanco, 0.01));
  for (const [px, pz] of [[-0.68, -0.3], [0.68, -0.3], [-0.68, 0.3], [0.68, 0.3]]) g.add(caja(px, 0.36, pz, 0.04, 0.72, 0.04, oscuro, 0.01));
  g.add(caja(0, 1.0, -0.2, 0.58, 0.33, 0.024, M.pantalla(), 0.01));
  g.add(caja(0, 0.82, -0.2, 0.05, 0.16, 0.04, oscuro, 0.01));
  g.add(caja(0, 0.76, 0.06, 0.34, 0.012, 0.12, oscuro, 0.004));
  silla(g, 0, 0.62, 1, { silla: M.silla(), oscuro });
  return g;
}

function mesaJuntas() {
  const g = new THREE.Group();
  const oscuro = M.oscuro();
  const asiento = M.silla();
  g.add(caja(0, 0.74, 0, 3.2, 0.05, 1.25, M.madera(), 0.02));
  for (const x of [-1.15, 1.15]) g.add(caja(x, 0.37, 0, 0.08, 0.72, 0.8, oscuro, 0.01));
  for (const x of [-1.4, -0.5, 0.5, 1.4]) {
    silla(g, x, -1.05, -1, { silla: asiento, oscuro });
    silla(g, x, 1.05, 1, { silla: asiento, oscuro });
  }
  return g;
}

function mostrador() {
  const g = new THREE.Group();
  g.add(caja(0, 0.55, 0, 3.2, 1.1, 0.7, M.blanco(), 0.04));
  g.add(caja(0, 1.12, 0, 3.32, 0.04, 0.82, M.madera(), 0.015));
  g.add(caja(-0.8, 1.05, -0.28, 0.5, 0.3, 0.024, M.pantalla(), 0.01));
  return g;
}

function sofa() {
  const g = new THREE.Group();
  const tela = M.sofa();
  g.add(caja(0, 0.3, 0, 2.5, 0.44, 0.85, tela, 0.1));
  g.add(caja(0, 0.62, -0.38, 2.5, 0.42, 0.2, tela, 0.08));
  g.add(caja(0, 0.24, 1.0, 1, 0.04, 0.6, M.madera(), 0.01));
  return g;
}

function planta() {
  const g = new THREE.Group();
  const azar = azarFijo(31);
  const verde = M.verde();
  const r = 0.34;
  const h = 1.1;
  g.add(caja(0, 0.2, 0, 0.34, 0.4, 0.34, M.barro(), 0.05));
  for (let i = 0; i < 9; i++) {
    const b = new THREE.Mesh(new THREE.SphereGeometry(r * (0.55 + azar() * 0.4), 14, 10), verde);
    const a = (i / 9) * Math.PI * 2;
    b.position.set(Math.cos(a) * r * 0.45, 0.4 + h * (0.35 + azar() * 0.5), Math.sin(a) * r * 0.45);
    b.castShadow = true;
    g.add(b);
  }
  return g;
}

function arbol() {
  const g = new THREE.Group();
  const h = 3.8;
  const t = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.075, h * 0.6, 12), new THREE.MeshStandardMaterial({ color: 0x8b7f72, roughness: 0.95 }));
  t.position.y = h * 0.3;
  t.castShadow = true;
  g.add(t);
  const r = 1.05;
  const b = new THREE.Mesh(new THREE.IcosahedronGeometry(r, 3), new THREE.MeshStandardMaterial({ color: 0x9db090, roughness: 0.95 }));
  b.position.y = h * 0.62 + r * 0.72;
  b.scale.y = 1.12;
  b.castShadow = true;
  g.add(b);
  return g;
}

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

/** `variante` elige el color de los autos: cada id da siempre el mismo. */
export function crearMueble(tipo: TipoMueble, variante = 0): THREE.Group {
  const clave = tipo === "auto" ? `auto-${variante % COLORES_AUTO.length}` : tipo;
  let molde = moldes.get(clave);
  if (!molde) {
    molde = marcarCompartido(tipo === "auto" ? auto(COLORES_AUTO[variante % COLORES_AUTO.length]) : (FABRICA[tipo] ?? FABRICA.escritorio)());
    moldes.set(clave, molde);
  }
  return molde.clone();
}

let moldePersona: THREE.Group | null = null;

/** Persona de pie de 1.73 m, sin rasgos, como en una maqueta de arquitecto. */
export function crearPersona(): THREE.Group {
  if (!moldePersona) {
    const g = new THREE.Group();
    const m = new THREE.MeshStandardMaterial({ color: 0x8d97a5, roughness: 0.58 });
    const parte = (geo: THREE.BufferGeometry, px: number, py: number, pz = 0, rz = 0) => {
      const o = new THREE.Mesh(geo, m);
      o.position.set(px, py, pz);
      o.rotation.z = rz;
      o.castShadow = true;
      g.add(o);
      return o;
    };
    parte(new THREE.SphereGeometry(0.098, 24, 18), 0, 1.63).scale.set(0.9, 1.12, 0.98);
    parte(new THREE.CylinderGeometry(0.036, 0.042, 0.09, 12), 0, 1.5);
    const perfil = ([[0.001, 1.46], [0.1, 1.45], [0.172, 1.39], [0.178, 1.28], [0.142, 1.12], [0.134, 1.02], [0.158, 0.92], [0.15, 0.84], [0.001, 0.82]] as const)
      .map(([r, y]) => new THREE.Vector2(r, y))
      .reverse();
    const torso = new THREE.Mesh(new THREE.LatheGeometry(perfil, 28), m);
    torso.scale.z = 0.68;
    torso.castShadow = true;
    g.add(torso);
    for (const l of [-1, 1]) {
      parte(new THREE.CylinderGeometry(0.066, 0.05, 0.43, 14), l * 0.078, 0.63);
      parte(new THREE.CylinderGeometry(0.049, 0.036, 0.42, 14), l * 0.082, 0.22);
      parte(new THREE.CapsuleGeometry(0.036, 0.1, 5, 10), l * 0.084, 0.04, 0.05).rotation.x = Math.PI / 2;
      parte(new THREE.CylinderGeometry(0.042, 0.033, 0.32, 12), l * 0.2, 1.21, 0, l * 0.09);
      parte(new THREE.CylinderGeometry(0.032, 0.025, 0.3, 12), l * 0.218, 0.91, 0, l * 0.03);
    }
    moldePersona = marcarCompartido(g);
  }
  return moldePersona.clone();
}

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
