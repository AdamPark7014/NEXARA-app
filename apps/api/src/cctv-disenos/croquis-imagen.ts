/**
 * El croquis que sube la web (la imagen del plano; los PDF llegan ya convertidos a PNG).
 *
 * El tipo no se toma de `mimetype` ni del nombre —los pone el cliente—: lo dice `sharp` leyendo
 * la cabecera del archivo, y de ahí salen la extensión y el ancho y alto en píxeles.
 */
import { BadRequestException } from '@nestjs/common';

export const CROQUIS_MAX_BYTES = 20 * 1024 * 1024;
export const CROQUIS_SUBDIR = 'cctv-croquis';

/** Formato de `sharp` → extensión con la que se guarda. */
const EXTENSION_POR_FORMATO: Record<string, string> = {
  png: '.png',
  jpeg: '.jpg',
  webp: '.webp',
};

const TIPOS_ACEPTADOS = new Set(['image/png', 'image/jpeg', 'image/jpg', 'image/webp']);

const MENSAJE_FORMATO = 'El croquis debe ser una imagen PNG, JPEG o WebP.';

export type ImagenCroquis = { extension: string; anchoPx: number; altoPx: number };

/** `sharp` se carga al usarse: si su binario faltara, el resto de la API arranca igual. */
function cargarSharp(): (input: Buffer) => { metadata(): Promise<{ format?: string; width?: number; height?: number }> } {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const mod = require('sharp');
  return (mod?.default ?? mod) as any;
}

/** Revisa tipo y tamaño, y lee las medidas. Lanza 400 con el motivo en español. */
export async function leerImagenCroquis(archivo: {
  buffer?: Buffer;
  mimetype?: string;
  size?: number;
} | undefined): Promise<ImagenCroquis> {
  if (!archivo?.buffer?.length) throw new BadRequestException('Falta la imagen del croquis.');
  if (archivo.buffer.length > CROQUIS_MAX_BYTES) {
    throw new BadRequestException('El croquis no puede pasar de 20 MB.');
  }
  const tipo = String(archivo.mimetype || '').toLowerCase();
  if (!TIPOS_ACEPTADOS.has(tipo)) throw new BadRequestException(MENSAJE_FORMATO);

  let meta: { format?: string; width?: number; height?: number };
  try {
    meta = await cargarSharp()(archivo.buffer).metadata();
  } catch {
    throw new BadRequestException(MENSAJE_FORMATO);
  }
  const extension = EXTENSION_POR_FORMATO[String(meta.format ?? '')];
  const anchoPx = Number(meta.width);
  const altoPx = Number(meta.height);
  if (!extension || !(anchoPx > 0) || !(altoPx > 0)) {
    throw new BadRequestException(MENSAJE_FORMATO);
  }
  return { extension, anchoPx, altoPx };
}
