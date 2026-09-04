"use client";

import { useCallback, useEffect, useState } from "react";
import PageHeader from "@/components/ui/PageHeader";
import Section from "@/components/ui/Section";
import Button from "@/components/ui/Button";
import { Tag } from "@/components/ui/DataTable";
import EmptyState from "@/components/ui/EmptyState";
import { useUser } from "@/components/UserContext";
import { buildApiUrl } from "@/lib/api-base";
import KpiCard from "@/components/ui/KpiCard";

interface Profile {
  telefono?: string | null;
  fechaNacimiento?: string | null;
  direccion?: string | null;
  colonia?: string | null;
  ciudad?: string | null;
  estado?: string | null;
  codigoPostal?: string | null;
  pais?: string | null;
  curp?: string | null;
  rfc?: string | null;
  ineNumero?: string | null;
  nss?: string | null;
  contactoEmergenciaNombre?: string | null;
  contactoEmergenciaTelefono?: string | null;
  estatus?: string;
}

interface ProfileResponse {
  id: number;
  nombre: string;
  email: string;
  employeeNumber?: string | null;
  perfil?: Profile | null;
  role?: { nombre: string };
  department?: { nombre: string };
}

type MyIdentity = {
  status: "linked" | "erp_only" | "acs_only" | "unlinked";
  user: {
    employeeNumber?: string | null;
    companyEmployeeNumber?: string | null;
  };
  acsPerson: {
    personId: string;
    personName: string;
    personCode?: string | null;
  } | null;
  howToLink?: string;
};

type HybridSelf = {
  date: string;
  items: Array<{
    linkStatus: string;
    flags: string[];
    erp: { checkIn?: string | null; checkOut?: string | null; totalMinutes?: number | null } | null;
    acs: {
      personId: string;
      firstAt?: string;
      lastAt?: string;
      passes?: number;
      firstDoor?: string | null;
    } | null;
  }>;
};

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

const emptyForm: Profile = {
  telefono: "", fechaNacimiento: "", direccion: "", colonia: "", ciudad: "", estado: "", codigoPostal: "", pais: "México",
  curp: "", rfc: "", ineNumero: "", nss: "", contactoEmergenciaNombre: "", contactoEmergenciaTelefono: "",
};

export default function MyProfilePage() {
  const { user } = useUser();
  const token = user?.token ?? "";

  const [profile, setProfile] = useState<ProfileResponse | null>(null);
  const [form, setForm] = useState<Profile>({ ...emptyForm });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveErr, setSaveErr] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [identity, setIdentity] = useState<MyIdentity | null>(null);
  const [hybrid, setHybrid] = useState<HybridSelf | null>(null);

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true); setError(null);
    try {
      const today = new Date().toLocaleDateString("sv-SE");
      const [data, idn, hyb] = await Promise.all([
        apiFetch("users/profile/me", token),
        apiFetch("integra/identity/me", token).catch(() => null),
        apiFetch(`attendance/hybrid?date=${today}`, token).catch(() => null),
      ]);
      setProfile(data);
      setIdentity(idn);
      setHybrid(hyb);
      if (data?.perfil) {
        setForm({
          ...emptyForm,
          ...data.perfil,
          fechaNacimiento: data.perfil.fechaNacimiento ? String(data.perfil.fechaNacimiento).slice(0, 10) : "",
        });
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error al cargar tu perfil");
    } finally { setLoading(false); }
  }, [token]);

  useEffect(() => { void load(); }, [load]);

  const save = async () => {
    if (!token) return;
    setSaving(true); setSaved(false);
    try {
      await apiFetch("users/profile/me", token, { method: "PATCH", body: JSON.stringify(form) });
      setSaved(true);
      void load();
    } catch (e) {
      setSaveErr(e instanceof Error ? e.message : "No se pudo guardar el perfil");
    } finally { setSaving(false); }
  };

  const inp: React.CSSProperties = { width: "100%", padding: "8px 12px", borderRadius: 8, border: "1px solid var(--border)", background: "var(--surface-2)", color: "var(--foreground)", fontSize: 13 };
  const lbl: React.CSSProperties = { fontSize: 11.5, fontWeight: 600, color: "var(--text-secondary)" };

  return (
    <>
      <PageHeader
        eyebrow="ERP · Mi cuenta"
        title="Mi perfil"
        subtitle="Tus datos personales, contacto de emergencia y documentos de identidad."
        meta={profile && (
          <>
            <Tag variant="accent" dot>{profile.role?.nombre ?? "—"}</Tag>
            <Tag variant="default">{profile.department?.nombre ?? "—"}</Tag>
          </>
        )}
      />

      {loading && <EmptyState icon="⏳" title="Cargando perfil…" description="Consultando tus datos." />}
      {!loading && error && <EmptyState icon="⚠️" title="No se pudo cargar" description={error} action={<Button size="sm" variant="secondary" onClick={() => void load()}>Reintentar</Button>} />}

      {!loading && !error && profile && (() => {
        const filled = [form.telefono, form.curp, form.rfc, form.nss, form.fechaNacimiento, form.ciudad, form.estado].filter(Boolean).length;
        const completeness = Math.round((filled / 7) * 100);
        return (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(130px, 1fr))", gap: 12, marginBottom: 18 }}>
            <KpiCard label="Departamento" value={profile.department?.nombre ?? "—"} icon="🏢" />
            <KpiCard label="Rol" value={profile.role?.nombre ?? "—"} icon="🎭" variant="accent" />
            <KpiCard label="Perfil completo" value={`${completeness}%`} icon="📋" variant={completeness >= 80 ? "positive" : completeness >= 50 ? "warning" : "danger"} hint="Campos personales" />
            <KpiCard label="Email" value={profile.email} icon="✉️" />
          </div>
        );
      })()}

      {!loading && !error && profile && (() => {
        const sections = [
          { label: "Datos personales", fields: [form.telefono, form.fechaNacimiento, form.ciudad, form.estado] },
          { label: "Documentos", fields: [form.curp, form.rfc, form.nss] },
          { label: "Emergencia", fields: [form.contactoEmergenciaNombre, form.contactoEmergenciaTelefono] },
        ];
        return (
          <div style={{ marginBottom: 18, padding: "12px 16px", background: "var(--surface-2)", border: "1px solid var(--border)", borderRadius: 10 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: "var(--text-tertiary)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 10 }}>Completitud del perfil</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
              {sections.map((sec) => {
                const filled = sec.fields.filter(Boolean).length;
                const pct = Math.round((filled / sec.fields.length) * 100);
                const color = pct === 100 ? "var(--success)" : pct >= 50 ? "var(--warning)" : "var(--danger)";
                return (
                  <div key={sec.label} style={{ display: "grid", gridTemplateColumns: "120px 1fr 48px", gap: 10, alignItems: "center" }}>
                    <span style={{ fontSize: 12, color: "var(--text-secondary)", fontWeight: 500 }}>{sec.label}</span>
                    <div style={{ height: 6, borderRadius: 3, background: "var(--surface)", overflow: "hidden" }}>
                      <div style={{ height: "100%", width: `${pct}%`, background: color, borderRadius: 3 }} />
                    </div>
                    <span style={{ fontSize: 11.5, color: "var(--text-tertiary)", textAlign: "right" }}>{filled}/{sec.fields.length}</span>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })()}

      {!loading && !error && profile && (
        <>
          <Section title="Datos de cuenta">
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
              <div><span style={lbl}>Nombre</span><div style={{ fontSize: 14, fontWeight: 600 }}>{profile.nombre}</div></div>
              <div><span style={lbl}>Email</span><div style={{ fontSize: 14, fontWeight: 600 }}>{profile.email}</div></div>
              <div>
                <span style={lbl}>Nº empleado (ACS)</span>
                <div style={{ fontSize: 14, fontWeight: 600, fontFamily: "ui-monospace, monospace" }}>
                  {identity?.user.employeeNumber ||
                    identity?.user.companyEmployeeNumber ||
                    profile.employeeNumber ||
                    "—"}
                </div>
              </div>
              <div>
                <span style={lbl}>Estado Integra</span>
                <div style={{ fontSize: 14, fontWeight: 600 }}>
                  {identity?.status === "linked"
                    ? `Vinculado · ${identity.acsPerson?.personName || identity.acsPerson?.personId}`
                    : identity?.status === "erp_only"
                      ? "Código ERP sin persona ACS"
                      : identity?.status === "unlinked"
                        ? "Sin número de empleado"
                        : "—"}
                </div>
              </div>
            </div>
          </Section>

          <Section
            title="Acceso y asistencia (hoy)"
            subtitle="Misma identidad que el terminal ACS. El checador ERP sigue siendo la fuente de nómina."
          >
            {(() => {
              const row = hybrid?.items?.[0];
              const erp = row?.erp;
              const acs = row?.acs;
              return (
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
                  <div>
                    <span style={lbl}>Checador ERP</span>
                    <div style={{ fontSize: 13 }}>
                      {erp?.checkIn
                        ? `Entrada ${new Date(erp.checkIn).toLocaleTimeString("es-MX", { hour: "2-digit", minute: "2-digit" })}`
                        : "Sin entrada"}
                      {erp?.checkOut
                        ? ` · Salida ${new Date(erp.checkOut).toLocaleTimeString("es-MX", { hour: "2-digit", minute: "2-digit" })}`
                        : ""}
                    </div>
                  </div>
                  <div>
                    <span style={lbl}>Puertas ACS</span>
                    <div style={{ fontSize: 13 }}>
                      {acs?.firstAt
                        ? `${acs.passes ?? 0} pases · ${acs.firstDoor || "puerta"} · desde ${new Date(acs.firstAt).toLocaleTimeString("es-MX", { hour: "2-digit", minute: "2-digit" })}`
                        : identity?.status === "linked"
                          ? "Sin pases hoy"
                          : "Sin vínculo ACS"}
                    </div>
                  </div>
                </div>
              );
            })()}
            {identity?.status !== "linked" && (
              <p style={{ marginTop: 10, fontSize: 12.5, color: "var(--text-secondary)" }}>
                {identity?.howToLink ||
                  "Pide a RH que vincule tu nº de empleado con el employeeNo del terminal en Integra → Personas."}
              </p>
            )}
          </Section>

          <Section title="Datos personales" subtitle="Solo tú y RH/Dirección pueden ver esta información.">
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
              <label style={{ display: "grid", gap: 4 }}><span style={lbl}>Teléfono</span>
                <input value={form.telefono ?? ""} onChange={(e) => setForm((f) => ({ ...f, telefono: e.target.value }))} style={inp} /></label>
              <label style={{ display: "grid", gap: 4 }}><span style={lbl}>Fecha de nacimiento</span>
                <input type="date" value={form.fechaNacimiento ?? ""} onChange={(e) => setForm((f) => ({ ...f, fechaNacimiento: e.target.value }))} style={inp} /></label>
              <label style={{ display: "grid", gap: 4, gridColumn: "1 / -1" }}><span style={lbl}>Dirección</span>
                <input value={form.direccion ?? ""} onChange={(e) => setForm((f) => ({ ...f, direccion: e.target.value }))} style={inp} /></label>
              <label style={{ display: "grid", gap: 4 }}><span style={lbl}>Colonia</span>
                <input value={form.colonia ?? ""} onChange={(e) => setForm((f) => ({ ...f, colonia: e.target.value }))} style={inp} /></label>
              <label style={{ display: "grid", gap: 4 }}><span style={lbl}>Ciudad</span>
                <input value={form.ciudad ?? ""} onChange={(e) => setForm((f) => ({ ...f, ciudad: e.target.value }))} style={inp} /></label>
              <label style={{ display: "grid", gap: 4 }}><span style={lbl}>Estado</span>
                <input value={form.estado ?? ""} onChange={(e) => setForm((f) => ({ ...f, estado: e.target.value }))} style={inp} /></label>
              <label style={{ display: "grid", gap: 4 }}><span style={lbl}>Código postal</span>
                <input value={form.codigoPostal ?? ""} onChange={(e) => setForm((f) => ({ ...f, codigoPostal: e.target.value }))} style={inp} /></label>
              <label style={{ display: "grid", gap: 4 }}><span style={lbl}>CURP</span>
                <input value={form.curp ?? ""} onChange={(e) => setForm((f) => ({ ...f, curp: e.target.value.toUpperCase() }))} style={inp} /></label>
              <label style={{ display: "grid", gap: 4 }}><span style={lbl}>RFC</span>
                <input value={form.rfc ?? ""} onChange={(e) => setForm((f) => ({ ...f, rfc: e.target.value.toUpperCase() }))} style={inp} /></label>
              <label style={{ display: "grid", gap: 4 }}><span style={lbl}>Número de INE</span>
                <input value={form.ineNumero ?? ""} onChange={(e) => setForm((f) => ({ ...f, ineNumero: e.target.value }))} style={inp} /></label>
              <label style={{ display: "grid", gap: 4 }}><span style={lbl}>NSS (IMSS)</span>
                <input value={form.nss ?? ""} onChange={(e) => setForm((f) => ({ ...f, nss: e.target.value }))} style={inp} /></label>
            </div>
          </Section>

          <Section title="Contacto de emergencia">
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
              <label style={{ display: "grid", gap: 4 }}><span style={lbl}>Nombre</span>
                <input value={form.contactoEmergenciaNombre ?? ""} onChange={(e) => setForm((f) => ({ ...f, contactoEmergenciaNombre: e.target.value }))} style={inp} /></label>
              <label style={{ display: "grid", gap: 4 }}><span style={lbl}>Teléfono</span>
                <input value={form.contactoEmergenciaTelefono ?? ""} onChange={(e) => setForm((f) => ({ ...f, contactoEmergenciaTelefono: e.target.value }))} style={inp} /></label>
            </div>
          </Section>

          <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
            <Button variant="primary" onClick={() => void save()} disabled={saving}>{saving ? "Guardando…" : "Guardar cambios"}</Button>
            {saved && <span style={{ fontSize: 12.5, color: "var(--success)" }}>✓ Guardado — pendiente de revisión por RH</span>}
          </div>
        </>
      )}
    </>
  );
}
