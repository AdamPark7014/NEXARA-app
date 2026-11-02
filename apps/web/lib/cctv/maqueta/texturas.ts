/**
 * Materiales de piso de la maqueta, con texturas hechas con código (sin imágenes de terceros).
 * Se calculan una vez por material; el ruido va con semilla para que la maqueta no cambie entre
 * una carga y otra.
 */
import * as THREE from "three";
import type { MaterialPiso } from "../plano";

/** Generador con semilla (Park-Miller): lo mismo cada vez. */
export function azarFijo(semilla = 7) {
  let s = semilla;
  return () => (s = (s * 16807) % 2147483647) / 2147483647;
}

type Azar = () => number;

/** Los moldes se clonan y sus clones comparten geometría y material: el motor no debe liberarlos. */
export function marcarCompartido<T extends THREE.Object3D>(o: T): T {
  o.traverse((n) => {
    n.userData.compartido = true;
  });
  return o;
}

function lienzo(w: number, h: number, pintar: (c: CanvasRenderingContext2D, w: number, h: number) => void): THREE.Texture | null {
  const el = document.createElement("canvas");
  el.width = w;
  el.height = h;
  const c = el.getContext("2d");
  if (!c) return null;
  pintar(c, w, h);
  const t = new THREE.CanvasTexture(el);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 12;
  return t;
}

function ruido(c: CanvasRenderingContext2D, azar: Azar, w: number, h: number, n: number, alfa: number, base = 0) {
  for (let i = 0; i < n; i++) {
    const v = base + azar() * 255;
    c.fillStyle = `rgba(${v},${v},${v},${alfa * azar()})`;
    const s = 1 + azar() * 2.4;
    c.fillRect(azar() * w, azar() * h, s, s);
  }
}

/** `metros`: lo que mide un mosaico de la textura en el piso. */
function conTextura(t: THREE.Texture | null, metros: number, datos: THREE.MeshStandardMaterialParameters, respaldo: number) {
  if (t) t.repeat.set(1 / metros, 1 / metros);
  return new THREE.MeshStandardMaterial(t ? { map: t, ...datos } : { color: respaldo, ...datos });
}

const FABRICA: Readonly<Record<MaterialPiso, () => THREE.Material>> = {
  concreto: () => {
    const azar = azarFijo(11);
    const t = lienzo(1024, 1024, (c, w, h) => {
      c.fillStyle = "#bcbfc2";
      c.fillRect(0, 0, w, h);
      for (let i = 0; i < 26; i++) {
        const g = c.createRadialGradient(azar() * w, azar() * h, 0, azar() * w, azar() * h, 240 + azar() * 300);
        const tono = azar() > 0.5 ? "255,255,255" : "120,124,128";
        g.addColorStop(0, `rgba(${tono},.05)`);
        g.addColorStop(1, `rgba(${tono},0)`);
        c.fillStyle = g;
        c.fillRect(0, 0, w, h);
      }
      ruido(c, azar, w, h, 16000, 0.05);
      c.strokeStyle = "rgba(70,74,78,.5)";
      c.lineWidth = 2.2;
      c.strokeRect(0, 0, w, h);
    });
    return conTextura(t, 6, { roughness: 0.52, metalness: 0.02 }, 0xbcbfc2);
  },
  madera: () => {
    const azar = azarFijo(13);
    const t = lienzo(1024, 1024, (c, w, h) => {
      const tablas = 10;
      for (let i = 0; i < tablas; i++) {
        const y = (i * h) / tablas;
        const desf = (i % 2) * 340;
        for (let k = -1; k < 3; k++) {
          const x = desf + k * 680;
          c.fillStyle = `hsl(${30 + azar() * 6},${26 + azar() * 7}%,${62 + azar() * 12}%)`;
          c.fillRect(x, y, 680, h / tablas);
          for (let v = 0; v < 26; v++) {
            c.strokeStyle = `rgba(90,60,30,${0.04 + azar() * 0.05})`;
            c.lineWidth = 1;
            c.beginPath();
            const yy = y + azar() * (h / tablas);
            c.moveTo(x, yy);
            c.bezierCurveTo(x + 200, yy + 3, x + 450, yy - 3, x + 680, yy + 1);
            c.stroke();
          }
          c.fillStyle = "rgba(50,34,20,.35)";
          c.fillRect(x, y, 2, h / tablas);
        }
        c.fillStyle = "rgba(50,34,20,.35)";
        c.fillRect(0, y, w, 2);
      }
    });
    return conTextura(t, 3.2, { roughness: 0.5 }, 0xb99a78);
  },
  piedra: () => {
    const azar = azarFijo(17);
    const t = lienzo(1024, 1024, (c, w, h) => {
      c.fillStyle = "#e4e3df";
      c.fillRect(0, 0, w, h);
      ruido(c, azar, w, h, 22000, 0.05, 40);
      for (let i = 0; i < 14; i++) {
        c.strokeStyle = `rgba(150,146,138,${0.1 + azar() * 0.12})`;
        c.lineWidth = 0.8 + azar();
        c.beginPath();
        let x = azar() * w;
        let y = azar() * h;
        c.moveTo(x, y);
        for (let k = 0; k < 6; k++) {
          x += (azar() - 0.5) * 180;
          y += (azar() - 0.5) * 180;
          c.lineTo(x, y);
        }
        c.stroke();
      }
      c.strokeStyle = "rgba(120,118,112,.75)";
      c.lineWidth = 3;
      c.strokeRect(0, 0, w, h);
    });
    if (t) t.repeat.set(1 / 1.2, 1 / 1.2);
    return new THREE.MeshPhysicalMaterial(t ? { map: t, roughness: 0.2, clearcoat: 0.3, clearcoatRoughness: 0.3 } : { color: 0xe4e3df, roughness: 0.2 });
  },
  tecnico: () => {
    const azar = azarFijo(19);
    const t = lienzo(512, 512, (c, w, h) => {
      c.fillStyle = "#b9bdc2";
      c.fillRect(0, 0, w, h);
      ruido(c, azar, w, h, 9000, 0.04);
      c.strokeStyle = "rgba(60,64,70,.8)";
      c.lineWidth = 3;
      c.strokeRect(0, 0, w, h);
    });
    return conTextura(t, 0.6, { roughness: 0.42, metalness: 0.15 }, 0xb9bdc2);
  },
  asfalto: () => {
    const azar = azarFijo(23);
    const t = lienzo(1024, 1024, (c, w, h) => {
      c.fillStyle = "#5c5f63";
      c.fillRect(0, 0, w, h);
      ruido(c, azar, w, h, 90000, 0.14);
      ruido(c, azar, w, h, 20000, 0.18, 180);
    });
    return conTextura(t, 5, { roughness: 0.92 }, 0x5c5f63);
  },
  pasto: () => {
    const azar = azarFijo(29);
    const t = lienzo(512, 512, (c, w, h) => {
      c.fillStyle = "#b6c0a8";
      c.fillRect(0, 0, w, h);
      for (let i = 0; i < 14000; i++) {
        c.fillStyle = `hsla(${84 + azar() * 18},${14 + azar() * 10}%,${62 + azar() * 14}%,.35)`;
        c.fillRect(azar() * w, azar() * h, 1.4, 1.8);
      }
    });
    return conTextura(t, 3, { roughness: 1 }, 0xb6c0a8);
  },
};

const hechos = new Map<MaterialPiso, THREE.Material>();

export function materialPiso(tipo: MaterialPiso): THREE.Material {
  let m = hechos.get(tipo);
  if (!m) {
    m = (FABRICA[tipo] ?? FABRICA.concreto)();
    m.userData.compartido = true;
    hechos.set(tipo, m);
  }
  return m;
}
