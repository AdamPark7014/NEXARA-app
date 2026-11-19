/** Se renueva el JWT solo cuando le faltan menos de esto (Programa Velocidad, 18-11-2026). */
export const RENOVAR_SI_FALTAN_MS = 2 * 60 * 60_000;

/** ¿Toca renovar? Sin fecha de vencimiento (sesión vieja) se renueva, como antes. */
export function debeRenovarSesion(expiresAt: string | null | undefined, ahora: number = Date.now()): boolean {
  if (!expiresAt) return true;
  const vence = Date.parse(expiresAt);
  if (Number.isNaN(vence)) return true;
  return vence - ahora < RENOVAR_SI_FALTAN_MS;
}
