import ExcelJS from 'exceljs';
import { loadNexaraLogo } from '../pdf/nexara-pdf-theme.js';
import { WORKDAY_TIMEZONE } from '../time/workday.js';

/**
 * NEXARA · Tema Excel corporativo.
 *
 * Un solo sitio decide cómo se ve **cualquier** hoja que salga del sistema, igual que
 * `nexara-pdf-theme.ts` hace con los PDF. Antes cada endpoint volcaba el objeto crudo de
 * Prisma: encabezados en inglés camelCase, ids de base de datos en la primera columna,
 * fechas como cadenas ISO y montos como texto. El resultado no se podía mandar a un
 * cliente ni presentar en una junta.
 *
 * Lo que produce `crearReporte`:
 *
 *   1. Banda de título con el logo NEXARA, el título (16 pt), el subtítulo con el rango,
 *      la línea de filtros aplicados y «Generado por … · fecha hora» en gris pequeño.
 *   2. Fila de encabezados con relleno teal `#1F9E84`, blanco negrita 10 pt, paneles
 *      congelados debajo y autofiltro sobre los datos.
 *   3. Datos a 10 pt con filete inferior tenue (sin cebra: se eligió una sola convención),
 *      fechas `dd/mm/aaaa`, dinero `$ #,##0.00`, porcentajes `0 %`, duraciones `[h]:mm`,
 *      booleanos «Sí»/«No» y etiquetas en español en vez de claves de enum.
 *   4. Fila de totales con fórmulas SUM/AVERAGE reales — el archivo sigue siendo útil
 *      cuando alguien filtra o agrega filas.
 *   5. Configuración de impresión: horizontal si es ancho, ajuste al ancho, encabezado
 *      repetido en cada página, número de página en el pie y márgenes.
 *   6. Hoja «Información» cuando hay filtros o notas que valga la pena dejar registrados.
 *
 * Módulo sin Nest ni Prisma: se puede probar y usar desde scripts.
 */

export const EXCEL_COLORES = {
  /** Teal corporativo de los encabezados. */
  teal: 'FF1F9E84',
  tealTenue: 'FFF1F8F6',
  navy: 'FF0B1320',
  texto: 'FF0F172A',
  gris: 'FF64748B',
  grisSuave: 'FF94A3B8',
  filete: 'FFE2E8F0',
  blanco: 'FFFFFFFF',
} as const;

const FUENTE = 'Segoe UI';
/** Ancho mínimo y máximo de columna, en caracteres. Más de esto se envuelve. */
const ANCHO_MIN = 10;
const ANCHO_MAX = 46;

export type TipoColumna =
  | 'texto'
  | 'entero'
  | 'numero'
  | 'dinero'
  | 'porcentaje'
  | 'fecha'
  | 'fechaHora'
  | 'duracion'
  | 'booleano';

export type TotalColumna = 'suma' | 'promedio' | 'cuenta';

export type ColumnaReporte<T = any> = {
  /** Clave del objeto de la fila. Se ignora si se pasa `valor`. */
  clave: string;
  /** Encabezado en español, tal como lo dice la interfaz. */
  titulo: string;
  tipo?: TipoColumna;
  /** Valor derivado cuando la fila no lo trae plano. */
  valor?: (fila: T) => unknown;
  /** Traducción de claves de enum a la etiqueta que muestra la UI. */
  etiquetas?: Record<string, string>;
  /** Fórmula real al pie de la columna. */
  total?: TotalColumna;
  /** Ancho fijo en caracteres; por omisión se calcula del contenido. */
  ancho?: number;
  /** Fuerza el ajuste de texto (por omisión solo si el contenido rebasa el tope). */
  ajustar?: boolean;
  /** Moneda ISO para `dinero`; `monedaDe` la toma de una columna de la fila. */
  moneda?: string;
  monedaDe?: string;
};

export type FiltroReporte = { etiqueta: string; valor: string | number | null | undefined };

export type HojaReporte<T = any> = {
  /** Nombre de la pestaña, en español. */
  hoja: string;
  titulo: string;
  /** Rango cubierto o descripción corta. */
  subtitulo?: string;
  filtros?: FiltroReporte[];
  notas?: string[];
  columnas: ColumnaReporte<T>[];
  filas: T[];
  /** Fila de totales: se dibuja si alguna columna declara `total`. `false` la apaga. */
  totales?: boolean;
  /** Texto de la celda de totales (por omisión «Total»). */
  etiquetaTotales?: string;
};

export type OpcionesReporte<T = any> = HojaReporte<T> & {
  /** Nombre de quien descarga, para la línea «Generado por». */
  generadoPor?: string | null;
  /** Momento del reporte (por omisión, ahora). Útil para pruebas reproducibles. */
  generadoEn?: Date;
  /** Hojas adicionales con el mismo estilo (p. ej. el detalle día por día). */
  hojasExtra?: HojaReporte<any>[];
  /** Fuerza o apaga la hoja «Información» (por omisión: si hay filtros o notas). */
  hojaInformacion?: boolean;
};

// ────────────────────────────────────────────────────────────── formato de valores

const ETIQUETA_GENERICA_CACHE = new Map<string, string>();

/**
 * Clave de enum a texto legible: `EN_PROCESO` → «En proceso», `porValidar` → «Por validar».
 * Solo se usa como red de seguridad; lo correcto es pasar `etiquetas` con lo que dice la UI.
 */
export function etiquetaGenerica(valor: string): string {
  const cache = ETIQUETA_GENERICA_CACHE.get(valor);
  if (cache) return cache;
  const texto = valor
    .replace(/[_-]+/g, ' ')
    .replace(/([a-z\d])([A-Z])/g, '$1 $2')
    .trim()
    .toLowerCase();
  const salida = texto ? texto.charAt(0).toUpperCase() + texto.slice(1) : valor;
  ETIQUETA_GENERICA_CACHE.set(valor, salida);
  return salida;
}

/** Decimal de Prisma, BigInt y objetos raros a algo que Excel entienda. */
function aPrimitivo(valor: unknown): unknown {
  if (valor === null || valor === undefined) return null;
  if (valor instanceof Date) return valor;
  if (typeof valor === 'bigint') {
    const n = Number(valor);
    return Number.isSafeInteger(n) ? n : valor.toString();
  }
  if (typeof valor === 'object') {
    const decimalLike = valor as { toNumber?: () => number; toString?: () => string };
    if (typeof decimalLike.toNumber === 'function') {
      const n = decimalLike.toNumber();
      if (Number.isFinite(n)) return n;
    }
    if (Array.isArray(valor)) return valor.map((v) => aPrimitivo(v)).filter((v) => v != null).join('; ');
    if (typeof decimalLike.toString === 'function') {
      const s = decimalLike.toString();
      if (s && s !== '[object Object]') return s;
    }
    try {
      return JSON.stringify(valor);
    } catch {
      return String(valor);
    }
  }
  return valor;
}

const FORMATEADORES_TZ = new Map<string, Intl.DateTimeFormat>();

function formateadorTz(tz: string): Intl.DateTimeFormat {
  let f = FORMATEADORES_TZ.get(tz);
  if (!f) {
    f = new Intl.DateTimeFormat('en-CA', {
      timeZone: tz,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    });
    FORMATEADORES_TZ.set(tz, f);
  }
  return f;
}

/**
 * Fecha lista para ExcelJS, en hora de México.
 *
 * ExcelJS convierte el `Date` al serial de Excel usando sus componentes **UTC**. El
 * contenedor corre en UTC, así que una salida de las 20:00 hora de México (02:00 UTC del
 * día siguiente) se escribía con la fecha del día siguiente. Aquí se desplaza el instante
 * para que sus componentes UTC coincidan con la hora de pared de la empresa, que es la que
 * el usuario espera leer.
 */
export function aFechaExcel(valor: unknown, tz = WORKDAY_TIMEZONE): Date | null {
  // Un `AAAA-MM-DD` ya es hora de pared: no lleva instante que convertir. `new Date()` lo
  // lee como medianoche UTC y, al pasarlo a México, se iba al día anterior a las 18:00.
  if (typeof valor === 'string') {
    const soloFecha = /^(\d{4})-(\d{2})-(\d{2})$/.exec(valor.trim());
    if (soloFecha) {
      return new Date(Date.UTC(Number(soloFecha[1]), Number(soloFecha[2]) - 1, Number(soloFecha[3])));
    }
  }
  const fecha =
    valor instanceof Date
      ? valor
      : typeof valor === 'string' || typeof valor === 'number'
        ? new Date(valor)
        : null;
  if (!fecha || Number.isNaN(fecha.getTime())) return null;
  const p = formateadorTz(tz).formatToParts(fecha);
  const val = (tipo: string) => Number(p.find((x) => x.type === tipo)?.value ?? 0);
  return new Date(
    Date.UTC(val('year'), val('month') - 1, val('day'), val('hour') % 24, val('minute'), val('second')),
  );
}

/**
 * Fecha de una columna `fecha` (sin hora).
 *
 * Las columnas `@db.Date` de Prisma —`issueDate`, `endDate`, `dueDate`, `date`…— llegan
 * como medianoche **UTC**: son días de calendario, no instantes. Pasarlas por la conversión
 * a hora de México las mandaba al día anterior a las 18:00, y el reporte mostraba una
 * factura del 5 emitida el 4. Cuando la hora UTC es exactamente 00:00:00.000 se toma el día
 * tal cual; con una hora real sí hay instante que convertir.
 */
export function aDiaExcel(valor: unknown, tz = WORKDAY_TIMEZONE): Date | null {
  if (valor instanceof Date || typeof valor === 'string' || typeof valor === 'number') {
    const d = valor instanceof Date ? valor : new Date(valor);
    if (!Number.isNaN(d.getTime()) && d.getTime() % 86_400_000 === 0) {
      return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
    }
  }
  return aFechaExcel(valor, tz);
}

/** Solo las fechas escritas como texto en columnas de fecha; nunca adivina sobre texto libre. */
function pareceFecha(valor: unknown): boolean {
  if (valor instanceof Date) return true;
  if (typeof valor !== 'string') return false;
  return /^\d{4}-\d{2}-\d{2}([T ]|$)/.test(valor.trim());
}

function formatoDinero(moneda: string): string {
  const codigo = (moneda || 'MXN').toUpperCase();
  return codigo === 'MXN' ? '"$" #,##0.00' : `"$" #,##0.00 "${codigo}"`;
}

const FORMATO = {
  entero: '#,##0',
  numero: '#,##0.00',
  porcentaje: '0 %',
  fecha: 'dd/mm/yyyy',
  fechaHora: 'dd/mm/yyyy hh:mm',
  /** Duración total, no hora del día: pasa de 24 h sin reiniciar. */
  duracion: '[h]:mm',
} as const;

type CeldaPreparada = { valor: ExcelJS.CellValue; formato?: string; alinear: 'left' | 'right' | 'center'; texto: string };

/** Valor crudo → lo que se escribe en la celda, con su formato y su ancho aparente. */
function prepararCelda<T>(columna: ColumnaReporte<T>, fila: T): CeldaPreparada {
  const tipo = columna.tipo ?? 'texto';
  const crudo = aPrimitivo(columna.valor ? columna.valor(fila) : (fila as any)?.[columna.clave]);

  if (crudo === null || crudo === '') {
    return { valor: null, alinear: tipo === 'texto' ? 'left' : 'right', texto: '' };
  }

  switch (tipo) {
    case 'fecha':
    case 'fechaHora': {
      if (!pareceFecha(crudo)) break;
      const fechaExcel = tipo === 'fecha' ? aDiaExcel(crudo) : aFechaExcel(crudo);
      if (!fechaExcel) break;
      const formato = tipo === 'fecha' ? FORMATO.fecha : FORMATO.fechaHora;
      return {
        valor: fechaExcel,
        formato,
        alinear: 'center',
        texto: tipo === 'fecha' ? '00/00/0000' : '00/00/0000 00:00',
      };
    }
    case 'dinero': {
      const n = Number(crudo);
      if (!Number.isFinite(n)) break;
      const moneda =
        (columna.monedaDe ? String((fila as any)?.[columna.monedaDe] ?? '') : '') || columna.moneda || 'MXN';
      const formato = formatoDinero(moneda);
      return { valor: n, formato, alinear: 'right', texto: `$ ${n.toFixed(2)}`.padEnd(10, ' ') };
    }
    case 'porcentaje': {
      const n = Number(crudo);
      if (!Number.isFinite(n)) break;
      // Se guarda como fracción para que Excel lo trate como porcentaje de verdad.
      return { valor: n / 100, formato: FORMATO.porcentaje, alinear: 'right', texto: `${Math.round(n)} %` };
    }
    case 'duracion': {
      const minutos = Number(crudo);
      if (!Number.isFinite(minutos)) break;
      // Excel mide duraciones en días; así `[h]:mm` suma bien.
      return { valor: minutos / 1440, formato: FORMATO.duracion, alinear: 'right', texto: '000:00' };
    }
    case 'entero':
    case 'numero': {
      const n = Number(crudo);
      if (!Number.isFinite(n)) break;
      const formato = tipo === 'entero' ? FORMATO.entero : FORMATO.numero;
      return { valor: n, formato, alinear: 'right', texto: n.toLocaleString('es-MX') };
    }
    case 'booleano': {
      const texto = crudo === true || crudo === 1 || crudo === 'true' ? 'Sí' : 'No';
      return { valor: texto, alinear: 'center', texto };
    }
    default:
      break;
  }

  if (typeof crudo === 'boolean') {
    const texto = crudo ? 'Sí' : 'No';
    return { valor: texto, alinear: 'center', texto };
  }
  if (typeof crudo === 'number') {
    return { valor: crudo, formato: FORMATO.numero, alinear: 'right', texto: crudo.toLocaleString('es-MX') };
  }

  const bruto = String(crudo);
  const etiqueta =
    columna.etiquetas?.[bruto] ??
    columna.etiquetas?.[bruto.toUpperCase()] ??
    (columna.etiquetas ? etiquetaGenerica(bruto) : bruto);
  return { valor: etiqueta, alinear: 'left', texto: etiqueta };
}

// ────────────────────────────────────────────────────────────────────────── logo

/** Ancho y alto declarados en el IHDR del PNG (bytes 16–24). Sin dependencias. */
function medidasPng(buffer: Buffer): { ancho: number; alto: number } | null {
  if (buffer.length < 24 || buffer.readUInt32BE(0) !== 0x89504e47) return null;
  const ancho = buffer.readUInt32BE(16);
  const alto = buffer.readUInt32BE(20);
  return ancho > 0 && alto > 0 ? { ancho, alto } : null;
}

let logoCache: Buffer | null | undefined;

function logoNexara(): Buffer | null {
  if (logoCache === undefined) logoCache = loadNexaraLogo();
  return logoCache;
}

// ─────────────────────────────────────────────────────────────── escritura de hoja

/** Excel prohíbe `: \ / ? * [ ]` en los nombres de pestaña y los corta a 31 caracteres. */
function nombreHojaValido(nombre: string, usados: Set<string>): string {
  const base = (nombre || 'Reporte').replace(/[:\\/?*[\]]/g, ' ').trim().slice(0, 31) || 'Reporte';
  let candidato = base;
  let n = 2;
  while (usados.has(candidato.toLowerCase())) {
    const sufijo = ` (${n})`;
    candidato = `${base.slice(0, 31 - sufijo.length)}${sufijo}`;
    n += 1;
  }
  usados.add(candidato.toLowerCase());
  return candidato;
}

const fechaLarga = (d: Date, tz = WORKDAY_TIMEZONE) =>
  new Intl.DateTimeFormat('es-MX', {
    timeZone: tz,
    day: '2-digit',
    month: 'long',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(d);

function textoFiltros(filtros?: FiltroReporte[]): string {
  if (!filtros?.length) return '';
  return filtros
    .filter((f) => f.valor !== null && f.valor !== undefined && String(f.valor).trim() !== '')
    .map((f) => `${f.etiqueta}: ${f.valor}`)
    .join('  ·  ');
}

type ContextoLibro = { generadoPor?: string | null; generadoEn: Date; idLogo?: number };

function escribirHoja(
  workbook: ExcelJS.Workbook,
  hoja: HojaReporte<any>,
  ctx: ContextoLibro,
  usados: Set<string>,
): ExcelJS.Worksheet {
  const columnas = hoja.columnas;
  const nCols = Math.max(columnas.length, 1);
  const ws = workbook.addWorksheet(nombreHojaValido(hoja.hoja, usados), {
    views: [{ showGridLines: false }],
  });

  // ── Banda de título ──────────────────────────────────────────────────────────
  const lineas: Array<{ texto: string; alto: number; fuente: Partial<ExcelJS.Font> }> = [];
  // Fila 1: solo el logo (la imagen flota, no ocupa celda).
  lineas.push({ texto: '', alto: 30, fuente: { size: 8 } });
  lineas.push({
    texto: hoja.titulo,
    alto: 24,
    fuente: { size: 16, bold: true, color: { argb: EXCEL_COLORES.navy } },
  });
  if (hoja.subtitulo) {
    lineas.push({
      texto: hoja.subtitulo,
      alto: 17,
      fuente: { size: 11, color: { argb: EXCEL_COLORES.gris } },
    });
  }
  const filtros = textoFiltros(hoja.filtros);
  if (filtros) {
    lineas.push({ texto: filtros, alto: 15, fuente: { size: 9, color: { argb: EXCEL_COLORES.gris } } });
  }
  const generadoPor = ctx.generadoPor?.trim();
  lineas.push({
    texto: `Generado por ${generadoPor || 'NEXARA'} · ${fechaLarga(ctx.generadoEn)}`,
    alto: 14,
    fuente: { size: 9, italic: true, color: { argb: EXCEL_COLORES.grisSuave } },
  });

  lineas.forEach((linea, i) => {
    const fila = ws.getRow(i + 1);
    fila.height = linea.alto;
    for (let c = 1; c <= nCols; c += 1) {
      const celda = fila.getCell(c);
      celda.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: EXCEL_COLORES.tealTenue } };
    }
    const primera = fila.getCell(1);
    primera.value = linea.texto || null;
    primera.font = { name: FUENTE, ...linea.fuente };
    primera.alignment = { vertical: 'middle', horizontal: 'left', indent: 1 };
    if (nCols > 1) ws.mergeCells(1 + i, 1, 1 + i, nCols);
  });

  // Filete teal que cierra la banda.
  const filaRegla = lineas.length + 1;
  const regla = ws.getRow(filaRegla);
  regla.height = 5;
  for (let c = 1; c <= nCols; c += 1) {
    regla.getCell(c).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: EXCEL_COLORES.teal } };
  }

  if (ctx.idLogo !== undefined) {
    const logo = logoNexara();
    const medidas = logo ? medidasPng(logo) : null;
    // La fila 1 mide 30 pt (40 px): 32 px de alto deja aire arriba y abajo.
    const alto = 32;
    const ancho = medidas ? Math.round((medidas.ancho / medidas.alto) * alto) : 96;
    ws.addImage(ctx.idLogo, {
      tl: { col: 0.2, row: 0.12 } as ExcelJS.Anchor,
      ext: { width: Math.min(ancho, 220), height: alto },
      editAs: 'absolute',
    });
  }

  // ── Encabezados ──────────────────────────────────────────────────────────────
  const filaEncabezado = filaRegla + 1;
  const encabezado = ws.getRow(filaEncabezado);
  encabezado.height = 26;
  columnas.forEach((columna, i) => {
    const celda = encabezado.getCell(i + 1);
    celda.value = columna.titulo;
    celda.font = { name: FUENTE, size: 10, bold: true, color: { argb: EXCEL_COLORES.blanco } };
    celda.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: EXCEL_COLORES.teal } };
    celda.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
  });

  // ── Datos ────────────────────────────────────────────────────────────────────
  const primeraFilaDatos = filaEncabezado + 1;
  const anchoNatural = columnas.map((c) => c.titulo.length + 3);

  hoja.filas.forEach((datos, idx) => {
    const fila = ws.getRow(primeraFilaDatos + idx);
    fila.height = 17;
    columnas.forEach((columna, i) => {
      const { valor, formato, alinear, texto } = prepararCelda(columna, datos);
      const celda = fila.getCell(i + 1);
      celda.value = valor;
      if (formato) celda.numFmt = formato;
      celda.font = { name: FUENTE, size: 10, color: { argb: EXCEL_COLORES.texto } };
      celda.alignment = { vertical: 'middle', horizontal: alinear };
      celda.border = { bottom: { style: 'hair', color: { argb: EXCEL_COLORES.filete } } };
      anchoNatural[i] = Math.max(anchoNatural[i], texto.length + 2);
    });
  });

  const ultimaFilaDatos = primeraFilaDatos + hoja.filas.length - 1;
  const hayDatos = hoja.filas.length > 0;

  if (!hayDatos) {
    const vacia = ws.getRow(primeraFilaDatos);
    vacia.height = 20;
    vacia.getCell(1).value = 'Sin registros para los filtros aplicados';
    vacia.getCell(1).font = { name: FUENTE, size: 10, italic: true, color: { argb: EXCEL_COLORES.gris } };
    vacia.getCell(1).alignment = { vertical: 'middle', horizontal: 'left', indent: 1 };
    if (nCols > 1) ws.mergeCells(primeraFilaDatos, 1, primeraFilaDatos, nCols);
  }

  // ── Totales con fórmulas reales ──────────────────────────────────────────────
  const conTotal = columnas.some((c) => c.total);
  if (hayDatos && conTotal && hoja.totales !== false) {
    const fila = ws.getRow(ultimaFilaDatos + 1);
    fila.height = 20;
    columnas.forEach((columna, i) => {
      const celda = fila.getCell(i + 1);
      const letra = ws.getColumn(i + 1).letter;
      celda.font = { name: FUENTE, size: 10, bold: true, color: { argb: EXCEL_COLORES.navy } };
      celda.border = { top: { style: 'medium', color: { argb: EXCEL_COLORES.teal } } };
      celda.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: EXCEL_COLORES.tealTenue } };
      if (columna.total) {
        const fn = columna.total === 'promedio' ? 'AVERAGE' : columna.total === 'cuenta' ? 'COUNTA' : 'SUM';
        celda.value = {
          formula: `${fn}(${letra}${primeraFilaDatos}:${letra}${ultimaFilaDatos})`,
        } as ExcelJS.CellFormulaValue;
        const muestra = prepararCelda(columna, hoja.filas[0]);
        if (columna.total === 'cuenta') celda.numFmt = FORMATO.entero;
        else if (muestra.formato) celda.numFmt = muestra.formato;
        celda.alignment = { vertical: 'middle', horizontal: 'right' };
      } else if (i === 0) {
        celda.value = hoja.etiquetaTotales ?? 'Total';
        celda.alignment = { vertical: 'middle', horizontal: 'left', indent: 1 };
      }
    });
  }

  // ── Anchos, congelado, autofiltro ────────────────────────────────────────────
  columnas.forEach((columna, i) => {
    const natural = columna.ancho ?? Math.min(ANCHO_MAX, anchoNatural[i]);
    const col = ws.getColumn(i + 1);
    col.width = Math.max(ANCHO_MIN, natural);
    const envolver = columna.ajustar ?? (columna.ancho === undefined && anchoNatural[i] > ANCHO_MAX);
    if (envolver && hayDatos) {
      for (let r = primeraFilaDatos; r <= ultimaFilaDatos; r += 1) {
        const celda = ws.getRow(r).getCell(i + 1);
        celda.alignment = { ...celda.alignment, wrapText: true };
      }
    }
  });

  ws.views = [{ state: 'frozen', ySplit: filaEncabezado, showGridLines: false }];
  if (hayDatos) {
    ws.autoFilter = {
      from: { row: filaEncabezado, column: 1 },
      to: { row: ultimaFilaDatos, column: nCols },
    };
  }

  // ── Impresión ────────────────────────────────────────────────────────────────
  const apaisado = nCols > 6;
  ws.pageSetup = {
    orientation: apaisado ? 'landscape' : 'portrait',
    paperSize: 9, // A4
    fitToPage: true,
    fitToWidth: 1,
    fitToHeight: 0,
    horizontalCentered: true,
    printTitlesRow: `${filaEncabezado}:${filaEncabezado}`,
    margins: { left: 0.4, right: 0.4, top: 0.5, bottom: 0.5, header: 0.3, footer: 0.3 },
  };
  const pie = (t: string) => t.replace(/&/g, '&&');
  ws.headerFooter = {
    oddFooter: `&L&"${FUENTE}"&8${pie(hoja.titulo)}&C&"${FUENTE}"&8Página &P de &N&R&"${FUENTE}"&8NEXARA`,
    evenFooter: `&L&"${FUENTE}"&8${pie(hoja.titulo)}&C&"${FUENTE}"&8Página &P de &N&R&"${FUENTE}"&8NEXARA`,
  };

  return ws;
}

function escribirInformacion(
  workbook: ExcelJS.Workbook,
  principal: HojaReporte<any>,
  hojas: HojaReporte<any>[],
  ctx: ContextoLibro,
  usados: Set<string>,
): void {
  const ws = workbook.addWorksheet(nombreHojaValido('Información', usados), {
    views: [{ showGridLines: false }],
  });
  ws.getColumn(1).width = 26;
  ws.getColumn(2).width = 64;

  const titulo = ws.getRow(1);
  titulo.height = 26;
  titulo.getCell(1).value = 'Información del reporte';
  titulo.getCell(1).font = { name: FUENTE, size: 14, bold: true, color: { argb: EXCEL_COLORES.navy } };
  titulo.getCell(1).alignment = { vertical: 'middle', horizontal: 'left', indent: 1 };
  for (let c = 1; c <= 2; c += 1) {
    titulo.getCell(c).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: EXCEL_COLORES.tealTenue } };
  }
  ws.mergeCells(1, 1, 1, 2);

  const entradas: Array<[string, string]> = [
    ['Reporte', principal.titulo],
    ...(principal.subtitulo ? ([['Periodo', principal.subtitulo]] as Array<[string, string]>) : []),
    ['Generado por', ctx.generadoPor?.trim() || 'NEXARA'],
    ['Generado el', fechaLarga(ctx.generadoEn)],
    ['Zona horaria', WORKDAY_TIMEZONE],
  ];
  for (const hoja of hojas) {
    entradas.push([`Filas · ${hoja.hoja}`, String(hoja.filas.length)]);
  }
  for (const filtro of principal.filtros ?? []) {
    if (filtro.valor === null || filtro.valor === undefined || String(filtro.valor).trim() === '') continue;
    entradas.push([filtro.etiqueta, String(filtro.valor)]);
  }
  for (const nota of principal.notas ?? []) {
    entradas.push(['Nota', nota]);
  }

  entradas.forEach(([etiqueta, valor], i) => {
    const fila = ws.getRow(i + 3);
    fila.height = 17;
    const a = fila.getCell(1);
    a.value = etiqueta;
    a.font = { name: FUENTE, size: 10, bold: true, color: { argb: EXCEL_COLORES.navy } };
    a.alignment = { vertical: 'middle', horizontal: 'left', indent: 1 };
    a.border = { bottom: { style: 'hair', color: { argb: EXCEL_COLORES.filete } } };
    const b = fila.getCell(2);
    b.value = valor;
    b.font = { name: FUENTE, size: 10, color: { argb: EXCEL_COLORES.texto } };
    b.alignment = { vertical: 'middle', horizontal: 'left', wrapText: true };
    b.border = { bottom: { style: 'hair', color: { argb: EXCEL_COLORES.filete } } };
  });

  ws.pageSetup = {
    orientation: 'portrait',
    paperSize: 9,
    fitToPage: true,
    fitToWidth: 1,
    fitToHeight: 0,
    margins: { left: 0.6, right: 0.6, top: 0.6, bottom: 0.6, header: 0.3, footer: 0.3 },
  };
}

/**
 * Libro NEXARA listo para mandar: banda de título con logo, encabezado teal congelado con
 * autofiltro, formatos en español, totales con fórmulas y configuración de impresión.
 */
export async function crearReporte<T = any>(opciones: OpcionesReporte<T>): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'NEXARA';
  workbook.lastModifiedBy = opciones.generadoPor?.trim() || 'NEXARA';
  workbook.created = opciones.generadoEn ?? new Date();
  workbook.modified = workbook.created;
  workbook.title = opciones.titulo;
  workbook.company = 'NEXARA';

  const logo = logoNexara();
  const ctx: ContextoLibro = {
    generadoPor: opciones.generadoPor ?? null,
    generadoEn: opciones.generadoEn ?? new Date(),
    idLogo: logo ? workbook.addImage({ buffer: logo as any, extension: 'png' }) : undefined,
  };

  const usados = new Set<string>();
  const hojas: HojaReporte<any>[] = [opciones, ...(opciones.hojasExtra ?? [])];
  for (const hoja of hojas) escribirHoja(workbook, hoja, ctx, usados);

  const conInformacion =
    opciones.hojaInformacion ??
    Boolean(textoFiltros(opciones.filtros) || opciones.notas?.length || opciones.hojasExtra?.length);
  if (conInformacion) escribirInformacion(workbook, opciones, hojas, ctx, usados);

  return Buffer.from(await workbook.xlsx.writeBuffer());
}
