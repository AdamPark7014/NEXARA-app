/**
 * Reglas compartidas (web + mobile) para la cola offline.
 * Una sola fuente de verdad: ampliar aquí las rutas que nunca deben persistirse en IDB.
 */
export function isNeverQueuePath(pathname: string): boolean {
  const p = pathname.toLowerCase();

  if (
    p.includes("/auth/login") ||
    p.includes("/auth/register") ||
    p.includes("/auth/refresh") ||
    p.includes("/client-auth/login") ||
    p.includes("/branch-auth/login")
  ) {
    return true;
  }

  if (p.includes("/auth/forgot-password") || p.includes("/auth/reset-password")) return true;
  if (p.includes("/auth/password") && p.includes("reset")) return true;

  if (p.includes("/public-analytics")) return true;

  if (/\/contact-messages\/?$/.test(p)) return true;
  if (p.includes("/contact-messages/inbound")) return true;

  if (p.includes("/cotizaciones/public")) return true;
  if (p.includes("/newsletter/subscribe")) return true;

  return false;
}
