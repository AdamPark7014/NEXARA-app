"use client";

import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent } from "react";
import DescriptionOutlinedIcon from "@mui/icons-material/DescriptionOutlined";
import PersonAddAlt1OutlinedIcon from "@mui/icons-material/PersonAddAlt1Outlined";
import { Badge, Button, DateInput, Input } from "@/components/base";
import { DatosClienteOpcionales } from "@/components/erp/DatosCliente";
import { useUser } from "@/components/UserContext";
import { clientSectorsForUser } from "@/lib/client-sectors";
import { formatApiError } from "@/lib/erp-api";
import { createSalesClient, getClientPermissions, listSalesClients, type SalesClient } from "@/lib/sales-api";
import { SEGMENTOS, SEGMENTO_LABEL, type Segmento } from "@/lib/cotizaciones-api";
import type { DocumentoCotizacion } from "@/lib/cotizacion-documento";
import { Ayuda, Campo, Hoja, Segmentado, TextoAuto } from "./campos";
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
  const { user } = useUser();
  const [clientes, setClientes] = useState<SalesClient[] | null>(null);
  const [puedeAgregar, setPuedeAgregar] = useState(false);
  const [puedeEditar, setPuedeEditar] = useState(false);
  const [creando, setCreando] = useState(false);
  const [errorAlta, setErrorAlta] = useState<string | null>(null);
  const [abierto, setAbierto] = useState(false);
  const [activo, setActivo] = useState(0);
  const listaId = useId();
  const pedido = useRef(false);
  const porTeclado = useRef(false);

  const cargar = () => {
    if (pedido.current || !token) return;
    pedido.current = true;
    listSalesClients(token, { sector: "COMERCIAL" })
      .then(setClientes)
      .catch(() => setClientes([]));
  };

  useEffect(() => {
    if (autoFocus) cargar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoFocus, token]);

  useEffect(() => {
    if (!token) return;
    let vivo = true;
    getClientPermissions(token)
      .then((p) => {
        if (!vivo) return;
        setPuedeAgregar(Boolean(p?.puedeAgregar));
        setPuedeEditar(Boolean(p?.puedeEditar));
      })
      .catch(() => {
        if (!vivo) return;
        setPuedeAgregar(false);
        setPuedeEditar(false);
      });
    return () => {
      vivo = false;
    };
  }, [token]);

  const coincidencias = useMemo(() => {
    const q = doc.clientName.trim().toLowerCase();
    const todos = clientes ?? [];
    const filtrados = q
      ? todos.filter((c) => `${c.name} ${c.legalName ?? ""}`.toLowerCase().includes(q))
      : todos;
    return filtrados.slice(0, 100);
  }, [clientes, doc.clientName]);

  useEffect(() => {
    if (!porTeclado.current) return;
    porTeclado.current = false;
    document.getElementById(`${listaId}-${activo}`)?.scrollIntoView({ block: "nearest" });
  }, [activo, listaId]);

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
      porTeclado.current = true;
      setActivo((a) => Math.min(coincidencias.length - 1, a + 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      porTeclado.current = true;
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
  const puedeCrearComercial = puedeAgregar && clientSectorsForUser(user).includes("COMERCIAL");
  const puedeEditarComercial = puedeEditar && clientSectorsForUser(user).includes("COMERCIAL");

  const crearAhora = () => {
    const nombre = doc.clientName.trim();
    if (!token || nombre.length < 2 || !puedeCrearComercial) return;
    setCreando(true);
    setErrorAlta(null);
    createSalesClient(token, { name: nombre, status: "Activo", tipo: "COMERCIAL", sectors: ["COMERCIAL"] })
      .then((creado) => {
        setClientes((prev) => {
          const lista = (prev ?? []).filter((c) => c.id !== creado.id);
          return [...lista, creado].sort((a, b) => a.name.localeCompare(b.name, "es"));
        });
        elegir(creado);
      })
      .catch((e) => setErrorAlta(formatApiError(e, "No se pudo crear el cliente")))
      .finally(() => setCreando(false));
  };

  return (
    <div className={styles.combo}>
      <Input
        id={id}
        value={doc.clientName}
        autoComplete="off"
        autoFocus={autoFocus}
        placeholder="Buscar o escribir cliente"
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
        <ul
          id={listaId}
          role="listbox"
          className={styles.opciones}
          onMouseDown={(e) => e.preventDefault()}
        >
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
        puedeCrearComercial ? (
          <Button
            variant="tonal"
            size="sm"
            className={styles.comboAccion}
            iconStart={<PersonAddAlt1OutlinedIcon />}
            loading={creando}
            disabled={doc.clientName.trim().length < 2}
            onMouseDown={(e) => e.preventDefault()}
            onClick={crearAhora}
          >
            {creando ? "Creando…" : "Crear cliente comercial"}
          </Button>
        ) : (
          <Badge
            tone="neutral"
            size="sm"
            className={styles.comboAccion}
            title="Solo quien atiende el sector comercial puede dar de alta clientes aquí"
          >
            Elige un cliente comercial que ya exista
          </Badge>
        )
      ) : null}
      {errorAlta ? (
        <p className={styles.pistaError} role="alert">
          {errorAlta}
        </p>
      ) : null}
      <DatosClienteOpcionales
        token={token}
        clientId={doc.salesClientId}
        puedeEditar={editable && puedeEditarComercial}
      />
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
    <Hoja
      id="portada"
      numero=""
      titulo="Portada"
      icono={<DescriptionOutlinedIcon />}
      descripcion="Proyecto, cliente y datos fiscales: lo primero que ve el cliente."
      ayuda="Lo primero que ve el cliente: el título del proyecto, para quién es, la fecha y la versión. El folio lo emite el servidor al guardar."
    >
      <div className={styles.campos}>
        <Campo etiqueta="Título del proyecto" htmlFor="cot-proyecto">
          <TextoAuto
            id="cot-proyecto"
            variante="portada"
            value={doc.projectName}
            onValor={(v) => cambiar((d) => ({ ...d, projectName: v.replace(/\n/g, " ") }))}
            placeholder="Renovación del sistema de CCTV"
            disabled={!editable}
          />
        </Campo>
        <div className={styles.portadaCampos}>
          <Campo etiqueta="Cliente" htmlFor="cot-cliente">
            <ClienteCombo doc={doc} cambiar={cambiar} token={token} editable={editable} id="cot-cliente" autoFocus={esNueva} />
          </Campo>
          <Campo etiqueta="Fecha" htmlFor="cot-fecha-portada">
            <DateInput
              id="cot-fecha-portada"
              value={doc.issueDate}
              disabled={!editable}
              onChange={(e) => cambiar((d) => ({ ...d, issueDate: e.target.value }))}
            />
          </Campo>
          <Campo etiqueta="Versión">
            <span className={styles.inputFijo} aria-live="polite">
              {version}
            </span>
          </Campo>
        </div>
        <div className={styles.campo}>
          <span className={styles.etiquetaConAyuda}>
            <span className={styles.etiqueta}>Segmento</span>
            <Ayuda titulo="el segmento">{QUE_CAMBIA[doc.segmento]}</Ayuda>
          </span>
          <Segmentado
            etiqueta="Segmento"
            opciones={SEGMENTOS.map((s) => ({ valor: s, etiqueta: SEGMENTO_LABEL[s] }))}
            valor={doc.segmento}
            onValor={(s) => cambiar((d) => ({ ...d, segmento: s }))}
            deshabilitado={!editable}
          />
        </div>
      </div>
    </Hoja>
  );
}
