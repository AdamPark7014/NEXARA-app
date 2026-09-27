import { redirect } from "next/navigation";

/** Deep-link → workspace unificado con tab. */
export default function ClientesProyectoRedirect() {
  redirect("/erp/clientes?sector=proyecto");
}
