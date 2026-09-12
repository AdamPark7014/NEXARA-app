import { redirect } from "next/navigation";

/** Typo / inglés: /erp/activities/diarias → Tareas */
export default function ErpActivitiesDiariasRedirect() {
  redirect("/erp/actividades/tareas");
}
