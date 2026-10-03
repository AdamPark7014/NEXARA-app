"use client";

import Link from "next/link";
import { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import AccountTreeOutlinedIcon from "@mui/icons-material/AccountTreeOutlined";
import FilterAltOffOutlinedIcon from "@mui/icons-material/FilterAltOffOutlined";
import GroupsOutlinedIcon from "@mui/icons-material/GroupsOutlined";
import AddRoundedIcon from "@mui/icons-material/AddRounded";
import PlayCircleOutlineRoundedIcon from "@mui/icons-material/PlayCircleOutlineRounded";
import EventOutlinedIcon from "@mui/icons-material/EventOutlined";
import ReportProblemOutlinedIcon from "@mui/icons-material/ReportProblemOutlined";
import TaskAltRoundedIcon from "@mui/icons-material/TaskAltRounded";
import ChevronRightRoundedIcon from "@mui/icons-material/ChevronRightRounded";
import CloudOffOutlinedIcon from "@mui/icons-material/CloudOffOutlined";
import BusinessOutlinedIcon from "@mui/icons-material/BusinessOutlined";
import {
  Alert,
  Badge,
  Button,
  ButtonLink,
  DataTable,
  FilterChip,
  FilterChips,
  LinkButton,
  ModulePage,
  ModuleToolbar,
  PersonCell,
  ProgressCell,
  SearchInput,
  Select,
  Stat,
  StatRow,
  StatusBadge,
  Tabs,
  WhenCell,
  type Column,
  type Tone,
} from "@/components/base";
import { useUser } from "@/components/UserContext";
import { canAccessClientPadron } from "@/lib/client-sectors";
import { formatApiError } from "@/lib/erp-api";
import { isInactiveClient, listSalesClients, type SalesClient } from "@/lib/sales-api";
import {
  ESTADOS_PROYECTO,
  ESTADO_PROYECTO_LABEL,
  ESTADO_TONO,
  SALUD_TONO,
  formatoFecha,
  listarProyectos,
  type EstadoProyecto,
  type ProyectoFila,
} from "@/lib/proyectos-api";
import { hitoVencido, hoyISO } from "@/lib/proyecto-plan";
import { getServiceProjectTypeLabel } from "@/lib/service-project-types";
import { toneDe } from "./_componentes/tono";
import styles from "./lista.module.css";

/** Filtros de salud: «En riesgo» es la bandera calculada (incluye los retrasados). */
const FILTROS_SALUD = [
  { valor: "", etiqueta: "Todas" },
  { valor: "RIESGO", etiqueta: "En riesgo" },
  { valor: "RETRASADO", etiqueta: "Retrasados" },
  { valor: "EN_TIEMPO", etiqueta: "En tiempo" },
  { valor: "PLANEADO", etiqueta: "Por arrancar" },
  { valor: "SIN_PLAN", etiqueta: "Sin fecha de fin" },
] as const;

type FiltroSalud = (typeof FILTROS_SALUD)[number]["valor"];

const PUNTO_SALUD: Partial<Record<FiltroSalud, Tone>> = {
  RIESGO: "warning",
  RETRASADO: "danger",
  EN_TIEMPO: "success",
  PLANEADO: "info",
};

function cumpleSalud(p: ProyectoFila, filtro: FiltroSalud): boolean {
  if (!filtro) return true;
  if (filtro === "RIESGO") return p.resumen.enRiesgo;
  return p.resumen.salud === filtro;
}

function plazo(p: ProyectoFila): string {
  const r = p.resumen;
  if (r.salud === "TERMINADO") return r.diasDeRetraso > 0 ? `Entregado con ${r.diasDeRetraso} días de retraso` : "Entregado a tiempo";
  if (r.salud === "CANCELADO") return "Cancelado";
  if (r.diasDeRetraso > 0) return `${r.diasDeRetraso} día${r.diasDeRetraso === 1 ? "" : "s"} de retraso`;
  if (r.diasRestantes !== null) return r.diasRestantes === 0 ? "Vence hoy" : `Faltan ${r.diasRestantes} días`;
  return p.endDate ? "" : "Sin fecha de fin";
}

/** Color del punto de la fecha: rojo si va tarde, ámbar en riesgo, verde a tiempo. */
function tonoPlazo(p: ProyectoFila): Tone {
  const r = p.resumen;
  if (r.salud === "CANCELADO") return "neutral";
  if (r.salud === "TERMINADO") return r.diasDeRetraso > 0 ? "warning" : "success";
  if (r.diasDeRetraso > 0) return "danger";
  if (r.enRiesgo) return "warning";
  if (r.salud === "EN_TIEMPO") return "success";
  return "neutral";
}

/** La lista de proyectos, o los clientes de proyecto con lo que cada uno tiene abierto. */
type Vista = "proyectos" | "clientes";

/** Proyectos que siguen vivos: ni terminados ni cancelados. */
function esVigente(p: ProyectoFila): boolean {
  return p.status !== "COMPLETED" && p.status !== "CANCELLED";
}

function origenAvance(origen: ProyectoFila["resumen"]["avance"]["origen"]): string {
  if (origen === "actividades") return "según actividades";
  if (origen === "hitos") return "según etapas";
  return "sin datos todavía";
}

export default function ProyectosPage() {
  const { user, token } = useUser();
  const router = useRouter();
  const hoy = useMemo(() => hoyISO(), []);

  const [items, setItems] = useState<ProyectoFila[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const qDiferida = useDeferredValue(q);
  const [estado, setEstado] = useState<EstadoProyecto | "">("");
  const [salud, setSalud] = useState<FiltroSalud>("");
  const [responsable, setResponsable] = useState("");
  /** Filtro por cliente: el id del cliente de operación, que es al que se liga el proyecto. */
  const [cliente, setCliente] = useState("");
  const [vista, setVista] = useState<Vista>("proyectos");
  /** Clientes de proyecto del padrón. `null`: aún no llegan, o este puesto no los puede listar. */
  const [clientes, setClientes] = useState<SalesClient[] | null>(null);
  const buscador = useRef<HTMLInputElement>(null);

  // Enlaces del tablero: /erp/proyectos?estado=ACTIVE&salud=RIESGO.
  useEffect(() => {
    const qs = new URLSearchParams(window.location.search);
    const e = String(qs.get("estado") || "").toUpperCase();
    const s = String(qs.get("salud") || "").toUpperCase();
    if ((ESTADOS_PROYECTO as readonly string[]).includes(e)) setEstado(e as EstadoProyecto);
    if (FILTROS_SALUD.some((f) => f.valor === s)) setSalud(s as FiltroSalud);
    // Desde la ficha de un cliente: /erp/proyectos?cliente=<id de operación>.
    if (/^\d+$/.test(qs.get("cliente") || "")) setCliente(String(qs.get("cliente")));
    if (qs.get("vista") === "clientes") setVista("clientes");
  }, []);

  const cargar = useCallback(async () => {
    if (!token) return;
    setCargando(true);
    setError(null);
    try {
      // Se trae todo (cancelados incluidos) y se filtra aquí: son decenas, no miles.
      setItems(await listarProyectos(token, { incluirCancelados: true }));
    } catch (e) {
      // Un fallo al refrescar avisa, pero no borra lo que ya estaba en pantalla.
      setError(formatApiError(e, "No se pudieron cargar los proyectos"));
    } finally {
      setCargando(false);
    }
  }, [token]);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  // Los clientes de proyecto salen del mismo padrón que Clientes: los que se dieron de alta
  // ahí, los del alta rápida de una actividad y los que ya tienen un proyecto. Si este puesto
  // no los puede listar, la página queda como la lista de proyectos de siempre.
  useEffect(() => {
    if (!token) return;
    let vivo = true;
    listSalesClients(token, { sector: "PROYECTO" })
      .then((filas) => {
        if (!vivo) return;
        setClientes(
          filas
            .filter((c) => c && typeof c.name === "string")
            .sort((a, b) => a.name.localeCompare(b.name, "es")),
        );
      })
      .catch(() => vivo && setClientes(null));
    return () => {
      vivo = false;
    };
  }, [token]);

  // «/» busca, «n» abre el alta (fuera de campos de texto).
  useEffect(() => {
    const alTeclear = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      if (el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.tagName === "SELECT" || el.isContentEditable)) return;
      if (e.key === "/") {
        e.preventDefault();
        buscador.current?.focus();
      } else if (e.key === "n" && !e.ctrlKey && !e.metaKey && !e.altKey) {
        router.push("/erp/proyectos/nuevo");
      }
    };
    window.addEventListener("keydown", alTeclear);
    return () => window.removeEventListener("keydown", alTeclear);
  }, [router]);

  const responsables = useMemo(() => {
    const porId = new Map<number, string>();
    for (const p of items) if (p.responsable) porId.set(p.responsable.id, p.responsable.nombre);
    return [...porId.entries()].sort((a, b) => a[1].localeCompare(b[1], "es"));
  }, [items]);

  /** Clientes que ya tienen proyecto, para el filtro (aunque el padrón no se pueda listar). */
  const clientesConProyecto = useMemo(() => {
    const porId = new Map<number, string>();
    for (const p of items) if (p.client) porId.set(p.client.id, p.client.name);
    return [...porId.entries()].sort((a, b) => a[1].localeCompare(b[1], "es"));
  }, [items]);

  /** Proyectos de cada cliente, por el id del cliente de operación. */
  const proyectosPorCliente = useMemo(() => {
    const porId = new Map<number, ProyectoFila[]>();
    for (const p of items) {
      const id = p.client?.id ?? p.clientId;
      const lista = porId.get(id);
      if (lista) lista.push(p);
      else porId.set(id, [p]);
    }
    return porId;
  }, [items]);

  const clientesVisibles = useMemo(() => {
    const texto = qDiferida.trim().toLowerCase();
    if (!clientes) return [];
    if (!texto) return clientes;
    return clientes.filter((c) =>
      [c.name, c.legalName, c.taxId].some((v) => (v ?? "").toLowerCase().includes(texto)),
    );
  }, [clientes, qDiferida]);

  /** Filtro de texto, responsable y cliente: la base de los conteos de los chips. */
  const porTexto = useMemo(() => {
    const texto = qDiferida.trim().toLowerCase();
    return items.filter((p) => {
      if (responsable && String(p.responsable?.id ?? "") !== responsable) return false;
      if (cliente && String(p.client?.id ?? p.clientId) !== cliente) return false;
      if (!texto) return true;
      return [
        p.title,
        p.client?.name,
        p.responsable?.nombre,
        p.description,
        p.scopeSummary,
        p.cotizacion?.quoteNumber,
      ].some((v) => (v ?? "").toLowerCase().includes(texto));
    });
  }, [items, qDiferida, responsable, cliente]);

  const visibles = useMemo(
    () => porTexto.filter((p) => (estado ? p.status === estado : p.status !== "CANCELLED") && cumpleSalud(p, salud)),
    [porTexto, estado, salud],
  );

  const conteos = useMemo(() => {
    const porEstado: Record<string, number> = { "": 0 };
    const porSalud: Record<string, number> = {};
    for (const p of porTexto) {
      porEstado[p.status] = (porEstado[p.status] ?? 0) + 1;
      if (p.status !== "CANCELLED") porEstado[""] += 1;
      const cuenta = estado ? p.status === estado : p.status !== "CANCELLED";
      if (!cuenta) continue;
      porSalud[""] = (porSalud[""] ?? 0) + 1;
      for (const f of FILTROS_SALUD) if (f.valor && cumpleSalud(p, f.valor)) porSalud[f.valor] = (porSalud[f.valor] ?? 0) + 1;
    }
    return { porEstado, porSalud };
  }, [porTexto, estado]);

  /** Cartera completa (sin filtros): lo que se trabaja, lo que falta arrancar, lo atrasado y lo cerrado. */
  const cifras = useMemo(() => {
    let enCurso = 0;
    let porIniciar = 0;
    let atrasados = 0;
    let cerrados = 0;
    let enRiesgo = 0;
    for (const p of items) {
      if (p.status === "ACTIVE") enCurso += 1;
      if (p.status === "PLANNED") porIniciar += 1;
      if (p.status === "COMPLETED") cerrados += 1;
      if (p.resumen.salud === "RETRASADO") atrasados += 1;
      if (p.resumen.enRiesgo && p.resumen.salud !== "RETRASADO") enRiesgo += 1;
    }
    return { enCurso, porIniciar, atrasados, cerrados, enRiesgo };
  }, [items]);

  const hayFiltros = Boolean(q.trim() || estado || salud || responsable || cliente);
  const quitarFiltros = () => {
    setQ("");
    setEstado("");
    setSalud("");
    setResponsable("");
    setCliente("");
  };
  const primeraCarga = cargando && items.length === 0;
  const sinRegistros = !cargando && items.length === 0;
  const puedeAbrirFicha = canAccessClientPadron(user);

  const cambiarVista = (v: Vista) => {
    if (v === vista) return;
    setVista(v);
    router.replace(v === "clientes" ? "/erp/proyectos?vista=clientes" : "/erp/proyectos", { scroll: false });
  };

  /** «Ver proyectos» de un cliente: la lista de siempre, ya filtrada por él. */
  const verProyectosDe = (serviceClientId: number) => {
    setQ("");
    setEstado("");
    setSalud("");
    setResponsable("");
    setCliente(String(serviceClientId));
    setVista("proyectos");
    router.replace(`/erp/proyectos?cliente=${serviceClientId}`, { scroll: false });
  };

  /** Una cifra de la franja también filtra: se vuelve a pulsar para soltarla. */
  const filtrarEstado = (e: EstadoProyecto) => {
    setVista("proyectos");
    setSalud("");
    setEstado(estado === e ? "" : e);
  };

  const columnas: Column<ProyectoFila>[] = [
    {
      key: "proyecto",
      label: "Proyecto",
      render: (p) => (
        <span className={styles.celdaProyecto}>
          <Link href={`/erp/proyectos/${p.id}`} className={styles.titulo} onClick={(e) => e.stopPropagation()}>
            {p.title}
          </Link>
          <span className={`${styles.sub} ${styles.soloTelefono}`}>{p.client?.name ?? "Sin cliente"}</span>
          <span className={styles.sub}>{getServiceProjectTypeLabel(p.projectType)}</span>
        </span>
      ),
    },
    {
      key: "cliente",
      label: "Cliente",
      render: (p) => (
        <span className={styles.cliente}>
          <span className={styles.clienteNombre}>{p.client?.name ?? "Sin cliente"}</span>
          {p.cotizacion?.quoteNumber ? <span className={styles.sub}>Cotización {p.cotizacion.quoteNumber}</span> : null}
        </span>
      ),
    },
    {
      key: "responsable",
      label: "Responsable",
      render: (p) =>
        p.responsable?.nombre ? (
          <PersonCell name={p.responsable.nombre} size={26} subtitle={`${p.equipoCount} en equipo`} />
        ) : (
          <span className={styles.tenue}>Sin asignar</span>
        ),
    },
    {
      key: "avance",
      label: "Avance",
      render: (p) => {
        const avance = p.resumen.avance.porcentaje;
        return (
          <span className={styles.avance}>
            {avance === null ? (
              <span className={styles.tenue}>Sin datos de avance</span>
            ) : (
              <ProgressCell value={avance} max={100} label={`${avance} %`} width={128} />
            )}
            <span className={styles.sub}>{origenAvance(p.resumen.avance.origen)}</span>
          </span>
        );
      },
    },
    {
      key: "fechas",
      label: "Fechas",
      render: (p) => {
        const textoPlazo = plazo(p);
        return (
          <WhenCell
            time={`${formatoFecha(p.startDate)} → ${p.endDate ? formatoFecha(p.endDate) : "sin fin"}`}
            hint={textoPlazo || undefined}
            tone={tonoPlazo(p)}
          />
        );
      },
    },
    {
      key: "estado",
      label: "Estado",
      render: (p) => {
        const siguiente = p.proximoHito;
        const siguienteVencido = siguiente ? hitoVencido(siguiente, hoy) : false;
        return (
          <span className={styles.estado}>
            <span className={styles.insignias}>
              <StatusBadge
                size="sm"
                label={ESTADO_PROYECTO_LABEL[p.status] ?? "Sin estado"}
                tone={toneDe(ESTADO_TONO[p.status])}
              />
              {/* «Planeado · Planeado» no dice nada: el semáforo solo sale si agrega algo. */}
              {p.resumen.etiqueta !== ESTADO_PROYECTO_LABEL[p.status] ? (
                <Badge size="sm" tone={toneDe(SALUD_TONO[p.resumen.salud])} title={p.resumen.motivo}>
                  {p.resumen.etiqueta}
                </Badge>
              ) : null}
            </span>
            <span className={`${styles.sub} ${siguienteVencido ? styles.vencido : ""}`}>
              {siguiente
                ? `Sigue: ${siguiente.name}${siguiente.plannedDate ? ` · ${formatoFecha(siguiente.plannedDate, false)}` : ""}${siguienteVencido ? " (vencida)" : ""}`
                : p.hitosCount > 0
                  ? "Todas las etapas cumplidas"
                  : "Sin cronograma"}
            </span>
          </span>
        );
      },
    },
  ];

  const tabs = clientes ? (
    <Tabs
      ariaLabel="Vista"
      items={[
        { id: "proyectos" as const, label: "Proyectos", icon: AccountTreeOutlinedIcon, count: items.length },
        { id: "clientes" as const, label: "Clientes de proyecto", icon: GroupsOutlinedIcon, count: clientes.length },
      ]}
      value={vista}
      onChange={cambiarVista}
    />
  ) : null;

  const encabezado = {
    className: styles.pagina,
    title: "Proyectos",
    description:
      "Fechas planeadas y reales, cronograma por etapas, alcance, equipo y documentos. El avance y el semáforo se calculan solos con las actividades y las fechas.",
    icon: <AccountTreeOutlinedIcon />,
    primaryAction:
      sinRegistros && !error ? null : (
        <ButtonLink variant="primary" href="/erp/proyectos/nuevo" iconStart={<AddRoundedIcon />} kbd="N">
          Nuevo proyecto
        </ButtonLink>
      ),
    tabs,
    before: error ? (
      <Alert tone="danger" role="alert" action={<LinkButton onClick={() => void cargar()}>Reintentar</LinkButton>}>
        {error}
      </Alert>
    ) : null,
  };

  if (vista === "clientes" && clientes) {
    return (
      <ModulePage
        {...encabezado}
        listLabel="Clientes de proyecto"
        toolbar={
          <ModuleToolbar
            search={
              <SearchInput
                ref={buscador}
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Cliente, razón social o RFC"
                aria-label="Buscar clientes de proyecto"
                shortcut="/"
              />
            }
            end={
              <span className={styles.tenue}>
                {clientesVisibles.length === 1 ? "1 cliente" : `${clientesVisibles.length} clientes`}
              </span>
            }
          />
        }
        empty={clientesVisibles.length === 0}
        emptyState={
          clientes.length === 0
            ? {
                icon: <GroupsOutlinedIcon />,
                title: "Aún no hay clientes de proyecto",
                description:
                  "Aparecen aquí los que se dan de alta en Clientes como «Proyecto», los del alta rápida de una actividad y cualquier cliente al que se le abra un proyecto.",
              }
            : {
                icon: <FilterAltOffOutlinedIcon />,
                title: "Ningún cliente coincide",
                action: <Button onClick={() => setQ("")}>Quitar búsqueda</Button>,
                tone: "neutral",
              }
        }
      >
        <ul aria-label="Clientes de proyecto" className={styles.clientes}>
          {clientesVisibles.map((c) => {
            const suyos = (c.serviceClientId ? proyectosPorCliente.get(c.serviceClientId) : undefined) ?? [];
            const vigentes = suyos.filter(esVigente);
            const reciente = vigentes[0] ?? suyos[0];
            const sinDatos = !c.legalName?.trim() && !c.taxId?.trim();
            const inactivo = isInactiveClient(c.status);
            return (
              <li key={c.id} className={styles.tarjetaCliente}>
                <div className={styles.tarjetaCabeza}>
                  <span className={styles.tarjetaIco} aria-hidden="true">
                    <BusinessOutlinedIcon fontSize="inherit" />
                  </span>
                  <span className={styles.tarjetaTexto}>
                    <span className={styles.tarjetaNombre}>{c.name}</span>
                    <span className={`${styles.sub} ${!inactivo && sinDatos ? styles.alerta : ""}`}>
                      {inactivo
                        ? "Inactivo"
                        : sinDatos
                          ? "Alta rápida: faltan sus datos fiscales"
                          : c.legalName && c.legalName !== c.name
                            ? c.legalName
                            : c.taxId || "Sin razón social"}
                    </span>
                  </span>
                </div>
                <div className={styles.tarjetaCifras}>
                  {suyos.length ? (
                    <>
                      <span className={styles.tarjetaCifra}>{vigentes.length === 1 ? "1 vigente" : `${vigentes.length} vigentes`}</span>
                      <span>{suyos.length} en total</span>
                    </>
                  ) : (
                    <span>Sin proyectos todavía</span>
                  )}
                </div>
                {reciente ? (
                  <div className={styles.reciente}>
                    <span className={styles.recienteEtiqueta}>Lo más reciente</span>
                    <Link href={`/erp/proyectos/${reciente.id}`} className={styles.recienteEnlace}>
                      {reciente.title}
                    </Link>
                    <span className={styles.sub}>
                      {ESTADO_PROYECTO_LABEL[reciente.status] ?? "Sin estado"}
                      {reciente.endDate ? ` · fin ${formatoFecha(reciente.endDate)}` : ""}
                    </span>
                  </div>
                ) : (
                  <span>
                    <Badge tone="outline">Por arrancar</Badge>
                  </span>
                )}
                <div className={styles.tarjetaAcciones}>
                  {suyos.length && c.serviceClientId ? (
                    <Button size="sm" variant="ghost" onClick={() => verProyectosDe(c.serviceClientId!)}>
                      Ver proyectos
                    </Button>
                  ) : null}
                  {puedeAbrirFicha ? (
                    <ButtonLink size="sm" variant="ghost" href={`/erp/clientes/${c.id}#proyectos`}>
                      Ficha
                    </ButtonLink>
                  ) : null}
                  <ButtonLink size="sm" href={`/erp/proyectos/nuevo?clienteId=${c.id}`} iconStart={<AddRoundedIcon />}>
                    Nuevo proyecto
                  </ButtonLink>
                </div>
              </li>
            );
          })}
        </ul>
      </ModulePage>
    );
  }

  return (
    <ModulePage
      {...encabezado}
      stats={
        items.length || primeraCarga ? (
          <StatRow cols={4} ariaLabel="Cartera de proyectos">
            <Stat
              label="En curso"
              value={cifras.enCurso}
              hint={cifras.enRiesgo ? `${cifras.enRiesgo} en riesgo` : "trabajándose hoy"}
              icon={<PlayCircleOutlineRoundedIcon />}
              tone="brand"
              onClick={() => filtrarEstado("ACTIVE")}
              pressed={estado === "ACTIVE"}
              loading={primeraCarga}
            />
            <Stat
              label="Por iniciar"
              value={cifras.porIniciar}
              hint="planeados, sin arrancar"
              icon={<EventOutlinedIcon />}
              iconTone="info"
              onClick={() => filtrarEstado("PLANNED")}
              pressed={estado === "PLANNED"}
              loading={primeraCarga}
            />
            <Stat
              label="Atrasados"
              value={cifras.atrasados}
              hint="pasaron su fecha de fin"
              icon={<ReportProblemOutlinedIcon />}
              tone={cifras.atrasados ? "danger" : "default"}
              onClick={() => {
                setEstado("");
                setSalud(salud === "RETRASADO" ? "" : "RETRASADO");
              }}
              pressed={salud === "RETRASADO"}
              loading={primeraCarga}
            />
            <Stat
              label="Cerrados"
              value={cifras.cerrados}
              hint="entregados"
              icon={<TaskAltRoundedIcon />}
              tone="success"
              onClick={() => filtrarEstado("COMPLETED")}
              pressed={estado === "COMPLETED"}
              loading={primeraCarga}
            />
          </StatRow>
        ) : null
      }
      listLabel="Proyectos"
      toolbar={
        <>
          <ModuleToolbar
            search={
              <SearchInput
                ref={buscador}
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Proyecto, cliente, responsable o folio"
                aria-label="Buscar proyectos"
                shortcut="/"
              />
            }
            chips={
              <FilterChips ariaLabel="Filtrar por estado">
                <FilterChip active={estado === ""} count={conteos.porEstado[""] ?? 0} title="Todo menos los cancelados" onClick={() => setEstado("")}>
                  Vigentes
                </FilterChip>
                {ESTADOS_PROYECTO.map((e) => (
                  <FilterChip
                    key={e}
                    active={estado === e}
                    count={conteos.porEstado[e] ?? 0}
                    dot={toneDe(ESTADO_TONO[e])}
                    onClick={() => setEstado(estado === e ? "" : e)}
                  >
                    {ESTADO_PROYECTO_LABEL[e]}
                  </FilterChip>
                ))}
              </FilterChips>
            }
            end={hayFiltros ? <LinkButton onClick={quitarFiltros}>Quitar filtros</LinkButton> : null}
          />
          <div className={styles.subbarra}>
            <span className={styles.subbarraEtiqueta} aria-hidden="true">
              Semáforo
            </span>
            <FilterChips ariaLabel="Filtrar por semáforo">
              {FILTROS_SALUD.map((f) => (
                <FilterChip
                  key={f.valor || "todas"}
                  active={salud === f.valor}
                  count={f.valor ? conteos.porSalud[f.valor] ?? 0 : undefined}
                  dot={PUNTO_SALUD[f.valor]}
                  title={f.valor === "RIESGO" ? "Incluye a los retrasados" : undefined}
                  onClick={() => setSalud(salud === f.valor ? "" : f.valor)}
                >
                  {f.etiqueta}
                </FilterChip>
              ))}
            </FilterChips>
            <div className={styles.selects}>
              <Select
                aria-label="Responsable"
                controlSize="sm"
                wrapperClassName={styles.select}
                value={responsable}
                onChange={(e) => setResponsable(e.target.value)}
              >
                <option value="">Todos los responsables</option>
                {user?.id && responsables.some(([id]) => id === user.id) ? <option value={String(user.id)}>Yo</option> : null}
                {responsables
                  .filter(([id]) => id !== user?.id)
                  .map(([id, nombre]) => (
                    <option key={id} value={String(id)}>
                      {nombre}
                    </option>
                  ))}
              </Select>
              {clientesConProyecto.length > 1 || cliente ? (
                <Select
                  aria-label="Cliente"
                  controlSize="sm"
                  wrapperClassName={styles.select}
                  value={cliente}
                  onChange={(e) => setCliente(e.target.value)}
                >
                  <option value="">Todos los clientes</option>
                  {clientesConProyecto.map(([id, nombre]) => (
                    <option key={id} value={String(id)}>
                      {nombre}
                    </option>
                  ))}
                </Select>
              ) : null}
            </div>
          </div>
        </>
      }
      loading={primeraCarga}
      empty={!primeraCarga && visibles.length === 0}
      emptyState={
        sinRegistros && error
          ? {
              icon: <CloudOffOutlinedIcon />,
              title: "No se pudieron cargar los proyectos",
              description: "Revisa el aviso de arriba y vuelve a intentarlo.",
              tone: "danger",
            }
          : sinRegistros
            ? {
                icon: <AccountTreeOutlinedIcon />,
                title: "Todavía no hay proyectos",
                description: clientes?.length
                  ? `Ya hay ${clientes.length === 1 ? "1 cliente de proyecto" : `${clientes.length} clientes de proyecto`} en el padrón. Elige uno para arrancar su primer proyecto, o créalo desde cero.`
                  : "Un proyecto junta cliente, fechas, etapas, equipo y documentos. Puedes crearlo desde cero o a partir de una cotización aprobada.",
                action: (
                  <ButtonLink variant="primary" href="/erp/proyectos/nuevo" iconStart={<AddRoundedIcon />}>
                    Crear el primero
                  </ButtonLink>
                ),
                secondaryAction: clientes?.length ? (
                  <Button onClick={() => cambiarVista("clientes")}>Ver clientes de proyecto</Button>
                ) : undefined,
              }
            : {
                icon: <FilterAltOffOutlinedIcon />,
                title: "Ningún proyecto coincide",
                description:
                  estado === "" ? "«Vigentes» esconde los cancelados; prueba con otro estado o quita los filtros." : undefined,
                action: <Button onClick={quitarFiltros}>Quitar filtros</Button>,
                tone: "neutral",
              }
      }
    >
      <DataTable
        flush
        className={styles.tabla}
        ariaLabel="Proyectos"
        columns={columnas}
        rows={visibles}
        rowKey={(p) => p.id}
        loading={cargando && !primeraCarga}
        onRowClick={(p) => router.push(`/erp/proyectos/${p.id}`)}
        rowActionsLabel="Acciones"
        rowActions={(p) => (
          <ButtonLink
            href={`/erp/proyectos/${p.id}`}
            variant="ghost"
            size="sm"
            icon
            aria-label={`Abrir el proyecto ${p.title}`}
            title="Abrir proyecto"
          >
            <ChevronRightRoundedIcon fontSize="small" />
          </ButtonLink>
        )}
      />
    </ModulePage>
  );
}
