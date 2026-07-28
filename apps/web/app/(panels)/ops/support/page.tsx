"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import PageHeader from "@/components/ui/PageHeader";
import Section from "@/components/ui/Section";
import Button from "@/components/ui/Button";
import DataTable, { Tag, type Column } from "@/components/ui/DataTable";
import KpiCard from "@/components/ui/KpiCard";
import EmptyState from "@/components/ui/EmptyState";
import { useUser } from "@/components/UserContext";
import { getOpsTeamSectionConfig } from "@/lib/section-views";
import { buildApiUrl } from "@/lib/api-base";
import { toast } from "@/components/Toast";
import FilterToolbar from "@/components/FilterToolbar";
import { exportToExcel } from "@/lib/export-excel";

interface TicketRequest {
  id: number;
  description: string;
  requestType?: string;
  urgency?: "LOW" | "MEDIUM" | "HIGH";
  status?: "NEW" | "ASSIGNED" | "CLOSED" | "APPROVED" | "REJECTED";
  dueAt?: string | null;
  branchName?: string | null;
  address?: string | null;
  createdAt?: string;
  activityId?: number | null;
  client?: { id: number; name: string } | null;
}

async function apiFetch(path: string, token: string, init: RequestInit = {}) {
  const res = await fetch(buildApiUrl(path), {
    ...init,
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", ...(init.headers as Record<string, string> ?? {}) },
  });
  if (!res.ok) {
    const t = await res.text().catch(() => "");
    throw new Error(t || `HTTP ${res.status}`);
  }
  if (res.status === 204) return null;
  const t = await res.text();
  return t ? JSON.parse(t) : null;
}

export default function SupportInboxPage() {
  const { user } = useUser();
  const cfg = useMemo(() => getOpsTeamSectionConfig(user, "support"), [user]);
  const canViewAll = cfg.defaultScope === "team";
  const token = user?.token ?? "";

  const [items, setItems] = useState<TicketRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQ, setSearchQ] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("");
  const [urgencyFilter, setUrgencyFilter] = useState<string>("");

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    setError(null);
    try {
      const qs = statusFilter ? `?status=${statusFilter}` : "";
      const data = await apiFetch(`client-ticket-requests${qs}`, token);
      setItems(Array.isArray(data) ? data : (data?.data ?? []));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error al cargar tickets");
    } finally {
      setLoading(false);
    }
  }, [token, statusFilter]);

  useEffect(() => { void load(); }, [load]);

  const visibleItems = useMemo(() => {
    let rows = items;
    if (searchQ.trim()) {
      const q = searchQ.toLowerCase();
      rows = rows.filter((t) =>
        (t.client?.name ?? "").toLowerCase().includes(q) ||
        (t.description ?? "").toLowerCase().includes(q) ||
        (t.address ?? "").toLowerCase().includes(q)
      );
    }
    if (urgencyFilter) rows = rows.filter((t) => t.urgency === urgencyFilter);
    return rows;
  }, [items, searchQ, urgencyFilter]);

  const nuevos = items.filter((t) => t.status === "NEW").length;
  const asignados = items.filter((t) => t.status === "ASSIGNED").length;
  const vencidos = items.filter((t) => t.dueAt && new Date(t.dueAt) < new Date() && t.status !== "CLOSED").length;

  const patchStatus = async (t: TicketRequest, status: string) => {
    if (!token) return;
    try {
      const updated = await apiFetch(`client-ticket-requests/${t.id}/status`, token, { method: "PATCH", body: JSON.stringify({ status }) });
      setItems((prev) => prev.map((i) => (i.id === t.id ? { ...i, ...(updated ?? { status }) } : i)));
    } catch (e) {
      toast.error(`Error: ${e instanceof Error ? e.message : "desconocido"}`);
    }
  };

  const urgencyVariant = (u?: string): "danger" | "warning" | "default" =>
    u === "HIGH" ? "danger" : u === "MEDIUM" ? "warning" : "default";

  const statusVariant = (s?: string): "positive" | "accent" | "warning" | "danger" | "default" => {
    if (s === "CLOSED" || s === "APPROVED") return "positive";
    if (s === "REJECTED") return "danger";
    if (s === "ASSIGNED") return "accent";
    return "warning";
  };

  const columns: Column<TicketRequest>[] = useMemo(() => [
    { key: "id", label: "Ticket", render: (t) => <Link href={`/ops/support/${t.id}`} style={{ textDecoration: "none" }}><Tag variant="accent">T-{t.id}</Tag></Link>, width: 90 },
    {
      key: "cliente", label: "Cliente / Solicitud",
      render: (t) => (
        <div>
          <div style={{ fontWeight: 700, fontSize: 13 }}>{t.client?.name ?? "—"}{t.branchName ? ` · ${t.branchName}` : ""}</div>
          <div style={{ fontSize: 11.5, color: "var(--text-tertiary)" }}>{t.description?.slice(0, 70)}</div>
        </div>
      ),
    },
    { key: "urgency", label: "Urgencia", render: (t) => <Tag variant={urgencyVariant(t.urgency)}>{t.urgency ?? "—"}</Tag>, width: 100 },
    { key: "status", label: "Estado", render: (t) => <Tag variant={statusVariant(t.status)}>{t.status ?? "NEW"}</Tag>, width: 110 },
    {
      key: "createdAt", label: "Antigüedad",
      render: (t) => {
        const days = t.createdAt ? Math.floor((Date.now() - new Date(t.createdAt).getTime()) / 86400000) : null;
        const color = days === null ? "var(--text-tertiary)" : days >= 14 ? "var(--danger)" : days >= 7 ? "var(--warning)" : "var(--success)";
        return (
          <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
            <div style={{ width: 6, height: 6, borderRadius: "50%", background: color, flexShrink: 0 }} />
            <span style={{ fontSize: 12, color, fontWeight: days !== null && days >= 7 ? 700 : 400 }}>
              {days !== null ? `${days}d` : "—"}
            </span>
          </div>
        );
      },
      width: 85,
    },
    {
      key: "dueAt", label: "Vence",
      render: (t) => {
        const overdue = t.dueAt && new Date(t.dueAt) < new Date() && t.status !== "CLOSED";
        return <span style={{ fontWeight: 700, color: overdue ? "var(--danger)" : "var(--text-primary)" }}>{t.dueAt ? new Date(t.dueAt).toLocaleDateString("es-MX") : "—"}</span>;
      },
      width: 100,
    },
    {
      key: "acciones" as keyof TicketRequest, label: "",
      render: (t) => (
        <div style={{ display: "flex", gap: 4, justifyContent: "flex-end", flexWrap: "wrap" }}>
          {t.activityId && (
            <Link href={`/ops/activities/${t.activityId}`} style={{ textDecoration: "none" }}>
              <Button size="sm" variant="ghost">Ver OT</Button>
            </Link>
          )}
          {cfg.canApprove ? (
            <>
              {t.status === "NEW" && (
                <>
                  <Link href={`/ops/activities?ticketId=${t.id}`} style={{ textDecoration: "none" }}>
                    <Button size="sm" variant="primary">Crear OT</Button>
                  </Link>
                  <Button size="sm" variant="secondary" onClick={(e) => { e.stopPropagation(); void patchStatus(t, "ASSIGNED"); }}>Marcar asignado</Button>
                </>
              )}
              {(t.status === "NEW" || t.status === "ASSIGNED") && (
                <Button size="sm" variant="ghost" onClick={(e) => { e.stopPropagation(); void patchStatus(t, "CLOSED"); }}>Cerrar</Button>
              )}
            </>
          ) : null}
        </div>
      ),
      width: 220,
    },
  ], [cfg.canApprove]);

  return (
    <>
      <PageHeader
        eyebrow="OPS · Soporte"
        title="Bandeja de soporte"
        subtitle={canViewAll ? "Solicitudes de tickets de clientes con contrato vigente." : "Tickets asignados a tu equipo."}
        actions={<Button variant="ghost" iconLeft="🔄" onClick={() => void load()}>Actualizar</Button>}
      />
      {(() => {
        const cerrados = items.filter((t) => t.status === "CLOSED" || t.status === "APPROVED" || t.status === "REJECTED").length;
        const altaUrgencia = items.filter((t) => t.urgency === "HIGH" && t.status !== "CLOSED").length;
        const byUrgency = [
          { label: "Alta", count: items.filter((t) => t.urgency === "HIGH").length, color: "var(--danger)" },
          { label: "Media", count: items.filter((t) => t.urgency === "MEDIUM").length, color: "var(--warning)" },
          { label: "Baja", count: items.filter((t) => t.urgency === "LOW").length, color: "var(--success)" },
        ].filter((x) => x.count > 0);
        return (
          <>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 12, marginBottom: items.length > 0 ? 14 : 18 }}>
              <KpiCard label="Nuevos" value={nuevos} variant={nuevos > 0 ? "warning" : "positive"} icon="📥" hint="Sin atender" />
              <KpiCard label="Asignados" value={asignados} variant="accent" icon="🔧" hint="En proceso" />
              <KpiCard label="Cerrados" value={cerrados} variant="positive" icon="✅" hint="Resueltos" />
              <KpiCard label="Vencidos" value={vencidos} variant={vencidos > 0 ? "danger" : "positive"} icon="⚠️" hint={vencidos > 0 ? "Requieren atención inmediata" : "Sin tickets vencidos"} />
            </div>
            {items.length > 0 && byUrgency.length > 0 && (
              <div style={{ marginBottom: 16, padding: "12px 16px", background: "var(--surface-2)", border: `1px solid ${altaUrgencia > 0 ? "color-mix(in srgb, var(--danger) 30%, var(--border))" : "var(--border)"}`, borderRadius: 10 }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: "var(--text-tertiary)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 10 }}>Urgencia de tickets abiertos</div>
                <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
                  {byUrgency.map(({ label, count, color }) => (
                    <div key={label} style={{ display: "grid", gridTemplateColumns: "60px 1fr 36px", gap: 10, alignItems: "center" }}>
                      <span style={{ fontSize: 12, color: "var(--text-secondary)", fontWeight: 600 }}>{label}</span>
                      <div style={{ height: 6, borderRadius: 3, background: "var(--surface)", overflow: "hidden" }}>
                        <div style={{ height: "100%", width: `${(count / items.length) * 100}%`, background: color, borderRadius: 3 }} />
                      </div>
                      <span style={{ fontSize: 11.5, color: "var(--text-tertiary)", textAlign: "right" }}>{count}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>
        );
      })()}
      <FilterToolbar
        search={{ value: searchQ, onChange: setSearchQ, placeholder: "Buscar por cliente, descripción o dirección…" }}
        selects={[
          {
            label: "Estado",
            value: statusFilter,
            onChange: setStatusFilter,
            options: [
              { value: "NEW", label: "Nuevos" },
              { value: "ASSIGNED", label: "Asignados" },
              { value: "APPROVED", label: "Aprobados" },
              { value: "CLOSED", label: "Cerrados" },
              { value: "REJECTED", label: "Rechazados" },
            ],
            allowAll: true,
          },
          {
            label: "Urgencia",
            value: urgencyFilter,
            onChange: setUrgencyFilter,
            options: [
              { value: "HIGH", label: "Alta" },
              { value: "MEDIUM", label: "Media" },
              { value: "LOW", label: "Baja" },
            ],
            allowAll: true,
          },
        ]}
        onClear={() => { setSearchQ(""); setStatusFilter(""); setUrgencyFilter(""); }}
        resultCount={loading ? null : visibleItems.length}
        rightActions={items.length > 0 ? (
          <Button variant="ghost" size="sm" iconLeft="⬇" onClick={() => exportToExcel(visibleItems, [
            { key: "id", label: "Ticket", format: (v) => `T-${String(v)}` },
            { key: "client", label: "Cliente", format: (v) => (v as TicketRequest["client"])?.name ?? "—" },
            { key: "description", label: "Descripción" },
            { key: "urgency", label: "Urgencia" },
            { key: "status", label: "Estado" },
            { key: "createdAt", label: "Abierto", format: (v) => v ? String(v).slice(0, 10) : "" },
            { key: "dueAt", label: "Vence", format: (v) => v ? String(v).slice(0, 10) : "" },
          ], "tickets-soporte")}>Excel</Button>
        ) : undefined}
      />

      <Section title={loading ? "Cargando…" : `${visibleItems.length} tickets`}>
        {loading && <EmptyState icon="⏳" title="Cargando tickets…" description="Consultando solicitudes desde la API." />}
        {!loading && error && (
          <EmptyState icon="⚠️" title="No se pudo cargar" description={error} action={<Button size="sm" variant="secondary" onClick={() => void load()}>Reintentar</Button>} />
        )}
        {!loading && !error && (
          <DataTable
            columns={columns}
            rows={visibleItems}
            rowKey={(t) => t.id}
            emptyTitle="Sin tickets"
            emptyDescription="Cuando un cliente con contrato abra una solicitud, aparecerá aquí. Mientras tanto puedes revisar SLA o crear una OT."
            emptyAction={
              <div style={{ display: "flex", gap: 8, justifyContent: "center", flexWrap: "wrap" }}>
                <Link href="/ops/support/sla" style={{ textDecoration: "none" }}>
                  <Button size="sm" variant="secondary">Ver SLA</Button>
                </Link>
                <Link href="/ops/activities" style={{ textDecoration: "none" }}>
                  <Button size="sm" variant="primary">Ir a actividades</Button>
                </Link>
              </div>
            }
          />
        )}
      </Section>
    </>
  );
}
