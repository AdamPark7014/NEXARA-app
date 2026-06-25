"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import PageHeader from "@/components/ui/PageHeader";
import Section from "@/components/ui/Section";
import Button from "@/components/ui/Button";
import KpiCard from "@/components/ui/KpiCard";
import DataTable, { Tag, type Column } from "@/components/ui/DataTable";
import EmptyState from "@/components/ui/EmptyState";
import { useUser } from "@/components/UserContext";
import { buildApiUrl } from "@/lib/api-base";
import { resolveV2RoleKey } from "@/lib/user-access";
import { ROLES } from "@/lib/rbac";

interface Breach {
  id: number;
  anNumber?: string;
  titulo?: string;
  type: "response" | "response_open" | "resolution";
  priority?: string;
  hoursLate: number;
}

interface SlaStats {
  total: number;
  stillOpen: number;
  responseSla: { onTime: number; late: number; compliancePct: number; avgHours: number };
  resolutionSla: { onTime: number; late: number; compliancePct: number; avgHours: number };
  breaches: Breach[];
  bySeverity: { high: number; medium: number; low: number };
}

async function apiFetch(path: string, token: string) {
  const res = await fetch(buildApiUrl(path), { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) throw new Error(await res.text().catch(() => `HTTP ${res.status}`));
  return res.json();
}

export default function SupportSlaPage() {
  const { user } = useUser();
  const router = useRouter();
  const token = user?.token ?? "";

  // SLA — solo managers/soporte. ing_campo ve su dashboard operativo.
  useEffect(() => {
    const v2 = resolveV2RoleKey(user);
    if (!user?.isSuperAdmin && v2 === ROLES.ING_CAMPO) router.replace("/ops/dashboard");
  }, [user, router]);

  const [stats, setStats] = useState<SlaStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true); setError(null);
    try {
      const from = new Date(Date.now() - 30 * 86400000).toISOString();
      const data = await apiFetch(`sla/stats?from=${from}`, token);
      setStats(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error al cargar cumplimiento de SLA");
    } finally { setLoading(false); }
  }, [token]);

  useEffect(() => { void load(); }, [load]);

  const typeLabel: Record<string, string> = { response: "Respuesta", response_open: "Respuesta (abierto)", resolution: "Resolución" };

  const columns: Column<Breach>[] = [
    { key: "anNumber", label: "Ticket", render: (b) => <Tag variant="accent">{b.anNumber ?? `#${b.id}`}</Tag>, width: 100 },
    { key: "titulo", label: "Título", accessor: (b) => b.titulo ?? "—" },
    { key: "priority", label: "Prioridad", render: (b) => <Tag variant={b.priority === "Alta" ? "danger" : b.priority === "Media" ? "warning" : "default"}>{b.priority ?? "—"}</Tag>, width: 100 },
    { key: "type", label: "Tipo de SLA", accessor: (b) => typeLabel[b.type] ?? b.type, width: 140 },
    { key: "hoursLate", label: "Horas de retraso", render: (b) => <span style={{ fontWeight: 700, color: "var(--danger)" }}>{b.hoursLate}h</span>, width: 130 },
  ];

  return (
    <>
      <PageHeader
        eyebrow="OPS · Soporte"
        title="Cumplimiento de SLA"
        subtitle="Últimos 30 días: tiempo de respuesta, tiempo de resolución y tickets que rompieron el acuerdo de servicio."
        actions={<Button variant="ghost" iconLeft="🔄" onClick={() => void load()}>Actualizar</Button>}
      />

      {loading && <EmptyState icon="⏳" title="Cargando SLA…" description="Calculando cumplimiento de tickets." />}
      {!loading && error && <EmptyState icon="⚠️" title="No se pudo cargar" description={error} action={<Button size="sm" variant="secondary" onClick={() => void load()}>Reintentar</Button>} />}

      {!loading && !error && stats && (
        <>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 12, marginBottom: 20 }}>
            <KpiCard label="Tickets (30d)" value={stats.total} icon="🎫" />
            <KpiCard label="Cumplimiento respuesta" value={`${stats.responseSla.compliancePct}%`} variant={stats.responseSla.compliancePct >= 90 ? "positive" : "warning"} icon="📞" />
            <KpiCard label="Cumplimiento resolución" value={`${stats.resolutionSla.compliancePct}%`} variant={stats.resolutionSla.compliancePct >= 90 ? "positive" : "warning"} icon="✅" />
            <KpiCard label="Tickets abiertos" value={stats.stillOpen} icon="⏳" />
          </div>

          <Section title={`${stats.breaches.length} incumplimientos recientes`} subtitle="Ordenados por horas de retraso, los más críticos primero.">
            <DataTable columns={columns} rows={stats.breaches} rowKey={(b) => `${b.id}-${b.type}`} emptyTitle="Sin incumplimientos" emptyDescription="Ningún ticket rompió su SLA en los últimos 30 días. 🎉" />
          </Section>
        </>
      )}
    </>
  );
}
