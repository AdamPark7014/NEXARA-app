"use client";

import { useCallback, useEffect, useState, useRef, type CSSProperties } from "react";
import Link from "next/link";
import { useUser } from "@/components/UserContext";
import { formatApiError } from "@/lib/erp-api";
import {
  devolverPlan,
  entregarCierre,
  enviarPlan,
  fetchCierre,
  fetchPlanes,
  hoyLocal,
  mananaLocal,
  marcarProgramado,
  type CierreResponse,
  type PlanesResponse,
  type PersonaCierre,
} from "@/lib/supervision-api";

import styles from "./supervision.module.css";

type Tab = "plan" | "cierre";

const btn: CSSProperties = {
  minHeight: 44,
  padding: "8px 14px",
  borderRadius: 8,
  border: "1px solid var(--ui-border)",
  background: "var(--ui-elev-1)",
  color: "var(--ui-fg)",
  cursor: "pointer",
  fontSize: 14,
};

const btnPrimary: CSSProperties = {
  ...btn,
  background: "var(--ui-primary, #168570)",
  color: "#fff",
  border: "1px solid transparent",
};

export default function SupervisionPage() {
  const { token } = useUser();
  const [tab, setTab] = useState<Tab>("plan");
  const [fechaPlan, setFechaPlan] = useState(mananaLocal);
  const [texto, setTexto] = useState("");
  const [planes, setPlanes] = useState<PlanesResponse | null>(null);
  const [fechaCierre, setFechaCierre] = useState(hoyLocal);
  const [cierre, setCierre] = useState<CierreResponse | null>(null);
  const [comentario, setComentario] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const requestId = useRef(0);
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);

  const cargarPlan = useCallback(async () => {
    if (!token) return;
    const request = ++requestId.current;
    setLoading(true);
    setError(null);
    try {
      const data = await fetchPlanes(token, fechaPlan);
      if (request === requestId.current) setPlanes(data);
    } catch (e) {
      if (request === requestId.current) setError(formatApiError(e, "No se pudieron cargar los planes."));
    } finally {
      if (request === requestId.current) setLoading(false);
    }
  }, [token, fechaPlan]);

  const cargarCierre = useCallback(async () => {
    if (!token) return;
    const request = ++requestId.current;
    setLoading(true);
    setError(null);
    try {
      const data = await fetchCierre(token, fechaCierre);
      if (request === requestId.current) setCierre(data);
    } catch (e) {
      if (request === requestId.current) setError(formatApiError(e, "No se pudo cargar el cierre."));
    } finally {
      if (request === requestId.current) setLoading(false);
    }
  }, [token, fechaCierre]);

  useEffect(() => {
    if (tab === "plan") void cargarPlan();
    else void cargarCierre();
  }, [tab, cargarPlan, cargarCierre]);

  const actuar = async (action: () => Promise<unknown>, success?: string) => {
    if (busy) return;
    setBusy(true); setError(null); setOk(null);
    try { await action(); if (success) setOk(success); }
    catch (e) { setError(formatApiError(e)); }
    finally { setBusy(false); }
  };

  const onEnviar = async () => {
    if (!token) return;
    setError(null);
    setOk(null);
    try {
      await enviarPlan(token, { fecha: fechaPlan, texto });
      setTexto("");
      setOk("Plan enviado.");
      await cargarPlan();
    } catch (e) {
      setError(formatApiError(e, "No se pudo enviar el plan."));
    }
  };

  return (
    <main
      style={{
        padding: 16,
        minWidth: 0,
        overflowWrap: "anywhere",
        maxWidth: 1100,
        margin: "0 auto",
        color: "var(--ui-fg)",
        background: "var(--ui-bg)",
      }}
    >
      <h1 style={{ fontSize: 28, margin: "0 0 12px" }}>Supervisión</h1>

      <div style={{ display: "flex", gap: 8, marginBottom: 16, flexWrap: "wrap" }}>
        <button type="button" style={tab === "plan" ? btnPrimary : btn} onClick={() => { requestId.current++; setError(null); setOk(null); setTab("plan"); }}>
          Plan de mañana
        </button>
        <button type="button" style={tab === "cierre" ? btnPrimary : btn} onClick={() => { requestId.current++; setError(null); setOk(null); setTab("cierre"); }}>
          Cierre del día
        </button>
      </div>

      {error ? (
        <p role="alert" style={{ color: "var(--ui-danger, #b42318)", marginBottom: 12 }}>
          {error}
        </p>
      ) : null}
      {ok ? (
        <p style={{ color: "var(--ui-success, #067647)", marginBottom: 12 }}>
          {ok}
        </p>
      ) : null}
      <label style={{ display: "grid", gap: 4, marginBottom: 16, maxWidth: 220 }}>
        Fecha
        <input type="date" value={tab === "plan" ? fechaPlan : fechaCierre} style={{ minHeight: 44, fontSize: 16, padding: 8, width: "100%", boxSizing: "border-box" }}
          onChange={(e) => { if (tab === "plan") setFechaPlan(e.target.value); else setFechaCierre(e.target.value); }} />
      </label>
      {loading ? <p role="status">Cargando…</p> : null}

      {tab === "plan" && !loading && !error ? (
        <section>
          {planes?.puedeEnviar !== false ? <div style={{ display: "grid", gap: 10, marginBottom: 20 }}>
            <label style={{ display: "grid", gap: 4 }}>
              Qué hará tu gente
              <textarea
                value={texto}
                onChange={(e) => setTexto(e.target.value)}
                rows={4}
                style={{ fontSize: 16, padding: 10, resize: "vertical" }}
                placeholder="Describe el plan de mañana de tu equipo"
              />
            </label>
            <button type="button" style={btnPrimary} disabled={busy || texto.trim().length < 3} onClick={() => void actuar(onEnviar)}>
              Enviar plan
            </button>
          </div> : <p>Consulta los planes recibidos y el cierre que corresponde a tu rol.</p>}

          {planes?.rol === "supervisor" ? (
            <>
              <div style={{ marginBottom: 12 }}>
                <Link
                  href="/erp/pizarra"
                  style={{ ...btnPrimary, display: "inline-flex", alignItems: "center", textDecoration: "none" }}
                >
                  Programar actividades
                </Link>
              </div>
              {planes.faltantes.length ? (
                <div style={{ marginBottom: 16 }}>
                  <h2 style={{ fontSize: 18 }}>Faltan por mandar</h2>
                  <ul>
                    {planes.faltantes.map((f) => (
                      <li key={f.id}>{f.nombre}</li>
                    ))}
                  </ul>
                </div>
              ) : (
                <p style={{ opacity: 0.7 }}>Todos los coordinadores ya mandaron su plan.</p>
              )}
              <div style={{ display: "grid", gap: 12 }}>
                {planes.planes.length === 0 ? (
                  <p>Aún no hay planes para esta fecha.</p>
                ) : (
                  planes.planes.map((p) => (
                    <article
                      key={p.id}
                      style={{
                        border: "1px solid var(--ui-border)",
                        borderRadius: 12,
                        padding: 14,
                        background: "var(--ui-elev-1)",
                      }}
                    >
                      <strong>{p.autor?.nombre ?? "Coordinador"}</strong>
                      <div style={{ fontSize: 13, opacity: 0.7, marginBottom: 8 }}>{p.estado}</div>
                      <p style={{ whiteSpace: "pre-wrap" }}>{p.texto}</p>
                      {p.notaSupervisor ? <p style={{ fontSize: 13 }}>Nota: {p.notaSupervisor}</p> : null}
                      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 10 }}>
                        <button
                          type="button"
                          style={btn}
                          onClick={() =>
                            void marcarProgramado(token!, p.id)
                              .then(cargarPlan)
                              .catch((e) => setError(formatApiError(e)))
                          }
                        >
                          Programado
                        </button>
                        <button
                          type="button"
                          style={btn}
                          onClick={() => {
                            const nota = window.prompt("Nota para devolver el plan (opcional)");
                            if (nota === null) return;
                            void devolverPlan(token!, p.id, nota || undefined)
                              .then(cargarPlan)
                              .catch((e) => setError(formatApiError(e)));
                          }}
                        >
                          Devolver
                        </button>
                      </div>
                    </article>
                  ))
                )}
              </div>
            </>
          ) : null}

          {planes?.rol === "autor" ? (
            <div>
              <h2 style={{ fontSize: 18 }}>Tu historial</h2>
              {planes.planes.length === 0 ? (
                <p>Todavía no has mandado plan para esta fecha.</p>
              ) : (
                <ul style={{ listStyle: "none", padding: 0, display: "grid", gap: 10 }}>
                  {planes.planes.map((p) => (
                    <li
                      key={p.id}
                      style={{
                        border: "1px solid var(--ui-border)",
                        borderRadius: 12,
                        padding: 12,
                      }}
                    >
                      <div style={{ fontSize: 13, opacity: 0.7 }}>{p.estado}</div>
                      <p style={{ whiteSpace: "pre-wrap" }}>{p.texto}</p>
                      {p.notaSupervisor ? (
                        <p style={{ fontSize: 13 }}>Nota del supervisor: {p.notaSupervisor}</p>
                      ) : null}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          ) : null}
        </section>
      ) : null}

      {tab === "cierre" && !loading && !error && cierre ? (
        <section>

          {cierre.rol === "direccion" ? (
            cierre.cierres.length === 0 ? (
              <p>No hay cierres entregados para esta fecha.</p>
            ) : (
              <ul style={{ listStyle: "none", padding: 0, display: "grid", gap: 10 }}>
                {cierre.cierres.map((c) => (
                  <li
                    key={c.id}
                    style={{ border: "1px solid var(--ui-border)", borderRadius: 12, padding: 12 }}
                  >
                    <strong>{c.supervisor?.nombre ?? "Supervisor"}</strong>
                    <p>{c.comentario || "Sin comentario"}</p>
                    {c.resumenJson ? <Resumen personas={c.resumenJson.personas} totales={c.resumenJson.totales} /> : <p>Este cierre no tiene resumen guardado.</p>}
                  </li>
                ))}
              </ul>
            )
          ) : (
            <>
              <Resumen personas={cierre.personas} totales={cierre.totales} />

              {cierre.puedeEntregar ? (
                <div style={{ display: "grid", gap: 10, maxWidth: 640 }}>
                  <label style={{ display: "grid", gap: 4 }}>
                    Comentario para dirección
                    <textarea
                      value={comentario}
                      onChange={(e) => setComentario(e.target.value)}
                      rows={3}
                      style={{ fontSize: 16, padding: 10 }}
                    />
                  </label>
                  <button
                    type="button"
                    style={btnPrimary}
                    onClick={() =>
                      void actuar(() => entregarCierre(token!, { fecha: fechaCierre, comentario })
                        .then(() => {
                          setOk("Cierre entregado a dirección.");
                          return cargarCierre();
                        })
                        .catch((e) => { throw e; }))
                    }
                  >
                    Entregar a dirección
                  </button>
                </div>
              ) : (
                <p>
                  Ya entregaste el cierre de este día
                  {cierre.cierre?.comentario ? `: ${cierre.cierre.comentario}` : "."}
                </p>
              )}
            </>
          )}
        </section>
      ) : null}
    </main>
  );
}

const columnas = [
  ['programadas', 'Programadas'], ['terminadas', 'Terminadas'], ['en_revision', 'En revisión'],
  ['no_cumplidas', 'No cumplidas'], ['sin_empezar', 'Sin empezar'], ['en_curso', 'En curso'],
] as const;
function Resumen({ personas, totales }: { personas: PersonaCierre[]; totales: Record<string, number> }) {
  return <>
    <dl className={styles.totales}>{[...columnas, ['checadas', 'Checadas'], ['retardos', 'Retardos'], ['faltas', 'Faltas']].map(([key, label]) =>
      <div key={key}><dt>{label}</dt><dd>{totales[key] ?? 0}</dd></div>)}</dl>
    {!personas.length ? <p>No hay personas en este equipo para la fecha elegida.</p> :
      <div className={styles.personas}>{personas.map((p) => <article key={p.userId}>
        <h3>{p.nombre}</h3>
        <dl>{columnas.map(([key, label]) => <div key={key}><dt>{label}</dt><dd>{p[key]}</dd></div>)}</dl>
        <p>Checó: {p.checo ? 'Sí' : 'No'} · Retardo: {p.retardo ? p.minutosTarde + ' min' : '—'} · Falta: {p.falta ? 'Sí' : '—'}</p>
      </article>)}</div>}
  </>;
}
