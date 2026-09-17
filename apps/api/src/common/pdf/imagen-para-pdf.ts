import fs from 'fs';
import zlib from 'zlib';

/**
 * Imágenes que entran a un PDF sin engordarlo.
 *
 * Un plano exportado de CAD o una foto de levantamiento llega con 2500 px de lado y 2 MB. PDFKit
 * lo mete tal cual, y encima un PNG con alfa lo parte en dos flujos y vuelve a comprimir los dos:
 * la propuesta acaba pesando lo que pesa la foto, y tardando lo que tarda comprimirla.
 *
 * Aquí se reduce ANTES de entregársela a PDFKit: se baja a la resolución que de verdad se imprime
 * (el hueco del plano mide ~500 pt de ancho, así que más de 1400 px no se ve), se aplana el alfa
 * sobre blanco —que además evita el camino lento del SMask— y se reencoda en escala de grises
 * cuando la imagen no tiene color, que es el caso de casi todos los planos.
 *
 * Sin dependencias nuevas: el decodificador PNG son zlib y los cinco filtros del formato. Si la
 * imagen no es un PNG de 8 bits sin entrelazar, no se toca y se embebe como venga, que siempre es
 * mejor que perder el anexo.
 */

export type ImagenPdf = {
  /** Lo que se le pasa a `doc.image(...)`: bytes ya listos. */
  datos: Buffer;
  ancho: number;
  alto: number;
  /** `true` si se recomprimió; útil para pruebas y para el banco de medición. */
  reducida: boolean;
};

export type OpcionesImagen = {
  /** Lado máximo en píxeles después de reducir. Por omisión 1400 (≈200 ppp en media carta). */
  maxLado?: number;
  /** Debajo de esto no vale la pena tocar la imagen. Por omisión 300 KB. */
  maxBytes?: number;
  /**
   * Color sobre el que se aplana el alfa, en RGB 0-255. Por omisión blanco.
   *
   * Importa cuando la imagen va sobre un fondo de color: un plano recortado se aplana sobre el
   * mismo tono de la página y el recuadro no se nota.
   */
  fondo?: [number, number, number];
  /**
   * Conserva la transparencia en vez de aplanarla.
   *
   * Es lo que quiere la marca: la misma imagen sirve sobre la portada negra y sobre el membrete
   * blanco, así se embebe UNA vez para todo el documento en lugar de una versión por fondo.
   */
  conservarAlfa?: boolean;
};

const FIRMA_PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

const CANALES: Record<number, number> = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 };

type CabeceraPng = {
  ancho: number;
  alto: number;
  bits: number;
  colorType: number;
  entrelazado: number;
  idat: Buffer;
  plte: Buffer | null;
  trns: Buffer | null;
};

/** Recorre los chunks del PNG. Devuelve `null` si el archivo no lo es o viene roto. */
function leerPng(datos: Buffer): CabeceraPng | null {
  if (datos.length < 8 || !datos.subarray(0, 8).equals(FIRMA_PNG)) return null;
  let pos = 8;
  let cabecera: Partial<CabeceraPng> = {};
  const trozos: Buffer[] = [];
  let plte: Buffer | null = null;
  let trns: Buffer | null = null;

  while (pos + 8 <= datos.length) {
    const largo = datos.readUInt32BE(pos);
    const tipo = datos.toString('latin1', pos + 4, pos + 8);
    const inicio = pos + 8;
    const fin = inicio + largo;
    if (fin + 4 > datos.length) break;

    if (tipo === 'IHDR') {
      cabecera = {
        ancho: datos.readUInt32BE(inicio),
        alto: datos.readUInt32BE(inicio + 4),
        bits: datos[inicio + 8]!,
        colorType: datos[inicio + 9]!,
        entrelazado: datos[inicio + 12]!,
      };
    } else if (tipo === 'PLTE') {
      plte = datos.subarray(inicio, fin);
    } else if (tipo === 'tRNS') {
      trns = datos.subarray(inicio, fin);
    } else if (tipo === 'IDAT') {
      trozos.push(datos.subarray(inicio, fin));
    } else if (tipo === 'IEND') {
      break;
    }
    pos = fin + 4;
  }

  if (!cabecera.ancho || !cabecera.alto || !trozos.length) return null;
  return { ...(cabecera as CabeceraPng), idat: Buffer.concat(trozos), plte, trns };
}

/** Dimensiones de un JPEG leyendo su marcador SOFn. */
function medidasJpeg(datos: Buffer): { ancho: number; alto: number } | null {
  if (datos.length < 4 || datos[0] !== 0xff || datos[1] !== 0xd8) return null;
  let pos = 2;
  while (pos + 9 < datos.length) {
    if (datos[pos] !== 0xff) {
      pos += 1;
      continue;
    }
    const marcador = datos[pos + 1]!;
    // SOF0..SOF15, saltando los que no llevan medidas (DHT/JPG/DAC).
    if (marcador >= 0xc0 && marcador <= 0xcf && marcador !== 0xc4 && marcador !== 0xc8 && marcador !== 0xcc) {
      return { alto: datos.readUInt16BE(pos + 5), ancho: datos.readUInt16BE(pos + 7) };
    }
    if (marcador === 0xd8 || marcador === 0x01 || (marcador >= 0xd0 && marcador <= 0xd7)) {
      pos += 2;
      continue;
    }
    pos += 2 + datos.readUInt16BE(pos + 2);
  }
  return null;
}

const paeth = (a: number, b: number, c: number) => {
  const p = a + b - c;
  const pa = Math.abs(p - a);
  const pb = Math.abs(p - b);
  const pc = Math.abs(p - c);
  if (pa <= pb && pa <= pc) return a;
  return pb <= pc ? b : c;
};

/** Deshace los cinco filtros del PNG y devuelve las líneas crudas, ya sin el byte de filtro. */
function desfiltrar(inflado: Buffer, ancho: number, alto: number, bits: number, canales: number): Buffer | null {
  const bitsPorPixel = bits * canales;
  const bytesPorLinea = Math.ceil((bitsPorPixel * ancho) / 8);
  const bpp = Math.max(1, Math.ceil(bitsPorPixel / 8));
  if (inflado.length < alto * (bytesPorLinea + 1)) return null;

  const salida = Buffer.alloc(alto * bytesPorLinea);
  let origen = 0;
  for (let y = 0; y < alto; y += 1) {
    const filtro = inflado[origen]!;
    origen += 1;
    const destino = y * bytesPorLinea;
    const anterior = destino - bytesPorLinea;

    for (let i = 0; i < bytesPorLinea; i += 1) {
      const x = inflado[origen + i]!;
      const a = i >= bpp ? salida[destino + i - bpp]! : 0;
      const b = y > 0 ? salida[anterior + i]! : 0;
      const c = y > 0 && i >= bpp ? salida[anterior + i - bpp]! : 0;
      let valor: number;
      switch (filtro) {
        case 0:
          valor = x;
          break;
        case 1:
          valor = x + a;
          break;
        case 2:
          valor = x + b;
          break;
        case 3:
          valor = x + ((a + b) >> 1);
          break;
        case 4:
          valor = x + paeth(a, b, c);
          break;
        default:
          return null;
      }
      salida[destino + i] = valor & 0xff;
    }
    origen += bytesPorLinea;
  }
  return salida;
}

/** Líneas crudas → RGBA de 8 bits por canal, resolviendo paleta y profundidades de 1/2/4 bits. */
function aRgba(crudo: Buffer, png: CabeceraPng): Uint8Array | null {
  const { ancho, alto, bits, colorType, plte, trns } = png;
  const canales = CANALES[colorType]!;
  const bytesPorLinea = Math.ceil((bits * canales * ancho) / 8);
  const rgba = new Uint8Array(ancho * alto * 4);
  const maximo = (1 << bits) - 1;

  const muestra = (linea: number, indice: number): number => {
    if (bits === 8) return crudo[linea * bytesPorLinea + indice]!;
    const bit = indice * bits;
    const byte = crudo[linea * bytesPorLinea + (bit >> 3)]!;
    return (byte >> (8 - bits - (bit & 7))) & maximo;
  };

  for (let y = 0; y < alto; y += 1) {
    for (let x = 0; x < ancho; x += 1) {
      const destino = (y * ancho + x) * 4;
      const base = x * canales;
      if (colorType === 3) {
        if (!plte) return null;
        const indice = muestra(y, base);
        rgba[destino] = plte[indice * 3] ?? 0;
        rgba[destino + 1] = plte[indice * 3 + 1] ?? 0;
        rgba[destino + 2] = plte[indice * 3 + 2] ?? 0;
        rgba[destino + 3] = trns && indice < trns.length ? trns[indice]! : 255;
      } else {
        const escala = bits === 8 ? 1 : 255 / maximo;
        if (colorType === 0 || colorType === 4) {
          const gris = Math.round(muestra(y, base) * escala);
          rgba[destino] = gris;
          rgba[destino + 1] = gris;
          rgba[destino + 2] = gris;
          rgba[destino + 3] = colorType === 4 ? Math.round(muestra(y, base + 1) * escala) : 255;
        } else {
          rgba[destino] = Math.round(muestra(y, base) * escala);
          rgba[destino + 1] = Math.round(muestra(y, base + 1) * escala);
          rgba[destino + 2] = Math.round(muestra(y, base + 2) * escala);
          rgba[destino + 3] = colorType === 6 ? Math.round(muestra(y, base + 3) * escala) : 255;
        }
      }
    }
  }
  return rgba;
}

const TABLA_CRC = (() => {
  const tabla = new Int32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    tabla[n] = c;
  }
  return tabla;
})();

function crc32(datos: Buffer): number {
  let c = -1;
  for (let i = 0; i < datos.length; i += 1) c = TABLA_CRC[(c ^ datos[i]!) & 0xff]! ^ (c >>> 8);
  return (c ^ -1) >>> 0;
}

function chunk(tipo: string, datos: Buffer): Buffer {
  const largo = Buffer.alloc(4);
  largo.writeUInt32BE(datos.length);
  const cuerpo = Buffer.concat([Buffer.from(tipo, 'latin1'), datos]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(cuerpo));
  return Buffer.concat([largo, cuerpo, crc]);
}

const COLOR_TYPE_POR_CANALES: Record<number, number> = { 1: 0, 3: 2, 4: 6 };

/** PNG de 8 bits: `canales` es 1 (gris), 3 (RGB) o 4 (RGBA). */
function escribirPng(ancho: number, alto: number, muestras: Uint8Array, canales: 1 | 3 | 4): Buffer {
  const porLinea = ancho * canales;
  const crudo = Buffer.alloc(alto * (porLinea + 1));
  for (let y = 0; y < alto; y += 1) {
    const destino = y * (porLinea + 1);
    crudo[destino] = 0; // filtro None: el deflate hace el trabajo y ahorra una pasada
    crudo.set(muestras.subarray(y * porLinea, (y + 1) * porLinea), destino + 1);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(ancho, 0);
  ihdr.writeUInt32BE(alto, 4);
  ihdr[8] = 8;
  ihdr[9] = COLOR_TYPE_POR_CANALES[canales]!;
  return Buffer.concat([
    FIRMA_PNG,
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(crudo, { level: 6 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

/**
 * Reduce por caja promediando el rectángulo de origen de cada píxel destino y aplanando el alfa
 * sobre blanco. Devuelve gris si la imagen no tenía color (los planos casi nunca lo tienen).
 */
function reducir(
  rgba: Uint8Array,
  ancho: number,
  alto: number,
  nuevoAncho: number,
  nuevoAlto: number,
  fondo: [number, number, number],
  conservarAlfa: boolean,
): { muestras: Uint8Array; canales: 1 | 3 | 4 } {
  const canalesSalida = conservarAlfa ? 4 : 3;
  const salida = new Uint8Array(nuevoAncho * nuevoAlto * canalesSalida);
  const pasoX = ancho / nuevoAncho;
  const pasoY = alto / nuevoAlto;
  let color = false;

  for (let y = 0; y < nuevoAlto; y += 1) {
    const sy0 = Math.floor(y * pasoY);
    const sy1 = Math.min(alto, Math.max(sy0 + 1, Math.floor((y + 1) * pasoY)));
    for (let x = 0; x < nuevoAncho; x += 1) {
      const sx0 = Math.floor(x * pasoX);
      const sx1 = Math.min(ancho, Math.max(sx0 + 1, Math.floor((x + 1) * pasoX)));
      let r = 0;
      let g = 0;
      let b = 0;
      let alfa = 0;
      let n = 0;
      for (let sy = sy0; sy < sy1; sy += 1) {
        let i = (sy * ancho + sx0) * 4;
        for (let sx = sx0; sx < sx1; sx += 1, i += 4) {
          const a = rgba[i + 3]! / 255;
          if (conservarAlfa) {
            // Promedio premultiplicado: los bordes no se ensucian con el color de los transparentes.
            r += rgba[i]! * a;
            g += rgba[i + 1]! * a;
            b += rgba[i + 2]! * a;
          } else {
            const inv = 1 - a;
            r += rgba[i]! * a + fondo[0] * inv;
            g += rgba[i + 1]! * a + fondo[1] * inv;
            b += rgba[i + 2]! * a + fondo[2] * inv;
          }
          alfa += a;
          n += 1;
        }
      }
      const o = (y * nuevoAncho + x) * canalesSalida;
      if (conservarAlfa) {
        const media = alfa / n;
        const divisor = media > 0 ? alfa : 1;
        salida[o] = Math.round(r / divisor);
        salida[o + 1] = Math.round(g / divisor);
        salida[o + 2] = Math.round(b / divisor);
        salida[o + 3] = Math.round(media * 255);
      } else {
        const rr = Math.round(r / n);
        const gg = Math.round(g / n);
        const bb = Math.round(b / n);
        salida[o] = rr;
        salida[o + 1] = gg;
        salida[o + 2] = bb;
        if (!color && (Math.abs(rr - gg) > 6 || Math.abs(gg - bb) > 6)) color = true;
      }
    }
  }

  if (conservarAlfa) return { muestras: salida, canales: 4 };
  if (color) return { muestras: salida, canales: 3 };
  const grises = new Uint8Array(nuevoAncho * nuevoAlto);
  for (let i = 0, o = 0; o < grises.length; i += 3, o += 1) grises[o] = salida[i]!;
  return { muestras: grises, canales: 1 };
}

/**
 * Prepara un archivo de imagen para PDFKit.
 *
 * Devuelve `null` si no se puede leer; si no se puede reducir (JPEG, PNG raro, imagen ya pequeña)
 * devuelve los bytes originales, que es exactamente lo que se hacía antes.
 */
export function imagenParaPdf(ruta: string, opciones: OpcionesImagen = {}): ImagenPdf | null {
  let datos: Buffer;
  try {
    datos = fs.readFileSync(ruta);
  } catch {
    return null;
  }
  return bufferParaPdf(datos, opciones);
}

/** Igual que `imagenParaPdf` pero con los bytes ya en memoria (la marca vive en `src/assets`). */
export function bufferParaPdf(datos: Buffer, opciones: OpcionesImagen = {}): ImagenPdf | null {
  const maxLado = opciones.maxLado ?? 1400;
  const maxBytes = opciones.maxBytes ?? 300 * 1024;
  const fondo = opciones.fondo ?? [255, 255, 255];
  const conservarAlfa = opciones.conservarAlfa ?? false;

  if (!datos.length) return null;

  const jpeg = medidasJpeg(datos);
  if (jpeg) {
    // Un JPEG ya viene comprimido y PDFKit lo copia tal cual (DCTDecode): reescribirlo costaría
    // más de lo que ahorraría, y no hay codificador JPEG a mano.
    return { datos, ancho: jpeg.ancho, alto: jpeg.alto, reducida: false };
  }

  const png = leerPng(datos);
  if (!png) return { datos, ancho: 0, alto: 0, reducida: false };

  const lado = Math.max(png.ancho, png.alto);
  const conAlfa = png.colorType === 4 || png.colorType === 6 || Boolean(png.trns);
  // Ya pequeña y sin alfa que aplanar: PDFKit la copia tal cual, no hay nada que ganar.
  if (lado <= maxLado && datos.length <= maxBytes && (!conAlfa || conservarAlfa)) {
    return { datos, ancho: png.ancho, alto: png.alto, reducida: false };
  }
  if (png.entrelazado !== 0 || !CANALES[png.colorType]) {
    return { datos, ancho: png.ancho, alto: png.alto, reducida: false };
  }
  if (png.bits !== 8 && !(png.colorType === 3 && [1, 2, 4].includes(png.bits))) {
    return { datos, ancho: png.ancho, alto: png.alto, reducida: false };
  }

  try {
    const crudo = desfiltrar(
      zlib.inflateSync(png.idat),
      png.ancho,
      png.alto,
      png.bits,
      CANALES[png.colorType]!,
    );
    if (!crudo) return { datos, ancho: png.ancho, alto: png.alto, reducida: false };

    const rgba = aRgba(crudo, png);
    if (!rgba) return { datos, ancho: png.ancho, alto: png.alto, reducida: false };

    const escala = Math.min(1, maxLado / lado);
    const nuevoAncho = Math.max(1, Math.round(png.ancho * escala));
    const nuevoAlto = Math.max(1, Math.round(png.alto * escala));
    const { muestras, canales } = reducir(
      rgba,
      png.ancho,
      png.alto,
      nuevoAncho,
      nuevoAlto,
      fondo,
      conservarAlfa && conAlfa,
    );
    const salida = escribirPng(nuevoAncho, nuevoAlto, muestras, canales);

    // Si el original pesaba menos que lo reencodado, se queda el original.
    if (salida.length >= datos.length) {
      return { datos, ancho: png.ancho, alto: png.alto, reducida: false };
    }
    return { datos: salida, ancho: nuevoAncho, alto: nuevoAlto, reducida: true };
  } catch {
    return { datos, ancho: png.ancho, alto: png.alto, reducida: false };
  }
}
