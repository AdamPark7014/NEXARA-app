import PDFDocument from 'pdfkit';
import { TAMANO_TESELA, dibujarMapaOsm, pixelGlobal, teselasParaVista, type LienzoPdf } from './osm-teselas.js';

/**
 * Mapa del PDF con teselas de OpenStreetMap (Google Static Maps da 403 sin facturación).
 */

// PNG de 1×1 válido: basta para que pdfkit lo acepte.
const PNG_1X1 = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
);

describe('teselas de OpenStreetMap', () => {
  it('el punto de la oficina en zoom 16 cae en la tesela que sirve OSM', () => {
    const { px, py } = pixelGlobal(19.07402, -98.27774, 16);
    expect(Math.floor(px / TAMANO_TESELA)).toBe(14877);
    expect(Math.floor(py / TAMANO_TESELA)).toBe(29229);
  });

  it('un recuadro de 220×164 centrado en el punto se cubre con 1 a 4 teselas que lo tapan entero', () => {
    const t = teselasParaVista({ lat: 19.07402, lng: -98.27774, zoom: 16, ancho: 220, alto: 164 });
    expect(t.length).toBeGreaterThanOrEqual(1);
    expect(t.length).toBeLessThanOrEqual(4);
    const minX = Math.min(...t.map((x) => x.dx));
    const minY = Math.min(...t.map((x) => x.dy));
    const maxX = Math.max(...t.map((x) => x.dx + TAMANO_TESELA));
    const maxY = Math.max(...t.map((x) => x.dy + TAMANO_TESELA));
    expect(minX).toBeLessThanOrEqual(0);
    expect(minY).toBeLessThanOrEqual(0);
    expect(maxX).toBeGreaterThanOrEqual(220);
    expect(maxY).toBeGreaterThanOrEqual(164);
  });

  it('dibuja las teselas recortadas, el pin y el crédito', async () => {
    const llamadas: string[] = [];
    const doc: any = new Proxy(
      {},
      {
        get: (_t, prop: string) => (...args: unknown[]) => {
          llamadas.push(prop === 'text' ? `text:${args[0]}` : prop);
          return doc;
        },
      },
    );
    const ok = await dibujarMapaOsm(
      doc as LienzoPdf,
      { x: 40, y: 100, ancho: 220, alto: 164, lat: 19.07402, lng: -98.27774 },
      async () => PNG_1X1,
    );
    expect(ok).toBe(true);
    expect(llamadas).toContain('clip');
    expect(llamadas.filter((c) => c === 'image').length).toBeGreaterThanOrEqual(1);
    expect(llamadas).toContain('circle');
    expect(llamadas).toContain('text:© OpenStreetMap');
  });

  it('si no llega ni la mitad de las teselas no dibuja nada (queda «Mapa no disponible»)', async () => {
    const doc: any = { save: jest.fn() };
    const ok = await dibujarMapaOsm(
      doc as LienzoPdf,
      { x: 0, y: 0, ancho: 220, alto: 164, lat: 19.07402, lng: -98.27774 },
      async () => null,
    );
    expect(ok).toBe(false);
    expect(doc.save).not.toHaveBeenCalled();
  });

  it('pdfkit acepta lo que dibuja', async () => {
    const pdf = new PDFDocument({ size: 'A4', margin: 40 });
    const partes: Buffer[] = [];
    pdf.on('data', (c: Buffer) => partes.push(c));
    const fin = new Promise<Buffer>((resolve) => pdf.on('end', () => resolve(Buffer.concat(partes))));
    const ok = await dibujarMapaOsm(
      pdf as unknown as LienzoPdf,
      { x: 40, y: 100, ancho: 220, alto: 164, lat: 19.07402, lng: -98.27774 },
      async () => PNG_1X1,
    );
    pdf.end();
    const buffer = await fin;
    expect(ok).toBe(true);
    expect(buffer.subarray(0, 4).toString()).toBe('%PDF');
  });
});
