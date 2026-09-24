/**
 * Checklist de herramientas de una OT.
 *
 * Regla del dueño: «antes de atender una instalación/servicio asignado, realizar en la
 * OT check list de herramientas a ocupar». Quien asigna la actividad dice qué hay que
 * llevar (`ActivityToolRequirement`, junto a «Qué hay que fotografiar»), y quien la va a
 * ejecutar palomea cada renglón (`ActivityToolCheck`) antes de poder iniciarla.
 *
 * Aquí vive solo la normalización y las reglas; sin Prisma, para poder probarlas y para
 * que la web y las apps puedan copiar la misma lógica.
 */

export const MAX_REQUISITOS = 40;
export const MAX_LARGO_DESCRIPCION = 300;
export const MAX_LARGO_NOTA = 500;

/** Un renglón tal como lo manda el formulario de asignación. */
export type RequisitoEntrada = {
  id?: number | null;
  descripcion?: unknown;
  cantidad?: unknown;
  /** Producto del catálogo (material de consumo). */
  productId?: unknown;
  /** Herramienta concreta del inventario (por número de serie). */
  toolId?: unknown;
  /** Fuente de la herramienta: KIT o INVENTORY. */
  toolSource?: unknown;
};

export type RequisitoNormalizado = {
  id: number | null;
  descripcion: string;
  cantidad: number;
  productId: number | null;
  toolId: number | null;
  toolSource: 'KIT' | 'INVENTORY' | null;
  orden: number;
};

/** Atajos de la cuadrilla: lo que casi siempre se lleva a una instalación. */
export const PRESETS_HERRAMIENTAS: ReadonlyArray<{ descripcion: string; cantidad: number }> = [
  { descripcion: 'Escalera', cantidad: 1 },
  { descripcion: 'Taladro con brocas', cantidad: 1 },
  { descripcion: 'Ponchadora RJ45', cantidad: 1 },
  { descripcion: 'Probador de red', cantidad: 1 },
  { descripcion: 'Multímetro', cantidad: 1 },
  { descripcion: 'Juego de desarmadores', cantidad: 1 },
  { descripcion: 'Pinzas de electricista', cantidad: 1 },
  { descripcion: 'Arnés de seguridad', cantidad: 1 },
  { descripcion: 'Extensión eléctrica', cantidad: 1 },
  { descripcion: 'Laptop de configuración', cantidad: 1 },
];

function entero(valor: unknown): number | null {
  if (valor == null || valor === '') return null;
  const n = Number(valor);
  return Number.isInteger(n) && n > 0 ? n : null;
}

function cantidadDe(valor: unknown): number {
  if (valor == null || valor === '') return 1;
  const n = Number(valor);
  if (!Number.isFinite(n) || n <= 0) return 1;
  return Math.round((n + Number.EPSILON) * 10_000) / 10_000;
}

/** Quita acentos y espacios de más: «Escalera  de 6m» y «escalera de 6m» son lo mismo. */
export function claveRequisito(descripcion: string): string {
  return descripcion
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Limpia lo que llega del formulario: descarta renglones sin descripción, recorta,
 * quita duplicados (dos veces «Escalera» es un solo renglón) y numera el orden.
 */
export function normalizarRequisitos(entrada: unknown): RequisitoNormalizado[] {
  const lista = Array.isArray(entrada) ? (entrada as RequisitoEntrada[]) : [];
  const vistos = new Set<string>();
  const salida: RequisitoNormalizado[] = [];

  for (const fila of lista) {
    if (!fila || typeof fila !== 'object') continue;
    const descripcion = String(fila.descripcion ?? '').trim().slice(0, MAX_LARGO_DESCRIPCION);
    if (!descripcion) continue;

    const clave = claveRequisito(descripcion);
    if (vistos.has(clave)) continue;
    vistos.add(clave);

    let src: 'KIT' | 'INVENTORY' | null = null;
    if (typeof fila.toolSource === 'string') {
      const s = fila.toolSource.toUpperCase();
      if (s === 'KIT' || s === 'INVENTORY') src = s;
    }

    salida.push({
      id: entero(fila.id),
      descripcion,
      cantidad: cantidadDe(fila.cantidad),
      productId: entero(fila.productId),
      toolId: entero(fila.toolId),
      toolSource: src,
      orden: salida.length,
    });
    if (salida.length >= MAX_REQUISITOS) break;
  }

  return salida;
}

/** Un renglón con su palomeo, tal como lo ven la web y las apps. */
export type RequisitoConCheck = {
  id: number;
  descripcion: string;
  cantidad: number;
  productId: number | null;
  producto: { id: number; sku: string; nombre: string } | null;
  toolId: number | null;
  herramienta: { id: number; nombre: string; serie: string } | null;
  /** Último palomeo. `null` = nadie lo ha revisado. */
  check: {
    ok: boolean;
    nota: string | null;
    fotoUrl: string | null;
    at: string;
    por: { id: number; nombre: string } | null;
  } | null;
};

export type EstadoChecklist = {
  total: number;
  /** Renglones con palomeo «lo traigo y sirve». */
  listos: number;
  /** Descripciones que faltan por revisar o que se marcaron mal. */
  pendientes: string[];
  /** true cuando no queda nada pendiente (o cuando la OT no pide nada). */
  completo: boolean;
};

/**
 * Qué falta del checklist. Un renglón cuenta como listo solo con un palomeo en `ok`:
 * marcarlo «falta o está dañado» es justamente lo que no deja arrancar.
 */
export function estadoChecklist(requisitos: readonly RequisitoConCheck[]): EstadoChecklist {
  const pendientes = requisitos.filter((r) => !r.check?.ok).map((r) => r.descripcion);
  return {
    total: requisitos.length,
    listos: requisitos.length - pendientes.length,
    pendientes,
    completo: pendientes.length === 0,
  };
}

/** Cuántos nombres se enumeran antes de cortar con «y N más». */
const MAX_NOMBRES_EN_MENSAJE = 4;

/**
 * El mensaje que ve quien intenta iniciar sin haber palomeado. Dice exactamente qué
 * falta: «no puedes iniciar» a secas manda al técnico a llamar por teléfono.
 */
export function mensajeChecklistPendiente(pendientes: readonly string[]): string {
  if (!pendientes.length) return '';
  const muestra = pendientes.slice(0, MAX_NOMBRES_EN_MENSAJE).join(', ');
  const resto =
    pendientes.length > MAX_NOMBRES_EN_MENSAJE
      ? ` y ${pendientes.length - MAX_NOMBRES_EN_MENSAJE} más`
      : '';
  const falta = pendientes.length === 1 ? 'Falta' : 'Faltan';
  return `${falta} palomear el checklist de herramientas antes de iniciar: ${muestra}${resto}. Si algo no lo traes o está dañado, márcalo y avisa a tu supervisor.`;
}
