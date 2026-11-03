/**
 * Materiales de la maqueta. Las texturas son imágenes hechas con código propio
 * (`scripts/cctv/generar_texturas.py`), sin material de terceros: mosaicos sin costuras con su relieve.
 * Cada `metros` es lo que mide un mosaico en el piso.
 */
import * as THREE from "three";
import type { MaterialPiso } from "../plano";

/** Generador con semilla (Park-Miller): lo mismo cada vez. */
export function azarFijo(semilla = 7) {
  let s = semilla;
  return () => (s = (s * 16807) % 2147483647) / 2147483647;
}

/** Los moldes se clonan y sus clones comparten geometría y material: el motor no debe liberarlos. */
export function marcarCompartido<T extends THREE.Object3D>(o: T): T {
  o.traverse((n) => {
    n.userData.compartido = true;
  });
  return o;
}

const RUTA = "/cctv/texturas";
const cargador = new THREE.TextureLoader();
let pendientes = 0;
const esperando: Array<() => void> = [];

function textura(nombre: string, metros: number, color: boolean): THREE.Texture {
  pendientes += 1;
  const listo = () => {
    pendientes -= 1;
    if (pendientes === 0) esperando.splice(0).forEach((f) => f());
  };
  const t = cargador.load(`${RUTA}/${nombre}.webp`, listo, undefined, listo);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 8;
  t.repeat.set(1 / metros, 1 / metros);
  if (color) t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** Se resuelve cuando ya llegaron las texturas pedidas hasta ahora: antes el piso se vería negro. */
export function texturasListas(): Promise<void> {
  return pendientes === 0 ? Promise.resolve() : new Promise((r) => esperando.push(r));
}

type Receta = { metros: number; relieve: number; rugosidad: number; mapaRugosidad?: boolean };

const RECETAS: Readonly<Record<MaterialPiso | "banqueta", Receta>> = {
  concreto: { metros: 12, relieve: 0.5, rugosidad: 1, mapaRugosidad: true },
  madera: { metros: 2, relieve: 0.5, rugosidad: 1, mapaRugosidad: true },
  piedra: { metros: 2.4, relieve: 0.6, rugosidad: 0.27 },
  tecnico: { metros: 2.4, relieve: 0.7, rugosidad: 0.48 },
  asfalto: { metros: 6, relieve: 0.9, rugosidad: 0.94 },
  pasto: { metros: 11, relieve: 0.6, rugosidad: 1 },
  banqueta: { metros: 3, relieve: 0.7, rugosidad: 0.9 },
};

const hechos = new Map<string, THREE.Material>();

function materialDe(tipo: MaterialPiso | "banqueta"): THREE.Material {
  const previo = hechos.get(tipo);
  if (previo) return previo;
  const r = RECETAS[tipo] ?? RECETAS.concreto;
  const nombre = RECETAS[tipo] ? tipo : "concreto";
  const m = new THREE.MeshStandardMaterial({
    map: textura(nombre, r.metros, true),
    normalMap: textura(`${nombre}_n`, r.metros, false),
    normalScale: new THREE.Vector2(r.relieve, r.relieve),
    roughness: r.rugosidad,
    roughnessMap: r.mapaRugosidad ? textura(`${nombre}_r`, r.metros, false) : null,
    metalness: 0,
  });
  m.userData.compartido = true;
  hechos.set(tipo, m);
  return m;
}

export function materialPiso(tipo: MaterialPiso): THREE.Material {
  return materialDe(tipo);
}

export function materialBanqueta(): THREE.Material {
  return materialDe("banqueta");
}

/** Relieve fino de los muros, para que no se vean de plástico. Mide 1.6 m por mosaico. */
export function relieveDeMuro(): THREE.Texture {
  if (!yeso) yeso = textura("yeso_n", 1.6, false);
  return yeso;
}

let yeso: THREE.Texture | null = null;

let hoja: THREE.Material | null = null;

/** Hojas de árboles y plantas: tarjetas con transparencia recortada, que no cuestan cuadros. */
export function materialFollaje(): THREE.Material {
  if (!hoja) {
    const map = textura("follaje", 1, true);
    map.repeat.set(1, 1);
    hoja = new THREE.MeshStandardMaterial({ map, alphaTest: 0.5, side: THREE.DoubleSide, roughness: 0.82, metalness: 0 });
    hoja.userData.compartido = true;
  }
  return hoja;
}
