import { redirect } from "next/navigation";

/** El listado único y los costos de proyecto viven en su maestro operativo. */
export default function ProyectosContabilidadRedirect() {
  redirect("/erp/proyectos");
}
