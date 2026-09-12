import { redirect } from "next/navigation";

/** Core ola1: listas Tareas/Proyectos/Servicios viven en Actividades (pizarra). */
export default function ErpActividadesTareasRedirect() {
  redirect("/erp/pizarra");
}