/**
 * Qué cliente es el que dijeron. `buscar` también sirve para personas y sucursales, donde basta que
 * una palabra se parezca; con un cliente eso salía caro: «Serta Colchones» se iba a SERTE sin avisar
 * y «Grupo Bimbo» sugería a Grupo Dice Puebla por decir «Grupo», así que no se ofrecía darlo de alta.
 *
 * Aquí manda además el comparador del aviso de repetidos (`clientesParecidos`):
 * - Un giro o un lugar en común («Grupo», «Puebla», «Santa») no sugiere ni elige a nadie.
 * - Apenas se parece y además dice algo que el nombre no tiene: es otro cliente, se sugiere.
 * - Si `buscar` no decide y el comparador está casi seguro de uno solo, ese es («Nivel Diez» → N10).
 */
import { clientesParecidos, esPropia, nucleoDelNombre, type FichaComparable } from '../../ventas/clientes-parecidos.js';
import { buscar, mencion, normalizar, palabrasUtiles, parecido, porSiglasDe, puntaje, type Coincidencia, type Dicha } from './nombres.js';

type Modo = 'normal' | 'holgada';

/** Dónde dentro del cliente: «Talks nave 2» sigue siendo Grupo Tox. */
const PARTES_DE_UN_SITIO = new Set(['nave', 'planta', 'piso', 'area', 'edificio', 'torre', 'local', 'matriz', 'sede', 'patio', 'almacen', 'cedis']);

function seParecen(dicha: string, delNombre: string, modo: Modo): boolean {
  if (parecido(dicha, delNombre, modo) > 0) return true;
  return Math.min(dicha.length, delNombre.length) >= 3 && (dicha.startsWith(delNombre) || delNombre.startsWith(dicha));
}

/** ¿Comparten algo que distinga a un cliente de otro? */
function compartenAlgoPropio(texto: string, nombre: string, modo: Modo): boolean {
  const delNombre = palabrasUtiles(nombre);
  return palabrasUtiles(texto).some((w) => esPropia(w) && delNombre.some((n) => seParecen(w, n, modo)));
}

/** «Colchones» en «Serta Colchones» contra SERTE: lo dijeron y el nombre no lo tiene. */
function dijoDeMas(texto: string, nombre: string, modo: Modo): boolean {
  const delNombre = palabrasUtiles(nombre);
  return palabrasUtiles(texto).some((w) => esPropia(w) && !PARTES_DE_UN_SITIO.has(w) && !delNombre.some((n) => seParecen(w, n, modo)));
}

/**
 * ¿La instrucción nombra a este cliente por algo suyo? «Constructora Puebla» no nombra a IBERO PUEBLA:
 * si la IA lo ve en las coincidencias, lo elige.
 */
export function mencionaAlCliente(instruccion: string, dichas: Dicha[], nombre: string): boolean {
  const suyas = palabrasUtiles(nombre).filter(esPropia);
  if (!suyas.length || porSiglasDe(instruccion, nombre)) return true;
  return mencion(dichas, suyas.join(' ')).nivel >= 1;
}

/** El mismo nombre salvo puntos, espacios o «S.A. de C.V.»: no hay nada que corregir. */
export function mismoNombreDeCliente(a: string, b: string): boolean {
  return nucleoDelNombre(a).replace(/ /g, '') === nucleoDelNombre(b).replace(/ /g, '');
}

export function elegirCliente<T extends FichaComparable>(
  texto: string | null,
  clientes: T[],
  modo: Modo = 'normal',
): Coincidencia<T> & { porComparador: boolean } {
  const base = buscar(texto, clientes, (c) => c.name, 5, { aproximado: true, modo });
  if (!texto || !normalizar(texto)) return { ...base, porComparador: false };

  const parecidos = clientesParecidos({ nombre: texto }, clientes);
  const confianza = new Map(parecidos.map((p) => [p.cliente.id, p.confianza]));
  const sostiene = (c: T) => confianza.has(c.id) || compartenAlgoPropio(texto, c.name, modo) || porSiglasDe(texto, c.name);
  const sePuedeElegir = (c: T) =>
    sostiene(c) && (confianza.get(c.id) === 'alta' || puntaje(texto, c.name) >= 2 || !dijoDeMas(texto, c.name, modo));

  const empatados = base.empatados.filter(sePuedeElegir);
  const candidatos = [...parecidos.map((p) => p.cliente), ...base.candidatos.filter(sostiene)]
    .filter((c, i, lista) => lista.findIndex((o) => o.id === c.id) === i)
    .slice(0, 5);

  let elegido = base.elegido && sePuedeElegir(base.elegido) ? base.elegido : null;
  if (!elegido && empatados.length === 1) elegido = empatados[0];
  if (elegido) return { elegido, candidatos, empatados: [], porComparador: false };

  const casiSeguros = parecidos.filter((p) => p.confianza === 'alta');
  if (casiSeguros.length === 1) return { elegido: casiSeguros[0].cliente, candidatos, empatados: [], porComparador: true };
  return { elegido: null, candidatos, empatados, porComparador: false };
}
