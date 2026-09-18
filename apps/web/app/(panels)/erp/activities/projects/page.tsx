import { redirect } from "next/navigation";

/** Alias en inglés de `/erp/actividades/proyectos`: mismo destino. */
export default function ErpActivitiesProjectsRedirect() {
  redirect("/erp/proyectos");
}
