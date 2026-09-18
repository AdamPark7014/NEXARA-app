"use client";

import Link from "next/link";
import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useUser } from "@/components/UserContext";
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

function ListaProyectos() {
  const { user, token } = useUser();
  const search = useSearchParams();
  const hoy = useMemo(() => hoyISO(), []);

  const estadoInicial = String(search.get("estado") || "").toUpperCase();
  const saludInicial = String(search.get("salud") || "").toUpperCase();

  const [items, setItems] = useState<ProyectoFila[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [estado, setEstado] = useState<EstadoProyecto | "">(
    (ESTADOS_PROYECTO as readonly string[]).includes(estadoInicial) ? (estadoInicial as EstadoProyecto) : "",
  );
  const [salud, setSalud] = useState<FiltroSalud>(
    FILTROS_SALUD.some((f) => f.valor === saludInicial) ? (saludInicial as FiltroSalud) : "",
  );
  const [responsable, setResponsable] = useState("");

  const cargar = useCallback(async () => {
    if (!token) return;
    setCargando(true);
    setError(null);
    try {
      // Se trae todo (cancelados incluidos) y se filtra aquí: son decenas, no miles.
      setItems(await listarProyectos(token, { incluirCancelados: true }));
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudieron cargar los proyectos");
      setItems([]);
    } finally {
      setCargando(false);
    }
  }, [token]);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  const responsables = useMemo(() => {
    const porId = new Map<number, string>();
    for (const p of items) if (p.responsable) porId.set(p.responsable.id, p.responsable.nombre);
    return [...porId.entries()].sort((a, b) => a[1].localeCompare(b[1], "es"));
  }, [items]);

  const visibles = useMemo(() => {
    const texto = q.trim().toLowerCase();
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
  }, [items, q, estado, salud, responsable]);

  const cifras = useMemo(
    () => ({
      total: visibles.length,
      enCurso: visibles.filter((p) => p.status === "ACTIVE").length,
      enRiesgo: visibles.filter((p) => p.resumen.enRiesgo).length,
      retrasados: visibles.filter((p) => p.resumen.salud === "RETRASADO").length,
    }),
    [visibles],
  );

  const hayFiltros = Boolean(q.trim() || estado || salud || responsable);

  return (
    <div className={styles.wrap}>
      <div className={styles.top}>
        <div>
          <h1 className={styles.title}>Proyectos</h1>
          <p className={styles.sub}>
            Fechas planeadas y reales, cronograma por etapas, alcance, equipo y documentos. El avance y
            el semáforo se calculan solos con las actividades y las fechas.
          </p>
        </div>
        <Link className={styles.primaryBtn} href="/erp/proyectos/nuevo">
          Nuevo proyecto
        </Link>
      </div>

      <div className={styles.stats} aria-live="polite">
        <div className={styles.stat}>
          <span className={styles.statValue}>{cargando ? "…" : cifras.total}</span>
          <span className={styles.statLabel}>Proyectos en la vista</span>
        </div>
        <div className={styles.stat}>
          <span className={styles.statValue}>{cargando ? "…" : cifras.enCurso}</span>
          <span className={styles.statLabel}>En curso</span>
        </div>
        <div className={styles.stat}>
          <span className={styles.statValue}>{cargando ? "…" : cifras.enRiesgo}</span>
          <span className={styles.statLabel}>En riesgo</span>
        </div>
        <div className={styles.stat}>
          <span className={styles.statValue}>{cargando ? "…" : cifras.retrasados}</span>
          <span className={styles.statLabel}>Retrasados</span>
        </div>
      </div>

      <div className={styles.toolbar}>
        <input
          className={styles.search}
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Buscar por proyecto, cliente, responsable o folio de cotización…"
          aria-label="Buscar proyectos"
        />
        <label className={styles.filters} style={{ flex: "0 1 16rem" }}>
          <span className={styles.filtersLabel}>Responsable</span>
          <select
            className={styles.select}
            value={responsable}
            onChange={(e) => setResponsable(e.target.value)}
            style={{ flex: 1 }}
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
      </div>

      <div className={styles.filters} role="group" aria-label="Filtrar por estado">
        <span className={styles.filtersLabel}>Estado</span>
        <button
          type="button"
          className={`${styles.filterBtn} ${estado === "" ? styles.filterBtnOn : ""}`}
          aria-pressed={estado === ""}
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
            onClick={() => setSalud(salud === f.valor ? "" : f.valor)}
          >
            {f.etiqueta}
          </button>
        ))}
      </div>

      <div className={styles.metaRow}>
        <span>«Vigentes» esconde los cancelados. «En riesgo» incluye a los retrasados.</span>
        {hayFiltros ? (
          <button
            type="button"
            className={styles.linkBtn}
            onClick={() => {
              setQ("");
              setEstado("");
              setSalud("");
              setResponsable("");
            }}
          >
            Quitar filtros
          </button>
        ) : null}
      </div>

      {error ? (
        <p className={styles.errorBox} role="alert">
          {error}{" "}
          <button type="button" className={styles.linkBtn} onClick={() => void cargar()}>
            Reintentar
          </button>
        </p>
      ) : null}

      {cargando ? (
        <p className={styles.sub}>Cargando proyectos…</p>
      ) : visibles.length === 0 ? (
        <div className={styles.empty}>
          {items.length === 0 ? (
            <>
              Todavía no hay proyectos. <Link href="/erp/proyectos/nuevo">Crea el primero</Link>
            </>
          ) : (
            "Ningún proyecto coincide con estos filtros."
          )}
        </div>
      ) : (
        <ul className={styles.list} style={{ listStyle: "none", margin: 0, padding: 0 }}>
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
                      <span className={`${styles.rowSub} ${p.resumen.diasDeRetraso > 0 && p.resumen.salud !== "TERMINADO" ? styles.vencido : ""}`}>
                        {textoPlazo}
                      </span>
                    ) : null}
                  </div>

                  <div className={styles.cardCol}>
                    <div className={styles.badges}>
                      <span className={claseTono(ESTADO_TONO[p.status] ?? "neutral")}>
                        {ESTADO_PROYECTO_LABEL[p.status] ?? p.status}
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
                      <span>{p.hitosCount} etapa{p.hitosCount === 1 ? "" : "s"}</span>
                      <span>{p.equipoCount} en equipo</span>
                      <span>{p.documentosCount} doc.</span>
                    </span>
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

export default function ProyectosPage() {
  return (
    <Suspense fallback={<p className={styles.sub}>Cargando…</p>}>
      <ListaProyectos />
    </Suspense>
  );
}
