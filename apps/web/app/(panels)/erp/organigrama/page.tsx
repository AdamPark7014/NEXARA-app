"use client";

import { useMemo } from "react";
import OrgChartView from "@/components/organigrama/OrgChartView";
import { useUser } from "@/components/UserContext";
import { getHrSectionConfig } from "@/lib/section-views";

/**
 * Organigrama de Core: lectura para todo el personal interno, sin el guard de RH.
 * Reasignar jefe (✎) sigue siendo de RH y dirección, igual que en `/erp/hr/orgchart`.
 */
export default function OrganigramaPage() {
  const { user } = useUser();
  const canEditOrg = useMemo(() => getHrSectionConfig(user).canAssign, [user]);
  return <OrgChartView canEditOrg={canEditOrg} eyebrow="Core · Recursos" />;
}
