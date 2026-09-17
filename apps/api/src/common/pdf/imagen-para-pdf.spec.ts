import fs from 'fs';
import os from 'os';
import path from 'path';
import zlib from 'zlib';
import { imagenParaPdf } from './imagen-para-pdf.js';

const FIRMA = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

const TABLA = (() => {
  const t = new Int32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c;
  }
  return t;
})();

function chunk(tipo: string, datos: Buffer) {
  const largo = Buffer.alloc(4);
  largo.writeUInt32BE(datos.length);
  const cuerpo = Buffer.concat([Buffer.from(tipo, 'latin1'), datos]);
  let c = -1;
  for (let i = 0; i < cuerpo.length; i += 1) c = TABLA[(c ^ cuerpo[i]!) & 0xff]! ^ (c >>> 8);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE((c ^ -1) >>> 0);
  return Buffer.concat([largo, cuerpo, crc]);
}

/** PNG RGBA de prueba: franjas verticales sobre fondo semitransparente. */
function pngRgba(ancho: number, alto: number, color = true) {
  const crudo = Buffer.alloc(alto * (1 + ancho * 4));
  for (let y = 0; y < alto; y += 1) {
    const base = y * (1 + ancho * 4);
    crudo[base] = 0;
    for (let x = 0; x < ancho; x += 1) {
      const o = base + 1 + x * 4;
      const linea = x % 16 < 3 ? 20 : 240;
      crudo[o] = linea;
      crudo[o + 1] = color && x % 16 < 3 ? 200 : linea;
      crudo[o + 2] = linea;
      crudo[o + 3] = 255;
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(ancho, 0);
  ihdr.writeUInt32BE(alto, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  return Buffer.concat([
    FIRMA,
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(crudo, { level: 1 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

let carpeta: string;
const escribir = (nombre: string, datos: Buffer) => {
  const ruta = path.join(carpeta, nombre);
  fs.writeFileSync(ruta, datos);
  return ruta;
};

beforeAll(() => {
  carpeta = fs.mkdtempSync(path.join(os.tmpdir(), 'nexara-img-'));
});

afterAll(() => {
  fs.rmSync(carpeta, { recursive: true, force: true });
});

describe('imagenParaPdf', () => {
  it('reduce un PNG grande y lo deja mucho más ligero', () => {
    const original = pngRgba(900, 600);
    const ruta = escribir('plano-grande.png', original);

    const salida = imagenParaPdf(ruta, { maxLado: 360 });

    expect(salida).not.toBeNull();
    expect(salida!.reducida).toBe(true);
    expect(Math.max(salida!.ancho, salida!.alto)).toBe(360);
    expect(salida!.datos.length).toBeLessThan(original.length);
    expect(salida!.datos.subarray(0, 8)).toEqual(FIRMA);
  });

  it('el resultado no lleva alfa: PDFKit no tiene que partirlo en SMask', () => {
    const ruta = escribir('con-alfa.png', pngRgba(700, 500));
    const salida = imagenParaPdf(ruta, { maxLado: 300 })!;
    // colorType vive en el byte 9 del IHDR, que empieza en el byte 16 del archivo.
    const colorType = salida.datos[16 + 9];
    expect(salida.reducida).toBe(true);
    expect([0, 2]).toContain(colorType);
  });

  it('una imagen en blanco y negro sale en escala de grises', () => {
    const ruta = escribir('lineas.png', pngRgba(700, 500, false));
    const salida = imagenParaPdf(ruta, { maxLado: 300 })!;
    expect(salida.datos[16 + 9]).toBe(0);
  });

  it('un PNG chico y sin alfa se queda tal cual', () => {
    const pequeno = pngRgba(40, 30);
    // Se vuelve a escribir sin alfa para que entre por el atajo.
    const ruta = escribir('chico.png', pequeno);
    const reducido = imagenParaPdf(ruta, { maxLado: 1400 })!;
    const ruta2 = escribir('chico-sin-alfa.png', reducido.datos);
    const salida = imagenParaPdf(ruta2, { maxLado: 1400 })!;
    expect(salida.reducida).toBe(false);
    expect(salida.datos.length).toBe(reducido.datos.length);
  });

  it('lee las medidas de un JPEG y lo deja intacto', () => {
    // JPEG mínimo: SOI + SOF0 declarando 300x200 + EOI.
    const sof = Buffer.from([0xff, 0xc0, 0x00, 0x11, 0x08, 0x00, 0xc8, 0x01, 0x2c, 0x03, 0x01, 0x11, 0x00, 0x02, 0x11, 0x01, 0x03, 0x11, 0x01]);
    const jpeg = Buffer.concat([Buffer.from([0xff, 0xd8]), sof, Buffer.from([0xff, 0xd9])]);
    const ruta = escribir('foto.jpg', jpeg);

    const salida = imagenParaPdf(ruta)!;
    expect(salida.ancho).toBe(300);
    expect(salida.alto).toBe(200);
    expect(salida.reducida).toBe(false);
    expect(salida.datos.length).toBe(jpeg.length);
  });

  it('un archivo que no existe devuelve null y no revienta', () => {
    expect(imagenParaPdf(path.join(carpeta, 'no-existe.png'))).toBeNull();
  });

  it('un archivo que no es imagen se devuelve sin tocar', () => {
    const ruta = escribir('cosa.bin', Buffer.from('esto no es una imagen'));
    const salida = imagenParaPdf(ruta)!;
    expect(salida.reducida).toBe(false);
  });
});
