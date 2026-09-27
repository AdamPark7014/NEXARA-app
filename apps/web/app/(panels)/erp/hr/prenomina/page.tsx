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
      eyebrow="RR. HH. · Prenómina"
      subtitle="Asistencia, horas extra aprobadas y sueldo semanal de cada persona → borradores de pago. No genera CFDI."
      paymentsHref="/erp/finance/employee-payments"
      canDecideOt={canDecideOt}
    />
  );
}
