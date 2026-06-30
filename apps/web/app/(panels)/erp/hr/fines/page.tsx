"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import { useSearchParams } from "next/navigation";
import PageHeader from "@/components/ui/PageHeader";
import Section from "@/components/ui/Section";
import Button from "@/components/ui/Button";
import DataTable, { Tag, Money, type Column } from "@/components/ui/DataTable";
import { useUser } from "@/components/UserContext";
import { useHrManagementGuard } from "@/lib/useHrManagementGuard";
import { getHrSubmoduleConfig } from "@/lib/section-views";
import { buildApiUrl } from "@/lib/api-base";
import ConfirmDialog, { type ConfirmState } from "@/components/ui/ConfirmDialog";
import { toast } from "@/components/Toast";

interface HrStaff {
  id: number;
  nombre: string;
  email?: string;
  department?: { nombre?: string } | null;
}

interface Fine {
  id: number;
  usuarioId?: number;
  tipo?: string;
  razon?: string;
  descripcion?: string;
  monto?: number;
  estatusPago?: string;
  estatusAprobacion?: string;
  fechaCreacion?: string;
  usuario?: { id?: number; nombre?: string; email?: string };
}

/** Motivos de sanción → categoría API + código de razón */
const MOTIVOS = [
  { key: "TARDANZA", tipo: "asistencia", razon: "TARDANZA", label: "Tardanza" },
  { key: "FALTA_INJUSTIFICADA", tipo: "asistencia", razon: "FALTA_INJUSTIFICADA", label: "Falta injustificada" },
  { key: "DANO_VEHICULO", tipo: "vehiculo", razon: "DANO_VEHICULO", label: "Daño a vehículo" },
  { key: "USO_VEHICULO_INDEBIDO", tipo: "vehiculo", razon: "USO_VEHICULO_INDEBIDO", label: "Uso indebido de vehículo" },
  { key: "HERRAMIENTA_PERDIDA", tipo: "herramienta", razon: "HERRAMIENTA_PERDIDA", label: "Herramienta perdida" },
  { key: "COMPORTAMIENTO", tipo: "actividad", razon: "COMPORTAMIENTO", label: "Comportamiento" },
  { key: "OTRO", tipo: "actividad", razon: "OTRO", label: "Otro" },
] as const;

const ESTATUS_PAGO = [
  { value: "Pendiente", label: "Pendiente" },
  { value: "Pagado", label: "Aplicado en nómina" },
  { value: "Apelado", label: "Apelado" },
  { value: "Cancelado", label: "Cancelado" },
];

async function apiFetch(path: string, token: string, opts?: RequestInit) {
  const res = await fetch(buildApiUrl(path), {
    ...opts,
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", ...(opts?.headers ?? {}) },
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(text || `HTTP ${res.status}`);
  }
  return res.json();
}

const emptyForm = {
  usuarioId: "",
  motivoKey: "TARDANZA",
  descripcion: "",
  monto: 0,
  estatusPago: "Pendiente",
};

function motivoFromFine(f: Fine): string {
  const match = MOTIVOS.find((m) => m.razon === f.razon && m.tipo === f.tipo);
  return match?.key ?? MOTIVOS.find((m) => m.razon === f.razon)?.key ?? "OTRO";
}

export default function FinesPage() {
  const { user } = useUser();
  const cfg = useHrManagementGuard();
  const viewCfg = useMemo(() => getHrSubmoduleConfig(user, "fines"), [user]);
  const token = user?.token ?? "";
  const searchParams = useSearchParams();
  const highlightId = searchParams.get("highlight");

  const [items, setItems] = useState<Fine[]>([]);
  const [confirmState, setConfirmState] = useState<ConfirmState | null>(null);
  const [staff, setStaff] = useState<HrStaff[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Fine | null>(null);
  const [form, setForm] = useState({ ...emptyForm });
  const [saveErr, setSaveErr] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    setLoadError(null);
    try {
      const [finesData, staffData] = await Promise.all([
        apiFetch("fines", token),
        apiFetch("users/hr-staff?limit=100", token),
      ]);
      setItems(Array.isArray(finesData) ? finesData : (finesData?.data ?? []));
      setStaff(Array.isArray(staffData) ? staffData : (staffData?.data ?? []));
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : "No se pudieron cargar las sanciones");
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    void load();
  }, [load]);

  const openNew = () => {
    setEditing(null);
    setForm({ ...emptyForm });
    setSaveErr(null);
    setShowForm(true);
  };

  const openEdit = (f: Fine) => {
    setEditing(f);
    setForm({
      usuarioId: String(f.usuarioId ?? f.usuario?.id ?? ""),
      motivoKey: motivoFromFine(f),
      descripcion: f.descripcion ?? "",
      monto: Number(f.monto ?? 0),
      estatusPago: f.estatusPago ?? "Pendiente",
    });
    setSaveErr(null);
    setShowForm(true);
  };

  const save = async () => {
    if (!token) return;
    const motivo = MOTIVOS.find((m) => m.key === form.motivoKey) ?? MOTIVOS[0];
    if (!editing && !form.usuarioId) {
      setSaveErr("Selecciona el empleado al que aplica la sanción.");
      return;
    }
    setSaving(true);
    setSaveErr(null);
    try {
      if (editing) {
        const updated = await apiFetch(`fines/${editing.id}`, token, {
          method: "PATCH",
          body: JSON.stringify({
            razon: motivo.razon,
            descripcion: form.descripcion || undefined,
            monto: form.monto,
            estatusPago: form.estatusPago,
          }),
        });
        setItems((prev) => prev.map((f) => (f.id === editing.id ? { ...f, ...updated } : f)));
      } else {
        const created = await apiFetch("fines", token, {
          method: "POST",
          body: JSON.stringify({
            usuarioId: Number(form.usuarioId),
            tipo: motivo.tipo,
            razon: motivo.razon,
            descripcion: form.descripcion || undefined,
            monto: form.monto,
          }),
        });
        setItems((prev) => [created, ...prev]);
      }
      setShowForm(false);
    } catch (e) {
      setSaveErr(e instanceof Error ? e.message : "No se pudo guardar la sanción");
    } finally {
      setSaving(false);
    }
  };

  const remove = async (id: number) => {
    if (!token) return;
    setConfirmState({ message: "¿Cancelar/eliminar esta sanción?", confirmLabel: "Cancelar sanción", fn: async () => {
    try {
      await apiFetch(`fines/${id}`, token, { method: "DELETE" });
      setItems((prev) => prev.filter((f) => f.id !== id));
    } catch (e) {
      toast.error("No se pudo eliminar: " + (e instanceof Error ? e.message : "error"));
    }
  } });
  };

  const inp: React.CSSProperties = {
    width: "100%",
    padding: "8px 10px",
    border: "1px solid var(--border)",
    borderRadius: 8,
    background: "var(--surface)",
    color: "var(--foreground)",
    fontSize: 13,
    boxSizing: "border-box",
  };

  const approveFine = async (id: number, action: "approve" | "reject") => {
    if (!token) return;
    try {
      await apiFetch(`fines/${id}/approve`, token, { method: "PATCH", body: JSON.stringify({ action }) });
      void load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Error al autorizar multa");
    }
  };

  const visibleItems = useMemo(() => {
    if (!highlightId) return items;
    const id = Number(highlightId);
    if (Number.isNaN(id)) return items;
    return [...items].sort((a, b) => (a.id === id ? -1 : b.id === id ? 1 : 0));
  }, [items, highlightId]);

  const columns: Column<Fine>[] = [
    { key: "id", label: "ID", render: (f) => <Tag variant="danger">#{f.id}</Tag>, width: 70 },
    {
      key: "usuario",
      label: "Empleado",
      render: (f) => (
        <div>
          <div style={{ fontWeight: 600, fontSize: 13 }}>{f.usuario?.nombre ?? "—"}</div>
          {f.usuario?.email && <div style={{ fontSize: 11, color: "var(--text-tertiary)" }}>{f.usuario.email}</div>}
        </div>
      ),
      width: 180,
    },
    {
      key: "razon",
      label: "Motivo",
      render: (f) => (
        <Tag variant="warning">{(MOTIVOS.find((m) => m.razon === f.razon)?.label ?? f.razon ?? "—").replace(/_/g, " ")}</Tag>
      ),
      width: 150,
    },
    { key: "descripcion", label: "Descripción", render: (f) => <span style={{ fontSize: 13 }}>{f.descripcion ?? f.razon ?? "—"}</span> },
    { key: "monto", label: "Monto", render: (f) => <Money value={Number(f.monto ?? 0)} />, width: 100 },
    {
      key: "estatusAprobacion",
      label: "Autorización",
      render: (f) => (
        <Tag variant={f.estatusAprobacion === "Aprobado" ? "positive" : f.estatusAprobacion === "Rechazado" ? "danger" : "warning"}>
          {f.estatusAprobacion ?? "Pendiente"}
        </Tag>
      ),
      width: 120,
    },
    {
      key: "estatusPago",
      label: "Estado",
      render: (f) => (
        <Tag variant={f.estatusPago === "Pagado" ? "neutral" : f.estatusPago === "Cancelado" ? "danger" : "warning"}>
          {f.estatusPago ?? "Pendiente"}
        </Tag>
      ),
      width: 120,
    },
    {
      key: "id",
      label: "",
      render: (f) => (
        <div style={{ display: "flex", gap: 4 }}>
          {cfg.canEdit && (
            <button onClick={() => openEdit(f)} title="Editar" style={{ background: "none", border: "none", cursor: "pointer", fontSize: 15, color: "var(--text-tertiary)", padding: "4px 6px" }}>
              ✎
            </button>
          )}
          {cfg.canApprove && f.estatusAprobacion === "Pendiente" && (
            <>
              <button onClick={() => void approveFine(f.id, "approve")} title="Autorizar" style={{ background: "#1F5F4E", color: "#fff", border: "none", borderRadius: 4, padding: "2px 7px", cursor: "pointer", fontSize: 11 }}>
                ✓
              </button>
              <button onClick={() => void approveFine(f.id, "reject")} title="Rechazar" style={{ background: "var(--danger)", color: "#fff", border: "none", borderRadius: 4, padding: "2px 7px", cursor: "pointer", fontSize: 11 }}>
                ✕
              </button>
            </>
          )}
          {cfg.canApprove && (
            <button onClick={() => void remove(f.id)} title="Eliminar" style={{ background: "none", border: "none", cursor: "pointer", fontSize: 15, color: "var(--text-tertiary)", padding: "4px 6px" }}>
              ✕
            </button>
          )}
        </div>
      ),
      width: 60,
    },
  ];

  return (
    <>
      <PageHeader
        eyebrow="ERP · Personas"
        title={viewCfg.title}
        subtitle={viewCfg.subtitle}
        actions={cfg.canCreate ? <Button variant="primary" iconLeft="+" onClick={openNew}>Nueva sanción</Button> : undefined}
      />

      {showForm && (
        <div style={{ background: "var(--surface-2)", border: "1px solid var(--border)", borderRadius: 12, padding: 20, marginBottom: 20, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <div style={{ gridColumn: "1 / -1" }}>
            <label style={{ fontSize: 12, fontWeight: 600, color: "var(--text-secondary)", display: "block", marginBottom: 4 }}>
              Empleado <span style={{ color: "var(--danger)" }}>*</span>
            </label>
            {editing ? (
              <input value={staff.find((s) => String(s.id) === form.usuarioId)?.nombre ?? editing.usuario?.nombre ?? "—"} disabled style={{ ...inp, opacity: 0.7 }} />
            ) : (
              <select value={form.usuarioId} onChange={(e) => setForm((f) => ({ ...f, usuarioId: e.target.value }))} style={inp} required>
                <option value="">— Seleccionar empleado —</option>
                {staff.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.nombre}
                    {s.department?.nombre ? ` · ${s.department.nombre}` : ""}
                  </option>
                ))}
              </select>
            )}
          </div>
          <div>
            <label style={{ fontSize: 12, fontWeight: 600, color: "var(--text-secondary)", display: "block", marginBottom: 4 }}>Tipo de sanción</label>
            <select value={form.motivoKey} onChange={(e) => setForm((f) => ({ ...f, motivoKey: e.target.value }))} style={inp}>
              {MOTIVOS.map((m) => (
                <option key={m.key} value={m.key}>
                  {m.label}
                </option>
              ))}
            </select>
          </div>
          {editing && (
            <div>
              <label style={{ fontSize: 12, fontWeight: 600, color: "var(--text-secondary)", display: "block", marginBottom: 4 }}>Estado</label>
              <select value={form.estatusPago} onChange={(e) => setForm((f) => ({ ...f, estatusPago: e.target.value }))} style={inp}>
                {ESTATUS_PAGO.map((s) => (
                  <option key={s.value} value={s.value}>
                    {s.label}
                  </option>
                ))}
              </select>
            </div>
          )}
          <div style={{ gridColumn: editing ? undefined : "1 / -1" }}>
            <label style={{ fontSize: 12, fontWeight: 600, color: "var(--text-secondary)", display: "block", marginBottom: 4 }}>Descripción del hecho</label>
            <input value={form.descripcion} onChange={(e) => setForm((f) => ({ ...f, descripcion: e.target.value }))} placeholder="Describe la incidencia con detalle" style={inp} />
          </div>
          <div>
            <label style={{ fontSize: 12, fontWeight: 600, color: "var(--text-secondary)", display: "block", marginBottom: 4 }}>Monto a descontar ($)</label>
            <input type="number" min={0} step="0.01" value={form.monto} onChange={(e) => setForm((f) => ({ ...f, monto: +e.target.value }))} style={inp} />
          </div>
          {saveErr && (
            <div style={{ gridColumn: "1 / -1", padding: "8px 12px", borderRadius: 8, background: "var(--state-danger-bg)", color: "var(--state-danger-text)", fontSize: 12.5 }}>
              {saveErr}
            </div>
          )}
          <div style={{ gridColumn: "1 / -1", display: "flex", gap: 8, justifyContent: "flex-end" }}>
            <Button variant="ghost" onClick={() => setShowForm(false)}>
              Cancelar
            </Button>
            <Button variant="primary" onClick={() => void save()} disabled={saving}>
              {saving ? "Guardando…" : editing ? "Guardar" : "Registrar sanción"}
            </Button>
          </div>
        </div>
      )}

      <Section title={loading ? "Cargando…" : `${visibleItems.length} sanciones`}>
        {highlightId && (
          <p style={{ fontSize: 12, color: "var(--text-secondary)", marginBottom: 12 }}>
            Mostrando sanción <strong>#{highlightId}</strong> desde enlace directo.
          </p>
        )}
        {loadError && (
          <div role="alert" style={{ padding: "10px 14px", marginBottom: 12, background: "var(--state-warning-bg)", border: "1px solid var(--state-warning-border)", borderRadius: 8, fontSize: 12 }}>
            {loadError} <Button size="sm" variant="ghost" onClick={() => void load()}>Reintentar</Button>
          </div>
        )}
        {loading ? (
          <div style={{ padding: 32, textAlign: "center", color: "var(--text-tertiary)" }}>Cargando…</div>
        ) : !loadError ? (
          <DataTable columns={columns} rows={visibleItems} rowKey={(f) => f.id} emptyTitle="Sin sanciones registradas" emptyDescription="Registra una incidencia cuando sea necesario." />
        ) : null}
      </Section>
      <ConfirmDialog state={confirmState} onClose={() => setConfirmState(null)} />
    </>
  );
}
