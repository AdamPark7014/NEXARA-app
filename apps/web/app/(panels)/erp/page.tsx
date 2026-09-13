import { redirect } from "next/navigation";
import { CORE_HOME_PATH, CORE_SURFACE_ONLY } from "@/lib/core-surface";

export default function ErpHome() {
  redirect(CORE_SURFACE_ONLY ? CORE_HOME_PATH : "/erp/dashboard");
}
