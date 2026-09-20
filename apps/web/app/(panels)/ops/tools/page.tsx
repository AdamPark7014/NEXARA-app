"use client";

import { useEffect, useMemo, useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import PageHeader from "@/components/ui/PageHeader";
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

  const tabBtn = (active: boolean): React.CSSProperties => ({
    padding: "10px 16px",
    minHeight: 40,
    borderRadius: 8,
    border: "none",
    cursor: "pointer",
    fontSize: 13,
    fontWeight: active ? 700 : 500,
    background: active ? "var(--primary)" : "var(--surface-2)",
    color: active ? "#fff" : "var(--text-secondary)",
  });

  const showManagePane = canManage && (!canRequest || pane === "manage");
  const showLoanPane = canRequest && (!canManage || pane === "loan");
  const manageTabActive = (t: ManagerTab) => showManagePane && managerTab === t;
  const loanTabActive = (t: LoanTab) => showLoanPane && loanTab === t;

  return (
    <>
      <PageHeader
        eyebrow={enCore ? "Core · Recursos" : "OPS · Campo"}
        title={cfg.title}
        subtitle={cfg.subtitle}
      />

      {highlightId && (
        <div style={{ marginBottom: 12, padding: "10px 14px", borderRadius: 10, border: "1px solid var(--border)", background: "var(--surface-2)", fontSize: 13 }}>
          Destacando solicitud/herramienta <strong>#{highlightId}</strong> desde notificación.
        </div>
      )}

      <div style={{ display: "flex", gap: 8, marginBottom: 20, flexWrap: "wrap" }}>
        {canManage && (
          <>
            <button type="button" style={tabBtn(manageTabActive("approvals"))} onClick={() => { setPane("manage"); setManagerTab("approvals"); }}>
              Cola de aprobación
            </button>
            <button type="button" style={tabBtn(manageTabActive("inventory"))} onClick={() => { setPane("manage"); setManagerTab("inventory"); }}>
              Inventario y fotos
            </button>
            <button type="button" style={tabBtn(manageTabActive("kits"))} onClick={() => { setPane("manage"); setManagerTab("kits"); }}>
              Kits por persona
            </button>
            <button type="button" style={tabBtn(manageTabActive("requests"))} onClick={() => { setPane("manage"); setManagerTab("requests"); }}>
              Todos los préstamos
            </button>
            <button type="button" style={tabBtn(manageTabActive("renewals"))} onClick={() => { setPane("manage"); setManagerTab("renewals"); }}>
              Renovaciones
            </button>
          </>
        )}
        {canRequest && (
          <>
            <button type="button" style={tabBtn(loanTabActive("mykit"))} onClick={() => { setPane("loan"); setLoanTab("mykit"); }}>
              Mi kit
            </button>
            <button type="button" style={tabBtn(loanTabActive("myrequests"))} onClick={() => { setPane("loan"); setLoanTab("myrequests"); }}>
              Solicitar préstamo
            </button>
          </>
        )}
        {!canManage && !canRequest && (
          <button type="button" style={tabBtn(true)} disabled>
            Mi kit
          </button>
        )}
      </div>

      {showManagePane && managerTab === "approvals" && (
        <div style={{ display: "grid", gap: 12 }}>
          <p style={{ margin: 0, fontSize: 13, color: "var(--text-secondary)" }}>
            Aprueba o rechaza préstamos pendientes. Solo Christian e Iván tienen esta cola.
          </p>
          <ToolRequestsTable highlightId={highlightId} />
        </div>
      )}
      {showManagePane && managerTab === "inventory" && <ToolInventoryPanel />}
      {showManagePane && managerTab === "kits" && (
        <div style={{ display: "grid", gap: 12 }}>
          <div
            style={{
              padding: "12px 14px",
              borderRadius: 12,
              border: "1px solid var(--border)",
              background: "var(--surface)",
              fontSize: 13,
              color: "var(--text-secondary)",
            }}
          >
            Kits permanentes por ingeniero: asignación, cadencia de revisión y eventos de daño.
          </div>
          <ToolUserKitPanel />
        </div>
      )}
      {showManagePane && managerTab === "requests" && <ToolRequestsTable highlightId={highlightId} />}
      {showManagePane && managerTab === "renewals" && <ToolRenewalsTable highlightId={highlightId} />}

      {showLoanPane && loanTab === "mykit" && <ToolMyKitPanel />}
      {showLoanPane && loanTab === "myrequests" && <ToolRequestForm />}
      {!canManage && !canRequest && <ToolMyKitPanel />}
    </>
  );
}
