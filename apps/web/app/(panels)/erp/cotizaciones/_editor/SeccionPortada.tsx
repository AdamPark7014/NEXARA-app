"use client";

import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { listSalesClients, type SalesClient } from "@/lib/sales-api";
import { SEGMENTOS, SEGMENTO_LABEL, type Segmento } from "@/lib/cotizaciones-api";
import type { DocumentoCotizacion } from "@/lib/cotizacion-documento";
import { Hoja, Segmentado, TextoAuto } from "./campos";
import styles from "./editor.module.css";

const QUE_CAMBIA: Record<Segmento, string> = {
  COMERCIAL: "Venta a empresa o negocio: los términos dicen «solo suministro» o «suministro e instalación» según lo que cobres.",
  OBRA: "Obra: siempre suministro e instalación, con exclusiones y entrega de obra.",
  LICITACION: "Licitación: pago, vigencia y entrega los fijan las bases; no se pide anticipo.",
  SERVICIO: "Servicio o mantenimiento: entrega con reporte de lo atendido.",
};

type Cambiar = (cambio: (doc: DocumentoCotizacion) => DocumentoCotizacion) => void;

/** Buscador de cliente: elige uno del CRM o escribe uno nuevo (se da de alta al guardar). */
export function ClienteCombo({
  doc,
  cambiar,
  token,
  editable,
  id,
  autoFocus,
}: {
  doc: DocumentoCotizacion;
  cambiar: Cambiar;
  token: string | null;
  editable: boolean;
  id: string;
  autoFocus?: boolean;
}) {
  const [clientes, setClientes] = useState<SalesClient[] | null>(null);
  const [abierto, setAbierto] = useState(false);
  const [activo, setActivo] = useState(0);
  const listaId = useId();
  const pedido = useRef(false);

  const cargar = () => {
    if (pedido.current || !token) return;
    pedido.current = true;
    listSalesClients(token)
      .then(setClientes)
      .catch(() => setClientes([]));
  };

  useEffect(() => {
    if (autoFocus) cargar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoFocus, token]);

  const coincidencias = useMemo(() => {
    const q = doc.clientName.trim().toLowerCase();
    const todos = clientes ?? [];
    const filtrados = q
      ? todos.filter((c) => `${c.name} ${c.legalName ?? ""}`.toLowerCase().includes(q))
      : todos;
    return filtrados.slice(0, 8);
  }, [clientes, doc.clientName]);

  const elegir = (c: SalesClient) => {
    cambiar((d) => ({
      ...d,
      salesClientId: c.id,
      clientName: c.name,
      clientCompany: c.legalName ?? "",
      clientEmail: d.clientEmail || c.billingEmail || "",
      clientPhone: d.clientPhone || c.billingPhone || "",
    }));
    setAbierto(false);
  };

  const alTeclear = (e: KeyboardEvent<HTMLInputElement>) => {
    if (!abierto || !coincidencias.length) {
      if (e.key === "ArrowDown") setAbierto(true);
      return;
    }
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActivo((a) => Math.min(coincidencias.length - 1, a + 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActivo((a) => Math.max(0, a - 1));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const c = coincidencias[activo];
      if (c) elegir(c);
    } else if (e.key === "Escape") {
      setAbierto(false);
    }
  };

  const mostrar = abierto && editable && coincidencias.length > 0;
  const exacto = clientes?.some((c) => c.id === doc.salesClientId);

  return (
    <div className={styles.combo}>
      <input
        id={id}
        className={styles.input}
        value={doc.clientName}
        autoComplete="off"
        autoFocus={autoFocus}
        placeholder="Busca en tus clientes o escribe uno nuevo"
        role="combobox"
        aria-expanded={mostrar}
        aria-controls={listaId}
        aria-autocomplete="list"
        aria-activedescendant={mostrar ? `${listaId}-${activo}` : undefined}
        disabled={!editable}
        onFocus={() => {
          cargar();
          setAbierto(true);
        }}
        onBlur={() => setTimeout(() => setAbierto(false), 150)}
        onKeyDown={alTeclear}
        onChange={(e) => {
          const valor = e.target.value;
          setAbierto(true);
          setActivo(0);
          // Escribir otro nombre desliga el cliente del CRM: al guardar se busca o se da de alta.
          cambiar((d) => ({ ...d, clientName: valor, salesClientId: null, clientCompany: "" }));
        }}
      />
      {mostrar ? (
        <ul id={listaId} role="listbox" className={styles.opciones}>
          {coincidencias.map((c, i) => (
            <li
              key={c.id}
              id={`${listaId}-${i}`}
              role="option"
              aria-selected={i === activo}
              className={`${styles.opcion} ${i === activo ? styles.opcionActiva : ""}`}
              onMouseDown={(e) => {
                e.preventDefault();
                elegir(c);
              }}
              onMouseEnter={() => setActivo(i)}
            >
              <span>{c.name}</span>
              {c.legalName && c.legalName !== c.name ? <small>{c.legalName}</small> : null}
              {c.billingEmail ? <small>{c.billingEmail}</small> : null}
            </li>
          ))}
        </ul>
      ) : null}
      {doc.clientName.trim() && !doc.salesClientId && clientes && !exacto ? (
        <p className={styles.pista}>
          Cliente nuevo: se da de alta en el CRM al guardar.
        </p>
      ) : null}
    </div>
  );
}

/** Portada: lo que el cliente ve primero (proyecto, cliente, versión, fecha) y el segmento. */
export default function SeccionPortada({
  doc,
  cambiar,
  token,
  editable,
  version,
  esNueva,
}: {
  doc: DocumentoCotizacion;
  cambiar: Cambiar;
  token: string | null;
  editable: boolean;
  version: string;
  esNueva: boolean;
}) {
  return (
    <Hoja id="portada" numero="" titulo="Portada" ayuda="Lo primero que ve el cliente: proyecto, cliente, fecha y versión.">
      <div className={styles.campos}>
        <div className={styles.campo}>
          <label htmlFor="cot-proyecto" className={styles.etiqueta}>
            Título del proyecto
          </label>
          <TextoAuto
            id="cot-proyecto"
            variante="portada"
            value={doc.projectName}
            onValor={(v) => cambiar((d) => ({ ...d, projectName: v.replace(/\n/g, " ") }))}
            placeholder="p. ej. Renovación, mantenimiento y ampliación del sistema de CCTV"
            disabled={!editable}
          />
        </div>
        <div className={styles.portadaCampos}>
          <div className={styles.campo}>
            <label className={styles.etiqueta} htmlFor="cot-cliente">
              Cliente
            </label>
            <ClienteCombo doc={doc} cambiar={cambiar} token={token} editable={editable} id="cot-cliente" autoFocus={esNueva} />
          </div>
          <div className={styles.campo}>
            <label className={styles.etiqueta} htmlFor="cot-fecha-portada">
              Fecha
            </label>
            <input
              id="cot-fecha-portada"
              type="date"
              className={styles.input}
              value={doc.issueDate}
              disabled={!editable}
              onChange={(e) => cambiar((d) => ({ ...d, issueDate: e.target.value }))}
            />
          </div>
          <div className={styles.campo}>
            <span className={styles.etiqueta}>Versión</span>
            <span className={`${styles.input} ${styles.inputFijo}`} aria-live="polite">
              {version}
            </span>
          </div>
        </div>
        <div className={styles.campo}>
          <span className={styles.etiqueta} id="cot-segmento">
            Segmento
          </span>
          <Segmentado
            etiqueta="Segmento"
            opciones={SEGMENTOS.map((s) => ({ valor: s, etiqueta: SEGMENTO_LABEL[s] }))}
            valor={doc.segmento}
            onValor={(s) => cambiar((d) => ({ ...d, segmento: s }))}
            deshabilitado={!editable}
          />
          <p className={styles.pista}>{QUE_CAMBIA[doc.segmento]}</p>
        </div>
      </div>
    </Hoja>
  );
}
