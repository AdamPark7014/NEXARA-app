import { redirect } from "next/navigation";

export default function ClientesCorporativoRedirect() {
  redirect("/erp/clientes?sector=corporativo");
}
