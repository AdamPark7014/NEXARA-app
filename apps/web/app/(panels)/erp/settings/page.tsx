"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import PageHeader from "@/components/ui/PageHeader";
import Section from "@/components/ui/Section";
import Button from "@/components/ui/Button";
import { Tag } from "@/components/ui/DataTable";
import EmptyState from "@/components/ui/EmptyState";
import { useUser } from "@/components/UserContext";
import { useRbacGuard } from "@/lib/useRbacGuard";
import { buildApiUrl } from "@/lib/api-base";

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
  const { isCeo } = useRbacGuard();
  const token = user?.token ?? "";

  const [settings, setSettings] = useState<SettingRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ ...emptyForm });
  const [saving, setSaving] = useState(false);

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
    const map = new Map<string, SettingRow[]>();
    for (const s of settings) {
      if (!map.has(s.category)) map.set(s.category, []);
      map.get(s.category)!.push(s);
    }
    return Array.from(map.entries());
  }, [settings]);

  const save = async () => {
    if (!token || !form.key || !form.value) return;
    setSaving(true);
    try {
      await apiFetch("settings", token, { method: "PUT", body: JSON.stringify(form) });
      setShowForm(false); setForm({ ...emptyForm });
      void load();
    } catch (e) {
      alert(`Error: ${e instanceof Error ? e.message : "desconocido"}`);
    } finally { setSaving(false); }
  };

  const editValue = async (s: SettingRow) => {
    const next = prompt(`Nuevo valor para "${s.label ?? s.key}":`, s.value);
    if (next === null || next === s.value || !token) return;
    try {
      await apiFetch("settings", token, { method: "PUT", body: JSON.stringify({ key: s.key, value: next, category: s.category, label: s.label }) });
      void load();
    } catch (e) { alert(`Error: ${e instanceof Error ? e.message : "desconocido"}`); }
  };

  const remove = async (s: SettingRow) => {
    if (!token || !confirm(`¿Eliminar la configuración "${s.key}"?`)) return;
    try {
      await apiFetch(`settings/${s.key}`, token, { method: "DELETE" });
      setSettings((prev) => prev.filter((x) => x.key !== s.key));
    } catch (e) { alert(`Error: ${e instanceof Error ? e.message : "desconocido"}`); }
  };

  const inp: React.CSSProperties = { width: "100%", padding: "8px 12px", borderRadius: 8, border: "1px solid var(--border)", background: "var(--surface-2)", color: "var(--foreground)", fontSize: 13 };

  return (
    <>
      <PageHeader
        eyebrow="ERP · Gobierno"
        title="Datos de la empresa"
        subtitle="Configuración general del sistema: branding, integraciones, certificados y parámetros globales."
        actions={
          <>
            <Button variant="ghost" iconLeft="🔄" onClick={() => void load()}>Actualizar</Button>
            {isCeo && <Button variant="primary" iconLeft="+" onClick={() => setShowForm(true)}>Nueva configuración</Button>}
          </>
        }
      />

      {loading && <EmptyState icon="⏳" title="Cargando configuración…" description="Consultando parámetros del sistema." />}
      {!loading && error && <EmptyState icon="⚠️" title="No se pudo cargar" description={error} action={<Button size="sm" variant="secondary" onClick={() => void load()}>Reintentar</Button>} />}
      {!loading && !error && grouped.length === 0 && <EmptyState icon="⚙️" title="Sin configuraciones" description="Agrega el primer parámetro del sistema." />}

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
                {isCeo && <Button size="sm" variant="ghost" onClick={() => void editValue(s)}>✎ Editar</Button>}
                {isCeo && <Button size="sm" variant="danger" onClick={() => void remove(s)}>✕</Button>}
              </div>
            ))}
          </div>
        </Section>
      ))}

      {showForm && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000 }} onClick={() => setShowForm(false)}>
          <div style={{ background: "var(--surface)", borderRadius: 16, padding: 28, width: 460, maxWidth: "calc(100vw - 32px)", boxShadow: "0 24px 56px rgba(0,0,0,0.24)", border: "1px solid var(--border)" }} onClick={(e) => e.stopPropagation()}>
            <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 20 }}>Nueva configuración</div>
            <div style={{ display: "grid", gap: 14 }}>
              <label style={{ display: "grid", gap: 4 }}><span style={{ fontSize: 11.5, fontWeight: 600, color: "var(--text-secondary)" }}>Clave (key)</span>
                <input value={form.key} onChange={(e) => setForm((f) => ({ ...f, key: e.target.value }))} placeholder="brand.primaryColor" style={inp} /></label>
              <label style={{ display: "grid", gap: 4 }}><span style={{ fontSize: 11.5, fontWeight: 600, color: "var(--text-secondary)" }}>Valor</span>
                <input value={form.value} onChange={(e) => setForm((f) => ({ ...f, value: e.target.value }))} style={inp} /></label>
              <label style={{ display: "grid", gap: 4 }}><span style={{ fontSize: 11.5, fontWeight: 600, color: "var(--text-secondary)" }}>Categoría</span>
                <input value={form.category} onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))} placeholder="branding, integraciones, general…" style={inp} /></label>
              <label style={{ display: "grid", gap: 4 }}><span style={{ fontSize: 11.5, fontWeight: 600, color: "var(--text-secondary)" }}>Etiqueta (nombre visible)</span>
                <input value={form.label} onChange={(e) => setForm((f) => ({ ...f, label: e.target.value }))} style={inp} /></label>
            </div>
            <div style={{ display: "flex", gap: 10, marginTop: 24, justifyContent: "flex-end" }}>
              <Button variant="secondary" onClick={() => setShowForm(false)}>Cancelar</Button>
              <Button variant="primary" onClick={() => void save()} disabled={saving || !form.key || !form.value}>{saving ? "Guardando…" : "Guardar"}</Button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
