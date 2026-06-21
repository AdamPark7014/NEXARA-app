"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import PageHeader from "@/components/ui/PageHeader";
import Section from "@/components/ui/Section";
import KpiCard from "@/components/ui/KpiCard";
import Button from "@/components/ui/Button";
import DataTable, { Tag, Money, type Column } from "@/components/ui/DataTable";
import EmptyState from "@/components/ui/EmptyState";
import { useUser } from "@/components/UserContext";
import { useRbacGuard } from "@/lib/useRbacGuard";
import { buildApiUrl } from "@/lib/api-base";

interface Viatico {
  id: number;
  concepto?: string;
  montoSolicitado?: number;
  estatus?: string;
  fechaSolicitud?: string;
  comprobante?: string;
  usuario?: { id: number; nombre: string; email?: string };
  actividad?: { id: number; titulo?: string; folio?: string } | null;
  aprobadoCoordinador?: boolean;
  aprobadoAdmin?: boolean;
  comentariosAdmin?: string;
}

const ESTATUS = ["Pendiente", "Aprobado_Coordinador", "Aprobado", "Rechazado", "Pagado"];

async function apiFetch(path: string, token: string, opts?: RequestInit) {
  const res = await fetch(buildApiUrl(path), {
    ...opts,
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", ...(opts?.headers ?? {}) },
  });
  if (!res.ok) {
    const txt = await res.text().catch(() => "");
    throw new Error(txt || `HTTP ${res.status}`);
  }
  if (res.status === 204) return null;
  const t = await res.text();
  return t ? JSON.parse(t) : null;
}

const emptyForm = { concepto: "", montoSolicitado: 0, comprobante: "" };

type FormMode = "create" | "approve" | null;

export default function ViaticosPage() {
  const { user } = useUser();
  const { canCreate, canApprove, canViewAll, canDelete, nivel } = useRbacGuard();
  const token = user?.token ?? "";

  const [items, setItems] = useState<Viatico[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [mode, setMode] = useState<FormMode>(null);
  const [selected, setSelected] = useState<Viatico | null>(null);
  const [form, setForm] = useState({ ...emptyForm });
  const [approveForm, setApproveForm] = useState({ estatus: "Aprobado", comentariosAdmin: "" });
  const [saving, setSaving] = useState(false);
  const [filter, setFilter] = useState("");

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    setError(null);
    try {
      const data = await apiFetch("viatics", token);
      setItems(Array.isArray(data) ? data : (data?.data ?? []));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error al cargar viáticos");
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => { void load(); }, [load]);

  const filtered = useMemo(() => {
    const q = filter.trim().toLowerCase();
    if (!q) return items;
    return items.filter(
      (v) =>
        (v.concepto ?? "").toLowerCase().includes(q) ||
        (v.usuario?.nombre ?? "").toLowerCase().includes(q) ||
        (v.actividad?.folio ?? "").toLowerCase().includes(q) ||
        (v.estatus ?? "").toLowerCase().includes(q),
    );
  }, [items, filter]);

  const pendientes = items.filter((v) => v.estatus === "Pendiente" || v.estatus === "Aprobado_Coordinador").length;
  const aprobados = items.filter((v) => v.estatus === "Aprobado" || v.estatus === "Pagado").length;
  const totalMonto = items.reduce((s, v) => s + (Number(v.montoSolicitado) || 0), 0);
  const pendienteMonto = items
    .filter((v) => v.estatus !== "Rechazado")
    .reduce((s, v) => s + (Number(v.montoSolicitado) || 0), 0);

  const openCreate = () => { setForm({ ...emptyForm }); setMode("create"); };
  const openApprove = (v: Viatico) => {
    setSelected(v);
    setApproveForm({ estatus: "Aprobado", comentariosAdmin: "" });
    setMode("approve");
  };

  const submitCreate = async () => {
    if (!token) return;
    setSaving(true);
    try {
      const created = await apiFetch("viatics", token, { method: "POST", body: JSON.stringify(form) });
      if (created) setItems((prev) => [created, ...prev]);
      setMode(null);
    } catch (e) {
      alert(`Error: ${e instanceof Error ? e.message : "desconocido"}`);
    } finally { setSaving(false); }
  };

  const submitApprove = async () => {
    if (!token || !selected) return;
    setSaving(true);
    try {
      const updated = await apiFetch(`viatics/${selected.id}`, token, {
        method: "PATCH",
        body: JSON.stringify({
          estatus: approveForm.estatus,
          aprobadoAdmin: approveForm.estatus === "Aprobado",
          comentariosAdmin: approveForm.comentariosAdmin,
        }),
      });
      setItems((prev) => prev.map((v) => (v.id === selected.id ? { ...v, ...(updated ?? {}) } : v)));
      setMode(null);
    } catch (e) {
      alert(`Error: ${e instanceof Error ? e.message : "desconocido"}`);
    } finally { setSaving(false); }
  };

  const softDelete = async (v: Viatico) => {
    if (!token || !confirm(`¿Cancelar viático "${v.concepto}"?`)) return;
    try {
      await apiFetch(`viatics/${v.id}`, token, { method: "PATCH", body: JSON.stringify({ estatus: "Rechazado" }) });
      setItems((prev) => prev.map((i) => (i.id === v.id ? { ...i, estatus: "Rechazado" } : i)));
    } catch (e) {
      alert(`Error: ${e instanceof Error ? e.message : "desconocido"}`);
    }
  };

  const estatusVariant = (e?: string): "positive" | "warning" | "danger" | "accent" | "default" => {
    if (e === "Aprobado" || e === "Pagado") return "positive";
    if (e === "Rechazado") return "danger";
    if (e === "Aprobado_Coordinador") return "accent";
    return "warning";
  };

  const inp: React.CSSProperties = {
    width: "100%", padding: "8px 12px", border: "1px solid var(--border)",
    borderRadius: 8, background: "var(--surface-2)", color: "var(--foreground)", fontSize: 13,
  };

  const columns: Column<Viatico>[] = [
    {
      key: "id", label: "ID",
      render: (v) => <code style={{ fontSize: 11 }}>V-{String(v.id).padStart(4, "0")}</code>,
      width: 80,
    },
    ...(canViewAll ? [{
      key: "usuario" as keyof Viatico,
      label: "Solicitante",
      render: (v: Viatico) => (
        <div>
          <div style={{ fontWeight: 600, fontSize: 12.5 }}>{v.usuario?.nombre ?? "—"}</div>
          {v.actividad && <div style={{ fontSize: 11, color: "var(--text-tertiary)" }}>{v.actividad.folio ?? `Act-${v.actividad.id}`}</div>}
        </div>
      ),
      width: 160,
    }] : []),
    {
      key: "concepto", label: "Concepto",
      accessor: (v) => v.concepto ?? "—",
    },
    {
      key: "montoSolicitado", label: "Monto",
      align: "right" as const,
      render: (v) => <Money value={Number(v.montoSolicitado) || 0} />,
      width: 110,
    },
    {
      key: "fechaSolicitud", label: "Fecha",
      render: (v) => <span style={{ fontSize: 12 }}>{v.fechaSolicitud ? new Date(v.fechaSolicitud).toLocaleDateString("es-MX") : "—"}</span>,
      width: 100,
    },
    {
      key: "estatus", label: "Estado",
      render: (v) => <Tag variant={estatusVariant(v.estatus)}>{(v.estatus ?? "Pendiente").replace(/_/g, " ")}</Tag>,
      width: 160,
    },
    {
      key: "acciones" as keyof Viatico, label: "",
      render: (v) => (
        <div style={{ display: "flex", gap: 4, justifyContent: "flex-end" }}>
          {canApprove && (v.estatus === "Pendiente" || v.estatus === "Aprobado_Coordinador") && (
            <Button size="sm" variant="secondary" onClick={(e) => { e.stopPropagation(); openApprove(v); }}>Revisar</Button>
          )}
          {canDelete && (
            <Button size="sm" variant="danger" onClick={(e) => { e.stopPropagation(); void softDelete(v); }}>✕</Button>
          )}
        </div>
      ),
      width: 140,
    },
  ];

  return (
    <>
      <PageHeader
        eyebrow="ERP · Finanzas"
        title="Viáticos"
        subtitle={canViewAll
          ? "Gestión y aprobación de viáticos del equipo. El flujo va de coordinador OPS → administración → banca."
          : "Tus solicitudes de viáticos. Adjunta comprobante y espera la aprobación de tu coordinador."}
        variant="hero"
        actions={
          <>
            <Button variant="ghost" iconLeft="🔄" onClick={() => void load()}>Actualizar</Button>
            {canCreate && (
              <Button variant="primary" iconLeft="💸" onClick={openCreate}>Solicitar viático</Button>
            )}
          </>
        }
      />

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 12, marginBottom: 20 }}>
        <KpiCard label="Pendientes" value={pendientes} variant={pendientes > 0 ? "warning" : "positive"} icon="⏳" />
        <KpiCard label="Aprobados" value={aprobados} variant="positive" icon="✅" />
        <KpiCard label="Total registros" value={items.length} variant="default" icon="📋" />
        {canViewAll && (
          <KpiCard label="Monto pendiente" value={`$${(pendienteMonto / 1000).toFixed(1)}k`} variant={pendienteMonto > 10000 ? "warning" : "default"} icon="💰" />
        )}
      </div>

      <div style={{ marginBottom: 12 }}>
        <input
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          placeholder="Buscar por concepto, solicitante, folio…"
          style={{ width: "100%", maxWidth: 400, padding: "8px 12px", borderRadius: 8, border: "1px solid var(--border)", background: "var(--surface)", color: "var(--foreground)", fontSize: 13 }}
        />
      </div>

      <Section title={loading ? "Cargando…" : `${filtered.length} viáticos`}>
        {loading && <EmptyState icon="⏳" title="Cargando viáticos…" description="Consultando solicitudes desde la API." />}
        {!loading && error && (
          <EmptyState
            icon="⚠️"
            title="No se pudo cargar"
            description={error}
            action={<Button size="sm" variant="secondary" onClick={() => void load()}>Reintentar</Button>}
          />
        )}
        {!loading && !error && (
          <DataTable
            columns={columns}
            rows={filtered}
            rowKey={(v) => v.id}
            emptyTitle="Sin viáticos"
            emptyDescription={canCreate ? "Solicita tu primer viático con el botón de arriba." : "No hay viáticos registrados."}
          />
        )}
      </Section>

      {/* Modal crear */}
      {mode === "create" && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000 }}
          onClick={() => setMode(null)}>
          <div style={{ background: "var(--surface)", borderRadius: 16, padding: 28, width: 460, maxWidth: "calc(100vw - 32px)", boxShadow: "0 24px 56px rgba(0,0,0,0.24)", border: "1px solid var(--border)" }}
            onClick={(e) => e.stopPropagation()}>
            <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 20 }}>Solicitar viático</div>
            <div style={{ display: "grid", gap: 14 }}>
              <label style={{ display: "grid", gap: 4 }}>
                <span style={{ fontSize: 11.5, fontWeight: 600, color: "var(--text-secondary)" }}>Concepto / descripción</span>
                <input value={form.concepto} onChange={(e) => setForm((f) => ({ ...f, concepto: e.target.value }))}
                  placeholder="Ej: Hospedaje 1 noche + viáticos Puebla" style={inp} />
              </label>
              <label style={{ display: "grid", gap: 4 }}>
                <span style={{ fontSize: 11.5, fontWeight: 600, color: "var(--text-secondary)" }}>Monto solicitado ($)</span>
                <input type="number" min={0} value={form.montoSolicitado}
                  onChange={(e) => setForm((f) => ({ ...f, montoSolicitado: +e.target.value }))} style={inp} />
              </label>
              <label style={{ display: "grid", gap: 4 }}>
                <span style={{ fontSize: 11.5, fontWeight: 600, color: "var(--text-secondary)" }}>URL comprobante / folio factura</span>
                <input value={form.comprobante} onChange={(e) => setForm((f) => ({ ...f, comprobante: e.target.value }))}
                  placeholder="Opcional — se puede adjuntar después" style={inp} />
              </label>
            </div>
            <div style={{ display: "flex", gap: 10, marginTop: 24, justifyContent: "flex-end" }}>
              <Button variant="secondary" onClick={() => setMode(null)}>Cancelar</Button>
              <Button variant="primary" onClick={() => void submitCreate()} disabled={saving || !form.concepto}>
                {saving ? "Enviando…" : "Enviar solicitud"}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Modal aprobar */}
      {mode === "approve" && selected && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000 }}
          onClick={() => setMode(null)}>
          <div style={{ background: "var(--surface)", borderRadius: 16, padding: 28, width: 460, maxWidth: "calc(100vw - 32px)", boxShadow: "0 24px 56px rgba(0,0,0,0.24)", border: "1px solid var(--border)" }}
            onClick={(e) => e.stopPropagation()}>
            <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 4 }}>Revisar viático</div>
            <div style={{ fontSize: 12.5, color: "var(--text-secondary)", marginBottom: 6 }}>
              {selected.usuario?.nombre} — <strong>{selected.concepto}</strong>
            </div>
            <div style={{ fontSize: 18, fontWeight: 800, color: "var(--accent)", marginBottom: 20 }}>
              ${Number(selected.montoSolicitado || 0).toLocaleString("es-MX", { minimumFractionDigits: 2 })}
            </div>
            <div style={{ display: "grid", gap: 14 }}>
              <label style={{ display: "grid", gap: 4 }}>
                <span style={{ fontSize: 11.5, fontWeight: 600, color: "var(--text-secondary)" }}>Decisión</span>
                <select value={approveForm.estatus} onChange={(e) => setApproveForm((f) => ({ ...f, estatus: e.target.value }))} style={inp}>
                  <option value="Aprobado">✅ Aprobar</option>
                  <option value="Rechazado">❌ Rechazar</option>
                  <option value="Pagado">💳 Marcar como pagado</option>
                </select>
              </label>
              <label style={{ display: "grid", gap: 4 }}>
                <span style={{ fontSize: 11.5, fontWeight: 600, color: "var(--text-secondary)" }}>Comentarios</span>
                <textarea value={approveForm.comentariosAdmin}
                  onChange={(e) => setApproveForm((f) => ({ ...f, comentariosAdmin: e.target.value }))}
                  placeholder="Motivo del rechazo, notas de pago, etc."
                  rows={3}
                  style={{ ...inp, resize: "vertical" }} />
              </label>
            </div>
            <div style={{ display: "flex", gap: 10, marginTop: 24, justifyContent: "flex-end" }}>
              <Button variant="secondary" onClick={() => setMode(null)}>Cancelar</Button>
              <Button
                variant={approveForm.estatus === "Rechazado" ? "danger" : "primary"}
                onClick={() => void submitApprove()}
                disabled={saving}
              >
                {saving ? "Guardando…" : approveForm.estatus === "Rechazado" ? "Rechazar" : "Confirmar"}
              </Button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
