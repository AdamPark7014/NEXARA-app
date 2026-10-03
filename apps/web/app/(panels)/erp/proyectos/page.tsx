"use client";

import Link from "next/link";
import { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import AccountTreeOutlinedIcon from "@mui/icons-material/AccountTreeOutlined";
import FilterAltOffOutlinedIcon from "@mui/icons-material/FilterAltOffOutlined";
import GroupsOutlinedIcon from "@mui/icons-material/GroupsOutlined";
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
  SkeletonRows,
  Stat,
  StatRow,
  Tabs,
  Toolbar,
  tabla,
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
import { claseTono } from "./_componentes/tono";
import styles from "./proyectos.module.css";

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

  const visibles = useMemo(() => {
    const texto = qDiferida.trim().toLowerCase();
    return items.filter((p) => {
      if (estado ? p.status !== estado : p.status === "CANCELLED") return false;
      if (!cumpleSalud(p, salud)) return false;
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
  }, [items, qDiferida, estado, salud, responsable, cliente]);

  const cifras = useMemo(() => {
    let enCurso = 0;
    let enRiesgo = 0;
    let retrasados = 0;
    for (const p of visibles) {
      if (p.status === "ACTIVE") enCurso += 1;
      if (p.resumen.enRiesgo) enRiesgo += 1;
      if (p.resumen.salud === "RETRASADO") retrasados += 1;
    }
    return { total: visibles.length, enCurso, enRiesgo, retrasados };
  }, [visibles]);

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

  return (
    <div className={styles.wrap}>
      <PageHead
        title="Proyectos"
        description="Fechas planeadas y reales, cronograma por etapas, alcance, equipo y documentos. El avance y el semáforo se calculan solos con las actividades y las fechas."
        actions={
          sinRegistros && !error ? null : (
            <ButtonLink variant="primary" href="/erp/proyectos/nuevo">
              Nuevo proyecto <Kbd>N</Kbd>
            </ButtonLink>
          )
        }
        tabs={
          clientes ? (
            <Tabs
              ariaLabel="Vista"
              items={[
                { id: "proyectos" as const, label: "Proyectos", icon: AccountTreeOutlinedIcon, count: items.length },
                { id: "clientes" as const, label: "Clientes de proyecto", icon: GroupsOutlinedIcon, count: clientes.length },
              ]}
              value={vista}
              onChange={cambiarVista}
            />
          ) : null
        }
      />

      {items.length && vista === "proyectos" ? (
        <StatRow cols={4}>
          <Stat
            label="En la vista"
            value={cifras.total}
            hint={hayFiltros ? `de ${items.length} proyectos` : estado ? ESTADO_PROYECTO_LABEL[estado] : "vigentes"}
          />
          <Stat label="En curso" value={cifras.enCurso} hint="trabajándose hoy" />
          <Stat
            label="En riesgo"
            value={cifras.enRiesgo}
            hint="incluye a los retrasados"
            tone={cifras.enRiesgo ? "warning" : "default"}
          />
          <Stat
            label="Retrasados"
            value={cifras.retrasados}
            hint="pasaron su fecha de fin"
            tone={cifras.retrasados ? "danger" : "default"}
          />
        </StatRow>
      ) : null}

      {error ? (
        <Alert tone="danger" role="alert" action={<LinkButton onClick={() => void cargar()}>Reintentar</LinkButton>}>
          {error}
        </Alert>
      ) : null}

      {vista === "clientes" && clientes ? (
        <div className={tabla.marco}>
          <div className={tabla.barra}>
            <Toolbar
              end={
                <span className={styles.rowSub}>
                  {clientesVisibles.length === 1 ? "1 cliente" : `${clientesVisibles.length} clientes`}
                </span>
              }
            >
              <SearchInput
                ref={buscador}
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Cliente, razón social o RFC"
                aria-label="Buscar clientes de proyecto"
                shortcut="/"
              />
            </Toolbar>
          </div>
          {clientes.length === 0 ? (
            <EmptyState
              icon={<GroupsOutlinedIcon />}
              title="Aún no hay clientes de proyecto"
              description="Aparecen aquí los que se dan de alta en Clientes como «Proyecto», los del alta rápida de una actividad y cualquier cliente al que se le abra un proyecto."
              action={
                <ButtonLink variant="primary" href="/erp/proyectos/nuevo">
                  Nuevo proyecto
                </ButtonLink>
              }
            />
          ) : clientesVisibles.length === 0 ? (
            <EmptyState
              icon={<FilterAltOffOutlinedIcon />}
              title="Ningún cliente coincide"
              action={<Button onClick={() => setQ("")}>Quitar búsqueda</Button>}
            />
          ) : (
            <div aria-label="Clientes de proyecto" role="list">
              <div className={`${tabla.cabeza} ${styles.rejillaClientes}`} aria-hidden>
                <span>Cliente</span>
                <span>Proyectos</span>
                <span>Lo más reciente</span>
                <span />
              </div>
              {clientesVisibles.map((c) => {
                const suyos = (c.serviceClientId ? proyectosPorCliente.get(c.serviceClientId) : undefined) ?? [];
                const vigentes = suyos.filter(esVigente);
                const reciente = vigentes[0] ?? suyos[0];
                const sinDatos = !c.legalName?.trim() && !c.taxId?.trim();
                return (
                  <div key={c.id} role="listitem" className={`${tabla.fila} ${styles.rejillaClientes}`}>
                    <span className={tabla.celda}>
                      <span className={tabla.fuerte}>{c.name}</span>
                      <span className={tabla.tenue}>
                        {isInactiveClient(c.status)
                          ? "Inactivo"
                          : sinDatos
                            ? "Alta rápida: faltan sus datos fiscales"
                            : c.legalName && c.legalName !== c.name
                              ? c.legalName
                              : c.taxId || "Sin razón social"}
                      </span>
                    </span>
                    <span className={tabla.celda}>
                      {suyos.length ? (
                        <>
                          <span className={tabla.fuerte}>
                            {vigentes.length === 1 ? "1 vigente" : `${vigentes.length} vigentes`}
                          </span>
                          <span className={tabla.tenue}>{suyos.length} en total</span>
                        </>
                      ) : (
                        <span className={tabla.tenue}>Sin proyectos todavía</span>
                      )}
                    </span>
                    <span className={tabla.celda}>
                      {reciente ? (
                        <>
                          <Link href={`/erp/proyectos/${reciente.id}`} className={styles.enlaceProyecto}>
                            {reciente.title}
                          </Link>
                          <span className={tabla.tenue}>
                            {ESTADO_PROYECTO_LABEL[reciente.status] ?? "Sin estado"}
                            {reciente.endDate ? ` · fin ${formatoFecha(reciente.endDate)}` : ""}
                          </span>
                        </>
                      ) : (
                        <Badge tone="outline">Por arrancar</Badge>
                      )}
                    </span>
                    <span className={styles.accionesCliente}>
                      {suyos.length && c.serviceClientId ? (
                        <LinkButton onClick={() => verProyectosDe(c.serviceClientId!)}>Ver proyectos</LinkButton>
                      ) : null}
                      {puedeAbrirFicha ? (
                        <Link href={`/erp/clientes/${c.id}#proyectos`} className={styles.enlaceProyecto}>
                          Ficha
                        </Link>
                      ) : null}
                      <ButtonLink href={`/erp/proyectos/nuevo?clienteId=${c.id}`}>Nuevo proyecto</ButtonLink>
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      ) : (
        <div className={tabla.marco}>
          <div className={`${tabla.barra} ${styles.barraFiltros}`}>
            <Toolbar end={hayFiltros ? <LinkButton onClick={quitarFiltros}>Quitar filtros</LinkButton> : null}>
              <SearchInput
                ref={buscador}
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Proyecto, cliente, responsable o folio"
                aria-label="Buscar proyectos"
                shortcut="/"
              />
              <label className={styles.filters}>
                <span className={styles.filtersLabel}>Responsable</span>
                <select
                  className={`${styles.select} ${styles.selectCorto}`}
                  value={responsable}
                  onChange={(e) => setResponsable(e.target.value)}
                >
                  <option value="">Todos</option>
                  {user?.id && responsables.some(([id]) => id === user.id) ? (
                    <option value={String(user.id)}>Yo</option>
                  ) : null}
                  {responsables
                    .filter(([id]) => id !== user?.id)
                    .map(([id, nombre]) => (
                      <option key={id} value={String(id)}>
                        {nombre}
                      </option>
                    ))}
                </select>
              </label>
              {clientesConProyecto.length > 1 || cliente ? (
                <label className={styles.filters}>
                  <span className={styles.filtersLabel}>Cliente</span>
                  <select
                    className={`${styles.select} ${styles.selectCorto}`}
                    value={cliente}
                    onChange={(e) => setCliente(e.target.value)}
                  >
                    <option value="">Todos</option>
                    {clientesConProyecto.map(([id, nombre]) => (
                      <option key={id} value={String(id)}>
                        {nombre}
                      </option>
                    ))}
                  </select>
                </label>
              ) : null}
            </Toolbar>

            <div className={styles.filters} role="group" aria-label="Filtrar por estado">
              <span className={styles.filtersLabel}>Estado</span>
              <button
                type="button"
                className={`${styles.filterBtn} ${estado === "" ? styles.filterBtnOn : ""}`}
                aria-pressed={estado === ""}
                title="Todo menos los cancelados"
                onClick={() => setEstado("")}
              >
                Vigentes
              </button>
              {ESTADOS_PROYECTO.map((e) => (
                <button
                  key={e}
                  type="button"
                  className={`${styles.filterBtn} ${estado === e ? styles.filterBtnOn : ""}`}
                  aria-pressed={estado === e}
                  onClick={() => setEstado(estado === e ? "" : e)}
                >
                  {ESTADO_PROYECTO_LABEL[e]}
                </button>
              ))}
            </div>

            <div className={styles.filters} role="group" aria-label="Filtrar por semáforo">
              <span className={styles.filtersLabel}>Semáforo</span>
              {FILTROS_SALUD.map((f) => (
                <button
                  key={f.valor || "todas"}
                  type="button"
                  className={`${styles.filterBtn} ${salud === f.valor ? styles.filterBtnOn : ""}`}
                  aria-pressed={salud === f.valor}
                  title={f.valor === "RIESGO" ? "Incluye a los retrasados" : undefined}
                  onClick={() => setSalud(salud === f.valor ? "" : f.valor)}
                >
                  {f.etiqueta}
                </button>
              ))}
            </div>
          </div>

          {primeraCarga ? (
            <SkeletonRows rows={5} label="Cargando proyectos" />
          ) : sinRegistros && !error ? (
            <EmptyState
              icon={<AccountTreeOutlinedIcon />}
              title="Todavía no hay proyectos"
              description={
                clientes?.length
                  ? `Ya hay ${clientes.length === 1 ? "1 cliente de proyecto" : `${clientes.length} clientes de proyecto`} en el padrón. Elige uno para arrancar su primer proyecto, o créalo desde cero.`
                  : "Un proyecto junta cliente, fechas, etapas, equipo y documentos. Puedes crearlo desde cero o a partir de una cotización aprobada."
              }
              action={
                <span className={styles.acciones}>
                  <ButtonLink variant="primary" href="/erp/proyectos/nuevo">
                    Crear el primero
                  </ButtonLink>
                  {clientes?.length ? <Button onClick={() => cambiarVista("clientes")}>Ver clientes de proyecto</Button> : null}
                </span>
              }
            />
          ) : visibles.length ? (
            <ul className={`${styles.list} ${styles.listEnMarco}`} aria-label="Proyectos">
              {visibles.map((p) => {
                const avance = p.resumen.avance.porcentaje;
                const siguiente = p.proximoHito;
                const siguienteVencido = siguiente ? hitoVencido(siguiente, hoy) : false;
                const textoPlazo = plazo(p);
                return (
                  <li key={p.id}>
                    <Link href={`/erp/proyectos/${p.id}`} className={styles.card}>
                      <div className={styles.cardCol}>
                        <span className={styles.cardTitle}>{p.title}</span>
                        <span className={styles.rowSub}>{p.client?.name ?? "Sin cliente"}</span>
                        <span className={styles.rowSub}>{getServiceProjectTypeLabel(p.projectType)}</span>
                      </div>

                      <div className={styles.cardCol}>
                        <span className={styles.rowSub}>
                          Responsable: <strong>{p.responsable?.nombre ?? "Sin asignar"}</strong>
                        </span>
                        <span className={styles.rowSub}>
                          {formatoFecha(p.startDate)} → {p.endDate ? formatoFecha(p.endDate) : "sin fin planeado"}
                        </span>
                        {textoPlazo ? (
                          <span
                            className={`${styles.rowSub} ${p.resumen.diasDeRetraso > 0 && p.resumen.salud !== "TERMINADO" ? styles.vencido : ""}`}
                          >
                            {textoPlazo}
                          </span>
                        ) : null}
                      </div>

                      <div className={styles.cardCol}>
                        <div className={styles.badges}>
                          <span className={claseTono(ESTADO_TONO[p.status] ?? "neutral")}>
                            {ESTADO_PROYECTO_LABEL[p.status] ?? "Sin estado"}
                          </span>
                          {/* «Planeado · Planeado» no dice nada: el semáforo solo sale si agrega algo. */}
                          {p.resumen.etiqueta !== ESTADO_PROYECTO_LABEL[p.status] ? (
                            <span className={claseTono(SALUD_TONO[p.resumen.salud] ?? "neutral")} title={p.resumen.motivo}>
                              {p.resumen.etiqueta}
                            </span>
                          ) : null}
                        </div>
                        <span className={`${styles.rowSub} ${siguienteVencido ? styles.vencido : ""}`}>
                          {siguiente
                            ? `Sigue: ${siguiente.name}${siguiente.plannedDate ? ` · ${formatoFecha(siguiente.plannedDate, false)}` : ""}${siguienteVencido ? " (vencida)" : ""}`
                            : p.hitosCount > 0
                              ? "Todas las etapas cumplidas"
                              : "Sin cronograma"}
                        </span>
                      </div>

                      <div className={styles.cardCol}>
                        <div
                          className={styles.progress}
                          role="progressbar"
                          aria-label="Avance"
                          aria-valuemin={0}
                          aria-valuemax={100}
                          aria-valuenow={avance ?? undefined}
                          aria-valuetext={avance === null ? "Sin datos de avance" : `${avance} %`}
                        >
                          <div className={styles.progressFill} style={{ width: `${avance ?? 0}%` }} />
                        </div>
                        <span className={styles.progressLabel}>
                          {avance === null ? "—" : `${avance} %`} · {origenAvance(p.resumen.avance.origen)}
                        </span>
                        <span className={styles.counts}>
                          <span>
                            {p.hitosCount} etapa{p.hitosCount === 1 ? "" : "s"}
                          </span>
                          <span>{p.equipoCount} en equipo</span>
                          <span>{p.documentosCount} doc.</span>
                        </span>
                      </div>
                    </Link>
                  </li>
                );
              })}
            </ul>
          ) : items.length ? (
            <EmptyState
              icon={<FilterAltOffOutlinedIcon />}
              title="Ningún proyecto coincide"
              description={estado === "" ? "«Vigentes» esconde los cancelados; prueba con otro estado o quita los filtros." : undefined}
              action={<Button onClick={quitarFiltros}>Quitar filtros</Button>}
            />
          ) : null}
        </div>
      )}
    </div>
  );
}
