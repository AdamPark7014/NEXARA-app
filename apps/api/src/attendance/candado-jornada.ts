/**
 * Sin entrada registrada no se trabaja (Adam, 20-11-2026): «para tocar la plataforma debes colocar tu
 * asistencia a laborar, eso es indispensable».
 *
 * Quien debe checar (todos menos `sinChecador`: dirección/plataforma y RH) no puede hacer ninguna
 * operación de escritura sin una jornada abierta. Consultar sí puede. Siempre puede checar su entrada,
 * justificar su asistencia, usar el chat, ver sus avisos y pedir un permiso.
 *
 * Puro: la consulta de la jornada vive en `candado-jornada.interceptor.ts`.
 */
import { sinActividades } from '../common/platform-accounts.js';

export const CODIGO_JORNADA_NO_ABIERTA = 'JORNADA_NO_ABIERTA';
export const MENSAJE_JORNADA_NO_ABIERTA = 'Registra tu entrada para empezar a trabajar';

const METODOS_DE_ESCRITURA = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

/**
 * Rutas (sin el prefijo `api/`) que no piden jornada abierta. Corta a propósito: lo que no esté aquí
 * es operar. Cada entrada cubre la ruta exacta y todo lo que cuelga de ella.
 */
export const RUTAS_SIN_JORNADA: readonly string[] = [
  // Entrar, salir y mantener la sesión.
  'auth',
  'account-access',
  'scim',
  // La propia asistencia: checar, justificar, comida, ubicación de la jornada.
  'attendance',
  'lunch-breaks',
  'gps',
  'guardias',
  // Avisos, preferencias, dispositivo y chat.
  'notifications',
  'user-preferences',
  'devices',
  'chat',
  'alerts',
  'activity-feed',
  // Telemetría y bitácora que el cliente manda solo.
  'analytics',
  'audit',
  // Pedir un permiso o vacaciones se hace justo cuando no se está trabajando.
  'hr/solicitudes-aprobacion',
  // Cálculos y búsquedas que usan POST pero no cambian nada.
  'me/activities/tiempo-calculado',
  'search',
  'export',
  'exports',
  'static-map',
  // Portales, integraciones y páginas públicas (no son personal con checador).
  'client-auth',
  'client-portal',
  'client-ticket-requests',
  'branch-auth',
  'branch-portal',
  'portal',
  'nas-portal',
  'company-public',
  'kb-public',
  'public-analytics',
  'contact-messages',
  'newsletter',
  'cotizaciones/public',
  'cotizaciones/exportables',
  'webhooks',
  'integra',
  'health',
  'metrics',
];

export type UsuarioDePeticion = {
  id?: number | null;
  email?: string | null;
  roleKey?: string | null;
  isClient?: boolean;
  isBranchUser?: boolean;
} | null | undefined;

/** `/api/me/activities/5/iniciar?x=1` → `me/activities/5/iniciar`. */
export function rutaNormalizada(url: string | null | undefined): string {
  const sinQuery = String(url ?? '').split('?')[0].split('#')[0];
  return sinQuery.replace(/^\/+/, '').replace(/^api\//, '').replace(/\/+$/, '').toLowerCase();
}

export function rutaExenta(ruta: string): boolean {
  return RUTAS_SIN_JORNADA.some((base) => ruta === base || ruta.startsWith(`${base}/`));
}

/** ¿El candado está encendido? Se apaga con `JORNADA_OBLIGATORIA=0` en una emergencia. */
export function candadoEncendido(env: NodeJS.ProcessEnv = process.env): boolean {
  const v = String(env.JORNADA_OBLIGATORIA ?? '').trim().toLowerCase();
  return !(v === '0' || v === 'false' || v === 'no' || v === 'off');
}

/**
 * Personas exentas por un tiempo (ids separados por coma en `JORNADA_EXENTOS`). Para quien todavía no
 * puede checar por causas nuestras: p. ej. su app instalada aún no trae el botón de entrada.
 */
export function exentoTemporal(userId: number | null | undefined, env: NodeJS.ProcessEnv = process.env): boolean {
  if (!userId) return false;
  return String(env.JORNADA_EXENTOS ?? '')
    .split(',')
    .map((x) => Number(x.trim()))
    .some((id) => id > 0 && id === Number(userId));
}

/** ¿Esta petición necesita que quien la hace tenga su jornada abierta? */
export function pideJornadaAbierta(p: {
  metodo: string | null | undefined;
  url: string | null | undefined;
  usuario: UsuarioDePeticion;
  env?: NodeJS.ProcessEnv;
}): boolean {
  if (!candadoEncendido(p.env)) return false;
  if (!METODOS_DE_ESCRITURA.has(String(p.metodo ?? '').toUpperCase())) return false;
  const u = p.usuario;
  // Sin usuario (público, webhooks, llaves de integración) o portales de cliente/sucursal: no aplica.
  if (!u || !u.id || u.isClient || u.isBranchUser) return false;
  if (exentoTemporal(u.id, p.env)) return false;
  // Dirección/plataforma y RH no checan (mismo criterio que `sinActividades`).
  if (sinActividades(u)) return false;
  return !rutaExenta(rutaNormalizada(p.url));
}
