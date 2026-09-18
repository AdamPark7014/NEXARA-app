"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useUser } from "@/components/UserContext";
import {
  ESTADOS,
  ESTADO_LABEL,
  ESTADO_TONO,
  SEGMENTOS,
  SEGMENTO_LABEL,
  formatoFecha,
  formatoMoneda,
  listarCotizaciones,
  type CotizacionRow,
  type EstadoCotizacion,
  type Segmento,
} from "@/lib/cotizaciones-api";
import { partesDelFolio } from "@/lib/cotizacion-folio";
import FolioExplicado from "./_editor/FolioExplicado";
import styles from "./cotizaciones-core.module.css";

const ROL: Record<string, string> = {
  ELABORO: "Elaboró",
  LEVANTAMIENTO: "Levantamiento",
  REVISO: "Revisó",
  APROBO: "Aprobó",
  ENVIO: "Envió",
};

const CLAVE_EXPLICACION = "nexara.cotizaciones.explicaFolio";

function claseEstado(estado: EstadoCotizacion) {
  const tono = ESTADO_TONO[estado];
  const extra = tono === "info" ? styles.chipInfo : tono === "ok" ? styles.chipOk : tono === "alerta" ? styles.chipAlerta : "";
  return `${styles.badge} ${extra}`;
}

/** El folio con sus piezas en color: clave de quien la hizo, cadena y revisión. */
function FolioColor({ folio }: { folio: string }) {
  const partes = partesDelFolio(folio);
  if (!partes) return <span className={`${styles.folio} ${styles.folioViejo}`}>{folio}</span>;
  return (
    <span className={styles.folio} title={folio}>
      NEX-<span className={styles.folioClave}>{partes.nomenclatura}</span>-{String(partes.consecutivo).padStart(4, "0")}
      {partes.cadena.length ? (
        <>
          -<span className={styles.folioCadena}>{partes.cadena.join(".")}</span>
        </>
      ) : null}
      {partes.revision > 1 ? (
        <>
          -<span className={styles.folioRevision}>R{partes.revision}</span>
        </>
      ) : null}
    </span>
  );
}

/** «Luis Joel Aguilar · su #7 · R2»: el folio en palabras, corto para la fila. */
function folioEnPalabras(row: CotizacionRow): string {
  const partes = partesDelFolio(row.folio);
  if (!partes) return row.elaboro?.nombre ? `Hecha por ${row.elaboro.nombre}` : "Sin autor registrado";
  return [
    row.elaboro?.nombre || `Clave ${partes.nomenclatura}`,
    `su #${partes.consecutivo}`,
    partes.revision > 1 ? `revisión ${partes.revision}` : null,
  ]
    .filter(Boolean)
    .join(" · ");
}

/** Quién intervino, en orden y sin repetir. Si nadie quedó registrado, al menos quien la hizo. */
function Intervinieron({ row }: { row: CotizacionRow }) {
  const vistas = new Map<string, string[]>();
  for (const p of row.intervinieron) {
    if (!p.siglas) continue;
    const titulo = `${p.nombre || p.siglas} · ${ROL[p.rol] ?? p.rol}`;
    vistas.set(p.siglas, [...(vistas.get(p.siglas) ?? []), titulo]);
  }
  if (!vistas.size && row.elaboro?.siglas) {
    return (
      <span className={styles.siglasFila}>
        <span className={styles.siglasTenue} title={`${row.elaboro.nombre} · la hizo (sin más registro)`}>
          {row.elaboro.siglas}
        </span>
      </span>
    );
  }
  if (!vistas.size) return <span className={styles.rowSub}>—</span>;
  return (
    <span className={styles.siglasFila}>
      {[...vistas.entries()].map(([siglas, titulos]) => (
        <span key={siglas} className={styles.siglas} title={titulos.join("\n")}>
          {siglas}
        </span>
      ))}
    </span>
  );
}

export default function CotizacionesPage() {
  const { token } = useUser();
  const router = useRouter();
  const [items, setItems] = useState<CotizacionRow[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [segmento, setSegmento] = useState<Segmento | null>(null);
  const [estado, setEstado] = useState<EstadoCotizacion | null>(null);
  const [explicaAbierta, setExplicaAbierta] = useState(true);
  const buscador = useRef<HTMLInputElement>(null);

  useEffect(() => {
    try {
      if (window.localStorage.getItem(CLAVE_EXPLICACION) === "cerrada") setExplicaAbierta(false);
    } catch {
      /* sin almacenamiento: queda abierta */
    }
  }, []);

  const cargar = useCallback(async () => {
    if (!token) return;
    setCargando(true);
    setError(null);
    try {
      setItems(await listarCotizaciones(token));
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudieron cargar las cotizaciones");
      setItems([]);
    } finally {
      setCargando(false);
    }
  }, [token]);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  // «/» busca, «n» abre una nueva (fuera de campos de texto).
  useEffect(() => {
    const alTeclear = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      if (el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.isContentEditable)) return;
      if (e.key === "/") {
        e.preventDefault();
        buscador.current?.focus();
      } else if (e.key === "n" && !e.ctrlKey && !e.metaKey && !e.altKey) {
        router.push("/erp/cotizaciones/nueva");
      }
    };
    window.addEventListener("keydown", alTeclear);
    return () => window.removeEventListener("keydown", alTeclear);
  }, [router]);

  const coincideTexto = useCallback(
    (row: CotizacionRow) => {
      const texto = q.trim().toLowerCase();
      if (!texto) return true;
      return [
        row.folio,
        row.clienteNombre,
        row.clienteEmpresa,
        row.projectName,
        row.elaboro?.nombre,
        ...row.intervinieron.map((p) => `${p.nombre} ${p.siglas}`),
      ]
        .filter(Boolean)
        .some((v) => String(v).toLowerCase().includes(texto));
    },
    [q],
  );

  const visibles = useMemo(
    () =>
      items.filter(
        (row) => (!segmento || row.segmento === segmento) && (!estado || row.estado === estado) && coincideTexto(row),
      ),
    [items, segmento, estado, coincideTexto],
  );

  const conteoSegmento = useMemo(() => {
    const c: Record<string, number> = {};
    for (const row of items) if ((!estado || row.estado === estado) && coincideTexto(row)) c[row.segmento] = (c[row.segmento] ?? 0) + 1;
    return c;
  }, [items, estado, coincideTexto]);

  const conteoEstado = useMemo(() => {
    const c: Record<string, number> = {};
    for (const row of items) if ((!segmento || row.segmento === segmento) && coincideTexto(row)) c[row.estado] = (c[row.estado] ?? 0) + 1;
    return c;
  }, [items, segmento, coincideTexto]);

  const cifras = useMemo(() => {
    const sumar = (filtro: (r: CotizacionRow) => boolean) =>
      visibles.filter(filtro).reduce((acc, r) => acc + Number(r.total || 0), 0);
    return {
      total: sumar(() => true),
      enviadas: visibles.filter((r) => r.estado === "ENVIADA").length,
      porCerrar: sumar((r) => r.estado === "ENVIADA"),
      aprobadas: sumar((r) => r.estado === "APROBADA"),
      borradores: visibles.filter((r) => r.estado === "BORRADOR").length,
    };
  }, [visibles]);

  const viejos = items.filter((r) => r.necesitaRefolio).length;

  // El ejemplo de la explicación es una cotización real con nomenclatura, si la hay.
  const ejemplo =
    items.find((r) => partesDelFolio(r.folio)?.cadena.length) ?? items.find((r) => partesDelFolio(r.folio)) ?? null;

  const hayFiltros = Boolean(segmento || estado || q.trim());

  return (
    <div className={styles.wrap}>
      <div className={styles.top}>
        <div>
          <h1 className={styles.title}>Cotizaciones</h1>
          <p className={styles.sub}>
            Cada folio dice de quién es, qué número lleva, quién intervino y en qué revisión va. Se segmentan en
            comercial, obra, licitación y servicio.
          </p>
        </div>
        <Link className={styles.primaryBtn} href="/erp/cotizaciones/nueva">
          + Nueva cotización <span className={styles.tecla} aria-hidden>N</span>
        </Link>
      </div>

      <details
        className={styles.explica}
        open={explicaAbierta}
        onToggle={(e) => {
          const abierta = (e.currentTarget as HTMLDetailsElement).open;
          setExplicaAbierta(abierta);
          try {
            window.localStorage.setItem(CLAVE_EXPLICACION, abierta ? "abierta" : "cerrada");
          } catch {
            /* sin almacenamiento */
          }
        }}
      >
        <summary>¿Cómo se lee un folio?</summary>
        <div className={styles.explicaCuerpo}>
          <FolioExplicado
            folio={ejemplo?.folio ?? "NEX-LJ75100126-0007-JA.CE-R2"}
            elaboro={ejemplo?.elaboro ?? null}
            intervinieron={ejemplo?.intervinieron ?? []}
            revision={ejemplo?.revision}
          />
          <p>
            El folio lo emite el servidor al crear la cotización, con la nomenclatura de RH de quien la hace y su propio
            consecutivo. Al enviarla se agregan las siglas de quienes intervinieron (revisó, aprobó, envió) y, desde el
            segundo envío, la revisión. El segmento no va en el folio: es un filtro.
          </p>
        </div>
      </details>

      {!cargando && items.length ? (
        <div className={styles.stats}>
          <div className={styles.stat}>
            <span className={styles.statValue}>{visibles.length}</span>
            <span className={styles.statLabel}>cotizaciones en la vista</span>
          </div>
          <div className={styles.stat}>
            <span className={styles.statValue}>{cifras.borradores}</span>
            <span className={styles.statLabel}>borradores por terminar</span>
          </div>
          <div className={styles.stat}>
            <span className={styles.statValue}>{formatoMoneda(cifras.porCerrar)}</span>
            <span className={styles.statLabel}>enviadas por cerrar ({cifras.enviadas})</span>
          </div>
          <div className={styles.stat}>
            <span className={styles.statValue}>{formatoMoneda(cifras.aprobadas)}</span>
            <span className={styles.statLabel}>aprobadas</span>
          </div>
        </div>
      ) : null}

      {viejos ? (
        <div className={styles.aviso}>
          <span>
            {viejos === 1 ? "1 borrador trae" : `${viejos} borradores traen`} folio viejo, sin nomenclatura (no dice de
            quién es). Ábrelo y usa «Asignar folio» en Seguimiento.
          </span>
          <button
            type="button"
            className={styles.linkBtn}
            onClick={() => {
              setEstado("BORRADOR");
              setQ("");
            }}
          >
            Ver borradores
          </button>
        </div>
      ) : null}

      <div className={styles.toolbar}>
        <label htmlFor="buscar-cotizaciones" className={styles.soloLector}>
          Buscar cotizaciones
        </label>
        <input
          id="buscar-cotizaciones"
          ref={buscador}
          className={styles.search}
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Buscar folio, cliente, proyecto o quién intervino…   ( / )"
        />
      </div>

      <div className={styles.filtros}>
        <div className={styles.filters} role="group" aria-label="Filtrar por segmento">
          <span className={styles.filtersLabel}>Segmento</span>
          <button
            type="button"
            className={`${styles.filterBtn} ${segmento === null ? styles.filterBtnOn : ""}`}
            aria-pressed={segmento === null}
            onClick={() => setSegmento(null)}
          >
            Todos
          </button>
          {SEGMENTOS.map((s) => (
            <button
              key={s}
              type="button"
              className={`${styles.filterBtn} ${segmento === s ? styles.filterBtnOn : ""}`}
              aria-pressed={segmento === s}
              onClick={() => setSegmento(segmento === s ? null : s)}
            >
              {SEGMENTO_LABEL[s]} <span className={styles.conteo}>{conteoSegmento[s] ?? 0}</span>
            </button>
          ))}
        </div>
        <div className={styles.filters} role="group" aria-label="Filtrar por estado">
          <span className={styles.filtersLabel}>Estado</span>
          {ESTADOS.map((e) => (
            <button
              key={e}
              type="button"
              className={`${styles.filterBtn} ${estado === e ? styles.filterBtnOn : ""}`}
              aria-pressed={estado === e}
              onClick={() => setEstado(estado === e ? null : e)}
            >
              {ESTADO_LABEL[e]} <span className={styles.conteo}>{conteoEstado[e] ?? 0}</span>
            </button>
          ))}
        </div>
      </div>

      <div className={styles.metaRow}>
        <span>
          {cargando ? "Cargando…" : `${visibles.length} de ${items.length} · ${formatoMoneda(cifras.total)} en la vista`}
        </span>
        {hayFiltros ? (
          <button
            type="button"
            className={styles.linkBtn}
            onClick={() => {
              setQ("");
              setSegmento(null);
              setEstado(null);
            }}
          >
            Quitar filtros
          </button>
        ) : null}
      </div>

      {error ? (
        <p className={styles.errorBox} role="alert">
          {error}{" "}
          <button type="button" className={styles.linkBtn} onClick={() => void cargar()}>
            Reintentar
          </button>
        </p>
      ) : null}

      {cargando ? (
        <div className={styles.esqueleto} aria-busy="true" aria-label="Cargando cotizaciones">
          <span />
          <span />
          <span />
          <span />
        </div>
      ) : !items.length && !error ? (
        <div className={styles.empty}>
          <p className={styles.emptyTitle}>Todavía no hay cotizaciones</p>
          <p className={styles.emptyText}>
            Aquí se arma la propuesta técnica completa, como la recibe el cliente: objetivo, alcance, planos y la tabla
            de precios con sus términos. Se guarda sola mientras escribes y el PDF se ve al lado.
          </p>
          <Link className={styles.primaryBtn} href="/erp/cotizaciones/nueva">
            Crear la primera
          </Link>
        </div>
      ) : !visibles.length && !error ? (
        <div className={styles.empty}>
          <p className={styles.emptyTitle}>Nada con estos filtros</p>
          <p className={styles.emptyText}>Prueba con otro segmento o estado, o busca por el nombre del cliente.</p>
          <button
            type="button"
            className={styles.secondaryBtn}
            onClick={() => {
              setQ("");
              setSegmento(null);
              setEstado(null);
            }}
          >
            Quitar filtros
          </button>
        </div>
      ) : visibles.length ? (
        <nav className={styles.list} aria-label="Cotizaciones">
          <div className={styles.head} aria-hidden>
            <span>Folio</span>
            <span>Cliente · proyecto</span>
            <span>Segmento</span>
            <span>Estado</span>
            <span className={styles.derecha}>Total</span>
            <span>Intervinieron</span>
            <span className={styles.derecha}>Fecha</span>
          </div>
          {visibles.map((row) => (
            <Link key={row.id} href={`/erp/cotizaciones/${row.id}`} className={styles.row}>
              <span className={styles.cell}>
                <FolioColor folio={row.folio} />
                {row.necesitaRefolio || !partesDelFolio(row.folio) ? (
                  <span className={styles.viejo} title="Borrador de antes de la nomenclatura">
                    Sin nomenclatura
                  </span>
                ) : (
                  <span className={styles.rowSub}>{folioEnPalabras(row)}</span>
                )}
              </span>
              <span className={styles.cell}>
                <span className={styles.cliente}>{row.clienteNombre || row.clienteEmpresa || "Sin cliente"}</span>
                <span className={styles.rowSub}>{row.projectName || (row.clienteEmpresa !== row.clienteNombre ? row.clienteEmpresa : "") || "—"}</span>
              </span>
              <span className={styles.chip}>{row.segmentoEtiqueta}</span>
              <span className={claseEstado(row.estado)}>{row.estadoEtiqueta}</span>
              <span className={styles.importe}>{formatoMoneda(row.total, row.currency ?? "MXN")}</span>
              <Intervinieron row={row} />
              <span className={`${styles.cell} ${styles.derecha}`}>
                <span className={styles.fecha}>{formatoFecha(row.sentAt ?? row.issueDate)}</span>
                <span className={styles.rowSub}>{row.sentAt ? "enviada" : "emitida"}</span>
              </span>
            </Link>
          ))}
        </nav>
      ) : null}
    </div>
  );
}
