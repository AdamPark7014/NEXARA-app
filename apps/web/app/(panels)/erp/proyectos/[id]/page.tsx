"use client";

import Link from "next/link";
import { Suspense, useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { useUser } from "@/components/UserContext";
import ConfirmDialog, { type ConfirmState } from "@/components/ui/ConfirmDialog";
import {
  ESTADO_PROYECTO_LABEL,
  ESTADO_TONO,
  SALUD_TONO,
  obtenerProyecto,
  type ProyectoDetalle,
} from "@/lib/proyectos-api";
import { accionesDeEstado, hoyISO, type AccionDeEstado } from "@/lib/proyecto-plan";
import { getServiceProjectTypeLabel } from "@/lib/service-project-types";
import { cambiarEstado } from "../_componentes/acciones";
import { usePersonasAsignables } from "../_componentes/personas";
import { claseTono } from "../_componentes/tono";
import type { SeccionProps } from "../_componentes/tipos";
import SeccionResumen from "../_componentes/SeccionResumen";
import SeccionCronograma from "../_componentes/SeccionCronograma";
import SeccionAlcance from "../_componentes/SeccionAlcance";
import SeccionRequerimientos from "../_componentes/SeccionRequerimientos";
import SeccionEquipo from "../_componentes/SeccionEquipo";
import SeccionDocumentos from "../_componentes/SeccionDocumentos";
import SeccionActividades from "../_componentes/SeccionActividades";
import styles from "../proyectos.module.css";

const PESTANAS = [
  { id: "resumen", titulo: "Resumen" },
  { id: "cronograma", titulo: "Cronograma" },
  { id: "alcance", titulo: "Alcance" },
  { id: "requerimientos", titulo: "Requerimientos" },
  { id: "equipo", titulo: "Equipo" },
  { id: "documentos", titulo: "Documentos" },
  { id: "actividades", titulo: "Actividades" },
] as const;

type Pestana = (typeof PESTANAS)[number]["id"];

function conteoDe(p: ProyectoDetalle, pestana: Pestana): number | null {
  switch (pestana) {
    case "cronograma":
      return p.milestones.length;
    case "alcance":
      return p.scopeItems.length;
    case "requerimientos":
      return p.requirements.length;
    case "equipo":
      return p.members.length;
    case "documentos":
      return p.documents.length;
    case "actividades":
      return p.activities.length;
    default:
      return null;
  }
}

function mensajeDeConfirmacion(p: ProyectoDetalle, accion: AccionDeEstado): string {
  switch (accion.hacia) {
    case "ACTIVE":
      if (p.status === "COMPLETED") return "Se reabre el proyecto y se borra su fecha real de entrega.";
      return p.actualStartDate
        ? "El proyecto pasa a «En curso»."
        : "El proyecto pasa a «En curso» y se anota hoy como su inicio real.";
    case "ON_HOLD":
      return "El proyecto queda en pausa. Ojo: el calendario sigue corriendo contra el fin planeado.";
    case "PLANNED":
      return "El proyecto regresa a «Planeado»: todavía no arranca.";
    default:
      return `El proyecto pasa a «${ESTADO_PROYECTO_LABEL[accion.hacia]}».`;
  }
}

function DetalleProyecto() {
  const params = useParams<{ id: string }>();
  const id = Number(params?.id);
  const router = useRouter();
  const search = useSearchParams();
  const { user, token } = useUser();
  const hoy = useMemo(() => hoyISO(), []);

  const pestanaInicial = PESTANAS.find((t) => t.id === search.get("tab"))?.id ?? "resumen";
  const [pestana, setPestana] = useState<Pestana>(pestanaInicial);
  const [proyecto, setProyecto] = useState<ProyectoDetalle | null>(null);
  const [cargando, setCargando] = useState(true);
  const [errorCarga, setErrorCarga] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [confirmacion, setConfirmacion] = useState<ConfirmState | null>(null);
  const [cambio, setCambio] = useState<{ accion: AccionDeEstado; motivo: string; fecha: string } | null>(null);
  const [errorCambio, setErrorCambio] = useState<string | null>(null);
  const botonesPestana = useRef<Array<HTMLButtonElement | null>>([]);

  const cargar = useCallback(async () => {
    if (!token || !Number.isInteger(id) || id <= 0) return;
    setCargando(true);
    setErrorCarga(null);
    try {
      setProyecto(await obtenerProyecto(token, id));
    } catch (e) {
      setErrorCarga(e instanceof Error ? e.message : "No se pudo cargar el proyecto");
    } finally {
      setCargando(false);
    }
  }, [token, id]);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  // El aviso de «guardado» se va solo; el error se queda hasta la siguiente acción.
  useEffect(() => {
    if (!aviso) return;
    const t = window.setTimeout(() => setAviso(null), 4000);
    return () => window.clearTimeout(t);
  }, [aviso]);

  const yo = useMemo(() => (user?.id ? { id: user.id, nombre: user.nombre } : null), [user?.id, user?.nombre]);
  const extras = useMemo(
    () =>
      proyecto
        ? [
            proyecto.responsable,
            ...proyecto.members.map((m) => m.user),
            ...proyecto.milestones.map((h) => h.responsable),
            ...proyecto.requirements.map((r) => r.responsable),
          ]
        : [],
    [proyecto],
  );
  const { personas } = usePersonasAsignables(token, yo, extras);

  const mutar = useCallback<SeccionProps["mutar"]>(async (accion, exito) => {
    setOcupado(true);
    setError(null);
    setAviso(null);
    try {
      const detalle = await accion();
      setProyecto(detalle);
      if (exito) setAviso(exito);
      return true;
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo guardar el cambio");
      return false;
    } finally {
      setOcupado(false);
    }
  }, []);

  function elegirPestana(destino: Pestana) {
    setPestana(destino);
    const qs = new URLSearchParams(search.toString());
    if (destino === "resumen") qs.delete("tab");
    else qs.set("tab", destino);
    const texto = qs.toString();
    router.replace(`/erp/proyectos/${id}${texto ? `?${texto}` : ""}`, { scroll: false });
  }

  /** Flechas, Inicio y Fin mueven entre pestañas, como en cualquier lista de pestañas. */
  function teclaEnPestanas(e: KeyboardEvent<HTMLDivElement>) {
    const actual = PESTANAS.findIndex((t) => t.id === pestana);
    let siguiente = actual;
    if (e.key === "ArrowRight") siguiente = (actual + 1) % PESTANAS.length;
    else if (e.key === "ArrowLeft") siguiente = (actual - 1 + PESTANAS.length) % PESTANAS.length;
    else if (e.key === "Home") siguiente = 0;
    else if (e.key === "End") siguiente = PESTANAS.length - 1;
    else return;
    e.preventDefault();
    elegirPestana(PESTANAS[siguiente].id);
    botonesPestana.current[siguiente]?.focus();
  }

  if (!Number.isInteger(id) || id <= 0) {
    return (
      <div className={styles.wrap}>
        <p className={styles.errorBox}>Ese proyecto no existe.</p>
        <Link href="/erp/proyectos">← Volver a proyectos</Link>
      </div>
    );
  }

  if (cargando && !proyecto) {
    return (
      <div className={styles.wrap}>
        <p className={styles.sub}>Cargando proyecto…</p>
      </div>
    );
  }

  if (!proyecto) {
    return (
      <div className={styles.wrap}>
        <Link className={styles.migas} href="/erp/proyectos">
          ← Proyectos
        </Link>
        <p className={styles.errorBox} role="alert">
          {errorCarga ?? "No se pudo cargar el proyecto."}{" "}
          <button type="button" className={styles.linkBtn} onClick={() => void cargar()}>
            Reintentar
          </button>
        </p>
      </div>
    );
  }

  const p = proyecto;
  const acciones = accionesDeEstado(p.status);
  const seccion: SeccionProps | null = token
    ? { proyecto: p, token, hoy, ocupado, personas, mutar, confirmar: setConfirmacion }
    : null;

  function pedirCambio(accion: AccionDeEstado) {
    setError(null);
    setErrorCambio(null);
    if (accion.pide) {
      setCambio({ accion, motivo: "", fecha: hoy });
      return;
    }
    setConfirmacion({
      title: accion.etiqueta,
      message: mensajeDeConfirmacion(p, accion),
      confirmLabel: accion.etiqueta,
      danger: false,
      fn: async () => {
        if (!token) return;
        await mutar(
          () => cambiarEstado(token, p, accion.hacia, {}, hoy),
          `Proyecto ${ESTADO_PROYECTO_LABEL[accion.hacia].toLowerCase()}.`,
        );
      },
    });
  }

  async function confirmarCambio() {
    if (!cambio || !token) return;
    const { accion } = cambio;
    if (accion.pide === "motivo" && !cambio.motivo.trim()) {
      setErrorCambio("Escribe por qué se cancela: queda en el historial del proyecto.");
      return;
    }
    if (accion.pide === "fechaDeEntrega" && !cambio.fecha) {
      setErrorCambio("Pon la fecha real de entrega.");
      return;
    }
    const ok = await mutar(
      () =>
        cambiarEstado(
          token,
          p,
          accion.hacia,
          accion.pide === "motivo" ? { cancelReason: cambio.motivo.trim() } : { actualEndDate: cambio.fecha },
          hoy,
        ),
      accion.hacia === "CANCELLED" ? "Proyecto cancelado." : "Proyecto terminado.",
    );
    if (ok) setCambio(null);
  }

  const pendientesAlTerminar = [
    p.resumen.avance.abiertas ? `${p.resumen.avance.abiertas} actividad(es) abierta(s)` : null,
    p.resumen.requerimientos.pendientes ? `${p.resumen.requerimientos.pendientes} requerimiento(s) pendiente(s)` : null,
    p.milestones.filter((h) => h.status !== "CUMPLIDO" && h.status !== "CANCELADO" && !h.actualDate).length
      ? `${p.milestones.filter((h) => h.status !== "CUMPLIDO" && h.status !== "CANCELADO" && !h.actualDate).length} etapa(s) sin cumplir`
      : null,
  ].filter(Boolean);

  return (
    <div className={styles.wrap}>
      <div className={styles.top}>
        <div style={{ minWidth: 0 }}>
          <Link className={styles.migas} href="/erp/proyectos">
            ← Proyectos
          </Link>
          <h1 className={styles.title}>{p.title}</h1>
          <p className={styles.sub}>
            {[p.client?.name, getServiceProjectTypeLabel(p.projectType), p.responsable ? `Responsable: ${p.responsable.nombre}` : null]
              .filter(Boolean)
              .join(" · ")}
          </p>
          <div className={styles.badges} style={{ marginTop: 8 }}>
            <span className={claseTono(ESTADO_TONO[p.status] ?? "neutral")}>{ESTADO_PROYECTO_LABEL[p.status] ?? p.status}</span>
            {p.resumen.etiqueta !== ESTADO_PROYECTO_LABEL[p.status] ? (
              <span className={claseTono(SALUD_TONO[p.resumen.salud] ?? "neutral")} title={p.resumen.motivo}>
                {p.resumen.etiqueta}
              </span>
            ) : null}
            <span className={styles.badge}>
              Avance {p.resumen.avance.porcentaje === null ? "sin datos" : `${p.resumen.avance.porcentaje} %`}
            </span>
          </div>
        </div>
        {acciones.length ? (
          <div className={styles.acciones} role="group" aria-label="Cambiar estado del proyecto">
            {acciones.map((a) => (
              <button
                key={a.hacia}
                type="button"
                className={a.peligro ? styles.dangerBtn : a.hacia === "COMPLETED" || (a.hacia === "ACTIVE" && p.status === "PLANNED") ? styles.primaryBtn : styles.secondaryBtn}
                disabled={ocupado}
                onClick={() => pedirCambio(a)}
              >
                {a.etiqueta}
              </button>
            ))}
          </div>
        ) : null}
      </div>

      {cambio ? (
        <div className={styles.estadoPanel} role="region" aria-label={cambio.accion.etiqueta}>
          {cambio.accion.pide === "motivo" ? (
            <>
              <label className={styles.fieldLabel} htmlFor="motivo-cancelacion">
                ¿Por qué se cancela el proyecto? *
              </label>
              <textarea
                id="motivo-cancelacion"
                className={styles.textarea}
                maxLength={500}
                value={cambio.motivo}
                onChange={(e) => setCambio({ ...cambio, motivo: e.target.value })}
                placeholder="Ej. El cliente pospuso la obra para el próximo año."
                autoFocus
              />
              <p className={styles.hint}>Queda guardado en el proyecto. Se puede reactivar después si hace falta.</p>
            </>
          ) : (
            <>
              <label className={styles.fieldLabel} htmlFor="fecha-entrega">
                Fecha real de entrega *
              </label>
              <input
                id="fecha-entrega"
                className={styles.input}
                type="date"
                value={cambio.fecha}
                max={hoy}
                onChange={(e) => setCambio({ ...cambio, fecha: e.target.value })}
                style={{ maxWidth: "14rem" }}
                autoFocus
              />
              {pendientesAlTerminar.length ? (
                <p className={styles.hint}>Todavía queda: {pendientesAlTerminar.join(", ")}.</p>
              ) : null}
            </>
          )}
          {errorCambio ? (
            <p className={styles.error} role="alert">
              {errorCambio}
            </p>
          ) : null}
          <div className={styles.acciones}>
            <button
              type="button"
              className={cambio.accion.peligro ? styles.dangerBtn : styles.primaryBtn}
              disabled={ocupado}
              onClick={() => void confirmarCambio()}
            >
              {ocupado ? "Guardando…" : cambio.accion.etiqueta}
            </button>
            <button type="button" className={styles.secondaryBtn} disabled={ocupado} onClick={() => setCambio(null)}>
              {cambio.accion.pide === "motivo" ? "No cancelar" : "Volver"}
            </button>
          </div>
        </div>
      ) : null}

      <div
        className={styles.tabs}
        role="tablist"
        aria-label="Secciones del proyecto"
        onKeyDown={teclaEnPestanas}
      >
        {PESTANAS.map((t, i) => {
          const activa = pestana === t.id;
          const conteo = conteoDe(p, t.id);
          return (
            <button
              key={t.id}
              ref={(el) => {
                botonesPestana.current[i] = el;
              }}
              type="button"
              role="tab"
              id={`tab-${t.id}`}
              aria-selected={activa}
              aria-controls={`panel-${t.id}`}
              tabIndex={activa ? 0 : -1}
              className={`${styles.tab} ${activa ? styles.tabActive : ""}`}
              onClick={() => elegirPestana(t.id)}
            >
              {t.titulo}
              {conteo !== null ? <span className={styles.tabCount}>{conteo}</span> : null}
            </button>
          );
        })}
      </div>

      <div className={styles.avisos} aria-live="polite">
        {error ? (
          <p className={styles.errorBox} role="alert">
            {error}
          </p>
        ) : null}
        {aviso ? (
          <p className={styles.okBox} role="status">
            {aviso}
          </p>
        ) : null}
      </div>

      <div role="tabpanel" id={`panel-${pestana}`} aria-labelledby={`tab-${pestana}`}>
        {!seccion ? (
          <p className={styles.sub}>Inicia sesión para ver el proyecto.</p>
        ) : pestana === "resumen" ? (
          <SeccionResumen {...seccion} />
        ) : pestana === "cronograma" ? (
          <SeccionCronograma {...seccion} />
        ) : pestana === "alcance" ? (
          <SeccionAlcance {...seccion} />
        ) : pestana === "requerimientos" ? (
          <SeccionRequerimientos {...seccion} />
        ) : pestana === "equipo" ? (
          <SeccionEquipo {...seccion} />
        ) : pestana === "documentos" ? (
          <SeccionDocumentos {...seccion} />
        ) : (
          <SeccionActividades {...seccion} />
        )}
      </div>

      <ConfirmDialog state={confirmacion} onClose={() => setConfirmacion(null)} />
    </div>
  );
}

export default function ProyectoDetallePage() {
  return (
    <Suspense fallback={<p className={styles.sub}>Cargando…</p>}>
      <DetalleProyecto />
    </Suspense>
  );
}
