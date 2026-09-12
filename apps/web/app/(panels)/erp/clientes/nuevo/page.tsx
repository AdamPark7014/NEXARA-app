"use client";

import { FormEvent, Suspense, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useUser } from "@/components/UserContext";
import {
  ALL_CLIENT_SECTORS,
  canSeeClientesModule,
  CLIENT_SECTOR_META,
  clientSectorsForEmail,
  sectorFromSlug,
  type ClientSector,
} from "@/lib/client-sectors";
import { createSalesClient } from "@/lib/sales-api";

const empty = {
  name: "",
  legalName: "",
  taxId: "",
  fiscalAddress: "",
  fiscalZipCode: "",
  fiscalRegime: "",
  billingEmail: "",
  billingPhone: "",
  notes: "",
};

function NuevoClienteForm() {
  const router = useRouter();
  const search = useSearchParams();
  const { user, token } = useUser();
  const allowedSectors = useMemo(() => clientSectorsForEmail(user?.email), [user?.email]);
  const preset = sectorFromSlug(String(search.get("sector") || ""));

  const [form, setForm] = useState(empty);
  const [sectors, setSectors] = useState<ClientSector[]>(() => {
    if (preset && allowedSectors.includes(preset)) return [preset];
    return allowedSectors.slice(0, 1);
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!canSeeClientesModule(user?.email)) {
    return <p style={{ color: "var(--text-secondary)" }}>Sin acceso.</p>;
  }

  const toggleSector = (s: ClientSector) => {
    setSectors((prev) => (prev.includes(s) ? prev.filter((x) => x !== s) : [...prev, s]));
  };

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!token) return;
    if (sectors.length === 0) {
      setError("Elige al menos un sector");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const created = await createSalesClient(token, {
        ...form,
        taxId: form.taxId.toUpperCase(),
        sectors,
        status: "Activo",
      });
      router.push(`/erp/clientes/${created.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo crear");
    } finally {
      setSaving(false);
    }
  };

  const field = (key: keyof typeof empty, label: string, opts?: { required?: boolean; upper?: boolean }) => (
    <label style={{ display: "block", fontSize: 12.5 }}>
      <span style={{ fontWeight: 650, color: "var(--text-secondary)" }}>
        {label}
        {opts?.required ? " *" : ""}
      </span>
      <input
        required={opts?.required}
        value={form[key]}
        onChange={(e) =>
          setForm((f) => ({
            ...f,
            [key]: opts?.upper ? e.target.value.toUpperCase() : e.target.value,
          }))
        }
        style={{
          width: "100%",
          marginTop: 4,
          padding: "9px 10px",
          borderRadius: 10,
          border: "1px solid var(--border)",
          background: "var(--bg)",
          color: "inherit",
          fontFamily: "inherit",
          fontSize: 14,
        }}
      />
    </label>
  );

  return (
    <div style={{ maxWidth: 640, margin: "0 auto" }}>
      <button
        type="button"
        onClick={() => router.push("/erp/clientes")}
        style={{
          border: "none",
          background: "transparent",
          color: "var(--primary)",
          fontWeight: 650,
          cursor: "pointer",
          fontFamily: "inherit",
          padding: 0,
          marginBottom: 12,
        }}
      >
        ← Clientes
      </button>
      <h1 style={{ margin: "0 0 14px", fontSize: 20, fontWeight: 800 }}>Nuevo cliente</h1>

      <form
        onSubmit={(e) => void onSubmit(e)}
        style={{
          display: "flex",
          flexDirection: "column",
          gap: 12,
          padding: 16,
          borderRadius: 16,
          border: "1px solid var(--border)",
          background: "var(--surface)",
        }}
      >
        <div style={{ fontSize: 13, fontWeight: 750, color: "var(--text-secondary)" }}>Sectores</div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
          {ALL_CLIENT_SECTORS.filter((s) => allowedSectors.includes(s)).map((s) => {
            const on = sectors.includes(s);
            return (
              <button
                key={s}
                type="button"
                onClick={() => toggleSector(s)}
                style={{
                  border: on ? "2px solid var(--primary)" : "1px solid var(--border)",
                  background: on ? "color-mix(in srgb, var(--primary) 12%, var(--surface))" : "var(--bg)",
                  borderRadius: 999,
                  padding: "7px 12px",
                  cursor: "pointer",
                  fontFamily: "inherit",
                  fontWeight: 650,
                  fontSize: 12.5,
                  color: "inherit",
                }}
              >
                {CLIENT_SECTOR_META[s].emoji} {CLIENT_SECTOR_META[s].title}
              </button>
            );
          })}
        </div>

        <div style={{ fontSize: 13, fontWeight: 750, color: "var(--text-secondary)", marginTop: 4 }}>
          Datos fiscales
        </div>
        {field("name", "Nombre comercial", { required: true })}
        {field("legalName", "Razón social", { required: true })}
        {field("taxId", "RFC", { required: true, upper: true })}
        {field("fiscalAddress", "Dirección fiscal", { required: true })}
        {field("fiscalZipCode", "Código postal fiscal", { required: true })}
        {field("fiscalRegime", "Régimen fiscal (SAT)", { required: true })}
        {field("billingEmail", "Email de facturación", { required: true })}
        {field("billingPhone", "Teléfono")}
        <label style={{ display: "block", fontSize: 12.5 }}>
          <span style={{ fontWeight: 650, color: "var(--text-secondary)" }}>Notas</span>
          <textarea
            value={form.notes}
            onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
            rows={3}
            style={{
              width: "100%",
              marginTop: 4,
              padding: 10,
              borderRadius: 10,
              border: "1px solid var(--border)",
              background: "var(--bg)",
              color: "inherit",
              fontFamily: "inherit",
              fontSize: 14,
              resize: "vertical",
            }}
          />
        </label>

        {error ? <p style={{ color: "#dc2626", margin: 0, fontSize: 13 }}>{error}</p> : null}

        <button
          type="submit"
          disabled={saving}
          style={{
            marginTop: 4,
            border: "none",
            background: "var(--primary)",
            color: "#fff",
            fontWeight: 700,
            fontSize: 14,
            padding: "12px 16px",
            borderRadius: 12,
            cursor: saving ? "wait" : "pointer",
            fontFamily: "inherit",
          }}
        >
          {saving ? "Guardando…" : "Crear cliente"}
        </button>
      </form>
    </div>
  );
}

export default function NuevoClientePage() {
  return (
    <Suspense fallback={<p style={{ color: "var(--text-secondary)" }}>Cargando…</p>}>
      <NuevoClienteForm />
    </Suspense>
  );
}
