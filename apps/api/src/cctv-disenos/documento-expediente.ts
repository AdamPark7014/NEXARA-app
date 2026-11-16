/**
 * Documentos del expediente de un diseño (Ola 5): planos, croquis, fotos, fichas, Excel, Word, PowerPoint.
 * Se guardan en `uploads/cctv-documentos/` (pide sesión, como el croquis) y la lista vive en
 * `plano.expediente.documentos`, que guarda la web con el diseño: sin tabla nueva ni migración.
 */
import { BadRequestException } from '@nestjs/common';

export const DOCUMENTO_MAX_BYTES = 25 * 1024 * 1024;
export const DOCUMENTOS_SUBDIR = 'cctv-documentos';

export type TipoDocumento = 'pdf' | 'imagen' | 'excel' | 'word' | 'powerpoint' | 'cad' | 'otro';

const TIPO_POR_EXTENSION: Record<string, TipoDocumento> = {
  pdf: 'pdf',
  png: 'imagen',
  jpg: 'imagen',
  jpeg: 'imagen',
  webp: 'imagen',
  xlsx: 'excel',
  xls: 'excel',
  csv: 'excel',
  docx: 'word',
  doc: 'word',
  pptx: 'powerpoint',
  ppt: 'powerpoint',
  dwg: 'cad',
  dxf: 'cad',
  txt: 'otro',
};

const PROHIBIDOS = '\\/:*?"<>|';

/** Quita lo que no va en un nombre de archivo: separadores, comodines y caracteres de control. */
function nombreLimpio(crudo: string): string {
  let salida = '';
  for (const ch of crudo) {
    const codigo = ch.codePointAt(0) ?? 0;
    salida += codigo < 32 || PROHIBIDOS.includes(ch) ? ' ' : ch;
  }
  return salida.replace(/\s+/g, ' ').trim().slice(0, 160);
}

/** Nombre original sano (multer lo trae en latin1) y su tipo por extensión. 400 si no se acepta. */
export function revisarDocumento(archivo: { buffer?: Buffer; originalname?: string } | undefined): { nombre: string; extension: string; tipo: TipoDocumento } {
  if (!archivo?.buffer?.length) throw new BadRequestException('Falta el archivo.');
  if (archivo.buffer.length > DOCUMENTO_MAX_BYTES) throw new BadRequestException('El archivo no puede pasar de 25 MB.');
  const crudo = typeof archivo.originalname === 'string' ? archivo.originalname : 'documento';
  const nombre = nombreLimpio(Buffer.from(crudo, 'latin1').toString('utf8')) || 'documento';
  const extension = nombre.includes('.') ? (nombre.split('.').pop() ?? '').toLowerCase() : '';
  const tipo = TIPO_POR_EXTENSION[extension];
  if (!tipo) {
    throw new BadRequestException('Ese tipo de archivo no se acepta: PDF, imagen, Excel, Word, PowerPoint o CAD (DWG/DXF).');
  }
  // Un ejecutable o script disfrazado con otra extensión no pasa: «MZ» (exe) y «#!» (script).
  const cabeza = archivo.buffer.subarray(0, 2).toString('latin1');
  if (cabeza === 'MZ' || cabeza === '#!') throw new BadRequestException('Ese archivo no es un documento.');
  return { nombre, extension, tipo };
}
