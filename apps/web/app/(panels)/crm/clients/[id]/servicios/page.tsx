"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import CrossPanelLink from "@/components/CrossPanelLink";
import EmptyState from "@/components/ui/EmptyState";
import Button from "@/components/ui/Button";
import KpiCard from "@/components/ui/KpiCard";
import { Tag, Money } from "@/components/ui/DataTable";
import { DetailError, DetailSection } from "@/components/detail/DetailFrame";
import FilterToolbar from "@/components/FilterToolbar";
import { exportToExcel } from "@/lib/export-excel";
import { useClientDetail } from "@/components/crm/ClientDetailShell";
import { useUser } from "@/components/UserContext";
import { buildApiUrl } from "@/lib/api-base";
import { canAccessMaintenanceContracts } from "@/lib/section-views";

interface Contract {
  id: number;
  contractNumber: string;
  title: string;
  frequency: string;
  monthlyFee: number | string;
  status: string;
  nextVisitDate?: string | null;
  branch?: { id: number; name: string } | null;
  _count?: { visits: number };
}

const STATUS_LABEL: Record<string, string> = { DRAFT: "Borrador", ACTIVE: "Activo", PAUSED: "Pausado", EXPIRED: "Vencido", CANCELLED: "Cancelado" };
const FREQ_LABEL: Record<string, string> = { WEEKLY: "Semanal", BIWEEKLY: "Quincenal", MONTHLY: "Mensual", BIMONTHLY: "Bimestral", QUARTERLY: "Trimestral", SEMIANNUAL: "Semestral", ANNUAL: "Anual" };
const FREQUENCIES = ["MONTHLY", "QUARTERLY", "SEMIANNUAL", "ANNUAL"] as const;

const inp: React.CSSProperties = {
  width: "100%", padding: "7px 9px", border: "1px solid var(--border)",
  borderRadius: 7, background: "var(--surface)", color: "var(--foreground)", fontSize: 12.5, boxSizing: "border-box",
};

const emptyForm = { title: "", frequency: "MONTHLY", startDate: new Date().toISOString().slice(0, 10), monthlyFee: "" };

async function apiFetch(path: string, token: string, opts?: RequestInit) {
  const res = await fetch(buildApiUrl(path), {
    ...opts,
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", ...(opts?.headers ?? {}) },
  });
  if (!res.ok) throw new Error(await res.text().catch(() => `HTTP ${res.status}`));
  return res.json();
}

export default function ClientServicesPage() {
  const { client, error: clientError, reload: reloadClient } = useClientDetail();
  const { user } = useUser();
  const token = user?.token ?? "";
  const scId = client?.serviceClient?.id;
  const canCreate = useMemo(() => canAccessMaintenanceContracts(user), [user]);

  const [contracts, setContracts] = useState<Contract[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searchQ, setSearchQ] = useState("");
  const [filterStatus, setFilterStatus] = useState("");

  const visibleContracts = useMemo(() => {
    let rows = contracts;
    if (filterStatus) rows = rows.filter((c) => c.status === filterStatus);
    if (searchQ.trim()) {
      const q = searchQ.toLowerCase();
      rows = rows.filter((c) =>
        c.title.toLowerCase().includes(q) ||
        c.contractNumber.toLowerCase().includes(q) ||
        (c.branch?.name ?? "").toLowerCase().includes(q)
      );
    }
    return rows;
  }, [contracts, searchQ, filterStatus]);

  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ ...emptyForm });
  const [saving, setSaving] = useState(false);
  const [saveErr, setSaveErr] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!token || !scId) return;
    setLoading(true); setError(null);
    try {
      const data = await apiFetch(`maintenance-contracts?clientId=${scId}&limit=50`, token);
      setContracts(Array.isArray(data) ? data : (data?.data ?? []));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error al cargar contratos");
    } finally { setLoading(false); }
  }, [token, scId]);

  useEffect(() => { void load(); }, [load]);

  const save = async () => {
    if (!token || !scId || !form.title.trim()) return;
    setSaving(true);
    try {
      const created = await apiFetch("maintenance-contracts", token, {
        method: "POST",
        body: JSON.stringify({
          clientId: scId,
          title: form.title.trim(),
          frequency: form.frequency,
          startDate: form.startDate,
          monthlyFee: form.monthlyFee ? Number(form.monthlyFee) : 0,
        }),
      });
      setContracts((prev) => [created, ...prev]);
      setShowForm(false);
      setForm({ ...emptyForm });
    } catch (e) {
      setSaveErr(e instanceof Error ? e.message : "No se pudo crear el servicio");
    } finally { setSaving(false); }
  };

  if (clientError) return <DetailError message={clientError} onRetry={reloadClient} />;
  if (!client) return null;

  if (!client.serviceClient) {
    return (
      <EmptyState
        icon="🔧"
        title="Sin cuenta operativa"
        description="Activa el cliente en operaciones desde la pestaña Datos para gestionar contratos de servicio."
      />
    );
  }

  const statusVariant = (s: string): "positive" | "warning" | "danger" | "default" =>
    s === "ACTIVE" ? "positive" : s === "EXPIRED" || s === "CANCELLED" ? "danger" : s === "PAUSED" ? "warning" : "default";

  const mrr = contracts.filter((c) => c.status === "ACTIVE").reduce((s, c) => s + Number(c.monthlyFee ?? 0), 0);

  const activos = contracts.filter((c) => c.status === "ACTIVE").length;

  return (
    <>
    {contracts.length > 0 && (
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(130px, 1fr))", gap: 10, marginBottom: 14 }}>
        <KpiCard label="Contratos" value={contracts.length} icon="📋" />
        <KpiCard label="Activos" value={activos} variant={activos > 0 ? "positive" : "default"} icon="✅" />
        <KpiCard label="MRR" value={<Money value={mrr} compact />} variant={mrr > 0 ? "accent" : "default"} icon="💰" hint="Renta mensual activa" />
        <KpiCard label="Visitas pendientes" value={contracts.filter((c) => c.status === "ACTIVE" && c.nextVisitDate && new Date(c.nextVisitDate) > new Date()).length} icon="📅" />
      </div>
    )}
    {contracts.length > 0 && (() => {
      const byStatus: Record<string, number> = {};
      for (const c of contracts) byStatus[c.status] = (byStatus[c.status] ?? 0) + 1;
      const total = contracts.length;
      const statusColors: Record<string, string> = { ACTIVE: "var(--success)", DRAFT: "var(--warning)", PAUSED: "var(--primary)", EXPIRED: "var(--danger)", CANCELLED: "var(--text-tertiary)" };
      return (
        <div style={{ marginBottom: 14, padding: "12px 16px", background: "var(--surface-2)", border: "1px solid var(--border)", borderRadius: 10 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: "var(--text-tertiary)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 10 }}>Distribución por estado</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
            {Object.entries(byStatus).sort((a, b) => b[1] - a[1]).map(([s, count]) => (
              <div key={s} style={{ display: "grid", gridTemplateColumns: "90px 1fr 36px", gap: 10, alignItems: "center" }}>
                <span style={{ fontSize: 12, color: "var(--text-secondary)", fontWeight: 500 }}>{STATUS_LABEL[s] ?? s}</span>
                <div style={{ height: 6, borderRadius: 3, background: "var(--surface)", overflow: "hidden" }}>
                  <div style={{ height: "100%", width: `${(count / total) * 100}%`, background: statusColors[s] ?? "var(--primary)", borderRadius: 3 }} />
                </div>
                <span style={{ fontSize: 11.5, color: "var(--text-tertiary)", textAlign: "right" }}>{count}</span>
              </div>
            ))}
          </div>
        </div>
      );
    })()}
    <DetailSection title="Contratos de servicio">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
        <span style={{ fontSize: 12.5, color: "var(--text-secondary)" }}>
          {contracts.filter((c) => c.status === "ACTIVE").length} activo(s)
          {mrr > 0 && <> · <strong>MRR ${mrr.toLocaleString("es-MX")}</strong></>}
        </span>
        <div style={{ display: "flex", gap: 8 }}>
          <Button variant="ghost" size="sm" onClick={() => void load()}>Actualizar</Button>
          {canCreate && (
            <Button variant="primary" size="sm" iconLeft="+" onClick={() => setShowForm(true)}>Nuevo contrato</Button>
          )}
          <CrossPanelLink href="/ops/maintenance/contracts" style={{ textDecoration: "none" }}>
            <Button variant="secondary" size="sm">Ver todos</Button>
          </CrossPanelLink>
        </div>
      </div>

      {showForm && (
        <div style={{ background: "var(--surface-2)", border: "1px solid var(--border)", borderRadius: 10, padding: 16, marginBottom: 16 }}>
          <p style={{ margin: "0 0 12px", fontWeight: 700, fontSize: 13 }}>Nuevo contrato · {client.serviceClient.name}</p>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            <div style={{ gridColumn: "1 / -1" }}>
              <label style={{ fontSize: 11.5, fontWeight: 600, color: "var(--text-secondary)", display: "block", marginBottom: 3 }}>Nombre *</label>
              <input value={form.title} onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))} placeholder="Mantenimiento preventivo mensual" style={inp} />
            </div>
            <div>
              <label style={{ fontSize: 11.5, fontWeight: 600, color: "var(--text-secondary)", display: "block", marginBottom: 3 }}>Frecuencia</label>
              <select value={form.frequency} onChange={(e) => setForm((f) => ({ ...f, frequency: e.target.value }))} style={inp}>
                {FREQUENCIES.map((fq) => <option key={fq} value={fq}>{FREQ_LABEL[fq]}</option>)}
              </select>
            </div>
            <div>
              <label style={{ fontSize: 11.5, fontWeight: 600, color: "var(--text-secondary)", display: "block", marginBottom: 3 }}>Inicio</label>
              <input type="date" value={form.startDate} onChange={(e) => setForm((f) => ({ ...f, startDate: e.target.value }))} style={inp} />
            </div>
            <div>
              <label style={{ fontSize: 11.5, fontWeight: 600, color: "var(--text-secondary)", display: "block", marginBottom: 3 }}>Cuota mensual (MXN)</label>
              <input type="number" min="0" value={form.monthlyFee} onChange={(e) => setForm((f) => ({ ...f, monthlyFee: e.target.value }))} style={inp} />
            </div>
          </div>
          <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 12 }}>
            <Button variant="ghost" size="sm" onClick={() => setShowForm(false)}>Cancelar</Button>
            <Button variant="primary" size="sm" onClick={() => void save()} disabled={saving || !form.title.trim()}>
              {saving ? "Creando…" : "Crear contrato"}
            </Button>
          </div>
        </div>
      )}

      {contracts.length > 0 && (
        <FilterToolbar
          search={{ value: searchQ, onChange: setSearchQ, placeholder: "Buscar contrato, número o sucursal…" }}
          selects={[{
            label: "Estado",
            value: filterStatus,
            onChange: setFilterStatus,
            options: Object.entries(STATUS_LABEL).map(([v, l]) => ({ value: v, label: l })),
            allowAll: true,
          }]}
          onClear={() => { setSearchQ(""); setFilterStatus(""); }}
          resultCount={visibleContracts.length}
          rightActions={
            <Button variant="ghost" size="sm" iconLeft="⬇" onClick={() => exportToExcel(visibleContracts, [
              { key: "contractNumber", label: "Número" },
              { key: "title", label: "Nombre" },
              { key: "frequency", label: "Frecuencia", format: (v) => FREQ_LABEL[String(v)] ?? String(v) },
              { key: "monthlyFee", label: "Cuota mensual" },
              { key: "status", label: "Estado", format: (v) => STATUS_LABEL[String(v)] ?? String(v) },
            ], "contratos-servicio")}>Excel</Button>
          }
        />
      )}

      {loading && <EmptyState icon="⏳" title="Cargando contratos…" description="" />}
      {!loading && error && <EmptyState icon="⚠️" title="Error al cargar" description={error} action={<Button size="sm" variant="secondary" onClick={() => void load()}>Reintentar</Button>} />}

      {!loading && !error && contracts.length === 0 && (
        <EmptyState
          icon="📋"
          title="Sin contratos de servicio"
          description="Este cliente aún no tiene contratos de mantenimiento. Puedes crear uno desde OPS → Contratos."
          action={
            <CrossPanelLink href="/ops/maintenance/contracts" style={{ textDecoration: "none" }}>
              <Button size="sm" variant="primary">Crear contrato de servicio</Button>
            </CrossPanelLink>
          }
        />
      )}

      {!loading && !error && contracts.length > 0 && (
        <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "grid", gap: 8 }}>
          {visibleContracts.length === 0 && <EmptyState icon="🔍" title="Sin resultados" description="Ajusta los filtros." />}
          {visibleContracts.map((c) => (
            <li key={c.id} style={{ padding: "12px 14px", border: "1px solid var(--border)", borderRadius: 10 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8 }}>
                <div>
                  <div style={{ fontWeight: 700, fontSize: 13 }}>
                    <CrossPanelLink href={`/ops/maintenance/contracts?highlight=${c.id}`} style={{ color: "inherit", textDecoration: "none" }}>
                      {c.title} →
                    </CrossPanelLink>
                  </div>
                  <div style={{ fontSize: 11.5, color: "var(--text-tertiary)", marginTop: 2 }}>
                    <code style={{ fontSize: 11 }}>{c.contractNumber}</code>
                    {" · "}{FREQ_LABEL[c.frequency] ?? c.frequency}
                    {c.branch && ` · ${c.branch.name}`}
                  </div>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
                  <Money value={Number(c.monthlyFee ?? 0)} />
                  <Tag variant={statusVariant(c.status)}>{STATUS_LABEL[c.status] ?? c.status}</Tag>
                </div>
              </div>
              {c.nextVisitDate && (
                <div style={{ fontSize: 11.5, color: "var(--text-secondary)", marginTop: 6 }}>
                  Próxima visita: {new Date(c.nextVisitDate).toLocaleDateString("es-MX", { day: "2-digit", month: "short", year: "numeric" })}
                  {c._count?.visits != null && ` · ${c._count.visits} visita(s) realizadas`}
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </DetailSection>
    </>
  );
}
