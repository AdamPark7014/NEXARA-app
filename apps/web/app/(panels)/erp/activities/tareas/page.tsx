import { redirect } from "next/navigation";

/** Alias EN tras remap legacy: /erp/activities/tareas → Tareas */
export default function ErpActivitiesTareasRedirect() {
  redirect("/erp/actividades/tareas");
}