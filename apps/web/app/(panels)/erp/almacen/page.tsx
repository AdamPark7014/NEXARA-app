"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import Inventory2Outlined from "@mui/icons-material/Inventory2Outlined";
import SwapHorizOutlined from "@mui/icons-material/SwapHorizOutlined";
import QrCodeScannerOutlined from "@mui/icons-material/QrCodeScannerOutlined";
import ShoppingCartOutlined from "@mui/icons-material/ShoppingCartOutlined";
import HandymanOutlined from "@mui/icons-material/HandymanOutlined";
import BackpackOutlined from "@mui/icons-material/BackpackOutlined";
import WarehouseOutlined from "@mui/icons-material/WarehouseOutlined";
import { PageHead, Tabs, type TabItem } from "@/components/base";
import { useUser } from "@/components/UserContext";
import { getErpInventorySectionConfig, getOpsTeamSectionConfig } from "@/lib/section-views";
import { VistaAlmacen } from "../warehouse/VistaAlmacen";
import ReabastecimientoPanel from "@/components/almacen/ReabastecimientoPanel";
import RecoleccionAlmacenPanel from "@/components/almacen/RecoleccionAlmacenPanel";
import KitInspeccionesPanel from "@/components/almacen/KitInspeccionesPanel";
import ScannerAlmacenPanel from "@/components/almacen/ScannerAlmacenPanel";
import HerramientasPorEtiquetaPanel from "@/components/almacen/HerramientasPorEtiquetaPanel";
import ToolRequestsTable from "@/components/ToolRequestsTable";
import ToolRequestForm from "@/components/ToolRequestForm";
import ToolUserKitPanel from "@/components/ToolUserKitPanel";
import ToolMyKitPanel from "@/components/ToolMyKitPanel";
import ToolInventoryPanel from "@/components/ToolInventoryPanel";
import s from "./almacen-portada.module.css";

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
  { key: "inventario", label: "Inventario", icon: Inventory2Outlined },
  { key: "movimientos", label: "Movimientos", icon: SwapHorizOutlined },
  { key: "scanner", label: "Escáner", icon: QrCodeScannerOutlined },
  { key: "reabastecimiento", label: "Reabastecimiento", icon: ShoppingCartOutlined },
  { key: "herramientas", label: "Herramientas", icon: HandymanOutlined },
  { key: "kits", label: "Kits", icon: BackpackOutlined },
] as const;

type Pestana = (typeof PESTANAS)[number]["key"];

const ITEMS_PESTANAS: ReadonlyArray<TabItem<Pestana>> = PESTANAS.map((p) => ({ id: p.key, label: p.label, icon: p.icon }));

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
  // Cada entrega o devolución por etiqueta vuelve a montar el mostrador de
  // recolección: su lista de «esperando a que las recojan» no escucha el socket.
  const [movimientosPorEtiqueta, setMovimientosPorEtiqueta] = useState(0);

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
      <PageHead
        eyebrow="Core · Almacén"
        title="Almacén"
        description={cfg.subtitle}
        icon={<WarehouseOutlined />}
        tabs={<Tabs ariaLabel="Secciones de almacén" value={tab} onChange={cambiarTab} items={ITEMS_PESTANAS} />}
      />

      <div className={s.cuerpo}>

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
          <div className={s.pila}>
            {gestionaHerramientas && (
              <>
                <HerramientasPorEtiquetaPanel
                  onCambio={() => setMovimientosPorEtiqueta((n) => n + 1)}
                />
                <RecoleccionAlmacenPanel key={movimientosPorEtiqueta} />
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
            <div className={s.pila}>
              <KitInspeccionesPanel />
              <ToolUserKitPanel />
            </div>
          ) : (
            <ToolMyKitPanel />
          ))}
      </div>
    </>
  );
}
