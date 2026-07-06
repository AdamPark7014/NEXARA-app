"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import PageHeader from "@/components/ui/PageHeader";
import Section from "@/components/ui/Section";
import Button from "@/components/ui/Button";
import { Tag } from "@/components/ui/DataTable";
import KpiCard from "@/components/ui/KpiCard";
import EmptyState from "@/components/ui/EmptyState";
import FilterToolbar from "@/components/FilterToolbar";
import { exportToCsv } from "@/lib/export-csv";
import { useUser } from "@/components/UserContext";
import { buildApiUrl } from "@/lib/api-base";
import { resolveV2RoleKey } from "@/lib/user-access";
import { ROLES } from "@/lib/rbac";

interface NocDevice {
  id: string;
  name: string;
  type: string;
  status: "ONLINE" | "OFFLINE" | "DEGRADED" | "ALERT";
  branch: string;
  clientName: string;
  lastSeen: string;
  uptimePct30d: number;
}

interface NocSummary {
  total: number;
  byStatus: Record<string, number>;
  avgUptime: number;
  criticalCount: number;
}

async function apiFetch(path: string, token: string) {
  const res = await fetch(buildApiUrl(path), { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) throw new Error(await res.text().catch(() => `HTTP ${res.status}`));
  return res.json();
}

export default function NocPage() {
  const { user } = useUser();
  const router = useRouter();
  const token = user?.token ?? "";

  useEffect(() => {
    const v2 = resolveV2RoleKey(user);
    if (!user?.isSuperAdmin && v2 === ROLES.ING_CAMPO) router.replace("/ops/dashboard");
  }, [user, router]);

  const [summary, setSummary] = useState<NocSummary | null>(null);
  const [devices, setDevices] = useState<NocDevice[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQ, setSearchQ] = useState("");
  const [filterStatus, setFilterStatus] = useState("");

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true); setError(null);
    try {
      const [s, d] = await Promise.all([apiFetch("noc/summary", token), apiFetch("noc/devices", token)]);
      setSummary(s); setDevices(Array.isArray(d) ? d : []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error al cargar monitoreo NOC");
    } finally { setLoading(false); }
  }, [token]);

  useEffect(() => { void load(); }, [load]);

  const visibleDevices = useMemo(() => {
    let rows = devices;
    if (searchQ.trim()) {
      const q = searchQ.toLowerCase();
      rows = rows.filter((d) =>
        d.clientName.toLowerCase().includes(q) ||
        d.name.toLowerCase().includes(q) ||
        d.branch.toLowerCase().includes(q)
      );
    }
    if (filterStatus) rows = rows.filter((d) => d.status === filterStatus);
    // Sort: critical/offline first, then degraded, then online
    return [...rows].sort((a, b) => {
      const order: Record<string, number> = { OFFLINE: 0, ALERT: 1, DEGRADED: 2, ONLINE: 3 };
      return (order[a.status] ?? 4) - (order[b.status] ?? 4);
    });
  }, [devices, searchQ, filterStatus]);

  const statusColor: Record<string, string> = { ONLINE: "var(--success)", DEGRADED: "var(--warning)", OFFLINE: "var(--danger)", ALERT: "var(--danger)" };
  const statusVariant = (s: string): "positive" | "warning" | "danger" => s === "ONLINE" ? "positive" : s === "DEGRADED" ? "warning" : "danger";
  const statusLabel: Record<string, string> = { ONLINE: "Operativo", DEGRADED: "Degradado", OFFLINE: "Caído", ALERT: "Alerta" };

  return (
    <>
      <PageHeader
        eyebrow="OPS · NOC"
        title="Monitoreo de sitios"
        subtitle="Estado de la infraestructura instalada en clientes con proyecto activo (CCTV, POS, redes, control de acceso)."
        actions={<Button variant="ghost" iconLeft="🔄" onClick={() => void load()}>Actualizar</Button>}
      />

      {loading && <EmptyState icon="⏳" title="Cargando NOC…" description="Consultando estado de dispositivos." />}
      {!loading && error && <EmptyState icon="⚠️" title="No se pudo cargar" description={error} action={<Button size="sm" variant="secondary" onClick={() => void load()}>Reintentar</Button>} />}

      {!loading && !error && summary && (
        <>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))", gap: 12, marginBottom: 18 }}>
            <KpiCard label="Monitoreados" value={summary.total} icon="📡" hint="Total dispositivos" />
            <KpiCard label="Operativos" value={summary.byStatus.ONLINE ?? 0} variant={(summary.byStatus.ONLINE ?? 0) === summary.total ? "positive" : "default"} icon="🟢" hint="Estado ONLINE" />
            <KpiCard label="Degradados" value={summary.byStatus.DEGRADED ?? 0} variant={(summary.byStatus.DEGRADED ?? 0) > 0 ? "warning" : "positive"} icon="🟡" hint="Rendimiento reducido" />
            <KpiCard label="Caídos / alerta" value={summary.criticalCount} variant={summary.criticalCount > 0 ? "danger" : "positive"} icon="🔴" hint="Requieren intervención" />
            <KpiCard label="Uptime promedio" value={`${summary.avgUptime?.toFixed(1) ?? "—"}%`} variant={(summary.avgUptime ?? 100) >= 99 ? "positive" : (summary.avgUptime ?? 100) >= 95 ? "warning" : "danger"} icon="📈" hint="30 días de ventana" />
          </div>

          <FilterToolbar
            search={{ value: searchQ, onChange: setSearchQ, placeholder: "Buscar por cliente, dispositivo o sucursal…" }}
            selects={[{
              label: "Estado",
              value: filterStatus,
              onChange: setFilterStatus,
              options: [
                { value: "ONLINE", label: "Operativo" },
                { value: "DEGRADED", label: "Degradado" },
                { value: "OFFLINE", label: "Caído" },
                { value: "ALERT", label: "Alerta" },
              ],
              allowAll: true,
            }]}
            onClear={() => { setSearchQ(""); setFilterStatus(""); }}
            resultCount={loading ? null : visibleDevices.length}
            rightActions={devices.length > 0 ? (
              <Button variant="ghost" size="sm" iconLeft="⬇" onClick={() => exportToCsv(visibleDevices, [
                { key: "clientName", label: "Cliente" },
                { key: "name", label: "Dispositivo" },
                { key: "type", label: "Tipo" },
                { key: "branch", label: "Sucursal" },
                { key: "status", label: "Estado" },
                { key: "uptimePct30d", label: "Uptime 30d (%)", format: (v) => typeof v === "number" ? v.toFixed(2) : "" },
                { key: "lastSeen", label: "Última vez activo", format: (v) => v ? String(v).slice(0, 19).replace("T", " ") : "" },
              ], "noc-dispositivos")}>CSV</Button>
            ) : undefined}
          />

          <Section title={`Dispositivos (${visibleDevices.length})`}>
            {visibleDevices.length === 0 ? (
              <EmptyState icon="🔍" title="Sin resultados" description="Ajusta los filtros para ver dispositivos." />
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {visibleDevices.map((d) => (
                  <article key={d.id} style={{ display: "grid", gridTemplateColumns: "auto 1fr auto auto auto", gap: 16, alignItems: "center", padding: 14, background: "color-mix(in srgb, var(--surface-2) 40%, transparent)", border: "1px solid var(--border)", borderRadius: 12, borderLeftWidth: 3, borderLeftColor: statusColor[d.status] }}>
                    <span style={{ width: 12, height: 12, borderRadius: 999, background: statusColor[d.status], boxShadow: `0 0 12px ${statusColor[d.status]}`, flexShrink: 0 }} />
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontWeight: 700, fontSize: 13.5 }}>{d.clientName}</div>
                      <div style={{ fontSize: 11.5, color: "var(--text-tertiary)" }}>{d.name} · {d.branch} · {d.type}</div>
                    </div>
                    <div style={{ textAlign: "right", flexShrink: 0 }}>
                      <div style={{ fontSize: 11, color: "var(--text-tertiary)" }}>Última vez</div>
                      <div style={{ fontSize: 12, color: d.status !== "ONLINE" ? "var(--danger)" : "var(--text-secondary)" }}>
                        {d.lastSeen ? new Date(d.lastSeen).toLocaleString("es-MX", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }) : "—"}
                      </div>
                    </div>
                    <div style={{ textAlign: "right", flexShrink: 0 }}>
                      <div style={{ fontFamily: "var(--nx-font-display)", fontWeight: 700, fontSize: 15 }}>{d.uptimePct30d.toFixed(2)}%</div>
                      <div style={{ fontSize: 11, color: "var(--text-tertiary)" }}>Uptime 30d</div>
                    </div>
                    <Tag variant={statusVariant(d.status)}>{statusLabel[d.status]}</Tag>
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
