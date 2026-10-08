"use client";

/**
 * Herramientas en Core (`/erp/almacen/herramientas`). Vivía en `/ops/tools` y Core
 * la reexportaba; ahora vive aquí.
 *
 * Todo el personal pide y ve su kit; aprobar, entregar e inventariar es de quien
 * tiene `TOOLS_MANAGE` (la pantalla ya enseña la vista de gestión solo a ellos).
 */

import { useEffect, useMemo, useState } from "react";
import { usePathname } from "next/navigation";
import HandymanOutlined from "@mui/icons-material/HandymanOutlined";
import { Alert, PageHead, Tabs } from "@/components/base";
import { useUser } from "@/components/UserContext";
import { getOpsTeamSectionConfig } from "@/lib/section-views";
import { isCoreMount } from "@/lib/recursos-core";
import ToolInventoryPanel from "@/components/ToolInventoryPanel";
import ToolUserKitPanel from "@/components/ToolUserKitPanel";
import ToolMyKitPanel from "@/components/ToolMyKitPanel";
import ToolRequestsTable from "@/components/ToolRequestsTable";
import ToolRenewalsTable from "@/components/ToolRenewalsTable";
import ToolRequestForm from "@/components/ToolRequestForm";
import HerramientasPorEtiquetaPanel from "@/components/almacen/HerramientasPorEtiquetaPanel";
import BusquedaRapidaInventario from "@/components/almacen/BusquedaRapidaInventario";
import { esMismaPagina, type ResultadoBusqueda } from "@/lib/busqueda-inventario-api";
import s from "../almacen-portada.module.css";

type ManagerTab = "inventory" | "kits" | "requests" | "renewals" | "approvals";
type LoanTab = "mykit" | "myrequests";

export default function ToolsPage() {
  const { user } = useUser();
  const pathname = usePathname();
  // También se monta en Core (`/erp/almacen/herramientas`).
  const enCore = isCoreMount(pathname);
  const cfg = useMemo(() => getOpsTeamSectionConfig(user, "tools"), [user]);
  // Email helpers (vía section-views): manage ≠ OPS_MANAGER; request ≠ campo genérico.
  const canManage = cfg.viewMode === "manage" || cfg.viewMode === "manage_execute" || cfg.canApprove;
  const canRequest = cfg.canCreate;

  // `?tab=` y `?highlight=` se leen de la URL al montar (sin useSearchParams).
  const [urlTab, setUrlTab] = useState<string | null>(null);
  const [highlightId, setHighlightId] = useState<string | null>(null);
  // La búsqueda rápida trae `?herramienta=<id>&q=<nombre>`; el alta de artículo, `?nueva=1`.
  const [busquedaInventario, setBusquedaInventario] = useState("");
  const [abrirAlta, setAbrirAlta] = useState(false);
  const [vueltasInventario, setVueltasInventario] = useState(0);
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const busqueda = (params.get("q") ?? "").trim();
    const nueva = params.get("nueva") === "1";
    const alInventario = Boolean(params.get("herramienta") || busqueda || nueva);
    setBusquedaInventario(busqueda);
    setAbrirAlta(nueva);
    setUrlTab(params.get("tab") ?? (alInventario ? "inventory" : null));
    setHighlightId(params.get("highlight"));
    // El inventario lee la búsqueda y el alta al montar: se vuelve a montar con ellos.
    if (alInventario) setVueltasInventario((n) => n + 1);
  }, [pathname]);

  const [managerTab, setManagerTab] = useState<ManagerTab>("inventory");
  const [loanTab, setLoanTab] = useState<LoanTab>("mykit");
  // Christian/Iván + loan-creator: una familia de tabs a la vez.
  const [pane, setPane] = useState<"manage" | "loan">(() =>
    canManage ? "manage" : "loan",
  );

  useEffect(() => {
    const tab = urlTab;
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
  }, [highlightId, canManage, canRequest, urlTab]);

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

  /**
   * Una herramienta cae aquí mismo: quien administra la ve en su inventario, ya filtrada;
   * quien pide prestado va a «Pedir prestado».
   */
  const abrirDesdeBusqueda = (resultado: ResultadoBusqueda, href: string) => {
    if (resultado.origen !== "herramienta" || !esMismaPagina(href, pathname)) return false;
    window.history.pushState(null, "", href);
    if (canManage) {
      setPane("manage");
      setManagerTab("inventory");
      setBusquedaInventario(resultado.nombre);
      setAbrirAlta(false);
      setVueltasInventario((n) => n + 1);
    } else if (canRequest) {
      setPane("loan");
      setLoanTab("myrequests");
    }
    return true;
  };

  // Las pestañas de préstamos y kits escuchan el lector en toda la pantalla: ahí la caja no toma el foco.
  const buscadorConFoco = !(showManagePane && (managerTab === "requests" || managerTab === "kits"));

  const cambiarTab = (key: ToolsTab) => {
    // Lo que trajo la URL (búsqueda, alta abierta) vale para la primera vista, no para siempre.
    setBusquedaInventario("");
    setAbrirAlta(false);
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
      <PageHead
        eyebrow={enCore ? "Core · Recursos" : "OPS · Campo"}
        title={cfg.title}
        description={cfg.subtitle}
        icon={<HandymanOutlined />}
        tabs={
          tabs.length > 0 ? (
            <Tabs
              ariaLabel="Secciones de herramientas"
              value={tabActiva}
              onChange={cambiarTab}
              items={tabs.map((t) => ({ id: t.key, label: t.label }))}
            />
          ) : undefined
        }
      />

      <div className={s.cuerpo}>
        <BusquedaRapidaInventario
          tipoInicial="HERRAMIENTA"
          placeholder="Buscar herramienta por nombre, modelo, serie o etiqueta…"
          autoFocus={buscadorConFoco}
          onAbrir={abrirDesdeBusqueda}
        />

        {highlightId && (
          <Alert tone="info" role="status">
            Vienes de un aviso: la solicitud está resaltada en la lista.
          </Alert>
        )}

        {showManagePane && managerTab === "approvals" && (
          <ToolRequestsTable highlightId={highlightId} />
        )}
        {showManagePane && managerTab === "inventory" && (
          <ToolInventoryPanel key={vueltasInventario} busquedaInicial={busquedaInventario} abrirAlta={abrirAlta} />
        )}
        {showManagePane && managerTab === "kits" && <ToolUserKitPanel />}
        {showManagePane && managerTab === "requests" && (
          // Entregar y recibir con la etiqueta; la tabla de abajo se recarga sola por socket.
          <div className={s.pila}>
            <HerramientasPorEtiquetaPanel />
            <ToolRequestsTable highlightId={highlightId} />
          </div>
        )}
        {showManagePane && managerTab === "renewals" && <ToolRenewalsTable highlightId={highlightId} />}

        {showLoanPane && loanTab === "mykit" && <ToolMyKitPanel />}
        {showLoanPane && loanTab === "myrequests" && <ToolRequestForm />}
        {!canManage && !canRequest && <ToolMyKitPanel />}
      </div>
    </>
  );
}
