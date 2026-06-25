"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import PageHeader from "@/components/ui/PageHeader";
import Section from "@/components/ui/Section";
import Button from "@/components/ui/Button";
import { Tag } from "@/components/ui/DataTable";
import EmptyState from "@/components/ui/EmptyState";
import { useUser } from "@/components/UserContext";
import { getActivitiesSectionConfig } from "@/lib/section-views";
import { buildApiUrl } from "@/lib/api-base";

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
}

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

export default function MyActivitiesPage() {
  const { user } = useUser();
  const router = useRouter();
  const token = user?.token ?? "";
  const cfg = useMemo(() => getActivitiesSectionConfig(user), [user]);

  useEffect(() => {
    if (cfg.viewMode === "manage" && cfg.defaultScope === "team") {
      router.replace("/ops/activities");
    }
  }, [cfg, router]);

  const [tab, setTab] = useState<"hoy" | "semana" | "todas">("hoy");
  const [items, setItems] = useState<ActivityRow[]>([]);
  const [loading, setLoading] = useState(true);
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

  useEffect(() => { void load(); }, [load]);

  const filtered = useMemo(() => {
    if (tab === "hoy") return items.filter((a) => isToday(a.fechaEntregaEsperada || a.fechaAsignacion));
    if (tab === "semana") return items.filter((a) => isThisWeek(a.fechaEntregaEsperada || a.fechaAsignacion));
    return items;
  }, [items, tab]);

  const counts = {
    completadas: filtered.filter((a) => a.estatus === "Finalizado").length,
    enCurso: filtered.filter((a) => a.estatus === "En Proceso").length,
    pendientes: filtered.filter((a) => a.estatus !== "Finalizado" && a.estatus !== "En Proceso").length,
  };

  const updateStatus = async (a: ActivityRow, estatus: string) => {
    if (!token) return;
    try {
      const body: Record<string, unknown> = { estatus };
      if (estatus === "En Proceso") body.fechaInicio = new Date().toISOString();
      if (estatus === "Finalizado") body.fechaFinalizacion = new Date().toISOString();
      await apiFetch(`activities/${a.id}`, token, { method: "PATCH", body: JSON.stringify(body) });
      void load();
    } catch (e) {
      alert(`Error: ${e instanceof Error ? e.message : "desconocido"}`);
    }
  };

  const estadoVariant = (e: string): "positive" | "warning" | "default" => e === "Finalizado" ? "positive" : e === "En Proceso" ? "warning" : "default";

  return (
    <>
      <PageHeader
        eyebrow="OPS · Campo"
        title={cfg.title}
        subtitle={cfg.subtitle}
        actions={<Button variant="ghost" iconLeft="🔄" onClick={() => void load()}>Actualizar</Button>}
      />

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 12, marginBottom: 18 }}>
        {[
          { label: "OT en esta vista", value: filtered.length, color: "var(--primary)", icon: "📋" },
          { label: "Completadas", value: counts.completadas, color: "var(--success)", icon: "✓" },
          { label: "En curso", value: counts.enCurso, color: "var(--warning)", icon: "⏳" },
          { label: "Pendientes", value: counts.pendientes, color: "var(--text-secondary)", icon: "○" },
        ].map((k) => (
          <div key={k.label} style={{ padding: 16, background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 12, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div>
              <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--text-tertiary)" }}>{k.label}</div>
              <div style={{ marginTop: 4, fontFamily: "var(--nx-font-display)", fontSize: 28, fontWeight: 700, color: k.color, lineHeight: 1 }}>{k.value}</div>
            </div>
            <span style={{ fontSize: 24 }}>{k.icon}</span>
          </div>
        ))}
      </div>

      <div style={{ display: "flex", gap: 8, marginBottom: 16, flexWrap: "wrap" }}>
        {(["hoy", "semana", "todas"] as const).map((t) => (
          <button key={t} type="button" onClick={() => setTab(t)} style={{
            padding: "7px 16px", fontSize: 12.5, fontWeight: 600, borderRadius: 999,
            border: tab === t ? "1px solid var(--primary)" : "1px solid var(--border)",
            background: tab === t ? "color-mix(in srgb, var(--primary) 10%, transparent)" : "var(--surface)",
            color: tab === t ? "var(--primary)" : "var(--text-primary)", cursor: "pointer", fontFamily: "inherit", textTransform: "capitalize",
          }}>
            {t}
          </button>
        ))}
      </div>

      {loading && <EmptyState icon="⏳" title="Cargando…" description="Consultando tus actividades asignadas." />}
      {!loading && error && <EmptyState icon="⚠️" title="No se pudo cargar" description={error} action={<Button size="sm" variant="secondary" onClick={() => void load()}>Reintentar</Button>} />}
      {!loading && !error && filtered.length === 0 && <EmptyState icon="📅" title="Sin actividades" description="No tienes OT asignadas en este rango." />}

      {!loading && !error && filtered.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {filtered.map((a) => (
            <article key={a.id} style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 16, padding: 18, display: "grid", gridTemplateColumns: "auto 1fr auto", gap: 16, alignItems: "center" }}>
              <div style={{
                width: 64, height: 64, borderRadius: 14,
                background: a.estatus === "Finalizado" ? "color-mix(in srgb, var(--success) 14%, transparent)" : a.estatus === "En Proceso" ? "color-mix(in srgb, var(--warning) 14%, transparent)" : "var(--surface-2)",
                color: a.estatus === "Finalizado" ? "var(--success)" : a.estatus === "En Proceso" ? "var(--warning)" : "var(--text-secondary)",
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
                {a.estatus !== "En Proceso" && a.estatus !== "Finalizado" && (
                  <Button variant="primary" iconLeft="▶" onClick={() => void updateStatus(a, "En Proceso")}>Iniciar</Button>
                )}
                {a.estatus === "En Proceso" && (
                  <Button variant="primary" iconLeft="✓" onClick={() => void updateStatus(a, "Finalizado")}>Finalizar</Button>
                )}
                <Link href={`/ops/activities/${a.id}`} style={{ textDecoration: "none" }}>
                  <Button variant="ghost" size="sm">Ver detalle</Button>
                </Link>
                <Link href="/ops/my-evidences" style={{ textDecoration: "none" }}>
                  <Button variant="secondary" iconLeft="📸" size="sm">Subir evidencia</Button>
                </Link>
              </div>
            </article>
          ))}
        </div>
      )}
    </>
  );
}
