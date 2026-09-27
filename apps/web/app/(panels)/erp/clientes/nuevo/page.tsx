"use client";

import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import CheckRoundedIcon from "@mui/icons-material/CheckRounded";
import LockOutlinedIcon from "@mui/icons-material/LockOutlined";
import { useUser } from "@/components/UserContext";
import { Alert, Button, ButtonLink, Card, CardHead, EmptyState, PageHead, Skeleton } from "@/components/base";
import { formatApiError } from "@/lib/erp-api";
import {
  ALL_CLIENT_SECTORS,
  canSeeClientesModule,
  CLIENT_SECTOR_META,
  clientSectorsForEmail,
  sectorFromSlug,
  type ClientSector,
} from "@/lib/client-sectors";
import { createSalesClient, getClientPermissions } from "@/lib/sales-api";
import { CLIENT_SECTOR_ICONS } from "@/components/erp/ClientSectorIcon";
import PhoneField, { isValidNexaraPhone } from "@/components/PhoneField";
import FiscalRfcLookup from "@/components/FiscalRfcLookup";
import { nombreSector } from "../sectores";
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

export default function NuevoClientePage() {
  const router = useRouter();
  const { user, token } = useUser();
  const allowedSectors = useMemo(() => clientSectorsForEmail(user?.email), [user?.email]);

  const [form, setForm] = useState(empty);
  const [sectors, setSectors] = useState<ClientSector[]>([]);
  const sectoresTocados = useRef(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [errorTelefono, setErrorTelefono] = useState<string | null>(null);
  /** null = consultando; la API decide quién agrega (jefes con personal a cargo, administración, dirección). */
  const [puedeAgregar, setPuedeAgregar] = useState<boolean | null>(null);

  // El sector llega por la URL (?sector=comercial); se aplica cuando ya se sabe qué sectores ve la persona.
  useEffect(() => {
    if (sectoresTocados.current || allowedSectors.length === 0) return;
    const preset = sectorFromSlug(new URLSearchParams(window.location.search).get("sector") || "");
    setSectors(preset && allowedSectors.includes(preset) ? [preset] : allowedSectors.slice(0, 1));
  }, [allowedSectors]);

  useEffect(() => {
    if (!token) return;
    let vivo = true;
    getClientPermissions(token)
      .then((p) => vivo && setPuedeAgregar(p.puedeAgregar))
      .catch(() => vivo && setPuedeAgregar(false));
    return () => {
      vivo = false;
    };
  }, [token]);

  if (!canSeeClientesModule(user?.email) || puedeAgregar === false) {
    return (
      <div className={styles.wrap}>
        <PageHead back={{ href: "/erp/clientes", label: "Clientes" }} title="Nuevo cliente" />
        <EmptyState
          icon={<LockOutlinedIcon />}
          title="No puedes dar de alta clientes"
          description="Solo quien tiene personal a su cargo, Administración o Dirección puede agregar clientes. Pídele a tu jefe que lo registre."
          action={<ButtonLink href="/erp/clientes">Volver a clientes</ButtonLink>}
        />
      </div>
    );
  }
  if (puedeAgregar === null) {
    return (
      <div className={styles.wrap} aria-busy="true" aria-label="Cargando formulario">
        <div className={styles.skeletonHead}>
          <Skeleton width={90} height={12} />
          <Skeleton width={220} height={24} />
        </div>
        <Skeleton height={420} radius={12} />
      </div>
    );
  }

  const toggleSector = (s: ClientSector) => {
    sectoresTocados.current = true;
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
    setErrorTelefono(null);
    if (form.billingPhone.trim() && !isValidNexaraPhone(form.billingPhone)) {
      setErrorTelefono("Teléfono inválido para el país seleccionado");
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
      setError(formatApiError(err, "No se pudo crear el cliente"));
    } finally {
      setSaving(false);
    }
  };

  const set = (campo: keyof typeof empty) => (e: { target: { value: string } }) =>
    setForm((f) => ({ ...f, [campo]: e.target.value }));

  return (
    <div className={styles.wrap}>
      <PageHead
        back={{ href: "/erp/clientes", label: "Clientes" }}
        title="Nuevo cliente"
        description="Un solo registro por cliente: con sus datos fiscales queda listo para cotizar y facturar."
      />

      <Card as="div">
        <form onSubmit={(e) => void onSubmit(e)}>
          <div className={styles.cardPad}>
            <fieldset className={styles.fieldset}>
              <legend className={styles.legend}>Sectores</legend>
              <p className={styles.fieldHint}>Dónde se podrá elegir a este cliente. Puedes marcar varios.</p>
              <div className={styles.sectorPick} role="group" aria-label="Sectores del cliente">
                {ALL_CLIENT_SECTORS.filter((s) => allowedSectors.includes(s)).map((s) => {
                  const on = sectors.includes(s);
                  const Icono = CLIENT_SECTOR_ICONS[CLIENT_SECTOR_META[s].icon];
                  return (
                    <button
                      key={s}
                      type="button"
                      aria-pressed={on}
                      className={`${styles.sectorPickBtn} ${on ? styles.sectorPickBtnOn : ""}`}
                      onClick={() => toggleSector(s)}
                    >
                      {on ? <CheckRoundedIcon aria-hidden="true" fontSize="inherit" /> : <Icono aria-hidden="true" fontSize="inherit" />}
                      {nombreSector(s)}
                    </button>
                  );
                })}
              </div>
            </fieldset>

            <fieldset className={styles.fieldset}>
              <legend className={styles.legend}>Datos fiscales</legend>
              <div className={styles.formGrid}>
                <div className={`${styles.field} ${styles.fieldFull}`}>
                  <label htmlFor="name">Nombre comercial *</label>
                  <input
                    id="name"
                    className={styles.input}
                    required
                    autoComplete="organization"
                    value={form.name}
                    onChange={set("name")}
                  />
                  <span className={styles.fieldHint}>Como lo conoce tu equipo, por ejemplo «Plaza Norte».</span>
                </div>
                <div className={styles.field}>
                  <label htmlFor="legalName">Razón social *</label>
                  <input id="legalName" className={styles.input} required value={form.legalName} onChange={set("legalName")} />
                  <span className={styles.fieldHint}>Tal como aparece en su constancia fiscal.</span>
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
                <div className={`${styles.field} ${styles.fieldFull}`}>
                  <label htmlFor="fiscalAddress">Dirección fiscal *</label>
                  <input
                    id="fiscalAddress"
                    className={styles.input}
                    required
                    autoComplete="street-address"
                    value={form.fiscalAddress}
                    onChange={set("fiscalAddress")}
                  />
                </div>
                <div className={styles.field}>
                  <label htmlFor="fiscalZipCode">Código postal fiscal *</label>
                  <input
                    id="fiscalZipCode"
                    className={styles.input}
                    required
                    inputMode="numeric"
                    autoComplete="postal-code"
                    value={form.fiscalZipCode}
                    onChange={set("fiscalZipCode")}
                  />
                </div>
              </div>
            </fieldset>

            <fieldset className={styles.fieldset}>
              <legend className={styles.legend}>Contacto</legend>
              <div className={styles.formGrid}>
                <div className={styles.field}>
                  <label htmlFor="billingEmail">Correo de facturación *</label>
                  <input
                    id="billingEmail"
                    type="email"
                    className={styles.input}
                    required
                    autoComplete="email"
                    value={form.billingEmail}
                    onChange={set("billingEmail")}
                  />
                  <span className={styles.fieldHint}>Aquí llegan cotizaciones y facturas.</span>
                </div>
                <div className={styles.field}>
                  <label htmlFor="billingPhone">Teléfono</label>
                  <PhoneField
                    id="billingPhone"
                    value={form.billingPhone}
                    invalid={Boolean(errorTelefono)}
                    onChange={(billingPhone) => {
                      setForm((f) => ({ ...f, billingPhone }));
                      if (errorTelefono) setErrorTelefono(null);
                    }}
                  />
                  {errorTelefono ? (
                    <span className={styles.fieldError} role="alert">
                      {errorTelefono}
                    </span>
                  ) : null}
                </div>
                <div className={`${styles.field} ${styles.fieldFull}`}>
                  <label htmlFor="notes">Notas</label>
                  <textarea id="notes" className={styles.textarea} value={form.notes} onChange={set("notes")} />
                  <span className={styles.fieldHint}>Solo las ve tu equipo.</span>
                </div>
              </div>
            </fieldset>

            {error ? (
              <Alert tone="danger" role="alert">
                {error}
              </Alert>
            ) : null}
          </div>

          <div className={styles.saveBar}>
            <ButtonLink href="/erp/clientes">Cancelar</ButtonLink>
            <Button type="submit" variant="primary" disabled={saving} aria-busy={saving || undefined}>
              {saving ? "Guardando…" : "Crear cliente"}
            </Button>
          </div>
        </form>
      </Card>
    </div>
  );
}
