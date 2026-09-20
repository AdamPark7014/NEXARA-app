"use client";

import { useEffect, useMemo, useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import PageHeader from "@/components/ui/PageHeader";
import PanelTabs from "@/components/ui/PanelTabs";
import InlineAlert from "@/components/ui/InlineAlert";
import { useUser } from "@/components/UserContext";
import { getOpsTeamSectionConfig } from "@/lib/section-views";
import { isCoreMount } from "@/lib/recursos-core";
import ToolInventoryPanel from "@/components/ToolInventoryPanel";
import ToolUserKitPanel from "@/components/ToolUserKitPanel";
import ToolMyKitPanel from "@/components/ToolMyKitPanel";
import ToolRequestsTable from "@/components/ToolRequestsTable";
import ToolRenewalsTable from "@/components/ToolRenewalsTable";
import ToolRequestForm from "@/components/ToolRequestForm";

type ManagerTab = "inventory" | "kits" | "requests" | "renewals" | "approvals";
type LoanTab = "mykit" | "myrequests";

function parseManagerTab(value: string | null): ManagerTab {
  if (value === "kits" || value === "requests" || value === "renewals" || value === "inventory" || value === "approvals") {
    return value;
  }
  return "inventory";
}

export default function ToolsPage() {
  const { user } = useUser();
  const searchParams = useSearchParams();
  // También se monta en Core (`/erp/almacen/herramientas`).
  const enCore = isCoreMount(usePathname());
  const cfg = useMemo(() => getOpsTeamSectionConfig(user, "tools"), [user]);
  // Email helpers (vía section-views): manage ≠ OPS_MANAGER; request ≠ campo genérico.
  const canManage = cfg.viewMode === "manage" || cfg.viewMode === "manage_execute" || cfg.canApprove;
  const canRequest = cfg.canCreate;
  const highlightId = searchParams.get("highlight");

  const [managerTab, setManagerTab] = useState<ManagerTab>(() => {
    const tab = parseManagerTab(searchParams.get("tab"));
    if (searchParams.get("tab")) return tab;
    return highlightId ? "approvals" : "inventory";
  });
  const [loanTab, setLoanTab] = useState<LoanTab>(() =>
    highlightId && !canManage ? "myrequests" : "mykit",
  );
  // Christian/Iván + loan-creator: una familia de tabs a la vez.
  const [pane, setPane] = useState<"manage" | "loan">(() =>
    canManage ? "manage" : "loan",
  );

  useEffect(() => {
    const tab = searchParams.get("tab");
    if (tab === "renewals" || tab === "requests" || tab === "kits" || tab === "inventory" || tab === "approvals") {
      setManagerTab(tab);
      setPane("manage");
      return;
    }
    if (tab === "mykit" || tab === "myrequests") {
      setLoanTab(tab);
      setPane("loan");
      return;
    }
    if (!highlightId) return;
    if (canManage) {
      setManagerTab("approvals");
      setPane("manage");
    } else if (canRequest) {
      setLoanTab("myrequests");
      setPane("loan");
    }
  }, [highlightId, canManage, canRequest, searchParams]);

  const showManagePane = canManage && (!canRequest || pane === "manage");
  const showLoanPane = canRequest && (!canManage || pane === "loan");

  /**
   * Antes eran pastillas rellenas de color de marca, todas encendidas a la vez:
   * cinco botones primarios donde no hay ninguna acción. Ahora son pestañas de
   * verdad (`role="tablist"`, una sola activa) y la única tinta de la pantalla
   * vuelve a ser el botón con el que se da de alta o se presta algo.
   */
  type ToolsTab = `manage:${ManagerTab}` | `loan:${LoanTab}`;

  const tabs: { key: ToolsTab; label: string }[] = [
    ...(canManage
      ? ([
          { key: "manage:approvals", label: "Por aprobar" },
          { key: "manage:inventory", label: "Inventario" },
          { key: "manage:kits", label: "Kits por persona" },
          { key: "manage:requests", label: "Préstamos" },
          { key: "manage:renewals", label: "Renovaciones" },
        ] as const)
      : []),
    ...(canRequest
      ? ([
          { key: "loan:mykit", label: "Mi kit" },
          { key: "loan:myrequests", label: "Pedir prestado" },
        ] as const)
      : []),
  ];

  const tabActiva: ToolsTab = showLoanPane ? `loan:${loanTab}` : `manage:${managerTab}`;

  const cambiarTab = (key: ToolsTab) => {
    const [panel, sub] = key.split(":");
    if (panel === "manage") {
      setPane("manage");
      setManagerTab(sub as ManagerTab);
    } else {
      setPane("loan");
      setLoanTab(sub as LoanTab);
    }
  };

  return (
    <>
      <PageHeader
        eyebrow={enCore ? "Core · Recursos" : "OPS · Campo"}
        title={cfg.title}
        subtitle={cfg.subtitle}
        density="ops"
      />

      {highlightId && (
        <div style={{ marginBottom: 12 }}>
          <InlineAlert
            variant="info"
            message={`Vienes de un aviso sobre la solicitud #${highlightId}: está resaltada en la lista.`}
          />
        </div>
      )}

      {tabs.length > 0 ? (
        <PanelTabs
          ariaLabel="Secciones de herramientas"
          value={tabActiva}
          onChange={cambiarTab}
          tabs={tabs}
        />
      ) : null}

      {showManagePane && managerTab === "approvals" && (
        <ToolRequestsTable highlightId={highlightId} />
      )}
      {showManagePane && managerTab === "inventory" && <ToolInventoryPanel />}
      {showManagePane && managerTab === "kits" && <ToolUserKitPanel />}
      {showManagePane && managerTab === "requests" && <ToolRequestsTable highlightId={highlightId} />}
      {showManagePane && managerTab === "renewals" && <ToolRenewalsTable highlightId={highlightId} />}

      {showLoanPane && loanTab === "mykit" && <ToolMyKitPanel />}
      {showLoanPane && loanTab === "myrequests" && <ToolRequestForm />}
      {!canManage && !canRequest && <ToolMyKitPanel />}
    </>
  );
}
