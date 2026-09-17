import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';

/**
 * Campos que nunca deben salir en una respuesta. Varios endpoints devuelven el `User` de Prisma
 * completo (`users/profile/me`, `users/:id/profile`…) y con él viajaba el hash de la contraseña
 * y el secreto MFA a la app y a la web.
 */
export const SECRET_KEYS: ReadonlySet<string> = new Set(['passwordHash', 'mfaSecret']);

const MAX_DEPTH = 12;

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== 'object') return false;
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

/**
 * Devuelve el mismo valor si no trae secretos; si los trae, una copia sin ellos.
 * No muta nada: el objeto original puede venir de una caché que la API sigue usando.
 */
export function stripSecrets<T>(value: T, depth = 0, seen = new WeakSet<object>()): T {
  if (depth > MAX_DEPTH || value === null || typeof value !== 'object') return value;
  if (seen.has(value as object)) return value;
  seen.add(value as object);

  if (Array.isArray(value)) {
    let copy: unknown[] | null = null;
    value.forEach((item, i) => {
      const limpio = stripSecrets(item, depth + 1, seen);
      if (limpio !== item) {
        copy ??= value.slice();
        copy[i] = limpio;
      }
    });
    return (copy ?? value) as T;
  }

  if (!isPlainObject(value)) return value;

  let copy: Record<string, unknown> | null = null;
  for (const [key, item] of Object.entries(value)) {
    if (SECRET_KEYS.has(key)) {
      copy ??= { ...value };
      delete copy[key];
      continue;
    }
    const limpio = stripSecrets(item, depth + 1, seen);
    if (limpio !== item) {
      copy ??= { ...value };
      copy[key] = limpio;
    }
  }
  return (copy ?? value) as T;
}

@Injectable()
export class StripSecretsInterceptor implements NestInterceptor {
  intercept(_context: ExecutionContext, next: CallHandler) {
    // rxjs duplicado en el monorepo: se usa la copia de Nest (mismo patrón que MutationAuditInterceptor).
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { map } = require('rxjs/operators');
    return (next.handle() as any).pipe(map((body: unknown) => stripSecrets(body)));
  }
}
