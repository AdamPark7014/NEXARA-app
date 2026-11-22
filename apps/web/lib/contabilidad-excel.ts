import { exportToExcelAsync, type ExcelColumn } from "./export-excel";

/**
 * Los Excel de la mesa contable (buzón SAT, CFDI, por contabilizar).
 *
 * Antes este archivo armaba su propio libro: sin logo ni banda, con la fecha como texto ISO
 * («2026-10-05T00:00:00.000Z»), los estatus como en la base y sin configuración de impresión
 * (las últimas columnas caían en una segunda hoja). Ahora traduce sus columnas y delega en el
 * tema de `export-excel.ts`, el mismo que usan las demás pantallas, así que se ve igual que
 * cualquier otro reporte de NEXARA. La firma no cambia.
 */

export type ColumnaExcel = {
  key: string;
  header: string;
  tipo?: "texto" | "numero" | "fecha" | "moneda";
  ancho?: number;
  /** Clave de la base → lo que se lee (p. ej. `vigente` → «Vigente»). */
  etiquetas?: Record<string, string>;
  /** Texto largo: se ajusta dentro de la columna en vez de alargarla. */
  ajustar?: boolean;
};

export type OpcionesExcelContabilidad = {
  nombreArchivo: string;
  tituloHoja: string;
  /** Título de la banda; por omisión, el de la hoja. */
  titulo?: string;
  /** Se conserva por compatibilidad: la banda ya lleva el logo y el nombre. */
  empresa?: string | null;
  rango?: { desde?: string; hasta?: string } | null;
  columnas: ColumnaExcel[];
  filas: Record<string, unknown>[];
  /** Índices 0-based de columnas numéricas/moneda con TOTAL (fórmula SUM). */
  columnasConTotal?: number[];
  /** Nombre de quien descarga, para «Generado por …». */
  generadoPor?: string | null;
};

const TIPO: Record<NonNullable<ColumnaExcel["tipo"]>, ExcelColumn<Record<string, unknown>>["tipo"]> = {
  texto: "texto",
  numero: "numero",
  fecha: "fecha",
  moneda: "dinero",
};

/** `2026-10-01` → «01/10/2026». Lo que no sea una fecha se devuelve tal cual. */
function diaLegible(ymd: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(ymd.trim());
  return m ? `${m[3]}/${m[2]}/${m[1]}` : ymd;
}

/** El rango de fechas como se lee en una banda: «01/10/2026 al 31/10/2026». */
export function periodoLegible(rango?: { desde?: string; hasta?: string } | null): string | undefined {
  const desde = rango?.desde?.trim();
  const hasta = rango?.hasta?.trim();
  if (desde && hasta) return desde === hasta ? diaLegible(desde) : `${diaLegible(desde)} al ${diaLegible(hasta)}`;
  if (desde) return `Desde el ${diaLegible(desde)}`;
  if (hasta) return `Hasta el ${diaLegible(hasta)}`;
  return undefined;
}

/** Los importes llegan del API como número o como texto («58000.00», «58,000.00»). */
function aNumero(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && v.trim() !== "") {
    const n = Number(v.replace(/,/g, ""));
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

export async function descargarExcelContabilidad(opts: OpcionesExcelContabilidad): Promise<void> {
  const columnas: ExcelColumn<Record<string, unknown>>[] = opts.columnas.map((c, i) => ({
    key: c.key,
    label: c.header,
    tipo: TIPO[c.tipo ?? "texto"],
    total: opts.columnasConTotal?.includes(i) ? "suma" : undefined,
    etiquetas: c.etiquetas,
    ancho: c.ancho,
    ajustar: c.ajustar,
  }));
  const numericas = opts.columnas.filter((c) => c.tipo === "moneda" || c.tipo === "numero").map((c) => c.key);
  // Un importe ilegible deja la celda vacía: antes se escribía 0 y el total parecía cuadrar.
  const filas = opts.filas.map((fila) => {
    const limpia: Record<string, unknown> = { ...fila };
    for (const key of numericas) limpia[key] = aNumero(fila[key]);
    return limpia;
  });
  await exportToExcelAsync(filas, columnas, opts.nombreArchivo.replace(/\.xlsx$/i, ""), {
    title: opts.titulo ?? opts.tituloHoja,
    subtitle: periodoLegible(opts.rango),
    hoja: opts.tituloHoja,
    generadoPor: opts.generadoPor,
  });
}
