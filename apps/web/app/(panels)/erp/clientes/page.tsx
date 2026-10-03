"use client";

import Link from "next/link";
import { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import GroupsOutlinedIcon from "@mui/icons-material/GroupsOutlined";
import FilterAltOffOutlinedIcon from "@mui/icons-material/FilterAltOffOutlined";
import CheckCircleOutlineRoundedIcon from "@mui/icons-material/CheckCircleOutlineRounded";
import PauseCircleOutlineRoundedIcon from "@mui/icons-material/PauseCircleOutlineRounded";
import ReceiptLongOutlinedIcon from "@mui/icons-material/ReceiptLongOutlined";
import ChevronRightRoundedIcon from "@mui/icons-material/ChevronRightRounded";
import CloudOffOutlinedIcon from "@mui/icons-material/CloudOffOutlined";
import AddRoundedIcon from "@mui/icons-material/AddRounded";
import {
  Alert,
  Button,
  ButtonLink,
  DataTable,
  FilterChip,
  FilterChips,
  LinkButton,
  ModulePage,
  ModuleToolbar,
  PersonCell,
  SearchInput,
  Stat,
  StatRow,
  StatusCell,
  Tabs,
  type Column,
} from "@/components/base";
import { useUser } from "@/components/UserContext";
import { isCeoEquivalentEmail } from "@/lib/platform-accounts";
import { formatApiError } from "@/lib/erp-api";
import {
  canAccessClientPadron,
  CLIENT_SECTOR_META,
  clientSectorsForUser,
  type ClientSector,
} from "@/lib/client-sectors";
import {
  getClientPermissions,
  isInactiveClient,
  listSalesClients,
  NO_CLIENT_PERMISSIONS,
  type ClientPermissions,
  type SalesClient,
} from "@/lib/sales-api";
import { CLIENT_SECTOR_ICONS } from "@/components/erp/ClientSectorIcon";
import { nombreSector } from "./sectores";
import { TiposCliente } from "./_componentes/TiposCliente";
import styles from "./clientes-core.module.css";

type FiltroEstado = "TODOS" | "ACTIVOS" | "INACTIVOS" | "SIN_RFC";

function cumpleEstado(c: SalesClient, filtro: FiltroEstado): boolean {
  if (filtro === "TODOS") return true;
  if (filtro === "SIN_RFC") return !c.taxId?.trim();
  return filtro === "INACTIVOS" ? isInactiveClient(c.status) : !isInactiveClient(c.status);
}

function sectoresDe(c: SalesClient): ClientSector[] {
  return (c.sectors ?? []).map((s) => s.sector as ClientSector);
}

export default function ClientesHubPage() {
  const router = useRouter();
  const { user, token } = useUser();
  const allowedSectors = useMemo(() => clientSectorsForUser(user), [user]);
  const showOwner = isCeoEquivalentEmail(user?.email) || Boolean(user?.isSuperAdmin);

  const [pedido, setPedido] = useState<ClientSector | null>(null);
  const sector = pedido && allowedSectors.includes(pedido) ? pedido : allowedSectors[0] ?? null;

  /** La lista siempre sabe de qué sector es: al cambiar de pestaña no se mezclan filas. */
  const [datos, setDatos] = useState<{ sector: ClientSector; filas: SalesClient[] } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const qDiferida = useDeferredValue(q);
  const [estado, setEstado] = useState<FiltroEstado>("TODOS");
  const [permisos, setPermisos] = useState<ClientPermissions>(NO_CLIENT_PERMISSIONS);
  const buscador = useRef<HTMLInputElement>(null);
  const turno = useRef(0);

  useEffect(() => {
    const param = new URLSearchParams(window.location.search).get("sector");
    if (param) setPedido(param.toUpperCase() as ClientSector);
  }, []);

  // Solo quien puede agregar (jefes con personal a cargo, administración, dirección) ve «Nuevo».
  useEffect(() => {
    if (!token) return;
    let vivo = true;
    getClientPermissions(token)
      .then((p) => vivo && setPermisos(p))
      .catch(() => vivo && setPermisos(NO_CLIENT_PERMISSIONS));
    return () => {
      vivo = false;
    };
  }, [token]);

  const load = useCallback(async () => {
    if (!token || !sector) return;
    const mio = ++turno.current;
    setLoading(true);
    setError(null);
    try {
      const filas = await listSalesClients(token, { sector });
      if (mio === turno.current) setDatos({ sector, filas });
    } catch (e) {
      // Un fallo al refrescar avisa, pero no borra lo que ya estaba en pantalla.
      if (mio === turno.current) setError(formatApiError(e, "No se pudieron cargar los clientes"));
    } finally {
      if (mio === turno.current) setLoading(false);
    }
  }, [token, sector]);

  useEffect(() => {
    void load();
  }, [load]);

  // «/» busca, «n» abre el alta (fuera de campos de texto).
  const puedeAgregar = permisos.puedeAgregar;
  const slug = sector ? CLIENT_SECTOR_META[sector].slug : "";
  useEffect(() => {
    const alTeclear = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      if (el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.tagName === "SELECT" || el.isContentEditable)) return;
      if (e.key === "/") {
        e.preventDefault();
        buscador.current?.focus();
      } else if (e.key === "n" && puedeAgregar && slug && !e.ctrlKey && !e.metaKey && !e.altKey) {
        router.push(`/erp/clientes/nuevo?sector=${slug}`);
      }
    };
    window.addEventListener("keydown", alTeclear);
    return () => window.removeEventListener("keydown", alTeclear);
  }, [router, puedeAgregar, slug]);

  const items = useMemo(() => (datos && datos.sector === sector ? datos.filas : []), [datos, sector]);

  const coincide = useMemo(() => {
    const query = qDiferida.trim().toLowerCase();
    if (!query) return () => true;
    return (c: SalesClient) =>
      c.name.toLowerCase().includes(query) ||
      (c.legalName ?? "").toLowerCase().includes(query) ||
      (c.taxId ?? "").toLowerCase().includes(query) ||
      (c.billingEmail ?? "").toLowerCase().includes(query) ||
      (c.owner?.nombre ?? "").toLowerCase().includes(query);
  }, [qDiferida]);

  const { visible, conteoEstado, cifras } = useMemo(() => {
    const porTexto = items.filter(coincide);
    let activos = 0;
    let sinRfc = 0;
    for (const c of items) {
      if (!isInactiveClient(c.status)) activos += 1;
      if (!c.taxId?.trim()) sinRfc += 1;
    }
    const inactivosVista = porTexto.filter((c) => isInactiveClient(c.status)).length;
    return {
      visible: porTexto.filter((c) => cumpleEstado(c, estado)),
      conteoEstado: {
        TODOS: porTexto.length,
        ACTIVOS: porTexto.length - inactivosVista,
        INACTIVOS: inactivosVista,
        SIN_RFC: porTexto.filter((c) => !c.taxId?.trim()).length,
      },
      cifras: { total: items.length, activos, inactivos: items.length - activos, sinRfc },
    };
  }, [items, coincide, estado]);

  const columnas = useMemo<Column<SalesClient>[]>(() => {
    const cols: Column<SalesClient>[] = [
      {
        key: "cliente",
        label: "Cliente",
        render: (c) => (
          <span className={styles.celdaCliente}>
            <Link href={`/erp/clientes/${c.id}`} className={styles.nombre} onClick={(e) => e.stopPropagation()}>
              {c.name}
            </Link>
            <span className={styles.sub}>
              <span className={c.taxId ? styles.rfc : styles.sinRfc}>{c.taxId || "Sin RFC"}</span>
              {c.legalName && c.legalName !== c.name ? (
                <span className={styles.razon}>{c.legalName}</span>
              ) : c.billingEmail ? (
                <span className={styles.razon}>{c.billingEmail}</span>
              ) : null}
            </span>
          </span>
        ),
      },
      { key: "tipos", label: "Tipos", render: (c) => <TiposCliente sectores={sectoresDe(c)} size="sm" /> },
    ];
    if (showOwner) {
      cols.push({
        key: "encargado",
        label: "Encargado",
        render: (c) =>
          c.owner?.nombre ? <PersonCell name={c.owner.nombre} size={26} /> : <span className={styles.tenue}>Sin encargado</span>,
      });
    }
    cols.push({
      key: "estado",
      label: "Estado",
      render: (c) => {
        const inactivo = isInactiveClient(c.status);
        return <StatusCell label={inactivo ? "Inactivo" : "Activo"} tone={inactivo ? "neutral" : "success"} size="sm" />;
      },
    });
    return cols;
  }, [showOwner]);

  if (!canAccessClientPadron(user) || !sector) {
    return (
      <ModulePage
        title="Clientes"
        empty
        emptyState={{
          icon: <GroupsOutlinedIcon />,
          title: "Sin acceso a clientes",
          description: "Tu puesto no tiene clientes asignados. Si crees que es un error, pide acceso a Dirección.",
          tone: "neutral",
        }}
      />
    );
  }

  const meta = CLIENT_SECTOR_META[sector];
  const selectSector = (s: ClientSector) => {
    if (s === sector) return;
    setPedido(s);
    router.replace(`/erp/clientes?sector=${CLIENT_SECTOR_META[s].slug}`, { scroll: false });
  };

  const hayFiltros = Boolean(q.trim()) || estado !== "TODOS";
  const quitarFiltros = () => {
    setQ("");
    setEstado("TODOS");
  };
  const primeraCarga = loading && (!datos || datos.sector !== sector);
  const sinRegistros = !loading && items.length === 0;
  const hrefNuevo = `/erp/clientes/nuevo?sector=${meta.slug}`;
  const chip = (id: FiltroEstado, label: string, dot?: "success" | "neutral" | "warning") => (
    <FilterChip active={estado === id} count={conteoEstado[id]} dot={dot} onClick={() => setEstado(estado === id && id !== "TODOS" ? "TODOS" : id)}>
      {label}
    </FilterChip>
  );

  return (
    <ModulePage
      className={styles.pagina}
      title="Clientes"
      description={meta.help}
      icon={<GroupsOutlinedIcon />}
      primaryAction={
        puedeAgregar && !(sinRegistros && !error) ? (
          <ButtonLink variant="primary" href={hrefNuevo} iconStart={<AddRoundedIcon />} kbd="N">
            Nuevo cliente
          </ButtonLink>
        ) : null
      }
      tabs={
        allowedSectors.length > 1 ? (
          <Tabs
            ariaLabel="Sector"
            items={allowedSectors.map((s) => ({
              id: s,
              label: nombreSector(s),
              icon: CLIENT_SECTOR_ICONS[CLIENT_SECTOR_META[s].icon],
            }))}
            value={sector}
            onChange={selectSector}
          />
        ) : null
      }
      stats={
        items.length || primeraCarga ? (
          <StatRow cols={4} ariaLabel="Resumen del padrón">
            <Stat
              label="En el padrón"
              value={cifras.total}
              hint={nombreSector(sector).toLowerCase()}
              icon={<GroupsOutlinedIcon />}
              loading={primeraCarga}
            />
            <Stat
              label="Activos"
              value={cifras.activos}
              hint="con trato vigente"
              icon={<CheckCircleOutlineRoundedIcon />}
              tone="success"
              meter={cifras.total ? [{ value: cifras.activos, tone: "success" }] : undefined}
              meterMax={cifras.total || undefined}
              loading={primeraCarga}
            />
            <Stat
              label="Inactivos"
              value={cifras.inactivos}
              hint="se conservan con su historial"
              icon={<PauseCircleOutlineRoundedIcon />}
              iconTone="neutral"
              loading={primeraCarga}
            />
            <Stat
              label="Sin RFC"
              value={cifras.sinRfc}
              hint="faltan datos para facturar"
              icon={<ReceiptLongOutlinedIcon />}
              tone={cifras.sinRfc ? "warning" : "default"}
              loading={primeraCarga}
            />
          </StatRow>
        ) : null
      }
      before={
        error ? (
          <Alert tone="danger" role="alert" action={<LinkButton onClick={() => void load()}>Reintentar</LinkButton>}>
            {error}
          </Alert>
        ) : null
      }
      listLabel="Padrón de clientes"
      toolbar={
        <ModuleToolbar
          search={
            <SearchInput
              ref={buscador}
              aria-label="Buscar clientes"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Nombre, razón social, RFC o correo"
              shortcut="/"
            />
          }
          chips={
            <FilterChips ariaLabel="Filtrar por estado">
              {chip("TODOS", "Todos")}
              {chip("ACTIVOS", "Activos", "success")}
              {chip("INACTIVOS", "Inactivos", "neutral")}
              {conteoEstado.SIN_RFC || estado === "SIN_RFC" ? chip("SIN_RFC", "Sin RFC", "warning") : null}
            </FilterChips>
          }
          end={
            hayFiltros ? (
              <LinkButton onClick={quitarFiltros}>Quitar filtros</LinkButton>
            ) : items.length ? (
              <span className={styles.conteo}>{visible.length === 1 ? "1 cliente" : `${visible.length} clientes`}</span>
            ) : null
          }
        />
      }
      loading={primeraCarga}
      empty={!primeraCarga && visible.length === 0}
      emptyState={
        sinRegistros && error
          ? {
              icon: <CloudOffOutlinedIcon />,
              title: "No se pudo cargar el padrón",
              description: "Revisa tu conexión y vuelve a intentarlo con el aviso de arriba.",
              tone: "danger",
            }
          : sinRegistros
            ? {
                icon: <GroupsOutlinedIcon />,
                title: `Aún no hay ${meta.title.toLowerCase()}`,
                description: puedeAgregar
                  ? "Da de alta el primero con sus datos fiscales; después podrás sumarlo a otros sectores."
                  : "Cuando alguien de tu equipo dé de alta un cliente en este sector, aparecerá aquí.",
                action: puedeAgregar ? (
                  <ButtonLink variant="primary" href={hrefNuevo} iconStart={<AddRoundedIcon />}>
                    Crear el primero
                  </ButtonLink>
                ) : undefined,
              }
            : {
                icon: <FilterAltOffOutlinedIcon />,
                title: "Ningún cliente coincide",
                description: "Prueba con otro nombre o RFC, o quita los filtros.",
                action: <Button onClick={quitarFiltros}>Quitar filtros</Button>,
                tone: "neutral",
              }
      }
    >
      <DataTable
        flush
        className={`${styles.tabla} ${showOwner ? styles.tablaConEncargado : ""}`}
        ariaLabel="Clientes"
        columns={columnas}
        rows={visible}
        rowKey={(c) => c.id}
        loading={loading && !primeraCarga}
        onRowClick={(c) => router.push(`/erp/clientes/${c.id}`)}
        rowActionsLabel="Acciones"
        rowActions={(c) => (
          <ButtonLink
            href={`/erp/clientes/${c.id}`}
            variant="ghost"
            size="sm"
            icon
            aria-label={`Abrir la ficha de ${c.name}`}
            title="Abrir ficha"
          >
            <ChevronRightRoundedIcon fontSize="small" />
          </ButtonLink>
        )}
      />
    </ModulePage>
  );
}
