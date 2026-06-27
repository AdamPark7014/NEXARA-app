"use client";

import { useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import PageHeader from "@/components/ui/PageHeader";
import { useUser } from "@/components/UserContext";
import { getOpsTeamSectionConfig } from "@/lib/section-views";
import ToolInventoryPanel from "@/components/ToolInventoryPanel";
import ToolUserKitPanel from "@/components/ToolUserKitPanel";
import ToolMyKitPanel from "@/components/ToolMyKitPanel";
import ToolRequestsTable from "@/components/ToolRequestsTable";
import ToolRenewalsTable from "@/components/ToolRenewalsTable";
import ToolRequestForm from "@/components/ToolRequestForm";

type ManagerTab = "inventory" | "kits" | "requests" | "renewals";
type EngineerTab = "mykit" | "myrequests";

function parseManagerTab(value: string | null): ManagerTab {
  if (value === "kits" || value === "requests" || value === "renewals" || value === "inventory") {
    return value;
  }
  return "inventory";
}

export default function ToolsPage() {
  const { user } = useUser();
  const searchParams = useSearchParams();
  const cfg = useMemo(() => getOpsTeamSectionConfig(user, "tools"), [user]);
  const isManager = cfg.viewMode !== "execute";

  const [managerTab, setManagerTab] = useState<ManagerTab>(() => parseManagerTab(searchParams.get("tab")));
  const [engineerTab, setEngineerTab] = useState<EngineerTab>("mykit");

  const tabBtn = (active: boolean): React.CSSProperties => ({
    padding: "7px 16px",
    borderRadius: 8,
    border: "none",
    cursor: "pointer",
    fontSize: 13,
    fontWeight: active ? 700 : 500,
    background: active ? "var(--primary)" : "var(--surface-2)",
    color: active ? "#fff" : "var(--text-secondary)",
  });

  return (
    <>
      <PageHeader
        eyebrow="OPS · Campo"
        title={cfg.title}
        subtitle={cfg.subtitle}
      />

      <div style={{ display: "flex", gap: 8, marginBottom: 20, flexWrap: "wrap" }}>
        {isManager ? (
          <>
            <button type="button" style={tabBtn(managerTab === "inventory")} onClick={() => setManagerTab("inventory")}>
              Inventario
            </button>
            <button type="button" style={tabBtn(managerTab === "kits")} onClick={() => setManagerTab("kits")}>
              Kits por ingeniero
            </button>
            <button type="button" style={tabBtn(managerTab === "requests")} onClick={() => setManagerTab("requests")}>
              Solicitudes
            </button>
            <button type="button" style={tabBtn(managerTab === "renewals")} onClick={() => setManagerTab("renewals")}>
              Renovaciones / vencimientos
            </button>
          </>
        ) : (
          <>
            <button type="button" style={tabBtn(engineerTab === "mykit")} onClick={() => setEngineerTab("mykit")}>
              Mi kit
            </button>
            <button type="button" style={tabBtn(engineerTab === "myrequests")} onClick={() => setEngineerTab("myrequests")}>
              Mis solicitudes
            </button>
          </>
        )}
      </div>

      {isManager && managerTab === "inventory" && <ToolInventoryPanel />}
      {isManager && managerTab === "kits" && <ToolUserKitPanel />}
      {isManager && managerTab === "requests" && <ToolRequestsTable />}
      {isManager && managerTab === "renewals" && <ToolRenewalsTable />}
      {!isManager && engineerTab === "mykit" && <ToolMyKitPanel />}
      {!isManager && engineerTab === "myrequests" && <ToolRequestForm />}
    </>
  );
}
