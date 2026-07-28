"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import PageHeader from "@/components/ui/PageHeader";
import Section from "@/components/ui/Section";
import Button from "@/components/ui/Button";
import { Tag } from "@/components/ui/DataTable";
import EmptyState from "@/components/ui/EmptyState";
import { useUser } from "@/components/UserContext";
import { getErpGovernanceSectionConfig } from "@/lib/section-views";
import { buildApiUrl } from "@/lib/api-base";
import ConfirmDialog, { type ConfirmState } from "@/components/ui/ConfirmDialog";
import FilterToolbar from "@/components/FilterToolbar";
import { toast } from "@/components/Toast";
import KpiCard from "@/components/ui/KpiCard";

interface SettingRow {
  key: string;
  value: string;
  category: string;
  label?: string | null;
}

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

const emptyForm = { key: "", value: "", category: "general", label: "" };

export default function SettingsPage() {
  const { user } = useUser();
  const cfg = useMemo(() => getErpGovernanceSectionConfig(user, "settings"), [user]);
  const token = user?.token ?? "";

  const [settings, setSettings] = useState<SettingRow[]>([]);
  const [confirmState, setConfirmState] = useState<ConfirmState | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [editingSetting, setEditingSetting] = useState<SettingRow | null>(null);
  const [form, setForm] = useState({ ...emptyForm });
  const [formErr, setFormErr] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [searchQ, setSearchQ] = useState("");

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true); setError(null);
    try {
      const data = await apiFetch("settings", token);
      setSettings(Array.isArray(data) ? data : []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error al cargar la configuración");
    } finally { setLoading(false); }
  }, [token]);

  useEffect(() => { void load(); }, [load]);

  const grouped = useMemo(() => {
    const q = searchQ.trim().toLowerCase();
    const filtered = q
      ? settings.filter((s) => s.key.toLowerCase().includes(q) || (s.label ?? "").toLowerCase().includes(q) || s.value.toLowerCase().includes(q))
      : settings;
    const map = new Map<string, SettingRow[]>();
    for (const s of filtered) {
      if (!map.has(s.category)) map.set(s.category, []);
      map.get(s.category)!.push(s);
    }
    return Array.from(map.entries());
  }, [settings, searchQ]);

  const openNew = () => { setEditingSetting(null); setForm({ ...emptyForm }); setFormErr(null); setShowForm(true); };
  const openEdit = (s: SettingRow) => {
    setEditingSetting(s);
    setForm({ key: s.key, value: s.value, category: s.category, label: s.label ?? "" });
    setFormErr(null);
    setShowForm(true);
  };

  const save = async () => {
    if (!token || !form.key || !form.value) return;
    setSaving(true);
    setFormErr(null);
    try {
      await apiFetch("settings", token, { method: "PUT", body: JSON.stringify(form) });
      setShowForm(false);
      setEditingSetting(null);
      setForm({ ...emptyForm });
      void load();
    } catch (e) {
      setFormErr(e instanceof Error ? e.message : "No se pudo guardar");
    } finally { setSaving(false); }
  };

  const remove = async (s: SettingRow) => {
    if (!token) return;
    setConfirmState({ message: `¿Eliminar la configuración "${s.key}"?`, fn: async () => {
    try {
      await apiFetch(`settings/${s.key}`, token, { method: "DELETE" });
      setSettings((prev) => prev.filter((x) => x.key !== s.key));
    } catch (e) { toast.error(`Error: ${e instanceof Error ? e.message : "desconocido"}`); }
  } });
  };

  const inp: React.CSSProperties = { width: "100%", padding: "8px 12px", borderRadius: 8, border: "1px solid var(--border)", background: "var(--surface-2)", color: "var(--foreground)", fontSize: 13 };

  return (
    <>
      <PageHeader
        eyebrow="ERP · Gobierno"
        title="Centro de control"
        subtitle="Tenant SaaS: integraciones, facturación, API y parámetros de la empresa activa."
        actions={
          <>
            <Button variant="ghost" onClick={() => void load()}>Actualizar</Button>
            {cfg.canCreate && <Button variant="primary" onClick={openNew}>Nuevo parámetro</Button>}
          </>
        }
      />

      <Section title="Integraciones enterprise">
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 12 }}>
          {[
            { href: "/erp/settings/billing", title: "Billing & seats", desc: "Plan, asientos, Stripe Checkout / Portal", tone: "accent" as const },
            { href: "/erp/settings/webhooks", title: "Outbound webhooks", desc: "Eventos firmados HMAC por empresa", tone: "default" as const },
            { href: "/erp/settings/api-keys", title: "API keys", desc: "Machine auth + scope SCIM", tone: "default" as const },
            { href: "/erp/companies", title: "Empresas", desc: "Multi-tenant y membresías", tone: "default" as const },
          ].map((card) => (
            <a
              key={card.href}
              href={card.href}
              style={{
                display: "flex",
                flexDirection: "column",
                gap: 6,
                padding: 16,
                borderRadius: 12,
                border: "1px solid var(--border)",
                background: "var(--surface)",
                color: "var(--foreground)",
                textDecoration: "none",
                minHeight: 96,
              }}
            >
              <span style={{ fontSize: 14, fontWeight: 700 }}>{card.title}</span>
              <span style={{ fontSize: 12.5, color: "var(--text-tertiary)", lineHeight: 1.45 }}>{card.desc}</span>
              <span style={{ marginTop: "auto", fontSize: 12, fontWeight: 600, color: "var(--primary)" }}>Abrir →</span>
            </a>
          ))}
        </div>
      </Section>

      {!loading && settings.length > 0 && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 12, marginBottom: 18 }}>
          <KpiCard label="Parámetros" value={settings.length} />
          <KpiCard label="Categorías" value={new Set(settings.map((s) => s.category)).size} variant="accent" />
          <KpiCard label="Con etiqueta" value={settings.filter((s) => !!s.label).length} variant="positive" />
          <KpiCard label="Sin etiqueta" value={settings.filter((s) => !s.label).length} variant={settings.some((s) => !s.label) ? "warning" : "default"} />
        </div>
      )}

      {!loading && settings.length > 1 && (() => {
        const byCategory: Record<string, number> = {};
        for (const s of settings) byCategory[s.category] = (byCategory[s.category] ?? 0) + 1;
        const total = settings.length;
        const colors = ["var(--primary)", "var(--success)", "var(--warning)", "#a855f7", "#0ea5e9"];
        return (
          <div style={{ marginBottom: 18, padding: "12px 16px", background: "var(--surface-2)", border: "1px solid var(--border)", borderRadius: 10 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: "var(--text-tertiary)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 10 }}>Por categoría</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
              {Object.entries(byCategory).sort((a, b) => b[1] - a[1]).map(([cat, count], i) => (
                <div key={cat} style={{ display: "grid", gridTemplateColumns: "100px 1fr 36px", gap: 10, alignItems: "center" }}>
                  <span style={{ fontSize: 12, color: "var(--text-secondary)", fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{cat.charAt(0).toUpperCase() + cat.slice(1)}</span>
                  <div style={{ height: 6, borderRadius: 3, background: "var(--surface)", overflow: "hidden" }}>
                    <div style={{ height: "100%", width: `${(count / total) * 100}%`, background: colors[i % colors.length], borderRadius: 3 }} />
                  </div>
                  <span style={{ fontSize: 11.5, color: "var(--text-tertiary)", textAlign: "right" }}>{count}</span>
                </div>
              ))}
            </div>
          </div>
        );
      })()}

      <FilterToolbar
        search={{ value: searchQ, onChange: setSearchQ, placeholder: "Buscar por clave, etiqueta o valor…" }}
        onClear={() => setSearchQ("")}
        resultCount={loading ? null : settings.length}
      />
      {loading && <EmptyState icon="⏳" title="Cargando configuración…" description="Consultando parámetros del sistema." />}
      {!loading && error && <EmptyState icon="⚠️" title="No se pudo cargar" description={error} action={<Button size="sm" variant="secondary" onClick={() => void load()}>Reintentar</Button>} />}
      {!loading && !error && grouped.length === 0 && <EmptyState icon="⚙️" title="Sin configuraciones" description={searchQ ? "Sin resultados para ese filtro." : "Agrega el primer parámetro del sistema."} />}

      {!loading && !error && grouped.map(([category, rows]) => (
        <Section key={category} title={category.charAt(0).toUpperCase() + category.slice(1)}>
          <div style={{ display: "grid", gap: 8 }}>
            {rows.map((s) => (
              <div key={s.key} style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 14px", background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 10 }}>
                <Tag variant="default">{s.key}</Tag>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 600, fontSize: 13 }}>{s.label ?? s.key}</div>
                  <div style={{ fontSize: 12, color: "var(--text-tertiary)", wordBreak: "break-all" }}>{s.value}</div>
                </div>
                {cfg.canCreate && <Button size="sm" variant="ghost" onClick={() => openEdit(s)}>✎ Editar</Button>}
                {cfg.canCreate && <Button size="sm" variant="danger" onClick={() => void remove(s)}>✕</Button>}
              </div>
            ))}
          </div>
        </Section>
      ))}

      {showForm && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000 }} onClick={() => setShowForm(false)}>
          <div style={{ background: "var(--surface)", borderRadius: 16, padding: 28, width: 460, maxWidth: "calc(100vw - 32px)", boxShadow: "0 24px 56px rgba(0,0,0,0.24)", border: "1px solid var(--border)" }} onClick={(e) => e.stopPropagation()}>
            <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 20 }}>{editingSetting ? "Editar configuración" : "Nueva configuración"}</div>
            <div style={{ display: "grid", gap: 14 }}>
              <label style={{ display: "grid", gap: 4 }}><span style={{ fontSize: 11.5, fontWeight: 600, color: "var(--text-secondary)" }}>Clave (key)</span>
                <input value={form.key} onChange={(e) => setForm((f) => ({ ...f, key: e.target.value }))} placeholder="brand.primaryColor" style={inp} disabled={!!editingSetting} /></label>
              <label style={{ display: "grid", gap: 4 }}><span style={{ fontSize: 11.5, fontWeight: 600, color: "var(--text-secondary)" }}>Valor</span>
                <input value={form.value} onChange={(e) => setForm((f) => ({ ...f, value: e.target.value }))} style={inp} autoFocus={!!editingSetting} /></label>
              <label style={{ display: "grid", gap: 4 }}><span style={{ fontSize: 11.5, fontWeight: 600, color: "var(--text-secondary)" }}>Categoría</span>
                <input value={form.category} onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))} placeholder="branding, integraciones, general…" style={inp} /></label>
              <label style={{ display: "grid", gap: 4 }}><span style={{ fontSize: 11.5, fontWeight: 600, color: "var(--text-secondary)" }}>Etiqueta (nombre visible)</span>
                <input value={form.label} onChange={(e) => setForm((f) => ({ ...f, label: e.target.value }))} style={inp} /></label>
              {formErr && (
                <div role="alert" style={{ padding: "8px 12px", background: "var(--state-danger-bg, #fef2f2)", border: "1px solid var(--danger)", borderRadius: 8, fontSize: 12, color: "var(--danger)" }}>{formErr}</div>
              )}
            </div>
            <div style={{ display: "flex", gap: 10, marginTop: 24, justifyContent: "flex-end" }}>
              <Button variant="secondary" onClick={() => { setShowForm(false); setEditingSetting(null); setFormErr(null); }}>Cancelar</Button>
              <Button variant="primary" onClick={() => void save()} disabled={saving || !form.key || !form.value}>{saving ? "Guardando…" : "Guardar"}</Button>
            </div>
          </div>
        </div>
      )}
      <ConfirmDialog state={confirmState} onClose={() => setConfirmState(null)} />
    </>
  );
}
