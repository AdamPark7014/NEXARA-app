"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import PageHeader from "@/components/ui/PageHeader";
import Section from "@/components/ui/Section";
import KpiCard from "@/components/ui/KpiCard";
import Button from "@/components/ui/Button";
import DataTable, { Tag, type Column } from "@/components/ui/DataTable";
import EmptyState from "@/components/ui/EmptyState";
import { useUser } from "@/components/UserContext";
import { getStudioSectionConfig } from "@/lib/section-views";
import { buildApiUrl } from "@/lib/api-base";
import FilterToolbar from "@/components/FilterToolbar";
import { exportToExcel } from "@/lib/export-excel";

interface Subscriber {
  id: number;
  email: string;
  name?: string | null;
  source?: string | null;
  subscribedAt: string;
}

async function apiFetch(path: string, token: string) {
  const res = await fetch(buildApiUrl(path), { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) throw new Error(await res.text().catch(() => `HTTP ${res.status}`));
  return res.json();
}

export default function StudioNewsletterPage() {
  const { user } = useUser();
  const cfg = useMemo(() => getStudioSectionConfig(user, "newsletter"), [user]);
  const token = user?.token ?? "";

  const [subs, setSubs] = useState<Subscriber[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");

  const load = useCallback(async (q?: string) => {
    if (!token) return;
    setLoading(true); setError(null);
    try {
      const qs = q ? `?search=${encodeURIComponent(q)}` : "";
      const data = await apiFetch(`newsletter${qs}`, token);
      setSubs(Array.isArray(data) ? data : (data?.data ?? []));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error al cargar suscriptores");
    } finally { setLoading(false); }
  }, [token]);

  useEffect(() => { void load(); }, [load]);

  const bySource = useMemo(() => {
    const map = new Map<string, number>();
    for (const s of subs) {
      const key = s.source ?? "web";
      map.set(key, (map.get(key) ?? 0) + 1);
    }
    return Array.from(map.entries()).sort((a, b) => b[1] - a[1]);
  }, [subs]);

  const exportCsv = () => {
    exportToExcel(subs, [
      { key: "email", label: "Email" },
      { key: "name", label: "Nombre", format: (v) => (v ? String(v) : "") },
      { key: "source", label: "Origen", format: (v) => (v ? String(v) : "web") },
      { key: "subscribedAt", label: "Suscrito", format: (v) => (v ? new Date(String(v)).toLocaleString("es-MX") : "") },
    ], "newsletter-suscriptores", "Suscriptores Newsletter");
  };

  const columns: Column<Subscriber>[] = [
    { key: "email", label: "Email", width: 240 },
    { key: "name", label: "Nombre", accessor: (s) => s.name ?? "—" },
    { key: "source", label: "Origen", render: (s) => <Tag variant="default">{s.source ?? "web"}</Tag>, width: 120 },
    { key: "subscribedAt", label: "Suscrito", render: (s) => <span style={{ fontSize: 12 }}>{new Date(s.subscribedAt).toLocaleDateString("es-MX")}</span>, width: 110 },
  ];

  return (
    <>
      <PageHeader
        eyebrow="STUDIO · Contenido"
        title={cfg.title}
        subtitle={cfg.subtitle}
        actions={
          <Button variant="ghost" iconLeft="🔄" onClick={() => void load(search)}>Actualizar</Button>
        }
      />

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 12, marginBottom: 18 }}>
        <KpiCard label="Suscriptores totales" value={subs.length} icon="✉️" variant="positive" />
        {bySource.slice(0, 3).map(([source, count]) => (
          <KpiCard key={source} label={`Vía ${source}`} value={count} hint={subs.length > 0 ? `${((count / subs.length) * 100).toFixed(0)}% del total` : undefined} />
        ))}
      </div>
      {bySource.length > 0 && subs.length > 0 && (
        <div style={{ marginBottom: 18, padding: "14px 16px", background: "var(--surface-2)", border: "1px solid var(--border)", borderRadius: 10 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: "var(--text-tertiary)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 10 }}>Distribución por canal</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {bySource.map(([source, count]) => (
              <div key={source} style={{ display: "grid", gridTemplateColumns: "120px 1fr 48px", gap: 10, alignItems: "center" }}>
                <span style={{ fontSize: 12, color: "var(--text-secondary)", fontWeight: 500 }}>{source}</span>
                <div style={{ height: 6, borderRadius: 3, background: "var(--surface)", overflow: "hidden" }}>
                  <div style={{ height: "100%", width: `${(count / subs.length) * 100}%`, background: "var(--primary)", borderRadius: 3 }} />
                </div>
                <span style={{ fontSize: 11.5, color: "var(--text-tertiary)", textAlign: "right" }}>{count}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      <FilterToolbar
        search={{ value: search, onChange: (v) => { setSearch(v); void load(v); }, placeholder: "Buscar por email o nombre…" }}
        onClear={() => { setSearch(""); void load(); }}
        resultCount={loading ? null : subs.length}
        rightActions={subs.length > 0 ? (
          <Button variant="ghost" size="sm" iconLeft="⬇" onClick={exportCsv}>Excel</Button>
        ) : undefined}
      />

      <Section title={loading ? "Cargando…" : `${subs.length} suscriptores`}>
        {loading && <EmptyState icon="⏳" title="Cargando…" description="Consultando suscriptores." />}
        {!loading && error && <EmptyState icon="⚠️" title="No se pudo cargar" description={error} action={<Button size="sm" variant="secondary" onClick={() => void load()}>Reintentar</Button>} />}
        {!loading && !error && <DataTable columns={columns} rows={subs} rowKey={(s) => s.id} emptyTitle="Sin suscriptores" emptyDescription="Aún nadie se ha registrado desde el formulario público." />}
      </Section>
    </>
  );
}
