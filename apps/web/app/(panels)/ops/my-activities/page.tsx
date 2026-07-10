"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import PageHeader from "@/components/ui/PageHeader";
import Section from "@/components/ui/Section";
import KpiCard from "@/components/ui/KpiCard";
import Button from "@/components/ui/Button";
import { Tag } from "@/components/ui/DataTable";
import EmptyState from "@/components/ui/EmptyState";
import { useUser } from "@/components/UserContext";
import { getActivitiesSectionConfig } from "@/lib/section-views";
import { useOpsCanonicalRoute } from "@/lib/use-ops-canonical-route";
import { buildApiUrl } from "@/lib/api-base";
import { activityStatusVariant, isActivityCompleted, isActivityInProgress } from "@/lib/activity-status";
import { toast } from "@/components/Toast";
import FilterToolbar from "@/components/FilterToolbar";
import { exportToCsv } from "@/lib/export-csv";
import {
  canStartActivity,
  fieldActionLabel,
  isEvidenceApproved,
  isEvidenceLocked,
  type ActivityEvidenceSummary,
} from "@/lib/evidence-lock";

interface ActivityEvidenceInfo extends ActivityEvidenceSummary {
  reviewedBy?: { nombre?: string } | null;
}

interface ActivityRow {
  id: number;
  anNumber: string;
  titulo: string;
  descripcion?: string | null;
  estatus: string;
  branchName?: string | null;
  branchAddress?: string | null;
  fechaAsignacion: string;
  fechaInicio?: string | null;
  fechaEntregaEsperada?: string | null;
  fechaFinalizacion?: string | null;
  client?: { name: string } | null;
  activityEvidence?: ActivityEvidenceInfo | null;
}

interface EvidenceRow {
  id: number;
  tipoEvidencia: string;
  archivoUrl: string;
  estatus: string;
  comentarios?: string | null;
  subidoEn: string;
  userId?: number | null;
  actividad?: { id: number; anNumber?: string; titulo?: string } | null;
}

type ViewTab = "actividades" | "evidencias";
type RangeTab = "hoy" | "semana" | "todas";

async function apiFetch(path: string, token: string, init: RequestInit = {}) {
  const res = await fetch(buildApiUrl(path), {
    ...init,
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", ...(init.headers as Record<string, string> ?? {}) },
  });
  if (!res.ok) throw new Error(await res.text().catch(() => `HTTP ${res.status}`));
  if (res.status === 204) return null;
  const t = await res.text();
  return t ? JSON.parse(t) : null;
}

function isToday(iso: string): boolean {
  const d = new Date(iso);
  const today = new Date();
  return d.toDateString() === today.toDateString();
}
function isThisWeek(iso: string): boolean {
  const d = new Date(iso).getTime();
  const now = Date.now();
  return d <= now + 7 * 86400000 && d >= now - 7 * 86400000;
}

async function captureGeolocation(): Promise<{ latitud: number; longitud: number } | null> {
  if (typeof navigator === "undefined" || !navigator.geolocation) return null;
  return new Promise((resolve) => {
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve({ latitud: pos.coords.latitude, longitud: pos.coords.longitude }),
      () => resolve(null),
      { enableHighAccuracy: true, timeout: 12000, maximumAge: 5000 },
    );
  });
}

async function sendActivityGps(
  token: string,
  activityId: number,
  coords: { latitud: number; longitud: number },
  active: boolean,
) {
  await fetch(buildApiUrl("gps"), {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      actividadId: activityId,
      latitud: coords.latitud,
      longitud: coords.longitud,
      estaActivo: active,
      ultimaActualizacion: new Date().toISOString(),
    }),
  });
}

export default function MyActivitiesPage() {
  const { user } = useUser();
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = user?.token ?? "";
  const cfg = useMemo(() => getActivitiesSectionConfig(user), [user]);
  useOpsCanonicalRoute(user, "activities");

  const viewTab: ViewTab = searchParams.get("tab") === "evidencias" ? "evidencias" : "actividades";
  const [rangeTab, setRangeTab] = useState<RangeTab>("hoy");
  const [searchQ, setSearchQ] = useState("");
  const [items, setItems] = useState<ActivityRow[]>([]);
  const [evidences, setEvidences] = useState<EvidenceRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [evLoading, setEvLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true); setError(null);
    try {
      const data = await apiFetch("activities?scope=mine", token);
      setItems(Array.isArray(data) ? data : (data?.data ?? []));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error al cargar tus actividades");
    } finally { setLoading(false); }
  }, [token]);

  const loadEvidences = useCallback(async () => {
    if (!token || !user?.id) return;
    setEvLoading(true);
    try {
      const data = await apiFetch("activity-evidence/history", token);
      const rows = Array.isArray(data) ? data : (data?.data ?? []);
      setEvidences(rows);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error al cargar tus evidencias");
    } finally { setEvLoading(false); }
  }, [token, user?.id]);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => { if (viewTab === "evidencias") void loadEvidences(); }, [viewTab, loadEvidences]);

  const filtered = useMemo(() => {
    if (rangeTab === "hoy") return items.filter((a) => isToday(a.fechaEntregaEsperada || a.fechaAsignacion));
    if (rangeTab === "semana") return items.filter((a) => isThisWeek(a.fechaEntregaEsperada || a.fechaAsignacion));
    return items;
  }, [items, rangeTab]);

  const visibleItems = useMemo(() => {
    if (!searchQ.trim()) return filtered;
    const q = searchQ.toLowerCase();
    return filtered.filter((a) =>
      a.anNumber.toLowerCase().includes(q) ||
      a.titulo.toLowerCase().includes(q) ||
      (a.client?.name ?? "").toLowerCase().includes(q) ||
      (a.branchName ?? "").toLowerCase().includes(q) ||
      (a.branchAddress ?? "").toLowerCase().includes(q)
    );
  }, [filtered, searchQ]);

  const counts = {
    completadas: visibleItems.filter((a) => isActivityCompleted(a.estatus) || isEvidenceApproved(a.activityEvidence)).length,
    enCurso: visibleItems.filter((a) => isActivityInProgress(a.estatus) && !isEvidenceLocked(a.activityEvidence)).length,
    pendientes: visibleItems.filter((a) => !isActivityCompleted(a.estatus) && !isActivityInProgress(a.estatus) && !isEvidenceLocked(a.activityEvidence)).length,
  };

  const updateStatus = async (a: ActivityRow, estatus: string) => {
    if (!token) return;
    try {
      const body: Record<string, unknown> = { estatus };
      if (estatus === "En Proceso") body.fechaInicio = new Date().toISOString();
      await apiFetch(`activities/${a.id}/execute`, token, { method: "PATCH", body: JSON.stringify(body) });

      const coords = await captureGeolocation();
      if (coords) {
        await sendActivityGps(token, a.id, coords, estatus === "En Proceso");
      }

      void load();
    } catch (e) {
      toast.error(`Error: ${e instanceof Error ? e.message : "desconocido"}`);
    }
  };

  const estadoVariant = activityStatusVariant;

  return (
    <>
      <PageHeader
        eyebrow="OPS · Campo"
        title={cfg.title}
        subtitle={cfg.subtitle}
        actions={<Button variant="ghost" iconLeft="🔄" onClick={() => void load()}>Actualizar</Button>}
      />

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 12, marginBottom: 14 }}>
        <KpiCard label="OT en esta vista" value={visibleItems.length} icon="📋" />
        <KpiCard label="Completadas" value={counts.completadas} icon="✅" variant={counts.completadas > 0 ? "positive" : "default"} />
        <KpiCard label="En curso" value={counts.enCurso} icon="⏳" variant={counts.enCurso > 0 ? "accent" : "default"} />
        <KpiCard label="Pendientes" value={counts.pendientes} icon="⏱️" variant={counts.pendientes > 0 ? "warning" : "positive"} />
      </div>

      {visibleItems.length > 0 && (() => {
        const total = visibleItems.length;
        const bars = [
          { label: "Completadas", count: counts.completadas, color: "var(--success)" },
          { label: "En curso", count: counts.enCurso, color: "var(--warning)" },
          { label: "Pendientes", count: counts.pendientes, color: "var(--text-tertiary)" },
        ].filter(b => b.count > 0);
        return (
          <div style={{ marginBottom: 14, padding: "10px 16px", background: "var(--surface-2)", border: "1px solid var(--border)", borderRadius: 10 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: "var(--text-tertiary)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 8 }}>Progreso de mis OTs</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {bars.map(b => (
                <div key={b.label} style={{ display: "grid", gridTemplateColumns: "90px 1fr 36px", gap: 10, alignItems: "center" }}>
                  <span style={{ fontSize: 12, color: "var(--text-secondary)", fontWeight: 500 }}>{b.label}</span>
                  <div style={{ height: 6, borderRadius: 3, background: "var(--surface)", overflow: "hidden" }}>
                    <div style={{ height: "100%", width: `${(b.count / total) * 100}%`, background: b.color, borderRadius: 3 }} />
                  </div>
                  <span style={{ fontSize: 11.5, color: "var(--text-tertiary)", textAlign: "right" }}>{b.count}</span>
                </div>
              ))}
            </div>
          </div>
        );
      })()}

      <div style={{ display: "flex", alignItems: "center", borderBottom: "1px solid var(--border)", marginBottom: 16, gap: 4 }}>
        {(["actividades", "evidencias"] as const).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => router.replace(t === "evidencias" ? "/ops/my-activities?tab=evidencias" : "/ops/my-activities")}
            style={{
              padding: "8px 16px", fontSize: 13, fontWeight: 600, cursor: "pointer", border: "none",
              borderBottom: viewTab === t ? "2px solid var(--primary)" : "2px solid transparent",
              background: "transparent", color: viewTab === t ? "var(--primary)" : "var(--text-secondary)",
              fontFamily: "inherit", textTransform: "capitalize",
            }}
          >
            {t}
          </button>
        ))}
      </div>

      {viewTab === "actividades" && (
      <>
      <FilterToolbar
        search={{ value: searchQ, onChange: setSearchQ, placeholder: "Buscar por OT, título, cliente o dirección…" }}
        onClear={() => setSearchQ("")}
        resultCount={loading ? null : visibleItems.length}
        rightActions={
          <Button variant="ghost" size="sm" iconLeft="⬇" onClick={() => exportToCsv(visibleItems, [
            { key: "anNumber", label: "OT" },
            { key: "titulo", label: "Título" },
            { key: "estatus", label: "Estado" },
            { key: "client", label: "Cliente", format: (v) => (v as { name: string } | null)?.name ?? "" },
            { key: "branchAddress", label: "Dirección" },
            { key: "fechaEntregaEsperada", label: "Fecha esperada", format: (v) => v ? new Date(String(v)).toLocaleDateString("es-MX") : "" },
          ], `mis-actividades-${rangeTab}`)}>CSV</Button>
        }
      />
      <div style={{ display: "flex", gap: 8, marginBottom: 16, flexWrap: "wrap" }}>
        {(["hoy", "semana", "todas"] as const).map((t) => (
          <button key={t} type="button" onClick={() => setRangeTab(t)} style={{
            padding: "7px 16px", fontSize: 12.5, fontWeight: 600, borderRadius: 999,
            border: rangeTab === t ? "1px solid var(--primary)" : "1px solid var(--border)",
            background: rangeTab === t ? "color-mix(in srgb, var(--primary) 10%, transparent)" : "var(--surface)",
            color: rangeTab === t ? "var(--primary)" : "var(--text-primary)", cursor: "pointer", fontFamily: "inherit", textTransform: "capitalize",
          }}>
            {t}
          </button>
        ))}
      </div>

      {loading && <EmptyState icon="⏳" title="Cargando…" description="Consultando tus actividades asignadas." />}
      {!loading && error && <EmptyState icon="⚠️" title="No se pudo cargar" description={error} action={<Button size="sm" variant="secondary" onClick={() => void load()}>Reintentar</Button>} />}
      {!loading && !error && visibleItems.length === 0 && <EmptyState icon="📅" title="Sin actividades" description={searchQ ? "Sin resultados para tu búsqueda." : "No tienes OT asignadas en este rango."} />}

      {!loading && !error && visibleItems.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {visibleItems.map((a) => (
            <article key={a.id} style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 16, padding: 18, display: "grid", gridTemplateColumns: "auto 1fr auto", gap: 16, alignItems: "center" }}>
              <div style={{
                width: 64, height: 64, borderRadius: 14,
                background: isActivityCompleted(a.estatus) ? "color-mix(in srgb, var(--success) 14%, transparent)" : isActivityInProgress(a.estatus) ? "color-mix(in srgb, var(--warning) 14%, transparent)" : "var(--surface-2)",
                color: isActivityCompleted(a.estatus) ? "var(--success)" : isActivityInProgress(a.estatus) ? "var(--warning)" : "var(--text-secondary)",
                display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", fontFamily: "var(--nx-font-display)", fontWeight: 700,
              }}>
                <div style={{ fontSize: 11, opacity: 0.8 }}>OT</div>
                <div style={{ fontSize: 13 }}>{a.anNumber}</div>
              </div>

              <div style={{ minWidth: 0 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6, flexWrap: "wrap" }}>
                  <Link href={`/ops/activities/${a.id}`} style={{ textDecoration: "none" }}>
                    <Tag variant="accent">{a.anNumber}</Tag>
                  </Link>
                  <Tag variant={estadoVariant(a.estatus)}>{a.estatus}</Tag>
                </div>
                <Link href={`/ops/activities/${a.id}`} style={{ textDecoration: "none", color: "inherit" }}>
                  <div style={{ fontFamily: "var(--nx-font-display)", fontWeight: 700, fontSize: 15.5 }}>{a.client?.name ?? a.branchName ?? "—"}</div>
                </Link>
                {a.branchAddress && <div style={{ fontSize: 12.5, color: "var(--text-secondary)", marginTop: 3 }}>📍 {a.branchAddress}</div>}
                <div style={{ fontSize: 12.5, color: "var(--text-primary)", marginTop: 6 }}>{a.titulo}</div>
                <div style={{ display: "flex", gap: 12, alignItems: "center", marginTop: 10, flexWrap: "wrap" }}>
                  <span style={{ fontSize: 11.5, color: "var(--text-tertiary)" }}>
                    ⏱ {a.fechaEntregaEsperada ? new Date(a.fechaEntregaEsperada).toLocaleString("es-MX", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }) : "Sin fecha límite"}
                  </span>
                </div>
              </div>

              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {canStartActivity(a.estatus, a.activityEvidence) && (
                  <Button variant="primary" iconLeft="▶" onClick={() => void updateStatus(a, "En Proceso")}>Iniciar</Button>
                )}
                {isEvidenceLocked(a.activityEvidence) && (
                  <Tag variant="warning">En revisión</Tag>
                )}
                {a.activityEvidence?.reviewStatus === "REJECTED" && (
                  <Tag variant="danger">Corrección requerida</Tag>
                )}
                {isEvidenceApproved(a.activityEvidence) && (
                  <Tag variant="positive">Aprobada</Tag>
                )}
                {(() => {
                  const action = fieldActionLabel(a.estatus, a.activityEvidence);
                  if (!action || action.label === "En revisión") return null;
                  return (
                    <Link href={`/ops/activities/${a.id}/${action.href}`} style={{ textDecoration: "none" }}>
                      <Button variant={action.variant} iconLeft="📸" size="sm">{action.label}</Button>
                    </Link>
                  );
                })()}
                <Link href={`/ops/activities/${a.id}`} style={{ textDecoration: "none" }}>
                  <Button variant="ghost" size="sm">Ver detalle</Button>
                </Link>
              </div>
            </article>
          ))}
        </div>
      )}
      </>
      )}

      {viewTab === "evidencias" && (
        <Section title="Mis evidencias">
          {evLoading && <EmptyState icon="⏳" title="Cargando…" description="Consultando tus evidencias." />}
          {!evLoading && evidences.length === 0 && (
            <EmptyState icon="📷" title="Sin evidencias" description="Sube evidencias desde el detalle de cada actividad asignada." />
          )}
          {!evLoading && evidences.length > 0 && (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: 12 }}>
              {evidences.map((e) => (
                <article key={e.id} style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 12, padding: 12 }}>
                  <div style={{ fontWeight: 700, fontSize: 12.5 }}>{e.tipoEvidencia}</div>
                  <div style={{ fontSize: 11, color: "var(--text-tertiary)", marginTop: 4 }}>
                    {e.actividad?.anNumber ?? `Act-${e.actividad?.id}`} · {e.estatus}
                  </div>
                  {e.actividad?.id && (
                    <Link href={`/ops/activities/${e.actividad.id}/evidences`} style={{ fontSize: 11.5, color: "var(--primary)" }}>
                      Ver actividad
                    </Link>
                  )}
                </article>
              ))}
            </div>
          )}
        </Section>
      )}
    </>
  );
}
