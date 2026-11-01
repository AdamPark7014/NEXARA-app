import {
  FileFieldsInterceptor as NestFileFieldsInterceptor,
  FileInterceptor as NestFileInterceptor,
  FilesInterceptor as NestFilesInterceptor,
} from '@nestjs/platform-express';

type OpcionesSubida = NonNullable<Parameters<typeof NestFileInterceptor>[1]>;

/**
 * Tope a los nombres de campo de cualquier subida.
 *
 * Multer convierte `a[99999999]` en un arreglo de 100 millones de lugares y no lo
 * limita si no se le pide. Crearlo casi no cuesta; el costo llega cuando algo recorre
 * o serializa `req.body`, como el filtro global al registrar un error. Ni la web ni las
 * apps mandan hoy nombres con corchetes: estos topes solo dejan fuera lo que no es de ellas.
 */
export const LIMITES_CAMPOS_SUBIDA = {
  fieldArrayIndexLimit: 1000,
  fieldNestingDepth: 5,
};

const conLimites = (opciones?: OpcionesSubida): OpcionesSubida => ({
  ...opciones,
  limits: { ...LIMITES_CAMPOS_SUBIDA, ...opciones?.limits },
});

// Mismos nombres y parámetros que los de Nest. No hay forma de fijar límites para toda la API:
// `MulterModule` es por módulo y el `limits` de cada ruta reemplaza entero al del módulo.
export const FileInterceptor = (campo: string, opciones?: OpcionesSubida) =>
  NestFileInterceptor(campo, conLimites(opciones));

export const FilesInterceptor = (campo: string, maximo?: number, opciones?: OpcionesSubida) =>
  NestFilesInterceptor(campo, maximo, conLimites(opciones));

export const FileFieldsInterceptor = (
  campos: Parameters<typeof NestFileFieldsInterceptor>[0],
  opciones?: OpcionesSubida,
) => NestFileFieldsInterceptor(campos, conLimites(opciones));
