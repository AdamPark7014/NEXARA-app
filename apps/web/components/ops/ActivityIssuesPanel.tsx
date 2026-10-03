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
import { Badge, Button, EmptyState, Field, FieldGrid, Input, Select, SkeletonRows, Textarea, type Tone } from "@/components/base";
import s from "./ActivityIssuesPanel.module.css";
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

/** Severidad → tono de la insignia (y del borde de la tarjeta). */
const SEVERITY_TONE: Record<IncidentSeverity, Tone> = {
  BAJA: "neutral",
  MEDIA: "warning",
  ALTA: "warning",
  CRITICA: "danger",
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
    return <SkeletonRows rows={3} label="Cargando…" />;
  }

  return (
    <div className={s.panel}>
      {/* ── Incidencias ──────────────────────────────────────────────── */}
      <section className={s.bloque} aria-label="Incidencias">
        <div className={s.cabeza}>
          <h3 className={s.titulo}>
            Incidencias <span className={s.cuantas}>({incidencias.length})</span>
          </h3>
          {canManage && (
            <Button size="sm" variant={abriendoIncidencia ? "tertiary" : "secondary"} onClick={() => setAbriendoIncidencia((v) => !v)}>
              {abriendoIncidencia ? "Cancelar" : "Registrar incidencia"}
            </Button>
          )}
        </div>

        <p className={s.ayuda}>
          Lo que impidió o retrasó el trabajo. Tipificarlo permite contar: si
          &ldquo;faltó material&rdquo; encabeza la lista del mes, el problema está en almacén,
          no en campo.
        </p>

        {abriendoIncidencia && (
          <div className={s.alta}>
            <FieldGrid columns={3}>
              <Field label="Tipo">
                <Select
                  value={formIncidencia.tipo}
                  onChange={(e) => setFormIncidencia({ ...formIncidencia, tipo: e.target.value as IncidentType })}
                >
                  {INCIDENT_TYPES.map((t) => (
                    <option key={t} value={t}>
                      {INCIDENT_TYPE_LABEL[t]}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Severidad">
                <Select
                  value={formIncidencia.severidad}
                  onChange={(e) =>
                    setFormIncidencia({
                      ...formIncidencia,
                      severidad: e.target.value as IncidentSeverity,
                    })
                  }
                >
                  {INCIDENT_SEVERITIES.map((sev) => (
                    <option key={sev} value={sev}>
                      Severidad {SEVERITY_LABEL[sev].toLowerCase()}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Horas perdidas" optional>
                <Input
                  type="number"
                  min={0}
                  step={0.5}
                  placeholder="Horas perdidas"
                  value={formIncidencia.horasPerdidas}
                  onChange={(e) => setFormIncidencia({ ...formIncidencia, horasPerdidas: e.target.value })}
                />
              </Field>
            </FieldGrid>
            <Field label="Qué pasó" required>
              <Textarea
                rows={2}
                placeholder="Qué pasó"
                value={formIncidencia.descripcion}
                onChange={(e) => setFormIncidencia({ ...formIncidencia, descripcion: e.target.value })}
              />
            </Field>
            <Field label="Qué se hizo en el momento" optional>
              <Input
                placeholder="Qué se hizo en el momento (opcional)"
                value={formIncidencia.accionTomada}
                onChange={(e) => setFormIncidencia({ ...formIncidencia, accionTomada: e.target.value })}
              />
            </Field>
            <div className={s.altaPie}>
              <Button
                variant="primary"
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
          <EmptyState tone="success" size="compact" title="Sin incidencias registradas en este servicio." />
        ) : (
          <ul className={s.lista}>
            {incidencias.map((i) => (
              <li
                key={i.id}
                className={s.item}
                data-tono={i.resueltoAt ? "resuelta" : SEVERITY_TONE[i.severidad]}
              >
                <div className={s.itemTexto}>
                  <p className={s.itemT}>
                    {INCIDENT_TYPE_LABEL[i.tipo]}
                    <Badge tone={i.resueltoAt ? "neutral" : SEVERITY_TONE[i.severidad]} size="sm">
                      {SEVERITY_LABEL[i.severidad]}
                    </Badge>
                    {i.resueltoAt ? (
                      <Badge tone="success" size="sm">
                        Resuelta
                      </Badge>
                    ) : null}
                  </p>
                  <p className={s.itemD}>{i.descripcion}</p>
                  {i.accionTomada && <p className={s.itemA}>Acción: {i.accionTomada}</p>}
                  <p className={s.itemM}>
                    {i.reportadoPor ? `Reportó ${i.reportadoPor.nombre}` : "Sin reportante"}
                    {Number(i.horasPerdidas ?? 0) > 0 && ` · ${Number(i.horasPerdidas)} h perdidas`}
                    {i.resueltoAt && ` · resuelta${i.resueltoPor ? ` por ${i.resueltoPor.nombre}` : ""}`}
                  </p>
                </div>
                {canManage && (
                  <Button
                    size="sm"
                    variant={i.resueltoAt ? "ghost" : "tonal"}
                    onClick={() => (i.resueltoAt ? reabrir(i) : cerrarIncidencia(i))}
                  >
                    {i.resueltoAt ? "Reabrir" : "Resolver"}
                  </Button>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* ── Recomendaciones ──────────────────────────────────────────── */}
      <section className={`${s.bloque} ${s.bloqueSep}`} aria-label="Recomendaciones al cliente">
        <div className={s.cabeza}>
          <h3 className={s.titulo}>
            Recomendaciones al cliente <span className={s.cuantas}>({recomendaciones.length})</span>
          </h3>
          {canManage && (
            <Button size="sm" variant={abriendoRec ? "tertiary" : "secondary"} onClick={() => setAbriendoRec((v) => !v)}>
              {abriendoRec ? "Cancelar" : "Registrar recomendación"}
            </Button>
          )}
        </div>

        <p className={s.ayuda}>
          Lo que hay que cambiar y el técnico ve en sitio. Al enlazarse con una
          cotización, llega a Ventas en vez de quedarse en el reporte.
        </p>

        {abriendoRec && (
          <div className={s.alta}>
            <FieldGrid columns={3}>
              <Field label="Tipo">
                <Select value={formRec.tipo} onChange={(e) => setFormRec({ ...formRec, tipo: e.target.value as RecommendationType })}>
                  {RECOMMENDATION_TYPES.map((t) => (
                    <option key={t} value={t}>
                      {RECOMMENDATION_TYPE_LABEL[t]}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Prioridad">
                <Select
                  value={formRec.prioridad}
                  onChange={(e) => setFormRec({ ...formRec, prioridad: e.target.value as RecommendationPriority })}
                >
                  {RECOMMENDATION_PRIORITIES.map((p) => (
                    <option key={p} value={p}>
                      Prioridad {PRIORITY_LABEL[p].toLowerCase()}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Costo estimado" optional>
                <Input
                  type="number"
                  min={0}
                  step={0.01}
                  placeholder="Costo estimado"
                  value={formRec.costoEstimado}
                  onChange={(e) => setFormRec({ ...formRec, costoEstimado: e.target.value })}
                />
              </Field>
            </FieldGrid>
            <Field label="Qué se recomienda y por qué" required>
              <Textarea
                rows={2}
                placeholder="Qué se recomienda y por qué"
                value={formRec.descripcion}
                onChange={(e) => setFormRec({ ...formRec, descripcion: e.target.value })}
              />
            </Field>
            <div className={s.altaPie}>
              <Button
                variant="primary"
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
          <EmptyState tone="neutral" size="compact" title="Sin recomendaciones registradas en este servicio." />
        ) : (
          <ul className={s.lista}>
            {recomendaciones.map((r) => (
              <li key={r.id} className={s.item} data-tono="info">
                <div className={s.itemTexto}>
                  <p className={s.itemT}>
                    {RECOMMENDATION_TYPE_LABEL[r.tipo]}
                    <Badge tone="outline" size="sm">
                      {PRIORITY_LABEL[r.prioridad]} · {RECOMMENDATION_STATUS_LABEL[r.estado]}
                    </Badge>
                  </p>
                  <p className={s.itemD}>{r.descripcion}</p>
                  <p className={s.itemM}>
                    {r.creadoPor ? `Propuso ${r.creadoPor.nombre}` : "Sin autor"}
                    {Number(r.costoEstimado ?? 0) > 0 && ` · estimado $${Number(r.costoEstimado).toLocaleString("es-MX")}`}
                    {r.cotizacion && ` · cotización ${r.cotizacion.quoteNumber}`}
                  </p>
                </div>
                {canManage && r.estado === "ABIERTA" && (
                  <Button size="sm" variant="ghost" onClick={() => cambiarEstadoRec(r, "DESCARTADA")}>
                    Descartar
                  </Button>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
