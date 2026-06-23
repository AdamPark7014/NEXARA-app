"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { buildApiUrl } from "@/lib/api-base";

type ServicesSummary = {
  summary: {
    activeProjects: number;
    activeContracts: number;
    upcomingVisits: number;
    openTickets: number;
    ticketsLast30Days: number;
    completionRate: number;
    branches: number;
    pendingFeedbacks: number;
  };
  projects: Array<{
    id: number;
    title: string;
    status: string;
    projectType: string;
    scopeSummary?: string | null;
    startDate?: string | null;
    endDate?: string | null;
  }>;
  contracts: Array<{
    id: number;
    contractNumber: string;
    title: string;
    frequency: string;
    slaResponseHours: number;
    slaResolutionHours: number;
    nextVisitDate?: string | null;
    monthlyFee: number;
    currency: string;
    branch?: { id: number; name: string } | null;
  }>;
  upcomingVisits: Array<{
    id: number;
    scheduledDate: string;
    status: string;
    contract: { id: number; contractNumber: string; title: string; branch?: { name: string } | null };
  }>;
  recentTickets: Array<{
    id: number;
    anNumber: string;
    titulo: string;
    estatus: string;
    ticketType?: string | null;
    branchName?: string | null;
    fechaAsignacion?: string | null;
    fechaFinalizacion?: string | null;
    responsable?: { id: number; nombre: string } | null;
  }>;
};

const FREQ_LABEL: Record<string, string> = {
  WEEKLY: "Semanal",
  BIWEEKLY: "Quincenal",
  MONTHLY: "Mensual",
  BIMONTHLY: "Bimestral",
  QUARTERLY: "Trimestral",
  SEMIANNUAL: "Semestral",
  ANNUAL: "Anual",
};

const STATUS_COLOR: Record<string, string> = {
  "Pendiente": "#f59e0b",
  "En Proceso": "#3b82f6",
  "Finalizado": "#16a34a",
  ACTIVE: "#16a34a",
  ON_HOLD: "#f59e0b",
  CLOSED: "#6b7280",
};

export default function MisServiciosPage() {
  const [token, setToken] = useState<string | null>(null);
  const [data, setData] = useState<ServicesSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;
    setToken(window.localStorage.getItem("ticketsClientToken"));
  }, []);

  const refresh = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    try {
      const res = await fetch(buildApiUrl("client-portal/services-summary"), {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error(await res.text());
      const payload = (await res.json()) as ServicesSummary;
      setData(payload);
      setError(null);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => { refresh(); }, [refresh]);

  if (!token) {
    return (
      <div style={{ padding: 32, textAlign: "center" }}>
        <h2>Acceso requerido</h2>
        <p>Inicia sesión en el portal de tickets para ver tus servicios.</p>
        <Link href="/" style={{ color: "var(--primary)" }}>Volver al portal</Link>
      </div>
    );
  }

  if (loading && !data) return <div style={{ padding: 32 }}>Cargando servicios…</div>;
  if (error && !data) return <div style={{ padding: 32, color: "#b91c1c" }}>{error}</div>;
  if (!data) return null;

  const s = data.summary;

  return (
    <div style={{ padding: "24px max(16px, 4vw)", maxWidth: 1200, margin: "0 auto" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 12 }}>
        <div>
          <h1 style={{ margin: 0 }}>🛎️ Mis servicios con NEXARA</h1>
          <p style={{ color: "var(--text-secondary)", margin: 0 }}>
            Visión 360° de tus proyectos activos, contratos de mantenimiento y tickets recientes.
          </p>
        </div>
        <button type="button" onClick={refresh} style={btnPrimary}>🔄 Actualizar</button>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))", gap: 12, marginTop: 16 }}>
        <Kpi label="Proyectos activos" value={s.activeProjects} color="#3b82f6" />
        <Kpi label="Contratos vigentes" value={s.activeContracts} color="#8b5cf6" />
        <Kpi label="Visitas próximas" value={s.upcomingVisits} color="#f59e0b" />
        <Kpi label="Tickets abiertos" value={s.openTickets} color="#ef4444" />
        <Kpi label="Tickets últimos 30 días" value={s.ticketsLast30Days} color="#6b7280" />
        <Kpi label="Tasa de cierre" value={`${s.completionRate}%`} color={s.completionRate >= 80 ? "#16a34a" : "#f59e0b"} />
        <Kpi label="Sucursales activas" value={s.branches} color="#0ea5e9" />
        <Kpi label="Encuestas pendientes" value={s.pendingFeedbacks} color={s.pendingFeedbacks > 0 ? "#dc2626" : "#16a34a"} />
      </div>

      <Section title="🏗️ Proyectos en ejecución">
        {data.projects.length === 0 ? (
          <Empty>Sin proyectos activos.</Empty>
        ) : (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: 12 }}>
            {data.projects.map((p) => (
              <div key={p.id} style={cardStyle}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                  <strong style={{ fontSize: 14 }}>{p.title}</strong>
                  <Badge color={STATUS_COLOR[p.status] || "#6b7280"}>{p.status}</Badge>
                </div>
                <div style={{ fontSize: 12, color: "var(--text-secondary)", marginTop: 4 }}>
                  Tipo: {p.projectType?.replace(/_/g, " ") || "—"}
                </div>
                {p.scopeSummary && (
                  <div style={{ fontSize: 12, marginTop: 6 }}>{p.scopeSummary}</div>
                )}
                {p.startDate && (
                  <div style={{ fontSize: 11, color: "var(--text-secondary)", marginTop: 6 }}>
                    📅 {new Date(p.startDate).toLocaleDateString("es-MX")}
                    {p.endDate && ` → ${new Date(p.endDate).toLocaleDateString("es-MX")}`}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </Section>

      <Section title="📑 Contratos de mantenimiento recurrente">
        {data.contracts.length === 0 ? (
          <Empty>Sin contratos vigentes.</Empty>
        ) : (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: 12 }}>
            {data.contracts.map((c) => (
              <div key={c.id} style={cardStyle}>
                <div style={{ display: "flex", justifyContent: "space-between" }}>
                  <strong style={{ fontSize: 14 }}>{c.contractNumber}</strong>
                  <Badge color="#8b5cf6">{FREQ_LABEL[c.frequency] || c.frequency}</Badge>
                </div>
                <div style={{ fontSize: 13, marginTop: 4 }}>{c.title}</div>
                {c.branch && (
                  <div style={{ fontSize: 11, color: "var(--text-secondary)", marginTop: 4 }}>📍 {c.branch.name}</div>
                )}
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginTop: 8, fontSize: 11 }}>
                  <div>
                    <div style={{ color: "var(--text-secondary)" }}>SLA respuesta</div>
                    <div style={{ fontWeight: 600 }}>{c.slaResponseHours}h</div>
                  </div>
                  <div>
                    <div style={{ color: "var(--text-secondary)" }}>SLA resolución</div>
                    <div style={{ fontWeight: 600 }}>{c.slaResolutionHours}h</div>
                  </div>
                </div>
                {c.nextVisitDate && (
                  <div style={{ marginTop: 8, padding: 6, background: "var(--bg-secondary)", borderRadius: 6, fontSize: 11 }}>
                    📅 Próxima visita: <strong>{new Date(c.nextVisitDate).toLocaleDateString("es-MX")}</strong>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </Section>

      <Section title="⏰ Próximas visitas (30 días)">
        {data.upcomingVisits.length === 0 ? (
          <Empty>Sin visitas programadas.</Empty>
        ) : (
          <table style={tableStyle}>
            <thead>
              <tr>
                <Th>Fecha</Th>
                <Th>Contrato</Th>
                <Th>Sucursal</Th>
                <Th>Estado</Th>
              </tr>
            </thead>
            <tbody>
              {data.upcomingVisits.map((v) => (
                <tr key={v.id} style={trStyle}>
                  <Td><strong>{new Date(v.scheduledDate).toLocaleDateString("es-MX")}</strong></Td>
                  <Td>
                    {v.contract.contractNumber}
                    <div style={{ fontSize: 11, color: "var(--text-secondary)" }}>{v.contract.title}</div>
                  </Td>
                  <Td>{v.contract.branch?.name || "—"}</Td>
                  <Td><Badge color="#3b82f6">{v.status}</Badge></Td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Section>

      <Section title="🎫 Tickets recientes (30 días)">
        {data.recentTickets.length === 0 ? (
          <Empty>Sin tickets en el periodo.</Empty>
        ) : (
          <table style={tableStyle}>
            <thead>
              <tr>
                <Th>Folio</Th>
                <Th>Asunto</Th>
                <Th>Sucursal</Th>
                <Th>Tipo</Th>
                <Th>Estado</Th>
                <Th>Asignado</Th>
                <Th>Fecha</Th>
              </tr>
            </thead>
            <tbody>
              {data.recentTickets.map((t) => (
                <tr key={t.id} style={trStyle}>
                  <Td><strong>{t.anNumber}</strong></Td>
                  <Td>{t.titulo}</Td>
                  <Td>{t.branchName || "—"}</Td>
                  <Td>{t.ticketType || "—"}</Td>
                  <Td><Badge color={STATUS_COLOR[t.estatus] || "#6b7280"}>{t.estatus}</Badge></Td>
                  <Td>{t.responsable?.nombre || "—"}</Td>
                  <Td>{t.fechaAsignacion ? new Date(t.fechaAsignacion).toLocaleDateString("es-MX") : "—"}</Td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Section>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ marginTop: 24 }}>
      <h3 style={{ margin: 0, marginBottom: 12 }}>{title}</h3>
      {children}
    </div>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return <p style={{ color: "var(--text-secondary)", fontStyle: "italic" }}>{children}</p>;
}

function Kpi({ label, value, color }: { label: string; value: number | string; color: string }) {
  return (
    <div style={{ padding: 12, background: "var(--bg-secondary)", borderRadius: 10, borderLeft: `4px solid ${color}` }}>
      <div style={{ fontSize: 10, color: "var(--text-secondary)", textTransform: "uppercase", letterSpacing: 0.5 }}>{label}</div>
      <div style={{ fontSize: 22, fontWeight: 700, color }}>{value}</div>
    </div>
  );
}

function Th({ children }: { children: React.ReactNode }) {
  return <th style={{ textAlign: "left", padding: 8, background: "var(--bg-secondary)", fontSize: 12, borderBottom: "1px solid var(--border)" }}>{children}</th>;
}
function Td({ children }: { children: React.ReactNode }) {
  return <td style={{ padding: 8, fontSize: 13, borderBottom: "1px solid var(--border)" }}>{children}</td>;
}
function Badge({ color, children }: { color: string; children: React.ReactNode }) {
  return <span style={{ display: "inline-block", padding: "2px 8px", background: `${color}22`, color, borderRadius: 999, fontSize: 11, fontWeight: 700 }}>{children}</span>;
}

const tableStyle: React.CSSProperties = { width: "100%", borderCollapse: "collapse" };
const trStyle: React.CSSProperties = {};
const cardStyle: React.CSSProperties = {
  padding: 12,
  background: "var(--bg-secondary)",
  borderRadius: 10,
  border: "1px solid var(--border)",
};
const btnPrimary: React.CSSProperties = {
  padding: "8px 14px",
  background: "var(--primary)",
  color: "#fff",
  border: "none",
  borderRadius: 8,
  cursor: "pointer",
};
