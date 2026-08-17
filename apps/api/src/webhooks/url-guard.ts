import { BadRequestException } from '@nestjs/common';
import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';

/**
 * Destinos permitidos para un webhook saliente.
 *
 * La validación anterior sólo comprobaba que el protocolo fuera http/https, así
 * que un webhook podía apuntar a la red interna: `http://nexara-db:5432`, otro
 * contenedor del mismo host —el servidor aloja además otros cuatro proyectos de
 * clientes— o la metadata del proveedor en `169.254.169.254`.
 *
 * Y no era sólo tocar: la respuesta se guarda (primeros 1000 caracteres) en
 * `WebhookDelivery.responseBody` y se muestra en el registro de entregas. Es
 * decir, servía para **leer** de la red interna, no sólo para alcanzarla.
 *
 * Se comprueba dos veces:
 *
 *   - Al guardar el webhook, sobre lo que escribió la persona.
 *   - Antes de cada entrega, ya con el nombre resuelto: si no, bastaría con
 *     registrar un dominio público que más tarde apunte a una IP interna.
 */

/** Escape para desarrollo local, donde el destino suele ser `localhost`. */
const PERMITIR_PRIVADAS = process.env.WEBHOOK_ALLOW_PRIVATE === 'true';

/** Nombres que nunca salen de la máquina o de la red del contenedor. */
const HOSTS_PROHIBIDOS = new Set(['localhost', 'localhost.localdomain', 'metadata', 'metadata.google.internal']);
const SUFIJOS_PROHIBIDOS = ['.localhost', '.local', '.internal', '.lan', '.home.arpa'];

/** ¿Es una dirección que no debe salir a internet? */
export function isPrivateAddress(ip: string): boolean {
  const version = isIP(ip);
  if (version === 4) return isPrivateIPv4(ip);
  if (version === 6) return isPrivateIPv6(ip);
  return false;
}

function isPrivateIPv4(ip: string): boolean {
  const o = ip.split('.').map(Number);
  if (o.length !== 4 || o.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) return true;
  const [a, b] = o;
  if (a === 0) return true; // "esta red"
  if (a === 10) return true; // RFC1918
  if (a === 127) return true; // bucle local
  if (a === 169 && b === 254) return true; // enlace local y metadata del proveedor
  if (a === 172 && b >= 16 && b <= 31) return true; // RFC1918
  if (a === 192 && b === 168) return true; // RFC1918
  if (a === 100 && b >= 64 && b <= 127) return true; // CGNAT
  if (a === 192 && b === 0) return true; // IETF / documentación
  if (a >= 224) return true; // multicast y reservadas
  return false;
}

function isPrivateIPv6(ip: string): boolean {
  const normal = ip.toLowerCase().replace(/^\[|\]$/g, '');
  if (normal === '::' || normal === '::1') return true; // sin especificar, bucle local
  if (normal.startsWith('fe80')) return true; // enlace local
  if (/^f[cd]/.test(normal)) return true; // únicas locales (fc00::/7)
  // IPv4 embebida: se juzga por la parte IPv4.
  const embebida = normal.match(/(\d+\.\d+\.\d+\.\d+)$/);
  if (embebida) return isPrivateIPv4(embebida[1]);
  return false;
}

/**
 * Comprobación estructural, sin red.
 *
 * Rechaza credenciales en la URL además del destino: `http://user:pass@host`
 * enviaría esas credenciales en cada entrega sin que se vean en la pantalla.
 */
export function assertPublicHttpUrl(url: string): URL {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new BadRequestException('URL inválida');
  }

  if (!['http:', 'https:'].includes(parsed.protocol)) {
    throw new BadRequestException('Solo http/https');
  }
  if (parsed.username || parsed.password) {
    throw new BadRequestException('La URL no puede llevar usuario ni contraseña');
  }
  if (PERMITIR_PRIVADAS) return parsed;

  const host = parsed.hostname.toLowerCase();

  if (HOSTS_PROHIBIDOS.has(host) || SUFIJOS_PROHIBIDOS.some((s) => host.endsWith(s))) {
    throw new BadRequestException('El webhook no puede apuntar a la red interna');
  }
  // Un nombre sin punto es un contenedor o una máquina de la red local
  // (`nexara-db`, `redis`), nunca un dominio de internet.
  if (!host.includes('.') && isIP(host) === 0) {
    throw new BadRequestException('El webhook no puede apuntar a la red interna');
  }
  if (isIP(host) !== 0 && isPrivateAddress(host)) {
    throw new BadRequestException('El webhook no puede apuntar a la red interna');
  }

  return parsed;
}

/**
 * Comprobación con el nombre ya resuelto, justo antes de entregar.
 *
 * Sin esto bastaría con registrar un dominio público que después apunte a una
 * IP interna: la validación de guardado lo habría dejado pasar.
 */
export async function assertResolvesPublic(url: string): Promise<void> {
  const parsed = assertPublicHttpUrl(url);
  if (PERMITIR_PRIVADAS) return;

  const host = parsed.hostname;
  if (isIP(host) !== 0) return; // ya validado como literal

  let direcciones: Array<{ address: string }>;
  try {
    direcciones = await lookup(host, { all: true });
  } catch {
    // Si no resuelve, la entrega fallará igual; no es motivo para bloquear.
    return;
  }

  const interna = direcciones.find((d) => isPrivateAddress(d.address));
  if (interna) {
    throw new BadRequestException(
      `El destino del webhook resuelve a una dirección interna (${interna.address})`,
    );
  }
}
