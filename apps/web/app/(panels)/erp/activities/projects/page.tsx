import { redirect } from "next/navigation";

/** Alias EN tras remap: /erp/activities/projects → Proyectos */
export default function ErpActivitiesProjectsRedirect() {
  redirect("/erp/actividades/proyectos");
}