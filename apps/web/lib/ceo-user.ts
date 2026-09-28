/**
 * Christian, usuario 1. La misma allowlist que `esCeoChristian` en el API:
 * el servidor vuelve a rechazar (403) a cualquier otro, aunque el botón se force.
 */
export const CEO_CHRISTIAN_USER_ID = 1;

export function esCeoChristian(userId: number | null | undefined): boolean {
  const id = Number(userId);
  return Number.isInteger(id) && id === CEO_CHRISTIAN_USER_ID;
}
