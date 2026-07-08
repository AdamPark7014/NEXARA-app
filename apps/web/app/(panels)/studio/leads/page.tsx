"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import PageHeader from "@/components/ui/PageHeader";
import Section from "@/components/ui/Section";
import Button from "@/components/ui/Button";
import KpiCard from "@/components/ui/KpiCard";
import DataTable, { Tag, type Column } from "@/components/ui/DataTable";
import EmptyState from "@/components/ui/EmptyState";
import FilterToolbar from "@/components/FilterToolbar";
import { exportToCsv } from "@/lib/export-csv";
import { useUser } from "@/components/UserContext";
import { getStudioSectionConfig } from "@/lib/section-views";
import { buildApiUrl } from "@/lib/api-base";

interface ContactMessage {
  id: number;
  name: string;
  email: string;
  company?: string | null;
  source?: string | null;
  status: "NEW" | "IN_PROGRESS" | "RESPONDED" | string;
  createdAt: string;
  message?: string | null;
}

interface SourceRow { source: string; total: number; responded: number; conversionPct: number }

async function apiFetch(path: string, token: string) {
  const res = await fetch(buildApiUrl(path), { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) throw new Error(await res.text().catch(() => `HTTP ${res.status}`));
  return res.json();
}

function fmtAge(iso: string): string {
  const mins = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (mins < 60) return `Hace ${mins}m`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `Hace ${hrs}h`;
  return `Hace ${Math.floor(hrs / 24)}d`;
}

const STATUS_VARIANT: Record<string, "warning" | "accent" | "positive" | "default"> = {
  NEW: "warning",
  IN_PROGRESS: "accent",
  RESPONDED: "positive",
};

const STATUS_LABEL: Record<string, string> = {
  NEW: "Nuevo",
  IN_PROGRESS: "En proceso",
  RESPONDED: "Respondido",
};

export default function StudioLeadsPage() {
  const { user } = useUser();
  const cfg = useMemo(() => getStudioSectionConfig(user, "leads"), [user]);
  const token = user?.token ?? "";

  const [messages, setMessages] = useState<ContactMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQ, setSearchQ] = useState("");
  const [filterStatus, setFilterStatus] = useState("");
  const [filterSource, setFilterSource] = useState("");

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true); setError(null);
    try {
      const pageSize = 100;
      let page = 1;
      const all: ContactMessage[] = [];
      while (true) {
        const data = await apiFetch(`contact-messages?limit=${pageSize}&page=${page}`, token);
        const rows = Array.isArray(data) ? data : (data?.data ?? []);
        all.push(...rows);
        const total = data?.meta?.total ?? rows.length;
        if (all.length >= total || rows.length < pageSize) break;
        page += 1;
      }
      setMessages(all);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error al cargar leads del sitio");
    } finally { setLoading(false); }
  }, [token]);

  useEffect(() => { void load(); }, [load]);

  const bySource = useMemo<SourceRow[]>(() => {
    const map = new Map<string, { total: number; responded: number }>();
    for (const m of messages) {
      const key = m.source?.trim() || "Web orgánico";
      const cur = map.get(key) ?? { total: 0, responded: 0 };
      cur.total += 1;
      if (m.status === "RESPONDED") cur.responded += 1;
      map.set(key, cur);
    }
    return Array.from(map.entries())
      .map(([source, v]) => ({ source, total: v.total, responded: v.responded, conversionPct: v.total > 0 ? +((v.responded / v.total) * 100).toFixed(1) : 0 }))
      .sort((a, b) => b.total - a.total);
  }, [messages]);

  const sources = useMemo(() => [...new Set(messages.map((m) => m.source?.trim() || "Web orgánico"))], [messages]);

  const visibleMessages = useMemo(() => {
    let rows = messages;
    if (searchQ.trim()) {
      const q = searchQ.toLowerCase();
      rows = rows.filter((m) =>
        m.name.toLowerCase().includes(q) ||
        (m.email ?? "").toLowerCase().includes(q) ||
        (m.company ?? "").toLowerCase().includes(q) ||
        (m.message ?? "").toLowerCase().includes(q)
      );
    }
    if (filterStatus) rows = rows.filter((m) => m.status === filterStatus);
    if (filterSource) {
      const fs = filterSource;
      rows = rows.filter((m) => (m.source?.trim() || "Web orgánico") === fs);
    }
    return [...rows].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }, [messages, searchQ, filterStatus, filterSource]);

  const totalLeads = messages.length;
  const respondidos = messages.filter((m) => m.status === "RESPONDED").length;
  const nuevos = messages.filter((m) => m.status === "NEW").length;
  const inProgress = messages.filter((m) => m.status === "IN_PROGRESS").length;

  const sourceCols: Column<SourceRow>[] = [
    { key: "source", label: "Fuente" },
    { key: "total", label: "Leads", width: 80 },
    { key: "responded", label: "Atendidos", width: 90 },
    {
      key: "conversionPct", label: "% atención",
      render: (r) => (
        <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 130 }}>
          <div style={{ flex: 1, height: 6, borderRadius: 3, background: "var(--surface-2)", overflow: "hidden" }}>
            <div style={{ height: "100%", width: `${r.conversionPct}%`, background: r.conversionPct >= 70 ? "var(--success)" : r.conversionPct >= 40 ? "var(--primary)" : "var(--warning)", borderRadius: 3, transition: "width .3s" }} />
          </div>
          <Tag variant={r.conversionPct >= 70 ? "positive" : r.conversionPct >= 40 ? "warning" : "danger"}>{r.conversionPct}%</Tag>
        </div>
      ),
      width: 170,
    },
  ];

  return (
    <>
      <PageHeader
        eyebrow="STUDIO · Captación"
        title={cfg.title}
        subtitle={cfg.subtitle}
        actions={
          <>
            <Button variant="ghost" iconLeft="🔄" onClick={() => void load()}>Actualizar</Button>
            <Link href="/crm/leads" style={{ textDecoration: "none" }}>
              <Button variant="primary" iconLeft="✨">Ver pipeline CRM</Button>
            </Link>
          </>
        }
      />

      {loading && <EmptyState icon="⏳" title="Cargando…" description="Calculando embudo de captación." />}
      {!loading && error && <EmptyState icon="⚠️" title="No se pudo cargar" description={error} action={<Button size="sm" variant="secondary" onClick={() => void load()}>Reintentar</Button>} />}

      {!loading && !error && (
        <>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(155px, 1fr))", gap: 12, marginBottom: 20 }}>
            <KpiCard label="Leads totales" value={totalLeads} icon="🌐" />
            <KpiCard label="Nuevos" value={nuevos} variant={nuevos > 0 ? "warning" : "positive"} icon="🆕" hint="Sin atender" />
            <KpiCard label="En proceso" value={inProgress} variant={inProgress > 0 ? "accent" : "default"} icon="⏳" />
            <KpiCard label="Respondidos" value={respondidos} variant="positive" icon="✅" hint={totalLeads > 0 ? `${((respondidos / totalLeads) * 100).toFixed(0)}% del total` : undefined} />
          </div>

          <Section eyebrow="Analítica" title="Embudo por fuente">
            <DataTable columns={sourceCols} rows={bySource} rowKey={(r) => r.source} emptyTitle="Sin leads" emptyDescription="Aún no hay mensajes de contacto del sitio público." />
          </Section>

          <Section eyebrow="Bandeja" title="Mensajes de contacto">
            <FilterToolbar
              search={{ value: searchQ, onChange: setSearchQ, placeholder: "Buscar por nombre, email, empresa o mensaje…" }}
              selects={[
                {
                  label: "Estado",
                  value: filterStatus,
                  onChange: setFilterStatus,
                  options: [
                    { value: "NEW", label: "Nuevos" },
                    { value: "IN_PROGRESS", label: "En proceso" },
                    { value: "RESPONDED", label: "Respondidos" },
                  ],
                  allowAll: true,
                },
                {
                  label: "Fuente",
                  value: filterSource,
                  onChange: setFilterSource,
                  options: sources.map((s) => ({ value: s, label: s })),
                  allowAll: true,
                },
              ]}
              onClear={() => { setSearchQ(""); setFilterStatus(""); setFilterSource(""); }}
              resultCount={visibleMessages.length}
              rightActions={messages.length > 0 ? (
                <Button variant="ghost" size="sm" iconLeft="⬇" onClick={() => exportToCsv(visibleMessages, [
                  { key: "id", label: "ID" },
                  { key: "name", label: "Nombre" },
                  { key: "email", label: "Email" },
                  { key: "company", label: "Empresa" },
                  { key: "source", label: "Fuente" },
                  { key: "status", label: "Estado" },
                  { key: "createdAt", label: "Recibido", format: (v) => v ? String(v).slice(0, 16).replace("T", " ") : "" },
                  { key: "message", label: "Mensaje" },
                ], "leads-studio")}>CSV</Button>
              ) : undefined}
            />

            {visibleMessages.length === 0 ? (
              <EmptyState icon="📭" title="Sin mensajes" description="No hay mensajes que coincidan con el filtro." />
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {visibleMessages.map((m) => (
                  <article key={m.id} style={{ display: "grid", gridTemplateColumns: "1fr auto", alignItems: "start", gap: 12, padding: "12px 16px", background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 10, borderLeftWidth: 3, borderLeftColor: m.status === "NEW" ? "var(--warning)" : m.status === "IN_PROGRESS" ? "var(--primary)" : "var(--success)" }}>
                    <div>
                      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginBottom: 4 }}>
                        <span style={{ fontWeight: 700, fontSize: 13 }}>{m.name}</span>
                        {m.company && <span style={{ fontSize: 11.5, color: "var(--text-tertiary)" }}>· {m.company}</span>}
                        <Tag variant={STATUS_VARIANT[m.status] ?? "default"}>{STATUS_LABEL[m.status] ?? m.status}</Tag>
                        {m.source && <Tag variant="neutral">{m.source}</Tag>}
                      </div>
                      <div style={{ fontSize: 11.5, color: "var(--text-secondary)" }}>{m.email}</div>
                      {m.message && <div style={{ fontSize: 12, color: "var(--text-tertiary)", marginTop: 6, lineHeight: 1.45 }}>{m.message.slice(0, 160)}{m.message.length > 160 ? "…" : ""}</div>}
                    </div>
                    <div style={{ textAlign: "right", whiteSpace: "nowrap" }}>
                      <div style={{ fontSize: 11, color: "var(--text-tertiary)" }}>{fmtAge(m.createdAt)}</div>
                    </div>
                  </article>
                ))}
              </div>
            )}
          </Section>
        </>
      )}
    </>
  );
}
