import { createCipheriv, createDecipheriv, randomBytes } from 'crypto';

/**
 * Cifrado de la bóveda de contraseñas: AES-256-GCM.
 *
 * · La llave (`VAULT_ENCRYPTION_KEY`) vive FUERA de la base: 64 caracteres hexadecimales o 32 bytes en base64.
 *   Sin ella (o mal formada) la bóveda no guarda ni revela nada.
 * · Cada contraseña lleva su propio IV aleatorio y una etiqueta de autenticación.
 * · El AAD (`companyId:userId`) amarra el texto cifrado a su cuenta: copiar el cifrado de una fila a otra no
 *   descifra (falla la autenticación).
 *
 * Formato: `v1.<iv>.<etiqueta>.<cifrado>` en base64url.
 */
const VERSION = 'v1';

/** Devuelve la llave de 32 bytes, o null si no está o no tiene el formato correcto. */
export function leerLlaveBoveda(raw: string | undefined | null): Buffer | null {
  const texto = String(raw ?? '').trim();
  if (!texto) return null;
  if (/^[0-9a-fA-F]{64}$/.test(texto)) return Buffer.from(texto, 'hex');
  try {
    const b = Buffer.from(texto, 'base64');
    return b.length === 32 && b.toString('base64').replace(/=+$/, '') === texto.replace(/=+$/, '') ? b : null;
  } catch {
    return null;
  }
}

export function aadDe(companyId: number, userId: number): Buffer {
  return Buffer.from(`${companyId}:${userId}`, 'utf8');
}

export function cifrarContrasena(plano: string, llave: Buffer, aad: Buffer): string {
  if (!plano) throw new Error('No se guarda una contraseña vacía.');
  const iv = randomBytes(12);
  const cifrador = createCipheriv('aes-256-gcm', llave, iv);
  cifrador.setAAD(aad);
  const cifrado = Buffer.concat([cifrador.update(plano, 'utf8'), cifrador.final()]);
  return [VERSION, iv.toString('base64url'), cifrador.getAuthTag().toString('base64url'), cifrado.toString('base64url')].join('.');
}

/** null si el paquete está alterado, es de otra cuenta, otra llave o no tiene el formato. Nunca lanza. */
export function descifrarContrasena(paquete: string, llave: Buffer, aad: Buffer): string | null {
  try {
    const partes = String(paquete ?? '').split('.');
    if (partes.length !== 4 || partes[0] !== VERSION) return null;
    const [, iv, etiqueta, cifrado] = partes as [string, string, string, string];
    const descifrador = createDecipheriv('aes-256-gcm', llave, Buffer.from(iv, 'base64url'));
    descifrador.setAAD(aad);
    descifrador.setAuthTag(Buffer.from(etiqueta, 'base64url'));
    return Buffer.concat([descifrador.update(Buffer.from(cifrado, 'base64url')), descifrador.final()]).toString('utf8');
  } catch {
    return null;
  }
}
