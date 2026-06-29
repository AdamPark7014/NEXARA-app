"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import PageHeader from "@/components/ui/PageHeader";
import Section from "@/components/ui/Section";
import Button from "@/components/ui/Button";
import KpiCard from "@/components/ui/KpiCard";
import DataTable, { Tag, Money, type Column } from "@/components/ui/DataTable";
import EmptyState from "@/components/ui/EmptyState";
import { useUser } from "@/components/UserContext";
import { buildApiUrl } from "@/lib/api-base";
import { useCrmManagerGuard } from "@/lib/useCrmManagerGuard";
import { getCrmManagerSubmoduleConfig } from "@/lib/section-views";
import ConfirmDialog, { type ConfirmState } from "@/components/ui/ConfirmDialog";

interface Performance {
  targetId: number;
  ownerId: number;
  ownerName: string;
  year: number;
  month?: number | null;
  revenueTarget: number;
  revenueAchieved: number;
  attainmentPct: number;
  opportunitiesTarget: number;
  opportunitiesCreated: number;
  commission: number;
  reachedBonus: boolean;
}

interface ApiUserLite { id: number; nombre: string }

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

const now = new Date();
const emptyForm = {
  ownerId: "", period: "MONTHLY", year: now.getFullYear(), month: now.getMonth() + 1,
  revenueTarget: 0, newClientsTarget: 0, opportunitiesTarget: 0, baseCommissionPct: 5, bonusCommissionPct: 2, bonusThresholdPct: 100,
};

export default function TargetsPage() {
  const { user } = useUser();
  const cfg = useCrmManagerGuard();
  const viewCfg = useMemo(() => getCrmManagerSubmoduleConfig(user, "targets"), [user]);
  const token = user?.token ?? "";

  const [perf, setPerf] = useState<{ year: number; month: number; performance: Performance[]; totals: { revenueTarget: number; revenueAchieved: number; totalCommissions: number; avgAttainmentPct: number } } | null>(null);
  const [users, setUsers] = useState<ApiUserLite[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ ...emptyForm });
  const [saving, setSaving] = useState(false);
  const [saveErr, setSaveErr] = useState<string | null>(null);
  const [confirmState, setConfirmState] = useState<ConfirmState | null>(null);

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true); setError(null);
    try {
      const [perfData, usersData] = await Promise.all([
        apiFetch("sales-targets/performance", token),
        apiFetch("users", token).catch(() => []),
      ]);
      setPerf(perfData);
      setUsers(Array.isArray(usersData) ? usersData : (usersData?.data ?? []));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error al cargar cuotas y metas");
    } finally { setLoading(false); }
  }, [token]);

  useEffect(() => { void load(); }, [load]);

  if (!cfg.canAccess) return null;

  const submit = async () => {
    if (!token || !form.ownerId || !form.revenueTarget) return;
    setSaving(true);
    try {
      await apiFetch("sales-targets", token, { method: "POST", body: JSON.stringify({ ...form, ownerId: Number(form.ownerId) }) });
      setShowForm(false); setForm({ ...emptyForm }); setSaveErr(null);
      void load();
    } catch (e) {
      setSaveErr(e instanceof Error ? e.message : "No se pudo guardar la cuota");
    } finally { setSaving(false); }
  };

  const remove = async (p: Performance) => {
    if (!token) return;
    setConfirmState({ message: `¿Eliminar la cuota de ${p.ownerName}?`, fn: async () => {
    try {
      await apiFetch(`sales-targets/${p.targetId}`, token, { method: "DELETE" });
      void load();
    } catch (e) { setSaveErr(e instanceof Error ? e.message : "Error al eliminar"); }
  } });
  };

  const inp: React.CSSProperties = { width: "100%", padding: "8px 12px", borderRadius: 8, border: "1px solid var(--border)", background: "var(--surface-2)", color: "var(--foreground)", fontSize: 13 };

  const columns: Column<Performance>[] = [
    { key: "ownerName", label: "Ejecutivo" },
    { key: "revenueTarget", label: "Meta", render: (p) => <Money value={p.revenueTarget} />, width: 120 },
    { key: "revenueAchieved", label: "Logrado", render: (p) => <Money value={p.revenueAchieved} />, width: 120 },
    { key: "attainmentPct", label: "% cumplimiento", render: (p) => <Tag variant={p.attainmentPct >= 100 ? "positive" : p.attainmentPct >= 60 ? "warning" : "danger"}>{p.attainmentPct}%</Tag>, width: 130 },
    { key: "commission", label: "Comisión", render: (p) => <Money value={p.commission} />, width: 120 },
    ...(cfg.canCreate ? [{
      key: "acciones" as keyof Performance, label: "",
      render: (p: Performance) => <Button size="sm" variant="danger" onClick={(e) => { e.stopPropagation(); void remove(p); }}>Eliminar</Button>,
      width: 100,
    }] : []),
  ];

  return (
    <>
      <PageHeader
        eyebrow="CRM · Equipo y métricas"
        title={viewCfg.title}
        subtitle={viewCfg.subtitle}
        actions={
          <>
            <Button variant="ghost" iconLeft="🔄" onClick={() => void load()}>Actualizar</Button>
            {cfg.canCreate && <Button variant="primary" iconLeft="+" onClick={() => setShowForm(true)}>Nueva cuota</Button>}
          </>
        }
      />

      {loading && <EmptyState icon="⏳" title="Cargando…" description="Calculando cumplimiento del mes." />}
      {!loading && error && <EmptyState icon="⚠️" title="No se pudo cargar" description={error} action={<Button size="sm" variant="secondary" onClick={() => void load()}>Reintentar</Button>} />}

      {!loading && !error && perf && (
        <>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 12, marginBottom: 20 }}>
            <KpiCard label="Meta total" value={`$${(perf.totals.revenueTarget / 1000000).toFixed(1)}M`} icon="🎯" />
            <KpiCard label="Logrado total" value={`$${(perf.totals.revenueAchieved / 1000000).toFixed(1)}M`} variant="positive" icon="📈" />
            <KpiCard label="Cumplimiento promedio" value={`${perf.totals.avgAttainmentPct}%`} icon="📊" />
            <KpiCard label="Comisiones del mes" value={`$${(perf.totals.totalCommissions / 1000).toFixed(1)}k`} icon="💰" />
          </div>
          <Section title={`Cuotas · ${perf.year}-${String(perf.performance[0]?.month ?? now.getMonth() + 1).padStart(2, "0")}`}>
            <DataTable columns={columns} rows={perf.performance} rowKey={(p) => p.targetId} emptyTitle="Sin cuotas asignadas" emptyDescription="Crea la primera cuota del mes para tu equipo." />
          </Section>
        </>
      )}

      {showForm && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000 }} onClick={() => setShowForm(false)}>
          <div style={{ background: "var(--surface)", borderRadius: 16, padding: 28, width: 460, maxWidth: "calc(100vw - 32px)", boxShadow: "0 24px 56px rgba(0,0,0,0.24)", border: "1px solid var(--border)", maxHeight: "90vh", overflowY: "auto" }} onClick={(e) => e.stopPropagation()}>
            <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 20 }}>Nueva cuota mensual</div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
              <label style={{ display: "grid", gap: 4, gridColumn: "1 / -1" }}><span style={{ fontSize: 11.5, fontWeight: 600, color: "var(--text-secondary)" }}>Ejecutivo</span>
                <select value={form.ownerId} onChange={(e) => setForm((f) => ({ ...f, ownerId: e.target.value }))} style={inp}>
                  <option value="">— Seleccionar —</option>
                  {users.map((u) => <option key={u.id} value={u.id}>{u.nombre}</option>)}
                </select></label>
              <label style={{ display: "grid", gap: 4 }}><span style={{ fontSize: 11.5, fontWeight: 600, color: "var(--text-secondary)" }}>Año</span>
                <input type="number" value={form.year} onChange={(e) => setForm((f) => ({ ...f, year: Number(e.target.value) }))} style={inp} /></label>
              <label style={{ display: "grid", gap: 4 }}><span style={{ fontSize: 11.5, fontWeight: 600, color: "var(--text-secondary)" }}>Mes</span>
                <input type="number" min={1} max={12} value={form.month} onChange={(e) => setForm((f) => ({ ...f, month: Number(e.target.value) }))} style={inp} /></label>
              <label style={{ display: "grid", gap: 4, gridColumn: "1 / -1" }}><span style={{ fontSize: 11.5, fontWeight: 600, color: "var(--text-secondary)" }}>Meta de ingresos ($)</span>
                <input type="number" min={0} value={form.revenueTarget} onChange={(e) => setForm((f) => ({ ...f, revenueTarget: Number(e.target.value) }))} style={inp} /></label>
              <label style={{ display: "grid", gap: 4 }}><span style={{ fontSize: 11.5, fontWeight: 600, color: "var(--text-secondary)" }}>Comisión base (%)</span>
                <input type="number" min={0} value={form.baseCommissionPct} onChange={(e) => setForm((f) => ({ ...f, baseCommissionPct: Number(e.target.value) }))} style={inp} /></label>
              <label style={{ display: "grid", gap: 4 }}><span style={{ fontSize: 11.5, fontWeight: 600, color: "var(--text-secondary)" }}>Comisión bono (%)</span>
                <input type="number" min={0} value={form.bonusCommissionPct} onChange={(e) => setForm((f) => ({ ...f, bonusCommissionPct: Number(e.target.value) }))} style={inp} /></label>
            </div>
            <div style={{ display: "flex", gap: 10, marginTop: 24, justifyContent: "flex-end" }}>
              {saveErr && <p style={{ color: "var(--danger)", fontSize: 12, margin: "0 0 8px" }}>{saveErr}</p>}
              <Button variant="secondary" onClick={() => { setShowForm(false); setSaveErr(null); }}>Cancelar</Button>
              <Button variant="primary" onClick={() => void submit()} disabled={saving || !form.ownerId || !form.revenueTarget}>{saving ? "Guardando…" : "Crear"}</Button>
            </div>
          </div>
        </div>
      )}
      <ConfirmDialog state={confirmState} onClose={() => setConfirmState(null)} />
    </>
  );
}
