import { redirect } from "next/navigation";

/** Mis actividades vive dentro de Actividades (pestaña «Mis actividades»). */
export default function MisActividadesRedirect() {
  redirect("/erp/pizarra?vista=mias");
}
