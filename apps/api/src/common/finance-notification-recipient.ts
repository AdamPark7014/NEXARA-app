import { isDeveloperSuperAdminEmail, TESTER_CEO_EMAIL } from './platform-accounts.js';

/** Las decisiones de viáticos y vehículos solo se avisan a cuentas reales. */
export function esDestinatarioFinanzas(user: { email?: string | null; puesto?: string | null }): boolean {
  const email = String(user.email ?? '').trim().toLowerCase();
  return Boolean(email) && !isDeveloperSuperAdminEmail(email) &&
    email !== TESTER_CEO_EMAIL &&
    !email.endsWith('.invalid') && !email.startsWith('play.review@') &&
    !/^(demo|test|tester|review)[+@.]/.test(email) && !/@example\.(com|org)$/.test(email) &&
    !/tester|demostraci[oó]n|\bdemo\b/.test(String(user.puesto ?? '').toLowerCase());
}
