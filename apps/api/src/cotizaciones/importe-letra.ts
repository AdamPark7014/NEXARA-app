/**
 * Importe con letra, como lo escribe Christian en la cotización:
 * «(Novecientos tres mil setecientos veinticuatro pesos 24/100 M.N.)».
 */

const UNIDADES = [
  '',
  'un',
  'dos',
  'tres',
  'cuatro',
  'cinco',
  'seis',
  'siete',
  'ocho',
  'nueve',
  'diez',
  'once',
  'doce',
  'trece',
  'catorce',
  'quince',
  'dieciséis',
  'diecisiete',
  'dieciocho',
  'diecinueve',
  'veinte',
  'veintiún',
  'veintidós',
  'veintitrés',
  'veinticuatro',
  'veinticinco',
  'veintiséis',
  'veintisiete',
  'veintiocho',
  'veintinueve',
];

const DECENAS = ['', '', '', 'treinta', 'cuarenta', 'cincuenta', 'sesenta', 'setenta', 'ochenta', 'noventa'];
const CENTENAS = [
  '',
  'ciento',
  'doscientos',
  'trescientos',
  'cuatrocientos',
  'quinientos',
  'seiscientos',
  'setecientos',
  'ochocientos',
  'novecientos',
];

function cientos(n: number): string {
  if (n === 0) return '';
  if (n === 100) return 'cien';
  const c = Math.floor(n / 100);
  const resto = n % 100;
  const partes: string[] = [];
  if (c) partes.push(CENTENAS[c] ?? '');
  if (resto < 30) {
    if (resto) partes.push(UNIDADES[resto] ?? '');
  } else {
    const d = Math.floor(resto / 10);
    const u = resto % 10;
    partes.push(u ? `${DECENAS[d]} y ${UNIDADES[u]}` : (DECENAS[d] ?? ''));
  }
  return partes.filter(Boolean).join(' ');
}

function grupo(n: number): string {
  const miles = Math.floor(n / 1000);
  const cien = n % 1000;
  const partes: string[] = [];
  if (miles) partes.push(miles === 1 ? 'mil' : `${cientos(miles)} mil`);
  if (cien) partes.push(cientos(cien));
  return partes.join(' ');
}

/** «(Novecientos tres mil … pesos 24/100 M.N.)». */
export function importeConLetra(valor: number, moneda = 'MXN'): string {
  const redondo = Math.round((valor + 1e-9) * 100) / 100;
  const entero = Math.trunc(redondo);
  const centavos = Math.round((redondo - entero) * 100);
  let texto: string;
  if (entero === 0) {
    texto = 'cero';
  } else {
    const millones = Math.floor(entero / 1_000_000);
    const resto = entero % 1_000_000;
    const partes: string[] = [];
    if (millones) partes.push(millones === 1 ? 'un millón' : `${grupo(millones)} millones`);
    if (resto) partes.push(grupo(resto));
    texto = partes.join(' ');
    if (millones && !resto) texto += ' de';
  }
  const mxn = moneda.toUpperCase() !== 'USD';
  const unidad = mxn ? (entero === 1 ? 'peso' : 'pesos') : entero === 1 ? 'dólar' : 'dólares';
  const sufijo = mxn ? 'M.N.' : 'USD';
  const frase = `${texto} ${unidad} ${String(centavos).padStart(2, '0')}/100 ${sufijo}`;
  return `(${frase.charAt(0).toUpperCase()}${frase.slice(1)})`;
}
