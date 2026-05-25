"use client";

import { useCallback, useEffect, useState } from "react";
import { useUser } from "@/components/UserContext";
import { buildApiUrl } from "@/lib/api-base";

type CompanyProfile = {
  id?: number;
  legalName?: string;
  tradeName?: string;
  rfc?: string;
  fiscalRegime?: string;
  fiscalAddress?: string;
  fiscalPostalCode?: string;
  contactEmail?: string;
  contactPhone?: string;
  supportEmail?: string;
  websiteUrl?: string;
  logoUrl?: string;
  logoDarkUrl?: string;
  faviconUrl?: string;
  brandPrimary?: string;
  brandSecondary?: string;
  defaultBankName?: string;
  defaultClabe?: string;
  notificationEmail?: string;
};

export default function SettingsPage() {
  const { user } = useUser();
  const [profile, setProfile] = useState<CompanyProfile>({});
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState<string | null>(null);
  const [section, setSection] = useState<"fiscal" | "contact" | "brand" | "bank" | "system">("fiscal");

  const refresh = useCallback(async () => {
    if (!user?.token) return;
    setLoading(true);
    try {
      const res = await fetch(buildApiUrl("company"), { headers: { Authorization: `Bearer ${user.token}` } });
      if (res.ok) setProfile(await res.json());
    } finally {
      setLoading(false);
    }
  }, [user?.token]);

  useEffect(() => { refresh(); }, [refresh]);

  const save = async () => {
    try {
      const res = await fetch(buildApiUrl("company"), {
        method: "PATCH",
        headers: { Authorization: `Bearer ${user?.token}`, "Content-Type": "application/json" },
        body: JSON.stringify(profile),
      });
      if (!res.ok) throw new Error(await res.text());
      setMsg("Configuración guardada");
      await refresh();
    } catch (err) {
      setMsg((err as Error).message);
    }
  };

  return (
    <div style={{ padding: 24, maxWidth: 1100, margin: "0 auto" }}>
      <h1 style={{ margin: 0 }}>⚙️ Configuración de empresa</h1>
      <p style={{ color: "var(--text-secondary)", margin: 0 }}>
        Datos fiscales, contacto, branding y configuración financiera.
      </p>

      {msg && <div style={{ padding: 10, background: "#dcfce7", color: "#166534", borderRadius: 8, marginTop: 12 }}>{msg}</div>}

      <div style={{ display: "flex", gap: 8, marginTop: 16, flexWrap: "wrap" }}>
        {[
          { id: "fiscal", label: "🧾 Datos fiscales" },
          { id: "contact", label: "📧 Contacto" },
          { id: "brand", label: "🎨 Branding" },
          { id: "bank", label: "🏦 Cuenta bancaria" },
          { id: "system", label: "🔔 Sistema" },
        ].map((s) => (
          <button
            key={s.id}
            type="button"
            onClick={() => setSection(s.id as any)}
            style={{
              padding: "8px 14px",
              borderRadius: 8,
              border: section === s.id ? "2px solid var(--primary)" : "1px solid var(--border)",
              background: section === s.id ? `${"var(--primary)"}22` : "var(--bg-primary)",
              cursor: "pointer",
              fontWeight: 600,
            }}
          >
            {s.label}
          </button>
        ))}
      </div>

      {loading ? <p>Cargando…</p> : (
        <div style={{ marginTop: 16, padding: 16, background: "var(--bg-primary)", border: "1px solid var(--border)", borderRadius: 12 }}>
          {section === "fiscal" && (
            <Grid>
              <Field label="Razón social"><input style={inputStyle} value={profile.legalName || ""} onChange={(e) => setProfile({ ...profile, legalName: e.target.value })} /></Field>
              <Field label="Nombre comercial"><input style={inputStyle} value={profile.tradeName || ""} onChange={(e) => setProfile({ ...profile, tradeName: e.target.value })} /></Field>
              <Field label="RFC"><input style={inputStyle} value={profile.rfc || ""} onChange={(e) => setProfile({ ...profile, rfc: e.target.value.toUpperCase() })} /></Field>
              <Field label="Régimen fiscal (clave SAT)"><input style={inputStyle} value={profile.fiscalRegime || ""} onChange={(e) => setProfile({ ...profile, fiscalRegime: e.target.value })} /></Field>
              <Field label="Domicilio fiscal" full><textarea style={{ ...inputStyle, minHeight: 60 }} value={profile.fiscalAddress || ""} onChange={(e) => setProfile({ ...profile, fiscalAddress: e.target.value })} /></Field>
              <Field label="Código postal fiscal"><input style={inputStyle} value={profile.fiscalPostalCode || ""} onChange={(e) => setProfile({ ...profile, fiscalPostalCode: e.target.value })} /></Field>
            </Grid>
          )}

          {section === "contact" && (
            <Grid>
              <Field label="Email comercial"><input type="email" style={inputStyle} value={profile.contactEmail || ""} onChange={(e) => setProfile({ ...profile, contactEmail: e.target.value })} /></Field>
              <Field label="Email de soporte"><input type="email" style={inputStyle} value={profile.supportEmail || ""} onChange={(e) => setProfile({ ...profile, supportEmail: e.target.value })} /></Field>
              <Field label="Teléfono"><input style={inputStyle} value={profile.contactPhone || ""} onChange={(e) => setProfile({ ...profile, contactPhone: e.target.value })} /></Field>
              <Field label="Sitio web"><input style={inputStyle} value={profile.websiteUrl || ""} onChange={(e) => setProfile({ ...profile, websiteUrl: e.target.value })} /></Field>
            </Grid>
          )}

          {section === "brand" && (
            <Grid>
              <Field label="Logo URL"><input style={inputStyle} value={profile.logoUrl || ""} onChange={(e) => setProfile({ ...profile, logoUrl: e.target.value })} /></Field>
              <Field label="Logo (modo oscuro) URL"><input style={inputStyle} value={profile.logoDarkUrl || ""} onChange={(e) => setProfile({ ...profile, logoDarkUrl: e.target.value })} /></Field>
              <Field label="Favicon URL"><input style={inputStyle} value={profile.faviconUrl || ""} onChange={(e) => setProfile({ ...profile, faviconUrl: e.target.value })} /></Field>
              <Field label="Color primario (HEX)">
                <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                  <input type="color" style={{ width: 50, height: 36, border: "1px solid var(--border)" }} value={profile.brandPrimary || "#0ea5e9"} onChange={(e) => setProfile({ ...profile, brandPrimary: e.target.value })} />
                  <input style={{ ...inputStyle, flex: 1 }} value={profile.brandPrimary || ""} onChange={(e) => setProfile({ ...profile, brandPrimary: e.target.value })} />
                </div>
              </Field>
              <Field label="Color secundario (HEX)">
                <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                  <input type="color" style={{ width: 50, height: 36, border: "1px solid var(--border)" }} value={profile.brandSecondary || "#16a34a"} onChange={(e) => setProfile({ ...profile, brandSecondary: e.target.value })} />
                  <input style={{ ...inputStyle, flex: 1 }} value={profile.brandSecondary || ""} onChange={(e) => setProfile({ ...profile, brandSecondary: e.target.value })} />
                </div>
              </Field>
              <div style={{ gridColumn: "1 / -1", padding: 14, background: "var(--bg-secondary)", borderRadius: 8 }}>
                <strong>Vista previa:</strong>
                <div style={{ display: "flex", gap: 10, marginTop: 8, alignItems: "center" }}>
                  {profile.logoUrl && <img src={profile.logoUrl} alt="logo" style={{ height: 40 }} />}
                  <button type="button" style={{ padding: "8px 14px", background: profile.brandPrimary || "#0ea5e9", color: "#fff", border: "none", borderRadius: 6 }}>Botón primario</button>
                  <button type="button" style={{ padding: "8px 14px", background: profile.brandSecondary || "#16a34a", color: "#fff", border: "none", borderRadius: 6 }}>Botón secundario</button>
                </div>
              </div>
            </Grid>
          )}

          {section === "bank" && (
            <Grid>
              <Field label="Banco por defecto"><input style={inputStyle} value={profile.defaultBankName || ""} onChange={(e) => setProfile({ ...profile, defaultBankName: e.target.value })} /></Field>
              <Field label="CLABE"><input style={inputStyle} value={profile.defaultClabe || ""} onChange={(e) => setProfile({ ...profile, defaultClabe: e.target.value })} /></Field>
            </Grid>
          )}

          {section === "system" && (
            <Grid>
              <Field label="Email para notificaciones administrativas"><input type="email" style={inputStyle} value={profile.notificationEmail || ""} onChange={(e) => setProfile({ ...profile, notificationEmail: e.target.value })} /></Field>
            </Grid>
          )}

          <button type="button" className="button-primary" onClick={save} style={{ marginTop: 16 }}>💾 Guardar configuración</button>
        </div>
      )}
    </div>
  );
}

function Grid({ children }: { children: React.ReactNode }) {
  return <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 12 }}>{children}</div>;
}
function Field({ label, children, full }: { label: string; children: React.ReactNode; full?: boolean }) {
  return <label style={{ display: "block", fontSize: 12, color: "var(--text-secondary)", gridColumn: full ? "1 / -1" : undefined }}>{label}{children}</label>;
}
const inputStyle: React.CSSProperties = { display: "block", width: "100%", padding: 8, borderRadius: 6, border: "1px solid var(--border)", background: "var(--bg-primary)", color: "var(--text-primary)", marginTop: 4 };
