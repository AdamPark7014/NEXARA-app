/**
 * A quién alcanza cada persona: la misma regla para ver a alguien en la pizarra y para asignarle
 * trabajo. Se reparte así:
 *
 * - Christian (y cuentas de dirección/desarrollo): toda la empresa.
 * - Cada quien: su organigrama hacia abajo (`managerId`).
 * - Además, el flujo de despacho que no cuelga del organigrama: Luis (servicios) pasa a José
 *   Antonio, y este reparte a soporte (Carolina, Alejandro, Roberto) aunque en el organigrama
 *   Antonio reporte a Christian.
 *
 * Por eso David (instaladores) no alcanza a soporte: no es su organigrama ni su despacho.
 */
import { isCeoEquivalentEmail } from '../common/platform-accounts.js';

export type Alcanzador = {
  id: number;
  email?: string | null;
  roleKey?: string | null;
  isSuperAdmin?: boolean;
};

/** Gente que debe verse (y poder recibir trabajo) aunque `managerId` no la cuelgue de quien mira. */
const EXTRAS_POR_CORREO: Record<string, string[]> = {
  'direccion.operaciones@nexara.com.mx': [
    'jose.ramirez@nexara.com.mx',
    'soporte@nexara.com.mx',
    'alejandro.gonzalez@nexara.com.mx',
    'roberto.vivanco@nexara.com.mx',
  ],
  'jose.ramirez@nexara.com.mx': [
    'soporte@nexara.com.mx',
    'alejandro.gonzalez@nexara.com.mx',
    'roberto.vivanco@nexara.com.mx',
  ],
  // David: instaladores de campo (por si managerId no coincide).
  'operaciones@nexara.com.mx': [
    'joan.sanchez@nexara.com.mx',
    'israel.ramos@nexara.com.mx',
    'juan.gonzalez@nexara.com.mx',
  ],
};

export function extrasDeTablero(email?: string | null): string[] {
  return EXTRAS_POR_CORREO[(email || '').trim().toLowerCase()] ?? [];
}

export function esDeTodaLaEmpresa(viewer: Alcanzador): boolean {
  if (viewer.isSuperAdmin) return true;
  if (viewer.roleKey === 'ceo') return true;
  const email = (viewer.email || '').toLowerCase();
  return isCeoEquivalentEmail(email) || email === 'developer@nexara.com.mx';
}

/** Quien mira y todo su organigrama hacia abajo. */
export function subarbolIds(rootId: number, users: Array<{ id: number; managerId: number | null }>): Set<number> {
  const hijos = new Map<number, number[]>();
  for (const u of users) {
    if (u.managerId == null) continue;
    const lista = hijos.get(u.managerId) ?? [];
    lista.push(u.id);
    hijos.set(u.managerId, lista);
  }
  const out = new Set<number>([rootId]);
  const cola = [rootId];
  while (cola.length) {
    const id = cola.shift()!;
    for (const hijo of hijos.get(id) ?? []) {
      if (out.has(hijo)) continue;
      out.add(hijo);
      cola.push(hijo);
    }
  }
  return out;
}

/** ¿`viewer` alcanza a `targetId`? `users` = personas activas con id, correo y jefe. */
export function alcanzaA(
  viewer: Alcanzador,
  users: Array<{ id: number; email: string; managerId: number | null }>,
  targetId: number,
): boolean {
  if (targetId === viewer.id || esDeTodaLaEmpresa(viewer)) return true;
  if (subarbolIds(viewer.id, users).has(targetId)) return true;
  const target = users.find((u) => u.id === targetId);
  return Boolean(target && extrasDeTablero(viewer.email).includes(target.email.toLowerCase()));
}

/**
 * Tipos de actividad (`coreKind`) que ve cada coordinador; `null` = todos. Luis coordina servicios:
 * ni proyectos, obras ni tareas de instalación le corresponden.
 */
const TIPOS_POR_CORREO: Record<string, string[]> = {
  'direccion.operaciones@nexara.com.mx': ['servicio'],
};

export function tiposVisibles(viewer: Alcanzador): string[] | null {
  if (esDeTodaLaEmpresa(viewer)) return null;
  return TIPOS_POR_CORREO[(viewer.email || '').trim().toLowerCase()] ?? null;
}
