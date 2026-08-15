import { BadRequestException } from '@nestjs/common';
import { requirePositiveIntQuery, requireStringQuery } from './query-params.js';

describe('requirePositiveIntQuery', () => {
  it('acepta enteros positivos en texto', () => {
    expect(requirePositiveIntQuery('7', 'year')).toBe(7);
    expect(requirePositiveIntQuery(2026, 'year')).toBe(2026);
  });

  it('rechaza el parámetro ausente con 400 y su nombre', () => {
    // Antes esto llegaba a Prisma como NaN y devolvia 500 con stack completo.
    expect(() => requirePositiveIntQuery(undefined, 'costCenterId')).toThrow(BadRequestException);
    expect(() => requirePositiveIntQuery(undefined, 'costCenterId')).toThrow(/costCenterId/);
    expect(() => requirePositiveIntQuery(null, 'year')).toThrow(BadRequestException);
    expect(() => requirePositiveIntQuery('', 'year')).toThrow(BadRequestException);
    expect(() => requirePositiveIntQuery('   ', 'year')).toThrow(BadRequestException);
  });

  it('rechaza valores no enteros o no positivos', () => {
    expect(() => requirePositiveIntQuery('abc', 'year')).toThrow(BadRequestException);
    expect(() => requirePositiveIntQuery('0', 'year')).toThrow(BadRequestException);
    expect(() => requirePositiveIntQuery('-3', 'year')).toThrow(BadRequestException);
    expect(() => requirePositiveIntQuery('1.5', 'year')).toThrow(BadRequestException);
  });
});

describe('requireStringQuery', () => {
  it('acepta y recorta cadenas', () => {
    expect(requireStringQuery('  Activity  ', 'entityType')).toBe('Activity');
  });

  it('acota la longitud', () => {
    expect(requireStringQuery('x'.repeat(500), 'entityType', 10)).toHaveLength(10);
  });

  it('rechaza vacíos y no-cadenas con 400', () => {
    expect(() => requireStringQuery(undefined, 'entityType')).toThrow(/entityType/);
    expect(() => requireStringQuery('', 'entityType')).toThrow(BadRequestException);
    expect(() => requireStringQuery('   ', 'entityType')).toThrow(BadRequestException);
    expect(() => requireStringQuery(42, 'entityType')).toThrow(BadRequestException);
  });
});
