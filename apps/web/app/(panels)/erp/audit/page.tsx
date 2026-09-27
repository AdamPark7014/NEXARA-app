"use client";

import { useCallback, useDeferredValue, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import PageHeader from "@/components/ui/PageHeader";
import Section from "@/components/ui/Section";
import KpiCard from "@/components/ui/KpiCard";
import { Tag } from "@/components/ui/DataTable";
import Button from "@/components/ui/Button";
import EmptyState from "@/components/ui/EmptyState";
import InlineAlert from "@/components/ui/InlineAlert";
import FilterToolbar from "@/components/FilterToolbar";
import { SkeletonList } from "@/components/PageState";
import { exportToExcel } from "@/lib/export-excel";
import { useUser } from "@/components/UserContext";
import { buildApiUrl } from "@/lib/api-base";
import { formatApiError } from "@/lib/erp-api";
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

const PANEL_LABEL: Record<string, string> = { ERP: "Administración", CRM: "Comercial", OPS: "Operaciones" };

const ENTITY_LABEL: Record<string, string> = {
  User: "usuario", Activity: "actividad", Evidence: "evidencia", Viatico: "viático",
  PurchaseOrder: "orden de compra", JournalEntry: "póliza contable", Lead: "prospecto",
  Opportunity: "oportunidad", Client: "cliente", Vehicle: "vehículo", WorkOrder: "orden de trabajo",
  ToolRequest: "solicitud de herramienta", WarehouseItem: "artículo de almacén",
  Company: "empresa", Employee: "colaborador", Document: "documento", Invoice: "factura",
};

/** Verbo en pasado para la acción cruda del backend (CREATE, ROLE_CHANGE…). */
const ACTION_VERB: Array<[string, string]> = [
  ["PASSWORD_RESET", "restableció la contraseña de"],
  ["ROLE_CHANGE", "cambió el rol de"],
  ["PERMISSION_CHANGE", "cambió los permisos de"],
  ["CREATE", "creó"],
  ["INSERT", "creó"],
  ["UPDATE", "actualizó"],
  ["DELETE", "eliminó"],
  ["REMOVE", "quitó"],
  ["APPROVE", "aprobó"],
  ["REJECT", "rechazó"],
  ["LOGIN", "inició sesión en"],
  ["LOGOUT", "cerró sesión en"],
  ["EXPORT", "exportó"],
  ["IMPORT", "importó"],
];

function actionVerb(action: string): string {
  const a = action.toUpperCase();
  const hit = ACTION_VERB.find(([k]) => a.includes(k));
  return hit ? hit[1] : "modificó";
}

function entityLabel(entityType: string): string {
  return ENTITY_LABEL[entityType] ?? "registro";
}

const FEMININE_ENTITIES = new Set([
  "Activity", "Evidence", "PurchaseOrder", "JournalEntry", "Opportunity", "WorkOrder", "ToolRequest", "Company", "Invoice",
]);

function describe(e: AuditRow): string {
  const a = e.action.toUpperCase();
  if (a.includes("LOGIN") || a.includes("LOGOUT")) return `${actionVerb(e.action)} el sistema`;
  const article = FEMININE_ENTITIES.has(e.entityType) ? "una" : "un";
  return `${actionVerb(e.action)} ${article} ${entityLabel(e.entityType)}`;
}

function deriveSeverity(action: string): Severity {
  const a = action.toUpperCase();
  if (CRITICAL_ACTIONS.some((k) => a.includes(k))) return "critical";
  if (WARNING_ACTIONS.some((k) => a.includes(k))) return "warning";
  return "info";
}

const DAY_MS = 86_400_000;

function dayLabel(iso: string): string {
  const d = new Date(iso);
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);
  if (d.toDateString() === today.toDateString()) return "Hoy";
  if (d.toDateString() === yesterday.toDateString()) return "Ayer";
  return d.toLocaleDateString("es-MX", { weekday: "long", day: "2-digit", month: "short" });
}

const SEVERITY_META: Record<Severity, { label: string; tag: "default" | "warning" | "danger"; color: string; border: string }> = {
  info: { label: "Informativo", tag: "default", color: "var(--primary)", border: "var(--border)" },
  warning: { label: "Atención", tag: "warning", color: "var(--warning)", border: "color-mix(in srgb, var(--warning) 35%, var(--border))" },
  critical: { label: "Crítico", tag: "danger", color: "var(--danger)", border: "color-mix(in srgb, var(--danger) 40%, var(--border))" },
};

const SEVERITY_ORDER: Severity[] = ["critical", "warning", "info"];

const ERP_AUDIT_ROLES = new Set<RoleKey>([ROLES.CEO, ROLES.DIR_ADMIN, ROLES.COORD_ADMIN, ROLES.DIR_OPERACIONES]);

function formatValue(v: unknown): string {
  if (v === null || v === undefined || v === "") return "—";
  if (typeof v === "boolean") return v ? "Sí" : "No";
  if (typeof v === "object") return JSON.stringify(v);
  return String(v);
}

function ChangesList({ changes }: { changes: unknown }) {
  if (changes && typeof changes === "object" && !Array.isArray(changes)) {
    const entries = Object.entries(changes as Record<string, unknown>).slice(0, 20);
    return (
      <dl style={{ display: "grid", gridTemplateColumns: "minmax(110px, max-content) 1fr", gap: "4px 14px", margin: 0 }}>
        {entries.map(([k, v]) => (
          <div key={k} style={{ display: "contents" }}>
            <dt style={{ color: "var(--text-tertiary)", fontWeight: 600 }}>{k}</dt>
            <dd style={{ margin: 0, color: "var(--text-secondary)", wordBreak: "break-word", fontVariantNumeric: "tabular-nums" }}>
              {formatValue(v).slice(0, 240)}
            </dd>
          </div>
        ))}
      </dl>
    );
  }
  return (
    <pre style={{ fontSize: 11.5, background: "var(--surface-2)", padding: "8px 10px", borderRadius: 8, overflowX: "auto", margin: 0, maxHeight: 220 }}>
      {JSON.stringify(changes, null, 2).slice(0, 1200)}
    </pre>
  );
}

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
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sevFilter, setSevFilter] = useState("");
  const [panelFilter, setPanelFilter] = useState("");
  const [query, setQuery] = useState("");
  const deferredQuery = useDeferredValue(query);
  const [expanded, setExpanded] = useState<number | null>(null);

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    setError(null);
    try {
      const data = await apiFetch("audit?limit=200", token);
      setRows(Array.isArray(data) ? data : (data?.data ?? []));
      setLoaded(true);
    } catch (e) {
      setError(formatApiError(e, "No se pudo cargar la bitácora de auditoría."));
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => { void load(); }, [load]);

  const filtered = useMemo(() => {
    const q = deferredQuery.trim().toLowerCase();
    return rows.filter((r) => {
      const sev = deriveSeverity(r.action);
      if (sevFilter && sev !== sevFilter) return false;
      const panel = ENTITY_PANEL[r.entityType] ?? r.entityType;
      if (panelFilter && panel !== panelFilter) return false;
      if (q) {
        const hay = `${r.user?.nombre ?? "Sistema"} ${r.user?.email ?? ""} ${describe(r)} ${r.action} ${r.entityType} ${r.entityId}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [rows, sevFilter, panelFilter, deferredQuery]);

  const grouped = useMemo(() => {
    const map = new Map<string, AuditRow[]>();
    for (const r of filtered) {
      const day = dayLabel(r.createdAt);
      const list = map.get(day);
      if (list) list.push(r);
      else map.set(day, [r]);
    }
    return Array.from(map.entries());
  }, [filtered]);

  const stats = useMemo(() => {
    const now = Date.now();
    const bySev: Record<Severity, number> = { critical: 0, warning: 0, info: 0 };
    let today = 0;
    let criticals24h = 0;
    let warnings24h = 0;
    const actors = new Set<number | string>();
    const todayStr = new Date().toDateString();
    for (const r of rows) {
      const sev = deriveSeverity(r.action);
      bySev[sev] += 1;
      const t = new Date(r.createdAt);
      if (t.toDateString() === todayStr) today += 1;
      if (now - t.getTime() < DAY_MS) {
        if (sev === "critical") criticals24h += 1;
        else if (sev === "warning") warnings24h += 1;
      }
      actors.add(r.user?.id ?? "system");
    }
    return { today, criticals24h, warnings24h, uniqueActors: actors.size, bySev };
  }, [rows]);

  const initialLoading = loading && !loaded;

  return (
    <>
      <PageHeader
        eyebrow="Gobierno · Auditoría"
        title="Bitácora de auditoría"
        subtitle="Registro permanente de los cambios sensibles en el sistema. El borrado de datos personales se solicita desde Usuarios y roles."
        actions={
          <Button variant="secondary" iconLeft="↻" loading={loading && loaded} onClick={() => void load()}>
            Actualizar
          </Button>
        }
      />

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 16, marginBottom: 24 }}>
        <KpiCard label="Eventos de hoy" value={initialLoading ? "—" : stats.today} icon="📋" variant="accent" hint="Todos los módulos" />
        <KpiCard
          label="Críticos (24 h)"
          value={initialLoading ? "—" : stats.criticals24h}
          icon="🚨"
          variant={stats.criticals24h > 0 ? "danger" : "positive"}
          hint={stats.criticals24h > 0 ? "Conviene revisarlos" : "Sin alertas"}
        />
        <KpiCard label="Requieren atención (24 h)" value={initialLoading ? "—" : stats.warnings24h} icon="⚠️" variant="warning" hint="Aprobaciones y cambios" />
        <KpiCard label="Personas activas" value={initialLoading ? "—" : stats.uniqueActors} icon="👥" hint="Incluye procesos automáticos" />
      </div>

      {rows.length > 0 && (
        <div
          style={{ marginBottom: 20, padding: "12px 16px", background: "var(--surface-2)", border: "1px solid var(--border)", borderRadius: 10 }}
          aria-label="Distribución por severidad"
          role="group"
        >
          <div style={{ fontSize: 11, fontWeight: 700, color: "var(--text-tertiary)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 10 }}>
            Distribución por severidad
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
            {SEVERITY_ORDER.filter((s) => stats.bySev[s] > 0).map((sev) => (
              <div key={sev} style={{ display: "grid", gridTemplateColumns: "110px 1fr 48px", gap: 10, alignItems: "center" }}>
                <span style={{ fontSize: 12.5, color: "var(--text-secondary)", fontWeight: 500 }}>{SEVERITY_META[sev].label}</span>
                <div style={{ height: 6, borderRadius: 3, background: "var(--surface)", overflow: "hidden" }}>
                  <div style={{ height: "100%", width: `${(stats.bySev[sev] / rows.length) * 100}%`, background: SEVERITY_META[sev].color, borderRadius: 3 }} />
                </div>
                <span style={{ fontSize: 12, color: "var(--text-tertiary)", textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{stats.bySev[sev]}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      <FilterToolbar
        search={{ value: query, onChange: setQuery, placeholder: "Buscar por persona, acción o módulo…", ariaLabel: "Buscar en la bitácora" }}
        selects={[
          {
            label: "Severidad",
            value: sevFilter,
            onChange: setSevFilter,
            options: SEVERITY_ORDER.map((s) => ({ value: s, label: SEVERITY_META[s].label })),
            allowAll: true,
            allLabel: "Todas",
          },
          {
            label: "Área",
            value: panelFilter,
            onChange: setPanelFilter,
            options: Object.entries(PANEL_LABEL).map(([value, label]) => ({ value, label })),
            allowAll: true,
            allLabel: "Todas",
          },
        ]}
        onClear={() => { setQuery(""); setSevFilter(""); setPanelFilter(""); }}
        resultCount={initialLoading ? null : filtered.length}
        rightActions={rows.length > 0 ? (
          <Button variant="ghost" size="sm" iconLeft="⬇" onClick={() => exportToExcel(filtered, [
            { key: "createdAt", label: "Fecha", format: (v) => v ? new Date(String(v)).toLocaleString("es-MX") : "" },
            { key: "user", label: "Persona", format: (v) => (v as AuditRow["user"])?.nombre ?? "Sistema" },
            { key: "action", label: "Acción", format: (_v, r) => describe(r as AuditRow) },
            { key: "entityType", label: "Módulo", format: (v) => entityLabel(String(v ?? "")) },
            { key: "entityId", label: "Folio" },
            { key: "ipAddress", label: "Dirección IP" },
          ], "bitacora-auditoria")}>Exportar a Excel</Button>
        ) : undefined}
      />

      {error && loaded && (
        <InlineAlert
          variant="warning"
          title="No se pudo actualizar"
          message={`${error} Mostramos la última información cargada.`}
          action={<Button size="sm" variant="secondary" onClick={() => void load()}>Reintentar</Button>}
          style={{ marginBottom: 16 }}
        />
      )}

      <Section title={initialLoading ? "Cargando eventos" : `${filtered.length.toLocaleString("es-MX")} ${filtered.length === 1 ? "evento" : "eventos"}`}>
        {initialLoading && !error && <SkeletonList rows={6} tableLike />}
        {!loaded && !loading && error && (
          <EmptyState
            icon="⚠️"
            title="No se pudo cargar la bitácora"
            description={error}
            action={<Button size="sm" variant="secondary" onClick={() => void load()}>Reintentar</Button>}
          />
        )}
        {loaded && grouped.length === 0 && (
          rows.length === 0 ? (
            <EmptyState icon="📋" title="Aún no hay eventos" description="Cuando alguien cree, edite o elimine información sensible, aparecerá aquí." />
          ) : (
            <EmptyState
              icon="🔎"
              title="Sin coincidencias"
              description="Ningún evento coincide con la búsqueda o los filtros."
              action={<Button size="sm" variant="secondary" onClick={() => { setQuery(""); setSevFilter(""); setPanelFilter(""); }}>Limpiar filtros</Button>}
            />
          )
        )}
        {loaded && grouped.map(([day, events]) => (
          <section key={day} style={{ marginBottom: 20 }} aria-label={day}>
            <h3 style={{ fontSize: 12, fontWeight: 700, color: "var(--text-tertiary)", textTransform: "uppercase", letterSpacing: "0.05em", margin: "0 0 8px" }}>
              {day}
            </h3>
            <ul style={{ display: "grid", gap: 6, listStyle: "none", margin: 0, padding: 0 }}>
              {events.map((e) => {
                const sev = deriveSeverity(e.action);
                const meta = SEVERITY_META[sev];
                const isExpanded = expanded === e.id;
                const panel = ENTITY_PANEL[e.entityType];
                const detailId = `audit-detail-${e.id}`;
                return (
                  <li
                    key={e.id}
                    style={{
                      background: "var(--surface)",
                      border: `1px solid ${meta.border}`,
                      borderLeft: `3px solid ${meta.color}`,
                      borderRadius: 10,
                    }}
                  >
                    <button
                      type="button"
                      onClick={() => setExpanded(isExpanded ? null : e.id)}
                      aria-expanded={isExpanded}
                      aria-controls={detailId}
                      style={{
                        display: "flex", width: "100%", justifyContent: "space-between", alignItems: "center", gap: 12,
                        padding: "10px 14px", minHeight: 44, background: "transparent", border: "none", cursor: "pointer",
                        textAlign: "left", color: "inherit", font: "inherit", borderRadius: 10,
                      }}
                    >
                      <span style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0, flexWrap: "wrap" }}>
                        <Tag variant={meta.tag} size="sm" dot>{meta.label}</Tag>
                        {panel && <Tag variant="neutral" size="sm">{PANEL_LABEL[panel]}</Tag>}
                        <span style={{ fontSize: 13.5, lineHeight: 1.4 }}>
                          <strong style={{ fontWeight: 600 }}>{e.user?.nombre ?? "Sistema"}</strong>{" "}
                          <span style={{ color: "var(--text-secondary)" }}>{describe(e)}</span>
                        </span>
                      </span>
                      <span style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
                        <time dateTime={e.createdAt} style={{ fontSize: 12, color: "var(--text-tertiary)", fontVariantNumeric: "tabular-nums" }}>
                          {new Date(e.createdAt).toLocaleTimeString("es-MX", { hour: "2-digit", minute: "2-digit" })}
                        </time>
                        <span aria-hidden="true" style={{ color: "var(--text-tertiary)", fontSize: 11, transform: isExpanded ? "rotate(180deg)" : undefined, transition: "transform 0.15s" }}>▾</span>
                      </span>
                    </button>
                    {isExpanded && (
                      <div
                        id={detailId}
                        style={{ margin: "0 14px", padding: "10px 0 12px", borderTop: "1px solid var(--border)", fontSize: 12.5, color: "var(--text-secondary)", display: "grid", gap: 8 }}
                      >
                        <div style={{ display: "flex", flexWrap: "wrap", gap: "4px 18px" }}>
                          <span>Fecha: <strong style={{ fontWeight: 600 }}>{new Date(e.createdAt).toLocaleString("es-MX", { dateStyle: "medium", timeStyle: "short" })}</strong></span>
                          <span>Registro: <strong style={{ fontWeight: 600 }}>{entityLabel(e.entityType)} #{e.entityId}</strong></span>
                          {e.user?.email && <span>Correo: <strong style={{ fontWeight: 600 }}>{e.user.email}</strong></span>}
                          {e.ipAddress && <span>Dirección IP: <code>{e.ipAddress}</code></span>}
                        </div>
                        {!!e.changes && (
                          <div>
                            <div style={{ fontWeight: 600, marginBottom: 4, color: "var(--text-primary)" }}>Cambios</div>
                            <ChangesList changes={e.changes} />
                          </div>
                        )}
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          </section>
        ))}
      </Section>
    </>
  );
}
