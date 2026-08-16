"use client";

/**
 * NEXARA · Incidencias y recomendaciones de un servicio
 * ------------------------------------------------------
 * Antes esto se escribía en la hoja de servicio como texto libre, así que no se
 * podía contar cuántas veces se fue en balde por falta de material, ni qué
 * cliente niega el acceso con frecuencia.
 *
 * La recomendación, además, cierra una costura: al enlazarla con una cotización,
 * lo que ve el técnico en sitio llega a Ventas en vez de morir en el reporte.
 */

import { useCallback, useEffect, useState } from "react";
import Button from "@/components/ui/Button";
import { toast } from "@/components/Toast";
import {
  INCIDENT_TYPES,
  INCIDENT_TYPE_LABEL,
  INCIDENT_SEVERITIES,
  PRIORITY_LABEL,
  RECOMMENDATION_PRIORITIES,
  RECOMMENDATION_STATUS_LABEL,
  RECOMMENDATION_TYPES,
  RECOMMENDATION_TYPE_LABEL,
  SEVERITY_LABEL,
  addIncident,
  addRecommendation,
  listIncidents,
  listRecommendations,
  reopenIncident,
  resolveIncident,
  updateRecommendation,
  type Incident,
  type IncidentSeverity,
  type IncidentType,
  type Recommendation,
  type RecommendationPriority,
  type RecommendationStatus,
  type RecommendationType,
} from "@/lib/activity-issues-api";

const inp: React.CSSProperties = {
  width: "100%",
  padding: "7px 9px",
  border: "1px solid var(--border)",
  borderRadius: 7,
  background: "var(--surface-2)",
  color: "var(--foreground)",
  fontSize: 12.5,
  boxSizing: "border-box",
};

const SEVERITY_COLOR: Record<IncidentSeverity, string> = {
  BAJA: "#64748b",
  MEDIA: "#ca8a04",
  ALTA: "#ea580c",
  CRITICA: "#dc2626",
};

export default function ActivityIssuesPanel({
  activityId,
  token,
  canManage,
}: {
  activityId: number;
  token: string;
  canManage: boolean;
}) {
  const [incidencias, setIncidencias] = useState<Incident[]>([]);
  const [recomendaciones, setRecomendaciones] = useState<Recommendation[]>([]);
  const [cargando, setCargando] = useState(true);

  const cargar = useCallback(async () => {
    if (!token || !activityId) return;
    setCargando(true);
    try {
      const [i, r] = await Promise.all([
        listIncidents(token, activityId),
        listRecommendations(token, activityId),
      ]);
      setIncidencias(i);
      setRecomendaciones(r);
    } catch {
      // Sin permiso de lectura el panel simplemente no muestra nada; el detalle
      // de la actividad no debe romperse por eso.
    } finally {
      setCargando(false);
    }
  }, [token, activityId]);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  // ── Alta de incidencia ──────────────────────────────────────────────────

  const [formIncidencia, setFormIncidencia] = useState<{
    tipo: IncidentType;
    severidad: IncidentSeverity;
    descripcion: string;
    accionTomada: string;
    horasPerdidas: string;
  }>({
    tipo: "FALTA_MATERIAL",
    severidad: "MEDIA",
    descripcion: "",
    accionTomada: "",
    horasPerdidas: "",
  });
  const [abriendoIncidencia, setAbriendoIncidencia] = useState(false);
  const [guardandoIncidencia, setGuardandoIncidencia] = useState(false);

  const registrarIncidencia = async () => {
    setGuardandoIncidencia(true);
    try {
      await addIncident(token, activityId, {
        tipo: formIncidencia.tipo,
        severidad: formIncidencia.severidad,
        descripcion: formIncidencia.descripcion,
        accionTomada: formIncidencia.accionTomada || undefined,
        horasPerdidas: formIncidencia.horasPerdidas
          ? Number(formIncidencia.horasPerdidas)
          : undefined,
      });
      setFormIncidencia({
        tipo: "FALTA_MATERIAL",
        severidad: "MEDIA",
        descripcion: "",
        accionTomada: "",
        horasPerdidas: "",
      });
      setAbriendoIncidencia(false);
      await cargar();
      toast.success("Incidencia registrada");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo registrar");
    } finally {
      setGuardandoIncidencia(false);
    }
  };

  const cerrarIncidencia = async (i: Incident) => {
    try {
      await resolveIncident(token, activityId, i.id);
      await cargar();
      toast.success("Incidencia resuelta");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo resolver");
    }
  };

  const reabrir = async (i: Incident) => {
    try {
      await reopenIncident(token, activityId, i.id);
      await cargar();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo reabrir");
    }
  };

  // ── Alta de recomendación ───────────────────────────────────────────────

  const [formRec, setFormRec] = useState<{
    tipo: RecommendationType;
    prioridad: RecommendationPriority;
    descripcion: string;
    costoEstimado: string;
  }>({ tipo: "MEJORA", prioridad: "MEDIA", descripcion: "", costoEstimado: "" });
  const [abriendoRec, setAbriendoRec] = useState(false);
  const [guardandoRec, setGuardandoRec] = useState(false);

  const registrarRecomendacion = async () => {
    setGuardandoRec(true);
    try {
      await addRecommendation(token, activityId, {
        tipo: formRec.tipo,
        prioridad: formRec.prioridad,
        descripcion: formRec.descripcion,
        costoEstimado: formRec.costoEstimado ? Number(formRec.costoEstimado) : undefined,
      });
      setFormRec({ tipo: "MEJORA", prioridad: "MEDIA", descripcion: "", costoEstimado: "" });
      setAbriendoRec(false);
      await cargar();
      toast.success("Recomendación registrada");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo registrar");
    } finally {
      setGuardandoRec(false);
    }
  };

  const cambiarEstadoRec = async (r: Recommendation, estado: RecommendationStatus) => {
    try {
      await updateRecommendation(token, activityId, r.id, { estado });
      await cargar();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo actualizar");
    }
  };

  if (cargando) {
    return <p style={{ margin: 0, fontSize: 13, color: "var(--text-secondary)" }}>Cargando…</p>;
  }

  return (
    <div style={{ display: "grid", gap: 22 }}>
      {/* ── Incidencias ──────────────────────────────────────────────── */}
      <div>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
          <p style={{ margin: 0, fontWeight: 700, fontSize: 13 }}>
            Incidencias ({incidencias.length})
          </p>
          {canManage && (
            <Button size="sm" variant="secondary" onClick={() => setAbriendoIncidencia((v) => !v)}>
              {abriendoIncidencia ? "Cancelar" : "Registrar incidencia"}
            </Button>
          )}
        </div>

        <p style={{ margin: "0 0 10px", fontSize: 11.5, color: "var(--text-secondary)", lineHeight: 1.5 }}>
          Lo que impidió o retrasó el trabajo. Tipificarlo permite contar: si
          &ldquo;faltó material&rdquo; encabeza la lista del mes, el problema está en almacén,
          no en campo.
        </p>

        {abriendoIncidencia && (
          <div
            style={{
              display: "grid",
              gap: 8,
              padding: 12,
              marginBottom: 12,
              border: "1px solid var(--border)",
              borderRadius: 10,
              background: "var(--surface-2)",
            }}
          >
            <div style={{ display: "grid", gap: 8, gridTemplateColumns: "1fr 1fr 120px" }}>
              <select
                value={formIncidencia.tipo}
                onChange={(e) =>
                  setFormIncidencia({ ...formIncidencia, tipo: e.target.value as IncidentType })
                }
                style={inp}
              >
                {INCIDENT_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {INCIDENT_TYPE_LABEL[t]}
                  </option>
                ))}
              </select>
              <select
                value={formIncidencia.severidad}
                onChange={(e) =>
                  setFormIncidencia({
                    ...formIncidencia,
                    severidad: e.target.value as IncidentSeverity,
                  })
                }
                style={inp}
              >
                {INCIDENT_SEVERITIES.map((s) => (
                  <option key={s} value={s}>
                    Severidad {SEVERITY_LABEL[s].toLowerCase()}
                  </option>
                ))}
              </select>
              <input
                type="number"
                min={0}
                step={0.5}
                placeholder="Horas perdidas"
                value={formIncidencia.horasPerdidas}
                onChange={(e) =>
                  setFormIncidencia({ ...formIncidencia, horasPerdidas: e.target.value })
                }
                style={inp}
              />
            </div>
            <textarea
              rows={2}
              placeholder="Qué pasó"
              value={formIncidencia.descripcion}
              onChange={(e) =>
                setFormIncidencia({ ...formIncidencia, descripcion: e.target.value })
              }
              style={{ ...inp, resize: "vertical", fontFamily: "inherit", lineHeight: 1.45 }}
            />
            <input
              placeholder="Qué se hizo en el momento (opcional)"
              value={formIncidencia.accionTomada}
              onChange={(e) =>
                setFormIncidencia({ ...formIncidencia, accionTomada: e.target.value })
              }
              style={inp}
            />
            <div style={{ display: "flex", justifyContent: "flex-end" }}>
              <Button
                size="sm"
                onClick={registrarIncidencia}
                loading={guardandoIncidencia}
                disabled={!formIncidencia.descripcion.trim()}
              >
                Registrar
              </Button>
            </div>
          </div>
        )}

        {incidencias.length === 0 ? (
          <p style={{ margin: 0, fontSize: 12.5, color: "var(--text-tertiary)" }}>
            Sin incidencias registradas en este servicio.
          </p>
        ) : (
          <div style={{ display: "grid", gap: 8 }}>
            {incidencias.map((i) => (
              <div
                key={i.id}
                style={{
                  display: "flex",
                  gap: 10,
                  alignItems: "flex-start",
                  padding: "10px 12px",
                  border: "1px solid var(--border)",
                  borderLeft: `3px solid ${i.resueltoAt ? "var(--border)" : SEVERITY_COLOR[i.severidad]}`,
                  borderRadius: 10,
                  background: "var(--surface)",
                  opacity: i.resueltoAt ? 0.7 : 1,
                }}
              >
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{ margin: 0, fontSize: 13, fontWeight: 600 }}>
                    {INCIDENT_TYPE_LABEL[i.tipo]}
                    <span
                      style={{
                        marginLeft: 8,
                        fontSize: 11,
                        fontWeight: 600,
                        color: SEVERITY_COLOR[i.severidad],
                      }}
                    >
                      {SEVERITY_LABEL[i.severidad]}
                    </span>
                  </p>
                  <p style={{ margin: "3px 0 0", fontSize: 12.5, lineHeight: 1.45 }}>
                    {i.descripcion}
                  </p>
                  {i.accionTomada && (
                    <p style={{ margin: "3px 0 0", fontSize: 12, color: "var(--text-secondary)" }}>
                      Acción: {i.accionTomada}
                    </p>
                  )}
                  <p style={{ margin: "4px 0 0", fontSize: 11.5, color: "var(--text-tertiary)" }}>
                    {i.reportadoPor ? `Reportó ${i.reportadoPor.nombre}` : "Sin reportante"}
                    {Number(i.horasPerdidas ?? 0) > 0 && ` · ${Number(i.horasPerdidas)} h perdidas`}
                    {i.resueltoAt &&
                      ` · resuelta${i.resueltoPor ? ` por ${i.resueltoPor.nombre}` : ""}`}
                  </p>
                </div>
                {canManage && (
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => (i.resueltoAt ? reabrir(i) : cerrarIncidencia(i))}
                  >
                    {i.resueltoAt ? "Reabrir" : "Resolver"}
                  </Button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── Recomendaciones ──────────────────────────────────────────── */}
      <div style={{ borderTop: "1px solid var(--border)", paddingTop: 16 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
          <p style={{ margin: 0, fontWeight: 700, fontSize: 13 }}>
            Recomendaciones al cliente ({recomendaciones.length})
          </p>
          {canManage && (
            <Button size="sm" variant="secondary" onClick={() => setAbriendoRec((v) => !v)}>
              {abriendoRec ? "Cancelar" : "Registrar recomendación"}
            </Button>
          )}
        </div>

        <p style={{ margin: "0 0 10px", fontSize: 11.5, color: "var(--text-secondary)", lineHeight: 1.5 }}>
          Lo que hay que cambiar y el técnico ve en sitio. Al enlazarse con una
          cotización, llega a Ventas en vez de quedarse en el reporte.
        </p>

        {abriendoRec && (
          <div
            style={{
              display: "grid",
              gap: 8,
              padding: 12,
              marginBottom: 12,
              border: "1px solid var(--border)",
              borderRadius: 10,
              background: "var(--surface-2)",
            }}
          >
            <div style={{ display: "grid", gap: 8, gridTemplateColumns: "1fr 1fr 140px" }}>
              <select
                value={formRec.tipo}
                onChange={(e) => setFormRec({ ...formRec, tipo: e.target.value as RecommendationType })}
                style={inp}
              >
                {RECOMMENDATION_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {RECOMMENDATION_TYPE_LABEL[t]}
                  </option>
                ))}
              </select>
              <select
                value={formRec.prioridad}
                onChange={(e) =>
                  setFormRec({ ...formRec, prioridad: e.target.value as RecommendationPriority })
                }
                style={inp}
              >
                {RECOMMENDATION_PRIORITIES.map((p) => (
                  <option key={p} value={p}>
                    Prioridad {PRIORITY_LABEL[p].toLowerCase()}
                  </option>
                ))}
              </select>
              <input
                type="number"
                min={0}
                step={0.01}
                placeholder="Costo estimado"
                value={formRec.costoEstimado}
                onChange={(e) => setFormRec({ ...formRec, costoEstimado: e.target.value })}
                style={inp}
              />
            </div>
            <textarea
              rows={2}
              placeholder="Qué se recomienda y por qué"
              value={formRec.descripcion}
              onChange={(e) => setFormRec({ ...formRec, descripcion: e.target.value })}
              style={{ ...inp, resize: "vertical", fontFamily: "inherit", lineHeight: 1.45 }}
            />
            <div style={{ display: "flex", justifyContent: "flex-end" }}>
              <Button
                size="sm"
                onClick={registrarRecomendacion}
                loading={guardandoRec}
                disabled={!formRec.descripcion.trim()}
              >
                Registrar
              </Button>
            </div>
          </div>
        )}

        {recomendaciones.length === 0 ? (
          <p style={{ margin: 0, fontSize: 12.5, color: "var(--text-tertiary)" }}>
            Sin recomendaciones registradas en este servicio.
          </p>
        ) : (
          <div style={{ display: "grid", gap: 8 }}>
            {recomendaciones.map((r) => (
              <div
                key={r.id}
                style={{
                  display: "flex",
                  gap: 10,
                  alignItems: "flex-start",
                  padding: "10px 12px",
                  border: "1px solid var(--border)",
                  borderRadius: 10,
                  background: "var(--surface)",
                }}
              >
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{ margin: 0, fontSize: 13, fontWeight: 600 }}>
                    {RECOMMENDATION_TYPE_LABEL[r.tipo]}
                    <span style={{ marginLeft: 8, fontSize: 11, color: "var(--text-secondary)" }}>
                      {PRIORITY_LABEL[r.prioridad]} · {RECOMMENDATION_STATUS_LABEL[r.estado]}
                    </span>
                  </p>
                  <p style={{ margin: "3px 0 0", fontSize: 12.5, lineHeight: 1.45 }}>
                    {r.descripcion}
                  </p>
                  <p style={{ margin: "4px 0 0", fontSize: 11.5, color: "var(--text-tertiary)" }}>
                    {r.creadoPor ? `Propuso ${r.creadoPor.nombre}` : "Sin autor"}
                    {Number(r.costoEstimado ?? 0) > 0 &&
                      ` · estimado $${Number(r.costoEstimado).toLocaleString("es-MX")}`}
                    {r.cotizacion && ` · cotización ${r.cotizacion.quoteNumber}`}
                  </p>
                </div>
                {canManage && r.estado === "ABIERTA" && (
                  <Button size="sm" variant="ghost" onClick={() => cambiarEstadoRec(r, "DESCARTADA")}>
                    Descartar
                  </Button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
