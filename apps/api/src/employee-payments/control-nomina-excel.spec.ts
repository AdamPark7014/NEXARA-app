import ExcelJS from 'exceljs';
import * as fs from 'fs';
import * as path from 'path';
import { EXCEL_COLORES } from '../common/excel/reporte-excel.js';
import { diaDeLaSemana } from '../me/kpis-equipo.js';
import {
  AMARILLO_FALTA,
  FORMATO_DINERO,
  FORMATO_HORAS,
  HOJA_COMO,
  HOJA_ENTRADAS,
  HOJA_NOMINA,
  LEMA_NEXARA,
  excelControlNomina,
  horaAExcel,
  nombreArchivoControl,
  type DatosExcelControl,
} from './control-nomina-excel.js';
import {
  diasDeLaSemana,
  filaControl,
  formulaControl,
  ocultarMontos,
  type EntradaDia,
  type FilaControl,
} from './control-nomina.js';

/**
 * El Excel del control se escribe, se vuelve a leer con ExcelJS (sin abrir Excel) y se revisa
 * contra los dos formatos de Adam: encabezado de dos niveles, sábado y domingo, amarillo en
 * faltas, fórmulas con su resultado y formatos numéricos. Con `EXCEL_MUESTRAS_DIR` deja una
 * muestra para abrirla a mano.
 */
const LUNES = '2026-09-28';
const HOY = '2026-10-05';
const DIAS = diasDeLaSemana(LUNES);
const iso = (fecha: string, hhmm: string) => new Date(`${fecha}T${hhmm}:00-06:00`).toISOString();

function dia(fecha: string, extra: Partial<EntradaDia> = {}): EntradaDia {
  const dow = diaDeLaSemana(fecha);
  return {
    fecha,
    laborable: dow >= 1 && dow <= 5,
    pasado: fecha < HOY,
    checadas: [],
    oficina: 'Oficina',
    entrada: null,
    salida: null,
    minutosLaborados: 0,
    ...extra,
  };
}

function trabajado(fecha: string, entrada = '10:00', salida = '18:00'): EntradaDia {
  return dia(fecha, {
    entrada: iso(fecha, entrada),
    salida: iso(fecha, salida),
    minutosLaborados: 420,
    checadas: [{ tipo: 'entrada', sitioNombre: 'Oficina', fueraDeSitio: false }],
  });
}

function persona(nombre: string, userId: number, faltaEl?: string, extra: Partial<Parameters<typeof filaControl>[0]> = {}): FilaControl {
  return filaControl({
    userId,
    nombre,
    area: 'Administrativo',
    semana: { inicio: LUNES, fin: '2026-10-04' },
    hoy: HOY,
    horario: { etiqueta: 'Oficina · 10:00 a 18:00', entrada: '10:00', salida: '18:00', jornadaOrdinariaMin: 480, dias: [1, 2, 3, 4, 5], personalizado: false },
    sueldoSemanal: 2800,
    dias: DIAS.map((d) => {
      if (d.fecha === faltaEl) return dia(d.fecha);
      return diaDeLaSemana(d.fecha) % 6 === 0 ? dia(d.fecha) : trabajado(d.fecha);
    }),
    viaticos: [{ id: 1, concepto: 'Alimentación', monto: 120, estatus: 'Aprobado' }],
    extrasMinutosAprobados: 0,
    extrasMinutosPendientes: 0,
    descuentos: [],
    ...extra,
  });
}

function datos(filas: FilaControl[], verMontos = true): DatosExcelControl {
  return {
    semana: { inicio: LUNES, fin: '2026-10-04', estado: 'BORRADOR' },
    dias: DIAS,
    filas,
    verMontos,
    formula: formulaControl(),
    generadoPor: 'Christian',
    generadoEn: new Date('2026-10-05T18:00:00.000Z'),
  };
}

async function abrir(buffer: Buffer): Promise<ExcelJS.Workbook> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buffer as any);
  return wb;
}

const formula = (c: ExcelJS.Cell) => c.value as ExcelJS.CellFormulaValue;
const relleno = (c: ExcelJS.Cell) => (c.fill as ExcelJS.FillPattern | undefined)?.fgColor?.argb;
const merges = (ws: ExcelJS.Worksheet): string[] => ((ws as any).model?.merges ?? []) as string[];
/** ExcelJS lee una celda con formato de hora como fecha de 1899: se vuelve a fracción de día. */
const comoFraccion = (v: ExcelJS.CellValue): number =>
  v instanceof Date ? (v.getTime() - Date.UTC(1899, 11, 30)) / 86_400_000 : Number(v);
/** ExcelJS no escribe un resultado 0 en las fórmulas: al leer llega vacío (Excel recalcula al abrir). */
const resultado = (c: ExcelJS.Cell) => (formula(c).result ?? 0) as number;

describe('Excel del control de nómina', () => {
  // Ana cumple toda la semana; Beto faltó el martes 29.
  const filas = [persona('Ana López', 1), persona('Beto Ruiz', 2, '2026-09-29', { notaManual: '* Toda la semana asignado a Hotel Casa Azul' })];
  let wb: ExcelJS.Workbook;

  beforeAll(async () => {
    const buffer = await excelControlNomina(datos(filas));
    if (process.env.EXCEL_MUESTRAS_DIR) {
      fs.mkdirSync(process.env.EXCEL_MUESTRAS_DIR, { recursive: true });
      fs.writeFileSync(path.join(process.env.EXCEL_MUESTRAS_DIR, nombreArchivoControl(LUNES)), buffer);
    }
    wb = await abrir(buffer);
  });

  it('tres hojas: entradas y salidas, nómina y cómo se calcula', () => {
    expect(wb.worksheets.map((w) => w.name)).toEqual([HOJA_ENTRADAS, HOJA_NOMINA, HOJA_COMO]);
    expect(nombreArchivoControl(LUNES)).toBe('control-nomina-2026-09-28.xlsx');
  });

  describe('«Entradas y salidas»', () => {
    let ws: ExcelJS.Worksheet;
    beforeAll(() => {
      ws = wb.getWorksheet(HOJA_ENTRADAS)!;
    });

    it('banda teal con el lema y el título centrado', () => {
      expect(relleno(ws.getCell('A1'))).toBe(EXCEL_COLORES.teal);
      const marca = ws.getCell('A1').value as ExcelJS.CellRichTextValue;
      expect(marca.richText.map((t) => t.text).join('')).toContain(LEMA_NEXARA);
      expect(marca.richText[0].text).toBe('NEXARA');
      expect(ws.getCell('A2').value).toBe('CONTROL DE ENTRADAS Y SALIDAS');
      expect(ws.getCell('A2').alignment?.horizontal).toBe('center');
      expect(String(ws.getCell('A3').value)).toContain('Semana del 28/09/2026 al 04/10/2026');
    });

    it('encabezado de dos niveles: el día (nombre y número) sobre ENTRADA · SALIDA · HORAS', () => {
      expect(ws.getCell('A5').value).toBe('NOMBRE');
      expect(ws.getCell('B5').value).toBe('LUNES');
      expect(ws.getCell('B6').value).toBe('28');
      expect(ws.getCell('B7').value).toBe('ENTRADA');
      expect(ws.getCell('C7').value).toBe('SALIDA');
      expect(ws.getCell('D7').value).toBe('HORAS');
      expect(ws.getCell('E5').value).toBe('MARTES');
      expect(ws.getCell('H5').value).toBe('MIÉRCOLES');
      expect(ws.getCell('K6').value).toBe('01');
      expect(merges(ws)).toEqual(expect.arrayContaining(['A5:A7', 'B5:D5', 'B6:D6', 'E5:G5', 'W5:W7']));
      expect(relleno(ws.getCell('B7'))).toBe(EXCEL_COLORES.teal);
    });

    it('sábado y domingo siempre presentes, y HORAS SEMANA TOTAL al final', () => {
      expect(ws.getCell('Q5').value).toBe('SÁBADO');
      expect(ws.getCell('Q6').value).toBe('03');
      expect(ws.getCell('T5').value).toBe('DOMINGO');
      expect(ws.getCell('T6').value).toBe('04');
      expect(ws.getCell('W5').value).toBe('HORAS SEMANA TOTAL');
    });

    it('nombre en mayúsculas, horas HH:MM y HORAS como fórmula con su resultado', () => {
      expect(ws.getCell('A8').value).toBe('ANA LÓPEZ');
      expect(comoFraccion(ws.getCell('B8').value)).toBeCloseTo(horaAExcel('10:00')!, 10);
      expect(ws.getCell('B8').numFmt).toBe('hh:mm');
      expect(comoFraccion(ws.getCell('C8').value)).toBeCloseTo(18 / 24, 10);
      const horas = formula(ws.getCell('D8'));
      expect(horas.formula).toContain('MOD(C8-B8,1)*24');
      expect(horas.result).toBe(8);
      expect(ws.getCell('D8').numFmt).toBe(FORMATO_HORAS);
    });

    it('sábado sin checada: vacío y 0.00, sin amarillo', () => {
      expect(ws.getCell('Q8').value).toBeNull();
      expect(formula(ws.getCell('S8')).formula).toContain('MOD(R8-Q8,1)');
      expect(resultado(ws.getCell('S8'))).toBe(0);
      expect(relleno(ws.getCell('Q8'))).toBeUndefined();
    });

    it('falta: 00:00 · 00:00 · 0.00 en amarillo', () => {
      // Beto, martes 29: columnas E-G de la fila 9.
      for (const ref of ['E9', 'F9', 'G9']) expect(relleno(ws.getCell(ref))).toBe(AMARILLO_FALTA);
      expect(comoFraccion(ws.getCell('E9').value)).toBe(0);
      expect(comoFraccion(ws.getCell('F9').value)).toBe(0);
      expect(ws.getCell('E9').numFmt).toBe('hh:mm');
      expect(resultado(ws.getCell('G9'))).toBe(0);
      expect(relleno(ws.getCell('B9'))).not.toBe(AMARILLO_FALTA);
    });

    it('HORAS SEMANA TOTAL suma las siete columnas de HORAS', () => {
      const total = formula(ws.getCell('W8'));
      expect(total.formula).toBe('SUM(D8,G8,J8,M8,P8,S8,V8)');
      expect(total.result).toBe(40);
      expect(formula(ws.getCell('W9')).result).toBe(32);
      const pie = formula(ws.getCell('W10'));
      expect(ws.getCell('A10').value).toBe('TOTAL');
      expect(pie.formula).toBe('SUM(W8:W9)');
      expect(pie.result).toBe(72);
    });
  });

  describe('«Nómina»', () => {
    let ws: ExcelJS.Worksheet;
    beforeAll(() => {
      ws = wb.getWorksheet(HOJA_NOMINA)!;
    });

    it('mismo encabezado con lema y el título de su formato', () => {
      const marca = ws.getCell('A1').value as ExcelJS.CellRichTextValue;
      expect(marca.richText.map((t) => t.text).join('')).toContain(LEMA_NEXARA);
      expect(ws.getCell('A2').value).toBe('CONTROL DE NOMINA NEXARA');
    });

    it('columnas de su Excel, con autofiltro y notas a la derecha', () => {
      const titulos = Array.from({ length: 18 }, (_, i) => ws.getRow(5).getCell(i + 1).value);
      expect(titulos).toEqual([
        'NOMBRE',
        'LUNES 28',
        'MARTES 29',
        'MIÉRCOLES 30',
        'JUEVES 01',
        'VIERNES 02',
        'SÁBADO 03',
        'DOMINGO 04',
        'HORAS TOTALES',
        'SUELDO',
        'PAGO X HORA',
        'VIÁTICOS',
        'ÁREA/ACTIVIDAD',
        'EXTRAS/PENDIENTE',
        'SUBTOTAL',
        'DESCUENTOS',
        'TOTAL',
        'NOTAS',
      ]);
      expect(ws.autoFilter).toBe('A5:R7');
    });

    it('cada día dice dónde trabajó; la falta, en amarillo', () => {
      expect(ws.getCell('B6').value).toBe('Oficina');
      expect(ws.getCell('G6').value).toBe('Descanso');
      expect(ws.getCell('C7').value).toBe('Falta');
      expect(relleno(ws.getCell('C7'))).toBe(AMARILLO_FALTA);
      expect(ws.getCell('M6').value).toBe('Administrativo');
    });

    it('montos con formato de pesos; SUBTOTAL y TOTAL son fórmulas', () => {
      expect(ws.getCell('J6').value).toBe(2800);
      expect(ws.getCell('J6').numFmt).toBe(FORMATO_DINERO);
      expect(ws.getCell('K6').value).toBe(70);
      expect(ws.getCell('L6').value).toBe(120);
      expect(ws.getCell('I6').numFmt).toBe(FORMATO_HORAS);
      expect(formula(ws.getCell('I6')).formula).toBe(`'${HOJA_ENTRADAS}'!W8`);
      expect(formula(ws.getCell('I6')).result).toBe(40);
      expect(formula(ws.getCell('O6'))).toMatchObject({ formula: 'J6+L6+N6', result: 2920 });
      expect(formula(ws.getCell('Q6'))).toMatchObject({ formula: 'O6-P6', result: 2920 });
      expect(ws.getCell('Q6').numFmt).toBe(FORMATO_DINERO);
      expect(formula(ws.getCell('Q8'))).toMatchObject({ formula: 'SUM(Q6:Q7)' });
    });

    it('la nota de la fila va a la derecha y el descuento sugerido sin aceptar se avisa', () => {
      expect(String(ws.getCell('R7').value)).toContain('* Toda la semana asignado a Hotel Casa Azul');
      expect(String(ws.getCell('R7').value)).toContain('descuento sugerido sin aceptar');
      // Se ve en la nota de DESCUENTOS, pero la celda no lo resta.
      expect(ws.getCell('P7').note).toEqual(expect.stringContaining('Sugerido sin aceptar · Falta injustificada · MARTES 29/09'));
      expect(ws.getCell('P7').value).toBe(0);
    });
  });

  it('«Cómo se calcula» explica cada columna', () => {
    const ws = wb.getWorksheet(HOJA_COMO)!;
    const texto = ws.getColumn(2).values.filter(Boolean).join('\n');
    expect(texto).toContain('PAGO X HORA');
    expect(texto).toContain('TOTAL = SUBTOTAL − DESCUENTOS');
    expect(texto).toContain('amarillo');
  });

  it('sin montos: las columnas de dinero salen vacías y sin fórmulas', async () => {
    const ocultas = filas.map(ocultarMontos);
    const libro = await abrir(await excelControlNomina(datos(ocultas, false)));
    const ws = libro.getWorksheet(HOJA_NOMINA)!;
    for (const ref of ['J6', 'K6', 'L6', 'N6', 'O6', 'P6', 'Q6']) expect(ws.getCell(ref).value).toBeNull();
    expect(ws.getCell('B6').value).toBe('Oficina');
    expect(formula(ws.getCell('I6')).result).toBe(40);
    const como = libro.getWorksheet(HOJA_COMO)!;
    expect(como.getColumn(2).values.join(' ')).toContain('Reservados');
  });
});
