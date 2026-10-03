"use client";

import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import LockOutlinedIcon from "@mui/icons-material/LockOutlined";
import { useUser } from "@/components/UserContext";
import {
  ButtonLink,
  Checkbox,
  EmptyState,
  Field,
  FieldGrid,
  FormPage,
  FormSection,
  Input,
  PageHead,
  RequiredMark,
  Skeleton,
  Textarea,
  fieldClass,
  type PendingItem,
} from "@/components/base";
import { formatApiError } from "@/lib/erp-api";
import {
  ALL_CLIENT_SECTORS,
  canAccessClientPadron,
  CLIENT_SECTOR_META,
  clientSectorsForUser,
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

/** Para qué sirve cada tipo, en una línea (la ayuda larga vive en la lista). */
const USO_DEL_TIPO: Record<ClientSector, string> = {
  PROYECTO: "Se le llevan proyectos con plan y cronograma.",
  CORPORATIVO: "Recibe servicio y actividades de operación.",
  COMERCIAL: "Cotizaciones y actividades comerciales.",
};

export default function NuevoClientePage() {
  const router = useRouter();
  const { user, token } = useUser();
  const allowedSectors = useMemo(() => clientSectorsForUser(user), [user]);

  const [form, setForm] = useState(empty);
  const [sectors, setSectors] = useState<ClientSector[]>([]);
  const sectoresTocados = useRef(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [errorTelefono, setErrorTelefono] = useState<string | null>(null);
  const [intento, setIntento] = useState(false);
  /** null = consultando; la API decide quién agrega (coordinación, gerencia, encargada comercial). */
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

  if (!canAccessClientPadron(user) || puedeAgregar === false) {
    return (
      <div className={styles.pagina}>
        <PageHead back={{ href: "/erp/clientes", label: "Volver a Clientes" }} title="Nuevo cliente" />
        <EmptyState
          icon={<LockOutlinedIcon />}
          title="No puedes dar de alta clientes"
          description="Solo coordinación, gerencia y la encargada comercial pueden agregar clientes. Un ingeniero o un operativo no puede."
          action={<ButtonLink href="/erp/clientes">Volver a clientes</ButtonLink>}
          tone="neutral"
        />
      </div>
    );
  }
  if (puedeAgregar === null) {
    return (
      <div className={styles.pagina} aria-busy="true" aria-label="Cargando formulario">
        <div className={styles.skeletonHead}>
          <Skeleton width={120} height={12} />
          <Skeleton width={240} height={26} />
        </div>
        <div className={styles.skeletonCuerpo}>
          <Skeleton height={420} radius={16} />
          <Skeleton height={200} radius={16} />
        </div>
      </div>
    );
  }

  // Varios a la vez: el mismo cliente puede ser comercial, de proyecto y corporativo.
  // Siempre queda al menos uno; el primero que se eligió es el principal.
  const toggleSector = (s: ClientSector) => {
    sectoresTocados.current = true;
    setSectors((prev) => {
      if (!prev.includes(s)) return [...prev, s];
      return prev.length > 1 ? prev.filter((x) => x !== s) : prev;
    });
  };

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!token) return;
    setIntento(true);
    if (!form.name.trim()) {
      document.getElementById("name")?.focus();
      return;
    }
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
        tipo: sectors[0],
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

  const visibles = ALL_CLIENT_SECTORS.filter((s) => allowedSectors.includes(s));
  const errorNombre = intento && !form.name.trim() ? "Escribe el nombre comercial" : null;
  const pendientes: PendingItem[] = [
    { id: "nombre", label: "Nombre comercial", done: Boolean(form.name.trim()), error: Boolean(errorNombre), fieldId: "name" },
    {
      id: "tipos",
      label: sectors.length > 1 ? `${sectors.length} tipos elegidos` : "Al menos un tipo",
      done: sectors.length > 0,
      fieldId: sectors[0] ? `tipo-${sectors[0]}` : undefined,
    },
    {
      id: "rfc",
      label: "RFC para facturar",
      hint: form.taxId.trim() ? undefined : "Opcional: se puede completar después",
      done: Boolean(form.taxId.trim()),
      fieldId: "fiscal-rfc",
    },
    {
      id: "correo",
      label: "Correo de facturación",
      hint: form.billingEmail.trim() ? undefined : "Opcional",
      done: Boolean(form.billingEmail.trim()),
      fieldId: "billingEmail",
    },
  ];

  return (
    <FormPage
      className={styles.pagina}
      title="Nuevo cliente"
      breadcrumbs={[{ label: "Clientes", href: "/erp/clientes" }, { label: "Nuevo cliente" }]}
      back={{ href: "/erp/clientes", label: "Volver a Clientes" }}
      description={
        <>
          Los campos con <RequiredMark /> son obligatorios. RFC, razón social, dirección, régimen y CP se pueden completar
          después.
        </>
      }
      pendingTitle="Antes de crear"
      pending={pendientes}
      error={error}
      onSubmit={(e) => void onSubmit(e)}
      cancelHref="/erp/clientes"
      submitLabel="Crear cliente"
      loading={saving}
    >
      <FormSection step={1} done={Boolean(form.name.trim())} title="Identidad" description="Cómo lo ubica tu equipo en listas y buscadores." columns={1}>
        <Field label="Nombre comercial" required error={errorNombre} hint="Como lo conoce tu equipo, por ejemplo «Plaza Norte».">
          <Input id="name" autoComplete="organization" value={form.name} onChange={set("name")} />
        </Field>
      </FormSection>

      <FormSection step={2} title="Datos fiscales" description="Con el RFC se consulta el SAT y se llenan razón social, régimen y CP.">
        <FieldGrid>
          <div className={styles.rfcLookup}>
            <FiscalRfcLookup
              token={token}
              rfc={form.taxId}
              onRfcChange={(taxId) => setForm((f) => ({ ...f, taxId }))}
              fiscalRegime={form.fiscalRegime}
              onRegimeChange={(fiscalRegime) => setForm((f) => ({ ...f, fiscalRegime }))}
              inputClassName={fieldClass}
              selectClassName={fieldClass}
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
          <Field label="Razón social" hint="Tal como aparece en su constancia fiscal.">
            <Input id="legalName" value={form.legalName} onChange={set("legalName")} />
          </Field>
          <Field label="Dirección fiscal" fullWidth>
            <Input id="fiscalAddress" autoComplete="street-address" value={form.fiscalAddress} onChange={set("fiscalAddress")} />
          </Field>
          <Field label="Código postal fiscal">
            <Input id="fiscalZipCode" inputMode="numeric" autoComplete="postal-code" value={form.fiscalZipCode} onChange={set("fiscalZipCode")} />
          </Field>
        </FieldGrid>
      </FormSection>

      <FormSection step={3} title="Contacto" description="A dónde llegan cotizaciones y facturas.">
        <FieldGrid>
          <Field label="Correo de facturación" hint="Aquí llegan cotizaciones y facturas.">
            <Input id="billingEmail" type="email" autoComplete="email" value={form.billingEmail} onChange={set("billingEmail")} />
          </Field>
          <div className={styles.campo}>
            <label htmlFor="billingPhone" className={styles.campoLabel}>
              Teléfono
            </label>
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
              <span className={styles.campoError} role="alert">
                {errorTelefono}
              </span>
            ) : null}
          </div>
          <Field label="Notas" hint="Solo las ve tu equipo." fullWidth>
            <Textarea id="notes" rows={3} value={form.notes} onChange={set("notes")} />
          </Field>
        </FieldGrid>
      </FormSection>

      <FormSection
        step={4}
        done={sectors.length > 0}
        title="Tipos"
        description="Elige uno o varios: el mismo cliente puede ser comercial, de proyecto y corporativo a la vez. Si ya existe con ese nombre, no se duplica: se le suman los tipos que elijas."
      >
        <div className={styles.tiposElegir} role="group" aria-label="Sectores del cliente">
          {visibles.map((s) => {
            const on = sectors.includes(s);
            const Icono = CLIENT_SECTOR_ICONS[CLIENT_SECTOR_META[s].icon];
            return (
              <div key={s} className={styles.tipoOpcion} data-on={on ? "true" : undefined}>
                <span className={styles.tipoOpcionIco} aria-hidden="true">
                  <Icono fontSize="inherit" />
                </span>
                <Checkbox
                  id={`tipo-${s}`}
                  checked={on}
                  onChange={() => toggleSector(s)}
                  label={nombreSector(s)}
                  description={on && sectors.length === 1 ? `${USO_DEL_TIPO[s]} Siempre queda al menos uno.` : USO_DEL_TIPO[s]}
                />
              </div>
            );
          })}
        </div>
      </FormSection>
    </FormPage>
  );
}
