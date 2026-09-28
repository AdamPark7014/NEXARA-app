"use client";

import { useEffect, useState } from "react";
import Button from "@/components/ui/Button";
import { formatApiError } from "@/lib/erp-api";
import {
  createSalesClient,
  getSalesClient,
  updateSalesClient,
  type SalesClient,
} from "@/lib/sales-api";
import styles from "./DatosCliente.module.css";

export type TipoCliente = "COMERCIAL" | "PROYECTO" | "CORPORATIVO";

type Datos = {
  name: string;
  legalName: string;
  taxId: string;
  fiscalAddress: string;
  fiscalZipCode: string;
  fiscalRegime: string;
  billingEmail: string;
  billingPhone: string;
};

const vacio: Datos = {
  name: "",
  legalName: "",
  taxId: "",
  fiscalAddress: "",
  fiscalZipCode: "",
  fiscalRegime: "",
  billingEmail: "",
  billingPhone: "",
};

function desde(c: SalesClient): Datos {
  return {
    name: c.name ?? "",
    legalName: c.legalName ?? "",
    taxId: c.taxId ?? "",
    fiscalAddress: c.fiscalAddress ?? "",
    fiscalZipCode: c.fiscalZipCode ?? "",
    fiscalRegime: c.fiscalRegime ?? "",
    billingEmail: c.billingEmail ?? "",
    billingPhone: c.billingPhone ?? "",
  };
}

/**
 * RFC, razón social y el resto son opcionales. Solo el nombre es obligatorio.
 * Quien no puede editar no ve el formulario.
 */
export function DatosClienteOpcionales({
  token,
  clientId,
  puedeEditar,
}: {
  token: string | null;
  clientId: number | null;
  puedeEditar: boolean;
}) {
  const [datos, setDatos] = useState<Datos>(vacio);
  const [abierto, setAbierto] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);

  useEffect(() => {
    if (!token || !clientId || !puedeEditar) return;
    let vivo = true;
    getSalesClient(token, clientId)
      .then((c) => vivo && setDatos(desde(c)))
      .catch(() => vivo && setError("No se pudieron cargar los datos del cliente"));
    return () => {
      vivo = false;
    };
  }, [token, clientId, puedeEditar]);

  if (!puedeEditar || !clientId) return null;

  const set = (campo: keyof Datos) => (e: { target: { value: string } }) =>
    setDatos((d) => ({ ...d, [campo]: e.target.value }));

  return (
    <div className={styles.bloque}>
      <Button type="button" variant="secondary" size="sm" onClick={() => setAbierto((v) => !v)}>
        {abierto ? "Ocultar datos del cliente" : "Completar datos del cliente"}
      </Button>
      {abierto ? (
        <div className={styles.bloque}>
          <p className={styles.nota}>
            Solo el nombre es obligatorio. RFC, razón social, dirección, régimen y CP se pueden dejar para después.
          </p>
          <div className={styles.fila}>
            <label className={styles.campo}>
              <span>Nombre *</span>
              <input className="input" value={datos.name} onChange={set("name")} maxLength={200} />
            </label>
            <label className={styles.campo}>
              <span>Razón social</span>
              <input className="input" value={datos.legalName} onChange={set("legalName")} maxLength={220} />
            </label>
            <label className={styles.campo}>
              <span>RFC</span>
              <input className="input" value={datos.taxId} onChange={set("taxId")} maxLength={40} />
            </label>
            <label className={styles.campo}>
              <span>Régimen fiscal</span>
              <input className="input" value={datos.fiscalRegime} onChange={set("fiscalRegime")} maxLength={10} />
            </label>
            <label className={styles.campo}>
              <span>Código postal</span>
              <input className="input" value={datos.fiscalZipCode} onChange={set("fiscalZipCode")} maxLength={5} />
            </label>
            <label className={styles.campo}>
              <span>Correo</span>
              <input className="input" type="email" value={datos.billingEmail} onChange={set("billingEmail")} maxLength={200} />
            </label>
            <label className={styles.campo}>
              <span>Teléfono</span>
              <input className="input" value={datos.billingPhone} onChange={set("billingPhone")} maxLength={60} />
            </label>
          </div>
          <label className={styles.campo}>
            <span>Dirección fiscal</span>
            <input className="input" value={datos.fiscalAddress} onChange={set("fiscalAddress")} />
          </label>
          <div className={styles.acciones}>
            <Button
              type="button"
              variant="primary"
              size="sm"
              disabled={guardando || datos.name.trim().length < 2}
              onClick={() => {
                if (!token) return;
                setGuardando(true);
                setError(null);
                setAviso(null);
                updateSalesClient(token, clientId, {
                  name: datos.name.trim(),
                  legalName: datos.legalName.trim(),
                  taxId: datos.taxId.trim().toUpperCase(),
                  fiscalAddress: datos.fiscalAddress.trim(),
                  fiscalZipCode: datos.fiscalZipCode.trim(),
                  fiscalRegime: datos.fiscalRegime.trim(),
                  billingEmail: datos.billingEmail.trim(),
                  billingPhone: datos.billingPhone.trim(),
                })
                  .then(() => setAviso("Datos del cliente guardados."))
                  .catch((e) => setError(formatApiError(e, "No se pudieron guardar los datos")))
                  .finally(() => setGuardando(false));
              }}
            >
              {guardando ? "Guardando…" : "Guardar datos del cliente"}
            </Button>
            {aviso ? <p className={styles.nota}>{aviso}</p> : null}
            {error ? <p className={styles.error}>{error}</p> : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}

/**
 * Buscador de un solo tipo de cliente: elegir uno que ya existe, crearlo con el nombre
 * o —si es un operativo en una actividad de servicio— crearlo solo con nombre y contacto.
 */
export function ClienteTipoPicker({
  token,
  tipo,
  salesClientId,
  editable,
  puedeCrear,
  puedeEditar,
  soloContacto,
  altaSoloNombre,
  clientes,
  onSelect,
  onCreado,
}: {
  token: string | null;
  tipo: TipoCliente;
  salesClientId: number | null;
  editable: boolean;
  puedeCrear: boolean;
  puedeEditar: boolean;
  soloContacto?: boolean;
  /** Alta de un cliente de proyecto: solo el nombre, sin contacto ni datos fiscales. */
  altaSoloNombre?: boolean;
  clientes: SalesClient[];
  onSelect: (cliente: SalesClient) => void | Promise<void>;
  onCreado: (cliente: SalesClient) => void;
}) {
  const [q, setQ] = useState("");
  const [correo, setCorreo] = useState("");
  const [telefono, setTelefono] = useState("");
  const [creando, setCreando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const texto = q.trim().toLowerCase();
  const visibles = (texto
    ? clientes.filter((c) => `${c.name} ${c.legalName ?? ""}`.toLowerCase().includes(texto))
    : clientes
  ).slice(0, 40);
  const elegido = clientes.find((c) => c.id === salesClientId) ?? null;

  return (
    <div className={styles.bloque}>
      <input
        className="input"
        type="search"
        value={q}
        disabled={!editable}
        placeholder={
          tipo === "CORPORATIVO"
            ? "Buscar cliente corporativo"
            : tipo === "PROYECTO"
              ? "Buscar cliente de proyecto"
              : "Buscar cliente comercial"
        }
        aria-label="Buscar cliente"
        onChange={(e) => setQ(e.target.value)}
      />
      <select
        className="input"
        aria-label="Cliente"
        disabled={!editable}
        value={salesClientId ? String(salesClientId) : ""}
        onChange={(e) => {
          const id = Number(e.target.value);
          const c = clientes.find((row) => row.id === id);
          if (c) void onSelect(c);
        }}
      >
        <option value="">{clientes.length ? `Elige un cliente (${visibles.length})` : "Sin clientes de este tipo"}</option>
        {visibles.map((c) => (
          <option key={c.id} value={String(c.id)}>
            {c.name}
            {c.legalName && c.legalName !== c.name ? ` — ${c.legalName}` : ""}
          </option>
        ))}
      </select>
      {puedeCrear && editable ? (
        <div className={styles.bloque}>
          <p className={styles.nota}>
            {altaSoloNombre
              ? "Si no está en la lista, créalo con el nombre. Lo demás se completa después en Proyectos."
              : soloContacto
                ? "Puedes dar de alta aquí el nombre y el contacto. El RFC lo completa después coordinación."
                : "Si no está en la lista, créalo con el nombre. Los datos fiscales se completan después."}
          </p>
          {soloContacto ? (
            <div className={styles.fila}>
              <label className={styles.campo}>
                <span>Correo</span>
                <input className="input" type="email" value={correo} onChange={(e) => setCorreo(e.target.value)} maxLength={200} />
              </label>
              <label className={styles.campo}>
                <span>Teléfono</span>
                <input className="input" value={telefono} onChange={(e) => setTelefono(e.target.value)} maxLength={60} />
              </label>
            </div>
          ) : null}
          <Button
            type="button"
            variant="secondary"
            size="sm"
            disabled={creando || q.trim().length < 2 || !token}
            onClick={() => {
              if (!token) return;
              setCreando(true);
              setError(null);
              const payload = altaSoloNombre
                ? { name: q.trim(), status: "Activo" as const, tipo: "PROYECTO" as const, altaProyecto: true }
                : soloContacto
                  ? {
                      name: q.trim(),
                      status: "Activo" as const,
                      tipo,
                      altaRapida: true,
                      billingEmail: correo.trim() || undefined,
                      billingPhone: telefono.trim() || undefined,
                    }
                  : { name: q.trim(), status: "Activo" as const, tipo, sectors: [tipo] };
              createSalesClient(token, payload)
                .then((creado) => {
                  onCreado(creado);
                  setQ("");
                  setCorreo("");
                  setTelefono("");
                })
                .catch((e) => setError(formatApiError(e, "No se pudo crear el cliente")))
                .finally(() => setCreando(false));
            }}
          >
            {creando ? "Creando…" : "Crear cliente"}
          </Button>
        </div>
      ) : null}
      {error ? <p className={styles.error}>{error}</p> : null}
      {elegido ? <p className={styles.nota}>Cliente: {elegido.name}</p> : null}
      <DatosClienteOpcionales token={token} clientId={puedeEditar ? salesClientId : null} puedeEditar={puedeEditar && editable} />
    </div>
  );
}
