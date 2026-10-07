import ExcelJS from 'exceljs';
import {
  csvAHtml,
  excelAHtml,
  letraDeColumna,
  limpiaHtmlDeWord,
  parseaCsv,
  tieneVistaPreviaHtml,
  tipoDeDocumento,
  vistaPreviaHtml,
} from './vista-previa-documento';

describe('vista previa de documentos', () => {
  it('reconoce el tipo por extensión y, si no hay, por MIME', () => {
    expect(tipoDeDocumento('Propuesta.PDF')).toBe('pdf');
    expect(tipoDeDocumento('/uploads/x/cotizacion.xlsx?v=2')).toBe('excel');
    expect(tipoDeDocumento('minuta.docx')).toBe('word');
    expect(tipoDeDocumento('lista.csv')).toBe('csv');
    expect(tipoDeDocumento('foto.HEIC')).toBe('imagen');
    expect(tipoDeDocumento('archivo', 'application/pdf')).toBe('pdf');
    expect(tipoDeDocumento('viejo.doc')).toBe('otro');
    expect(tieneVistaPreviaHtml('excel')).toBe(true);
    expect(tieneVistaPreviaHtml('pdf')).toBe(false);
  });

  it('letras de columna como Excel', () => {
    expect([1, 26, 27, 52, 703].map(letraDeColumna)).toEqual(['A', 'Z', 'AA', 'AZ', 'AAA']);
  });

  it('Excel: hojas, fórmulas con su resultado y texto escapado', async () => {
    const libro = new ExcelJS.Workbook();
    const hoja = libro.addWorksheet('Partidas');
    hoja.addRow(['Concepto', 'Cantidad', 'Precio']);
    hoja.addRow(['Cámara <b>4K</b>', 2, 1500]);
    hoja.getCell('D2').value = { formula: 'B2*C2', result: 3000 } as ExcelJS.CellFormulaValue;
    libro.addWorksheet('Vacía');
    const buffer = Buffer.from(await libro.xlsx.writeBuffer());
    const html = await excelAHtml(buffer, 'Cotización.xlsx');
    expect(html).toContain('<h2>Partidas</h2>');
    expect(html).toContain('Cámara &lt;b&gt;4K&lt;/b&gt;');
    expect(html).toContain('<td class="n">3000</td>');
    expect(html).toContain('<h2>Vacía</h2><p class="aviso">Hoja vacía.</p>');
    expect(html).not.toMatch(/<script/i);
  });

  it('CSV con comillas, saltos dentro y separador punto y coma', () => {
    expect(parseaCsv('a;b\n"x;1";"dijo ""hola"""\n')).toEqual([
      ['a', 'b'],
      ['x;1', 'dijo "hola"'],
    ]);
    const html = csvAHtml(Buffer.from('Nombre,Monto\n"<img src=x onerror=alert(1)>",12.5\n'), 'datos.csv');
    expect(html).toContain('&lt;img src=x onerror=alert(1)&gt;');
    expect(html).toContain('<td class="n">12.5</td>');
  });

  it('Word: quita scripts, eventos y enlaces javascript aunque la CSP ya los bloquee', () => {
    expect(
      limpiaHtmlDeWord('<p onclick="x()">Hola</p><script>alert(1)</script><a href="javascript:alert(1)">y</a><a href="https://a.b">z</a>'),
    ).toBe('<p>Hola</p><a>y</a><a href="https://a.b">z</a>');
  });

  it('PDF e imágenes no tienen vista previa HTML (las pinta el visor)', async () => {
    await expect(vistaPreviaHtml(Buffer.from('%PDF-1.4'), 'a.pdf')).resolves.toBeNull();
  });
});
