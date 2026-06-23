"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import PageHeader from "@/components/ui/PageHeader";
import Section from "@/components/ui/Section";
import KpiCard from "@/components/ui/KpiCard";
import Button from "@/components/ui/Button";
import DataTable, { Tag, type Column } from "@/components/ui/DataTable";
import EmptyState from "@/components/ui/EmptyState";
import { useUser } from "@/components/UserContext";
import { buildApiUrl } from "@/lib/api-base";

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
    const rows = [["email", "name", "source", "subscribedAt"], ...subs.map((s) => [s.email, s.name ?? "", s.source ?? "", s.subscribedAt])];
    const csv = rows.map((r) => r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = "newsletter-subscribers.csv"; a.click();
    URL.revokeObjectURL(url);
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
        title="Newsletter público"
        subtitle="Suscriptores captados desde el sitio público — exporta la lista para tu próxima campaña."
        actions={
          <>
            <Button variant="ghost" iconLeft="🔄" onClick={() => void load(search)}>Actualizar</Button>
            <Button variant="primary" iconLeft="📥" onClick={exportCsv}>Exportar CSV</Button>
          </>
        }
      />

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 12, marginBottom: 18 }}>
        <KpiCard label="Suscriptores totales" value={subs.length} icon="✉️" />
        {bySource.slice(0, 3).map(([source, count]) => <KpiCard key={source} label={`Vía ${source}`} value={count} />)}
      </div>

      <div style={{ marginBottom: 12 }}>
        <input
          value={search}
          onChange={(e) => { setSearch(e.target.value); void load(e.target.value); }}
          placeholder="Buscar por email o nombre…"
          style={{ width: "100%", maxWidth: 360, padding: "8px 12px", borderRadius: 8, border: "1px solid var(--border)", background: "var(--surface)", color: "var(--foreground)", fontSize: 13 }}
        />
      </div>

      <Section title={loading ? "Cargando…" : `${subs.length} suscriptores`}>
        {loading && <EmptyState icon="⏳" title="Cargando…" description="Consultando suscriptores." />}
        {!loading && error && <EmptyState icon="⚠️" title="No se pudo cargar" description={error} action={<Button size="sm" variant="secondary" onClick={() => void load()}>Reintentar</Button>} />}
        {!loading && !error && <DataTable columns={columns} rows={subs} rowKey={(s) => s.id} emptyTitle="Sin suscriptores" emptyDescription="Aún nadie se ha registrado desde el formulario público." />}
      </Section>
    </>
  );
}
