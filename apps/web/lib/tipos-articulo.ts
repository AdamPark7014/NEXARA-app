/**
 * Tipos de artículo del almacén (Adam, 07-10-2026).
 *
 * «Una cosa es un taladro, que es uno y uno, y otra un bote de cinchos o una bolsa de
 * taquetes.» Cuatro tipos, y cada uno se cuenta distinto:
 *
 * - HERRAMIENTA: se presta y regresa; una por una, con serie y etiqueta. No es un
 *   producto del catálogo: vive en Herramientas («Nueva herramienta»).
 * - EQUIPO: se instala o se vende; por pieza, serie opcional (cámara, pantalla, NVR).
 * - CONSUMIBLE: se gasta; se cuenta en piezas y se guarda por empaque (bote de 100).
 * - MEDIDA: por metro, en bobina o tramo (cable UTP de 305 m, tubería).
 *
 * Aquí solo hay lectura pura (etiquetas, tono, unidad, textos de existencia y la
 * validación del alta): la UI traduce `id` a su icono en
 * `components/almacen/TipoArticulo.tsx`, igual que `activity-kinds`.
 */
import type { Tone } from "@/components/base";
import { cantidadLegible, empaqueDeCompra, pluralEmpaque, redondear4 } from "@/lib/empaque";

export type TipoArticulo = "HERRAMIENTA" | "EQUIPO" | "CONSUMIBLE" | "MEDIDA";

/** Los tipos que son producto del catálogo (la herramienta no lo es). */
export type TipoProducto = Exclude<TipoArticulo, "HERRAMIENTA">;

export type UnidadBase = "pz" | "m";

export type TipoArticuloMeta = {
  id: TipoArticulo;
  /** «Consumible». */
  etiqueta: string;
  /** Lo que dice el chip del filtro: «Consumibles». */
  plural: string;
  /** Una línea para el alta: qué es y cómo se cuenta. */
  ayuda: string;
  tono: Tone;
  /** Unidad en que se cuenta. La herramienta no tiene: se cuenta por pieza registrada. */
  unidad: UnidadBase | null;
  /** Cómo se llama el empaque en el formulario y qué se propone. `null` = no lleva. */
  empaque: { campo: string; sugerencias: readonly string[]; ejemplo: string } | null;
  /** `false` = no se da de alta como producto (lleva a Herramientas). */
  esProducto: boolean;
};

export const TIPOS_ARTICULO: readonly TipoArticuloMeta[] = [
  {
    id: "HERRAMIENTA",
    etiqueta: "Herramienta",
    plural: "Herramientas",
    ayuda: "Se presta y regresa. Una por una, con serie y etiqueta.",
    tono: "brand",
    unidad: null,
    empaque: null,
    esProducto: false,
  },
  {
    id: "EQUIPO",
    etiqueta: "Equipo",
    plural: "Equipo",
    ayuda: "Se instala o se vende. Se cuenta por pieza; la serie es opcional.",
    tono: "violet",
    unidad: "pz",
    empaque: null,
    esProducto: true,
  },
  {
    id: "CONSUMIBLE",
    etiqueta: "Consumible",
    plural: "Consumibles",
    ayuda: "Se gasta. Se cuenta en piezas y se guarda por empaque.",
    tono: "success",
    unidad: "pz",
    empaque: { campo: "Empaque", sugerencias: ["Bote", "Bolsa", "Caja", "Paquete"], ejemplo: "Bote" },
    esProducto: true,
  },
  {
    id: "MEDIDA",
    etiqueta: "Por medida",
    plural: "Por medida",
    ayuda: "Se mide en metros. Se guarda en bobina, rollo o tramo.",
    tono: "info",
    unidad: "m",
    empaque: { campo: "Presentación", sugerencias: ["Bobina", "Rollo", "Tramo"], ejemplo: "Bobina" },
    esProducto: true,
  },
];

const POR_ID = new Map<TipoArticulo, TipoArticuloMeta>(TIPOS_ARTICULO.map((t) => [t.id, t]));

export const SIN_TIPO = "Sin tipo";

/** Lo que llegue de la API («consumible», " MEDIDA ", null) a un tipo conocido, o `null`. */
export function normalizarTipoArticulo(valor: unknown): TipoArticulo | null {
  if (typeof valor !== "string") return null;
  const limpio = valor.trim().toUpperCase();
  return POR_ID.has(limpio as TipoArticulo) ? (limpio as TipoArticulo) : null;
}

export function metaTipoArticulo(tipo: unknown): TipoArticuloMeta | null {
  const id = normalizarTipoArticulo(tipo);
  return id ? (POR_ID.get(id) ?? null) : null;
}

/** «Consumible», o «Sin tipo» para los productos viejos. */
export function etiquetaTipoArticulo(tipo: unknown): string {
  return metaTipoArticulo(tipo)?.etiqueta ?? SIN_TIPO;
}

export function tonoTipoArticulo(tipo: unknown): Tone {
  return metaTipoArticulo(tipo)?.tono ?? "neutral";
}

/** Unidad base de un producto: la del tipo; sin tipo, la que traiga o piezas. */
export function unidadDeArticulo(tipo: unknown, unitName?: string | null): string {
  const delTipo = metaTipoArticulo(tipo)?.unidad;
  if (delTipo) return delTipo;
  const propia = (unitName ?? "").trim();
  return propia || "pz";
}

// ── Búsqueda rápida: los chips ───────────────────────────────────────

export type TipoBusqueda = "TODOS" | TipoArticulo;

export type FiltroBusqueda = { id: TipoBusqueda; etiqueta: string; deAlmacen: boolean };

/** Todos · Herramientas · Equipo · Consumibles · Por medida (en ese orden). */
export const FILTROS_BUSQUEDA: readonly FiltroBusqueda[] = [
  { id: "TODOS", etiqueta: "Todos", deAlmacen: false },
  ...TIPOS_ARTICULO.map((t) => ({ id: t.id, etiqueta: t.plural, deAlmacen: t.esProducto })),
];

/**
 * Los chips que se pintan. Sin acceso al almacén solo quedan herramientas, y entonces
 * «Todos» y «Herramientas» dirían lo mismo: no se pinta ninguno.
 */
export function filtrosVisibles(incluyeAlmacen: boolean): readonly FiltroBusqueda[] {
  return incluyeAlmacen ? FILTROS_BUSQUEDA : [];
}

export function esTipoBusqueda(valor: unknown): valor is TipoBusqueda {
  return valor === "TODOS" || normalizarTipoArticulo(valor) === valor;
}

// ── Existencia con su empaque ────────────────────────────────────────

export type EmpaqueBase = { nombre: string; piezasPorUnidad: number | string };

/** «1 bote = 100 pz», «1 bobina = 305 m». `null` mientras falte el nombre o la cifra. */
export function previaEmpaque(nombre: string, capacidad: unknown, unidad: string): string | null {
  const limpio = nombre.trim();
  const n = Number(capacidad);
  if (!limpio || capacidad === "" || capacidad == null || !Number.isFinite(n) || n <= 0) return null;
  return `1 ${pluralEmpaque(limpio, 1)} = ${cantidadLegible(n)} ${unidad}`;
}

/**
 * Existencia contada en empaques: «3 botes + 40 pz (340 pz)», «2 bobinas + 120 m (730 m)»,
 * «4 pz», «Sin existencia». Con `conTotal: false` se omite el paréntesis (listas angostas).
 * Es el mismo texto que arma la API para la búsqueda rápida.
 */
export function textoExistencia(
  cantidad: number | string | null | undefined,
  empaque: EmpaqueBase | null | undefined,
  unidad = "pz",
  opciones: { conTotal?: boolean } = {},
): string {
  const conTotal = opciones.conTotal ?? true;
  const total = redondear4(Number(cantidad ?? 0) || 0);
  if (total === 0) return "Sin existencia";
  const base = `${cantidadLegible(total)} ${unidad}`;
  const capacidad = Number(empaque?.piezasPorUnidad);
  const nombre = (empaque?.nombre ?? "").trim();
  if (total < 0 || !nombre || !Number.isFinite(capacidad) || capacidad <= 0) return base;
  const completos = Math.floor(redondear4(total / capacidad));
  if (completos < 1) return base;
  const resto = redondear4(total - completos * capacidad);
  const empaques = `${completos} ${pluralEmpaque(nombre, completos)}`;
  const partes = resto > 0 ? `${empaques} + ${cantidadLegible(resto)} ${unidad}` : empaques;
  return conTotal ? `${partes} (${base})` : partes;
}

/**
 * La cifra de la columna «Existencia» de las listas: «3 botes + 40 pz», «12 m», «0 pz».
 * En cero no dice «Sin existencia»: al lado ya va el semáforo («Agotado»).
 */
export function existenciaCorta(
  cantidad: number | string | null | undefined,
  empaque: EmpaqueBase | null | undefined,
  unidad = "pz",
): string {
  const total = redondear4(Number(cantidad ?? 0) || 0);
  if (total === 0) return `0 ${unidad}`;
  return textoExistencia(total, empaque, unidad, { conTotal: false });
}

/**
 * El empaque con que se cuenta un producto, tal como lo manda la API (`packagings` de
 * Prisma o `empaques`): el marcado para compra o, si no, el más grande. `null` si no trae.
 */
export function empaqueDeProducto(producto: unknown): EmpaqueBase | null {
  if (!producto || typeof producto !== "object") return null;
  const p = producto as { packagings?: unknown; empaques?: unknown };
  const lista = Array.isArray(p.packagings) ? p.packagings : Array.isArray(p.empaques) ? p.empaques : [];
  const validos = (lista as Array<Record<string, unknown> | null>)
    .filter((e): e is Record<string, unknown> => Boolean(e) && typeof e === "object")
    .map((e) => ({
      nombre: typeof e.nombre === "string" ? e.nombre.trim() : "",
      piezasPorUnidad: Number(e.piezasPorUnidad),
      esDefaultCompra: e.esDefaultCompra === true,
    }))
    .filter((e) => e.nombre && Number.isFinite(e.piezasPorUnidad) && e.piezasPorUnidad > 0);
  const elegido = empaqueDeCompra(validos);
  return elegido ? { nombre: elegido.nombre, piezasPorUnidad: elegido.piezasPorUnidad } : null;
}

// ── Alta / edición de artículo ───────────────────────────────────────

export type FormArticulo = {
  tipo: TipoArticulo | null;
  nombre: string;
  sku: string;
  categoria: string;
  /** «Bote», «Bobina». Solo consumible y por medida. */
  empaqueNombre: string;
  /** Cuántas piezas (o metros) trae. Texto tal cual lo teclean. */
  empaqueCapacidad: string;
};

export const FORM_ARTICULO_VACIO: FormArticulo = {
  tipo: null,
  nombre: "",
  sku: "",
  categoria: "",
  empaqueNombre: "",
  empaqueCapacidad: "",
};

export type CampoArticulo = "tipo" | "nombre" | "empaqueNombre" | "empaqueCapacidad";

/** Lo que se manda a `POST/PATCH catalog/products`. */
export type PayloadArticulo = {
  name: string;
  sku?: string;
  category?: string;
  tipoArticulo: TipoProducto;
  unitName?: UnidadBase;
  empaque?: { nombre: string; capacidad: number };
};

export type ValidacionArticulo =
  | { ok: true; payload: PayloadArticulo }
  | { ok: false; errores: Partial<Record<CampoArticulo, string>> };

/** El formulario de edición con lo que ya tiene el producto. */
export function formArticuloDeProducto(
  producto: { tipoArticulo?: unknown; name?: string | null; sku?: string | null; category?: string | null },
  empaque?: EmpaqueBase | null,
): FormArticulo {
  const tipo = normalizarTipoArticulo(producto.tipoArticulo);
  const categoria = (producto.category ?? "").trim();
  const conEmpaque = Boolean(tipo && metaTipoArticulo(tipo)?.empaque && empaque?.nombre);
  return {
    tipo,
    nombre: (producto.name ?? "").trim(),
    sku: (producto.sku ?? "").trim(),
    // La API pone «—» cuando el producto no tiene categoría.
    categoria: categoria === "—" ? "" : categoria,
    empaqueNombre: conEmpaque ? (empaque?.nombre ?? "") : "",
    empaqueCapacidad: conEmpaque ? cantidadLegible(Number(empaque?.piezasPorUnidad)) : "",
  };
}

/**
 * Revisa el formulario y arma lo que va a la API. En el alta manda la unidad del tipo
 * (pz o m) y el SKU si lo escribieron; al editar no manda ninguno de los dos: la unidad
 * la ajusta la API (sin pisar una capturada a mano) y el SKU no se cambia por aquí.
 */
export function validarArticulo(form: FormArticulo, modo: "alta" | "editar" = "alta"): ValidacionArticulo {
  const errores: Partial<Record<CampoArticulo, string>> = {};
  const meta = metaTipoArticulo(form.tipo);
  if (!meta) errores.tipo = "Elige el tipo de artículo.";
  else if (!meta.esProducto) errores.tipo = "Las herramientas se dan de alta en Herramientas.";

  const nombre = form.nombre.trim();
  if (!nombre) errores.nombre = "Escribe el nombre del artículo.";

  let empaque: PayloadArticulo["empaque"];
  if (meta?.empaque) {
    const nombreEmpaque = form.empaqueNombre.trim();
    const textoCapacidad = form.empaqueCapacidad.trim();
    const capacidad = Number(textoCapacidad);
    const cuantos = meta.unidad === "m" ? "cuántos metros" : "cuántas piezas";
    if (nombreEmpaque || textoCapacidad) {
      if (!nombreEmpaque) {
        errores.empaqueNombre = `Escribe el ${meta.empaque.campo.toLowerCase()} (${meta.empaque.sugerencias.join(", ")}…).`;
      }
      if (!textoCapacidad || !Number.isFinite(capacidad) || capacidad <= 0) {
        errores.empaqueCapacidad = `Escribe ${cuantos} trae.`;
      }
      if (!errores.empaqueNombre && !errores.empaqueCapacidad) {
        empaque = { nombre: nombreEmpaque, capacidad: redondear4(capacidad) };
      }
    }
  }

  if (Object.keys(errores).length > 0 || !meta || !meta.esProducto) return { ok: false, errores };

  const payload: PayloadArticulo = { name: nombre, tipoArticulo: meta.id as TipoProducto };
  const sku = form.sku.trim();
  if (sku && modo === "alta") payload.sku = sku;
  const categoria = form.categoria.trim();
  if (categoria) payload.category = categoria;
  if (modo === "alta" && meta.unidad) payload.unitName = meta.unidad;
  if (empaque) payload.empaque = empaque;
  return { ok: true, payload };
}
