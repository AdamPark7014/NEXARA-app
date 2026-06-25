"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import PageHeader from "@/components/ui/PageHeader";
import Section from "@/components/ui/Section";
import Button from "@/components/ui/Button";
import { Tag } from "@/components/ui/DataTable";
import EmptyState from "@/components/ui/EmptyState";
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

  // ing_campo no tiene acceso al NOC — redirigir a su vista de campo
  useEffect(() => {
    const v2 = resolveV2RoleKey(user);
    if (!user?.isSuperAdmin && v2 === ROLES.ING_CAMPO) router.replace("/ops/dashboard");
  }, [user, router]);

  const [summary, setSummary] = useState<NocSummary | null>(null);
  const [devices, setDevices] = useState<NocDevice[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 12, marginBottom: 18 }}>
            {[
              { label: "Dispositivos monitoreados", value: summary.total, color: "var(--primary)" },
              { label: "Operativos", value: summary.byStatus.ONLINE ?? 0, color: "var(--success)" },
              { label: "Degradados", value: summary.byStatus.DEGRADED ?? 0, color: "var(--warning)" },
              { label: "Caídos / alerta", value: summary.criticalCount, color: "var(--danger)" },
            ].map((k) => (
              <div key={k.label} style={{ padding: 16, background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 12 }}>
                <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--text-tertiary)" }}>{k.label}</div>
                <div style={{ marginTop: 6, fontFamily: "var(--nx-font-display)", fontSize: 26, fontWeight: 700, color: k.color }}>{k.value}</div>
              </div>
            ))}
          </div>

          <Section title={`Dispositivos (${devices.length})`}>
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {devices.map((d) => (
                <article key={d.id} style={{ display: "grid", gridTemplateColumns: "auto 1fr auto auto", gap: 16, alignItems: "center", padding: 14, background: "color-mix(in srgb, var(--surface-2) 40%, transparent)", border: "1px solid var(--border)", borderRadius: 12 }}>
                  <span style={{ width: 12, height: 12, borderRadius: 999, background: statusColor[d.status], boxShadow: `0 0 12px ${statusColor[d.status]}` }} />
                  <div>
                    <div style={{ fontWeight: 700, fontSize: 13.5 }}>{d.clientName}</div>
                    <div style={{ fontSize: 11.5, color: "var(--text-tertiary)" }}>{d.name} · {d.branch}</div>
                  </div>
                  <div style={{ textAlign: "right" }}>
                    <div style={{ fontFamily: "var(--nx-font-display)", fontWeight: 700, fontSize: 15 }}>{d.uptimePct30d.toFixed(2)}%</div>
                    <div style={{ fontSize: 11, color: "var(--text-tertiary)" }}>Uptime 30d</div>
                  </div>
                  <Tag variant={statusVariant(d.status)}>{statusLabel[d.status]}</Tag>
                </article>
              ))}
            </div>
          </Section>
        </>
      )}
    </>
  );
}
