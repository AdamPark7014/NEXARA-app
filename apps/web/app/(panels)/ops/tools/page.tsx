"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import { useRouter } from "next/navigation";
import PageHeader from "@/components/ui/PageHeader";
import Section from "@/components/ui/Section";
import Button from "@/components/ui/Button";
import DataTable, { Tag, type Column } from "@/components/ui/DataTable";
import { useUser } from "@/components/UserContext";
import { getOpsTeamSectionConfig } from "@/lib/section-views";
import { buildApiUrl } from "@/lib/api-base";

// ─── Types ────────────────────────────────────────────────────────────────────

interface InventoryItem {
  id: number;
  toolName: string;
  model?: string;
  serialNumber?: string;
  status: "AVAILABLE" | "ASSIGNED" | "RETIRED";
  panoramicPhotoUrl?: string;
}

interface KitAssignment {
  id: number;
  isActive: boolean;
  assignedAt: string;
  dueReturnDate?: string;
  user?: { id: number; nombre?: string; email?: string };
  inventoryItem?: InventoryItem;
  events?: Array<{ id: number; type: string; description?: string; reportedAt: string; resolvedAt?: string }>;
}

interface ToolRequest {
  id: number;
  herramienta?: string;
  cantidad?: number;
  estado?: string;
  solicitante?: string;
  fechaSolicitud?: string;
  observaciones?: string;
  tipo?: string;
  usuarioId?: number;
}

// ─── API helper ───────────────────────────────────────────────────────────────

async function apiFetch(path: string, token: string, opts?: RequestInit) {
  const res = await fetch(buildApiUrl(path), {
    ...opts,
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", ...(opts?.headers ?? {}) },
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

// ─── Status badge ─────────────────────────────────────────────────────────────

function statusVariant(s?: string): "accent" | "positive" | "warning" | "danger" | "neutral" {
  if (!s) return "neutral";
  const m: Record<string, "accent" | "positive" | "warning" | "danger" | "neutral"> = {
    AVAILABLE: "positive", Disponible: "positive", Devuelto: "positive",
    ASSIGNED: "accent", Entregado: "accent", Aprobado: "accent",
    Pendiente: "warning",
    RETIRED: "danger", Rechazado: "danger",
  };
  return m[s] ?? "neutral";
}

// ─── Page ─────────────────────────────────────────────────────────────────────

const ESTADOS_REQUEST = ["Pendiente", "Aprobado", "Entregado", "Devuelto", "Rechazado"];

export default function ToolsPage() {
  const { user } = useUser();
  const router = useRouter();
  const cfg = useMemo(() => getOpsTeamSectionConfig(user, "tools"), [user]);
  const isManager = cfg.viewMode !== "execute";
  const token = user?.token ?? "";

  // tab state
  const defaultTab = isManager ? "inventory" : "mykit";
  const [tab, setTab] = useState<"inventory" | "kits" | "requests" | "mykit" | "myrequests">(defaultTab);

  // data
  const [inventory, setInventory] = useState<InventoryItem[]>([]);
  const [kits, setKits] = useState<KitAssignment[]>([]);
  const [requests, setRequests] = useState<ToolRequest[]>([]);
  const [myKit, setMyKit] = useState<KitAssignment[]>([]);
  const [myRequests, setMyRequests] = useState<ToolRequest[]>([]);
  const [loading, setLoading] = useState(true);

  // forms
  const [showAssignForm, setShowAssignForm] = useState(false);
  const [assignForm, setAssignForm] = useState({ inventoryItemId: "", userId: "", dueReturnDate: "" });
  const [showRequestForm, setShowRequestForm] = useState(false);
  const [requestForm, setRequestForm] = useState({ herramienta: "", cantidad: 1, tipo: "Préstamo", observaciones: "" });

  const loadAll = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    try {
      if (isManager) {
        const [inv, k, req] = await Promise.allSettled([
          apiFetch("tool-requests/inventory", token),
          apiFetch("tool-requests/kits/users", token),
          apiFetch("tool-requests", token),
        ]);
        if (inv.status === "fulfilled") setInventory(Array.isArray(inv.value) ? inv.value : (inv.value?.data ?? []));
        if (k.status === "fulfilled") setKits(Array.isArray(k.value) ? k.value : []);
        if (req.status === "fulfilled") setRequests(Array.isArray(req.value) ? req.value : (req.value?.data ?? []));
      } else {
        const [kit, myReq] = await Promise.allSettled([
          apiFetch("tool-requests/kits/my", token),
          apiFetch("tool-requests/my-requests", token),
        ]);
        if (kit.status === "fulfilled") setMyKit(Array.isArray(kit.value) ? kit.value : []);
        if (myReq.status === "fulfilled") setMyRequests(Array.isArray(myReq.value) ? myReq.value : []);
      }
    } finally {
      setLoading(false);
    }
  }, [token, isManager]);

  useEffect(() => { loadAll(); }, [loadAll]);

  // ── Actions ───────────────────────────────────────────────────────────────

  const approveRequest = async (id: number) => {
    await apiFetch(`tool-requests/${id}/approve`, token, { method: "POST" });
    setRequests(prev => prev.map(r => r.id === id ? { ...r, estado: "Aprobado" } : r));
  };

  const deliverRequest = async (id: number) => {
    await apiFetch(`tool-requests/${id}/deliver`, token, { method: "POST" });
    setRequests(prev => prev.map(r => r.id === id ? { ...r, estado: "Entregado" } : r));
  };

  const returnRequest = async (id: number) => {
    await apiFetch(`tool-requests/${id}/return`, token, { method: "POST", body: JSON.stringify({}) });
    setRequests(prev => prev.map(r => r.id === id ? { ...r, estado: "Devuelto" } : r));
  };

  const assignKit = async () => {
    if (!assignForm.inventoryItemId || !assignForm.userId) return;
    await apiFetch("tool-requests/kits/assign", token, {
      method: "POST",
      body: JSON.stringify({
        inventoryItemId: Number(assignForm.inventoryItemId),
        userId: Number(assignForm.userId),
        dueReturnDate: assignForm.dueReturnDate || undefined,
      }),
    });
    setShowAssignForm(false);
    setAssignForm({ inventoryItemId: "", userId: "", dueReturnDate: "" });
    loadAll();
  };

  const createRequest = async () => {
    if (!user?.id || !requestForm.herramienta) return;
    const created = await apiFetch("tool-requests", token, {
      method: "POST",
      body: JSON.stringify({ ...requestForm, usuarioId: user.id, estado: "Pendiente" }),
    });
    setMyRequests(prev => [created, ...prev]);
    setShowRequestForm(false);
    setRequestForm({ herramienta: "", cantidad: 1, tipo: "Préstamo", observaciones: "" });
  };

  // ── Styles ────────────────────────────────────────────────────────────────

  const inp: React.CSSProperties = {
    width: "100%", padding: "8px 10px", border: "1px solid var(--border)",
    borderRadius: 8, background: "var(--surface)", color: "var(--foreground)", fontSize: 13, boxSizing: "border-box",
  };

  const tabBtn = (active: boolean): React.CSSProperties => ({
    padding: "7px 16px", borderRadius: 8, border: "none", cursor: "pointer", fontSize: 13, fontWeight: active ? 700 : 500,
    background: active ? "var(--primary)" : "var(--surface-2)",
    color: active ? "#fff" : "var(--text-secondary)",
  });

  // ── Grouped kits by user ──────────────────────────────────────────────────

  const kitsByUser = useMemo(() => {
    const map = new Map<number, { user: KitAssignment["user"]; items: KitAssignment[] }>();
    for (const k of kits.filter(k => k.isActive)) {
      const uid = k.user?.id ?? -1;
      if (!map.has(uid)) map.set(uid, { user: k.user, items: [] });
      map.get(uid)!.items.push(k);
    }
    return [...map.values()];
  }, [kits]);

  // ── Inventory columns ─────────────────────────────────────────────────────

  const invColumns: Column<InventoryItem>[] = [
    { key: "toolName", label: "Herramienta", render: t => (
      <div>
        <div style={{ fontWeight: 700, fontSize: 13 }}>{t.toolName}</div>
        <div style={{ fontSize: 11.5, color: "var(--text-tertiary)" }}>{t.model} · Serie: {t.serialNumber ?? "—"}</div>
      </div>
    )},
    { key: "status", label: "Estado", render: t => (
      <Tag variant={statusVariant(t.status)}>
        {{ AVAILABLE: "Disponible", ASSIGNED: "Asignado", RETIRED: "Dado de baja" }[t.status] ?? t.status}
      </Tag>
    ), width: 130 },
  ];

  // ── Request columns (manager) ─────────────────────────────────────────────

  const reqColumns: Column<ToolRequest>[] = [
    { key: "id", label: "ID", render: r => <Tag variant="accent">#{r.id}</Tag>, width: 60 },
    { key: "herramienta", label: "Solicitud", render: r => (
      <div>
        <div style={{ fontWeight: 700, fontSize: 13 }}>{r.herramienta ?? "—"}</div>
        <div style={{ fontSize: 11.5, color: "var(--text-tertiary)" }}>{r.tipo} · cant. {r.cantidad} · {r.solicitante ?? "—"}</div>
      </div>
    )},
    { key: "fechaSolicitud", label: "Fecha", accessor: r => r.fechaSolicitud ? new Date(r.fechaSolicitud).toLocaleDateString("es-MX", { day: "2-digit", month: "short" }) : "—", width: 90 },
    { key: "estado", label: "Estado", render: r => <Tag variant={statusVariant(r.estado)}>{r.estado}</Tag>, width: 110 },
    { key: "id", label: "Acciones", render: r => (
      <div style={{ display: "flex", gap: 4 }}>
        {r.estado === "Pendiente" && <button onClick={() => approveRequest(r.id)} style={{ fontSize: 11, padding: "3px 8px", borderRadius: 6, border: "1px solid var(--primary)", background: "transparent", color: "var(--primary)", cursor: "pointer" }}>Aprobar</button>}
        {r.estado === "Aprobado" && <button onClick={() => deliverRequest(r.id)} style={{ fontSize: 11, padding: "3px 8px", borderRadius: 6, border: "1px solid var(--success)", background: "transparent", color: "var(--success)", cursor: "pointer" }}>Entregar</button>}
        {r.estado === "Entregado" && <button onClick={() => returnRequest(r.id)} style={{ fontSize: 11, padding: "3px 8px", borderRadius: 6, border: "1px solid var(--border)", background: "transparent", color: "var(--text-secondary)", cursor: "pointer" }}>Recibir devolución</button>}
      </div>
    ), width: 160 },
  ];

  // ── My kit columns (engineer) ─────────────────────────────────────────────

  const myKitColumns: Column<KitAssignment>[] = [
    { key: "inventoryItem", label: "Herramienta", render: k => (
      <div>
        <div style={{ fontWeight: 700, fontSize: 13 }}>{k.inventoryItem?.toolName ?? "—"}</div>
        <div style={{ fontSize: 11.5, color: "var(--text-tertiary)" }}>{k.inventoryItem?.model} · {k.inventoryItem?.serialNumber ?? "S/N"}</div>
      </div>
    )},
    { key: "assignedAt", label: "Asignado", accessor: k => k.assignedAt ? new Date(k.assignedAt).toLocaleDateString("es-MX") : "—", width: 100 },
    { key: "dueReturnDate", label: "Devolución", accessor: k => k.dueReturnDate ? new Date(k.dueReturnDate).toLocaleDateString("es-MX") : "Sin fecha", width: 110 },
    { key: "id", label: "Estado", render: k => {
      const hasOpenEvent = k.events?.some(e => !e.resolvedAt);
      return <Tag variant={hasOpenEvent ? "warning" : "positive"}>{hasOpenEvent ? "Incidencia abierta" : "En orden"}</Tag>;
    }, width: 150 },
  ];

  // ── My requests columns (engineer) ────────────────────────────────────────

  const myReqColumns: Column<ToolRequest>[] = [
    { key: "id", label: "ID", render: r => <Tag variant="accent">#{r.id}</Tag>, width: 60 },
    { key: "herramienta", label: "Solicitud", render: r => (
      <div>
        <div style={{ fontWeight: 700, fontSize: 13 }}>{r.herramienta ?? "—"}</div>
        <div style={{ fontSize: 11.5, color: "var(--text-tertiary)" }}>{r.tipo} · cant. {r.cantidad}</div>
      </div>
    )},
    { key: "fechaSolicitud", label: "Fecha", accessor: r => r.fechaSolicitud ? new Date(r.fechaSolicitud).toLocaleDateString("es-MX") : "—", width: 90 },
    { key: "estado", label: "Estado", render: r => <Tag variant={statusVariant(r.estado)}>{r.estado}</Tag>, width: 110 },
  ];

  // ─────────────────────────────────────────────────────────────────────────

  const pendingCount = requests.filter(r => r.estado === "Pendiente").length;

  return (
    <>
      <PageHeader
        eyebrow="OPS · Campo"
        title={cfg.title}
        subtitle={cfg.subtitle}
        actions={
          <div style={{ display: "flex", gap: 8 }}>
            {isManager && cfg.canCreate && tab === "inventory" && (
              <Button variant="primary" iconLeft="+" onClick={() => router.push("/ops/tools/new-inventory")}>
                Agregar herramienta
              </Button>
            )}
            {isManager && tab === "kits" && (
              <Button variant="primary" iconLeft="+" onClick={() => setShowAssignForm(true)}>
                Asignar a ingeniero
              </Button>
            )}
            {!isManager && tab === "myrequests" && (
              <Button variant="primary" iconLeft="+" onClick={() => setShowRequestForm(true)}>
                Solicitar herramienta
              </Button>
            )}
          </div>
        }
      />

      {/* Tabs */}
      <div style={{ display: "flex", gap: 8, marginBottom: 20, flexWrap: "wrap" }}>
        {isManager ? (
          <>
            <button style={tabBtn(tab === "inventory")} onClick={() => setTab("inventory")}>Inventario</button>
            <button style={tabBtn(tab === "kits")} onClick={() => setTab("kits")}>Kits por ingeniero</button>
            <button style={tabBtn(tab === "requests")} onClick={() => setTab("requests")}>
              Solicitudes {pendingCount > 0 ? `(${pendingCount})` : ""}
            </button>
          </>
        ) : (
          <>
            <button style={tabBtn(tab === "mykit")} onClick={() => setTab("mykit")}>Mi kit</button>
            <button style={tabBtn(tab === "myrequests")} onClick={() => setTab("myrequests")}>Mis solicitudes</button>
          </>
        )}
      </div>

      {/* ── Manager: Inventario ── */}
      {isManager && tab === "inventory" && (
        <Section title={`Inventario de herramientas · ${inventory.length} registros`}>
          <DataTable<InventoryItem>
            columns={invColumns}
            rows={inventory}
            rowKey={(t) => t.id}
            emptyTitle="Sin herramientas registradas"
            emptyDescription="Agrega la primera herramienta al inventario."
          />
        </Section>
      )}

      {/* ── Manager: Kits por ingeniero ── */}
      {isManager && tab === "kits" && (
        <div>
          {showAssignForm && (
            <div style={{ background: "var(--surface-2)", border: "1px solid var(--border)", borderRadius: 12, padding: 20, marginBottom: 20, display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 }}>
              <div>
                <label style={{ fontSize: 12, fontWeight: 600, color: "var(--text-secondary)", display: "block", marginBottom: 4 }}>ID de herramienta (inventario)</label>
                <input type="number" value={assignForm.inventoryItemId} onChange={e => setAssignForm(f => ({ ...f, inventoryItemId: e.target.value }))} placeholder="ID del item" style={inp} />
              </div>
              <div>
                <label style={{ fontSize: 12, fontWeight: 600, color: "var(--text-secondary)", display: "block", marginBottom: 4 }}>ID del ingeniero (usuario)</label>
                <input type="number" value={assignForm.userId} onChange={e => setAssignForm(f => ({ ...f, userId: e.target.value }))} placeholder="ID del usuario" style={inp} />
              </div>
              <div>
                <label style={{ fontSize: 12, fontWeight: 600, color: "var(--text-secondary)", display: "block", marginBottom: 4 }}>Fecha de devolución (opcional)</label>
                <input type="date" value={assignForm.dueReturnDate} onChange={e => setAssignForm(f => ({ ...f, dueReturnDate: e.target.value }))} style={inp} />
              </div>
              <div style={{ gridColumn: "1 / -1", display: "flex", gap: 8, justifyContent: "flex-end" }}>
                <Button variant="ghost" onClick={() => setShowAssignForm(false)}>Cancelar</Button>
                <Button variant="primary" onClick={assignKit}>Asignar</Button>
              </div>
            </div>
          )}

          {loading ? (
            <p style={{ color: "var(--text-tertiary)", fontSize: 13 }}>Cargando kits…</p>
          ) : kitsByUser.length === 0 ? (
            <p style={{ color: "var(--text-tertiary)", fontSize: 13 }}>Ningún ingeniero tiene herramientas asignadas.</p>
          ) : (
            kitsByUser.map(({ user: u, items }) => (
              <Section key={u?.id} title={`${u?.nombre ?? u?.email ?? "Ingeniero"} · ${items.length} herramienta${items.length !== 1 ? "s" : ""}`}>
                <DataTable<KitAssignment>
                  columns={[
                    { key: "inventoryItem", label: "Herramienta", render: k => (
                      <div>
                        <div style={{ fontWeight: 700, fontSize: 13 }}>{k.inventoryItem?.toolName ?? "—"}</div>
                        <div style={{ fontSize: 11.5, color: "var(--text-tertiary)" }}>{k.inventoryItem?.model} · Serie: {k.inventoryItem?.serialNumber ?? "—"}</div>
                      </div>
                    )},
                    { key: "assignedAt", label: "Asignado", accessor: k => k.assignedAt ? new Date(k.assignedAt).toLocaleDateString("es-MX") : "—", width: 100 },
                    { key: "dueReturnDate", label: "Devolver antes de", accessor: k => k.dueReturnDate ? new Date(k.dueReturnDate).toLocaleDateString("es-MX") : "Sin fecha", width: 130 },
                    { key: "id", label: "Incidencias", render: k => {
                      const open = k.events?.filter(e => !e.resolvedAt) ?? [];
                      return open.length > 0
                        ? <Tag variant="warning">{open.length} abierta{open.length > 1 ? "s" : ""}</Tag>
                        : <Tag variant="positive">Sin incidencias</Tag>;
                    }, width: 140 },
                  ]}
                  rows={items}
                  rowKey={(k) => k.id}
                  emptyTitle="Sin asignaciones"
                />
              </Section>
            ))
          )}
        </div>
      )}

      {/* ── Manager: Solicitudes ── */}
      {isManager && tab === "requests" && (
        <Section title={`Solicitudes · ${requests.length} total`}>
          <DataTable<ToolRequest>
            columns={reqColumns}
            rows={requests}
            rowKey={(r) => r.id}
            emptyTitle="Sin solicitudes"
            emptyDescription="No hay solicitudes de herramientas pendientes."
          />
        </Section>
      )}

      {/* ── Engineer: Mi kit ── */}
      {!isManager && tab === "mykit" && (
        <Section title={`Mi kit · ${myKit.length} herramienta${myKit.length !== 1 ? "s" : ""} asignada${myKit.length !== 1 ? "s" : ""}`}>
          {myKit.length === 0 && !loading ? (
            <p style={{ color: "var(--text-tertiary)", fontSize: 13 }}>No tienes herramientas asignadas actualmente.</p>
          ) : (
            <DataTable<KitAssignment>
              columns={myKitColumns}
              rows={myKit}
              rowKey={(k) => k.id}
              emptyTitle="Sin herramientas asignadas"
            />
          )}
        </Section>
      )}

      {/* ── Engineer: Mis solicitudes ── */}
      {!isManager && tab === "myrequests" && (
        <Section title="Mis solicitudes">
          {showRequestForm && (
            <div style={{ background: "var(--surface-2)", border: "1px solid var(--border)", borderRadius: 12, padding: 20, marginBottom: 20, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              <div style={{ gridColumn: "1 / -1" }}>
                <label style={{ fontSize: 12, fontWeight: 600, color: "var(--text-secondary)", display: "block", marginBottom: 4 }}>Herramienta / Kit</label>
                <input value={requestForm.herramienta} onChange={e => setRequestForm(f => ({ ...f, herramienta: e.target.value }))} placeholder='Ej: Taladro, Kit instalación, Escalera…' style={inp} />
              </div>
              <div>
                <label style={{ fontSize: 12, fontWeight: 600, color: "var(--text-secondary)", display: "block", marginBottom: 4 }}>Tipo</label>
                <select value={requestForm.tipo} onChange={e => setRequestForm(f => ({ ...f, tipo: e.target.value }))} style={inp}>
                  <option>Préstamo</option>
                  <option>Consumible</option>
                  <option>Reposición</option>
                </select>
              </div>
              <div>
                <label style={{ fontSize: 12, fontWeight: 600, color: "var(--text-secondary)", display: "block", marginBottom: 4 }}>Cantidad</label>
                <input type="number" min={1} value={requestForm.cantidad} onChange={e => setRequestForm(f => ({ ...f, cantidad: +e.target.value }))} style={inp} />
              </div>
              <div style={{ gridColumn: "1 / -1" }}>
                <label style={{ fontSize: 12, fontWeight: 600, color: "var(--text-secondary)", display: "block", marginBottom: 4 }}>Observaciones</label>
                <input value={requestForm.observaciones} onChange={e => setRequestForm(f => ({ ...f, observaciones: e.target.value }))} placeholder="Notas adicionales" style={inp} />
              </div>
              <div style={{ gridColumn: "1 / -1", display: "flex", gap: 8, justifyContent: "flex-end" }}>
                <Button variant="ghost" onClick={() => setShowRequestForm(false)}>Cancelar</Button>
                <Button variant="primary" onClick={createRequest}>Solicitar</Button>
              </div>
            </div>
          )}
          <DataTable<ToolRequest>
            columns={myReqColumns}
            rows={myRequests}
            rowKey={(r) => r.id}
            emptyTitle="Sin solicitudes previas"
          />
        </Section>
      )}
    </>
  );
}
