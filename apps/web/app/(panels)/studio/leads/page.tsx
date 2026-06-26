"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import PageHeader from "@/components/ui/PageHeader";
import Section from "@/components/ui/Section";
import Button from "@/components/ui/Button";
import KpiCard from "@/components/ui/KpiCard";
import DataTable, { Tag, type Column } from "@/components/ui/DataTable";
import EmptyState from "@/components/ui/EmptyState";
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
}

interface SourceRow { source: string; total: number; responded: number; conversionPct: number }

async function apiFetch(path: string, token: string) {
  const res = await fetch(buildApiUrl(path), { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) throw new Error(await res.text().catch(() => `HTTP ${res.status}`));
  return res.json();
}

export default function StudioLeadsPage() {
  const { user } = useUser();
  const cfg = useMemo(() => getStudioSectionConfig(user, "leads"), [user]);
  const token = user?.token ?? "";

  const [messages, setMessages] = useState<ContactMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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

  const totalLeads = messages.length;
  const respondidos = messages.filter((m) => m.status === "RESPONDED").length;
  const nuevos = messages.filter((m) => m.status === "NEW").length;

  const columns: Column<SourceRow>[] = [
    { key: "source", label: "Fuente" },
    { key: "total", label: "Leads", width: 100 },
    { key: "responded", label: "Atendidos", width: 100 },
    { key: "conversionPct", label: "% atención", render: (r) => <Tag variant={r.conversionPct >= 70 ? "positive" : r.conversionPct >= 40 ? "warning" : "danger"}>{r.conversionPct}%</Tag>, width: 110 },
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
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 12, marginBottom: 20 }}>
            <KpiCard label="Leads totales" value={totalLeads} icon="🌐" />
            <KpiCard label="Nuevos sin atender" value={nuevos} variant={nuevos > 0 ? "warning" : "positive"} icon="🆕" />
            <KpiCard label="Atendidos" value={respondidos} variant="positive" icon="✅" />
          </div>

          <Section title="Embudo por fuente">
            <DataTable columns={columns} rows={bySource} rowKey={(r) => r.source} emptyTitle="Sin leads" emptyDescription="Aún no hay mensajes de contacto del sitio público." />
          </Section>
        </>
      )}
    </>
  );
}
