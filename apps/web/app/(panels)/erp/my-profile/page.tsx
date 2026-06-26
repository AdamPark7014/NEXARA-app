"use client";

import { useCallback, useEffect, useState } from "react";
import PageHeader from "@/components/ui/PageHeader";
import Section from "@/components/ui/Section";
import Button from "@/components/ui/Button";
import { Tag } from "@/components/ui/DataTable";
import EmptyState from "@/components/ui/EmptyState";
import { useUser } from "@/components/UserContext";
import { buildApiUrl } from "@/lib/api-base";

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
  perfil?: Profile | null;
  role?: { nombre: string };
  department?: { nombre: string };
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
  const [saved, setSaved] = useState(false);

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true); setError(null);
    try {
      const data = await apiFetch("users/profile/me", token);
      setProfile(data);
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
      alert(`Error: ${e instanceof Error ? e.message : "desconocido"}`);
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

      {!loading && !error && profile && (
        <>
          <Section title="Datos de cuenta">
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
              <div><span style={lbl}>Nombre</span><div style={{ fontSize: 14, fontWeight: 600 }}>{profile.nombre}</div></div>
              <div><span style={lbl}>Email</span><div style={{ fontSize: 14, fontWeight: 600 }}>{profile.email}</div></div>
            </div>
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
