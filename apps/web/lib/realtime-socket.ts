import { io, type ManagerOptions, type Socket, type SocketOptions } from 'socket.io-client';
import { getSharedCookie, SHARED_COOKIE_KEYS } from './shared-cookies';

type SocketInitOptions = Partial<ManagerOptions & SocketOptions>;

/**
 * Crea el socket de realtime con credenciales.
 *
 * El gateway rechaza y desconecta cualquier socket sin JWT válido, y las
 * difusiones `entity:updated` van a la sala de la empresa del usuario. Sin
 * token el cliente no recibiría nada, así que todo `io(...)` de la app debe
 * pasar por aquí.
 *
 * Procedencia del token, por orden:
 *  1. `options.auth.token` si el llamador lo tiene (app nativa).
 *  2. Cookie de sesión legible por JS — solo existe en la app nativa.
 *  3. Nada: en navegador la cookie es `HttpOnly` y el navegador la adjunta sola
 *     al handshake; el gateway la lee de `handshake.headers.cookie`.
 */
export function createRealtimeSocket(url: string, options?: SocketInitOptions): Socket {
  const providedAuth =
    options?.auth && typeof options.auth === 'object'
      ? (options.auth as Record<string, unknown>)
      : undefined;

  const providedToken =
    typeof providedAuth?.['token'] === 'string' && providedAuth['token']
      ? (providedAuth['token'] as string)
      : undefined;

  const token = providedToken || getSharedCookie(SHARED_COOKIE_KEYS.ACCESS_TOKEN) || undefined;

  return io(url, {
    ...options,
    auth: { ...(providedAuth ?? {}), token },
  });
}
