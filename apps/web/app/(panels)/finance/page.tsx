import { redirect } from "next/navigation";

// El panel finance ya no es un producto aparte: aterriza en el hub Contadora de Core.
export default function FinanceIndexPage() {
  redirect("/erp/contabilidad");
}