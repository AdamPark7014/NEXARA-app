"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
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
  const router = useRouter();
  const pathname = usePathname();
  const cfg = useMemo(() => getErpInventorySectionConfig(user, "warehouse"), [user]);
  const herramientasCfg = useMemo(() => getOpsTeamSectionConfig(user, "tools"), [user]);
  const gestionaHerramientas =
    herramientasCfg.viewMode === "manage"
    || herramientasCfg.viewMode === "manage_execute"
    || herramientasCfg.canApprove;
  const puedePedirHerramientas = herramientasCfg.canCreate;

  const [highlightId, setHighlightId] = useState<string | null>(null);
  const [tab, setTab] = useState<Pestana>("inventario");

  // Los avisos traen `?tab=`: reabastecimiento, una recolección o una revisión de kit.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const desdeUrl = pestanaValida(params.get("tab"));
    if (desdeUrl) setTab(desdeUrl);
    setHighlightId(params.get("highlight"));
  }, [pathname]);

  // La pestaña queda en la URL para que recargar o compartir el enlace caiga en el mismo sitio.
  const cambiarTab = useCallback(
    (siguiente: Pestana) => {
      setTab(siguiente);
      const params = new URLSearchParams(window.location.search);
      params.set("tab", siguiente);
      router.replace(`${pathname}?${params.toString()}`, { scroll: false });
    },
    [pathname, router],
  );

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
        onChange={cambiarTab}
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
        <div style={{ display: "grid", gap: 16 }}>
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
          // Sin banner de ayuda: los títulos de cada bloque ya dicen qué es cada
          // cosa, y el recuadro solo añadía un rectángulo más a la pantalla.
          <div style={{ display: "grid", gap: 16 }}>
            <KitInspeccionesPanel />
            <ToolUserKitPanel />
          </div>
        ) : (
          <ToolMyKitPanel />
        ))}
    </>
  );
}
