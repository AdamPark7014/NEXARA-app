/**
 * Búsqueda rápida de inventario: una sola caja para herramientas y artículos de almacén
 * (`GET tool-requests/busqueda-rapida`).
 *
 * Sirve a todo el personal: quien no tiene `stock.view` recibe solo herramientas
 * (`incluyeAlmacen: false`). Aquí está el cliente, los tipos de la respuesta y las
 * reglas puras que usa la caja (qué abre el Enter del lector, qué error se enseña).
 */
import { erpFetch, formatApiError } from "@/lib/erp-api";
import { normalizarTipoArticulo, type TipoArticulo, type TipoBusqueda } from "@/lib/tipos-articulo";

export type TonoBusqueda = "success" | "warning" | "danger" | "neutral";

export type PiezaDeHerramienta = {
  id: number;
  codigo: string | null;
  estado: string;
  quienLaTiene: string | null;
};

export type ResultadoBusqueda = {
  origen: "herramienta" | "articulo";
  /** Herramienta: la primera pieza del grupo. Artículo: el `productId`. */
  id: number;
  tipo: TipoArticulo | null;
  nombre: string;
  /** Modelo · marca · SKU, en gris. */
  detalle: string | null;
  codigo: string | null;
  codigoBarras: string | null;
  imagenUrl: string | null;
  /** Herramientas: «2 disponibles · 1 prestada». */
  estado: { texto: string; tono: TonoBusqueda } | null;
  /** Artículos: «3 botes + 40 pz (340 pz)». */
  existencia: { cantidad: number; unidad: string; texto: string; bajoMinimo: boolean } | null;
  ubicacion: string | null;
  piezas?: PiezaDeHerramienta[];
  href: string;
};

export type ConteosBusqueda = Record<TipoBusqueda | "SIN_TIPO", number>;

export type RespuestaBusqueda = {
  q: string;
  tipo: TipoBusqueda;
  incluyeAlmacen: boolean;
  conteos: ConteosBusqueda;
  resultados: ResultadoBusqueda[];
};

const CONTEOS_VACIOS: ConteosBusqueda = {
  TODOS: 0,
  HERRAMIENTA: 0,
  EQUIPO: 0,
  CONSUMIBLE: 0,
  MEDIDA: 0,
  SIN_TIPO: 0,
};

const TONOS = new Set<TonoBusqueda>(["success", "warning", "danger", "neutral"]);

function texto(valor: unknown): string | null {
  if (typeof valor === "string") return valor.trim() || null;
  if (typeof valor === "number" && Number.isFinite(valor)) return String(valor);
  return null;
}

function numero(valor: unknown, porOmision = 0): number {
  const n = Number(valor);
  return Number.isFinite(n) ? n : porOmision;
}

function resultado(crudo: unknown): ResultadoBusqueda | null {
  if (!crudo || typeof crudo !== "object") return null;
  const r = crudo as Record<string, unknown>;
  const nombre = texto(r.nombre);
  const href = texto(r.href);
  if (!nombre || !href) return null;
  const origen = r.origen === "herramienta" ? "herramienta" : "articulo";
  const estadoCrudo = r.estado as { texto?: unknown; tono?: unknown } | null | undefined;
  const existenciaCruda = r.existencia as Record<string, unknown> | null | undefined;
  const tono = TONOS.has(estadoCrudo?.tono as TonoBusqueda) ? (estadoCrudo?.tono as TonoBusqueda) : "neutral";
  return {
    origen,
    id: numero(r.id),
    tipo: origen === "herramienta" ? "HERRAMIENTA" : normalizarTipoArticulo(r.tipo),
    nombre,
    detalle: texto(r.detalle),
    codigo: texto(r.codigo),
    codigoBarras: texto(r.codigoBarras),
    imagenUrl: texto(r.imagenUrl),
    estado: estadoCrudo && texto(estadoCrudo.texto) ? { texto: texto(estadoCrudo.texto) as string, tono } : null,
    existencia:
      existenciaCruda && texto(existenciaCruda.texto)
        ? {
            cantidad: numero(existenciaCruda.cantidad),
            unidad: texto(existenciaCruda.unidad) ?? "pz",
            texto: texto(existenciaCruda.texto) as string,
            bajoMinimo: existenciaCruda.bajoMinimo === true,
          }
        : null,
    ubicacion: texto(r.ubicacion),
    piezas: Array.isArray(r.piezas)
      ? (r.piezas as Array<Record<string, unknown>>).map((p) => ({
          id: numero(p?.id),
          codigo: texto(p?.codigo),
          estado: texto(p?.estado) ?? "",
          quienLaTiene: texto(p?.quienLaTiene),
        }))
      : undefined,
    href,
  };
}

/** Acepta la respuesta aunque le falten piezas: lo que no viene se pinta vacío, no truena. */
export function normalizarRespuesta(crudo: unknown, pedido: { q: string; tipo: TipoBusqueda }): RespuestaBusqueda {
  const r = (crudo && typeof crudo === "object" ? crudo : {}) as Record<string, unknown>;
  const conteosCrudos = (r.conteos && typeof r.conteos === "object" ? r.conteos : {}) as Record<string, unknown>;
  const conteos = { ...CONTEOS_VACIOS };
  for (const clave of Object.keys(CONTEOS_VACIOS) as Array<keyof ConteosBusqueda>) {
    conteos[clave] = numero(conteosCrudos[clave]);
  }
  const resultados = Array.isArray(r.resultados)
    ? (r.resultados as unknown[]).map(resultado).filter((x): x is ResultadoBusqueda => x !== null)
    : [];
  return {
    q: typeof r.q === "string" ? r.q : pedido.q,
    tipo: pedido.tipo,
    incluyeAlmacen: r.incluyeAlmacen === true,
    conteos,
    resultados,
  };
}

export async function buscarInventario(
  token: string,
  pedido: { q: string; tipo?: TipoBusqueda; limite?: number },
  signal?: AbortSignal,
): Promise<RespuestaBusqueda> {
  const tipo = pedido.tipo ?? "TODOS";
  const qs = new URLSearchParams({ q: pedido.q.trim(), tipo, limite: String(pedido.limite ?? 30) });
  const crudo = await erpFetch<unknown>(`tool-requests/busqueda-rapida?${qs.toString()}`, token, { signal });
  return normalizarRespuesta(crudo, { q: pedido.q.trim(), tipo });
}

function normalizarCodigo(valor: string | null | undefined): string {
  return String(valor ?? "").trim().toUpperCase();
}

/**
 * Lo que abre el Enter (el lector de códigos teclea el código y un Enter): el resultado
 * cuyo código, código de barras o pieza coincide exacto. Si no hay coincidencia exacta
 * pero el texto parece un código (sin espacios) y solo hay un resultado, ese.
 */
export function resultadoParaAbrir(resultados: readonly ResultadoBusqueda[], q: string): ResultadoBusqueda | null {
  const buscado = normalizarCodigo(q);
  if (!buscado) return null;
  const exacto = resultados.find(
    (r) =>
      normalizarCodigo(r.codigo) === buscado ||
      normalizarCodigo(r.codigoBarras) === buscado ||
      (r.piezas ?? []).some((p) => normalizarCodigo(p.codigo) === buscado),
  );
  if (exacto) return exacto;
  if (!/\s/.test(buscado) && resultados.length === 1) return resultados[0];
  return null;
}

/**
 * Quién trae las piezas prestadas de una herramienta, para la línea gris del resultado:
 * «Con Juan Pérez», «Con Juan Pérez y Ana López», «Con Juan Pérez, Ana López y 2 más».
 */
export function quienesLaTienen(piezas: readonly PiezaDeHerramienta[] | undefined): string | null {
  const nombres = [...new Set((piezas ?? []).map((p) => (p.quienLaTiene ?? "").trim()).filter(Boolean))];
  if (nombres.length === 0) return null;
  if (nombres.length === 1) return `Con ${nombres[0]}`;
  if (nombres.length === 2) return `Con ${nombres[0]} y ${nombres[1]}`;
  return `Con ${nombres[0]}, ${nombres[1]} y ${nombres.length - 2} más`;
}

/**
 * A dónde lleva un resultado. A la herramienta se le suma `q=<nombre>` para que
 * Herramientas abra su inventario ya filtrado a ese grupo (la API solo manda el id).
 */
export function hrefParaAbrir(r: Pick<ResultadoBusqueda, "origen" | "href" | "nombre">): string {
  if (r.origen !== "herramienta" || !r.href.startsWith("/")) return r.href;
  const [ruta, query = ""] = r.href.split("?");
  const params = new URLSearchParams(query);
  if (!params.has("q")) params.set("q", r.nombre);
  return `${ruta}?${params.toString()}`;
}

/** `true` si el enlace cae en la misma página (solo cambia la query): ahí no basta con navegar. */
export function esMismaPagina(href: string, pathname: string | null | undefined): boolean {
  if (!pathname || !href.startsWith("/")) return false;
  const ruta = href.split(/[?#]/)[0].replace(/\/+$/, "") || "/";
  return ruta === (pathname.replace(/\/+$/, "") || "/");
}

/** Lee el id de un parámetro de la URL (`?producto=3`). `null` si no es un entero positivo. */
export function idDeParametro(href: string, nombre: string): number | null {
  const query = href.split("?")[1]?.split("#")[0] ?? "";
  const n = Number(new URLSearchParams(query).get(nombre));
  return Number.isInteger(n) && n > 0 ? n : null;
}

/** Sin permiso para la búsqueda: la caja no se pinta (no es un error que el usuario pueda arreglar). */
export function esErrorSinAcceso(err: unknown): boolean {
  const crudo = err instanceof Error ? err.message : typeof err === "string" ? err : "";
  return /\b403\b|Forbidden/i.test(crudo);
}

/** El aviso que se enseña cuando la búsqueda falla. Un 404 es que el servidor aún no la tiene. */
export function mensajeErrorBusqueda(err: unknown): string {
  const crudo = err instanceof Error ? err.message : typeof err === "string" ? err : "";
  if (/\b404\b|Cannot GET|Not Found/i.test(crudo)) {
    return "La búsqueda rápida todavía no está disponible. Usa las listas de abajo mientras tanto.";
  }
  if (/\b403\b|Forbidden/i.test(crudo)) return "No tienes acceso a la búsqueda de inventario.";
  return formatApiError(err, "No se pudo buscar en el inventario. Intenta de nuevo.");
}
