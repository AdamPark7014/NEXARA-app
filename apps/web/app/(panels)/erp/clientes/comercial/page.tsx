import { redirect } from "next/navigation";

export default function ClientesComercialRedirect() {
  redirect("/erp/clientes?sector=comercial");
}
