"use client";

import Link from "next/link";
import { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import GroupsOutlinedIcon from "@mui/icons-material/GroupsOutlined";
import FilterAltOffOutlinedIcon from "@mui/icons-material/FilterAltOffOutlined";
import {
  Alert,
  Badge,
  Button,
  ButtonLink,
  EmptyState,
  Kbd,
  LinkButton,
  PageHead,
  SearchInput,
  Segmented,
  SkeletonRows,
  Stat,
  StatRow,
  Tabs,
  Toolbar,
  tabla,
} from "@/components/base";
import { useUser } from "@/components/UserContext";
import { isCeoEquivalentEmail } from "@/lib/platform-accounts";
import { formatApiError } from "@/lib/erp-api";
import {
  canSeeClientesModule,
  CLIENT_SECTOR_META,
  clientSectorsForEmail,
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
import styles from "./clientes-core.module.css";

type FiltroEstado = "TODOS" | "ACTIVOS" | "INACTIVOS";

function cumpleEstado(c: SalesClient, filtro: FiltroEstado): boolean {
  if (filtro === "TODOS") return true;
  return filtro === "INACTIVOS" ? isInactiveClient(c.status) : !isInactiveClient(c.status);
}

function encargadoCorto(c: SalesClient): string {
  return c.owner?.nombre?.split(/\s+/).slice(0, 2).join(" ") || "Sin encargado";
}

export default function ClientesHubPage() {
  const router = useRouter();
  const { user, token } = useUser();
  const allowedSectors = useMemo(() => clientSectorsForEmail(user?.email), [user?.email]);
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
      conteoEstado: { TODOS: porTexto.length, ACTIVOS: porTexto.length - inactivosVista, INACTIVOS: inactivosVista },
      cifras: { total: items.length, activos, inactivos: items.length - activos, sinRfc },
    };
  }, [items, coincide, estado]);

  if (!canSeeClientesModule(user?.email) || !sector) {
    return (
      <div className={styles.wrap}>
        <EmptyState
          icon={<GroupsOutlinedIcon />}
          title="Sin acceso a clientes"
          description="Tu puesto no tiene clientes asignados. Si crees que es un error, pide acceso a Dirección."
        />
      </div>
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

  return (
    <div className={styles.wrap}>
      <PageHead
        title="Clientes"
        description={meta.help}
        actions={
          puedeAgregar && !(sinRegistros && !error) ? (
            <ButtonLink variant="primary" href={hrefNuevo}>
              Nuevo cliente <Kbd>N</Kbd>
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
      />

      {items.length ? (
        <StatRow cols={4}>
          <Stat label="En el padrón" value={cifras.total} hint={nombreSector(sector).toLowerCase()} />
          <Stat label="Activos" value={cifras.activos} hint="con trato vigente" />
          <Stat label="Inactivos" value={cifras.inactivos} hint="se conservan con su historial" />
          <Stat
            label="Sin RFC"
            value={cifras.sinRfc}
            hint="faltan datos para facturar"
            tone={cifras.sinRfc ? "warning" : "default"}
          />
        </StatRow>
      ) : null}

      {error ? (
        <Alert tone="danger" role="alert" action={<LinkButton onClick={() => void load()}>Reintentar</LinkButton>}>
          {error}
        </Alert>
      ) : null}

      <div className={tabla.marco}>
        <div className={tabla.barra}>
          <Toolbar
            end={
              hayFiltros ? (
                <LinkButton onClick={quitarFiltros}>Quitar filtros</LinkButton>
              ) : items.length ? (
                <span className={styles.conteo}>
                  {visible.length === 1 ? "1 cliente" : `${visible.length} clientes`}
                </span>
              ) : null
            }
          >
            <label htmlFor="buscar-clientes" className={styles.soloLector}>
              Buscar clientes
            </label>
            <SearchInput
              id="buscar-clientes"
              ref={buscador}
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Nombre, razón social, RFC o correo"
              shortcut="/"
            />
            <Segmented
              ariaLabel="Filtrar por estado"
              items={[
                { id: "TODOS" as const, label: "Todos", count: conteoEstado.TODOS },
                { id: "ACTIVOS" as const, label: "Activos", count: conteoEstado.ACTIVOS },
                { id: "INACTIVOS" as const, label: "Inactivos", count: conteoEstado.INACTIVOS },
              ]}
              value={estado}
              onChange={setEstado}
            />
          </Toolbar>
        </div>

        {primeraCarga ? (
          <SkeletonRows rows={6} label="Cargando clientes" />
        ) : sinRegistros && !error ? (
          <EmptyState
            icon={<GroupsOutlinedIcon />}
            title={`Aún no hay ${meta.title.toLowerCase()}`}
            description={
              puedeAgregar
                ? "Da de alta el primero con sus datos fiscales; después podrás sumarlo a otros sectores."
                : "Cuando alguien de tu equipo dé de alta un cliente en este sector, aparecerá aquí."
            }
            action={
              puedeAgregar ? (
                <ButtonLink variant="primary" href={hrefNuevo}>
                  Crear el primero
                </ButtonLink>
              ) : null
            }
          />
        ) : visible.length ? (
          <nav className={styles.list} aria-label="Clientes">
            <div className={`${tabla.cabeza} ${styles.rejilla} ${showOwner ? styles.conEncargado : ""}`} aria-hidden>
              <span>Cliente</span>
              <span>RFC</span>
              <span>Sectores</span>
              {showOwner ? <span>Encargado</span> : null}
              <span>Estado</span>
            </div>
            {visible.map((c) => {
              const inactivo = isInactiveClient(c.status);
              return (
                <Link
                  key={c.id}
                  href={`/erp/clientes/${c.id}`}
                  className={`${tabla.fila} ${styles.rejilla} ${styles.row} ${showOwner ? styles.conEncargado : ""}`}
                >
                  <span className={`${tabla.celda} ${styles.cCliente}`}>
                    <span className={tabla.fuerte}>{c.name}</span>
                    <span className={tabla.tenue}>{c.legalName || c.billingEmail || "Sin razón social"}</span>
                  </span>
                  <span className={`${styles.cRfc} ${c.taxId ? styles.rfc : tabla.tenue}`}>{c.taxId || "Sin RFC"}</span>
                  <span className={`${styles.sectores} ${styles.cSectores}`}>
                    {(c.sectors ?? []).map((s) => (
                      <Badge key={s.id} tone="outline">
                        {nombreSector(s.sector as ClientSector)}
                      </Badge>
                    ))}
                  </span>
                  {showOwner ? (
                    <span className={`${tabla.tenue} ${styles.cEncargado}`}>{encargadoCorto(c)}</span>
                  ) : null}
                  <span className={styles.cEstado}>
                    <Badge tone={inactivo ? "neutral" : "success"} dot>
                      {inactivo ? "Inactivo" : "Activo"}
                    </Badge>
                  </span>
                </Link>
              );
            })}
          </nav>
        ) : items.length ? (
          <EmptyState
            icon={<FilterAltOffOutlinedIcon />}
            title="Ningún cliente coincide"
            description="Prueba con otro nombre o RFC, o quita los filtros."
            action={<Button onClick={quitarFiltros}>Quitar filtros</Button>}
          />
        ) : null}
      </div>
    </div>
  );
}
