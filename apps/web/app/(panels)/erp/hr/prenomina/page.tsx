"use client";

import HrModuleRail from "@/components/hr/HrModuleRail";
import PrenominaPanel from "@/components/prenomina/PrenominaPanel";
import { useUser } from "@/components/UserContext";
import { PERMISSIONS, hasPermission } from "@/lib/permissions";

export default function HrPrenominaPage() {
  const { user } = useUser();
  const canDecideOt =
    Boolean(user?.isSuperAdmin) ||
    hasPermission(user, PERMISSIONS.HR_MANAGE) ||
    hasPermission(user, PERMISSIONS.CONTABILIDAD_MANAGE);

  return (
    <PrenominaPanel
      rail={<HrModuleRail />}
      eyebrow="RH · Nómina operativa"
      subtitle="Asistencia + extras aprobadas + sueldo semanal → borradores. Sin timbrado CFDI."
      paymentsHref="/erp/finance/employee-payments"
      canDecideOt={canDecideOt}
    />
  );
}
