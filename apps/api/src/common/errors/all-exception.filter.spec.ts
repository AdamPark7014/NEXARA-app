import { HttpStatus } from '@nestjs/common';
import { mapPrismaError } from './all-exception.filter.js';

/** Reproduce la forma de los errores de Prisma sin arrastrar su runtime. */
function prismaError(name: string, code?: string): Error {
  const err = new Error('Invalid `prisma.warehouse.findUnique()` invocation: ...');
  Object.defineProperty(err.constructor, 'name', { value: name, configurable: true });
  class Named extends Error {}
  Object.defineProperty(Named, 'name', { value: name });
  const typed = new Named('Invalid `prisma.warehouse.findUnique()` invocation: ...');
  if (code) (typed as unknown as { code: string }).code = code;
  return typed;
}

describe('mapPrismaError', () => {
  it('convierte un error de validacion en 400', () => {
    // El caso real: /api/warehouse/abc -> id NaN -> Prisma revienta.
    // Antes el cliente recibia 500 con la forma completa de la consulta.
    const mapped = mapPrismaError(prismaError('PrismaClientValidationError'));
    expect(mapped?.status).toBe(HttpStatus.BAD_REQUEST);
    expect(mapped?.errorCode).toBe('INVALID_REQUEST');
  });

  it('no filtra la consulta interna en el mensaje', () => {
    const mapped = mapPrismaError(prismaError('PrismaClientValidationError'));
    expect(mapped?.message).not.toMatch(/prisma\./);
    expect(mapped?.message).not.toMatch(/findUnique/);
    expect(mapped?.message).not.toMatch(/warehouse/i);
  });

  it('mapea registro no encontrado a 404', () => {
    expect(mapPrismaError(prismaError('PrismaClientKnownRequestError', 'P2025'))?.status).toBe(
      HttpStatus.NOT_FOUND,
    );
  });

  it('mapea unicidad violada a 409', () => {
    const mapped = mapPrismaError(prismaError('PrismaClientKnownRequestError', 'P2002'));
    expect(mapped?.status).toBe(HttpStatus.CONFLICT);
    expect(mapped?.errorCode).toBe('DUPLICATE');
  });

  it('mapea clave foranea invalida a 400', () => {
    expect(mapPrismaError(prismaError('PrismaClientKnownRequestError', 'P2003'))?.status).toBe(
      HttpStatus.BAD_REQUEST,
    );
  });

  it('deja pasar codigos de Prisma desconocidos', () => {
    // Sin mapeo conocido se trata como error interno: mejor un 500 generico
    // que inventar un codigo que no corresponde.
    expect(mapPrismaError(prismaError('PrismaClientKnownRequestError', 'P9999'))).toBeNull();
  });

  it('no toca errores ajenos a Prisma', () => {
    expect(mapPrismaError(new TypeError('algo se rompio'))).toBeNull();
    expect(mapPrismaError(new Error('generico'))).toBeNull();
  });
});
