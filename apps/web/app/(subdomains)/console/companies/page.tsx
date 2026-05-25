"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useUser } from "@/components/UserContext";
import { buildApiUrl } from "@/lib/api-base";
import { getActiveCompanyId, setActiveCompanyId } from "@/lib/tenant";

type Company = {
  id: number;
  slug?: string | null;
  legalName: string;
  tradeName?: string | null;
  rfc: string;
  logoUrl?: string | null;
  brandPrimary?: string | null;
  isPrimary: boolean;
  isActive: boolean;
  createdAt: string;
};

export default function CompaniesPage() {
  const { user } = useUser();
  const [companies, setCompanies] = useState<Company[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [activeId, setActiveId] = useState<number | null>(getActiveCompanyId());
  const [form, setForm] = useState({ legalName: "", tradeName: "", rfc: "", slug: "", brandPrimary: "#0ea5e9" });
  const [msg, setMsg] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!user?.token) return;
    setLoading(true);
    try {
      const res = await fetch(buildApiUrl("company/list"), { headers: { Authorization: `Bearer ${user.token}` } });
      if (res.ok) setCompanies(await res.json());
    } finally {
      setLoading(false);
    }
  }, [user?.token]);

  useEffect(() => { refresh(); }, [refresh]);

  const createCompany = async () => {
    if (!form.legalName || !form.rfc) {
      setMsg("Razón social y RFC son obligatorios");
      return;
    }
    const res = await fetch(buildApiUrl("company"), {
      method: "POST",
      headers: { Authorization: `Bearer ${user?.token}`, "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    if (res.ok) {
      setMsg("✅ Empresa creada");
      setShowForm(false);
      setForm({ legalName: "", tradeName: "", rfc: "", slug: "", brandPrimary: "#0ea5e9" });
      refresh();
    } else {
      setMsg(`Error: ${await res.text()}`);
    }
  };

  const setPrimary = async (id: number) => {
    await fetch(buildApiUrl(`company/${id}/primary`), { method: "PATCH", headers: { Authorization: `Bearer ${user?.token}` } });
    refresh();
  };

  const setActive = async (id: number, isActive: boolean) => {
    await fetch(buildApiUrl(`company/${id}/active`), {
      method: "PATCH",
      headers: { Authorization: `Bearer ${user?.token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ isActive }),
    });
    refresh();
  };

  const switchTo = (id: number | null) => {
    setActiveCompanyId(id);
    setActiveId(id);
    setMsg(id != null ? `✅ Empresa activa cambiada` : "✅ Volviendo a empresa primaria");
  };

  return (
    <div style={{ padding: 24, maxWidth: 1200, margin: "0 auto" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 12 }}>
        <div>
          <h1 style={{ margin: 0 }}>🏢 Gestión de empresas (Multi-tenant)</h1>
          <p style={{ color: "var(--text-secondary)", margin: 0 }}>Administra múltiples razones sociales / empresas dentro del mismo ERP.</p>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <Link href="/settings" style={{ padding: "8px 14px", background: "var(--bg-secondary)", color: "var(--text-primary)", borderRadius: 8, textDecoration: "none", fontWeight: 600, fontSize: 12 }}>
            ⚙️ Editar perfil
          </Link>
          <button type="button" onClick={() => setShowForm(!showForm)} style={{ padding: "8px 16px", background: "#0ea5e9", color: "#fff", border: "none", borderRadius: 8, fontWeight: 700, cursor: "pointer" }}>
            {showForm ? "✕ Cancelar" : "➕ Nueva empresa"}
          </button>
        </div>
      </div>

      {msg && <div style={{ marginTop: 12, padding: 10, background: msg.startsWith("✅") ? "#dcfce7" : "#fee2e2", color: msg.startsWith("✅") ? "#166534" : "#7f1d1d", borderRadius: 8 }}>{msg}</div>}

      {showForm && (
        <div style={{ marginTop: 12, padding: 16, background: "var(--bg-primary)", border: "1px solid var(--border)", borderRadius: 10 }}>
          <h3 style={{ marginTop: 0 }}>Nueva empresa</h3>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 8 }}>
            <Field label="Razón social *"><input style={inputStyle} value={form.legalName} onChange={(e) => setForm({ ...form, legalName: e.target.value })} /></Field>
            <Field label="Nombre comercial"><input style={inputStyle} value={form.tradeName} onChange={(e) => setForm({ ...form, tradeName: e.target.value })} /></Field>
            <Field label="RFC *"><input style={inputStyle} value={form.rfc} onChange={(e) => setForm({ ...form, rfc: e.target.value.toUpperCase() })} /></Field>
            <Field label="Slug (URL-friendly)"><input style={inputStyle} value={form.slug} onChange={(e) => setForm({ ...form, slug: e.target.value.toLowerCase() })} /></Field>
            <Field label="Color de marca"><input type="color" value={form.brandPrimary} onChange={(e) => setForm({ ...form, brandPrimary: e.target.value })} style={{ ...inputStyle, height: 38 }} /></Field>
          </div>
          <button type="button" onClick={createCompany} style={{ marginTop: 12, padding: "10px 18px", background: "#0ea5e9", color: "#fff", border: "none", borderRadius: 8, fontWeight: 700, cursor: "pointer" }}>
            Crear empresa
          </button>
        </div>
      )}

      <div style={{ marginTop: 16, padding: 12, background: "#dbeafe", borderRadius: 10, fontSize: 12, color: "#1e3a8a" }}>
        💡 <strong>Empresa activa actual:</strong>{" "}
        {activeId != null
          ? companies.find((c) => c.id === activeId)?.tradeName || `ID #${activeId}`
          : "(usando primaria por defecto)"}
        {activeId != null && (
          <button type="button" onClick={() => switchTo(null)} style={{ marginLeft: 8, background: "transparent", border: "none", color: "#1e3a8a", textDecoration: "underline", cursor: "pointer" }}>
            Volver a primaria
          </button>
        )}
      </div>

      {loading ? <p>Cargando…</p> : (
        <div style={{ marginTop: 12, display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: 12 }}>
          {companies.map((c) => {
            const isActiveCompany = activeId === c.id || (activeId == null && c.isPrimary);
            return (
              <div
                key={c.id}
                style={{
                  padding: 16,
                  background: "var(--bg-primary)",
                  border: isActiveCompany ? `3px solid ${c.brandPrimary || "#0ea5e9"}` : "1px solid var(--border)",
                  borderRadius: 10,
                  opacity: c.isActive ? 1 : 0.5,
                }}
              >
                <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
                  {c.logoUrl ? (
                    <img src={c.logoUrl} alt="" style={{ width: 40, height: 40, objectFit: "contain" }} />
                  ) : (
                    <div style={{ width: 40, height: 40, borderRadius: 8, background: c.brandPrimary || "#0ea5e9", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700 }}>
                      {(c.tradeName || c.legalName).charAt(0)}
                    </div>
                  )}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <strong style={{ fontSize: 14, display: "block", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{c.tradeName || c.legalName}</strong>
                    <div style={{ fontSize: 11, color: "var(--text-secondary)" }}>{c.rfc}</div>
                  </div>
                  {c.isPrimary && <span style={{ fontSize: 10, background: "#fef3c7", color: "#92400e", padding: "2px 6px", borderRadius: 999, fontWeight: 700 }}>PRIMARIA</span>}
                </div>

                <div style={{ marginTop: 12, display: "flex", flexDirection: "column", gap: 4, fontSize: 11, color: "var(--text-secondary)" }}>
                  <span>📛 {c.legalName}</span>
                  {c.slug && <span>🔗 /{c.slug}</span>}
                  <span>📅 {new Date(c.createdAt).toLocaleDateString("es-MX")}</span>
                </div>

                <div style={{ marginTop: 12, display: "flex", gap: 6, flexWrap: "wrap" }}>
                  {!isActiveCompany && (
                    <button type="button" onClick={() => switchTo(c.id)} style={{ flex: 1, padding: "6px 8px", background: c.brandPrimary || "#0ea5e9", color: "#fff", border: "none", borderRadius: 6, cursor: "pointer", fontSize: 11, fontWeight: 700 }}>
                      ➡ Activar
                    </button>
                  )}
                  {isActiveCompany && <span style={{ flex: 1, padding: "6px 8px", background: "#16a34a", color: "#fff", textAlign: "center", borderRadius: 6, fontSize: 11, fontWeight: 700 }}>● ACTIVA</span>}
                  {!c.isPrimary && (
                    <button type="button" onClick={() => setPrimary(c.id)} style={{ padding: "6px 8px", background: "transparent", border: "1px solid #f59e0b", color: "#f59e0b", borderRadius: 6, cursor: "pointer", fontSize: 11 }}>
                      ⭐
                    </button>
                  )}
                  <button type="button" onClick={() => setActive(c.id, !c.isActive)} style={{ padding: "6px 8px", background: "transparent", border: `1px solid ${c.isActive ? "#dc2626" : "#16a34a"}`, color: c.isActive ? "#dc2626" : "#16a34a", borderRadius: 6, cursor: "pointer", fontSize: 11 }}>
                    {c.isActive ? "⏸" : "▶"}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label style={{ display: "block", fontSize: 11, color: "var(--text-secondary)" }}>{label}{children}</label>;
}
const inputStyle: React.CSSProperties = { display: "block", width: "100%", padding: 8, borderRadius: 6, border: "1px solid var(--border)", background: "var(--bg-primary)", color: "var(--text-primary)", marginTop: 4 };
