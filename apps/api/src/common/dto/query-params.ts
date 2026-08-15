import { BadRequestException } from '@nestjs/common';

/**
 * Validación de parámetros de consulta obligatorios.
 *
 * Varios endpoints hacían `+req.query.x` directamente sobre el `where` de
 * Prisma. Cuando el parámetro faltaba, el `NaN`/`undefined` resultante llegaba
 * al motor y la respuesta era un 500 con el stack completo en los logs, en vez
 * de un 400 diciendo qué dato falta.
 */

/** Entero positivo obligatorio, o 400 con el nombre del parámetro. */
export function requirePositiveIntQuery(raw: unknown, name: string): number {
  if (raw === undefined || raw === null || String(raw).trim() === '') {
    throw new BadRequestException(`El parámetro "${name}" es obligatorio`);
  }

  const parsed = Number(raw);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new BadRequestException(`El parámetro "${name}" debe ser un entero positivo`);
  }

  return parsed;
}

/** Cadena no vacía obligatoria, o 400 con el nombre del parámetro. */
export function requireStringQuery(raw: unknown, name: string, maxLength = 200): string {
  if (typeof raw !== 'string' || raw.trim() === '') {
    throw new BadRequestException(`El parámetro "${name}" es obligatorio`);
  }
  return raw.trim().slice(0, maxLength);
}
