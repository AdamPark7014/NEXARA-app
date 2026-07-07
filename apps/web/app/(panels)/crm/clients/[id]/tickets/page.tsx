"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import EmptyState from "@/components/ui/EmptyState";
import Button from "@/components/ui/Button";
import InlineAlert from "@/components/ui/InlineAlert";
import { Tag } from "@/components/ui/DataTable";
import { DetailError, DetailSection } from "@/components/detail/DetailFrame";
import FilterToolbar from "@/components/FilterToolbar";
import { exportToCsv } from "@/lib/export-csv";
import { useClientDetail } from "@/components/crm/ClientDetailShell";
import { useUser } from "@/components/UserContext";
import { buildApiUrl } from "@/lib/api-base";

interface TicketRequest {
  id: number;
  description: string;
  status: string;
  urgency?: string | null;
  requestType?: string | null;
  createdAt: string;
  dueAt?: string | null;
  branch?: { id: number; name: string } | null;
}

interface Branch {
  id: number;
  name: string;
}

const inp: React.CSSProperties = {
  width: "100%", padding: "7px 9px", border: "1px solid var(--border)",
  borderRadius: 7, background: "var(--surface)", color: "var(--foreground)", fontSize: 12.5, boxSizing: "border-box",
};

async function apiFetch(path: string, token: string, init: RequestInit = {}) {
  const res = await fetch(buildApiUrl(path), {
    ...init,
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", ...(init.headers as Record<string, string> ?? {}) },
  });
  if (!res.ok) throw new Error(await res.text().catch(() => `HTTP ${res.status}`));
  if (res.status === 204) return null;
  const t = await res.text();
  return t ? JSON.parse(t) : null;
}

export default function ClientTicketsPage() {
  const { client, error: clientError, reload: reloadClient } = useClientDetail();
  const { user } = useUser();
  const token = user?.token ?? "";
  const scId = client?.serviceClient?.id;

  const [tickets, setTickets] = useState<TicketRequest[]>([]);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searchQ, setSearchQ] = useState("");
  const [filterStatus, setFilterStatus] = useState("");
  const [filterUrgency, setFilterUrgency] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ description: "", branchId: "", urgency: "MEDIUM", requestType: "ISSUE" });
  const [saving, setSaving] = useState(false);
  const [saveErr, setSaveErr] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!token || !scId) return;
    setLoading(true);
    setError(null);
    try {
      const data = await apiFetch(`service-clients/${scId}/snapshot`, token);
      setTickets(Array.isArray(data?.ticketRequests) ? data.ticketRequests : []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error al cargar tickets");
    } finally {
      setLoading(false);
    }
  }, [token, scId]);

  const loadBranches = useCallback(async () => {
    if (!token || !scId) return;
    try {
      const data = await apiFetch(`service-clients/${scId}/branches`, token);
      setBranches(Array.isArray(data) ? data : []);
    } catch {
      setBranches([]);
    }
  }, [token, scId]);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => { if (showForm) void loadBranches(); }, [showForm, loadBranches]);

  const submitTicket = async () => {
    if (!token || !scId || !form.description.trim()) return;
    setSaving(true);
    setSaveErr(null);
    try {
      await apiFetch(`service-clients/${scId}/ticket-requests`, token, {
        method: "POST",
        body: JSON.stringify({
          description: form.description.trim(),
          branchId: form.branchId ? Number(form.branchId) : undefined,
          urgency: form.urgency,
          requestType: form.requestType,
        }),
      });
      setShowForm(false);
      setForm({ description: "", branchId: "", urgency: "MEDIUM", requestType: "ISSUE" });
      void load();
    } catch (e) {
      setSaveErr(e instanceof Error ? e.message : "No se pudo crear el ticket");
    } finally {
      setSaving(false);
    }
  };

  if (clientError) return <DetailError message={clientError} onRetry={reloadClient} />;
  if (!client) return null;

  if (!client.serviceClient) {
    return (
      <EmptyState
        icon="🎫"
        title="Portal de tickets no disponible"
        description="Provisiona el cliente en operaciones para habilitar tickets de sucursal."
      />
    );
  }

  const visibleTickets = useMemo(() => {
    let rows = tickets;
    if (filterStatus) rows = rows.filter((t) => t.status === filterStatus);
    if (filterUrgency) rows = rows.filter((t) => t.urgency === filterUrgency);
    if (searchQ.trim()) {
      const q = searchQ.toLowerCase();
      rows = rows.filter((t) =>
        t.description.toLowerCase().includes(q) ||
        (t.branch?.name ?? "").toLowerCase().includes(q)
      );
    }
    return rows;
  }, [tickets, searchQ, filterStatus, filterUrgency]);

  const urgencyVariant = (u?: string | null): "danger" | "warning" | "default" =>
    u === "HIGH" ? "danger" : u === "MEDIUM" ? "warning" : "default";

  const statusVariant = (s: string): "positive" | "accent" | "warning" | "danger" | "default" => {
    if (s === "CLOSED" || s === "APPROVED") return "positive";
    if (s === "REJECTED") return "danger";
    if (s === "ASSIGNED") return "accent";
    return "warning";
  };

  return (
    <DetailSection title="Tickets de soporte">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10, flexWrap: "wrap", gap: 8 }}>
        <span style={{ fontSize: 12.5, color: "var(--text-secondary)" }}>
          {tickets.filter((t) => t.status === "NEW").length} nuevo(s) · {tickets.length} total
        </span>
        <div style={{ display: "flex", gap: 8 }}>
          <Button variant="ghost" size="sm" onClick={() => void load()}>Actualizar</Button>
          <Button variant="primary" size="sm" iconLeft="+" onClick={() => { setSaveErr(null); setShowForm(true); }}>Nuevo ticket</Button>
          <Link href="/ops/support" style={{ textDecoration: "none" }}>
            <Button variant="secondary" size="sm">Bandeja OPS →</Button>
          </Link>
        </div>
      </div>

      {tickets.length > 0 && (
        <FilterToolbar
          search={{ value: searchQ, onChange: setSearchQ, placeholder: "Buscar por descripción o sucursal…" }}
          selects={[
            {
              label: "Estado",
              value: filterStatus,
              onChange: setFilterStatus,
              options: [
                { value: "NEW", label: "Nuevo" },
                { value: "ASSIGNED", label: "Asignado" },
                { value: "APPROVED", label: "Aprobado" },
                { value: "CLOSED", label: "Cerrado" },
                { value: "REJECTED", label: "Rechazado" },
              ],
              allowAll: true,
            },
            {
              label: "Urgencia",
              value: filterUrgency,
              onChange: setFilterUrgency,
              options: [
                { value: "HIGH", label: "Alta" },
                { value: "MEDIUM", label: "Media" },
                { value: "LOW", label: "Baja" },
              ],
              allowAll: true,
            },
          ]}
          onClear={() => { setSearchQ(""); setFilterStatus(""); setFilterUrgency(""); }}
          resultCount={visibleTickets.length}
          rightActions={
            <Button variant="ghost" size="sm" iconLeft="⬇" onClick={() => exportToCsv(visibleTickets, [
              { key: "id", label: "ID" },
              { key: "description", label: "Descripción" },
              { key: "status", label: "Estado" },
              { key: "urgency", label: "Urgencia" },
              { key: "requestType", label: "Tipo" },
              { key: "createdAt", label: "Fecha", format: (v) => v ? new Date(String(v)).toLocaleDateString("es-MX") : "" },
            ], "tickets-cliente")}>CSV</Button>
          }
        />
      )}

      {saveErr && !showForm && <InlineAlert message={saveErr} onDismiss={() => setSaveErr(null)} />}

      {loading && <EmptyState icon="⏳" title="Cargando tickets…" description="Consultando tickets de soporte." />}
      {!loading && error && <EmptyState icon="⚠️" title="Sin tickets" description={error} action={<Button size="sm" variant="secondary" onClick={() => void load()}>Reintentar</Button>} />}
      {!loading && !error && tickets.length === 0 && <EmptyState icon="🎫" title="Sin tickets" description="No hay solicitudes registradas para este cliente." />}
      {!loading && !error && tickets.length > 0 && (
        <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "grid", gap: 8 }}>
          {visibleTickets.length === 0 && (
            <EmptyState icon="🔍" title="Sin resultados" description="Ajusta los filtros de búsqueda." />
          )}
          {visibleTickets.map((t) => (
            <li key={t.id} style={{ padding: "10px 14px", border: "1px solid var(--border)", borderRadius: 10, background: "var(--surface)" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8 }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{ margin: 0, fontWeight: 600, fontSize: 13 }}>{t.description}</p>
                  {t.branch && <span style={{ fontSize: 11.5, color: "var(--text-tertiary)" }}>Sucursal: {t.branch.name}</span>}
                </div>
                <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
                  {t.urgency && <Tag variant={urgencyVariant(t.urgency)}>{t.urgency}</Tag>}
                  <Tag variant={statusVariant(t.status)}>{t.status}</Tag>
                </div>
              </div>
              {t.createdAt && (
                <p style={{ margin: "4px 0 0", fontSize: 11, color: "var(--text-tertiary)" }}>
                  {new Date(t.createdAt).toLocaleDateString("es-MX")}
                </p>
              )}
            </li>
          ))}
        </ul>
      )}

      {showForm && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000 }} onClick={() => setShowForm(false)}>
          <div style={{ background: "var(--surface)", borderRadius: 14, padding: "22px 24px", width: 420, maxWidth: "calc(100vw - 32px)", boxShadow: "0 20px 50px rgba(0,0,0,0.22)", border: "1px solid var(--border)" }} onClick={(e) => e.stopPropagation()}>
            <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 16 }}>Nuevo ticket de soporte</div>
            <div style={{ display: "grid", gap: 12 }}>
              <label style={{ display: "grid", gap: 4 }}>
                <span style={{ fontSize: 11.5, fontWeight: 600, color: "var(--text-secondary)" }}>Descripción del problema *</span>
                <textarea rows={3} value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} placeholder="Describe el problema o solicitud…" style={{ ...inp, resize: "vertical" }} />
              </label>
              {branches.length > 0 && (
                <label style={{ display: "grid", gap: 4 }}>
                  <span style={{ fontSize: 11.5, fontWeight: 600, color: "var(--text-secondary)" }}>Sucursal</span>
                  <select value={form.branchId} onChange={(e) => setForm((f) => ({ ...f, branchId: e.target.value }))} style={inp}>
                    <option value="">Sede principal</option>
                    {branches.map((b) => <option key={b.id} value={String(b.id)}>{b.name}</option>)}
                  </select>
                </label>
              )}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                <label style={{ display: "grid", gap: 4 }}>
                  <span style={{ fontSize: 11.5, fontWeight: 600, color: "var(--text-secondary)" }}>Urgencia</span>
                  <select value={form.urgency} onChange={(e) => setForm((f) => ({ ...f, urgency: e.target.value }))} style={inp}>
                    <option value="LOW">Baja</option>
                    <option value="MEDIUM">Media</option>
                    <option value="HIGH">Alta</option>
                  </select>
                </label>
                <label style={{ display: "grid", gap: 4 }}>
                  <span style={{ fontSize: 11.5, fontWeight: 600, color: "var(--text-secondary)" }}>Tipo</span>
                  <select value={form.requestType} onChange={(e) => setForm((f) => ({ ...f, requestType: e.target.value }))} style={inp}>
                    <option value="ISSUE">Incidencia</option>
                    <option value="MAINTENANCE">Mantenimiento</option>
                    <option value="IMPROVEMENT">Mejora</option>
                  </select>
                </label>
              </div>
              {saveErr && <p style={{ margin: 0, fontSize: 12, color: "var(--danger)" }}>{saveErr}</p>}
            </div>
            <div style={{ display: "flex", gap: 10, marginTop: 18, justifyContent: "flex-end" }}>
              <Button variant="ghost" onClick={() => setShowForm(false)}>Cancelar</Button>
              <Button variant="primary" onClick={() => void submitTicket()} disabled={saving || !form.description.trim()}>{saving ? "Enviando…" : "Crear ticket"}</Button>
            </div>
          </div>
        </div>
      )}
    </DetailSection>
  );
}
