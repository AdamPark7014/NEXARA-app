/**
 * Lógica pura de la siembra de plantillas base (`prisma/seed-nexara-plantillas.ts`): decide, para cada
 * plantilla base, si hay que crearla, actualizarla u omitirla, sin tocar la base de datos.
 *
 * Regla de oro: **nunca se pisa lo que el usuario ya tocó**.
 *
 *  - No existe (por empresa + nombre)                          → CREAR.
 *  - Existe y es idéntica a la base                            → SIN_CAMBIOS.
 *  - Existe, la sembró este mismo proceso y nadie la editó,
 *    pero la base cambió desde entonces                        → ACTUALIZAR.
 *  - Existe y difiere (la editó alguien, o se creó a mano con
 *    ese nombre)                                               → OMITIR_EDITADA (se reporta en qué difiere).
 *  - Existe pero está archivada                                → OMITIR_ARCHIVADA (quien la archivó
 *    decidió quitarla de la lista; no se resucita).
 *
 * «La sembró este proceso y nadie la editó» se sabe por un marcador `_semilla` dentro del JSON de la
 * fila: lleva el hash del contenido tal como se sembró. Si el contenido actual ya no coincide con ese
 * hash, alguien lo cambió. `normalizarContenidoPlantilla` ignora el marcador al leer, así que no afecta
 * a la API ni al editor.
 *
 * Módulo puro (sin Nest ni Prisma) para poder probarlo con jest.
 */
import { createHash } from 'crypto';
import type { PlantillaBase } from './plantillas-base.js';
import { normalizarContenidoPlantilla, type ContenidoPlantilla } from './personalizacion.js';

export const SEMILLA_ORIGEN = 'nexara-base';

export type MarcaSemilla = { origen: string; clave: string; hash: string };

/** Contenido tal como se guarda en la base de datos: el de la plantilla más el marcador. */
export type ContenidoSembrado = ContenidoPlantilla & { _semilla: MarcaSemilla };

/** Nombre comparable: sin acentos, sin mayúsculas y con espacios colapsados. */
export function claveNombre(nombre: unknown): string {
  return String(nombre ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

/** JSON con llaves ordenadas: mismo contenido, mismo texto, sin importar el orden de las llaves. */
function estable(valor: unknown): string {
  if (Array.isArray(valor)) return `[${valor.map(estable).join(',')}]`;
  if (valor && typeof valor === 'object') {
    const o = valor as Record<string, unknown>;
    return `{${Object.keys(o)
      .filter((k) => o[k] !== undefined)
      .sort()
      .map((k) => `${JSON.stringify(k)}:${estable(o[k])}`)
      .join(',')}}`;
  }
  return JSON.stringify(valor) ?? 'null';
}

/** Hash del contenido normalizado (ignora el marcador y cualquier campo que la API no conozca). */
export function hashContenido(contenido: unknown): string {
  return createHash('sha1').update(estable(normalizarContenidoPlantilla(contenido))).digest('hex');
}

/** Lo que se escribe en la base de datos para una plantilla base. */
export function contenidoParaGuardar(base: PlantillaBase): ContenidoSembrado {
  const contenido = normalizarContenidoPlantilla(base.contenido);
  return { ...contenido, _semilla: { origen: SEMILLA_ORIGEN, clave: base.clave, hash: hashContenido(contenido) } };
}

/** Llaves de primer nivel en las que difieren dos contenidos (para explicar por qué se omitió). */
export function diferenciasDeContenido(a: unknown, b: unknown): string[] {
  const x = normalizarContenidoPlantilla(a) as unknown as Record<string, unknown>;
  const y = normalizarContenidoPlantilla(b) as unknown as Record<string, unknown>;
  return Object.keys(x).filter((k) => estable(x[k]) !== estable(y[k]));
}

/** Lo mínimo que hay que leer de `cotizacion_plantillas`. */
export type FilaPlantilla = {
  id: number;
  nombre: string;
  archivadaAt: Date | string | null;
  contenido: unknown;
};

export type TipoAccion = 'CREAR' | 'ACTUALIZAR' | 'SIN_CAMBIOS' | 'OMITIR_EDITADA' | 'OMITIR_ARCHIVADA';

export type AccionSiembra = {
  tipo: TipoAccion;
  clave: string;
  nombre: string;
  /** Fila existente sobre la que se actúa (ACTUALIZAR y las omisiones). */
  id: number | null;
  motivo: string;
  /** Solo OMITIR_EDITADA: en qué campos difiere de la base. */
  diferencias: string[];
};

function marcaDe(contenido: unknown): MarcaSemilla | null {
  const bruta = contenido && typeof contenido === 'object' ? (contenido as Record<string, unknown>)['_semilla'] : null;
  if (!bruta || typeof bruta !== 'object') return null;
  const m = bruta as Record<string, unknown>;
  return m['origen'] === SEMILLA_ORIGEN && typeof m['hash'] === 'string'
    ? { origen: SEMILLA_ORIGEN, clave: String(m['clave'] ?? ''), hash: m['hash'] }
    : null;
}

/**
 * Compara las plantillas base con las filas de la empresa y devuelve qué hacer con cada una, en el orden
 * de las plantillas base. Sin efectos: quien llama decide si aplica.
 */
export function planificarSiembra(bases: readonly PlantillaBase[], filas: readonly FilaPlantilla[]): AccionSiembra[] {
  return bases.map((base): AccionSiembra => {
    const propias = filas.filter((f) => claveNombre(f.nombre) === claveNombre(base.nombre));
    const vivas = propias.filter((f) => !f.archivadaAt).sort((a, b) => b.id - a.id);
    const deseado = normalizarContenidoPlantilla(base.contenido);
    const hashDeseado = hashContenido(deseado);
    const accion = (tipo: TipoAccion, motivo: string, id: number | null = null, diferencias: string[] = []): AccionSiembra => ({
      tipo,
      clave: base.clave,
      nombre: base.nombre,
      id,
      motivo,
      diferencias,
    });

    if (!propias.length) return accion('CREAR', 'No existe en la empresa.');
    if (!vivas.length) {
      return accion('OMITIR_ARCHIVADA', 'Existe archivada: se respeta que se haya quitado de la lista.', propias[0]!.id);
    }

    // Con duplicados vivos, manda la más reciente.
    const fila = vivas[0]!;
    const hashActual = hashContenido(fila.contenido);
    if (hashActual === hashDeseado) return accion('SIN_CAMBIOS', 'Ya está como la base.', fila.id);

    const marca = marcaDe(fila.contenido);
    if (marca && marca.hash === hashActual) {
      return accion('ACTUALIZAR', 'La sembró este proceso, nadie la editó y la base cambió.', fila.id);
    }
    return accion(
      'OMITIR_EDITADA',
      marca
        ? 'La sembró este proceso pero alguien la editó después: no se pisa.'
        : 'Existe con ese nombre y no la sembró este proceso (creada a mano): no se pisa.',
      fila.id,
      diferenciasDeContenido(fila.contenido, deseado),
    );
  });
}

export type ResumenSiembra = Record<TipoAccion, number>;

export function resumirSiembra(acciones: readonly AccionSiembra[]): ResumenSiembra {
  const resumen: ResumenSiembra = { CREAR: 0, ACTUALIZAR: 0, SIN_CAMBIOS: 0, OMITIR_EDITADA: 0, OMITIR_ARCHIVADA: 0 };
  for (const a of acciones) resumen[a.tipo] += 1;
  return resumen;
}
