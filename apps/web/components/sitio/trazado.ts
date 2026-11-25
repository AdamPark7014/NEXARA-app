import { azar } from "./azar";

/** Radio de la almohadilla (anillo) donde termina una pista. */
export const RADIO_ANILLO = 3.2;

export type Trazado = {
  ancho: number;
  alto: number;
  /** Todas las pistas en un solo trazo. */
  pistas: string;
  /** Todas las almohadillas en un solo trazo. */
  anillos: string;
  /** Tramos encendidos: el final de algunas pistas, con el color de una señal (índice 0–4). */
  senales: { d: string; anillo: string; color: number }[];
};

const n1 = (v: number) => String(Math.round(v * 10) / 10);
const anillo = (x: number, y: number) =>
  `M${n1(x - RADIO_ANILLO)} ${n1(y)}a${RADIO_ANILLO} ${RADIO_ANILLO} 0 1 0 ${RADIO_ANILLO * 2} 0a${RADIO_ANILLO} ${RADIO_ANILLO} 0 1 0 ${-RADIO_ANILLO * 2} 0`;

/**
 * Pistas de circuito que entran por el costado izquierdo y se detienen antes de llegar al otro lado. Es la misma
 * gramática del escenario de la portada (`circuitos-motor.ts`): una rejilla, dobleces de 45° y almohadillas en anillo,
 * sin cruces. Va sembrada: el servidor y el navegador pintan exactamente lo mismo.
 *
 * `cols` × `filas` celdas de `g` px. Las pistas del centro llegan más lejos que las de arriba y abajo, así que el
 * conjunto apunta hacia el contenido.
 */
export function trazar(semilla: number, cols: number, filas: number, g = 12): Trazado {
  const r = azar(semilla);
  const ocupada = new Uint8Array(cols * filas);
  const diagonal = new Uint8Array(cols * filas);
  const libre = (i: number, j: number) => i >= 0 && j >= 0 && i < cols && j < filas && !ocupada[j * cols + i];

  const orden: number[] = [];
  for (let j = 1; j < filas - 1; j++) orden.push(j);
  for (let k = orden.length - 1; k > 0; k--) {
    const q = Math.floor(r() * (k + 1));
    [orden[k], orden[q]] = [orden[q], orden[k]];
  }

  let pistas = "";
  let anillos = "";
  const senales: Trazado["senales"] = [];
  let color = Math.floor(r() * 5);

  for (const j0 of orden) {
    if (r() < 0.34 || !libre(0, j0)) continue;
    // Qué tan lejos llega: más en el centro, menos en las orillas.
    const perfil = 0.38 + 0.62 * Math.sin((Math.PI * j0) / (filas - 1));
    const alcance = Math.max(5, Math.round(cols * perfil * (0.42 + 0.58 * r())));
    let i = 0;
    let j = j0;
    let dy = 0;
    let recto = 2 + Math.floor(r() * 5);
    let sesgo = r() < 0.5 ? 1 : -1;
    const celdas: number[] = [i, j];
    ocupada[j * cols + i] = 1;
    while (i < alcance) {
      const candidatos: number[] = [];
      if (dy === 0) {
        // En horizontal: sigue recto mientras le toque; después dobla 45° hacia su lado (o hacia el otro).
        if (recto > 0) candidatos.push(0, sesgo, -sesgo);
        else candidatos.push(sesgo, -sesgo, 0);
      } else {
        // En diagonal: uno o varios pasos y vuelve a horizontal.
        if (recto > 0) candidatos.push(dy, 0);
        else candidatos.push(0, dy);
      }
      let paso: number | null = null;
      for (const ay of candidatos) {
        const ni = i + 1;
        const nj = j + ay;
        if (!libre(ni, nj)) continue;
        if (ay !== 0) {
          // Dos diagonales opuestas no pueden compartir la misma celda de paso.
          const q = Math.min(j, nj) * cols + i;
          const tipo = ay > 0 ? 1 : 2;
          if (diagonal[q] && diagonal[q] !== tipo) continue;
          diagonal[q] = tipo;
        }
        paso = ay;
        break;
      }
      if (paso === null) break;
      if (paso !== dy) {
        recto = paso === 0 ? 2 + Math.floor(r() * 6) : 1 + Math.floor(r() * 3);
        if (paso === 0 && r() < 0.5) sesgo = -sesgo;
      } else {
        recto--;
      }
      dy = paso;
      i += 1;
      j += dy;
      celdas.push(i, j);
      ocupada[j * cols + i] = 1;
    }
    if (celdas.length < 10) {
      for (let k = 0; k < celdas.length; k += 2) ocupada[celdas[k + 1] * cols + celdas[k]] = 0;
      continue;
    }
    // De celdas a puntos, fundiendo los pasos en línea. La pista sale un poco de la orilla para no verse cortada.
    const pts: number[] = [-g, celdas[1] * g];
    for (let k = 0; k < celdas.length; k += 2) {
      const x = celdas[k] * g;
      const y = celdas[k + 1] * g;
      const L = pts.length;
      if (L >= 4) {
        const ux = pts[L - 2] - pts[L - 4];
        const uy = pts[L - 1] - pts[L - 3];
        if (Math.abs(ux * (y - pts[L - 1]) - uy * (x - pts[L - 2])) < 0.01) {
          pts[L - 2] = x;
          pts[L - 1] = y;
          continue;
        }
      }
      pts.push(x, y);
    }
    // La pista llega a la orilla del anillo, no a su centro.
    const L = pts.length;
    const fx = pts[L - 2];
    const fy = pts[L - 1];
    const d = Math.hypot(fx - pts[L - 4], fy - pts[L - 3]) || 1;
    pts[L - 2] = fx - ((fx - pts[L - 4]) / d) * RADIO_ANILLO;
    pts[L - 1] = fy - ((fy - pts[L - 3]) / d) * RADIO_ANILLO;
    let camino = `M${n1(pts[0])} ${n1(pts[1])}`;
    for (let k = 2; k < L; k += 2) camino += `L${n1(pts[k])} ${n1(pts[k + 1])}`;
    pistas += camino;
    if (r() < 0.2 && L >= 6) {
      // Señal: el último tramo recto y su almohadilla, en color.
      senales.push({
        d: `M${n1(pts[L - 4])} ${n1(pts[L - 3])}L${n1(pts[L - 2])} ${n1(pts[L - 1])}`,
        anillo: anillo(fx, fy),
        color: color++ % 5,
      });
    } else {
      anillos += anillo(fx, fy);
    }
  }
  return { ancho: cols * g, alto: filas * g, pistas, anillos, senales };
}
