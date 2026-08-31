"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import PageHeader from "@/components/ui/PageHeader";
import Section from "@/components/ui/Section";
import Button from "@/components/ui/Button";
import KpiCard from "@/components/ui/KpiCard";
import EmptyState from "@/components/ui/EmptyState";
import { Tag } from "@/components/ui/DataTable";
import { useUser } from "@/components/UserContext";
import { buildApiUrl } from "@/lib/api-base";
import { toast } from "@/components/Toast";

interface TicketDetail {
  id: number;
  description: string;
  requestType?: string;
  urgency?: "LOW" | "MEDIUM" | "HIGH";
  status?: "NEW" | "ASSIGNED" | "CLOSED" | "APPROVED" | "REJECTED";
  dueAt?: string | null;
  branchName?: string | null;
  address?: string | null;
  createdAt?: string;
  updatedAt?: string;
  activityId?: number | null;
  client?: { id: number; name: string } | null;
  assignedTo?: { id: number; nombre: string } | null;
  notes?: string | null;
}

async function apiFetch(path: string, token: string, init: RequestInit = {}) {
  const res = await fetch(buildApiUrl(path), {
    ...init,
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", ...((init.headers ?? {}) as Record<string, string>) },
  });
  if (!res.ok) throw new Error(await res.text().catch(() => `HTTP ${res.status}`));
  if (res.status === 204) return null;
  return res.json();
}

const STATUS_LABELS: Record<string, string> = {
  NEW: "Nuevo", ASSIGNED: "Asignado", APPROVED: "Aprobado", CLOSED: "Cerrado", REJECTED: "Rechazado",
};

const URGENCY_LABELS: Record<string, string> = {
  LOW: "Baja", MEDIUM: "Media", HIGH: "Alta",
};

const statusVariant = (s?: string): "positive" | "accent" | "warning" | "danger" | "neutral" => {
  if (s === "CLOSED" || s === "APPROVED") return "positive";
  if (s === "REJECTED") return "danger";
  if (s === "ASSIGNED") return "accent";
  return "warning";
};

const urgencyVariant = (u?: string): "danger" | "warning" | "neutral" =>
  u === "HIGH" ? "danger" : u === "MEDIUM" ? "warning" : "neutral";

const inp: React.CSSProperties = {
  width: "100%", padding: "8px 12px", borderRadius: 8,
  border: "1px solid var(--border)", background: "var(--surface)",
  color: "var(--foreground)", fontSize: 13, boxSizing: "border-box",
};

export default function SupportTicketDetailPage() {
  const params = useParams<{ id: string }>();
  const id = params.id;
  const { user } = useUser();
  const token = user?.token ?? "";
  const canManage = user?.isSuperAdmin || ["ceo", "super_admin", "dir_admin", "coord_admin", "dir_operaciones", "coord_operaciones", "ing_soporte"].includes(user?.roleKey ?? "");

  const [ticket, setTicket] = useState<TicketDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [patching, setPatching] = useState(false);
  const [editNotes, setEditNotes] = useState(false);
  const [notes, setNotes] = useState("");
  const [savingNotes, setSavingNotes] = useState(false);

  const load = useCallback(async () => {
    if (!token || !id) return;
    setLoading(true);
    setError(null);
    try {
      const data = await apiFetch(`client-ticket-requests/${id}`, token);
      setTicket(data);
      setNotes(data?.notes ?? "");
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo cargar el ticket");
    } finally { setLoading(false); }
  }, [token, id]);

  useEffect(() => { void load(); }, [load]);

  const patchStatus = async (status: string) => {
    if (!token || !id) return;
    setPatching(true);
    try {
      const updated = await apiFetch(`client-ticket-requests/${id}/status`, token, {
        method: "PATCH", body: JSON.stringify({ status }),
      });
      setTicket((prev) => prev ? { ...prev, ...(updated ?? { status }) } : prev);
      toast.success(`Ticket marcado como ${STATUS_LABELS[status] ?? status}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Error al actualizar estado");
    } finally { setPatching(false); }
  };

  const saveNotes = async () => {
    if (!token || !id) return;
    setSavingNotes(true);
    try {
      await apiFetch(`client-ticket-requests/${id}`, token, {
        method: "PATCH", body: JSON.stringify({ notes }),
      });
      setTicket((prev) => prev ? { ...prev, notes } : prev);
      setEditNotes(false);
      toast.success("Notas actualizadas");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Error al guardar notas");
    } finally { setSavingNotes(false); }
  };

  const isOverdue = useMemo(() =>
    ticket?.dueAt && new Date(ticket.dueAt) < new Date() && ticket?.status !== "CLOSED",
    [ticket]
  );

  if (loading) return <EmptyState icon="⏳" title="Cargando ticket…" description="Consultando solicitud de soporte." />;
  if (error) return <EmptyState icon="⚠️" title="No se pudo cargar" description={error} action={<Button size="sm" variant="secondary" onClick={() => void load()}>Reintentar</Button>} />;
  if (!ticket) return null;

  const isClosed = ticket.status === "CLOSED" || ticket.status === "APPROVED" || ticket.status === "REJECTED";

  return (
    <>
      <PageHeader
        eyebrow="OPS · Soporte"
        title={`Ticket T-${ticket.id}`}
        subtitle={ticket.client?.name ?? "Cliente no registrado"}
        meta={
          <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
            <Tag variant={statusVariant(ticket.status)} dot>{STATUS_LABELS[ticket.status ?? "NEW"] ?? ticket.status}</Tag>
            <Tag variant={urgencyVariant(ticket.urgency)}>{URGENCY_LABELS[ticket.urgency ?? "LOW"] ?? ticket.urgency}</Tag>
            {isOverdue && <Tag variant="danger">VENCIDO</Tag>}
          </div>
        }
        actions={
          <>
            <Link href="/ops/support" style={{ textDecoration: "none" }}>
              <Button variant="ghost">← Bandeja</Button>
            </Link>
            {ticket.activityId && (
              <Link href={`/ops/activities/${ticket.activityId}`} style={{ textDecoration: "none" }}>
                <Button variant="secondary">Ver OT #{ticket.activityId}</Button>
              </Link>
            )}
            {canManage && !isClosed && (
              <Link href={`/ops/activities/new?requestId=${ticket.id}`} style={{ textDecoration: "none" }}>
                <Button variant="primary">+ Crear OT</Button>
              </Link>
            )}
          </>
        }
      />

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 12, marginBottom: 20 }}>
        <KpiCard label="Estado" value={STATUS_LABELS[ticket.status ?? "NEW"] ?? ticket.status ?? "Nuevo"} icon="📋" />
        <KpiCard label="Urgencia" value={URGENCY_LABELS[ticket.urgency ?? "LOW"] ?? ticket.urgency ?? "Baja"} icon="⚡" variant={ticket.urgency === "HIGH" ? "danger" : ticket.urgency === "MEDIUM" ? "warning" : "default"} />
        {ticket.dueAt && (
          <KpiCard
            label="Vencimiento"
            value={new Date(ticket.dueAt).toLocaleDateString("es-MX", { day: "2-digit", month: "short", year: "numeric" })}
            icon={isOverdue ? "⚠️" : "📅"}
            variant={isOverdue ? "danger" : "default"}
          />
        )}
        {ticket.createdAt && (
          <KpiCard label="Abierto" value={new Date(ticket.createdAt).toLocaleDateString("es-MX", { day: "2-digit", month: "short", year: "numeric" })} icon="🗓" />
        )}
      </div>

      {/* Status flow stepper */}
      {(() => {
        const FLOW = [
          { key: "NEW", label: "Nuevo", icon: "📋" },
          { key: "ASSIGNED", label: "Asignado", icon: "👤" },
          { key: "APPROVED", label: "Aprobado", icon: "✅" },
        ] as const;
        const REJECTED_FLOW = [
          { key: "NEW", label: "Nuevo", icon: "📋" },
          { key: "ASSIGNED", label: "Asignado", icon: "👤" },
          { key: "REJECTED", label: "Rechazado", icon: "✕" },
        ] as const;
        const CLOSED_FLOW = [
          { key: "NEW", label: "Nuevo", icon: "📋" },
          { key: "ASSIGNED", label: "Asignado", icon: "👤" },
          { key: "CLOSED", label: "Cerrado", icon: "🔒" },
        ] as const;

        const flow: readonly { key: string; label: string; icon: string }[] =
          ticket.status === "REJECTED" ? REJECTED_FLOW :
          ticket.status === "CLOSED" ? CLOSED_FLOW : FLOW;

        const currentIdx = flow.findIndex((s) => s.key === ticket.status);
        const activeIdx = currentIdx >= 0 ? currentIdx : 0;

        return (
          <div style={{ marginBottom: 20, padding: "14px 20px", background: "var(--surface-2)", border: "1px solid var(--border)", borderRadius: 10 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: "var(--text-tertiary)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 14 }}>Flujo del ticket</div>
            <div style={{ display: "flex", alignItems: "center" }}>
              {flow.map((step, idx) => {
                const done = idx < activeIdx;
                const active = idx === activeIdx;
                const isRejected = step.key === "REJECTED" && active;
                const color = isRejected ? "var(--danger)" : done || active ? "var(--success)" : "var(--text-tertiary)";
                const bg = isRejected
                  ? "color-mix(in srgb, var(--danger) 15%, var(--surface-2))"
                  : (done || active)
                    ? "color-mix(in srgb, var(--success) 15%, var(--surface-2))"
                    : "var(--surface)";
                return (
                  <div key={step.key} style={{ display: "flex", alignItems: "center", flex: idx < flow.length - 1 ? 1 : undefined }}>
                    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 6, minWidth: 64 }}>
                      <div style={{
                        width: 36, height: 36, borderRadius: "50%",
                        background: bg,
                        border: `2px solid ${active ? color : done ? "color-mix(in srgb, var(--success) 40%, var(--border))" : "var(--border)"}`,
                        display: "flex", alignItems: "center", justifyContent: "center",
                        fontSize: done ? 14 : 16,
                        fontWeight: 700, color,
                        transition: "all 0.2s",
                      }}>
                        {done ? "✓" : step.icon}
                      </div>
                      <span style={{ fontSize: 11, fontWeight: active ? 700 : 500, color: active ? color : done ? "var(--text-secondary)" : "var(--text-tertiary)", textAlign: "center", whiteSpace: "nowrap" }}>
                        {step.label}
                      </span>
                    </div>
                    {idx < flow.length - 1 && (
                      <div style={{ flex: 1, height: 2, background: done ? "color-mix(in srgb, var(--success) 35%, var(--border))" : "var(--border)", margin: "0 4px", marginBottom: 20 }} />
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        );
      })()}

      <Section title="Detalle de la solicitud">
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
          {[
            { label: "Cliente", value: ticket.client?.name, link: ticket.client?.id ? `/ops/service-clients/${ticket.client.id}` : undefined },
            { label: "Sucursal / Rama", value: ticket.branchName },
            { label: "Tipo de solicitud", value: ticket.requestType },
            { label: "Dirección", value: ticket.address },
          ].map(({ label, value, link }) => (
            <div key={label}>
              <div style={{ fontSize: 11, fontWeight: 700, color: "var(--text-tertiary)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 4 }}>{label}</div>
              {link && value ? (
                <Link href={link} style={{ fontSize: 13, color: "var(--primary)", textDecoration: "none", fontWeight: 600 }}>{value}</Link>
              ) : (
                <div style={{ fontSize: 13, color: value ? "var(--text-primary)" : "var(--text-tertiary)" }}>{value ?? "—"}</div>
              )}
            </div>
          ))}
          <div style={{ gridColumn: "1 / -1" }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: "var(--text-tertiary)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 4 }}>Descripción</div>
            <div style={{ fontSize: 13, color: "var(--text-secondary)", lineHeight: 1.7, padding: "10px 14px", background: "var(--surface-2)", borderRadius: 8 }}>
              {ticket.description}
            </div>
          </div>
        </div>
      </Section>

      <Section
        title="Notas internas"
        actions={
          canManage && !editNotes
            ? <Button size="sm" variant="ghost" iconLeft="✎" onClick={() => setEditNotes(true)}>Editar</Button>
            : undefined
        }
      >
        {editNotes ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={4}
              style={{ ...inp, resize: "vertical" }}
              placeholder="Añade notas internas sobre este ticket…"
              autoFocus
            />
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
              <Button variant="secondary" onClick={() => { setEditNotes(false); setNotes(ticket.notes ?? ""); }}>Cancelar</Button>
              <Button variant="primary" onClick={() => void saveNotes()} disabled={savingNotes}>
                {savingNotes ? "Guardando…" : "Guardar notas"}
              </Button>
            </div>
          </div>
        ) : (
          <div style={{ fontSize: 13, color: ticket.notes ? "var(--text-secondary)" : "var(--text-tertiary)", lineHeight: 1.7, fontStyle: ticket.notes ? "normal" : "italic" }}>
            {ticket.notes ?? "Sin notas internas registradas."}
          </div>
        )}
      </Section>

      {canManage && !isClosed && (
        <Section title="Acciones" eyebrow="Gestión del ticket">
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            {ticket.status === "NEW" && (
              <Button variant="secondary" onClick={() => void patchStatus("ASSIGNED")} disabled={patching}>
                Marcar asignado
              </Button>
            )}
            {(ticket.status === "NEW" || ticket.status === "ASSIGNED") && (
              <>
                <Button variant="primary" onClick={() => void patchStatus("APPROVED")} disabled={patching}>
                  ✓ Aprobar
                </Button>
                <Button variant="ghost" onClick={() => void patchStatus("CLOSED")} disabled={patching}>
                  Cerrar ticket
                </Button>
                <Button variant="ghost" onClick={() => void patchStatus("REJECTED")} disabled={patching} style={{ color: "var(--danger)" }}>
                  Rechazar
                </Button>
              </>
            )}
          </div>
        </Section>
      )}
    </>
  );
}
