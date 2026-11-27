/**
 * Fallos que todavía cuentan para bloquear una cuenta.
 *
 * Cuando ya pasó un bloqueo (`lockedUntil` en el pasado), los fallos de antes no cuentan:
 * la persona empieza de cero. Antes el contador solo volvía a cero al entrar bien, así que
 * quien ya había llegado a 5 quedaba bloqueado otra vez con su primer error (27-11-2026).
 */
export function fallosVigentes(
  cuenta: { failedLoginCount?: number | null; lockedUntil?: Date | null },
  ahora: number = Date.now(),
): number {
  if (cuenta.lockedUntil && cuenta.lockedUntil.getTime() <= ahora) return 0;
  return cuenta.failedLoginCount ?? 0;
}
