"use client";

import Link from "next/link";
import { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import AccountTreeOutlinedIcon from "@mui/icons-material/AccountTreeOutlined";
import FilterAltOffOutlinedIcon from "@mui/icons-material/FilterAltOffOutlined";
import {
  Alert,
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
  Toolbar,
  tabla,
} from "@/components/base";
import { useUser } from "@/components/UserContext";
import { formatApiError } from "@/lib/erp-api";
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
  const buscador = useRef<HTMLInputElement>(null);

  // Enlaces del tablero: /erp/proyectos?estado=ACTIVE&salud=RIESGO.
  useEffect(() => {
    const qs = new URLSearchParams(window.location.search);
    const e = String(qs.get("estado") || "").toUpperCase();
    const s = String(qs.get("salud") || "").toUpperCase();
    if ((ESTADOS_PROYECTO as readonly string[]).includes(e)) setEstado(e as EstadoProyecto);
    if (FILTROS_SALUD.some((f) => f.valor === s)) setSalud(s as FiltroSalud);
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

  const visibles = useMemo(() => {
    const texto = qDiferida.trim().toLowerCase();
    return items.filter((p) => {
      if (estado ? p.status !== estado : p.status === "CANCELLED") return false;
      if (!cumpleSalud(p, salud)) return false;
      if (responsable && String(p.responsable?.id ?? "") !== responsable) return false;
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
  }, [items, qDiferida, estado, salud, responsable]);

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

  const hayFiltros = Boolean(q.trim() || estado || salud || responsable);
  const quitarFiltros = () => {
    setQ("");
    setEstado("");
    setSalud("");
    setResponsable("");
  };
  const primeraCarga = cargando && items.length === 0;
  const sinRegistros = !cargando && items.length === 0;

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
      />

      {items.length ? (
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
            description="Un proyecto junta cliente, fechas, etapas, equipo y documentos. Puedes crearlo desde cero o a partir de una cotización aprobada."
            action={
              <ButtonLink variant="primary" href="/erp/proyectos/nuevo">
                Crear el primero
              </ButtonLink>
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
    </div>
  );
}
