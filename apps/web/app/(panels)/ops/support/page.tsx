"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import PageHeader from "@/components/ui/PageHeader";
import Section from "@/components/ui/Section";
import Button from "@/components/ui/Button";
import DataTable, { Tag, type Column } from "@/components/ui/DataTable";
import EmptyState from "@/components/ui/EmptyState";
import { useUser } from "@/components/UserContext";
import { getOpsTeamSectionConfig } from "@/lib/section-views";
import { buildApiUrl } from "@/lib/api-base";

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
  const [statusFilter, setStatusFilter] = useState<string>("");

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

  const nuevos = items.filter((t) => t.status === "NEW").length;
  const asignados = items.filter((t) => t.status === "ASSIGNED").length;
  const vencidos = items.filter((t) => t.dueAt && new Date(t.dueAt) < new Date() && t.status !== "CLOSED").length;

  const patchStatus = async (t: TicketRequest, status: string) => {
    if (!token) return;
    try {
      const updated = await apiFetch(`client-ticket-requests/${t.id}/status`, token, { method: "PATCH", body: JSON.stringify({ status }) });
      setItems((prev) => prev.map((i) => (i.id === t.id ? { ...i, ...(updated ?? { status }) } : i)));
    } catch (e) {
      alert(`Error: ${e instanceof Error ? e.message : "desconocido"}`);
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
    { key: "id", label: "Ticket", render: (t) => <Tag variant="accent">T-{t.id}</Tag>, width: 90 },
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
    { key: "createdAt", label: "Abierto", render: (t) => <span style={{ fontSize: 12 }}>{t.createdAt ? new Date(t.createdAt).toLocaleDateString("es-MX") : "—"}</span>, width: 100 },
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
        actions={
          <>
            <Button variant="ghost" iconLeft="🔄" onClick={() => void load()}>Actualizar</Button>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              style={{ padding: "8px 12px", borderRadius: 8, border: "1px solid var(--border)", background: "var(--surface)", color: "var(--foreground)", fontSize: 13 }}
            >
              <option value="">Todos los estados</option>
              <option value="NEW">Nuevos</option>
              <option value="ASSIGNED">Asignados</option>
              <option value="CLOSED">Cerrados</option>
            </select>
          </>
        }
      />
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 12, marginBottom: 18 }}>
        <Tag variant="warning" dot>{nuevos} nuevos</Tag>
        <Tag variant="accent" dot>{asignados} asignados</Tag>
        {vencidos > 0 && <Tag variant="danger" dot>{vencidos} vencidos</Tag>}
      </div>
      <Section title={loading ? "Cargando…" : `${items.length} tickets`}>
        {loading && <EmptyState icon="⏳" title="Cargando tickets…" description="Consultando solicitudes desde la API." />}
        {!loading && error && (
          <EmptyState icon="⚠️" title="No se pudo cargar" description={error} action={<Button size="sm" variant="secondary" onClick={() => void load()}>Reintentar</Button>} />
        )}
        {!loading && !error && (
          <DataTable columns={columns} rows={items} rowKey={(t) => t.id} emptyTitle="Sin tickets" emptyDescription="No hay solicitudes de soporte registradas." />
        )}
      </Section>
    </>
  );
}
