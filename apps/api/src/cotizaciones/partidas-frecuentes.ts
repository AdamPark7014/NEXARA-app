/**
 * Partidas frecuentes: lo que la empresa ya cotizó, para no volver a capturarlo.
 *
 * Quien cotiza escribe en «Nueva partida» y el editor le ofrece las partidas que ya salieron en
 * otras cotizaciones con ese texto —nombre, descripción, marca, modelo, unidad, costo y precio de la
 * última vez—. El margen no viaja: en la cotización nueva puede ser otro.
 *
 * Aquí vive lo que no es base de datos: cómo se busca (sin importar acentos ni mayúsculas), cómo se
 * juntan las repetidas y en qué orden salen. Módulo puro (sin Nest ni Prisma) para probarlo con jest.
 */

/** Con menos letras casi todo coincide: no se busca. */
export const MIN_LETRAS_BUSQUEDA = 2;
/** Cuántas sugerencias se devuelven. */
export const MAX_PARTIDAS_FRECUENTES = 8;
/** Renglones recientes que se leen para juntar repetidas (las más viejas no cambian la sugerencia). */
export const MAX_FILAS_A_LEER = 300;

const MAX_PALABRAS = 4;
const CAMPOS = ['name', 'model', 'brand', 'description'] as const;

/** Una partida tal como está guardada en una cotización (lo que hace falta de ella). */
export type FilaCotizada = {
  id: number;
  cotizacionId: number;
  name: string | null;
  description?: string | null;
  brand?: string | null;
  model?: string | null;
  unit?: string | null;
  /** Decimal de Prisma, número o texto. */
  unitCost?: unknown;
  unitPrice?: unknown;
  imagenUrl?: string | null;
  grupo?: string | null;
  createdAt: Date | string;
};

export type PartidaFrecuente = {
  name: string;
  description: string | null;
  brand: string | null;
  model: string | null;
  unit: string | null;
  /** Costo interno de la última vez. `null` si no se capturó. */
  unitCost: number | null;
  /** Precio al cliente de la última vez. */
  unitPrice: number;
  imagenUrl: string | null;
  grupo: string | null;
  /** En cuántas cotizaciones distintas salió. */
  veces: number;
  ultimaVez: string;
};

/** Minúsculas, sin acentos y con espacios simples: «Cámara  IP» y «camara ip» son lo mismo. */
export function normalizarTexto(texto: unknown): string {
  return String(texto ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

/** Palabras de la búsqueda, ya normalizadas. Vacío si no alcanza para buscar. */
export function palabrasDeBusqueda(q: unknown): string[] {
  const texto = normalizarTexto(String(q ?? '').slice(0, 120));
  if (texto.length < MIN_LETRAS_BUSQUEDA) return [];
  return texto.split(' ').filter(Boolean).slice(0, MAX_PALABRAS);
}

const CON_ACENTO: Record<string, string> = { a: 'á', e: 'é', i: 'í', o: 'ó', u: 'ú' };

/**
 * La palabra como puede estar guardada: tal cual y con el acento en cada vocal. Una palabra en
 * español lleva a lo más un acento escrito, así que con esto «camara» encuentra «Cámara» sin
 * depender de extensiones de la base (el `contains` de Prisma ignora mayúsculas, no acentos).
 */
export function variantesDeAcento(palabra: string): string[] {
  const variantes = new Set([palabra]);
  [...palabra].forEach((letra, i) => {
    const acentuada = CON_ACENTO[letra];
    if (acentuada && variantes.size < 12) variantes.add(`${palabra.slice(0, i)}${acentuada}${palabra.slice(i + 1)}`);
  });
  return [...variantes];
}

/**
 * Filtro de Prisma sobre `CotizacionItem`: cada palabra tiene que estar en el nombre, el modelo, la
 * marca o la descripción. `null` si la búsqueda es demasiado corta.
 */
export function filtroDePartidas(q: unknown): Array<Record<string, unknown>> | null {
  const palabras = palabrasDeBusqueda(q);
  if (!palabras.length) return null;
  return palabras.map((palabra) => ({
    OR: variantesDeAcento(palabra).flatMap((variante) =>
      CAMPOS.map((campo) => ({ [campo]: { contains: variante, mode: 'insensitive' } })),
    ),
  }));
}

const numero = (valor: unknown): number | null => {
  if (valor == null || valor === '') return null;
  const n = Number(valor);
  return Number.isFinite(n) ? n : null;
};

const limpio = (valor: unknown): string | null => String(valor ?? '').trim() || null;

/**
 * De los renglones cotizados a las sugerencias: se juntan las repetidas (mismo nombre y modelo, sin
 * importar acentos ni mayúsculas), cada una con los datos de su última vez, y salen primero las que
 * coinciden en nombre, modelo o marca; dentro de eso, las más usadas y luego las más recientes.
 */
export function partidasFrecuentes(
  filas: FilaCotizada[],
  q: unknown,
  max: number = MAX_PARTIDAS_FRECUENTES,
): PartidaFrecuente[] {
  const palabras = palabrasDeBusqueda(q);
  if (!palabras.length) return [];

  type Grupo = { ultima: FilaCotizada; cuando: number; cotizaciones: Set<number>; enTitulo: boolean };
  const grupos = new Map<string, Grupo>();
  for (const fila of filas) {
    const nombre = normalizarTexto(fila.name);
    if (nombre.length < MIN_LETRAS_BUSQUEDA) continue;
    const titulo = `${nombre} ${normalizarTexto(fila.model)} ${normalizarTexto(fila.brand)}`;
    const todo = `${titulo} ${normalizarTexto(fila.description)}`;
    // La base ya filtró, pero con variantes de acento; aquí se confirma con el texto normalizado.
    if (!palabras.every((p) => todo.includes(p))) continue;

    const clave = `${nombre}|${normalizarTexto(fila.model)}`;
    const cuando = new Date(fila.createdAt).getTime() || 0;
    const grupo = grupos.get(clave);
    if (!grupo) {
      grupos.set(clave, {
        ultima: fila,
        cuando,
        cotizaciones: new Set([fila.cotizacionId]),
        enTitulo: palabras.every((p) => titulo.includes(p)),
      });
      continue;
    }
    grupo.cotizaciones.add(fila.cotizacionId);
    if (cuando > grupo.cuando || (cuando === grupo.cuando && fila.id > grupo.ultima.id)) {
      grupo.ultima = fila;
      grupo.cuando = cuando;
    }
  }

  return [...grupos.values()]
    .sort(
      (a, b) =>
        Number(b.enTitulo) - Number(a.enTitulo) ||
        b.cotizaciones.size - a.cotizaciones.size ||
        b.cuando - a.cuando ||
        b.ultima.id - a.ultima.id,
    )
    .slice(0, Math.max(1, max))
    .map(({ ultima, cuando, cotizaciones }) => ({
      name: String(ultima.name ?? '').trim(),
      description: limpio(ultima.description),
      brand: limpio(ultima.brand),
      model: limpio(ultima.model),
      unit: limpio(ultima.unit),
      unitCost: (() => {
        const costo = numero(ultima.unitCost);
        return costo != null && costo > 0 ? costo : null;
      })(),
      unitPrice: Math.max(0, numero(ultima.unitPrice) ?? 0),
      imagenUrl: limpio(ultima.imagenUrl),
      grupo: limpio(ultima.grupo),
      veces: cotizaciones.size,
      ultimaVez: new Date(cuando).toISOString(),
    }));
}
