import { triggerBlobDownload } from "./file-download";

/**
 * NEXARA · Tema Excel corporativo (cliente).
 *
 * Gemelo de `apps/api/src/common/excel/reporte-excel.ts`: mismos colores, misma banda de
 * título, mismo encabezado teal, mismos formatos. Lo que se descarga desde un botón de la
 * interfaz y lo que se descarga desde un endpoint tienen que verse igual.
 *
 * La firma pública `exportToExcel(rows, columns, filename, titleOrOptions?)` no cambia:
 * la usan ~60 pantallas y todas heredan el estilo nuevo sin tocarlas. Lo que se agrega es
 * opcional (`filtros`, `totales`, `generadoPor`, `hoja`, `tipo` por columna).
 */

/** Paleta compartida con el tema del API. */
const NX = {
  teal: "FF1F9E84",
  tealTenue: "FFF1F8F6",
  navy: "FF0B1320",
  texto: "FF0F172A",
  gris: "FF64748B",
  grisSuave: "FF94A3B8",
  filete: "FFE2E8F0",
  blanco: "FFFFFFFF",
} as const;

const FUENTE = "Segoe UI";
const ANCHO_MIN = 10;
const ANCHO_MAX = 46;
/** Logo servido por Next desde `public/`. */
const LOGO_URL = "/logo-nexara.png";

export type ExcelColumnType =
  | "texto"
  | "entero"
  | "numero"
  | "dinero"
  | "porcentaje"
  | "fecha"
  | "fechaHora"
  | "duracion"
  | "booleano";

export type ExcelColumn<T extends object> = {
  key: keyof T;
  label: string;
  /** Texto ya formateado. Manda sobre `tipo`; es lo que usan las pantallas existentes. */
  format?: (val: T[keyof T], row: T) => string;
  /** Formato de celda nativo de Excel (número/fecha reales, no texto). */
  tipo?: ExcelColumnType;
  /** Fórmula real al pie de la columna. */
  total?: "suma" | "promedio" | "cuenta";
  /** Moneda ISO para `tipo: "dinero"` (por omisión MXN), o la columna que la trae. */
  moneda?: string;
  monedaDe?: keyof T;
  /** Traducción de claves de enum a la etiqueta que muestra la UI. */
  etiquetas?: Record<string, string>;
  ancho?: number;
};

export type ExcelExportOptions = {
  /** Título del reporte (default: filename legible) */
  title?: string;
  /** Subtítulo bajo el título, p.ej. el periodo cubierto */
  subtitle?: string;
  /** Filas de resumen (label/value) mostradas antes de la tabla */
  summaryRows?: Array<{ label: string; value: string | number }>;
  /** Filtros aplicados: van en la banda y en la hoja «Información». */
  filtros?: Array<{ etiqueta: string; valor: string | number | null | undefined }>;
  /** Notas al pie del reporte (hoja «Información»). */
  notas?: string[];
  /** Nombre de quien descarga, para «Generado por …». */
  generadoPor?: string | null;
  /** Nombre de la pestaña (por omisión, el título recortado). */
  hoja?: string;
};

const CLAVES_DINERO = ["total", "monto", "precio", "amount", "cost", "importe", "valor", "subtotal", "saldo"];

const isCurrencyKey = (key: string) => {
  const k = key.toLowerCase();
  return CLAVES_DINERO.some((c) => k.includes(c));
};

/**
 * Exporta una lista de objetos a Excel (.xlsx) con la identidad NEXARA y
 * dispara la descarga en el navegador. Mismo contrato que el viejo exportToCsv
 * (fire-and-forget, no requiere await en el call site).
 *
 * @param rows    - Array de objetos planos a exportar
 * @param columns - Definición de columnas: { key, label, format?, tipo?, total? }
 * @param filename - Nombre del archivo sin extensión (se añade .xlsx)
 * @param titleOrOptions - Título del reporte, u opciones { title, subtitle, filtros, … }
 */
export function exportToExcel<T extends object>(
  rows: T[],
  columns: ExcelColumn<T>[],
  filename: string,
  titleOrOptions?: string | ExcelExportOptions,
): void {
  const options = typeof titleOrOptions === "string" ? { title: titleOrOptions } : (titleOrOptions ?? {});
  void buildAndDownload(rows, columns, filename, options).catch((err) => {
    console.error("exportToExcel failed:", err);
  });
}

// ─────────────────────────────────────────────────────────── formato de valores

/** `EN_PROCESO` → «En proceso». Red de seguridad cuando no se pasa `etiquetas`. */
function etiquetaGenerica(valor: string): string {
  const texto = valor.replace(/[_-]+/g, " ").replace(/([a-z\d])([A-Z])/g, "$1 $2").trim().toLowerCase();
  return texto ? texto.charAt(0).toUpperCase() + texto.slice(1) : valor;
}

const pareceFecha = (v: unknown) =>
  v instanceof Date || (typeof v === "string" && /^\d{4}-\d{2}-\d{2}([T ]|$)/.test(v.trim()));

/**
 * Fecha lista para ExcelJS, que serializa usando los componentes **UTC** del `Date`.
 *
 * Un `AAAA-MM-DD` ya es hora de pared: `new Date("2026-09-01")` lo lee como medianoche UTC
 * y en México se convertía en el 31/08 a las 18:00. Se construye directo en UTC. Para un
 * instante completo se desplaza la hora local del navegador a los componentes UTC, que es
 * lo que Excel acabará mostrando.
 */
function aFechaExcel(valor: string | Date): Date | null {
  if (typeof valor === "string") {
    const soloFecha = /^(\d{4})-(\d{2})-(\d{2})$/.exec(valor.trim());
    if (soloFecha) {
      return new Date(Date.UTC(Number(soloFecha[1]), Number(soloFecha[2]) - 1, Number(soloFecha[3])));
    }
  }
  const d = valor instanceof Date ? valor : new Date(valor);
  if (Number.isNaN(d.getTime())) return null;
  return new Date(
    Date.UTC(d.getFullYear(), d.getMonth(), d.getDate(), d.getHours(), d.getMinutes(), d.getSeconds()),
  );
}

/**
 * Día de calendario para una columna `fecha`.
 *
 * Las columnas `@db.Date` del API (`issueDate`, `endDate`, `dueDate`…) llegan como
 * medianoche UTC: son días, no instantes. Convertirlas a hora local las mandaba al día
 * anterior y una factura del 5 aparecía emitida el 4.
 */
function aDiaExcel(valor: string | Date): Date | null {
  const d = valor instanceof Date ? valor : new Date(valor);
  if (!Number.isNaN(d.getTime()) && d.getTime() % 86_400_000 === 0) {
    return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  }
  return aFechaExcel(valor);
}

const formatoDinero = (moneda: string) => {
  const codigo = (moneda || "MXN").toUpperCase();
  return codigo === "MXN" ? '"$" #,##0.00' : `"$" #,##0.00 "${codigo}"`;
};

const FORMATO = {
  entero: "#,##0",
  numero: "#,##0.00",
  porcentaje: "0 %",
  fecha: "dd/mm/yyyy",
  fechaHora: "dd/mm/yyyy hh:mm",
  duracion: "[h]:mm",
} as const;

type Celda = {
  valor: string | number | boolean | Date | null;
  formato?: string;
  alinear: "left" | "right" | "center";
  texto: string;
};

function prepararCelda<T extends object>(columna: ExcelColumn<T>, fila: T): Celda {
  const crudo = fila[columna.key];

  // `format` es el contrato viejo: devuelve texto ya listo y manda sobre todo lo demás.
  if (columna.format) {
    const texto = columna.format(crudo, fila);
    const tipo = columna.tipo;
    if (tipo && tipo !== "texto" && tipo !== "booleano") {
      const n = Number(String(texto).replace(/[^0-9.-]/g, ""));
      if (Number.isFinite(n)) return numerica(columna, fila, n, texto);
    }
    return { valor: texto, alinear: "left", texto };
  }

  if (crudo === null || crudo === undefined || crudo === "") {
    return { valor: null, alinear: columna.tipo && columna.tipo !== "texto" ? "right" : "left", texto: "" };
  }

  switch (columna.tipo) {
    case "fecha":
    case "fechaHora": {
      if (!pareceFecha(crudo)) break;
      const soloFecha = columna.tipo === "fecha";
      const d = soloFecha ? aDiaExcel(crudo as string | Date) : aFechaExcel(crudo as string | Date);
      if (!d) break;
      return {
        valor: d,
        formato: soloFecha ? FORMATO.fecha : FORMATO.fechaHora,
        alinear: "center",
        texto: soloFecha ? "00/00/0000" : "00/00/0000 00:00",
      };
    }
    case "booleano": {
      const texto = crudo === true || crudo === 1 || crudo === "true" ? "Sí" : "No";
      return { valor: texto, alinear: "center", texto };
    }
    case "dinero":
    case "porcentaje":
    case "duracion":
    case "entero":
    case "numero": {
      const n = Number(crudo);
      if (!Number.isFinite(n)) break;
      return numerica(columna, fila, n);
    }
    default:
      break;
  }

  if (typeof crudo === "boolean") {
    const texto = crudo ? "Sí" : "No";
    return { valor: texto, alinear: "center", texto };
  }
  if (crudo instanceof Date) {
    return {
      valor: aFechaExcel(crudo),
      formato: FORMATO.fechaHora,
      alinear: "center",
      texto: "00/00/0000 00:00",
    };
  }
  if (typeof crudo === "number") {
    const formato = isCurrencyKey(String(columna.key)) ? formatoDinero("MXN") : FORMATO.numero;
    return { valor: crudo, formato, alinear: "right", texto: crudo.toLocaleString("es-MX") };
  }

  // Cadenas: si la columna es de dinero y el valor es numérico, va como número.
  const bruto = String(crudo);
  if (isCurrencyKey(String(columna.key))) {
    const n = Number(bruto);
    if (bruto.trim() !== "" && Number.isFinite(n)) {
      return { valor: n, formato: formatoDinero("MXN"), alinear: "right", texto: `$ ${n.toFixed(2)}` };
    }
  }
  const etiqueta =
    columna.etiquetas?.[bruto] ??
    columna.etiquetas?.[bruto.toUpperCase()] ??
    (columna.etiquetas ? etiquetaGenerica(bruto) : bruto);
  return { valor: etiqueta, alinear: "left", texto: etiqueta };
}

function numerica<T extends object>(columna: ExcelColumn<T>, fila: T, n: number, texto?: string): Celda {
  switch (columna.tipo) {
    case "dinero": {
      const moneda =
        (columna.monedaDe ? String(fila[columna.monedaDe] ?? "") : "") || columna.moneda || "MXN";
      return { valor: n, formato: formatoDinero(moneda), alinear: "right", texto: texto ?? `$ ${n.toFixed(2)}` };
    }
    case "porcentaje":
      // Fracción, para que Excel lo trate como porcentaje de verdad.
      return { valor: n / 100, formato: FORMATO.porcentaje, alinear: "right", texto: `${Math.round(n)} %` };
    case "duracion":
      // Excel mide duraciones en días; así `[h]:mm` suma bien.
      return { valor: n / 1440, formato: FORMATO.duracion, alinear: "right", texto: "000:00" };
    case "entero":
      return { valor: n, formato: FORMATO.entero, alinear: "right", texto: texto ?? n.toLocaleString("es-MX") };
    default:
      return { valor: n, formato: FORMATO.numero, alinear: "right", texto: texto ?? n.toLocaleString("es-MX") };
  }
}

/** El logo de `public/`. Si falla (offline, SSR), el reporte sale sin imagen. */
async function cargarLogo(): Promise<{ buffer: ArrayBuffer; ancho: number; alto: number } | null> {
  try {
    if (typeof fetch !== "function") return null;
    const res = await fetch(LOGO_URL);
    if (!res.ok) return null;
    const buffer = await res.arrayBuffer();
    const view = new DataView(buffer);
    if (buffer.byteLength < 24 || view.getUint32(0) !== 0x89504e47) return null;
    return { buffer, ancho: view.getUint32(16), alto: view.getUint32(20) };
  } catch {
    return null;
  }
}

const fechaLarga = (d: Date) =>
  new Intl.DateTimeFormat("es-MX", {
    day: "2-digit",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(d);

function textoFiltros(filtros?: ExcelExportOptions["filtros"]): string {
  if (!filtros?.length) return "";
  return filtros
    .filter((f) => f.valor !== null && f.valor !== undefined && String(f.valor).trim() !== "")
    .map((f) => `${f.etiqueta}: ${f.valor}`)
    .join("  ·  ");
}

async function buildAndDownload<T extends object>(
  rows: T[],
  columns: ExcelColumn<T>[],
  filename: string,
  options: ExcelExportOptions,
): Promise<void> {
  const { title, subtitle, summaryRows, filtros, notas, generadoPor } = options;
  const ExcelJS = (await import("exceljs")).default;
  const workbook = new ExcelJS.Workbook();
  const ahora = new Date();
  const reportTitle = title || filename.replace(/[-_]+/g, " ").replace(/\b\w/, (c) => c.toUpperCase());
  workbook.creator = "NEXARA";
  workbook.lastModifiedBy = generadoPor?.trim() || "NEXARA";
  workbook.created = ahora;
  workbook.modified = ahora;
  workbook.title = reportTitle;
  workbook.company = "NEXARA";

  const sheetName = (options.hoja || reportTitle).replace(/[:\\/?*[\]]/g, " ").slice(0, 31) || "Reporte";
  const ws = workbook.addWorksheet(sheetName, { views: [{ showGridLines: false }] });
  const nCols = Math.max(columns.length, 1);

  // ── Banda de título ─────────────────────────────────────────────────────────
  const lineas: Array<{ texto: string; alto: number; fuente: Partial<import("exceljs").Font> }> = [
    { texto: "", alto: 30, fuente: { size: 8 } },
    { texto: reportTitle, alto: 24, fuente: { size: 16, bold: true, color: { argb: NX.navy } } },
  ];
  const subtituloTexto = [subtitle, `${rows.length} registro${rows.length === 1 ? "" : "s"}`]
    .filter(Boolean)
    .join("  ·  ");
  lineas.push({ texto: subtituloTexto, alto: 17, fuente: { size: 11, color: { argb: NX.gris } } });
  const lineaFiltros = textoFiltros(filtros);
  if (lineaFiltros) {
    lineas.push({ texto: lineaFiltros, alto: 15, fuente: { size: 9, color: { argb: NX.gris } } });
  }
  lineas.push({
    texto: `Generado por ${generadoPor?.trim() || "NEXARA"} · ${fechaLarga(ahora)}`,
    alto: 14,
    fuente: { size: 9, italic: true, color: { argb: NX.grisSuave } },
  });

  lineas.forEach((linea, i) => {
    const fila = ws.getRow(i + 1);
    fila.height = linea.alto;
    for (let c = 1; c <= nCols; c += 1) {
      fila.getCell(c).fill = { type: "pattern", pattern: "solid", fgColor: { argb: NX.tealTenue } };
    }
    const primera = fila.getCell(1);
    primera.value = linea.texto || null;
    primera.font = { name: FUENTE, ...linea.fuente };
    primera.alignment = { vertical: "middle", horizontal: "left", indent: 1 };
    if (nCols > 1) ws.mergeCells(i + 1, 1, i + 1, nCols);
  });

  const filaRegla = lineas.length + 1;
  const regla = ws.getRow(filaRegla);
  regla.height = 5;
  for (let c = 1; c <= nCols; c += 1) {
    regla.getCell(c).fill = { type: "pattern", pattern: "solid", fgColor: { argb: NX.teal } };
  }

  const logo = await cargarLogo();
  if (logo) {
    // La fila 1 mide 30 pt (40 px): 32 px de alto deja aire arriba y abajo.
    const alto = 32;
    const ancho = Math.min(Math.round((logo.ancho / logo.alto) * alto), 220);
    const idLogo = workbook.addImage({ buffer: logo.buffer as never, extension: "png" });
    ws.addImage(idLogo, {
      tl: { col: 0.2, row: 0.12 } as never,
      ext: { width: ancho, height: alto },
      editAs: "absolute",
    });
  }

  // ── Resumen ejecutivo opcional (contrato viejo) ─────────────────────────────
  let siguiente = filaRegla + 1;
  if (summaryRows && summaryRows.length > 0) {
    summaryRows.forEach(({ label, value }) => {
      const r = ws.getRow(siguiente);
      r.height = 17;
      const etiqueta = r.getCell(1);
      etiqueta.value = label;
      etiqueta.font = { name: FUENTE, size: 10, bold: true, color: { argb: NX.navy } };
      etiqueta.alignment = { vertical: "middle", horizontal: "left", indent: 1 };
      const celdaValor = r.getCell(2);
      celdaValor.value = value;
      celdaValor.font = { name: FUENTE, size: 10, color: { argb: NX.texto } };
      celdaValor.alignment = {
        vertical: "middle",
        horizontal: typeof value === "number" ? "right" : "left",
      };
      if (typeof value === "number" && isCurrencyKey(label)) celdaValor.numFmt = formatoDinero("MXN");
      siguiente += 1;
    });
    ws.getRow(siguiente).height = 6;
    siguiente += 1;
  }

  // ── Encabezados ─────────────────────────────────────────────────────────────
  const filaEncabezado = siguiente;
  const encabezado = ws.getRow(filaEncabezado);
  encabezado.height = 26;
  columns.forEach((col, i) => {
    const celda = encabezado.getCell(i + 1);
    celda.value = col.label;
    celda.font = { name: FUENTE, size: 10, bold: true, color: { argb: NX.blanco } };
    celda.fill = { type: "pattern", pattern: "solid", fgColor: { argb: NX.teal } };
    celda.alignment = { vertical: "middle", horizontal: "center", wrapText: true };
  });

  // ── Datos ───────────────────────────────────────────────────────────────────
  const primeraFilaDatos = filaEncabezado + 1;
  const anchoNatural = columns.map((c) => c.label.length + 3);

  rows.forEach((row, idx) => {
    const excelRow = ws.getRow(primeraFilaDatos + idx);
    excelRow.height = 17;
    columns.forEach((col, colIdx) => {
      const { valor, formato, alinear, texto } = prepararCelda(col, row);
      const celda = excelRow.getCell(colIdx + 1);
      celda.value = valor;
      if (formato) celda.numFmt = formato;
      celda.font = { name: FUENTE, size: 10, color: { argb: NX.texto } };
      celda.alignment = { vertical: "middle", horizontal: alinear };
      celda.border = { bottom: { style: "hair", color: { argb: NX.filete } } };
      anchoNatural[colIdx] = Math.max(anchoNatural[colIdx], texto.length + 2);
    });
  });

  const ultimaFilaDatos = primeraFilaDatos + rows.length - 1;
  const hayDatos = rows.length > 0;

  if (!hayDatos) {
    const vacia = ws.getRow(primeraFilaDatos);
    vacia.height = 20;
    vacia.getCell(1).value = "Sin registros para los filtros aplicados";
    vacia.getCell(1).font = { name: FUENTE, size: 10, italic: true, color: { argb: NX.gris } };
    vacia.getCell(1).alignment = { vertical: "middle", horizontal: "left", indent: 1 };
    if (nCols > 1) ws.mergeCells(primeraFilaDatos, 1, primeraFilaDatos, nCols);
  }

  // ── Totales con fórmulas reales ─────────────────────────────────────────────
  if (hayDatos && columns.some((c) => c.total)) {
    const fila = ws.getRow(ultimaFilaDatos + 1);
    fila.height = 20;
    columns.forEach((col, i) => {
      const celda = fila.getCell(i + 1);
      const letra = ws.getColumn(i + 1).letter;
      celda.font = { name: FUENTE, size: 10, bold: true, color: { argb: NX.navy } };
      celda.border = { top: { style: "medium", color: { argb: NX.teal } } };
      celda.fill = { type: "pattern", pattern: "solid", fgColor: { argb: NX.tealTenue } };
      if (col.total) {
        const fn = col.total === "promedio" ? "AVERAGE" : col.total === "cuenta" ? "COUNTA" : "SUM";
        celda.value = { formula: `${fn}(${letra}${primeraFilaDatos}:${letra}${ultimaFilaDatos})` };
        const muestra = prepararCelda(col, rows[0]);
        celda.numFmt = col.total === "cuenta" ? FORMATO.entero : (muestra.formato ?? FORMATO.numero);
        celda.alignment = { vertical: "middle", horizontal: "right" };
      } else if (i === 0) {
        celda.value = "Total";
        celda.alignment = { vertical: "middle", horizontal: "left", indent: 1 };
      }
    });
  }

  // ── Anchos, congelado, autofiltro ───────────────────────────────────────────
  columns.forEach((col, i) => {
    const natural = col.ancho ?? Math.min(ANCHO_MAX, anchoNatural[i]);
    ws.getColumn(i + 1).width = Math.max(ANCHO_MIN, natural);
    if (col.ancho === undefined && anchoNatural[i] > ANCHO_MAX && hayDatos) {
      for (let r = primeraFilaDatos; r <= ultimaFilaDatos; r += 1) {
        const celda = ws.getRow(r).getCell(i + 1);
        celda.alignment = { ...celda.alignment, wrapText: true };
      }
    }
  });

  ws.views = [{ state: "frozen", ySplit: filaEncabezado, showGridLines: false }];
  if (hayDatos) {
    ws.autoFilter = {
      from: { row: filaEncabezado, column: 1 },
      to: { row: ultimaFilaDatos, column: nCols },
    };
  }

  // ── Impresión ───────────────────────────────────────────────────────────────
  ws.pageSetup = {
    orientation: nCols > 6 ? "landscape" : "portrait",
    paperSize: 9,
    fitToPage: true,
    fitToWidth: 1,
    fitToHeight: 0,
    horizontalCentered: true,
    printTitlesRow: `${filaEncabezado}:${filaEncabezado}`,
    margins: { left: 0.4, right: 0.4, top: 0.5, bottom: 0.5, header: 0.3, footer: 0.3 },
  };
  const pie = reportTitle.replace(/&/g, "&&");
  const footer = `&L&"${FUENTE}"&8${pie}&C&"${FUENTE}"&8Página &P de &N&R&"${FUENTE}"&8NEXARA`;
  ws.headerFooter = { oddFooter: footer, evenFooter: footer };

  // ── Hoja «Información» cuando hay filtros o notas que registrar ─────────────
  if (lineaFiltros || notas?.length) {
    const info = workbook.addWorksheet("Información", { views: [{ showGridLines: false }] });
    info.getColumn(1).width = 26;
    info.getColumn(2).width = 64;
    const cabecera = info.getRow(1);
    cabecera.height = 26;
    cabecera.getCell(1).value = "Información del reporte";
    cabecera.getCell(1).font = { name: FUENTE, size: 14, bold: true, color: { argb: NX.navy } };
    cabecera.getCell(1).alignment = { vertical: "middle", horizontal: "left", indent: 1 };
    for (let c = 1; c <= 2; c += 1) {
      cabecera.getCell(c).fill = { type: "pattern", pattern: "solid", fgColor: { argb: NX.tealTenue } };
    }
    info.mergeCells(1, 1, 1, 2);

    const entradas: Array<[string, string]> = [
      ["Reporte", reportTitle],
      ...(subtitle ? ([["Periodo", subtitle]] as Array<[string, string]>) : []),
      ["Generado por", generadoPor?.trim() || "NEXARA"],
      ["Generado el", fechaLarga(ahora)],
      ["Registros", String(rows.length)],
    ];
    for (const f of filtros ?? []) {
      if (f.valor === null || f.valor === undefined || String(f.valor).trim() === "") continue;
      entradas.push([f.etiqueta, String(f.valor)]);
    }
    for (const nota of notas ?? []) entradas.push(["Nota", nota]);

    entradas.forEach(([etiqueta, valor], i) => {
      const fila = info.getRow(i + 3);
      fila.height = 17;
      const a = fila.getCell(1);
      a.value = etiqueta;
      a.font = { name: FUENTE, size: 10, bold: true, color: { argb: NX.navy } };
      a.alignment = { vertical: "middle", horizontal: "left", indent: 1 };
      a.border = { bottom: { style: "hair", color: { argb: NX.filete } } };
      const b = fila.getCell(2);
      b.value = valor;
      b.font = { name: FUENTE, size: 10, color: { argb: NX.texto } };
      b.alignment = { vertical: "middle", horizontal: "left", wrapText: true };
      b.border = { bottom: { style: "hair", color: { argb: NX.filete } } };
    });
  }

  const buffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([buffer], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  void triggerBlobDownload(blob, `${filename}.xlsx`, {
    preferOpenOnMobile: false,
    mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
}
