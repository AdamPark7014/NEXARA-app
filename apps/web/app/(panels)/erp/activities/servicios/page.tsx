import { redirect } from "next/navigation";

/** Alias EN: /erp/activities/servicios → Servicios */
export default function ErpActivitiesServiciosRedirect() {
  redirect("/erp/actividades/servicios");
}