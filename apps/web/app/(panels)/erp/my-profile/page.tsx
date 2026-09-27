"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import PageHeader from "@/components/ui/PageHeader";
import Section from "@/components/ui/Section";
import Button from "@/components/ui/Button";
import { Tag } from "@/components/ui/DataTable";
import EmptyState from "@/components/ui/EmptyState";
import InlineAlert from "@/components/ui/InlineAlert";
import { FormField, FormGrid } from "@/components/ui/FormField";
import { useUser } from "@/components/UserContext";
import { isCeoEquivalentEmail, isNonEmployeeEmail } from "@/lib/platform-accounts";
import { buildApiUrl } from "@/lib/api-base";
import { formatApiError } from "@/lib/erp-api";
import PhoneField from "@/components/PhoneField";
import s from "./profile.module.css";

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

const timeFmt = new Intl.DateTimeFormat("es-MX", { hour: "2-digit", minute: "2-digit" });
const hhmm = (iso?: string | null) => {
  if (!iso) return null;
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : timeFmt.format(d);
};

type TextKey = Exclude<keyof Profile, "estatus" | "telefono" | "contactoEmergenciaTelefono">;

export default function MyProfilePage() {
  const { user } = useUser();
  const token = user?.token ?? "";
  // Dirección y cuentas de sistema: sin expediente de RH, documentos ni checador.
  const cuentaDireccion = isCeoEquivalentEmail(user?.email) || isNonEmployeeEmail(user?.email);

  const [profile, setProfile] = useState<ProfileResponse | null>(null);
  const [form, setForm] = useState<Profile>({ ...emptyForm });
  const [dirty, setDirty] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveErr, setSaveErr] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [identity, setIdentity] = useState<MyIdentity | null>(null);
  const [hybrid, setHybrid] = useState<HybridSelf | null>(null);

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    setError(null);
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
      setDirty(false);
    } catch (e) {
      setError(formatApiError(e, "No pudimos cargar tu perfil."));
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    void load();
  }, [load]);

  const update = <K extends keyof Profile>(key: K, value: Profile[K]) => {
    setForm((f) => ({ ...f, [key]: value }));
    setDirty(true);
    setSaved(false);
  };

  const text = (key: TextKey, transform?: (v: string) => string) => ({
    className: s.input,
    value: form[key] ?? "",
    onChange: (e: React.ChangeEvent<HTMLInputElement>) => update(key, transform ? transform(e.target.value) : e.target.value),
  });

  const save = async () => {
    if (!token) return;
    setSaving(true);
    setSaved(false);
    setSaveErr(null);
    try {
      await apiFetch("users/profile/me", token, { method: "PATCH", body: JSON.stringify(form) });
      setSaved(true);
      setDirty(false);
      void load();
    } catch (e) {
      setSaveErr(formatApiError(e, "No se pudo guardar tu perfil. Intenta de nuevo."));
    } finally {
      setSaving(false);
    }
  };

  const completeness = useMemo(() => {
    const sections = [
      { label: "Datos personales", fields: [form.telefono, form.fechaNacimiento, form.ciudad, form.estado] },
      { label: "Documentos", fields: [form.curp, form.rfc, form.nss] },
      { label: "Contacto de emergencia", fields: [form.contactoEmergenciaNombre, form.contactoEmergenciaTelefono] },
    ].map((sec) => {
      const filled = sec.fields.filter(Boolean).length;
      return { ...sec, filled, total: sec.fields.length, pct: Math.round((filled / sec.fields.length) * 100) };
    });
    const filled = sections.reduce((acc, x) => acc + x.filled, 0);
    const total = sections.reduce((acc, x) => acc + x.total, 0);
    return { sections, pct: Math.round((filled / total) * 100) };
  }, [form]);

  const pctColor = (pct: number) => (pct === 100 ? "var(--success)" : pct >= 50 ? "var(--warning)" : "var(--danger)");
  const hoy = hybrid?.items?.[0];
  const entrada = hhmm(hoy?.erp?.checkIn);
  const salida = hhmm(hoy?.erp?.checkOut);
  const primerPase = hhmm(hoy?.acs?.firstAt);
  const employeeNumber = identity?.user.employeeNumber || identity?.user.companyEmployeeNumber || profile?.employeeNumber || null;

  return (
    <>
      <PageHeader
        eyebrow="Mi cuenta"
        title="Mi perfil"
        subtitle={cuentaDireccion ? "Tus datos de contacto." : "Tus datos personales, contacto de emergencia y documentos de identidad."}
        meta={profile && (
          <>
            {profile.role?.nombre && <Tag variant="accent" dot>{profile.role.nombre}</Tag>}
            {profile.department?.nombre && <Tag variant="default">{profile.department.nombre}</Tag>}
          </>
        )}
      />

      {!profile && loading && (
        <div aria-busy="true" aria-label="Cargando tu perfil" style={{ display: "grid", gap: 16 }}>
          <div className={s.skeleton} style={{ height: 96 }} />
          <div className={s.skeleton} style={{ height: 320 }} />
        </div>
      )}

      {!profile && !loading && error && (
        <EmptyState
          icon="⚠️"
          title="No pudimos cargar tu perfil"
          description={error}
          action={<Button variant="primary" onClick={() => void load()}>Reintentar</Button>}
        />
      )}

      {profile && (
        <>
          {error && (
            <InlineAlert
              variant="warning"
              message={`No pudimos actualizar tus datos. ${error}`}
              action={<Button size="sm" variant="secondary" onClick={() => void load()}>Reintentar</Button>}
            />
          )}

          {!cuentaDireccion && (
            <div className={s.progress} aria-label="Qué tan completo está tu perfil">
              <div className={s.progressHead}>
                <span className={s.progressTitle}>Tu perfil está completo al</span>
                <span className={s.progressPct} style={{ color: pctColor(completeness.pct) }}>{completeness.pct}%</span>
              </div>
              {completeness.sections.map((sec) => (
                <div key={sec.label} className={s.progressItem}>
                  <span className={s.progressLabel}>
                    <span>{sec.label}</span>
                    <span>{sec.filled} de {sec.total}</span>
                  </span>
                  <div className={s.track} role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={sec.pct} aria-label={sec.label}>
                    <div className={s.fill} style={{ width: `${sec.pct}%`, background: pctColor(sec.pct) }} />
                  </div>
                </div>
              ))}
            </div>
          )}

          <Section title="Datos de cuenta">
            <dl className={s.facts}>
              <div className={s.fact}><dt>Nombre</dt><dd>{profile.nombre}</dd></div>
              <div className={s.fact}><dt>Correo</dt><dd>{profile.email}</dd></div>
              <div className={s.fact}><dt>Número de empleado</dt><dd className={s.mono}>{employeeNumber ?? "—"}</dd></div>
              <div className={s.fact}>
                <dt>Control de acceso</dt>
                <dd>
                  {identity?.status === "linked"
                    ? `Vinculado como ${identity.acsPerson?.personName || "tú"}`
                    : identity?.status === "erp_only"
                      ? "Tu número aún no está en el control de acceso"
                      : identity?.status === "unlinked"
                        ? "Sin número de empleado"
                        : "—"}
                </dd>
              </div>
            </dl>
          </Section>

          {!cuentaDireccion && (
            <Section title="Tu asistencia de hoy" subtitle="El checador de la app es el que cuenta para tu nómina.">
              <dl className={s.facts}>
                <div className={s.fact}>
                  <dt>Checador de la app</dt>
                  <dd className={s.mono}>
                    {entrada ? `Entrada ${entrada}` : "Sin entrada"}
                    {salida ? ` · Salida ${salida}` : ""}
                  </dd>
                </div>
                <div className={s.fact}>
                  <dt>Pases en puertas</dt>
                  <dd className={s.mono}>
                    {primerPase
                      ? `${hoy?.acs?.passes ?? 0} ${hoy?.acs?.passes === 1 ? "pase" : "pases"} · desde ${primerPase}${hoy?.acs?.firstDoor ? ` · ${hoy.acs.firstDoor}` : ""}`
                      : identity?.status === "linked"
                        ? "Sin pases hoy"
                        : "Sin vincular"}
                  </dd>
                </div>
              </dl>
              {identity?.status !== "linked" && (
                <p style={{ margin: "12px 0 0", fontSize: 12.5, color: "var(--text-secondary)" }}>
                  Pide a RH que vincule tu número de empleado con el control de acceso.
                </p>
              )}
            </Section>
          )}

          <Section
            title={cuentaDireccion ? "Contacto" : "Datos personales"}
            subtitle={cuentaDireccion ? undefined : "Solo tú, RH y Dirección pueden ver esta información."}
          >
            <FormGrid>
              <FormField label="Teléfono">
                <PhoneField value={form.telefono ?? ""} onChange={(telefono) => update("telefono", telefono)} />
              </FormField>
              {!cuentaDireccion && (
                <>
                  <FormField label="Fecha de nacimiento">
                    <input type="date" {...text("fechaNacimiento")} />
                  </FormField>
                  <FormField label="Dirección" fullWidth>
                    <input autoComplete="street-address" placeholder="Calle y número" {...text("direccion")} />
                  </FormField>
                  <FormField label="Colonia">
                    <input {...text("colonia")} />
                  </FormField>
                  <FormField label="Ciudad">
                    <input autoComplete="address-level2" {...text("ciudad")} />
                  </FormField>
                  <FormField label="Estado">
                    <input autoComplete="address-level1" {...text("estado")} />
                  </FormField>
                  <FormField label="Código postal">
                    <input inputMode="numeric" autoComplete="postal-code" maxLength={5} {...text("codigoPostal")} />
                  </FormField>
                  <FormField label="CURP" hint="18 caracteres">
                    <input maxLength={18} autoCapitalize="characters" {...text("curp", (v) => v.toUpperCase())} />
                  </FormField>
                  <FormField label="RFC" hint="12 o 13 caracteres">
                    <input maxLength={13} autoCapitalize="characters" {...text("rfc", (v) => v.toUpperCase())} />
                  </FormField>
                  <FormField label="Número de INE">
                    <input {...text("ineNumero")} />
                  </FormField>
                  <FormField label="Número de seguro social (IMSS)">
                    <input inputMode="numeric" maxLength={11} {...text("nss")} />
                  </FormField>
                </>
              )}
            </FormGrid>
          </Section>

          <Section title="Contacto de emergencia" subtitle="A quién llamamos si te pasa algo en el trabajo.">
            <FormGrid>
              <FormField label="Nombre">
                <input autoComplete="off" {...text("contactoEmergenciaNombre")} />
              </FormField>
              <FormField label="Teléfono">
                <PhoneField
                  value={form.contactoEmergenciaTelefono ?? ""}
                  onChange={(contactoEmergenciaTelefono) => update("contactoEmergenciaTelefono", contactoEmergenciaTelefono)}
                />
              </FormField>
            </FormGrid>
          </Section>

          {saveErr && <InlineAlert variant="danger" message={saveErr} onDismiss={() => setSaveErr(null)} />}

          <div className={s.saveBar}>
            <Button variant="primary" onClick={() => void save()} loading={saving} disabled={!dirty || saving}>
              Guardar cambios
            </Button>
            {saved ? (
              <span className={`${s.saveNote} ${s.saveOk}`} role="status">
                ✓ {cuentaDireccion ? "Guardado" : "Guardado. RH revisará los cambios."}
              </span>
            ) : dirty ? (
              <span className={s.saveNote}>Tienes cambios sin guardar.</span>
            ) : null}
          </div>
        </>
      )}
    </>
  );
}
