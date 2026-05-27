"use client";

import { useMemo, useState } from "react";
import PageHeader from "@/components/ui/PageHeader";
import Section from "@/components/ui/Section";
import KpiCard from "@/components/ui/KpiCard";
import { Tag } from "@/components/ui/DataTable";
import Button from "@/components/ui/Button";

type Severity = "info" | "warning" | "critical";

type Event = {
  id: string;
  when: string;
  day: string;
  who: string;
  role: string;
  panel: "ERP" | "CRM" | "OPS" | "STUDIO" | "LAB" | "SYS";
  action: string;
  target: string;
  ip?: string;
  severity: Severity;
};

const EVENTS: Event[] = [
  { id: "AUD-9342", day: "Hoy", when: "11:42", who: "Karina Mendoza", role: "Sales Rep", panel: "CRM", action: "Cambió estatus de oportunidad", target: "OP-410 (Hotel Camino Real) → 'Calificado'", ip: "189.203.x.x", severity: "info" },
  { id: "AUD-9341", day: "Hoy", when: "11:20", who: "Brandon Castillo", role: "Field Engineer", panel: "OPS", action: "Cerró OT con 8 evidencias", target: "OT-3421 (TOKS Centro · CCTV mantenimiento)", ip: "10.0.4.122", severity: "info" },
  { id: "AUD-9340", day: "Hoy", when: "10:55", who: "Karla Ruiz", role: "Accountant", panel: "ERP", action: "Aprobó póliza contable", target: "P-2026-0213 · $276,000 MXN (proveedor Hikvision)", ip: "10.0.1.34", severity: "info" },
  { id: "AUD-9339", day: "Hoy", when: "09:14", who: "Adrián Pozos (CEO)", role: "CEO", panel: "ERP", action: "Aprobó orden de compra > $100k", target: "OC-2026-0072 · $276,000 MXN · Hikvision · proyecto UDLA", ip: "189.203.x.x", severity: "warning" },
  { id: "AUD-9338", day: "Hoy", when: "08:30", who: "Sistema", role: "Auth Guard", panel: "SYS", action: "Bloqueó intento de acceso no autorizado", target: "GET /erp/banking · rol Sales Rep (Karina M.)", ip: "189.203.x.x", severity: "critical" },
  { id: "AUD-9337", day: "Ayer", when: "17:00", who: "Adrián Pozos (CEO)", role: "CEO / Developer", panel: "ERP", action: "Modificó rol de usuario", target: "EMP-006 Sandra López → Field Engineer (antes: Support Agent)", ip: "189.203.x.x", severity: "warning" },
  { id: "AUD-9336", day: "Ayer", when: "16:42", who: "Eduardo Mendoza", role: "Admin Staff", panel: "ERP", action: "Aprobó viático", target: "VIA-2026-0188 · $1,840 · Brandon C. (combustible UDLA)", ip: "10.0.1.21", severity: "info" },
  { id: "AUD-9335", day: "Ayer", when: "14:10", who: "Vania Salgado", role: "Designer", panel: "STUDIO", action: "Publicó cambios en página pública", target: "/casos-de-exito (3 cards nuevos)", ip: "10.0.5.12", severity: "info" },
  { id: "AUD-9334", day: "Ayer", when: "11:55", who: "Sistema", role: "Webhook SAT", panel: "ERP", action: "Timbró CFDI", target: "F-2026-1432 · UDLA Puebla · $1,850,000 MXN", severity: "info" },
  { id: "AUD-9333", day: "Ayer", when: "09:30", who: "Mario Lozano", role: "Warehouse Mgr", panel: "ERP", action: "Recibió mercancía en almacén", target: "OC-2026-0061 · 40 cámaras DS-2CD2143G2 + 4 NVRs", ip: "10.0.2.8", severity: "info" },
  { id: "AUD-9332", day: "Lunes 24 may", when: "18:20", who: "Sistema", role: "Auth Guard", panel: "SYS", action: "Sesión revocada por inactividad", target: "user_id=EMP-014 · 12h sin actividad", severity: "info" },
  { id: "AUD-9331", day: "Lunes 24 may", when: "10:05", who: "Adrián Pozos (CEO)", role: "CEO", panel: "ERP", action: "Reset de password forzado", target: "EMP-019 (cuenta comprometida — reporte phishing)", ip: "189.203.x.x", severity: "critical" },
];

const SEVERITY_META: Record<Severity, { label: string; icon: string; bg: string; border: string; text: string }> = {
  info: { label: "INFO", icon: "✓", bg: "color-mix(in srgb, var(--surface-2) 50%, transparent)", border: "var(--border)", text: "var(--text-tertiary)" },
  warning: { label: "WARNING", icon: "⚠", bg: "color-mix(in srgb, var(--warning) 6%, transparent)", border: "color-mix(in srgb, var(--warning) 40%, var(--border))", text: "var(--warning)" },
  critical: { label: "CRITICAL", icon: "!", bg: "color-mix(in srgb, var(--danger) 8%, transparent)", border: "color-mix(in srgb, var(--danger) 45%, var(--border))", text: "var(--danger)" },
};

const PANEL_COLOR: Record<Event["panel"], string> = {
  ERP: "#6366f1",
  CRM: "#10b981",
  OPS: "#f59e0b",
  STUDIO: "#ec4899",
  LAB: "#06b6d4",
  SYS: "#94a3b8",
};

type SevFilter = "all" | Severity;
type PanelFilter = "all" | Event["panel"];

export default function AuditPage() {
  const [sevFilter, setSevFilter] = useState<SevFilter>("all");
  const [panelFilter, setPanelFilter] = useState<PanelFilter>("all");
  const [query, setQuery] = useState("");
  const [expanded, setExpanded] = useState<string | null>(null);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return EVENTS.filter((e) => {
      if (sevFilter !== "all" && e.severity !== sevFilter) return false;
      if (panelFilter !== "all" && e.panel !== panelFilter) return false;
      if (q) {
        const hay = `${e.who} ${e.role} ${e.action} ${e.target} ${e.id}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [sevFilter, panelFilter, query]);

  const grouped = useMemo(() => {
    const map = new Map<string, Event[]>();
    filtered.forEach((e) => {
      if (!map.has(e.day)) map.set(e.day, []);
      map.get(e.day)!.push(e);
    });
    return Array.from(map.entries());
  }, [filtered]);

  const stats = useMemo(() => {
    const todayEvents = EVENTS.filter((e) => e.day === "Hoy");
    return {
      today: todayEvents.length,
      criticals24h: EVENTS.filter((e) => e.severity === "critical" && (e.day === "Hoy" || e.day === "Ayer")).length,
      warnings24h: EVENTS.filter((e) => e.severity === "warning" && (e.day === "Hoy" || e.day === "Ayer")).length,
      uniqueActors: new Set(EVENTS.map((e) => e.who)).size,
    };
  }, []);

  return (
    <>
      <PageHeader
        eyebrow="ERP · Auditoría"
        title="Audit log"
        subtitle="Trazabilidad inmutable de cambios sensibles en todo NEXARA. Solo lectura. Si necesitas explicar legalmente una acción, está aquí."
        actions={
          <>
            <Button variant="ghost" iconLeft="🔔">Suscribirme a críticos</Button>
            <Button variant="secondary" iconLeft="📥">Exportar últimas 24h</Button>
          </>
        }
      />

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
          gap: 16,
          marginBottom: 24,
        }}
      >
        <KpiCard label="Eventos hoy" value={stats.today} icon="📋" variant="accent" hint="Todos los paneles" />
        <KpiCard
          label="Críticos 24h"
          value={stats.criticals24h}
          icon="🚨"
          variant={stats.criticals24h > 0 ? "danger" : "positive"}
          hint={stats.criticals24h > 0 ? "Requieren revisión" : "Sin alertas"}
        />
        <KpiCard label="Warnings 24h" value={stats.warnings24h} icon="⚠️" variant="warning" hint="Acciones sensibles" />
        <KpiCard label="Actores únicos" value={stats.uniqueActors} icon="👥" hint="Personas + sistemas" />
      </div>

      <Section
        title="Filtros"
        subtitle="Cruza severidad, panel de origen y búsqueda libre"
      >
        <div style={{ display: "flex", flexWrap: "wrap", gap: 12, alignItems: "center" }}>
          <div style={{ display: "flex", gap: 6 }}>
            {(["all", "info", "warning", "critical"] as const).map((s) => (
              <button
                key={s}
                onClick={() => setSevFilter(s)}
                style={{
                  padding: "6px 12px",
                  fontSize: 12,
                  fontWeight: 600,
                  borderRadius: 999,
                  border: `1px solid ${sevFilter === s ? "var(--primary)" : "var(--border)"}`,
                  background: sevFilter === s ? "color-mix(in srgb, var(--primary) 12%, transparent)" : "var(--surface)",
                  color: sevFilter === s ? "var(--primary)" : "var(--text-secondary)",
                  cursor: "pointer",
                  textTransform: "capitalize",
                }}
              >
                {s === "all" ? "Todas las severidades" : s}
              </button>
            ))}
          </div>

          <div style={{ width: 1, height: 24, background: "var(--border)" }} />

          <div style={{ display: "flex", gap: 6 }}>
            {(["all", "ERP", "CRM", "OPS", "STUDIO", "LAB", "SYS"] as const).map((p) => (
              <button
                key={p}
                onClick={() => setPanelFilter(p)}
                style={{
                  padding: "6px 12px",
                  fontSize: 12,
                  fontWeight: 600,
                  borderRadius: 999,
                  border: `1px solid ${panelFilter === p ? PANEL_COLOR[p as Event["panel"]] ?? "var(--primary)" : "var(--border)"}`,
                  background: panelFilter === p ? `color-mix(in srgb, ${PANEL_COLOR[p as Event["panel"]] ?? "var(--primary)"} 12%, transparent)` : "var(--surface)",
                  color: panelFilter === p ? (PANEL_COLOR[p as Event["panel"]] ?? "var(--primary)") : "var(--text-secondary)",
                  cursor: "pointer",
                }}
              >
                {p === "all" ? "Todos los paneles" : p}
              </button>
            ))}
          </div>

          <div style={{ flex: 1, minWidth: 220 }}>
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Buscar usuario, acción, objetivo, ID…"
              style={{
                width: "100%",
                padding: "8px 12px",
                fontSize: 13,
                borderRadius: 10,
                border: "1px solid var(--border)",
                background: "var(--surface)",
                color: "var(--text-primary)",
              }}
            />
          </div>
        </div>
      </Section>

      <Section
        title={`Timeline · ${filtered.length} eventos`}
        subtitle="Más recientes primero — agrupados por día"
      >
        {grouped.length === 0 && (
          <div
            style={{
              padding: 32,
              textAlign: "center",
              color: "var(--text-tertiary)",
              fontSize: 13,
            }}
          >
            No hay eventos con esos filtros.
          </div>
        )}

        {grouped.map(([day, events]) => (
          <div key={day} style={{ marginBottom: 28 }}>
            <header
              style={{
                display: "flex",
                alignItems: "center",
                gap: 10,
                marginBottom: 14,
                paddingBottom: 8,
                borderBottom: "1px dashed var(--border)",
              }}
            >
              <span style={{ fontSize: 12, fontWeight: 700, color: "var(--text-tertiary)", textTransform: "uppercase", letterSpacing: "0.08em" }}>
                {day}
              </span>
              <span style={{ fontSize: 11, color: "var(--text-tertiary)" }}>
                · {events.length} {events.length === 1 ? "evento" : "eventos"}
              </span>
            </header>

            <div style={{ position: "relative", paddingLeft: 28 }}>
              <div
                style={{
                  position: "absolute",
                  left: 12,
                  top: 6,
                  bottom: 6,
                  width: 2,
                  background: "linear-gradient(180deg, var(--border) 0%, color-mix(in srgb, var(--border) 30%, transparent) 100%)",
                  borderRadius: 1,
                }}
              />

              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {events.map((e) => {
                  const sev = SEVERITY_META[e.severity];
                  const isOpen = expanded === e.id;
                  return (
                    <article
                      key={e.id}
                      onClick={() => setExpanded(isOpen ? null : e.id)}
                      style={{
                        position: "relative",
                        padding: 14,
                        background: sev.bg,
                        border: `1px solid ${sev.border}`,
                        borderRadius: 12,
                        cursor: "pointer",
                        transition: "transform 120ms ease, box-shadow 120ms ease",
                      }}
                    >
                      <span
                        style={{
                          position: "absolute",
                          left: -24,
                          top: 16,
                          width: 16,
                          height: 16,
                          borderRadius: "50%",
                          background: "var(--surface)",
                          border: `2px solid ${sev.text}`,
                          boxShadow: e.severity === "critical" ? `0 0 0 4px color-mix(in srgb, ${sev.text} 18%, transparent)` : "none",
                        }}
                        aria-hidden="true"
                      />

                      <div
                        style={{
                          display: "grid",
                          gridTemplateColumns: "auto 1fr auto",
                          gap: 14,
                          alignItems: "center",
                        }}
                      >
                        <span
                          style={{
                            fontSize: 16,
                            width: 38,
                            height: 38,
                            borderRadius: 10,
                            background: "var(--surface)",
                            border: "1px solid var(--border)",
                            display: "inline-flex",
                            alignItems: "center",
                            justifyContent: "center",
                            color: sev.text,
                            fontWeight: 700,
                          }}
                        >
                          {sev.icon}
                        </span>

                        <div>
                          <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center", marginBottom: 4 }}>
                            <span
                              style={{
                                fontSize: 10.5,
                                fontWeight: 700,
                                padding: "2px 7px",
                                borderRadius: 5,
                                background: `color-mix(in srgb, ${PANEL_COLOR[e.panel]} 16%, transparent)`,
                                color: PANEL_COLOR[e.panel],
                                letterSpacing: "0.04em",
                              }}
                            >
                              {e.panel}
                            </span>
                            <span style={{ fontSize: 13, fontWeight: 600 }}>{e.who}</span>
                            <span style={{ fontSize: 12, color: "var(--text-tertiary)" }}>({e.role})</span>
                          </div>
                          <div style={{ fontSize: 12.5, color: "var(--text-secondary)", lineHeight: 1.4 }}>
                            {e.action} · <code style={{ fontSize: 11.5, background: "color-mix(in srgb, var(--surface-2) 60%, transparent)", padding: "1px 6px", borderRadius: 4 }}>{e.target}</code>
                          </div>
                        </div>

                        <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 6 }}>
                          <Tag variant={e.severity === "critical" ? "danger" : e.severity === "warning" ? "warning" : "neutral"}>
                            {sev.label}
                          </Tag>
                          <span style={{ fontSize: 11, color: "var(--text-tertiary)", fontVariantNumeric: "tabular-nums" }}>
                            {e.when}
                          </span>
                        </div>
                      </div>

                      {isOpen && (
                        <div
                          style={{
                            marginTop: 12,
                            paddingTop: 12,
                            borderTop: "1px dashed var(--border)",
                            display: "grid",
                            gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))",
                            gap: 12,
                            fontSize: 12,
                          }}
                        >
                          <div>
                            <div style={{ fontSize: 10.5, fontWeight: 700, color: "var(--text-tertiary)", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 4 }}>ID evento</div>
                            <code style={{ fontSize: 12 }}>{e.id}</code>
                          </div>
                          <div>
                            <div style={{ fontSize: 10.5, fontWeight: 700, color: "var(--text-tertiary)", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 4 }}>IP origen</div>
                            <code style={{ fontSize: 12 }}>{e.ip ?? "—"}</code>
                          </div>
                          <div>
                            <div style={{ fontSize: 10.5, fontWeight: 700, color: "var(--text-tertiary)", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 4 }}>Timestamp UTC</div>
                            <code style={{ fontSize: 12 }}>{e.day} · {e.when}</code>
                          </div>
                          <div>
                            <div style={{ fontSize: 10.5, fontWeight: 700, color: "var(--text-tertiary)", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 4 }}>Hash</div>
                            <code style={{ fontSize: 11 }}>sha256:{e.id.replace(/[^0-9]/g, "")}…</code>
                          </div>
                        </div>
                      )}
                    </article>
                  );
                })}
              </div>
            </div>
          </div>
        ))}
      </Section>
    </>
  );
}
