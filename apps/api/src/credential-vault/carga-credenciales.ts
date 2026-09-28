import { isDeveloperSuperAdminEmail, isPlatformOwnerEmail, normalizePlatformEmail } from '../common/platform-accounts.js';

/**
 * Lógica pura de la carga de una hoja de credenciales a la bóveda (`prisma/cargar-credenciales-boveda.ts`).
 * La hoja es un JSON `[{ "email": "...", "password": "..." }, …]` (las demás columnas se ignoran).
 */
export type FilaHoja = { email: string; password: string };

export class HojaInvalida extends Error {}

/** Valida y normaliza la hoja: correos en minúsculas, sin vacíos ni repetidos. Los mensajes nunca traen contraseñas. */
export function leerHoja(json: unknown): FilaHoja[] {
  if (!Array.isArray(json)) throw new HojaInvalida('La hoja debe ser una lista JSON de { email, password }.');
  const vistos = new Set<string>();
  return json.map((fila, i) => {
    const email = normalizePlatformEmail(typeof (fila as any)?.email === 'string' ? (fila as any).email : '');
    const password = typeof (fila as any)?.password === 'string' ? (fila as any).password : '';
    if (!email || !email.includes('@')) throw new HojaInvalida(`Fila ${i + 1}: falta el correo.`);
    if (!password) throw new HojaInvalida(`Fila ${i + 1} (${email}): falta la contraseña.`);
    if (vistos.has(email)) throw new HojaInvalida(`Fila ${i + 1}: el correo ${email} está repetido.`);
    vistos.add(email);
    return { email, password };
  });
}

/** El dueño y la cuenta de desarrollo nunca se cargan desde una hoja. */
export function esCuentaProtegida(email: string): boolean {
  return isPlatformOwnerEmail(email) || isDeveloperSuperAdminEmail(email);
}
