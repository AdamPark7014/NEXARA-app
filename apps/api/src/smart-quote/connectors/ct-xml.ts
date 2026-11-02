/**
 * `productos.xml` de CT: el catálogo completo, también lo que hoy no tiene existencia. El JSON solo trae
 * lo que hay en existencia. Se lee a mano: el archivo es plano, pesa 31 MB y un `&` suelto en un nombre
 * no debe tirar todo el catálogo. Módulo puro para probarlo con jest.
 */
import type { CtRawProduct } from './ct-ftp.connector.js';

const ENTIDADES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };

function limpio(texto: string): string {
  return texto
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/&(amp|lt|gt|quot|apos);/g, (_, entidad: string) => ENTIDADES[entidad]!)
    .replace(/&#(\d+);/g, (_, cifra: string) => String.fromCodePoint(Number(cifra)))
    .trim();
}

/** Lo que hay entre `<etiqueta>` y `</etiqueta>`, sin limpiar; vacío si no está. */
function interior(bloque: string, etiqueta: string): string {
  const abre = `<${etiqueta}>`;
  const inicio = bloque.indexOf(abre);
  if (inicio < 0) return '';
  const desde = inicio + abre.length;
  const fin = bloque.indexOf(`</${etiqueta}>`, desde);
  return fin < 0 ? '' : bloque.slice(desde, fin);
}

function leerProducto(bloque: string): CtRawProduct | null {
  const campo = (etiqueta: string) => limpio(interior(bloque, etiqueta));
  const opcional = (etiqueta: string) => campo(etiqueta) || undefined;
  const numero = (etiqueta: string) => Number(campo(etiqueta)) || undefined;

  const clave = campo('clave');
  if (!clave) return null;

  // Solo lo que tiene piezas, igual que el JSON: `{}` quiere decir «sin existencia».
  const existencia: Record<string, number> = {};
  for (const [, almacen, piezas] of interior(bloque, 'existencia').matchAll(/<([A-Za-z0-9_]+)>\s*(\d+)\s*<\/\1>/g)) {
    if (Number(piezas) > 0) existencia[almacen!] = Number(piezas);
  }

  const especificaciones = [...interior(bloque, 'especificacion').matchAll(/<tipo>([\s\S]*?)<\/tipo>\s*<valor>([\s\S]*?)<\/valor>/g)].map(
    ([, tipo, valor]) => ({ tipo: limpio(tipo!), valor: limpio(valor!) }),
  );

  const marca = campo('marca');
  const modelo = campo('modelo');
  return {
    clave,
    numParte: opcional('no_parte'),
    // El XML dice «Batería» donde el JSON dice «Batería APC RBC35»: se arma igual (5,574 de 5,574 el 02-11-2026).
    nombre: [campo('nombre'), marca, modelo].filter(Boolean).join(' ').replace(/\s+/g, ' '),
    modelo: modelo || undefined,
    idMarca: numero('idMarca'),
    marca: marca || undefined,
    idSubCategoria: numero('idSubCategoria'),
    subcategoria: opcional('subcategoria'),
    idCategoria: numero('idCategoria'),
    categoria: opcional('categoria'),
    // Algunas terminan en « - » porque a CT le falta un dato.
    descripcion_corta: campo('descripcion_corta').replace(/\s*-\s*$/, '') || undefined,
    ean: opcional('ean'),
    upc: opcional('upc'),
    sustituto: opcional('sustituto'),
    activo: campo('status').toLowerCase() === 'activo' ? 1 : 0,
    protegido: 0,
    existencia,
    precio: Number(campo('precio')) || 0,
    moneda: opcional('moneda'),
    tipoCambio: numero('tipo_cambio'),
    especificaciones,
    promociones: [],
    imagen: opcional('imagen'),
  };
}

export function leerCatalogoXml(texto: string): CtRawProduct[] {
  // Un archivo cortado no se lee como si fuera el catálogo: lo que falte se apagaría.
  if (!texto.trimEnd().endsWith('</Articulo>')) {
    throw new Error('CT XML incompleto: el archivo no cierra <Articulo>');
  }
  return texto
    .split('<Producto>')
    .slice(1)
    .map(leerProducto)
    .filter((p): p is CtRawProduct => Boolean(p));
}
