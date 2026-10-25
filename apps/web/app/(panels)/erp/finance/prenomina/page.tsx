"use client";

import FinanceModuleRail from "@/components/erp/FinanceModuleRail";
import PrenominaPanel from "@/components/prenomina/PrenominaPanel";
import { useUser } from "@/components/UserContext";
import { PERMISSIONS, hasPermission } from "@/lib/permissions";

export default function FinancePrenominaPage() {
  const { user } = useUser();
  const canDecideOt =
    Boolean(user?.isSuperAdmin) ||
    hasPermission(user, PERMISSIONS.HR_MANAGE) ||
    hasPermission(user, PERMISSIONS.CONTABILIDAD_MANAGE);

  return (
    <PrenominaPanel
      rail={<FinanceModuleRail />}
      paymentsHref="/erp/finance/employee-payments"
      canDecideOt={canDecideOt}
    />
  );
}
