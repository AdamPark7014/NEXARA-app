/**
 * Ligas del chat (web): qué se puede ligar, cómo se reconoce en un mensaje y qué pide al API.
 *
 * El token guardado es el de siempre, `[etiqueta](/erp/…)`, con la ruta de la pantalla del
 * registro. La tabla de rutas es la misma que `apps/api/src/chat/ligas/ligas.ts`: si cambia una,
 * cambian las dos. Los datos de la tarjeta los da `POST chat/ligas` con los permisos de quien
 * mira (sin acceso, solo el título genérico).
 */
import { detectarFolios, MAX_TARJETAS } from "@/components/chat/folios";

export type TipoLiga =
  | "actividad"
  | "evidencia"
  | "cotizacion"
  | "cliente"
  | "proyecto"
  | "asistencia"
  | "viatico"
  | "factura";

/** Pestañas del selector «Ligar» (`GET chat/mentions?kind=`). `USER` es mencionar a una persona. */
export type KindLiga =
  | "USER"
  | "ACTIVITY"
  | "EVIDENCE"
  | "QUOTE"
  | "CLIENT"
  | "PROJECT"
  | "ATTENDANCE"
  | "VIATIC"
  | "INVOICE";

export const ETIQUETA_TIPO: Record<TipoLiga, string> = {
  actividad: "Actividad",
  evidencia: "Evidencia",
  cotizacion: "Cotización",
  cliente: "Cliente",
  proyecto: "Proyecto",
  asistencia: "Asistencia",
  viatico: "Viático",
  factura: "Factura",
};

export type PestanaLigar = { kind: KindLiga; etiqueta: string; buscar: string };

/** Orden del selector: lo que más se liga primero. */
export const PESTANAS_LIGAR: PestanaLigar[] = [
  { kind: "ACTIVITY", etiqueta: "Actividades", buscar: "Buscar por AN, título o estado…" },
  { kind: "USER", etiqueta: "Personas", buscar: "Buscar por nombre o correo…" },
  { kind: "QUOTE", etiqueta: "Cotizaciones", buscar: "Folio, cliente o proyecto…" },
  { kind: "ATTENDANCE", etiqueta: "Asistencia", buscar: "¿De quién? (hoy)" },
  { kind: "CLIENT", etiqueta: "Clientes", buscar: "Nombre o razón social…" },
  { kind: "PROJECT", etiqueta: "Proyectos", buscar: "Proyecto o cliente…" },
  { kind: "EVIDENCE", etiqueta: "Evidencias", buscar: "Evidencia, actividad o comentario…" },
  { kind: "VIATIC", etiqueta: "Viáticos", buscar: "Motivo, categoría o persona…" },
  { kind: "INVOICE", etiqueta: "Facturas", buscar: "Folio o cliente…" },
];

/** Tipo de la liga a partir de su ruta, o `null` si no es una liga conocida. */
export function tipoDeRuta(href: string): TipoLiga | null {
  const limpio = String(href ?? "").trim();
  if (!limpio.startsWith("/erp/")) return null;
  const [ruta, query = ""] = limpio.split("?", 2);
  const p = ruta.replace(/\/+$/, "");
  const params = new URLSearchParams(query);
  if (/^\/erp\/actividades\/\d+\/evidencias$/.test(p)) return "evidencia";
  if (/^\/erp\/actividades\/\d+$/.test(p)) return "actividad";
  if (/^\/erp\/cotizaciones\/\d+$/.test(p)) return "cotizacion";
  if (/^\/erp\/clientes\/\d+$/.test(p)) return "cliente";
  if (/^\/erp\/proyectos\/\d+$/.test(p)) return "proyecto";
  if (/^\/erp\/asistencias\/indicadores\/\d+$/.test(p) && /^\d{4}-\d{2}-\d{2}$/.test(params.get("desde") ?? "")) {
    return "asistencia";
  }
  if (p === "/erp/finance/viatics" && /^\d+$/.test(params.get("highlight") ?? "")) return "viatico";
  if (/^\/erp\/invoicing\/\d+$/.test(p)) return "factura";
  return null;
}

export type RefLiga = {
  /** Lo que se manda al API: la ruta de la liga o `folio:AN-0031`. */
  ref: string;
  tipo: TipoLiga;
  /** Folio que ya se lee en el mensaje, para la tarjeta mientras carga. */
  folio: string | null;
};

const TOKEN = /\[([^\]\n]+)\]\((\/[^)\s]*)\)/g;

/**
 * Ligas del mensaje en orden, sin repetir y con tope: primero las pastillas (traen la ruta exacta)
 * y luego los folios escritos sueltos que no venían ya en una pastilla.
 */
export function refsDelMensaje(body: string, max = MAX_TARJETAS): RefLiga[] {
  const texto = String(body ?? "");
  const out: RefLiga[] = [];
  const vistos = new Set<string>();
  const foliosCubiertos = new Set<string>();

  for (const m of texto.matchAll(TOKEN)) {
    const [, etiqueta, href] = m;
    const tipo = tipoDeRuta(href!);
    if (!tipo || vistos.has(href!)) continue;
    vistos.add(href!);
    const folio = /^(AN-\d{3,})/i.exec(etiqueta!.trim())?.[1]?.toUpperCase() ?? null;
    if (folio) foliosCubiertos.add(folio);
    const folioCot = /^(NEX-\S+|NXR-\S+)/i.exec(etiqueta!.trim())?.[1]?.toUpperCase() ?? null;
    if (folioCot) foliosCubiertos.add(folioCot);
    out.push({ ref: href!, tipo, folio: folio ?? folioCot });
  }

  for (const f of detectarFolios(texto, 10)) {
    if (f.id || foliosCubiertos.has(f.folio)) continue;
    const ref = `folio:${f.folio}`;
    if (vistos.has(ref)) continue;
    vistos.add(ref);
    out.push({ ref, tipo: f.tipo, folio: f.folio });
  }
  return out.slice(0, max);
}

/** Tarjeta que arma el API (`POST chat/ligas`), ya filtrada por los permisos de quien la ve. */
export type TarjetaLiga = {
  ref: string;
  tipo: TipoLiga;
  acceso: boolean;
  folio: string | null;
  titulo: string;
  estado: string | null;
  detalle: string[];
  monto: { total: number; moneda: string } | null;
  href: string;
  motivo?: string;
};

/** Ruta de la pantalla «lista» de cada tipo, para la tarjeta que no pudo cargarse. */
export const LISTA_DE_TIPO: Record<TipoLiga, string> = {
  actividad: "/erp/actividades",
  evidencia: "/erp/actividades",
  cotizacion: "/erp/cotizaciones",
  cliente: "/erp/clientes",
  proyecto: "/erp/proyectos",
  asistencia: "/erp/asistencias",
  viatico: "/erp/finance/viatics",
  factura: "/erp/invoicing",
};
