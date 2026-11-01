"use client";

import { useCallback, useEffect, useState } from "react";
import Button from "@/components/ui/Button";
import { formatApiError } from "@/lib/erp-api";
import {
  getSalesClient,
  updateSalesClient,
  type SalesClient,
} from "@/lib/sales-api";
import { ClienteRapido } from "./ClienteRapido";
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
  textoBoton = "Completar datos del cliente",
}: {
  token: string | null;
  clientId: number | null;
  puedeEditar: boolean;
  textoBoton?: string;
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
        {abierto ? "Ocultar datos del cliente" : textoBoton}
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
 * Selector de un solo tipo de cliente: elegir uno que ya existe o crearlo con el nombre. Si se
 * parece a otro avisa antes de crear; los datos se completan después.
 */
export function ClienteTipoPicker({
  token,
  tipo,
  salesClientId,
  editable,
  puedeCrear,
  puedeEditar,
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
  /** Alta de un cliente de proyecto sin permiso de padrón: solo el nombre. */
  altaSoloNombre?: boolean;
  clientes: SalesClient[];
  onSelect: (cliente: SalesClient) => void | Promise<void>;
  /** Un cliente que la lista aún no traía: el recién creado o el que se reutilizó del aviso. */
  onCreado: (cliente: SalesClient) => void;
}) {
  const armar = useCallback(
    (nombre: string) =>
      tipo !== "PROYECTO"
        ? { name: nombre, status: "Activo" as const, tipo, altaRapida: true }
        : altaSoloNombre
          ? { name: nombre, status: "Activo" as const, tipo, altaProyecto: true }
          : { name: nombre, status: "Activo" as const, tipo, sectors: [tipo] },
    [tipo, altaSoloNombre],
  );
  return (
    <ClienteRapido
      token={token}
      clientes={clientes}
      salesClientId={salesClientId}
      editable={editable}
      puedeCrear={puedeCrear}
      armar={armar}
      onElegido={(cliente, { enLista }) => (enLista ? onSelect(cliente) : onCreado(cliente))}
      pie={
        <DatosClienteOpcionales
          token={token}
          clientId={puedeEditar ? salesClientId : null}
          puedeEditar={puedeEditar && editable}
        />
      }
    />
  );
}
