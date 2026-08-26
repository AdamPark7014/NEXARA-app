import { redirect } from "next/navigation";

/** Legacy retirado en Ola 17 — redirige a la bandeja moderna. */
export default function LegacyActivitiesPage() {
  redirect("/ops/activities");
}
