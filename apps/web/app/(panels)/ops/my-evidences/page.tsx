"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import PageHeader from "@/components/ui/PageHeader";
import Section from "@/components/ui/Section";
import Button from "@/components/ui/Button";
import { Tag } from "@/components/ui/DataTable";
import EmptyState from "@/components/ui/EmptyState";
import { useUser } from "@/components/UserContext";
import { buildApiUrl } from "@/lib/api-base";
import { getEvidencesSectionConfig } from "@/lib/section-views";

interface Evidence {
  id: number;
  tipoEvidencia: string;
  archivoUrl: string;
  estatus: string;
  comentarios?: string | null;
  subidoEn: string;
  actividad?: { id: number; anNumber?: string; titulo?: string } | null;
}

async function apiFetch(path: string, token: string, init: RequestInit = {}) {
  const res = await fetch(buildApiUrl(path), { ...init, headers: { Authorization: `Bearer ${token}`, ...(init.headers as Record<string, string> ?? {}) } });
  if (!res.ok) throw new Error(await res.text().catch(() => `HTTP ${res.status}`));
  if (res.status === 204) return null;
  const t = await res.text();
  return t ? JSON.parse(t) : null;
}

function tipoIcon(tipo: string): string {
  const t = tipo.toLowerCase();
  if (t.includes("foto")) return "📸";
  if (t.includes("video")) return "🎥";
  if (t.includes("firma")) return "✍️";
  return "📄";
}

function tipoGradient(tipo: string): string {
  const t = tipo.toLowerCase();
  if (t.includes("foto")) return "linear-gradient(135deg, #1e293b, #475569)";
  if (t.includes("video")) return "linear-gradient(135deg, #581c87, #7c3aed)";
  return "linear-gradient(135deg, #064e3b, #047857)";
}

export default function MyEvidencesPage() {
  const { user } = useUser();
  const router = useRouter();
  const searchParams = useSearchParams();
  const activityFilter = searchParams.get("activityId");
  const cfg = useMemo(() => getEvidencesSectionConfig(user), [user]);
  const token = user?.token ?? "";

  useEffect(() => {
    if (cfg.viewMode === "manage" && cfg.defaultScope === "team") {
      router.replace("/ops/evidences");
    }
  }, [cfg, router]);

  const [items, setItems] = useState<Evidence[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true); setError(null);
    try {
      const data = await apiFetch("evidences?limit=60", token);
      setItems(Array.isArray(data) ? data : (data?.data ?? []));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error al cargar tus evidencias");
    } finally { setLoading(false); }
  }, [token]);

  useEffect(() => { void load(); }, [load]);

  const pendientes = items.filter((e) => e.estatus === "Pendiente").length;
  const rechazadas = items.filter((e) => e.estatus === "Rechazada").length;

  const visibleItems = useMemo(() => {
    if (!activityFilter) return items;
    const aid = Number(activityFilter);
    if (Number.isNaN(aid)) return items;
    return items.filter((e) => e.actividad?.id === aid);
  }, [items, activityFilter]);

  const estadoVariant = (s: string): "positive" | "warning" | "danger" => s === "Aprobada" ? "positive" : s === "Rechazada" ? "danger" : "warning";

  return (
    <>
      <PageHeader
        eyebrow="OPS · Campo"
        title={cfg.title}
        subtitle={cfg.subtitle}
        actions={<Button variant="ghost" iconLeft="🔄" onClick={() => void load()}>Actualizar</Button>}
      />

      {(pendientes > 0 || rechazadas > 0) && (
        <div style={{ display: "flex", gap: 12, marginBottom: 18, padding: 14, background: "color-mix(in srgb, var(--warning) 8%, transparent)", border: "1px solid color-mix(in srgb, var(--warning) 30%, transparent)", borderRadius: 12 }}>
          <span style={{ fontSize: 20 }}>⚠️</span>
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 3 }}>Tienes pendientes</div>
            <div style={{ fontSize: 12.5, color: "var(--text-secondary)" }}>{pendientes} evidencias sin aprobar · {rechazadas} rechazadas por revisar</div>
          </div>
        </div>
      )}

      <Section title="Capturas recientes">
        {activityFilter && (
          <p style={{ fontSize: 12, color: "var(--text-secondary)", marginBottom: 12 }}>
            Filtrando por actividad <strong>#{activityFilter}</strong>.{" "}
            <Link href="/ops/my-evidences" style={{ color: "var(--primary)" }}>Ver todas</Link>
          </p>
        )}
        {loading && <EmptyState icon="⏳" title="Cargando…" description="Consultando tus evidencias." />}
        {!loading && error && <EmptyState icon="⚠️" title="No se pudo cargar" description={error} action={<Button size="sm" variant="secondary" onClick={() => void load()}>Reintentar</Button>} />}
        {!loading && !error && visibleItems.length === 0 && <EmptyState icon="📷" title="Sin evidencias" description="Sube tu primera evidencia desde el detalle de una actividad." />}
        {!loading && !error && visibleItems.length > 0 && (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: 12 }}>
            {visibleItems.map((e) => (
              <article key={e.id} style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 12, overflow: "hidden" }}>
                <a href={buildApiUrl(e.archivoUrl)} target="_blank" rel="noreferrer" style={{ display: "block", textDecoration: "none" }}>
                  <div style={{ height: 120, background: tipoGradient(e.tipoEvidencia), display: "flex", alignItems: "center", justifyContent: "center", fontSize: 40, color: "white", position: "relative" }}>
                    {tipoIcon(e.tipoEvidencia)}
                    <div style={{ position: "absolute", top: 8, right: 8 }}>
                      <Tag variant={estadoVariant(e.estatus)}>{e.estatus}</Tag>
                    </div>
                  </div>
                </a>
                <div style={{ padding: 12 }}>
                  <div style={{ fontWeight: 700, fontSize: 12.5, marginBottom: 4 }}>{e.tipoEvidencia}</div>
                  <div style={{ fontSize: 11, color: "var(--text-tertiary)" }}>{e.actividad?.anNumber ?? `Act-${e.actividad?.id}`} · {e.actividad?.titulo?.slice(0, 30) ?? ""}</div>
                  <div style={{ fontSize: 11, color: "var(--text-tertiary)", marginTop: 4 }}>{new Date(e.subidoEn).toLocaleString("es-MX", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}</div>
                  {e.comentarios && (
                    <div style={{ marginTop: 8, padding: "6px 8px", fontSize: 11, background: "color-mix(in srgb, var(--surface-2) 60%, transparent)", borderRadius: 6, color: "var(--text-secondary)", fontStyle: "italic" }}>
                      {e.comentarios}
                    </div>
                  )}
                </div>
              </article>
            ))}
          </div>
        )}
      </Section>
    </>
  );
}
