"use client";

import { useEffect, useMemo, useState, type ComponentType } from "react";
import AssignmentOutlinedIcon from "@mui/icons-material/AssignmentOutlined";
import PhotoCameraOutlinedIcon from "@mui/icons-material/PhotoCameraOutlined";
import DescriptionOutlinedIcon from "@mui/icons-material/DescriptionOutlined";
import BusinessOutlinedIcon from "@mui/icons-material/BusinessOutlined";
import AccountTreeOutlinedIcon from "@mui/icons-material/AccountTreeOutlined";
import HowToRegOutlinedIcon from "@mui/icons-material/HowToRegOutlined";
import FlightTakeoffOutlinedIcon from "@mui/icons-material/FlightTakeoffOutlined";
import ReceiptLongOutlinedIcon from "@mui/icons-material/ReceiptLongOutlined";
import OpenInNewIcon from "@mui/icons-material/OpenInNew";
import styles from "../WorkspaceChat.module.css";
import { apiFetch } from "./chat-utils";
import { tonoDeEstado } from "./folios";
import {
  ETIQUETA_TIPO,
  LISTA_DE_TIPO,
  refsDelMensaje,
  type RefLiga,
  type TarjetaLiga,
  type TipoLiga,
} from "@/lib/ligas";

/*
 * Tarjetas de las ligas de un mensaje: actividad, evidencia, cotización, cliente, proyecto,
 * asistencia de una persona en un día, viático y factura. Un solo endpoint (`POST chat/ligas`) las
 * arma con los permisos de quien las ve; sin acceso queda compacta con el título genérico.
 *
 * Las peticiones de todas las tarjetas que se pintan a la vez (una página de mensajes) se juntan en
 * una sola llamada, y cada liga se pide una vez por sesión.
 */

type IconoMui = ComponentType<{ "aria-hidden"?: boolean | "true"; sx?: Record<string, unknown> }>;

export const ICONO_TIPO: Record<TipoLiga, IconoMui> = {
  actividad: AssignmentOutlinedIcon,
  evidencia: PhotoCameraOutlinedIcon,
  cotizacion: DescriptionOutlinedIcon,
  cliente: BusinessOutlinedIcon,
  proyecto: AccountTreeOutlinedIcon,
  asistencia: HowToRegOutlinedIcon,
  viatico: FlightTakeoffOutlinedIcon,
  factura: ReceiptLongOutlinedIcon,
};

/** Comercial y dinero en verde de marca; operación en azul. */
const TIPOS_DE_MARCA = new Set<TipoLiga>(["cotizacion", "cliente", "viatico", "factura"]);

const resueltas = new Map<string, TarjetaLiga>();
const enVuelo = new Map<string, Promise<TarjetaLiga>>();
let cola: Array<{ clave: string; ref: RefLiga; token: string; listo: (t: TarjetaLiga) => void }> = [];
let temporizador: ReturnType<typeof setTimeout> | null = null;

/** Solo para pruebas: vacía la caché entre casos. */
export function limpiarCacheTarjetas() {
  resueltas.clear();
  enVuelo.clear();
  cola = [];
  if (temporizador) clearTimeout(temporizador);
  temporizador = null;
}

function claveDe(ref: string, token: string) {
  return `${token.slice(-16)}|${ref}`;
}

function sinCargar(ref: RefLiga): TarjetaLiga {
  return {
    ref: ref.ref,
    tipo: ref.tipo,
    acceso: false,
    folio: ref.folio,
    titulo: ref.folio ? `${ETIQUETA_TIPO[ref.tipo]} ${ref.folio}` : ETIQUETA_TIPO[ref.tipo],
    estado: null,
    detalle: [],
    monto: null,
    href: ref.ref.startsWith("/") ? ref.ref : LISTA_DE_TIPO[ref.tipo],
    motivo: "No se pudo cargar",
  };
}

async function vaciarCola() {
  temporizador = null;
  const tanda = cola;
  cola = [];
  const porToken = new Map<string, typeof tanda>();
  for (const p of tanda) porToken.set(p.token, [...(porToken.get(p.token) ?? []), p]);
  await Promise.all(
    [...porToken.entries()].map(async ([token, pedidos]) => {
      let mapa: Record<string, TarjetaLiga> = {};
      try {
        const data = await apiFetch("chat/ligas", token, {
          method: "POST",
          body: JSON.stringify({ refs: [...new Set(pedidos.map((p) => p.ref.ref))] }),
        });
        if (data && typeof data === "object") mapa = data as Record<string, TarjetaLiga>;
      } catch {
        mapa = {};
      }
      for (const p of pedidos) {
        const t = mapa[p.ref.ref] ?? sinCargar(p.ref);
        // Lo que falló por red se vuelve a pedir la próxima vez; lo demás queda en caché.
        if (mapa[p.ref.ref]) resueltas.set(p.clave, t);
        enVuelo.delete(p.clave);
        p.listo(t);
      }
    }),
  );
}

export function pedirTarjeta(ref: RefLiga, token: string): Promise<TarjetaLiga> {
  const clave = claveDe(ref.ref, token);
  const ya = resueltas.get(clave);
  if (ya) return Promise.resolve(ya);
  const curso = enVuelo.get(clave);
  if (curso) return curso;
  const promesa = new Promise<TarjetaLiga>((listo) => {
    cola.push({ clave, ref, token, listo });
    if (!temporizador) temporizador = setTimeout(() => void vaciarCola(), 25);
  });
  enVuelo.set(clave, promesa);
  return promesa;
}

function formatoMoneda(total: number, moneda: string | null) {
  try {
    return new Intl.NumberFormat("es-MX", { style: "currency", currency: moneda || "MXN" }).format(total);
  } catch {
    return `$${total.toFixed(2)}`;
  }
}

function Chip({ texto }: { texto: string }) {
  const cls = {
    proc: styles.chipProc,
    val: styles.chipVal,
    fin: styles.chipFin,
    alta: styles.chipAlta,
    neu: styles.chipNeu,
  }[tonoDeEstado(texto)];
  return <span className={`${styles.chip} ${cls}`}>{texto}</span>;
}

function Encabezado({ tipo, folio }: { tipo: TipoLiga; folio: string | null }) {
  const Icon = ICONO_TIPO[tipo];
  return (
    <>
      <span className={styles.ecardKind}>
        <Icon aria-hidden="true" sx={{ fontSize: 14 }} />
        {ETIQUETA_TIPO[tipo]}
      </span>
      {folio ? <span className={styles.ecardFolio}>{folio}</span> : null}
    </>
  );
}

function Abrir({ href, tipo, nombre }: { href: string; tipo: TipoLiga; nombre: string }) {
  return (
    <a className={styles.ecardOpen} href={href} aria-label={`Abrir ${ETIQUETA_TIPO[tipo].toLowerCase()} ${nombre}`}>
      Abrir
      <OpenInNewIcon aria-hidden="true" sx={{ fontSize: 13 }} />
    </a>
  );
}

export function LigaCard({ liga, token }: { liga: RefLiga; token: string }) {
  const clave = claveDe(liga.ref, token);
  const [datos, setDatos] = useState<TarjetaLiga | null>(() => resueltas.get(clave) ?? null);

  useEffect(() => {
    let vivo = true;
    const ya = resueltas.get(clave);
    if (ya) {
      setDatos(ya);
      return;
    }
    void pedirTarjeta(liga, token).then((d) => {
      if (vivo) setDatos(d);
    });
    return () => {
      vivo = false;
    };
    // `clave` resume la ruta y el token.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clave]);

  const tipo = datos?.tipo ?? liga.tipo;
  const cls = `${styles.ecard} ${TIPOS_DE_MARCA.has(tipo) ? styles.ecardQuote : ""}`;
  const nombre = datos?.folio || datos?.titulo || liga.folio || "";

  if (!datos) {
    return (
      <div className={cls} role="group" aria-busy="true" aria-label={`${ETIQUETA_TIPO[tipo]} ${liga.folio ?? ""}`.trim()}>
        <div className={styles.ecardStrip} />
        <div className={styles.ecardIn}>
          <div className={styles.ecardTop}>
            <Encabezado tipo={tipo} folio={liga.folio} />
          </div>
          <div className={styles.ecardLoading}>Cargando…</div>
        </div>
      </div>
    );
  }

  if (!datos.acceso) {
    return (
      <div className={`${cls} ${styles.ecardCompact}`} role="group" aria-label={datos.titulo}>
        <div className={styles.ecardStrip} />
        <div className={styles.ecardIn}>
          <div className={styles.ecardTop}>
            <Encabezado tipo={tipo} folio={datos.folio} />
            {datos.motivo ? <span className={styles.ecardHint}>{datos.motivo}</span> : null}
            <Abrir href={datos.href} tipo={tipo} nombre={nombre} />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={cls} role="group" aria-label={`${ETIQUETA_TIPO[tipo]} ${nombre}`}>
      <div className={styles.ecardStrip} />
      <div className={styles.ecardIn}>
        <div className={styles.ecardTop}>
          <Encabezado tipo={tipo} folio={datos.folio} />
          <span className={styles.ecardChips}>{datos.estado ? <Chip texto={datos.estado} /> : null}</span>
        </div>
        <div className={styles.ecardTitle}>{datos.titulo}</div>
        <div className={styles.ecardMeta}>
          {datos.detalle.map((d) => (
            <span key={d}>{d}</span>
          ))}
          {datos.monto ? (
            <span>
              <b className={styles.ecardNum}>{formatoMoneda(datos.monto.total, datos.monto.moneda)}</b>
              <small>{datos.monto.moneda}</small>
            </span>
          ) : null}
          <Abrir href={datos.href} tipo={tipo} nombre={nombre} />
        </div>
      </div>
    </div>
  );
}

/** Tarjetas de las ligas que trae el cuerpo del mensaje (hasta tres). */
export default function EntityCards({ body, token }: { body: string; token: string }) {
  const ligas = useMemo(() => refsDelMensaje(body), [body]);
  if (!ligas.length || !token) return null;
  return (
    <div className={styles.ecards}>
      {ligas.map((l) => (
        <LigaCard key={l.ref} liga={l} token={token} />
      ))}
    </div>
  );
}
