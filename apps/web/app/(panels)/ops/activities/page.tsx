"use client";

import { useEffect, useState, useCallback } from "react";
import PageHeader from "@/components/ui/PageHeader";
import Section from "@/components/ui/Section";
import Button from "@/components/ui/Button";
import DataTable, { Tag, type Column } from "@/components/ui/DataTable";
import { useUser } from "@/components/UserContext";
import { buildApiUrl } from "@/lib/api-base";
import { resolveOrgRoleKey } from "@/lib/org-roles";

interface Activity {
  id: number;
  anNumber?: string;
  tipo?: string;
  descripcion?: string;
  fechaProgramada?: string;
  estado?: string;
  clienteNombre?: string;
  assignedUser?: { id?: number; nombre: string };
}

interface Evidence {
  id: number;
  tipo?: string;
  descripcion?: string;
  estado?: string;
  creadoEn?: string;
  activity?: { anNumber?: string; clienteNombre?: string };
  uploadedBy?: { nombre?: string };
  url?: string;
}

const ESTADOS = ["PROGRAMADA", "EN_CURSO", "COMPLETADA", "REPROGRAMAR"];
const TIPOS   = ["Instalación", "Mantenimiento", "Correctivo", "Auditoría"];
const emptyForm = { tipo: "Instalación", descripcion: "", clienteNombre: "", fechaProgramada: "", estado: "PROGRAMADA" };

async function apiFetch(path: string, token: string, opts?: RequestInit) {
  const res = await fetch(buildApiUrl(path), {
    ...opts,
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", ...(opts?.headers ?? {}) },
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

const inp: React.CSSProperties = {
  width: "100%", padding: "8px 10px", border: "1px solid var(--border)",
  borderRadius: 8, background: "var(--surface)", color: "var(--foreground)",
  fontSize: 13, boxSizing: "border-box",
};

function useOpsPermissions() {
  const { user } = useUser();
  const nivel = user?.nivelAutoridad ?? 0;
  const orgKey = resolveOrgRoleKey(user?.role ?? "", user?.orgRoleKey);
  const isSuperOrCeo = user?.isSuperAdmin || nivel >= 5;
  const isManager = isSuperOrCeo || nivel >= 4 ||
    orgKey === "director_ops" || orgKey === "project_manager" || (orgKey as string) === "arquitecto";
  return {
    canCreate: nivel >= 2 || isManager,
    canEdit:   nivel >= 3 || isManager,
    canDelete: isSuperOrCeo || nivel >= 4,
    canApproveEvidence: isManager,
    isManager,
  };
}

type TabId = "actividades" | "evidencias";

export default function ActivitiesPage() {
  const { user } = useUser();
  const token = user?.token ?? "";
  const perms = useOpsPermissions();

  // Ingenieros de campo ven solo sus propias actividades por defecto.
  // Managers pueden alternar entre "mis actividades" y "todas".
  const [showOnlyMine, setShowOnlyMine] = useState(!perms.isManager);

  const [tab, setTab]           = useState<TabId>("actividades");
  const [items, setItems]       = useState<Activity[]>([]);
  const [loading, setLoading]   = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing]   = useState<Activity | null>(null);
  const [form, setForm]         = useState({ ...emptyForm });
  const [evids, setEvids]         = useState<Evidence[]>([]);
  const [evLoading, setEvLoading] = useState(false);

  const loadActivities = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    try {
      const data = await apiFetch("activities?limit=60", token);
      setItems(Array.isArray(data) ? data : (data.data ?? []));
    } catch { /* skip */ } finally { setLoading(false); }
  }, [token]);

  const loadEvidences = useCallback(async () => {
    if (!token) return;
    setEvLoading(true);
    try {
      const data = await apiFetch("evidences?limit=80", token);
      setEvids(Array.isArray(data) ? data : (data.data ?? []));
    } catch { /* skip */ } finally { setEvLoading(false); }
  }, [token]);

  useEffect(() => { loadActivities(); }, [loadActivities]);
  useEffect(() => { if (tab === "evidencias") loadEvidences(); }, [tab, loadEvidences]);

  const openNew  = () => { setEditing(null); setForm({ ...emptyForm }); setShowForm(true); };
  const openEdit = (a: Activity) => {
    setEditing(a);
    setForm({ tipo: a.tipo ?? "", descripcion: a.descripcion ?? "", clienteNombre: a.clienteNombre ?? "", fechaProgramada: a.fechaProgramada?.slice(0, 16) ?? "", estado: a.estado ?? "PROGRAMADA" });
    setShowForm(true);
  };

  const save = async () => {
    if (!token) return;
    try {
      if (editing) {
        const updated = await apiFetch(`activities/${editing.id}`, token, { method: "PATCH", body: JSON.stringify(form) });
        setItems(prev => prev.map(a => a.id === editing.id ? { ...a, ...updated } : a));
      } else {
        const created = await apiFetch("activities", token, { method: "POST", body: JSON.stringify(form) });
        setItems(prev => [created, ...prev]);
      }
      setShowForm(false);
    } catch { /* skip */ }
  };

  const remove = async (id: number) => {
    if (!token || !confirm("¿Eliminar esta actividad?")) return;
    try {
      await apiFetch(`activities/${id}`, token, { method: "DELETE" });
      setItems(prev => prev.filter(a => a.id !== id));
    } catch { /* skip */ }
  };

  const patchEstado = async (id: number, estado: string) => {
    if (!token) return;
    try {
      await apiFetch(`activities/${id}`, token, { method: "PATCH", body: JSON.stringify({ estado }) });
      setItems(prev => prev.map(a => a.id === id ? { ...a, estado } : a));
    } catch { /* skip */ }
  };

  const patchEvState = async (id: number, estado: string) => {
    if (!token) return;
    try {
      await apiFetch(`evidences/${id}`, token, { method: "PATCH", body: JSON.stringify({ estado }) });
      setEvids(prev => prev.map(e => e.id === id ? { ...e, estado } : e));
    } catch { /* skip */ }
  };

  const removeEvidence = async (id: number) => {
    if (!token || !confirm("¿Eliminar esta evidencia?")) return;
    try {
      await apiFetch(`evidences/${id}`, token, { method: "DELETE" });
      setEvids(prev => prev.filter(e => e.id !== id));
    } catch { /* skip */ }
  };

  const actColumns: Column<Activity>[] = [
    { key: "anNumber", label: "OT", render: (a) => <Tag variant="accent">{a.anNumber ?? `ACT-${a.id}`}</Tag>, width: 100 },
    { key: "clienteNombre", label: "Cliente / Proyecto", render: (a) => (
      <div>
        <div style={{ fontWeight: 700, fontSize: 13 }}>{a.clienteNombre ?? "—"}</div>
        <div style={{ fontSize: 11.5, color: "var(--text-tertiary)" }}>{a.tipo}</div>
      </div>
    )},
    { key: "assignedUser", label: "Ingeniero", accessor: (a) => a.assignedUser?.nombre ?? "Sin asignar", width: 140 },
    { key: "fechaProgramada", label: "Fecha", accessor: (a) => a.fechaProgramada ? new Date(a.fechaProgramada).toLocaleDateString("es-MX", { day: "2-digit", month: "short" }) : "—", width: 100 },
    { key: "estado", label: "Estado", render: (a) => (
      perms.canEdit ? (
        <select value={a.estado ?? "PROGRAMADA"} onChange={(e) => patchEstado(a.id, e.target.value)}
          style={{ fontSize: 12, border: "1px solid var(--border)", borderRadius: 6, padding: "3px 6px", background: "var(--surface)", color: "var(--foreground)", cursor: "pointer" }}>
          {ESTADOS.map(s => <option key={s} value={s}>{s.replace(/_/g, " ")}</option>)}
        </select>
      ) : (
        <Tag variant={a.estado === "COMPLETADA" ? "positive" : a.estado === "EN_CURSO" ? "accent" : "neutral"}>
          {(a.estado ?? "—").replace(/_/g, " ")}
        </Tag>
      )
    ), width: 150 },
    ...(perms.canEdit ? [{
      key: "id" as const, label: "" as const, render: (a: Activity) => (
        <div style={{ display: "flex", gap: 4 }}>
          <button onClick={() => openEdit(a)} title="Editar" style={{ background: "none", border: "none", cursor: "pointer", fontSize: 15, color: "var(--text-tertiary)", padding: "4px 6px" }}>✎</button>
          {perms.canDelete && (
            <button onClick={() => remove(a.id)} title="Eliminar" style={{ background: "none", border: "none", cursor: "pointer", fontSize: 15, color: "var(--text-tertiary)", padding: "4px 6px" }}>✕</button>
          )}
        </div>
      ), width: 60,
    }] : []),
  ];

  const evColumns: Column<Evidence>[] = [
    { key: "id", label: "ID", render: (e) => <Tag variant="accent">E-{e.id}</Tag>, width: 70 },
    { key: "tipo", label: "Tipo", render: (e) => <Tag variant="neutral">{e.tipo ?? "—"}</Tag>, width: 120 },
    { key: "activity", label: "OT / Cliente", render: (e) => (
      <div>
        <div style={{ fontWeight: 700, fontSize: 13 }}>{e.activity?.anNumber ?? "—"}</div>
        <div style={{ fontSize: 11.5, color: "var(--text-tertiary)" }}>{e.activity?.clienteNombre ?? e.descripcion?.slice(0, 40)}</div>
      </div>
    )},
    { key: "uploadedBy", label: "Ingeniero", accessor: (e) => e.uploadedBy?.nombre ?? "—", width: 130 },
    { key: "creadoEn", label: "Capturada", accessor: (e) => e.creadoEn ? new Date(e.creadoEn).toLocaleDateString("es-MX", { day: "2-digit", month: "short" }) : "—", width: 90 },
    { key: "estado", label: "Estado", render: (e) => (
      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
        <Tag variant={e.estado === "APROBADA" ? "positive" : e.estado === "RECHAZADA" ? "danger" : "warning"}>
          {(e.estado ?? "—").replace(/_/g, " ")}
        </Tag>
        {perms.canApproveEvidence && e.estado === "PENDIENTE_REVISION" && (
          <>
            <button onClick={() => patchEvState(e.id, "APROBADA")}  style={{ fontSize: 11, background: "#1F5F4E", color: "#fff", border: "none", borderRadius: 4, padding: "2px 7px", cursor: "pointer" }}>✓</button>
            <button onClick={() => patchEvState(e.id, "RECHAZADA")} style={{ fontSize: 11, background: "var(--danger)", color: "#fff", border: "none", borderRadius: 4, padding: "2px 7px", cursor: "pointer" }}>✕</button>
          </>
        )}
      </div>
    ), width: 220 },
    ...(perms.canDelete ? [{
      key: "id" as const, label: "" as const,
      render: (e: Evidence) => (
        <button onClick={() => removeEvidence(e.id)} title="Eliminar" style={{ background: "none", border: "none", cursor: "pointer", fontSize: 15, color: "var(--text-tertiary)", padding: "4px 8px" }}>✕</button>
      ), width: 40,
    }] : []),
  ];

  // ── Filtrado por rol ─────────────────────────────────────────────────
  // Ingenieros ven SOLO sus actividades; managers pueden ver todo o filtrar
  const visibleItems = showOnlyMine
    ? items.filter(a =>
        a.assignedUser?.id === user?.id ||
        a.assignedUser?.nombre === user?.nombre
      )
    : items;

  const visibleEvids = showOnlyMine
    ? evids.filter(e => e.uploadedBy?.nombre === user?.nombre)
    : evids;

  const pendingEvids = visibleEvids.filter(e => e.estado === "PENDIENTE_REVISION").length;

  const tabStyle = (active: boolean): React.CSSProperties => ({
    padding: "8px 20px", fontSize: 13, fontWeight: 600, cursor: "pointer",
    border: "none", borderBottom: active ? "2px solid var(--primary)" : "2px solid transparent",
    background: "transparent", color: active ? "var(--primary)" : "var(--text-secondary)",
    fontFamily: "inherit",
  });

  return (
    <>
      <PageHeader
        eyebrow="OPS · Campo"
        title="Actividades y Evidencias"
        subtitle="Órdenes de trabajo activas y revisión de evidencias en una sola vista."
        actions={
          <>
            {tab === "actividades" && perms.canCreate && (
              <Button variant="primary" iconLeft="+" onClick={openNew}>Nueva OT</Button>
            )}
            {tab === "evidencias" && (
              <Button variant="ghost" onClick={loadEvidences}>
                {pendingEvids > 0 ? `${pendingEvids} pendientes` : "Actualizar"}
              </Button>
            )}
          </>
        }
      />

      <div style={{ display: "flex", alignItems: "center", borderBottom: "1px solid var(--border)", marginBottom: 20 }}>
        <button style={tabStyle(tab === "actividades")} onClick={() => setTab("actividades")}>
          Actividades / OT
        </button>
        <button style={tabStyle(tab === "evidencias")} onClick={() => setTab("evidencias")}>
          Evidencias{pendingEvids > 0 && (
            <span style={{ marginLeft: 6, background: "var(--warning)", color: "#fff", borderRadius: 99, padding: "0 6px", fontSize: 10, fontWeight: 700 }}>{pendingEvids}</span>
          )}
        </button>
        {/* Managers pueden alternar entre su vista y la de todo el equipo */}
        {perms.isManager && (
          <div style={{ marginLeft: "auto", display: "flex", gap: 6, padding: "0 0 8px" }}>
            <button
              onClick={() => setShowOnlyMine(true)}
              style={{
                fontSize: 11, fontWeight: 600, padding: "4px 10px", borderRadius: 6, border: "1px solid var(--border)",
                background: showOnlyMine ? "var(--primary)" : "var(--surface)",
                color: showOnlyMine ? "#fff" : "var(--text-secondary)",
                cursor: "pointer",
              }}
            >
              Mis actividades
            </button>
            <button
              onClick={() => setShowOnlyMine(false)}
              style={{
                fontSize: 11, fontWeight: 600, padding: "4px 10px", borderRadius: 6, border: "1px solid var(--border)",
                background: !showOnlyMine ? "var(--primary)" : "var(--surface)",
                color: !showOnlyMine ? "#fff" : "var(--text-secondary)",
                cursor: "pointer",
              }}
            >
              Todo el equipo
            </button>
          </div>
        )}
        {/* Ingenieros de campo: siempre ven solo las suyas */}
        {!perms.isManager && (
          <span style={{ marginLeft: "auto", padding: "0 12px 8px", fontSize: 11, color: "var(--text-tertiary)" }}>
            👤 Solo tus actividades asignadas
          </span>
        )}
      </div>

      {tab === "actividades" && (
        <>
          {showForm && (
            <div style={{ background: "var(--surface-2)", border: "1px solid var(--border)", borderRadius: 12, padding: 20, marginBottom: 20, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              <div>
                <label style={{ fontSize: 12, fontWeight: 600, color: "var(--text-secondary)", display: "block", marginBottom: 4 }}>Tipo</label>
                <select value={form.tipo} onChange={(e) => setForm(f => ({ ...f, tipo: e.target.value }))} style={inp}>
                  {TIPOS.map(t => <option key={t}>{t}</option>)}
                </select>
              </div>
              <div>
                <label style={{ fontSize: 12, fontWeight: 600, color: "var(--text-secondary)", display: "block", marginBottom: 4 }}>Estado</label>
                <select value={form.estado} onChange={(e) => setForm(f => ({ ...f, estado: e.target.value }))} style={inp}>
                  {ESTADOS.map(s => <option key={s} value={s}>{s.replace(/_/g, " ")}</option>)}
                </select>
              </div>
              <div style={{ gridColumn: "1 / -1" }}>
                <label style={{ fontSize: 12, fontWeight: 600, color: "var(--text-secondary)", display: "block", marginBottom: 4 }}>Cliente / Proyecto</label>
                <input value={form.clienteNombre} onChange={(e) => setForm(f => ({ ...f, clienteNombre: e.target.value }))} placeholder="Nombre del cliente" style={inp} />
              </div>
              <div style={{ gridColumn: "1 / -1" }}>
                <label style={{ fontSize: 12, fontWeight: 600, color: "var(--text-secondary)", display: "block", marginBottom: 4 }}>Descripción</label>
                <input value={form.descripcion} onChange={(e) => setForm(f => ({ ...f, descripcion: e.target.value }))} placeholder="Descripción del trabajo" style={inp} />
              </div>
              <div>
                <label style={{ fontSize: 12, fontWeight: 600, color: "var(--text-secondary)", display: "block", marginBottom: 4 }}>Fecha programada</label>
                <input type="datetime-local" value={form.fechaProgramada} onChange={(e) => setForm(f => ({ ...f, fechaProgramada: e.target.value }))} style={inp} />
              </div>
              <div style={{ display: "flex", alignItems: "flex-end", gap: 8, justifyContent: "flex-end" }}>
                <Button variant="ghost" onClick={() => setShowForm(false)}>Cancelar</Button>
                <Button variant="primary" onClick={save}>{editing ? "Guardar" : "Crear OT"}</Button>
              </div>
            </div>
          )}
          <Section title={loading ? "Cargando…" : `${visibleItems.length} órdenes de trabajo${showOnlyMine && perms.isManager ? " (tuyas)" : ""}`}>
            {loading ? (
              <div style={{ padding: 32, textAlign: "center", color: "var(--text-tertiary)" }}>Cargando…</div>
            ) : (
              <DataTable columns={actColumns} rows={visibleItems} rowKey={(a) => a.id} emptyTitle="Sin actividades" emptyDescription={showOnlyMine ? "No tienes actividades asignadas." : "Sin órdenes de trabajo."} />
            )}
          </Section>
        </>
      )}

      {tab === "evidencias" && (
        <Section title={evLoading ? "Cargando…" : `${visibleEvids.length} evidencias${showOnlyMine && perms.isManager ? " (tuyas)" : ""}`}>
          {evLoading ? (
            <div style={{ padding: 32, textAlign: "center", color: "var(--text-tertiary)" }}>Cargando…</div>
          ) : (
            <DataTable columns={evColumns} rows={visibleEvids} rowKey={(e) => e.id} emptyTitle="Sin evidencias" emptyDescription={showOnlyMine ? "No tienes evidencias registradas." : "Sin evidencias aún."} />
          )}
        </Section>
      )}
    </>
  );
}
