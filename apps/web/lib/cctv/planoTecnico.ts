/**
 * Datos del plano técnico: ejes con letras y números, escala normalizada, cédula de equipos y
 * revisión del sistema. Sale todo del diseño real; lo que no se sabe se deja sin decir.
 */
import { ETIQUETA_TIPO_EQUIPO, PREFIJO_TIPO, modeloPorId, type TipoCamara } from "./catalogo";
import { listaNiveles } from "./niveles";
import { aMetros, type Plano } from "./plano";
import { wattsCamara } from "./sistema";

export type Eje = { nombre: string; m: number };

/** Junta valores cercanos; se queda con el promedio de cada grupo. */
function agrupar(valores: readonly number[], tolerancia: number): number[] {
  const orden = [...valores].sort((a, b) => a - b);
  const grupos: number[][] = [];
  for (const v of orden) {
    const g = grupos[grupos.length - 1];
    if (g && v - g[g.length - 1] <= tolerancia) g.push(v);
    else grupos.push([v]);
  }
  return grupos.map((g) => g.reduce((s, x) => s + x, 0) / g.length);
}

/** Con muchos ejes se quitan los que quedan más juntos, sin tocar los dos de la orilla. */
function limitar(valores: number[], maximo: number, separacionMin: number): number[] {
  const v = [...valores];
  while (v.length > 2) {
    let mejor = -1;
    let hueco = Infinity;
    for (let i = 1; i < v.length - 1; i++) {
      const h = Math.min(v[i] - v[i - 1], v[i + 1] - v[i]);
      if (h < hueco) {
        hueco = h;
        mejor = i;
      }
    }
    if (v.length <= maximo && hueco >= separacionMin) break;
    v.splice(mejor, 1);
  }
  return v;
}

function letraEje(i: number): string {
  return i < 26 ? String.fromCharCode(65 + i) : `A${String.fromCharCode(65 + i - 26)}`;
}

/**
 * Ejes del plano: uno por cada línea donde corren muros rectos. Las columnas llevan letras, de
 * izquierda a derecha; las filas, números, de arriba hacia abajo.
 */
export function ejesDelPlano(plano: Plano): { x: Eje[]; y: Eje[] } {
  const xs: number[] = [];
  const ys: number[] = [];
  for (const m of plano.muros) {
    const a = aMetros(m.a, plano.escala);
    const b = aMetros(m.b, plano.escala);
    const largo = Math.hypot(b.x - a.x, b.y - a.y);
    if (largo < 0.5) continue;
    if (Math.abs(b.x - a.x) < 0.05 * largo) xs.push((a.x + b.x) / 2);
    if (Math.abs(b.y - a.y) < 0.05 * largo) ys.push((a.y + b.y) / 2);
  }
  const lx = limitar(agrupar(xs, 0.3), 12, 1);
  const ly = limitar(agrupar(ys, 0.3), 10, 1);
  return {
    x: lx.map((m, i) => ({ nombre: letraEje(i), m })),
    y: ly.map((m, i) => ({ nombre: String(i + 1), m })),
  };
}

const ESCALAS = [20, 25, 50, 75, 100, 125, 150, 200, 250, 300, 400, 500, 750, 1000, 1500, 2000];

/** La escala normalizada más grande con la que `anchoM × altoM` cabe en el papel (mm). */
export function escalaNormalizada(anchoM: number, altoM: number, papelAnchoMm: number, papelAltoMm: number): number {
  for (const e of ESCALAS) {
    if ((anchoM * 1000) / e <= papelAnchoMm && (altoM * 1000) / e <= papelAltoMm) return e;
  }
  return ESCALAS[ESCALAS.length - 1];
}

/** Barra de escala: el tramo redondo para que 5 tramos midan unos 9 cm en el papel. */
export function pasoBarraEscala(denominador: number): number {
  const metros = (denominador * 90) / 1000 / 5;
  return [0.5, 1, 2, 5, 10, 20, 50, 100].find((m) => m >= metros) ?? 200;
}

export type FilaCedula = { clave: string; tipo: string; modelo: string; cantidad: number; watts: number };

const NOMBRE_TIPO: Readonly<Record<TipoCamara, string>> = {
  domo: "Domo",
  bala: "Bala",
  turret: "Turret",
  ptz: "PTZ",
  panoramica: "Panorámica",
  "ojo-de-pez": "Ojo de pez",
};

/** Cédula de equipos de todo el edificio: un renglón por modelo. */
export function cedulaDeEquipos(raiz: Plano): { filas: FilaCedula[]; total: number; watts: number } {
  const porModelo = new Map<string, FilaCedula>();
  for (const { plano } of listaNiveles(raiz)) {
    for (const c of plano.camaras) {
      const m = modeloPorId(c.productoId);
      const clave = c.productoId || c.modelo;
      const fila = porModelo.get(clave) ?? { clave: "CAM", tipo: m ? NOMBRE_TIPO[m.tipo] : c.esPtz ? "PTZ" : "Cámara", modelo: m?.modelo ?? c.modelo, cantidad: 0, watts: 0 };
      fila.cantidad += 1;
      fila.watts += wattsCamara(c);
      porModelo.set(clave, fila);
    }
  }
  for (const { plano } of listaNiveles(raiz)) {
    for (const e of plano.equipos ?? []) {
      const clave = `${e.tipo}|${e.productoId || e.modelo}`;
      const fila = porModelo.get(clave) ?? { clave: PREFIJO_TIPO[e.tipo], tipo: ETIQUETA_TIPO_EQUIPO[e.tipo], modelo: e.modelo.replace(/^HIKVISION\s+/i, ""), cantidad: 0, watts: 0 };
      fila.cantidad += 1;
      fila.watts += e.datos.poeW ?? 0;
      porModelo.set(clave, fila);
    }
  }
  const filas = [...porModelo.values()];
  return { filas, total: filas.reduce((s, f) => s + f.cantidad, 0), watts: filas.reduce((s, f) => s + f.watts, 0) };
}

export { revisionDelSistema, type RenglonRevision } from "./sistema";
