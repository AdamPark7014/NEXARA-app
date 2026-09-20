"use client";

import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import PageHeader from "@/components/ui/PageHeader";
import PanelTabs from "@/components/ui/PanelTabs";
import { useUser } from "@/components/UserContext";
import { getErpInventorySectionConfig, getOpsTeamSectionConfig } from "@/lib/section-views";
import { VistaAlmacen } from "../warehouse/VistaAlmacen";
import ReabastecimientoPanel from "@/components/almacen/ReabastecimientoPanel";
import RecoleccionAlmacenPanel from "@/components/almacen/RecoleccionAlmacenPanel";
import KitInspeccionesPanel from "@/components/almacen/KitInspeccionesPanel";
import ScannerAlmacenPanel from "@/components/almacen/ScannerAlmacenPanel";
import ToolRequestsTable from "@/components/ToolRequestsTable";
import ToolRequestForm from "@/components/ToolRequestForm";
import ToolUserKitPanel from "@/components/ToolUserKitPanel";
import ToolMyKitPanel from "@/components/ToolMyKitPanel";
import ToolInventoryPanel from "@/components/ToolInventoryPanel";

/**
 * Almacén de Core (`/erp/almacen`): la casa de todo lo que entra, sale y se presta.
 *
 * Antes esta ruta reexportaba entera la pantalla vieja de `/erp/warehouse`, que solo
 * sabía de stock. Ahora es una portada con sus propias pestañas y monta las pantallas
 * que ya existían: inventario y movimientos siguen siendo las de almacén (con sus
 * modales, filtros y exportaciones intactos), y herramientas y kits son las de
 * `/ops/tools`. `/erp/warehouse` sigue sirviendo la pantalla completa donde no está
 * activada la superficie Core.
 */

const PESTANAS = [
  { key: "inventario", label: "Inventario" },
  { key: "movimientos", label: "Movimientos" },
  { key: "scanner", label: "Escáner" },
  { key: "reabastecimiento", label: "Reabastecimiento" },
  { key: "herramientas", label: "Herramientas" },
  { key: "kits", label: "Kits" },
] as const;

type Pestana = (typeof PESTANAS)[number]["key"];

function pestanaValida(valor: string | null): Pestana | null {
  return PESTANAS.some((p) => p.key === valor) ? (valor as Pestana) : null;
}

export default function AlmacenPage() {
  const { user } = useUser();
  const searchParams = useSearchParams();
  const cfg = useMemo(() => getErpInventorySectionConfig(user, "warehouse"), [user]);
  const herramientasCfg = useMemo(() => getOpsTeamSectionConfig(user, "tools"), [user]);
  const gestionaHerramientas =
    herramientasCfg.viewMode === "manage"
    || herramientasCfg.viewMode === "manage_execute"
    || herramientasCfg.canApprove;
  const puedePedirHerramientas = herramientasCfg.canCreate;

  const highlightId = searchParams.get("highlight");
  const [tab, setTab] = useState<Pestana>(
    () => pestanaValida(searchParams.get("tab")) ?? "inventario",
  );

  // Los avisos traen `?tab=`: reabastecimiento, una recolección o una revisión de kit.
  useEffect(() => {
    const desdeUrl = pestanaValida(searchParams.get("tab"));
    if (desdeUrl) setTab(desdeUrl);
  }, [searchParams]);

  return (
    <>
      <PageHeader
        eyebrow="Core · Almacén"
        title="Almacén"
        subtitle={cfg.subtitle}
        density="ops"
      />

      <PanelTabs
        ariaLabel="Secciones de almacén"
        value={tab}
        onChange={setTab}
        tabs={PESTANAS.map((p) => ({ key: p.key, label: p.label }))}
      />

      {/* Inventario y sus vistas hermanas: la pantalla de almacén, sin su encabezado. */}
      {tab === "inventario" && (
        <VistaAlmacen
          embedded={{ views: ["inventario", "dashboard", "lotes", "valuacion", "conteos"] }}
        />
      )}

      {tab === "movimientos" && <VistaAlmacen embedded={{ views: ["movimientos"] }} />}

      {tab === "scanner" && <ScannerAlmacenPanel />}

      {tab === "reabastecimiento" && <ReabastecimientoPanel />}

      {tab === "herramientas" && (
        <div style={{ display: "grid", gap: 10 }}>
          {gestionaHerramientas && (
            <>
              <RecoleccionAlmacenPanel />
              <ToolInventoryPanel />
              <ToolRequestsTable highlightId={highlightId} />
            </>
          )}
          {puedePedirHerramientas && <ToolRequestForm />}
          {!gestionaHerramientas && !puedePedirHerramientas && <ToolMyKitPanel />}
        </div>
      )}

      {tab === "kits" &&
        (gestionaHerramientas ? (
          <div style={{ display: "grid", gap: 10 }}>
            <div
              style={{
                padding: "8px 12px",
                borderRadius: 10,
                border: "1px solid var(--border)",
                background: "var(--surface)",
                fontSize: 12.5,
                color: "var(--text-secondary)",
              }}
            >
              Revisiones y kits por persona. Fotos del inventario: pestaña Herramientas.
            </div>
            <KitInspeccionesPanel />
            <ToolUserKitPanel />
          </div>
        ) : (
          <ToolMyKitPanel />
        ))}
    </>
  );
}
