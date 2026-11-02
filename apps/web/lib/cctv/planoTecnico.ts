/**
 * Datos del plano técnico: ejes con letras y números, escala normalizada, cédula de equipos y
 * revisión del sistema. Sale todo del diseño real; lo que no se sabe se deja sin decir.
 */
import { modeloPorId, type TipoCamara } from "./catalogo";
import type { ResumenDiseno } from "./editor";
import { WATTS_POR_TIPO, canalesNvr, discosNecesarios, presupuestoPoe, type Grabacion } from "./infraestructura";
import { listaNiveles } from "./niveles";
import { aMetros, problemasDelPlano, type CamaraPlano, type Plano } from "./plano";

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

function tipoPoe(t: TipoCamara | undefined): keyof typeof WATTS_POR_TIPO {
  if (t === "ptz") return "ptz";
  if (t === "panoramica" || t === "ojo-de-pez") return "panoramica";
  if (t === "bala") return "bala";
  return "domo";
}

function wattsDe(c: CamaraPlano): number {
  const m = modeloPorId(c.productoId);
  return m?.wattsPoe ?? WATTS_POR_TIPO[c.esPtz ? "ptz" : tipoPoe(m?.tipo)];
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
      fila.watts += wattsDe(c);
      porModelo.set(clave, fila);
    }
  }
  const filas = [...porModelo.values()];
  return { filas, total: filas.reduce((s, f) => s + f.cantidad, 0), watts: filas.reduce((s, f) => s + f.watts, 0) };
}

export type RenglonRevision = { ok: boolean; titulo: string; detalle: string };

/** Revisión del sistema con lo que hoy se puede calcular del diseño. */
export function revisionDelSistema(raiz: Plano, resumen: ResumenDiseno | null, grabacion: Grabacion): RenglonRevision[] {
  const niveles = listaNiveles(raiz);
  const camaras = niveles.flatMap((n) => n.plano.camaras);
  const salida: RenglonRevision[] = [];
  const sinEscala = niveles.filter((n) => !n.plano.escala.calibracion && n.plano.muros.length).map((n) => n.nivel.nombre);
  salida.push(
    sinEscala.length
      ? { ok: false, titulo: "Escala", detalle: `Sin calibrar en ${sinEscala.join(", ")}: las medidas son aproximadas` }
      : { ok: true, titulo: "Escala", detalle: "Calibrada con una cota del sitio" },
  );
  const problemas = niveles.flatMap((n) => problemasDelPlano(n.plano));
  if (problemas.length) salida.push({ ok: false, titulo: "Plano", detalle: `${problemas.length} ${problemas.length === 1 ? "detalle" : "detalles"} por revisar` });
  if (!camaras.length) return salida;
  const watts = camaras.map(wattsDe);
  salida.push({ ok: true, titulo: "Consumo PoE", detalle: `${watts.reduce((s, w) => s + w, 0).toFixed(1)} W; switch de al menos ${Math.ceil(presupuestoPoe(watts))} W con holgura` });
  if (resumen) {
    salida.push({ ok: true, titulo: "Ancho de banda", detalle: `${Math.round(resumen.mbps)} Mbps de entrada al grabador` });
    const discos = discosNecesarios(resumen.tb, 8);
    salida.push({ ok: true, titulo: "Grabación", detalle: `${grabacion.retencionDias} días ocupan ${resumen.tb.toFixed(1)} TB; ${discos} ${discos === 1 ? "disco" : "discos"} de 8 TB` });
  }
  salida.push({ ok: true, titulo: "Canales del grabador", detalle: `${camaras.length} ${camaras.length === 1 ? "cámara" : "cámaras"}: grabador de ${canalesNvr(camaras.length)} canales` });
  return salida;
}
