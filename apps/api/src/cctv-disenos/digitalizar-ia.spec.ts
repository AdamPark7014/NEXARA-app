import { limpiarLectura, peticionDigitalizar } from './digitalizar-ia.js';
import { DigitalizarCctvService } from './digitalizar.service.js';

describe('limpiarLectura', () => {
  it('pasa de 0–1000 a píxeles del croquis y numera las cámaras', () => {
    const l = limpiarLectura(
      {
        clase: 'plano',
        anchoM: 32,
        escala: '1:100',
        muros: [
          { a: { x: 0, y: 0 }, b: { x: 1000, y: 0 } },
          { a: { x: 500, y: 500 }, b: { x: 502, y: 501 } }, // diminuto: fuera
        ],
        areas: [{ nombre: 'Recepción', x: 100, y: 100, ancho: 300, alto: 200 }],
        camaras: [
          { x: 100, y: 200, rumbo: 45, tipo: 'domo', ubicacion: 'Recepción, esquina', altura: 2.7, segura: true },
          { x: 1500, y: -20, rumbo: -1, tipo: 'raro', ubicacion: '', altura: 0, segura: false },
        ],
        dudas: ['La cámara 2 no se lee', ''],
      },
      2000,
      1000,
    );
    expect(l.clase).toBe('plano');
    expect(l.anchoM).toBe(32);
    expect(l.muros).toEqual([{ a: { x: 0, y: 0 }, b: { x: 2000, y: 0 } }]);
    expect(l.areas).toEqual([{ nombre: 'Recepción', x: 200, y: 100, ancho: 600, alto: 200 }]);
    expect(l.camaras).toEqual([
      { numero: 1, pos: { x: 200, y: 200 }, rumboDeg: 45, tipo: 'domo', ubicacion: 'Recepción, esquina', alturaM: 2.7, segura: true },
      { numero: 2, pos: { x: 2000, y: 0 }, rumboDeg: null, tipo: 'otra', ubicacion: '', alturaM: null, segura: false },
    ]);
    expect(l.dudas).toEqual(['La cámara 2 no se lee']);
  });

  it('sin escala ni nada útil queda vacía, sin tronar', () => {
    expect(limpiarLectura({ clase: 'foto', anchoM: 0, escala: '', muros: 'x', areas: null, camaras: undefined, dudas: [] }, 100, 100)).toEqual({
      clase: 'foto',
      anchoM: null,
      escalaTexto: null,
      muros: [],
      areas: [],
      camaras: [],
      dudas: [],
    });
  });

  it('la petición lleva la imagen y Haiku salvo que el entorno diga otro modelo', () => {
    const p = peticionDigitalizar({ mediaType: 'image/jpeg', base64: 'AAA' }, 'planta baja');
    expect(p.modelo).toBe('claude-haiku-5-5');
    expect(p.imagenes).toHaveLength(1);
    expect(p.usuario).toContain('planta baja');
  });
});

describe('DigitalizarCctvService.rutaDelCroquis', () => {
  const s = new DigitalizarCctvService({} as any, {} as any);
  it('solo acepta croquis de ese diseño', () => {
    expect(s.rutaDelCroquis(7, '/uploads/cctv-croquis/7-1731700000000-0123456789abcdef.png?v=1')).toMatch(/cctv-croquis[\\/]7-1731700000000-0123456789abcdef\.png$/);
    expect(() => s.rutaDelCroquis(7, '/uploads/cctv-croquis/8-1731700000000-0123456789abcdef.png')).toThrow(/no es de este diseño/);
    expect(() => s.rutaDelCroquis(7, '../../etc/passwd')).toThrow(/no es de este diseño/);
  });
});

import { revisarDocumento } from './documento-expediente.js';
describe('revisarDocumento', () => {
  const b = (t: string) => Buffer.from(t);
  it('acepta documentos de obra y limpia el nombre', () => {
    expect(revisarDocumento({ buffer: b('%PDF-1.7'), originalname: 'Planta baja.pdf' })).toEqual({ nombre: 'Planta baja.pdf', extension: 'pdf', tipo: 'pdf' });
    expect(revisarDocumento({ buffer: b('PK'), originalname: '../x/Requerimientos.docx' }).nombre).toBe('.. x Requerimientos.docx');
    expect(revisarDocumento({ buffer: b('AC10'), originalname: 'Plano.DWG' }).tipo).toBe('cad');
  });
  it('rechaza ejecutables y lo que no es documento', () => {
    expect(() => revisarDocumento({ buffer: b('MZ..'), originalname: 'factura.pdf' })).toThrow(/no es un documento/);
    expect(() => revisarDocumento({ buffer: b('x'), originalname: 'virus.exe' })).toThrow(/no se acepta/);
    expect(() => revisarDocumento({ buffer: b('x'), originalname: 'sinextension' })).toThrow(/no se acepta/);
  });
});
