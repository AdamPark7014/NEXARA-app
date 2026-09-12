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
import PhoneField, { isValidNexaraPhone } from "@/components/PhoneField";
import FiscalRfcLookup from "@/components/FiscalRfcLookup";
import styles from "../clientes-core.module.css";

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
    return <p className={styles.sub}>Sin acceso.</p>;
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
    if (form.billingPhone.trim() && !isValidNexaraPhone(form.billingPhone)) {
      setError("Teléfono inválido para el país seleccionado");
      setSaving(false);
      return;
    }
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

  return (
    <div className={styles.wrap}>
      <button type="button" className={styles.ghostBtn} onClick={() => router.push("/erp/clientes")}>
        ← Clientes
      </button>
      <h1 className={styles.title}>Nuevo cliente</h1>

      <form className={styles.panel} onSubmit={(e) => void onSubmit(e)}>
        <div>
          <div className={styles.fieldLabel}>Sectores</div>
          <div className={styles.sectorPick}>
            {ALL_CLIENT_SECTORS.filter((s) => allowedSectors.includes(s)).map((s) => {
              const on = sectors.includes(s);
              return (
                <button
                  key={s}
                  type="button"
                  className={`${styles.sectorPickBtn} ${on ? styles.sectorPickBtnOn : ""}`}
                  onClick={() => toggleSector(s)}
                >
                  {CLIENT_SECTOR_META[s].emoji}{" "}
                  {CLIENT_SECTOR_META[s].title.replace(/^Clientes de |^Clientes /i, "")}
                </button>
              );
            })}
          </div>
        </div>

        <div className={styles.fieldLabel} style={{ marginTop: 4 }}>
          Datos fiscales
        </div>
        <div className={styles.field}>
          <label htmlFor="name">Nombre comercial *</label>
          <input
            id="name"
            className={styles.input}
            required
            value={form.name}
            onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
          />
        </div>
        <div className={styles.grid2}>
          <div className={styles.field}>
            <label htmlFor="legalName">Razón social *</label>
            <input
              id="legalName"
              className={styles.input}
              required
              value={form.legalName}
              onChange={(e) => setForm((f) => ({ ...f, legalName: e.target.value }))}
            />
          </div>
          <div className={styles.field}>
            <FiscalRfcLookup
              token={token}
              rfc={form.taxId}
              onRfcChange={(taxId) => setForm((f) => ({ ...f, taxId }))}
              fiscalRegime={form.fiscalRegime}
              onRegimeChange={(fiscalRegime) => setForm((f) => ({ ...f, fiscalRegime }))}
              inputClassName={styles.input}
              selectClassName={styles.input}
              required
              disabled={saving}
              onApply={(data) =>
                setForm((f) => ({
                  ...f,
                  legalName: data.legalName?.trim() ? data.legalName : f.legalName,
                  fiscalZipCode: data.fiscalZipCode?.trim() ? data.fiscalZipCode : f.fiscalZipCode,
                  fiscalRegime: data.fiscalRegime || f.fiscalRegime,
                }))
              }
            />
          </div>
        </div>
        <div className={styles.field}>
          <label htmlFor="fiscalAddress">Dirección fiscal *</label>
          <input
            id="fiscalAddress"
            className={styles.input}
            required
            value={form.fiscalAddress}
            onChange={(e) => setForm((f) => ({ ...f, fiscalAddress: e.target.value }))}
          />
        </div>
        <div className={styles.grid2}>
          <div className={styles.field}>
            <label htmlFor="fiscalZipCode">CP fiscal *</label>
            <input
              id="fiscalZipCode"
              className={styles.input}
              required
              value={form.fiscalZipCode}
              onChange={(e) => setForm((f) => ({ ...f, fiscalZipCode: e.target.value }))}
            />
          </div>
        </div>
        <div className={styles.grid2}>
          <div className={styles.field}>
            <label htmlFor="billingEmail">Email facturación *</label>
            <input
              id="billingEmail"
              type="email"
              className={styles.input}
              required
              value={form.billingEmail}
              onChange={(e) => setForm((f) => ({ ...f, billingEmail: e.target.value }))}
            />
          </div>
          <div className={styles.field}>
            <label htmlFor="billingPhone">Teléfono</label>
            <PhoneField
              id="billingPhone"
              value={form.billingPhone}
              onChange={(billingPhone) => setForm((f) => ({ ...f, billingPhone }))}
            />
          </div>
        </div>
        <div className={styles.field}>
          <label htmlFor="notes">Notas</label>
          <textarea
            id="notes"
            className={styles.textarea}
            value={form.notes}
            onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
          />
        </div>

        {error ? <p className={styles.error}>{error}</p> : null}

        <button type="submit" className={styles.primaryBtn} disabled={saving} style={{ alignSelf: "flex-start" }}>
          {saving ? "Guardando…" : "Crear cliente"}
        </button>
      </form>
    </div>
  );
}

export default function NuevoClientePage() {
  return (
    <Suspense fallback={<p className={styles.sub}>Cargando…</p>}>
      <NuevoClienteForm />
    </Suspense>
  );
}
