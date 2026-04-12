import { headers } from "next/headers";
import { redirect } from "next/navigation";

/**
 * En path-based (localhost/console/…) el dashboard del panel web es /web.
 * En subdominio web.* la raíz / ya se reescribe a /web/; evitar mandar al sitio público (/nexara).
 */
export default function WebDashboardPage() {
  const host = headers().get("host")?.split(":")[0]?.toLowerCase() ?? "";
  const onWebSubdomain = host.startsWith("web.");
  redirect(onWebSubdomain ? "/" : "/web");
}
