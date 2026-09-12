import { redirect } from "next/navigation";

/** Alias legacy: Diarias → Tareas */
export default function ErpActividadesDiariasRedirect() {
  redirect("/erp/actividades/tareas");
}
