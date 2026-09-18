import { redirect } from "next/navigation";

/** «Proyectos» dentro de Actividades era un atajo a la pizarra; ahora los proyectos tienen su página. */
export default function ErpActividadesProyectosRedirect() {
  redirect("/erp/proyectos");
}
