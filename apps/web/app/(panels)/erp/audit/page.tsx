"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import PageHeader from "@/components/ui/PageHeader";
import Section from "@/components/ui/Section";
import KpiCard from "@/components/ui/KpiCard";
import { Tag } from "@/components/ui/DataTable";
import Button from "@/components/ui/Button";
import EmptyState from "@/components/ui/EmptyState";
import FilterToolbar from "@/components/FilterToolbar";
import { exportToCsv } from "@/lib/export-csv";
import { useUser } from "@/components/UserContext";
import { buildApiUrl } from "@/lib/api-base";
import { resolveV2RoleKey } from "@/lib/user-access";
import { ROLES, type RoleKey } from "@/lib/rbac";

type Severity = "info" | "warning" | "critical";

interface AuditRow {
  id: number;
  entityType: string;
  entityId: number;
  action: string;
  changes?: unknown;
  previousData?: unknown;
  ipAddress?: string | null;
  createdAt: string;
  user?: { id: number; nombre: string; email: string } | null;
}

async function apiFetch(path: string, token: string) {
  const res = await fetch(buildApiUrl(path), { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) throw new Error(await res.text().catch(() => `HTTP ${res.status}`));
  return res.json();
}

const CRITICAL_ACTIONS = ["DELETE", "REMOVE", "PASSWORD_RESET", "ROLE_CHANGE", "PERMISSION_CHANGE"];
const WARNING_ACTIONS = ["UPDATE", "APPROVE", "REJECT"];

const ENTITY_PANEL: Record<string, string> = {
  User: "ERP", Activity: "OPS", Evidence: "OPS", Viatico: "ERP", PurchaseOrder: "ERP",
  JournalEntry: "ERP", Lead: "CRM", Opportunity: "CRM", Client: "CRM", Vehicle: "OPS",
  WorkOrder: "OPS", ToolRequest: "OPS", WarehouseItem: "ERP",
};

function deriveSeverity(action: string): Severity {
  const a = action.toUpperCase();
  if (CRITICAL_ACTIONS.some((k) => a.includes(k))) return "critical";
  if (WARNING_ACTIONS.some((k) => a.includes(k))) return "warning";
  return "info";
}

function dayLabel(iso: string): string {
  const d = new Date(iso);
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);
  if (d.toDateString() === today.toDateString()) return "Hoy";
  if (d.toDateString() === yesterday.toDateString()) return "Ayer";
  return d.toLocaleDateString("es-MX", { weekday: "long", day: "2-digit", month: "short" });
}

const SEVERITY_META: Record<Severity, { label: string; icon: string; bg: string; border: string; text: string }> = {
  info: { label: "INFO", icon: "✓", bg: "color-mix(in srgb, var(--surface-2) 50%, transparent)", border: "var(--border)", text: "var(--text-tertiary)" },
  warning: { label: "WARNING", icon: "⚠", bg: "color-mix(in srgb, var(--warning) 6%, transparent)", border: "color-mix(in srgb, var(--warning) 40%, var(--border))", text: "var(--warning)" },
  critical: { label: "CRITICAL", icon: "!", bg: "color-mix(in srgb, var(--danger) 8%, transparent)", border: "color-mix(in srgb, var(--danger) 45%, var(--border))", text: "var(--danger)" },
};

const ERP_AUDIT_ROLES = new Set<RoleKey>([ROLES.CEO, ROLES.DIR_ADMIN, ROLES.COORD_ADMIN, ROLES.DIR_OPERACIONES]);

export default function AuditPage() {
  const { user } = useUser();
  const router = useRouter();
  const token = user?.token ?? "";

  useEffect(() => {
    if (!user) return;
    if (user.isSuperAdmin) return;
    const v2 = resolveV2RoleKey(user);
    if (v2 && !ERP_AUDIT_ROLES.has(v2)) router.replace("/erp/dashboard");
  }, [user, router]);

  const [rows, setRows] = useState<AuditRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sevFilter, setSevFilter] = useState("");
  const [panelFilter, setPanelFilter] = useState("");
  const [query, setQuery] = useState("");
  const [expanded, setExpanded] = useState<number | null>(null);

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    setError(null);
    try {
      const data = await apiFetch("audit?limit=200", token);
      setRows(Array.isArray(data) ? data : (data?.data ?? []));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error al cargar el log de auditoría");
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => { void load(); }, [load]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return rows.filter((r) => {
      const sev = deriveSeverity(r.action);
      if (sevFilter && sev !== sevFilter) return false;
      const panel = ENTITY_PANEL[r.entityType] ?? r.entityType;
      if (panelFilter && panel !== panelFilter) return false;
      if (q) {
        const hay = `${r.user?.nombre ?? "Sistema"} ${r.action} ${r.entityType} ${r.entityId}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [rows, sevFilter, panelFilter, query]);

  const grouped = useMemo(() => {
    const map = new Map<string, AuditRow[]>();
    filtered.forEach((r) => {
      const day = dayLabel(r.createdAt);
      if (!map.has(day)) map.set(day, []);
      map.get(day)!.push(r);
    });
    return Array.from(map.entries());
  }, [filtered]);

  const stats = useMemo(() => {
    const last24h = rows.filter((r) => Date.now() - new Date(r.createdAt).getTime() < 86400000);
    return {
      today: rows.filter((r) => dayLabel(r.createdAt) === "Hoy").length,
      criticals24h: last24h.filter((r) => deriveSeverity(r.action) === "critical").length,
      warnings24h: last24h.filter((r) => deriveSeverity(r.action) === "warning").length,
      uniqueActors: new Set(rows.map((r) => r.user?.id ?? "system")).size,
    };
  }, [rows]);

  return (
    <>
      <PageHeader
        eyebrow="ERP · Auditoría"
        title="Audit log"
        subtitle="Trazabilidad inmutable de cambios sensibles en todo NEXARA. Solo lectura. Si necesitas explicar legalmente una acción, está aquí."
        actions={<Button variant="ghost" iconLeft="🔄" onClick={() => void load()}>Actualizar</Button>}
      />

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 16, marginBottom: 24 }}>
        <KpiCard label="Eventos hoy" value={stats.today} icon="📋" variant="accent" hint="Todos los módulos" />
        <KpiCard label="Críticos 24h" value={stats.criticals24h} icon="🚨" variant={stats.criticals24h > 0 ? "danger" : "positive"} hint={stats.criticals24h > 0 ? "Requieren revisión" : "Sin alertas"} />
        <KpiCard label="Warnings 24h" value={stats.warnings24h} icon="⚠️" variant="warning" hint="Acciones sensibles" />
        <KpiCard label="Actores únicos" value={stats.uniqueActors} icon="👥" hint="Personas + sistema" />
      </div>

      <FilterToolbar
        search={{ value: query, onChange: setQuery, placeholder: "Buscar por usuario, acción, entidad…" }}
        selects={[
          {
            label: "Severidad",
            value: sevFilter,
            onChange: setSevFilter,
            options: [
              { value: "info", label: "Info" },
              { value: "warning", label: "Warning" },
              { value: "critical", label: "Critical" },
            ],
            allowAll: true,
          },
          {
            label: "Panel",
            value: panelFilter,
            onChange: setPanelFilter,
            options: ["ERP", "CRM", "OPS"].map((p) => ({ value: p, label: p })),
            allowAll: true,
          },
        ]}
        onClear={() => { setQuery(""); setSevFilter(""); setPanelFilter(""); }}
        resultCount={loading ? null : filtered.length}
        rightActions={rows.length > 0 ? (
          <Button variant="ghost" size="sm" iconLeft="⬇" onClick={() => exportToCsv(filtered, [
            { key: "id", label: "ID" },
            { key: "user", label: "Usuario", format: (v) => (v as AuditRow["user"])?.nombre ?? "Sistema" },
            { key: "action", label: "Acción" },
            { key: "entityType", label: "Entidad" },
            { key: "entityId", label: "ID Entidad" },
            { key: "ipAddress", label: "IP" },
            { key: "createdAt", label: "Fecha", format: (v) => v ? String(v).slice(0, 19).replace("T", " ") : "" },
          ], "audit-log")}>CSV</Button>
        ) : undefined}
      />

      <Section title={loading ? "Cargando…" : `${filtered.length} eventos`}>
        {loading && <EmptyState icon="⏳" title="Cargando bitácora…" description="Consultando el log de auditoría." />}
        {!loading && error && (
          <EmptyState icon="⚠️" title="No se pudo cargar" description={error} action={<Button size="sm" variant="secondary" onClick={() => void load()}>Reintentar</Button>} />
        )}
        {!loading && !error && grouped.length === 0 && (
          <EmptyState icon="📋" title="Sin eventos" description="No hay registros de auditoría que coincidan con el filtro." />
        )}
        {!loading && !error && grouped.map(([day, events]) => (
          <div key={day} style={{ marginBottom: 20 }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: "var(--text-tertiary)", textTransform: "uppercase", marginBottom: 8 }}>{day}</div>
            <div style={{ display: "grid", gap: 6 }}>
              {events.map((e) => {
                const sev = deriveSeverity(e.action);
                const meta = SEVERITY_META[sev];
                const isExpanded = expanded === e.id;
                const panel = ENTITY_PANEL[e.entityType] ?? e.entityType;
                return (
                  <div
                    key={e.id}
                    onClick={() => setExpanded(isExpanded ? null : e.id)}
                    style={{
                      background: meta.bg, border: `1px solid ${meta.border}`, borderRadius: 10,
                      padding: "10px 14px", cursor: "pointer",
                    }}
                  >
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0, flexWrap: "wrap" }}>
                        <span style={{ color: meta.text, fontWeight: 700, fontSize: 12 }}>{meta.icon} {meta.label}</span>
                        <Tag variant="default">{panel}</Tag>
                        <span style={{ fontSize: 13, fontWeight: 600 }}>{e.user?.nombre ?? "Sistema"}</span>
                        <span style={{ fontSize: 12.5, color: "var(--text-secondary)" }}>
                          {e.action} {e.entityType} #{e.entityId}
                        </span>
                      </div>
                      <span style={{ fontSize: 11.5, color: "var(--text-tertiary)", whiteSpace: "nowrap" }}>
                        {new Date(e.createdAt).toLocaleTimeString("es-MX", { hour: "2-digit", minute: "2-digit" })}
                      </span>
                    </div>
                    {isExpanded && (
                      <div style={{ marginTop: 8, paddingTop: 8, borderTop: "1px solid var(--border)", fontSize: 11.5, color: "var(--text-tertiary)" }}>
                        {e.ipAddress && <div style={{ marginBottom: 4 }}>IP: <code>{e.ipAddress}</code></div>}
                        {e.user?.email && <div style={{ marginBottom: 4 }}>Email: <code>{e.user.email}</code></div>}
                        {!!e.changes && (
                          <div>
                            <div style={{ fontWeight: 600, marginBottom: 2 }}>Cambios:</div>
                            <pre style={{ fontSize: 11, background: "var(--surface-2)", padding: "6px 10px", borderRadius: 6, overflowX: "auto", margin: 0 }}>
                              {JSON.stringify(e.changes, null, 2).slice(0, 600)}
                            </pre>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </Section>
    </>
  );
}
