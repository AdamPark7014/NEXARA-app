"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import PageHeader from "@/components/ui/PageHeader";
import Section from "@/components/ui/Section";
import Button from "@/components/ui/Button";
import KpiCard from "@/components/ui/KpiCard";
import DataTable, { Tag, type Column } from "@/components/ui/DataTable";
import EmptyState from "@/components/ui/EmptyState";
import { useUser } from "@/components/UserContext";
import { buildApiUrl } from "@/lib/api-base";
import { getOpsTeamSectionConfig } from "@/lib/section-views";
import { getActivitiesCanonicalPath, resolveV2RoleKey } from "@/lib/user-access";
import { ROLES } from "@/lib/rbac";

interface Snapshot {
  id: number;
  title?: string | null;
  status: string;
  previousCount?: number | null;
  currentCount?: number | null;
  deltaCount?: number | null;
  updatedAt?: string;
  client?: { id: number; name: string };
  branch?: { id: number; name: string; branchNumber?: string };
  activity?: { id: number; anNumber?: string; titulo?: string } | null;
}

interface ServiceClient { id: number; name: string; }
interface Branch { id: number; name: string; branchNumber?: string | null; }

type EquipmentRow = { equipmentName: string; serialNumber: string; model: string };

const inp: React.CSSProperties = {
  width: "100%", padding: "7px 9px", border: "1px solid var(--border)",
  borderRadius: 7, background: "var(--surface)", color: "var(--foreground)", fontSize: 12.5, boxSizing: "border-box",
};

async function apiFetch<T = unknown>(path: string, token: string, opts?: RequestInit): Promise<T> {
  const res = await fetch(buildApiUrl(path), {
    ...opts,
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", ...(opts?.headers ?? {}) },
  });
  if (!res.ok) throw new Error(await res.text().catch(() => `HTTP ${res.status}`));
  return res.json() as Promise<T>;
}

export default function AssetsPage() {
  const { user } = useUser();
  const cfg = useMemo(() => getOpsTeamSectionConfig(user, "assets"), [user]);
  const router = useRouter();
  const token = user?.token ?? "";

  useEffect(() => {
    const v2 = resolveV2RoleKey(user);
    if (!user?.isSuperAdmin && v2 === ROLES.ING_CAMPO) {
      router.replace(getActivitiesCanonicalPath(user));
    }
  }, [user, router]);

  const [items, setItems] = useState<Snapshot[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [showForm, setShowForm] = useState(false);
  const [clients, setClients] = useState<ServiceClient[]>([]);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [clientId, setClientId] = useState("");
  const [branchId, setBranchId] = useState("");
  const [title, setTitle] = useState("");
  const [notes, setNotes] = useState("");
  const [equipRows, setEquipRows] = useState<EquipmentRow[]>([{ equipmentName: "", serialNumber: "", model: "" }]);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true); setError(null);
    try {
      const data = await apiFetch("inventories?limit=100", token);
      setItems(Array.isArray(data) ? data : ((data as { data?: Snapshot[] })?.data ?? []));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error al cargar activos en campo");
    } finally { setLoading(false); }
  }, [token]);

  useEffect(() => { void load(); }, [load]);

  useEffect(() => {
    if (!token || !showForm || clients.length) return;
    apiFetch<ServiceClient[]>("service-clients?limit=200", token)
      .then((d) => setClients(Array.isArray(d) ? d : ((d as { data?: ServiceClient[] })?.data ?? [])))
      .catch(() => setClients([]));
  }, [token, showForm, clients.length]);

  useEffect(() => {
    if (!token || !clientId) { setBranches([]); setBranchId(""); return; }
    apiFetch<Branch[]>(`service-clients/${clientId}/branches`, token)
      .then((d) => setBranches(Array.isArray(d) ? d : []))
      .catch(() => setBranches([]));
  }, [token, clientId]);

  const save = async () => {
    if (!token || !clientId || !branchId) return;
    const items = equipRows
      .filter((r) => r.equipmentName.trim())
      .map((r) => ({
        equipmentName: r.equipmentName.trim(),
        serialNumber: r.serialNumber.trim() || undefined,
        model: r.model.trim() || undefined,
      }));
    if (!items.length) {
      window.alert("Agrega al menos un equipo.");
      return;
    }
    setSaving(true);
    try {
      await apiFetch("inventories/sync", token, {
        method: "POST",
        body: JSON.stringify({
          clientId: Number(clientId),
          branchId: Number(branchId),
          title: title.trim() || undefined,
          notes: notes.trim() || undefined,
          completed: true,
          confirmDifference: true,
          items,
        }),
      });
      setShowForm(false);
      setClientId(""); setBranchId(""); setTitle(""); setNotes("");
      setEquipRows([{ equipmentName: "", serialNumber: "", model: "" }]);
      void load();
    } catch (e) {
      window.alert(e instanceof Error ? e.message : "No se pudo registrar el inventario");
    } finally { setSaving(false); }
  };

  const pendientes = items.filter((i) => i.status === "PENDING").length;
  const conDiferencia = items.filter((i) => (i.deltaCount ?? 0) !== 0).length;

  const statusVariant = (s: string): "positive" | "warning" | "danger" => s === "COMPLETED" ? "positive" : s === "PENDING" ? "warning" : "danger";

  const columns: Column<Snapshot>[] = [
    {
      key: "client", label: "Cliente / Sucursal",
      render: (s) => (
        <div>
          <div style={{ fontWeight: 700, fontSize: 13 }}>{s.client?.name ?? "—"}</div>
          <div style={{ fontSize: 11.5, color: "var(--text-tertiary)" }}>{s.branch?.name ?? s.branch?.branchNumber ?? ""}</div>
        </div>
      ),
    },
    { key: "title", label: "Título", accessor: (s) => s.title ?? "—", width: 160 },
    { key: "currentCount", label: "Equipo actual", render: (s) => s.currentCount ?? "—", width: 110 },
    { key: "deltaCount", label: "Diferencia", render: (s) => {
      const d = s.deltaCount ?? 0;
      if (d === 0) return <Tag variant="positive">Sin cambios</Tag>;
      return <Tag variant="danger">{d > 0 ? `+${d}` : d}</Tag>;
    }, width: 120 },
    { key: "status", label: "Estado", render: (s) => <Tag variant={statusVariant(s.status)}>{s.status}</Tag>, width: 110 },
    { key: "updatedAt", label: "Actualizado", render: (s) => <span style={{ fontSize: 12 }}>{s.updatedAt ? new Date(s.updatedAt).toLocaleDateString("es-MX") : "—"}</span>, width: 110 },
  ];

  return (
    <>
      <PageHeader
        eyebrow="OPS · Servicio continuo"
        title={cfg.title}
        subtitle={cfg.subtitle}
        actions={
          <>
            <Button variant="ghost" iconLeft="🔄" onClick={() => void load()}>Actualizar</Button>
            {cfg.canCreate && (
              <Button variant="primary" iconLeft="+" onClick={() => setShowForm(true)}>Nuevo inventario</Button>
            )}
          </>
        }
      />

      {showForm && (
        <div style={{ background: "var(--surface-2)", border: "1px solid var(--border)", borderRadius: 12, padding: 18, marginBottom: 18 }}>
          <p style={{ margin: "0 0 14px", fontWeight: 700, fontSize: 13 }}>Registrar inventario en sitio</p>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            <div>
              <label style={{ fontSize: 11.5, fontWeight: 600, color: "var(--text-secondary)", display: "block", marginBottom: 3 }}>Cliente *</label>
              <select value={clientId} onChange={(e) => setClientId(e.target.value)} style={inp}>
                <option value="">— Seleccionar —</option>
                {clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
            <div>
              <label style={{ fontSize: 11.5, fontWeight: 600, color: "var(--text-secondary)", display: "block", marginBottom: 3 }}>Sucursal *</label>
              <select value={branchId} onChange={(e) => setBranchId(e.target.value)} style={inp} disabled={!clientId}>
                <option value="">— Seleccionar —</option>
                {branches.map((b) => <option key={b.id} value={b.id}>{b.name}{b.branchNumber ? ` (${b.branchNumber})` : ""}</option>)}
              </select>
            </div>
            <div style={{ gridColumn: "1 / -1" }}>
              <label style={{ fontSize: 11.5, fontWeight: 600, color: "var(--text-secondary)", display: "block", marginBottom: 3 }}>Título</label>
              <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Inventario inicial sucursal centro" style={inp} />
            </div>
            {equipRows.map((row, idx) => (
              <div key={idx} style={{ gridColumn: "1 / -1", display: "grid", gridTemplateColumns: "2fr 1fr 1fr auto", gap: 8, alignItems: "end" }}>
                <div>
                  {idx === 0 && <label style={{ fontSize: 11.5, fontWeight: 600, color: "var(--text-secondary)", display: "block", marginBottom: 3 }}>Equipo *</label>}
                  <input value={row.equipmentName} onChange={(e) => setEquipRows((rows) => rows.map((r, i) => i === idx ? { ...r, equipmentName: e.target.value } : r))} placeholder="Cámara domo 4K" style={inp} />
                </div>
                <div>
                  {idx === 0 && <label style={{ fontSize: 11.5, fontWeight: 600, color: "var(--text-secondary)", display: "block", marginBottom: 3 }}>Serie</label>}
                  <input value={row.serialNumber} onChange={(e) => setEquipRows((rows) => rows.map((r, i) => i === idx ? { ...r, serialNumber: e.target.value } : r))} style={inp} />
                </div>
                <div>
                  {idx === 0 && <label style={{ fontSize: 11.5, fontWeight: 600, color: "var(--text-secondary)", display: "block", marginBottom: 3 }}>Modelo</label>}
                  <input value={row.model} onChange={(e) => setEquipRows((rows) => rows.map((r, i) => i === idx ? { ...r, model: e.target.value } : r))} style={inp} />
                </div>
                <Button variant="ghost" size="sm" onClick={() => setEquipRows((rows) => rows.filter((_, i) => i !== idx))} disabled={equipRows.length <= 1}>✕</Button>
              </div>
            ))}
            <div style={{ gridColumn: "1 / -1" }}>
              <Button variant="ghost" size="sm" onClick={() => setEquipRows((rows) => [...rows, { equipmentName: "", serialNumber: "", model: "" }])}>+ Agregar equipo</Button>
            </div>
            <div style={{ gridColumn: "1 / -1" }}>
              <label style={{ fontSize: 11.5, fontWeight: 600, color: "var(--text-secondary)", display: "block", marginBottom: 3 }}>Notas</label>
              <input value={notes} onChange={(e) => setNotes(e.target.value)} style={inp} />
            </div>
          </div>
          <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 14 }}>
            <Button variant="ghost" onClick={() => setShowForm(false)}>Cancelar</Button>
            <Button variant="primary" onClick={() => void save()} disabled={saving || !clientId || !branchId}>
              {saving ? "Guardando…" : "Registrar inventario"}
            </Button>
          </div>
        </div>
      )}

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 12, marginBottom: 20 }}>
        <KpiCard label="Inventarios totales" value={items.length} icon="📡" />
        <KpiCard label="Pendientes" value={pendientes} variant={pendientes > 0 ? "warning" : "positive"} icon="⏳" />
        <KpiCard label="Con diferencia detectada" value={conDiferencia} variant={conDiferencia > 0 ? "danger" : "positive"} icon="⚠️" />
      </div>

      <Section title={loading ? "Cargando…" : `${items.length} inventarios`}>
        {loading && <EmptyState icon="⏳" title="Cargando…" description="Consultando inventarios de campo." />}
        {!loading && error && <EmptyState icon="⚠️" title="No se pudo cargar" description={error} action={<Button size="sm" variant="secondary" onClick={() => void load()}>Reintentar</Button>} />}
        {!loading && !error && <DataTable columns={columns} rows={items} rowKey={(s) => s.id} emptyTitle="Sin inventarios" emptyDescription={cfg.canCreate ? "Registra el primer inventario con el botón de arriba." : "Los inventarios se generan desde visitas de mantenimiento."} />}
      </Section>
    </>
  );
}
