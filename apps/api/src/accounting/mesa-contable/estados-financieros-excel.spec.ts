import ExcelJS from 'exceljs';
import { EXCEL_COLORES, EXCEL_FUENTE } from '../../common/excel/reporte-excel.js';
import { EstadosFinancierosService } from './estados-financieros.service.js';
import type { SaldoCuenta } from './estados-financieros.js';

/**
 * El Excel de estados financieros se escribe y se vuelve a leer con ExcelJS. Lo que se cuida:
 * que lleve la misma banda e impresión que los demás Excel de NEXARA (antes salía sin marca y
 * las columnas de comparación se imprimían en hojas aparte) y que los totales sigan siendo
 * fórmulas que apuntan a las filas correctas.
 */

const NOMBRE_LARGO = 'Ventas de proyectos de videovigilancia, control de acceso y cableado estructurado';

const CUENTAS: Array<[string, string, SaldoCuenta['tipo'], string | null, number, number]> = [
  ['102.01', 'Bancos nacionales', 'ASSET', '102.01', 480000, 120000],
  ['201.01', 'Proveedores nacionales', 'LIABILITY', '201.01', 40000, 260000],
  ['301.01', 'Capital social', 'EQUITY', '301.01', 0, 500000],
  ['401.01', NOMBRE_LARGO, 'REVENUE', '401.01', 0, 820000],
  ['401.02', 'Pólizas de mantenimiento', 'REVENUE', '401.01', 0, 240000],
  ['501.01', 'Costo de equipo vendido', 'EXPENSE', '501.01', 410000, 0],
  ['601.01', 'Sueldos y salarios', 'EXPENSE', '601.01', 180000, 0],
  ['601.34', 'Honorarios', 'EXPENSE', null, 24000, 0],
  ['603.01', 'Intereses a cargo', 'EXPENSE', '603.01', 8200, 0],
];

const saldos = (factor: number): SaldoCuenta[] =>
  CUENTAS.map(([codigo, nombre, tipo, agrupador, debe, haber], i) => ({
    cuentaId: i + 1,
    codigo,
    nombre,
    tipo,
    agrupador,
    debe: Math.round(debe * factor * 100) / 100,
    haber: Math.round(haber * factor * 100) / 100,
  }));

function servicio(): EstadosFinancierosService {
  const prisma = {
    fiscalPeriod: { findFirst: async () => null },
    journalEntryLine: { aggregate: async () => ({ _sum: { debit: 100, credit: 100 } }) },
  };
  const pagos = { listar: async () => ({ resumen: { sinPoliza: { conteo: 0 }, porConciliar: { conteo: 0 } } }) };
  const s = new EstadosFinancierosService(prisma as any, pagos as any);
  // Octubre trae los saldos completos; cualquier otro rango, 86 %: así la comparación no sale en ceros.
  s.saldos = async (_tenant, _from, to) => saldos(to.startsWith('2026-10') ? 1 : 0.86);
  return s;
}

const formula = (c: ExcelJS.Cell) => (c.value as ExcelJS.CellFormulaValue).formula;
const relleno = (c: ExcelJS.Cell) => (c.fill as ExcelJS.FillPattern | undefined)?.fgColor?.argb;
/** Fila cuya celda de la columna `col` dice exactamente `texto`. */
function filaDe(ws: ExcelJS.Worksheet, texto: string, col = 1): number {
  let n = 0;
  ws.eachRow((row, i) => {
    if (!n && row.getCell(col).value === texto) n = i;
  });
  if (!n) throw new Error(`No hay fila «${texto}» en ${ws.name}`);
  return n;
}

describe('Excel de estados financieros', () => {
  let wb: ExcelJS.Workbook;
  let nombre: string;

  beforeAll(async () => {
    const salida = await servicio().excel(1, 'mes', '2026-10', 'Persona Demo');
    nombre = salida.nombre;
    wb = new ExcelJS.Workbook();
    await wb.xlsx.load(salida.buffer as any);
  });

  it('trae las tres hojas y el nombre de archivo del periodo', () => {
    expect(wb.worksheets.map((w) => w.name)).toEqual(['Estado de resultados', 'Balance general', 'Balanza']);
    expect(nombre).toBe('estados-financieros-2026-10.xlsx');
  });

  it.each([
    ['Estado de resultados', 'Estado de resultados', 'Cuenta'],
    ['Balance general', 'Balance general', 'Cuenta'],
    ['Balanza', 'Balanza de comprobación', 'Cuenta'],
  ])('%s lleva la banda NEXARA, el encabezado teal y se imprime en una hoja de ancho', (hoja, titulo, primeraColumna) => {
    const ws = wb.getWorksheet(hoja)!;
    expect(ws.getCell('A2').value).toBe(titulo);
    expect(ws.getCell('A2').font).toMatchObject({ name: EXCEL_FUENTE, size: 16, bold: true });
    expect(String(ws.getCell('A4').value)).toMatch(/^Generado por Persona Demo · /);

    const h = filaDe(ws, primeraColumna);
    expect(relleno(ws.getCell(h, 1))).toBe(EXCEL_COLORES.teal);
    expect(ws.getCell(h, 1).font).toMatchObject({ bold: true, color: { argb: EXCEL_COLORES.blanco } });

    expect(ws.pageSetup).toMatchObject({ orientation: 'portrait', fitToPage: true, fitToWidth: 1, fitToHeight: 0 });
    expect(ws.pageSetup.printTitlesRow).toBe(`${h}:${h}`);
    expect(ws.headerFooter.oddFooter).toContain('Página &P de &N');
    expect(ws.views[0]).toMatchObject({ state: 'frozen', ySplit: h, showGridLines: false });
  });

  describe('estado de resultados', () => {
    let ws: ExcelJS.Worksheet;
    beforeAll(() => {
      ws = wb.getWorksheet('Estado de resultados')!;
    });

    it('titula las columnas con el periodo y con el que se compara', () => {
      const h = filaDe(ws, 'Cuenta');
      expect([1, 2, 3, 4, 5].map((c) => ws.getCell(h, c).value)).toEqual([
        'Cuenta',
        'Agrupador SAT',
        'Octubre 2026',
        'Septiembre 2026',
        'Variación',
      ]);
      expect(ws.getCell('A3').value).toBe('Octubre 2026 · comparado con Septiembre 2026');
    });

    it('las sumas y las utilidades son fórmulas sobre las filas correctas', () => {
      const ingresos = filaDe(ws, 'Ingresos');
      const sumaIngresos = filaDe(ws, 'Suma de ingresos');
      expect(sumaIngresos).toBe(ingresos + 3);
      expect(formula(ws.getCell(sumaIngresos, 3))).toBe(`SUM(C${ingresos + 1}:C${ingresos + 2})`);
      expect(formula(ws.getCell(sumaIngresos, 4))).toBe(`SUM(D${ingresos + 1}:D${ingresos + 2})`);

      const sumaCostos = filaDe(ws, 'Suma de costo de ventas');
      const sumaGastos = filaDe(ws, 'Suma de gastos de operación');
      const sumaFin = filaDe(ws, 'Suma de resultado de financiamiento e impuestos');
      expect(formula(ws.getCell(filaDe(ws, 'Utilidad bruta'), 3))).toBe(`C${sumaIngresos}-C${sumaCostos}`);
      const operacion = filaDe(ws, 'Utilidad de operación');
      expect(formula(ws.getCell(operacion, 3))).toBe(`C${sumaIngresos}-C${sumaCostos}-C${sumaGastos}`);
      const neta = filaDe(ws, 'Utilidad neta');
      expect(formula(ws.getCell(neta, 3))).toBe(`C${operacion}+C${sumaFin}`);
      expect(formula(ws.getCell(neta, 5))).toBe(`IF(D${neta}=0,"",(C${neta}-D${neta})/ABS(D${neta}))`);
      expect(ws.getCell(neta, 5).numFmt).toBe('0.0%');
    });

    it('los importes llevan separador de miles y los negativos en rojo', () => {
      const fila = filaDe(ws, '601.34 Honorarios');
      expect(ws.getCell(fila, 3).value).toBe(24000);
      expect(ws.getCell(fila, 3).numFmt).toBe('#,##0.00;[Red]-#,##0.00');
      expect(ws.getCell(fila, 2).value).toBe('Sin agrupador');
    });

    it('un nombre de cuenta largo se ajusta en su celda y la fila crece', () => {
      const fila = filaDe(ws, `401.01 ${NOMBRE_LARGO}`);
      expect(ws.getCell(fila, 1).alignment).toMatchObject({ wrapText: true });
      expect(ws.getRow(fila).height).toBeGreaterThan(17);
      // Una cuenta corta conserva el alto normal.
      expect(ws.getRow(filaDe(ws, '401.02 Pólizas de mantenimiento')).height).toBe(17);
    });
  });

  it('el balance cuadra con una fórmula y cada lado suma sus secciones', () => {
    const ws = wb.getWorksheet('Balance general')!;
    const activo = filaDe(ws, 'Total activo');
    const pasivo = filaDe(ws, 'Total pasivo');
    const capital = filaDe(ws, 'Total capital');
    expect(formula(ws.getCell(filaDe(ws, 'Activo − (pasivo + capital)'), 3))).toBe(`C${activo}-(C${pasivo}+C${capital})`);
    expect(formula(ws.getCell(activo, 3))).toMatch(/^C\d+(\+C\d+)*$/);
    expect(ws.getCell(filaDe(ws, 'Bancos nacionales'), 3).value).toBe(360000);
  });

  it('la balanza lista las cuentas en orden, con sumas iguales y autofiltro', () => {
    const ws = wb.getWorksheet('Balanza')!;
    const h = filaDe(ws, 'Cuenta');
    const codigos: string[] = [];
    ws.eachRow((row, n) => {
      if (n > h && row.getCell(1).value) codigos.push(String(row.getCell(1).value));
    });
    expect(codigos).toEqual(CUENTAS.map((c) => c[0]));
    const sumas = filaDe(ws, 'Sumas iguales', 2);
    expect(formula(ws.getCell(sumas, 4))).toBe(`SUM(D${h + 1}:D${sumas - 1})`);
    expect(formula(ws.getCell(sumas, 5))).toBe(`SUM(E${h + 1}:E${sumas - 1})`);
    // ExcelJS devuelve el autofiltro como rango al leer el archivo.
    expect(ws.autoFilter).toBe(`A${h}:E${sumas - 1}`);
  });
});
