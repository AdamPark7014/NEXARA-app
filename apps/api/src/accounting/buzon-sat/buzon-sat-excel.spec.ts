import ExcelJS from 'exceljs';
import { BuzonSatService } from './buzon-sat.service.js';

/**
 * El Excel del buzón SAT pasó de un volcado sin formato al tema de los demás reportes. Se
 * revisa abriendo el archivo: banda, fechas de verdad, importes con formato, estatus como se
 * leen y totales con fórmula.
 */

const ITEMS = [
  {
    // `issueDate` es una columna `@db.Date`: llega como medianoche UTC.
    issueDate: new Date('2026-10-05T00:00:00.000Z'),
    cfdiUuid: '3F2504E0-4F89-41D3-9A0C-0305E82C3301',
    emisorName: 'Proveedor Demo de Cámaras, S.A. de C.V.',
    emisorRfc: 'PDC010101AAA',
    receptorName: 'Empresa Demo, S.A. de C.V.',
    totalAmount: 58000,
    taxAmount: 8000,
    satEstatus: 'vigente',
    lista69B: null,
  },
  {
    issueDate: new Date('2026-10-20T00:00:00.000Z'),
    cfdiUuid: '0A1B2C3D-4E5F-4A6B-8C7D-9E0F1A2B3C4D',
    emisorName: 'Servicios Demo del Centro',
    emisorRfc: 'SDC030303CCC',
    receptorName: 'Empresa Demo, S.A. de C.V.',
    totalAmount: 23200,
    taxAmount: 3200,
    satEstatus: 'cancelado',
    lista69B: 'PRESUNTO',
  },
];

async function excel(listado: Record<string, unknown>, generadoPor?: string): Promise<ExcelJS.Worksheet> {
  const servicio: BuzonSatService = Object.create(BuzonSatService.prototype);
  servicio.listar = (async () => listado) as any;
  const { buffer, nombre } = await servicio.excel(1, {}, generadoPor);
  expect(nombre).toMatch(/^buzon-sat-\d{4}-\d{2}-\d{2}\.xlsx$/);
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buffer as any);
  return wb.getWorksheet('Buzón SAT')!;
}

describe('Excel del buzón SAT', () => {
  let ws: ExcelJS.Worksheet;
  // Banda: logo, título, periodo, «Generado por», filete; los encabezados van en la fila 6.
  const ENCABEZADO = 6;

  beforeAll(async () => {
    ws = await excel({ pestana: 'recibidos', desde: '2026-10-01', hasta: '2026-10-31', items: ITEMS }, 'Persona Demo');
  });

  it('la banda dice la pestaña, el periodo como se lee y quién lo generó', () => {
    expect(ws.getCell('A2').value).toBe('Buzón SAT · Recibidos');
    expect(ws.getCell('A3').value).toBe('01/10/2026 al 31/10/2026');
    expect(String(ws.getCell('A4').value)).toMatch(/^Generado por Persona Demo · /);
    // Ya no trae la hora del servidor en ISO.
    expect(String(ws.getCell('A4').value)).not.toMatch(/\dT\d{2}:\d{2}/);
  });

  it('columnas en español, con los importes al final', () => {
    const titulos = [1, 2, 3, 4, 5, 6, 7, 8, 9].map((c) => ws.getCell(ENCABEZADO, c).value);
    expect(titulos).toEqual(['Fecha', 'Emisor', 'RFC emisor', 'Receptor', 'UUID', 'Estatus SAT', 'Lista 69-B', 'Total', 'IVA']);
  });

  it('la fecha es una fecha de Excel del día correcto, no un texto ni «###»', () => {
    const celda = ws.getCell(ENCABEZADO + 1, 1);
    expect(celda.value).toEqual(new Date(Date.UTC(2026, 9, 5)));
    expect(celda.numFmt).toBe('dd/mm/yyyy');
    expect(ws.getColumn(1).width).toBeGreaterThanOrEqual(10);
  });

  it('estatus y lista 69-B como se leen; importes con formato de dinero', () => {
    expect(ws.getCell(ENCABEZADO + 1, 6).value).toBe('Vigente');
    expect(ws.getCell(ENCABEZADO + 2, 6).value).toBe('Cancelado');
    expect(ws.getCell(ENCABEZADO + 1, 7).value).toBeNull();
    expect(ws.getCell(ENCABEZADO + 2, 7).value).toBe('Presunto');
    expect(ws.getCell(ENCABEZADO + 1, 8).value).toBe(58000);
    expect(ws.getCell(ENCABEZADO + 1, 8).numFmt).toBe('"$" #,##0.00');
    // El UUID completo cabe en su columna.
    expect(ws.getColumn(5).width).toBeGreaterThanOrEqual(38);
  });

  it('total e IVA se suman con fórmulas', () => {
    const total = ENCABEZADO + ITEMS.length + 1;
    expect(ws.getCell(total, 1).value).toBe('Total');
    expect((ws.getCell(total, 8).value as ExcelJS.CellFormulaValue).formula).toBe(`SUM(H${ENCABEZADO + 1}:H${total - 1})`);
    expect((ws.getCell(total, 9).value as ExcelJS.CellFormulaValue).formula).toBe(`SUM(I${ENCABEZADO + 1}:I${total - 1})`);
  });

  it('sin rango dice «Todas las fechas» y sin CFDI lo avisa en la hoja', async () => {
    const vacia = await excel({ pestana: 'emitidos', desde: null, hasta: null, items: [] });
    expect(vacia.getCell('A2').value).toBe('Buzón SAT · Emitidos');
    expect(vacia.getCell('A3').value).toBe('Todas las fechas');
    expect(String(vacia.getCell('A4').value)).toMatch(/^Generado por NEXARA · /);
    expect(vacia.getCell(ENCABEZADO + 1, 1).value).toBe('Sin registros para los filtros aplicados');
  });
});
