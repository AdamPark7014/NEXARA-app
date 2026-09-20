import { generateCotizacionPdf, warrantyLines, type CotizacionPdfPayload } from './cotizacion-pdf';

const partida = (name: string, warrantyMonths?: number) => ({
  name,
  qty: 1,
  unitPrice: 1000,
  discount: 0,
  tax: 16,
  lineTotal: 1000,
  ...(warrantyMonths ? { warrantyMonths } : {}),
});

const base = (items: CotizacionPdfPayload['items']): CotizacionPdfPayload => ({
  quoteNumber: 'NEX-COT-0001',
  issueDate: '2026-09-20',
  validUntil: '2026-10-20',
  status: 'SENT',
  clientCompany: 'Cliente de prueba S.A. de C.V.',
  currency: 'MXN',
  depositPercent: 50,
  subtotal: items.length * 1000,
  discountTotal: 0,
  taxTotal: items.length * 160,
  total: items.length * 1160,
  items,
});

describe('garantías de la cotización', () => {
  it('dice una sola vez el plazo cuando todas las partidas coinciden', () => {
    const lineas = warrantyLines(base([partida('Cámara', 12), partida('NVR', 12), partida('Switch', 12)]));
    expect(lineas).toEqual(['Todas las partidas de esta cotización: 12 meses de garantía.']);
  });

  it('agrupa por plazo cuando hay varios, del mayor al menor', () => {
    const lineas = warrantyLines(base([partida('NVR', 36), partida('Cámara', 12), partida('Switch', 12)]));
    expect(lineas).toEqual(['36 meses: NVR.', '12 meses: Cámara, Switch.']);
  });

  it('no resume si alguna partida no trae garantía', () => {
    const lineas = warrantyLines(base([partida('Cámara', 12), partida('Mano de obra')]));
    expect(lineas).toEqual(['12 meses: Cámara.']);
  });

  it('no inventa renglones cuando ninguna partida trae garantía', () => {
    expect(warrantyLines(base([partida('Mano de obra')]))).toEqual([]);
  });
});

describe('PDF de cotización', () => {
  it('genera un PDF con las fuentes corporativas embebidas', async () => {
    const buffer = await generateCotizacionPdf(base([partida('Cámara IP 4 MP', 12)]));

    expect(buffer.subarray(0, 5).toString('latin1')).toBe('%PDF-');
    // Las fuentes van embebidas: un documento en Helvetica pesa ~20 KB.
    expect(buffer.length).toBeGreaterThan(60_000);
    expect(buffer.toString('latin1')).toContain('Montserrat');
    expect(buffer.toString('latin1')).toContain('Inter');
  });
});
