import { isDeveloperSuperAdminEmail, TESTER_CEO_EMAIL } from '../platform-accounts.js';

/** Filtra cuentas demo/tester/developer para avisos de aprobación RH (mismo criterio que bajas). */
export function esCuentaAvisoRh(u: { email: string; puesto?: string | null }): boolean {
  const email = String(u.email ?? '').trim().toLowerCase();
  if (!email || email.endsWith('.invalid') || email === TESTER_CEO_EMAIL) return false;
  if (isDeveloperSuperAdminEmail(email)) return false;
  if (
    email.startsWith('play.review@') ||
    /^(demo|test|tester|review)[+@.]/.test(email) ||
    /@example\.(com|org)$/.test(email)
  ) {
    return false;
  }
  const puesto = String(u.puesto ?? '').toLowerCase();
  if (puesto.includes('tester') || puesto.includes('demostración') || puesto.includes('demostracion') || /\bdemo\b/.test(puesto)) {
    return false;
  }
  return true;
}
