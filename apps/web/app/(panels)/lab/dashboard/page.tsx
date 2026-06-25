import { redirect } from "next/navigation";

/** Fallback panel-switch: /lab/dashboard → home del LAB. */
export default function LabDashboardRedirect() {
  redirect("/lab");
}
