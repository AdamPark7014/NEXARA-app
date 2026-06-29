"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import { useSearchParams } from "next/navigation";
import PageHeader from "@/components/ui/PageHeader";
import Section from "@/components/ui/Section";
import Button from "@/components/ui/Button";
import KpiCard from "@/components/ui/KpiCard";
import DataTable, { Tag, Money, type Column } from "@/components/ui/DataTable";
import { useUser } from "@/components/UserContext";
import { getErpFinanceSectionConfig } from "@/lib/section-views";
import { buildApiUrl } from "@/lib/api-base";
import { formatApiError } from "@/lib/erp-api";

interface JournalEntry {
  id: number;
  reference?: string;
  description?: string;
  totalDebit?: number;
  totalCredit?: number;
  status?: string;
  date?: string;
  createdBy?: { nombre?: string };
  type?: string;
}

const TIPOS = ["DIARIO", "EGRESOS", "INGRESOS", "AJUSTE"];

async function apiFetch(path: string, token: string, opts?: RequestInit) {
  const res = await fetch(buildApiUrl(path), {
    ...opts,
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", ...(opts?.headers ?? {}) },
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

interface AccountOption { id: number; code?: string; name?: string; }

const emptyForm = {
  description: "",
  type: "DIARIO",
  date: new Date().toISOString().slice(0, 10),
  reference: "",
  debitAccountId: "",
  creditAccountId: "",
  amount: 0,
};

export default function AccountingPage() {
  const { user } = useUser();
  const cfg = useMemo(() => getErpFinanceSectionConfig(user, "accounting"), [user]);
  const token = user?.token ?? "";
  const searchParams = useSearchParams();
  const highlightId = searchParams.get("highlight");

  const [items, setItems] = useState<JournalEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saveErr, setSaveErr] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ ...emptyForm });
  const [accounts, setAccounts] = useState<AccountOption[]>([]);
  const [accountsErr, setAccountsErr] = useState<string | null>(null);

  const loadAccounts = useCallback(async () => {
    if (!token) return;
    setAccountsErr(null);
    try {
      const data = await apiFetch("accounting/accounts?isActive=true", token);
      setAccounts(Array.isArray(data) ? data : (data?.data ?? []));
    } catch (e) {
      setAccounts([]);
      setAccountsErr(formatApiError(e, "No se pudo cargar el catálogo de cuentas"));
    }
  }, [token]);

  useEffect(() => {
    if (showForm) void loadAccounts();
  }, [showForm, loadAccounts]);

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    setError(null);
    try {
      const data = await apiFetch("accounting/journal-entries", token);
      setItems(Array.isArray(data) ? data : (data.data ?? []));
    } catch (e) {
      setError(formatApiError(e, "No se pudieron cargar las pólizas"));
      setItems([]);
    } finally { setLoading(false); }
  }, [token]);

  useEffect(() => { load(); }, [load]);

  const save = async () => {
    if (!token || !form.description.trim()) {
      setSaveErr("El concepto es obligatorio.");
      return;
    }
    if (!form.debitAccountId || !form.creditAccountId) {
      setSaveErr("Selecciona cuenta de cargo y abono.");
      return;
    }
    if (form.debitAccountId === form.creditAccountId) {
      setSaveErr("Las cuentas de cargo y abono deben ser distintas.");
      return;
    }
    if (!form.amount || form.amount <= 0) {
      setSaveErr("El importe debe ser mayor a cero.");
      return;
    }
    setSaving(true);
    setSaveErr(null);
    try {
      const amount = Number(form.amount);
      const created = await apiFetch("accounting/journal-entries", token, {
        method: "POST",
        body: JSON.stringify({
          date: form.date,
          description: form.description.trim(),
          reference: form.reference.trim() || undefined,
          lines: [
            {
              debitAccountId: Number(form.debitAccountId),
              creditAccountId: Number(form.creditAccountId),
              description: form.description.trim(),
              debit: amount,
              credit: 0,
            },
            {
              debitAccountId: Number(form.creditAccountId),
              creditAccountId: Number(form.debitAccountId),
              description: form.description.trim(),
              debit: 0,
              credit: amount,
            },
          ],
        }),
      });
      setItems(prev => [created, ...prev]);
      setShowForm(false);
      setForm({ ...emptyForm });
    } catch (e) {
      setSaveErr(formatApiError(e, "No se pudo crear la póliza"));
    } finally {
      setSaving(false);
    }
  };

  const postEntry = async (id: number) => {
    if (!token) return;
    try {
      const updated = await apiFetch(`accounting/journal-entries/${id}/post`, token, { method: "PATCH" });
      setItems(prev => prev.map(e => e.id === id ? { ...e, ...updated } : e));
    } catch (e) {
      window.alert(formatApiError(e, "No se pudo contabilizar"));
    }
  };

  const reverseEntry = async (id: number) => {
    if (!token || !confirm("¿Reversar esta póliza? Se generará una contrapóliza.")) return;
    try {
      const updated = await apiFetch(`accounting/journal-entries/${id}/reverse`, token, { method: "POST" });
      setItems(prev => prev.map(e => e.id === id ? { ...e, ...updated } : e));
    } catch (e) {
      window.alert(formatApiError(e, "No se pudo reversar"));
    }
  };

  const ingresos = items.filter(e => e.type === "INGRESOS").reduce((s, e) => s + (e.totalCredit ?? 0), 0);
  const egresos = items.filter(e => e.type === "EGRESOS").reduce((s, e) => s + (e.totalDebit ?? 0), 0);
  const borradores = items.filter(e => e.status === "DRAFT" || e.status === "BORRADOR").length;

  const statusVariant = (s?: string): "accent" | "warning" | "neutral" | "danger" =>
    s === "POSTED" || s === "CONTABILIZADA" ? "neutral" : s === "REVERSED" ? "danger" : "warning";

  const inp: React.CSSProperties = { width: "100%", padding: "8px 10px", border: "1px solid var(--border)", borderRadius: 8, background: "var(--surface)", color: "var(--foreground)", fontSize: 13, boxSizing: "border-box" };

  const visibleItems = useMemo(() => {
    if (!highlightId) return items;
    const id = Number(highlightId);
    if (Number.isNaN(id)) return items;
    return [...items].sort((a, b) => (a.id === id ? -1 : b.id === id ? 1 : 0));
  }, [items, highlightId]);

  const columns: Column<JournalEntry>[] = [
    { key: "reference", label: "Referencia", render: e => <code style={{ fontSize: 11.5 }}>{e.reference ?? `P-${e.id}`}</code>, width: 130 },
    { key: "description", label: "Concepto", render: e => (
      <div>
        <div style={{ fontSize: 13 }}>{e.description ?? "—"}</div>
        <div style={{ fontSize: 11.5, color: "var(--text-tertiary)" }}>{e.type} · {e.createdBy?.nombre}</div>
      </div>
    )},
    { key: "totalDebit", label: "Cargo", render: e => e.totalDebit ? <Money value={e.totalDebit} /> : <span style={{ color: "var(--text-tertiary)" }}>—</span>, width: 120 },
    { key: "totalCredit", label: "Abono", render: e => e.totalCredit ? <Money value={e.totalCredit} /> : <span style={{ color: "var(--text-tertiary)" }}>—</span>, width: 120 },
    { key: "date", label: "Fecha", accessor: e => e.date ? new Date(e.date).toLocaleDateString("es-MX", { day: "2-digit", month: "short", year: "2-digit" }) : "—", width: 90 },
    { key: "status", label: "Estado", render: e => (
      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
        <Tag variant={statusVariant(e.status)}>{e.status ?? "BORRADOR"}</Tag>
        {(e.status === "DRAFT" || e.status === "BORRADOR") && cfg.canApprove && (
          <button onClick={() => postEntry(e.id)} style={{ fontSize: 11, background: "#1F5F4E", color: "#fff", border: "none", borderRadius: 4, padding: "2px 7px", cursor: "pointer" }}>Contabilizar</button>
        )}
        {(e.status === "POSTED" || e.status === "CONTABILIZADA") && cfg.canDelete && (
          <button onClick={() => reverseEntry(e.id)} style={{ fontSize: 11, background: "var(--danger)", color: "#fff", border: "none", borderRadius: 4, padding: "2px 7px", cursor: "pointer" }}>Reversar</button>
        )}
      </div>
    ), width: 200 },
  ];

  return (
    <>
      <PageHeader
        eyebrow="ERP · Finanzas"
        title="Contabilidad · Pólizas"
        subtitle="Libro diario de pólizas contables: ingresos, egresos, ajustes y diarios."
        actions={cfg.canCreate ? <Button variant="primary" iconLeft="+" onClick={() => { setForm({ ...emptyForm }); setShowForm(true); }}>Nueva póliza</Button> : undefined}
      />

      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 14, marginBottom: 20 }}>
        <KpiCard label="Ingresos registrados" value={`$${(ingresos / 1000000).toFixed(2)}M`} />
        <KpiCard label="Egresos registrados" value={`$${(egresos / 1000000).toFixed(2)}M`} />
        <KpiCard label="Borradores" value={borradores} />
      </div>

      {showForm && (
        <div style={{ background: "var(--surface-2)", border: "1px solid var(--border)", borderRadius: 12, padding: 20, marginBottom: 20, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <div style={{ gridColumn: "1 / -1" }}>
            <label style={{ fontSize: 12, fontWeight: 600, color: "var(--text-secondary)", display: "block", marginBottom: 4 }}>Concepto / Descripción</label>
            <input value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} placeholder="Descripción de la póliza" style={inp} />
          </div>
          <div>
            <label style={{ fontSize: 12, fontWeight: 600, color: "var(--text-secondary)", display: "block", marginBottom: 4 }}>Tipo</label>
            <select value={form.type} onChange={e => setForm(f => ({ ...f, type: e.target.value }))} style={inp}>
              {TIPOS.map(t => <option key={t}>{t}</option>)}
            </select>
          </div>
          <div>
            <label style={{ fontSize: 12, fontWeight: 600, color: "var(--text-secondary)", display: "block", marginBottom: 4 }}>Fecha</label>
            <input type="date" value={form.date} onChange={e => setForm(f => ({ ...f, date: e.target.value }))} style={inp} />
          </div>
          <div>
            <label style={{ fontSize: 12, fontWeight: 600, color: "var(--text-secondary)", display: "block", marginBottom: 4 }}>Referencia (opcional)</label>
            <input value={form.reference} onChange={e => setForm(f => ({ ...f, reference: e.target.value }))} placeholder="REF-001" style={inp} />
          </div>
          <div>
            <label style={{ fontSize: 12, fontWeight: 600, color: "var(--text-secondary)", display: "block", marginBottom: 4 }}>Cuenta cargo (Debe)</label>
            <select value={form.debitAccountId} onChange={e => setForm(f => ({ ...f, debitAccountId: e.target.value }))} style={inp}>
              <option value="">— Seleccionar —</option>
              {accounts.map(a => <option key={a.id} value={a.id}>{a.code ? `${a.code} · ` : ""}{a.name ?? `Cuenta ${a.id}`}</option>)}
            </select>
          </div>
          <div>
            <label style={{ fontSize: 12, fontWeight: 600, color: "var(--text-secondary)", display: "block", marginBottom: 4 }}>Cuenta abono (Haber)</label>
            <select value={form.creditAccountId} onChange={e => setForm(f => ({ ...f, creditAccountId: e.target.value }))} style={inp}>
              <option value="">— Seleccionar —</option>
              {accounts.map(a => <option key={a.id} value={a.id}>{a.code ? `${a.code} · ` : ""}{a.name ?? `Cuenta ${a.id}`}</option>)}
            </select>
          </div>
          <div>
            <label style={{ fontSize: 12, fontWeight: 600, color: "var(--text-secondary)", display: "block", marginBottom: 4 }}>Importe ($)</label>
            <input type="number" min={0} step="0.01" value={form.amount || ""} onChange={e => setForm(f => ({ ...f, amount: +e.target.value }))} style={inp} />
          </div>
          {accountsErr && (
            <div style={{ gridColumn: "1 / -1", fontSize: 12, color: "var(--danger)" }}>
              {accountsErr}{" "}
              <button type="button" onClick={() => void loadAccounts()} style={{ background: "none", border: "none", color: "inherit", cursor: "pointer", textDecoration: "underline" }}>
                Reintentar
              </button>
            </div>
          )}
          <div style={{ gridColumn: "1 / -1", display: "flex", gap: 8, justifyContent: "flex-end", flexDirection: "column", alignItems: "stretch" }}>
            {saveErr && (
              <div role="alert" style={{ padding: "8px 12px", background: "var(--state-danger-bg, #fef2f2)", border: "1px solid var(--danger)", borderRadius: 8, fontSize: 12, color: "var(--danger)" }}>
                {saveErr}
              </div>
            )}
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
              <Button variant="ghost" onClick={() => { setShowForm(false); setSaveErr(null); }}>Cancelar</Button>
              <Button variant="primary" onClick={() => void save()} disabled={saving}>{saving ? "Guardando…" : "Crear póliza"}</Button>
            </div>
          </div>
        </div>
      )}

      <Section title={loading ? "Cargando…" : `${visibleItems.length} pólizas`}>
        {highlightId && (
          <p style={{ fontSize: 12, color: "var(--text-secondary)", marginBottom: 12 }}>
            Mostrando póliza <strong>#{highlightId}</strong> desde enlace directo.
          </p>
        )}
        {error && (
          <div role="alert" style={{ padding: "10px 14px", marginBottom: 12, background: "var(--state-warning-bg)", border: "1px solid var(--state-warning-border)", borderRadius: 8, fontSize: 12 }}>
            {error} <Button size="sm" variant="ghost" onClick={() => void load()}>Reintentar</Button>
          </div>
        )}
        {loading ? (
          <div style={{ padding: 32, textAlign: "center", color: "var(--text-tertiary)" }}>Cargando…</div>
        ) : !error ? (
          <DataTable columns={columns} rows={visibleItems} rowKey={e => e.id} emptyTitle="Sin pólizas" emptyDescription="Registra la primera póliza contable." />
        ) : null}
      </Section>
    </>
  );
}
