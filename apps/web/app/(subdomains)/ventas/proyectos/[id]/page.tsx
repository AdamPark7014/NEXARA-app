"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useUser } from "@/components/UserContext";
import ProjectCostTracker from "@/components/ProjectCostTracker";
import {
  getSalesProjectSummary,
  invoiceSalesProject,
  stampInvoice,
  type SalesProjectSummary,
} from "@/lib/sales-api";
import { getOperacionUrl, getConsoleUrl } from "@/lib/panel-urls";
import { getServiceProjectTypeLabel } from "@/lib/service-project-types";

const money = (value: number | string | null | undefined) =>
  Number(value || 0).toLocaleString("es-MX", { style: "currency", currency: "MXN" });

const statusColor = (status: string) => {
  const s = status.toUpperCase();
  if (s.includes("CLOSED") || s.includes("COMPLET")) return "#22c55e";
  if (s.includes("PROGRESS") || s.includes("ACTIVE") || s.includes("EN_CURSO")) return "#2563eb";
  if (s.includes("HOLD") || s.includes("PAUS")) return "#f59e0b";
  if (s.includes("CANCELLED")) return "#ef4444";
  return "#6b7280";
};

export default function VentasProjectDetailPage() {
  const params = useParams();
  const router = useRouter();
  const projectId = Number(params?.id);
  const { user } = useUser();
  const token = user?.token;

  const [summary, setSummary] = useState<SalesProjectSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionMessage, setActionMessage] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [invoicing, setInvoicing] = useState(false);
  const [stamping, setStamping] = useState(false);

  const refresh = useCallback(async () => {
    if (!token || !projectId || Number.isNaN(projectId)) return;
    setLoading(true);
    setError(null);
    try {
      const data = await getSalesProjectSummary(token, projectId);
      setSummary(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al cargar el proyecto");
    } finally {
      setLoading(false);
    }
  }, [token, projectId]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const project = summary?.project;
  const opportunity = summary?.opportunity;
  const operational = summary?.operational;
  const order = summary?.order;
  const costs = summary?.costs;
  const invoice = order?.invoice;

  const marginPct = useMemo(() => {
    if (!costs?.budget) return 0;
    return Math.round((costs.margin / costs.budget) * 100);
  }, [costs?.budget, costs?.margin]);

  const actualMarginPct = useMemo(() => {
    if (!costs?.actual || !costs?.budget) return null;
    return Math.round((costs.actual.marginActual / costs.budget) * 100);
  }, [costs?.actual, costs?.budget]);

  const handleGenerateInvoice = async () => {
    if (!token || !projectId) return;
    setInvoicing(true);
    setActionError(null);
    setActionMessage(null);
    try {
      const inv = await invoiceSalesProject(token, projectId);
      setActionMessage(`Factura ${inv.invoiceNumber} generada en borrador.`);
      await refresh();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "No se pudo generar la factura");
    } finally {
      setInvoicing(false);
    }
  };

  const handleStampInvoice = async () => {
    if (!token || !invoice?.id) return;
    setStamping(true);
    setActionError(null);
    setActionMessage(null);
    try {
      const stamped = await stampInvoice(token, invoice.id);
      setActionMessage(`Factura ${stamped.invoiceNumber} timbrada · UUID ${stamped.cfdiUuid}`);
      await refresh();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "No se pudo timbrar la factura");
    } finally {
      setStamping(false);
    }
  };

  if (loading) {
    return <p style={{ padding: 24 }}>Cargando proyecto…</p>;
  }

  if (error || !project) {
    return (
      <div style={{ padding: 24 }}>
        <p>{error || "Proyecto no encontrado"}</p>
        <Link href="/proyectos">← Volver a proyectos</Link>
      </div>
    );
  }

  return (
    <section style={{ padding: 24, display: "grid", gap: 20 }}>
      <header style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 12 }}>
        <div>
          <Link href="/proyectos" style={{ fontSize: 13, color: "var(--text-secondary)" }}>
            ← Proyectos comerciales
          </Link>
          <h1 style={{ margin: "8px 0 4px" }}>{project.name}</h1>
          <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "center", color: "var(--text-secondary)" }}>
            <span>{getServiceProjectTypeLabel(project.projectType)}</span>
            <span>·</span>
            <span style={{ color: statusColor(project.status), fontWeight: 600 }}>{project.status}</span>
            {project.siteCount != null && project.siteCount > 0 && (
              <>
                <span>·</span>
                <span>{project.siteCount} sitios</span>
              </>
            )}
          </div>
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {operational?.id ? (
            <a className="button-primary" href={getOperacionUrl(`/projects/${operational.id}`)} style={{ textDecoration: "none" }}>
              Ver operación
            </a>
          ) : null}
          {opportunity?.client?.id ? (
            <a className="button-secondary" href={getConsoleUrl(`/clients`)} style={{ textDecoration: "none" }}>
              Cliente {opportunity.client.name}
            </a>
          ) : null}
          <button className="button-secondary" type="button" onClick={() => router.push(`/proyectos/${projectId}/gastos`)}>
            Gastos
          </button>
        </div>
      </header>

      {(actionMessage || actionError) && (
        <div className="card" style={{ padding: 14, background: actionError ? "rgba(239,68,68,0.08)" : "rgba(34,197,94,0.08)" }}>
          {actionError ? <p style={{ color: "#ef4444", margin: 0 }}>⚠ {actionError}</p> : <p style={{ color: "#16a34a", margin: 0 }}>✓ {actionMessage}</p>}
        </div>
      )}

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 12 }}>
        <Stat label="Cliente" value={opportunity?.client?.name || "—"} />
        <Stat label="Ejecutivo" value={opportunity?.owner?.nombre || "—"} />
        <Stat label="Presupuesto" value={money(project.budget)} />
        <Stat label="Margen planeado" value={money(project.margin)} suffix={`${marginPct}%`} tone={project.margin < 0 ? "danger" : "success"} />
        {costs?.actual?.hasOperationalLink && (
          <Stat
            label="Margen real (campo)"
            value={money(costs.actual.marginActual)}
            suffix={actualMarginPct != null ? `${actualMarginPct}%` : undefined}
            tone={costs.actual.isOverBudgetActual ? "danger" : "success"}
          />
        )}
        {operational && (
          <Stat
            label="Avance OT"
            value={`${operational.progressPercent}%`}
            suffix={operational.activityStats ? `${operational.activityStats.completed}/${operational.activityStats.total}` : undefined}
            tone={operational.progressPercent === 100 ? "success" : "neutral"}
          />
        )}
      </div>

      {project.scopeSummary && (
        <div className="card" style={{ padding: 16 }}>
          <h3 style={{ marginTop: 0 }}>Alcance del proyecto</h3>
          <p style={{ margin: 0, whiteSpace: "pre-wrap" }}>{project.scopeSummary}</p>
        </div>
      )}

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", gap: 16 }}>
        <div className="card" style={{ padding: 16 }}>
          <h3 style={{ marginTop: 0 }}>Pipeline comercial</h3>
          {opportunity ? (
            <>
              <Row label="Oportunidad" value={`#${opportunity.id} · ${opportunity.title}`} />
              <Row label="Etapa" value={opportunity.stage} />
              <Row label="Cliente" value={opportunity.client?.name || "—"} />
              <Row label="RFC" value={opportunity.client?.taxId || "—"} />
              <Row label="Ejecutivo" value={opportunity.owner?.nombre || "—"} />
            </>
          ) : (
            <p style={{ color: "var(--text-secondary)" }}>Proyecto sin oportunidad vinculada.</p>
          )}
        </div>

        <div className="card" style={{ padding: 16 }}>
          <h3 style={{ marginTop: 0 }}>Operación en campo</h3>
          {operational ? (
            <>
              <Row label="Proyecto operativo" value={`#${operational.id} · ${operational.title}`} />
              <Row label="Estado" value={operational.status} />
              <Row label="Ingenieros" value={String(operational.engineers.length)} />
              {operational.activityStats && (
                <>
                  <Row label="OT completadas" value={`${operational.activityStats.completed} / ${operational.activityStats.total}`} />
                  <Row label="OT en proceso" value={String(operational.activityStats.inProgress)} />
                </>
              )}
              <div style={{ marginTop: 8 }}>
                <a className="button-secondary" href={getOperacionUrl(`/projects/${operational.id}`)} style={{ textDecoration: "none" }}>
                  Abrir en operación →
                </a>
              </div>
            </>
          ) : (
            <p style={{ color: "var(--text-secondary)" }}>
              Aún no se ha desplegado en operación. Usa "Desplegar en operación" desde la lista de proyectos.
            </p>
          )}
        </div>

        <div className="card" style={{ padding: 16 }}>
          <h3 style={{ marginTop: 0 }}>Orden de cierre · Factura</h3>
          {order ? (
            <>
              <Row label="Orden" value={`#${order.orderId} (${order.lineCount} líneas)`} />
              <Row label="Estado" value={order.status} />
              {invoice ? (
                <>
                  <Row label="Factura" value={invoice.invoiceNumber} />
                  <Row label="Estado factura" value={invoice.status} />
                  <Row label="Total" value={money(invoice.totalAmount)} />
                  <Row label="Pagado" value={money(invoice.paidAmount)} />
                  {invoice.cfdiUuid ? (
                    <Row label="CFDI UUID" value={invoice.cfdiUuid} />
                  ) : (
                    <button className="button-primary" type="button" onClick={handleStampInvoice} disabled={stamping || invoice.isCancelled} style={{ marginTop: 8 }}>
                      {stamping ? "Timbrando…" : "🪙 Timbrar CFDI"}
                    </button>
                  )}
                </>
              ) : (
                <button
                  className="button-primary"
                  type="button"
                  onClick={handleGenerateInvoice}
                  disabled={invoicing || !order.lineCount}
                  style={{ marginTop: 8 }}
                >
                  {invoicing ? "Generando…" : "Generar factura desde orden"}
                </button>
              )}
            </>
          ) : (
            <p style={{ color: "var(--text-secondary)" }}>
              El proyecto aún no se ha cerrado. Cierra el proyecto desde la lista para generar la orden con líneas del catálogo.
            </p>
          )}
        </div>
      </div>

      <div className="card" style={{ padding: 16 }}>
        <h3 style={{ marginTop: 0 }}>Costos planeados y reales</h3>
        <ProjectCostTracker projectId={project.id} budget={project.budget} onCostsUpdated={refresh} />
      </div>
    </section>
  );
}

function Stat({ label, value, suffix, tone = "neutral" }: { label: string; value: string; suffix?: string; tone?: "neutral" | "success" | "danger" }) {
  const color = tone === "danger" ? "#ef4444" : tone === "success" ? "#16a34a" : "var(--text-primary)";
  return (
    <div className="card" style={{ padding: 14 }}>
      <div style={{ fontSize: 12, color: "var(--text-secondary)" }}>{label}</div>
      <div style={{ fontSize: 18, fontWeight: 700, color }}>{value}</div>
      {suffix && <div style={{ fontSize: 12, color: "var(--text-secondary)" }}>{suffix}</div>}
    </div>
  );
}

function Row({ label, value }: { label: string; value: string | number }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", padding: "6px 0", borderBottom: "1px dashed var(--border)", gap: 12 }}>
      <span style={{ color: "var(--text-secondary)", fontSize: 13 }}>{label}</span>
      <span style={{ fontWeight: 600, textAlign: "right", wordBreak: "break-all" }}>{value || "—"}</span>
    </div>
  );
}
