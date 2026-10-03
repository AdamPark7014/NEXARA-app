"use client";

import { useEffect, useMemo, useState } from "react";
import AssignmentOutlinedIcon from "@mui/icons-material/AssignmentOutlined";
import DescriptionOutlinedIcon from "@mui/icons-material/DescriptionOutlined";
import PersonOutlineIcon from "@mui/icons-material/PersonOutline";
import ScheduleOutlinedIcon from "@mui/icons-material/ScheduleOutlined";
import OpenInNewIcon from "@mui/icons-material/OpenInNew";
import styles from "../WorkspaceChat.module.css";
import { apiFetch } from "./chat-utils";
import { detectarFolios, tonoDeEstado, type FolioDetectado, type FolioTipo } from "./folios";

/*
 * Tarjetas de folio dentro del mensaje (dirección B).
 *
 * Solo usa endpoints que ya existen:
 *   Actividad   `GET chat/mentions?kind=ACTIVITY&q=<folio>` (id, título y estatus, con el alcance
 *               del chat) y `GET activities/:id` para responsable, prioridad y fecha.
 *   Cotización  `GET cotizaciones/core?search=<folio>` (folio, cliente, estado, total, quién la hizo).
 * Si la persona no tiene permiso o el folio no aparece, la tarjeta queda compacta: folio y enlace.
 */

export type TarjetaActividad = {
  tipo: "actividad";
  folio: string;
  id: number;
  titulo: string;
  estatus: string | null;
  prioridad: string | null;
  responsable: string | null;
  fecha: string | null;
  href: string;
};

export type TarjetaCotizacion = {
  tipo: "cotizacion";
  folio: string;
  id: number;
  titulo: string;
  estado: string | null;
  cliente: string | null;
  total: number | null;
  moneda: string | null;
  elaboro: string | null;
  href: string;
};

export type TarjetaCompacta = {
  tipo: "compacta";
  de: FolioTipo;
  folio: string;
  href: string;
  motivo: string;
};

export type DatosTarjeta = TarjetaActividad | TarjetaCotizacion | TarjetaCompacta;

const pendientes = new Map<string, Promise<DatosTarjeta>>();
const resueltas = new Map<string, DatosTarjeta>();

/** Solo para pruebas: vacía la caché entre casos. */
export function limpiarCacheTarjetas() {
  pendientes.clear();
  resueltas.clear();
}

function claveDe(f: FolioDetectado, token: string) {
  return `${token.slice(-16)}|${f.tipo}|${f.folio}|${f.id ?? ""}`;
}

type MencionActividad = { kind: string; id: number; label: string; subtitle?: string | null };

function folioDeEtiqueta(label: string) {
  return label.split(" · ")[0]!.trim().toUpperCase();
}

function tituloDeEtiqueta(label: string) {
  const i = label.indexOf(" · ");
  return i >= 0 ? label.slice(i + 3).trim() : label.trim();
}

async function buscarMencion(folio: string, token: string, id?: number): Promise<MencionActividad | null> {
  const lista = await apiFetch(`chat/mentions?kind=ACTIVITY&q=${encodeURIComponent(folio)}`, token).catch(() => null);
  if (!Array.isArray(lista)) return null;
  const actividades = (lista as MencionActividad[]).filter((e) => e?.kind === "ACTIVITY");
  return (
    actividades.find((e) => (id ? e.id === id : false)) ??
    actividades.find((e) => folioDeEtiqueta(e.label ?? "") === folio) ??
    null
  );
}

type DetalleActividad = {
  id: number;
  anNumber?: string | null;
  titulo?: string | null;
  estatus?: string | null;
  prioridad?: string | null;
  fechaMaxima?: string | null;
  fechaEntregaEsperada?: string | null;
  responsable?: { nombre?: string | null } | null;
};

async function resolverActividad(f: FolioDetectado, token: string): Promise<DatosTarjeta> {
  const mencion = f.id ? null : await buscarMencion(f.folio, token);
  const id = f.id ?? mencion?.id;
  if (!id) {
    return { tipo: "compacta", de: "actividad", folio: f.folio, href: "/erp/actividades", motivo: "No aparece en tus actividades" };
  }
  const detalle = (await apiFetch(`activities/${id}`, token).catch(() => null)) as DetalleActividad | null;
  const respaldo = detalle ? null : mencion ?? (await buscarMencion(f.folio, token, id));
  if (!detalle && !respaldo) {
    return { tipo: "compacta", de: "actividad", folio: f.folio, href: `/erp/actividades/${id}`, motivo: "Sin acceso al detalle" };
  }
  return {
    tipo: "actividad",
    folio: (detalle?.anNumber || f.folio).toUpperCase(),
    id,
    titulo: detalle?.titulo || (respaldo ? tituloDeEtiqueta(respaldo.label) : f.folio),
    estatus: detalle?.estatus ?? respaldo?.subtitle ?? null,
    prioridad: detalle?.prioridad ?? null,
    responsable: detalle?.responsable?.nombre ?? null,
    fecha: detalle?.fechaMaxima ?? detalle?.fechaEntregaEsperada ?? null,
    href: `/erp/actividades/${id}`,
  };
}

type FilaCotizacion = {
  id: number;
  folio: string;
  projectName?: string | null;
  clienteNombre?: string | null;
  clienteEmpresa?: string | null;
  estadoEtiqueta?: string | null;
  estado?: string | null;
  total?: number | null;
  currency?: string | null;
  elaboro?: { nombre?: string | null } | null;
};

async function resolverCotizacion(f: FolioDetectado, token: string): Promise<DatosTarjeta> {
  let filas: FilaCotizacion[] | null = null;
  try {
    const data = await apiFetch(`cotizaciones/core?search=${encodeURIComponent(f.folio)}&limit=5`, token);
    filas = Array.isArray(data) ? (data as FilaCotizacion[]) : [];
  } catch {
    return { tipo: "compacta", de: "cotizacion", folio: f.folio, href: "/erp/cotizaciones", motivo: "Sin acceso a cotizaciones" };
  }
  const igual = (r: FilaCotizacion) => String(r.folio ?? "").toUpperCase();
  const fila =
    filas.find((r) => igual(r) === f.folio) ??
    filas.find((r) => igual(r).startsWith(`${f.folio}-`) || f.folio.startsWith(`${igual(r)}-`));
  if (!fila) {
    return { tipo: "compacta", de: "cotizacion", folio: f.folio, href: "/erp/cotizaciones", motivo: "No se encontró la cotización" };
  }
  const cliente = fila.clienteEmpresa || fila.clienteNombre || null;
  return {
    tipo: "cotizacion",
    folio: fila.folio,
    id: fila.id,
    titulo: fila.projectName || cliente || fila.folio,
    estado: fila.estadoEtiqueta ?? fila.estado ?? null,
    cliente,
    total: typeof fila.total === "number" ? fila.total : null,
    moneda: fila.currency ?? null,
    elaboro: fila.elaboro?.nombre ?? null,
    href: `/erp/cotizaciones/${fila.id}`,
  };
}

export function resolverTarjeta(f: FolioDetectado, token: string): Promise<DatosTarjeta> {
  const clave = claveDe(f, token);
  const enCurso = pendientes.get(clave);
  if (enCurso) return enCurso;
  const promesa = (f.tipo === "actividad" ? resolverActividad(f, token) : resolverCotizacion(f, token)).then((d) => {
    resueltas.set(clave, d);
    return d;
  });
  pendientes.set(clave, promesa);
  return promesa;
}

function formatoMoneda(total: number, moneda: string | null) {
  try {
    return new Intl.NumberFormat("es-MX", { style: "currency", currency: moneda || "MXN" }).format(total);
  } catch {
    return `$${total.toFixed(2)}`;
  }
}

function formatoFecha(iso: string) {
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return "";
  return d.toLocaleString("es-MX", {
    timeZone: "America/Mexico_City",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

const ETIQUETA: Record<FolioTipo, string> = { actividad: "Actividad", cotizacion: "Cotización" };

function Encabezado({ de, folio }: { de: FolioTipo; folio: string }) {
  const Icon = de === "actividad" ? AssignmentOutlinedIcon : DescriptionOutlinedIcon;
  return (
    <>
      <span className={styles.ecardKind}>
        <Icon aria-hidden="true" sx={{ fontSize: 14 }} />
        {ETIQUETA[de]}
      </span>
      <span className={styles.ecardFolio}>{folio}</span>
    </>
  );
}

function Abrir({ href, de, folio }: { href: string; de: FolioTipo; folio: string }) {
  return (
    <a className={styles.ecardOpen} href={href} aria-label={`Abrir ${ETIQUETA[de].toLowerCase()} ${folio}`}>
      Abrir
      <OpenInNewIcon aria-hidden="true" sx={{ fontSize: 13 }} />
    </a>
  );
}

function Chip({ texto, tono }: { texto: string; tono: ReturnType<typeof tonoDeEstado> }) {
  const cls = {
    proc: styles.chipProc,
    val: styles.chipVal,
    fin: styles.chipFin,
    alta: styles.chipAlta,
    neu: styles.chipNeu,
  }[tono];
  return <span className={`${styles.chip} ${cls}`}>{texto}</span>;
}

export function EntityCard({ folio, token }: { folio: FolioDetectado; token: string }) {
  const clave = claveDe(folio, token);
  const [datos, setDatos] = useState<DatosTarjeta | null>(() => resueltas.get(clave) ?? null);

  useEffect(() => {
    let vivo = true;
    const ya = resueltas.get(clave);
    if (ya) {
      setDatos(ya);
      return;
    }
    void resolverTarjeta(folio, token).then((d) => {
      if (vivo) setDatos(d);
    });
    return () => {
      vivo = false;
    };
    // `clave` resume folio, id y token.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clave]);

  const de: FolioTipo = datos?.tipo === "compacta" ? datos.de : folio.tipo;
  const quote = de === "cotizacion";
  const cls = `${styles.ecard} ${quote ? styles.ecardQuote : ""}`;

  if (!datos) {
    return (
      <div className={cls} role="group" aria-busy="true" aria-label={`${ETIQUETA[de]} ${folio.folio}`}>
        <div className={styles.ecardStrip} />
        <div className={styles.ecardIn}>
          <div className={styles.ecardTop}>
            <Encabezado de={de} folio={folio.folio} />
          </div>
          <div className={styles.ecardLoading}>Cargando…</div>
        </div>
      </div>
    );
  }

  if (datos.tipo === "compacta") {
    return (
      <div className={`${cls} ${styles.ecardCompact}`} role="group" aria-label={`${ETIQUETA[de]} ${datos.folio}`}>
        <div className={styles.ecardStrip} />
        <div className={styles.ecardIn}>
          <div className={styles.ecardTop}>
            <Encabezado de={de} folio={datos.folio} />
            <span className={styles.ecardHint}>{datos.motivo}</span>
            <Abrir href={datos.href} de={de} folio={datos.folio} />
          </div>
        </div>
      </div>
    );
  }

  if (datos.tipo === "actividad") {
    const alta = datos.prioridad && /(alta|urgent|crit)/i.test(datos.prioridad);
    return (
      <div className={cls} role="group" aria-label={`Actividad ${datos.folio}`}>
        <div className={styles.ecardStrip} />
        <div className={styles.ecardIn}>
          <div className={styles.ecardTop}>
            <Encabezado de="actividad" folio={datos.folio} />
            <span className={styles.ecardChips}>
              {datos.prioridad ? (
                <Chip texto={`Prioridad ${datos.prioridad.toLowerCase()}`} tono={alta ? "alta" : "neu"} />
              ) : null}
              {datos.estatus ? <Chip texto={datos.estatus} tono={tonoDeEstado(datos.estatus)} /> : null}
            </span>
          </div>
          <div className={styles.ecardTitle}>{datos.titulo}</div>
          <div className={styles.ecardMeta}>
            {datos.responsable ? (
              <span>
                <PersonOutlineIcon aria-hidden="true" sx={{ fontSize: 14 }} />
                <b>{datos.responsable}</b>
              </span>
            ) : null}
            {datos.fecha ? (
              <span>
                <ScheduleOutlinedIcon aria-hidden="true" sx={{ fontSize: 14 }} />
                {formatoFecha(datos.fecha)}
              </span>
            ) : null}
            <Abrir href={datos.href} de="actividad" folio={datos.folio} />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={cls} role="group" aria-label={`Cotización ${datos.folio}`}>
      <div className={styles.ecardStrip} />
      <div className={styles.ecardIn}>
        <div className={styles.ecardTop}>
          <Encabezado de="cotizacion" folio={datos.folio} />
          <span className={styles.ecardChips}>
            {datos.estado ? <Chip texto={datos.estado} tono={tonoDeEstado(datos.estado)} /> : null}
          </span>
        </div>
        <div className={styles.ecardTitle}>{datos.titulo}</div>
        <div className={styles.ecardMeta}>
          {datos.cliente && datos.cliente !== datos.titulo ? (
            <span>
              <PersonOutlineIcon aria-hidden="true" sx={{ fontSize: 14 }} />
              {datos.cliente}
            </span>
          ) : null}
          {datos.elaboro ? <span>Elaboró {datos.elaboro}</span> : null}
          {datos.total != null ? (
            <span>
              <b className={styles.ecardNum}>{formatoMoneda(datos.total, datos.moneda)}</b>
              {datos.moneda ? <small>{datos.moneda}</small> : null}
            </span>
          ) : null}
          <Abrir href={datos.href} de="cotizacion" folio={datos.folio} />
        </div>
      </div>
    </div>
  );
}

/** Tarjetas de los folios que trae el cuerpo del mensaje (hasta tres). */
export default function EntityCards({ body, token }: { body: string; token: string }) {
  const folios = useMemo(() => detectarFolios(body), [body]);
  if (!folios.length || !token) return null;
  return (
    <div className={styles.ecards}>
      {folios.map((f) => (
        <EntityCard key={`${f.tipo}-${f.folio}`} folio={f} token={token} />
      ))}
    </div>
  );
}
