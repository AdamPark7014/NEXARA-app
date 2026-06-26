"use client";

import { useCallback, useEffect, useState } from "react";
import EmptyState from "@/components/ui/EmptyState";
import Button from "@/components/ui/Button";
import { DetailError, DetailSection } from "@/components/detail/DetailFrame";
import { useClientDetail } from "@/components/crm/ClientDetailShell";
import { useUser } from "@/components/UserContext";
import { buildApiUrl } from "@/lib/api-base";

interface Branch {
  id: number;
  name: string;
  branchNumber?: string | null;
  address?: string | null;
  city?: string | null;
  state?: string | null;
  isActive: boolean;
  createdAt: string;
}

const inp: React.CSSProperties = {
  width: "100%", padding: "7px 9px", border: "1px solid var(--border)",
  borderRadius: 7, background: "var(--surface)", color: "var(--foreground)", fontSize: 12.5, boxSizing: "border-box",
};

const emptyForm = { name: "", branchNumber: "", address: "", city: "", state: "" };

async function apiFetch(path: string, token: string, opts?: RequestInit) {
  const res = await fetch(buildApiUrl(path), {
    ...opts,
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", ...(opts?.headers ?? {}) },
  });
  if (!res.ok) throw new Error(await res.text().catch(() => `HTTP ${res.status}`));
  return res.json();
}

export default function ClientBranchesPage() {
  const { client, error: clientError, reload: reloadClient } = useClientDetail();
  const { user } = useUser();
  const token = user?.token ?? "";
  const isAdmin = !!(user as any)?.permissions?.includes?.("CONSOLE_ADMIN");

  const scId = client?.serviceClient?.id;

  const [branches, setBranches] = useState<Branch[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // ── Create form ────────────────────────────────────────────────────────
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ ...emptyForm });
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    if (!token || !scId) return;
    setLoading(true); setError(null);
    try {
      const data = await apiFetch(`service-clients/${scId}/branches`, token);
      setBranches(Array.isArray(data) ? data : []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error al cargar sucursales");
    } finally { setLoading(false); }
  }, [token, scId]);

  useEffect(() => { void load(); }, [load]);

  const save = async () => {
    if (!token || !scId || !form.name.trim()) return;
    setSaving(true);
    try {
      const created: Branch = await apiFetch(`service-clients/${scId}/branches`, token, {
        method: "POST",
        body: JSON.stringify({
          name: form.name.trim(),
          branchNumber: form.branchNumber.trim() || undefined,
          address: form.address.trim() || undefined,
          city: form.city.trim() || undefined,
          state: form.state.trim() || undefined,
        }),
      });
      setBranches((prev) => [created, ...prev]);
      setShowForm(false);
      setForm({ ...emptyForm });
    } catch (e) {
      window.alert("Error: " + (e instanceof Error ? e.message : "No se pudo crear"));
    } finally { setSaving(false); }
  };

  if (clientError) return <DetailError message={clientError} onRetry={reloadClient} />;
  if (!client) return null;

  if (!client.serviceClient) {
    return (
      <EmptyState
        icon="🏢"
        title="Sin cuenta operativa"
        description="Activa el cliente en operaciones desde la pestaña Datos para gestionar sucursales y sitios."
      />
    );
  }

  return (
    <DetailSection title={`Sucursales · ${client.serviceClient.name}`}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
        <span style={{ fontSize: 12.5, color: "var(--text-secondary)" }}>
          {branches.length} sucursal{branches.length !== 1 ? "es" : ""} registrada{branches.length !== 1 ? "s" : ""}
        </span>
        <div style={{ display: "flex", gap: 8 }}>
          <Button variant="ghost" size="sm" onClick={() => void load()}>Actualizar</Button>
          {isAdmin && <Button variant="primary" size="sm" iconLeft="+" onClick={() => setShowForm(true)}>Agregar sucursal</Button>}
        </div>
      </div>

      {showForm && (
        <div style={{ background: "var(--surface-2)", border: "1px solid var(--border)", borderRadius: 10, padding: 16, marginBottom: 16 }}>
          <p style={{ margin: "0 0 12px", fontWeight: 700, fontSize: 13 }}>Nueva sucursal</p>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            <div style={{ gridColumn: "1 / -1" }}>
              <label style={{ fontSize: 11.5, fontWeight: 600, color: "var(--text-secondary)", display: "block", marginBottom: 3 }}>Nombre *</label>
              <input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} placeholder="Ej. Sucursal Centro" style={inp} />
            </div>
            <div>
              <label style={{ fontSize: 11.5, fontWeight: 600, color: "var(--text-secondary)", display: "block", marginBottom: 3 }}>Número de sucursal</label>
              <input value={form.branchNumber} onChange={(e) => setForm((f) => ({ ...f, branchNumber: e.target.value }))} placeholder="Ej. SUC-001" style={inp} />
            </div>
            <div>
              <label style={{ fontSize: 11.5, fontWeight: 600, color: "var(--text-secondary)", display: "block", marginBottom: 3 }}>Ciudad</label>
              <input value={form.city} onChange={(e) => setForm((f) => ({ ...f, city: e.target.value }))} placeholder="Ej. Guadalajara" style={inp} />
            </div>
            <div>
              <label style={{ fontSize: 11.5, fontWeight: 600, color: "var(--text-secondary)", display: "block", marginBottom: 3 }}>Estado</label>
              <input value={form.state} onChange={(e) => setForm((f) => ({ ...f, state: e.target.value }))} placeholder="Ej. Jalisco" style={inp} />
            </div>
            <div>
              <label style={{ fontSize: 11.5, fontWeight: 600, color: "var(--text-secondary)", display: "block", marginBottom: 3 }}>Dirección</label>
              <input value={form.address} onChange={(e) => setForm((f) => ({ ...f, address: e.target.value }))} placeholder="Ej. Av. Vallarta 1234" style={inp} />
            </div>
          </div>
          <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 12 }}>
            <Button variant="ghost" size="sm" onClick={() => { setShowForm(false); setForm({ ...emptyForm }); }}>Cancelar</Button>
            <Button variant="primary" size="sm" onClick={() => void save()} disabled={saving || !form.name.trim()}>
              {saving ? "Guardando…" : "Crear sucursal"}
            </Button>
          </div>
        </div>
      )}

      {loading && <EmptyState icon="⏳" title="Cargando sucursales…" description="" />}
      {!loading && error && <EmptyState icon="⚠️" title="Error al cargar" description={error} action={<Button size="sm" variant="secondary" onClick={() => void load()}>Reintentar</Button>} />}

      {!loading && !error && branches.length === 0 && (
        <EmptyState
          icon="📍"
          title="Sin sucursales"
          description={isAdmin ? "Agrega la primera sucursal con el botón de arriba." : "Este cliente aún no tiene sucursales registradas."}
        />
      )}

      {!loading && !error && branches.length > 0 && (
        <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "grid", gap: 8 }}>
          {branches.map((b) => (
            <li key={b.id} style={{ padding: "12px 14px", border: "1px solid var(--border)", borderRadius: 10, display: "grid", gridTemplateColumns: "1fr auto", gap: 4 }}>
              <div>
                <div style={{ fontWeight: 700, fontSize: 13 }}>
                  {b.name}
                  {b.branchNumber && <span style={{ fontWeight: 400, fontSize: 11.5, color: "var(--text-tertiary)", marginLeft: 8 }}>{b.branchNumber}</span>}
                </div>
                {(b.address || b.city) && (
                  <div style={{ fontSize: 12, color: "var(--text-secondary)", marginTop: 2 }}>
                    {[b.address, b.city, b.state].filter(Boolean).join(", ")}
                  </div>
                )}
              </div>
              <span style={{ fontSize: 11, color: b.isActive ? "var(--positive)" : "var(--text-tertiary)", alignSelf: "flex-start", paddingTop: 2 }}>
                {b.isActive ? "Activa" : "Inactiva"}
              </span>
            </li>
          ))}
        </ul>
      )}
    </DetailSection>
  );
}
