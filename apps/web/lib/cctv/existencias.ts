/**
 * Existencias en el diseñador: cuántas hay de cada modelo en Almacén y en CT, y qué lleva la cotización
 * de un diseño. El inventario es el de siempre; aquí no se guarda ninguna pieza.
 */
import { MODELO_GENERICO, type FilaCatalogo, type ModeloCamara, type ModeloEquipo } from "./catalogo";
import type { Balance, GrupoEquipo } from "./sistema";

export type ResumenCt = {
  clave: string;
  nombre: string | null;
  marca: string | null;
  modelo: string | null;
  piezas: number;
  /** En el almacén de CT que nos surte. */
  cerca: number;
  /** De venta, sin IVA, en pesos. */
  precio: number;
  dias: number;
  ligado: "modelo" | "manual";
};

export type Disponibilidad = {
  clave: string;
  almacen: { productId: number; sku: string; piezas: number } | null;
  ct: ResumenCt | null;
};

export type ModeloConsulta = { clave: string; marca: string; modelo: string; productId: number | null; ct: string | null };

/** La clave de CT que alguien eligió para este modelo: se guarda con su ficha. */
export function ctDeFila(f: Pick<FilaCatalogo, "datos"> | null | undefined): string | null {
  const c = (f?.datos?.ficha as { ct?: unknown } | undefined)?.ct;
  return typeof c === "string" && c ? c : null;
}

/** Un tipo genérico («Gabinete 24U») no es un producto: no tiene existencias que buscar. */
export const esModeloReal = (m: { id: string }) => m.id !== MODELO_GENERICO.id && !m.id.startsWith("tipo-");

export function modelosParaConsulta(camaras: readonly ModeloCamara[], equipos: readonly ModeloEquipo[], filas: readonly FilaCatalogo[]): ModeloConsulta[] {
  return [...camaras, ...equipos].filter(esModeloReal).map((m) => {
    const fila = m.id.startsWith("db-") ? filas.find((f) => `db-${f.id}` === m.id) : undefined;
    return { clave: m.id, marca: m.marca, modelo: m.modelo, productId: fila?.productId ?? null, ct: ctDeFila(fila) };
  });
}

const FORMATO_PESOS = new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN", maximumFractionDigits: 0 });

export const pesos = (n: number) => FORMATO_PESOS.format(n);

export type LineaEnviar = ModeloConsulta & { grupo: "EQUIPOS" | "MATERIALES"; nombre: string; descripcion: string; cantidad: number; unidad: string };

export type Renglon = LineaEnviar & {
  almacen: number;
  /** null: no se sabe de CT. */
  enCt: number | null;
  /** De venta, sin IVA. null: no hay precio y hay que capturarlo. */
  precio: number | null;
  /** Lo que falta conseguir después de usar lo de Almacén y lo de CT. */
  faltan: number;
};

/** Los equipos del diseño con lo que hay de cada uno. El cable va en bobinas, sin precio: su tipo lo elige quien cotiza. */
export function renglonesDeCotizacion(
  grupos: readonly GrupoEquipo[],
  balance: Pick<Balance, "bobinas" | "cableM">,
  disponibilidad: ReadonlyMap<string, Disponibilidad>,
  datos: { modeloDe: (clave: string) => { id: string; marca: string; modelo: string; descripcion: string } | null; filas: readonly FilaCatalogo[] },
): Renglon[] {
  const renglones: Renglon[] = grupos.map((g) => {
    // La clave del grupo termina en el id del modelo: `cam|hik-…` o `eq|nvr|db-8`.
    const id = g.clave.split("|").pop() ?? "";
    const m = datos.modeloDe(id);
    const real = m && esModeloReal(m) ? m : null;
    const fila = real?.id.startsWith("db-") ? datos.filas.find((f) => `db-${f.id}` === real.id) : undefined;
    const d = real ? disponibilidad.get(real.id) : undefined;
    const almacen = d?.almacen?.piezas ?? 0;
    const enCt = d?.ct ? d.ct.piezas : null;
    return {
      clave: real?.id ?? g.clave,
      marca: real?.marca ?? "",
      // Sin modelo real se conserva lo que dice el plano: es lo que se le va a mostrar al que cotiza.
      modelo: real?.modelo ?? "",
      productId: fila?.productId ?? null,
      ct: ctDeFila(fila),
      grupo: "EQUIPOS",
      nombre: [g.nombre, real ? `${real.marca} ${real.modelo}`.trim() : g.modelo].filter(Boolean).join(" · "),
      descripcion: real?.descripcion ?? "",
      cantidad: g.cantidad,
      unidad: "pieza",
      almacen,
      enCt,
      precio: d?.ct?.precio ?? null,
      faltan: Math.max(g.cantidad - almacen - (enCt ?? 0), 0),
    };
  });
  if (balance.bobinas > 0) {
    renglones.push({
      clave: "cable-cat6",
      marca: "",
      modelo: "",
      productId: null,
      ct: null,
      grupo: "MATERIALES",
      nombre: "Cable UTP Cat 6, bobina de 305 m",
      descripcion: `${Math.round(balance.cableM)} m de ruta según el diseño`,
      cantidad: balance.bobinas,
      unidad: "bobina",
      almacen: 0,
      enCt: null,
      precio: null,
      faltan: balance.bobinas,
    });
  }
  return renglones;
}

/** Para mandar: sin lo que se calculó aquí. El precio lo pone el servidor. */
export function lineaParaEnviar(r: Renglon): LineaEnviar {
  const { clave, marca, modelo, productId, ct, grupo, nombre, descripcion, cantidad, unidad } = r;
  return { clave, marca, modelo, productId, ct, grupo, nombre, descripcion, cantidad, unidad };
}

export type TotalesCotizacion = { sinIva: number; sinPrecio: number; faltan: number };

export function totalesDe(renglones: readonly Renglon[]): TotalesCotizacion {
  return {
    sinIva: renglones.reduce((s, r) => s + (r.precio ?? 0) * r.cantidad, 0),
    sinPrecio: renglones.filter((r) => r.precio == null).length,
    faltan: renglones.reduce((s, r) => s + (r.grupo === "EQUIPOS" ? r.faltan : 0), 0),
  };
}

/** Las familias de CT que tienen algo que ponerse en un diseño: se buscan por subcategoría. */
export const FAMILIAS_CT: ReadonlyArray<readonly [string, string]> = [
  ["Cámaras", "Cámara"],
  ["Grabadores", "Grabadores"],
  ["Acceso", "Control de Acceso"],
  ["Alarmas", "Alarma"],
  ["Switches", "Switches"],
  ["Servidores", "Servidores"],
  ["UPS", "No Breaks"],
  ["Gabinetes", "Gabinetes"],
];
