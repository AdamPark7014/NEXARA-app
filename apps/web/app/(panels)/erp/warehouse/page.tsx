import { redirect } from "next/navigation";

/**
 * Ruta antigua del almacén: `/erp/almacen` monta la misma vista en sus pestañas, y todo rol que
 * abría esta abre aquella. Se conserva la query porque `VistaAlmacen` la lee (`?productId=`).
 */
export default async function WarehousePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const query = new URLSearchParams();
  for (const [clave, valor] of Object.entries(await searchParams)) {
    for (const v of Array.isArray(valor) ? valor : valor === undefined ? [] : [valor]) query.append(clave, v);
  }
  const texto = query.toString();
  redirect(texto ? `/erp/almacen?${texto}` : "/erp/almacen");
}
