import { createReadStream } from 'fs';
import { stat } from 'fs/promises';

/**
 * ZIP mínimo, sin dependencias.
 *
 * El monorepo no trae `archiver` ni nada parecido, y meter una dependencia nueva para
 * bajar unas fotos no se paga. Un ZIP con método **stored** (sin comprimir) es un ZIP
 * válido para cualquier sistema —Windows, macOS, Linux lo abren de doble clic— y las
 * fotos JPEG y los PDF ya vienen comprimidos, así que comprimir otra vez no ahorraría
 * casi nada y sí costaría CPU.
 *
 * Se genera por partes (`AsyncGenerator<Buffer>`) para poder mandarlo al navegador
 * mientras se arma, sin juntar todas las fotos en memoria.
 *
 * Límites: hasta 65 535 archivos y 4 GB por archivo (no se emite ZIP64). Con la
 * evidencia de una actividad sobra de largo; aun así se valida antes de escribir.
 */

const FIRMA_LOCAL = 0x04034b50;
const FIRMA_CENTRAL = 0x02014b50;
const FIRMA_FIN = 0x06054b50;
/** Bit 11: el nombre va en UTF-8 (para que «Cámara 1» se lea bien en Windows). */
const BANDERA_UTF8 = 0x0800;
const METODO_STORED = 0;
const MAX_ENTRADAS = 0xffff;
const MAX_TAMANO = 0xffffffff;

/** Un archivo del ZIP: o una ruta en disco, o contenido que ya tenemos en memoria. */
export type EntradaZip =
  | { ruta: string; desdeArchivo: string; modificado?: Date }
  | { ruta: string; contenido: Buffer | string; modificado?: Date };

const TABLA_CRC = (() => {
  const tabla = new Int32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    tabla[i] = c;
  }
  return tabla;
})();

export function crc32(buffer: Buffer, previo = 0): number {
  let c = ~previo;
  for (let i = 0; i < buffer.length; i++) {
    c = TABLA_CRC[(c ^ buffer[i]) & 0xff] ^ (c >>> 8);
  }
  return ~c >>> 0;
}

/** Fecha y hora en el formato MS-DOS que pide el ZIP (segundos en pasos de 2). */
export function fechaHoraDos(fecha: Date): { hora: number; dia: number } {
  const d = Number.isNaN(fecha.getTime()) ? new Date() : fecha;
  const anio = Math.min(Math.max(d.getFullYear(), 1980), 2107);
  return {
    hora: (d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1),
    dia: ((anio - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate(),
  };
}

type EntradaEscrita = {
  nombre: Buffer;
  crc: number;
  tamano: number;
  offset: number;
  hora: number;
  dia: number;
};

function cabeceraLocal(nombre: Buffer, crc: number, tamano: number, hora: number, dia: number): Buffer {
  const b = Buffer.alloc(30);
  b.writeUInt32LE(FIRMA_LOCAL, 0);
  b.writeUInt16LE(20, 4); // versión necesaria
  b.writeUInt16LE(BANDERA_UTF8, 6);
  b.writeUInt16LE(METODO_STORED, 8);
  b.writeUInt16LE(hora, 10);
  b.writeUInt16LE(dia, 12);
  b.writeUInt32LE(crc, 14);
  b.writeUInt32LE(tamano, 18); // comprimido
  b.writeUInt32LE(tamano, 22); // original
  b.writeUInt16LE(nombre.length, 26);
  b.writeUInt16LE(0, 28); // sin campo extra
  return Buffer.concat([b, nombre]);
}

function entradaCentral(e: EntradaEscrita): Buffer {
  const b = Buffer.alloc(46);
  b.writeUInt32LE(FIRMA_CENTRAL, 0);
  b.writeUInt16LE(20, 4); // versión con la que se hizo
  b.writeUInt16LE(20, 6); // versión necesaria
  b.writeUInt16LE(BANDERA_UTF8, 8);
  b.writeUInt16LE(METODO_STORED, 10);
  b.writeUInt16LE(e.hora, 12);
  b.writeUInt16LE(e.dia, 14);
  b.writeUInt32LE(e.crc, 16);
  b.writeUInt32LE(e.tamano, 20);
  b.writeUInt32LE(e.tamano, 24);
  b.writeUInt16LE(e.nombre.length, 28);
  b.writeUInt16LE(0, 30); // extra
  b.writeUInt16LE(0, 32); // comentario
  b.writeUInt16LE(0, 34); // disco
  b.writeUInt16LE(0, 36); // atributos internos
  b.writeUInt32LE(0, 38); // atributos externos
  b.writeUInt32LE(e.offset, 42);
  return Buffer.concat([b, e.nombre]);
}

function finDelDirectorio(entradas: number, tamanoCentral: number, offsetCentral: number): Buffer {
  const b = Buffer.alloc(22);
  b.writeUInt32LE(FIRMA_FIN, 0);
  b.writeUInt16LE(0, 4); // disco actual
  b.writeUInt16LE(0, 6); // disco del directorio
  b.writeUInt16LE(entradas, 8);
  b.writeUInt16LE(entradas, 10);
  b.writeUInt32LE(tamanoCentral, 12);
  b.writeUInt32LE(offsetCentral, 16);
  b.writeUInt16LE(0, 20); // sin comentario
  return b;
}

/** El ZIP usa `/` siempre, incluso cuando lo genera Windows. */
export function rutaZip(ruta: string): string {
  return ruta.replace(/\\/g, '/').replace(/^\/+/, '').replace(/\/{2,}/g, '/');
}

async function leerArchivo(ruta: string): Promise<AsyncIterable<Buffer>> {
  return createReadStream(ruta) as unknown as AsyncIterable<Buffer>;
}

/**
 * Arma el ZIP por partes. Una entrada que no se pueda leer se salta: vale más entregar
 * la evidencia que sí está que no entregar nada porque falte una foto.
 */
export async function* generarZip(
  entradas: EntradaZip[],
  opciones: { alSaltar?: (ruta: string, motivo: string) => void } = {},
): AsyncGenerator<Buffer> {
  const escritas: EntradaEscrita[] = [];
  let offset = 0;
  const usados = new Set<string>();

  for (const entrada of entradas) {
    if (escritas.length >= MAX_ENTRADAS) {
      opciones.alSaltar?.(entrada.ruta, 'el ZIP ya llegó al máximo de archivos');
      break;
    }

    // Dos archivos con el mismo nombre confunden a los descompresores.
    let ruta = rutaZip(entrada.ruta);
    if (usados.has(ruta)) {
      const punto = ruta.lastIndexOf('.');
      const base = punto > 0 ? ruta.slice(0, punto) : ruta;
      const ext = punto > 0 ? ruta.slice(punto) : '';
      let n = 2;
      while (usados.has(`${base} (${n})${ext}`)) n++;
      ruta = `${base} (${n})${ext}`;
    }
    usados.add(ruta);

    let datos: Buffer;
    let modificado = entrada.modificado ?? new Date();

    if ('contenido' in entrada) {
      datos = Buffer.isBuffer(entrada.contenido)
        ? entrada.contenido
        : Buffer.from(entrada.contenido, 'utf8');
    } else {
      try {
        const info = await stat(entrada.desdeArchivo);
        if (!info.isFile()) throw new Error('no es un archivo');
        if (info.size > MAX_TAMANO) throw new Error('el archivo pasa de 4 GB');
        if (!entrada.modificado) modificado = info.mtime;
        const partes: Buffer[] = [];
        for await (const parte of await leerArchivo(entrada.desdeArchivo)) {
          partes.push(parte);
        }
        datos = Buffer.concat(partes);
      } catch (error) {
        opciones.alSaltar?.(entrada.ruta, (error as Error).message);
        usados.delete(ruta);
        continue;
      }
    }

    const nombre = Buffer.from(ruta, 'utf8');
    const crc = crc32(datos);
    const { hora, dia } = fechaHoraDos(modificado);

    const cabecera = cabeceraLocal(nombre, crc, datos.length, hora, dia);
    yield cabecera;
    yield datos;

    escritas.push({ nombre, crc, tamano: datos.length, offset, hora, dia });
    offset += cabecera.length + datos.length;
  }

  const central = escritas.map(entradaCentral);
  const tamanoCentral = central.reduce((total, b) => total + b.length, 0);
  for (const b of central) yield b;
  yield finDelDirectorio(escritas.length, tamanoCentral, offset);
}
