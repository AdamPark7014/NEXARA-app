"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type Dispatch, type SetStateAction } from "react";
import Link from "next/link";
import { useUser } from "@/components/UserContext";
import { formatApiError } from "@/lib/erp-api";
import ExcelExportadorDinamico from "@/components/excel/ExcelExportadorDinamico";
import BuscadorCliente from "@/components/supervision/BuscadorCliente";
import BuscadorProyecto from "@/components/supervision/BuscadorProyecto";
import {
  devolverPlan,
  entregarCierre,
  enviarPlan,
  fetchCierre,
  fetchEquipoSupervision,
  fetchPlanes,
  hoyLocal,
  mananaLocal,
  marcarProgramado,
  nuevoRenglonLocal,
  programarRenglon,
  programarTodo,
  renglonesDesdeTextoLibreLocal,
  type CierreResponse,
  type PlanRenglon,
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
  const { token, user } = useUser();
  const roleKey = String((user as { roleKey?: string } | null)?.roleKey ?? "");
  const esDireccion = roleKey === "ceo";
  const [tab, setTab] = useState<Tab>(esDireccion ? "cierre" : "plan");
  const [fechaPlan, setFechaPlan] = useState(mananaLocal);
  const [renglones, setRenglones] = useState<PlanRenglon[]>([nuevoRenglonLocal()]);
  const [pegar, setPegar] = useState("");
  const [equipo, setEquipo] = useState<Array<{ id: number; nombre: string }>>([]);
  const [planes, setPlanes] = useState<PlanesResponse | null>(null);
  const [fechaCierre, setFechaCierre] = useState(hoyLocal);
  const [cierre, setCierre] = useState<CierreResponse | null>(null);
  const [comentario, setComentario] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const requestId = useRef(0);
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [expandido, setExpandido] = useState<Record<number, boolean>>({});

  useEffect(() => {
    if (esDireccion) setTab("cierre");
  }, [esDireccion]);

  const cargarPlan = useCallback(async () => {
    if (!token) return;
    const request = ++requestId.current;
    setLoading(true);
    setError(null);
    try {
      const [data, eq] = await Promise.all([
        fetchPlanes(token, fechaPlan),
        fetchEquipoSupervision(token),
      ]);
      if (request === requestId.current) {
        setPlanes(data);
        setEquipo(eq.equipo ?? []);
      }
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

  const actualizarRenglon = (id: string, patch: Partial<PlanRenglon>) => {
    setRenglones((prev) => prev.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  };

  const onEnviar = async () => {
    if (!token || busy) return;
    setError(null);
    setOk(null);
    setBusy(true);
    try {
      await enviarPlan(token, { fecha: fechaPlan, renglones });
      setOk("Plan estructurado enviado.");
      setRenglones([nuevoRenglonLocal()]);
      await cargarPlan();
    } catch (e) {
      setError(formatApiError(e, "No se pudo enviar el plan."));
    } finally {
      setBusy(false);
    }
  };

  const vacioPlan = !loading && !error && planes && planes.planes.length === 0;
  const ind = planes?.indicadores;
  const actuar = async (fn: () => Promise<unknown>, mensaje: string) => {
    if (busy) return;
    setBusy(true); setError(null); setOk(null);
    try { await fn(); setOk(mensaje); await (tab === 'plan' ? cargarPlan() : cargarCierre()); }
    catch (e) { setError(formatApiError(e)); }
    finally { setBusy(false); }
  };
  const filasCierreExcel = useMemo(() => {
    if (!cierre) return [];
    const grupos = cierre.rol === 'supervisor'
      ? [{ nombre: user?.nombre ?? 'Supervisor', personas: cierre.personas }]
      : cierre.cierres.map(c => ({nombre: c.supervisor?.nombre ?? 'Supervisor', personas: c.resumenJson?.personas ?? []}));
    return grupos.flatMap(g => g.personas.map(p => ({fecha: cierre.fecha, supervisor: g.nombre, persona: p.nombre,
      programadas: p.programadas, cumplidas: p.terminadas, revision: p.en_revision, incumplidas: p.no_cumplidas,
      asistencia: p.checo, retardo: p.retardo, falta: p.falta})));
  }, [cierre, user?.nombre]);

  const filasExcel = useMemo(() => {
    if (!planes) return [];
    return planes.planes.flatMap((p) =>
      (p.renglones?.length ? p.renglones : [{ id: "t", actividad: p.texto, personaNombre: p.autor?.nombre ?? "", como: "", porque: "", clienteNombre: "", proyectoNombre: "", horarioEstimado: "", prioridad: "media", actividadCreadaId: null, personaId: null, clienteId: null, proyectoId: null, actividadId: null }]).map((r) => ({
        fecha: planes.fecha,
        coordinador: p.autor?.nombre ?? "",
        estado: p.estado,
        persona: r.personaNombre,
        actividad: r.actividad,
        como: r.como,
        porque: r.porque,
        cliente: r.clienteNombre,
        proyecto: r.proyectoNombre,
        horario: r.horarioEstimado,
        prioridad: r.prioridad,
      })),
    );
  }, [planes]);

  if (!token) return <main><h1>Supervisión</h1><p>Inicia sesión para consultar los planes y cierres.</p></main>;
  return (
    <main
      style={{
        padding: 16,
        minWidth: 0,
        overflowWrap: "anywhere",
        maxWidth: 1200,
        margin: "0 auto",
        color: "var(--ui-fg)",
        background: "var(--ui-bg)",
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap", alignItems: "flex-start" }}>
        <div>
          <h1 style={{ fontSize: 28, margin: "0 0 4px" }}>Supervisión</h1>
          <p style={{ margin: 0, color: "var(--ui-fg-2)", fontSize: 14 }}>
            Organiza las actividades del equipo y compara lo planeado con lo realizado.
          </p>
        </div>
        {tab === 'plan' && !loading && !error && filasExcel.length ? (
          <ExcelExportadorDinamico
            preferenciaKey="nx-excel-cols-supervision"
            titulo="Supervisión — planes"
            filename={`supervision-planes-${fechaPlan}`}
            rows={filasExcel}
            getFecha={(r) => r.fecha}
            generadoPor={(user as { nombre?: string } | null)?.nombre}
            columns={[
              { key: "fecha", label: "Fecha" },
              { key: "coordinador", label: "Coordinador" },
              { key: "persona", label: "Persona" },
              { key: "actividad", label: "Actividad" },
              { key: "cliente", label: "Cliente" },
              { key: "proyecto", label: "Proyecto" },
              { key: "horario", label: "Horario" },
              { key: "prioridad", label: "Prioridad" },
              { key: "estado", label: "Estado" },
            ]}
          />
        ) : null}
        {tab === 'cierre' && !loading && !error && filasCierreExcel.length ? (
          <ExcelExportadorDinamico preferenciaKey="nx-excel-cols-supervision-cierres" titulo="Supervisión — cierre diario"
            filename={`supervision-cierre-${fechaCierre}`} rows={filasCierreExcel} getFecha={r => r.fecha}
            getPersonaArea={r => `${r.persona} ${r.supervisor}`} generadoPor={user?.nombre}
            columns={[
              {key:'fecha',label:'Fecha'}, {key:'supervisor',label:'Supervisor'}, {key:'persona',label:'Persona'},
              {key:'programadas',label:'Programadas',tipo:'entero',total:'suma'}, {key:'cumplidas',label:'Cumplidas',tipo:'entero',total:'suma'},
              {key:'revision',label:'En revisión',tipo:'entero',total:'suma'}, {key:'incumplidas',label:'No cumplidas',tipo:'entero',total:'suma'},
              {key:'asistencia',label:'Registró asistencia',tipo:'booleano'}, {key:'retardo',label:'Retardo',tipo:'booleano'}, {key:'falta',label:'Falta',tipo:'booleano'},
            ]}/>
        ) : null}
      </div>

      <div style={{ display: "flex", gap: 8, margin: "16px 0", flexWrap: "wrap" }}>
        <button type="button" style={tab === "plan" ? btnPrimary : btn} onClick={() => { requestId.current++; setError(null); setOk(null); setTab("plan"); }}>
          Plan de mañana
        </button>
        <button type="button" style={tab === "cierre" ? btnPrimary : btn} onClick={() => { requestId.current++; setError(null); setOk(null); setTab("cierre"); }}>
          {esDireccion ? "Cierres recibidos" : "Cierre del día"}
        </button>
      </div>

      {error ? <p role="alert" style={{ color: "var(--ui-danger, #b42318)" }}>{error} <button type="button" onClick={() => void (tab === 'plan' ? cargarPlan() : cargarCierre())}>Reintentar</button></p> : null}
      {ok ? <p style={{ color: "var(--ui-success, #067647)" }}>{ok}</p> : null}

      <label style={{ display: "grid", gap: 4, marginBottom: 16, maxWidth: 220 }}>
        Fecha
        <input
          type="date"
          value={tab === "plan" ? fechaPlan : fechaCierre}
          style={{ minHeight: 44, fontSize: 16, padding: 8, width: "100%", boxSizing: "border-box" }}
          onChange={(e) => {
            if (tab === "plan") setFechaPlan(e.target.value);
            else setFechaCierre(e.target.value);
          }}
        />
      </label>

      {loading ? <p role="status">Cargando…</p> : null}

      {tab === "plan" && !loading && !error ? (
        <section>
          {planes?.puedeEnviar !== false ? (
            <div style={{ display: "grid", gap: 12, marginBottom: 24 }}>
              <label style={{ display: "grid", gap: 4 }}>
                Pegar texto libre (se parte en renglones)
                <textarea
                  value={pegar}
                  onChange={(e) => setPegar(e.target.value)}
                  rows={3}
                  placeholder={"Ana: Instalar 4 cámaras en IPADE\nLuis - Revisar NVR cliente X"}
                  style={{ fontSize: 16, padding: 10 }}
                />
              </label>
              <button
                type="button"
                style={btn}
                onClick={() => {
                  const rows = renglonesDesdeTextoLibreLocal(pegar);
                  if (rows.length) setRenglones(rows);
                }}
              >
                Separar en renglones
              </button>

              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
                  <thead>
                    <tr style={{ textAlign: "left", borderBottom: "1px solid var(--ui-border)" }}>
                      {["Persona", "Qué (actividad)", "Cómo / alcance", "Por qué", "Horario", "Cliente", "Proyecto", "Prioridad", ""].map((h) => (
                        <th key={h} style={{ padding: "8px 6px", position: "sticky", top: 0, background: "var(--ui-bg)" }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {renglones.map((r) => (
                      <tr key={r.id} style={{ borderBottom: "1px solid var(--ui-border)" }}>
                        <td style={{ padding: 6 }}>
                          <select
                            value={r.personaId ?? ""}
                            onChange={(e) => {
                              const id = e.target.value ? Number(e.target.value) : null;
                              const nom = equipo.find((x) => x.id === id)?.nombre ?? "";
                              actualizarRenglon(r.id, { personaId: id, personaNombre: nom });
                            }}
                            style={{ minHeight: 40, fontSize: 16, width: "100%" }}
                          >
                            <option value="">—</option>
                            {equipo.map((p) => (
                              <option key={p.id} value={p.id}>{p.nombre}</option>
                            ))}
                          </select>
                        </td>
                        {([
                          ["actividad", "actividad"],
                          ["como", "cómo"],
                          ["porque", "por qué"],
                          ["horarioEstimado", "09:00"],
                        ] as const).map(([key, ph]) => (
                          <td key={key} style={{ padding: 6 }}>
                            <input
                              value={String(r[key] ?? "")}
                              placeholder={ph}
                              onChange={(e) => actualizarRenglon(r.id, { [key]: e.target.value } as Partial<PlanRenglon>)}
                              style={{ minHeight: 40, fontSize: 16, width: "100%", boxSizing: "border-box" }}
                            />
                          </td>
                        ))}
                        <td style={{ padding: 6 }}>
                          {token ? (
                            <BuscadorCliente
                              token={token}
                              valueId={r.clienteId}
                              valueNombre={r.clienteNombre}
                              onPick={(id, nombre) => actualizarRenglon(r.id, { clienteId: id, clienteNombre: nombre })}
                            />
                          ) : null}
                        </td>
                        <td style={{ padding: 6 }}>
                          {token ? (
                            <BuscadorProyecto
                              token={token}
                              valueId={r.proyectoId}
                              valueNombre={r.proyectoNombre}
                              onPick={(id, nombre) => actualizarRenglon(r.id, { proyectoId: id, proyectoNombre: nombre })}
                            />
                          ) : null}
                        </td>
                        <td style={{ padding: 6 }}>
                          <select
                            value={r.prioridad}
                            onChange={(e) => actualizarRenglon(r.id, { prioridad: e.target.value as PlanRenglon["prioridad"] })}
                            style={{ minHeight: 40, fontSize: 16 }}
                          >
                            <option value="alta">Alta</option>
                            <option value="media">Media</option>
                            <option value="baja">Baja</option>
                          </select>
                        </td>
                        <td style={{ padding: 6 }}>
                          <button type="button" style={btn} aria-label="Quitar renglón" onClick={() => setRenglones((prev) => prev.filter((x) => x.id !== r.id))}>
                            Quitar
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                <button type="button" style={btn} onClick={() => setRenglones((prev) => [...prev, nuevoRenglonLocal()])}>
                  Agregar renglón
                </button>
                <button
                  type="button"
                  style={btnPrimary}
                  disabled={busy || !renglones.some((r) => r.actividad.trim().length >= 3)}
                  onClick={() => void onEnviar()}
                >
                  Enviar plan
                </button>
              </div>
            </div>
          ) : (
            <p>Consulta los planes recibidos y el cierre que corresponde a tu rol.</p>
          )}

          {planes?.rol === "supervisor" ? (
            <>
              {ind ? (
                <div className={styles.totales} style={{ marginBottom: 16 }}>
                  {[
                    ["Planes recibidos", ind.planesRecibidos],
                    ["Faltantes", planes.faltantes.length],
                    ["Actividades en plan", ind.actividadesProgramadas],
                    ["Personas sin asignación", ind.personasSinAsignacion],
                    ["Conflictos de horario", ind.conflictosHorario.length],
                  ].map(([label, val]) => (
                    <div key={String(label)}>
                      <dt>{label}</dt>
                      <dd>{val}</dd>
                    </div>
                  ))}
                </div>
              ) : null}

              {vacioPlan ? (
                <div style={{ border: "1px dashed var(--ui-border)", borderRadius: 12, padding: 16, marginBottom: 16 }}>
                  <h2 style={{ fontSize: 18, marginTop: 0 }}>Aún no hay planes para esta fecha</h2>
                  <p style={{ color: "var(--ui-fg-2)" }}>
                    Quienes deben mandar el plan hoy (o para la fecha elegida) aparecen abajo. Pídeles un plan por renglones: persona, qué, cómo, por qué, cliente/proyecto y horario.
                  </p>
                  {planes.faltantes.length ? (
                    <ul>
                      {planes.faltantes.map((f) => (
                        <li key={f.id}>{f.nombre} · {f.email}</li>
                      ))}
                    </ul>
                  ) : (
                    <p>No hay coordinadores esperados configurados para tu árbol.</p>
                  )}
                </div>
              ) : null}

              {planes.faltantes.length && !vacioPlan ? (
                <div style={{ marginBottom: 16 }}>
                  <h2 style={{ fontSize: 18 }}>Faltan por mandar</h2>
                  <ul>{planes.faltantes.map((f) => <li key={f.id}>{f.nombre}</li>)}</ul>
                </div>
              ) : null}

              <div style={{ display: "grid", gap: 12 }}>
                {planes.planes.map((p) => (
                  <article key={p.id} style={{ border: "1px solid var(--ui-border)", borderRadius: 12, padding: 14, background: "var(--ui-elev-1)" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", gap: 8, flexWrap: "wrap" }}>
                      <strong>{p.autor?.nombre ?? "Coordinador"}</strong>
                      <span style={{ fontSize: 13, opacity: 0.75 }}>{p.estado}</span>
                    </div>
                    {(p.renglones?.length ? p.renglones : []).length === 0 ? (
                      <p style={{ whiteSpace: "pre-wrap" }}>{p.texto}</p>
                    ) : (
                      <div style={{ overflowX: "auto", marginTop: 8 }}>
                        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                          <thead>
                            <tr style={{ textAlign: "left" }}>
                              {["Persona", "Qué", "Cómo", "Por qué", "Cliente", "Proyecto", "Horario", ""].map((h) => (
                                <th key={h} style={{ padding: "4px 6px" }}>{h}</th>
                              ))}
                            </tr>
                          </thead>
                          <tbody>
                            {p.renglones!.map((r) => (
                              <tr key={r.id} style={{ borderTop: "1px solid var(--ui-border)" }}>
                                <td style={{ padding: 6 }}>{r.personaNombre || "—"}</td>
                                <td style={{ padding: 6 }}>{r.actividad}</td>
                                <td style={{ padding: 6 }}>{r.como || "—"}</td>
                                <td style={{ padding: 6 }}>{r.porque || "—"}</td>
                                <td style={{ padding: 6 }}>{r.clienteNombre || "—"}</td>
                                <td style={{ padding: 6 }}>{r.proyectoNombre || "—"}</td>
                                <td style={{ padding: 6 }}>{r.horarioEstimado || "—"}</td>
                                <td style={{ padding: 6 }}>
                                  {r.actividadCreadaId ? (
                                    <Link href={`/erp/actividades/${r.actividadCreadaId}`}>Actividad #{r.actividadCreadaId}</Link>
                                  ) : (
                                    <button
                                      type="button"
                                      style={btnPrimary}
                                      disabled={busy}
                                      onClick={() =>
                                        void actuar(() => programarRenglon(token!, p.id, r.id), 'Actividad programada.')
                                      }
                                    >
                                      Programar
                                    </button>
                                  )}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                    <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 10 }}>
                      <button type="button" style={btn} disabled={busy} onClick={() => void actuar(async () => {
                        const resultado = await programarTodo(token!, p.id);
                        const errores = resultado.resultados.filter(r => r.error);
                        if (errores.length) throw new Error(`${errores.length} renglones no se programaron: ${errores.map(r => r.error).join('; ')}. Actualiza para revisar los que sí se programaron.`);
                      }, 'Se programaron todos los renglones.')}>
                        Programar todo
                      </button>
                      <button type="button" style={btn} disabled={busy} onClick={() => void actuar(() => marcarProgramado(token!, p.id), 'Plan marcado como programado.')}>
                        Marcar plan programado
                      </button>
                      <button
                        type="button"
                        style={btn}
                        disabled={busy}
                        onClick={() => {
                          const nota = window.prompt("Nota para devolver el plan (opcional)");
                          if (nota === null) return;
                          void actuar(() => devolverPlan(token!, p.id, nota || undefined), 'Plan devuelto al autor.');
                        }}
                      >
                        Devolver
                      </button>
                      <Link href="/erp/pizarra" style={{ ...btn, display: "inline-flex", alignItems: "center", textDecoration: "none" }}>
                        Ir a pizarra
                      </Link>
                    </div>
                  </article>
                ))}
              </div>
            </>
          ) : null}

          {planes?.rol === "autor" ? (
            <div>
              <h2 style={{ fontSize: 18 }}>Tu historial</h2>
              {planes.planes.length === 0 ? (
                <p>Todavía no has mandado plan para esta fecha. Usa la tabla de renglones arriba.</p>
              ) : (
                <ul style={{ listStyle: "none", padding: 0, display: "grid", gap: 10 }}>
                  {planes.planes.map((p) => (
                    <li key={p.id} style={{ border: "1px solid var(--ui-border)", borderRadius: 12, padding: 12 }}>
                      <div style={{ fontSize: 13, opacity: 0.7 }}>{p.estado}</div>
                      <p style={{ whiteSpace: "pre-wrap" }}>{p.texto}</p>
                      {p.notaSupervisor ? <p style={{ fontSize: 13 }}>Nota del supervisor: {p.notaSupervisor}</p> : null}
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
              <div style={{ border: "1px dashed var(--ui-border)", borderRadius: 12, padding: 16 }}>
                <h2 style={{ fontSize: 18, marginTop: 0 }}>Sin cierres recibidos</h2>
                <p>Cuando el supervisor general entregue el cierre del día, aparecerá aquí con KPIs y detalle por persona.</p>
              </div>
            ) : (
              <ul style={{ listStyle: "none", padding: 0, display: "grid", gap: 10 }}>
                {cierre.cierres.map((c) => (
                  <li key={c.id} style={{ border: "1px solid var(--ui-border)", borderRadius: 12, padding: 12 }}>
                    <strong>{c.supervisor?.nombre ?? "Supervisor"}</strong>
                    <p>{c.comentario || "Sin comentario"}</p>
                    {c.resumenJson ? <Resumen personas={c.resumenJson.personas} totales={c.resumenJson.totales} expandido={expandido} setExpandido={setExpandido} /> : <p>Este cierre no tiene resumen guardado.</p>}
                  </li>
                ))}
              </ul>
            )
          ) : (
            <>
              {cierre.planVsReal ? (
                <p style={{ fontSize: 14 }}>
                  Plan vs real: {cierre.planVsReal.cumplidos}/{cierre.planVsReal.planificados} cumplidos ·{" "}
                  {cierre.planVsReal.sinProgramar} sin programar · {cierre.planVsReal.conActividad} con actividad creada
                </p>
              ) : null}
              <Resumen personas={cierre.personas} totales={cierre.totales} expandido={expandido} setExpandido={setExpandido} />
              {cierre.puedeEntregar ? (
                <div style={{ display: "grid", gap: 10, maxWidth: 640 }}>
                  <label style={{ display: "grid", gap: 4 }}>
                    Comentario para dirección
                    <textarea value={comentario} onChange={(e) => setComentario(e.target.value)} rows={3} style={{ fontSize: 16, padding: 10 }} />
                  </label>
                  <button
                    type="button"
                    style={btnPrimary}
                    disabled={busy}
                    onClick={() =>
                      void actuar(() => entregarCierre(token!, { fecha: fechaCierre, comentario }), 'Cierre entregado a dirección.')
                    }
                  >
                    Entregar a dirección
                  </button>
                </div>
              ) : (
                <p>Ya entregaste el cierre de este día{cierre.cierre?.comentario ? `: ${cierre.cierre.comentario}` : "."}</p>
              )}
            </>
          )}
        </section>
      ) : null}
    </main>
  );
}

const columnas = [
  ["programadas", "Programadas"],
  ["terminadas", "Cumplidas"],
  ["en_revision", "En revisión"],
  ["no_cumplidas", "No cumplidas"],
  ["sin_empezar", "Sin empezar"],
  ["en_curso", "En curso"],
] as const;

function Resumen({
  personas,
  totales,
  expandido,
  setExpandido,
}: {
  personas: PersonaCierre[];
  totales: Record<string, number>;
  expandido: Record<number, boolean>;
  setExpandido: Dispatch<SetStateAction<Record<number, boolean>>>;
}) {
  return (
    <>
      <dl className={styles.totales}>
        {[...columnas, ["checadas", "Asistencia"], ["retardos", "Retardos"], ["faltas", "Faltas"]].map(([key, label]) => (
          <div key={key}>
            <dt>{label}</dt>
            <dd>{totales[key] ?? 0}</dd>
          </div>
        ))}
      </dl>
      {!personas.length ? (
        <p>No hay personas en este equipo para la fecha elegida.</p>
      ) : (
        <div className={styles.personas}>
          {personas.map((p) => (
            <article key={p.userId}>
              <button
                type="button"
                onClick={() => setExpandido((prev) => ({ ...prev, [p.userId]: !prev[p.userId] }))}
                style={{ all: "unset", cursor: "pointer", display: "block", width: "100%" }}
              >
                <h3 style={{ margin: "0 0 6px" }}>{p.nombre}</h3>
              </button>
              <dl>
                {columnas.map(([key, label]) => (
                  <div key={key}>
                    <dt>{label}</dt>
                    <dd>{p[key]}</dd>
                  </div>
                ))}
              </dl>
              <p>
                Checó: {p.checo ? "Sí" : "No"} · Retardo: {p.retardo ? `${p.minutosTarde} min` : "—"} · Falta: {p.falta ? "Sí" : "—"}
              </p>
              {expandido[p.userId] ? (
                <div style={{ fontSize: 13, color: "var(--ui-fg-2)" }}>
                  <p style={{ margin: "0 0 6px" }}>
                    Detalle expandido · <Link href={`/erp/hr/${p.userId}`}>Ver ficha</Link>
                    {" · "}
                    <Link href="/erp/pizarra">Pizarra</Link>
                  </p>
                  {(p.actividades ?? []).length ? (
                    <ul style={{ margin: 0, paddingLeft: 18 }}>
                      {p.actividades!.map((a) => (
                        <li key={a.id}>
                          <Link href={`/erp/actividades/${a.id}`}>{a.titulo}</Link> · {a.estatus}
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p style={{ margin: 0 }}>Sin actividades del día.</p>
                  )}
                </div>
              ) : null}
            </article>
          ))}
        </div>
      )}
    </>
  );
}
