/**
 * Christian, usuario 1.
 *
 * Allowlist de persona: no basta el rol `ceo` ni un correo equivalente
 * (la cuenta de pruebas no puede borrar mensajes ni actividades).
 * El id sale del JWT, nunca del cuerpo de la petición.
 */
export const CEO_CHRISTIAN_USER_ID = 1;

export function esCeoChristian(userId: number | null | undefined): boolean {
  const id = Number(userId);
  return Number.isInteger(id) && id === CEO_CHRISTIAN_USER_ID;
}
