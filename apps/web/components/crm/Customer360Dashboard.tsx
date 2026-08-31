"use client";

import Link from "next/link";
import Button from "@/components/ui/Button";
import KpiCard from "@/components/ui/KpiCard";
import EmptyState from "@/components/ui/EmptyState";
import { Tag, Money } from "@/components/ui/DataTable";
import { DetailSection } from "@/components/detail/DetailFrame";
import CrossPanelLink from "@/components/CrossPanelLink";
import {
  computeClientHealth,
  type ClientSnapshot,
  type ClientSnapshotStats,
} from "@/lib/client-snapshot-api";
import { formatOpportunityStage, isClosedOpportunityStage } from "@/lib/sales-api";
import type { SalesClient } from "@/lib/sales-api";

type TimelineEvent = {
  id: string;
  at: string;
  kind: string;
  title: string;
  subtitle?: string;
  href?: string;
  icon: string;
};

function pickDate(raw: unknown): string | null {
  if (!raw) return null;
  const d = new Date(String(raw));
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

function rowStr(row: Record<string, unknown>, ...keys: string[]): string {
  for (const key of keys) {
    const v = row[key];
    if (v != null && String(v).trim()) return String(v);
  }
  return "";
}

function rowNum(row: Record<string, unknown>, ...keys: string[]): number {
  for (const key of keys) {
    const v = row[key];
    if (typeof v === "number" && Number.isFinite(v)) return v;
    if (typeof v === "string" && v.trim() && !Number.isNaN(Number(v))) return Number(v);
  }
  return 0;
}

function isActivityOpen(estatus: string): boolean {
  const s = estatus.toUpperCase();
  return !["COMPLETADA", "COMPLETADO", "CANCELADA", "CANCELADO", "FINALIZADA"].some((x) => s.includes(x));
}

export function buildClient360Timeline(snapshot: ClientSnapshot): TimelineEvent[] {
  const events: TimelineEvent[] = [];

  for (const o of snapshot.opportunities) {
    const row = o as Record<string, unknown>;
    const at = pickDate(row.updatedAt ?? row.createdAt);
    if (!at) continue;
    events.push({
      id: `opp-${row.id}`,
      at,
      kind: "oportunidad",
      title: rowStr(row, "title") || "Oportunidad",
      subtitle: formatOpportunityStage(rowStr(row, "stage")),
      href: row.id ? `/crm/opportunities/${row.id}` : undefined,
      icon: "🎯",
    });
  }

  for (const q of snapshot.quotes) {
    const row = q as Record<string, unknown>;
    const cot = (row.cotizacion as Record<string, unknown>) ?? row;
    const at = pickDate(cot.createdAt ?? row.createdAt);
    if (!at) continue;
    events.push({
      id: `quote-${row.id ?? cot.id}`,
      at,
      kind: "cotización",
      title: rowStr(cot, "quoteNumber") || rowStr(row, "versionLabel") || "Cotización",
      subtitle: rowStr(cot, "status"),
      href: cot.id ? `/crm/quotes/${cot.id}` : undefined,
      icon: "📄",
    });
  }

  for (const a of snapshot.activities) {
    const row = a as Record<string, unknown>;
    const at = pickDate(row.fechaAsignacion ?? row.createdAt);
    if (!at) continue;
    events.push({
      id: `act-${row.id}`,
      at,
      kind: "actividad",
      title: rowStr(row, "titulo", "anNumber") || "Actividad",
      subtitle: rowStr(row, "estatus"),
      href: row.id ? `/ops/activities/${row.id}` : undefined,
      icon: "📋",
    });
  }

  for (const t of snapshot.ticketRequests) {
    const row = t as Record<string, unknown>;
    const at = pickDate(row.createdAt);
    if (!at) continue;
    events.push({
      id: `ticket-${row.id}`,
      at,
      kind: "ticket",
      title: rowStr(row, "description").slice(0, 80) || "Ticket",
      subtitle: rowStr(row, "status"),
      icon: "🎫",
    });
  }

  for (const i of snapshot.invoices) {
    const row = i as Record<string, unknown>;
    const at = pickDate(row.issueDate ?? row.createdAt);
    if (!at) continue;
    events.push({
      id: `inv-${row.id}`,
      at,
      kind: "factura",
      title: rowStr(row, "invoiceNumber") || "Factura",
      subtitle: rowStr(row, "status"),
      href: row.id ? `/erp/invoicing/${row.id}` : undefined,
      icon: "🧾",
    });
  }

  return events.sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime()).slice(0, 25);
}

const healthVariant = (tier: string) =>
  tier === "HEALTHY" ? "positive" : tier === "AT_RISK" ? "warning" : "danger";

const quoteStatusVariant = (status: string): "positive" | "accent" | "warning" | "danger" | "neutral" => {
  const s = status.toUpperCase();
  if (s === "APPROVED") return "positive";
  if (s === "SENT") return "accent";
  if (s === "REJECTED") return "danger";
  if (s === "EXPIRED") return "warning";
  return "neutral";
};

type Props = {
  client: SalesClient;
  snapshot: ClientSnapshot;
  timeline: TimelineEvent[];
};

export default function Customer360Dashboard({ client, snapshot, timeline }: Props) {
  const stats = snapshot.stats;
  const health = computeClientHealth(stats, client.status);
  const base = `/crm/clients/${client.id}`;

  const openOpportunities = snapshot.opportunities.filter((o) => {
    const row = o as Record<string, unknown>;
    return !isClosedOpportunityStage(rowStr(row, "stage"));
  });

  const openActivities = snapshot.activities.filter((a) =>
    isActivityOpen(rowStr(a as Record<string, unknown>, "estatus")),
  );

  const openTickets = snapshot.ticketRequests.filter((t) => {
    const status = rowStr(t as Record<string, unknown>, "status").toUpperCase();
    return !status.includes("CLOSED") && !status.includes("CERR");
  });

  return (
    <>
      <div
        style={{
          display: "flex",
          gap: 8,
          flexWrap: "wrap",
          marginBottom: 16,
          alignItems: "center",
        }}
      >
        <Link
          href={`/crm/quotes/builder?clientId=${client.id}&clientName=${encodeURIComponent(client.name)}`}
          style={{ textDecoration: "none" }}
        >
          <Button size="sm" variant="primary">Cotizar</Button>
        </Link>
        <Link href={`/crm/opportunities?new=1&clientId=${client.id}`} style={{ textDecoration: "none" }}>
          <Button size="sm" variant="secondary">Nueva oportunidad</Button>
        </Link>
        <Link href={`${base}/tickets`} style={{ textDecoration: "none" }}>
          <Button size="sm" variant="ghost">Tickets</Button>
        </Link>
        <Link href={`${base}/facturas`} style={{ textDecoration: "none" }}>
          <Button size="sm" variant="ghost">Facturas</Button>
        </Link>
        {client.serviceClientId && (
          <CrossPanelLink href={`/ops/service-clients/${client.serviceClientId}`} style={{ textDecoration: "none" }}>
            <Button size="sm" variant="ghost">OPS</Button>
          </CrossPanelLink>
        )}
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))",
          gap: 10,
          marginBottom: 16,
        }}
      >
        <KpiCard
          label="Salud de cuenta"
          value={health.label}
          variant={healthVariant(health.tier)}
          icon="💚"
          hint={`Score ${health.score}/100`}
        />
        <KpiCard
          label="Pipeline"
          value={<Money value={stats.pipelineValue} compact />}
          variant="accent"
          icon="💰"
          hint={`${stats.opportunitiesOpen} activas`}
        />
        <KpiCard
          label="Actividades abiertas"
          value={stats.activitiesOpen}
          variant={stats.activitiesOpen > 0 ? "warning" : "positive"}
          icon="📋"
        />
        <KpiCard
          label="Por cobrar"
          value={<Money value={stats.pendingInvoices} compact />}
          variant={stats.pendingInvoices > 0 ? "warning" : "default"}
          icon="🧾"
        />
        <KpiCard
          label="Contratos activos"
          value={stats.activeContracts}
          icon="📜"
          hint={
            stats.monthlyContractRevenue > 0
              ? `${stats.monthlyContractRevenue.toLocaleString("es-MX")} MXN/mes`
              : undefined
          }
        />
        <KpiCard label="Sucursales" value={stats.branches} icon="🏪" />
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
          gap: 16,
          marginBottom: 16,
          alignItems: "start",
        }}
      >
        <DetailSection title="Pipeline comercial">
          {openOpportunities.length === 0 ? (
            <EmptyState
              icon="🎯"
              title="Sin oportunidades abiertas"
              description="Crea una oportunidad para seguir el pipeline de este cliente."
            />
          ) : (
            <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "grid", gap: 8 }}>
              {openOpportunities.slice(0, 6).map((o) => {
                const row = o as Record<string, unknown>;
                const id = rowNum(row, "id");
                const inner = (
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      gap: 12,
                      padding: "10px 12px",
                      border: "1px solid var(--border)",
                      borderRadius: 10,
                      background: "var(--surface)",
                    }}
                  >
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontWeight: 600, fontSize: 13 }}>{rowStr(row, "title")}</div>
                      <Tag variant="accent">{formatOpportunityStage(rowStr(row, "stage"))}</Tag>
                    </div>
                    <div style={{ fontWeight: 700, fontSize: 13, whiteSpace: "nowrap" }}>
                      <Money value={rowNum(row, "value")} compact />
                    </div>
                  </div>
                );
                return (
                  <li key={id}>
                    {id ? (
                      <Link href={`/crm/opportunities/${id}`} style={{ textDecoration: "none", color: "inherit" }}>
                        {inner}
                      </Link>
                    ) : inner}
                  </li>
                );
              })}
            </ul>
          )}
        </DetailSection>

        <DetailSection title="Proyectos en campo">
          {snapshot.operationalProjects.length === 0 ? (
            <EmptyState icon="🔧" title="Sin proyectos OPS" description="Los proyectos operativos aparecerán al vincular operaciones." />
          ) : (
            <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "grid", gap: 8 }}>
              {snapshot.operationalProjects.slice(0, 5).map((p) => {
                const row = p as Record<string, unknown>;
                const id = rowNum(row, "id");
                const inner = (
                  <div
                    style={{
                      padding: "10px 12px",
                      border: "1px solid var(--border)",
                      borderRadius: 10,
                      background: "var(--surface)",
                    }}
                  >
                    <div style={{ fontWeight: 600, fontSize: 13 }}>{rowStr(row, "title")}</div>
                    <div style={{ fontSize: 11.5, color: "var(--text-tertiary)", marginTop: 4 }}>
                      {rowStr(row, "projectType") || "Proyecto"} · {rowStr(row, "status")}
                    </div>
                  </div>
                );
                return (
                  <li key={id}>
                    {id ? (
                      <CrossPanelLink href={`/ops/projects/${id}`} style={{ textDecoration: "none", color: "inherit" }}>
                        {inner}
                      </CrossPanelLink>
                    ) : inner}
                  </li>
                );
              })}
            </ul>
          )}
        </DetailSection>
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))",
          gap: 16,
          marginBottom: 16,
          alignItems: "start",
        }}
      >
        <DetailSection title="Actividades abiertas">
          {openActivities.length === 0 ? (
            <EmptyState icon="📋" title="Sin OT abiertas" description="Las visitas y tickets activos se listan aquí." />
          ) : (
            <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "grid", gap: 8 }}>
              {openActivities.slice(0, 5).map((a) => {
                const row = a as Record<string, unknown>;
                const id = rowNum(row, "id");
                return (
                  <li key={id}>
                    <CrossPanelLink
                      href={`/ops/activities/${id}`}
                      style={{ textDecoration: "none", color: "inherit" }}
                    >
                      <div
                        style={{
                          padding: "10px 12px",
                          border: "1px solid var(--border)",
                          borderRadius: 10,
                          background: "var(--surface)",
                        }}
                      >
                        <div style={{ fontWeight: 600, fontSize: 13 }}>
                          {rowStr(row, "anNumber")} · {rowStr(row, "titulo")}
                        </div>
                        <div style={{ fontSize: 11.5, color: "var(--text-tertiary)", marginTop: 4 }}>
                          {rowStr(row, "estatus")} · {rowStr(row, "branchName")}
                        </div>
                      </div>
                    </CrossPanelLink>
                  </li>
                );
              })}
            </ul>
          )}
        </DetailSection>

        <DetailSection title="Tickets y solicitudes">
          {openTickets.length === 0 ? (
            <EmptyState icon="🎫" title="Sin tickets abiertos" description="Las solicitudes del portal cliente aparecen aquí." />
          ) : (
            <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "grid", gap: 8 }}>
              {openTickets.slice(0, 5).map((t) => {
                const row = t as Record<string, unknown>;
                const id = rowNum(row, "id");
                return (
                  <li key={id}>
                    <div
                      style={{
                        padding: "10px 12px",
                        border: "1px solid var(--border)",
                        borderRadius: 10,
                        background: "var(--surface)",
                      }}
                    >
                      <div style={{ fontWeight: 600, fontSize: 13 }}>
                        {rowStr(row, "description").slice(0, 72)}
                      </div>
                      <div style={{ fontSize: 11.5, color: "var(--text-tertiary)", marginTop: 4 }}>
                        {rowStr(row, "status")} · {rowStr(row, "urgency")}
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
          <Link href={`${base}/tickets`} style={{ fontSize: 12, marginTop: 10, display: "inline-block" }}>
            Ver todos los tickets →
          </Link>
        </DetailSection>
      </div>

      {snapshot.quotes.length > 0 && (
        <div style={{ marginBottom: 16 }}>
          <DetailSection title="Cotizaciones recientes">
          <div style={{ display: "grid", gap: 8 }}>
            {snapshot.quotes.slice(0, 5).map((q) => {
              const row = q as Record<string, unknown>;
              const cot = (row.cotizacion as Record<string, unknown>) ?? row;
              const quoteId = rowNum(cot, "id");
              const status = rowStr(cot, "status");
              const inner = (
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    gap: 12,
                    padding: "10px 12px",
                    border: "1px solid var(--border)",
                    borderRadius: 10,
                    background: "var(--surface)",
                  }}
                >
                  <div>
                    <div style={{ fontWeight: 600, fontSize: 13 }}>
                      {rowStr(cot, "quoteNumber") || rowStr(row, "versionLabel")}
                    </div>
                    {status && <Tag variant={quoteStatusVariant(status)}>{status}</Tag>}
                  </div>
                  <Money value={rowNum(cot, "total")} compact />
                </div>
              );
              return quoteId ? (
                <Link key={quoteId} href={`/crm/quotes/${quoteId}`} style={{ textDecoration: "none", color: "inherit" }}>
                  {inner}
                </Link>
              ) : (
                <div key={rowStr(row, "id")}>{inner}</div>
              );
            })}
          </div>
        </DetailSection>
        </div>
      )}

      <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) minmax(0, 1.2fr)", gap: 16, alignItems: "start" }}>
        <DetailSection title="Resumen operativo">
          <OpsSummary stats={stats} />
          <div style={{ marginTop: 16, display: "flex", gap: 8, flexWrap: "wrap" }}>
            <Link href={`${base}/datos`} style={{ textDecoration: "none" }}>
              <Button size="sm" variant="secondary">Datos fiscales</Button>
            </Link>
            <Link href={`${base}/sucursales`} style={{ textDecoration: "none" }}>
              <Button size="sm" variant="ghost">Sucursales</Button>
            </Link>
            <Link href={`${base}/quotes`} style={{ textDecoration: "none" }}>
              <Button size="sm" variant="ghost">Cotizaciones</Button>
            </Link>
          </div>
        </DetailSection>

        <DetailSection title="Timeline unificada">
          {timeline.length === 0 ? (
            <EmptyState
              icon="🕐"
              title="Sin actividad reciente"
              description="Oportunidades, cotizaciones, visitas y facturas aparecen aquí en orden cronológico."
            />
          ) : (
            <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "grid", gap: 8 }}>
              {timeline.map((ev) => {
                const inner = (
                  <div
                    style={{
                      display: "flex",
                      gap: 12,
                      padding: "10px 12px",
                      border: "1px solid var(--border)",
                      borderRadius: 10,
                      background: "var(--surface)",
                    }}
                  >
                    <span style={{ fontSize: 18, lineHeight: 1 }}>{ev.icon}</span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                        <span style={{ fontWeight: 600, fontSize: 13 }}>{ev.title}</span>
                        <Tag variant="neutral">{ev.kind}</Tag>
                      </div>
                      {ev.subtitle && (
                        <div style={{ fontSize: 11.5, color: "var(--text-tertiary)", marginTop: 2 }}>{ev.subtitle}</div>
                      )}
                      <div style={{ fontSize: 11, color: "var(--text-tertiary)", marginTop: 4 }}>
                        {new Date(ev.at).toLocaleString("es-MX")}
                      </div>
                    </div>
                  </div>
                );
                return (
                  <li key={ev.id}>
                    {ev.href ? (
                      <CrossPanelLink href={ev.href} style={{ textDecoration: "none", color: "inherit" }}>{inner}</CrossPanelLink>
                    ) : inner}
                  </li>
                );
              })}
            </ul>
          )}
        </DetailSection>
      </div>
    </>
  );
}

function OpsSummary({ stats }: { stats: ClientSnapshotStats }) {
  const rows: Array<{ label: string; value: number }> = [
    { label: "Proyectos comerciales", value: stats.totalSalesProjects },
    { label: "Proyectos OPS", value: stats.operationalProjects },
    { label: "Tickets (90 días)", value: stats.ticketRequests },
    { label: "Actividades (90 días)", value: stats.activitiesLast90d },
    { label: "Contratos mantenimiento", value: stats.maintenanceContracts },
  ];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8, fontSize: 13 }}>
      {rows.map((row) => (
        <div key={row.label} style={{ display: "flex", justifyContent: "space-between" }}>
          <span style={{ color: "var(--text-secondary)" }}>{row.label}</span>
          <strong>{row.value}</strong>
        </div>
      ))}
    </div>
  );
}
