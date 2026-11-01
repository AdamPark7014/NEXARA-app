"use client";

import { useCallback, useEffect, useId, useMemo, useRef, useState, type KeyboardEvent } from "react";
import DescriptionOutlinedIcon from "@mui/icons-material/DescriptionOutlined";
import PersonAddAlt1OutlinedIcon from "@mui/icons-material/PersonAddAlt1Outlined";
import { Badge, Button, DateInput, Input } from "@/components/base";
import { DatosClienteOpcionales } from "@/components/erp/DatosCliente";
import { AvisoParecidos, useAltaCliente, useParecidosEnVivo } from "@/components/erp/ClienteRapido";
import { useUser } from "@/components/UserContext";
import { clientSectorsForUser } from "@/lib/client-sectors";
import { getClientPermissions, listSalesClients, type SalesClient } from "@/lib/sales-api";
import { SEGMENTOS, SEGMENTO_LABEL, type Segmento } from "@/lib/cotizaciones-api";
import type { DocumentoCotizacion } from "@/lib/cotizacion-documento";
import { Ayuda, Campo, Hoja, Segmentado, TextoAuto } from "./campos";
import PuntosPortada from "./PuntosPortada";
import type { BloqueAlcance } from "@/lib/cotizaciones-api";
import styles from "./editor.module.css";

const QUE_CAMBIA: Record<Segmento, string> = {
  COMERCIAL: "Venta a empresa o negocio: los términos dicen «solo suministro» o «suministro e instalación» según lo que cobres.",
  OBRA: "Obra: siempre suministro e instalación, con exclusiones y entrega de obra.",
  LICITACION: "Licitación: pago, vigencia y entrega los fijan las bases; no se pide anticipo.",
  SERVICIO: "Servicio o mantenimiento: entrega con reporte de lo atendido.",
};

type Cambiar = (cambio: (doc: DocumentoCotizacion) => DocumentoCotizacion) => void;

/**
 * Buscador de cliente: elige uno del padrón o crea uno con el nombre. Escribir solo guarda el texto
 * en el borrador: el autoguardado no da de alta a nadie (así nacieron «Benemer» y «Bodega de»).
 */
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
  const [puedeAltaRapida, setPuedeAltaRapida] = useState(false);
  const [puedeEditar, setPuedeEditar] = useState(false);
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
        setPuedeAltaRapida(Boolean(p?.puedeAltaRapida));
        setPuedeEditar(Boolean(p?.puedeEditar));
      })
      .catch(() => {
        if (!vivo) return;
        setPuedeAltaRapida(false);
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

  const elegir = useCallback(
    (c: SalesClient) => {
      cambiar((d) => ({
        ...d,
        salesClientId: c.id,
        clientName: c.name,
        clientCompany: c.legalName ?? "",
        clientEmail: d.clientEmail || c.billingEmail || "",
        clientPhone: d.clientPhone || c.billingPhone || "",
      }));
      setAbierto(false);
    },
    [cambiar],
  );

  const armarAlta = useCallback(
    (nombre: string) => ({ name: nombre, status: "Activo" as const, tipo: "COMERCIAL" as const, altaRapida: true }),
    [],
  );
  const alListo = useCallback(
    (creado: SalesClient) => {
      setClientes((prev) => {
        const lista = (prev ?? []).filter((c) => c.id !== creado.id);
        return [...lista, creado].sort((a, b) => a.name.localeCompare(b.name, "es"));
      });
      elegir(creado);
    },
    [elegir],
  );
  const alta = useAltaCliente({ token, armar: armarAlta, onListo: alListo });

  const sinLigar = Boolean(doc.clientName.trim()) && !doc.salesClientId;
  const parecidos = useParecidosEnVivo(token, doc.clientName, sinLigar && abierto && !alta.aviso);
  const sugeridos = useMemo(() => {
    const ya = new Set(coincidencias.map((c) => c.id));
    return parecidos.filter((p) => p.puedeUsar && !ya.has(p.id));
  }, [parecidos, coincidencias]);

  useEffect(() => {
    if (!porTeclado.current) return;
    porTeclado.current = false;
    document.getElementById(`${listaId}-${activo}`)?.scrollIntoView({ block: "nearest" });
  }, [activo, listaId]);

  const nombreEscrito = doc.clientName.trim();
  const exacto = clientes?.some((c) => c.id === doc.salesClientId);
  const hayQueCrear = Boolean(nombreEscrito) && !doc.salesClientId && Boolean(clientes) && !exacto;
  const ofreceCrear = hayQueCrear && puedeAltaRapida && nombreEscrito.length >= 2;
  const totalOpciones = sugeridos.length + coincidencias.length + (ofreceCrear ? 1 : 0);

  const elegirOpcion = (i: number) => {
    setAbierto(false);
    if (i < sugeridos.length) void alta.usar(sugeridos[i]);
    else if (i < sugeridos.length + coincidencias.length) elegir(coincidencias[i - sugeridos.length]);
    else if (ofreceCrear) void alta.pedir(nombreEscrito);
  };

  const alTeclear = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Escape") {
      setAbierto(false);
      return;
    }
    if (!abierto || !totalOpciones) {
      if (e.key === "ArrowDown") setAbierto(true);
      return;
    }
    if (e.key === "ArrowDown") {
      e.preventDefault();
      porTeclado.current = true;
      setActivo((a) => Math.min(totalOpciones - 1, a + 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      porTeclado.current = true;
      setActivo((a) => Math.max(0, a - 1));
    } else if (e.key === "Enter") {
      e.preventDefault();
      elegirOpcion(activo);
    }
  };

  const mostrar = abierto && editable && totalOpciones > 0 && !alta.aviso;
  const puedeEditarComercial = puedeEditar && clientSectorsForUser(user).includes("COMERCIAL");

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
          // Escribir otro nombre desliga el cliente: queda como texto hasta que lo elijan o lo creen.
          if (alta.aviso || alta.error) alta.descartar();
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
          {sugeridos.map((p, i) => (
            <li
              key={`p${p.id}`}
              id={`${listaId}-${i}`}
              role="option"
              aria-selected={i === activo}
              className={`${styles.opcion} ${i === activo ? styles.opcionActiva : ""}`}
              onMouseDown={(e) => {
                e.preventDefault();
                elegirOpcion(i);
              }}
              onMouseEnter={() => setActivo(i)}
            >
              <span>{p.nombre}</span>
              <small>Se parece: {p.porque.toLowerCase()}</small>
            </li>
          ))}
          {coincidencias.map((c, j) => {
            const i = sugeridos.length + j;
            return (
              <li
                key={c.id}
                id={`${listaId}-${i}`}
                role="option"
                aria-selected={i === activo}
                className={`${styles.opcion} ${i === activo ? styles.opcionActiva : ""}`}
                onMouseDown={(e) => {
                  e.preventDefault();
                  elegirOpcion(i);
                }}
                onMouseEnter={() => setActivo(i)}
              >
                <span>{c.name}</span>
                {c.legalName && c.legalName !== c.name ? <small>{c.legalName}</small> : null}
                {c.billingEmail ? <small>{c.billingEmail}</small> : null}
              </li>
            );
          })}
          {ofreceCrear ? (
            <li
              id={`${listaId}-${totalOpciones - 1}`}
              role="option"
              aria-selected={activo === totalOpciones - 1}
              className={`${styles.opcion} ${activo === totalOpciones - 1 ? styles.opcionActiva : ""}`}
              onMouseDown={(e) => {
                e.preventDefault();
                elegirOpcion(totalOpciones - 1);
              }}
              onMouseEnter={() => setActivo(totalOpciones - 1)}
            >
              <span>Crear «{nombreEscrito}» con solo el nombre</span>
              <small>Sus datos se completan después en Clientes</small>
            </li>
          ) : null}
        </ul>
      ) : null}
      {hayQueCrear && !alta.aviso && !mostrar ? (
        puedeAltaRapida ? (
          <Button
            variant="tonal"
            size="sm"
            className={styles.comboAccion}
            iconStart={<PersonAddAlt1OutlinedIcon />}
            loading={alta.ocupado}
            disabled={doc.clientName.trim().length < 2}
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => void alta.pedir(doc.clientName)}
          >
            {alta.ocupado ? "Revisando si ya existe…" : `Crear «${doc.clientName.trim()}» con solo el nombre`}
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
      {alta.aviso ? (
        <div className={styles.comboAccion}>
          <AvisoParecidos
            nombre={alta.aviso.nombre}
            parecidos={alta.aviso.parecidos}
            ocupado={alta.ocupado}
            onUsar={(p) => void alta.usar(p)}
            onCrearOtro={alta.crearOtro}
            onCancelar={alta.descartar}
          />
        </div>
      ) : null}
      {alta.error ? (
        <p className={styles.pistaError} role="alert">
          {alta.error}
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
  puntosSugeridos,
  hayPlanos,
}: {
  doc: DocumentoCotizacion;
  cambiar: Cambiar;
  token: string | null;
  editable: boolean;
  version: string;
  esNueva: boolean;
  /** Los puntos por omisión de esta cotización; null mientras no se ha guardado. */
  puntosSugeridos: BloqueAlcance[] | null;
  hayPlanos: boolean;
}) {
  return (
    <Hoja
      id="portada"
      numero=""
      titulo="Portada"
      icono={<DescriptionOutlinedIcon />}
      descripcion="Proyecto, cliente y datos fiscales: lo primero que ve el cliente."
      ayuda="La portada lleva el diseño de NEXARA, la versión y el índice de esta cotización; el título del proyecto, el cliente y la fecha van en la hoja siguiente. El folio lo emite el servidor al guardar."
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
        <PuntosPortada doc={doc} cambiar={cambiar} editable={editable} sugeridos={puntosSugeridos} hayPlanos={hayPlanos} />
      </div>
    </Hoja>
  );
}
