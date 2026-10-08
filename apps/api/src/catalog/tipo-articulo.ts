/**
 * Tipos de artículo de almacén (pedido de Adam, 07-10-2026).
 *
 * «Una cosa es un taladro que es uno y uno, y otra un bote de cinchos o clavos o una bolsa de
 * taquetes; o una pantalla, pues no lo ocupa». Cuatro tipos:
 *
 * - HERRAMIENTA: se presta y regresa, 1 a 1 con serie y etiqueta. NO es producto: vive en
 *   `ToolInventoryItem` y se da de alta en Almacén → Herramientas.
 * - EQUIPO: se instala o se vende; por pieza, serie opcional (cámara, monitor, NVR). Sin empaque.
 * - CONSUMIBLE: se gasta; se cuenta en piezas y se guarda por empaque con capacidad (bote de 100
 *   cinchos, bolsa de 50 taquetes). El empaque es una `ProductPackaging`.
 * - MEDIDA: por metro en bobina o tramo (UTP bobina de 305 m). Unidad base `m`; la presentación
 *   también es una `ProductPackaging` (`piezasPorUnidad` = metros).
 *
 * Aritmética y reglas puras: ni Prisma ni Nest. `CatalogService` traduce los errores a 400.
 */

/** Los tipos que se guardan en `Product.tipoArticulo`. null = «Sin tipo». */
export const TIPOS_ARTICULO = ['EQUIPO', 'CONSUMIBLE', 'MEDIDA'] as const;
export type TipoArticulo = (typeof TIPOS_ARTICULO)[number];

/** Los tipos que llevan empaque con capacidad. */
export const TIPOS_CON_EMPAQUE: ReadonlySet<TipoArticulo> = new Set<TipoArticulo>(['CONSUMIBLE', 'MEDIDA']);

/** Igual que `ProductPackaging.nombre` (`VarChar(60)`). */
export const LARGO_MAXIMO_EMPAQUE = 60;

export const MENSAJE_TIPO_INVALIDO =
  'El tipo debe ser Equipo, Consumible o Por medida (EQUIPO, CONSUMIBLE o MEDIDA). ' +
  'Las herramientas se dan de alta en Almacén → Herramientas.';

export class TipoArticuloInvalidoError extends Error {}

export function esTipoArticulo(valor: unknown): valor is TipoArticulo {
  return typeof valor === 'string' && (TIPOS_ARTICULO as readonly string[]).includes(valor);
}

/**
 * «consumible», « Consumible » → 'CONSUMIBLE'. Vacío o null → null (sin tipo). Cualquier otra
 * cosa (incluida «HERRAMIENTA») → `undefined`, para que quien llama decida si es error.
 */
export function normalizarTipoArticulo(valor: unknown): TipoArticulo | null | undefined {
  if (valor == null) return null;
  if (typeof valor !== 'string') return undefined;
  const limpio = valor.trim().toUpperCase();
  if (!limpio) return null;
  return esTipoArticulo(limpio) ? limpio : undefined;
}

/** Unidad base del tipo: todo se cuenta en piezas salvo lo que va por metro. */
export function unidadBaseDeTipo(tipo: TipoArticulo): 'pz' | 'm' {
  return tipo === 'MEDIDA' ? 'm' : 'pz';
}

const UNIDADES_GENERICAS = new Set(['pz', 'pza', 'pzas', 'pieza', 'piezas', 'm', 'mt', 'mts', 'metro', 'metros']);

/**
 * Unidad que se guarda en `Product.unitName`.
 *
 * - Si la mandaron, manda la que mandaron.
 * - Sin tipo, no se toca (`undefined` = no cambiar; en el alta queda null como siempre).
 * - Con tipo: CONSUMIBLE/EQUIPO → 'pz', MEDIDA → 'm'. Al editar solo se reemplaza una unidad
 *   vacía o genérica (pz/m): si alguien capturó «kg» a mano, se respeta.
 */
export function unidadParaTipo(opciones: {
  tipo: TipoArticulo | null;
  unidadMandada?: string | null;
  unidadActual?: string | null;
}): string | undefined {
  const mandada = (opciones.unidadMandada ?? '').trim();
  if (mandada) return mandada;
  if (!opciones.tipo) return undefined;
  const base = unidadBaseDeTipo(opciones.tipo);
  const actual = (opciones.unidadActual ?? '').trim();
  if (!actual || UNIDADES_GENERICAS.has(actual.toLowerCase())) return base;
  return actual;
}

export type EmpaqueDeAlta = { nombre: string; capacidad: number };

/**
 * Revisa el empaque contra el tipo y lo deja limpio. Devuelve null cuando no hay empaque que
 * guardar. Lanza `TipoArticuloInvalidoError` con el mensaje que verá la persona.
 */
export function validarEmpaqueDeTipo(
  tipo: TipoArticulo | null,
  empaque: { nombre?: unknown; capacidad?: unknown } | null | undefined,
): EmpaqueDeAlta | null {
  if (empaque == null) return null;
  if (tipo === 'EQUIPO') {
    throw new TipoArticuloInvalidoError(
      'El equipo se cuenta por pieza y no lleva empaque. Quita el empaque o elige «Consumible» o «Por medida».',
    );
  }
  if (!tipo) {
    throw new TipoArticuloInvalidoError(
      'Elige el tipo del artículo («Consumible» o «Por medida») para registrar su empaque.',
    );
  }
  const porMedida = tipo === 'MEDIDA';
  const nombre = typeof empaque.nombre === 'string' ? empaque.nombre.replace(/\s+/g, ' ').trim() : '';
  if (!nombre) {
    throw new TipoArticuloInvalidoError(
      porMedida
        ? 'Escribe la presentación (Bobina, Rollo, Tramo…).'
        : 'Escribe el empaque (Bote, Bolsa, Caja…).',
    );
  }
  if (nombre.length > LARGO_MAXIMO_EMPAQUE) {
    throw new TipoArticuloInvalidoError(
      `El nombre del empaque no puede pasar de ${LARGO_MAXIMO_EMPAQUE} caracteres.`,
    );
  }
  const capacidad = typeof empaque.capacidad === 'number' ? empaque.capacidad : Number(empaque.capacidad);
  if (!Number.isFinite(capacidad) || capacidad <= 0) {
    throw new TipoArticuloInvalidoError(
      porMedida
        ? `Indica cuántos metros trae cada ${nombre.toLowerCase()}.`
        : `Indica cuántas piezas trae cada ${nombre.toLowerCase()}.`,
    );
  }
  return { nombre, capacidad: Math.round((capacidad + Number.EPSILON) * 10_000) / 10_000 };
}
