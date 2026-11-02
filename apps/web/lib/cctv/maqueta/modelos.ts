/**
 * Modelos 3D propios de NEXARA: cada tipo de cámara se arma con código y sus medidas salen de la
 * ficha técnica. No usa fotos ni archivos del fabricante.
 *
 * Unidades: milímetros en los parámetros; el grupo devuelto está en metros y con Y hacia arriba.
 * El frente mira a +Z y la base queda en Y = 0. Los moldes se guardan y se clonan: las cámaras
 * iguales comparten geometría y material.
 */
import * as THREE from "three";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import { marcarCompartido } from "./texturas";

export type TipoModelo = "domo" | "turret" | "bala" | "ptz";

/** Medidas de la ficha. Lo que falte usa la proporción típica del tipo. */
export type ParamsModelo = {
  color?: "blanco" | "negro" | "gris";
  /** Marca para el letrero del cuerpo. */
  marca?: string;
  diametroMm?: number;
  altoMm?: number;
  altoCarcasaMm?: number;
  radioCupulaMm?: number;
  diametroCuerpoMm?: number;
  fondoMm?: number;
  anchoMm?: number;
  largoCuerpoMm?: number;
  cajaTrasera?: boolean;
  ledsVisibles?: number;
  /** Render de estudio: vidrio con transmisión real. En la maqueta es demasiado caro por cuadro. */
  estudio?: boolean;
};

const COLORES = { blanco: 0xeceef0, negro: 0x17191c, gris: 0x8d939b } as const;
const MM = 0.001;

export function materiales(color: NonNullable<ParamsModelo["color"]> = "blanco", estudio = false) {
  const c = COLORES[color] ?? COLORES.blanco;
  return {
    cuerpo: new THREE.MeshPhysicalMaterial({ color: c, roughness: 0.42, metalness: 0, clearcoat: 0.3, clearcoatRoughness: 0.4 }),
    negro: new THREE.MeshPhysicalMaterial({ color: 0x0b0c0f, roughness: 0.32, metalness: 0.2, clearcoat: 0.4 }),
    espejo: new THREE.MeshPhysicalMaterial({ color: 0x050608, roughness: 0.06, metalness: 0.35, clearcoat: 1, clearcoatRoughness: 0.03 }),
    goma: new THREE.MeshStandardMaterial({ color: 0x1b1d20, roughness: 0.85 }),
    metalOscuro: new THREE.MeshStandardMaterial({ color: 0x3a3e45, metalness: 0.9, roughness: 0.42 }),
    aro: new THREE.MeshStandardMaterial({ color: 0x1a1c20, metalness: 0.9, roughness: 0.28 }),
    lente: new THREE.MeshPhysicalMaterial({ color: 0x0a0c18, roughness: 0.02, metalness: 0.75, clearcoat: 1, iridescence: 1, iridescenceIOR: 1.8, iridescenceThicknessRange: [180, 420] }),
    vidrio: estudio
      ? new THREE.MeshPhysicalMaterial({ color: 0xffffff, transmission: 1, roughness: 0.03, ior: 1.46, thickness: 0.002, transparent: true, opacity: 1, side: THREE.DoubleSide, envMapIntensity: 1.3 })
      : new THREE.MeshPhysicalMaterial({ color: 0xf4f8fa, transparent: true, opacity: 0.2, roughness: 0.04, clearcoat: 1, depthWrite: false, side: THREE.DoubleSide, envMapIntensity: 1.6 }),
    ledIr: new THREE.MeshPhysicalMaterial({ color: 0x3a1a1e, roughness: 0.12, clearcoat: 1, emissive: 0x2a0606, emissiveIntensity: 0.6 }),
    ledBlanco: new THREE.MeshPhysicalMaterial({ color: 0xfff7dc, roughness: 0.18, clearcoat: 1, emissive: 0xfff0c0, emissiveIntensity: 0.55 }),
    reflector: new THREE.MeshStandardMaterial({ color: 0xe6e8ea, metalness: 0.95, roughness: 0.16 }),
    metal: new THREE.MeshStandardMaterial({ color: 0xb6bbc1, metalness: 1, roughness: 0.32 }),
    ranura: new THREE.MeshStandardMaterial({ color: 0x4a4f57, metalness: 0.6, roughness: 0.4 }),
    pantalla: new THREE.MeshStandardMaterial({ color: 0x0a1520, emissive: 0x0f3a3f, emissiveIntensity: 0.65, roughness: 0.14 }),
    verde: new THREE.MeshStandardMaterial({ color: 0x35d48a, emissive: 0x35d48a, emissiveIntensity: 1.4 }),
    ambar: new THREE.MeshStandardMaterial({ color: 0xf2b23d, emissive: 0xf2b23d, emissiveIntensity: 1.1 }),
    azul: new THREE.MeshPhysicalMaterial({ color: 0x1b4fd6, transparent: true, opacity: 0.82, roughness: 0.22, clearcoat: 1, emissive: 0x0c2a90, emissiveIntensity: 0.35 }),
    rojo: new THREE.MeshPhysicalMaterial({ color: 0xc8212c, transparent: true, opacity: 0.86, roughness: 0.24, clearcoat: 1, emissive: 0x7a0d14, emissiveIntensity: 0.4 }),
  };
}

export type Mats = ReturnType<typeof materiales>;
type P2 = readonly [number, number];

/** Arco de puntos para perfiles de revolución. */
function arco(cx: number, cy: number, r: number, a0: number, a1: number, n = 8): P2[] {
  const out: P2[] = [];
  for (let i = 0; i <= n; i++) {
    const a = ((a0 + ((a1 - a0) * i) / n) * Math.PI) / 180;
    out.push([cx + r * Math.cos(a), cy + r * Math.sin(a)]);
  }
  return out;
}

export function malla(geo: THREE.BufferGeometry, material: THREE.Material) {
  const m = new THREE.Mesh(geo, material);
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
}

/** Sólido de revolución. Si el perfil baja, se invierte para que las caras miren hacia afuera. */
function torno(puntos: readonly P2[], material: THREE.Material, segmentos = 72) {
  const orden = puntos[0][1] > puntos[puntos.length - 1][1] ? [...puntos].reverse() : puntos;
  const g = new THREE.LatheGeometry(
    orden.map(([r, y]) => new THREE.Vector2(Math.max(r, 0.0001), y)),
    segmentos,
  );
  g.computeVertexNormals();
  return malla(g, material);
}

export function cilindro(r: number, h: number, material: THREE.Material, seg = 48) {
  return malla(new THREE.CylinderGeometry(r, r, h, seg), material);
}

export function caja(w: number, h: number, d: number, material: THREE.Material, radio = 1.2) {
  return malla(new RoundedBoxGeometry(w, h, d, 4, Math.min(radio, w / 2.01, h / 2.01, d / 2.01)), material);
}

/** Letrero sobre un costado curvo (la marca). Sin lienzo 2D (pruebas) no se pone. */
function letreroCurvo(texto: string, radio: number, altoMm: number, y: number, anguloDeg: number, color: string, escalaAncho = 1) {
  const lienzo = document.createElement("canvas");
  lienzo.width = 512;
  lienzo.height = 96;
  const c = lienzo.getContext("2d");
  if (!c) return null;
  c.fillStyle = color;
  c.font = "italic 700 62px Arial, Helvetica, sans-serif";
  c.textAlign = "center";
  c.textBaseline = "middle";
  c.fillText(texto, 256, 50);
  const t = new THREE.CanvasTexture(lienzo);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  const anchoMm = (altoMm * 512 * escalaAncho) / 96;
  const theta = anchoMm / radio;
  const g = new THREE.CylinderGeometry(radio + 0.15, radio + 0.15, altoMm, 40, 1, true, -theta / 2, theta);
  const m = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ map: t, transparent: true, depthWrite: false, side: THREE.DoubleSide }));
  m.position.y = y;
  m.rotation.y = (anguloDeg * Math.PI) / 180;
  return m;
}

export function lenteConAro(rLente: number, largo: number, mats: Mats) {
  const g = new THREE.Group();
  const aro = cilindro(rLente * 1.32, largo, mats.aro);
  aro.rotation.x = Math.PI / 2;
  aro.position.z = largo / 2;
  g.add(aro);
  const anillo = malla(new THREE.TorusGeometry(rLente * 1.08, rLente * 0.14, 16, 48), mats.metalOscuro);
  anillo.position.z = largo + 0.1;
  g.add(anillo);
  const vidrio = malla(new THREE.SphereGeometry(rLente, 40, 24, 0, Math.PI * 2, 0, Math.PI / 2.6), mats.lente);
  vidrio.rotation.x = Math.PI / 2;
  vidrio.position.z = largo - rLente * 0.56;
  g.add(vidrio);
  return g;
}

/** Rectángulo de esquinas redondas doblado sobre una esfera de radio `R`, con centro en (cx, cy) del frente (+Z). */
function parcheEsferico(R: number, ancho: number, alto: number, radio: number, cx: number, cy: number, material: THREE.Material) {
  const s = new THREE.Shape();
  const w = ancho / 2;
  const h = alto / 2;
  const r = Math.min(radio, w, h);
  s.moveTo(-w + r, -h);
  s.lineTo(w - r, -h);
  s.absarc(w - r, -h + r, r, -Math.PI / 2, 0, false);
  s.lineTo(w, h - r);
  s.absarc(w - r, h - r, r, 0, Math.PI / 2, false);
  s.lineTo(-w + r, h);
  s.absarc(-w + r, h - r, r, Math.PI / 2, Math.PI, false);
  s.lineTo(-w, -h + r);
  s.absarc(-w + r, -h + r, r, Math.PI, Math.PI * 1.5, false);
  // Se subdivide en plano y cada vértice se proyecta a la esfera, para que siga la curva.
  let pos = Array.from(new THREE.ShapeGeometry(s, 24).toNonIndexed().getAttribute("position").array as ArrayLike<number>);
  for (let v = 0; v < 3; v++) {
    const nueva: number[] = [];
    for (let i = 0; i < pos.length; i += 9) {
      const a = [pos[i], pos[i + 1], pos[i + 2]];
      const b = [pos[i + 3], pos[i + 4], pos[i + 5]];
      const c = [pos[i + 6], pos[i + 7], pos[i + 8]];
      const m = (p: number[], q: number[]) => [(p[0] + q[0]) / 2, (p[1] + q[1]) / 2, (p[2] + q[2]) / 2];
      const ab = m(a, b);
      const bc = m(b, c);
      const ca = m(c, a);
      nueva.push(...a, ...ab, ...ca, ...ab, ...b, ...bc, ...ca, ...bc, ...c, ...ab, ...bc, ...ca);
    }
    pos = nueva;
  }
  const arr = new Float32Array(pos.length);
  const norm = new Float32Array(pos.length);
  for (let i = 0; i < pos.length; i += 3) {
    const x = pos[i] + cx;
    const y = pos[i + 1] + cy;
    const z = Math.sqrt(Math.max(R * R - x * x - y * y, 0));
    arr[i] = x;
    arr[i + 1] = y;
    arr[i + 2] = z;
    norm[i] = x / R;
    norm[i + 1] = y / R;
    norm[i + 2] = z / R;
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.BufferAttribute(arr, 3));
  g.setAttribute("normal", new THREE.BufferAttribute(norm, 3));
  return malla(g, material);
}

function tornillos(radio: number, y: number, n: number, mats: Mats, rTornillo = 1.6) {
  const g = new THREE.Group();
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + 0.5;
    const t = cilindro(rTornillo, 1, mats.negro, 16);
    t.rotation.z = Math.PI / 2;
    t.position.set(Math.cos(a) * radio, y, Math.sin(a) * radio);
    t.rotation.y = -a;
    g.add(t);
  }
  return g;
}

/** Marca el nodo que gira con la inclinación de la cámara (`inclinarModelo`). */
function ojo<T extends THREE.Object3D>(nodo: T, maximoDeg = 75): T {
  nodo.userData.ojoMaxDeg = maximoDeg;
  return nodo;
}

/** Domo: base opaca arriba, cúpula transparente abajo y el «ojo» adentro. */
function domo(p: ParamsModelo, mats: Mats) {
  const d = p.diametroMm ?? 121.4;
  const h = p.altoMm ?? 97.7;
  const hc = p.altoCarcasaMm ?? h * 0.51;
  const R = p.radioCupulaMm ?? Math.min(d * 0.35, (h - hc) * 0.9);
  const g = new THREE.Group();
  const yBase = h - hc;
  const r = d / 2;
  g.add(
    torno(
      [
        [0, h],
        [r - 7, h],
        ...arco(r - 7, h - 7, 7, 90, 0, 8),
        [r, yBase + hc * 0.62],
        [r - 0.9, yBase + hc * 0.6],
        [r - 0.9, yBase + hc * 0.565],
        [r, yBase + hc * 0.545],
        [r, yBase + hc * 0.3],
        ...arco(r - 9, yBase + 9, 9, 0, -68, 8),
        [R + 7, yBase],
      ],
      mats.cuerpo,
    ),
  );
  // Banda oscura donde asienta la cúpula.
  g.add(
    torno(
      [
        [R + 7.2, yBase + 0.6],
        [R + 6.4, yBase - 1],
        [R + 2.8, yBase - 3],
        [R + 1.2, yBase - 7.5],
        [R - 1, yBase - 7.5],
      ],
      mats.negro,
    ),
  );
  // Ojo: esfera oscura con lente y luces.
  const interior = new THREE.Group();
  interior.position.set(0, R, 0);
  interior.add(malla(new THREE.SphereGeometry(R * 0.82, 40, 28), mats.negro));
  const frente = ojo(new THREE.Group());
  frente.rotation.x = THREE.MathUtils.degToRad(40);
  const reflector = malla(new THREE.TorusGeometry(R * 0.42, R * 0.1, 14, 56, Math.PI * 1.05), mats.reflector);
  reflector.position.z = R * 0.62;
  reflector.rotation.z = Math.PI * 0.975;
  reflector.scale.z = 0.6;
  frente.add(reflector);
  const lente = lenteConAro(R * 0.19, R * 0.2, mats);
  lente.position.z = R * 0.62;
  frente.add(lente);
  const nLeds = p.ledsVisibles ?? 6;
  for (let i = 0; i < nLeds; i++) {
    const a = THREE.MathUtils.degToRad(-168 + (i / Math.max(nLeds - 1, 1)) * 156);
    const led = malla(new THREE.SphereGeometry(R * 0.07, 14, 10), i % 2 ? mats.ledBlanco : mats.reflector);
    led.position.set(Math.cos(a) * R * 0.42, Math.sin(a) * R * 0.42, R * 0.68);
    led.scale.z = 0.5;
    frente.add(led);
  }
  interior.add(frente);
  g.add(interior);
  const cupula = torno([...arco(0, R, R, -90, 0, 24), [R, yBase - 5]], mats.vidrio);
  cupula.castShadow = false;
  g.add(cupula);
  g.add(tornillos(r - 2.5, yBase + hc * 0.52, 3, mats, 1.3));
  if (p.marca) {
    const l = letreroCurvo(p.marca, r, 10.5, yBase + hc * 0.42, 0, p.color === "negro" ? "#e8eaed" : "#5a5f66");
    if (l) g.add(l);
  }
  return g;
}

/** Turret: tapa arriba y bola sin cúpula, con frente negro brillante. */
function turret(p: ParamsModelo, mats: Mats) {
  const d = p.diametroMm ?? 138.3;
  const h = p.altoMm ?? 125.2;
  const r = d / 2;
  const R = Math.min(r * 0.9, h * 0.5);
  const yLabio = h - 31;
  const rLabio = Math.sqrt(Math.max(R * R - (yLabio - R) ** 2, 0)) + 1.2;
  const g = new THREE.Group();
  g.add(
    torno(
      [
        [0, h],
        [r - 16, h],
        ...arco(r - 16, h - 12, 12, 88, 14, 10),
        [r - 3, h - 13.5],
        [r, h - 15.5],
        ...arco(r - 6, h - 20, 6, 36, -60, 8),
        [r - 11, h - 26],
        [rLabio + 2, yLabio + 0.5],
        [rLabio, yLabio],
        [rLabio - 3, yLabio + 8],
        [0, yLabio + 8],
      ],
      mats.cuerpo,
    ),
  );
  const bola = new THREE.Group();
  bola.position.set(0, R, 0);
  bola.add(malla(new THREE.SphereGeometry(R, 56, 40), mats.cuerpo));
  const giro = ojo(new THREE.Group(), 60);
  giro.rotation.x = THREE.MathUtils.degToRad(28);
  giro.add(parcheEsferico(R + 0.3, R * 1.3, R * 1.3, R * 0.6, 0, -R * 0.02, mats.espejo));
  giro.add(parcheEsferico(R + 0.6, R * 0.74, R * 0.68, R * 0.14, 0, R * 0.16, mats.aro));
  const lente = lenteConAro(R * 0.2, R * 0.09, mats);
  lente.position.set(0, R * 0.16, R * 0.92);
  lente.rotation.x = -0.16;
  giro.add(lente);
  giro.add(parcheEsferico(R + 0.7, R * 0.5, R * 0.2, R * 0.095, 0, -R * 0.4, mats.reflector));
  for (const x of [-0.11, 0.11]) {
    const led = malla(new THREE.SphereGeometry(R * 0.062, 18, 14), mats.ledBlanco);
    const y = -0.4;
    led.position.set(x * R, y * R, Math.sqrt(1 - x * x - y * y) * R + R * 0.012);
    giro.add(led);
  }
  bola.add(giro);
  if (p.marca) {
    const l = letreroCurvo(p.marca, R, 9, R * 0.98, 68, p.color === "negro" ? "#e8eaed" : "#5a5f66");
    if (l) g.add(l);
  }
  g.add(bola);
  return g;
}

/** Bala: cuerpo cilíndrico con visera, brazo y, si la ficha lo dice, caja trasera con bocina. */
function bala(p: ParamsModelo, mats: Mats) {
  const dBody = p.diametroCuerpoMm ?? 80.8;
  const totalL = p.fondoMm ?? 253;
  const anchoCaja = p.anchoMm ?? 144.6;
  const altoCaja = p.altoMm ?? 197;
  const conCaja = p.cajaTrasera ?? false;
  const fondoCaja = conCaja ? 56 : 12;
  const largoCuerpo = p.largoCuerpoMm ?? totalL * (conCaja ? 0.62 : 0.72);
  const g = new THREE.Group();
  const r = dBody / 2;
  const cuerpo = ojo(new THREE.Group(), 35);
  const carcasa = torno(
    [
      [0, 0],
      [r - 6, 0],
      ...arco(r - 6, 6, 6, -90, 0, 6),
      [r, largoCuerpo - 4],
      ...arco(r - 2, largoCuerpo - 2, 2, 0, 90, 4),
      [r - 8, largoCuerpo],
      [r - 8, largoCuerpo - 6],
      [0, largoCuerpo - 6],
    ],
    mats.cuerpo,
  );
  carcasa.rotation.x = Math.PI / 2;
  cuerpo.add(carcasa);
  // Visera superior.
  const materialVisera = mats.cuerpo.clone();
  materialVisera.side = THREE.DoubleSide;
  const visera = malla(new THREE.CylinderGeometry(r + 2.2, r + 2.2, largoCuerpo * 0.62, 56, 1, true, -1.2, 2.4), materialVisera);
  visera.rotation.x = Math.PI / 2;
  visera.position.z = largoCuerpo * 0.72;
  cuerpo.add(visera);
  const frente = malla(new THREE.CircleGeometry(r - 3, 64), mats.espejo);
  frente.position.z = largoCuerpo - 4.8;
  cuerpo.add(frente);
  const lente = lenteConAro(r * 0.3, r * 0.16, mats);
  lente.position.set(0, r * 0.26, largoCuerpo - 4.6);
  cuerpo.add(lente);
  const luz = caja(r * 1.05, r * 0.32, 1.2, mats.reflector, 1.5);
  luz.position.set(0, -r * 0.42, largoCuerpo - 4.2);
  cuerpo.add(luz);
  for (const x of [-0.26, 0.26]) {
    const led = malla(new THREE.SphereGeometry(r * 0.1, 18, 14), mats.ledBlanco);
    led.position.set(x * r, -r * 0.42, largoCuerpo - 3.4);
    cuerpo.add(led);
  }
  // Brazo que baja a la caja.
  const brazoLargo = totalL - largoCuerpo - fondoCaja;
  const junta = malla(new THREE.SphereGeometry(r * 0.42, 28, 20), mats.cuerpo);
  junta.position.set(0, 0, -brazoLargo * 0.55);
  cuerpo.add(junta);
  const brazo = cilindro(r * 0.3, brazoLargo, mats.cuerpo, 28);
  brazo.rotation.x = Math.PI / 2;
  brazo.position.set(0, 0, -brazoLargo * 0.5);
  cuerpo.add(brazo);
  cuerpo.position.set(0, conCaja ? altoCaja * 0.66 : altoCaja * 0.5, fondoCaja + brazoLargo);
  g.add(cuerpo);
  if (conCaja) {
    // Caja trasera ovalada con rejilla de bocina y perilla.
    const ovalo = new THREE.Shape();
    const w = anchoCaja / 2 - 3;
    const hh = altoCaja / 2 - anchoCaja / 2;
    ovalo.moveTo(-w, -hh);
    ovalo.lineTo(-w, hh);
    ovalo.absarc(0, hh, w, Math.PI, 0, true);
    ovalo.lineTo(w, -hh);
    ovalo.absarc(0, -hh, w, 0, Math.PI, true);
    const cajaT = malla(new THREE.ExtrudeGeometry(ovalo, { depth: fondoCaja - 6, bevelEnabled: true, bevelSize: 3, bevelThickness: 3, bevelSegments: 4, curveSegments: 48 }), mats.cuerpo);
    cajaT.position.set(0, altoCaja / 2, 3);
    g.add(cajaT);
    const rejilla = new THREE.InstancedMesh(new THREE.CylinderGeometry(1.1, 1.1, 1, 8), mats.negro, 160);
    const dummy = new THREE.Object3D();
    let k = 0;
    for (let i = 0; i < 16 && k < 160; i++) {
      for (let j = 0; j < 10 && k < 160; j++) {
        dummy.position.set(-27 + j * 6 + (i % 2) * 3, altoCaja * 0.2 + i * 3.6 - 22, fondoCaja + 0.2);
        dummy.rotation.x = Math.PI / 2;
        dummy.updateMatrix();
        rejilla.setMatrixAt(k++, dummy.matrix);
      }
    }
    g.add(rejilla);
    const asiento = cilindro(anchoCaja * 0.17, 12, mats.cuerpo, 32);
    asiento.rotation.x = Math.PI / 2;
    asiento.position.set(0, altoCaja * 0.66, fondoCaja + 6);
    g.add(asiento);
  } else {
    const placa = cilindro(anchoCaja * 0.38, 12, mats.cuerpo);
    placa.rotation.x = Math.PI / 2;
    placa.position.set(0, altoCaja * 0.5, 6);
    g.add(placa);
  }
  return g;
}

/** PTZ: cabeza con tapa alta, banda negra y domo grande con la cámara motorizada adentro. */
function ptz(p: ParamsModelo, mats: Mats) {
  const d = p.diametroMm ?? 169;
  const h = p.altoMm ?? 161;
  const r = d / 2;
  const R = r * 0.84;
  const g = new THREE.Group();
  const yDomo = R;
  const yBanda = yDomo + 8;
  const yTapa = yBanda + 14;
  g.add(
    torno(
      [
        [0, h],
        [r - 12, h],
        ...arco(r - 12, h - 12, 12, 90, 0, 10),
        [r, yTapa + 4],
        ...arco(r - 4, yTapa + 4, 4, 0, -90, 5),
        [r * 0.5, yTapa],
        [0, yTapa],
      ],
      mats.cuerpo,
    ),
  );
  g.add(
    torno(
      [
        [r - 4.5, yTapa + 0.2],
        [r - 8, yBanda + 6],
        [R + 3, yBanda],
        [R + 1.5, yDomo],
        [R - 2, yDomo],
      ],
      mats.negro,
    ),
  );
  g.add(tornillos(r - 7.5, yBanda + 8.5, 4, mats, 1.8));
  const interior = new THREE.Group();
  interior.position.set(0, yDomo, 0);
  interior.add(malla(new THREE.SphereGeometry(R * 0.76, 40, 28), mats.negro));
  const giro = ojo(new THREE.Group(), 80);
  giro.rotation.x = THREE.MathUtils.degToRad(12);
  const lente = lenteConAro(R * 0.26, R * 0.12, mats);
  lente.position.z = R * 0.68;
  giro.add(lente);
  // Alas laterales con luces.
  for (const lado of [-1, 1]) {
    const ala = caja(R * 0.32, R * 0.72, R * 0.16, mats.metalOscuro, 2);
    ala.position.set(lado * R * 0.42, -R * 0.02, R * 0.62);
    ala.rotation.y = lado * 0.32;
    giro.add(ala);
    for (let i = 0; i < 3; i++) {
      const led = malla(new THREE.CapsuleGeometry(R * 0.022, R * 0.14, 5, 10), i === 1 ? mats.ledBlanco : mats.ledIr);
      led.position.set(lado * R * (0.34 + i * 0.075), -R * 0.04, R * 0.72 - i * R * 0.018);
      giro.add(led);
    }
  }
  for (let i = -2; i <= 2; i++) {
    const rejilla = caja(R * 0.05, R * 0.15, R * 0.06, mats.reflector, 1);
    rejilla.position.set(i * R * 0.09, -R * 0.44, R * 0.58);
    giro.add(rejilla);
  }
  interior.add(giro);
  g.add(interior);
  const cupula = torno([...arco(0, yDomo, R, -90, 0, 24), [R, yBanda - 1]], mats.vidrio);
  cupula.castShadow = false;
  g.add(cupula);
  if (p.marca) {
    const l = letreroCurvo(p.marca, r, 10.5, h - 34, 0, p.color === "negro" ? "#e8eaed" : "#5a5f66");
    if (l) g.add(l);
  }
  return g;
}

const FABRICA: Readonly<Record<TipoModelo, (p: ParamsModelo, m: Mats) => THREE.Group>> = { domo, turret, bala, ptz };

const moldes = new Map<string, THREE.Group>();

/** Arma una cámara. `p` son las medidas de la ficha. */
export function crearModelo(tipo: TipoModelo, p: ParamsModelo = {}): THREE.Group {
  const clave = JSON.stringify([tipo, p]);
  let molde = moldes.get(clave);
  if (!molde) {
    const interno = FABRICA[tipo](p, materiales(p.color ?? "blanco", p.estudio));
    interno.scale.setScalar(MM);
    molde = new THREE.Group();
    molde.add(interno);
    molde.userData.tipo = tipo;
    marcarCompartido(molde);
    moldes.set(clave, molde);
  }
  return molde.clone();
}

/** Pone el ojo de la cámara a la inclinación del plano (grados hacia abajo). */
export function inclinarModelo(modelo: THREE.Object3D, inclinacionDeg: number) {
  modelo.traverse((n) => {
    const maximo = n.userData.ojoMaxDeg as number | undefined;
    if (maximo != null) n.rotation.x = THREE.MathUtils.degToRad(Math.min(Math.max(inclinacionDeg, -10), maximo));
  });
}

/** Poste con brazo para PTZ o cámaras de patio. La punta del brazo está en (0, altura, largoBrazo). */
export function poste(alturaM: number, brazoM = 0.8, color = 0x6c737c) {
  const mat = new THREE.MeshStandardMaterial({ color, metalness: 0.75, roughness: 0.38 });
  const g = new THREE.Group();
  const fuste = malla(new THREE.CylinderGeometry(0.045, 0.075, alturaM, 24), mat);
  fuste.position.y = alturaM / 2;
  g.add(fuste);
  const base = malla(new THREE.CylinderGeometry(0.16, 0.2, 0.18, 24), new THREE.MeshStandardMaterial({ color: 0xbfc3c8, roughness: 0.9 }));
  base.position.y = 0.09;
  g.add(base);
  const brazo = malla(new THREE.CylinderGeometry(0.03, 0.03, brazoM, 16), mat);
  brazo.rotation.x = Math.PI / 2;
  brazo.position.set(0, alturaM - 0.04, brazoM / 2);
  g.add(brazo);
  return g;
}
