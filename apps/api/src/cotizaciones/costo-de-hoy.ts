/**
 * ¿Cuánto cuesta hoy en CT lo que ya se cotizó? Una partida usada trae el costo de aquella vez, y
 * medido el 02-11 en 33 partidas comparables, 26 difieren más de 3 %.
 *
 * Solo se avisa: nada aquí cambia un costo ni un precio. Y CT es una referencia, no la verdad: 81 de
 * 180 costos guardados son iguales a su precio y ninguna partida está ligada a CT, así que parte de
 * la diferencia puede ser otro proveedor.
 *
 * Todo esto es código: la IA no ve nada de esto. Módulo puro (sin Nest ni Prisma) para probarlo con jest.
 */
import { normalizeExistencia } from '../smart-quote/ct-warehouses.js';
import type { PartidaPropuesta } from './cotizar-frase.js';
import { modeloLimpio } from './emparejar-partidas.js';

export type CostoDeHoy = {
  /** En pesos y sin IVA. */
  costo: number;
  /** Contra el costo guardado: 0.11 es que hoy cuesta 11 % más. */
  diferencia: number;
  /** Piezas en CT; 0 es que se surte sobre pedido. */
  piezas: number;
  clave: string;
  /** CT sincronizó en las últimas 24 horas. Si no, no se puede decir «hoy». */
  alDia: boolean;
  /** Cuándo sincronizó CT por última vez. */
  fecha: string | null;
};

/** Hasta aquí no se avisa: en un mes el tipo de cambio de CT se movió cerca de 3 %. */
export const UMBRAL_AVISO = 0.03;
/** Filas de un mismo modelo a más de esto entre sí son versiones distintas: ZC300 da una cinta y una impresora. */
const VERSIONES_DISTINTAS = 0.03;
/** Una fila en dólares más lejos que esto del tipo de cambio del día no se actualizó. */
const TIPO_DE_CAMBIO_VIEJO = 0.01;
const AL_DIA_MS = 24 * 60 * 60_000;
/** 40 renglones con sus opciones no llegan a tanto. */
const MAX_MODELOS = 120;

export type FilaCt = {
  clave: string | null;
  modelo: string | null;
  numParte: string | null;
  precio: number | null;
  moneda: string | null;
  tipoCambio: number | null;
  existencia: unknown;
};

export type CatalogoDeHoy = {
  /** Por modelo sin guiones ni espacios. */
  porModelo: Map<string, FilaCt[]>;
  tipoDelDia: number | null;
  ultimaSincronizacion: Date | null;
};

/** «DS-2FA1208-C16/K» y «ds 2fa1208 c16 k» son el mismo modelo. */
export const claveDeModelo = (texto: unknown) => String(texto ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '');

export function armarCatalogo(filas: FilaCt[], tipoDelDia: number | null, ultimaSincronizacion: Date | null): CatalogoDeHoy {
  const porModelo = new Map<string, FilaCt[]>();
  for (const fila of filas) {
    for (const clave of new Set([claveDeModelo(fila.modelo), claveDeModelo(fila.numParte), String(fila.clave ?? '').toUpperCase()])) {
      if (!clave) continue;
      porModelo.set(clave, [...(porModelo.get(clave) ?? []), fila]);
    }
  }
  return { porModelo, tipoDelDia, ultimaSincronizacion };
}

const esDolar = (fila: FilaCt) => String(fila.moneda ?? '').toUpperCase() === 'USD';

/** Mismo cálculo que el buscador; sin tipo de cambio no se adivina uno. */
function costoEnPesos(fila: FilaCt): number | null {
  const precio = Number(fila.precio);
  if (!(precio > 0)) return null;
  if (!esDolar(fila)) return precio;
  const tipo = Number(fila.tipoCambio);
  return tipo > 0 ? Math.round(precio * tipo * 100) / 100 : null;
}

const piezasDe = (fila: FilaCt) => Object.values(normalizeExistencia(fila.existencia)).reduce((a, b) => a + b, 0);

/** Lo guardado contra CT. `null` si no hay con qué comparar o si la diferencia no alcanza para avisar. */
export function compararCosto(costoGuardado: unknown, modelo: unknown, catalogo: CatalogoDeHoy, ahora = new Date()): CostoDeHoy | null {
  const guardado = Number(costoGuardado);
  if (!(guardado > 0)) return null;
  const { tipoDelDia, ultimaSincronizacion } = catalogo;
  const vigentes = (catalogo.porModelo.get(claveDeModelo(modelo)) ?? [])
    .filter((f) => !esDolar(f) || !tipoDelDia || Math.abs(Number(f.tipoCambio) - tipoDelDia) / tipoDelDia <= TIPO_DE_CAMBIO_VIEJO)
    .map((fila) => ({ fila, costo: costoEnPesos(fila), piezas: piezasDe(fila) }))
    .filter((x): x is { fila: FilaCt; costo: number; piezas: number } => x.costo != null);
  if (!vigentes.length) return null;
  const costos = vigentes.map((x) => x.costo);
  if (Math.max(...costos) / Math.min(...costos) - 1 > VERSIONES_DISTINTAS) return null;
  const elegida = [...vigentes].sort((a, b) => Number(b.piezas > 0) - Number(a.piezas > 0) || a.costo - b.costo)[0]!;
  const diferencia = (elegida.costo - guardado) / guardado;
  if (Math.abs(diferencia) <= UMBRAL_AVISO) return null;
  return {
    costo: elegida.costo,
    diferencia,
    piezas: elegida.piezas,
    clave: String(elegida.fila.clave ?? ''),
    alDia: ultimaSincronizacion != null && ahora.getTime() - ultimaSincronizacion.getTime() < AL_DIA_MS,
    fecha: ultimaSincronizacion?.toISOString() ?? null,
  };
}

/** Por metro, por lote o por servicio no se puede comparar con lo que CT vende por pieza. */
const POR_PIEZA = /^(?:pieza|pza|pz)s?\.?$/i;
const esPorPieza = (unidad: unknown) => !String(unidad ?? '').trim() || POR_PIEZA.test(String(unidad).trim());

type Comparable = { name: string; model: string | null; unit?: string | null; unitCost: number | null };

/** Lo que vale comparar: tiene costo guardado, un modelo que no es texto pegado y se vende por pieza. */
function modeloComparable(p: Comparable): string | null {
  if (!(Number(p.unitCost) > 0) || !esPorPieza(p.unit)) return null;
  const clave = claveDeModelo(modeloLimpio(p.model, p.name));
  return clave.length >= 4 ? clave : null;
}

export function modelosComparables(partidas: Comparable[]): string[] {
  const claves = partidas.map(modeloComparable).filter((m): m is string => m != null);
  return [...new Set(claves)].slice(0, MAX_MODELOS);
}

function costoDe(p: Comparable, catalogo: CatalogoDeHoy, ahora: Date): CostoDeHoy | null {
  const modelo = modeloComparable(p);
  return modelo ? compararCosto(p.unitCost, modelo, catalogo, ahora) : null;
}

/** La partida con su aviso, si le toca. Sin aviso queda igual: no se le agrega el campo. */
export function conCostoDeHoy<T extends Comparable>(partida: T, catalogo: CatalogoDeHoy, ahora = new Date()): T & { costoDeHoy?: CostoDeHoy } {
  const costoDeHoy = costoDe(partida, catalogo, ahora);
  return costoDeHoy ? { ...partida, costoDeHoy } : partida;
}

/** Lo ya cotizado de una propuesta, con sus opciones. Lo del mayorista ya trae el costo de hoy; un paquete no trae costo. */
export function modelosDePartidas(partidas: PartidaPropuesta[]): string[] {
  return modelosComparables(
    partidas.flatMap((p) => [
      ...(p.fuente === 'usada' ? [{ ...p, unit: p.unidad }] : []),
      ...p.alternativas.filter((a) => a.fuente === 'usada'),
    ]),
  );
}

export function propuestaConCostos(partidas: PartidaPropuesta[], catalogo: CatalogoDeHoy, ahora = new Date()): PartidaPropuesta[] {
  return partidas.map((p) => {
    const costoDeHoy = p.fuente === 'usada' ? costoDe({ ...p, unit: p.unidad }, catalogo, ahora) : null;
    return {
      ...p,
      ...(costoDeHoy ? { costoDeHoy } : {}),
      alternativas: p.alternativas.map((a) => (a.fuente === 'usada' ? conCostoDeHoy(a, catalogo, ahora) : a)),
    };
  });
}
