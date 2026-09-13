import { redirect } from "next/navigation";

/** /erp/actividades no tiene índice propio: el tablero del equipo vive en la pizarra. */
export default function ActividadesIndex() {
  redirect("/erp/pizarra");
}
