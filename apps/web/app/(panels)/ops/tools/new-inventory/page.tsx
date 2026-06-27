import { redirect } from "next/navigation";

/** Ruta legacy — el inventario vive en /ops/tools (pestaña Inventario). */
export default function ToolsNewInventoryRedirect() {
  redirect("/ops/tools?tab=inventory");
}
