"use client";

import OrgChartView from "@/components/organigrama/OrgChartView";
import { useHrManagementGuard } from "@/lib/useHrManagementGuard";

/**
 * Organigrama dentro de RH: con el guard de gestión de plantilla y el carril de RH.
 * La lectura para todo el personal vive en Core (`/erp/organigrama`), que monta la misma vista.
 */
export default function OrgChartPage() {
  const cfg = useHrManagementGuard();
  return <OrgChartView canEditOrg={cfg.canAssign} eyebrow="ERP · Personas" showHrRail />;
}
