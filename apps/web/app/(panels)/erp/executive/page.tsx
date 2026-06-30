"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import PageHeader from "@/components/ui/PageHeader";
import Section from "@/components/ui/Section";
import KpiCard from "@/components/ui/KpiCard";
import Button from "@/components/ui/Button";
import EmptyState from "@/components/ui/EmptyState";
import { Tag, Money } from "@/components/ui/DataTable";
import { useUser } from "@/components/UserContext";
import { resolveV2RoleKey } from "@/lib/user-access";
import { ROLES, type RoleKey } from "@/lib/rbac";
import { buildApiUrl } from "@/lib/api-base";

/**
 * Vista ejecutiva — pantalla home del CEO / Dueño.
 * Datos reales desde GET /api/executive/c-level
 */

interface DashboardAlert {
  level: "critical" | "warning" | "info";
  icon: string;
  title: string;
  message: string;
}

interface DashboardData {
  generatedAt: string;
  headlineKpis: {
    revenueMtd: number;
    revenuePrevMonth: number;
    revenueMoMChange: number;
    revenueYtd: number;
    wonOppsMtd: number;
    pipelineValue: number;
    pipelineCount: number;
    cashOnHand: number;
    arOutstanding: number;
    apOutstanding: number;
    workingCapital: number;
  };
  sales: { hotLeads: number; tendersOpen: number; tendersWon: number };
  operations: {
    activeProjects: number;
    otOpen: number;
    otOverdue: number;
    otCompletedMtd: number;
    ticketsOpen: number;
    ticketsClosedMtd: number;
  };
  finance: { invoicedMtd: number; invoicesCountMtd: number; overdueInvoices: number };
  maintenance: { activeContracts: number; upcomingVisits: number };
  procurement: { pendingRequisitions: number; pendingPOs: number; lowStockItems: number };
  clientsCount: number;
  teamSize: number;
  alerts: DashboardAlert[];
  topSellers: Array<{ ownerId: number; ownerName: string; revenue: number; wonCount: number }>;
}

const ERP_EXECUTIVE_ROLES = new Set<RoleKey>([ROLES.CEO, ROLES.DIR_ADMIN, ROLES.DIR_OPERACIONES]);

export default function ExecutivePage() {
  const { token, user } = useUser();
  const router = useRouter();
  const [mounted, setMounted] = useState(false);
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;
    if (user.isSuperAdmin) return;
    const v2 = resolveV2RoleKey(user);
    if (v2 && !ERP_EXECUTIVE_ROLES.has(v2)) router.replace("/erp/dashboard");
  }, [user, router]);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!token || !mounted) return;
    setLoading(true);
    setError(null);
    fetch(buildApiUrl("executive/c-level"), {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json() as Promise<DashboardData>;
      })
      .then((d) => setData(d))
      .catch((e) => setError(e instanceof Error ? e.message : "Error al cargar dashboard"))
      .finally(() => setLoading(false));
  }, [token, mounted]);

  if (!mounted) {
    return (
      <div style={{ minHeight: "60vh", display: "grid", placeItems: "center", color: "var(--text-tertiary, #94a3b8)", fontSize: 14 }}>
        <span>Cargando vista ejecutiva…</span>
      </div>
    );
  }

  if (!user || !token) {
    return (
      <div style={{ textAlign: "center", padding: "40px 20px", color: "var(--text-secondary)" }}>
        <p style={{ fontWeight: 600 }}>Sesión no detectada. Redirigiendo a login…</p>
      </div>
    );
  }

  const shortcuts = [
    { href: "/erp/approvals", label: "Aprobaciones", icon: "🛡️", accent: "#ef4444" },
    { href: "/erp/users", label: "Roles y accesos", icon: "🧑‍💼", accent: "#0ea5e9" },
    { href: "/erp/architecture", label: "Arquitectura", icon: "🗺️", accent: "#0ea5e9" },
    { href: "/erp/audit", label: "Audit log", icon: "🔍", accent: "#0ea5e9" },
  ];

  const kpis = data?.headlineKpis;
  const ops = data?.operations;
  const fin = data?.finance;
  const maint = data?.maintenance;
  const proc = data?.procurement;

  const momChange = kpis?.revenueMoMChange ?? 0;
  const momLabel = momChange > 0 ? `+${momChange}%` : `${momChange}%`;
  const momDir: "up" | "down" | "flat" = momChange > 0 ? "up" : momChange < 0 ? "down" : "flat";

  const alerts: DashboardAlert[] = data?.alerts ?? [];
  const criticalAlerts = alerts.filter((a) => a.level === "critical");
  const hasCritical = criticalAlerts.length > 0;

  return (
    <>
      <PageHeader
        eyebrow="ERP · CEO"
        title="Vista ejecutiva"
        subtitle={`Bienvenido, ${user.nombre || user.email}`}
        variant="hero"
        meta={
          <>
            <Tag variant="positive" dot>Live</Tag>
            {hasCritical && <Tag variant="danger" dot>{criticalAlerts.length} críticas</Tag>}
          </>
        }
        actions={
          <>
            <Button variant="ghost" iconLeft="🔄" onClick={() => {
              setLoading(true);
              fetch(buildApiUrl("executive/c-level"), { headers: { Authorization: `Bearer ${token}` } })
                .then((r) => r.json() as Promise<DashboardData>)
                .then(setData)
                .catch((e) => setError(e instanceof Error ? e.message : "Error"))
                .finally(() => setLoading(false));
            }}>
              Actualizar
            </Button>
            <Link href="/erp/calendar" style={{ textDecoration: "none" }}>
              <Button variant="primary" iconLeft="📅" iconRight="→">
                Vista del mes
              </Button>
            </Link>
          </>
        }
      />

      {/* ── Alertas operativas ─────────────────────────────────────── */}
      {(loading || alerts.length > 0) && (
        <Section eyebrow="Mesa del CEO" title="Requiere tu atención" subtitle="Eventos que impactan operación o finanzas" tone="accent">
          {loading && <EmptyState icon="⏳" title="Cargando alertas…" description="Consultando estado operativo." />}
          {!loading && error && <EmptyState icon="⚠️" title="No se pudo cargar" description={error} />}
          {!loading && !error && alerts.length === 0 && (
            <EmptyState icon="✅" title="Sin alertas activas" description="Todo operando con normalidad." />
          )}
          {!loading && !error && alerts.length > 0 && (
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {alerts.map((a, i) => {
                const color = a.level === "critical" ? "var(--danger)" : a.level === "warning" ? "var(--warning)" : "var(--primary)";
                const urgencyLabel = a.level === "critical" ? "Crítico" : a.level === "warning" ? "Importante" : "Info";
                return (
                  <div
                    key={i}
                    style={{
                      position: "relative",
                      display: "flex",
                      alignItems: "center",
                      gap: 14,
                      padding: "14px 16px 14px 20px",
                      background: `linear-gradient(135deg, color-mix(in srgb, ${color} 9%, var(--surface)) 0%, var(--surface) 70%)`,
                      border: `1px solid color-mix(in srgb, ${color} 32%, var(--border))`,
                      borderRadius: 14,
                      boxShadow: "var(--nx-panel-elev-1)",
                    }}
                  >
                    <span style={{ position: "absolute", left: 0, top: 12, bottom: 12, width: 3, borderRadius: "0 3px 3px 0", background: color }} />
                    <span style={{ width: 44, height: 44, borderRadius: 12, background: `color-mix(in srgb, ${color} 16%, var(--surface))`, border: `1px solid color-mix(in srgb, ${color} 28%, var(--border))`, display: "inline-flex", alignItems: "center", justifyContent: "center", fontSize: 22, flexShrink: 0 }}>
                      {a.icon}
                    </span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 9.5, fontWeight: 700, padding: "2px 7px", borderRadius: 5, display: "inline-block", marginBottom: 3, background: `color-mix(in srgb, ${color} 16%, transparent)`, color, letterSpacing: "0.06em", textTransform: "uppercase" }}>
                        {urgencyLabel}
                      </div>
                      <div style={{ fontWeight: 700, fontSize: 14, color: "var(--text-primary)" }}>{a.title}</div>
                      <div style={{ fontSize: 12, color: "var(--text-secondary)", marginTop: 3, lineHeight: 1.45 }}>{a.message}</div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </Section>
      )}

      {/* ── KPIs financieros ──────────────────────────────────────── */}
      <Section eyebrow="$" title="KPIs financieros" subtitle={data ? `Actualizado ${new Date(data.generatedAt).toLocaleTimeString("es-MX", { hour: "2-digit", minute: "2-digit" })}` : "Cargando…"}>
        {loading && <EmptyState icon="⏳" title="Cargando…" description="Consultando datos financieros." />}
        {!loading && error && <EmptyState icon="⚠️" title="Error" description={error} />}
        {!loading && !error && kpis && (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 14 }}>
            <KpiCard
              label="Ingresos del mes"
              value={<Money value={kpis.revenueMtd} compact />}
              hint={`vs ${kpis.revenuePrevMonth > 0 ? new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN", notation: "compact" }).format(kpis.revenuePrevMonth) : "$0"} mes pasado`}
              trend={{ direction: momDir, value: momLabel }}
              variant={momDir === "up" ? "positive" : momDir === "down" ? "danger" : "default"}
              icon="💰"
            />
            <KpiCard
              label="Pipeline activo"
              value={<Money value={kpis.pipelineValue} compact />}
              hint={`${kpis.pipelineCount} oportunidades en curso`}
              variant="accent"
              icon="🎯"
            />
            <KpiCard
              label="Saldo en bancos"
              value={<Money value={kpis.cashOnHand} compact />}
              icon="🏦"
            />
            <KpiCard
              label="Cuentas por cobrar"
              value={<Money value={kpis.arOutstanding} compact />}
              hint={fin?.overdueInvoices ? `${fin.overdueInvoices} facturas vencidas` : undefined}
              variant={fin && fin.overdueInvoices > 0 ? "warning" : "default"}
              icon="⏳"
            />
          </div>
        )}
      </Section>

      {/* ── KPIs operativos ───────────────────────────────────────── */}
      {!loading && !error && ops && (
        <Section eyebrow="OPS" title="Operación" subtitle="Estado del equipo de campo y proyectos">
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 12 }}>
            <KpiCard label="Proyectos activos" value={ops.activeProjects} icon="🏗️" variant={ops.activeProjects > 0 ? "accent" : "default"} />
            <KpiCard label="OTs abiertas" value={ops.otOpen} icon="🔧" />
            <KpiCard label="OTs vencidas" value={ops.otOverdue} icon="⏰" variant={ops.otOverdue > 0 ? "danger" : "default"} />
            <KpiCard label="OTs cerradas (mes)" value={ops.otCompletedMtd} icon="✅" />
            <KpiCard label="Tickets abiertos" value={ops.ticketsOpen} icon="🎫" variant={ops.ticketsOpen > 0 ? "warning" : "default"} />
            {maint && (
              <KpiCard label="Contratos activos" value={maint.activeContracts} icon="📑" />
            )}
          </div>
        </Section>
      )}

      {/* ── Ventas y compras ──────────────────────────────────────── */}
      {!loading && !error && data && (
        <Section eyebrow="CRM · Compras" title="Comercial y abastecimiento" subtitle="Leads, licitaciones y órdenes de compra">
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 12 }}>
            <KpiCard label="Leads calientes" value={data.sales.hotLeads} icon="🔥" variant={data.sales.hotLeads >= 5 ? "warning" : "default"} />
            <KpiCard label="Licitaciones abiertas" value={data.sales.tendersOpen} icon="📋" />
            <KpiCard label="Licitaciones ganadas" value={data.sales.tendersWon} icon="🏆" variant={data.sales.tendersWon > 0 ? "positive" : "default"} />
            {proc && (
              <>
                <KpiCard label="Requisiciones pend." value={proc.pendingRequisitions} icon="📝" variant={proc.pendingRequisitions > 0 ? "warning" : "default"} />
                <KpiCard label="OC pendientes" value={proc.pendingPOs} icon="🛒" variant={proc.pendingPOs > 0 ? "warning" : "default"} />
                <KpiCard label="Stock crítico" value={proc.lowStockItems} icon="📦" variant={proc.lowStockItems > 0 ? "danger" : "default"} />
              </>
            )}
          </div>
        </Section>
      )}

      {/* ── Top vendedores ────────────────────────────────────────── */}
      {!loading && !error && data && data.topSellers.length > 0 && (
        <Section eyebrow="Ventas" title="Top vendedores del mes" subtitle="Por ingresos de oportunidades cerradas">
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {data.topSellers.map((s, i) => (
              <div key={s.ownerId} style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 14px", background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 10 }}>
                <span style={{ fontSize: 13, fontWeight: 700, color: "var(--text-tertiary)", width: 20, textAlign: "center" }}>#{i + 1}</span>
                <span style={{ flex: 1, fontSize: 13, fontWeight: 600 }}>{s.ownerName}</span>
                <span style={{ fontSize: 12, color: "var(--text-secondary)" }}>{s.wonCount} opp.</span>
                <span style={{ fontSize: 13, fontWeight: 700, color: "var(--primary)" }}>
                  {new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN", notation: "compact" }).format(s.revenue)}
                </span>
              </div>
            ))}
          </div>
        </Section>
      )}

      {/* ── Atajos rápidos ────────────────────────────────────────── */}
      <Section eyebrow="Saltos" title="Atajos rápidos" subtitle="Lo que más usas — un clic">
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 10 }}>
          {shortcuts.map((a) => (
            <Link
              key={a.href}
              href={a.href}
              style={{
                position: "relative",
                padding: "14px 14px",
                background: "var(--surface)",
                border: "1px solid var(--nx-panel-hairline)",
                borderRadius: 12,
                textDecoration: "none",
                color: "var(--text-primary)",
                display: "flex",
                alignItems: "center",
                gap: 10,
                boxShadow: "var(--nx-panel-elev-1)",
                overflow: "hidden",
              }}
            >
              <span style={{ width: 34, height: 34, borderRadius: 9, background: `color-mix(in srgb, ${a.accent} 14%, var(--surface))`, color: a.accent, border: `1px solid color-mix(in srgb, ${a.accent} 22%, var(--border))`, display: "inline-flex", alignItems: "center", justifyContent: "center", fontSize: 17, flexShrink: 0 }}>
                {a.icon}
              </span>
              <span style={{ fontSize: 13, fontWeight: 600, flex: 1 }}>{a.label}</span>
            </Link>
          ))}
        </div>
      </Section>
    </>
  );
}
