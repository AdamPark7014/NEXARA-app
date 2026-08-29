import { redirect } from "next/navigation";

/** Compat: algunos redirects usan /dashboard; Integra vive en /. */
export default function IntegraDashboardRedirect() {
  redirect("/integra");
}
