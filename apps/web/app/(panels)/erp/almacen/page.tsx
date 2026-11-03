"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import Inventory2Outlined from "@mui/icons-material/Inventory2Outlined";
import InsightsOutlined from "@mui/icons-material/InsightsOutlined";
import EventBusyOutlined from "@mui/icons-material/EventBusyOutlined";
import PaidOutlined from "@mui/icons-material/PaidOutlined";
import FactCheckOutlined from "@mui/icons-material/FactCheckOutlined";
import SwapHorizOutlined from "@mui/icons-material/SwapHorizOutlined";
import QrCodeScannerOutlined from "@mui/icons-material/QrCodeScannerOutlined";
import ShoppingCartOutlined from "@mui/icons-material/ShoppingCartOutlined";
import HandymanOutlined from "@mui/icons-material/HandymanOutlined";
import BackpackOutlined from "@mui/icons-material/BackpackOutlined";
import WarehouseOutlined from "@mui/icons-material/WarehouseOutlined";
import { PageHead, Tabs, type TabItem } from "@/components/base";
import { useUser } from "@/components/UserContext";
import { getErpInventorySectionConfig, getOpsTeamSectionConfig } from "@/lib/section-views";
import { VistaAlmacen, type WarehouseView } from "../warehouse/VistaAlmacen";
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
import BusquedaRapidaInventario from "@/components/almacen/BusquedaRapidaInventario";
import { esMismaPagina, type ResultadoBusqueda } from "@/lib/busqueda-inventario-api";
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
  { key: "dashboard", label: "Resumen", icon: InsightsOutlined },
  { key: "movimientos", label: "Movimientos", icon: SwapHorizOutlined },
  { key: "lotes", label: "Lotes y caducidad", icon: EventBusyOutlined },
  { key: "valuacion", label: "Valuación", icon: PaidOutlined },
  { key: "conteos", label: "Conteos y reservas", icon: FactCheckOutlined },
  { key: "scanner", label: "Escáner", icon: QrCodeScannerOutlined },
  { key: "reabastecimiento", label: "Reabastecimiento", icon: ShoppingCartOutlined },
  { key: "herramientas", label: "Herramientas", icon: HandymanOutlined },
  { key: "kits", label: "Kits", icon: BackpackOutlined },
] as const;

type Pestana = (typeof PESTANAS)[number]["key"];

/** Las pestañas que pinta la vista de almacén: una sola, que se queda montada al pasar entre ellas. */
const VISTAS_STOCK: readonly WarehouseView[] = ["inventario", "dashboard", "movimientos", "lotes", "valuacion", "conteos"];

function esVistaStock(p: Pestana): p is WarehouseView {
  return (VISTAS_STOCK as readonly string[]).includes(p);
}

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
  // Abrir un artículo desde la búsqueda rápida vuelve a montar el inventario, que lee
  // `?producto=` al montar (el router no lo vuelve a montar si solo cambia la query).
  const [vueltasInventario, setVueltasInventario] = useState(0);
  // Un solo buscador: lo que se escribe arriba también filtra la tabla de inventario.
  const [textoBusqueda, setTextoBusqueda] = useState("");
  const [vueltasBusqueda, setVueltasBusqueda] = useState(0);
  const [filasInventario, setFilasInventario] = useState(0);
  // Las acciones de la vista van junto al título, como en las demás pantallas.
  const [slotAcciones, setSlotAcciones] = useState<HTMLDivElement | null>(null);

  const limpiarBusqueda = useCallback(() => {
    setTextoBusqueda("");
    setVueltasBusqueda((n) => n + 1);
  }, []);

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

  /** Un artículo cae aquí mismo (`/erp/almacen?producto=`): inventario filtrado a ese producto. */
  const abrirDesdeBusqueda = useCallback(
    (resultado: ResultadoBusqueda, href: string) => {
      if (resultado.origen !== "articulo" || !esMismaPagina(href, pathname)) return false;
      window.history.pushState(null, "", href);
      setTab("inventario");
      setVueltasInventario((n) => n + 1);
      // El artículo ya quedó filtrado; un código escaneado no está en la tabla y la dejaría vacía.
      limpiarBusqueda();
      return true;
    },
    [pathname, limpiarBusqueda],
  );

  const vistaStock = esVistaStock(tab) ? tab : null;
  const embebida = useMemo(
    () => ({
      views: VISTAS_STOCK,
      vista: vistaStock ?? undefined,
      busqueda: textoBusqueda,
      onLimpiarBusqueda: limpiarBusqueda,
      onFilasBuscadas: setFilasInventario,
      slotAcciones,
    }),
    [vistaStock, textoBusqueda, limpiarBusqueda, slotAcciones],
  );

  return (
    <>
      <PageHead
        title="Almacén"
        description={cfg.subtitle}
        icon={<WarehouseOutlined />}
        actions={vistaStock ? <div ref={setSlotAcciones} className={s.acciones} /> : undefined}
        tabs={<Tabs ariaLabel="Secciones de almacén" value={tab} onChange={cambiarTab} items={ITEMS_PESTANAS} />}
      />

      <div className={s.cuerpo}>

        {/*
          Búsqueda rápida de todo lo que hay (herramientas, equipo, consumibles, por medida).
          En Escáner no va: ahí el lector manda, y una caja con el foco le quitaría las lecturas.
          Por lo mismo solo toma el foco en las pestañas que no escuchan el lector.
        */}
        {tab !== "scanner" && (
          <BusquedaRapidaInventario
            key={vueltasBusqueda}
            tipoInicial="TODOS"
            qInicial={textoBusqueda}
            autoFocus={tab === "inventario" || tab === "movimientos" || tab === "reabastecimiento"}
            onAbrir={abrirDesdeBusqueda}
            onTexto={setTextoBusqueda}
            tablaDebajo={tab === "inventario" && filasInventario > 0}
          />
        )}

        {/* Inventario y sus vistas hermanas: la pantalla de almacén, sin su encabezado. */}
        {vistaStock && <VistaAlmacen key={vueltasInventario} embedded={embebida} />}

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
