import ExcelJS from 'exceljs';
import { EXCEL_COLORES, altoParaLineas, lineasDeTexto } from '../common/excel/reporte-excel.js';
import { loadNexaraLogo } from '../common/pdf/nexara-pdf-theme.js';
import { WORKDAY_TIMEZONE } from '../common/time/workday.js';
import { horas } from './pre-nomina.js';
import {
  ddmm,
  dinero,
  type DiaDeSemana,
  type FilaControl,
  type formulaControl,
} from './control-nomina.js';

/**
 * El control semanal en Excel, igual a los dos formatos que Adam llenaba a mano:
 *
 *   1. «Entradas y salidas» — CONTROL DE ENTRADAS Y SALIDAS: encabezado de dos niveles (el día,
 *      «LUNES» y debajo «28», sobre ENTRADA · SALIDA · HORAS), sábado y domingo siempre, «00:00»
 *      en amarillo cuando un día laborable no tiene checada y «HORAS SEMANA TOTAL» al final.
 *   2. «Nómina» — CONTROL DE NOMINA NEXARA: dónde trabajó cada día, horas, sueldo, pago por hora,
 *      viáticos, área, extras, subtotal, descuentos y total, con autofiltro y notas a la derecha.
 *   3. «Cómo se calcula» — las reglas en palabras.
 *
 * Las dos primeras llevan la banda teal con el logo y el lema. HORAS, HORAS SEMANA TOTAL,
 * SUBTOTAL y TOTAL son fórmulas reales (con su resultado guardado), así que el archivo sigue
 * cuadrando si alguien corrige una hora a mano. Archivo nuevo a propósito: el tema compartido
 * (`reporte-excel.ts`) es de una sola tabla y aquí manda el formato de Adam.
 */

const FUENTE = 'Segoe UI';
/** Relleno de «no checó» de su Excel. */
export const AMARILLO_FALTA = 'FFFFFF00';
export const LEMA_NEXARA = 'Conectando ecosistemas de tecnología';
export const FORMATO_HORAS = '#,##0.00';
export const FORMATO_DINERO = '$ #,##0.00';
const FORMATO_RELOJ = 'hh:mm';

export const HOJA_ENTRADAS = 'Entradas y salidas';
export const HOJA_NOMINA = 'Nómina';
export const HOJA_COMO = 'Cómo se calcula';

export type DatosExcelControl = {
  semana: { inicio: string; fin: string; estado: string };
  dias: DiaDeSemana[];
  filas: FilaControl[];
  /** Sin montos (RH o política del módulo): las columnas de dinero salen vacías. */
  verMontos: boolean;
  formula: ReturnType<typeof formulaControl>;
  generadoPor?: string | null;
  generadoEn?: Date;
};

const anioDe = (f: string) => f.slice(0, 4);

const fechaLarga = (d: Date) =>
  new Intl.DateTimeFormat('es-MX', {
    timeZone: WORKDAY_TIMEZONE,
    day: '2-digit',
    month: 'long',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(d);

/** «10:00» → fracción de día (lo que Excel entiende como hora). */
export function horaAExcel(hhmm: string | null | undefined): number | null {
  const m = /^(\d{2}):(\d{2})$/.exec(hhmm ?? '');
  if (!m) return null;
  return (Number(m[1]) * 60 + Number(m[2])) / 1440;
}

function relleno(argb: string): ExcelJS.Fill {
  return { type: 'pattern', pattern: 'solid', fgColor: { argb } };
}

const borde: Partial<ExcelJS.Borders> = {
  top: { style: 'thin', color: { argb: EXCEL_COLORES.filete } },
  bottom: { style: 'thin', color: { argb: EXCEL_COLORES.filete } },
  left: { style: 'thin', color: { argb: EXCEL_COLORES.filete } },
  right: { style: 'thin', color: { argb: EXCEL_COLORES.filete } },
};

/**
 * Banda NEXARA: fila teal con el logo y el lema, el título centrado y la semana debajo.
 * Devuelve la primera fila libre.
 */
function banda(
  ws: ExcelJS.Worksheet,
  nCols: number,
  titulo: string,
  subtitulo: string,
  idLogo: number | undefined,
): number {
  const f1 = ws.getRow(1);
  f1.height = 40;
  for (let c = 1; c <= nCols; c += 1) f1.getCell(c).fill = relleno(EXCEL_COLORES.teal);
  ws.mergeCells(1, 1, 1, nCols);
  const marca = ws.getCell(1, 1);
  marca.value = {
    richText: [
      { text: 'NEXARA', font: { name: FUENTE, size: 16, bold: true, color: { argb: EXCEL_COLORES.blanco } } },
      { text: `   ${LEMA_NEXARA}`, font: { name: FUENTE, size: 11, italic: true, color: { argb: EXCEL_COLORES.blanco } } },
    ],
  };
  // El logo flota a la izquierda; la sangría deja el texto a su derecha.
  marca.alignment = { vertical: 'middle', horizontal: 'left', indent: idLogo !== undefined ? 7 : 1 };
  if (idLogo !== undefined) {
    ws.addImage(idLogo, {
      tl: { col: 0.15, row: 0.1 } as ExcelJS.Anchor,
      ext: { width: 44, height: 46 },
      editAs: 'absolute',
    });
  }

  const f2 = ws.getRow(2);
  f2.height = 26;
  ws.mergeCells(2, 1, 2, nCols);
  const t = ws.getCell(2, 1);
  t.value = titulo;
  t.font = { name: FUENTE, size: 14, bold: true, color: { argb: EXCEL_COLORES.navy } };
  t.alignment = { vertical: 'middle', horizontal: 'center' };

  const f3 = ws.getRow(3);
  f3.height = 18;
  ws.mergeCells(3, 1, 3, nCols);
  const s = ws.getCell(3, 1);
  s.value = subtitulo;
  s.font = { name: FUENTE, size: 10, color: { argb: EXCEL_COLORES.gris } };
  s.alignment = { vertical: 'middle', horizontal: 'center' };

  ws.getRow(4).height = 6;
  return 5;
}

function encabezado(celda: ExcelJS.Cell, texto: string): void {
  celda.value = texto;
  celda.font = { name: FUENTE, size: 10, bold: true, color: { argb: EXCEL_COLORES.blanco } };
  celda.fill = relleno(EXCEL_COLORES.teal);
  celda.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
  celda.border = {
    top: { style: 'thin', color: { argb: EXCEL_COLORES.blanco } },
    bottom: { style: 'thin', color: { argb: EXCEL_COLORES.blanco } },
    left: { style: 'thin', color: { argb: EXCEL_COLORES.blanco } },
    right: { style: 'thin', color: { argb: EXCEL_COLORES.blanco } },
  };
}

function dato(celda: ExcelJS.Cell, alinear: 'left' | 'center' | 'right' = 'center'): void {
  celda.font = { name: FUENTE, size: 10, color: { argb: EXCEL_COLORES.texto } };
  celda.alignment = { vertical: 'middle', horizontal: alinear, indent: alinear === 'left' ? 1 : 0 };
  celda.border = borde;
}

function letra(ws: ExcelJS.Worksheet, col: number): string {
  return ws.getColumn(col).letter;
}

function impresion(ws: ExcelJS.Worksheet, filaTitulos: string, titulo: string): void {
  ws.pageSetup = {
    orientation: 'landscape',
    paperSize: 9,
    fitToPage: true,
    fitToWidth: 1,
    fitToHeight: 0,
    horizontalCentered: true,
    printTitlesRow: filaTitulos,
    margins: { left: 0.3, right: 0.3, top: 0.4, bottom: 0.4, header: 0.2, footer: 0.2 },
  };
  const pie = `&L&"${FUENTE}"&8${titulo.replace(/&/g, '&&')}&C&"${FUENTE}"&8Página &P de &N&R&"${FUENTE}"&8NEXARA`;
  ws.headerFooter = { oddFooter: pie, evenFooter: pie };
}

// ─────────────────────────────────────────────────────────── hoja 1: entradas y salidas

function hojaEntradas(wb: ExcelJS.Workbook, d: DatosExcelControl, subtitulo: string, idLogo?: number): ExcelJS.Worksheet {
  const ws = wb.addWorksheet(HOJA_ENTRADAS, { views: [{ showGridLines: false }] });
  const nCols = 1 + d.dias.length * 3 + 1;
  const colTotal = nCols;
  const r0 = banda(ws, nCols, 'CONTROL DE ENTRADAS Y SALIDAS', subtitulo, idLogo);
  const rDia = r0;
  const rNumero = r0 + 1;
  const rSub = r0 + 2;
  const primeraFila = r0 + 3;

  // NOMBRE y HORAS SEMANA TOTAL ocupan los tres renglones del encabezado.
  ws.mergeCells(rDia, 1, rSub, 1);
  encabezado(ws.getCell(rDia, 1), 'NOMBRE');
  ws.mergeCells(rDia, colTotal, rSub, colTotal);
  encabezado(ws.getCell(rDia, colTotal), 'HORAS SEMANA TOTAL');

  d.dias.forEach((dia, i) => {
    const c = 2 + i * 3;
    ws.mergeCells(rDia, c, rDia, c + 2);
    encabezado(ws.getCell(rDia, c), dia.nombre);
    ws.mergeCells(rNumero, c, rNumero, c + 2);
    encabezado(ws.getCell(rNumero, c), dia.numero);
    encabezado(ws.getCell(rSub, c), 'ENTRADA');
    encabezado(ws.getCell(rSub, c + 1), 'SALIDA');
    encabezado(ws.getCell(rSub, c + 2), 'HORAS');
  });
  ws.getRow(rDia).height = 18;
  ws.getRow(rNumero).height = 16;
  ws.getRow(rSub).height = 18;

  d.filas.forEach((f, idx) => {
    const r = primeraFila + idx;
    const fila = ws.getRow(r);
    fila.height = 18;
    const nombre = ws.getCell(r, 1);
    nombre.value = f.nombre.toLocaleUpperCase('es-MX');
    dato(nombre, 'left');

    const celdasHoras: string[] = [];
    d.dias.forEach((dia, i) => {
      const c = 2 + i * 3;
      const dc = f.dias.find((x) => x.fecha === dia.fecha);
      const ent = ws.getCell(r, c);
      const sal = ws.getCell(r, c + 1);
      const hrs = ws.getCell(r, c + 2);
      for (const celda of [ent, sal, hrs]) dato(celda);
      ent.numFmt = FORMATO_RELOJ;
      sal.numFmt = FORMATO_RELOJ;
      hrs.numFmt = FORMATO_HORAS;

      const e = horaAExcel(dc?.entrada);
      const s = horaAExcel(dc?.salida);
      if (e != null) ent.value = e;
      if (s != null) sal.value = s;
      // Laborable sin checada: «00:00 · 00:00» en amarillo, como en su formato.
      if (dc?.falta) {
        ent.value = 0;
        sal.value = 0;
        for (const celda of [ent, sal, hrs]) celda.fill = relleno(AMARILLO_FALTA);
      } else if (e != null && s == null) {
        sal.value = 0;
      }
      const le = letra(ws, c);
      const ls = letra(ws, c + 1);
      hrs.value = {
        formula: `IF(OR(N(${le}${r})=0,N(${ls}${r})=0),0,ROUND(MOD(${ls}${r}-${le}${r},1)*24,2))`,
        result: dc?.horas ?? 0,
      } as ExcelJS.CellFormulaValue;
      celdasHoras.push(`${letra(ws, c + 2)}${r}`);

      const notas: string[] = [];
      if (dc?.lugar && (dc.falta || dc.lugarOrigen === 'manual' || !dc.entrada) && dc.lugar !== 'Descanso') {
        notas.push(dc.lugar);
      }
      if (dc?.nota) notas.push(dc.nota);
      if (dc?.ajuste) notas.push(`Ajuste manual${dc.ajuste.por ? ` de ${dc.ajuste.por}` : ''}`);
      if (notas.length) ent.note = notas.join(' · ');
    });

    const total = ws.getCell(r, colTotal);
    dato(total, 'right');
    total.numFmt = FORMATO_HORAS;
    total.font = { name: FUENTE, size: 10, bold: true, color: { argb: EXCEL_COLORES.navy } };
    total.value = { formula: `SUM(${celdasHoras.join(',')})`, result: f.horasTotales } as ExcelJS.CellFormulaValue;
  });

  const ultima = primeraFila + d.filas.length - 1;
  if (d.filas.length) {
    const rt = ultima + 1;
    ws.getRow(rt).height = 20;
    const etiqueta = ws.getCell(rt, 1);
    etiqueta.value = 'TOTAL';
    etiqueta.font = { name: FUENTE, size: 10, bold: true, color: { argb: EXCEL_COLORES.navy } };
    etiqueta.alignment = { vertical: 'middle', horizontal: 'left', indent: 1 };
    const colsHoras = d.dias.map((_, i) => 2 + i * 3 + 2).concat(colTotal);
    for (let c = 1; c <= nCols; c += 1) {
      const celda = ws.getCell(rt, c);
      celda.fill = relleno(EXCEL_COLORES.tealTenue);
      celda.border = { top: { style: 'medium', color: { argb: EXCEL_COLORES.teal } } };
      if (!colsHoras.includes(c)) continue;
      const l = letra(ws, c);
      const suma =
        c === colTotal
          ? d.filas.reduce((a, f) => a + f.horasTotales, 0)
          : d.filas.reduce((a, f) => a + (f.dias.find((x) => x.fecha === d.dias[(c - 4) / 3]?.fecha)?.horas ?? 0), 0);
      celda.value = { formula: `SUM(${l}${primeraFila}:${l}${ultima})`, result: Math.round(suma * 100) / 100 } as ExcelJS.CellFormulaValue;
      celda.numFmt = FORMATO_HORAS;
      celda.font = { name: FUENTE, size: 10, bold: true, color: { argb: EXCEL_COLORES.navy } };
      celda.alignment = { vertical: 'middle', horizontal: 'center' };
    }
  } else {
    const vacia = ws.getCell(primeraFila, 1);
    vacia.value = 'Sin personas en el alcance de esta semana';
    vacia.font = { name: FUENTE, size: 10, italic: true, color: { argb: EXCEL_COLORES.gris } };
  }

  ws.getColumn(1).width = 34;
  d.dias.forEach((_, i) => {
    const c = 2 + i * 3;
    ws.getColumn(c).width = 8.5;
    ws.getColumn(c + 1).width = 8.5;
    ws.getColumn(c + 2).width = 7.5;
  });
  ws.getColumn(colTotal).width = 12;
  ws.views = [{ state: 'frozen', xSplit: 1, ySplit: rSub, showGridLines: false }];
  impresion(ws, `${rDia}:${rSub}`, 'Control de entradas y salidas');
  return ws;
}

// ──────────────────────────────────────────────────────────────────── hoja 2: nómina

const COLUMNAS_NOMINA_FIJAS = [
  'HORAS TOTALES',
  'SUELDO',
  'PAGO X HORA',
  'VIÁTICOS',
  'ÁREA/ACTIVIDAD',
  'EXTRAS/PENDIENTE',
  'SUBTOTAL',
  'DESCUENTOS',
  'TOTAL',
] as const;

function hojaNomina(wb: ExcelJS.Workbook, d: DatosExcelControl, subtitulo: string, idLogo?: number): ExcelJS.Worksheet {
  const ws = wb.addWorksheet(HOJA_NOMINA, { views: [{ showGridLines: false }] });
  const nDias = d.dias.length;
  const col = {
    nombre: 1,
    dia0: 2,
    horas: 2 + nDias,
    sueldo: 3 + nDias,
    pagoHora: 4 + nDias,
    viaticos: 5 + nDias,
    area: 6 + nDias,
    extras: 7 + nDias,
    subtotal: 8 + nDias,
    descuentos: 9 + nDias,
    total: 10 + nDias,
    notas: 11 + nDias,
  };
  const nCols = col.notas;
  const r0 = banda(ws, nCols, 'CONTROL DE NOMINA NEXARA', subtitulo, idLogo);
  const rEnc = r0;
  const primeraFila = rEnc + 1;

  encabezado(ws.getCell(rEnc, col.nombre), 'NOMBRE');
  d.dias.forEach((dia, i) => encabezado(ws.getCell(rEnc, col.dia0 + i), `${dia.nombre} ${dia.numero}`));
  COLUMNAS_NOMINA_FIJAS.forEach((titulo, i) => encabezado(ws.getCell(rEnc, col.horas + i), titulo));
  encabezado(ws.getCell(rEnc, col.notas), 'NOTAS');
  ws.getRow(rEnc).height = 32;

  const L = (c: number) => letra(ws, c);
  const textosNotas: string[] = [];

  d.filas.forEach((f, idx) => {
    const r = primeraFila + idx;
    ws.getRow(r).height = 18;
    const nombre = ws.getCell(r, col.nombre);
    nombre.value = f.nombre.toLocaleUpperCase('es-MX');
    dato(nombre, 'left');

    d.dias.forEach((dia, i) => {
      const dc = f.dias.find((x) => x.fecha === dia.fecha);
      const celda = ws.getCell(r, col.dia0 + i);
      dato(celda);
      celda.value = dc?.lugar ?? null;
      if (dc?.falta) celda.fill = relleno(AMARILLO_FALTA);
      const nota = [dc?.ajuste ? `Ajuste manual${dc.ajuste.por ? ` de ${dc.ajuste.por}` : ''}` : null, dc?.nota ?? null]
        .filter(Boolean)
        .join(' · ');
      if (nota) celda.note = nota;
    });

    const horasCel = ws.getCell(r, col.horas);
    dato(horasCel, 'right');
    horasCel.numFmt = FORMATO_HORAS;
    // Misma persona, misma fila de la hoja de entradas: la suma de allá.
    const colTotalEntradas = letra(ws, 1 + nDias * 3 + 1);
    horasCel.value = {
      formula: `'${HOJA_ENTRADAS}'!${colTotalEntradas}${r + 2}`,
      result: f.horasTotales,
    } as ExcelJS.CellFormulaValue;

    const area = ws.getCell(r, col.area);
    dato(area);
    area.value = f.area;

    const dineros: Array<[number, number | null]> = [
      [col.sueldo, f.sueldoPeriodo],
      [col.pagoHora, f.pagoPorHora],
      [col.viaticos, f.viaticos],
      [col.extras, f.extrasMonto],
      [col.descuentos, f.descuentosTotal],
    ];
    for (const [c, valor] of dineros) {
      const celda = ws.getCell(r, c);
      dato(celda, 'right');
      celda.numFmt = FORMATO_DINERO;
      celda.value = d.verMontos ? (valor ?? 0) : null;
    }
    const subtotal = ws.getCell(r, col.subtotal);
    const total = ws.getCell(r, col.total);
    for (const celda of [subtotal, total]) {
      dato(celda, 'right');
      celda.numFmt = FORMATO_DINERO;
      celda.font = { name: FUENTE, size: 10, bold: true, color: { argb: EXCEL_COLORES.navy } };
    }
    if (d.verMontos) {
      subtotal.value = {
        formula: `${L(col.sueldo)}${r}+${L(col.viaticos)}${r}+${L(col.extras)}${r}`,
        result: f.subtotal ?? 0,
      } as ExcelJS.CellFormulaValue;
      total.value = {
        formula: `${L(col.subtotal)}${r}-${L(col.descuentos)}${r}`,
        result: f.total ?? 0,
      } as ExcelJS.CellFormulaValue;

      if (f.sueldo != null) {
        ws.getCell(r, col.sueldo).note = `Sueldo semanal ${dinero(f.sueldo)}. ${f.sueldoPeriodoExplicacion}`;
        ws.getCell(r, col.pagoHora).note = f.formulaPagoPorHora;
      } else {
        ws.getCell(r, col.sueldo).note = f.sueldoPeriodoExplicacion;
      }
      if (f.viaticosDetalle.length) {
        ws.getCell(r, col.viaticos).note = f.viaticosDetalle
          .map((v) => `${v.concepto}: ${dinero(v.monto)} (${v.estatus})`)
          .join('\n');
      }
      if (f.descuentos.length) {
        // Los sugeridos sin aceptar se ven en la nota pero no restan.
        ws.getCell(r, col.descuentos).note = f.descuentos
          .map((x) => `${x.aceptado ? '' : 'Sugerido sin aceptar · '}${x.concepto}: ${dinero(x.monto)}`)
          .join('\n');
      }
    }
    if (f.extrasMinutosAprobados > 0 || f.extrasMinutosPendientes > 0) {
      ws.getCell(r, col.extras).note = [
        f.extrasMinutosAprobados > 0 ? `Aprobadas: ${horas(f.extrasMinutosAprobados)} h × pago por hora × 2` : null,
        f.extrasMinutosPendientes > 0 ? `PENDIENTE: ${horas(f.extrasMinutosPendientes)} h sin aprobar (no se pagan)` : null,
      ]
        .filter(Boolean)
        .join('\n');
    }

    const notas = [
      f.notaFila,
      f.extrasMinutosPendientes > 0 ? `Extras pendientes: ${horas(f.extrasMinutosPendientes)} h sin aprobar` : null,
      d.verMontos && f.descuentosSugeridos.length
        ? `${f.descuentosSugeridos.length} falta(s) con descuento sugerido sin aceptar`
        : null,
    ]
      .filter(Boolean)
      .join(' · ');
    textosNotas.push(notas);
    const celdaNotas = ws.getCell(r, col.notas);
    celdaNotas.value = notas || null;
    celdaNotas.font = { name: FUENTE, size: 10, italic: true, color: { argb: EXCEL_COLORES.texto } };
    celdaNotas.alignment = { vertical: 'middle', horizontal: 'left', wrapText: true };
  });

  const ultima = primeraFila + d.filas.length - 1;
  if (d.filas.length) {
    const rt = ultima + 1;
    ws.getRow(rt).height = 20;
    const etiqueta = ws.getCell(rt, 1);
    etiqueta.value = 'TOTAL';
    const sumas: Array<[number, number, string]> = [
      [col.horas, d.filas.reduce((a, f) => a + f.horasTotales, 0), FORMATO_HORAS],
      ...(d.verMontos
        ? ([
            [col.sueldo, d.filas.reduce((a, f) => a + (f.sueldoPeriodo ?? 0), 0), FORMATO_DINERO],
            [col.viaticos, d.filas.reduce((a, f) => a + (f.viaticos ?? 0), 0), FORMATO_DINERO],
            [col.extras, d.filas.reduce((a, f) => a + (f.extrasMonto ?? 0), 0), FORMATO_DINERO],
            [col.subtotal, d.filas.reduce((a, f) => a + (f.subtotal ?? 0), 0), FORMATO_DINERO],
            [col.descuentos, d.filas.reduce((a, f) => a + (f.descuentosTotal ?? 0), 0), FORMATO_DINERO],
            [col.total, d.filas.reduce((a, f) => a + (f.total ?? 0), 0), FORMATO_DINERO],
          ] as Array<[number, number, string]>)
        : []),
    ];
    for (let c = 1; c <= nCols; c += 1) {
      const celda = ws.getCell(rt, c);
      celda.fill = relleno(EXCEL_COLORES.tealTenue);
      celda.border = { top: { style: 'medium', color: { argb: EXCEL_COLORES.teal } } };
      celda.font = { name: FUENTE, size: 10, bold: true, color: { argb: EXCEL_COLORES.navy } };
      celda.alignment = { vertical: 'middle', horizontal: c === 1 ? 'left' : 'right', indent: c === 1 ? 1 : 0 };
    }
    for (const [c, suma, formato] of sumas) {
      const celda = ws.getCell(rt, c);
      celda.value = {
        formula: `SUM(${L(c)}${primeraFila}:${L(c)}${ultima})`,
        result: Math.round(suma * 100) / 100,
      } as ExcelJS.CellFormulaValue;
      celda.numFmt = formato;
    }
    ws.autoFilter = { from: { row: rEnc, column: 1 }, to: { row: ultima, column: nCols } };
  } else {
    const vacia = ws.getCell(primeraFila, 1);
    vacia.value = 'Sin personas en el alcance de esta semana';
    vacia.font = { name: FUENTE, size: 10, italic: true, color: { argb: EXCEL_COLORES.gris } };
  }

  ws.getColumn(col.nombre).width = 34;
  d.dias.forEach((_, i) => {
    ws.getColumn(col.dia0 + i).width = 13;
  });
  ws.getColumn(col.horas).width = 10;
  ws.getColumn(col.sueldo).width = 13;
  ws.getColumn(col.pagoHora).width = 11;
  ws.getColumn(col.viaticos).width = 12;
  ws.getColumn(col.area).width = 15;
  ws.getColumn(col.extras).width = 13;
  ws.getColumn(col.subtotal).width = 13;
  ws.getColumn(col.descuentos).width = 13;
  ws.getColumn(col.total).width = 13;
  ws.getColumn(col.notas).width = 46;
  textosNotas.forEach((t, idx) => {
    if (!t) return;
    const lineas = lineasDeTexto(t, 46);
    if (lineas > 1) ws.getRow(primeraFila + idx).height = altoParaLineas(lineas, 18);
  });
  ws.views = [{ state: 'frozen', xSplit: 1, ySplit: rEnc, showGridLines: false }];
  impresion(ws, `${rEnc}:${rEnc}`, 'Control de nómina');
  return ws;
}

// ─────────────────────────────────────────────────────────── hoja 3: cómo se calcula

function hojaComo(wb: ExcelJS.Workbook, d: DatosExcelControl, subtitulo: string, generado: string): ExcelJS.Worksheet {
  const ws = wb.addWorksheet(HOJA_COMO, { views: [{ showGridLines: false }] });
  ws.getColumn(1).width = 24;
  ws.getColumn(2).width = 96;
  const t = ws.getCell(1, 1);
  t.value = 'Cómo se calcula el control de nómina';
  t.font = { name: FUENTE, size: 14, bold: true, color: { argb: EXCEL_COLORES.navy } };
  ws.mergeCells(1, 1, 1, 2);
  ws.getRow(1).height = 26;
  const s = ws.getCell(2, 1);
  s.value = `${subtitulo} · ${generado}`;
  s.font = { name: FUENTE, size: 10, color: { argb: EXCEL_COLORES.gris } };
  ws.mergeCells(2, 1, 2, 2);

  const reglas: Array<[string, string]> = [
    ['Lugar del día', d.formula.lugar],
    ['Horas', d.formula.horas],
    ['Amarillo', 'Día laborable que ya pasó sin checada y sin vacaciones, permiso, justificación, descanso ni guardia: se marca 00:00 · 00:00 · 0.00 en amarillo.'],
    ['Pago por hora', d.formula.pagoPorHora],
    ['Sueldo del periodo', d.formula.sueldoPeriodo],
    ['Viáticos', d.formula.viaticos],
    ['Extras / pendiente', d.formula.extras],
    ['Descuentos', d.formula.descuentos],
    ['Subtotal', d.formula.subtotal],
    ['Total', d.formula.total],
    ['Cierre de la semana', d.formula.cierre],
    ['Área / actividad', 'Operación: dirección de operaciones, coordinación, ingeniería de campo, soporte y obra (por rol o departamento). Administrativo: el resto.'],
    ['Nota de la fila', '«* Toda la semana asignado a …» sale sola cuando todos los días laborables fueron Foráneo en la misma obra o cliente. Se puede escribir a mano.'],
    ['Estado de la semana', d.semana.estado === 'CERRADA' ? 'Cerrada: estas cifras son las que se congelaron al cerrar.' : 'Borrador: las cifras se recalculan con cada checada, viático o aprobación.'],
  ];
  if (!d.verMontos) reglas.push(['Montos', 'Reservados: quien descargó este archivo no ve los montos de nómina.']);
  reglas.forEach(([concepto, regla], i) => {
    const r = 4 + i;
    const a = ws.getCell(r, 1);
    a.value = concepto;
    a.font = { name: FUENTE, size: 10, bold: true, color: { argb: EXCEL_COLORES.navy } };
    a.alignment = { vertical: 'top', horizontal: 'left', indent: 1 };
    a.border = { bottom: { style: 'hair', color: { argb: EXCEL_COLORES.filete } } };
    const b = ws.getCell(r, 2);
    b.value = regla;
    b.font = { name: FUENTE, size: 10, color: { argb: EXCEL_COLORES.texto } };
    b.alignment = { vertical: 'top', horizontal: 'left', wrapText: true };
    b.border = { bottom: { style: 'hair', color: { argb: EXCEL_COLORES.filete } } };
    ws.getRow(r).height = altoParaLineas(lineasDeTexto(regla, 96), 17);
  });
  ws.pageSetup = { orientation: 'portrait', paperSize: 9, fitToPage: true, fitToWidth: 1, fitToHeight: 0 };
  return ws;
}

/** El libro armado (sin escribir): lo usan el endpoint y las pruebas. */
export function libroControlNomina(d: DatosExcelControl): ExcelJS.Workbook {
  const wb = new ExcelJS.Workbook();
  const generadoEn = d.generadoEn ?? new Date();
  wb.creator = 'NEXARA';
  wb.lastModifiedBy = d.generadoPor?.trim() || 'NEXARA';
  wb.created = generadoEn;
  wb.modified = generadoEn;
  wb.title = 'Control de nómina semanal';
  wb.company = 'NEXARA';
  // Que Excel recalcule al abrir: las fórmulas llevan su resultado, pero si alguien corrige
  // una hora el total se mueve solo.
  wb.calcProperties = { fullCalcOnLoad: true };

  const logo = loadNexaraLogo();
  const idLogo = logo ? wb.addImage({ buffer: logo as any, extension: 'png' }) : undefined;
  const subtitulo = `Semana del ${ddmm(d.semana.inicio)}/${anioDe(d.semana.inicio)} al ${ddmm(d.semana.fin)}/${anioDe(d.semana.fin)}${
    d.semana.estado === 'CERRADA' ? ' · CERRADA' : ''
  }`;
  const generado = `Generado por ${d.generadoPor?.trim() || 'NEXARA'} · ${fechaLarga(generadoEn)}`;

  hojaEntradas(wb, d, `${subtitulo} · ${generado}`, idLogo);
  hojaNomina(wb, d, `${subtitulo} · ${generado}`, idLogo);
  hojaComo(wb, d, subtitulo, generado);
  return wb;
}

export async function excelControlNomina(d: DatosExcelControl): Promise<Buffer> {
  return Buffer.from(await libroControlNomina(d).xlsx.writeBuffer());
}

/** Nombre del archivo: `control-nomina-2026-09-28.xlsx`. */
export function nombreArchivoControl(lunes: string): string {
  return `control-nomina-${lunes}.xlsx`;
}
